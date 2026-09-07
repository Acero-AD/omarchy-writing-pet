## Context

The art is padded correctly and drawn wrongly. `Model.js` pads every row of a
frame to the mascot set's declared `cols`, and `tests/model.test.mjs:51` asserts
that width for every set, stage and mood. Those assertions were green while the
bug shipped, because the bug is entirely downstream of them: `Panel.qml:143`
draws the block as one `Text` with `horizontalAlignment: Text.AlignHCenter`, and
Qt centres each line independently *after* trimming its trailing whitespace. The
padding that carries the shape is discarded row by row.

Measured on the frames in the report:

| row (bird, stage 0, sleeping) | padded | Qt measures | leading | ink at |
|---|---|---|---|---|
| `  ,-""-.   ` | 11 | 8 | 2 | **+3.5** |
| ` /       \ ` | 11 | 10 | 1 | +1.5 |
| `\|  -   -  \|` | 11 | 11 | 0 | 0.0 |
| ` \  ___  / ` | 11 | 10 | 1 | +1.5 |
| `  '-----'  ` | 11 | 9 | 2 | +3.0 |

Feeding those offsets back reproduces both screenshots exactly, and the same
rule predicts a 6-character shear for the bird at stage 4 — the frame shown for
reaching the goal is the worst one in the set.

The goal control is a separate problem with a shared shape: a control that
cannot represent the value it edits. `PanelSlider` steps by 50 and stops at
3000. The engine requires only a positive integer (`bin/writing-critter:129`).
A goal of 421, which the engine accepts and the panel displays, cannot be
expressed by the control that edits it, so touching the slider destroys it.

The constraint that makes the second half interesting is not technical. The
panel's header comment and the `panel-configuration` spec both state that there
is no text input anywhere, and that the key catcher therefore needs no blocking.
That rule was written the day after the crash documented in
`docs/POSTMORTEM-ORPHANED-READ.md`, when the priority was shrinking surface
area. None of the crash's four conditions was a text field.

## Goals / Non-Goals

**Goals:**

- Every row of a frame begins at the same horizontal position on screen.
- The snail still appears to travel across its canvas.
- The bar face does not move when the mood changes, in any bar configuration.
- The goal can be set to any value the engine accepts, by typing it.
- The reversal of the no-text-input rule is recorded where the rule is stated,
  not left as a silent contradiction between comment, spec and code.
- Each fix lands with a guard that fails if it is reverted.

**Non-Goals:**

- Changing the art. `Model.js` is correct; this change is careful not to "fix"
  data that is already right.
- Keyboard navigation of the panel's controls. Every control there is mouse-only
  today; the field will be too. Not a regression, and not this change.
- Typed paths. The directory picker still browses, and `panel-configuration`
  still forbids a typed path. Only the goal becomes typable.
- Any change to the engine, the config file, the state file, or the security
  boundary.

## Decisions

### 1. The art canvas is sized from `cols`, not from the text

Left-alignment alone fixes the shear. It does not fix the block, and the block
is where the trap is. Ink width by stage:

| stage | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| bird | 11 | 11 | 10 | 10 | 11 |
| **snail** | **9** | **12** | **15** | **18** | **21** |

The snail is built to travel across a fixed 24-column canvas. A block sized to
its own ink re-centres at every stage, so the snail would never appear to move —
it would grow a longer tail in place. So the canvas width is taken from
`mascotSet.cols`, which the model already publishes for exactly this reason:

```
Item  (full panel width)
 └── Text
      anchors.horizontalCenter: parent.horizontalCenter
      width: root.mascotSet.cols * artMetrics.advanceWidth
      horizontalAlignment: Text.AlignLeft
 TextMetrics { id: artMetrics; font: art.font; text: "0" }
```

Note which half does the work. `AlignLeft` fixes the shear on its own and does
not depend on the metric being right; the computed width only decides where the
block sits. `wrapMode` defaults to `NoWrap` and `elide` to `ElideNone`, so an
under-measured width overflows rather than clipping or wrapping. The failure
mode of a bad metric is therefore a block a little off centre, never mangled
art.

