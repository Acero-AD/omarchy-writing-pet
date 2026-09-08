#!/usr/bin/env python3
"""Service-management tests. No systemd, no network, no writes outside a tmpdir.

Every destination is redirected into a temporary directory and systemctl is
replaced by a fake, but only at the point where it would spawn a process: the
fake subclasses Systemctl and overrides `_call`, so the real methods still build
the real argument lists and the tests assert on those. A change that made this
plugin escalate privilege, or shell out, or pass a path it was handed, would
have to get past assertions on the exact argv.
"""

import argparse
import contextlib
import importlib.machinery
import importlib.util
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fixtures_systemctl as fx  # noqa: E402

_loader = importlib.machinery.SourceFileLoader("engine", str(ROOT / "bin" / "writing-critter"))
_spec = importlib.util.spec_from_file_location("engine", _loader.path, loader=_loader)
engine = importlib.util.module_from_spec(_spec)
sys.modules["engine"] = engine
_loader.exec_module(engine)


class FakeSystemctl(engine.Systemctl):
    """A user service manager in about forty lines.

    Only `_call` is replaced, so `show`, `enable`, `restart` and the rest still
    compose the argument lists the real ones do and every test sees them.
    """

    def __init__(self, unit_path: Path, active: str = "inactive", enabled: bool = False) -> None:
        super().__init__(timeout=0.5)
        self.unit_path = unit_path
        self.active = active
        self.enabled = enabled
        self.enter_monotonic = 0
        self.calls: list[list[str]] = []
        # verb -> message. A verb listed here fails every time it is called.
        self.fail: dict[str, str] = {}
        # What ExecStart does. "run" stays active; "die" fails immediately, the
        # way a Type=simple unit does when its program exits non-zero.
        self.exec_result = "run"
        self.unavailable = ""

    @property
    def verbs(self) -> list[str]:
        return [c[0] for c in self.calls]

    def _call(self, args):
        self.calls.append(list(args))
        verb = args[0]
        if self.unavailable:
            return False, "", self.unavailable
        if verb in self.fail:
            return False, "", f"systemctl {verb}: {self.fail[verb]}"

        if verb == "show":
            loaded = self.unit_path.exists()
            body = (
                f"LoadState={'loaded' if loaded else 'not-found'}\n"
                f"ActiveState={self.active if loaded else 'inactive'}\n"
                f"SubState={'running' if self.active == 'active' else 'dead'}\n"
                f"UnitFileState={'enabled' if (loaded and self.enabled) else ('disabled' if loaded else '')}\n"
                f"ActiveEnterTimestampMonotonic={self.enter_monotonic}\n"
                "Result=success\n"
            )
            return True, body, ""
        if verb in ("start", "restart"):
            if not self.unit_path.exists():
                return False, "", f"systemctl {verb}: Unit {engine.UNIT_NAME} not found."
            if self.exec_result == "die":
                self.active = "failed"
            else:
                self.active = "active"
                self.enter_monotonic = int(time.clock_gettime(time.CLOCK_MONOTONIC) * 1_000_000)
            return True, "", ""
        if verb == "stop":
            self.active = "inactive"
            return True, "", ""
        if verb == "enable":
            if not self.unit_path.exists():
                return False, "", f"systemctl enable: Unit file {engine.UNIT_NAME} does not exist."
            self.enabled = True
            return True, "", ""
        if verb == "disable":
            self.enabled = False
            return True, "", ""
        if verb in ("daemon-reload", "reset-failed"):
            return True, "", ""
        raise AssertionError(f"the fake was asked for an unknown verb: {verb!r}")


