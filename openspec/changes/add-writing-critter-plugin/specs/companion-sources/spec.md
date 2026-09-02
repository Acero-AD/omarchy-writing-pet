## ADDED Requirements

### Requirement: External sources report counts through a documented drop-box
The plugin SHALL watch a documented directory within its own state directory and treat each JSON file there as one word-count source. The protocol SHALL be documented in the repository so third parties can implement a source without modifying the plugin.

#### Scenario: A source file appears
- **WHEN** a valid source JSON file is written to the drop-box
- **THEN** its reported contribution is included in today's total and the source is listed in the panel

#### Scenario: Protocol is documented
- **WHEN** a third-party developer reads the repository documentation
- **THEN** the schema, drop-box location, write rules, and reset rules are specified

### Requirement: Sources report absolute daily totals, not deltas
A source SHALL report its own absolute words-added-today value. The plugin SHALL take the maximum of the previously recorded and newly reported value for that source on that date. Re-reading an unchanged file MUST NOT change the total.

#### Scenario: Repeated reads are idempotent
- **WHEN** the same source file is read several times without changing
- **THEN** the day's total is unchanged after each read

#### Scenario: A source restarts and reports a lower value
- **WHEN** a source crashes and resumes reporting from a lower value on the same date
- **THEN** the previously recorded higher value is retained

### Requirement: Stale-dated source files are ignored
A source file whose date does not equal the current local date SHALL be excluded from today's total.

#### Scenario: Yesterday's file left behind
- **WHEN** a source file carries yesterday's date
- **THEN** it contributes nothing to today's total

### Requirement: Inactive sources are marked but retain their contribution
When a source's last-updated timestamp is older than the staleness threshold, the plugin SHALL continue to count the value it already reported for today and SHALL mark that source inactive in the panel.

#### Scenario: Editor closed mid-day
- **WHEN** a source stops updating for longer than the staleness threshold
- **THEN** its contribution remains in today's total and the panel shows it as inactive

### Requirement: Active sources suppress file counting for the paths they claim
While a source is active, the file-observation counter SHALL skip deltas for any watched file beneath a path that source claims. When the source becomes stale, file counting SHALL resume for those paths using current counts as new baselines.

#### Scenario: No double counting
- **WHEN** an active source claims a directory that is also configured as a watch path
- **THEN** words written there are counted once, by the source only

#### Scenario: Resuming after a source goes stale
- **WHEN** a claiming source becomes stale
- **THEN** file counting resumes for those paths and the words present at that moment are treated as a baseline rather than added to the total

### Requirement: Source files are treated as untrusted input
The plugin SHALL validate every field of a source file for type and range before use, SHALL ignore malformed or partially written files and retry on the next change, and MUST NOT execute, evaluate, or render as rich text any content from a source file.

#### Scenario: Malformed JSON
- **WHEN** a source file contains invalid or truncated JSON
- **THEN** the read is ignored, the plugin does not crash, and the previous value is retained

#### Scenario: Out-of-range value
- **WHEN** a source reports a word count outside the documented valid range
- **THEN** the value is rejected and does not affect the total

#### Scenario: Hostile strings are not executed
- **WHEN** a source file contains markup or code in a string field
- **THEN** it is never evaluated and is displayed only as plain text
