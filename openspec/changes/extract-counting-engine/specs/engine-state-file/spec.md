## ADDED Requirements

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
- **THEN** the reader retains its last good value and retries on the next change

### Requirement: State carries everything needed to render, and its own freshness
The state file SHALL contain today's date, word total, goal, per-origin breakdown, recent history, the resolved mascot selection, whether counting is currently gated open, and the timestamp of the last engine update.

#### Scenario: Rendering needs no second source
- **WHEN** a front-end reads the state file
- **THEN** it can derive stage, mood, counter and history without consulting configuration or the engine

#### Scenario: A stopped engine is detectable
- **WHEN** the engine has not updated the file for longer than the documented freshness window
- **THEN** a reader can tell the engine is not running from the file alone

### Requirement: A missing state file is a valid, expected condition
Absence of the state file SHALL mean "the engine has not run yet" and MUST be handled as a normal state by every reader.

#### Scenario: First run before the engine starts
- **WHEN** no state file exists
- **THEN** the front-end renders a documented resting state and does not error
