import test from "node:test";
import assert from "node:assert/strict";
import M from "../Model.js";

const MOODS = ["writing", "idle", "sleeping", "celebrating"];

test("stageFor: threshold boundaries", () => {
  assert.equal(M.stageFor(0, 1000), 0);
  assert.equal(M.stageFor(249, 1000), 0);
  assert.equal(M.stageFor(250, 1000), 1);
  assert.equal(M.stageFor(499, 1000), 1);
  assert.equal(M.stageFor(500, 1000), 2);
  assert.equal(M.stageFor(750, 1000), 3);
  assert.equal(M.stageFor(1000, 1000), 4);
  assert.equal(M.stageFor(9999, 1000), 4);
});

test("stageFor: zero or invalid goal does not divide by zero", () => {
  assert.equal(M.stageFor(100, 0), 0);
  assert.equal(M.stageFor(100, -5), 0);
});

test("moodFor: sleeping whenever the poll gate is closed", () => {
  assert.equal(M.moodFor({ now: 1000, gateOpen: false, lastWordsAt: 999 }), "sleeping");
});

test("moodFor: writing, idle, celebrating", () => {
  const now = 1_000_000;
  assert.equal(M.moodFor({ now, gateOpen: true, lastWordsAt: now - 1000 }), "writing");
  assert.equal(M.moodFor({ now, gateOpen: true, lastWordsAt: now - M.WRITING_RECENT_MS - 1 }), "idle");
  assert.equal(M.moodFor({ now, gateOpen: true, lastWordsAt: now, celebrateUntil: now + 5000 }), "celebrating");
});

test("moodFor: celebrating outranks a closed gate", () => {
  const now = 1_000_000;
  assert.equal(M.moodFor({ now, gateOpen: false, celebrateUntil: now + 1 }), "celebrating");
});

// -------------------------------------------------- THE GRID INVARIANT (2.10)

const ASCII_ONLY = /^[\x20-\x7E]*$/;

test("grid invariant: every set x stage x mood", () => {
  for (const id of M.mascotIds()) {
    const set = M.mascotSet(id);
    for (let stage = 0; stage < M.STAGE_COUNT; stage++) {
      for (const mood of MOODS) {
        const art = M.panelArt(id, stage, mood);
        assert.equal(art.length, set.rows, `${id} s${stage} ${mood}: row count`);
        art.forEach((line, i) => {
          assert.equal(line.length, set.cols,
            `${id} s${stage} ${mood} row ${i}: expected ${set.cols} cols, got ${line.length} -> [${line}]`);
          assert.ok(ASCII_ONLY.test(line), `${id} s${stage} ${mood} row ${i}: non-ASCII -> [${line}]`);
        });

        const face = M.barFace(id, stage, mood);
        assert.equal(face.length, set.barCols + 1,
          `${id} s${stage} ${mood}: bar cell expected ${set.barCols + 1}, got ${face.length} -> [${face}]`);
        assert.ok(ASCII_ONLY.test(face), `${id} s${stage} ${mood}: non-ASCII bar face -> [${face}]`);
      }
    }
  }
});

test("mood changes never alter rendered width", () => {
  for (const id of M.mascotIds()) {
    for (let stage = 0; stage < M.STAGE_COUNT; stage++) {
      const widths = new Set(MOODS.map((m) => M.barFace(id, stage, m).length));
      assert.equal(widths.size, 1, `${id} s${stage}: bar width varies by mood`);
    }
  }
});

test("stage changes never alter rendered width", () => {
  for (const id of M.mascotIds()) {
    const widths = new Set();
    for (let stage = 0; stage < M.STAGE_COUNT; stage++) widths.add(M.barFace(id, stage, "writing").length);
    assert.equal(widths.size, 1, `${id}: bar width varies by stage`);
  }
});

test("barLabel never ends in whitespace", () => {
  for (const id of M.mascotIds()) {
    for (let stage = 0; stage < M.STAGE_COUNT; stage++) {
      for (const mood of MOODS) {
        const face = M.barFace(id, stage, mood);
        for (const vertical of [false, true]) {
          for (const showNumbers of [false, true]) {
            for (const idleNudge of [false, true]) {
              const label = M.barLabel(face, "421/500", vertical,
                showNumbers, idleNudge);
              assert.ok(!/\s$/.test(label),
                `${id} s${stage} ${mood}: label ends in whitespace`);
            }
          }
        }
      }
    }
  }
});

test("barLabel width is stable across moods for a fixed configuration", () => {
  for (const id of M.mascotIds()) {
    for (let stage = 0; stage < M.STAGE_COUNT; stage++) {
      for (const vertical of [false, true]) {
        for (const showNumbers of [false, true]) {
          for (const idleNudge of [false, true]) {
            const widths = new Set(MOODS.map((mood) => M.barLabel(
              M.barFace(id, stage, mood), "421/500", vertical,
              showNumbers, idleNudge).length));
            assert.equal(widths.size, 1,
              `${id} s${stage}: label width varies by mood`);
          }
        }
      }
    }
  }
});

test("both shipped sets exist and bird is the default", () => {
  assert.deepEqual(M.mascotIds().sort(), ["bird", "snail"]);
  assert.equal(M.MASCOT_DEFAULT, "bird");
  assert.equal(M.mascotSet("nonexistent").id, "bird");
});

test("snail offset rule: trail grows one tilde per stage", () => {
  for (let stage = 0; stage < M.STAGE_COUNT; stage++) {
    const art = M.panelArt("snail", stage, "writing");
    const trail = (art[3].match(/^~*/) || [""])[0].length;
    assert.equal(trail, stage === 0 ? 0 : stage * 3 + 1, `snail s${stage} panel trail`);
    const barTrail = (M.barFace("snail", stage, "writing").match(/~+/) || [""])[0].length;
    assert.equal(barTrail, stage, `snail s${stage} bar trail`);
  }
});

test("eye substitution leaves no placeholder behind", () => {
  for (const id of M.mascotIds()) {
    for (let stage = 0; stage < M.STAGE_COUNT; stage++) {
      for (const mood of MOODS) {
        assert.ok(!M.barFace(id, stage, mood).includes("{eyes}"));
        assert.ok(!M.panelArt(id, stage, mood).join("").includes("{eyes}"));
      }
    }
  }
});

// ------------------------------------------------------- companion sources

const validSource = (over = {}) => JSON.stringify({
  protocol: 1, sourceId: "obsidian", date: "2026-09-02",
  wordsAddedToday: 342, updatedAt: "2026-09-02T10:42:13+02:00",
  claimsPaths: ["/home/u/Vault"], ...over
});

