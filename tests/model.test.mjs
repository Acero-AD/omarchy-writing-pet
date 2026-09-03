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
