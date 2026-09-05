# Engine State File

## Purpose
The only contract between the counting engine and anything that displays it.
## Requirements
### Requirement: A documented state file is the only contract between engine and display
The engine SHALL publish today's progress to a single documented file. Any front-end — bar widget, CLI, status bar, companion — SHALL be able to render the critter from that file alone, without invoking the engine.

#### Scenario: A second front-end needs no new interface
- **WHEN** a developer writes an independent front-end against the documented schema
- **THEN** it can display the critter correctly with no change to the engine

#### Scenario: The documented location is stable
- **WHEN** a reader resolves the state file path from the documentation
- **THEN** the file is found at that path

### Requirement: Readers never write
The state file SHALL be written only by the engine. No front-end may write to it, and rendering MUST NOT require write access to any path.

#### Scenario: Read-only front-end
- **WHEN** the display renders the critter
- **THEN** it performs no writes anywhere on disk

### Requirement: Writes are atomic and readers tolerate torn reads
The engine SHALL write the state file by writing a temporary file and renaming it into place. A reader encountering malformed or partial content MUST keep its previous value and retry, never crash.

#### Scenario: Read during a write
- **WHEN** a reader reads the file at the moment the engine replaces it
- **THEN** the reader sees either the complete previous version or the complete new one

#### Scenario: Malformed content
- **WHEN** the state file cannot be parsed
- **THEN** the reader retains its last good value and retries on its next read

### Requirement: State carries everything needed to render, and its own freshness
The state file SHALL contain today's date, word total, goal, per-origin breakdown, recent history, the resolved mascot selection, whether counting is currently gated open, and the timestamp of the last engine update.

#### Scenario: Rendering needs no second source
- **WHEN** a front-end reads the state file
- **THEN** it can derive stage, mood, counter and history without consulting configuration or the engine

#### Scenario: A stopped engine is detectable
- **WHEN** the engine has not updated the file for longer than the documented freshness window
- **THEN** a reader can tell the engine is not running from the file alone

### Requirement: Readers poll; a file watch is not sufficient
A reader SHALL re-read the state file on a timer, and MUST NOT depend on a
file-change signal to stay current; it MAY use one as an additional trigger.
This is required because the engine publishes by writing a temporary file and
renaming it into place, so every write installs a new inode and leaves any watch
on the path holding the old, unlinked one. The state file SHALL be kept small
enough that polling it a few times a minute is negligible.

#### Scenario: The engine publishes a new version
- **WHEN** the engine replaces the state file by rename
- **THEN** a reader relying only on a path watch receives no notification
- **AND** a polling reader reflects the new value within one poll interval

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

### Requirement: A missing state file is a valid, expected condition
Absence of the state file SHALL mean "the engine has not run yet" and MUST be handled as a normal state by every reader.

#### Scenario: First run before the engine starts
- **WHEN** no state file exists
- **THEN** the front-end renders a documented resting state and does not error

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

