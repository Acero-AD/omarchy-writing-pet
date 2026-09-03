# Writing Critter

A small ASCII critter that lives in your [Omarchy](https://omarchy.org) topbar
and grows as you write toward a daily word goal.

```
  |  (o o)  |   0-24%     just an egg
  | ,(o o), |   25-49%    cracking
  | <(o o)> |   50-74%    stubby wings
  | \(o o)/ |   75-99%    wings out
  |~\(o o)/~|   100%+     soaring
```

Focus your editor and it wakes up. Focus anything else and it sleeps — eyes
closed, timer stopped, costing nothing. Click it for the full-size critter, your
progress, and a streak of the last seven days.

```
   \(o o)/  412/1000          ,-""-.
                             /       \
   right-click for           |  o   o  |
   quick actions              \  ___  /
                               '-----'
                              412 / 1000
                          ▓▓▓▓▓▓▓▓░░░░░░░░
                        "The shell is thinning."
```

> ## ⚠️ Pre-release — counting works, live soak still owed
>
> On 2026-09-02 this plugin **segfaulted `quickshell` in a crash loop**, taking
> the entire desktop shell down with it. That crash is diagnosed and its cause
> removed — see
> [docs/POSTMORTEM-ORPHANED-READ.md](docs/POSTMORTEM-ORPHANED-READ.md). All
> counting now happens in a separate process (`bin/writing-critter`); the widget
> only reads a small state file, with blocking reads from a singleton, so no
> async read can outlive a teardown.
>
> What is verified: the engine counts real writing in a real editor; the widget
> renders it; and the shell survives a truncated, malformed, hostile,
> unknown-schema or entirely absent state file, recovering without a restart.
>
> What is not: a long live soak, and the vertical-bar and proportional-font
> paths. Until those are done, treat this as pre-release rather than something
> to depend on.
>
> To remove it:
>
> ```bash
> omarchy plugin remove io.github.acero-ad.writing-critter --yes
> rm -rf ~/.config/omarchy/plugins/io.github.acero-ad.writing-critter
> omarchy-restart-shell
> ```
>
> The crash is not yet diagnosed. Everything below describes the intended
> behaviour and remains accurate as a design document.

> **Status:** implemented, not yet verified against a live Omarchy session.
> Passes `omarchy plugin validate`, `qmllint`, 38 unit tests and the security
> guard. Runtime behaviour in a real bar has not been exercised yet — see
> [Verification status](#verification-status).

## It does not read your keyboard

The obvious way to count words you type is to read the keyboard. On Wayland that
means raw access to `/dev/input`, which needs `sudo usermod -aG input $USER` — a
grant that is **not scoped to this plugin**. It hands *every* process you run
permanent keylogging ability over every application, passwords included. That is
an absurd price for a mascot, so this plugin does not pay it and never will.

Instead it watches the document files you point it at and diffs their word
counts. Writing apps autosave a couple of seconds after you stop typing, so this
is live in practice with no privilege at all.

### What it reads

- The document files under the paths **you** configure, to count their words.
- Its own state directory (below).
- The identifier of the currently focused window, to know when to wake up.

### What it never does

- **No keyboard or input-device access.** No `/dev/input`, no evdev, no
  libinput, no `input` group, ever.
- **No network access.** Nothing leaves your machine. There is no update check.
- **No privilege escalation.** No sudo, no polkit, no systemd units, no extra
  daemons, no second shell process.
- **No storage of anything you write.** File text is counted in memory and
  discarded. State holds only integers, dates, and the paths you chose. Nothing
  you write is ever logged.

External commands are limited to `find`, `wc`, one `mkdir -p` at startup for the
plugin's own state directory, and `notify-send` only if you opt into goal
notifications.

`scripts/security-guard.sh` enforces all of the above in CI, including the
command allowlist. A regression breaks the build.

### Where state lives

```
~/.local/state/omarchy/io.github.acero-ad.writing-critter/
├── state.json     daily total, per-file baselines, history, settings
└── sources/       companion drop-box (see docs/COMPANION_PROTOCOL.md)
```

Delete that directory to reset everything. The plugin never writes your
`shell.json`.

## Install

```bash
omarchy plugin add https://github.com/Acero-AD/omarchy-writing-pet.git --enable
```

Then tell it where you write. Open the panel, click **Settings**, and add a
watched path.

## Configure

Everything is editable in the panel. If you prefer declarative config, any key
in the widget's `~/.config/omarchy/shell.json` entry **overrides** the stored
setting, and the panel shows those fields as locked:

```json
{
  "id": "io.github.acero-ad.writing-critter",
  "goal": 750,
  "mascot": "snail",
  "showNumbers": false
}
```

| Setting | Default | What it does |
|---|---|---|
| `goal` | `500` | Words per day |
| `watch` | `[]` | `{ path, recursive, extensions }` entries to count |
| `whitelist` | `omawrite, obsidian, Typora, soffice, libreoffice-writer` | Apps that wake the critter |
| `mascot` | `bird` | `bird` or `snail` |
| `netMode` | `additive` | `net` makes deletions subtract |
| `pollMs` | `2000` | Poll interval (clamped 1000–30000) |
| `graceMs` | `15000` | Keep counting this long after focus leaves |
| `showNumbers` | `true` | Show `412/1000` beside the critter |
| `idleNudge` | `true` | The `z` when asleep |
| `notifyOnGoal` | `false` | Desktop notification at goal |

Not sure what your editor is called? Open **Settings** — the focused window's
identifier is displayed live, with a button to add it.

## How it works

Every 2 seconds, **and only while a configured writing app is focused**, a
metadata-only scan looks for recently modified files, then re-counts *only
those*. Idle ticks read nothing at all.

```
             300 notes    2000 notes
full recount     8 ms         38 ms     <- what we don't do
metadata probe   3 ms          3 ms     <- what we do (idle tick)
probe + 1 file   4 ms          5 ms     <- after you save
```

Cost is flat regardless of how big your collection gets, because it is
proportional to what you *wrote*, not what you *own*.

Two rules keep the count honest:

- **Adding a folder never inflates today.** A newly seen file records a baseline
  and contributes zero.
- **Deleting never takes back progress.** Cut a paragraph and the number holds.
  A counter that falls when you edit teaches you not to edit.

## Scope and known limits

- **GUI writing apps only.** Built for editors that autosave — Omawrite,
  Obsidian, Typora, LibreOffice Writer.
- **Terminal and modal editors are not supported.** nvim, helix and emacs save
  only on command, and normal-mode navigation is not writing. Use a companion
  source if you want them covered.
- **Binary formats (.odt, .docx) are not counted.** Write markdown or plain
  text, or install a LibreOffice companion.
- **CJK counting is approximate.** Each CJK character counts as one word, which
  overshoots, because those scripts do not delimit words with spaces.
- **The whitelist is load-bearing.** If your editor is not in it, the critter
  never wakes. That is the most likely thing to go wrong.

## Companion sources

Editors can report exact real-time counts by dropping a small JSON file into the
state directory. The protocol is documented in
[docs/COMPANION_PROTOCOL.md](docs/COMPANION_PROTOCOL.md) — implement it in any
language without touching this plugin.

## Development

```bash
node --test tests/*.test.mjs    # 38 unit tests, no dependencies
./scripts/security-guard.sh     # privacy constraints + command allowlist
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" *.qml
```

`Model.js` holds every pure function — counting, baselines, rollover, stage and
mood, art assembly, source validation — so the logic most likely to be wrong is
covered by fast tests instead of needing a running shell. The mascot grid
invariant is asserted across every set, stage and mood; misaligned ASCII is the
most visible way this plugin can look broken.

## Verification status

| | |
|---|---|
| Unit tests, security guard, lifecycle lint, manifest | ✅ 71 Python, 25 JS, all passing |
| Counting real writing | ✅ verified in Typora and an Obsidian vault |
| Rollover, restart, restored baselines | ✅ covered by tests and a live restart |
| Live bar rendering | ✅ the critter renders from the state file |
| Malformed / absent state file | ✅ shell survives truncated, non-object, hostile, unknown-schema and deleted; recovers with no restart |
| Service mounting | n/a — the engine is a systemd user service, not a shell service |
| Shell stability under long use | ⚠️ shell PID unchanged so far; a proper soak is still owed |
| Vertical bar, proportional shell font | ⬜ not yet exercised |
| Screenshot / marketplace submission | ⬜ pending |

Design rationale and the full technical spec live in
[`writing-critter-spec.md`](writing-critter-spec.md) and
[`openspec/changes/add-writing-critter-plugin/`](openspec/changes/add-writing-critter-plugin/).

## License

MIT — see [LICENSE](LICENSE).
