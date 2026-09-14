# Publishing Writing Critter

This guide prepares an initial marketplace submission. It does not submit an
issue, establish a Marketplace result, or authorize a maintainer decision.

## Marketplace sources checked

Checked on 2026-09-14:

- [Publishing guide](https://plugins.omarchy.org/publish.html)
- [Submission guide](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SUBMISSION.md)
- [Submission form](https://github.com/omacom/omarchy-plugin-marketplace/issues/new?template=submit-plugin.yml)
- [Automated Security Baseline](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SECURITY.md)
- [Verification and update guide](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/VERIFICATION.md)

Recheck these sources and the issue form immediately before submitting. The
submission format, validation rules, and approval policy can change.

## Release gate

Before asking the owner to approve submission:

1. Complete the [release verification record](RELEASE-VERIFICATION.md),
   including its 24-hour live stability gate.
2. Confirm `manifest.json` and `bin/writing-critter` agree on the version and
   keep the permanent ID `io.github.acero-ad.writing-critter`.
3. Capture and review root `preview.png` from the final interface using only
   demonstration data. A preview is optional to the Marketplace but part of
   this project's release package.
4. Confirm the GitHub repository is public, the ID has not been used or
   retired, no duplicate submission exists, the chosen commit has passing CI,
   and the current issue form still accepts the fields below.
5. Review [MARKETPLACE-SUBMISSION.md](MARKETPLACE-SUBMISSION.md) with the
   owner. Check every declaration only when it is true; the ownership and
   preview-assets declaration needs the owner's explicit confirmation.

The release record's local checks are evidence about this repository. They are
not a Marketplace Automated Security Baseline result, approval, or listing.

## Submission details

| Field | Value |
|---|---|
| Title | `[Plugin]: Writing Critter` |
| Repository | `https://github.com/Acero-AD/omarchy-writing-pet` |
| Category | `Productivity` |
| Tags | `bar, quickshell` |
| Plugin ID | `io.github.acero-ad.writing-critter` |

The issue draft preserves the current form's six headings and declaration
wording. In the browser form, choose the corresponding **Bar** and
**Quickshell** tag options. For the CLI body, retain the lower-case values
above as specified by the submission guide.

After owner review and explicit approval, create the issue from the completed
draft:

```bash
gh issue create \
  --repo omacom/omarchy-plugin-marketplace \
  --title "[Plugin]: Writing Critter" \
  --body-file docs/MARKETPLACE-SUBMISSION.md
```

If the CLI is not authenticated, run `gh auth login` before this step. Do not
open a second issue to retry a validation failure: correct the repository or
existing issue and edit that issue to request another run.

## Review and publication

The Marketplace validates the exact submitted commit and runs a static,
non-executing Automated Security Baseline. It can report `passed`,
`review-required`, or `needs-fixes`. This plugin is expected to expose
`installer` and `service-management` capabilities because it ships setup
wrappers and a systemd user service. That expectation is not the scan result;
read the bot's report for the exact submitted commit.

For a capability review, answer on the existing issue with the relevant source
context, including the explicit panel confirmation, two fixed user-owned
targets, no privilege escalation or network access, and engine-first removal.
Resolve validation feedback and any selectively blocking findings before asking
a maintainer to review the current report. A maintainer must finalize required
labels, including any applicable manual-setup label, and apply
`approved-and-verified` after matching bot reports exist. The final publication
workflow performs a fresh matching scan; a label alone does not prove a listing
was deployed.

Verify the published listing and its recorded snapshot before announcing it.
Marketplace verification is not a security audit, certification, warranty, or
guarantee. Community plugin code remains unsandboxed.

## Later updates

When the repository advances beyond the approved snapshot, use the Marketplace
[plugin verification form](https://github.com/omacom/omarchy-plugin-marketplace/issues/new?template=verify-plugin.yml)
and select **Verify and publish a newer upstream commit**. Supply the existing
plugin ID, repository root, and full 40-character current commit SHA. The
Marketplace reviews that exact snapshot independently; older evidence does not
cover the new commit.

Omarchy's ordinary `omarchy plugin add` and `omarchy plugin update` commands
clone mutable upstream HEAD rather than an exact Marketplace snapshot. They may
therefore install code different from the reviewed commit; users should inspect
the installed revision before enabling it.
