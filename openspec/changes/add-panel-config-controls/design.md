## Context

The plugin is two processes joined by one file. `bin/writing-critter` counts and
owns `~/.config/writing-critter/config.json`; the QML widget reads
`~/.local/state/writing-critter/state.json` every two seconds and renders. That
split exists because an earlier all-in-shell version segfaulted Quickshell in a
loop and took the desktop down (`docs/POSTMORTEM-ORPHANED-READ.md`).

The rules written immediately after that crash forbade the shell process from
writing anything or spawning anything. Re-reading the postmortem, the crash
needed four conditions — a `Loader.active` bound to a late-settling value, a
`preload`ed `FileView`, a `JsonAdapter` dereferencing `qmlEngine(this)`
unguarded, and a read completing into a destroyed context. None of them is a
write or a spawn. The write path was adjacent to the failure, not causal. The
rule that was load-bearing is the ownership one, and it survives untouched:
**nothing holding outstanding asynchronous work may live in a destroyable
subtree.**

Two facts found while exploring shape everything below:

- The engine's config vocabulary is already complete: `add-path`, `remove-path`,
  `add-app`, `remove-app`, `set-goal`, `set-mascot`, all validated in
  `cmd_config`. This change adds no config semantics.
- `Qt.labs.folderlistmodel` is present in the Qt 6 install the plugin already
  requires, so directory browsing needs no process and no engine round trip.

## Goals / Non-Goals

**Goals:**
- Change goal, paths, apps and mascot without opening a terminal.
- Make Obsidian's `md.obsidian.Obsidian` and a vault under `/mnt` reachable
  without the user knowing either string.
- Keep the engine the sole writer of configuration.
- Keep the shell process free of anything that can outlive its owner.

**Non-Goals:**
- Engine-side discovery of writing directories (scanning for `.obsidian` and
  similar). Worth doing, separable, and it needs a response channel this change
  deliberately avoids.
- Editing grace window, cadence, or any setting without an existing subcommand.
- Any text input anywhere in the panel.
- Replacing or deprecating the command line.

## Decisions

### Commands are sent by invoking the CLI, not over a channel

Four options were considered.

| | Mechanism | New engine code | Feedback | Cost |
|---|---|---|---|---|
| **A** | Panel writes `config.json` | none | none | Two writers; validation duplicated in QML |
| **B** | Panel writes request files, engine applies | poll a directory | async, via state | Panel writes; new protocol |
| **C** | Unix socket control channel | listener in `select()` | synchronous | Most machinery |
| **D** | Spawn `writing-critter config …` | none | exit code | Reverses the no-subprocess rule |

**Chosen: D.** The exploration initially favoured C, on the assumption that a
directory picker would need interactive round trips to the engine. With
`FolderListModel` available, browsing is local and instant, and the only thing
crossing the process boundary is a single fire-and-forget command. A socket
would then be machinery carrying six messages that a much older mechanism
already carries. B trades "no subprocess" for "the panel writes files", which is
not obviously the better half of the trade. A is rejected outright: it makes
`config.json` have two writers and forces the panel to reimplement validation
that `cmd_config` already does.

Two further arguments settle it against C, and they are stronger than the
machinery cost:

- **A socket would make the running daemon a writer of `config.json`.** Today
  every `config.save()` is inside `cmd_config` and `cmd_run` only reads. That
  invariant is what makes the mtime hot-reload sound and what makes editing the
  config with the shell stopped safe. A control socket in the daemon has it
  writing the file it is also polling, while `cmd_config` can still write from a
  terminal — two writers, one of them long-lived. It does not remove the
  serialisation problem; it enlarges it.
- **Configuration must be changeable while the engine is stopped.** "Engine
  stopped" is a state the panel renders explicitly, and a user whose engine died
  on a bad configuration needs to repair it from there. A socket only works
  while the thing being repaired is running.

The feedback advantage initially credited to C is also smaller than it looks.
`cmd_config` already prints `writing-critter: <message>` to stderr and exits 2,
and Quickshell's `Process` exposes `stderr` and an `exited` signal, so a failure
arrives structured and in the same interaction. What remains is roughly 50ms of
interpreter startup per click, which is imperceptible on a button and irrelevant
for a slider that commits once on release.

A socket becomes justified if engine-side discovery is added later — "find where
I write" is genuinely request/response and the CLI serves it badly. Nothing here
blocks that: the singleton already owns the command path, and a second channel
beside it would be additive.

The return path already exists. `cmd_config` writes the file; the running engine
hot-reloads on mtime; the next state publish reaches the panel within its 2s
poll. Nothing new is needed to observe the result.

`Process.command` is a string list, so arguments are passed to `execve` directly.
There is no shell, so no quoting or injection concern for a path containing
spaces, quotes or semicolons.

### One new singleton owns everything the panel may not

```
  ┌─────────────────── shell process ───────────────────┐
  │  Panel.qml — pure view, binds only                  │
  │      │                                              │
  │      ▼                                              │
  │  Control.qml  (pragma Singleton)                    │
  │    ├─ FolderListModel     browse dirs   ────────────┼──► read
  │    ├─ FileView config.json (read-only)  ────────────┼──► read
  │    └─ Process  writing-critter config … ────────────┼──┐
  └─────────────────────────────────────────────────────┘  │
                                                            ▼
            cmd_config: flock → load → mutate → save
                              │ mtime
                              ▼
            engine hot-reloads, re-seeds baselines
                              │
                              ▼  state.json ──► panel, ≤2s
```

