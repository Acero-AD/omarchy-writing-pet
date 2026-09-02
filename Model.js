// Writing Critter — pure logic.
//
// Every function here is pure so it can be tested with `node --test` outside a
// running shell. QML loads this with `import "Model.js" as Model`; Node loads it
// through the CommonJS guard at the bottom. Deliberately no `.pragma library`:
// that directive is valid QML but a syntax error in Node, and sharing one
// instance buys nothing for stateless functions.

// ---------------------------------------------------------------- constants

var POLL_MS_DEFAULT = 2000;
var POLL_MS_MIN = 1000;
var POLL_MS_MAX = 30000;
var PROBE_LOOKBACK_MS_DEFAULT = 3000;
var GRACE_MS_DEFAULT = 15000;
var HISTORY_MAX = 365;
var WRITING_RECENT_MS = 60000;
var CELEBRATE_MS = 10000;
var RECOUNT_CAP_DEFAULT = 200;

var DEFAULT_SETTINGS = {
  goal: 500,
  pollMs: POLL_MS_DEFAULT,
  probeLookbackMs: PROBE_LOOKBACK_MS_DEFAULT,
  graceMs: GRACE_MS_DEFAULT,
  recountCap: RECOUNT_CAP_DEFAULT,
  netMode: "additive",
  mascot: "bird",
  showNumbers: true,
  idleNudge: true,
  notifyOnGoal: false,
  whitelist: ["omawrite", "obsidian", "typora", "soffice", "libreoffice-writer"],
  watch: []
};

// ------------------------------------------------------------- word counting

// Whitespace-delimited runs, plus CJK characters counted individually.
//
// CJK scripts do not delimit words with spaces, so whitespace splitting would
// score an entire paragraph as one word. Counting each CJK ideograph as a word
// overshoots (most words are one or two characters) but is stable and
// predictable, which matters more for a progress bar than linguistic accuracy.
// Documented as a known approximation in the README.
var CJK_RANGES = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;

function countWords(text) {
  if (typeof text !== "string" || text.length === 0) return 0;

  var cjkMatches = text.match(CJK_RANGES);
  var cjk = cjkMatches ? cjkMatches.length : 0;

  var stripped = text.replace(CJK_RANGES, " ");
  var runs = stripped.split(/\s+/);
  var words = 0;
  for (var i = 0; i < runs.length; i++) {
    if (runs[i].length > 0) words++;
  }
  return words + cjk;
}

// ------------------------------------------------------------- poll cadence

function clampPollMs(value) {
  var n = Number(value);
  if (!isFinite(n)) return POLL_MS_DEFAULT;
  return Math.max(POLL_MS_MIN, Math.min(POLL_MS_MAX, Math.round(n)));
}

// The probe window must be strictly wider than the poll interval, or a file
// saved on a tick boundary falls between two scans and is never seen. The
// overlap is safe because observations are absolute, not deltas.
function resolveProbeLookbackMs(pollMs, requested) {
  var poll = clampPollMs(pollMs);
  var n = Number(requested);
  if (!isFinite(n)) n = PROBE_LOOKBACK_MS_DEFAULT;
  n = Math.round(n);
  var floor = poll + Math.max(1000, Math.round(poll / 2));
  return n > poll ? Math.max(n, poll + 1) : floor;
}

// ------------------------------------------------------ per-file tracking
//
// Each watched path carries three numbers:
//   base — its word count when the day started, or when first seen
//   last — its most recently observed word count
//   peak — the high-water mark of (last - base) seen today
//
// Today's contribution is the sum of `peak`. That is a re-derivation from
// stored state rather than a running counter, so recounting an unchanged file
// is a no-op and the overlapping probe window cannot double-count. `peak` also
// means cutting a paragraph never takes back progress already earned: the
// critter must never walk backwards, or it teaches you not to edit.

function emptyTracking() {
  return { files: {} };
}

