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
SHALL be a multiple of that interval.

#### Scenario: The user stops writing but the engine runs
- **WHEN** no counted change occurs for longer than the refresh interval
- **THEN** the engine still updates the timestamp
- **AND** a reader continues to report the engine as running

### Requirement: A missing state file is a valid, expected condition
Absence of the state file SHALL mean "the engine has not run yet" and MUST be handled as a normal state by every reader.

#### Scenario: First run before the engine starts
- **WHEN** no state file exists
- **THEN** the front-end renders a documented resting state and does not error