*Alternatives considered.* A `Repeater` of per-row `Text` in fixed slots also
works and is more machinery for the same result. Padding with a character Qt
will not trim was rejected twice over: `QChar::isSpace()` covers `U+00A0`, so it
probably does not even work, and the test suite asserts ASCII-only content.

### 2. The bar drops the mood character when nothing follows it

Same root cause, quieter symptom, and `WidgetButton` makes it worse than a
shift: its `implicitWidth` is `label.implicitWidth + margins`, and that width is
trimmed too. So the widget itself resizes.

It only bites when the face is the whole label — a vertical bar, or
`showNumbers: false` — because `FX` is `" "` for idle and writing and `z` or `!`
otherwise:

```
  idle       | <(o o)>  |   trimmed 8
  sleeping   | <(- -)> z|   trimmed 10
```

With a centring, trimming renderer, the face holds still only if its whitespace
structure is identical across moods. Every frame template already satisfies
that: the eye strings are all three characters wide with no whitespace at their
edges. The mood character is the only thing that breaks it, and only when it is
last. So the mood character is dropped when nothing follows it, and kept
whenever the counter does.

This costs the `z` nudge in vertical bars and with the counter hidden. That is a
real loss and worth naming: the default configuration is horizontal with the
counter shown, where the counter follows the face and the `z` is unaffected.

The existing `idleNudge: false` path blanks the mood character to a space, which
is the same instability by another route; it becomes a drop rather than a blank.

### 3. Label composition moves into `Model.js`

`BarWidget.qml:62` composes the label inline, which is why the bar bug had no
test that could see it. It becomes `Model.barLabel(...)`, a pure function, and
gains assertions that would have failed before this change: the label never ends
in whitespace, and its length is constant across moods for a fixed set, stage
and configuration.

This is deliberately the opposite of the panel fix, where no such test exists.
The panel's invariant is asserted at `model.test.mjs:51` and was true throughout;
moving the guard is only possible where the logic can be made pure.

### 4. `NumberField`, from the kit

`qs.Ui` already exports `NumberField` — a `SpinBox` with `editable: true`, a
`label`, and a `modified(int)` signal. It is a swap, not a build, and it gives
both interactions: arrows to nudge, typing for an exact value.

Bounds: `from: 1`, matching the engine's only rule. There is no policy ceiling,
because the engine has none; `to` is set to the maximum of the control's own
`int` type. That is a limit of the widget, not a judgement about goals, and it
is recorded here so a later reader does not mistake it for one.

`stepSize: 10`. The arrows are for fine adjustment now that typing handles large
jumps; 50 was the step that could not represent 421 in the first place.

### 5. Committing is debounced, because a config write costs a rescan

`valueModified` fires per click and per auto-repeat. `Control.run` already
coalesces through a single-slot queue, but coalescing is not enough here: every
accepted `set-goal` rewrites the config file, and the engine reseeds its
baselines on a config change — a full scan of every watch path. Holding the
stepper would trigger a burst of rescans.

So `Control` gains a short debounce (~400 ms) used by the goal commit only;
other actions keep calling `run()` directly, because each of them is already one
deliberate click. The timer lives in `Control.qml`, which is a singleton and
cannot be destroyed mid-flight — the same reason the `Process` lives there.

### 6. The field resyncs from the engine, but never mid-edit

`value: Critter.Control.goal` is a declarative binding that user interaction
breaks: `SpinBox` assigns `value` imperatively when edited, so the binding stops
tracking and a later poll would not reach the field.

The fix is an explicit resync on `Control.goal` changing, guarded on the field
not having focus, plus an unconditional resync when focus is lost. That gives
both halves of the modified spec requirement: a change made in a terminal still
appears while the user is not typing, and a value the engine refuses is replaced
by the stored one as soon as the user leaves the field, rather than lingering as
a number the engine never took.

