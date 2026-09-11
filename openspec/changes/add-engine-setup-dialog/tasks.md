## 1. The outcome vocabulary, in testable form

- [x] 1.1 Add a per-action outcome sentence for install, update, start, restart and uninstall, saying what the user asked for rather than one generic "done"
- [x] 1.2 Make the uninstall outcome state what was removed and what was kept, so the review's promise about settings and history is confirmed afterwards
- [x] 1.3 Fold the existing failure reporting into the same outcome record: failing step, sanitized reason, rollback notice, and the copyable bundled-engine command
- [x] 1.4 Add the predicate that decides whether the setup card is shown, taking the pending outcome into account without teaching `serviceNeedsSetup` that a ready engine needs setup
- [x] 1.5 Add the rule that a status probe neither produces nor clears an outcome
- [x] 1.6 Join the existing disclosure lines into the single message string a modal takes, without changing their wording
- [x] 1.7 Test every outcome sentence, the dismissal rules, the probe rule, the visibility predicate, and that no outcome exists for an action that was never run

## 2. Outcome state in the singleton

- [x] 2.1 Add the outcome record to `Control.qml`: the action that finished, whether it succeeded, the sentence, and whether it has been acknowledged (represented by clearing the record on dismiss, rather than a flag that would need keeping in step)
- [x] 2.2 Set it when a service action settles and leave it untouched when a status probe settles
- [x] 2.3 Replace an unacknowledged outcome when a new action settles rather than queueing or dropping the new one
- [x] 2.4 Add a dismiss that clears it for every panel at once
- [x] 2.5 Keep `serviceFailedAction` and `serviceFailureReason` working for anything still reading them, or remove them and update every reader in the same step

## 3. The review becomes a modal

- [x] 3.1 Add the shell's `ConfirmDialog` to the panel, configured as `Menu.qml` configures it, with colours threaded from the panel and a `z` above the content
- [x] 3.2 Bind its `opened` to the singleton's pending confirmation so a review opened on one screen is not left stranded on another
- [x] 3.3 Feed it the joined disclosure, the per-action title, and the per-action confirm label already produced by the model
- [x] 3.4 Wire `onConfirmed` and `onCanceled` to the singleton, and verify cancel still performs no file, unit or service operation
- [x] 3.5 While the review is open, block `PanelKeyCatcher` and give the dialog focus with a `Keys` handler that calls `handleKey`, returning focus to the catcher on close, so Escape dismisses the review without also closing the panel (the catcher has no pre-dispatch hook; see design decision 6)
- [x] 3.6 Remove the inline review block and its buttons, keeping the state-specific headline and the direct start/restart repairs in the card

## 4. The card reports the outcome

- [x] 4.1 Render the outcome with a dismiss control, distinguishing success from failure without relying on colour alone
- [x] 4.2 Add the outcome to the card's visibility so a successful action no longer makes the card disappear
- [x] 4.3 Keep the in-flight line but give it enough weight to be noticed, and make it correct when the panel is reopened mid-action
- [x] 4.4 Keep the rollback notice and the copyable terminal command reachable from a failure outcome
- [x] 4.5 Verify the settings below remain operable throughout, and that a failure still leaves the rest of the panel working

## 5. Safeguards and documentation

- [x] 5.1 Confirm the lifecycle linter still passes unchanged and that the dialog introduces no process, timer or file read into the per-screen subtree
- [x] 5.2 Confirm the security guard still reports one executable for the shell and the same engine subprocess vocabulary
- [x] 5.3 Update the README's setup walkthrough to show the review as a modal and to describe what is said after an action completes
- [x] 5.4 Check that no README or spec claim about the inline review survives the change

## 6. Verification

- [x] 6.1 Run all Python and JavaScript tests, the QML lifecycle lint, the security guard, `qmllint`, strict OpenSpec validation, and `omarchy plugin validate`
- [ ] 6.2 In a live bar, drive install, update, start, restart and uninstall and confirm each states its outcome and holds it until dismissed
- [ ] 6.3 Confirm the review is dismissible with Escape, keyboard-navigable, and that the panel stays open when it is dismissed
- [ ] 6.4 Confirm the dialog renders without clipping on a narrow bar, a small screen, and a proportional theme, including with a long home directory path in the disclosure
- [ ] 6.5 Confirm an action started with the panel closed, and an action completing with panels open on two screens, both report the same outcome and dismiss together
- [ ] 6.6 Confirm a status refresh after an action leaves the outcome on screen
