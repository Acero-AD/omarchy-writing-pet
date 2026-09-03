## 1. Phase 1 — engine skeleton and observability

- [x] 1.1 Create the engine as a single dependency-free Python 3 executable with subcommands: `run` (foreground), `status`, `config`
- [x] 1.2 Implement config loading from an engine-owned file with documented defaults, reporting malformed config clearly without overwriting it
- [x] 1.3 Implement structured logging of every decision — focus change, gate transition, probe result, words committed — to stdout in foreground mode
- [x] 1.4 Implement `status` printing today's count, goal, resolved watch paths, gate state, and the reason counting is blocked when it is
- [x] 1.5 Add a test harness runnable with no desktop and no shell

## 2. Phase 1 — focus tracking

- [x] 2.1 Query the compositor once at startup for the currently focused window, so a session that begins with the editor already focused is handled
- [x] 2.2 Subscribe to the compositor event stream and track focus changes without polling
- [x] 2.3 Port forgiving app matching (exact, or final dot-segment, never substring) and its test cases
- [x] 2.4 Implement the grace window so autosaves landing just after focus loss still count
- [x] 2.5 Implement the counting gate and assert that no subprocess is spawned while it is closed
- [x] 2.6 Isolate the compositor-specific code behind one function and document the Hyprland requirement

## 3. Phase 1 — counting

- [x] 3.1 Implement the metadata-only probe in-process against an absolute cutoff, with no external tool _(revised: measured at 5.6-6.5 ms vs 3.8-4.9 ms for `find` on 2000 notes -- 1.7 ms per cycle to eliminate the bfs/GNU incompatibility that silently broke the previous version, plus the null-delimited parsing and path-with-newline edge cases)_
- [x] 3.2 Fail loudly on an unwalkable path or unreadable file, never treating it as "nothing changed"
- [x] 3.3 Implement targeted recount of only the changed files, with a per-cycle cap
- [x] 3.4 Port word counting, including the documented CJK approximation, with its test cases
- [x] 3.5 Port per-file baselines and the high-water-mark total, with its test cases: first sight contributes zero, re-reads are idempotent, deletions never reduce the total
- [x] 3.6 Port daily rollover and capped history, with the suspend-and-resume case
- [x] 3.7 Delete the JavaScript counting implementation once ported, so only one live copy exists

## 4. Phase 1 — state file

- [x] 4.1 Define and document the state file schema, including the last-update timestamp and the gate-open flag
- [x] 4.2 Write atomically via temporary file and rename
- [x] 4.3 Persist and restore across engine restarts without re-counting historical words
- [x] 4.4 Document the file's location and the freshness window in a contract document for front-end authors
- [x] 4.5 Add `config` subcommands to add and remove watch paths and whitelist entries

## 5. Phase 1 — packaging and verification

- [x] 5.1 Add a systemd user unit with restart-on-failure, and an install command that enables it
- [x] 5.2 Extend the CI security guard to cover the engine: no input capture, no network, no privilege escalation, and the external-command allowlist
- [x] 5.3 **Verification gate: run the engine in a terminal and confirm it counts real writing in a real editor** — words appear within a few seconds of saving, a browser and a terminal never increment, and no subprocess spawns while the gate is closed
- [x] 5.4 Verify rollover, engine restart, a malformed config, and a missing watch path all behave as specified
- [x] 5.5 Verify cost stays flat on a 2000-document collection, asserting on rows returned and not on elapsed time alone

## 6. Phase 2 — widget, gated on the crash diagnosis

- [x] 6.1 Apply the diagnosed lifecycle rules as the design constraint for every item in this group: no lifetime binding on a late-settling value, no async work inside a destroyable subtree, no retry timer inside what it retries, one stable owner for shared reads. File-change signals are permitted — teardown was the fault, not the read
- [x] 6.2 Delete `Service.qml` and remove the service kind from the manifest _(pulled forward into 6b: the lifecycle lint flagged its JsonAdapter, and deleting the dead file was the honest fix rather than suppressing the warning)_
- [x] 6.3 Strip every write, subprocess, adapter and dynamically created component from the widget and panel
- [x] 6.4 Read the state file and render, treating every value as untrusted and range-checking before use
- [x] 6.5 Keep the presentation exactly as specified — both mascot sets, both resolutions, the grid invariant and its test
- [ ] 6.6 Implement the resting state and tooltip for a missing or stale state file, recovering without a shell restart
- [x] 6.7 Replace panel configuration controls with a display of current settings and the engine commands that change them
- [x] 6.8 Extend the CI guard to fail on any process execution, any adapter attached to a file view, any `var`-typed adapter property, and any `Loader.active` bound to a host or service lookup
- [x] 6.9 Parse the state file with `JSON.parse` in JavaScript, with no adapter in either direction, and contain parse failures without losing the previous value
- [x] 6.10 Ensure exactly one owner performs file reads and holds timers, so a multi-monitor bar does not create several readers or several teardowns

## 6b. Close the hazard that is live at HEAD

The revert removed the trigger, not the cause. These may be done immediately and independently of the engine work.

- [x] 6b.1 Remove the `Loader` in `BarWidget.qml` whose `active` is bound to the service lookup — this is the single change that closes the crash
- [x] 6b.2 Confirm no remaining component holds `FileView` or `Process` objects inside a subtree that any binding can destroy
- [x] 6b.3 Record the crash signature and the four lifecycle rules in the repository, so the shape is recognisable rather than rediscovered
- [ ] 6b.4 Consider reporting the missing null check to Quickshell upstream: `JsonAdapter` dereferences `qmlEngine(this)` unguarded, and `FileView` delivers `dataChanged` into a context that has already emitted destruction. Not an Omarchy issue

## 7. Phase 2 — live verification

- [ ] 7.1 Run against a throwaway shell instance first, then install on a live session and confirm the shell's process identifier is unchanged after an hour of normal use. Isolated success is explicitly not sufficient evidence
- [ ] 7.1a Watch for the crash signature specifically during startup: a tight loop roughly one second after launch, completion-callback frames reached from `sendPostedEvents`, and a `this=0x0` on `qmlEngine()`
- [ ] 7.2 Confirm the widget tracks the engine: counting, stage changes, celebration at goal
- [x] 7.3 Point the widget at a deliberately malformed state file and confirm the shell survives and the critter rests
- [x] 7.4 Stop the engine and confirm the widget rests and explains why, then restart it and confirm recovery without a shell restart
- [ ] 7.5 Verify vertical bar mode and a proportional shell font
- [ ] 7.6 Remove the DO NOT INSTALL warning from the README only once 7.1 to 7.5 have passed
