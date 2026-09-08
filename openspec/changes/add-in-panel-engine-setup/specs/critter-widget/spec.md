## MODIFIED Requirements

### Requirement: The widget degrades visibly when the engine is not running
The widget SHALL render a documented resting state when the state file is
missing or its last update is older than the freshness window, and SHALL explain the
condition on hover. The hover guidance SHALL direct the user to open the panel,
where the plugin obtains authoritative service state and offers the applicable
setup or repair action without requiring a terminal.

#### Scenario: Engine not installed or stopped
- **WHEN** no state file exists, or it is stale
- **THEN** the critter renders asleep and the tooltip states that the engine is unavailable and directs the user to open the panel

#### Scenario: Recovery without restarting the shell
- **WHEN** the engine is installed, started, or repaired after the widget has been showing the resting state
- **THEN** the widget begins showing live values without a shell restart
