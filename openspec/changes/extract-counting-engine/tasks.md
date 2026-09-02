## 1. Phase 1 — engine skeleton and observability

- [ ] 1.1 Create the engine as a single dependency-free Python 3 executable with subcommands: `run` (foreground), `status`, `config`
- [ ] 1.2 Implement config loading from an engine-owned file with documented defaults, reporting malformed config clearly without overwriting it
- [ ] 1.3 Implement structured logging of every decision — focus change, gate transition, probe result, words committed — to stdout in foreground mode
- [ ] 1.4 Implement `status` printing today's count, goal, resolved watch paths, gate state, and the reason counting is blocked when it is
- [ ] 1.5 Add a test harness runnable with no desktop and no shell

## 2. Phase 1 — focus tracking

- [ ] 2.1 Query the compositor once at startup for the currently focused window, so a session that begins with the editor already focused is handled
- [ ] 2.2 Subscribe to the compositor event stream and track focus changes without polling
- [ ] 2.3 Port forgiving app matching (exact, or final dot-segment, never substring) and its test cases
- [ ] 2.4 Implement the grace window so autosaves landing just after focus loss still count
- [ ] 2.5 Implement the counting gate and assert that no subprocess is spawned while it is closed
- [ ] 2.6 Isolate the compositor-specific code behind one function and document the Hyprland requirement

## 3. Phase 1 — counting

- [ ] 3.1 Implement the metadata-only probe using an absolute epoch cutoff, verified against `bfs` as well as GNU findutils
- [ ] 3.2 Fail loudly on a non-zero probe or any stderr output, never treating it as "nothing changed"
- [ ] 3.3 Implement targeted recount of only the changed files, with a per-cycle cap
- [ ] 3.4 Port word counting, including the documented CJK approximation, with its test cases
- [ ] 3.5 Port per-file baselines and the high-water-mark total, with its test cases: first sight contributes zero, re-reads are idempotent, deletions never reduce the total
- [ ] 3.6 Port daily rollover and capped history, with the suspend-and-resume case
- [ ] 3.7 Delete the JavaScript counting implementation once ported, so only one live copy exists

## 4. Phase 1 — state file

- [ ] 4.1 Define and document the state file schema, including the last-update timestamp and the gate-open flag
- [ ] 4.2 Write atomically via temporary file and rename
- [ ] 4.3 Persist and restore across engine restarts without re-counting historical words
- [ ] 4.4 Document the file's location and the freshness window in a contract document for front-end authors
- [ ] 4.5 Add `config` subcommands to add and remove watch paths and whitelist entries

## 5. Phase 1 — packaging and verification

- [ ] 5.1 Add a systemd user unit with restart-on-failure, and an install command that enables it
- [ ] 5.2 Extend the CI security guard to cover the engine: no input capture, no network, no privilege escalation, and the external-command allowlist
- [ ] 5.3 **Verification gate: run the engine in a terminal and confirm it counts real writing in a real editor** — words appear within a few seconds of saving, a browser and a terminal never increment, and no subprocess spawns while the gate is closed
- [ ] 5.4 Verify rollover, engine restart, a malformed config, and a missing watch path all behave as specified
- [ ] 5.5 Verify cost stays flat on a 2000-document collection, asserting on rows returned and not on elapsed time alone

## 6. Phase 2 — widget, gated on the crash diagnosis

- [ ] 6.1 **Gate: do not start until the segfault diagnosis lands.** Decide from it whether the widget may use file-change signals or must read on a timer
- [ ] 6.2 Delete `Service.qml` and remove the service kind from the manifest
- [ ] 6.3 Strip every write, subprocess, adapter and dynamically created component from the widget and panel
- [ ] 6.4 Read the state file and render, treating every value as untrusted and range-checking before use
- [ ] 6.5 Keep the presentation exactly as specified — both mascot sets, both resolutions, the grid invariant and its test
- [ ] 6.6 Implement the resting state and tooltip for a missing or stale state file, recovering without a shell restart
- [ ] 6.7 Replace panel configuration controls with a display of current settings and the engine commands that change them
- [ ] 6.8 Extend the CI guard to fail on any process execution, write adapter, or dynamic component creation in QML

## 7. Phase 2 — live verification

- [ ] 7.1 Install on a live session and confirm the shell's process identifier is unchanged after an hour of normal use
- [ ] 7.2 Confirm the widget tracks the engine: counting, stage changes, celebration at goal
- [ ] 7.3 Point the widget at a deliberately malformed state file and confirm the shell survives and the critter rests
- [ ] 7.4 Stop the engine and confirm the widget rests and explains why, then restart it and confirm recovery without a shell restart
- [ ] 7.5 Verify vertical bar mode and a proportional shell font
- [ ] 7.6 Remove the DO NOT INSTALL warning from the README only once 7.1 to 7.5 have passed
