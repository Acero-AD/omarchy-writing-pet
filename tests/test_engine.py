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
