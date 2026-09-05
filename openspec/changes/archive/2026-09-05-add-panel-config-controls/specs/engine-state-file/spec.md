## ADDED Requirements

### Requirement: State names the last focused application that is not counted
The state file SHALL carry the identifier of the most recently focused
application that is not whitelisted, exactly as the engine matched it, or an
empty value when there is none. This exists so a front-end can offer a whitelist
candidate without performing any discovery of its own.

#### Scenario: An uncounted editor was focused
- **WHEN** the user focuses an application that is not whitelisted
- **THEN** the state file names it by the identifier the engine compares against, so adding it cannot be misspelled

#### Scenario: Nothing to offer
- **WHEN** every application focused so far is already whitelisted
- **THEN** the field is empty, and a reader offers no candidate

#### Scenario: The field does not leak activity
- **WHEN** the state file is inspected
- **THEN** it carries at most the single most recent uncounted application id, and no history of what was focused or when

### Requirement: State is published as soon as what it reports changes
The engine SHALL publish state when a value the state file carries changes, not only on its counting cadence or its heartbeat. Applying a configuration change and opening or closing the counting gate both change published values and MUST each publish at once.

#### Scenario: A setting changed from the panel
- **WHEN** the engine applies a configuration change
- **THEN** it publishes immediately, so a reader sees the new goal or mascot within one of its own poll intervals rather than waiting for the next counted cycle or heartbeat

#### Scenario: Focusing a writing application
- **WHEN** focus moves so that counting starts or stops
- **THEN** the engine publishes immediately, so the display stops showing the critter as asleep while it is counting

#### Scenario: A title change is not a change to what state reports
- **WHEN** the compositor re-emits focus for the application that already had it
- **THEN** nothing is published, because no published value changed

## MODIFIED Requirements

### Requirement: A running engine proves it is alive
The engine SHALL refresh the state file's timestamp on a documented interval
even when no words have been counted, so that the absence of writing is
distinguishable from the absence of an engine. The freshness window readers use
SHALL be a multiple of that interval. The refresh SHALL NOT be conditional on
the counting gate, and the interval SHALL be measured from the last actual
publication rather than from the last attempt.

#### Scenario: The user stops writing but the engine runs
- **WHEN** no counted change occurs for longer than the refresh interval
- **THEN** the engine still updates the timestamp
- **AND** a reader continues to report the engine as running

#### Scenario: A writing application has focus but nothing is being written
- **WHEN** the counting gate is open and the user reads rather than types, so cycles run but none of them counts anything
- **THEN** the timestamp is still refreshed on the documented interval
- **AND** a reader does not report a healthy engine as stopped
