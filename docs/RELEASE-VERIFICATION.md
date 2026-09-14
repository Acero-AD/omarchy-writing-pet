# Release Verification

This record keeps observed release evidence separate from plans, historical
claims, and marketplace verification. A complete local record is not a
marketplace security result or publication approval.

## Candidate

| Field | Value |
|---|---|
| Candidate revision | `9efd77cf95415268f10a1dc5edca6f9df4111f02` |
| Plugin ID | `io.github.acero-ad.writing-critter` |
| Manifest version | `0.1.0` |
| Engine version | `0.1.0` |
| Record created | 2026-09-14, Europe/Madrid |
| Publication status | Not submitted |

This candidate includes the completed engine-setup dialog change. Its archived
tasks record live coverage of setup, update, repair, removal, keyboard
handling, narrow/proportional layouts, and panels on multiple screens. Final
publication materials are currently uncommitted. Runtime changes after the
candidate is exercised require renewed affected checks and a new stability run.
Documentation, planning, and preview-only changes may be related to the tested
runtime only after their diff is reviewed.

## Test Environment

Fill this table when the candidate is selected. Do not present these fields as
minimum supported versions.

| Component | Observed version | Notes |
|---|---|---|
| Omarchy | 4.0.3-1 | `omarchy version` on 2026-09-14 |
| Quickshell | 0.3.1 (Arch Linux build) | `quickshell --version` on 2026-09-14 |
| Python | 3.14.7 | `python3 --version` on 2026-09-14 |
| systemd | 261 (261.2-1-arch) | `systemctl --version` on 2026-09-14 |
| Desktop/session | Omarchy-managed Hyprland | Final live-release layout record pending |
| Test data | Pending | Use disposable demonstration documents; never reset working writing data |

## Automated Checks

Record the full candidate SHA, date, commands, and actual outcomes here.

| Check | Command | Candidate result |
|---|---|---|
| JavaScript tests | `node --test --test-reporter=dot tests/*.test.mjs` | Passed on 2026-09-14 (137 tests) |
| Python tests | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'` | Passed on 2026-09-14: 238 tests in 7.471s |
| Security guard | `./scripts/security-guard.sh` | Passed on 2026-09-14; 15 source files, 16 patterns, 7 runtime files |
| QML lifecycle lint | `./scripts/qml-lifecycle-lint.py` | Passed on 2026-09-14: 4 QML files |
| Plugin manifest/layout | `omarchy plugin validate .` | Passed on 2026-09-14 |
| Qt 6 QML lint | `mktemp -d` link workaround documented in README, then `/usr/lib/qt6/bin/qmllint` | Passed on 2026-09-14 with the existing documented Quickshell type warnings |
| Published CI | Link to the candidate's successful workflow | Recheck and record immediately before submission |

`omarchy plugin validate` validates the local manifest and layout. It is not
the Marketplace Automated Security Baseline.

## Fresh-Install Lifecycle

Run this in an isolated account or a purpose-built test environment so an
existing engine and real writing data do not mask the result. Record the exact
commands, observations, and any logs needed to explain a failure.

| Scenario | Evidence to record | Result |
|---|---|---|
| Cancel setup | No engine/unit/data changes after Cancel, Escape, and outside dismissal | Completed in the current candidate's archived live dialog checks; re-exercise in the release test environment |
| Confirm setup | Bundled engine and user unit installed only after confirmation | Completed in the archived live setup checks; re-exercise in the release test environment |
| Initial configuration | Demonstration path and writing app accepted | Pending release-environment exercise |
| Counting | A saved demonstration document updates the count while the configured app has focus | Pending release-environment exercise |
| Update/repair | Drift, stopped, and unhealthy states offer and complete their documented repair | Isolated end-to-end test passed on 2026-09-14; live release-environment exercise pending |
| Engine-first removal | Engine/unit removed before plugin; settings, count, and history retained | Isolated end-to-end test passed on 2026-09-14; plugin removal sequence pending live exercise |
| Reinstall | Retained data resumes after engine reinstall | Isolated end-to-end test passed on 2026-09-14; live release-environment exercise pending |

`tests/test_endtoend.py` is the passing isolated executable test behind the
update, repair, removal, and reinstall results. It creates a temporary home,
disposable state data, a copied checkout, and a `systemctl` shim, so it cannot
alter the developer's live user service. The archived setup-dialog tasks record
the existing live bar and dialog coverage for the same runtime candidate.

## Stability Run

This is a project release gate, not a marketplace rule. The first release
candidate needs at least 24 elapsed hours, two normal writing sessions, an
actual local midnight rollover, suspend/resume, and deliberate engine and
shell restart exercises. Planned restarts must be marked as planned; an
unchanged PID alone is not evidence of stability.

| Field | Value |
|---|---|
| Start time and timezone | 2026-09-14T12:16:52+02:00 (Europe/Madrid) |
| End time and timezone | Earliest completion: 2026-09-15T12:16:52+02:00 |
| Shell and engine identity at start | `quickshell` PID 1362 (`-n -p /usr/share/omarchy/shell`); `writing-critter.service` MainPID 14042, active since 2026-09-14T10:20:08+02:00 |
| Baseline count/history | Current candidate source and installed engine are byte-identical; service reported `ready`, current, enabled, and fresh. State and history were present and schema-valid. Exact counts, dates, document paths, and history values are intentionally not committed to this public record. |
| Writing session 1 | Pending |
| Writing session 2 | Pending |
| Local midnight rollover | Pending |
| Suspend/resume | Pending |
| Deliberate engine restart | Pending |
| Deliberate shell restart | Pending |
| Unexpected exits, errors, or logs | Pending — record even if none occurred |
| Final count/history and recovery | Pending |

Do not remove the README's pre-release warning until this table is complete
and any discovered failure has been investigated and reverified.

## Preview and Submission

| Item | Result |
|---|---|
| `preview.png` captured from the final interface with demonstration data | Pending |
| Preview reviewed for legibility and private information | Pending |
| Repository visibility, permanent ID, and duplicate submission rechecked | Pending |
| Marketplace issue draft reviewed by the owner | Pending |
| Marketplace baseline and maintainer decision | Pending after a separately approved submission |
