// Writing Critter — presentation logic.
//
// Rendering only. Counting, focus and state live in the engine
// (bin/writing-critter), outside the shell process, because doing that work
// inside quickshell segfaulted the desktop; see
// docs/POSTMORTEM-ORPHANED-READ.md.
//
// Everything here is a pure function of numbers the engine has already
// published, so it can be tested with `node --test` outside a running shell.
// QML loads this with `import "Model.js" as Model`; Node loads it through the
// CommonJS guard at the bottom.

// ---------------------------------------------------------------- constants

var STAGE_COUNT = 5;
var WRITING_RECENT_MS = 60000;
var CELEBRATE_MS = 10000;
var MASCOT_DEFAULT = "bird";

// ------------------------------------------------------------ stage and mood

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


// ------------------------------------------------------- untrusted state
//
// The state file is written by a separate process, so it is parsed as
// untrusted input: every field is type- and range-checked, one bad field never
// discards the rest, and a failure keeps the previous values rather than
// blanking a critter that was rendering fine a moment ago.
//
// Pure so it can be tested under `node --test`. StateSource.qml holds the
// FileView; this decides what a payload is allowed to mean.

var STATE_SCHEMA = 1;
var WORD_MAX = 10000000;

function clampInt(value, min, max, fallback) {
  if (typeof value !== "number" || !isFinite(value)) return fallback;
  var n = Math.floor(value);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

var RESTING = {
  never: "waiting for the engine",
  unreadable: "state file unreadable",
  malformed: "state file malformed",
  version: "engine state version not supported",
  stopped: "engine not running"
};

function defaultState() {
  return {
    wordsToday: 0,
    goal: 500,
    mascot: MASCOT_DEFAULT,
    gateOpen: false,
    updatedAt: 0,
    byOrigin: {},
    history: [],
    everLoaded: false,
    restingReason: RESTING.never
  };
}

// Returns the next state given a raw file body and the state currently shown.
function parseState(raw, previous) {
  var prev = previous || defaultState();
  var next = {
    wordsToday: prev.wordsToday,
    goal: prev.goal,
    mascot: prev.mascot,
    gateOpen: prev.gateOpen,
    updatedAt: prev.updatedAt,
    byOrigin: prev.byOrigin,
    history: prev.history || [],
    everLoaded: prev.everLoaded,
    restingReason: prev.restingReason
  };

  if (raw === null || raw === undefined || String(raw).length === 0) {
    next.everLoaded = false;
    next.restingReason = RESTING.stopped;
    return next;
  }

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // A torn read, though the engine writes atomically. Hold the last good
    // render; do not blank the bar over one bad tick.
    next.restingReason = prev.everLoaded ? "" : RESTING.unreadable;
    return next;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    next.restingReason = prev.everLoaded ? "" : RESTING.malformed;
    return next;
  }
  if (parsed.schema !== STATE_SCHEMA) {
    // A newer engine with a layout we do not understand. Rendering its numbers
    // under our assumptions would be worse than resting.
    next.everLoaded = false;
    next.restingReason = RESTING.version;
    return next;
  }

  next.wordsToday = clampInt(parsed.wordsToday, 0, WORD_MAX, prev.wordsToday);
  next.goal = clampInt(parsed.goal, 1, WORD_MAX, prev.goal);
  next.gateOpen = parsed.gateOpen === true;
  next.updatedAt = (typeof parsed.updatedAt === "number" && isFinite(parsed.updatedAt))
    ? parsed.updatedAt : 0;

  // An unknown mascot keeps the current one rather than rendering nothing.
  if (MASCOTS[parsed.mascot]) next.mascot = parsed.mascot;

  var origins = {};
  if (parsed.byOrigin && typeof parsed.byOrigin === "object" && !Array.isArray(parsed.byOrigin)) {
    for (var key in parsed.byOrigin) {
      if (!Object.prototype.hasOwnProperty.call(parsed.byOrigin, key)) continue;
      var n = clampInt(parsed.byOrigin[key], 0, WORD_MAX, -1);
      if (n >= 0) origins[key] = n;
    }
  }
  next.byOrigin = origins;

  // Finished days, oldest first. An entry missing a date or a sane count is
  // dropped rather than rendered as a gap.
  var history = [];
  if (Array.isArray(parsed.history)) {
    for (var i = 0; i < parsed.history.length; i++) {
      var entry = parsed.history[i];
      if (!entry || typeof entry !== "object" || typeof entry.date !== "string") continue;
      var words = clampInt(entry.words, 0, WORD_MAX, -1);
      var dayGoal = clampInt(entry.goal, 1, WORD_MAX, -1);
      if (words < 0 || dayGoal < 0) continue;
      history.push({ date: entry.date, words: words, goal: dayGoal });
    }
  }
  next.history = history;

  next.everLoaded = true;
  next.restingReason = "";
  return next;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STAGE_COUNT: STAGE_COUNT,
    WRITING_RECENT_MS: WRITING_RECENT_MS,
    CELEBRATE_MS: CELEBRATE_MS,
    MASCOT_DEFAULT: MASCOT_DEFAULT,
    EYES_WIDE: EYES_WIDE,
    EYES_NARROW: EYES_NARROW,
    FX: FX,
    MASCOTS: MASCOTS,
    progressFor: progressFor,
    stageFor: stageFor,
    moodFor: moodFor,
    mascotSet: mascotSet,
    mascotIds: mascotIds,
    barFace: barFace,
    panelArt: panelArt,
    statusPhrase: statusPhrase,
    STATE_SCHEMA: STATE_SCHEMA,
    RESTING: RESTING,
    clampInt: clampInt,
    defaultState: defaultState,
    parseState: parseState
  };
}
