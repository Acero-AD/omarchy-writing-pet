# Critter Widget

## Purpose
The bar widget and panel: a read-only view of engine state, built under the lifecycle rules the 2026-09-02 crash established.
## Requirements
### Requirement: A plugin fault must not reach the desktop shell
The widget SHALL be written so that any failure degrades to a blank or stale critter rather than affecting the host shell. Every value read from the state file MUST be treated as untrusted and range-checked before use.

#### Scenario: Garbage in the state file
- **WHEN** the state file contains values of the wrong type or out of range
- **THEN** the widget renders its resting state and the shell is unaffected

#### Scenario: Shell stability under a broken engine
- **WHEN** the engine is writing malformed state repeatedly
- **THEN** the shell does not crash, and its process identifier is unchanged after five minutes

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

### Requirement: Rendering preserves the established critter presentation
The widget SHALL render the fixed-width ASCII face in the bar and multi-line art
in the panel, driven by the same stage, mood and eye-substitution rules, with
both mascot sets and the grid invariant intact. The grid invariant SHALL hold on
the screen and not only in the model: the art is padded to a fixed width
precisely so that every row shares one horizontal origin, and a renderer that
discards that padding MUST be treated as violating this requirement, not merely
as a cosmetic defect.

#### Scenario: Presentation is unchanged
- **WHEN** the widget renders any set, stage and mood
- **THEN** the output matches the previously specified art, at the previously specified widths

#### Scenario: Grid invariant still enforced
- **WHEN** the test suite runs
- **THEN** every set, stage and mood combination is asserted for exact dimensions and ASCII-only content

#### Scenario: Padding survives to the screen
- **WHEN** the panel draws a frame whose rows carry differing amounts of trailing whitespace
- **THEN** every row begins at the same horizontal position, because the drawn width is taken from the mascot set's declared column count rather than measured from the text

### Requirement: Panel controls act through the engine, never by writing state
Controls offered in the panel SHALL change configuration only by invoking the
engine, which remains the sole writer of the configuration file. The panel MUST
NOT write configuration itself, MUST NOT write the state file, and MUST NOT
duplicate the engine's validation. A setting the engine cannot express as a
subcommand MUST be presented as a command the user can run, not performed by the
widget.

#### Scenario: Configuration is delegated, not performed
- **WHEN** the user changes a setting in the panel
- **THEN** the engine performs the write after validating the value, and the panel writes nothing

#### Scenario: Validation is not duplicated
- **WHEN** an invalid value somehow reaches the engine from the panel
- **THEN** the engine rejects it with its existing validation, and the panel has no separate rule that could disagree

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

### Requirement: The widget writes nothing, and spawns only from a singleton
The bar widget and its panel MUST NOT write any file, MUST NOT use a writable
file adapter, and MUST NOT create components dynamically at runtime. They MAY
read the engine's state and configuration files and MAY list directories for the
path picker. A process MAY be spawned only from a singleton, only with a program
on a fixed allowlist, and only in response to an explicit user action.

#### Scenario: No writes from the shell process
- **WHEN** the widget and panel run for a full session, including changing every setting
- **THEN** no file is written by the plugin's QML

#### Scenario: Source-level guard
- **WHEN** the repository is checked by CI
- **THEN** the QML sources contain no write adapter and no dynamic component creation, and every process declaration is inside a singleton with an allowlisted program

#### Scenario: No process without a user action
- **WHEN** the shell starts and the panel is never opened
- **THEN** the plugin spawns no process

### Requirement: The art is drawn on a canvas of declared width
The panel SHALL draw the art inside a region whose width is the mascot set's
declared column count, and SHALL align the art to the left edge of that region
rather than centring each line within it. The region as a whole MAY be centred.
The drawn width MUST NOT be derived from the text being drawn, because the
mascots differ in how much of their canvas they occupy and a width taken from
the ink is a different width at every stage.

#### Scenario: A mascot that moves across its canvas
- **WHEN** the snail advances from its first stage to its last, occupying a growing part of a fixed-width canvas
- **THEN** it appears to travel, because the canvas does not shrink to fit it at each stage

#### Scenario: A mascot that fills its canvas
- **WHEN** the bird is drawn at any stage
- **THEN** the block does not shift horizontally between stages, because its width does not depend on which characters that stage happens to use

### Requirement: A single-line face does not move when the mood changes
The bar SHALL render the critter's face at a stable horizontal position for a
given mascot and stage. A change of mood alters the face's trailing mood
character, and that MUST NOT displace the face, in any bar orientation or with
the word count hidden.

#### Scenario: The critter falls asleep
- **WHEN** the mood changes between one whose mood character is a space and one whose mood character is visible
- **THEN** the face does not move sideways

#### Scenario: Vertical bar and hidden counter
- **WHEN** the bar is vertical, or the word count is disabled, so the label is the face alone
- **THEN** the face still holds its position across every mood

