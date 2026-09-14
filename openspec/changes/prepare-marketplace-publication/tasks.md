## 1. Prerequisites and documentation cleanup

- [x] 1.1 Add a README prerequisites section distinguishing runtime dependencies, optional Bash wrappers, development tools, and tested versions without claiming an unverified minimum version
- [x] 1.2 Correct the validator/capability attribution, archived OpenSpec link, stale polling explanation, and misleading setup confirmation wording; preserve the crash postmortem link
- [x] 1.3 Create `docs/RELEASE-VERIFICATION.md` with fields for tested revision, environment, commands/results, lifecycle observations, stability timestamps, and explicitly pending evidence

## 2. Submission materials that can be prepared independently

- [x] 2.1 Recheck the authoritative marketplace submission, security, and verification guides and record their links and check date in `docs/PUBLISHING.md`
- [x] 2.2 Create `docs/MARKETPLACE-SUBMISSION.md` using the current six-heading issue format, the repository root, Productivity category, and Bar/Quickshell tags; preserve the declaration wording and leave unconfirmed declarations unchecked
- [x] 2.3 Write concrete maintainer notes covering in-panel setup, the bundled Python engine, installed engine/unit paths, user-only service management, retained data, and engine-first removal; distinguish expected capabilities from actual scan results
- [x] 2.4 Document the issue title and submission command, visibility/ID/duplicate checks, owner review, feedback handling, maintainer approval, publication confirmation, and later snapshot updates without executing a submission

## 3. Release candidate integration

- [x] 3.1 Verify that `add-engine-setup-dialog` is implemented and its live checks are complete before final interface documentation, capture, and live release verification; keep its implementation tasks in the existing change
- [x] 3.2 Reconcile the README setup/update/removal walkthrough with the finished interface and verify its buttons, success feedback, commands, and linked paths
- [x] 3.3 Select and record the full candidate SHA and actual Omarchy, Quickshell, Python, and systemd versions; confirm the permanent plugin ID and agreement between manifest/engine versions

## 4. Automated and fresh-install verification

- [x] 4.1 Run the existing Python and JavaScript suites, security guard, lifecycle lint, Omarchy validator, and QML lint against the candidate; record results and corresponding published CI evidence when available
- [ ] 4.2 Arrange a fresh-install environment with disposable writing documents without resetting the user's working installation or real writing data; exercise cancellation, confirmed setup, initial configuration, and counting
- [ ] 4.3 Exercise update/repair, engine removal followed by plugin removal, and reinstall with settings/history preserved; record actual outcomes and leave unexecuted scenarios pending

## 5. Live stability evidence

- [x] 5.1 Start the candidate's stability record with timestamp, timezone, shell/engine identities, baseline counts/history, and a plan for at least 24 elapsed hours; keep independent documentation work available during observation
- [ ] 5.2 Record two normal writing sessions and an actual local midnight rollover, checking the resulting count and retained history
- [ ] 5.3 Exercise suspend/resume and deliberate engine/shell restarts, distinguishing those transitions from unexpected exits and checking recovery
- [ ] 5.4 After at least 24 elapsed hours, record the end time and inspect continuity, relevant sanitized logs, recovery, and counts/history; investigate any failure before completing this gate and repeat verification after runtime fixes
- [ ] 5.5 Update the README verification summary and pending stability warning only to the extent supported by the completed record; keep limitations explicit

## 6. Marketplace preview

- [ ] 6.1 Capture the final bar critter and open panel using demonstration data and save a single root `preview.png` without personal writing metadata or unrelated desktop content
- [ ] 6.2 Inspect the image for accurate rendering and legibility, verify it decodes and fits current marketplace input limits, and embed it in the README with descriptive alt text

## 7. Final review and publishing handoff

- [ ] 7.1 Review the candidate-to-final diff and relate the publication revision to the tested runtime; retain evidence only for documentation/planning/preview-only differences and renew affected checks plus the stability run after runtime changes
- [ ] 7.2 Check documentation links, prerequisite accuracy, preview rendering, manifest/engine identity, and submission format; confirm actual checks are recorded and no preparation status is presented as marketplace approval
- [ ] 7.3 Run strict OpenSpec validation and present the completed release evidence, remaining owner declarations, and concrete submission package for the subsequent publishing action; do not create a public issue as part of this preparation change
