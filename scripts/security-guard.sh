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

# A test may need to name a forbidden pattern in order to assert that it is
# rejected -- the service tests enumerate privilege and package-manager tokens
# and check that none of them ever reaches a command line. Such a line must say
# so, on the line itself. The exemption is deliberately per-line and not
# per-file: "tests are exempt" is a hole that widens on its own, whereas this
# one is visible in the diff that opens it, right where it is used.
FIXTURE_MARKER='security-guard: fixture'

status=0
for pattern in "${FORBIDDEN[@]}"; do
  hits=$(grep -Fn -- "$pattern" "${FILES[@]}" 2>/dev/null) || continue
  offending=""
  while IFS= read -r hit; do
    file=${hit%%:*}
    if [[ $file == ./tests/* && $hit == *"$FIXTURE_MARKER"* ]]; then
      continue
    fi
    offending+="$hit"$'\n'
  done <<<"$hits"
  if [[ -n $offending ]]; then
    echo "FORBIDDEN PATTERN '$pattern':" >&2
    printf '%s' "$offending" >&2
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

# ------------------------------------------- what the engine itself may run
#
# The shell process runs one program; this is the other half of that claim. The
# engine gained the ability to install itself and manage its own user service,
# which means it now spawns systemd -- and a reviewer's next question is
# rightly "with what arguments, and can anything else get in there".
#
# The answer this enforces: every subprocess in the engine is a literal list
# whose first element is a literal program on the list below, the systemd calls
# are all `systemctl --user` with a verb from a fixed set, and there is no
# shell, no caller-supplied program, and no path on any of those command lines.

ENGINE=bin/writing-critter
ENGINE_PROGRAMS='hyprctl|systemctl'
# The complete set of things this plugin can ask systemd to do. Adding one is a
# spec revision, not an edit.
SYSTEMCTL_VERBS='show|daemon-reload|enable|disable|start|stop|restart|reset-failed'

if [[ ! -r $ENGINE ]]; then
  echo "security-guard: cannot read $ENGINE" >&2
  status=1
else
  # A shell is never the right way to run any of this, and it is how an
  # argument becomes a command.
  if hits=$(grep -n 'shell=True\|os\.system(\|os\.popen(\|subprocess\.getoutput' "$ENGINE"); then
    echo "ENGINE RUNS A SHELL:" >&2
    echo "$hits" >&2
    status=1
  fi

  # Every spawn site: the line after `subprocess.run(` holds the argument list.
  #
  # The counts must agree. Matching only the sites that look like a literal
  # list meant a site that did NOT -- `subprocess.run(args, ...)`, the one
  # shape this whole check exists to catch -- simply produced no line to
  # inspect, and the guard passed on the strength of the other site. Found by
  # probing the check with that exact edit rather than by reading it.
  spawn_sites=$(grep -c 'subprocess\.run(' "$ENGINE")
  spawns=$(grep -A1 -n 'subprocess\.run(' "$ENGINE" | grep -E '^\s*[0-9]+-\s*\[' || true)
  spawn_lists=$([[ -z $spawns ]] && echo 0 || grep -c '' <<<"$spawns")
  if [[ -z $spawns || $spawn_lists -ne $spawn_sites ]]; then
    echo "ENGINE SPAWN NOT A LITERAL ARGUMENT LIST:" >&2
    echo "  $spawn_sites call(s) to subprocess.run, $spawn_lists literal list(s) on the following line" >&2
    status=1
  fi
  if [[ -n $spawns ]]; then
    while IFS= read -r spawn; do
      argv=${spawn#*-}
      first=$(sed -E 's/^[[:space:]]*\[[[:space:]]*//; s/[],].*//' <<<"$argv")
      if [[ ! $first =~ ^\"([^\"]+)\"$ ]]; then
        echo "ENGINE SPAWNS A NON-LITERAL PROGRAM: $spawn" >&2
        status=1
        continue
      fi
      program=${BASH_REMATCH[1]}
      if [[ ! $program =~ ^($ENGINE_PROGRAMS)$ ]]; then
        echo "ENGINE PROGRAM NOT ON ALLOWLIST: $program in $spawn" >&2
        status=1
      fi
      if [[ $program == systemctl && $argv != *'"--user"'* ]]; then
        echo "ENGINE CALLS SYSTEMCTL WITHOUT --user: $spawn" >&2
        status=1
      fi
      # No absolute path is ever an argument: the destinations are resolved
      # inside the engine and never handed to another program.
      if grep -qE '"/' <<<"$argv"; then
        echo "ENGINE PASSES A PATH ON A COMMAND LINE: $spawn" >&2
        status=1
      fi
    done <<<"$spawns"
  fi

  # The systemd verbs, read from the methods that build them.
  verbs=$(grep -oE '_call\(\["[a-z-]+"' "$ENGINE" | sed -E 's/.*\["([a-z-]+)"/\1/' | sort -u)
  if [[ -z $verbs ]]; then
    echo "security-guard: found no systemctl verbs to check in $ENGINE" >&2
    status=1
  else
    while IFS= read -r verb; do
      if [[ ! $verb =~ ^($SYSTEMCTL_VERBS)$ ]]; then
        echo "SYSTEMCTL VERB NOT ON ALLOWLIST: $verb" >&2
        status=1
      fi
    done <<<"$verbs"
  fi
fi

if [[ $status -eq 0 ]]; then
  echo "security-guard: clean (${#FILES[@]} source files, ${#FORBIDDEN[@]} patterns, command allowlist enforced on ${#RUNTIME_FILES[@]} runtime files, engine spawns limited to $ENGINE_PROGRAMS)"
fi
exit $status