// ------------------------------------------------------- untrusted state
//
// The state file comes from another process. These cover what a reader is
// allowed to believe, per docs/STATE-FILE.md.

const good = JSON.stringify({
  schema: 1, wordsToday: 120, goal: 500, gateOpen: true,
  updatedAt: 1788428966, mascot: "bird", byOrigin: { filewatch: 120 }
});

test("a well-formed payload loads", () => {
  const s = M.parseState(good, null);
  assert.equal(s.wordsToday, 120);
  assert.equal(s.goal, 500);
  assert.equal(s.gateOpen, true);
  assert.equal(s.everLoaded, true);
  assert.equal(s.restingReason, "");
});

test("a missing file rests rather than showing zero as if counted", () => {
  const s = M.parseState(null, null);
  assert.equal(s.everLoaded, false);
  assert.equal(s.restingReason, M.RESTING.stopped);
});

test("torn JSON keeps the last good render", () => {
  const loaded = M.parseState(good, null);
  const torn = M.parseState('{"schema":1,"wordsTod', loaded);
  assert.equal(torn.wordsToday, 120, "a bad tick must not blank the bar");
  assert.equal(torn.everLoaded, true);
});

test("garbage before anything loaded rests, and says why", () => {
  const s = M.parseState("not json at all", null);
  assert.equal(s.everLoaded, false);
  assert.equal(s.restingReason, M.RESTING.unreadable);
});

test("a JSON array is not a state object", () => {
  const s = M.parseState("[1,2,3]", null);
  assert.equal(s.everLoaded, false);
  assert.equal(s.restingReason, M.RESTING.malformed);
});

test("an unknown schema refuses to guess", () => {
  const s = M.parseState(JSON.stringify({ schema: 2, wordsToday: 999 }), null);
  assert.equal(s.everLoaded, false);
  assert.equal(s.restingReason, M.RESTING.version);
  assert.equal(s.wordsToday, 0, "numbers from an unreadable layout must not render");
});

test("hostile numbers are clamped, not trusted", () => {
  const s = M.parseState(JSON.stringify({
    schema: 1, wordsToday: -5, goal: 0, updatedAt: "soon", gateOpen: "yes"
  }), null);
  assert.equal(s.wordsToday, 0, "negative words cannot render a negative bar");
  assert.equal(s.goal, 1, "a zero goal would divide by zero in progress");
  assert.equal(s.updatedAt, 0, "a non-numeric timestamp is no timestamp");
  assert.equal(s.gateOpen, false, "only a real boolean opens the gate");
});

test("state preserves goals across the QML int range", () => {
  const s = M.parseState(JSON.stringify({ schema: 1, goal: 10 ** 9 }), null);
  assert.equal(s.goal, 10 ** 9);
});

test("a wrong-typed field falls back without discarding the others", () => {
  const s = M.parseState(JSON.stringify({
    schema: 1, wordsToday: "many", goal: 800, gateOpen: true
  }), null);
  assert.equal(s.goal, 800, "one bad field must not lose the good ones");
  assert.equal(s.wordsToday, 0);
});

test("an unknown mascot keeps the current one", () => {
  const loaded = M.parseState(good, null);
  const s = M.parseState(JSON.stringify({ schema: 1, mascot: "dragon" }), loaded);
  assert.equal(s.mascot, "bird");
  assert.ok(M.MASCOTS[s.mascot], "the render must always have a real mascot set");
});

test("byOrigin drops entries that are not counts", () => {
  const s = M.parseState(JSON.stringify({
    schema: 1, byOrigin: { filewatch: 40, bogus: "lots", negative: -3 }
  }), null);
  assert.equal(s.byOrigin.filewatch, 40);
  assert.ok(!("bogus" in s.byOrigin));
  assert.equal(s.byOrigin.negative, 0);
});

test("no note path can reach the widget through the contract", () => {
  const s = M.parseState(JSON.stringify({
    schema: 1, wordsToday: 5, tracking: { "/home/me/secret diary.md": [0, 5, 5] }
  }), null);
  assert.ok(!("tracking" in s), "tracking is engine bookkeeping, never rendered");
  assert.equal(JSON.stringify(s).indexOf("secret diary"), -1);
});

test("history drops entries that are not days", () => {
  const s = M.parseState(JSON.stringify({
    schema: 1,
    history: [
      { date: "2026-09-01", words: 980, goal: 500 },
      { date: "2026-09-02", words: "lots", goal: 500 },
      { words: 100, goal: 500 },
      null,
      { date: "2026-09-03", words: 12, goal: 500 }
    ]
  }), null);
  assert.deepEqual(s.history.map(d => d.date), ["2026-09-01", "2026-09-03"]);
});

test("history is an array even when the field is junk", () => {
  const s = M.parseState(JSON.stringify({ schema: 1, history: "yesterday" }), null);
  assert.ok(Array.isArray(s.history));
  assert.equal(s.history.length, 0);
});

// --------------------------------------------------------------- parseConfig
//
// The engine's config file, read by the panel so it can show what is set and
// offer to change it. Untrusted for the same reason state.json is: the panel
// renders these strings into buttons.

const CONFIG = (over = {}) => JSON.stringify(Object.assign({
  goal: 500, watch: [], extensions: [".md"], whitelist: [],
  graceSeconds: 15, pollSeconds: 2, mascot: "bird"
}, over));

test("parseConfig: a missing file keeps defaults and stays unloaded", () => {
  const c = M.parseConfig(null, null);
  assert.equal(c.loaded, false);
  assert.equal(c.goal, 500);
  assert.deepEqual(c.watch, []);
});

test("parseConfig: reads the four settings the panel offers", () => {
  const c = M.parseConfig(CONFIG({ goal: 800, watch: ["/notes"], whitelist: ["kate"], mascot: "snail" }), null);
  assert.equal(c.loaded, true);
  assert.equal(c.goal, 800);
  assert.deepEqual(c.watch, ["/notes"]);
  assert.deepEqual(c.whitelist, ["kate"]);
  assert.equal(c.mascot, "snail");
});

test("parseConfig: malformed JSON holds the last good values", () => {
  const good = M.parseConfig(CONFIG({ goal: 900, watch: ["/x"] }), null);
  const after = M.parseConfig("{ truncated", good);
  assert.equal(after.goal, 900, "a torn read must not blank the panel");
  assert.deepEqual(after.watch, ["/x"]);
});

test("parseConfig: non-string list entries are dropped, not coerced", () => {
  const c = M.parseConfig(CONFIG({ watch: ["/a", 42, null, "", "/b"] }), null);
  assert.deepEqual(c.watch, ["/a", "/b"]);
});

