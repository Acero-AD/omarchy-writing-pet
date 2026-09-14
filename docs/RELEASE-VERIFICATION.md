# Release Verification

This record keeps observed release evidence separate from plans, historical
claims, and marketplace verification. A complete local record is not a
marketplace security result or publication approval.

## Candidate

| Field | Value |
|---|---|
| Candidate revision | Pending — the runtime changed after `9efd77cf95415268f10a1dc5edca6f9df4111f02`; select and record a new committed candidate before submission. |
| Plugin ID | `io.github.acero-ad.writing-critter` |
| Manifest version | `0.1.0` |
| Engine version | `0.1.0` |
| Record created | 2026-09-14, Europe/Madrid |
| Publication status | Not submitted |

The previous candidate included the completed engine-setup dialog change. Its
archived tasks record live coverage of setup, update, repair, removal, keyboard
handling, narrow/proportional layouts, and panels on multiple screens. On
2026-09-14, fresh setup with no watch path exposed a runtime defect: the engine
exited with status 1 and the user service restart-looped instead of waiting for
initial configuration. The `keep-engine-idle-without-watch-paths` change fixes
that behavior, so prior runtime and stability evidence is not evidence for the
next candidate. Documentation, planning, and preview-only changes may be
related to tested runtime only after their diff is reviewed.

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
| Test data | Demonstration preview path only | Re-run lifecycle tests with disposable demonstration documents; never reset working writing data |

## Automated Checks

Record the full candidate SHA, date, commands, and actual outcomes here.

| Check | Command | Candidate result |
|---|---|---|
| JavaScript tests | `node --test --test-reporter=dot tests/*.test.mjs` | Passed on 2026-09-14 (137 tests) on the uncommitted runtime-fix working tree; rerun against the new candidate |
| Python tests | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'` | Passed on 2026-09-14: 241 tests in 7.565s on the uncommitted runtime-fix working tree; rerun against the new candidate |
| Security guard | `./scripts/security-guard.sh` | Passed on 2026-09-14; 15 source files, 16 patterns, 7 runtime files on the runtime-fix working tree |
| QML lifecycle lint | `./scripts/qml-lifecycle-lint.py` | Passed on 2026-09-14: 4 QML files on the runtime-fix working tree |
| Plugin manifest/layout | `omarchy plugin validate .` | Passed on 2026-09-14 on the runtime-fix working tree |
| Qt 6 QML lint | `mktemp -d` link workaround documented in README, then `/usr/lib/qt6/bin/qmllint` | Passed on 2026-09-14 with the existing documented Quickshell type warnings on the runtime-fix working tree |
| Published CI | Link to the candidate's successful workflow | Pending: push the new candidate and record its successful workflow before submission |

`omarchy plugin validate` validates the local manifest and layout. It is not
the Marketplace Automated Security Baseline.

## Fresh-Install Lifecycle

Run this in an isolated account or a purpose-built test environment so an
existing engine and real writing data do not mask the result. Record the exact
commands, observations, and any logs needed to explain a failure.

| Scenario | Evidence to record | Result |
|---|---|---|
| Cancel setup | No engine/unit/data changes after Cancel, Escape, and outside dismissal | Pending fresh release-environment exercise after the runtime fix |
| Confirm setup | Bundled engine and user unit installed only after confirmation | Pending: confirm an empty watch-path configuration starts an idle engine without restart-looping |
| Initial configuration | Demonstration path and writing app accepted | Pending: verify the running idle engine adopts the first path without a restart |
| Counting | A saved demonstration document updates the count while the configured app has focus | Pending fresh release-environment exercise |
| Update/repair | Drift, stopped, and unhealthy states offer and complete their documented repair | Passing isolated test on the runtime-fix working tree; live release-environment exercise pending |
| Engine-first removal | Engine/unit removed before plugin; settings, count, and history retained | Passing isolated test on the runtime-fix working tree; plugin removal sequence pending live exercise |
| Reinstall | Retained data resumes after engine reinstall | Passing isolated test on the runtime-fix working tree; live release-environment exercise pending |

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
| Start time and timezone | Pending — start a new run after the runtime fix is committed and explicitly installed |
| End time and timezone | Pending — at least 24 hours after the new start time |
| Shell and engine identity at start | Pending — record only the new candidate's shell and installed-engine identities |
| Baseline count/history | Pending — record only sanitized evidence for the new candidate. The prior run is invalidated by the no-watch-path restart-loop fix. |
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
| `preview.png` captured from the final interface with demonstration data | Captured on 2026-09-14 at the repository root. It shows a zero-word, engine-running state with the narrow `/home/writing-critter-demo` demonstration path; no document titles or writing history are visible. Reconfirm this static interface evidence after installing the new runtime candidate. |
| Preview reviewed for legibility and private information | Passed: valid PNG, 316 × 885 pixels (0.28 megapixels), 70,281 bytes—within the Marketplace 50 MB / 40 megapixel input limits. The README embeds it with descriptive alt text; re-review it with the new runtime candidate before submission. |
| Repository visibility, permanent ID, and duplicate submission rechecked | Pending |
| Marketplace issue draft reviewed by the owner | Pending |
| Marketplace baseline and maintainer decision | Pending after a separately approved submission |