function observeFile(tracking, path, wordCount, netMode) {
  var files = tracking.files;
  var count = Math.max(0, Math.round(Number(wordCount) || 0));
  var entry = files[path];

  // First sight establishes a baseline and contributes nothing. Without this a
  // user pointing the plugin at an existing vault would see its entire history
  // land in today's total.
  if (!entry) {
    files[path] = { base: count, last: count, peak: 0 };
    return tracking;
  }

  entry.last = count;
  var delta = count - entry.base;
  if (netMode === "net") {
    entry.peak = delta;
  } else {
    if (delta > entry.peak) entry.peak = delta;
    if (entry.peak < 0) entry.peak = 0;
  }
  return tracking;
}

function forgetFile(tracking, path) {
  delete tracking.files[path];
  return tracking;
}

function trackedWords(tracking) {
  var total = 0;
  for (var path in tracking.files) {
    if (Object.prototype.hasOwnProperty.call(tracking.files, path)) {
      total += tracking.files[path].peak;
    }
  }
  return Math.max(0, Math.round(total));
}

// Paths claimed by an active companion source are counted by that source, not
// here. Their baselines are re-established so resuming does not dump the
// interim edits into today.
function rebaseFile(tracking, path) {
  var entry = tracking.files[path];
  if (!entry) return tracking;
  entry.base = entry.last;
  entry.peak = 0;
  return tracking;
}

// ------------------------------------------------------------ daily rollover

function rollover(state, newDate) {
  var history = state.history ? state.history.slice() : [];
  history.push({ date: state.date, words: state.wordsToday, goal: state.goal });
  if (history.length > HISTORY_MAX) history = history.slice(history.length - HISTORY_MAX);

  // Baselines carry over as the new day's starting point, so yesterday's words
  // are never re-counted and files need not be re-read at midnight.
  var files = {};
  for (var path in state.tracking.files) {
    if (Object.prototype.hasOwnProperty.call(state.tracking.files, path)) {
      files[path] = { base: state.tracking.files[path].last, last: state.tracking.files[path].last, peak: 0 };
    }
  }

  return {
    date: newDate,
    goal: state.goal,
    wordsToday: 0,
    byOrigin: {},
    tracking: { files: files },
    history: history
  };
}

// ------------------------------------------------------------ stage and mood

var STAGE_COUNT = 5;

function progressFor(words, goal) {
  var g = Number(goal);
  if (!isFinite(g) || g <= 0) return 0;
  return Math.max(0, Number(words) || 0) / g;
}

function stageFor(words, goal) {
  var p = progressFor(words, goal);
  if (p >= 1) return 4;
  if (p >= 0.75) return 3;
  if (p >= 0.5) return 2;
  if (p >= 0.25) return 1;
  return 0;
}

// `gateOpen` MUST be the same expression that gates the poll timer. If mood is
// derived independently the critter can appear awake while nothing is counting,
// which is the one lie the display must never tell.
function moodFor(ctx) {
  var now = Number(ctx.now) || 0;
  if (ctx.celebrateUntil && now < ctx.celebrateUntil) return "celebrating";
  if (!ctx.gateOpen) return "sleeping";
  var last = Number(ctx.lastWordsAt) || 0;
  if (last > 0 && now - last < WRITING_RECENT_MS) return "writing";
  return "idle";
}

// ------------------------------------------------------------- mascot sets

var EYES_WIDE = { writing: "o   o", idle: "-   -", sleeping: "-   -", celebrating: "^   ^" };
var EYES_NARROW = { writing: "o o", idle: "- -", sleeping: "- -", celebrating: "^ ^" };
var FX = { writing: " ", idle: " ", sleeping: "z", celebrating: "!" };

var BIRD_PANEL = [
  ['  ,-""-.   ',
   ' /       \\ ',
   '|  {eyes}  |',
   ' \\  ___  / ',
   "  '-----'  "],
  ['  ,-\\/-.   ',
   ' /       \\ ',
   '|  {eyes}  |',
   ' \\  ___  / ',
   "  '-----'  "],
  ['   .---.   ',
   ' ( {eyes} ) ',
   '   \\_v_/   ',
   '   _/ \\_   ',
   '   ^   ^   '],
  ['  \\.---./  ',
   ' ( {eyes} ) ',
   '  \\_ v _/  ',
   '   _/ \\_   ',
   '   ^   ^   '],
  [' \\\\.---.// ',
   ' ( {eyes} ) ',
   '-\\__ v __/-',
   '   \\___/   ',
   '    ~~~    ']
];

