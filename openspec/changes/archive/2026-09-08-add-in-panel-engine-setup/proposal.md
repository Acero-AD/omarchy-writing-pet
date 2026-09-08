## Why

Omarchy deliberately does not execute third-party install hooks, so adding and
enabling Writing Critter currently leaves its counting engine and user service
uninstalled until the user discovers and runs `install.sh` in a terminal. The
plugin already ships an auditable engine beside its QML and has an explicit-user
action boundary, so it can offer a disclosed, one-click user-service setup
without returning counting work or filesystem writes to the shell process.

## What Changes

- Add a structured service-management interface to the bundled engine for
  status, install/update, start, restart, and uninstall operations.
- Probe service state when the user opens the panel and distinguish absent,
  outdated, stopped, starting, unhealthy, and ready states.
- Show an inline setup card with a review step that discloses the exact files
  and user-service effects before installation.
- Install only from the checked-out plugin, with fixed user-owned destinations,
  no network access, no privilege escalation, and no changes to writing
  configuration, counts, or history.
- Detect drift after a plugin update and offer an explicit update-and-restart
  action rather than silently replacing the running engine.
- Offer symmetric engine removal and retain a copyable terminal fallback when
  service management fails.
- Make `install.sh` delegate to the same service-management implementation used
  by the panel so terminal and UI setup cannot diverge.
- Correct README and security claims to document the user systemd service,
  one-click setup, review-required marketplace capabilities, and complete
  removal procedure.

## Capabilities

### New Capabilities

- `engine-setup`: Detecting and managing the installed counting engine and its
  systemd user service through an explicit, disclosed panel workflow.

### Modified Capabilities

- `critter-widget`: Replace terminal-only unavailable-engine guidance with an
  actionable panel setup/repair path while preserving resting-state honesty and
  the singleton subprocess boundary.

## Impact

- Affected runtime code: `bin/writing-critter`, `Control.qml`, `StateSource.qml`,
  `Panel.qml`, and `BarWidget.qml`.
- Affected setup assets: `install.sh` and
  `contrib/writing-critter.service`; an uninstall wrapper may be added.
- Affected safeguards and tests: engine CLI tests, QML lifecycle lint probes,
  the command/security guard, model or QML harness tests, and live service-state
  verification.
- Affected documentation: installation, updating, removal, privacy/security,
  verification status, and marketplace capability disclosure.
- Marketplace review will continue to detect the repository's `installer` and
  `service-management` capabilities; the change introduces no sudo, polkit,
  package-manager, network, or remote-code path.