test("parseConfig: duplicates collapse", () => {
  const c = M.parseConfig(CONFIG({ whitelist: ["kate", "kate", "vim"] }), null);
  assert.deepEqual(c.whitelist, ["kate", "vim"]);
});

test("parseConfig: a pathological config cannot produce an unbounded panel", () => {
  const many = Array.from({ length: 500 }, (_, i) => "/p" + i);
  const long = "/" + "x".repeat(5000);
  const c = M.parseConfig(CONFIG({ watch: many.concat([long]) }), null);
  assert.equal(c.watch.length, M.LIST_MAX);
  const widest = c.watch.reduce((n, p) => Math.max(n, p.length), 0);
  assert.ok(widest <= M.PATH_MAX);
});

test("parseConfig: a goal uses the QML int range without a policy ceiling", () => {
  // The engine validates goal >= 1 and has no upper policy bound. The panel's
  // only ceiling is the integer type it must render through QML.
  assert.equal(M.parseConfig(CONFIG({ goal: 0 }), null).goal, 1);
  assert.equal(M.parseConfig(CONFIG({ goal: -10 }), null).goal, 1);
  assert.equal(M.parseConfig(CONFIG({ goal: 10 ** 9 }), null).goal, 10 ** 9);
  assert.equal(M.parseConfig(CONFIG({ goal: M.INT_MAX + 1 }), null).goal, M.INT_MAX);
});

test("parseConfig: a goal that is not a number falls back", () => {
  assert.equal(M.parseConfig(CONFIG({ goal: "lots" }), null).goal, 500);
  assert.equal(M.parseConfig(CONFIG({ goal: null }), null).goal, 500);
});

test("parseConfig: an unknown mascot keeps the current one", () => {
  const c = M.parseConfig(CONFIG({ mascot: "dragon" }), null);
  assert.equal(c.mascot, "bird");
});

test("parseConfig: an array is not an object", () => {
  const c = M.parseConfig("[1,2,3]", null);
  assert.equal(c.loaded, false);
});

// ------------------------------------------------------- lastFocusedApp

test("parseState: the whitelist candidate arrives verbatim", () => {
  const s = M.parseState(JSON.stringify({ schema: 1, lastFocusedApp: "md.obsidian.Obsidian" }), null);
  assert.equal(s.lastFocusedApp, "md.obsidian.Obsidian");
});

test("parseState: no candidate is an empty string, never undefined", () => {
  assert.equal(M.parseState(JSON.stringify({ schema: 1 }), null).lastFocusedApp, "");
  assert.equal(M.parseState(JSON.stringify({ schema: 1, lastFocusedApp: 42 }), null).lastFocusedApp, "");
});

test("parseState: an absurd app id is capped before it reaches a button", () => {
  const s = M.parseState(JSON.stringify({ schema: 1, lastFocusedApp: "a".repeat(9000) }), null);
  assert.equal(s.lastFocusedApp.length, M.APP_ID_MAX);
});

// ------------------------------------------- SERVICE STATUS (untrusted JSON)
//
// The engine's status object crosses a process boundary into the shell, and
// what the panel does with it is offer buttons -- one of which replaces files.
// So it is parsed exactly as hostile as state.json is, and with one extra rule:
// this one fails closed as a whole rather than field by field. A half-understood
// status is not a status to act on.

const okStatus = (over = {}) => JSON.stringify(Object.assign({
  schema: 1,
  action: "",
  ok: true,
  changed: false,
  rolledBack: false,
  rollbackFailed: false,
  message: "",
  state: "ready",
  installed: true,
  current: true,
  enabled: true,
  activeState: "active",
  stateFresh: true,
  sourceAvailable: true,
  sourceVersion: "0.1.0",
  installedVersion: "0.1.0",
  enginePath: "/home/u/.local/bin/writing-critter",
  unitPath: "/home/u/.config/systemd/user/writing-critter.service"
}, over));

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

test("parseServiceStatus: a well-formed status is taken at its word", () => {
  const s = M.parseServiceStatus(okStatus());
  assert.equal(s.state, "ready");
  assert.equal(s.installed, true);
  assert.equal(s.enginePath, "/home/u/.local/bin/writing-critter");
  assert.equal(s.sourceVersion, "0.1.0");
});

test("parseServiceStatus: every published state survives the round trip", () => {
  for (const state of M.SERVICE_STATES)
    assert.equal(M.parseServiceStatus(okStatus({ state })).state, state);
});

test("parseServiceStatus: junk of every shape becomes unknown, never a throw", () => {
  const junk = [
    null, undefined, 42, {}, [], "", "   ", "not json", "{", "[]", "null",
    '"a string"', "[1,2,3]", '{"schema":1}', "{}"
  ];
  for (const raw of junk) {
    const s = M.parseServiceStatus(raw);
    assert.equal(s.state, M.SERVICE_UNKNOWN, `for ${JSON.stringify(raw)}`);
    assert.equal(s.installed, false);
    assert.equal(s.ok, false);
  }
});

test("parseServiceStatus: an unknown schema is not salvaged field by field", () => {
  const s = M.parseServiceStatus(okStatus({ schema: 2 }));
  assert.equal(s.state, M.SERVICE_UNKNOWN);
  assert.equal(s.enginePath, "", "a field from a schema we cannot read is not a field we keep");
});

test("parseServiceStatus: a state outside the vocabulary is unknown", () => {
  for (const state of ["broken", "READY", "", null, 1, "purging"])
    assert.equal(M.parseServiceStatus(okStatus({ state })).state, M.SERVICE_UNKNOWN);
});

test("parseServiceStatus: oversized output is refused rather than parsed", () => {
  const huge = okStatus({ message: "x".repeat(M.SERVICE_RAW_MAX) });
  assert.ok(huge.length > M.SERVICE_RAW_MAX);
  assert.equal(M.parseServiceStatus(huge).state, M.SERVICE_UNKNOWN);
});

test("parseServiceStatus: text fields are bounded and stripped of control codes", () => {
  const s = M.parseServiceStatus(okStatus({
    message: "one\ntwo\u0007three\u001b[31m",
    activeState: "a".repeat(5000)
  }));
  assert.ok(!CONTROL_CHARS.test(s.message), "a control code reached a panel line");
  assert.ok(s.message.length <= M.SERVICE_TEXT_MAX);
  assert.equal(s.activeState.length, M.SERVICE_TEXT_MAX);
});

test("parseServiceStatus: only real booleans are true", () => {
  const s = M.parseServiceStatus(okStatus({
    installed: "yes", enabled: 1, current: [], stateFresh: "true", ok: {}
  }));
  for (const key of ["installed", "enabled", "current", "stateFresh", "ok"])
    assert.equal(s[key], false, key);
});

