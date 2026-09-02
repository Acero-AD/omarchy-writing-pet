#!/usr/bin/env python3
"""Engine tests. Standard library only, no desktop, no shell, no network."""

import importlib.machinery
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

# The engine is an extensionless executable, so it needs an explicit loader.
ROOT = Path(__file__).resolve().parent.parent
_loader = importlib.machinery.SourceFileLoader("engine", str(ROOT / "bin" / "writing-critter"))
_spec = importlib.util.spec_from_file_location("engine", _loader.path, loader=_loader)
engine = importlib.util.module_from_spec(_spec)
# Register before exec: dataclasses resolves annotations through sys.modules.
sys.modules["engine"] = engine
_loader.exec_module(engine)


class TempConfig(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "config.json"

    def tearDown(self):
        self.dir.cleanup()

    def write(self, text):
        self.path.write_text(text)


class TestConfigLoading(TempConfig):
    def test_missing_file_yields_defaults(self):
        cfg = engine.Config.load(self.path)
        self.assertEqual(cfg.values["goal"], engine.DEFAULTS["goal"])
        self.assertEqual(cfg.values["watch"], [])

    def test_user_values_override_defaults(self):
        self.write(json.dumps({"goal": 750, "mascot": "snail"}))
        cfg = engine.Config.load(self.path)
        self.assertEqual(cfg.values["goal"], 750)
        self.assertEqual(cfg.values["mascot"], "snail")
        self.assertEqual(cfg.values["graceSeconds"], engine.DEFAULTS["graceSeconds"])

    def test_malformed_json_reports_position_and_does_not_overwrite(self):
        original = '{"goal": 750,,}'
        self.write(original)
        with self.assertRaises(engine.ConfigError) as ctx:
            engine.Config.load(self.path)
        self.assertIn(str(self.path), str(ctx.exception))
        self.assertIn("line", str(ctx.exception))
        self.assertEqual(self.path.read_text(), original, "must not rewrite an unparseable config")

    def test_non_object_rejected(self):
        self.write("[1,2,3]")
        with self.assertRaises(engine.ConfigError):
            engine.Config.load(self.path)

    def test_unknown_keys_rejected(self):
        self.write(json.dumps({"goal": 500, "gaol": 500}))
        with self.assertRaises(engine.ConfigError) as ctx:
            engine.Config.load(self.path)
        self.assertIn("gaol", str(ctx.exception))

    def test_type_validation(self):
        for bad in ({"goal": 0}, {"goal": "many"}, {"watch": "x"}, {"whitelist": [1]}, {"netMode": "sideways"}):
            self.write(json.dumps(bad))
            with self.assertRaises(engine.ConfigError, msg=f"should reject {bad}"):
                engine.Config.load(self.path)


class TestCadence(TempConfig):
    def test_poll_is_clamped(self):
        for given, want in ((0, engine.POLL_MIN), (2, 2), (9999, engine.POLL_MAX)):
            self.write(json.dumps({"pollSeconds": given}))
            self.assertEqual(engine.Config.load(self.path).poll_seconds, want)

    def test_lookback_always_exceeds_poll(self):
        # A save landing on a tick boundary is missed if the window does not overlap.
        for poll, lookback in ((2, 3), (5, 3), (2, 2), (10, 1)):
            self.write(json.dumps({"pollSeconds": poll, "lookbackSeconds": lookback}))
            cfg = engine.Config.load(self.path)
            self.assertGreater(cfg.lookback_seconds, cfg.poll_seconds, f"poll={poll} lookback={lookback}")


class TestAtomicWrite(TempConfig):
    def test_rename_leaves_no_partial_file(self):
        target = Path(self.dir.name) / "state.json"
        engine.write_atomic(target, '{"a":1}')
        self.assertEqual(json.loads(target.read_text()), {"a": 1})
        self.assertFalse(target.with_name(target.name + ".tmp").exists(), "temp file must be renamed away")

    def test_overwrite_is_complete(self):
        target = Path(self.dir.name) / "state.json"
        engine.write_atomic(target, '{"v":1}')
        engine.write_atomic(target, '{"v":2}')
        self.assertEqual(json.loads(target.read_text()), {"v": 2})

    def test_creates_missing_parent(self):
        target = Path(self.dir.name) / "deep" / "nested" / "state.json"
        engine.write_atomic(target, "{}")
        self.assertTrue(target.exists())


class TestBlockingReason(TempConfig):
    def _engine(self, values):
        self.write(json.dumps(values))
        return engine.Engine(engine.Config.load(self.path), engine.Log(enabled=False))

    def test_no_watch_paths_is_explained(self):
        reason = self._engine({"watch": []}).blocking_reason()
        self.assertIsNotNone(reason)
        self.assertIn("watch", reason)
        self.assertIn("add-path", reason, "must name the command that fixes it")

    def test_no_apps_is_explained(self):
        reason = self._engine({"watch": ["/tmp"], "whitelist": []}).blocking_reason()
        self.assertIsNotNone(reason)
        self.assertIn("add-app", reason)

    def test_configured_engine_is_not_blocked(self):
        self.assertIsNone(self._engine({"watch": ["/tmp"]}).blocking_reason())


class TestConfigCommands(TempConfig):
    def run_cli(self, *argv):
        return engine.main(["--config", str(self.path), *argv])

    def test_add_and_remove_app_round_trip(self):
        self.assertEqual(self.run_cli("config", "add-app", "kate"), 0)
        self.assertIn("kate", engine.Config.load(self.path).values["whitelist"])
        self.assertEqual(self.run_cli("config", "remove-app", "kate"), 0)
        self.assertNotIn("kate", engine.Config.load(self.path).values["whitelist"])

    def test_removing_absent_entry_fails_loudly(self):
        self.assertEqual(self.run_cli("config", "remove-app", "nonexistent"), 1)

    def test_add_path_is_absolute(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.run_cli("config", "add-path", d), 0)
            stored = engine.Config.load(self.path).values["watch"]
            self.assertEqual(len(stored), 1)
            self.assertTrue(Path(stored[0]).is_absolute())

    def test_add_path_is_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            self.run_cli("config", "add-path", d)
            self.run_cli("config", "add-path", d)
            self.assertEqual(len(engine.Config.load(self.path).values["watch"]), 1)

    def test_config_survives_round_trip_through_disk(self):
        self.run_cli("config", "add-app", "kate")
        reloaded = engine.Config.load(self.path)
        reloaded.validate()  # must not raise: what we write, we can read


class TestStateReading(unittest.TestCase):
    def test_missing_state_is_not_an_error(self):
        original = engine.STATE_PATH
        try:
            engine.STATE_PATH = Path("/nonexistent/writing-critter/state.json")
            self.assertIsNone(engine.read_state())
        finally:
            engine.STATE_PATH = original

    def test_torn_state_is_not_an_error(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "state.json"
            p.write_text('{"wordsToday": 4')  # truncated mid-write
            original = engine.STATE_PATH
            try:
                engine.STATE_PATH = p
                self.assertIsNone(engine.read_state(), "a torn read must not raise")
            finally:
                engine.STATE_PATH = original


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestTracker(unittest.TestCase):
    def test_seeding_an_existing_vault_contributes_nothing(self):
        t = engine.Tracker()
        t.seed("/vault/old.md", 200000)
        self.assertEqual(t.total(), 0)

    def test_a_file_created_while_watching_counts_in_full(self):
        # The e2e test caught this: a brand new note you just wrote is not the
        # same as a vault that was already there.
        t = engine.Tracker()
        t.observe("/vault/new.md", 10)
        self.assertEqual(t.total(), 10)

    def test_words_added_after_a_baseline_are_counted(self):
        t = engine.Tracker()
        t.seed("/a.md", 1000)
        t.observe("/a.md", 1412)
        self.assertEqual(t.total(), 412)

    def test_recount_is_idempotent(self):
        t = engine.Tracker()
        t.seed("/a.md", 1000)
        t.observe("/a.md", 1412)
        t.observe("/a.md", 1412)
        t.observe("/a.md", 1412)
        self.assertEqual(t.total(), 412)

    def test_deleting_never_reduces_the_total(self):
        t = engine.Tracker()
        t.seed("/a.md", 0)
        t.observe("/a.md", 800)
        t.observe("/a.md", 500)
        self.assertEqual(t.total(), 800, "the critter must never walk backwards")

    def test_net_mode_does_subtract(self):
        t = engine.Tracker()
        t.seed("/a.md", 0)
        t.observe("/a.md", 800, "net")
        t.observe("/a.md", 500, "net")
        self.assertEqual(t.total(), 500)

    def test_seed_does_not_clobber_a_known_file(self):
        t = engine.Tracker()
        t.seed("/a.md", 0)
        t.observe("/a.md", 300)
        t.seed("/a.md", 300)  # a later seeding pass must not erase progress
        self.assertEqual(t.total(), 300)

    def test_forget_and_rebase(self):
        t = engine.Tracker()
        t.seed("/a.md", 100); t.observe("/a.md", 400)
        t.seed("/b.md", 0); t.observe("/b.md", 60)
        self.assertEqual(t.total(), 360)
        t.forget("/b.md")
        self.assertEqual(t.total(), 300)
        t.rebase("/a.md")
        self.assertEqual(t.total(), 0)

    def test_carry_forward_zeroes_today_but_keeps_baselines(self):
        t = engine.Tracker()
        t.seed("/a.md", 1000); t.observe("/a.md", 1500)
        nxt = t.carry_forward()
        self.assertEqual(nxt.total(), 0)
        self.assertEqual(nxt.files["/a.md"].base, 1500)
        nxt.observe("/a.md", 1600)
        self.assertEqual(nxt.total(), 100)

    def test_json_round_trip(self):
        t = engine.Tracker()
        t.seed("/a.md", 100); t.observe("/a.md", 250)
        again = engine.Tracker.from_json(t.to_json())
        self.assertEqual(again.total(), t.total())
        self.assertEqual(engine.Tracker.from_json("garbage").total(), 0)


class TestWordCounting(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(engine.count_words("the cat sat on the mat"), 6)
        self.assertEqual(engine.count_words("  spaced \n out \t here "), 3)

    def test_empty(self):
        self.assertEqual(engine.count_words(""), 0)
        self.assertEqual(engine.count_words("   \n\t "), 0)

    def test_punctuation_does_not_split(self):
        self.assertEqual(engine.count_words("Hello, world! It's fine."), 4)

    def test_cjk_counted_per_character(self):
        self.assertEqual(engine.count_words("日本語"), 3)
        self.assertEqual(engine.count_words("hello 日本語 world"), 5)


class TestAppMatching(unittest.TestCase):
    def test_exact_case_insensitive(self):
        self.assertTrue(engine.app_matches("typora", "typora"))
        self.assertTrue(engine.app_matches("Typora", "typora"))

    def test_short_name_matches_reverse_dns(self):
        # The real bug: Obsidian's Wayland app id is md.obsidian.Obsidian, so a
        # whitelist saying "obsidian" matched nothing and the critter never woke.
        self.assertTrue(engine.app_matches("obsidian", "md.obsidian.Obsidian"))
        self.assertTrue(engine.app_matches("bar", "com.github.foo.Bar"))

    def test_dotted_entry_is_exact(self):
        self.assertTrue(engine.app_matches("md.obsidian.Obsidian", "md.obsidian.Obsidian"))
        self.assertFalse(engine.app_matches("md.obsidian.Obsidian", "org.other.Obsidian"))

    def test_substring_never_matches(self):
        self.assertFalse(engine.app_matches("write", "omawrite"))
        self.assertFalse(engine.app_matches("obsidian", "md.obsidian.Helper.Thing"))

    def test_empty_inputs(self):
        self.assertFalse(engine.app_matches("", "typora"))
        self.assertFalse(engine.app_matches("typora", ""))

    def test_defaults_wake_on_real_app_ids(self):
        wl = engine.DEFAULTS["whitelist"]
        for app in ("md.obsidian.Obsidian", "typora", "omawrite", "libreoffice-writer"):
            self.assertTrue(engine.app_in_list(wl, app), app)
        for app in ("zen", "foot", "steam_app_1331550"):
            self.assertFalse(engine.app_in_list(wl, app), f"{app} must not wake the critter")


class TestGate(TempConfig):
    def _engine(self, **over):
        values = {"watch": ["/tmp"], "graceSeconds": 15}
        values.update(over)
        self.write(json.dumps(values))
        return engine.Engine(engine.Config.load(self.path), engine.Log(enabled=False))

    def test_closed_before_any_focus(self):
        self.assertFalse(self._engine().gate_open(now=1000))

    def test_open_while_writing_app_focused(self):
        e = self._engine()
        e.set_focus("md.obsidian.Obsidian", now=1000)
        self.assertTrue(e.gate_open(now=1000))

    def test_closed_for_browser_and_terminal(self):
        e = self._engine()
        for app in ("zen", "foot"):
            e.last_writing_at = 0.0
            e.set_focus(app, now=1000)
            self.assertFalse(e.gate_open(now=1000), app)

    def test_grace_keeps_gate_open_briefly_after_focus_leaves(self):
        # Editors autosave a beat after focus leaves; a strict gate drops it.
        e = self._engine()
        e.set_focus("typora", now=1000)
        e.set_focus("zen", now=1005)
        self.assertTrue(e.gate_open(now=1005), "within grace")
        self.assertTrue(e.gate_open(now=1014), "still within grace")

    def test_grace_expires(self):
        e = self._engine()
        e.set_focus("typora", now=1000)
        e.set_focus("zen", now=1001)
        self.assertFalse(e.gate_open(now=1016), "grace has expired")

    def test_gate_stays_closed_without_watch_paths(self):
        e = self._engine(watch=[])
        e.set_focus("typora", now=1000)
        self.assertFalse(e.gate_open(now=1000), "nothing to count means nothing to do")

    def test_refresh_detects_grace_expiry_without_a_focus_change(self):
        e = self._engine()
        e.set_focus("typora", now=1000)
        e.set_focus("zen", now=1001)
        self.assertTrue(e.refresh_gate(now=1005))
        self.assertFalse(e.refresh_gate(now=1020))

    def test_no_work_is_attempted_while_the_gate_is_closed(self):
        e = self._engine()
        calls = []
        e.cycle = lambda: calls.append(1)
        e.set_focus("zen", now=1000)
        if e.refresh_gate(now=1000):
            e.cycle()
        self.assertEqual(calls, [], "a closed gate must spawn no work at all")
