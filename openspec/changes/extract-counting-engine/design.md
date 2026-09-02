## Context

The plugin as built puts everything inside `quickshell`: focus tracking, a poll loop spawning `find` and `wc`, a `JsonAdapter`-backed state file it both reads and writes, a dynamically loaded service, and the rendering. On a live session that combination segfaulted the shell in a crash loop.

Two constraints discovered by running it shape this design:

- **The shell does not mount third-party plugin services.** It reports the plugin enabled with a `service` kind and resolves the entry point, then never instantiates it and never logs a failure. The bar widget currently has to host its own service instance as a workaround.
- **Nothing inside that process was observable.** Six distinct bugs were found only by installing the plugin and reading system logs; 50 unit tests and four linters caught none of them. They were all in wiring, and wiring inside `quickshell` cannot be run in a terminal.

The crash itself is being diagnosed separately. This design does not depend on that result, because it removes most of the implicated surface regardless — but it also must not *assume* the remaining surface is safe (see Risks).

Prior art that still stands: the pure logic in `Model.js` (word counting, high-water-mark totals, rollover, stage and mood, the mascot art system) with 50 passing tests, the companion drop-box protocol, and the security constraints.

## Goals / Non-Goals

**Goals:**
- A bug in this project must never be able to take down the user's desktop shell.
- The counting engine must be runnable, watchable and debuggable in a terminal, with no desktop involved.
- Preserve the critter presentation exactly — both mascot sets, the two resolutions, the grid invariant.
- Keep installation dependency-light and privilege-free: still no input capture, no network, no sudo.
- Reach a state where words are demonstrably counted before any QML is written again.

**Non-Goals:**
- Rewriting the presentation. The art system is correct and tested; it moves, it does not change.
- Solving the shell's third-party service mounting. We route around it.
- Supporting terminal or modal editors, or binary document formats. Unchanged from the original scope.
- Shipping the widget in Phase 1. Phase 1 deliberately has no shell component at all.

## Decisions

### D1. Move all I/O out of the shell process

**Chosen:** an external engine owns focus tracking, counting, subprocess execution and state writing. QML reads a file and draws.

**Alternatives considered:** change the plugin kind (panel, overlay, menu); or keep the service in-process and fix the crash directly.

Changing kind fixes nothing: the crashing code is reachable from any kind, in the same process, through the same APIs. Fixing in place was the approach that produced six failed iterations, because the fundamental problem was not any single bug but that the process could not be observed while being debugged. Moving the work out changes the failure mode from "desktop dies" to "a script dies", and makes every future bug reproducible in a terminal.

### D2. Python 3 for the engine

**Chosen:** Python 3, standard library only.

**Alternatives considered:** Bash; Node (which would let `Model.js` be reused verbatim); a compiled binary.

Bash makes the state-file writing, JSON handling and per-file bookkeeping awkward and error-prone. Node would allow literal reuse of the tested `Model.js`, which is genuinely attractive, but adds a runtime that Omarchy does not guarantee. A compiled binary means a build step and per-architecture releases for a plugin whose whole appeal is that it installs in one command. Python 3 is present on Arch by default, has the needed JSON and subprocess handling in the standard library, and is trivially inspectable by a user deciding whether to trust it — which matters for something that reads your documents.

The cost is that the counting rules exist in two languages. See Risks.

### D3. Focus from the compositor's event stream

**Chosen:** subscribe to Hyprland's event socket, with a `hyprctl` query for the initial state.

**Alternatives considered:** poll `hyprctl activewindow`; `ToplevelManager` (unavailable outside the shell).

Outside `quickshell` the Wayland toplevel API is not available, so this reverses an earlier decision — and the reversal is an improvement. An event stream costs nothing while idle, whereas the original design needed a polling fallback. Querying once at startup fixes the ordering bug found in the QML version, where the plugin never started because it was loaded with the editor already focused and no transition ever arrived.

This does tie the engine to Hyprland, which the original design had deliberately avoided. Omarchy is Hyprland, so the practical cost is nil, and the focus source is isolated behind one function for anyone porting it.

### D4. A user service, started on demand

**Chosen:** a systemd user unit, enabled by the install step, running the engine as a long-lived process.

**Alternatives considered:** a systemd timer invoking a one-shot; `exec-once` from the Hyprland config.

