## Context

Omarchy installs a third-party plugin by cloning and validating its repository;
it intentionally does not execute `install.sh`. Writing Critter therefore loads
its bar and panel immediately, but its separately supervised Python engine does
not exist under `~/.local/bin` and its systemd user service is not enabled until
the user performs an undocumented second installation step.

That mismatch is especially confusing here because the shell side degrades
correctly: a missing state file produces a sleeping critter instead of an
obvious load error. The current tooltip suggests `systemctl --user start`,
which cannot help when the unit itself is absent. `StateSource.qml` can tell
whether state is missing or stale, but it cannot distinguish a never-installed
service from an inactive, outdated, starting, or unhealthy one.

The safety boundary established after the 2026-09-02 shell crash remains
load-bearing. Counting stays in a Python process outside Quickshell. QML owns no
writes, no service commands, and no process in a per-monitor subtree. The one
existing process owner, `Control.qml`, is a stable singleton and invokes the
engine shipped beside it through an argument array rather than a shell.

## Goals / Non-Goals

**Goals:**

- Let a user install and start the engine from the panel after reviewing the
  exact effects, with no terminal, network, or privilege escalation.
- Distinguish setup, update, stopped, unhealthy, and ready states accurately.
- Preserve the separate-process crash boundary and all current QML lifecycle
  rules.
- Make installation, updates, repair, and removal idempotent, bounded, and
  symmetric.
- Keep terminal wrappers and the panel on one tested implementation.
- Make engine drift after `omarchy plugin update` visible and repairable.

**Non-Goals:**

- Running the counting loop inside Quickshell or supervising it as a child for
  the lifetime of the shell.
- Silent installation or silent replacement of a running engine.
- System-wide installation, sudo, polkit, packages, downloads, or remote code.
- Deleting configuration, count state, tracking data, or history during engine
  removal.
- General-purpose process execution or user-supplied setup paths.
- Treating marketplace validation as a security audit or attempting to avoid
  the legitimate installer/service-management review capabilities.

## Decisions

### 1. The bundled engine owns a `service` command namespace

`bin/writing-critter` will add these fixed operations:

```text
writing-critter service status --json
writing-critter service install --json
writing-critter service start --json
writing-critter service restart --json
writing-critter service uninstall --json
```

The executable resolves its own checkout root and the shipped unit; callers do
not pass a source, destination, unit name, or arbitrary systemctl arguments.
This keeps QML's executable allowlist unchanged: the shell still launches only
the bundled `writing-critter` path.

Directly running `install.sh` from QML was rejected. Although the script has a
fixed path, it would add a second shell-executable surface and duplicate status,
error, and rollback behavior. Starting the foreground engine as a long-lived
QML child was also rejected: it would couple counting availability to shell
lifecycle and reverse the architectural separation introduced after the crash.

`install.sh` becomes a compatibility wrapper that `exec`s the bundled engine's
service-install operation. A matching `uninstall.sh` delegates to service
uninstall. The wrappers contain no independent copy or systemctl logic.

### 2. Status has a versioned JSON contract

The bundled engine returns a bounded object suitable for untrusted parsing:

```json
{
  "schema": 1,
  "state": "not-installed",
  "installed": false,
  "current": false,
  "enabled": false,
  "activeState": "inactive",
  "stateFresh": false,
  "sourceVersion": "0.1.0",
  "installedVersion": "",
  "enginePath": "/home/user/.local/bin/writing-critter",
  "unitPath": "/home/user/.config/systemd/user/writing-critter.service",
  "message": ""
}
```

The stable `state` vocabulary is `not-installed`, `update-available`,
`stopped`, `starting`, `unhealthy`, and `ready`. Status derives installation
from both fixed targets, compares their bytes with the current checkout, asks
systemd for its load/enabled/active state with fixed arguments and a timeout,
and evaluates the state file's freshness. It does not execute the installed
binary to discover its version. Missing fields, unknown schemas, oversized
output, or unknown states fail closed to `unknown` in QML.

Checking only `state.json` was rejected because a stale file survives a stopped
or removed service. Checking only systemd was rejected because an active
process can be unhealthy and an installed binary can lag behind the plugin.

### 3. Opening the panel is the status-probe boundary

`BarWidget` continues to spawn nothing during shell startup. `Panel.open()`
requests a status refresh from `Control` before showing the surface. Because
`Control` is a singleton, panels on multiple monitors share one probe and
coalesce concurrent refresh requests. A short refresh after a lifecycle action
is allowed; no permanent service-status polling loop is added.

`StateSource` remains the single reader of live count state. Service status does
not replace or duplicate that reader; it answers installation and supervision
questions that the state file cannot.

### 4. Service and configuration calls share one serialized owner

`Control` will map public action names to literal argument prefixes rather than
accept raw argv. Configuration actions retain their existing queue. Service
status and lifecycle actions use the same stable owner and cannot overlap a
configuration mutation. Captured stdout and stderr are size-bounded, and every
invocation retains the existing watchdog discipline.

The service action state exposed to QML includes the parsed status, whether a
review/confirmation is open, the in-flight action, and a sanitized failure.
The old `available` boolean is narrowed to whether the bundled executable can
be launched; it is not used as a proxy for installed-service state.

### 5. The panel uses an explicit service-state machine

The panel presents one applicable path at a time:

```text
not-installed ── Review install ── Confirm ── installing ── ready
update-available ───────────── Confirm update/restart ─────┘
stopped ─────────────────────────────── Start ─────────────┘
starting ───────────────────── Wait / refresh status
unhealthy ─────────────────────────── Restart ─────────────┘
ready ───────────────────────── Normal compact status
```

Installation uses two steps. The first opens an inline review naming the
resolved engine and unit paths and explaining enable/start, offline operation,
and lack of administrator access. Only the second button performs the action.
Update and uninstall likewise require confirmation. Starting or restarting an
already installed service is a direct repair action because it does not replace
files or remove anything.

Normal configuration controls may remain visible while setup is required: they
already invoke the bundled engine and can safely prepare configuration before
the service starts. The setup card is placed before those controls and failures
do not make the rest of the panel disappear.

The resting tooltip changes from an unusable `systemctl start` instruction to
"open Writing Critter to set up or repair the engine." Once fresh state arrives,
the existing one-second reader transitions the bar and panel without a shell
restart.

### 6. Installation is atomic, idempotent, and rollback-aware

The destinations remain explicit user-owned files:

- engine: `$HOME/.local/bin/writing-critter`
- unit: `${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/writing-critter.service`

Using `$HOME/.local/bin` deliberately matches the unit's `%h/.local/bin`
`ExecStart`; the existing optional `XDG_BIN_HOME` branch is removed because a
custom value currently installs a binary that the fixed unit does not run.

Each file is copied to a private temporary sibling, flushed, assigned its fixed
mode, and renamed into place. Before replacement, the operation retains the old
bytes and mode in memory or private siblings. It then invokes only fixed
`systemctl --user` operations with timeouts: daemon-reload, enable, and restart.
If post-copy service setup fails, it restores the prior files (or removes newly
created targets), reloads systemd, and attempts to restore the former active
state. The error result says whether rollback itself failed.

Repeated installation of identical files still verifies enablement and starts
the service, but performs no unnecessary replacement. No lifecycle operation
touches the config or state roots.

### 7. Updates are prompted, never automatic

Status compares both installed targets to the current checkout. Any difference
produces `update-available`, even when version strings match, so a changed unit
or development build cannot hide behind an unchanged version. The panel shows
the bundled and installed versions for context and waits for confirmation.

After confirmation, update uses the same transactional install path and
restarts the service. This repairs the current drift where an Omarchy Git update
changes the plugin checkout but leaves the copied engine process on old code.

### 8. Uninstall removes executables, not user data

Uninstall stops and disables `writing-critter.service`, removes only the fixed
unit and installed engine, runs daemon-reload and reset-failed, and returns
structured status. It intentionally retains `~/.config/writing-critter` and
`~/.local/state/writing-critter`; the confirmation says so. This lets a later
reinstall resume and avoids making a UI cleanup action a data-loss action.

The README orders removal as: uninstall the engine from the panel (or wrapper),
then run `omarchy plugin remove`. Removing the plugin checkout first cannot be
made symmetric because Omarchy intentionally runs no uninstall hook, so the
documentation must make that boundary explicit.

### 9. Tests enforce both the safety and state contracts

Python unit tests redirect every destination into temporary directories and
replace systemctl with a fake runner. They cover every status, install/update,
rollback, start/restart, and uninstall transition and assert that config/state
trees are unchanged. QML harness tests cover action mapping, confirmation,
coalesced status, unknown JSON, failure display, and recovery. The lifecycle
linter continues to require every `Process` under a singleton; the security
guard documents the engine as the only QML executable and separately recognizes
the engine's fixed systemctl capability.

Live verification exercises fresh install, stopped service, update drift,
failed setup, successful recovery without a shell restart, and uninstall/reinstall.

## Risks / Trade-offs

- **Marketplace reports installer and service-management capabilities** → Keep
  the operations fixed, offline, unprivileged, documented, and easy for a
  maintainer to review; do not disguise the legitimate capabilities.
- **A failed restart could leave the service unusable** → Stage files
  atomically, retain prior contents, restore them on failure, and report any
  rollback failure separately.
- **A service can be active before its first state publish** → Represent
  `starting` separately and refresh after a bounded delay rather than claiming
  success from systemd alone.
- **Multiple screens can open panels concurrently** → Coalesce status refreshes
  and serialize all engine calls in the singleton.
- **A user can remove the plugin before removing its service** → Provide an
  in-panel uninstall action, a wrapper, and explicit ordering in the README;
  retained service files remain visible and manually removable if the order is
  ignored.
- **Status output crosses a process boundary into QML** → Version, bound, and
  validate the JSON exactly as state/config files are already validated.
- **Changing the old `XDG_BIN_HOME` behavior can surprise a custom setup** →
  Detect legacy/custom targets when practical, explain the canonical target,
  and test migration from the only default installation the unit currently
  executes.

## Migration Plan

1. Add and test the engine service CLI without changing the current wrappers or
   panel.
2. Switch `install.sh` to the shared implementation and add `uninstall.sh`.
3. Add singleton status/action state and the panel setup card behind the current
   resting behavior.
4. Update tooltips, documentation, security assertions, and verification claims.
5. Install the development checkout, exercise every live transition, then leave
   the user's prior engine/config/state restored.

Rollback of the release means restoring the previous plugin commit. An engine
already updated by the new UI remains a compatible standalone executable; the
previous `install.sh` can replace it if necessary. No migration rewrites user
configuration or state.

## Open Questions

No product decision blocks implementation. The live spike should confirm the
exact `systemctl --user show` properties and transitions available on the
supported Omarchy system before those strings become parser fixtures.