test("parseServiceStatus: a wrong-typed string field becomes empty, not coerced", () => {
  const s = M.parseServiceStatus(okStatus({ enginePath: 12345, message: ["a"] }));
  assert.equal(s.enginePath, "");
  assert.equal(s.message, "");
});

test("parseServiceStatus: an action outside the vocabulary is dropped", () => {
  assert.equal(M.parseServiceStatus(okStatus({ action: "install" })).action, "install");
  assert.equal(M.parseServiceStatus(okStatus({ action: "purge" })).action, "");
});

// ------------------------------------------------------- THE SETUP DECISION

test("serviceOffer: every state offers exactly one action, and it is a real one", () => {
  for (const state of M.SERVICE_STATES.concat([M.SERVICE_UNKNOWN])) {
    const offer = M.serviceOffer(state);
    assert.ok(offer.headline.length > 0, state);
    if (offer.action !== "")
      assert.ok(M.SERVICE_ACTIONS.includes(offer.action), `${state} -> ${offer.action}`);
  }
});

test("serviceOffer: the state machine maps each state to the repair that fits", () => {
  assert.equal(M.serviceOffer("not-installed").action, "install");
  assert.equal(M.serviceOffer("update-available").action, "install");
  assert.equal(M.serviceOffer("stopped").action, "start");
  assert.equal(M.serviceOffer("unhealthy").action, "restart");
  assert.equal(M.serviceOffer("starting").action, "status");
  assert.equal(M.serviceOffer("ready").action, "");
});

test("serviceOffer: only install offers a review; a repair does not", () => {
  assert.equal(M.serviceOffer("not-installed").confirm, true);
  assert.equal(M.serviceOffer("update-available").confirm, true);
  assert.equal(M.serviceOffer("stopped").confirm, false);
  assert.equal(M.serviceOffer("unhealthy").confirm, false);
});

test("serviceOffer: the confirmed actions and the offers that need one agree", () => {
  for (const state of M.SERVICE_STATES) {
    const offer = M.serviceOffer(state);
    if (offer.action === "")
      continue;
    assert.equal(offer.confirm, M.SERVICE_CONFIRM.includes(offer.action),
      `${state} disagrees about whether ${offer.action} is confirmed`);
  }
});

test("serviceOffer: an unrecognised state falls back to unknown, which acts on nothing", () => {
  for (const state of ["", null, undefined, "purging", "READY"]) {
    const offer = M.serviceOffer(state);
    assert.equal(offer.severity, "unknown");
    assert.equal(offer.action, "status", "the only thing to do with an unreadable status is ask again");
  }
});

test("serviceNeedsSetup: only a ready engine hides the card", () => {
  assert.equal(M.serviceNeedsSetup("ready"), false);
  for (const state of ["not-installed", "update-available", "stopped",
                       "starting", "unhealthy", M.SERVICE_UNKNOWN])
    assert.equal(M.serviceNeedsSetup(state), true, state);
});

test("serviceCanRemove: nothing installed, nothing to remove", () => {
  assert.equal(M.serviceCanRemove(M.parseServiceStatus(okStatus({ installed: true }))), true);
  assert.equal(M.serviceCanRemove(M.parseServiceStatus(okStatus({ installed: false }))), false);
  assert.equal(M.serviceCanRemove(M.parseServiceStatus("garbage")), false);
  assert.equal(M.serviceCanRemove(null), false);
});

// ------------------------------------------------------------ THE DISCLOSURE

test("serviceDisclosure: setup names both destinations and the three denials", () => {
  const lines = M.serviceDisclosure("install", M.parseServiceStatus(okStatus({ installed: false })));
  const text = lines.join("\n");
  assert.match(text, /\.local\/bin\/writing-critter/);
  assert.match(text, /systemd\/user\/writing-critter\.service/);
  assert.match(text, /starts that service as you/);
  assert.match(text, /No administrator access, no network, no package manager/);
  assert.match(text, /history are not touched/);
});

test("serviceDisclosure: an update says it replaces, a fresh install says it copies", () => {
  const fresh = M.serviceDisclosure("install", M.parseServiceStatus(okStatus({ installed: false })));
  const update = M.serviceDisclosure("install", M.parseServiceStatus(okStatus({ installed: true })));
  assert.match(fresh[0], /^Copies/);
  assert.match(update[0], /^Replaces/);
});

