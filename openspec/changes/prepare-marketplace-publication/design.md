## Context

The exploration on 2026-09-09 found a public repository with a valid root
manifest, an MIT license, executable setup wrappers, and passing local checks
and published CI. The manifest and bundled engine both identify version
`0.1.0`; the permanent plugin ID is
`io.github.acero-ad.writing-critter`. No matching listing, retired ID, or
submission mentioning the repository was found at that time. Availability
must be checked again when submitting.

The README already explains the separate counting engine, explicit setup,
user service, and removal order. It lacks a concise prerequisites section and
an actual preview, still marks the stability run as pending, and contains
stale claims and a broken OpenSpec link. `add-engine-setup-dialog` owns the
unfinished modal review and persistent action feedback.

This design defines when the repository is ready to offer to reviewers.
Marketplace admission remains an external decision. References checked during
exploration are the [publishing guide](https://plugins.omarchy.org/publish.html),
[submission guide](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SUBMISSION.md),
[security policy](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SECURITY.md),
and [verification guide](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/VERIFICATION.md).

## Goals / Non-Goals

**Goals:**

- Make prerequisites and the complete install/update/remove experience easy
  to assess before installing.
- Present the actual release with a useful preview and traceable verification
  evidence.
- Prepare an issue body and publishing instructions that can be reviewed and
  used without reconstructing this conversation.

**Non-Goals:**

- Changing counting, file formats, engine privileges, or runtime packaging.
- Reimplementing tasks from `add-engine-setup-dialog`.
- Building publishing automation, a new test framework, or a marketplace fork.
- Creating a public issue or claiming marketplace verification during this
  preparation change.

## Decisions

### 1. Keep reader documentation and release operations in separate files

| File | Responsibility |
|---|---|
| `README.md` | Preview, prerequisites, usage, lifecycle instructions, concise verified status |
| `preview.png` | Real bar and panel capture using demonstration data |
| `docs/RELEASE-VERIFICATION.md` | Tested revision, environment, observations, results, outstanding limitations |
| `docs/PUBLISHING.md` | Release checks, issue title, submission command, approval and update process |
| `docs/MARKETPLACE-SUBMISSION.md` | The six-section issue body, ready for owner review |

The README will list Omarchy Quattro/Quickshell, Python 3 with only standard
library modules, Hyprland with `hyprctl`, and an available systemd user
manager. Bash is needed for the optional terminal wrappers. Node.js and
`qmllint` belong under development tools. Report tested versions, including
the actual release environment; do not invent a minimum supported Python or
Omarchy version from a single successful run.

Preserve the existing lifecycle explanation and bring it into agreement with
the finished setup dialog. In particular, fix the instruction referring to
the "second button" as confirmation when the illustrated second button is
Cancel, correct the stale polling description against the engine defaults,
and repair the archived OpenSpec link. Describe the local validator as a
manifest/layout check and reserve capability results for the marketplace
scanner. Keep the crash postmortem accessible after the status is updated.

A larger release website or generated documentation would add maintenance
without improving this small plugin's submission.

### 2. Reuse the existing setup change before freezing the release

Documentation structure and the submission draft can be prepared immediately.
Final setup wording, preview capture, lifecycle exercises, and the stability
run follow the completed and verified `add-engine-setup-dialog` implementation.
The dependency is a release-order decision: successful setup should report
itself in the version shown to new users. It is not an upstream requirement
for a modal dialog and does not duplicate that change's tasks.

### 3. Make verification observable and bound to the code exercised

Use existing checks: Python and JavaScript suites, the security guard,
lifecycle lint, `omarchy plugin validate`, and `qmllint` with installed shell
imports. Record commands, results, tool versions, date, and the full tested
Git SHA. Historical README statements remain historical until reproduced.

Exercise a fresh installation with disposable demonstration documents and
without an existing engine masking missing setup. Cover setup cancellation,
confirmed setup, first configuration, counting, update/repair, engine removal
before plugin removal, and reinstall with settings/history retained. Use an
isolated account or an explicitly arranged test environment when reproducing
absence/removal would disturb the user's working installation. Do not reset
the user's writing data to create a fresh-install scenario.

For this first release, require at least 24 elapsed hours with two normal
writing sessions, an actual local midnight rollover, and suspend/resume.
Include deliberate engine and shell restarts and label them separately from
unexpected exits. Record start/end times, timezone, active use, observed
process continuity, relevant sanitized logs, and final counts/history. An
unchanged PID alone is not sufficient evidence. Unexpected shell exits,
unexplained engine restarts, or incorrect recovery/counting leave the gate
unfinished until investigated and the affected verification is repeated.

The 24-hour period is a project release criterion selected because of the
previous shell crash; it is not a marketplace rule. A short smoke test or
simulated date change does not complete it. Observation can span work sessions
while independent documentation work proceeds.

Record the tested code revision before committing the evidence. Resolve the
final publication SHA after documentation and assets are committed, so the
record does not attempt to contain its own commit hash. A reviewed diff
containing only documentation, planning files, or preview changes can retain
the live evidence; runtime changes require renewed affected checks and a new
stability run. A release gate remains pending when required evidence is absent.

### 4. Capture the product users will install

Capture the real release widget and open panel with a small demonstration
writing folder and readable progress. Exclude personal paths, document names,
and unrelated desktop content. Save a single root `preview.png`, verify that
it decodes and looks legible, and embed it with useful alt text in the README.

The marketplace accepts a preview optionally and optimizes it itself. Keep
the original under the documented input limits of 50 MB and 40 megapixels;
no generated card/detail variants are needed. A mockup would not establish
what the tested release actually looks like.

### 5. Prepare a reviewable submission without claiming it has been sent

Use title `[Plugin]: Writing Critter`, repository root
`https://github.com/Acero-AD/omarchy-writing-pet`, category `Productivity`,
and tags `bar, quickshell`. Recheck the current template at implementation
time. The body preserves its six headings and checklist wording; leave owner
declarations unchecked in the draft until confirmed. The publishing guide
explains that the final submitted body needs all required declarations true
and checked, and shows the `gh issue create --body-file` route to
`omacom/omarchy-plugin-marketplace` without executing it.

Maintainer notes describe the bundled Python engine, explicit in-panel
setup, the two installed files, one systemd user unit, offline unprivileged
operation, and engine-first removal. State that installer and service
management are expected review capabilities; only the real baseline report
can establish its outcome. Have maintainers assess any applicable setup label.

The guide covers responding on the existing issue, checking public repository
visibility and ID availability again, and resolving feedback against the
commit being offered. New publication uses a maintainer's
`approved-and-verified` decision after the relevant automated checks. Keep the
submission link and actual publication status separate from preparation status.

### 6. Keep release identity and future verification explicit

Retain the current ID. Documentation and a preview alone do not require a
version bump; if the setup release changes the version, keep manifest and
engine version declarations consistent. A tag or GitHub release is optional
and is not a prerequisite invented by this change.

The publishing guide explains that marketplace verification covers an exact
snapshot. Later source changes can show as `Update unverified`; offering a
newer commit uses the existing-listing verification/update form with its full
SHA. Ordinary Omarchy install/update commands currently fetch mutable upstream
code, so their result is not guaranteed to equal the reviewed snapshot.

## Risks / Trade-offs

- The live run takes longer than an editing session → record it as pending
  and complete independent preparation while observation continues.
- Runtime changes invalidate release evidence or screenshots → freeze the
  candidate after setup work and inspect the final diff before reusing evidence.
- External rules change → link authoritative sources and recheck the template
  and publishing process before submitting.
- The baseline reports additional capabilities → preserve the actual report
  and supply reviewer context; passing the local guard predicts no admission.
- A screenshot exposes personal writing metadata → use demonstration data
  and inspect the capture before committing it.

## Migration Plan

1. Prepare documentation and the issue draft alongside the existing setup work.
2. Complete the setup change, select the candidate, and run automated and live
   verification on its runtime content.
3. Capture the preview, record evidence, reconcile README claims, and review
   the resulting submission package.
4. Hand off the exact publication candidate and the concrete issue draft for
   the subsequent publishing action. Track external approval independently.

There is no data migration. Documentation and preview changes can be reverted
without changing installed engines or writing data. Any runtime defect found
during verification is fixed in the owning change and then reverified.

## Open Questions

No design decision blocks preparation. The actual release SHA, observed
versions, live-run results, capture, and marketplace report are evidence to
collect during implementation or publication; they are not assumed outcomes.
