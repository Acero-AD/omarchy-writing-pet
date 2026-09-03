#!/usr/bin/env python3
"""Engine tests. Standard library only, no desktop, no shell, no network."""

import argparse
import importlib.machinery
import importlib.util
import os
import json
import sys
import tempfile
import time
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


class TestScalarSettings(TempConfig):
    """The panel displays these and cannot change them, so the CLI must."""

    def _run(self, action, value):
        # Through main(), which is the path a user actually takes: it is what
        # turns a ConfigError into an exit code instead of a traceback.
        return engine.main(["--config", str(self.path), "config", action, value])

    def test_set_goal_and_mascot_persist(self):
        self.write(json.dumps({"watch": ["/tmp"]}))
        self.assertEqual(self._run("set-goal", "800"), 0)
        self.assertEqual(self._run("set-mascot", "snail"), 0)
        saved = engine.Config.load(self.path)
        self.assertEqual(saved.values["goal"], 800)
        self.assertEqual(saved.values["mascot"], "snail")

    def test_a_bad_goal_is_refused_without_writing(self):
        self.write(json.dumps({"watch": ["/tmp"], "goal": 500}))
        self.assertEqual(self._run("set-goal", "abc"), 1)
        self.assertNotEqual(self._run("set-goal", "0"), 0,
                            "a zero goal must be refused, not saved")
        self.assertEqual(engine.Config.load(self.path).values["goal"], 500)

    def test_an_unknown_mascot_is_refused(self):
        self.write(json.dumps({"watch": ["/tmp"]}))
        self.assertEqual(self._run("set-mascot", "dragon"), 1)
        self.assertEqual(engine.Config.load(self.path).values["mascot"], "bird")

    def test_a_mascot_the_widget_cannot_draw_never_loads(self):
        self.write(json.dumps({"watch": ["/tmp"], "mascot": "dragon"}))
        with self.assertRaises(engine.ConfigError):
            engine.Config.load(self.path)


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


class TestRolloverAndResilience(TempConfig):
    def _engine(self, **over):
        values = {"watch": ["/tmp"], "goal": 100}
        values.update(over)
        self.write(json.dumps(values))
        e = engine.Engine(engine.Config.load(self.path), engine.Log(enabled=False))
        e.state_path = Path(self.dir.name) / "state.json"
        return e

    def test_rollover_archives_the_day_and_zeroes_today(self):
        e = self._engine()
        e.today = "2026-09-01"
        e.tracker.seed("/a.md", 1000)
        e.tracker.observe("/a.md", 1500)
        e.words = e.tracker.total()
        self.assertTrue(e.check_rollover("2026-09-02"))
        self.assertEqual(e.today, "2026-09-02")
        self.assertEqual(e.words, 0)
        self.assertEqual(e.history[-1], {"date": "2026-09-01", "words": 500, "goal": 100})

    def test_rollover_carries_baselines_so_nothing_is_recounted(self):
        e = self._engine()
        e.today = "2026-09-01"
        e.tracker.seed("/a.md", 1000)
        e.tracker.observe("/a.md", 1500)
        e.words = e.tracker.total()
        e.check_rollover("2026-09-02")
        self.assertEqual(e.tracker.total(), 0, "yesterday's words must not carry into today")
        e.tracker.observe("/a.md", 1600)
        self.assertEqual(e.tracker.total(), 100)

    def test_rollover_across_several_days_of_suspend(self):
        e = self._engine()
        e.today = "2026-09-01"
        e.tracker.seed("/a.md", 5000)
        self.assertTrue(e.check_rollover("2026-09-05"))
        self.assertEqual(e.tracker.total(), 0)

    def test_same_day_is_not_a_rollover(self):
        e = self._engine()
        e.today = "2026-09-02"
        self.assertFalse(e.check_rollover("2026-09-02"))

    def test_history_is_capped(self):
        e = self._engine()
        for i in range(engine.HISTORY_MAX + 25):
            e.today = f"d{i}"
            e.check_rollover(f"d{i + 1}")
        self.assertEqual(len(e.history), engine.HISTORY_MAX)

    def test_state_round_trips_through_disk(self):
        e = self._engine()
        e.tracker.seed("/a.md", 100)
        e.tracker.observe("/a.md", 350)
        e.words = e.tracker.total()
        e.write_state()

        again = self._engine()
        again.load_state(e.state_path)
        self.assertEqual(again.words, 250)
        again.tracker.observe("/a.md", 400)
        self.assertEqual(again.tracker.total(), 300, "restart must not re-count restored words")

    def test_a_missing_watch_path_does_not_crash_the_cycle(self):
        e = self._engine(watch=["/nonexistent/definitely/not/here"])
        e.cycle()  # must not raise
        self.assertEqual(e.words, 0)

    def test_an_unreadable_state_file_falls_back_to_a_fresh_day(self):
        e = self._engine()
        e.state_path.write_text("{ truncated")
        e.load_state(e.state_path)
        self.assertEqual(e.words, 0)
        self.assertEqual(e.today, engine.local_date())

    def test_written_state_matches_the_documented_contract(self):
        e = self._engine()
        e.tracker.seed("/a.md", 0)
        e.tracker.observe("/a.md", 42)
        e.words = e.tracker.total()
        e.write_state()
        payload = json.loads(e.state_path.read_text())
        for field in ("schema", "date", "goal", "wordsToday", "byOrigin",
                      "history", "mascot", "gateOpen", "updatedAt"):
            self.assertIn(field, payload, f"docs/STATE-FILE.md promises '{field}'")
        self.assertEqual(payload["schema"], 1)
        self.assertEqual(payload["wordsToday"], 42)
        self.assertNotIn("tracking", payload,
                         "the widget must not parse per-file bookkeeping")
        self.assertNotIn("/a.md", e.state_path.read_text(),
                         "no note path may reach the file the desktop shell reads")
        self.assertIn("/a.md", e.tracking_path.read_text())

    def test_state_is_published_before_the_first_cycle(self):
        """A reader must be able to tell a fresh engine from a stopped one."""
        e = self._engine()
        e.load_state(e.state_path)
        e.seed_baselines()
        e.write_state()
        payload = json.loads(e.state_path.read_text())
        self.assertLess(time.time() - payload["updatedAt"], 5,
                        "updatedAt must be fresh from startup, not from the first edit")

    def test_setting_state_path_moves_tracking_with_it(self):
        e = self._engine()
        self.assertEqual(e.tracking_path.parent, e.state_path.parent,
                         "a redirected engine must not write into the real state dir")
        self.assertEqual(e.tracking_path.name, "tracking.json")

    def test_the_old_single_file_layout_is_migrated(self):
        e = self._engine()
        e.state_path.write_text(json.dumps({
            "schema": 1, "date": engine.local_date(), "wordsToday": 250,
            "tracking": {"/a.md": [100, 350, 250]},
        }))
        again = self._engine()
        again.load_state(e.state_path)
        self.assertEqual(again.words, 250, "an upgrade must not lose today's count")
