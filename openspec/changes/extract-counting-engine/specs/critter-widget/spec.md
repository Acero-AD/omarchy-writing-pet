## ADDED Requirements

### Requirement: The widget performs no I/O beyond reading the state file
The bar widget and its panel SHALL read the state file and render. They MUST NOT spawn processes, write any file, use a writable file adapter, or create components dynamically at runtime.

#### Scenario: No writes from the shell process
- **WHEN** the widget and panel run for a full session
- **THEN** no file is written and no subprocess is spawned by the plugin

#### Scenario: Source-level guard
- **WHEN** the repository is checked by CI
- **THEN** the QML sources contain no process execution, no write adapter, and no dynamic component creation

### Requirement: A plugin fault must not reach the desktop shell
The widget SHALL be written so that any failure degrades to a blank or stale critter rather than affecting the host shell. Every value read from the state file MUST be treated as untrusted and range-checked before use.

#### Scenario: Garbage in the state file
- **WHEN** the state file contains values of the wrong type or out of range
- **THEN** the widget renders its resting state and the shell is unaffected

#### Scenario: Shell stability under a broken engine
- **WHEN** the engine is writing malformed state repeatedly
- **THEN** the shell does not crash, and its process identifier is unchanged after five minutes

### Requirement: The widget degrades visibly when the engine is not running
When the state file is missing or its last update is older than the freshness window, the widget SHALL render a documented resting state and SHALL explain the condition on hover.

#### Scenario: Engine not installed or stopped
- **WHEN** no state file exists, or it is stale
- **THEN** the critter renders asleep and the tooltip states that the engine is not running

#### Scenario: Recovery without restarting the shell
- **WHEN** the engine is started after the widget has been showing the resting state
- **THEN** the widget begins showing live values without a shell restart

### Requirement: Rendering preserves the established critter presentation
The widget SHALL render the fixed-width ASCII face in the bar and multi-line art in the panel, driven by the same stage, mood and eye-substitution rules, with both mascot sets and the grid invariant intact.

#### Scenario: Presentation is unchanged
- **WHEN** the widget renders any set, stage and mood
- **THEN** the output matches the previously specified art, at the previously specified widths

#### Scenario: Grid invariant still enforced
- **WHEN** the test suite runs
- **THEN** every set, stage and mood combination is asserted for exact dimensions and ASCII-only content

### Requirement: Panel controls act through the engine, never by writing state
Controls offered in the panel SHALL be limited to those that can be expressed without the widget writing anything. Configuration that requires a write MUST be presented as an engine command the user can run, not performed by the widget.

#### Scenario: Configuration is directed, not performed
- **WHEN** the user opens the panel's settings view
- **THEN** it displays the current configuration and the engine commands to change it, and writes nothing itself
