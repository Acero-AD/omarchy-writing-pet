import test from "node:test";
import assert from "node:assert/strict";
import M from "../Model.js";

const MOODS = ["writing", "idle", "sleeping", "celebrating"];

// ------------------------------------------------------------- word counting

test("countWords: basic whitespace splitting", () => {
  assert.equal(M.countWords("the cat sat on the mat"), 6);
  assert.equal(M.countWords("  leading and trailing  "), 3);
  assert.equal(M.countWords("line one\nline two\ttabbed"), 5);
});

test("countWords: empty and non-string input", () => {
  assert.equal(M.countWords(""), 0);
  assert.equal(M.countWords("   \n\t  "), 0);
  assert.equal(M.countWords(null), 0);
  assert.equal(M.countWords(undefined), 0);
  assert.equal(M.countWords(42), 0);
});

test("countWords: punctuation does not split words", () => {
  assert.equal(M.countWords("Hello, world! It's fine."), 4);
});

test("countWords: CJK characters count individually", () => {
  assert.equal(M.countWords("日本語"), 3);
  assert.equal(M.countWords("hello 日本語 world"), 5);
});

// -------------------------------------------------------------- poll cadence

test("clampPollMs: clamps to the documented range", () => {
  assert.equal(M.clampPollMs(250), M.POLL_MS_MIN);
  assert.equal(M.clampPollMs(2000), 2000);
  assert.equal(M.clampPollMs(999999), M.POLL_MS_MAX);
  assert.equal(M.clampPollMs("nonsense"), M.POLL_MS_DEFAULT);
});

test("resolveProbeLookbackMs: lookback always exceeds the poll interval", () => {
  assert.ok(M.resolveProbeLookbackMs(2000, 3000) > 2000);
  // spec scenario: pollMs 5000 with lookback 3000 must be raised
  assert.ok(M.resolveProbeLookbackMs(5000, 3000) > 5000);
  assert.ok(M.resolveProbeLookbackMs(2000, 2000) > 2000);
});

// ----------------------------------------------------------- file tracking

test("first sight of a file contributes zero", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/vault/a.md", 200000, "additive");
  assert.equal(M.trackedWords(t), 0, "existing collection must not land in today");
});

test("words written after the baseline are counted", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/vault/a.md", 1000, "additive");
  M.observeFile(t, "/vault/a.md", 1412, "additive");
  assert.equal(M.trackedWords(t), 412);
});

test("recounting an unchanged file is idempotent", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/vault/a.md", 1000, "additive");
  M.observeFile(t, "/vault/a.md", 1412, "additive");
  const once = M.trackedWords(t);
  M.observeFile(t, "/vault/a.md", 1412, "additive");
  M.observeFile(t, "/vault/a.md", 1412, "additive");
  assert.equal(M.trackedWords(t), once, "overlapping probe window must not double-count");
});

test("deleting text does not reduce the day's total", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/vault/a.md", 0, "additive");
  M.observeFile(t, "/vault/a.md", 800, "additive");
  assert.equal(M.trackedWords(t), 800);
  M.observeFile(t, "/vault/a.md", 500, "additive"); // cut 300 words
  assert.equal(M.trackedWords(t), 800, "the critter must never walk backwards");
});

test("net mode does subtract deletions", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/vault/a.md", 0, "net");
  M.observeFile(t, "/vault/a.md", 800, "net");
  M.observeFile(t, "/vault/a.md", 500, "net");
  assert.equal(M.trackedWords(t), 500);
});

test("multiple files sum independently", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/a.md", 100, "additive");
  M.observeFile(t, "/b.md", 50, "additive");
  M.observeFile(t, "/a.md", 400, "additive");
  M.observeFile(t, "/b.md", 150, "additive");
  assert.equal(M.trackedWords(t), 400);
});

test("forgetting a deleted file leaves the total unchanged", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/a.md", 100, "additive");
  M.observeFile(t, "/a.md", 400, "additive");
  M.observeFile(t, "/b.md", 0, "additive");
  M.observeFile(t, "/b.md", 60, "additive");
  const before = M.trackedWords(t);
  M.forgetFile(t, "/b.md");
  assert.equal(M.trackedWords(t), before - 60);
  assert.ok(!("/b.md" in t.files));
});