class TestFocusLogging(TempConfig):
    def _engine(self):
        self.write(json.dumps({"watch": ["/tmp"], "graceSeconds": 15}))
        lines = []
        e = engine.Engine(engine.Config.load(self.path),
                          lambda ev, **kw: lines.append((ev, kw)))
        return e, lines

    def test_repeated_events_for_the_same_app_log_once(self):
        e, lines = self._engine()
        for _ in range(5):
            e.set_focus("typora", now=1000.0)
        events = [ev for ev, _ in lines]
        self.assertEqual(events.count("gate.open"), 1)
        self.assertEqual(events.count("focus.change"), 0,
                         "a title change is not a focus change")

    def test_an_actual_app_change_still_logs(self):
        e, lines = self._engine()
        e.set_focus("typora", now=1000.0)
        e.set_focus("foot", now=1001.0)
        e.set_focus("foot", now=1002.0)
        changes = [kw for ev, kw in lines if ev == "focus.change"]
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]["app"], "foot")

    def test_grace_is_named_in_the_line(self):
        e, lines = self._engine()
        e.set_focus("typora", now=1000.0)
        e.set_focus("foot", now=1001.0)
        changes = [kw for ev, kw in lines if ev == "focus.change"]
        self.assertEqual(changes[0]["gate"], "open (grace)",
                         "the terminal did not open the gate; the grace window did")


class TestConfigReload(TempConfig):
    """The reload path must never credit words that were already on disk."""

    def test_a_newly_watched_vault_is_baselined_not_counted(self):
        vault = Path(self.dir.name) / "vault"
        vault.mkdir()
        (vault / "old.md").write_text("one two three four five six seven eight")

        self.write(json.dumps({"watch": [], "graceSeconds": 15}))
        e = engine.Engine(engine.Config.load(self.path), engine.Log(enabled=False))
        e.state_path = Path(self.dir.name) / "state.json"
        e.seed_baselines()
        self.assertEqual(e.tracker.total(), 0)

        # The user adds the vault; the engine reloads and re-seeds.
        self.write(json.dumps({"watch": [str(vault)], "graceSeconds": 15}))
        e.config = engine.Config.load(self.path)
        e.seed_baselines()
        self.assertEqual(e.tracker.total(), 0,
                         "existing notes in a newly watched vault are not today's writing")

        # Writing after the reload does count.
        (vault / "new.md").write_text("nine ten")
        e.set_focus("md.obsidian.Obsidian")
        e.cycle()
        self.assertEqual(e.tracker.total(), 2)

    def test_mtime_reports_zero_when_absent(self):
        cfg = engine.Config(path=Path(self.dir.name) / "nope.json")
        self.assertEqual(cfg.mtime(), 0.0)

    def test_mtime_moves_when_the_file_is_rewritten(self):
        self.write(json.dumps({"watch": []}))
        cfg = engine.Config.load(self.path)
        first = cfg.mtime()
        os.utime(self.path, (first + 10, first + 10))
        self.assertNotEqual(cfg.mtime(), first)


if __name__ == "__main__":
    unittest.main(verbosity=2)
