## 1. Verify the assumptions before building on them

- [x] 1.1 Reproduce the shear in the harness with the current `Panel.qml`, and capture the per-row ink offsets so the fix has a measured before, not just an argument
- [x] 1.2 Confirm in the harness that `Text.AlignLeft` alone removes the shear, and that the snail then re-centres per stage — the trap decision 1 is built around
- [x] 1.3 Confirm `Escape` pressed inside a focused `NumberField` propagates up to a handler on the `NumberField` itself; if it does not, note that the `FocusScope` fallback from decision 7 is needed

## 2. Panel art canvas

- [x] 2.1 Wrap the art `Text` in a full-width `Item` and centre the `Text` inside it
- [x] 2.2 Switch the art `Text` to `horizontalAlignment: Text.AlignLeft`
- [x] 2.3 Add a `TextMetrics` bound to the art font and set the art width to `mascotSet.cols * advanceWidth`
- [x] 2.4 Replace the header comment on the art block so it records why the block is left-aligned inside a sized canvas, alongside the existing note about `lineHeight`
- [x] 2.5 Verify in the harness: every row shares an origin for both mascots at all five stages and all four moods, and the snail still travels

## 3. Bar face stability

- [x] 3.1 Add `barLabel` to `Model.js` composing the bar label from face, counter, orientation and `showNumbers`, dropping the mood character when nothing follows it
- [x] 3.2 Fold the existing `idleNudge: false` blanking into `barLabel` as a drop rather than a blank
- [x] 3.3 Export `barLabel` through both the QML and CommonJS paths
- [x] 3.4 Replace the inline `label` composition in `BarWidget.qml` with the call to `Model.barLabel`
- [x] 3.5 Add model tests: the label never ends in whitespace, and its length is constant across moods for a fixed set, stage and configuration
- [x] 3.6 Confirm those tests fail against the pre-change composition before landing the fix

## 4. Goal input

- [x] 4.1 Replace `PanelSlider` with `NumberField`, with `from: 1`, `to` at the control's integer maximum, and `stepSize: 10`
- [x] 4.2 Remove the hand-drawn `goal ... words/day` `Text` in favour of the field's own `label`
- [x] 4.3 Commit through the debounce rather than directly from `modified`
- [x] 4.4 Add the resync: on `Control.goal` changing while the field is unfocused, and unconditionally on focus loss
- [x] 4.5 Verify a value the engine refuses leaves the field showing the stored goal, with the failure reported as it already is for other actions

## 5. Debounced commit in Control

- [x] 5.1 Add a debounce timer to `Control.qml` holding one pending goal commit, firing after roughly 400 ms of quiet
- [x] 5.2 Route only the goal through it; leave every other action calling `run()` directly
- [x] 5.3 Verify by holding the stepper through many values that the engine is invoked once, on the settled value, and that no baseline reseed storm occurs

## 6. Key catcher

- [x] 6.1 Bind `blocked: goalField.field.activeFocus` on the panel's `PanelKeyCatcher`
- [x] 6.2 Handle `Escape` so it releases the field's focus, leaving a second press to close the panel
- [x] 6.3 Verify typing reaches the field, that the catcher's own bindings do not fire while it is focused, and that they resume on focus loss

## 7. Lint rules

- [x] 7.1 Add the rule that a `Text` with `font.family: "monospace"` must not use `Text.AlignHCenter`, with a message naming the trailing-whitespace trim as the reason
- [x] 7.2 Add the rule that a file declaring a focusable input must bind `blocked` on its `PanelKeyCatcher`
- [x] 7.3 Probe both rules in `tests/test_lint.py` with deliberate violations, matching how every existing rule is covered
- [x] 7.4 Confirm rule 7.1 flags the current `Panel.qml` before the fix and is clean after

## 8. Documentation and the reversed rule

- [x] 8.1 Rewrite the `Panel.qml` header comment that asserts there is no text input and that the key catcher needs no blocking
- [x] 8.2 Add a section to `docs/POSTMORTEM-ORPHANED-READ.md` recording why a text field is admissible: none of the four conditions was a text field, the write path is unchanged, and the one reintroduced hazard now has a documented pairing and a lint rule
- [x] 8.3 Update `README.md` where it describes setting the goal by dragging
- [x] 8.4 Check `docs/` and `README.md` for any other claim that the panel contains no text input

## 9. Checks and live verification

- [x] 9.1 Run the Python tests, the model tests, the lifecycle lint and the security guard
- [x] 9.2 Install to the live shell with `install.sh` and restart the shell, since both singletons are cached per engine
- [x] 9.3 Verify against the two reported frames specifically: bird stage 0 sleeping and snail stage 0 sleeping, plus bird stage 4 celebrating, which shears worst
- [x] 9.4 Verify the bar in all four configurations: horizontal with and without the counter, and vertical with and without it
- [x] 9.5 Set the goal to 421 by typing it, confirm it round-trips through the engine unchanged, and confirm the panel reflects a change made from a terminal
- [x] 9.6 Human gate: confirm with the user that both mascots now look right and the goal is settable