test("rebasing a claimed path drops its contribution without re-counting", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/a.md", 100, "additive");
  M.observeFile(t, "/a.md", 400, "additive");
  M.rebaseFile(t, "/a.md");
  assert.equal(M.trackedWords(t), 0);
  M.observeFile(t, "/a.md", 450, "additive");
  assert.equal(M.trackedWords(t), 50, "only words after the rebase count");
});

// -------------------------------------------------------------- daily reset

test("rollover archives the day, zeroes today, and carries baselines", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/a.md", 1000, "additive");
  M.observeFile(t, "/a.md", 1500, "additive");
  const state = {
    date: "2026-09-01", goal: 500, wordsToday: 500,
    byOrigin: { probepoll: 500 }, tracking: t, history: []
  };
  const next = M.rollover(state, "2026-09-02");

  assert.equal(next.date, "2026-09-02");
  assert.equal(next.wordsToday, 0);
  assert.deepEqual(next.history, [{ date: "2026-09-01", words: 500, goal: 500 }]);
  assert.equal(M.trackedWords(next.tracking), 0, "yesterday's words must not carry into today");
  assert.equal(next.tracking.files["/a.md"].base, 1500, "baseline moves to the current count");
});

test("rollover after suspend does not re-count historical words", () => {
  const t = M.emptyTracking();
  M.observeFile(t, "/a.md", 5000, "additive");
  let state = { date: "2026-09-01", goal: 500, wordsToday: 0, byOrigin: {}, tracking: t, history: [] };
  state = M.rollover(state, "2026-09-05"); // machine was asleep for days
  assert.equal(M.trackedWords(state.tracking), 0);
  M.observeFile(state.tracking, "/a.md", 5100, "additive");
  assert.equal(M.trackedWords(state.tracking), 100);
});

test("history is capped", () => {
  let state = { date: "2026-01-01", goal: 500, wordsToday: 1, byOrigin: {},
                tracking: M.emptyTracking(), history: [] };
  for (let i = 0; i < M.HISTORY_MAX + 20; i++) state = M.rollover(state, "d" + i);
  assert.equal(state.history.length, M.HISTORY_MAX);
});

// ------------------------------------------------------------ stage and mood

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

test("parseSource: accepts a well-formed file", () => {
  const s = M.parseSource(validSource());
  assert.equal(s.sourceId, "obsidian");
  assert.equal(s.words, 342);
  assert.deepEqual(s.claims, ["/home/u/Vault"]);
});

test("parseSource: rejects malformed and truncated JSON", () => {
  assert.equal(M.parseSource("{not json"), null);
  assert.equal(M.parseSource('{"protocol":1,"sourceId":"a"'), null);
  assert.equal(M.parseSource(""), null);
  assert.equal(M.parseSource("[]"), null);
  assert.equal(M.parseSource("null"), null);
});

test("parseSource: rejects out-of-range and wrong-typed word counts", () => {
  assert.equal(M.parseSource(validSource({ wordsAddedToday: -1 })), null);
  assert.equal(M.parseSource(validSource({ wordsAddedToday: M.SOURCE_WORDS_MAX + 1 })), null);
  assert.equal(M.parseSource(validSource({ wordsAddedToday: "many" })), null);
});

test("parseSource: rejects a wrong protocol version and bad ids", () => {
  assert.equal(M.parseSource(validSource({ protocol: 2 })), null);
  assert.equal(M.parseSource(validSource({ sourceId: "../../etc/passwd" })), null);
  assert.equal(M.parseSource(validSource({ sourceId: "" })), null);
});

test("parseSource: rejects a malformed date", () => {
  assert.equal(M.parseSource(validSource({ date: "yesterday" })), null);
  assert.equal(M.parseSource(validSource({ date: 20260902 })), null);
});

test("parseSource: hostile strings survive only as inert data", () => {
  const s = M.parseSource(validSource({ claimsPaths: ["<script>alert(1)</script>"] }));
  assert.deepEqual(s.claims, ["<script>alert(1)</script>"]);
});