The engine needs to hold focus-event state and per-file baselines between cycles, so a long-lived process is the natural fit; a timer would reload and re-derive state every tick. `exec-once` ties the engine's lifecycle to a config file the plugin should not be editing. A user unit also gives restart-on-failure and `journalctl` for free, which is exactly the observability that was missing.

### D5. A file is the entire interface

**Chosen:** the engine writes a state file; readers only read it.

**Alternatives considered:** D-Bus; a socket; invoking the engine from the widget.

A file needs no daemon handshake, no IPC surface to secure, no protocol version negotiation, and it is inspectable with `cat` while debugging. It also means the widget needs no write access anywhere, which removes the entire `JsonAdapter`/`writeAdapter` mechanism that was live at the moment of the crash. Any front-end — a CLI, a different bar, a companion — can render from the same file.

### D6. Split the pure logic along the process boundary

**Chosen:** counting rules (baselines, high-water marks, rollover) move to the engine; presentation rules (stage, mood, art assembly) stay in `Model.js` in QML.

Each rule lives on the side that needs it, so almost nothing is duplicated: the engine publishes a total, the widget derives a stage from it. The mascot art system and its grid invariant stay exactly where they are, still covered by the existing tests.

### D7. Phase 1 ships with no shell component

**Chosen:** Phase 1 delivers the engine and a `status` subcommand, verified by watching it count real writing in a terminal. Phase 2 adds the widget only after that.

This is the decision the previous attempt most needed. Every prior "fix" was shipped to a live desktop against a symptom that had been inferred rather than observed. Phase 1 is verifiable without risking anything, and it is where all the functional value sits — a correct word counter with a wrong front-end is a solvable problem; the reverse is what we had.

## Risks / Trade-offs

- **The crash cause is still unknown, and the widget will still use `FileView`.** The crashing frame was a JS-value conversion reached through nested signal emissions during event delivery, which is the shape of a QML signal carrying data. A read-only `FileView` with `watchChanges` is a much smaller surface than adapter-backed read/write, but it is not provably unaffected. → Phase 2 must not begin until the diagnosis lands. If `FileView` signalling is implicated, the widget reads on a timer instead of on a change signal, or via a mechanism the diagnosis clears.
- **Counting rules will exist in Python and their tests in JavaScript.** The 50 existing tests cover the JS implementations of rules that now move to Python. → Port the counting tests alongside the code and keep the original fixtures, so both implementations are checked against the same cases; delete the JS counting code once ported rather than leaving two live copies.
- **Installation gains a step.** A plugin that was one `omarchy plugin add` now also needs a user service enabled. → Provide a single install command that does both, and make the widget state plainly that the engine is not running when it is not, so the failure is self-explaining rather than silent.
- **The engine reads the user's documents.** It always did, but now it does so from a separate process that a user may inspect independently. → Keep it dependency-free, single-file where practical, and readable; keep the security guard covering it.
- **Hyprland coupling.** Focus detection is no longer compositor-agnostic. → Isolated behind one function; documented as a requirement.
- **A stopped engine looks like a broken plugin.** → An explicit resting state plus a tooltip naming the cause, and a freshness timestamp in the state file so staleness is detectable rather than guessed.

## Migration Plan

The plugin is currently uninstalled and the repository carries a DO NOT INSTALL warning. That warning stays until Phase 2 is verified on a live session.

**Phase 1** — build the engine, run it in a terminal against real writing, confirm counts, gating, rollover and restart behaviour. No shell involvement, nothing installed into the bar.

**Phase 2** — delete `Service.qml`, strip writes and subprocesses from the widget and panel, point them at the state file, and verify on a live session that the shell survives a full day including a deliberately broken engine.

**Rollback:** stop and disable the user unit; the engine's state and config directories are the only footprint outside the plugin folder. Because the widget writes nothing, removing the plugin cannot leave inconsistent state behind.

## Open Questions

- The `quickshell` segfault cause, being diagnosed separately. Its outcome decides whether the Phase 2 widget may use `FileView` change signals or must poll.
- Whether the engine should adopt the companion drop-box protocol as-is, now that it is the component doing the reading, or whether companions should write into the engine's own state directory instead.
- How the user unit is packaged so that `omarchy plugin add` alone is enough, given that plugin installation does not run arbitrary install scripts.
