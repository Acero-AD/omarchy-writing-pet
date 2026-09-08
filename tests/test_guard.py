#!/usr/bin/env python3
"""Probe every security-guard rule with a deliberate violation.

The guard's value is entirely in what it rejects, and a guard can fail open in
ways a clean run never reveals. Two of the checks here were written, read,
looked correct, and did not bite: the forbidden-pattern scan needed a fixture
exemption that could not become a blanket one, and the engine-spawn check
passed a non-literal argument list because it matched only the sites that
already looked fine and never noticed one had gone missing. Both were found by
running the probes below, not by reading the script.

Each test builds a minimal tree, breaks one thing, and runs the real guard.
"""

import os
import shutil
import subprocess
import unittest
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GUARD = "scripts/security-guard.sh"
# Enough of a tree for every check: the engine, one runtime QML file with a
# command, plain JS, and a tests/ directory for the fixture-exemption rule.
TREE = ["scripts/security-guard.sh", "bin/writing-critter", "Control.qml",
        "Model.js", "tests/test_service.py"]


class GuardCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.tree = Path(self.dir.name)
        for rel in TREE:
            dest = self.tree / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / rel, dest)
        os.chmod(self.tree / GUARD, 0o755)

    def tearDown(self):
        self.dir.cleanup()

    def run_guard(self):
        return subprocess.run([str(self.tree / GUARD)], capture_output=True,
                              text=True, timeout=60, cwd=str(self.tree))

    def edit(self, rel, old, new):
        path = self.tree / rel
        text = path.read_text()
        self.assertIn(old, text, f"the probe's anchor is gone from {rel}")
        path.write_text(text.replace(old, new, 1))

    def assertClean(self):
        result = self.run_guard()
        self.assertEqual(result.returncode, 0,
                         f"the unmodified tree must pass:\n{result.stdout}\n{result.stderr}")

    def assertRejected(self, needle):
        result = self.run_guard()
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, 1, f"expected a rejection, got:\n{output}")
        self.assertIn(needle, output)


class TestTheBaseline(GuardCase):
    def test_the_unmodified_tree_passes(self):
        self.assertClean()

    def test_the_guard_reports_what_it_checked(self):
        self.assertIn("engine spawns limited to", self.run_guard().stdout)


class TestEngineSpawnVocabulary(GuardCase):
    """Task 8.1: what the engine itself may run, and with which arguments."""

    ARGV = '["systemctl", "--user", *args],'

    def test_systemctl_without_user_is_rejected(self):
        self.edit("bin/writing-critter", self.ARGV, '["systemctl", *args],')
        self.assertRejected("WITHOUT --user")

    def test_a_program_outside_the_allowlist_is_rejected(self):
        self.edit("bin/writing-critter", self.ARGV, '["/usr/bin/env", "systemctl", *args],')
        self.assertRejected("ENGINE PROGRAM NOT ON ALLOWLIST")

    def test_a_non_literal_argument_list_is_rejected(self):
        """The check must notice a spawn site vanishing, not just a bad one."""
        self.edit("bin/writing-critter", self.ARGV, "args,")
        self.assertRejected("NOT A LITERAL ARGUMENT LIST")

    def test_a_path_on_a_command_line_is_rejected(self):
        self.edit("bin/writing-critter", self.ARGV,
                  '["systemctl", "--user", "--root", "/etc", *args],')
        self.assertRejected("PASSES A PATH ON A COMMAND LINE")

    def test_a_systemctl_verb_outside_the_fixed_set_is_rejected(self):
        self.edit("bin/writing-critter", 'return self._call(["reset-failed", UNIT_NAME])',
                  'return self._call(["kill", UNIT_NAME])')
        self.assertRejected("SYSTEMCTL VERB NOT ON ALLOWLIST")

    def test_shell_true_is_rejected(self):
        self.edit("bin/writing-critter", "timeout=self.timeout,",
                  "timeout=self.timeout, shell=True,")
        self.assertRejected("ENGINE RUNS A SHELL")

    def test_every_other_way_of_reaching_a_shell_is_rejected_too(self):
        """subprocess.run is not the only door; these are the rest of them."""
        for injected in ("os.system('systemctl --user daemon-reload')",
                         "os.popen('systemctl --user show')",
                         "subprocess.getoutput('systemctl --user show')"):
            with self.subTest(injected=injected):
                self.tearDown()
                self.setUp()
                self.edit("bin/writing-critter", "UNIT_NAME = ",
                          f"_ = {injected}\nUNIT_NAME = ")
                self.assertRejected("ENGINE RUNS A SHELL")


class TestForbiddenPatterns(GuardCase):
    def test_a_forbidden_pattern_in_runtime_code_is_rejected(self):
        self.edit("Control.qml", "property bool available: true",
                  'property string escalate: "pkexec"\n    property bool available: true')  # security-guard: fixture
        self.assertRejected("FORBIDDEN PATTERN")

    def test_an_unmarked_forbidden_pattern_in_a_test_is_rejected(self):
        path = self.tree / "tests" / "test_service.py"
        path.write_text(path.read_text() + "\n# polkit\n")  # security-guard: fixture
        self.assertRejected("FORBIDDEN PATTERN")

    def test_a_marked_fixture_in_a_test_is_allowed(self):
        path = self.tree / "tests" / "test_service.py"
        marked = "\nFIXTURE = 'polkit'  # security-guard: fixture\n"  # security-guard: fixture
        path.write_text(path.read_text() + marked)
        self.assertClean()

    def test_the_fixture_marker_does_not_exempt_runtime_code(self):
        self.edit("Control.qml", "property bool available: true",
                  'property string x: "pkexec"  // security-guard: fixture\n'  # security-guard: fixture
                  "    property bool available: true")
        self.assertRejected("FORBIDDEN PATTERN")


class TestShellCommandAllowlist(GuardCase):
    def test_a_foreign_program_in_qml_is_rejected(self):
        self.edit("Control.qml", "command: [root.enginePath].concat(root.current.argv)",
                  'command: ["systemctl", "--user", "restart", "writing-critter.service"]')
        self.assertRejected("COMMAND NOT ON ALLOWLIST")

    def test_an_unresolvable_program_in_qml_is_rejected(self):
        self.edit("Control.qml", "command: [root.enginePath].concat(root.current.argv)",
                  "command: [someOtherThing].concat(root.current.argv)")
        self.assertRejected("COMMAND NOT ON ALLOWLIST")


if __name__ == "__main__":
    unittest.main()
