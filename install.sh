#!/usr/bin/env bash
# Install the Writing Critter engine and its user service.
#
# The engine runs outside the desktop shell on purpose: an earlier version did
# this work inside quickshell and crashed the whole desktop. See
# docs/POSTMORTEM-ORPHANED-READ.md.
set -euo pipefail
cd "$(dirname "$0")"

BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

mkdir -p "$BIN_DIR" "$UNIT_DIR"
install -m 755 bin/writing-critter "$BIN_DIR/writing-critter"
install -m 644 contrib/writing-critter.service "$UNIT_DIR/writing-critter.service"

systemctl --user daemon-reload
systemctl --user enable --now writing-critter.service

echo
echo "Installed:  $BIN_DIR/writing-critter"
echo "Service:    systemctl --user status writing-critter"
echo
echo "Next, tell it where you write:"
echo "  writing-critter config add-path ~/Documents/writing"
echo "  writing-critter status"
