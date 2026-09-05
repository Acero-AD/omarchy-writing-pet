## 1. Engine: make concurrent configuration safe

- [x] 1.1 Wrap the whole read-modify-write in `cmd_config` in an exclusive `flock` on the config file, so load → mutate → save cannot interleave with another invocation
- [x] 1.2 Ensure the lock is released on every exit path, including `ConfigError` and a malformed file, and that it is never taken by `cmd_run`
- [x] 1.3 Test: two concurrent `main(["config", ...])` invocations changing different settings both survive
- [x] 1.4 Test: a `ConfigError` inside the locked region still exits 2 and leaves the file untouched

## 2. Engine: publish the whitelist candidate

- [x] 2.1 Track the most recently focused application that is not whitelisted, updating it in `set_focus` and clearing it when that app is later whitelisted
- [x] 2.2 Add `lastFocusedApp` to `write_state`, empty string when there is no candidate
- [x] 2.3 Test: focusing an unlisted app publishes its exact id; focusing a whitelisted one does not overwrite it with a counted app
- [x] 2.4 Test: the field holds one value only — no list, no timestamps
- [x] 2.5 Document the field in `docs/STATE-FILE.md`, including that it is deliberately not a history

## 3. Guards: narrow the rules rather than remove them

- [x] 3.1 Change lint rule 3 from "no `Process` anywhere" to "a `Process` declaration is permitted only in a file containing `pragma Singleton`"
- [x] 3.2 Add to rule 3 that a `Process` `command` must begin with an allowlisted program, and fail on anything else
- [x] 3.3 Confirm rule 4 (no writes, no adapters, no dynamic creation) still fires on the new sources unchanged
- [x] 3.4 Add the plugin's own CLI to `scripts/security-guard.sh`'s external-command allowlist
- [x] 3.5 Add a negative fixture: a `Process` in a non-singleton file must fail the lint

## 4. Control singleton

- [x] 4.1 Create `Control.qml` with `pragma Singleton` and register it in `qmldir`
- [x] 4.2 Resolve the `writing-critter` program to an absolute path once at startup; expose an `available` flag when it cannot be found
- [x] 4.3 Add a read-only `FileView` on `config.json` exposing goal, watch paths, whitelist and mascot, polled on the same cadence as `StateSource` and tolerant of a missing or malformed file
- [x] 4.4 Add a single-slot command queue: at most one `Process` running, the rest queued in order
- [x] 4.5 Expose one `run(action, value)` entry point covering the six existing subcommands, and reject any action not in that set
- [x] 4.6 Surface the last command's failure — exit code and which action — as an observable property
- [x] 4.7 Add the `FolderListModel` for browsing: directories only, no file contents, current folder and navigate-up exposed as properties

## 5. Panel: replace the printed settings with controls

- [x] 5.1 Replace the goal line with a `PanelSlider`, 100–3000 step 50, committing on `released` only, displaying the dragged value locally
- [x] 5.2 List each watch path with a remove control wired to `remove-path`
- [x] 5.3 Add an **Add path** button opening the directory picker; browsing lists directories only and can navigate above `$HOME`; confirming commits `add-path`
- [x] 5.4 List each whitelisted app with a remove control wired to `remove-app`
- [x] 5.5 Offer `lastFocusedApp` as a one-tap add when it is non-empty, and render nothing when it is empty
- [x] 5.6 Replace the mascot line with a two-way toggle wired to `set-mascot`
- [x] 5.7 Report a failed command where the user can see it, and keep displaying the configuration as it actually is rather than the attempted value
- [x] 5.8 Fall back to the current display-only settings view when `Control.available` is false
- [x] 5.9 Confirm the panel still contains no text input and that `PanelKeyCatcher` needs no blocking

## 6. Documentation

- [x] 6.1 Update `README.md`: settings are changeable from the panel, the command line remains equivalent, and a shell restart is required after updating because singletons are cached
- [x] 6.2 Add a short section to `docs/POSTMORTEM-ORPHANED-READ.md` recording that the no-spawn rule was prophylactic and has been narrowed, with the reasoning
- [x] 6.3 Update the panel's header comment, which currently states that the panel displays and does not configure

## 7. Verification

- [x] 7.1 Run the full test suite, `qmllint` from `/usr/lib/qt6/bin`, the lifecycle lint and the security guard
- [x] 7.2 Load the plugin in the standalone `quickshell -p` harness first, never the live shell, and exercise every control
- [x] 7.3 Verify each of the six actions end to end: the control is used, `config.json` changes, the running engine reloads, the panel reflects it within one poll
- [x] 7.4 Verify a monitor hotplug while the picker is open does not fault, and that the shell PID is unchanged afterwards
- [x] 7.5 Verify a rapid burst of clicks produces sequential commands and loses no update
- [x] 7.6 Verify adding a large directory re-seeds baselines rather than crediting its contents as words written
- [x] 7.7 Verify the fallback path by making the CLI temporarily unresolvable
- [ ] 7.8 **Human gate**: the user changes the goal, adds a path via the picker, adds the app they were last in, and removes an app — all without a terminal