`Control.qml` is a singleton for the same reason `StateSource.qml` is: the bar
builds one `BarPanel` per screen via `Variants { model: Quickshell.screens }`, so
anything in the panel exists once per monitor and is destroyed on a hotplug. A
`FolderListModel` mid-scan or a `Process` mid-flight in a per-screen subtree is
precisely the shape that crashed the shell. In a singleton it lives for the
process and has nothing to outlive.

Alternative considered: put the picker in `Panel.qml`, since `panelLoader.active`
is a literal `true` and never flips. Rejected — the panel is still per-screen,
and "this particular subtree happens never to be destroyed today" is the kind of
reasoning the postmortem exists to forbid.

### Configuration is read from `config.json`, not echoed through `state.json`

The panel needs to display paths and apps, which `state.json` does not carry. Two
options: grow `state.json` to echo the config, or add a second read-only
`FileView` on `config.json`.

**Chosen: read `config.json` directly.** `state.json` is a documented 210-byte
runtime contract; loading it with configuration blurs what it is for, and
`docs/STATE-FILE.md` would have to describe fields no renderer uses. A second
read is cheap and keeps each file meaning one thing. Reading configuration is
already implicitly permitted — the engine is still its only writer.

### The one field that must go into `state.json`

`lastFocusedApp` — the most recent focused application not on the whitelist.
The engine already sees every `activewindow` event and already keeps
`focused_app`; publishing the uncounted one is a few lines. This is the only
piece of information the panel cannot obtain for itself, and it is what makes
"add the editor you were just in" a single tap rather than a guessing game.

Deliberately a single value and not a history: a list of everything focused, with
timestamps, is an activity log, and this plugin does not keep one.

### Two writers of `config.json` are now possible, so it gets a lock

Before this change, `config.json` was written only by a human typing one command
at a time. Now two clicks a hundred milliseconds apart produce two `cmd_config`
processes, each doing load → mutate → save. Without serialisation the second
overwrites the first's change.

Both halves get fixed:
- `cmd_config` takes an exclusive `flock` on the config file for the whole
  read-modify-write. This is the correctness fix and protects the terminal too.
- `Control.qml` runs at most one `Process` at a time and queues the rest, so a
  burst of clicks becomes a sequence, and a failure can be attributed to the
  command that caused it.

The running engine is not a participant: every `config.save()` is inside
`cmd_config`, and `cmd_run` only reads. The lock is contended between
short-lived commands only.

### Continuous controls commit on release

`PanelSlider` emits both `moved` and `released`. Committing on `moved` would
spawn a process per pixel. The goal slider commits on `released` only, with the
displayed value tracking the drag locally. Range 100–3000, step 50; values
outside that remain reachable from the command line, which the panel keeps
showing.

### The lint rule is narrowed, not deleted

`scripts/qml-lifecycle-lint.py` rule 3 currently rejects any `Process`. It becomes:
a process declaration is permitted only in a file containing `pragma Singleton`,
and its `command` must begin with an allowlisted program. Rule 4 (no writes, no
adapters) is untouched. `scripts/security-guard.sh` gains the plugin's own CLI to
its external-command allowlist.

## Risks / Trade-offs

- **Reversing a post-crash prohibition** → The prohibition was prophylactic; the
  causal rule (singleton ownership of async work) is kept and is what makes this
  safe. Verification is live, on the user's compositor, via the standalone
  `quickshell -p` harness so a fault cannot take the desktop down again.
- **`FolderListModel` populates on a worker thread** → Owned by a singleton, so
  no destroyable subtree exists for a scan to outlive. It is also read-only and
  touches no file contents.
- **A spawn storm from rapid clicks** → Single-slot queue in the singleton, plus
  release-only commit for continuous controls.
- **Lost update on concurrent config writes** → `flock` in `cmd_config`. Fixed at
  the engine, so it holds regardless of who is calling.
- **`writing-critter` resolved via `PATH`** → `~/.local/bin` is on the shell's
  `PATH` (verified in `/proc/<pid>/environ`), but relying on it is fragile.
  Resolve the program to an absolute path once, and if it is not found, fall back
  to the current display-only settings view rather than failing silently.
- **Adding a large vault stalls counting briefly** → `add-path` triggers
  `seed_baselines()` on the engine's next reload; on a 267-note vault this is
  already known to be fast, and seeding is what prevents the whole vault being
  credited as words written. No change, but the panel should not appear frozen
  while it happens.
- **Removing the last watch path leaves the engine counting nothing** → The
  engine's existing resting-reason machinery already reports this, and the panel
  already renders it. No special case; it is a legitimate configuration.
- **A panel that can un-configure the plugin** → Removal is per-item and requires
  a deliberate click on that item's control. No bulk clear, no reset.

## Migration Plan

No data migration. `lastFocusedApp` is additive to `state.json` and absent-safe:
readers already treat missing fields as defaults, and older readers ignore it.

Rollout is the plugin's normal path — `omarchy plugin update`, then
`omarchy-restart-shell`, which is **required**, not optional: QML singletons are
cached per engine and a new `Control.qml` will not be picked up by an update
alone. This trap is already documented in the README's *Updating* section and
cost real debugging time in Phase 2.

Rollback is `omarchy plugin update` to the previous revision plus a shell
restart; the engine changes (`flock`, `lastFocusedApp`) are backward compatible
and can stay.

## Open Questions

- Should the picker offer shortcuts (home, existing watch paths' parents, mount
  points) above the browse list? Cheap, and it removes most navigation — but it
  edges toward the discovery feature this change scopes out.
- Should a failed command be surfaced inline next to the control, or in the
  ENGINE status line the panel already has? The latter is less code and one
  place to look; the former is clearer about which action failed.
