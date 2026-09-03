import QtQuick
import qs.Commons
import qs.Ui
import "." as Critter
import "Model.js" as Model

// Loaded via Loader from BarWidget.qml; deliberately not a manifest entry
// point.
//
// This panel displays and does not configure. Settings live in the engine's
// config file and are changed with `writing-critter config ...`, so there is
// one writer for them and the shell is not it. The earlier version edited
// settings from here, which meant a text field in the bar, a key catcher to
// feed it, and a write path out of the shell process -- and it is the write
// path that eventually crashed the desktop. Showing the command is duller and
// cannot take the session down.
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

                // The one element that must not inherit the theme family: the
                // art is column-aligned and a proportional font shreds it.
                Text {
                    width: parent.width
                    text: root.artText
                    color: Color.accent
                    font.family: "monospace"
                    font.pixelSize: Style.font.body
                    textFormat: Text.PlainText
                    horizontalAlignment: Text.AlignHCenter
                    lineHeight: 1.15
                    // Reserved so the panel does not resize as the critter grows.
                    height: Style.font.body * 1.15 * root.mascotSet.rows
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
                    text: "SETTINGS"
                    color: root.barForeground
                    opacity: 0.5
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                }

                // Shown, not edited. The engine owns its config file; giving
                // the bar a second writer is how settings get lost.
                Text {
                    width: parent.width
                    text: "goal      " + root.goal + " words/day\n"
                        + "mascot    " + root.mascot + "\n"
                        + "\n"
                        + "change with:\n"
                        + "  writing-critter config set-goal 800\n"
                        + "  writing-critter config set-mascot snail\n"
                        + "  writing-critter config add-path ~/notes\n"
                        + "  writing-critter config add-app obsidian\n"
                        + "\n"
                        + "see everything:  writing-critter status"
                    color: root.barForeground
                    opacity: 0.75
                    font.family: "monospace"
                    font.pixelSize: Style.font.bodySmall
                    textFormat: Text.PlainText
                    wrapMode: Text.WordWrap
                }
            }
        }
    }
}
