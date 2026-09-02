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
    statusPhrase: statusPhrase
  };
}
