pragma Singleton

import QtQuick
import Qt.labs.folderlistmodel
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Everything the panel is not allowed to own.
//
// The panel is built once per screen -- the bar runs
// Variants { model: Quickshell.screens } -- so anything living in it is
// destroyed on a monitor hotplug. A process mid-flight or a directory scan
// mid-populate in a subtree that is being torn down is the exact shape that
// segfaulted the desktop; see docs/POSTMORTEM-ORPHANED-READ.md. A singleton
// lives for the process, so there is nothing for that work to outlive.
//
// This component still never writes. Configuration changes are made by invoking
// the engine, which validates them and remains the only writer of config.json.
Singleton {
    id: root

    // -------------------------------------------------------- the engine

    // The engine that shipped inside this plugin, not whatever `writing-critter`
    // resolves to on PATH. A normal install has two copies -- this one and the
    // one in ~/.local/bin that the systemd unit runs -- and they can drift. The
    // QML and the binary beside it are always the same release, so every
    // subcommand the panel uses is guaranteed to exist.
    readonly property string enginePath: root.stripScheme(Qt.resolvedUrl("bin/writing-critter"))

    // False once we have learned the engine cannot be started. The panel falls
    // back to showing commands rather than offering controls that do nothing.
    property bool available: true

    function stripScheme(url) {
        var text = url.toString();
        return text.indexOf("file://") === 0 ? text.substring(7) : text;
    }

    readonly property string homeDir: Quickshell.env("HOME") || "/"
    readonly property string configPath: {
        var xdg = Quickshell.env("XDG_CONFIG_HOME");
        var base = (xdg && xdg.length > 0) ? xdg : root.homeDir + "/.config";
        return base + "/writing-critter/config.json";
    }

    // --------------------------------------------------- configuration read
    //
    // Read, never written. Shown so the panel can render what is configured and
    // so a change made from a terminal appears without user interaction.

    property int goal: 500
    property var watchPaths: []
    property var whitelist: []
    property string mascot: "bird"
    property bool configLoaded: false

    function applyConfig(raw) {
        var next = Model.parseConfig(raw, {
            goal: root.goal,
            watch: root.watchPaths,
            whitelist: root.whitelist,
            mascot: root.mascot,
            loaded: root.configLoaded
        });
        root.goal = next.goal;
        root.watchPaths = next.watch;
        root.whitelist = next.whitelist;
        root.mascot = next.mascot;
        root.configLoaded = next.loaded;
    }

    function readConfig() {
        var raw = null;
        try {
            // reload() re-reads from the path. The engine saves by writing a
            // temp file and renaming, so every save swaps the inode and leaves
            // watchChanges holding the old one -- the same trap documented for
            // the state file. Polling is what actually keeps this current.
            configFile.reload();
            raw = configFile.text();
        } catch (e) {
            raw = null;
        }
        root.applyConfig(raw);
    }

    Component.onCompleted: root.readConfig()

    FileView {
        id: configFile
        path: root.configPath
        blockLoading: true
        watchChanges: true
        // Absent until the engine first saves. That is a normal state -- the
        // engine is running on defaults -- not an error worth printing.
        printErrors: false

        onLoaded: root.applyConfig(text())
        onFileChanged: root.applyConfig(text())
    }

    Timer {
        interval: 2000
        running: true
        repeat: true
        onTriggered: root.readConfig()
    }

    // ------------------------------------------------------ command queue

    // The complete vocabulary. Every one of these already exists in the engine
    // and already validates its own input; the panel adds no semantics and
    // duplicates no validation.
    readonly property var actions: [
        "set-goal", "set-mascot", "add-path", "remove-path", "add-app", "remove-app"
    ]

    // Why a queue rather than firing each click straight at a Process: two
    // clicks a tenth of a second apart would otherwise be two engine processes
    // racing on the same read-modify-write. The engine takes a lock as well --
    // that is the real fix, and it protects the terminal too -- but serialising
    // here keeps failures attributable to the action that caused them.
    property var pending: []
    property var current: []
    property bool inflight: false
    property string capturedError: ""

    // The action whose failure is being reported, and why. Cleared by the next
    // success, so the panel never shows a stale complaint.
    property string failedAction: ""
    property string failureReason: ""

    // Goal edits are the only repeated action. Each accepted write makes the
    // engine reseed file baselines, so keep only the value the field settles
    // on instead of launching one process per stepper repeat or typed digit.
    property int pendingGoal: root.goal

    function queueGoal(value) {
        root.pendingGoal = value;
        goalDebounce.restart();
    }

    Timer {
        id: goalDebounce
        interval: 400
        onTriggered: root.run("set-goal", root.pendingGoal)
    }

    readonly property bool busy: root.inflight || root.pending.length > 0
                                 || goalDebounce.running

    function run(action, value) {
        if (root.actions.indexOf(action) === -1) {
            // Not reachable from the panel's own controls; a guard against a
            // future caller inventing a subcommand.
            root.failedAction = action;
            root.failureReason = "not an allowed action";
            return false;
        }
        if (!root.available)
            return false;
        var queued = root.pending.slice();
        queued.push([action, String(value)]);
        root.pending = queued;
        root.pump();
        return true;
    }

    function pump() {
        if (root.inflight || root.pending.length === 0)
            return;
        root.current = root.pending[0];
        root.capturedError = "";
        root.inflight = true;
        started = false;
        watchdog.restart();
        engine.running = true;
    }

    // Whether the process actually launched. A missing engine and a hung engine
    // are indistinguishable from a timer, but not from this.
    property bool started: false

    function settle(reason) {
        if (!root.inflight)
            return;
        root.inflight = false;
        watchdog.stop();
        var action = root.current.length > 0 ? root.current[0] : "";
        root.pending = root.pending.slice(1);
        if (reason === "") {
            root.failedAction = "";
            root.failureReason = "";
        } else {
            root.failedAction = action;
            root.failureReason = reason;
        }
        // Read back immediately rather than waiting for the poll: the panel
        // must show what the engine accepted, not what was asked for.
        root.readConfig();
        Qt.callLater(root.pump);
    }

    Process {
        id: engine
        command: [root.enginePath, "config"].concat(root.current)
        // The engine prints "writing-critter: <problem>" here and exits 2, so a
        // rejected value arrives as a sentence rather than a number.
        stderr: SplitParser {
            onRead: function (line) {
                root.capturedError = root.capturedError.length > 0
                    ? root.capturedError + " " + line : line;
            }
        }
        onStarted: root.started = true
        // A lint warning here about an unresolved QProcess::ExitStatus is
        // expected: the type of this signal's second parameter is missing from
        // the type information quickshell ships. It is not a fault in this
        // handler and is unaffected by how many parameters are declared.
        // (Do not start this comment with the linter's name -- it reads such a
        // comment as a directive and reports every word as a bad category.)
        onExited: function (exitCode) {
            if (exitCode === 0) {
                root.settle("");
                return;
            }
            root.settle(root.capturedError.length > 0
                ? root.capturedError : "exited " + exitCode);
        }
    }

    Timer {
        id: watchdog
        interval: 10000
        onTriggered: {
            // Nothing should take ten seconds; the engine's slowest config
            // action rewrites a few hundred bytes. Reaching here means the
            // process hung or never launched, and the queue must not wedge.
            if (!root.started) {
                root.available = false;
                root.pending = [];
                root.settle("engine not found at " + root.enginePath);
            } else {
                root.settle("timed out");
            }
            engine.running = false;
        }
    }

    // ------------------------------------------------------- directory browse
    //
    // Read-only, and directories only: no file is opened and no name is typed.
    // Every path the panel can commit is one the user selected here, so the
    // engine never receives a string the user composed.

    property url browseFolder: "file://" + root.homeDir
    readonly property string browsePath: root.stripScheme(root.browseFolder)
    readonly property bool canGoUp: root.browsePath !== "/"
    readonly property var folders: folderModel

    function browseInto(name) {
        var base = root.browsePath === "/" ? "" : root.browsePath;
        root.browseFolder = "file://" + base + "/" + name;
    }

    function browseUp() {
        if (!root.canGoUp)
            return;
        var cut = root.browsePath.lastIndexOf("/");
        root.browseFolder = "file://" + (cut <= 0 ? "/" : root.browsePath.substring(0, cut));
    }

    function browseHome() {
        root.browseFolder = "file://" + root.homeDir;
    }

    FolderListModel {
        id: folderModel
        folder: root.browseFolder
        showDirs: true
        showFiles: false
        showDotAndDotDot: false
        showHidden: false
        sortField: FolderListModel.Name
    }
}
