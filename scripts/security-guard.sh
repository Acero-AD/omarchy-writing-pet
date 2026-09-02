#!/usr/bin/env bash
# Fails if the plugin's executable code contains input capture, network access,
# or privilege escalation. These constraints are the reason the plugin needs no
# permissions; a regression must break the build rather than ship.
#
# Scans QML and JS only. Prose deliberately discusses evdev and /dev/input at
# length -- explaining why they are rejected is the point of the disclosure --
# so scanning documentation would make the guard permanently red.
set -uo pipefail
cd "$(dirname "$0")/.."

FORBIDDEN=(
  'evdev' '/dev/input' 'libinput' 'interception-tools'
  'keylog' 'XGrabKey' 'uinput'
  'XMLHttpRequest' 'NetworkAccessManager' 'WebSocket'
  'fetch(' 'curl' 'wget'
  'sudo' 'pkexec' 'polkit'
)

mapfile -t FILES < <(find . -path ./.git -prune -o \( -name '*.qml' -o -name '*.js' -o -name '*.mjs' -o -name '*.py' \) -print)
FILES+=(bin/writing-critter)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "security-guard: no source files found" >&2
  exit 1
fi

status=0
for pattern in "${FORBIDDEN[@]}"; do
  if hits=$(grep -Fn -- "$pattern" "${FILES[@]}" 2>/dev/null); then
    echo "FORBIDDEN PATTERN '$pattern':" >&2
    echo "$hits" >&2
    status=1
  fi
done

# The external-command allowlist. Anything else requires a spec revision.
ALLOWED_COMMANDS='find|wc|mkdir|notify-send|hyprctl'
if hits=$(grep -Eon 'command: \[[^]]*\]' "${FILES[@]}" 2>/dev/null); then
  while IFS= read -r line; do
    cmd=$(sed -E 's/.*command: \["([^"]+)".*/\1/' <<<"$line")
    if [[ ! $cmd =~ ^($ALLOWED_COMMANDS)$ ]]; then
      echo "COMMAND NOT ON ALLOWLIST: $line" >&2
      status=1
    fi
  done <<<"$hits"
fi

if [[ $status -eq 0 ]]; then
  echo "security-guard: clean (${#FILES[@]} source files, ${#FORBIDDEN[@]} patterns, command allowlist enforced)"
fi
exit $status
