#!/usr/bin/env python3
"""Enforce the lifecycle rules from docs/POSTMORTEM-ORPHANED-READ.md.

Those rules exist because breaking them segfaulted the desktop shell in a crash
loop. Each of the four contributing conditions was individually defensible, so
review did not catch the combination. A linter does.
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

        depth += line.count("{") - line.count("}")
        while depth_stack and depth <= depth_stack[-1][1]:
            depth_stack.pop()


qml = sorted(ROOT.glob("*.qml"))
if not qml:
    print("qml-lifecycle-lint: no QML files found", file=sys.stderr)
    sys.exit(1)

for f in qml:
    check(f)

if failures:
    print("qml-lifecycle-lint: FAILED\n", file=sys.stderr)
    for f in failures:
        print("  " + f + "\n", file=sys.stderr)
    print("See docs/POSTMORTEM-ORPHANED-READ.md", file=sys.stderr)
    sys.exit(1)

print(f"qml-lifecycle-lint: clean ({len(qml)} QML files)")
