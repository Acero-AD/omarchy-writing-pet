## 1. Verify service-manager assumptions

- [x] 1.1 Capture `systemctl --user show`, `is-active`, and `is-enabled` output and exit codes for absent, disabled, activating, active, failed, and stopped units on the supported Omarchy system
- [x] 1.2 Confirm the bundled `bin/writing-critter` can execute from the plugin checkout when no installed binary, unit, config, or state exists
- [x] 1.3 Add fixtures for the selected systemctl properties before implementing the status parser, including unknown and malformed output

## 2. Service paths and structured status

- [x] 2.1 Add fixed source/destination resolution for the bundled engine, shipped unit, `$HOME/.local/bin/writing-critter`, and the XDG user-unit directory; accept no path from CLI service actions
- [x] 2.2 Add a timeout-bounded systemctl runner using literal `--user` argument arrays and returning sanitized failures
- [x] 2.3 Add byte comparison for both installed targets and a safe installed-version reader that does not execute the installed engine
- [x] 2.4 Implement `service status --json` with schema 1 and the stable `not-installed`, `update-available`, `stopped`, `starting`, `unhealthy`, and `ready` states
- [x] 2.5 Test every status state, partial installations, unknown systemctl states, stale/malformed state, XDG unit paths, output bounds, and the rule that status writes nothing

## 3. Transactional install and update

- [x] 3.1 Add private sibling staging and atomic replacement helpers that install the engine and unit with fixed modes
- [x] 3.2 Implement the idempotent service install operation: stage files, daemon-reload, enable, restart, verify, and return structured status
- [x] 3.3 Implement rollback to the prior files and active state when any post-copy systemctl or verification step fails, reporting rollback failure separately
- [x] 3.4 Test fresh install, identical reinstall, engine-only drift, unit-only drift, both-file update, failure at each systemctl step, and rollback from both fresh and existing installations
- [x] 3.5 Assert in tests that install/update never reads or changes the configuration, state, tracking, or history targets and never invokes network, privilege, package, or caller-supplied commands

## 4. Start, restart, and uninstall

- [x] 4.1 Implement fixed start and restart service actions with bounded systemctl calls, post-action verification, and structured results
- [x] 4.2 Implement confirmed-target uninstall semantics in the engine: stop, disable, remove only the engine and unit, daemon-reload, reset-failed, and preserve user data
- [x] 4.3 Make absent-target uninstall and repeated lifecycle actions idempotent without hiding genuine systemctl failures
- [x] 4.4 Test start/restart state transitions, service failure, complete and partial uninstall, repeated uninstall, exact target deletion, and retained config/state trees

## 5. One setup implementation for every caller

- [x] 5.1 Add the `service` CLI namespace and stable JSON/exit-code contract for status, install, start, restart, and uninstall
- [x] 5.2 Replace `install.sh` copy/systemctl logic with a thin delegation to the bundled engine's install action
- [x] 5.3 Add `uninstall.sh` as a thin delegation to the bundled engine's uninstall action and keep both wrappers independent of the caller's current directory
- [x] 5.4 Resolve the existing `XDG_BIN_HOME`/fixed-`ExecStart` mismatch and test that the installed unit executes the same canonical engine path the installer reports

## 6. Stable singleton integration

- [x] 6.1 Add fail-closed parsing for the service-status JSON with bounded stdout/stderr and a documented fallback object for unknown schema, state, or field types
- [x] 6.2 Extend `Control.qml` with internally mapped service actions while keeping the bundled engine as its only executable and accepting no raw argv from panel callers
- [x] 6.3 Serialize service and configuration actions under the existing watchdog, and coalesce concurrent status requests from panels on multiple screens
- [x] 6.4 Trigger one status refresh from the explicit `Panel.open()` path and after lifecycle actions; do not add a startup or permanent status polling process
- [x] 6.5 Separate bundled-engine launch availability from installed-service state so a missing service does not disable configuration controls
- [x] 6.6 Add QML harness tests for mapping, serialization, coalescing, timeouts, malformed/oversized JSON, sanitized errors, and no subprocess before panel open

## 7. Panel setup and repair experience

- [x] 7.1 Add an engine setup card before normal settings that renders the six specified service states and never mistakes systemd activity alone for readiness
- [x] 7.2 Add the two-step install review naming the resolved destinations and disclosing enable/start, offline operation, and no administrator access; verify cancel has no effects
- [x] 7.3 Add update-and-restart and uninstall confirmations, plus direct start and restart repair actions for installed files
- [x] 7.4 Keep normal configuration controls available before installation and throughout recoverable setup failures
- [x] 7.5 Show progress, sanitized failure details, rollback failure when applicable, and a copyable bundled-engine terminal command for the failed operation
- [x] 7.6 Update the resting tooltip to direct the user to open the panel, and verify successful setup becomes live through `StateSource` without a shell restart
- [ ] 7.7 Exercise the setup card with keyboard navigation, Escape, narrow/proportional themes, vertical bars, and panels on multiple monitors

## 8. Safeguards and documentation

- [x] 8.1 Extend the security guard and its probes to recognize only the engine's fixed service-management subprocess vocabulary and reject arbitrary systemctl, shell, sudo, polkit, package-manager, network, and caller-provided path variants
- [x] 8.2 Retain the lifecycle-lint guarantee that all QML `Process` objects are singleton-owned and add a probe that setup cannot introduce a second executable path
- [x] 8.3 Update the README install flow, setup disclosure, engine update behavior, complete removal order, retained-data behavior, and marketplace installer/service-management review capabilities
- [x] 8.4 Remove or correct stale claims that the plugin has no systemd unit, has not been live-verified, or has not exercised vertical-bar behavior
- [x] 8.5 Update architectural documentation to preserve the distinction between write-free QML and the explicitly requested external engine installer

## 9. Automated and live verification

- [x] 9.1 Run all Python and JavaScript tests, QML lifecycle lint, security guard, strict OpenSpec validation, `qmllint`, and `omarchy plugin validate`
- [x] 9.2 In isolated temporary roots, verify fresh install, configuration before install, update drift, stopped, starting, unhealthy, rollback failure, uninstall, and reinstall while proving user data is preserved
- [ ] 9.3 Back up the current live service files and data, install the development plugin, and confirm the real panel detects and repairs absent, stopped, outdated, and stale states
- [ ] 9.4 Confirm live install and update require the disclosed click, spawn no terminal, use no privilege or network, and recover in the bar without a shell restart
- [ ] 9.5 Confirm live uninstall stops autostart and removes only the disclosed files, then restore the user's prior service and data exactly
- [ ] 9.6 Complete a human gate for wording, confirmation clarity, progress/failure states, keyboard behavior, and the full first-install experience before marketplace submission
