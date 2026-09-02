## ADDED Requirements

### Requirement: The critter is presented at two distinct resolutions
The bar widget SHALL render a single line of text and MUST NOT attempt multi-line art, because the Omarchy bar is 26 px tall. Multi-line ASCII art SHALL appear only in the panel.

#### Scenario: Bar renders one line
- **WHEN** the bar widget is rendered in a horizontal bar
- **THEN** its content occupies exactly one text line and does not overflow the bar height

#### Scenario: Panel renders the full art
- **WHEN** the user opens the panel
- **THEN** the critter's multi-line ASCII art is displayed

### Requirement: The bar face is fixed-width ASCII, not emoji
The bar SHALL render the critter as ASCII characters only. It MUST NOT depend on an emoji font for the critter. The rendered face cell SHALL be exactly `barCols + 1` columns wide in every stage and mood combination, so the widget width does not change as state changes.

#### Scenario: Width is stable across stages
- **WHEN** the stage advances from 0 to 4
- **THEN** the rendered face cell remains the same number of columns

#### Scenario: Width is stable across moods
- **WHEN** the mood changes from `writing` to `sleeping`
- **THEN** the rendered face cell remains the same number of columns

#### Scenario: No emoji font dependency
- **WHEN** the plugin runs on a system with no colour emoji font installed
- **THEN** the critter renders correctly with no missing-glyph placeholders

### Requirement: Stage encodes progress and never regresses within a day
The plugin SHALL derive a stage of 0 to 4 from progress toward the daily goal at the thresholds 0–24%, 25–49%, 50–74%, 75–99%, and 100% or more. Because the day's total is additive, the stage MUST NOT decrease during a day.

#### Scenario: Crossing a threshold
- **WHEN** today's total rises from 49% to 50% of the goal
- **THEN** the stage changes from 1 to 2 in both the bar and the panel

#### Scenario: Editing does not shrink the critter
- **WHEN** the user deletes text after reaching 60% of the goal
- **THEN** the stage remains 2 or higher

### Requirement: Mood encodes recent activity and is bound to the poll gate
The plugin SHALL derive a mood of `writing`, `idle`, `sleeping`, or `celebrating` from recent counting activity and focus state. The `sleeping` mood MUST be driven by the same expression that gates the poll loop, so the critter can never appear awake while the plugin is not counting.

#### Scenario: Sleeping when not counting
- **WHEN** no whitelisted writing app is focused and the grace window has elapsed
- **THEN** the critter's eyes are closed and the poll timer is stopped

#### Scenario: Idle while focused
- **WHEN** a writing app is focused but no words have been counted for 60 seconds
- **THEN** the critter's eyes are closed and the poll timer is still running

#### Scenario: Writing
- **WHEN** words have been counted within the last 60 seconds
- **THEN** the critter's eyes are open

#### Scenario: Celebrating
- **WHEN** today's total crosses the goal
- **THEN** the critter shows the celebrating face and a scale animation for no longer than 10 seconds, with no sound

### Requirement: Mood is applied by substitution into a single eye slot
Each mascot frame SHALL contain one `{eyes}` placeholder. Mood SHALL be applied by substituting a 3-column string into bar frames and a 5-column string into panel frames, plus a single trailing effect column in the bar. Sets MUST NOT author a separate drawing per mood.

#### Scenario: One substitution drives both resolutions
- **WHEN** the mood changes
- **THEN** both the bar face and the panel art update from the same mood value, with no per-mood artwork stored

### Requirement: Mascot sets are declared data
A mascot set SHALL be declared as data comprising an id, label, panel grid dimensions, bar width, five bar frames, five panel frames, and a meter mode. Adding a set MUST NOT require changes to the bar widget or panel QML.

#### Scenario: Adding a third set
- **WHEN** a new mascot set is added to the set table with its frames
- **THEN** it becomes selectable and renders correctly with no QML changes

### Requirement: Two mascot sets ship, with bird as default
The plugin SHALL ship a `bird` set and a `snail` set. `bird` SHALL be the default. `bird` grows in place; `snail` travels, and its trail SHALL serve as its progress indicator at both resolutions.

#### Scenario: Default selection
- **WHEN** the plugin runs with no mascot configured
- **THEN** the `bird` set is used

#### Scenario: Snail trail grows with stage
- **WHEN** the snail set is active and the stage advances
- **THEN** the trail behind the snail lengthens in the bar face and the snail advances across the panel frame

#### Scenario: Switching sets at runtime
- **WHEN** the user changes the mascot set from the panel
- **THEN** both resolutions update, the panel does not change height, and tracking state is preserved

### Requirement: Rendered frames satisfy a grid invariant
For every set, stage, and mood, the assembled panel frame SHALL be exactly the set's declared row count with every line exactly the declared column count, and the assembled bar face SHALL be exactly one line of `barCols + 1` columns. All frame characters MUST be ASCII. This invariant MUST be asserted by an automated test.

#### Scenario: Every combination is verified
- **WHEN** the test suite runs
- **THEN** every set, stage and mood combination is asserted for exact line count, exact column widths, and ASCII-only content

### Requirement: Art elements pin a monospace font
Every element rendering critter art, in both the bar and the panel, SHALL set an explicit monospace font family rather than inheriting the shell font family, because that family is a user-redirectable fontconfig alias.

#### Scenario: Shell font redirected to a proportional family
- **WHEN** the user points the shell font alias at a proportional font
- **THEN** the bar face and panel art remain correctly aligned

### Requirement: The panel shows progress, breakdown, and history
The panel SHALL display the critter art, the numeric today-over-goal figure, a per-origin breakdown of today's contributions, and a recent-days goal history. When the active set declares an art-based meter, the panel MUST omit the separate meter widget while preserving panel height.

#### Scenario: Numeric figure always present
- **WHEN** the panel is open with any mascot set
- **THEN** the numeric today-over-goal figure is displayed

#### Scenario: Art-based meter suppresses the widget meter
- **WHEN** the snail set is active
- **THEN** no separate meter bar is drawn and the panel height matches that of the bird set

### Requirement: The widget adapts to a vertical bar
When the bar is vertical, the widget SHALL render the critter without the numeric counter and MUST NOT overflow the bar width. The numeric figure SHALL remain available in the tooltip.

#### Scenario: Vertical bar
- **WHEN** the bar is positioned vertically
- **THEN** the critter renders within the bar width and the counter appears only in the tooltip

### Requirement: All colours come from the active theme
The widget and panel SHALL take every colour from the shell's theme singletons and the injected bar object. Hardcoded colour values MUST NOT appear.

#### Scenario: Theme change
- **WHEN** the user switches Omarchy themes
- **THEN** the critter's colours update to the new theme with no plugin restart
