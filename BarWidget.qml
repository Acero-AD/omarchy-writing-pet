import QtQuick
import Quickshell
import qs.Ui
import "Model.js" as Model

// Bar entry point. Structure follows the third-party focus-forge plugin: the
// panel is Loader-mounted and this widget forwards the open/close contract the
// bar host calls into.
BarWidget {
    id: root
    moduleName: "io.github.acero-ad.writing-critter"

    readonly property string pluginId: "io.github.acero-ad.writing-critter"

    // There was a Loader here that hosted Service.qml when the shell did not
    // mount it, with `active: hostService === null`. That binding is not
    // resolved at construction: `bar.shell` arrives later in startup, so the
    // Loader built the service tree and then destroyed it a moment later.
    //
    // On its own that was survivable. Combined with an async read in flight it
    // was fatal -- the read completed against a QML context whose engine
    // pointer had already been nulled, and quickshell segfaulted in a loop that
    // took the whole desktop shell down. See docs/POSTMORTEM-ORPHANED-READ.md.
    //
    // Rule: never gate a component's lifetime on a value that settles late.
    // Nothing here creates or destroys a subtree from a binding any more. The
    // widget renders whatever the (currently unmounted) service reports, and
    // renders its resting state when there is none.
    readonly property var service: bar && bar.shell && typeof bar.shell.serviceFor === "function"
        ? bar.shell.serviceFor(pluginId) : null

    // Inline shell.json settings win over stored ones; the service resolves the
    // precedence, this just hands them over.
    onSettingsChanged: pushSettings()
    onServiceChanged: pushSettings()
    function pushSettings() {
        if (service)
            service.settingsOverride = settings || ({});
    }

    // ------------------------------------------------------- derived state

    readonly property int stage: service ? service.stage : 0
    readonly property string mood: service ? service.mood : "sleeping"
    readonly property int wordsToday: service ? service.wordsToday : 0
    readonly property int goal: service ? service.goal : Model.DEFAULT_SETTINGS.goal
    readonly property string mascot: service ? service.mascot : Model.MASCOT_DEFAULT
    readonly property bool celebrating: mood === "celebrating"

    readonly property bool showNumbers: setting("showNumbers", Model.DEFAULT_SETTINGS.showNumbers)
    readonly property bool idleNudge: setting("idleNudge", Model.DEFAULT_SETTINGS.idleNudge)

    // The z is the only nudge in the plugin; disabling it must not also open
    // the critter's eyes, so the mood itself is untouched.
    readonly property string face: {
        var f = Model.barFace(mascot, stage, mood);
        if (!idleNudge && mood === "sleeping")
            f = f.slice(0, f.length - 1) + " ";
        return f;
    }

    readonly property string counter: wordsToday + "/" + goal

    // Vertical bars are 28px wide — a face plus a counter does not fit, so the
    // numbers move to the tooltip and the face rotates.
    readonly property string label: vertical ? face
                                             : (showNumbers ? face + "  " + counter : face)

    readonly property string tooltip: {
        var pct = Math.round(root.progressPercent);
        var lines = ["Writing Critter — " + counter + " (" + pct + "%)"];
        if (service && service.pausedToday)
            lines.push("paused for today");
        else if (!service || !service.gateOpen)
            lines.push("asleep — focus a writing app to start");
        var origins = service ? service.byOrigin : ({});
        for (var key in origins) {
            if (Object.prototype.hasOwnProperty.call(origins, key) && origins[key] > 0)
                lines.push("  " + key + ": " + origins[key]);
        }
        return lines.join("\n");
    }

    readonly property real progressPercent: goal > 0 ? Math.min(100, (wordsToday / goal) * 100) : 0

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

    // Right-click opens the panel in a compact action mode rather than building
    // a second popup surface for three buttons.
    function openQuickMenu() {
        if (!panelLoader.item) return;
        panelLoader.item.mode = "menu";
        panelLoader.item.open();
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

        onPressed: function (buttonCode) {
            if (buttonCode === Qt.RightButton)
                root.openQuickMenu();
            else
                root.toggle();
        }

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
