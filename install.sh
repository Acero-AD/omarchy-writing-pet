#!/usr/bin/env bash
# Install the Writing Critter engine and its user service.
#
# This is a wrapper, and deliberately a thin one. The copying, the systemd
# calls, the rollback and the verification all live in `writing-critter service
# install`, because the bar panel offers the same setup and the two must not be
# able to disagree about what installing means. What this file used to contain
# -- its own install(1) calls and its own systemctl sequence -- was a second
# implementation of the same job, and a second place for it to be wrong.
#
# The engine runs outside the desktop shell on purpose: an earlier version did
# this work inside quickshell and crashed the whole desktop. See
# docs/POSTMORTEM-ORPHANED-READ.md.
set -euo pipefail

# Resolve against this script, not the caller's working directory: `bash
# ~/plugins/writing-critter/install.sh` from anywhere must install the engine
# sitting beside this file.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$here/bin/writing-critter" service install "$@"

echo
echo "Next, tell it where you write:"
echo "  writing-critter config add-path ~/Documents/writing"
echo "  writing-critter status"
