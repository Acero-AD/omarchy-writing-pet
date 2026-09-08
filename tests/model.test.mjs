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
  assert.equal(M.serviceConfirmLabel("install", fresh), "Install and start");
  assert.equal(M.serviceConfirmLabel("install", there), "Update and restart");
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
