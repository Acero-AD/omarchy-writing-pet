"""Probe every lifecycle rule with a deliberate violation.

The linter's own docstring has always claimed each rule was verified by breaking
it. That was done by hand. Rule 3 now has real logic -- resolving which program
a `command:` will run -- so it gets a test that fails when the rule stops
biting, not just when the sources are clean.
"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

LINT = str(Path(__file__).resolve().parent.parent / "scripts" / "qml-lifecycle-lint.py")


class LintCase(unittest.TestCase):
    def lint(self, source: str, name: str = "Probe.qml"):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / name
            path.write_text(source)
            return subprocess.run([sys.executable, LINT, str(path)],
                                  capture_output=True, text=True, timeout=30)

    def assertRejected(self, source, needle, name="Probe.qml"):
        result = self.lint(source, name)
        self.assertEqual(result.returncode, 1, f"expected a failure, got:\n{result.stdout}")
        self.assertIn(needle, result.stdout + result.stderr)

    def assertAccepted(self, source, name="Probe.qml"):
        result = self.lint(source, name)
        self.assertEqual(result.returncode, 0, f"expected clean, got:\n{result.stderr}")


SINGLETON = "pragma Singleton\nimport Quickshell\nimport Quickshell.Io\n"
PLAIN = "import QtQuick\nimport Quickshell.Io\n"


class TestProcessOwnership(LintCase):
    def test_process_in_a_plain_component_is_rejected(self):
        self.assertRejected(PLAIN + '''
Item {
    Process {
        command: ["writing-critter", "config", "show"]
    }
}
''', "Process outside a singleton")

    def test_process_in_a_singleton_is_allowed(self):
        self.assertAccepted(SINGLETON + '''
Singleton {
    Process {
        command: ["writing-critter", "config", "show"]
    }
}
''')

    def test_start_detached_is_rejected_even_in_a_singleton(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    function go() { Quickshell.execDetached(["writing-critter"]); }
    Process { command: ["writing-critter"]; function f() { this.startDetached(); } }
}
''', "startDetached")


class TestProgramAllowlist(LintCase):
    def test_a_foreign_program_is_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Process {
        command: ["sh", "-c", "writing-critter config show"]
    }
}
''', "runs 'sh'")

    def test_an_absolute_path_to_the_engine_is_allowed(self):
        self.assertAccepted(SINGLETON + '''
Singleton {
    Process {
        command: ["/home/someone/.local/bin/writing-critter", "config", "show"]
    }
}
''')

    def test_an_absolute_path_to_something_else_is_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Process {
        command: ["/usr/bin/rm", "-rf", "/"]
    }
}
''', "runs 'rm'")

    def test_a_property_resolving_to_the_engine_is_allowed(self):
        self.assertAccepted(SINGLETON + '''
Singleton {
    id: root
    readonly property string program: "writing-critter"
    Process {
        command: [root.program, "config", "show"]
    }
}
''')

    def test_a_property_resolving_to_something_else_is_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    id: root
    readonly property string program: "/usr/bin/env"
    Process {
        command: [root.program, "writing-critter"]
    }
}
''', "runs 'env'")

    def test_an_unresolvable_program_is_rejected_not_assumed_safe(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Process {
        command: [someExternalThing.whatever, "config", "show"]
    }
}
''', "cannot determine the program")

    def test_a_property_with_two_possible_programs_is_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    id: root
    readonly property string program: root.useSh ? "sh" : "writing-critter"
    Process {
        command: [root.program, "config", "show"]
    }
}
''', "could be any of")


class TestConcatenatedArgumentLists(LintCase):
    """The shape a queued command takes: one literal program, arguments appended.

    Splitting the argument list on its first comma used to swallow this whole
    expression -- there is no comma in `[enginePath].concat(argv)` -- and report
    the command as unreadable. That failed closed, which is the right direction,
    but it also meant the rule could not be satisfied by the one shape the
    plugin actually needs.
    """

    def test_the_engine_with_appended_arguments_is_allowed(self):
        self.assertAccepted(SINGLETON + '''
Singleton {
    readonly property string enginePath: "/plugins/writing-critter/bin/writing-critter"
    property var current: ({ argv: [] })
    Process {
        command: [root.enginePath].concat(root.current.argv)
    }
}
''')

    def test_a_foreign_program_with_appended_arguments_is_still_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Process {
        command: ["/usr/bin/systemctl"].concat(root.current.argv)
    }
}
''', "runs 'systemctl'")

    def test_an_unreadable_program_with_appended_arguments_is_still_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Process {
        command: [somethingElse].concat(root.current.argv)
    }
}
''', "cannot determine the program")

    def test_a_second_process_running_something_else_is_rejected(self):
        """Setup must not introduce a second executable path into the shell."""
        self.assertRejected(SINGLETON + '''
Singleton {
    readonly property string enginePath: "/plugins/writing-critter/bin/writing-critter"
    Process {
        command: [root.enginePath].concat(root.current.argv)
    }
    Process {
        id: installer
        command: ["/bin/sh", "install.sh"]
    }
}
''', "runs 'sh'")


class TestNothingSpawnsBeforeSomeoneAsks(LintCase):
    """Rule 6. Loading the plugin must cost nothing.

    The status probe puts a process on the CPU, and the bar builds one widget
    per screen. Bound to construction that is a process per screen per shell
    start, for a question nobody asked; bound to a repeating timer it is a poll
    of something that only changes when a person installs or stops something.
    """

    def test_spawning_from_construction_is_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Component.onCompleted: root.refreshServiceStatus()
}
''', "spawned from construction")

    def test_spawning_a_config_action_from_construction_is_rejected_too(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Component.onCompleted: root.run("set-goal", 500)
}
''', "spawned from construction")

    def test_reading_a_file_from_construction_is_still_allowed(self):
        """The state and config reads are not processes and never were."""
        self.assertAccepted(SINGLETON + '''
Singleton {
    Component.onCompleted: root.readConfig()
    FileView {
        blockLoading: true
    }
}
''')

    def test_a_permanently_running_timer_that_spawns_is_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    Timer {
        interval: 2000
        running: true
        repeat: true
        onTriggered: root.refreshServiceStatus()
    }
}
''', "always running spawns a process")

    def test_a_spawning_timer_must_declare_that_it_is_one_shot(self):
        """QML defaults repeat to false; a reader should not have to know."""
        self.assertRejected(SINGLETON + '''
Singleton {
    Timer {
        interval: 3000
        onTriggered: root.refreshServiceStatus()
    }
}
''', "does not declare")

    def test_a_declared_one_shot_settling_timer_is_allowed(self):
        self.assertAccepted(SINGLETON + '''
Singleton {
    Timer {
        interval: 3000
        repeat: false
        onTriggered: root.refreshServiceStatus()
    }
}
''')

    def test_a_repeating_timer_that_spawns_nothing_is_untouched(self):
        self.assertAccepted(SINGLETON + '''
Singleton {
    Timer {
        interval: 1000
        running: true
        repeat: true
        onTriggered: root.readNow()
    }
}
''')


class TestRulesThatDidNotChange(LintCase):
    def test_loader_active_binding_is_still_rejected(self):
        self.assertRejected(PLAIN + '''
Item {
    Loader {
        active: root.someLateValue !== null
    }
}
''', "Loader.active is a binding")

    def test_preload_is_still_rejected(self):
        self.assertRejected(PLAIN + '''
Item {
    FileView {
        blockLoading: true
        preload: true
    }
}
''', "preload")

    def test_adapter_is_still_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    FileView {
        blockLoading: true
        JsonAdapter { property int goal: 500 }
    }
}
''', "adapter")

    def test_writes_are_still_rejected_in_a_singleton(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    FileView {
        id: f
        blockLoading: true
        function save() { f.setText("{}"); }
    }
}
''', "a write from the shell process")

    def test_fileview_without_block_loading_is_still_rejected(self):
        self.assertRejected(SINGLETON + '''
Singleton {
    FileView { path: "/tmp/x" }
}
''', "blockLoading")


class TestPresentationAndInputRules(LintCase):
    def test_centered_monospace_text_is_rejected(self):
        self.assertRejected(PLAIN + '''
Item {
    Text {
        font.family: "monospace"
        horizontalAlignment: Text.AlignHCenter
    }
}
''', "trims trailing whitespace")

    def test_left_aligned_monospace_text_is_allowed(self):
        self.assertAccepted(PLAIN + '''
Item {
    Text {
        font.family: "monospace"
        horizontalAlignment: Text.AlignLeft
    }
}
''')

    def test_focusable_input_without_blocked_catcher_is_rejected(self):
        self.assertRejected(PLAIN + '''
Item {
    PanelKeyCatcher { }
    NumberField { }
}
''', "focusable input")

    def test_focusable_input_with_blocked_catcher_is_allowed(self):
        self.assertAccepted(PLAIN + '''
Item {
    property var goalField
    PanelKeyCatcher {
        blocked: goalField.field.activeFocus
    }
    NumberField { }
}
''')


class TestKnownBlindSpots(LintCase):
    """The linter is line-oriented, not a QML parser, and its docstring says so.

    Pinned here rather than left as prose: if someone makes it a real parser,
    these tests fail and the docstring gets corrected with them.
    """

    def test_a_violation_folded_onto_one_line_is_missed(self):
        result = self.lint(PLAIN + '''
Item {
    FileView { blockLoading: true; preload: true }
}
''')
        self.assertNotIn("preload", result.stderr,
                         "linter got smarter -- update its docstring and drop this test")


if __name__ == "__main__":
    unittest.main(verbosity=2)