var BIRD_BAR = [
  '  ({eyes})  ',
  ' ,({eyes}), ',
  ' <({eyes})> ',
  ' \\({eyes})/ ',
  '~\\({eyes})/~'
];

// The snail travels rather than grows, so both resolutions are generated from
// one offset rule instead of transcribed. Transcription is where off-by-one
// padding bugs come from.
var SNAIL_BODY = [
  '  {eyes}  ',
  '   \\ /   ',
  '  .---.  ',
  ' ( ,-. )_',
  " '-----' "
];
var SNAIL_PANEL_COLS = 24;
var SNAIL_BAR_COLS = 10;

function padRight(s, width) {
  var out = s;
  while (out.length < width) out += " ";
  return out.slice(0, width);
}

// Pad a template so the line is `cols` wide *after* {eyes} is substituted. The
// placeholder is 6 characters and the eye string is narrower, so padding the
// raw template would leave every eye-bearing row one column short.
function padTemplate(s, cols, eyesWidth) {
  var overhead = s.indexOf("{eyes}") >= 0 ? "{eyes}".length - eyesWidth : 0;
  return padRight(s, cols + overhead);
}

function snailPanelFrame(stage) {
  var off = stage * 3;
  var rows = [];
  for (var i = 0; i < SNAIL_BODY.length; i++) {
    var row = SNAIL_BODY[i];
    var line;
    if (i >= 3 && off > 0) {
      // The trail reaches under the shell's leading edge so the slime is
      // continuous rather than leaving a one-column gap.
      line = repeat("~", off + 1) + row.slice(1);
    } else {
      line = repeat(" ", off) + row;
    }
    rows.push(padTemplate(line, SNAIL_PANEL_COLS, EYES_WIDE.writing.length));
  }
  return rows;
}

function snailBarFrame(stage) {
  return repeat(" ", 4 - stage) + repeat("~", stage) + "(@){eyes}";
}

function repeat(ch, n) {
  var out = "";
  for (var i = 0; i < n; i++) out += ch;
  return out;
}

function buildSnailSet() {
  var panel = [];
  var bar = [];
  for (var s = 0; s < STAGE_COUNT; s++) {
    panel.push(snailPanelFrame(s));
    bar.push(snailBarFrame(s));
  }
  return {
    id: "snail",
    label: "Snail",
    meterMode: "art",
    barCols: SNAIL_BAR_COLS,
    barFrames: bar,
    rows: 5,
    cols: SNAIL_PANEL_COLS,
    frames: panel
  };
}

var MASCOTS = {
  bird: {
    id: "bird",
    label: "Bird",
    meterMode: "widget",
    barCols: 9,
    barFrames: BIRD_BAR,
    rows: 5,
    cols: 11,
    frames: BIRD_PANEL
  },
  snail: buildSnailSet()
};

var MASCOT_DEFAULT = "bird";

function mascotSet(id) {
  return MASCOTS[id] || MASCOTS[MASCOT_DEFAULT];
}

function mascotIds() {
  var out = [];
  for (var k in MASCOTS) {
    if (Object.prototype.hasOwnProperty.call(MASCOTS, k)) out.push(k);
  }
  return out;
}

function clampStage(stage) {
  var n = Math.round(Number(stage) || 0);
  return Math.max(0, Math.min(STAGE_COUNT - 1, n));
}

// One substitution rule, two resolutions.
function barFace(setId, stage, mood) {
  var set = mascotSet(setId);
  var eyes = EYES_NARROW[mood] || EYES_NARROW.idle;
  var fx = FX[mood] || " ";
  return set.barFrames[clampStage(stage)].split("{eyes}").join(eyes) + fx;
}

function panelArt(setId, stage, mood) {
  var set = mascotSet(setId);
  var eyes = EYES_WIDE[mood] || EYES_WIDE.idle;
  var frame = set.frames[clampStage(stage)];
  var out = [];
  for (var i = 0; i < frame.length; i++) {
    out.push(frame[i].split("{eyes}").join(eyes));
  }
  return out;
}

