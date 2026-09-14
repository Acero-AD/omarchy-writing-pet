## Context

The panel gained an engine setup card in `2026-09-08-add-in-panel-engine-setup`.
It works, and it was driven by hand in a live bar. Two things about it are
wrong in the same direction: they under-report.

The card's `visible` binding is `needsSetup || failed || busy`. A successful
action makes all three false, so the card disappears at the exact moment it
should say "that worked". `Model.serviceNeedsSetup` returns false only for
`ready`, which is precisely the state a successful install produces. So the
disappearance is not a bug in a binding — it is the state machine working, with
nothing downstream of success to speak for it.

The review before an install is an inline `Column` in a panel that already
holds a critter, a count, a meter, a status line, today's breakdown, recent
days, and every setting. It is the most consequential thing on that surface and
it looks like the least.

The shell offers `ConfirmDialog` in `qs.Ui`, and its own plugins use it for
exactly this: `plugins/menu/Menu.qml` before uninstalling a plugin,
`plugins/clipboard/Clipboard.qml` before clearing history. It draws a scrim
over its parent, centres a bordered card, and exposes `message`, `cancelText`,
`confirmText`, `confirmed()`, `canceled()`, and a `handleKey(event)` the host
calls from its own key handler before its own Escape handling.

The lifecycle rules are not under pressure here. A dialog owns no process, no
file read and no timer; it is a rendered `Item`. It may live in the per-screen
panel subtree, unlike the `Process` in `Control.qml`.

## Goals / Non-Goals

**Goals:**

- Make a successful lifecycle action say so, and keep saying so until the user
  acknowledges it or another action replaces it.
- Present the pre-install disclosure with the weight the rest of Omarchy gives
  a comparable decision.
- Keep the outcome alive across a panel close, a panel reopen, and a second
  monitor.
- Keep the disclosure's promises, the per-state actions, and the
  nothing-happens-before-confirmation guarantee exactly as they are.

**Non-Goals:**

- Changing `bin/writing-critter` at all. Its stdout stays one JSON object per
  invocation.
- Step-by-step progress from the engine. Actions take 0.4-1.5s measured, and
  narrating four systemd calls inside that would complicate a contract for
  something a person barely sees.
- A notification, a toast, or anything outside the plugin's own surfaces. The
  shell's allowlist permits this plugin one executable and it is not
  `notify-send`.
- Any new decision about what setup does. This change is about reporting.

## Decisions

### 1. The shell's `ConfirmDialog` for the review, not a plugin dialog

`ConfirmDialog` is used verbatim, configured the way `Menu.qml` configures it:
`anchors.fill: parent`, `opened` bound to the singleton's pending confirmation,
`z` above the content, colours threaded from the panel, `onConfirmed` and
`onCanceled` calling `Control`.

Writing a plugin-owned dialog was rejected. The value here is that the plugin
asks the way Omarchy asks — same scrim, same card, same key behaviour, and the
same behaviour when a theme changes it. A near-copy would drift.

The disclosure lines already come from `Model.serviceDisclosure`, which returns
an array. `ConfirmDialog.message` is a single string, so the array is joined
with newlines and a leading marker per line. The wording does not change; only
its container does.

Reading the component during implementation showed it was built for a
one-sentence question, and three things had to change to carry a disclosure.
Each is measured against the real component rather than assumed:

- **Paths wrap.** The message is `Style.font.title` (14px) with `WordWrap`,
  which never breaks inside a word, in a card `min(panel - 32, 370)` wide —
  about 30 monospace characters a line in this panel. The unit path was a
  61-character token with no space in it and ran past the card's border. A
  zero-width space after each `/` gives `WordWrap` a place to break, and a
  leading `$HOME` is shown as `~` only when the path genuinely starts there, so
  a custom `XDG_CONFIG_HOME` is still named in full. Longest unbreakable run:
  23 characters.
- **Confirm labels are one word.** The buttons are a fixed `Style.space(88)`
  wide with no elide, at caption size. "Update and restart" is 18 characters
  and overran its own border in the default monospace family; "Install",
  "Update" and "Remove" fit. The question above says what will happen.
- **Cancel is pre-selected.** `ConfirmDialog` defaults to its confirm button,
  which suits the menu plugin's "Uninstall" but would let one stray Enter, in
  the instant the review appears, install an engine. It also does not reset its
  selection between openings, so the panel resets it each time.

### 2. Progress and the outcome do NOT go in the dialog

`ConfirmDialog` is a fixed two-button message dialog. It has no third state, no
place for a spinner, and no dismiss-only mode. Bending it into a progress host
would mean either a second component that merely looks like it, or a fork.

So the flow is: the dialog asks, the dialog closes on confirm, and the card
below it carries the action through to its outcome. That also matches how long
each phase lasts — the question is open until a person answers it, the work is
under a second, and the outcome should persist until acknowledged.

A plugin-owned modal for the progress phase was rejected on the same grounds
that make a 0.4-1.5s modal a bad idea generally: it would appear and vanish
faster than it could be read, and a modal that flashes teaches people to
dismiss modals.

