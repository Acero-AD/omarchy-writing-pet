#!/usr/bin/env bash
# Remove the Writing Critter engine and its user service.
#
# Your configuration, today's count and your history are kept: this removes the
# program, not what it recorded. Reinstalling resumes where you left off.
#
# Like install.sh, this delegates rather than implements. The panel's "remove
# engine" button runs the same operation.
#
# Omarchy runs no uninstall hook when a plugin is removed, so this has to happen
# before `omarchy plugin remove` -- afterwards the checkout containing this
# script is gone. See the README's removal section.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$here/bin/writing-critter" service uninstall "$@"

echo
echo "The engine is gone. Your settings and history are still in:"
echo "  ~/.config/writing-critter/    ~/.local/state/writing-critter/"