// ------------------------------------------------------------ app matching
//
// Wayland appIds are frequently reverse-DNS ("md.obsidian.Obsidian",
// "com.github.foo.Bar") while users think in short names ("obsidian"). Exact
// matching means a whitelist that looks obviously right silently matches
// nothing, and the critter simply never wakes with no indication why.
//
// So an entry matches when it equals the appId outright, or when it equals the
// segment after the final dot. A dotted entry is still matched exactly, so a
// user can be specific when two apps share a leaf name.

function appMatches(entry, appId) {
  if (!entry || !appId) return false;
  var e = String(entry).toLowerCase();
  var a = String(appId).toLowerCase();
  if (e === a) return true;
  if (e.indexOf(".") !== -1) return false;
  var dot = a.lastIndexOf(".");
  return dot !== -1 && a.slice(dot + 1) === e;
}

function appInList(list, appId) {
  if (!list) return false;
  for (var i = 0; i < list.length; i++) {
    if (appMatches(list[i], appId)) return true;
  }
  return false;
}

// -------------------------------------------------------- path discovery
//
// Typing a path is the one thing standing between install and a working
// critter, so the plugin tries to work it out itself. Two signals, best first:
//
//   1. An editor that records where its documents live. Obsidian keeps its
//      vault paths in its own config; that is exact and costs one file read.
//   2. Otherwise, the directory holding the most recently edited document.
//
// Note that asking the focused window is NOT an option: Wayland exposes no pid
// for a toplevel, and editors do not hold their documents open anyway -- they
// open, read and close -- so /proc yields nothing.

function parseObsidianVaults(text) {
  var raw;
  try {
    raw = JSON.parse(String(text));
  } catch (e) {
    return [];
  }
  if (!raw || typeof raw !== "object" || !raw.vaults || typeof raw.vaults !== "object") return [];
  var out = [];
  for (var key in raw.vaults) {
    if (!Object.prototype.hasOwnProperty.call(raw.vaults, key)) continue;
    var vault = raw.vaults[key];
    if (vault && typeof vault.path === "string" && vault.path.length > 0 && out.indexOf(vault.path) === -1)
      out.push(vault.path);
  }
  return out;
}

// Input is `find -printf "%T@ %h\n"` output: one line per document, epoch
// mtime then its parent directory. Rank directories by their most recent file.
function rankDiscoveredDirs(text, limit) {
  var best = {};
  var lines = String(text || "").split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.length === 0) continue;
    var space = line.indexOf(" ");
    if (space <= 0) continue;
    var mtime = parseFloat(line.slice(0, space));
    var dir = line.slice(space + 1);
    if (!isFinite(mtime) || dir.length === 0) continue;
    if (!(dir in best) || mtime > best[dir]) best[dir] = mtime;
  }
  var dirs = [];
  for (var d in best) {
    if (Object.prototype.hasOwnProperty.call(best, d)) dirs.push({ path: d, mtime: best[d] });
  }
  dirs.sort(function (a, b) { return b.mtime - a.mtime; });
  var max = isFinite(limit) && limit > 0 ? limit : 3;
  return dirs.slice(0, max);
}

// ---------------------------------------------------------- source protocol
//
// Drop-box files are written by other software and are treated as untrusted
// input: every field is range- and type-checked, nothing is evaluated, and a
// malformed file is ignored rather than allowed to take the plugin down.

var SOURCE_PROTOCOL = 1;
var SOURCE_WORDS_MAX = 1000000;
var SOURCE_STALE_AFTER_MS = 600000; // 10 minutes

function parseSource(text) {
  var raw;
  try {
    raw = JSON.parse(String(text));
  } catch (e) {
    return null; // truncated or malformed: ignore, retry on next change
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (Number(raw.protocol) !== SOURCE_PROTOCOL) return null;

  var sourceId = typeof raw.sourceId === "string" ? raw.sourceId : "";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sourceId)) return null;

  var words = Number(raw.wordsAddedToday);
  if (!isFinite(words) || words < 0 || words > SOURCE_WORDS_MAX) return null;
  words = Math.round(words);

  var date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : "";
  if (!date) return null;

  var updatedAt = Date.parse(raw.updatedAt);
  if (!isFinite(updatedAt)) updatedAt = 0;

  var claims = [];
  if (Array.isArray(raw.claimsPaths)) {
    for (var i = 0; i < raw.claimsPaths.length; i++) {
      var c = raw.claimsPaths[i];
      if (typeof c === "string" && c.length > 0 && c.length < 4096) claims.push(c);
    }
  }

  return { sourceId: sourceId, words: words, date: date, updatedAt: updatedAt, claims: claims };
}