class ServiceCase(unittest.TestCase):
    """A whole XDG world in a temporary directory, including a plugin checkout."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.home = Path(self.dir.name)

        self.checkout = self.home / "checkout"
        (self.checkout / "bin").mkdir(parents=True)
        (self.checkout / "contrib").mkdir(parents=True)
        self.source_engine = self.checkout / "bin" / "writing-critter"
        self.source_unit = self.checkout / "contrib" / engine.UNIT_NAME
        self.source_engine.write_bytes(b'#!/usr/bin/env python3\nVERSION = "9.9.9"\n')
        self.source_unit.write_bytes(b"[Service]\nExecStart=%h/.local/bin/writing-critter run\n")

        self.engine_dest = self.home / ".local" / "bin" / "writing-critter"
        self.unit_dest = self.home / ".config" / "systemd" / "user" / engine.UNIT_NAME
        self.state = self.home / ".local" / "state" / "writing-critter" / "state.json"
        self.config = self.home / ".config" / "writing-critter" / "config.json"
        self.tracking = self.state.with_name("tracking.json")

        self.paths = engine.ServicePaths(
            source_engine=self.source_engine,
            source_unit=self.source_unit,
            engine=self.engine_dest,
            unit=self.unit_dest,
            state=self.state,
        )
        self.sc = FakeSystemctl(self.unit_dest)

    def tearDown(self):
        self.dir.cleanup()

    # -------------------------------------------------------------- helpers

    def install_files(self, engine_bytes=None, unit_bytes=None):
        """Put files at the destinations without going through install()."""
        self.engine_dest.parent.mkdir(parents=True, exist_ok=True)
        self.unit_dest.parent.mkdir(parents=True, exist_ok=True)
        self.engine_dest.write_bytes(
            self.source_engine.read_bytes() if engine_bytes is None else engine_bytes)
        self.engine_dest.chmod(0o755)
        self.unit_dest.write_bytes(
            self.source_unit.read_bytes() if unit_bytes is None else unit_bytes)
        self.unit_dest.chmod(0o644)

    def publish_state(self, age_seconds=0.0):
        self.state.parent.mkdir(parents=True, exist_ok=True)
        self.state.write_text(json.dumps({"updatedAt": time.time() - age_seconds}))

    def write_user_data(self):
        """Config, state and tracking, with contents worth not losing."""
        self.config.parent.mkdir(parents=True, exist_ok=True)
        self.config.write_text(json.dumps({"goal": 750, "watch": ["/notes"]}))
        self.publish_state()
        self.tracking.write_text(json.dumps({"files": {"/notes/a.md": [1, 2, 3]}}))
        return {p: p.read_bytes() for p in (self.config, self.state, self.tracking)}

    def assert_user_data_intact(self, before):
        for path, data in before.items():
            self.assertTrue(path.exists(), f"{path.name} was removed")
            self.assertEqual(path.read_bytes(), data, f"{path.name} was modified")

    def status(self):
        return engine.service_status(self.paths, self.sc)


# ------------------------------------------------------------------- status


class TestStatusStates(ServiceCase):
    def test_nothing_installed(self):
        st = self.status()
        self.assertEqual(st["state"], "not-installed")
        self.assertFalse(st["installed"])
        self.assertEqual(st["installedVersion"], "")
        self.assertEqual(st["schema"], engine.SERVICE_SCHEMA)

    def test_only_the_engine_is_installed(self):
        self.engine_dest.parent.mkdir(parents=True)
        self.engine_dest.write_bytes(self.source_engine.read_bytes())
        self.assertEqual(self.status()["state"], "not-installed")

    def test_only_the_unit_is_installed(self):
        self.unit_dest.parent.mkdir(parents=True)
        self.unit_dest.write_bytes(self.source_unit.read_bytes())
        self.assertEqual(self.status()["state"], "not-installed")

    def test_engine_drift_is_update_available(self):
        self.install_files(engine_bytes=b'VERSION = "0.0.1"\n')
        self.sc.active, self.sc.enabled = "active", True
        self.publish_state()
        st = self.status()
        self.assertEqual(st["state"], "update-available")
        self.assertFalse(st["current"])
        self.assertEqual(st["installedVersion"], "0.0.1")
        self.assertEqual(st["sourceVersion"], engine.VERSION)

    def test_unit_drift_alone_is_update_available(self):
        self.install_files(unit_bytes=b"[Service]\nExecStart=/somewhere/else\n")
        self.sc.active, self.sc.enabled = "active", True
        self.publish_state()
        self.assertEqual(self.status()["state"], "update-available",
                         "a changed unit is drift even when the engine matches")

    def test_identical_bytes_and_a_stopped_service(self):
        self.install_files()
        self.assertEqual(self.status()["state"], "stopped")

    def test_activating_is_starting(self):
        self.install_files()
        self.sc.active = "activating"
        self.assertEqual(self.status()["state"], "starting")

    def test_active_and_publishing_is_ready(self):
        self.install_files()
        self.sc.active, self.sc.enabled = "active", True
        self.publish_state()
        st = self.status()
        self.assertEqual(st["state"], "ready")
        self.assertTrue(st["stateFresh"])
        self.assertTrue(st["enabled"])

    def test_active_but_long_silent_is_unhealthy(self):
        self.install_files()
        self.sc.active = "active"
        self.sc.enter_monotonic = 1  # entered active at boot: not young
        self.publish_state(age_seconds=engine.STATE_FRESH_SECONDS + 30)
        st = self.status()
        self.assertEqual(st["state"], "unhealthy")
        self.assertFalse(st["stateFresh"])
        self.assertIn("published", st["message"])

    def test_active_and_young_is_starting_not_unhealthy(self):
        """A service can be active before its first publish; that is not a fault."""
        self.install_files()
        self.sc.active = "active"
        self.sc.enter_monotonic = int(time.clock_gettime(time.CLOCK_MONOTONIC) * 1_000_000)
        self.assertEqual(self.status()["state"], "starting")

    def test_failed_is_unhealthy_and_names_the_result(self):
        self.install_files()
        self.sc.active = "failed"
        self.sc.enter_monotonic = 1
        st = self.status()
        self.assertEqual(st["state"], "unhealthy")
        self.assertIn("failed", st["message"])

    def test_every_state_in_the_published_vocabulary_is_reachable(self):
        seen = set()
        self.install_files(engine_bytes=b"old\n")
        seen.add(self.status()["state"])                      # update-available
        self.install_files()
        seen.add(self.status()["state"])                      # stopped
        self.sc.active = "activating"
        seen.add(self.status()["state"])                      # starting
        self.sc.active = "active"
        self.sc.enter_monotonic = 1
        seen.add(self.status()["state"])                      # unhealthy
        self.publish_state()
        seen.add(self.status()["state"])                      # ready
        self.engine_dest.unlink()
        self.unit_dest.unlink()
        seen.add(self.status()["state"])                      # not-installed
        self.assertEqual(seen, set(engine.SERVICE_STATES))

    def test_state_is_always_from_the_published_vocabulary(self):
        for active in ("active", "activating", "reloading", "deactivating",
                       "inactive", "failed", "maintenance", "something-new", ""):
            with self.subTest(active=active):
                self.install_files()
                self.sc.active = active
                self.assertIn(self.status()["state"], engine.SERVICE_STATES)


class TestStatusDegradesSafely(ServiceCase):
    def test_systemd_unavailable_falls_back_to_the_state_file(self):
        self.install_files()
        self.sc.unavailable = "systemctl was not found"
        self.publish_state()
        st = self.status()
        self.assertEqual(st["state"], "ready", "a publishing engine is running, whatever systemd says")
        self.assertEqual(st["activeState"], "unknown")
        self.assertIn("systemctl", st["message"])

    def test_systemd_unavailable_and_silent_is_stopped(self):
        self.install_files()
        self.sc.unavailable = "Failed to connect to bus"
        self.assertEqual(self.status()["state"], "stopped")

    def test_a_malformed_state_file_is_not_freshness(self):
        self.install_files()
        self.sc.active = "active"
        self.sc.enter_monotonic = 1
        self.state.parent.mkdir(parents=True, exist_ok=True)
        for body in ('{"updatedAt": "soon"}', "{", "[]", "", '{"updatedAt": null}'):
            with self.subTest(body=body):
                self.state.write_text(body)
                st = self.status()
                self.assertFalse(st["stateFresh"])
                self.assertEqual(st["state"], "unhealthy")

    def test_an_installed_copy_cannot_claim_drift_it_cannot_see(self):
        """Run from ~/.local/bin there is no contrib/ to compare against."""
        self.install_files()
        self.source_unit.unlink()
        st = self.status()
        self.assertFalse(st["sourceAvailable"])
        self.assertTrue(st["current"], "no checkout means no drift claim, not a false one")
        self.assertEqual(st["sourceVersion"], "")
        self.assertNotEqual(st["state"], "update-available")

    def test_an_unreadable_installed_engine_reads_as_absent(self):
        self.install_files()
        self.engine_dest.chmod(0o000)
        try:
            st = self.status()
        finally:
            self.engine_dest.chmod(0o755)
        if os.geteuid() != 0:  # root reads anything; the assertion is meaningless there
            self.assertEqual(st["state"], "not-installed")

    def test_status_writes_nothing_at_all(self):
        before = {p for p in self.home.rglob("*")}
        self.status()
        self.install_files()
        self.sc.active = "active"
        before = {p for p in self.home.rglob("*")}
        self.status()
        self.assertEqual({p for p in self.home.rglob("*")}, before,
                         "a probe created or removed a path")

    def test_status_never_executes_the_installed_engine(self):
        """The version comes out of the file, not out of running it."""
        self.install_files(engine_bytes=b'#!/bin/sh\ntouch "$0.ran"\nVERSION = "6.6.6"\n')
        st = self.status()
        self.assertEqual(st["installedVersion"], "6.6.6")
        self.assertFalse(self.engine_dest.with_suffix(".ran").exists())
        self.assertNotIn("writing-critter", [c[0] for c in self.sc.calls])


class TestShowParsing(unittest.TestCase):
    """Against the output captured from the real systemd; see the fixtures."""

    def test_absent_unit(self):
        props = engine.parse_show(fx.SHOW_ABSENT)
        self.assertEqual(props["LoadState"], "not-found")
        self.assertEqual(props["ActiveState"], "inactive")
        self.assertEqual(props["UnitFileState"], "")

    def test_each_captured_state(self):
        cases = {
            fx.SHOW_PRESENT_DISABLED: ("inactive", "disabled"),
            fx.SHOW_ENABLED_STOPPED: ("inactive", "enabled"),
            fx.SHOW_ACTIVATING: ("activating", "enabled"),
            fx.SHOW_ACTIVE: ("active", "enabled"),
            fx.SHOW_FAILED: ("failed", "enabled"),
        }
        for body, (active, unit_state) in cases.items():
            props = engine.parse_show(body)
            self.assertEqual(props["ActiveState"], active)
            self.assertEqual(props["UnitFileState"], unit_state)

    def test_the_monotonic_timestamp_is_the_clock_python_reads(self):
        props = engine.parse_show(fx.SHOW_ACTIVE)
        age = engine._started_seconds_ago(props, fx.CAPTURED_MONOTONIC_SECONDS)
        self.assertAlmostEqual(age, 3.03, places=1)

    def test_a_never_started_unit_has_no_age(self):
        self.assertIsNone(engine._started_seconds_ago(
            engine.parse_show(fx.SHOW_ENABLED_STOPPED), 1000.0))

    def test_malformed_output_never_raises(self):
        for body in (fx.SHOW_EMPTY, fx.SHOW_NOT_KEY_VALUE, fx.SHOW_MISSING_PROPERTIES,
                     fx.SHOW_UNKNOWN_UNIT_NAME, fx.SHOW_BLANK_AND_BROKEN_LINES,
                     fx.SHOW_OVERSIZED):
            with self.subTest(body=body[:40]):
                props = engine.parse_show(body)
                self.assertIsInstance(props, dict)

    def test_broken_lines_are_dropped_and_good_ones_kept(self):
        props = engine.parse_show(fx.SHOW_BLANK_AND_BROKEN_LINES)
        self.assertEqual(props["ActiveState"], "active")
        self.assertNotIn("no-equals-sign", props)
        self.assertNotIn("", props)
        self.assertIsNone(engine._started_seconds_ago(props, 1000.0),
                          "a non-numeric timestamp is no timestamp")

    def test_output_and_values_are_bounded(self):
        props = engine.parse_show(fx.SHOW_OVERSIZED)
        self.assertLessEqual(len(props.get("ActiveState", "")), engine.SERVICE_MESSAGE_MAX)


class TestXdgPaths(unittest.TestCase):
    def test_the_unit_follows_xdg_config_home_and_the_engine_does_not(self):
        """The unit runs a literal %h/.local/bin path, so the engine cannot move."""
        with tempfile.TemporaryDirectory() as tmp:
            home, xdg = Path(tmp) / "home", Path(tmp) / "xdg"
            env = dict(os.environ, HOME=str(home), XDG_CONFIG_HOME=str(xdg),
                       XDG_BIN_HOME=str(Path(tmp) / "bin-home"))
            out = subprocess.run(
                [sys.executable, str(ROOT / "bin" / "writing-critter"), "service", "status", "--json"],
                capture_output=True, text=True, env=env, timeout=30)
            st = json.loads(out.stdout)
        self.assertEqual(st["unitPath"], str(xdg / "systemd" / "user" / engine.UNIT_NAME))
        self.assertEqual(st["enginePath"], str(home / ".local" / "bin" / "writing-critter"))
        self.assertNotIn("bin-home", st["enginePath"],
                         "XDG_BIN_HOME must not move the engine away from the unit's ExecStart")

    def test_the_shipped_unit_executes_the_documented_destination(self):
        unit = (ROOT / "contrib" / engine.UNIT_NAME).read_text()
        self.assertIn("ExecStart=%h/.local/bin/writing-critter run", unit)


# ------------------------------------------------------------------ install


class TestInstall(ServiceCase):
    def test_fresh_install(self):
        result = engine.service_install(self.paths, self.sc)
        self.assertTrue(result["ok"], result["message"])
        self.assertTrue(result["changed"])
        self.assertEqual(self.engine_dest.read_bytes(), self.source_engine.read_bytes())
        self.assertEqual(self.unit_dest.read_bytes(), self.source_unit.read_bytes())
        self.assertEqual([v for v in self.sc.verbs if v != "show"],
                         ["daemon-reload", "enable", "restart"])
        self.assertTrue(self.sc.enabled)
        self.assertEqual(self.sc.active, "active")
        self.assertIn(result["state"], ("ready", "starting"))

    def test_installed_modes(self):
        engine.service_install(self.paths, self.sc)
        self.assertEqual(stat.S_IMODE(self.engine_dest.stat().st_mode), engine.ENGINE_MODE)
        self.assertEqual(stat.S_IMODE(self.unit_dest.stat().st_mode), engine.UNIT_MODE)

    def test_a_restrictive_umask_does_not_make_the_unit_unreadable(self):
        old = os.umask(0o077)
        try:
            engine.service_install(self.paths, self.sc)
        finally:
            os.umask(old)
        self.assertEqual(stat.S_IMODE(self.unit_dest.stat().st_mode), engine.UNIT_MODE)

    def test_identical_reinstall_changes_nothing_but_still_verifies(self):
        engine.service_install(self.paths, self.sc)
        mtime = self.engine_dest.stat().st_mtime_ns
        self.sc.enabled = False  # someone disabled it behind our back
        result = engine.service_install(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertFalse(result["changed"])
        self.assertEqual(result["message"], "already up to date")
        self.assertEqual(self.engine_dest.stat().st_mtime_ns, mtime, "identical file was rewritten")
        self.assertTrue(self.sc.enabled, "enablement is verified even when nothing was copied")

    def test_engine_only_drift_is_repaired(self):
        self.install_files(engine_bytes=b"stale\n")
        result = engine.service_install(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertTrue(result["changed"])
        self.assertEqual(self.engine_dest.read_bytes(), self.source_engine.read_bytes())

    def test_unit_only_drift_is_repaired(self):
        self.install_files(unit_bytes=b"[Service]\nExecStart=/old\n")
        result = engine.service_install(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertEqual(self.unit_dest.read_bytes(), self.source_unit.read_bytes())

    def test_both_files_update_and_the_service_is_restarted(self):
        self.install_files(engine_bytes=b"old\n", unit_bytes=b"older\n")
        self.sc.active, self.sc.enabled = "active", True
        engine.service_install(self.paths, self.sc)
        self.assertIn("restart", self.sc.verbs, "an update that does not restart serves the old process")
        self.assertEqual(self.engine_dest.read_bytes(), self.source_engine.read_bytes())
        self.assertEqual(self.unit_dest.read_bytes(), self.source_unit.read_bytes())

    def test_install_refuses_without_a_checkout_to_install_from(self):
        self.source_unit.unlink()
        result = engine.service_install(self.paths, self.sc)
        self.assertFalse(result["ok"])
        self.assertIn("checkout", result["message"])
        self.assertFalse(self.engine_dest.exists())
        self.assertEqual(self.sc.verbs, ["show"], "nothing was asked of systemd")

    def test_a_partial_installation_is_completed(self):
        self.engine_dest.parent.mkdir(parents=True)
        self.engine_dest.write_bytes(self.source_engine.read_bytes())
        result = engine.service_install(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertTrue(self.unit_dest.exists())


class TestInstallRollback(ServiceCase):
    def test_rollback_from_a_fresh_install_removes_what_it_created(self):
        for failing in ("daemon-reload", "enable", "restart"):
            with self.subTest(step=failing):
                self.tearDown()
                self.setUp()
                self.sc.fail[failing] = "denied"
                result = engine.service_install(self.paths, self.sc)
                self.assertFalse(result["ok"])
                self.assertTrue(result["rolledBack"])
                self.assertIn(failing, result["message"])
                self.assertFalse(self.engine_dest.exists(), "a failed install left an engine behind")
                self.assertFalse(self.unit_dest.exists(), "a failed install left a unit behind")
                self.assertEqual(result["state"], "not-installed")

    def test_rollback_over_an_existing_install_restores_the_old_bytes(self):
        old_engine, old_unit = b"old engine\n", b"[Service]\nExecStart=/old\n"
        self.install_files(engine_bytes=old_engine, unit_bytes=old_unit)
        self.sc.active, self.sc.enabled = "active", True
        self.sc.fail["restart"] = "job failed"

        result = engine.service_install(self.paths, self.sc)
        self.assertFalse(result["ok"])
        self.assertTrue(result["rolledBack"])
        self.assertEqual(self.engine_dest.read_bytes(), old_engine)
        self.assertEqual(self.unit_dest.read_bytes(), old_unit)

    def test_rollback_restores_the_previous_running_state(self):
        self.install_files(engine_bytes=b"old\n")
        self.sc.active, self.sc.enabled = "active", True
        self.sc.fail["enable"] = "no"
        engine.service_install(self.paths, self.sc)
        self.assertIn("restart", self.sc.verbs, "a service that was running was left stopped")

    def test_rollback_leaves_a_stopped_service_stopped(self):
        self.install_files(engine_bytes=b"old\n")
        self.sc.fail["enable"] = "no"
        engine.service_install(self.paths, self.sc)
        self.assertEqual(self.sc.active, "inactive")

    def test_a_unit_that_starts_and_dies_is_not_reported_as_installed(self):
        """`systemctl start` returns 0 for a Type=simple program that exits 1."""
        self.sc.exec_result = "die"
        result = engine.service_install(self.paths, self.sc)
        self.assertFalse(result["ok"], "an exit code from restart is not verification")
        self.assertIn("did not start", result["message"])
        self.assertTrue(result["rolledBack"])
        self.assertFalse(self.engine_dest.exists())

    def test_rollback_failure_is_reported_separately_from_the_original(self):
        self.install_files(engine_bytes=b"old\n")
        self.sc.active, self.sc.enabled = "active", True
        self.sc.fail["restart"] = "job failed"
        self.sc.fail["daemon-reload"] = "bus gone"
        result = engine.service_install(self.paths, self.sc)
        self.assertFalse(result["ok"])
        self.assertTrue(result["rolledBack"], "the files were put back")
        self.assertTrue(result["rollbackFailed"], "the service could not be put back")

    def test_an_unwritable_destination_fails_without_a_partial_install(self):
        self.engine_dest.parent.mkdir(parents=True)
        self.engine_dest.parent.chmod(0o500)
        try:
            result = engine.service_install(self.paths, self.sc)
        finally:
            self.engine_dest.parent.chmod(0o755)
        if os.geteuid() == 0:
            self.skipTest("root ignores directory permissions")
        self.assertFalse(result["ok"])
        self.assertIn("could not write", result["message"])
        self.assertFalse(self.unit_dest.exists(), "the unit went in although the engine could not")

    def test_no_temporary_files_are_left_behind(self):
        engine.service_install(self.paths, self.sc)
        self.sc.fail["enable"] = "no"
        engine.service_install(self.paths, self.sc)
        leftovers = [p.name for p in self.home.rglob(".*.new-*")]
        self.assertEqual(leftovers, [])


class TestInstallTouchesNothingElse(ServiceCase):
    def test_install_preserves_configuration_state_and_history(self):
        before = self.write_user_data()
        engine.service_install(self.paths, self.sc)
        self.assert_user_data_intact(before)

    def test_update_preserves_configuration_state_and_history(self):
        self.install_files(engine_bytes=b"old\n")
        before = self.write_user_data()
        engine.service_install(self.paths, self.sc)
        self.assert_user_data_intact(before)

    def test_a_rolled_back_install_preserves_them_too(self):
        self.install_files(engine_bytes=b"old\n")
        before = self.write_user_data()
        self.sc.fail["restart"] = "no"
        engine.service_install(self.paths, self.sc)
        self.assert_user_data_intact(before)

    def test_every_write_lands_on_one_of_the_two_declared_targets(self):
        self.write_user_data()
        engine.service_install(self.paths, self.sc)
        allowed = {self.engine_dest, self.unit_dest, self.config, self.state, self.tracking}
        touched = {p for p in self.home.rglob("*") if p.is_file()}
        unexpected = touched - allowed - {self.source_engine, self.source_unit}
        self.assertEqual(unexpected, set())


class TestNothingButSystemctlIsEverRun(ServiceCase):
    """Task 3.5: the complete set of programs this can invoke, asserted.

    The fake overrides `_call`, so these argv lists are the ones the real
    Systemctl methods build. Nothing here is a paraphrase of the implementation.
    """

    # The tokens below are the point of this test, so they are written out
    # rather than assembled: an assertion you cannot read is not an assertion.
    FORBIDDEN = ("sudo", "pkexec", "polkit", "sh", "bash", "-c", "curl", "wget",  # security-guard: fixture
                 "pacman", "yay", "apt", "dnf", "pip", "npm", "ssh", "systemd-run")

    def run_everything(self):
        engine.service_install(self.paths, self.sc)
        engine.service_start(self.paths, self.sc)
        engine.service_restart(self.paths, self.sc)
        engine.service_status(self.paths, self.sc)
        engine.service_uninstall(self.paths, self.sc)

    def test_every_call_is_systemctl_user_with_a_fixed_verb(self):
        self.run_everything()
        self.assertTrue(self.sc.calls)
        allowed = {"show", "daemon-reload", "enable", "disable",
                   "start", "stop", "restart", "reset-failed"}
        for argv in self.sc.calls:
            self.assertIn(argv[0], allowed, f"unexpected verb in {argv}")

    def test_no_call_carries_a_privilege_network_or_package_argument(self):
        self.run_everything()
        for argv in self.sc.calls:
            for token in argv:
                self.assertNotIn(token.lower(), self.FORBIDDEN, f"in {argv}")

    def test_no_call_carries_a_path(self):
        """Nothing on a systemd command line can be redirected by a caller."""
        self.run_everything()
        for argv in self.sc.calls:
            for token in argv:
                self.assertFalse(token.startswith("/"), f"a path reached systemd: {argv}")
                self.assertNotIn(str(self.home), token)

    def test_only_this_plugins_unit_is_ever_named(self):
        self.run_everything()
        for argv in self.sc.calls:
            for token in argv[1:]:
                if token.endswith(".service"):
                    self.assertEqual(token, engine.UNIT_NAME)

    def test_the_real_runner_prefixes_systemctl_user(self):
        seen = {}

        class Recorder(engine.Systemctl):
            def _call(self, args):
                seen["argv"] = ["systemctl", "--user", *args]
                return True, fx.SHOW_ABSENT, ""

        engine.service_status(self.paths, Recorder())
        self.assertEqual(seen["argv"][:3], ["systemctl", "--user", "show"])
        self.assertIn("--property=ActiveState", seen["argv"])

    def test_the_service_actions_take_no_arguments_at_all(self):
        parser = engine.build_parser()
        for action in engine.SERVICE_ACTIONS:
            args = parser.parse_args(["service", action])
            self.assertEqual(args.service_action, action)
            with open(os.devnull, "w") as quiet, contextlib.redirect_stderr(quiet):
                with self.assertRaises(SystemExit, msg=f"{action} accepted an argument"):
                    parser.parse_args(["service", action, "/etc/passwd"])


# ------------------------------------------------- start, restart, uninstall


class TestStartAndRestart(ServiceCase):
    def test_start_a_stopped_service(self):
        self.install_files()
        result = engine.service_start(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertIn("start", self.sc.verbs)
        self.assertEqual(self.sc.active, "active")

    def test_restart_an_unhealthy_service(self):
        self.install_files()
        self.sc.active = "active"
        self.sc.enter_monotonic = 1
        self.assertEqual(self.status()["state"], "unhealthy")
        result = engine.service_restart(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertIn("restart", self.sc.verbs)

    def test_restart_a_failed_service(self):
        self.install_files()
        self.sc.active = "failed"
        result = engine.service_restart(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertEqual(self.sc.active, "active")

    def test_start_without_an_installation_is_refused_early(self):
        result = engine.service_start(self.paths, self.sc)
        self.assertFalse(result["ok"])
        self.assertIn("not installed", result["message"])
        self.assertEqual(self.sc.verbs, ["show"], "systemd was asked to start a unit that is not there")

    def test_a_start_that_dies_immediately_is_a_failure(self):
        self.install_files()
        self.sc.exec_result = "die"
        result = engine.service_start(self.paths, self.sc)
        self.assertFalse(result["ok"])
        self.assertIn("did not start", result["message"])

    def test_a_refused_start_reports_what_systemd_said(self):
        self.install_files()
        self.sc.fail["start"] = "Interactive authentication required."
        result = engine.service_start(self.paths, self.sc)
        self.assertFalse(result["ok"])
        self.assertIn("Interactive authentication", result["message"])

    def test_start_and_restart_do_not_touch_files(self):
        self.install_files()
        before = self.write_user_data()
        engine_bytes = self.engine_dest.read_bytes()
        engine.service_start(self.paths, self.sc)
        engine.service_restart(self.paths, self.sc)
        self.assert_user_data_intact(before)
        self.assertEqual(self.engine_dest.read_bytes(), engine_bytes)


class TestUninstall(ServiceCase):
    def test_uninstall_removes_exactly_two_files(self):
        engine.service_install(self.paths, self.sc)
        before = self.write_user_data()
        result = engine.service_uninstall(self.paths, self.sc)
        self.assertTrue(result["ok"], result["message"])
        self.assertTrue(result["changed"])
        self.assertFalse(self.engine_dest.exists())
        self.assertFalse(self.unit_dest.exists())
        self.assert_user_data_intact(before)
        self.assertEqual(result["state"], "not-installed")

    def test_uninstall_stops_and_disables_before_removing(self):
        engine.service_install(self.paths, self.sc)
        self.sc.calls.clear()
        engine.service_uninstall(self.paths, self.sc)
        verbs = self.sc.verbs
        self.assertLess(verbs.index("stop"), verbs.index("daemon-reload"))
        self.assertLess(verbs.index("disable"), verbs.index("daemon-reload"))
        self.assertIn("reset-failed", verbs)
        self.assertFalse(self.sc.enabled)
        self.assertEqual(self.sc.active, "inactive")

    def test_uninstall_with_nothing_installed_is_a_quiet_success(self):
        result = engine.service_uninstall(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertFalse(result["changed"])
        self.assertEqual(result["message"], "nothing was installed")
        self.assertEqual(self.sc.verbs, ["show"], "systemd was asked to stop nothing")

    def test_uninstalling_twice_is_idempotent(self):
        engine.service_install(self.paths, self.sc)
        first = engine.service_uninstall(self.paths, self.sc)
        second = engine.service_uninstall(self.paths, self.sc)
        self.assertTrue(first["ok"] and second["ok"])
        self.assertTrue(first["changed"])
        self.assertFalse(second["changed"])

    def test_a_partial_installation_is_cleaned_up(self):
        self.engine_dest.parent.mkdir(parents=True)
        self.engine_dest.write_bytes(b"orphan\n")
        result = engine.service_uninstall(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assertFalse(self.engine_dest.exists())
        self.assertNotIn("stop", self.sc.verbs, "there was no unit to stop")
        self.assertNotIn("disable", self.sc.verbs)

    def test_a_unit_that_cannot_be_stopped_is_not_deleted(self):
        engine.service_install(self.paths, self.sc)
        self.sc.fail["stop"] = "Interactive authentication required."
        result = engine.service_uninstall(self.paths, self.sc)
        self.assertFalse(result["ok"])
        self.assertIn("Interactive authentication", result["message"])
        self.assertTrue(self.unit_dest.exists(), "the only way to stop it was removed")
        self.assertTrue(self.engine_dest.exists())

    def test_uninstall_removes_nothing_outside_its_two_targets(self):
        engine.service_install(self.paths, self.sc)
        self.write_user_data()
        sibling = self.engine_dest.with_name("some-other-tool")
        sibling.write_text("not ours\n")
        other_unit = self.unit_dest.with_name("other.service")
        other_unit.write_text("[Service]\n")

        engine.service_uninstall(self.paths, self.sc)
        self.assertTrue(sibling.exists(), "a neighbouring binary was removed")
        self.assertTrue(other_unit.exists(), "a neighbouring unit was removed")

    def test_reinstalling_after_uninstall_resumes_from_retained_data(self):
        engine.service_install(self.paths, self.sc)
        before = self.write_user_data()
        engine.service_uninstall(self.paths, self.sc)
        result = engine.service_install(self.paths, self.sc)
        self.assertTrue(result["ok"])
        self.assert_user_data_intact(before)


# ------------------------------------------------------------- the contract


class TestResultContract(ServiceCase):
    KEYS = {"schema", "action", "ok", "changed", "rolledBack", "rollbackFailed",
            "message", "state", "installed", "current", "enabled", "activeState",
            "stateFresh", "sourceAvailable", "sourceVersion", "installedVersion",
            "enginePath", "unitPath"}

    def results(self):
        yield engine.service_status(self.paths, self.sc)
        yield engine.service_install(self.paths, self.sc)
        yield engine.service_start(self.paths, self.sc)
        yield engine.service_restart(self.paths, self.sc)
        yield engine.service_uninstall(self.paths, self.sc)
        self.sc.fail["enable"] = "no"
        yield engine.service_install(self.paths, self.sc)

    def test_every_result_has_exactly_the_published_keys(self):
        for result in self.results():
            self.assertEqual(set(result), self.KEYS, result.get("action"))

    def test_every_result_is_json_and_types_are_stable(self):
        for result in self.results():
            round_tripped = json.loads(json.dumps(result))
            self.assertEqual(round_tripped["schema"], engine.SERVICE_SCHEMA)
            self.assertIn(round_tripped["state"], engine.SERVICE_STATES)
            for key in ("ok", "changed", "installed", "current", "enabled",
                        "stateFresh", "sourceAvailable", "rolledBack", "rollbackFailed"):
                self.assertIsInstance(round_tripped[key], bool, key)
            for key in ("action", "message", "state", "activeState",
                        "sourceVersion", "installedVersion", "enginePath", "unitPath"):
                self.assertIsInstance(round_tripped[key], str, key)

    def test_messages_are_one_bounded_printable_line(self):
        self.sc.fail["enable"] = "line one\nline two\x00\x1b[31m" + "x" * 2000
        result = engine.service_install(self.paths, self.sc)
        message = result["message"]
        self.assertLessEqual(len(message), engine.SERVICE_MESSAGE_MAX)
        self.assertNotIn("\n", message)
        self.assertTrue(all(ch.isprintable() for ch in message))

    def test_a_probe_is_a_success_even_when_the_answer_is_bad_news(self):
        self.assertTrue(engine.service_status(self.paths, self.sc)["ok"])
        self.assertEqual(engine.service_status(self.paths, self.sc)["action"], "")

    def test_the_human_rendering_names_the_state_and_both_paths(self):
        text = engine.render_service(engine.service_status(self.paths, self.sc))
        self.assertIn("not-installed", text)
        self.assertIn(str(self.engine_dest), text)
        self.assertIn(str(self.unit_dest), text)


class TestWrappers(unittest.TestCase):
    """install.sh and uninstall.sh must delegate, not reimplement.

    Two implementations of "install the engine" is how the panel and the
    terminal come to disagree about what is installed, which is the failure
    this change exists to remove.
    """

    def wrapper(self, name):
        return (ROOT / name).read_text()

    def code(self, name):
        """The wrapper with comments and blank lines removed."""
        return "\n".join(line for line in self.wrapper(name).splitlines()
                          if line.strip() and not line.strip().startswith("#"))

    def test_both_wrappers_exist_and_are_executable(self):
        for name in ("install.sh", "uninstall.sh"):
            path = ROOT / name
            self.assertTrue(path.exists(), name)
            self.assertTrue(os.access(path, os.X_OK), f"{name} is not executable")

    def test_neither_wrapper_copies_files_or_drives_systemd_itself(self):
        for name in ("install.sh", "uninstall.sh"):
            body = self.code(name)
            for forbidden in ("systemctl", "install -m", "cp ", "rm ", "ln -s", "mkdir"):
                self.assertNotIn(forbidden, body, f"{name} still does its own {forbidden!r}")

    def test_each_wrapper_delegates_to_the_bundled_engine(self):
        self.assertIn('"$here/bin/writing-critter" service install',
                      self.code("install.sh"))
        self.assertIn('"$here/bin/writing-critter" service uninstall',
                      self.code("uninstall.sh"))

    def test_neither_wrapper_depends_on_the_callers_directory(self):
        for name in ("install.sh", "uninstall.sh"):
            body = self.code(name)
            # The `cd` inside $( ) is the resolution idiom and is fine; a `cd`
            # as a statement is the old shape, where the script moved the shell
            # to its own directory and then used relative paths from there.
            for line in body.splitlines():
                self.assertFalse(line.strip().startswith("cd "),
                                 f"{name} cds instead of resolving: {line}")
            self.assertIn('here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', body)
            self.assertNotIn('"$0"', body, f"{name} uses $0, which a `bash -c` caller can set")

    def test_a_wrapper_run_from_elsewhere_finds_the_engine_beside_it(self):
        out = subprocess.run(["bash", str(ROOT / "install.sh"), "--help"],
                             cwd="/", capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertIn("service install", out.stdout)


class TestCliContract(ServiceCase):
    """The exit code and the JSON, at the boundary the panel and wrappers use.

    Driven through cmd_service with the action table swapped, rather than by
    spawning the binary: a real `service install` on this machine would enable
    and restart the developer's own writing-critter.service.
    """

    def invoke(self, action, result, json_flag):
        args = argparse.Namespace(service_action=action, json=json_flag)
        saved = engine.SERVICE_ACTIONS[action]
        engine.SERVICE_ACTIONS[action] = lambda: result
        out = io.StringIO()
        try:
            with contextlib.redirect_stdout(out):
                code = engine.cmd_service(args)
        finally:
            engine.SERVICE_ACTIONS[action] = saved
        return code, out.getvalue()

    def test_a_successful_action_exits_zero_and_a_failed_one_exits_one(self):
        ok = engine.service_status(self.paths, self.sc)
        self.assertEqual(self.invoke("status", ok, True)[0], 0)
        failed = dict(ok, action="install", ok=False, message="denied")
        self.assertEqual(self.invoke("install", failed, True)[0], 1)

    def test_status_exits_zero_whatever_the_service_is_doing(self):
        for state in engine.SERVICE_STATES:
            probe = dict(engine.service_status(self.paths, self.sc), state=state)
            self.assertEqual(self.invoke("status", probe, True)[0], 0, state)

    def test_json_output_is_one_parseable_line(self):
        probe = engine.service_status(self.paths, self.sc)
        _, out = self.invoke("status", probe, True)
        self.assertEqual(len(out.strip().splitlines()), 1)
        self.assertEqual(json.loads(out), probe)

    def test_without_the_flag_the_output_is_for_a_person(self):
        probe = engine.service_status(self.paths, self.sc)
        _, out = self.invoke("status", probe, False)
        self.assertNotIn("{", out)
        self.assertIn("state", out)

    def test_the_parser_offers_exactly_the_published_actions(self):
        parser = engine.build_parser()
        for action in engine.SERVICE_ACTIONS:
            self.assertEqual(parser.parse_args(["service", action]).service_action, action)
        with open(os.devnull, "w") as quiet, contextlib.redirect_stderr(quiet):
            for unknown in ("purge", "reload", "edit"):
                with self.assertRaises(SystemExit, msg=unknown):
                    parser.parse_args(["service", unknown])


if __name__ == "__main__":
    unittest.main()
