## Why

The panel pads every row of the mascot art to the same width, and then throws
that padding away at render time. `Panel.qml` draws the block as a single
centred `Text`, and Qt centres each line independently after trimming its
trailing whitespace — so each row lands on its own origin. Both mascots shear by
3.5 characters at stage 0, and the bird shears by 6 at stage 4, which means the
frame shown for reaching the goal is the most broken one in the set. The art
data is correct; only the renderer is wrong.

Separately, the goal slider cannot represent the goal. It steps by 50, so a goal
of 421 — set from the command line, which the engine accepts — collapses to 400
or 450 the moment the slider is touched. Its ceiling of 3000 is invented by the
panel; the engine requires only a positive integer. The control is narrower than
the setting it edits, and it silently destroys values it cannot express.

## What Changes

- Render the panel art on a fixed canvas exactly `cols` characters wide, left
  aligned inside it and centred as a block, so every row shares one origin and
  the model's grid survives to the screen.
- Keep the snail's travel. Its ink grows from 9 to 21 columns across stages, so
  a block sized to its own ink would re-centre at every stage and the snail
  would never appear to move. The canvas width comes from `mascotSet.cols`,
  which the model already publishes, not from the text.
- Fix the same trailing-trim bug in the bar, where it is quieter: with
  `showNumbers: false`, or on a vertical bar, the label is the bare face and the
  mood suffix is a space for idle and writing but `z` or `!` otherwise, so the
  critter twitches sideways by a character whenever it falls asleep or wakes.
- **BREAKING (spec-level):** replace the goal slider with the Ui kit's
  `NumberField`, which accepts a typed value. This reverses the panel's standing
  rule that no control may send a freely typed value.
- Block the panel's key catcher while the field has focus, which the kit
  documents as the required pairing, and make Escape leave the field before it
  closes the panel.
- Bound the field at the engine's own bound — a positive integer — rather than
  at a ceiling the panel invents.
- Rewrite the header comment in `Panel.qml` that asserts there is no text input
  anywhere, and the postmortem note that rests on it.

## Capabilities

### New Capabilities

None. Both halves of this change modify behaviour that existing specs already
cover.

### Modified Capabilities

- `critter-widget`: rendering currently guarantees the art's dimensions in the
  model only. Add the guarantee that the rendered art preserves that grid, so
  the alignment bug is a spec violation rather than an unnoticed regression.
- `panel-configuration`: "Every committed value is chosen from a presented set"
  forbids text input outright and states that the key catcher needs no blocking.
  Both stop being true. "A continuous control commits once, on release" is
  written around the slider that is being removed.

## Impact

- `Panel.qml` — the art `Text` becomes a sized, left-aligned block; the goal
  slider becomes a `NumberField`; the key catcher gains a `blocked` binding; the
  header comment loses its no-text-input claim.
- `BarWidget.qml` — the label gains a stable width so the face cannot shift with
  mood.
- `Model.js` — no change to the art data. It is already correct, and this change
  is careful not to "fix" it.
- `docs/POSTMORTEM-ORPHANED-READ.md` — records why a text field is admissible
  now: none of the crash's four conditions was a text field, and the one hazard
  it does reintroduce, an unblocked key catcher, has a documented pairing.
- `README.md` — the goal is now typed, not dragged.
- Tests — model tests cannot see a rendering bug, which is why this one shipped.
  The grid check moves to where it can fail: an assertion over the geometry the
  panel computes, not only over the strings the model returns.
- No change to the engine, the config file, the state file, or the security
  boundary. The panel still writes nothing; `set-goal` is the same subcommand it
  already invokes.
