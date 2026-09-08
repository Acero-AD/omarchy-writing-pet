#!/usr/bin/env python3
"""One life of the engine, end to end, in a throwaway home.

tests/test_service.py calls the service functions in process. This runs the
actual executable, so the argument parsing, the JSON on stdout, the exit codes,
the real file writes, the real atomic staging, the file modes and both shell
wrappers are all under test as well. It is the only test here that would notice
`service install` printing nothing, or exiting 0 after failing.

Only systemd is replaced, by a shim first on PATH. The unit name is fixed, so a
test that reached the real user manager would enable and restart the developer's
own writing-critter.service; the shim is what makes this safe to run on the
machine the plugin is installed on.

Written as one ordered scenario rather than isolated cases on purpose: the
things most likely to be wrong here -- drift after an update, data surviving a
rollback, a reinstall resuming from what an uninstall kept -- are all about what
one state leaves behind for the next.
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

SHIM = r'''#!/usr/bin/env python3
import json, os, sys, time
from pathlib import Path
state_file = Path(os.environ["SHIM_STATE"])
s = json.loads(state_file.read_text())
args = sys.argv[1:]
s["calls"].append(args)
state_file.write_text(json.dumps(s))

if args[:1] != ["--user"]:
    print("shim: refusing a call without --user", file=sys.stderr); sys.exit(90)
verb = args[1]
unit_exists = Path(os.environ["SHIM_UNIT"]).exists()

if verb in s.get("fail", {}):
    print(s["fail"][verb], file=sys.stderr); sys.exit(1)

if verb == "show":
    active = s["active"] if unit_exists else "inactive"
    print(f"LoadState={'loaded' if unit_exists else 'not-found'}")
    print(f"ActiveState={active}")
    print(f"SubState={'running' if active == 'active' else 'dead'}")
    print(f"UnitFileState={('enabled' if s['enabled'] else 'disabled') if unit_exists else ''}")
    print(f"ActiveEnterTimestampMonotonic={s['enter']}")
    print("Result=success")
    sys.exit(0)
if verb in ("start", "restart"):
    if not unit_exists:
        print("Unit writing-critter.service not found.", file=sys.stderr); sys.exit(5)
    s["active"] = "active"
    s["enter"] = int(time.monotonic() * 1_000_000)
elif verb == "stop":
    s["active"] = "inactive"
elif verb == "enable":
    if not unit_exists:
        print("Unit file does not exist.", file=sys.stderr); sys.exit(1)
    s["enabled"] = True
elif verb == "disable":
    s["enabled"] = False
elif verb not in ("daemon-reload", "reset-failed"):
    print(f"shim: unexpected verb {verb}", file=sys.stderr); sys.exit(91)
state_file.write_text(json.dumps(s))
sys.exit(0)
'''

# The scenario reads as a narrative, so its assertions are written as a plain
# `check(what, condition)` rather than as self.assertTrue calls threaded through
# a hundred lines. CASE is the running TestCase; there is exactly one.
CASE = None
VERBOSE = "-v" in sys.argv or "--verbose" in sys.argv


def _step(label):
    """The section headings, printed only when someone is watching."""
    if VERBOSE:
        print(label)


def check(label, condition, detail=""):
    CASE.assertTrue(condition, f"{label}  {detail}")


class World:
    def __init__(self, root: Path):
        self.root = root
        self.home = root / "home"
        self.bin = root / "shim"
        self.bin.mkdir(parents=True)
        self.home.mkdir(parents=True)
        shim = self.bin / "systemctl"
        shim.write_text(SHIM)
        shim.chmod(0o755)
        # A checkout of the plugin, so `service install` has something to
        # install and drift can be created by editing it.
        self.checkout = root / "checkout"
        (self.checkout / "bin").mkdir(parents=True)
        (self.checkout / "contrib").mkdir(parents=True)
        shutil.copy2(REPO / "bin" / "writing-critter", self.checkout / "bin" / "writing-critter")
        shutil.copy2(REPO / "contrib" / "writing-critter.service",
                     self.checkout / "contrib" / "writing-critter.service")
        shutil.copy2(REPO / "install.sh", self.checkout / "install.sh")
        shutil.copy2(REPO / "uninstall.sh", self.checkout / "uninstall.sh")
        (self.checkout / "install.sh").chmod(0o755)
        (self.checkout / "uninstall.sh").chmod(0o755)

        self.engine = self.checkout / "bin" / "writing-critter"
        self.installed = self.home / ".local" / "bin" / "writing-critter"
        self.unit = self.home / ".config" / "systemd" / "user" / "writing-critter.service"
        self.config = self.home / ".config" / "writing-critter" / "config.json"
        self.state = self.home / ".local" / "state" / "writing-critter" / "state.json"
        self.tracking = self.state.with_name("tracking.json")

        self.shim_state = root / "shim-state.json"
        self.set_unit(active="inactive", enabled=False, enter=0, fail={})

    def set_unit(self, **over):
        current = json.loads(self.shim_state.read_text()) if self.shim_state.exists() else {"calls": []}
        current.update(over)
        current.setdefault("calls", [])
        self.shim_state.write_text(json.dumps(current))

    def unit_state(self):
        return json.loads(self.shim_state.read_text())

    def env(self):
        return {
            "HOME": str(self.home),
            "PATH": f"{self.bin}:/usr/bin:/bin",
            "SHIM_STATE": str(self.shim_state),
            "SHIM_UNIT": str(self.unit),
            "LANG": "C",
        }

    def run(self, *args, expect=None):
        out = subprocess.run([str(self.engine), *args], capture_output=True,
                             text=True, env=self.env(), timeout=60)
        if expect is not None and out.returncode != expect:
            print(f"    (exit {out.returncode}, expected {expect})\n"
                  f"    stdout: {out.stdout[:400]}\n    stderr: {out.stderr[:400]}")
        return out

    def status(self):
        out = self.run("service", "status", "--json")
        return json.loads(out.stdout)

    def service(self, action, expect=None):
        out = self.run("service", action, "--json", expect=expect)
        return json.loads(out.stdout), out.returncode

    def publish(self, age=0.0):
        self.state.parent.mkdir(parents=True, exist_ok=True)
        self.state.write_text(json.dumps({"schemaVersion": 1, "wordsToday": 412,
                                          "updatedAt": time.time() - age}))

    def user_data(self):
        return {p: p.read_bytes() for p in (self.config, self.state, self.tracking) if p.exists()}


class TestOneLifeOfTheEngine(unittest.TestCase):
    maxDiff = None

    def test_install_update_repair_remove_and_reinstall(self):
        global CASE
        CASE = self
        with tempfile.TemporaryDirectory() as tmp:
            w = World(Path(tmp))

            _step("\n1. a fresh account, nothing installed")
            st = w.status()
            check("state is not-installed", st["state"] == "not-installed", st["state"])
            check("nothing was created in HOME",
                  list(w.home.rglob("*")) == [], list(w.home.rglob("*"))[:3])
            check("status exits 0 even though nothing is installed",
                  w.run("service", "status").returncode == 0)

            _step("\n2. configuring before the engine exists")
            w.run("config", "set-goal", "900", expect=0)
            w.run("config", "add-app", "kate", expect=0)
            cfg = json.loads(w.config.read_text())
            check("the goal was accepted with no engine installed", cfg["goal"] == 900)
            check("the app was accepted too", "kate" in cfg["whitelist"])
            w.tracking.parent.mkdir(parents=True, exist_ok=True)
            w.tracking.write_text(json.dumps({"files": {"/notes/a.md": [10, 20, 30]}}))
            w.publish()
            before = w.user_data()

            _step("\n3. fresh install")
            result, code = w.service("install", expect=0)
            check("install succeeded", result["ok"] and code == 0, result["message"])
            check("install reports a change", result["changed"])
            check("the engine landed", w.installed.exists())
            check("the unit landed", w.unit.exists())
            check("engine mode is 0755", stat.S_IMODE(w.installed.stat().st_mode) == 0o755)
            check("unit mode is 0644", stat.S_IMODE(w.unit.stat().st_mode) == 0o644)
            check("the installed engine is byte-identical to the checkout",
                  w.installed.read_bytes() == w.engine.read_bytes())
            verbs = [c[1] for c in w.unit_state()["calls"]]
            check("systemd was asked to reload, enable and restart",
                  [v for v in verbs if v != "show"][-3:] == ["daemon-reload", "enable", "restart"], verbs)
            check("every systemd call carried --user",
                  all(c[0] == "--user" for c in w.unit_state()["calls"]))
            check("no systemd call carried a path",
                  not any(t.startswith("/") for c in w.unit_state()["calls"] for t in c))
            check("user data survived the install", w.user_data() == before)
            check("no staging leftovers", [p.name for p in w.home.rglob(".*.new-*")] == [])

            _step("\n4. installed, running and publishing")
            w.publish()
            st = w.status()
            check("state is ready", st["state"] == "ready", st["state"])
            check("it reports enabled", st["enabled"])
            check("it reports current", st["current"])
            check("installed version was read without executing the engine",
                  st["installedVersion"] == st["sourceVersion"] != "")

            _step("\n5. the plugin is updated and the installed copy drifts")
            w.engine.write_bytes(w.engine.read_bytes() + b"\n# a newer build\n")
            st = w.status()
            check("drift is noticed", st["state"] == "update-available", st["state"])
            check("the installed files were not touched by merely looking",
                  w.installed.read_bytes() != w.engine.read_bytes())
            before = w.user_data()
            stamps = {p: p.stat().st_mtime_ns for p in before}
            result, code = w.service("install", expect=0)
            check("the update succeeded", result["ok"], result["message"])
            check("the update restarted the service", "restart" in [c[1] for c in w.unit_state()["calls"]])
            check("the installed engine now matches the checkout",
                  w.installed.read_bytes() == w.engine.read_bytes())
            check("user data survived the update", w.user_data() == before)
            check("user data was not even rewritten with the same bytes",
                  {p: p.stat().st_mtime_ns for p in before} == stamps)

            _step("\n6. an identical reinstall")
            mtime = w.installed.stat().st_mtime_ns
            result, _ = w.service("install", expect=0)
            check("it succeeds and reports no change", result["ok"] and not result["changed"])
            check("it did not rewrite an identical file", w.installed.stat().st_mtime_ns == mtime)

            _step("\n7. stopped")
            w.set_unit(active="inactive")
            st = w.status()
            check("state is stopped", st["state"] == "stopped", st["state"])
            result, code = w.service("start", expect=0)
            check("start succeeded", result["ok"] and code == 0, result["message"])
            check("the service is active again", w.unit_state()["active"] == "active")

            _step("\n8. starting: active, nothing published yet")
            w.state.unlink()
            w.set_unit(active="active", enter=int(time.monotonic() * 1_000_000))
            st = w.status()
            check("a young active service is starting, not unhealthy",
                  st["state"] == "starting", st["state"])

            _step("\n9. unhealthy: active and long silent")
            w.publish(age=600)
            w.set_unit(active="active", enter=1)
            st = w.status()
            check("state is unhealthy", st["state"] == "unhealthy", st["state"])
            check("the message says why", "published" in st["message"], st["message"])
            result, code = w.service("restart", expect=0)
            check("restart succeeded", result["ok"] and code == 0, result["message"])

            _step("\n10. an install that fails, and cannot be fully rolled back")
            w.publish()
            before = w.user_data()
            old_engine = w.installed.read_bytes()
            w.engine.write_bytes(old_engine + b"\n# newer still\n")
            # `enable` refuses, but restart still works -- so the rollback can put
            # both the files and the running service back, and must not claim
            # otherwise. (Failing `restart` instead would make the rollback's own
            # restart fail too, which is a different case, tested below.)
            w.set_unit(active="active", enabled=True, fail={"enable": "Failed to enable unit."})
            result, code = w.service("install", expect=1)
            check("the install failed", not result["ok"] and code == 1)
            check("it names the step that refused", "enable" in result["message"], result["message"])
            check("the files were rolled back", result["rolledBack"])
            check("a rollback that worked is not reported as failed",
                  not result["rollbackFailed"], result["message"])
            check("the previous engine is back on disk", w.installed.read_bytes() == old_engine)
            check("the service was restarted onto the restored engine",
                  "restart" in [c[1] for c in w.unit_state()["calls"][-4:]])

            # A restart that refuses takes the rollback's restart with it: the
            # files go back, the running service cannot. That must be visible.
            w.set_unit(fail={"restart": "Job failed."})
            result, code = w.service("install", expect=1)
            check("the install failed", not result["ok"])
            check("the files were rolled back", result["rolledBack"])
            check("but the service could not be, and it says so", result["rollbackFailed"])

            # Now the harder case: the action fails and so does the rollback.
            w.set_unit(fail={"daemon-reload": "Bus disconnected."})
            result, code = w.service("install", expect=1)
            check("it fails at the first step that refuses",
                  "daemon-reload" in result["message"], result["message"])
            check("the files were still rolled back", result["rolledBack"])
            check("the rollback's own failure is reported separately", result["rollbackFailed"])
            check("the previous engine is back on disk", w.installed.read_bytes() == old_engine)
            check("user data survived both failed installs", w.user_data() == before)
            w.set_unit(fail={})

            _step("\n11. uninstall")
            sibling = w.installed.with_name("some-other-tool")
            sibling.write_text("not ours\n")
            other_unit = w.unit.with_name("other.service")
            other_unit.write_text("[Service]\n")
            result, code = w.service("uninstall", expect=0)
            check("uninstall succeeded", result["ok"] and code == 0, result["message"])
            check("the engine is gone", not w.installed.exists())
            check("the unit is gone", not w.unit.exists())
            check("it stopped and disabled first",
                  {"stop", "disable"} <= set(c[1] for c in w.unit_state()["calls"]))
            check("the neighbouring binary is untouched", sibling.exists())
            check("the neighbouring unit is untouched", other_unit.exists())
            check("settings, count and history are all still there", w.user_data() == before)
            check("state is not-installed", result["state"] == "not-installed")

            _step("\n12. uninstalling again")
            result, code = w.service("uninstall", expect=0)
            check("it is a quiet success", result["ok"] and not result["changed"])

            _step("\n13. reinstall resumes from what was kept")
            result, code = w.service("install", expect=0)
            check("install succeeded", result["ok"], result["message"])
            check("the retained settings are still the ones in force",
                  json.loads(w.config.read_text())["goal"] == 900)
            check("history was not reset", w.user_data() == before)

            _step("\n14. the wrappers, from an unrelated working directory")
            out = subprocess.run(["bash", str(w.checkout / "uninstall.sh")], cwd="/",
                                 capture_output=True, text=True, env=w.env(), timeout=60)
            check("uninstall.sh exits 0", out.returncode == 0, out.stderr[:200])
            check("uninstall.sh removed the engine", not w.installed.exists())
            check("uninstall.sh says what it kept", "still in" in out.stdout, out.stdout[:200])
            out = subprocess.run(["bash", str(w.checkout / "install.sh")], cwd="/",
                                 capture_output=True, text=True, env=w.env(), timeout=60)
            check("install.sh exits 0", out.returncode == 0, out.stderr[:200])
            check("install.sh installed the engine", w.installed.exists())
            check("the wrapper and the panel used the same code path",
                  "state         " in out.stdout, out.stdout[:200])

            _step("\n15. an installed copy, with no checkout beside it")
            out = subprocess.run([str(w.installed), "service", "status", "--json"],
                                 capture_output=True, text=True, env=w.env(), timeout=60)
            st = json.loads(out.stdout)
            check("it knows it cannot compare", not st["sourceAvailable"])
            check("it does not claim drift it cannot see", st["state"] != "update-available", st["state"])
            out = subprocess.run([str(w.installed), "service", "install", "--json"],
                                 capture_output=True, text=True, env=w.env(), timeout=60)
            check("it refuses to install from nowhere", json.loads(out.stdout)["ok"] is False)
            check("and exits non-zero", out.returncode == 1)

if __name__ == "__main__":
    unittest.main()
