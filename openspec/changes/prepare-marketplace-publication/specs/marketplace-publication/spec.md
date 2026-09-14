## ADDED Requirements

### Requirement: Installation prerequisites and lifecycle are documented
The root README SHALL identify the runtime dependencies and tested environment
separately from development tools. It MUST explain adding the widget, explicit
engine setup, initial writing configuration, updating both parts, and removing
the engine before the plugin while retaining writing data. Its instructions,
button names, links, and behavioral claims MUST agree with the release offered
for publication. Unverified minimum supported versions MUST NOT be asserted.

#### Scenario: A new user checks prerequisites
- **WHEN** a reader prepares to install from the README
- **THEN** they can identify Omarchy Quattro/Quickshell, Python 3 with standard-library-only engine dependencies, Hyprland with `hyprctl`, an available systemd user manager, and Bash for optional wrappers
- **AND** development-only tools are distinguishable from runtime requirements

#### Scenario: A user follows the lifecycle instructions
- **WHEN** the documented install, update, and removal steps are exercised on the release candidate
- **THEN** confirmation labels match the actual interface, the engine setup is explicit, both update steps are explained, and engine-first removal preserves settings and history

### Requirement: Publication uses the existing plugin identity and final interface
The publication package SHALL retain
`io.github.acero-ad.writing-critter` as its permanent ID. Final interface
documentation, preview capture, and live release verification SHALL follow
the completed and verified `add-engine-setup-dialog` implementation without
duplicating its tasks. This release sequence MUST NOT be described as an
upstream requirement. Manifest and engine version declarations MUST agree
for the selected release.

#### Scenario: Preparation starts while setup work is unfinished
- **WHEN** prerequisite documentation and the issue draft are prepared
- **THEN** that work can proceed while final interface evidence remains pending until the existing setup change is verified

#### Scenario: Packaging changes without a new runtime version
- **WHEN** only release documentation and preview assets change
- **THEN** publication preparation preserves the ID and does not require an arbitrary version bump or a GitHub release tag

### Requirement: The preview represents the tested plugin
The repository SHALL provide one root `preview.png` and reference it from the
README with descriptive alt text. The image MUST show the actual release's
bar critter and open panel with readable demonstration data, exclude personal
writing metadata and unrelated desktop content, decode successfully, and
remain within the marketplace's documented input limits. Documentation MUST
distinguish this project's decision to ship a preview from the marketplace's
optional preview requirement.

#### Scenario: A prospective user views the preview
- **WHEN** the preview is opened independently or displayed in the README
- **THEN** the bar widget and panel are legible and consistent with the interface that was verified
- **AND** no private document names, personal watch paths, or unrelated windows are exposed

### Requirement: Release checks have traceable evidence
The repository SHALL maintain `docs/RELEASE-VERIFICATION.md` recording the
tested full Git SHA, date, environment, commands, observed results, and
remaining limitations. Evidence MUST include the existing automated suites
and lints plus a fresh-install lifecycle exercise using disposable writing
data. Historical claims, incomplete checks, and unavailable live scenarios
MUST remain distinguishable from observed passing results. Verification MUST
NOT require resetting the user's real writing configuration or history.

#### Scenario: Existing automation passes for the candidate
- **WHEN** the Python and JavaScript suites, security guard, lifecycle lint, Omarchy validator, and QML lint complete
- **THEN** their actual outcomes and tested revision are recorded without treating local validation as a marketplace baseline result

#### Scenario: Fresh installation and removal are exercised
- **WHEN** the release is tested without a pre-existing engine masking setup
- **THEN** the record covers cancellation, confirmed setup, initial configuration, counting, update/repair, engine-first removal, and reinstall with retained data

#### Scenario: The final commit adds only publication materials
- **WHEN** documentation, planning files, or the preview are committed after live verification
- **THEN** a reviewed diff can relate the final submission SHA to the tested code revision without requiring a verification document to contain its own commit hash
- **AND** runtime changes require renewed affected checks and a new stability run

### Requirement: Stability is observed before release readiness is claimed
The first publication candidate SHALL complete a recorded stability run of
at least 24 elapsed hours containing two normal writing sessions, an actual
local midnight rollover, suspend/resume, and deliberate engine and shell
restart exercises. The record MUST include timestamps and timezone,
observations of responsiveness and recovery, count/history checks, and
unexpected exits or errors. Planned restarts MUST be identifiable separately
from failures. A short smoke test, simulated clock change, or unchanged PID
alone MUST NOT satisfy this gate. The duration MUST be identified as a project
release criterion, not an upstream marketplace rule.

#### Scenario: Observation completes successfully
- **WHEN** the required duration and scenarios complete with correct recovery and no unresolved failure
- **THEN** the record supports marking the stability gate complete and replacing the pending README warning with an accurate result and evidence link

#### Scenario: Observation is incomplete or a failure occurs
- **WHEN** the duration is insufficient, a required scenario was not exercised, or a shell/engine/counting failure remains unresolved
- **THEN** release readiness and the corresponding tasks remain pending, with the missing evidence or failure described
- **AND** the warning is not removed merely because automated tests passed

### Requirement: A concrete marketplace submission is prepared
The repository SHALL provide `docs/MARKETPLACE-SUBMISSION.md` as a reviewable
issue body and `docs/PUBLISHING.md` as its usage guide. The draft MUST preserve
the current submission form's six headings, order, and declaration wording;
select valid listing metadata; and explain the separate engine setup,
installed files, user service, and removal order. Unconfirmed owner
declarations MUST remain unchecked in the preparation draft. Preparing these
files MUST NOT create an external issue or claim publication has occurred.

#### Scenario: The owner reviews the prepared submission
- **WHEN** the draft and publishing guide are opened
- **THEN** they supply the Writing Critter title, public repository root, Productivity category, Bar and Quickshell tags, concrete reviewer notes, and the remaining owner declarations
- **AND** the guide explains the finalized checked body and the command that submits it

#### Scenario: Publication is ready to be initiated
- **WHEN** someone follows the publishing guide
- **THEN** they recheck repository visibility, ID availability including retired IDs, existing submissions, current form requirements, final commit, and CI before sending the reviewed issue

### Requirement: Preparation and marketplace approval remain distinct
The publishing guide SHALL distinguish local checks, expected review
capabilities, actual marketplace reports, maintainer approval, and successful
publication. It MUST explain the current initial submission and later commit
update process with authoritative source links. Claims of verification MUST
refer only to the snapshot for which marketplace evidence exists.

#### Scenario: Installer and service management need review
- **WHEN** the submission's actual baseline requests capability review
- **THEN** the guide directs the publisher to provide context and resolve feedback on the existing issue before the maintainer's publication decision
- **AND** a passing local security guard is not presented as marketplace approval

#### Scenario: New code is pushed after publication
- **WHEN** the upstream commit differs from the approved snapshot
- **THEN** the guide explains the newer-commit verification path and that earlier evidence does not cover the update or guarantee the commit fetched by ordinary Omarchy install/update commands
