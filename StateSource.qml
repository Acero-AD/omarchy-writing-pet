pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// The single reader of the engine's state file.
//
// Everything about this component's shape is a consequence of
// docs/POSTMORTEM-ORPHANED-READ.md:
//
//   * It is a Singleton, so exactly one reader exists no matter how many
//     monitors the bar spans. The bar builds one BarPanel per screen
//     (Variants { model: Quickshell.screens }), so a per-widget FileView would
//     mean N readers and, worse, N teardowns on a monitor hotplug.
//   * Nothing creates or destroys it from a binding. A singleton lives for the
//     process, so there is no subtree for an in-flight read to outlive.
//   * Reads block. An async read completing against a destroyed context is the
//     exact crash we shipped once; a synchronous read cannot be in flight when
//     anything is torn down. The state file is ~210 bytes precisely so this
//     costs nothing.
//   * No JsonAdapter, in either direction. The adapter dereferenced
//     qmlEngine(this) unguarded and was the thing that actually segfaulted.
//     JSON.parse in plain JavaScript cannot do that.
//
// This component never writes. The engine is the only writer.
Singleton {
    id: root

    // ------------------------------------------------------------ location

    readonly property string stateHome: {
        var xdg = Quickshell.env("XDG_STATE_HOME");
        if (xdg && xdg.length > 0)
            return xdg;
        return Quickshell.env("HOME") + "/.local/state";
    }
    readonly property string statePath: stateHome + "/writing-critter/state.json"

    // -------------------------------------------------------------- values
    //
    // Defaults are the resting state: what the critter shows before the engine
    // has ever run. Every one of these is overwritten only by a value that
    // survived range-checking, so a corrupt file leaves the last good render in
    // place rather than blanking the bar.

    property int wordsToday: 0
    property int goal: 500
    property string mascot: "bird"
    property bool gateOpen: false
    property real updatedAt: 0
    property var byOrigin: ({})
    property var history: []

    // True once a well-formed state file has been read at least once.
    property bool everLoaded: false
    // Why we are not rendering live numbers, or "" when we are.
    property string restingReason: Model.RESTING.never

    // The engine publishes on startup and on every counted cycle, so silence
    // well past a poll interval means it is not running. Deliberately generous:
    // a false "stopped" is worse than a late one.
    readonly property int staleAfterSeconds: 90
    property real nowMs: Date.now()
    readonly property real nowSeconds: nowMs / 1000
    readonly property bool stale: everLoaded && (nowSeconds - updatedAt) > staleAfterSeconds
    readonly property bool live: everLoaded && !stale

    // When the count last rose, and how long to celebrate for. Both live here
    // rather than in the widget so that on a multi-monitor bar every critter
    // celebrates the same moment instead of each keeping its own clock.
    property real lastWordsAt: 0
    property real celebrateUntil: 0

    // Only true while the engine is actually counting. A critter that looks
    // awake while nothing is being counted is the one lie the display must
    // never tell, so staleness closes the gate as firmly as a lost focus does.
    readonly property bool counting: live && gateOpen

    // One timer for the whole bar, doing both the re-read and the clock.
    //
    // This polls rather than relying on watchChanges, and it must: the engine
    // publishes with a temp file and a rename, so every write swaps in a new
    // inode and leaves the watch holding the old, unlinked one. onFileChanged
    // then never fires and the critter sits on its first reading forever --
    // measured, not assumed. Atomic writes are not negotiable (a reader must
    // never see a torn file), so the reader polls instead.
    //
    // A blocking 210-byte read every two seconds is free, and matches the
    // engine's own cadence so the bar is never more than a tick behind.
    Timer {
        interval: 2000
        running: true
        repeat: true
        onTriggered: {
            root.nowMs = Date.now();
            root.readNow();
        }
    }

    // --------------------------------------------------------------- parse
    //
    // The decisions live in Model.js as a pure function, so the untrusted-input
    // handling is covered by `node --test` rather than only by whatever a
    // running shell happens to exercise.

    function applyState(raw) {
        var previousWords = root.wordsToday;
        var wasLoaded = root.everLoaded;
        var next = Model.parseState(raw, {
            wordsToday: root.wordsToday,
            goal: root.goal,
            mascot: root.mascot,
            gateOpen: root.gateOpen,
            updatedAt: root.updatedAt,
            byOrigin: root.byOrigin,
            history: root.history,
            everLoaded: root.everLoaded,
            restingReason: root.restingReason
        });
        root.wordsToday = next.wordsToday;
        root.goal = next.goal;
        root.mascot = next.mascot;
        root.gateOpen = next.gateOpen;
        root.updatedAt = next.updatedAt;
        root.byOrigin = next.byOrigin;
        root.history = next.history;
        root.everLoaded = next.everLoaded;
        root.restingReason = next.restingReason;
        root.nowMs = Date.now();

        // Temporary diagnostic: report only transitions, so the shell log shows
        // what this instance actually reads without spamming a line every tick.
        if (next.everLoaded !== wasLoaded || next.restingReason !== root.restingReason)
            console.log("writing-critter/StateSource path=" + root.statePath
                        + " loaded=" + next.everLoaded
                        + " resting='" + next.restingReason + "'"
                        + " words=" + next.wordsToday
                        + " rawLen=" + (raw === null || raw === undefined ? "null" : raw.length));

        // Only react to movement we actually watched. On the first successful
        // read after a shell restart the previous count is 0 by construction,
        // and treating that as words just written would make every critter
        // celebrate a goal it did not see met.
        if (wasLoaded && next.everLoaded) {
            if (next.wordsToday > previousWords)
                root.lastWordsAt = root.nowMs;
            if (previousWords < next.goal && next.wordsToday >= next.goal)
                root.celebrateUntil = root.nowMs + Model.CELEBRATE_MS;
        }
    }

    // The first read is explicit. A FileView does not load on its own: with no
    // preload it fired neither onLoaded nor onLoadFailed and the critter sat at
    // "waiting for the engine" next to a state file that was right there. And
    // preload is exactly what put an async read in flight during teardown last
    // time, so the fix is a blocking read we ask for, not an eager one.
    Component.onCompleted: root.readNow()

    function readNow() {
        var raw = null;
        try {
            // reload() re-reads from the path rather than returning the cached
            // body, which is the whole point when the inode has been replaced.
            stateFile.reload();
            raw = stateFile.text();
        } catch (e) {
            raw = null;
        }
        root.applyState(raw);
    }

    FileView {
        id: stateFile
        path: root.statePath
        // Synchronous: see the note at the top of this file. This is the
        // property that makes teardown safe.
        blockLoading: true
        watchChanges: true
        // The file is legitimately absent until the engine first runs; that is
        // a resting state, not an error worth printing on every shell start.
        printErrors: false

        onLoaded: root.applyState(text())
        onFileChanged: root.applyState(text())
        onLoadFailed: {
            root.everLoaded = false;
            root.restingReason = Model.RESTING.stopped;
        }
    }
}
