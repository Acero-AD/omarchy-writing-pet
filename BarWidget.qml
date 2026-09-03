import QtQuick
import Quickshell
import qs.Ui
import "." as Critter
import "Model.js" as Model

// Bar entry point: a read-only view of what the engine published.
//
// This component holds no FileView, no Process, no adapter and no Timer. It
// reads StateSource, which is a singleton precisely so that a bar spanning
// several monitors has one reader and one teardown rather than one per screen.
// See docs/POSTMORTEM-ORPHANED-READ.md for why that matters here.
BarWidget {
    id: root
    moduleName: "io.github.acero-ad.writing-critter"

    // There was a Loader here that hosted a Service.qml when the shell did not
    // mount one, with `active: hostService === null`. That binding is not
    // resolved at construction -- `bar.shell` arrives later in startup -- so
    // the Loader built the service tree and destroyed it a moment later, while
    // an async read was in flight. Quickshell segfaulted in a loop that took
    // the whole desktop down.
    //
    // Rule: never gate a component's lifetime on a value that settles late.
    // Nothing here creates or destroys a subtree from a binding. The counting
    // now happens in a separate process entirely.

    // ------------------------------------------------------- derived state

    readonly property int wordsToday: Critter.StateSource.wordsToday
    readonly property int goal: Critter.StateSource.goal
    readonly property string mascot: Critter.StateSource.mascot
    readonly property bool counting: Critter.StateSource.counting
    readonly property string restingReason: Critter.StateSource.restingReason

    readonly property int stage: Model.stageFor(wordsToday, goal)
    readonly property string mood: Model.moodFor({
        now: Critter.StateSource.nowMs,
        gateOpen: counting,
        lastWordsAt: Critter.StateSource.lastWordsAt,
        celebrateUntil: Critter.StateSource.celebrateUntil
    })
    readonly property bool celebrating: mood === "celebrating"

    readonly property bool showNumbers: setting("showNumbers", true)
    readonly property bool idleNudge: setting("idleNudge", true)

    // The z is the only nudge in the plugin; disabling it must not also open
    // the critter's eyes, so the mood itself is untouched.
    readonly property string face: {
        var f = Model.barFace(mascot, stage, mood);
        if (!idleNudge && mood === "sleeping")
            f = f.slice(0, f.length - 1) + " ";
        return f;
    }

    readonly property string counter: wordsToday + "/" + goal

    // Vertical bars are 28px wide -- a face plus a counter does not fit, so the
    // numbers move to the tooltip and the face rotates.
    readonly property string label: vertical ? face
                                             : (showNumbers ? face + "  " + counter : face)

    readonly property real progressPercent: goal > 0 ? Math.min(100, (wordsToday / goal) * 100) : 0

    readonly property string tooltip: {
        var lines = [];
        if (restingReason.length > 0) {
            // Resting: say what is wrong and how to fix it, rather than
            // showing 0/500 as though nothing had been written today.
            lines.push("Writing Critter — " + restingReason);
            lines.push("start it with:  systemctl --user start writing-critter");
            return lines.join("\n");
        }
        lines.push("Writing Critter — " + counter + " (" + Math.round(progressPercent) + "%)");
        if (Critter.StateSource.stale)
            lines.push("engine stopped — last update " + staleFor());
        else if (!Critter.StateSource.gateOpen)
            lines.push("asleep — focus a writing app to start");
        var origins = Critter.StateSource.byOrigin;
        for (var key in origins) {
            if (Object.prototype.hasOwnProperty.call(origins, key) && origins[key] > 0)
                lines.push("  " + key + ": " + origins[key]);
        }
        return lines.join("\n");
    }

    function staleFor() {
        var secs = Math.max(0, Math.round(Critter.StateSource.nowSeconds - Critter.StateSource.updatedAt));
        if (secs < 120)
            return secs + "s ago";
        if (secs < 7200)
            return Math.round(secs / 60) + "m ago";
        return Math.round(secs / 3600) + "h ago";
    }

    // ----------------------------------------------------- panel contract

    readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
    readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

    function open() {
        if (panelLoader.item) panelLoader.item.open();
    }
    function close() {
        if (panelLoader.item) panelLoader.item.close();
    }
    function toggle() {
        if (panelLoader.item) panelLoader.item.toggle();
    }
    function closeForPopoutSwitch() {
        if (panelLoader.item) panelLoader.item.closeForPopoutSwitch();
    }

    function injectPanel() {
        if (!panelLoader.item) return;
        panelLoader.item.bar = root.bar;
        panelLoader.item.anchorItem = button;
        panelLoader.item.hostWidget = root;
    }

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight
    onBarChanged: injectPanel()

    Loader {
        id: panelLoader
        // A literal, never a lookup. `active` bound to anything that settles
        // late is the exact shape that crashed the shell.
        active: true
        source: Qt.resolvedUrl("Panel.qml")
        visible: false
        onLoaded: {
            root.injectPanel();
            Qt.callLater(root.injectPanel);
        }
    }

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: root.label
        tooltipText: root.tooltip
        // Pinned rather than inherited: Omarchy's shell family is the
        // fontconfig `monospace` alias by default, but `omarchy font set` can
        // point it at a proportional family and shred the critter's columns.
        fontFamily: "monospace"
        textRotation: root.vertical ? -90 : 0

        onPressed: root.toggle()

        // Celebration: a short bounce, silent, self-terminating.
        SequentialAnimation {
            id: celebrateAnimation
            running: root.celebrating
            loops: 3
            NumberAnimation { target: button; property: "scale"; to: 1.25; duration: 120; easing.type: Easing.OutCubic }
            NumberAnimation { target: button; property: "scale"; to: 1.0; duration: 130; easing.type: Easing.InOutCubic }
            onStopped: button.scale = 1.0
        }
    }
}