### 7. Blocking the key catcher, and getting back out of the field

`PanelKeyCatcher` sets `Keys.priority: Keys.BeforeItem`, so an unblocked catcher
swallows every keystroke and the field can never receive one. The kit documents
the pairing in its own header, and the clock panel already uses it. So:
`blocked: goalField.field.activeFocus`.

Blocking also means Escape stops reaching the catcher, so the panel could not be
dismissed from inside the field. Escape therefore releases the field's focus
first, and a second Escape closes the panel — the conventional two-step, and the
only way to keep the panel dismissable without leaving the catcher unblocked.

`NumberField` is a `Column`, so the handler goes on it and relies on the
unhandled key propagating up the focus chain from the `SpinBox`. That is the
one assumption here that reading cannot settle; it is verified in the harness,
and falls back to wrapping the field in a `FocusScope` if propagation does not
reach it.

### 8. Two new lint rules, because both bugs fail silently

`scripts/qml-lifecycle-lint.py` exists because each of the crash's contributing
conditions was individually defensible and review did not catch the combination.
Both bugs here have that shape.

- **Monospace text is never centre-aligned.** Qt discards trailing whitespace
  per line, so centring column-aligned art destroys its geometry. Exactly one
  site in the plugin is both monospace and centred today: the bug. After the fix
  the rule is clean, and it fails if anyone reverts it.
- **A file containing a focusable input must bind `blocked` on its
  `PanelKeyCatcher`.** This is the pairing the kit documents and that this
  codebase has already been bitten by once. It is vacuous today and becomes
  load-bearing with this change.

Both are probed in `tests/test_lint.py` with deliberate violations, as every
existing rule is, rather than trusted because a clean run is clean.

## Risks / Trade-offs

- **The `z` disappears in vertical bars and with the counter hidden.** → A named
  feature loss, not an oversight. Keeping it requires a blank glyph that is not
  whitespace, and the only candidates are non-ASCII, which the ASCII-only
  invariant forbids. The default configuration is unaffected.
- **`TextMetrics.advanceWidth` on a font that is not really monospace.** → If
  `monospace` resolves to a proportional family the art is already destroyed by
  the font, which `BarWidget.qml:146` documents. This adds no failure mode, and
  its own failure is a slightly off-centre block, not mangled art.
- **Escape propagation from the `SpinBox` may not reach the `NumberField`.** →
  Verified in the harness before the rest is wired; fallback is a `FocusScope`
  wrapper. Named in the tasks rather than assumed.
- **The debounce could drop a commit if the panel closes during it.** → The
  timer is in the singleton, so it survives the panel and still fires. This is
  why it is not in `Panel.qml`.
- **Reversing a rule written after a crash.** → The reversal is narrow and the
  reasoning is recorded in the postmortem: none of the four conditions was a
  text field, the write path is unchanged, and the one hazard it does reintroduce
  now has both a documented pairing and a linter rule. The panel still writes
  nothing.
- **The panel fix has no unit test.** → Stated plainly rather than papered over.
  The model assertion that should have caught it was already passing; the guard
  that can fail is the lint rule, which is why one is added.

## Migration Plan

No data or config migration. `set-goal` is the same subcommand the panel already
invokes, and an existing goal that the old slider could not express — 421 —
starts being editable rather than needing repair.

Both QML singletons are cached per engine, so `Control.qml` changes need a full
shell restart, not a plugin reload. `README.md` already documents this.

Rollback is a revert: no persisted state changes shape.

## Open Questions

Three choices from exploration are decided here rather than left open, because
each is a one-line change if the feel is wrong in use:

- `stepSize: 10` for the stepper arrows.
- Escape releases the field before closing the panel, rather than closing
  straight through.
- The mood character is dropped, not relocated, when the face is the whole label.

Genuinely open: whether `set-poll` should get the same treatment. It has the
same shape — a bounded integer the panel cannot currently set at all — but it is
out of scope here and worth its own decision.
