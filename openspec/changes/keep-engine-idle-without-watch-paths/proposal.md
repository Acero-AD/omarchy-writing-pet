## Why

A newly installed engine can legitimately have no watch path until the user
finishes initial panel configuration. Today that condition exits the daemon
with status 1, so the systemd user unit restart-loops and setup appears to
fail. The release verification reset reproduced the failure and its log spam.

## What Changes

- Keep the daemon running, publish a fresh zero-word idle state, and report
  that configuration is incomplete when no watch path is present.
- Allow an added watch path to take effect in the already-running daemon
  without a service restart, retaining the existing baseline-seeding behavior.
- Add regression coverage for the no-watch-path startup and configuration
  transition, and document the resulting lifecycle evidence accurately.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `counting-engine`: An incomplete watch-path configuration becomes a safe idle
  daemon state rather than a process failure.
- `engine-setup`: Fresh installation must remain successful while initial
  watch-path configuration is completed from the panel.

## Impact

- Updates `bin/writing-critter` and its Python tests; may add focused service
  lifecycle coverage where needed.
- Changes the runtime behavior of the installed systemd user service but adds
  no dependencies, privileges, files, or external access.
- Invalidates affected release verification and begins a new stability run
  before marketplace submission.