// Absolute daily totals, reduced with max. That is what makes the protocol
// crash-safe: a re-read, a partial write, or a source restarting at a lower
// number can never inflate or double-count the day.
function mergeSource(previousWords, reported) {
  var prev = Number(previousWords);
  if (!isFinite(prev) || prev < 0) prev = 0;
  return Math.max(prev, reported);
}

function sourceIsActive(updatedAt, now, staleAfterMs) {
  var limit = isFinite(staleAfterMs) ? staleAfterMs : SOURCE_STALE_AFTER_MS;
  return updatedAt > 0 && (now - updatedAt) < limit;
}

// A path is claimed if it sits at or beneath a claimed directory. Compared on
// segment boundaries so "/vault2" is not swallowed by a claim on "/vault".
function pathIsClaimed(path, claims) {
  for (var i = 0; i < claims.length; i++) {
    var claim = claims[i];
    if (claim.charAt(claim.length - 1) === "/") claim = claim.slice(0, claim.length - 1);
    if (path === claim) return true;
    if (path.indexOf(claim + "/") === 0) return true;
  }
  return false;
}

// ------------------------------------------------------------ status phrase
//
// Short, warm, never guilt-tripping. The critter is a companion, not a coach.
var PHRASES = {
  sleeping: "Open a writing app and it will wake.",
  celebrating: "Goal met. Well done.",
  idle: ["Something is stirring.", "It is waiting for you.",
         "Halfway. It has found its feet.", "Nearly there.", "It soars."],
  writing: ["Something is stirring.", "The shell is thinning.",
            "It is keeping up with you.", "Wings out.", "It soars."]
};

function statusPhrase(stage, mood) {
  if (mood === "sleeping") return PHRASES.sleeping;
  if (mood === "celebrating") return PHRASES.celebrating;
  var list = PHRASES[mood] || PHRASES.idle;
  return list[clampStage(stage)];
}

// ----------------------------------------------------------------- exports

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    POLL_MS_MIN: POLL_MS_MIN,
    POLL_MS_MAX: POLL_MS_MAX,
    POLL_MS_DEFAULT: POLL_MS_DEFAULT,
    HISTORY_MAX: HISTORY_MAX,
    WRITING_RECENT_MS: WRITING_RECENT_MS,
    CELEBRATE_MS: CELEBRATE_MS,
    STAGE_COUNT: STAGE_COUNT,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    EYES_WIDE: EYES_WIDE,
    EYES_NARROW: EYES_NARROW,
    FX: FX,
    MASCOTS: MASCOTS,
    MASCOT_DEFAULT: MASCOT_DEFAULT,
    countWords: countWords,
    clampPollMs: clampPollMs,
    resolveProbeLookbackMs: resolveProbeLookbackMs,
    emptyTracking: emptyTracking,
    observeFile: observeFile,
    forgetFile: forgetFile,
    rebaseFile: rebaseFile,
    trackedWords: trackedWords,
    rollover: rollover,
    progressFor: progressFor,
    stageFor: stageFor,
    moodFor: moodFor,
    mascotSet: mascotSet,
    mascotIds: mascotIds,
    barFace: barFace,
    panelArt: panelArt,
    statusPhrase: statusPhrase,
    SOURCE_PROTOCOL: SOURCE_PROTOCOL,
    SOURCE_WORDS_MAX: SOURCE_WORDS_MAX,
    SOURCE_STALE_AFTER_MS: SOURCE_STALE_AFTER_MS,
    parseSource: parseSource,
    mergeSource: mergeSource,
    sourceIsActive: sourceIsActive,
    pathIsClaimed: pathIsClaimed,
    parseObsidianVaults: parseObsidianVaults,
    rankDiscoveredDirs: rankDiscoveredDirs,
    appMatches: appMatches,
    appInList: appInList
  };
}