### 3. The outcome lives in `Control`, not in the panel

A new outcome record in the singleton: the action that finished, whether it
succeeded, the sentence to show, and whether it has been acknowledged. The
panel renders it and offers a dismiss.

It cannot live in the panel. The bar builds one panel per screen; a user who
starts an install and closes the panel, or who has the panel open on a second
monitor, must not get a different answer from each. This is the same reason
`pendingConfirm` is already in the singleton.

The outcome is set when a service action settles, cleared when the user
dismisses it, and replaced when the next action settles. It is not cleared by
the status probe that follows an action — a probe is not an outcome, and
letting it clear one would make the confirmation flicker away on its own.

### 4. Success is stated in terms of what the user asked for

`Model` gains an outcome sentence per action rather than one generic "done":
installing says the engine is installed and running, an update says it was
replaced and restarted, a start says it is running, an uninstall says what was
removed and what was kept. The last is the one that most needs saying, because
"your settings and history are still here" is a promise made in the review that
nothing currently confirms afterwards.

The failure path keeps everything it has: the failing step's sentence, the
rollback notice, and the copyable bundled-engine command. Those become part of
the same outcome record rather than three separate bindings, so failure and
success are shown by one mechanism.

### 5. The card stays visible while an outcome is unacknowledged

`visible` gains the outcome: `needsSetup || busy || outcome pending`. That is
the whole fix for the disappearing card, and it is deliberately a fourth term
rather than a change to `serviceNeedsSetup` — `ready` genuinely does not need
setup, and teaching that function to lie would break the state machine the
panel's actions are chosen from.

### 6. The dialog takes the keyboard while it is open

`Menu.qml` and `Clipboard.qml` call `dialog.handleKey(event)` first from their
own hand-written key-catching `Item`. This panel uses the shell's
`PanelKeyCatcher` instead, which consumes Escape itself at `Keys.BeforeItem`
priority and has no hook to call something first — found when implementing,
by reading it; an earlier draft of this decision assumed one.

The equivalent here uses the mechanism the catcher does offer. While the
dialog is open the catcher is `blocked`, so it forwards every key instead of
acting on it; the dialog takes active focus and routes keys to `handleKey`
through its own attached `Keys.onPressed`; when it closes, focus returns to the
catcher. Escape therefore cancels the dialog and is consumed there, so the
same keystroke cannot also close the panel. It is the pattern the goal field
already uses to keep the catcher from swallowing its keys.

The lifecycle linter requires a `blocked` binding that ends in `activeFocus`
wherever a focusable input exists, so the dialog's term goes first:
`blocked: <dialog open> || goalField.field.activeFocus`.

### 7. What the tests can and cannot reach

Quickshell links its QML plugin into the `quickshell` binary, so nothing
importing Quickshell can be instantiated by `qmltestrunner` and `Panel.qml`
cannot be tested as `Panel.qml`. The wording, the per-action outcome sentences,
the dismissal rules and the visibility predicate therefore live in `Model.js`
as pure functions and are covered by `node --test`. What is left in QML is the
wiring, and that is verified by driving it in a live bar.

## Risks / Trade-offs

- **A modal in a panel that is itself a popup** → `ConfirmDialog` fills its
  parent and scrims it, which is what the menu plugin already does inside its
  own card; verify on a narrow bar and a small screen that the dialog is not
  clipped, since its card is `min(parent.width - 32, 370)`.
- **An outcome that outlives its relevance** → it is replaced by the next
  action and dismissible by the user, and it names the action it describes, so
  a stale one is identifiable rather than merely wrong.
- **Two panels showing the same outcome twice** → it is singleton state, so
  both show the same record and dismissing on either dismisses both. That is
  the intended behaviour, and worth confirming on two monitors.
- **The dialog's message is a joined string** → this was worse than "awkward":
  measured, both paths overflowed the card, because `WordWrap` cannot break a
  path. Resolved in decision 1 with break points and `~`; a test bounds the
  longest unbreakable run for a long `$HOME`. The live check still matters,
  because only rendering shows what the font actually does.
- **Escape now has three meanings in the panel** (dismiss dialog, release the
  goal field, close the panel) → the order is fixed and tested by hand; the
  dialog is modal, so it is unambiguous while open.

## Migration Plan

1. Add the outcome vocabulary and predicates to `Model.js` with tests, changing
   no QML.
2. Add the outcome record to `Control.qml` and set it when an action settles.
3. Move the review into `ConfirmDialog` and wire its key handling.
4. Render the outcome in the card and add the dismiss.
5. Update the README's setup walkthrough.
6. Drive every state in a live bar, including on a second monitor.

There is nothing to roll back but the commit. No file format, no CLI contract
and no on-disk state changes, so an older panel and a newer engine — or the
reverse — behave exactly as they do today.

## Open Questions

Whether the outcome should also be reachable from the bar widget's tooltip
after the panel is closed. It would help someone who installs and immediately
looks away, but the tooltip is currently a pure function of published state and
adding an acknowledgement-scoped value to it is a larger change than this one.
Deferred rather than decided.
