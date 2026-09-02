import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Model.js" as Model

// Headless singleton. The shell mounts this at startup because the manifest
// declares kind "service"; widgets reach it with
// `bar.shell.serviceFor("io.github.acero-ad.writing-critter")`.
//
// Everything countable lives in Model.js. This file is wiring: focus, timers,
// subprocesses, persistence.
Item {
    id: root

    // Injected by the shell host.
    property var shell: null

    readonly property string pluginId: "io.github.acero-ad.writing-critter"

    // ------------------------------------------------------------- paths
    //
    // Built from $HOME rather than Quickshell.statePath(), matching what
    // Omarchy's own bar does. The resolution of statePath() is a Quickshell
    // internal that can move between versions, and companion authors need a
    // literal, documented directory to write their drop-box files into.
    readonly property string home: Quickshell.env("HOME")
    readonly property string stateDir: home + "/.local/state/omarchy/" + pluginId
    readonly property string stateFile: stateDir + "/state.json"
    readonly property string sourcesDir: stateDir + "/sources"

    // --------------------------------------------------------- settings
    //
    // Overrides arrive from the bar widget's inline shell.json entry and win
    // over anything stored here (see the configuration spec). Group 6 wires the
    // widget up to set this; until then it is simply empty.
    property var settingsOverride: ({})

    function setting(name) {
        if (settingsOverride && settingsOverride[name] !== undefined && settingsOverride[name] !== null)
            return settingsOverride[name];
        var stored = persisted.settings;
        if (stored && stored[name] !== undefined && stored[name] !== null)
            return stored[name];
        return Model.DEFAULT_SETTINGS[name];
    }

    function isOverridden(name) {
        return !!(settingsOverride && settingsOverride[name] !== undefined && settingsOverride[name] !== null);
    }

    readonly property int goal: Math.max(1, Number(setting("goal")) || 1)
    readonly property int pollMs: Model.clampPollMs(setting("pollMs"))
    readonly property int probeLookbackMs: Model.resolveProbeLookbackMs(setting("pollMs"), setting("probeLookbackMs"))
    readonly property int graceMs: Math.max(0, Number(setting("graceMs")) || 0)
    readonly property int recountCap: Math.max(1, Number(setting("recountCap")) || 1)
    readonly property string netMode: String(setting("netMode"))
    readonly property string mascot: String(setting("mascot"))
    readonly property var whitelist: setting("whitelist") || []
    readonly property var watchEntries: setting("watch") || []

    // ------------------------------------------------------ focus tracking

    readonly property var activeToplevel: ToplevelManager.activeToplevel
    readonly property string activeApp: activeToplevel ? String(activeToplevel.appId || "") : ""

    function isWritingApp(appId) {
        if (!appId) return false;
        var needle = appId.toLowerCase();
        for (var i = 0; i < whitelist.length; i++) {
            if (String(whitelist[i]).toLowerCase() === needle) return true;
        }
        return false;
    }

    readonly property bool writingAppFocused: isWritingApp(activeApp)

    // Autosaves often land just after focus leaves the editor, so a delta stays
    // attributable for graceMs afterwards. Event-driven rather than polled: the
    // timer exists only between losing focus and the window closing.
    Timer {
        id: graceTimer
        interval: root.graceMs
        repeat: false
    }

    onWritingAppFocusedChanged: {
        if (writingAppFocused) {
            graceTimer.stop();
            lastWritingFocusAt = Date.now();
        } else if (lastWritingFocusAt > 0 && graceMs > 0) {
            graceTimer.restart();
        }
    }

    property real lastWritingFocusAt: 0

    // ---------------------------------------------------------- poll gate
    //
    // This is the whole activation model. There is no session to start; the
    // gate is a pure function of focus, and `mood` below is bound to the SAME
    // expression so the critter can never look awake while nothing is counting.
    readonly property bool gateOpen: !pausedToday
                                     && watchEntries.length > 0
                                     && (writingAppFocused || graceTimer.running)

    property bool pausedToday: false

    function pauseToday() {
        pausedToday = true;
    }
    function resumeToday() {
        pausedToday = false;
    }

    // ------------------------------------------------------------- state

    property var tracking: Model.emptyTracking()
    property int wordsToday: 0
    property var byOrigin: ({})
    property string today: ""
    property real lastWordsAt: 0
    property real celebrateUntil: 0

    readonly property real progress: Model.progressFor(wordsToday, goal)
    readonly property int stage: Model.stageFor(wordsToday, goal)
    readonly property string mood: Model.moodFor({
        now: nowTick,
        gateOpen: root.gateOpen,
        lastWordsAt: root.lastWordsAt,
        celebrateUntil: root.celebrateUntil
    })

    // Mood depends on elapsed time, so it needs a coarse clock to re-evaluate
    // against. One tick per 5 s is enough for a 60 s idle threshold and is far
    // cheaper than binding to a per-second timer.
    property real nowTick: Date.now()
    Timer {
        interval: 5000
        running: true
        repeat: true
        onTriggered: root.nowTick = Date.now()
    }

    function localDate() {
        var d = new Date();
        var m = d.getMonth() + 1;
        var day = d.getDate();
        return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
    }

    function recomputeTotal() {
        var previous = wordsToday;
        var counted = Model.trackedWords(tracking);
        var origins = {};
        origins["filewatch"] = counted;
        var total = counted;
        for (var key in sourceContributions) {
            if (Object.prototype.hasOwnProperty.call(sourceContributions, key)) {
                origins[key] = sourceContributions[key];
                total += sourceContributions[key];
            }
        }
        byOrigin = origins;
        wordsToday = total;

        if (total > previous) {
            lastWordsAt = Date.now();
            if (previous < goal && total >= goal)
                celebrateUntil = Date.now() + Model.CELEBRATE_MS;
        }
        persist();
    }

    // Companion contributions, filled in by task group 7.
    property var sourceContributions: ({})

    // A mid-day reset zeroes today without archiving it — the day is not over,
    // so pushing it into history would leave a phantom entry alongside the real
    // one at midnight. Baselines move to current counts so already-written
    // words are not immediately re-counted.
    function resetToday() {
        for (var path in tracking.files) {
            if (Object.prototype.hasOwnProperty.call(tracking.files, path))
                Model.rebaseFile(tracking, path);
        }
        sourceContributions = {};
        wordsToday = 0;
        byOrigin = {};
        celebrateUntil = 0;
        lastWordsAt = 0;
        persist();
    }

    // ------------------------------------------------ accessors for the panel

    function history() {
        return persisted.history || [];
    }

    function stateSettings() {
        return persisted.settings || ({});
    }

    // Panel edits land in the plugin's own state file. shell.json is the user's
    // file and is never written by the plugin; keys pinned there simply win on
    // read, and the panel renders those fields locked.
    function writeSettings(next) {
        persisted.settings = next;
        stateView.writeAdapter();
    }

    function sourceStatus() {
        var rows = [];
        for (var id in sources) {
            if (Object.prototype.hasOwnProperty.call(sources, id))
                rows.push({ id: id, words: sources[id].words, active: sources[id].active === true });
        }
        return rows;
    }

    // ------------------------------------------------------- daily rollover
    //
    // Checked on a 30 s timer rather than scheduled for midnight, so a machine
    // that suspends across the boundary still rolls over within one interval.
    Timer {
        interval: 30000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.checkRollover()
    }

    function checkRollover() {
        var current = localDate();
        if (today === "") {
            today = current;
            return;
        }
        if (current === today) return;

        var next = Model.rollover({
            date: today,
            goal: goal,
            wordsToday: wordsToday,
            byOrigin: byOrigin,
            tracking: tracking,
            history: persisted.history || []
        }, current);

        today = next.date;
        wordsToday = 0;
        byOrigin = {};
        tracking = next.tracking;
        sourceContributions = {};
        pausedToday = false;
        celebrateUntil = 0;
        persisted.history = next.history;
        persist();
    }

    // --------------------------------------------------------- persistence

    function persist() {
        persisted.date = today;
        persisted.wordsToday = wordsToday;
        persisted.byOrigin = byOrigin;
        persisted.tracking = tracking;
        stateView.writeAdapter();
    }

    function restore() {
        today = persisted.date || localDate();
        wordsToday = Number(persisted.wordsToday) || 0;
        byOrigin = persisted.byOrigin || {};
        var restored = persisted.tracking;
        tracking = (restored && restored.files) ? restored : Model.emptyTracking();
        checkRollover();
    }

    // The state directory does not exist on first run, and an atomic write
    // cannot create its own parent. One spawn at shell startup, then never
    // again. This is why `mkdir` joins find/wc on the external-command
    // allowlist.
    Process {
        id: ensureDirProc
        running: true
        command: ["mkdir", "-p", root.sourcesDir]
        onExited: stateView.reload()
    }

    FileView {
        id: stateView
        path: root.stateFile
        watchChanges: false
        atomicWrites: true
        printErrors: false
        onLoaded: root.restore()
        onLoadFailed: root.restore() // first run: no state file yet
        adapter: JsonAdapter {
            id: persisted
            property int schema: 1
            property string date: ""
            property int wordsToday: 0
            property var byOrigin: ({})
            property var tracking: ({ files: {} })
            property var history: []
            property var settings: ({})
        }
    }

    // ------------------------------------------------------------ the loop

    Timer {
        id: pollTimer
        interval: root.pollMs
        running: root.gateOpen && !probeProc.running && !countProc.running
        repeat: true
        onTriggered: root.runProbe()
    }

    property var pendingPaths: []

    function watchDirs() {
        var dirs = [];
        for (var i = 0; i < watchEntries.length; i++) {
            var entry = watchEntries[i];
            var p = entry && entry.path ? String(entry.path) : "";
            if (p.length === 0) continue;
            if (p.indexOf("~/") === 0) p = home + p.slice(1);
            dirs.push(p);
        }
        return dirs;
    }

    function extensionArgs() {
        var exts = [];
        for (var i = 0; i < watchEntries.length; i++) {
            var list = watchEntries[i] && watchEntries[i].extensions ? watchEntries[i].extensions : [];
            for (var j = 0; j < list.length; j++) {
                var e = String(list[j]);
                if (e.charAt(0) !== ".") e = "." + e;
                if (exts.indexOf(e) === -1) exts.push(e);
            }
        }
        if (exts.length === 0) exts = [".md", ".txt"];

        var args = ["("];
        for (var k = 0; k < exts.length; k++) {
            if (k > 0) args.push("-o");
            args.push("-name");
            args.push("*" + exts[k]);
        }
        args.push(")");
        return args;
    }

    // Metadata-only scan. No file contents are read here, which is why an idle
    // tick costs the same on a 2000-note vault as on a 30-note one.
    function runProbe() {
        var dirs = watchDirs();
        if (dirs.length === 0) return;

        var seconds = Math.ceil(probeLookbackMs / 1000);
        var cmd = ["find"];
        for (var i = 0; i < dirs.length; i++) cmd.push(dirs[i]);
        cmd.push("-type");
        cmd.push("f");
        var ext = extensionArgs();
        for (var j = 0; j < ext.length; j++) cmd.push(ext[j]);
        cmd.push("-newermt");
        cmd.push("-" + seconds + " seconds");
        cmd.push("-print0");

        probeProc.command = cmd;
        probeProc.running = true;
    }

    Process {
        id: probeProc
        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: root.onProbeFinished(text)
        }
    }

    function onProbeFinished(text) {
        var raw = String(text || "").split("\0");
        var paths = [];
        for (var i = 0; i < raw.length; i++) {
            var p = raw[i];
            // A path containing a newline would corrupt the line-oriented `wc`
            // output below. Vanishingly rare, and skipping is safer than
            // mis-attributing a count to the wrong file.
            if (p.length > 0 && p.indexOf("\n") === -1) paths.push(p);
        }
        if (paths.length === 0) return;

        // Bound a pathological tick: a branch switch or a bulk import inside a
        // watch directory must not turn one tick into thousands of reads.
        if (paths.length > recountCap) paths = paths.slice(0, recountCap);

        pendingPaths = paths;
        var cmd = ["wc", "-w", "--"];
        for (var j = 0; j < paths.length; j++) cmd.push(paths[j]);
        countProc.command = cmd;
        countProc.running = true;
    }

    Process {
        id: countProc
        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: root.onCountFinished(text)
        }
    }

    function onCountFinished(text) {
        var lines = String(text || "").split("\n");
        var seen = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/^\s+/, "");
            if (line.length === 0) continue;
            var space = line.indexOf(" ");
            if (space <= 0) continue;
            var count = parseInt(line.slice(0, space), 10);
            var path = line.slice(space + 1).replace(/^\s+/, "");
            if (!isFinite(count)) continue;
            // `wc` appends a "total" line for multiple files; it names no real
            // path, so filtering on the pending set drops it without a special
            // case.
            if (pendingPaths.indexOf(path) === -1) continue;
            if (claimedByActiveSource(path)) continue;
            Model.observeFile(tracking, path, count, netMode);
            seen++;
        }
        pendingPaths = [];
        if (seen > 0) recomputeTotal();
    }

    // -------------------------------------------------- companion sources
    //
    // Each *.json in the drop-box is one source. Files are enumerated with the
    // `find` we already depend on and read one at a time through a single
    // reusable FileView: a small state machine is easier to reason about than
    // dynamically instantiated readers, and there are only ever a handful.

    property var sources: ({})          // id -> { words, updatedAt, claims, date, active }
    property var sourceQueue: []
    property var activeClaims: []

    Timer {
        interval: 10000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refreshSources()
    }

    // The drop-box directory itself is watched so a companion write is picked
    // up promptly rather than waiting out the interval above.
    FileView {
        path: root.sourcesDir
        watchChanges: true
        printErrors: false
        onFileChanged: root.refreshSources()
    }

    function refreshSources() {
        if (sourceListProc.running || sourceReader.busy) return;
        sourceListProc.command = ["find", sourcesDir, "-maxdepth", "1", "-type", "f", "-name", "*.json", "-print0"];
        sourceListProc.running = true;
    }

    Process {
        id: sourceListProc
        stdout: StdioCollector {
            waitForEnd: true
            onStreamFinished: root.onSourceListFinished(text)
        }
    }

    function onSourceListFinished(text) {
        var raw = String(text || "").split("\0");
        var paths = [];
        for (var i = 0; i < raw.length; i++) {
            if (raw[i].length > 0 && raw[i].indexOf("\n") === -1) paths.push(raw[i]);
        }
        sourceQueue = paths;
        pendingSources = {};
        readNextSource();
    }

    property var pendingSources: ({})

    function readNextSource() {
        if (sourceQueue.length === 0) {
            commitSources();
            return;
        }
        var next = sourceQueue[0];
        sourceQueue = sourceQueue.slice(1);
        sourceReader.busy = true;
        sourceReader.path = next;
        sourceReader.reload();
    }

    FileView {
        id: sourceReader
        property bool busy: false
        watchChanges: false
        printErrors: false
        blockLoading: false
        onLoaded: {
            root.ingestSource(text());
            busy = false;
            root.readNextSource();
        }
        onLoadFailed: {
            busy = false;
            root.readNextSource();
        }
    }

    function ingestSource(text) {
        var parsed = Model.parseSource(text);
        if (!parsed) return;                    // malformed: ignore, retry later
        if (parsed.date !== today) return;      // stale from a previous day
        var existing = sources[parsed.sourceId];
        var previous = existing ? existing.words : 0;
        pendingSources[parsed.sourceId] = {
            words: Model.mergeSource(previous, parsed.words),
            updatedAt: parsed.updatedAt,
            claims: parsed.claims,
            date: parsed.date
        };
    }

    function commitSources() {
        var now = Date.now();
        var next = {};
        var claims = [];
        var contributions = {};

        for (var id in pendingSources) {
            if (!Object.prototype.hasOwnProperty.call(pendingSources, id)) continue;
            var entry = pendingSources[id];
            entry.active = Model.sourceIsActive(entry.updatedAt, now, Model.SOURCE_STALE_AFTER_MS);
            next[id] = entry;
            // A stale source keeps the contribution it already reported today —
            // closing your editor at lunch must not erase the morning.
            contributions[id] = entry.words;
            if (entry.active) {
                for (var i = 0; i < entry.claims.length; i++) claims.push(entry.claims[i]);
            }
        }

        // A path that just stopped being claimed re-enters file counting with
        // its current word count as a fresh baseline, so edits made while the
        // source owned it are not suddenly added to today.
        var dropped = [];
        for (var j = 0; j < activeClaims.length; j++) {
            if (claims.indexOf(activeClaims[j]) === -1) dropped.push(activeClaims[j]);
        }
        if (dropped.length > 0) {
            for (var path in tracking.files) {
                if (Object.prototype.hasOwnProperty.call(tracking.files, path)
                    && Model.pathIsClaimed(path, dropped))
                    Model.rebaseFile(tracking, path);
            }
        }

        sources = next;
        activeClaims = claims;
        sourceContributions = contributions;
        recomputeTotal();
    }

    function claimedByActiveSource(path) {
        return Model.pathIsClaimed(path, activeClaims);
    }

    function forgetPath(path) {
        Model.forgetFile(tracking, path);
        recomputeTotal();
    }
}
