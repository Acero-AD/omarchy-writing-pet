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

    // ---------------------------------------------------- service state
    //
    // Whether the engine is installed at all, and whether its user service is
    // running. This is a different question from `available` above, and the two
    // were briefly conflated: `available` is "can the shell launch the copy
    // that ships beside this QML", which is what decides whether the settings
    // controls do anything. Everything here is about the *other* copy -- the
    // one in ~/.local/bin that systemd runs -- and a panel whose engine is not
    // installed must still be able to configure it, so a missing service never
    // disables a setting.
    //
    // The state file cannot answer this. A stale state.json outlives a stopped
    // service and says nothing about an outdated binary, so the engine is asked
    // directly, and only when a user opens a panel.

    property var serviceStatus: Model.defaultServiceStatus()
    readonly property string serviceState: root.serviceStatus.state

    // The lifecycle action in flight, or "". Distinct from `busy` because the
    // panel disables setup buttons during setup, not during a goal edit.
    property string serviceAction: ""
    // The action waiting for the user to confirm the disclosure, or "". Held
    // here rather than in the panel so that a second monitor's panel is not
    // left showing a review for something already installed.
    property string pendingConfirm: ""
    property string serviceFailedAction: ""
    property string serviceFailureReason: ""
    property bool serviceRolledBack: false
    property bool serviceRollbackFailed: false
    // True once a status probe has answered, so the panel can tell "not
    // installed" from "not asked yet" and avoid offering setup for a moment
    // before the real answer lands.
    property bool serviceProbed: false

    readonly property bool serviceBusy: root.serviceAction.length > 0

    // ------------------------------------------------------ command queue

    // The complete vocabulary, in two halves. Every one of these already exists
    // in the engine and already validates its own input; the panel adds no
    // semantics and duplicates no validation.
    //
    // A caller names an action. It never supplies an argument list: the
    // mapping from "install" to the argv below happens here, so there is no
    // path by which a panel button, a config value or an engine message can
    // become part of a command line.
    readonly property var actions: Model.CONFIG_ACTIONS
    readonly property var serviceActions: Model.SERVICE_ACTIONS

    // Why a queue rather than firing each click straight at a Process: two
    // clicks a tenth of a second apart would otherwise be two engine processes
    // racing on the same read-modify-write. The engine takes a lock as well --
    // that is the real fix, and it protects the terminal too -- but serialising
    // here keeps failures attributable to the action that caused them.
    // Each entry is { kind, action, argv }. It used to be a bare [action,
    // value] pair with "config" prepended at the Process; now that two
    // subcommand families share this queue, the entry carries the whole
    // argument list and the Process concatenates rather than composes.
    property var pending: []
    property var current: ({ kind: "", action: "", argv: [] })
    property bool inflight: false
    property string capturedError: ""
    // Bounded on the way in: this holds the engine's status line, and a
    // runaway writer must not grow a string inside the shell process.
    property string capturedOut: ""

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
        // Explicit, though false is the default: this timer starts a process,
        // and the difference between a debounce and a poll should not depend
        // on the reader knowing which way QML leans.
        repeat: false
        onTriggered: root.run("set-goal", root.pendingGoal)
    }

    readonly property bool busy: root.inflight || root.pending.length > 0
                                 || goalDebounce.running

    function run(action, value) {
        var argv = Model.configArgv(action, value);
        if (argv === null) {
            // Not reachable from the panel's own controls; a guard against a
            // future caller inventing a subcommand.
            root.failedAction = action;
            root.failureReason = "not an allowed action";
            return false;
        }
        return root.enqueue("config", action, argv);
    }

    // ---------------------------------------------------- service actions
    //
    // The panel names one of five actions and gets one of five fixed argument
    // lists. There is no branch here that reaches a string the user typed, a
    // path the engine reported, or a systemctl verb: those all live one process
    // away, in code that ships with this file and is tested without a desktop.

    function requestService(action) {
        if (Model.serviceArgv(action) === null) {
            root.serviceFailedAction = action;
            root.serviceFailureReason = "not an allowed action";
            return false;
        }
        if (!root.available)
            return false;
        // Installing and removing files is disclosed and confirmed first.
        // Starting and restarting an installation the user already has is a
        // repair, not a decision, and asking would only train them to click
        // through the asking.
        if (Model.SERVICE_CONFIRM.indexOf(action) !== -1) {
            root.pendingConfirm = action;
            return true;
        }
        return root.startService(action);
    }

    function confirmService() {
        var action = root.pendingConfirm;
        root.pendingConfirm = "";
        if (action.length === 0)
            return false;
        return root.startService(action);
    }

    function cancelService() {
        root.pendingConfirm = "";
    }

    function startService(action) {
        var argv = Model.serviceArgv(action);
        if (argv === null || !root.available)
            return false;
        root.startingProbes = 0;
        return root.enqueue("service", action, argv);
    }

    // One probe answers every panel. The bar builds one of these per screen and
    // they all open onto the same singleton, so without this a three-monitor
    // desktop would run three status processes for one glance at the bar.
    function refreshServiceStatus() {
        if (!root.available)
            return false;
        if (root.statusPending())
            return true;
        return root.enqueue("service", "status", Model.serviceArgv("status"));
    }

    function statusPending() {
        return Model.queueHolds(root.pending, root.current, root.inflight,
                                "service", "status");
    }

    function enqueue(kind, action, argv) {
        if (!root.available)
            return false;
        root.pending = Model.queueAppend(root.pending,
                                         Model.queueEntry(kind, action, argv));
        root.pump();
        return true;
    }

    function pump() {
        var entry = Model.queueNext(root.pending, root.inflight);
        if (entry === null)
            return;
        root.current = entry;
        root.capturedError = "";
        root.capturedOut = "";
        root.serviceAction = root.current.kind === "service" ? root.current.action : "";
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
        var kind = root.current.kind;
        var action = root.current.action;
        root.pending = root.pending.slice(1);
        root.serviceAction = "";

        if (kind === "service")
            root.settleService(action, reason);
        else if (reason === "") {
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

    function settleService(action, reason) {
        var outcome = Model.serviceSettlement(action, reason, root.capturedOut,
                                              root.serviceStatus);
        root.serviceStatus = outcome.status;
        root.serviceProbed = true;
        root.serviceRolledBack = outcome.rolledBack;
        root.serviceRollbackFailed = outcome.rollbackFailed;
        root.serviceFailedAction = outcome.failedAction;
        root.serviceFailureReason = outcome.failureReason;

        // Bounded: a settling delay, not a poll. A unit that stays in
        // "starting" forever must not turn this into one.
        if (outcome.reprobe && root.startingProbes < Model.STARTING_REPROBE_MAX) {
            root.startingProbes += 1;
            settleProbe.restart();
        } else if (!outcome.reprobe) {
            root.startingProbes = 0;
        }
    }

    property int startingProbes: 0

    Timer {
        id: settleProbe
        interval: 3000
        repeat: false
        onTriggered: root.refreshServiceStatus()
    }

    Process {
        id: engine
        // The program is the engine beside this file and nothing else; the rest
        // of the list is the argv the queue entry was built with, which is
        // always one of the fixed lists above.
        command: [root.enginePath].concat(root.current.argv)
        // The engine prints "writing-critter: <problem>" here and exits 2, so a
        // rejected value arrives as a sentence rather than a number.
        stderr: SplitParser {
            onRead: function (line) {
                root.capturedError = root.capturedError.length > 0
                    ? root.capturedError + " " + line : line;
            }
        }
        // Only the service commands print anything a caller reads, and they
        // print one line of JSON. Bounded so a wedged engine cannot grow this
        // string inside the shell process.
        stdout: SplitParser {
            onRead: function (line) {
                if (root.capturedOut.length < Model.SERVICE_RAW_MAX)
                    root.capturedOut += line;
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
        // The outer bound on the engine's own bounds; see Model.watchdogFor.
        interval: Model.watchdogFor(root.current.kind)
        onTriggered: {
            // Reaching here means the process hung or never launched, and the
            // queue must not wedge.
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
