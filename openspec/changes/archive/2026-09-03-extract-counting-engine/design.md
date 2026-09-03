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

### D8. Lifecycle rules the widget must satisfy

The post-mortem produced four structural rules, and they are encoded as requirements in `critter-widget` rather than left as advice, because each of the four contributing conditions was individually defensible in the commit that introduced it — which is exactly why the combination survived review.

1. **No lifetime binding on a late-settling value.** `active: hostService === null` re-evaluated when `bar.shell` resolved mid-startup, destroying the tree it had just built.
2. **Outstanding async work forbids destruction.** A pending read, a running process, or a re-arming timer is a live claim on its owner.
3. **Retry timers live outside what they retry.** A timer inside a component, re-arming work on that component, keeps it permanently busy and permanently unsafe to tear down.
4. **Shared state has one stable owner.** One bar per monitor otherwise means several readers, and several teardowns.

A fifth is a process rule rather than a code rule: passing in a throwaway shell instance is not evidence of safety in the live session. `Service.qml` loaded and ran correctly in isolation on the same afternoon it was crash-looping the desktop.

## Risks / Trade-offs

- **The crash is diagnosed, and `FileView` is not the culprit — teardown is.** An async read started by `preload: true` completed after the `Loader` in `BarWidget.qml` flipped `active` to false and destroyed the service tree. The QML context had been invalidated (engine pointer nulled, destruction already emitted) while the C++ objects awaited deferred deletion, so the completion callback ran against a dead context: `JsonAdapter::deserializeRec` hit the first `var`-typed property, called `qmlEngine(this)->fromVariant(...)` on a null engine, and segfaulted. Confirmed in the core: `QJSEngine::create (this=0x0)`, with `QQmlContextData m_engine = 0x0` and `m_hasEmittedDestruction = 1`.
  → So the constraint for Phase 2 is not "avoid `FileView`" but "never destroy something with async work outstanding". Four conditions had to coincide, none wrong alone: an async read outliving its owner, a `Loader.active` bound to a late-settling value, a `var` property in the adapter, and a retry timer keeping a read permanently in flight. The widget requirements now forbid all four.
- **The hazard is still present at HEAD.** Reverting `preload: true` removed the trigger, not the cause. `BarWidget.qml` still contains the `Loader` whose `active` is bound to a service lookup that resolves late, and `Service.qml` still holds four `FileView` objects and several `Process` objects inside that destroyable subtree. Any future change that puts async work in flight during startup reinstates the crash. → Phase 2 deletes both files; until then the DO NOT INSTALL warning is what contains it, and removing the `Loader` is the single change that would close it sooner.
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

- Whether to file the missing null check upstream with Quickshell. `JsonAdapter` dereferences `qmlEngine(this)` unguarded and `FileView` delivers `dataChanged` into a context that has already emitted destruction; both are arguably library bugs. Omarchy is not implicated. The trigger is avoidable in plugin code either way, so this is a courtesy report rather than a dependency.
- Whether the engine should adopt the companion drop-box protocol as-is, now that it is the component doing the reading, or whether companions should write into the engine's own state directory instead.
- How the user unit is packaged so that `omarchy plugin add` alone is enough, given that plugin installation does not run arbitrary install scripts.
