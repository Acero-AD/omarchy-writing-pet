## Why

Setup succeeds silently. When an install, update, start or restart completes,
the panel's setup card stops being applicable and its `visible` binding goes
false, so the card simply disappears — the one case with no feedback at all is
the case that worked. A failure, by contrast, is stated plainly and stays on
screen. The only confirmation of success is the ENGINE line changing a second
later and the critter waking up, which is indirect, delayed, and easy to miss
on a bar that is already moving.

The review before an install is also a quiet inline block in an already busy
panel. Every other Omarchy plugin that is about to do something irreversible
asks in a modal — the menu plugin before uninstalling, the clipboard plugin
before clearing — so a disclosure that names two destinations and a service is
presented with less weight here than "clear your clipboard history" is
elsewhere.

## What Changes

- Move the install, update and uninstall review into a modal confirmation,
  using the shell's own `ConfirmDialog` so the plugin asks the way the rest of
  Omarchy asks and inherits its keyboard handling.
- State the outcome of every lifecycle action and keep it on screen until it is
  dismissed or replaced, so a successful setup confirms itself instead of
  vanishing.
- Make the in-flight state prominent rather than a single dim line, and keep it
  legible when the panel is reopened during an action.
- Carry the outcome in the singleton rather than the panel, so closing the
  panel mid-action, or opening it on another monitor, does not lose it.
- Retain the copyable terminal command and the rollback notice on failure, and
  retain the disclosure's exact wording — this changes where it is shown and
  what happens afterwards, not what is promised.

## Capabilities

### New Capabilities

<!-- none: this changes how an existing capability presents itself -->

### Modified Capabilities

- `engine-setup`: the disclosure before an installation becomes a modal
  confirmation rather than an inline block, and every lifecycle action gains a
  stated outcome that persists until dismissed. The set of effects disclosed,
  the actions offered per state, and the guarantee that nothing happens before
  confirmation are unchanged.

## Impact

- Affected runtime code: `Panel.qml` (the setup card and a new dialog),
  `Control.qml` (outcome state that outlives a panel), `Model.js` (the
  outcome's wording and dismissal rules).
- Affected safeguards and tests: `tests/model.test.mjs` for the outcome
  vocabulary; `scripts/qml-lifecycle-lint.py` continues to apply unchanged —
  a dialog owns no process and no async work, so it may live in the per-screen
  subtree.
- Affected documentation: the README's setup walkthrough shows the review as a
  modal.
- No change to `bin/writing-critter`: its stdout contract stays exactly one
  JSON object per invocation, and no new subprocess, privilege, network or
  file operation is introduced.
