# Critter Widget

## Purpose
The bar widget and panel: a read-only view of engine state, built under the lifecycle rules the 2026-09-02 crash established.

## Requirements

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

### Requirement: No component lifetime may depend on a late-settling value
No `Loader.active`, `Component` condition, or equivalent lifetime binding may depend on an expression that can be unresolved at construction and resolve a moment later. Anything of that shape builds a subtree and then destroys it during startup. Lifetime SHALL be gated on a value already resolved at construction, or the component SHALL be mounted unconditionally once.

#### Scenario: A late-resolving host reference does not destroy a subtree
- **WHEN** a reference that is null at construction becomes non-null later in startup
- **THEN** no already-constructed component is destroyed as a result

#### Scenario: Source-level guard
- **WHEN** CI inspects the QML sources
- **THEN** no `Loader` has an `active` binding derived from a host, shell, or service lookup

### Requirement: Nothing holding outstanding asynchronous work may live in a destroyable subtree
Any object with a pending file read, an in-flight subprocess, or a re-arming timer SHALL be owned by a component that is never destroyed for the lifetime of the plugin. Starting asynchronous work is a claim on the owning object; code that can destroy a subtree MUST NOT be written where such a claim can be outstanding.

#### Scenario: Teardown with a read in flight cannot occur
- **WHEN** the widget is running with a file read outstanding
- **THEN** no code path destroys the object that issued the read

#### Scenario: A completion callback never arrives at a dead context
- **WHEN** an asynchronous read completes
- **THEN** the object that requested it is still alive and its QML context still has an engine

### Requirement: Refresh and retry timers must not target destroyable components
A timer that re-arms work on a component SHALL NOT live inside that component. Such a timer keeps the component permanently busy and therefore permanently unsafe to tear down, and converts a rare teardown race into a reliable one.

#### Scenario: Retry does not pin a subtree busy
- **WHEN** the display is retrying a read because state is unavailable
- **THEN** the retry is driven from a component that is never destroyed

### Requirement: The widget parses the state file itself and uses no adapter
The widget SHALL read the state file as text and parse it in JavaScript. It MUST NOT bind a `JsonAdapter` or any object-mapping adapter to the file, in either direction.

#### Scenario: No adapter deserialization path exists
- **WHEN** CI inspects the QML sources
- **THEN** no adapter is attached to any file view, and no `var`-typed adapter property exists

#### Scenario: Parsing failure is contained
- **WHEN** the state file contains invalid JSON
- **THEN** the parse failure is caught in JavaScript and the previous value is retained

### Requirement: Shared state is owned once, by a stable owner
Where more than one bar surface exists — one per monitor — the plugin SHALL NOT instantiate more than one owner of file reads or timers. Per-surface widgets SHALL render from shared state rather than each creating their own reader.

#### Scenario: Two monitors, one reader
- **WHEN** the bar is displayed on two monitors
- **THEN** exactly one component performs file reads and both surfaces render from it

### Requirement: Isolated-instance testing does not substitute for live verification
A component passing in a throwaway shell instance SHALL NOT be treated as evidence that it is safe in the live session. Both MUST be exercised before release, in that order.

#### Scenario: Both runs are required
- **WHEN** a QML change is prepared for release
- **THEN** it is run against a throwaway instance first and then verified in a live session, and neither alone is accepted
