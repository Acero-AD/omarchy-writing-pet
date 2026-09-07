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
// There is also still no text input anywhere, which is why the key catcher
// below needs no blocking: every value the user can send is picked from a set
// -- a slider position, a directory they walked to, an app id the engine
// itself published.
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

    function open() {
        root.controller.show();
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
            // Nothing here is typed into any more, so nothing needs to block
            // this catcher. That was a real bug once: Keys.priority is
            // BeforeItem, so an unblocked catcher swallows every keystroke and
            // an inline field can never receive one.
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

                    Text {
                        width: parent.width
                        text: "goal   " + (goalSlider.dragging
                                           ? Math.round(goalSlider.liveValue)
                                           : Critter.Control.goal) + " words/day"
                        color: root.barForeground
                        opacity: 0.8
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.bodySmall
                    }

                    PanelSlider {
                        id: goalSlider
                        bar: root.bar
                        width: parent.width
                        minimum: 100
                        maximum: 3000
                        step: 50
                        integer: true
                        value: Critter.Control.goal
                        // On release only. Committing on `moved` would spawn an
                        // engine process per pixel of drag.
                        onReleased: function (v) {
                            Critter.Control.run("set-goal", Math.round(v));
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
        }
    }
}
