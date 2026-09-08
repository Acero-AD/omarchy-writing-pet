#!/usr/bin/env python3
"""Enforce the lifecycle rules from docs/POSTMORTEM-ORPHANED-READ.md.

Those rules exist because breaking them segfaulted the desktop shell in a crash
loop. Each of the four contributing conditions was individually defensible, so
review did not catch the combination. A linter does.

Scope: this is line-oriented, not a QML parser. Rules 1 and 2 match a property
on its own line, which is how every QML file here is written; a violation
squeezed onto one line with its enclosing brace would slip through. Verified by
probing each rule with a deliberate violation rather than trusting a clean run.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LITERAL_ACTIVE = re.compile(r"^\s*active:\s*(true|false)\s*(//.*)?$")
ACTIVE_BINDING = re.compile(r"^\s*active:\s*(.+?)\s*$")

# Rule 3 allows exactly one program: the plugin's own engine. Anything else in
# the shell process is the architecture leaking back in.
ALLOWED_PROGRAMS = {"writing-critter"}
FOCUSABLE_INPUT = re.compile(
    r"^\s*(?:NumberField|TextField|TextInput|SpinBox|QQC\.(?:TextField|SpinBox))\s*\{",
    re.M,
)

# Rule 6: the calls that can put a process on the CPU. A bar widget that spawns
# one to answer a question nobody asked is the cost this plugin has spent two
# rewrites avoiding, so these may only be reached from something a person did.
SPAWNING_CALLS = re.compile(
    r"\b(?:refreshServiceStatus|requestService|startService|confirmService|run)\s*\("
)

failures = []


def block_bodies(source: str, type_name: str):
    """Yield (line number, body) for simple balanced QML object blocks."""
    pattern = re.compile(rf"^\s*{re.escape(type_name)}\s*\{{", re.M)
    for match in pattern.finditer(source):
        depth = 1
        i = match.end()
        while i < len(source) and depth:
            if source[i] == "{":
                depth += 1
            elif source[i] == "}":
                depth -= 1
            i += 1
        yield source[:match.start()].count("\n") + 1, source[match.end():i]


def command_program(line: str, source: str) -> tuple[str | None, str]:
    """The program a `command:` line will run, and how it was determined.

    Two shapes are understood. A literal first element is read directly. An
    identifier is resolved against its property declaration in the same file,
    which is how the program gets written when it is a resolved absolute path.
    Anything else is unresolvable and rejected rather than assumed safe.
    """
    body = line.split(":", 1)[1].strip()
    if not body.startswith("["):
        return None, "not an argument list"
    # Up to the first comma OR the closing bracket. A one-element literal list
    # that is then concatenated -- `[enginePath].concat(argv)`, which is what a
    # command whose arguments come from a queue looks like -- has no comma in
    # it, and splitting on the comma alone swallowed the whole expression and
    # reported it as unreadable.
    first = re.split(r"[,\]]", body[1:], maxsplit=1)[0].strip()

    literal = re.match(r"""^["'](.+?)["']$""", first)
    if literal:
        return literal.group(1).rsplit("/", 1)[-1], "literal"

    name = first.rsplit(".", 1)[-1]
    if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", name):
        return None, f"cannot resolve {first!r}"

    decl = re.search(
        rf"^\s*(?:readonly\s+)?property\s+\w+\s+{re.escape(name)}\s*:(.*)$",
        source, re.M)
    if not decl:
        return None, f"{name!r} is not declared in this file"
    literals = re.findall(r"""["']([^"']+)["']""", decl.group(1))
    if not literals:
        return None, f"{name!r} resolves to no string literal"
    programs = {lit.rsplit("/", 1)[-1] for lit in literals}
    if len(programs) != 1:
        return None, f"{name!r} could be any of {sorted(programs)}"
    return programs.pop(), f"via property {name}"


def check(path: Path) -> None:
    source = path.read_text()
    is_singleton = re.search(r"^\s*pragma\s+Singleton\s*$", source, re.M) is not None
    lines = source.splitlines()
    depth_stack = []  # (type_name, brace_depth)
    depth = 0

    for lineno, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith("//"):
            depth += line.count("{") - line.count("}")
            continue

        opened = re.match(r"^([A-Z][A-Za-z0-9_.]*)\s*\{", stripped)
        if opened:
            depth_stack.append((opened.group(1), depth))

        enclosing = depth_stack[-1][0] if depth_stack else ""

        # Rule 1: a Loader's lifetime must not depend on a late-settling value.
        if enclosing == "Loader" and stripped.startswith("active:"):
            if not LITERAL_ACTIVE.match(line):
                expr = ACTIVE_BINDING.match(line)
                failures.append(
                    f"{path.name}:{lineno}: Loader.active is a binding, not a literal "
                    f"-> {expr.group(1) if expr else stripped}\n"
                    f"    A value that is null at construction and resolves later makes the\n"
                    f"    Loader build a subtree and then destroy it during startup (rule 1)."
                )

        # Rule 2: preload starts async work the owner may not outlive.
        if stripped.startswith("preload:") and "true" in stripped:
            failures.append(
                f"{path.name}:{lineno}: preload: true starts an async read.\n"
                f"    Only permitted on an owner that is never destroyed (rule 2)."
            )

        # The deref path: only var-typed adapter properties reach it.
        if "JsonAdapter" in stripped or re.match(r"^\s*adapter:", stripped):
            failures.append(
                f"{path.name}:{lineno}: adapter bound to a file view.\n"
                f"    Parse with JSON.parse instead; var-typed adapter properties are the\n"
                f"    branch that dereferences the QML engine."
            )

        # Rule 3: a subprocess may exist, but only where it cannot be orphaned,
        # and only to run the plugin's own engine.
        #
        # This was a blanket ban until the panel gained settings controls. The
        # ban was written the day after the crash, when the priority was
        # shrinking surface area; none of the crash's four conditions was a
        # spawn. What was load-bearing is ownership, so that is what is enforced
        # now: a Process in a per-screen subtree can be destroyed mid-flight by
        # a monitor hotplug, which is the shape that segfaulted the shell.
        if re.match(r"^Process\s*\{", stripped) and not is_singleton:
            failures.append(
                f"{path.name}:{lineno}: Process outside a singleton.\n"
                f"    The bar builds one subtree per screen, so this can be destroyed\n"
                f"    mid-flight by a monitor hotplug. Move it into a `pragma Singleton`\n"
                f"    component, which lives for the process (rule 3)."
            )

        # startDetached survives its owner by design and reports no exit code,
        # so a failed configuration change would be invisible. Never permitted.
        if re.search(r"\bstartDetached\s*\(", stripped):
            failures.append(
                f"{path.name}:{lineno}: startDetached outlives its owner and returns\n"
                f"    no exit status, so a failure cannot be reported (rule 3)."
            )

        if stripped.startswith("command:"):
            if not is_singleton:
                failures.append(
                    f"{path.name}:{lineno}: process command outside a singleton (rule 3)."
                )
            program, how = command_program(line, source)
            if program is None:
                failures.append(
                    f"{path.name}:{lineno}: cannot determine the program this runs\n"
                    f"    ({how}). Rule 3 allows only {sorted(ALLOWED_PROGRAMS)}, and a\n"
                    f"    command the linter cannot read is not a command it can allow."
                )
            elif program not in ALLOWED_PROGRAMS:
                failures.append(
                    f"{path.name}:{lineno}: runs {program!r} ({how}).\n"
                    f"    Rule 3 allows only {sorted(ALLOWED_PROGRAMS)} from the shell\n"
                    f"    process; everything else belongs in the engine."
                )

        # Rule 6: nothing spawns during construction.
        #
        # Loading the plugin must cost nothing. The status probe is bound to a
        # person opening the panel; a Component.onCompleted that reached it
        # would put a process behind every shell start, on every screen, for a
        # question nobody asked.
        if stripped.startswith("Component.onCompleted") and SPAWNING_CALLS.search(stripped):
            failures.append(
                f"{path.name}:{lineno}: a process is spawned from construction.\n"
                f"    Loading the widget must spawn nothing; the probe belongs on an\n"
                f"    explicit open (rule 6)."
            )

        # Rule 4: the widget never writes. The engine is the only writer, and a
        # write path out of the shell is what the crash was reached through.
        if re.search(r"\b(setText|writeAdapter|setData)\s*\(", stripped) or stripped.startswith("atomicWrites:"):
            failures.append(
                f"{path.name}:{lineno}: a write from the shell process.\n"
                f"    state.json and config.json have exactly one writer, the engine (rule 4)."
            )

        depth += line.count("{") - line.count("}")
        while depth_stack and depth <= depth_stack[-1][1]:
            depth_stack.pop()

    # Monospace Text commonly carries column-aligned ASCII whose trailing
    # spaces are structural. Qt trims those spaces before centring each line,
    # so AlignHCenter silently shears the grid row by row.
    for lineno, body in block_bodies(source, "Text"):
        if (re.search(r'^\s*font\.family:\s*["\']monospace["\']\s*$', body, re.M)
                and re.search(r"^\s*horizontalAlignment:\s*Text\.AlignHCenter\s*$", body, re.M)):
            failures.append(
                f"{path.name}:{lineno}: monospace Text uses Text.AlignHCenter.\n"
                f"    Qt trims trailing whitespace before centring each line, which\n"
                f"    shears fixed-column text. Left-align it inside a sized canvas."
            )

    # Rule 6, continued: and nothing spawns on a repeating schedule.
    #
    # A one-shot Timer restarted after an action is a settling delay and is
    # fine. A Timer that is `running: true` and reaches a spawning call is a
    # poll, and service status is not something to poll: it changes when
    # somebody installs or stops something, and that somebody is standing
    # right there.
    for lineno, body in block_bodies(source, "Timer"):
        if not SPAWNING_CALLS.search(body):
            continue
        if re.search(r"^\s*running:\s*true\s*$", body, re.M):
            failures.append(
                f"{path.name}:{lineno}: a Timer that is always running spawns a process.\n"
                f"    That is a poll. Bind the probe to what the user did, or use a\n"
                f"    one-shot timer that something restarts (rule 6)."
            )
        elif not re.search(r"^\s*repeat:\s*false\s*$", body, re.M):
            failures.append(
                f"{path.name}:{lineno}: a Timer spawns a process but does not declare\n"
                f"    `repeat: false`. A settling delay must say that it is one (rule 6)."
            )

    # PanelKeyCatcher runs BeforeItem and will otherwise consume keystrokes
    # before a descendant editor sees them. A focusable input and the catcher
    # therefore form a required pair with an active-focus blocked binding.
    if FOCUSABLE_INPUT.search(source):
        catchers = list(block_bodies(source, "PanelKeyCatcher"))
        guarded = any(re.search(r"^\s*blocked:\s*.*activeFocus\s*$", body, re.M)
                      for _, body in catchers)
        if not guarded:
            lineno = source[:FOCUSABLE_INPUT.search(source).start()].count("\n") + 1
            failures.append(
                f"{path.name}:{lineno}: focusable input without a PanelKeyCatcher\n"
                f"    `blocked` binding to activeFocus. A BeforeItem catcher would\n"
                f"    swallow the input's keystrokes."
            )


def check_blocking_reads(path: Path) -> None:
    """Rule 5: every FileView declares blockLoading.

    Note what this does and does not buy. Quickshell logs "Starting async load"
    for a FileView even with blockLoading set, so this does NOT make reads
    synchronous and does NOT by itself prevent the orphaned read in
    docs/POSTMORTEM-ORPHANED-READ.md -- an earlier version of this docstring
    claimed it did, and was wrong. What actually closes that hazard is owning
    every FileView from a component nothing can destroy (here, a Singleton).

    The rule is kept because blockLoading makes the first text() return data
    instead of an empty string, and because a FileView appearing without it is
    a signal that someone is adding file I/O without having read the postmortem.
    """
    text = path.read_text()
    for match in re.finditer(r"FileView\s*\{", text):
        start = match.end()
        depth = 1
        i = start
        while i < len(text) and depth:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1
        body = text[start:i]
        if not re.search(r"^\s*blockLoading:\s*true\s*$", body, re.M):
            lineno = text[:match.start()].count("\n") + 1
            failures.append(
                f"{path.name}:{lineno}: FileView without `blockLoading: true`.\n"
                f"    Also confirm this FileView is owned by something nothing destroys;\n"
                f"    that ownership, not this flag, is what prevents the orphaned read."
            )


# Given paths, check those; otherwise the plugin's own QML. The argument form
# exists so tests/test_lint.py can probe every rule with a deliberate violation,
# which the docstring above has always claimed and used to do only by hand.
qml = [Path(a) for a in sys.argv[1:]] or sorted(ROOT.glob("*.qml"))
if not qml:
    print("qml-lifecycle-lint: no QML files found", file=sys.stderr)
    sys.exit(1)

for f in qml:
    check(f)
    check_blocking_reads(f)

if failures:
    print("qml-lifecycle-lint: FAILED\n", file=sys.stderr)
    for f in failures:
        print("  " + f + "\n", file=sys.stderr)
    print("See docs/POSTMORTEM-ORPHANED-READ.md", file=sys.stderr)
    sys.exit(1)

print(f"qml-lifecycle-lint: clean ({len(qml)} QML files)")
