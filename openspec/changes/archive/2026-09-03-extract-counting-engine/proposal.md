## Why

Writing Critter has never counted a single word. Installed on a live Omarchy session it renders in the bar, opens its panel, and saves settings — then, the moment its state file actually loaded and the rest of its code became reachable, it segfaulted `quickshell` in a crash loop and took the whole desktop shell down. Recovery meant removing it from `shell.json` and from disk and restarting the shell.

Two findings from that session make this a design problem rather than a bug to patch:

- **The shell does not mount third-party plugin services.** It reports the plugin as enabled with a `service` kind and resolves its entry point, but never instantiates it and never logs a failure. The entire architecture assumed the opposite. The bar widget currently has to host the service itself.
- **Every bug this session lived in wiring that could not be observed.** Six were found only by installing the plugin — a `find` implementation that rejects relative timestamps, swallowed keystrokes, a whitelist that never matched real Wayland appIds, a missing control, a startup ordering fault, and a lazy file read that left the service permanently pre-state. Fifty unit tests and four linters found none of them, because they all sat between components inside a process that cannot be run in a terminal.

Moving the plugin to a different QML kind — panel, overlay, menu — would not help. The crash is in code reachable from any of them, in the same process, through the same APIs.

The fix is to stop doing I/O inside `quickshell`. A bug in a script is a dead script; a bug in the shell is a dead desktop.

## What Changes

- **Add an out-of-process counting engine.** A standalone executable watches window focus, counts words in configured paths, and writes a state file. It runs and is debugged in a terminal, entirely independent of the desktop shell.
- **Reduce the QML widget to a read-only display.** It reads the state file and draws the critter. **BREAKING** for the current plugin internals: `JsonAdapter`, `writeAdapter()`, every `Process`, the `Loader`-hosted service, and all subprocess parsing are removed from QML. What remains is a file read and text rendering.
- **Make the state file the contract** between engine and display, documented so any front-end — the widget, a CLI, a status bar, a companion — can read it.
- **Configure and control through the engine**, not the panel: the engine owns the config file and exposes subcommands, so a misconfiguration can no longer be diagnosed only from inside a crashed shell.
- **Ship in two phases.** Phase 1 delivers a working, terminal-verifiable engine with **no shell involvement at all**. Phase 2 adds the widget only once Phase 1 demonstrably counts words correctly.
- **Retain the validated pure logic.** Word counting rules, per-file high-water-mark totals, daily rollover, stage and mood selection, the mascot art system and its grid invariant are all covered by 50 passing tests and are behaviour-preserving; they move rather than change.

Supersedes the service-in-shell architecture of the `add-writing-critter-plugin` change. That change stays in place for its still-valid work (manifest, art system, protocol, security constraints); this one replaces how counting is hosted.

## Capabilities

### New Capabilities

- `counting-engine`: The out-of-process engine — focus tracking via the compositor's event stream, the probe-then-recount counting loop, per-file baselines and daily rollover, config ownership, and the CLI surface used to run and inspect it in a terminal.
- `engine-state-file`: The on-disk contract between engine and any reader — schema, atomic write and torn-read behaviour, freshness, and the guarantee that a reader never needs to write.
- `critter-widget`: The read-only bar display — what it may and may not do, how it degrades when the engine is absent or stale, and the crash-containment constraints that keep a plugin fault from reaching the desktop shell.

### Modified Capabilities

_(none — `openspec/specs/` holds no archived baseline yet; the prior change's specs are still change-local.)_

## Impact

- **New deliverable:** an engine executable plus a user-level service unit and timer, installed alongside the plugin rather than inside it.
- **QML surface shrinks sharply:** `Service.qml` is deleted; `BarWidget.qml` and `Panel.qml` lose all writes, subprocesses and dynamic component creation.
- **Runtime dependency added:** Python 3 for the engine (present by default on Arch, which Omarchy targets). `find` and `wc` remain the only external commands; `hyprctl` or the Hyprland event socket is added for focus, which is now cheap because it lives outside the shell.
- **Config moves** from the plugin's state file to an engine-owned config file, editable without a running shell.
- **Risk profile changes fundamentally:** the failure mode becomes "the critter stops updating," not "the desktop shell dies."
- **README must retain its DO NOT INSTALL warning** until Phase 2 is verified on a live session.
