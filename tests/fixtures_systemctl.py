#!/usr/bin/env python3
"""Real `systemctl --user` output, captured before the status parser was written.

Provenance: systemd 261 (261.2-1-arch) on the Omarchy host this plugin targets,
2026-09-07. Captured with a throwaway transient unit in $XDG_RUNTIME_DIR so the
user's own writing-critter.service was never touched, then removed.

Why `show` and not `is-active`/`is-enabled`: `show` answers every question in one
call and exits 0 for every state INCLUDING a unit that does not exist, so the
parser never has to tell "absent" apart from "could not ask". The other two
overload their exit codes -- `is-active` returns 3 for inactive, activating AND
failed, and 4 for absent -- so a parser built on them would have to reconstruct
from the exit status what `show` states outright. Their captured output is kept
below as the evidence for that decision, not because anything parses it.

The fields below are exactly the ones the parser asks for. Note in particular:

  * ActiveEnterTimestampMonotonic is CLOCK_MONOTONIC microseconds, directly
    comparable to time.clock_gettime(time.CLOCK_MONOTONIC). Measured: a unit
    showing 22686700232 was 3.0s old against a monotonic clock reading 22689.73.
    That is what lets "active but not publishing yet" be told apart from
    "active and not publishing", without parsing a locale-formatted date.
  * A failed unit still carries a non-zero ActiveEnterTimestampMonotonic -- it
    did enter active, briefly -- so the freshness grace must be gated on
    ActiveState, never on the timestamp alone.
  * `systemctl --user start` on a Type=simple unit whose ExecStart exits 1
    returns 0. The fork succeeded; the program failed. Verifying a lifecycle
    action therefore means re-reading ActiveState, not trusting the exit code.
  * Re-reading it ONCE is still not enough, which cost a bug. With an ExecStart
    pointing at a path that does not exist, `restart` exited 0 and the very
    next `show` reported ActiveState=active, SubState=running, Result=success.
    Only milliseconds later did it become activating/auto-restart. An install
    that verified immediately therefore reported success and left a unit
    installed that could never run. See SHOW_ACTIVE_BUT_DOOMED below.
  * This unit sets Restart=on-failure, so a crash loop never settles on
    "failed": it oscillates through activating/auto-restart indefinitely. A
    parser that reads "activating" as "starting" will say "starting" forever.
"""

# ------------------------------------------------- `systemctl --user show`
#
# Invoked as:
#   systemctl --user show writing-critter.service \
#     --property=LoadState --property=ActiveState --property=SubState \
#     --property=UnitFileState --property=ActiveEnterTimestampMonotonic \
#     --property=Result
#
# Every one of these exited 0.

SHOW_ABSENT = """\
LoadState=not-found
ActiveState=inactive
SubState=dead
UnitFileState=
ActiveEnterTimestampMonotonic=0
Result=success
"""

SHOW_PRESENT_DISABLED = """\
LoadState=loaded
ActiveState=inactive
SubState=dead
UnitFileState=disabled
ActiveEnterTimestampMonotonic=0
Result=success
"""

SHOW_ENABLED_STOPPED = """\
LoadState=loaded
ActiveState=inactive
SubState=dead
UnitFileState=enabled
ActiveEnterTimestampMonotonic=0
Result=success
"""

SHOW_ACTIVATING = """\
LoadState=loaded
ActiveState=activating
SubState=start-pre
UnitFileState=enabled
ActiveEnterTimestampMonotonic=0
Result=success
"""

SHOW_ACTIVE = """\
LoadState=loaded
ActiveState=active
SubState=running
UnitFileState=enabled
ActiveEnterTimestampMonotonic=22686700232
Result=success
"""

SHOW_FAILED = """\
LoadState=loaded
ActiveState=failed
SubState=failed
UnitFileState=enabled
ActiveEnterTimestampMonotonic=22700339193
Result=exit-code
"""

# The monotonic clock reading taken alongside SHOW_ACTIVE and SHOW_FAILED, so a
# test can position either fixture at a known age.
CAPTURED_MONOTONIC_SECONDS = 22689.729499824

# The first `show` after restarting a unit whose ExecStart does not exist.
# Indistinguishable from a healthy start; that is the entire problem.
SHOW_ACTIVE_BUT_DOOMED = """\
LoadState=loaded
ActiveState=active
SubState=running
UnitFileState=enabled
ActiveEnterTimestampMonotonic=1725658477
Result=success
NRestarts=0
"""

# The same unit a moment later, and for as long as it keeps failing. Captured
# across three reads two seconds apart: NRestarts climbed 9, 10, 10.
SHOW_CRASH_LOOPING = """\
LoadState=loaded
ActiveState=activating
SubState=auto-restart
UnitFileState=enabled
ActiveEnterTimestampMonotonic=1720408700
Result=exit-code
NRestarts=9
"""

# ------------------------------------------------------- degenerate output
#
# Nothing below was produced by a healthy system. They exist because the parser
# must fail closed rather than raise, and "it never happens" is not a test.

# systemd prints a warning to stderr for an unparseable unit name and still
# exits 0 with a usable body. Captured verbatim; the warning is on stderr, so
# the parser never sees it, but the body it accompanies is the shape below.
SHOW_UNKNOWN_UNIT_NAME = """\
LoadState=not-found
ActiveState=inactive
"""

# A future systemd, or a different unit type, can answer with properties this
# parser never asked about and omit ones it did.
SHOW_MISSING_PROPERTIES = """\
LoadState=loaded
SomethingNew=yes
"""

SHOW_EMPTY = ""

SHOW_NOT_KEY_VALUE = "Failed to connect to bus: No such file or directory\n"

SHOW_BLANK_AND_BROKEN_LINES = """\
LoadState=loaded

=novalue
ActiveState=active
no-equals-sign
UnitFileState=enabled
ActiveEnterTimestampMonotonic=not-a-number
Result=success
"""

# An unbounded property value. `show` on a unit with a long Description can run
# to kilobytes; status output is capped, so this proves the cap rather than the
# absence of the case.
SHOW_OVERSIZED = "LoadState=loaded\nActiveState=" + ("x" * 100_000) + "\n"

# ---------------------------------------- `is-active` / `is-enabled`, unused
#
# Kept as the evidence for choosing `show`. Each entry is (stdout, exit code).

IS_ACTIVE = {
    "absent": ("inactive\n", 4),
    "present-disabled": ("inactive\n", 3),
    "enabled-stopped": ("inactive\n", 3),
    "activating": ("activating\n", 3),
    "active": ("active\n", 0),
    "failed": ("failed\n", 3),
}

IS_ENABLED = {
    "absent": ("not-found\n", 4),
    "present-disabled": ("disabled\n", 1),
    "enabled-stopped": ("enabled\n", 0),
    "activating": ("enabled\n", 0),
    "active": ("enabled\n", 0),
}