test("serviceDisclosure: removal promises what it keeps, not only what it takes", () => {
  const text = M.serviceDisclosure("uninstall", M.parseServiceStatus(okStatus())).join("\n");
  assert.match(text, /Stops and disables/);
  assert.match(text, /Removes .*\.local\/bin\/writing-critter/);
  assert.match(text, /Keeps your settings, today's count and your history/);
});

test("serviceDisclosure: with no status yet it still names the real destinations", () => {
  const text = M.serviceDisclosure("install", null).join("\n");
  assert.match(text, /~\/\.local\/bin\/writing-critter/);
  assert.match(text, /~\/\.config\/systemd\/user\/writing-critter\.service/);
});

test("serviceDisclosure: nothing else gets a review, so nothing else can be confirmed", () => {
  for (const action of ["start", "restart", "status", "", "purge"])
    assert.deepEqual(M.serviceDisclosure(action, null), []);
});

test("serviceConfirmTitle and label distinguish setup from update", () => {
  const fresh = M.parseServiceStatus(okStatus({ installed: false }));
  const there = M.parseServiceStatus(okStatus({ installed: true }));
  assert.equal(M.serviceConfirmTitle("install", fresh), "Set up the engine?");
  assert.equal(M.serviceConfirmTitle("install", there), "Update the engine?");
  assert.equal(M.serviceConfirmLabel("install", fresh), "Install");
  assert.equal(M.serviceConfirmLabel("install", there), "Update");
  assert.equal(M.serviceConfirmTitle("uninstall", there), "Remove the engine?");
  assert.equal(M.serviceConfirmTitle("start", there), "");
});

// ---------------------------------------------------------- THE WAY OUT

test("serviceCommand: built from the shell's own engine path", () => {
  assert.equal(M.serviceCommand("/plugins/wc/bin/writing-critter", "install"),
               "/plugins/wc/bin/writing-critter service install");
});

test("serviceCommand: an action outside the vocabulary yields no command", () => {
  for (const action of ["", "purge", "rm -rf /", null])
    assert.equal(M.serviceCommand("/plugins/wc/bin/writing-critter", action), "");
});

test("serviceCommand: with no resolved path it names the program, not nothing", () => {
  assert.equal(M.serviceCommand("", "start"), "writing-critter service start");
  assert.equal(M.serviceCommand(null, "start"), "writing-critter service start");
});

test("serviceProgress: every action says what it is doing", () => {
  for (const action of M.SERVICE_ACTIONS)
    assert.ok(M.serviceProgress(action).length > 0, action);
  assert.equal(M.serviceProgress("nonsense"), "");
});

// ------------------------------------------------------- THE COMMAND QUEUE
//
// Control.qml cannot be tested as Control.qml: Quickshell ships only
// .qmltypes and links its plugin into the quickshell binary, so nothing that
// imports Quickshell can be instantiated by qmltestrunner. These are the
// decisions that were moved out of it for exactly that reason — which argv an
// action maps to, how many processes a multi-monitor bar spawns, and whether
// two of them can overlap.

test("serviceArgv: each action maps to one fixed argument list", () => {
  for (const action of M.SERVICE_ACTIONS)
    assert.deepEqual(M.serviceArgv(action), ["service", action, "--json"]);
});

test("serviceArgv: anything not in the vocabulary gets null, not a command", () => {
  const attempts = [
    "purge", "", null, undefined, 0, [], {}, "status; rm -rf /",
    "status --root=/", "../../bin/sh", "INSTALL", " install", "install "
  ];
  for (const attempt of attempts)
    assert.equal(M.serviceArgv(attempt), null, `${JSON.stringify(attempt)} produced a command`);
});

test("serviceArgv: the caller supplies a name and never an argument", () => {
  // Whatever a caller passes, the only variable part of the result is the
  // action itself, and it has already been checked against the vocabulary.
  for (const action of M.SERVICE_ACTIONS) {
    const argv = M.serviceArgv(action);
    assert.equal(argv.length, 3);
    assert.equal(argv[0], "service");
    assert.equal(argv[2], "--json");
    assert.ok(!argv.some(a => a.includes("/")), "a path reached an argument list");
  }
});

test("configArgv: the config vocabulary is closed too, and values are stringified", () => {
  assert.deepEqual(M.configArgv("set-goal", 800), ["config", "set-goal", "800"]);
  assert.deepEqual(M.configArgv("add-path", "/home/u/notes"),
                   ["config", "add-path", "/home/u/notes"]);
  for (const bad of ["service", "install", "purge", "", null])
    assert.equal(M.configArgv(bad, "x"), null, `${bad} produced a command`);
});

test("the two vocabularies do not overlap", () => {
  for (const action of M.SERVICE_ACTIONS)
    assert.equal(M.CONFIG_ACTIONS.includes(action), false, action);
  for (const action of M.CONFIG_ACTIONS)
    assert.equal(M.SERVICE_ACTIONS.includes(action), false, action);
});

// ------------------------------------------------------------ serialisation

const entry = (kind, action) => M.queueEntry(kind, action, M.serviceArgv(action) || []);

test("queueNext: nothing starts while something is in flight", () => {
  const pending = [entry("service", "install"), entry("service", "status")];
  assert.equal(M.queueNext(pending, true), null, "a second process was started");
  assert.deepEqual(M.queueNext(pending, false), pending[0]);
});

test("queueNext: an empty queue starts nothing", () => {
  assert.equal(M.queueNext([], false), null);
  assert.equal(M.queueNext(null, false), null);
  assert.equal(M.queueNext(undefined, false), null);
});

test("queueNext: a config action and a service action cannot overlap", () => {
  // The single queue is the whole mechanism: a service action queued behind a
  // config mutation waits for it, and vice versa.
  let pending = [];
  pending = M.queueAppend(pending, M.queueEntry("config", "set-goal", M.configArgv("set-goal", 900)));
  pending = M.queueAppend(pending, entry("service", "install"));
  const first = M.queueNext(pending, false);
  assert.equal(first.kind, "config");
  assert.equal(M.queueNext(pending, true), null, "the service action started anyway");
});

test("queueAppend: does not mutate the array it was given", () => {
  const before = [entry("service", "status")];
  const after = M.queueAppend(before, entry("service", "install"));
  assert.equal(before.length, 1, "the queue was mutated in place");
  assert.equal(after.length, 2);
});

// ---------------------------------------------------------------- coalescing

test("queueHolds: a probe already in flight is not queued again", () => {
  const current = entry("service", "status");
  assert.equal(M.queueHolds([], current, true, "service", "status"), true);
});

test("queueHolds: a probe already waiting is not queued again", () => {
  const pending = [entry("service", "install"), entry("service", "status")];
  assert.equal(M.queueHolds(pending, null, false, "service", "status"), true);
});

test("queueHolds: an idle queue holds nothing", () => {
  assert.equal(M.queueHolds([], null, false, "service", "status"), false);
  assert.equal(M.queueHolds(null, null, false, "service", "status"), false);
});

test("queueHolds: a finished probe still in `current` does not block the next one", () => {
  // current survives the process it described; only inflight says it is live.
  const current = entry("service", "status");
  assert.equal(M.queueHolds([], current, false, "service", "status"), false);
});

test("queueHolds: three monitors opening a panel produce one probe", () => {
  // What Control.refreshServiceStatus does, three times in a row.
  let pending = [];
  let spawned = 0;
  for (let screen = 0; screen < 3; screen++) {
    if (!M.queueHolds(pending, null, false, "service", "status")) {
      pending = M.queueAppend(pending, entry("service", "status"));
      spawned++;
    }
  }
  assert.equal(spawned, 1, "one glance at the bar spawned a process per screen");
  assert.equal(pending.length, 1);
});

test("queueHolds: coalescing is per action, not a blanket suppression", () => {
  const pending = [entry("service", "status")];
  assert.equal(M.queueHolds(pending, null, false, "service", "install"), false,
    "a queued probe suppressed a real action");
});

// ------------------------------------------------------------------ timeouts

test("watchdogFor: a service action gets the longer budget", () => {
  assert.equal(M.watchdogFor("service"), M.WATCHDOG_SERVICE_MS);
  assert.equal(M.watchdogFor("config"), M.WATCHDOG_CONFIG_MS);
  assert.equal(M.watchdogFor(""), M.WATCHDOG_CONFIG_MS);
  assert.equal(M.watchdogFor(undefined), M.WATCHDOG_CONFIG_MS);
});

test("watchdogFor: the service budget outlasts the engine's own systemd timeouts", () => {
  // The engine allows 8s per systemctl call and an install makes three, plus
  // the verification window. A watchdog inside that would report a timeout for
  // an install that then succeeded.
  assert.ok(M.WATCHDOG_SERVICE_MS > 8000 * 3 + 2000,
    "the watchdog can fire on a slow but working install");
  assert.ok(M.WATCHDOG_SERVICE_MS > M.WATCHDOG_CONFIG_MS);
});

// ----------------------------------------------------------------- settling

const settleStatus = (over = {}) => JSON.stringify(Object.assign({
  schema: 1, action: "install", ok: true, changed: true,
  rolledBack: false, rollbackFailed: false, message: "",
  state: "ready", installed: true, current: true, enabled: true,
  activeState: "active", stateFresh: true, sourceAvailable: true,
  sourceVersion: "0.1.0", installedVersion: "0.1.0",
  enginePath: "/home/u/.local/bin/writing-critter",
  unitPath: "/home/u/.config/systemd/user/writing-critter.service"
}, over));

test("serviceSettlement: a clean success clears the previous failure", () => {
  const out = M.serviceSettlement("install", "", settleStatus(), null);
  assert.equal(out.failed, false);
  assert.equal(out.failedAction, "");
  assert.equal(out.failureReason, "");
  assert.equal(out.status.state, "ready");
});

test("serviceSettlement: the engine's own message beats the exit code", () => {
  const raw = settleStatus({ ok: false, message: "systemctl enable: refused" });
  const out = M.serviceSettlement("install", "exited 1", raw, null);
  assert.equal(out.failed, true);
  assert.equal(out.failedAction, "install");
  assert.equal(out.failureReason, "systemctl enable: refused",
    "the panel showed 'exited 1' instead of the step that refused");
});

test("serviceSettlement: without a message it falls back to the process boundary", () => {
  const out = M.serviceSettlement("start", "timed out", "", null);
  assert.equal(out.failed, true);
  assert.equal(out.failureReason, "timed out");
});

test("serviceSettlement: a result object is read even when the process failed", () => {
  // A failed install still reports the state it left behind, and that is the
  // state the panel has to show.
  const raw = settleStatus({ ok: false, state: "not-installed", installed: false,
                             rolledBack: true, message: "the service did not start" });
  const out = M.serviceSettlement("install", "exited 1", raw, null);
  assert.equal(out.status.state, "not-installed");
  assert.equal(out.rolledBack, true);
  assert.equal(out.rollbackFailed, false);
});

test("serviceSettlement: rollback failure is carried separately", () => {
  const raw = settleStatus({ ok: false, rolledBack: true, rollbackFailed: true });
  const out = M.serviceSettlement("install", "exited 1", raw, null);
  assert.equal(out.rolledBack, true);
  assert.equal(out.rollbackFailed, true);
});

test("serviceSettlement: unreadable output from a failed process keeps the last known state", () => {
  const previous = M.parseServiceStatus(settleStatus({ state: "ready" }));
  const out = M.serviceSettlement("restart", "timed out", "garbage", previous);
  assert.equal(out.status.state, "ready", "a timeout blanked a state we already knew");
  assert.equal(out.failed, true);
});

test("serviceSettlement: unreadable output from a clean exit is still unknown", () => {
  // Exit 0 and nonsense on stdout is not a success to be optimistic about.
  const previous = M.parseServiceStatus(settleStatus({ state: "ready" }));
  const out = M.serviceSettlement("status", "", "garbage", previous);
  assert.equal(out.status.state, M.SERVICE_UNKNOWN);
});

test("serviceSettlement: ok:false in the payload fails even on a clean exit", () => {
  const out = M.serviceSettlement("install", "", settleStatus({ ok: false }), null);
  assert.equal(out.failed, true);
});

test("serviceSettlement: only a starting service asks to be looked at again", () => {
  for (const state of M.SERVICE_STATES) {
    const out = M.serviceSettlement("status", "", settleStatus({ state }), null);
    assert.equal(out.reprobe, state === "starting", state);
  }
  assert.equal(M.serviceSettlement("status", "", "garbage", null).reprobe, false);
});

test("the re-probe after a start is bounded", () => {
  assert.ok(M.STARTING_REPROBE_MAX > 0);
  assert.ok(M.STARTING_REPROBE_MAX <= 5,
    "a unit stuck in 'starting' would turn a settling delay into a poll");
});

// ------------------------------------------------------------- THE OUTCOME
//
// Before this, a successful install made the setup card vanish: every term of
// its `visible` binding went false at once, so the one case with no feedback
// was the one that worked. These pin down what is said afterwards, when it is
// kept, and what is allowed to clear it.

const ENGINE = "/plugins/wc/bin/writing-critter";

const result = (action, over = {}) => JSON.stringify(Object.assign({
  schema: 1, action, ok: true, changed: true,
  rolledBack: false, rollbackFailed: false, message: "",
  state: "ready", installed: true, current: true, enabled: true,
  activeState: "active", stateFresh: true, sourceAvailable: true,
  sourceVersion: "0.1.0", installedVersion: "0.1.0",
  enginePath: "/home/u/.local/bin/writing-critter",
  unitPath: "/home/u/.config/systemd/user/writing-critter.service"
}, over));

const settled = (action, over = {}, reason = "") =>
  M.serviceSettlement(action, reason, result(action, over), null);

const before = (over = {}) => M.parseServiceStatus(result("status", over));

test("serviceOutcome: every lifecycle action has its own success sentence", () => {
  const seen = new Set();
  const cases = [
    ["install", before({ installed: false })],
    ["start", before()], ["restart", before()], ["uninstall", before()]
  ];
  for (const [action, prev] of cases) {
    const out = M.serviceOutcome(action, settled(action), prev, ENGINE);
    assert.equal(out.ok, true, action);
    assert.ok(out.headline.length > 0, action);
    assert.notEqual(out.headline.toLowerCase(), "done", `${action} said nothing specific`);
    seen.add(out.headline);
  }
  assert.equal(seen.size, cases.length, "two different actions reported the same sentence");
});

test("serviceOutcome: a first setup and an update are told apart", () => {
  // Both are the "install" action; only the state before it differs.
  const fresh = M.serviceOutcome("install", settled("install"), before({ installed: false }), ENGINE);
  const update = M.serviceOutcome("install", settled("install"), before({ installed: true }), ENGINE);
  assert.match(fresh.headline, /installed and running/);
  assert.match(update.headline, /updated and restarted/);
});

test("serviceOutcome: an install that changed nothing does not claim an update", () => {
  const out = M.serviceOutcome("install", settled("install", { changed: false }),
                               before({ installed: true }), ENGINE);
  assert.match(out.headline, /already up to date/);
});

test("serviceOutcome: removal says what went and what stayed", () => {
  const out = M.serviceOutcome("uninstall", settled("uninstall", { installed: false, state: "not-installed" }),
                               before(), ENGINE);
  assert.match(out.headline, /removed/);
  assert.match(out.detail, /program and user service are gone/);
  assert.match(out.detail, /settings, today's count and your history were kept/);
});

test("serviceOutcome: removing nothing is not reported as a removal", () => {
  const out = M.serviceOutcome("uninstall", settled("uninstall", { changed: false }),
                               before({ installed: false }), ENGINE);
  assert.match(out.headline, /no engine to remove/);
});

test("serviceOutcome: a failure names what did not happen and why", () => {
  const out = M.serviceOutcome("install",
    settled("install", { ok: false, message: "systemctl enable: refused" }, "exited 1"),
    before({ installed: false }), ENGINE);
  assert.equal(out.ok, false);
  assert.equal(out.headline, "Setup did not finish.");
  assert.equal(out.detail, "systemctl enable: refused",
    "the engine's own sentence was replaced by the exit code");
});

test("serviceOutcome: a failed update is not called a failed setup", () => {
  const out = M.serviceOutcome("install", settled("install", { ok: false }, "exited 1"),
                               before({ installed: true }), ENGINE);
  assert.equal(out.headline, "The update did not finish.");
});

test("serviceOutcome: every failure carries the command to run by hand", () => {
  for (const action of ["install", "start", "restart", "uninstall"]) {
    const out = M.serviceOutcome(action, settled(action, { ok: false }, "exited 1"), before(), ENGINE);
    assert.equal(out.command, `${ENGINE} service ${action}`, action);
  }
});

test("serviceOutcome: a success carries no command, because there is nothing to retry", () => {
  const out = M.serviceOutcome("start", settled("start"), before(), ENGINE);
  assert.equal(out.command, "");
});

test("serviceOutcome: the rollback is described in terms of what was there before", () => {
  const firstSetup = M.serviceOutcome("install",
    settled("install", { ok: false, rolledBack: true }, "exited 1"), before({ installed: false }), ENGINE);
  assert.match(firstSetup.rollback, /Nothing was left installed/);
  assert.doesNotMatch(firstSetup.rollback, /previous engine/,
    "a first setup has no previous engine to put back");

  const update = M.serviceOutcome("install",
    settled("install", { ok: false, rolledBack: true }, "exited 1"), before({ installed: true }), ENGINE);
  assert.match(update.rollback, /previous engine was put back/);
});

test("serviceOutcome: a rollback that could not restore the service says so", () => {
  const out = M.serviceOutcome("install",
    settled("install", { ok: false, rolledBack: true, rollbackFailed: true }, "exited 1"),
    before({ installed: true }), ENGINE);
  assert.match(out.rollback, /could not be restored/);
});

test("serviceOutcome: a status probe produces no outcome at all", () => {
  assert.equal(M.serviceOutcome("status", settled("status"), before(), ENGINE), null);
  assert.equal(M.serviceOutcome("status", settled("status", { ok: false }, "timed out"), before(), ENGINE), null);
});

test("serviceOutcome: an action outside the vocabulary produces nothing", () => {
  for (const action of ["purge", "", null, undefined])
    assert.equal(M.serviceOutcome(action, settled("install"), before(), ENGINE), null);
});

// -------------------------------------------------------- what may clear it

test("nextServiceOutcome: nothing has happened yet, so there is nothing to say", () => {
  assert.equal(M.nextServiceOutcome(null, "status", settled("status"), null, ENGINE), null);
  assert.equal(M.nextServiceOutcome(undefined, "status", settled("status"), null, ENGINE), null);
});

test("nextServiceOutcome: a status probe keeps a success on screen", () => {
  const shown = M.serviceOutcome("install", settled("install"), before({ installed: false }), ENGINE);
  const after = M.nextServiceOutcome(shown, "status", settled("status"), before(), ENGINE);
  assert.equal(after, shown, "the probe that follows an action erased its confirmation");
});

test("nextServiceOutcome: a failing status probe keeps it on screen too", () => {
  const shown = M.serviceOutcome("start", settled("start"), before(), ENGINE);
  const after = M.nextServiceOutcome(shown, "status", settled("status", {}, "timed out"), before(), ENGINE);
  assert.equal(after, shown);
});

test("nextServiceOutcome: a probe cannot clear a failure either", () => {
  // Previously a successful probe reset serviceFailedAction, so a real
  // failure silently disappeared the next time the panel opened.
  const failure = M.serviceOutcome("install", settled("install", { ok: false }, "exited 1"),
                                   before({ installed: false }), ENGINE);
  const after = M.nextServiceOutcome(failure, "status", settled("status"), before(), ENGINE);
  assert.equal(after, failure);
});

test("nextServiceOutcome: the next action replaces the last one", () => {
  const first = M.serviceOutcome("install", settled("install", { ok: false }, "exited 1"),
                                 before({ installed: false }), ENGINE);
  const second = M.nextServiceOutcome(first, "install", settled("install"),
                                      before({ installed: false }), ENGINE);
  assert.equal(second.ok, true, "a retry that worked still showed the old failure");
});

test("nextProbeError: only a failed probe sets it, and anything else clears it", () => {
  assert.equal(M.nextProbeError("status", settled("status", {}, "timed out")), "timed out");
  assert.equal(M.nextProbeError("status", settled("status")), "");
  assert.equal(M.nextProbeError("start", settled("start", { ok: false }, "exited 1")), "",
    "a lifecycle failure is an outcome, not a probe error");
});

test("serviceRefused: an invented action is reported, not silently dropped", () => {
  const out = M.serviceRefused("purge");
  assert.equal(out.ok, false);
  assert.match(out.detail, /purge is not an allowed action/);
  assert.equal(out.command, "", "a refused action must not be offered as a command to run");
});

// ------------------------------------------------------ whether it is seen

test("serviceCardVisible: a success keeps the card up", () => {
  const outcome = M.serviceOutcome("install", settled("install"), before({ installed: false }), ENGINE);
  assert.equal(M.serviceCardVisible({ probed: true, state: "ready", busy: false, outcome }), true,
    "the card vanished at the moment it should have said that worked");
});

test("serviceCardVisible: once dismissed, a ready engine hides it again", () => {
  assert.equal(M.serviceCardVisible({ probed: true, state: "ready", busy: false, outcome: null }), false);
});

test("serviceCardVisible: it still appears for every state that needs setup", () => {
  for (const state of ["not-installed", "update-available", "stopped", "starting", "unhealthy", M.SERVICE_UNKNOWN])
    assert.equal(M.serviceCardVisible({ probed: true, state, busy: false, outcome: null }), true, state);
});

test("serviceCardVisible: not before the first probe has answered", () => {
  // Otherwise a fresh panel would offer setup for a moment before learning
  // the engine was already installed.
  assert.equal(M.serviceCardVisible({ probed: false, state: M.SERVICE_UNKNOWN, busy: false, outcome: null }), false);
});

test("serviceCardVisible: an action in flight is always shown", () => {
  assert.equal(M.serviceCardVisible({ probed: true, state: "ready", busy: true, outcome: null }), true);
});

test("serviceCardVisible: a probe that could not reach the engine is shown", () => {
  assert.equal(M.serviceCardVisible({ probed: true, state: "ready", busy: false,
                                      outcome: null, probeError: "timed out" }), true);
});

test("serviceCardVisible: tolerates a missing view", () => {
  assert.equal(M.serviceCardVisible(undefined), false);
  assert.equal(M.serviceCardVisible({}), false);
});

test("serviceNeedsSetup was not taught that a ready engine needs setup", () => {
  assert.equal(M.serviceNeedsSetup("ready"), false);
});

// ------------------------------------------------------------ the dialog

// The dialog inserts zero-width spaces into paths so they can wrap. Anything
// comparing words has to look through them, exactly as a reader does.
const unwrapped = (text) => text.split(M.ZERO_WIDTH_SPACE).join("");

test("serviceDisclosureMessage: the same lines, in the same words and order", () => {
  for (const installed of [false, true]) {
    const status = before({ installed });
    const lines = M.serviceDisclosure("install", status);
    const message = unwrapped(M.serviceDisclosureMessage("install", status));
    let from = 0;
    for (const line of lines) {
      const at = message.indexOf(line, from);
      assert.ok(at >= 0, `the dialog dropped or reworded: ${line}`);
      from = at + line.length;
    }
  }
});

test("serviceDisclosureMessage: opens with the question being asked", () => {
  assert.match(M.serviceDisclosureMessage("install", before({ installed: false })), /^Set up the engine\?/);
  assert.match(M.serviceDisclosureMessage("install", before({ installed: true })), /^Update the engine\?/);
  assert.match(M.serviceDisclosureMessage("uninstall", before()), /^Remove the engine\?/);
});

test("serviceDisclosureMessage: names both real destinations", () => {
  const message = unwrapped(M.serviceDisclosureMessage("install", before({ installed: false })));
  assert.match(message, /\/home\/u\/\.local\/bin\/writing-critter/);
  assert.match(message, /\/home\/u\/\.config\/systemd\/user\/writing-critter\.service/);
});

test("serviceDisclosureMessage: nothing unconfirmed gets a dialog", () => {
  for (const action of ["start", "restart", "status", "purge", ""])
    assert.equal(M.serviceDisclosureMessage(action, before()), "");
});

test("serviceWorking: the probe that runs on every panel open is not work", () => {
  // Counting it made a healthy engine's card flash "checking" on each open.
  assert.equal(M.serviceWorking("status"), false);
  for (const action of ["install", "start", "restart", "uninstall"])
    assert.equal(M.serviceWorking(action), true, action);
  for (const idle of ["", null, undefined])
    assert.equal(M.serviceWorking(idle), false);
});

test("serviceCardVisible: opening the panel on a healthy engine shows nothing", () => {
  // What Control reports during the probe that opening the panel triggers.
  const busy = M.serviceWorking("status");
  assert.equal(M.serviceCardVisible({ probed: true, state: "ready", busy, outcome: null }), false);
});

// ----------------------------------------------------- fitting the dialog
//
// Measured against the shell's real ConfirmDialog, not guessed: buttons are a
// fixed Style.space(88) wide with no elide, and the message is title-size text
// with WordWrap in a card min(panel - 32, 370) wide -- about 30 monospace
// characters a line in this panel. Before these rules the unit path was a
// 61-character unbreakable token, and the confirm label was 18 characters.

test("serviceConfirmLabel: every label fits a fixed-width button", () => {
  const labels = [
    M.serviceConfirmLabel("install", before({ installed: false })),
    M.serviceConfirmLabel("install", before({ installed: true })),
    M.serviceConfirmLabel("uninstall", before())
  ];
  for (const label of labels) {
    assert.ok(label.length > 0);
    assert.ok(label.length <= M.CONFIRM_LABEL_MAX,
      `"${label}" runs past an 88px button`);
  }
});

test("serviceDisclosureMessage: no unbreakable run is wider than a line", () => {
  // A long real-world home directory, the worst case the review will meet.
  const home = "/home/a-rather-long-username";
  const status = before({ installed: false,
    enginePath: home + "/.local/bin/writing-critter",
    unitPath: home + "/.config/systemd/user/writing-critter.service" });
  const message = M.serviceDisclosureMessage("install", status, home);
  const runs = message.split(/[\s\u200B]+/);
  const longest = Math.max(...runs.map(r => r.length));
  assert.ok(longest <= 30, `a ${longest}-character run cannot wrap inside the dialog card`);
});

test("servicePathForDisplay: a path under home is written with a tilde", () => {
  const shown = unwrapped(M.servicePathForDisplay("/home/u/.local/bin/writing-critter", "/home/u"));
  assert.equal(shown, "~/.local/bin/writing-critter");
});

test("servicePathForDisplay: a custom XDG location is named in full", () => {
  // The review has to say where the unit will really go.
  const shown = unwrapped(M.servicePathForDisplay("/srv/cfg/systemd/user/writing-critter.service", "/home/u"));
  assert.equal(shown, "/srv/cfg/systemd/user/writing-critter.service");
});

test("servicePathForDisplay: a home that is only a prefix is not abbreviated", () => {
  // /home/u must not turn /home/ursula/... into ~rsula/...
  const shown = unwrapped(M.servicePathForDisplay("/home/ursula/.local/bin/writing-critter", "/home/u"));
  assert.equal(shown, "/home/ursula/.local/bin/writing-critter");
});

test("servicePathForDisplay: a root home does not abbreviate every path", () => {
  const shown = unwrapped(M.servicePathForDisplay("/etc/x", "/"));
  assert.equal(shown, "/etc/x");
});

test("servicePathForDisplay: every slash is a place the line may break", () => {
  const shown = M.servicePathForDisplay("/a/b/c", "");
  assert.equal(shown.split("/").length - 1, shown.split(M.ZERO_WIDTH_SPACE).length - 1);
});

test("serviceDisclosureMessage: before status answers, the placeholders wrap too", () => {
  const message = M.serviceDisclosureMessage("install", null, "/home/u");
  assert.ok(message.includes(M.ZERO_WIDTH_SPACE), "a placeholder path cannot wrap");
  assert.match(unwrapped(message), /~\/\.config\/systemd\/user\/writing-critter\.service/);
});
