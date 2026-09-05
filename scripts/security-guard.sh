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
#
# `writing-critter` is the plugin's own engine, invoked by the settings controls
# in the bar panel. It is the only program the shell process may run, and
# scripts/qml-lifecycle-lint.py additionally requires that it be spawned from a
# singleton. The resolution below is deliberately duplicated rather than shared
# with that linter: this file is what a security reviewer reads, and it should
# answer "what can this run" without them having to read a second script.
#
# Scope: files the desktop shell can actually load, plus the engine. The test
# suite ships with the plugin but the shell never loads it -- the manifest's
# only entry point is BarWidget.qml -- and tests/test_lint.py deliberately
# contains rejected commands as fixtures, to prove the linter rejects them.
# Those are inert strings. The forbidden-pattern scan above still covers them.
ALLOWED_COMMANDS='find|wc|mkdir|notify-send|hyprctl|writing-critter'
mapfile -t RUNTIME_FILES < <(printf '%s\n' "${FILES[@]}" | grep -v '^\./tests/')
hits=$(grep -Eon 'command: \[[^]]*\]' "${RUNTIME_FILES[@]}" 2>/dev/null)
scan_rc=$?
# grep exits 1 for "no matches" and 2 for "could not read a file". Taking the
# status as a plain boolean, as this did, made an unreadable file skip the whole
# allowlist check silently -- a security guard that fails open. Found by probing
# it in a directory where one listed file was missing.
if [[ $scan_rc -gt 1 ]]; then
  echo "security-guard: could not scan runtime files for commands (grep exit $scan_rc)" >&2
  status=1
elif [[ $scan_rc -eq 0 ]]; then
  while IFS= read -r hit; do
    file=${hit%%:*}
    first=$(sed -E 's/.*command: \[[[:space:]]*//; s/[],].*//' <<<"$hit")
    if [[ $first =~ ^\"([^\"]+)\"$ ]]; then
      cmd=${BASH_REMATCH[1]}
    else
      # A property reference. Resolve it against its declaration in the same
      # file; a program this cannot read is rejected, never assumed safe.
      name=${first##*.}
      decl=$(grep -Eom1 "property[[:space:]]+string[[:space:]]+${name}[[:space:]]*:.*" "$file" 2>/dev/null)
      cmd=$(sed -E 's/[^"]*"([^"]+)".*/\1/' <<<"$decl")
      [[ -z $decl || $cmd == "$decl" ]] && cmd="UNRESOLVED($first)"
    fi
    cmd=${cmd##*/}
    if [[ ! $cmd =~ ^($ALLOWED_COMMANDS)$ ]]; then
      echo "COMMAND NOT ON ALLOWLIST: $cmd in $hit" >&2
      status=1
    fi
  done <<<"$hits"
fi

if [[ $status -eq 0 ]]; then
  echo "security-guard: clean (${#FILES[@]} source files, ${#FORBIDDEN[@]} patterns, command allowlist enforced on ${#RUNTIME_FILES[@]} runtime files)"
fi
exit $status
