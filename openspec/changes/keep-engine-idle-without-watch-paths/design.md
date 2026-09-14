## Context

The engine currently checks `blocking_reason()` before it loads state, connects
to Hyprland, or publishes its initial heartbeat. With an empty `watch` list it
returns exit status 1. The bundled unit uses `Restart=on-failure`, so a valid
fresh configuration is misclassified as a crash and restart-loops until the
user adds a path. Fresh setup is deliberately followed by panel configuration,
so this ordering contradicts the intended lifecycle.

## Goals / Non-Goals

**Goals:**

- Treat missing watch paths as an observable idle state, not a daemon failure.
- Publish a fresh, zero-word state with a closed gate so service status reports
  a healthy installed engine while the panel remains able to explain what is
  missing.
- Preserve baseline seeding and config reload so adding a path takes effect in
  the existing daemon without counting pre-existing files.
- Cover startup, idle behavior, and the configuration transition with focused
  tests.

**Non-Goals:**

- Counting files without a configured path or app.
- Changing the service unit, adding a separate idle process, or suppressing
  restart behavior for actual process faults.
- Resetting, migrating, or exposing writing data.

## Decisions

### Enter the normal event loop for incomplete counting configuration

`cmd_run` will load state, resolve initial focus, publish its heartbeat, and
keep the Hyprland event loop active even when `blocking_reason()` is present.
The gate already consults that reason, so it remains closed and the cycle never
scans files. A single `engine.idle` log records why counting is unavailable.

This reuses the existing polling, heartbeat, config-reload, and status contract
instead of introducing a second service mode. Returning success only once and
relying on systemd `RestartPreventExitStatus` was rejected: it would still not
publish state or adopt a path added after setup.

### Re-evaluate the gate when configuration reloads

After accepting a new configuration, the daemon will keep baseline seeding and
immediately recompute the gate before publishing the updated state. The focus
identity recorded at startup remains sufficient; no extra compositor command is
needed. This makes a newly added path usable without restarting the service
and accurately reflects its current closed or open gate in state.

### Test the daemon boundary with controllable focus I/O

Focused tests will drive `cmd_run` with a temporary configuration and a
controllable focus socket or test seam. They will assert that an empty watch
list publishes a fresh closed-gate state and does not return failure, and that
a later configuration update seeds baselines before normal counting begins.
Existing `Engine` gate tests continue to assert that no scan occurs while the
configuration blocks counting.

## Risks / Trade-offs

- A healthy but incomplete engine might be mistaken for configured counting →
  preserve the explicit blocking reason in terminal status and the panel's
  empty-path configuration prompt.
- A changed configuration could count pre-existing documents → retain and test
  baseline seeding before an opened gate can cycle.
- A hidden real failure might be swallowed → only configuration incompleteness
  becomes idle; missing Hyprland connectivity, malformed configuration, and
  event-loop errors retain non-zero failure behavior.

## Migration Plan

1. Update the bundled engine and tests in the checkout.
2. Update the installed engine through the existing explicit panel update or
   setup action; no data files change.
3. Re-run affected automated and fresh-install checks, then begin a new
   stability record because runtime behavior changed.
4. Roll back by reinstalling the prior bundled engine if deployment reveals an
   unrelated regression; configuration, state, and tracking files remain
   untouched.

## Open Questions

None. The observed service logs reproduce the behavior and the existing gate
and reload paths provide the required implementation boundary.
