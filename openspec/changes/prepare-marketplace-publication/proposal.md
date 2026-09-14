## Why

Writing Critter already has a public repository, a valid plugin manifest, a
license, working installation and removal, and passing automated checks, but
its README still records unfinished release verification and no marketplace
preview. Preparing the first marketplace submission needs explicit runtime
prerequisites, evidence for the release being offered, and a submission that
explains the separate engine service to reviewers.

## What Changes

- Document runtime prerequisites and tested versions separately from
  development tools; correct stale links, setup wording, and the attribution
  of marketplace capability detection in the README.
- Add a real root `preview.png` showing the release's bar widget and panel
  using demonstration writing data, and display it in the README.
- Add a repeatable release-verification record covering existing automated
  checks, a fresh installation and removal, and an observed stability run.
  Resolve the current pre-release warning only when the recorded evidence
  supports it.
- Prepare a marketplace issue body and a publishing guide with the chosen
  category and tags, engine setup and removal notes, the maintainer-review
  path, and the process for publishing later commits.
- Keep the permanent plugin ID and current version unless release content
  actually requires a version change. A GitHub release or tag is optional.
- Sequence final screenshots and live verification after
  `add-engine-setup-dialog`; its implementation remains in that existing
  change. This is the project's release sequence, not a marketplace rule.

## Capabilities

### New Capabilities

- `marketplace-publication`: Repository documentation, preview assets,
  release evidence, and a reviewable submission package for initial
  marketplace publication and later updates.

### Modified Capabilities

None. The engine and widget contracts remain unchanged; the setup-dialog
requirements are already owned by `add-engine-setup-dialog`.

## Impact

- Updates `README.md`; adds `preview.png`, `docs/RELEASE-VERIFICATION.md`,
  `docs/PUBLISHING.md`, and `docs/MARKETPLACE-SUBMISSION.md` during
  implementation.
- Uses the existing Python and JavaScript suites, QML lint, lifecycle lint,
  security guard, and Omarchy validator. Adds no runtime dependencies or
  documentation-only test framework.
- Requires a representative Omarchy desktop for release verification and
  screenshot capture; the full observation period cannot be replaced by unit
  tests or historical README claims.
- Produces a repository ready for submission. Creating the public issue,
  obtaining marketplace maintainer approval, and deployment are subsequent
  publishing actions, not side effects of preparing these artifacts.
