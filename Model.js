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
    panelArt: panelArt
  };
}
