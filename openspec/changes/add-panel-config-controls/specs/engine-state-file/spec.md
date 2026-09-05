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
