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
