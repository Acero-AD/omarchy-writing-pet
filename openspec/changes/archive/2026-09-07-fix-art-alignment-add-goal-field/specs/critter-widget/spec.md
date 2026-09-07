## MODIFIED Requirements

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

## ADDED Requirements

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
