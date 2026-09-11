import QtQuick
import qs.Commons
import qs.Ui
import "." as Critter
import "Model.js" as Model

// Loaded via Loader from BarWidget.qml; deliberately not a manifest entry
// point.
//
// This panel configures, but it does not write. Settings live in the engine's
// config file and every change here is made by invoking `writing-critter
// config ...`, so that file still has exactly one writer and the shell is
// still not it.
//
// The distinction matters because of how the earlier version failed. It edited
// settings from here directly, which meant a text field in the bar, a key
// catcher to feed it, and a write path out of the shell process. What actually
// crashed the desktop was none of those individually -- it was async work
// outliving a subtree destroyed by a late-settling binding -- but the write
// path was how the code got there.
//
// So two rules hold this together, and both are enforced by
// scripts/qml-lifecycle-lint.py:
//
//   * Nothing here writes. The engine validates and persists; this panel asks.
//   * Nothing here owns work that can outlive it. The process, the config read
//     and the directory scan all live in Control.qml, a singleton, because this
//     panel is built once per screen and dies on a monitor hotplug.
//
// The goal is the one typed value: a NumberField constrains it to the engine's
// positive-integer rule and sends it through the same engine command as every
// other setting. While that field has focus, PanelKeyCatcher is blocked so its
// BeforeItem handler cannot swallow the edit. Paths, application ids and the
// mascot still come only from values the panel was given.
Panel {
    id: root
    moduleName: "io.github.acero-ad.writing-critter"
    manageIpc: false

    property var anchorItem: null
    property var hostWidget: null

    readonly property string mascot: Critter.StateSource.mascot
    readonly property var mascotSet: Model.mascotSet(mascot)
    readonly property int wordsToday: Critter.StateSource.wordsToday
    readonly property int goal: Critter.StateSource.goal
    readonly property int stage: Model.stageFor(wordsToday, goal)
    readonly property string mood: hostWidget ? hostWidget.mood : "sleeping"
    readonly property real progress: goal > 0 ? Math.min(1, wordsToday / goal) : 0
    readonly property string restingReason: Critter.StateSource.restingReason

    // The settings view swaps to the directory picker rather than opening a
    // second surface: one column, one place to look, and nothing to tear down.
    property bool browsing: false

    // The uncounted app the engine last saw, offered as a one-tap addition.
    readonly property string candidateApp: Critter.StateSource.lastFocusedApp

    readonly property string artText: Model.panelArt(mascot, stage, mood).join("\n")
    readonly property string phrase: Model.statusPhrase(stage, mood)

    // Today's breakdown, largest first, zero-rows dropped.
    readonly property var originRows: {
        var rows = [];
        var origins = Critter.StateSource.byOrigin;
        for (var key in origins) {
            if (Object.prototype.hasOwnProperty.call(origins, key) && origins[key] > 0)
                rows.push({ name: key, words: origins[key] });
        }
        rows.sort(function (a, b) { return b.words - a.words; });
        return rows;
    }

    // Most recent finished days first; the engine stores oldest first.
    readonly property var recentDays: {
        var all = Critter.StateSource.history || [];
        var out = [];
        for (var i = all.length - 1; i >= 0 && out.length < 5; i--)
            out.push(all[i]);
        return out;
    }

    readonly property string engineStatus: {
        if (restingReason.length > 0)
            return restingReason;
        if (Critter.StateSource.stale)
            return "stopped — no update in " + (hostWidget ? hostWidget.staleFor() : "a while");
        if (Critter.StateSource.gateOpen)
            return "counting — a writing app has focus";
        return "asleep — focus a writing app to start";
    }

    // ------------------------------------------------------ engine setup
    //
    // Opening the panel is where the engine gets asked about itself. Not shell
    // startup: a bar that spawns a process to answer a question nobody asked is
    // the cost this plugin has spent two rewrites avoiding. And not on a timer:
    // the answer only changes when someone installs, updates or stops something,
    // and the person who did that is standing right here.
    //
    // Control is a singleton, so panels on three monitors share one probe.

    readonly property var service: Critter.Control.serviceStatus
    readonly property string serviceState: Critter.Control.serviceState
    readonly property var serviceOffer: Model.serviceOffer(root.serviceState)
    readonly property string confirming: Critter.Control.pendingConfirm
    readonly property bool canRemoveEngine: Model.serviceCanRemove(root.service)

    // What the last action came to, shared by every panel. Its command, when it
    // has one, was built by Model from the shell's own path to the engine
    // beside this file -- never from anything the engine printed.
    readonly property var outcome: Critter.Control.serviceOutcome

    // Model.serviceCardVisible, not a local chain of terms: it is what stops
    // the card vanishing at the moment a success should be reported, and a
    // test can hold it to that.
    readonly property bool showSetupCard: Model.serviceCardVisible({
        probed: Critter.Control.serviceProbed,
        state: root.serviceState,
        busy: Critter.Control.serviceBusy,
        outcome: root.outcome,
        probeError: Critter.Control.serviceProbeError
    })

    function open() {
        root.controller.show();
        Critter.Control.refreshServiceStatus();
    }

    // The load-bearing one. The bar button calls toggle(), not open(), so
    // hooking open() alone would leave the probe firing for every way of
    // showing this panel except the way people actually use. Refreshes coalesce
    // in the singleton, so calling from both paths costs nothing.
    onOpenedChanged: {
        if (root.opened)
            Critter.Control.refreshServiceStatus();
    }
    function close() {
        root.controller.hide();
    }
    function switchPanel(direction) {
        if (root.bar && typeof root.bar.switchPanelFrom === "function")
            return root.bar.switchPanelFrom(root.hostWidget || root, direction);
        return false;
    }

    KeyboardPanel {
        id: panel
        anchorItem: root.anchorItem
        owner: root.hostWidget || root
        bar: root.bar
        open: root.opened
        focusTarget: keyCatcher
        contentWidth: panel.fittedContentWidth(Style.space(320))
        contentHeight: panel.fittedContentHeight(content.implicitHeight)

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            // Two things can need the keyboard more than the catcher does. The
            // review dialog goes first: the lifecycle linter requires a
            // focusable input's binding to end in activeFocus, and the goal
            // field is still that input. See design decision 6.
            blocked: reviewDialog.opened || goalField.field.activeFocus
            onCloseRequested: root.close()
            onTabRequested: function (direction) {
                root.switchPanel(direction);
            }

            Column {
                id: content
                width: parent.width
                spacing: Style.space(10)

                Text {
                    width: parent.width
                    text: "WRITING CRITTER"
                    color: root.barForeground
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.subtitle
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                }

                Item {
                    width: parent.width
                    height: art.implicitHeight

                    // Centre one declared-width canvas, then draw every row
                    // from its left edge. Qt trims trailing whitespace before
                    // centring each line, so AlignHCenter shears column-aligned
                    // art even though the model pads every row correctly.
                    Text {
                        id: art
                        anchors.horizontalCenter: parent.horizontalCenter
                        width: root.mascotSet.cols * artMetrics.advanceWidth
                        text: root.artText
                        color: Color.accent
                        font.family: "monospace"
                        font.pixelSize: Style.font.body
                        textFormat: Text.PlainText
                        horizontalAlignment: Text.AlignLeft
                        lineHeight: 1.15
                        // No explicit height. It used to reserve
                        // `font.body * 1.15 * rows`, which clipped the last row
                        // -- the bird's feet -- into the count below it,
                        // because QML's lineHeight is proportional to the
                        // font's natural line height (ascent + descent +
                        // leading), not to pixelSize. Nothing needs reserving
                        // anyway: every set renders exactly `rows` lines at
                        // every stage, asserted in the model tests.
                    }

                    TextMetrics {
                        id: artMetrics
                        font: art.font
                        text: "0"
                    }
                }

                Text {
                    width: parent.width
                    text: root.wordsToday + " / " + root.goal
                    color: Color.accent
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.display
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                }

                // Height is reserved in both meter modes so switching sets
                // never resizes the panel.
                Item {
                    width: parent.width
                    height: Style.space(8)
                    Rectangle {
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        height: Style.space(6)
                        radius: height / 2
                        // The snail's trail already encodes progress; a second
                        // meter beside it is redundant clutter.
                        visible: root.mascotSet.meterMode === "widget"
                        color: Qt.rgba(root.barForeground.r, root.barForeground.g, root.barForeground.b, 0.12)
                        Rectangle {
                            anchors.left: parent.left
                            anchors.top: parent.top
                            anchors.bottom: parent.bottom
                            width: Math.max(0, parent.width * root.progress)
                            radius: parent.radius
                            color: Color.accent
                            Behavior on width {
                                NumberAnimation { duration: 240; easing.type: Easing.OutCubic }
                            }
                        }
                    }
                }

                Text {
                    width: parent.width
                    text: root.phrase
                    color: root.barForeground
                    opacity: 0.72
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.body
                    font.italic: true
                    wrapMode: Text.WordWrap
                    horizontalAlignment: Text.AlignHCenter
                }

                // --------------------------------------------- engine state

                Text {
                    width: parent.width
                    text: "ENGINE"
                    color: root.barForeground
                    opacity: 0.5
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                }

                Text {
                    width: parent.width
                    text: root.engineStatus
                    color: root.barForeground
                    opacity: 0.8
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.bodySmall
                    wrapMode: Text.WordWrap
                }

                // Removal when there is nothing else to say. The setup card
                // carries its own removal button, but a ready engine hides the
                // card -- so until this existed, the one state most people are
                // in was the one state with no way to remove the engine from
                // the panel, which the engine-setup spec requires. It went
                // unnoticed in live testing because the machine had been
                // staged in a state where the card was showing.
                Button {
                    visible: root.canRemoveEngine && !root.showSetupCard
                             && Critter.Control.available
                    text: "Remove engine"
                    foreground: root.barForeground
                    bordered: true
                    onClicked: Critter.Control.requestService("uninstall")
                }


                // ------------------------------------ engine setup / repair
                //
                // One state, one offered action. The review that has to come
                // before an install or a removal is not in here any more: it
                // is the modal at the bottom of this file, the way the shell's
                // own plugins ask before doing something irreversible. What is
                // here is the question of what state the engine is in, and --
                // once something has been done -- what it came to.
                //
                // Every decision is Model's, so it is covered by `node --test`:
                // which action a state gets, whether this card is shown, what
                // an outcome says. This file only draws them.
                //
                // It sits above the settings and never replaces them.
                // Configuring a goal or a watch path before the engine exists
                // is useful, and the engine reads it when it starts.

                Column {
                    id: setupCard
                    width: parent.width
                    spacing: Style.space(6)
                    visible: root.showSetupCard

                    // ---- what was just done
                    //
                    // Kept until dismissed or replaced by the next action. A
                    // status refresh does not clear it; see
                    // Model.nextServiceOutcome.

                    Column {
                        width: parent.width
                        spacing: Style.space(4)
                        visible: root.outcome !== null

                        // Success and failure differ in their words, not only
                        // their colour: "did not finish" reads as a failure in
                        // a theme where accent and urgent look alike.
                        Text {
                            width: parent.width
                            text: root.outcome ? root.outcome.headline : ""
                            color: root.outcome && root.outcome.ok ? Color.accent : Color.urgent
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.body
                            font.bold: true
                            wrapMode: Text.WordWrap
                        }

                        Text {
                            width: parent.width
                            visible: root.outcome !== null && root.outcome.detail.length > 0
                            text: root.outcome ? root.outcome.detail : ""
                            color: root.barForeground
                            opacity: 0.8
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            wrapMode: Text.WordWrap
                        }

                        Text {
                            width: parent.width
                            visible: root.outcome !== null && root.outcome.rollback.length > 0
                            text: root.outcome ? root.outcome.rollback : ""
                            color: root.barForeground
                            opacity: 0.8
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            wrapMode: Text.WordWrap
                        }

                        Text {
                            width: parent.width
                            visible: root.outcome !== null && root.outcome.command.length > 0
                            text: "run it yourself:\n  " + (root.outcome ? root.outcome.command : "")
                            color: root.barForeground
                            opacity: 0.7
                            font.family: "monospace"
                            font.pixelSize: Style.font.caption
                            textFormat: Text.PlainText
                            wrapMode: Text.WrapAnywhere
                        }

                        Button {
                            text: "Dismiss"
                            foreground: root.barForeground
                            bordered: true
                            onClicked: Critter.Control.dismissOutcome()
                        }
                    }

                    // ---- what is happening now

                    Text {
                        width: parent.width
                        visible: Critter.Control.serviceBusy
                        text: Model.serviceProgress(Critter.Control.serviceAction)
                        color: Color.accent
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.body
                        font.bold: true
                        wrapMode: Text.WordWrap
                    }

                    // ---- what the engine needs next
                    //
                    // Hidden while an outcome is showing, so the two never
                    // compete: first what happened, then -- once that is
                    // dismissed -- what, if anything, still needs doing.

                    Column {
                        width: parent.width
                        spacing: Style.space(6)
                        visible: root.outcome === null && !Critter.Control.serviceBusy
                                 && Model.serviceNeedsSetup(root.serviceState)

                        Text {
                            width: parent.width
                            text: root.serviceOffer.headline
                            color: root.serviceOffer.severity === "setup" ? Color.accent : root.barForeground
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            font.bold: true
                            wrapMode: Text.WordWrap
                        }

                        Text {
                            width: parent.width
                            visible: root.serviceOffer.detail.length > 0
                            text: root.serviceOffer.detail
                            color: root.barForeground
                            opacity: 0.7
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                            wrapMode: Text.WordWrap
                        }

                        // Which release is installed and which one this plugin
                        // ships. Shown for the update case, where "newer" is
                        // the whole claim being made.
                        Text {
                            width: parent.width
                            visible: root.serviceState === "update-available"
                            text: "installed " + (root.service.installedVersion || "unknown")
                                  + " · this plugin ships " + (root.service.sourceVersion || "unknown")
                            color: root.barForeground
                            opacity: 0.6
                            font.family: "monospace"
                            font.pixelSize: Style.font.caption
                            wrapMode: Text.WordWrap
                        }
                    }

                    // The offered action, and removal beside it. An install or
                    // a removal opens the review; start and restart act
                    // directly, because they replace no file and remove nothing.
                    Flow {
                        width: parent.width
                        spacing: Style.space(6)
                        visible: root.outcome === null && !Critter.Control.serviceBusy

                        Button {
                            visible: Model.serviceNeedsSetup(root.serviceState)
                                     && root.serviceOffer.action.length > 0
                            text: root.serviceOffer.label
                            foreground: Color.accent
                            bordered: true
                            onClicked: Critter.Control.requestService(root.serviceOffer.action)
                        }
                        Button {
                            visible: root.canRemoveEngine
                            text: "Remove engine"
                            foreground: root.barForeground
                            bordered: true
                            onClicked: Critter.Control.requestService("uninstall")
                        }
                    }

                    // A probe that could not reach the engine at all. Not an
                    // outcome -- nothing the user did failed -- so it is shown
                    // on its own and never replaces one.
                    Text {
                        width: parent.width
                        visible: Critter.Control.serviceProbeError.length > 0
                        text: "could not check the engine — " + Critter.Control.serviceProbeError
                        color: Color.urgent
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        wrapMode: Text.WordWrap
                    }
                }

                // -------------------------------------------------- today

                Text {
                    width: parent.width
                    text: "TODAY"
                    color: root.barForeground
                    opacity: 0.5
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                    visible: root.originRows.length > 0
                }

                Repeater {
                    model: root.originRows
                    delegate: Item {
                        required property var modelData
                        width: content.width
                        height: Style.space(16)
                        Text {
                            anchors.left: parent.left
                            text: parent.modelData.name
                            color: root.barForeground
                            opacity: 0.8
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                        }
                        Text {
                            anchors.right: parent.right
                            text: parent.modelData.words
                            color: root.barForeground
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                        }
                    }
                }

                // ------------------------------------------------ history

                Text {
                    width: parent.width
                    text: "RECENT DAYS"
                    color: root.barForeground
                    opacity: 0.5
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                    visible: root.recentDays.length > 0
                }

                Repeater {
                    model: root.recentDays
                    delegate: Item {
                        required property var modelData
                        width: content.width
                        height: Style.space(16)
                        Text {
                            anchors.left: parent.left
                            text: parent.modelData.date
                            color: root.barForeground
                            opacity: 0.8
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                        }
                        Text {
                            anchors.right: parent.right
                            text: parent.modelData.words + " / " + parent.modelData.goal
                            color: parent.modelData.words >= parent.modelData.goal
                                ? Color.accent : root.barForeground
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                            font.pixelSize: Style.font.bodySmall
                        }
                    }
                }

                // ----------------------------------------------- settings

                Text {
                    width: parent.width
                    text: root.browsing ? "ADD PATH" : "SETTINGS"
                    color: root.barForeground
                    opacity: 0.5
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                }

                // The engine that ships beside this QML could not be started.
                // Rather than offer controls that quietly do nothing, fall back
                // to what this panel showed before it had any: the commands.
                Text {
                    width: parent.width
                    visible: !Critter.Control.available
                    text: "engine not found at\n" + Critter.Control.enginePath + "\n\n"
                        + "change settings with:\n"
                        + "  writing-critter config set-goal 800\n"
                        + "  writing-critter config add-path ~/notes\n"
                        + "  writing-critter config add-app obsidian"
                    color: root.barForeground
                    opacity: 0.75
                    font.family: "monospace"
                    font.pixelSize: Style.font.bodySmall
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                }

                // ------------------------------------------------ the picker
                //
                // Directories only, and nothing is typed. Every path that can
                // reach the engine is one the user walked to and confirmed, so
                // the panel never composes a string on the user's behalf.

                Column {
                    width: parent.width
                    spacing: Style.space(6)
                    visible: root.browsing && Critter.Control.available

                    Text {
                        width: parent.width
                        text: Critter.Control.browsePath
                        color: Color.accent
                        font.family: "monospace"
                        font.pixelSize: Style.font.bodySmall
                        elide: Text.ElideMiddle
                    }

                    // A Flow, not a Row: four buttons do not fit a 320px panel
                    // on every theme's font, and wrapping beats clipping.
                    Flow {
                        width: parent.width
                        spacing: Style.space(6)

                        Button {
                            text: "Up"
                            foreground: root.barForeground
                            bordered: true
                            enabled: Critter.Control.canGoUp
                            opacity: enabled ? 1 : 0.4
                            onClicked: Critter.Control.browseUp()
                        }
                        Button {
                            text: "Home"
                            foreground: root.barForeground
                            bordered: true
                            onClicked: Critter.Control.browseHome()
                        }
                        Button {
                            text: "Use this folder"
                            foreground: Color.accent
                            bordered: true
                            onClicked: {
                                Critter.Control.run("add-path", Critter.Control.browsePath);
                                root.browsing = false;
                            }
                        }
                        Button {
                            text: "Cancel"
                            foreground: root.barForeground
                            bordered: true
                            onClicked: root.browsing = false
                        }
                    }

                    // A ListView rather than a Repeater: a directory can hold
                    // thousands of entries, and this recycles delegates and
                    // scrolls instead of instantiating all of them.
                    ListView {
                        width: parent.width
                        height: Math.min(contentHeight, Style.space(180))
                        clip: true
                        model: Critter.Control.folders
                        boundsBehavior: Flickable.StopAtBounds

                        delegate: Button {
                            required property string fileName
                            width: ListView.view.width
                            text: fileName
                            foreground: root.barForeground
                            fontSize: Style.font.bodySmall
                            onClicked: Critter.Control.browseInto(fileName)
                        }
                    }

                    Text {
                        width: parent.width
                        visible: Critter.Control.folders.count === 0
                        text: "no subdirectories here"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.bodySmall
                    }
                }

                // ---------------------------------------------- the controls

                Column {
                    width: parent.width
                    spacing: Style.space(8)
                    visible: !root.browsing && Critter.Control.available

                    // ---- goal

                    NumberField {
                        id: goalField
                        width: parent.width
                        fieldWidth: width
                        label: "goal (words/day)"
                        from: 1
                        to: Model.INT_MAX
                        stepSize: 10
                        value: Critter.Control.goal
                        foreground: root.barForeground
                        accent: Color.accent
                        fontFamily: root.bar ? root.bar.fontFamily : Style.font.family

                        onModified: function (v) {
                            Critter.Control.queueGoal(v);
                        }

                        // PanelKeyCatcher is blocked while this field owns
                        // focus, so Escape arrives here first. Release focus;
                        // the next Escape reaches the catcher and closes.
                        Keys.onEscapePressed: function (event) {
                            goalField.field.focus = false;
                            keyCatcher.forceActiveFocus();
                            event.accepted = true;
                        }
                    }

                    Connections {
                        target: Critter.Control
                        function onGoalChanged() {
                            if (!goalField.field.activeFocus)
                                goalField.field.value = Critter.Control.goal;
                        }
                    }

                    Connections {
                        target: goalField.field
                        function onActiveFocusChanged() {
                            if (!goalField.field.activeFocus)
                                goalField.field.value = Critter.Control.goal;
                        }
                    }

                    // ---- watch paths

                    Text {
                        width: parent.width
                        text: "watch paths"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    Repeater {
                        model: Critter.Control.watchPaths
                        delegate: Item {
                            required property string modelData
                            width: content.width
                            height: Style.space(20)

                            Text {
                                anchors.left: parent.left
                                anchors.right: dropPath.left
                                anchors.rightMargin: Style.space(4)
                                anchors.verticalCenter: parent.verticalCenter
                                text: parent.modelData
                                color: root.barForeground
                                opacity: 0.8
                                font.family: "monospace"
                                font.pixelSize: Style.font.bodySmall
                                elide: Text.ElideMiddle
                            }
                            PanelActionButton {
                                id: dropPath
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                iconText: "\uF0159"
                                tooltipText: "stop watching this folder"
                                foreground: root.barForeground
                                hoverColor: Color.urgent
                                onClicked: Critter.Control.run("remove-path", parent.modelData)
                            }
                        }
                    }

                    Text {
                        width: parent.width
                        visible: Critter.Control.watchPaths.length === 0
                        text: "nothing watched — add a folder to start counting"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        wrapMode: Text.WordWrap
                    }

                    Button {
                        text: "Add path"
                        foreground: Color.accent
                        bordered: true
                        onClicked: {
                            Critter.Control.browseHome();
                            root.browsing = true;
                        }
                    }

                    // ---- writing apps

                    Text {
                        width: parent.width
                        text: "writing apps"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    Repeater {
                        model: Critter.Control.whitelist
                        delegate: Item {
                            required property string modelData
                            width: content.width
                            height: Style.space(20)

                            Text {
                                anchors.left: parent.left
                                anchors.right: dropApp.left
                                anchors.rightMargin: Style.space(4)
                                anchors.verticalCenter: parent.verticalCenter
                                text: parent.modelData
                                color: root.barForeground
                                opacity: 0.8
                                font.family: "monospace"
                                font.pixelSize: Style.font.bodySmall
                                elide: Text.ElideRight
                            }
                            PanelActionButton {
                                id: dropApp
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                iconText: "\uF0159"
                                tooltipText: "stop counting while this app has focus"
                                foreground: root.barForeground
                                hoverColor: Color.urgent
                                onClicked: Critter.Control.run("remove-app", parent.modelData)
                            }
                        }
                    }

                    // The engine publishes the last app it saw and did not
                    // count. Offering it is the whole point: the identifier a
                    // compositor reports is rarely the application's name, so
                    // this is a string the user could not have typed.
                    Button {
                        visible: root.candidateApp.length > 0
                        text: "Add " + root.candidateApp
                        foreground: Color.accent
                        bordered: true
                        onClicked: Critter.Control.run("add-app", root.candidateApp)
                    }

                    // ---- mascot

                    Text {
                        width: parent.width
                        text: "mascot"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    Flow {
                        width: parent.width
                        spacing: Style.space(6)

                        Repeater {
                            model: Model.mascotIds()
                            delegate: Button {
                                required property string modelData
                                text: modelData
                                bordered: true
                                selected: Critter.Control.mascot === modelData
                                foreground: Critter.Control.mascot === modelData
                                    ? Color.accent : root.barForeground
                                onClicked: Critter.Control.run("set-mascot", modelData)
                            }
                        }
                    }

                    // ---- what the engine refused

                    Text {
                        width: parent.width
                        visible: Critter.Control.failedAction.length > 0
                        text: Critter.Control.failedAction + " failed — "
                              + Critter.Control.failureReason
                        color: Color.urgent
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.bodySmall
                        wrapMode: Text.WordWrap
                    }

                    // Shown, not editable: the settings above cover what the
                    // engine exposes as subcommands, and everything else still
                    // belongs to the config file.
                    Text {
                        width: parent.width
                        text: "everything else:  writing-critter config show"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: "monospace"
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WordWrap
                    }
                }
            }

            // ------------------------------------------------ the review
            //
            // The shell's own ConfirmDialog, configured the way its menu
            // plugin configures it before uninstalling something. Nothing is
            // installed or removed until its confirm button is pressed; Cancel,
            // Escape, and a click on the scrim all do nothing at all.
            //
            // It owns no process, timer or file read, so it may live in this
            // per-screen subtree. What it is asking about lives in Control, so
            // a review opened on one screen is the same review on another.
            //
            // It only asks. Progress and the result are the setup card's job:
            // ConfirmDialog is a fixed two-button message dialog with no third
            // state, and a modal for an action that takes under two seconds
            // would vanish faster than it could be read.
            ConfirmDialog {
                id: reviewDialog
                anchors.fill: parent
                z: 10
                opened: root.confirming.length > 0
                message: Model.serviceDisclosureMessage(root.confirming, root.service,
                                                        Critter.Control.homeDir)
                confirmText: Model.serviceConfirmLabel(root.confirming, root.service)
                cancelText: "Cancel"
                foreground: root.barForeground
                fontFamily: root.bar ? root.bar.fontFamily : Style.font.family
                onConfirmed: Critter.Control.confirmService()
                onCanceled: Critter.Control.cancelService()

                // PanelKeyCatcher consumes Escape itself and has no hook to let
                // anything answer first, so while this is open the catcher is
                // blocked (see its `blocked` binding) and keys come here.
                // Escape is consumed by the dialog and cannot also close the
                // panel. Focus goes back to the catcher when it closes, so the
                // next Escape closes the panel as it always has.
                Keys.onPressed: function (event) {
                    if (reviewDialog.handleKey(event))
                        event.accepted = true;
                }
                // Cancel is pre-selected, and put back every time the review
                // opens. ConfirmDialog defaults to its confirm button, which
                // is right for the menu plugin's "Uninstall" but would let one
                // stray Enter, in the instant the review appears, install an
                // engine and start a service. That is not a confirmation of a
                // disclosure nobody has had time to read. It also does not
                // reset itself, so without this the second review would open
                // wherever the first one was left.
                selectedIndex: 0
                onOpenedChanged: {
                    if (reviewDialog.opened) {
                        reviewDialog.selectedIndex = 0;
                        reviewDialog.forceActiveFocus();
                    } else {
                        keyCatcher.forceActiveFocus();
                    }
                }
            }
        }
    }
}