test("mergeSource: absolute totals reduce with max, so re-reads are idempotent", () => {
  assert.equal(M.mergeSource(0, 342), 342);
  assert.equal(M.mergeSource(342, 342), 342);
  assert.equal(M.mergeSource(342, 400), 400);
  assert.equal(M.mergeSource(400, 12), 400, "a restarted source must not lose the day");
});

test("sourceIsActive: staleness threshold", () => {
  const now = 1_000_000_000;
  assert.equal(M.sourceIsActive(now - 1000, now, 600000), true);
  assert.equal(M.sourceIsActive(now - 700000, now, 600000), false);
  assert.equal(M.sourceIsActive(0, now, 600000), false);
});

test("pathIsClaimed: matches on segment boundaries", () => {
  assert.equal(M.pathIsClaimed("/vault/a.md", ["/vault"]), true);
  assert.equal(M.pathIsClaimed("/vault/deep/a.md", ["/vault/"]), true);
  assert.equal(M.pathIsClaimed("/vault", ["/vault"]), true);
  assert.equal(M.pathIsClaimed("/vault2/a.md", ["/vault"]), false, "sibling must not be swallowed");
  assert.equal(M.pathIsClaimed("/other/a.md", ["/vault"]), false);
  assert.equal(M.pathIsClaimed("/a.md", []), false);
});

// ---------------------------------------------------------- path discovery

test("parseObsidianVaults: extracts vault paths from real config shape", () => {
  const cfg = JSON.stringify({ vaults: {
    "5e8ea54a4bca26ff": { path: "/mnt/HDD/OneDrive/Obsidian", ts: 1759081367939, open: true }
  }});
  assert.deepEqual(M.parseObsidianVaults(cfg), ["/mnt/HDD/OneDrive/Obsidian"]);
});

test("parseObsidianVaults: multiple vaults, deduplicated", () => {
  const cfg = JSON.stringify({ vaults: { a: { path: "/x" }, b: { path: "/y" }, c: { path: "/x" } } });
  assert.deepEqual(M.parseObsidianVaults(cfg).sort(), ["/x", "/y"]);
});

test("parseObsidianVaults: tolerates missing, malformed and empty config", () => {
  assert.deepEqual(M.parseObsidianVaults("{not json"), []);
  assert.deepEqual(M.parseObsidianVaults("{}"), []);
  assert.deepEqual(M.parseObsidianVaults(JSON.stringify({ vaults: {} })), []);
  assert.deepEqual(M.parseObsidianVaults(JSON.stringify({ vaults: { a: {} } })), []);
  assert.deepEqual(M.parseObsidianVaults("null"), []);
});

test("rankDiscoveredDirs: newest document wins, one row per directory", () => {
  const out = [
    "1788330000.0 /home/u/notes",
    "1788339999.5 /home/u/writing",
    "1788331000.0 /home/u/notes",
  ].join("\n");
  const ranked = M.rankDiscoveredDirs(out, 3);
  assert.equal(ranked.length, 2, "directories are collapsed");
  assert.equal(ranked[0].path, "/home/u/writing", "most recently edited first");
  assert.equal(ranked[1].path, "/home/u/notes");
});

test("rankDiscoveredDirs: respects the limit and ignores junk lines", () => {
  const out = ["1 /a", "2 /b", "3 /c", "garbage", "", "notanumber /d"].join("\n");
  const ranked = M.rankDiscoveredDirs(out, 2);
  assert.equal(ranked.length, 2);
  assert.deepEqual(ranked.map(r => r.path), ["/c", "/b"]);
});

test("rankDiscoveredDirs: handles directories containing spaces", () => {
  const ranked = M.rankDiscoveredDirs("1788330000.0 /home/u/My Writing Folder", 3);
  assert.equal(ranked[0].path, "/home/u/My Writing Folder");
});

test("rankDiscoveredDirs: empty input", () => {
  assert.deepEqual(M.rankDiscoveredDirs("", 3), []);
  assert.deepEqual(M.rankDiscoveredDirs(null, 3), []);
});
