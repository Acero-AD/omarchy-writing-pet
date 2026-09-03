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

failures = []


def check(path: Path) -> None:
    lines = path.read_text().splitlines()
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

        # Rule 3: the shell process runs no subprocesses. Counting lives in the
        # engine; a Process here is the architecture leaking back in.
        if re.match(r"^Process\s*\{", stripped) or re.search(r"\b(startDetached|exec)\s*\(", stripped):
            failures.append(
                f"{path.name}:{lineno}: process execution in the shell.\n"
                f"    All subprocess work belongs in bin/writing-critter (rule 3)."
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


qml = sorted(ROOT.glob("*.qml"))
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
