import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Loaded via Loader from BarWidget.qml; deliberately not a manifest entry
// point. Three modes share one surface rather than spawning extra popups:
//   main   — the critter, progress, breakdown, history
//   menu   — the right-click quick actions
//   config — settings
Panel {
    id: root
    moduleName: "io.github.acero-ad.writing-critter"
    manageIpc: false

    property var anchorItem: null
    property var hostWidget: null
    property string mode: "main"

    readonly property var service: hostWidget ? hostWidget.service : null
    readonly property string mascot: service ? service.mascot : Model.MASCOT_DEFAULT
    readonly property var mascotSet: Model.mascotSet(mascot)
    readonly property int stage: service ? service.stage : 0
    readonly property string mood: service ? service.mood : "sleeping"
    readonly property int wordsToday: service ? service.wordsToday : 0
    readonly property int goal: service ? service.goal : Model.DEFAULT_SETTINGS.goal
    readonly property real progress: goal > 0 ? Math.min(1, wordsToday / goal) : 0

    readonly property string artText: Model.panelArt(mascot, stage, mood).join("\n")
    readonly property string phrase: Model.statusPhrase(stage, mood)

    function open() {
        root.controller.show();
    }
    function close() {
        root.controller.hide();
        root.mode = "main";
    }
    function switchPanel(direction) {
        if (root.bar && typeof root.bar.switchPanelFrom === "function")
            return root.bar.switchPanelFrom(root.hostWidget || root, direction);
        return false;
    }

    function togglePause() {
        if (!service) return;
        if (service.pausedToday) service.resumeToday();
        else service.pauseToday();
    }

    function setSetting(name, value) {
        if (!service) return;
        var next = {};
        var stored = service.stateSettings();
        for (var k in stored) {
            if (Object.prototype.hasOwnProperty.call(stored, k)) next[k] = stored[k];
        }
        next[name] = value;
        service.writeSettings(next);
    }

    KeyboardPanel {
        id: panel
        anchorItem: root.anchorItem
        owner: root.hostWidget || root
        bar: root.bar
        open: root.opened
        focusTarget: keyCatcher
        contentWidth: panel.fittedContentWidth(Style.space(300))
        contentHeight: panel.fittedContentHeight(content.implicitHeight)

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            // Keys.priority is BeforeItem here, so without this every keystroke
            // is swallowed by the panel's own navigation -- "j" moves a cursor,
            // Enter toggles pause -- and an inline text field can never be
            // typed into. Documented in PanelKeyCatcher.qml; missed first time.
            blocked: watchInput.activeFocus
            onCloseRequested: root.close()
            onTabRequested: function (direction) {
                root.switchPanel(direction);
            }
            onActivateRequested: root.togglePause()

            Column {
                id: content
                width: parent.width
                spacing: Style.space(10)

                // ------------------------------------------------ header
                Text {
                    width: parent.width
                    text: root.mode === "config" ? "SETTINGS"
                        : root.mode === "menu" ? "WRITING CRITTER" : "WRITING CRITTER"
                    color: root.barForeground
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.subtitle
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                }

                // ------------------------------------------------- main
                Column {
                    width: parent.width
                    spacing: Style.space(10)
                    visible: root.mode === "main"

                    // The one element that must not inherit the theme family.
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
                            // The snail's trail already encodes progress; a
                            // second meter beside it is redundant clutter.
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

                    Text {
                        width: parent.width
                        text: "TODAY"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
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

                    Text {
                        width: parent.width
                        text: "LAST 7 DAYS"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    Row {
                        spacing: Style.space(4)
                        Repeater {
                            model: root.streakRows
                            delegate: Rectangle {
                                required property var modelData
                                width: Style.space(14)
                                height: Style.space(14)
                                radius: Style.space(3)
                                color: parent.modelData && parent.modelData.met
                                    ? Color.accent
                                    : Qt.rgba(root.barForeground.r, root.barForeground.g, root.barForeground.b, 0.14)
                            }
                        }
                    }
                }

                // ------------------------------------------------- menu
                Column {
                    width: parent.width
                    spacing: Style.space(6)
                    visible: root.mode === "menu"

                    Repeater {
                        model: [
                            { key: "pause", label: root.service && root.service.pausedToday ? "Resume counting today" : "Pause counting today" },
                            { key: "reset", label: "Reset today" },
                            { key: "config", label: "Open settings" }
                        ]
                        delegate: Rectangle {
                            required property var modelData
                            width: content.width
                            height: Style.space(34)
                            radius: Style.cornerRadius
                            color: menuMouse.containsMouse
                                ? Qt.rgba(root.barForeground.r, root.barForeground.g, root.barForeground.b, 0.14)
                                : "transparent"
                            Text {
                                anchors.verticalCenter: parent.verticalCenter
                                anchors.left: parent.left
                                anchors.leftMargin: Style.space(10)
                                text: parent.modelData.label
                                color: root.barForeground
                                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                                font.pixelSize: Style.font.body
                            }
                            MouseArea {
                                id: menuMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.runMenuAction(parent.modelData.key)
                            }
                        }
                    }
                }

                // ----------------------------------------------- config
                Column {
                    width: parent.width
                    spacing: Style.space(10)
                    visible: root.mode === "config"

                    NumberField {
                        label: "Daily goal"
                        from: 10
                        to: 100000
                        stepSize: 50
                        value: root.goal
                        enabled: !root.goalLocked
                        opacity: root.goalLocked ? 0.5 : 1
                        onModified: function (v) {
                            root.setSetting("goal", v);
                        }
                    }

                    Text {
                        width: parent.width
                        visible: root.goalLocked
                        text: "Pinned in shell.json — edit it there."
                        color: root.barForeground
                        opacity: 0.6
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WordWrap
                    }

                    Text {
                        width: parent.width
                        text: "CRITTER"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    // Previews both resolutions, because that is what the user
                    // will actually be looking at.
                    Repeater {
                        model: Model.mascotIds()
                        delegate: Rectangle {
                            required property string modelData
                            width: content.width
                            height: Style.space(30) + Style.font.body * 1.15 * Model.mascotSet(parent.modelData).rows
                            radius: Style.cornerRadius
                            color: root.mascot === parent.modelData
                                ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.16)
                                : "transparent"
                            border.width: root.mascot === parent.modelData ? 1 : 0
                            border.color: Color.accent
                            Column {
                                anchors.centerIn: parent
                                spacing: Style.space(2)
                                Text {
                                    text: Model.barFace(parent.parent.modelData, 3, "writing")
                                    color: root.barForeground
                                    font.family: "monospace"
                                    font.pixelSize: Style.font.bodySmall
                                    horizontalAlignment: Text.AlignHCenter
                                }
                                Text {
                                    text: Model.panelArt(parent.parent.modelData, 3, "writing").join("\n")
                                    color: Color.accent
                                    font.family: "monospace"
                                    font.pixelSize: Style.font.caption
                                    horizontalAlignment: Text.AlignHCenter
                                }
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.setSetting("mascot", parent.modelData)
                            }
                        }
                    }

                    Text {
                        width: parent.width
                        text: "WRITING APPS"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    Text {
                        width: parent.width
                        text: root.whitelistText
                        color: root.barForeground
                        opacity: 0.8
                        font.family: "monospace"
                        font.pixelSize: Style.font.bodySmall
                        wrapMode: Text.WordWrap
                    }

                    // Naming a window is the single most likely thing a user
                    // gets wrong, so the current one is always on screen.
                    Text {
                        width: parent.width
                        text: root.service && root.service.activeApp
                            ? "focused now: " + root.service.activeApp
                            : "focused now: (none)"
                        color: root.barForeground
                        opacity: 0.6
                        font.family: "monospace"
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WordWrap
                    }

                    Rectangle {
                        width: content.width
                        height: Style.space(32)
                        radius: Style.cornerRadius
                        color: Color.accent
                        visible: root.canAddFocusedApp
                        Text {
                            anchors.centerIn: parent
                            text: "Add focused app"
                            color: Color.background
                            font.bold: true
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.addFocusedApp()
                        }
                    }

                    Text {
                        width: parent.width
                        text: "WATCHED PATHS"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    Repeater {
                        model: root.service ? root.service.watchEntries : []
                        delegate: Item {
                            required property var modelData
                            required property int index
                            width: content.width
                            height: Style.space(22)
                            Text {
                                anchors.left: parent.left
                                anchors.right: removeHit.left
                                anchors.verticalCenter: parent.verticalCenter
                                text: String(parent.modelData.path)
                                color: root.barForeground
                                opacity: 0.85
                                font.family: "monospace"
                                font.pixelSize: Style.font.bodySmall
                                elide: Text.ElideMiddle
                            }
                            Rectangle {
                                id: removeHit
                                anchors.right: parent.right
                                anchors.verticalCenter: parent.verticalCenter
                                width: Style.space(20)
                                height: Style.space(20)
                                radius: Style.space(4)
                                visible: !root.watchLocked
                                color: removeMouse.containsMouse
                                    ? Qt.rgba(root.barForeground.r, root.barForeground.g, root.barForeground.b, 0.16)
                                    : "transparent"
                                Text {
                                    anchors.centerIn: parent
                                    text: "x"
                                    color: root.barForeground
                                    font.family: "monospace"
                                    font.pixelSize: Style.font.bodySmall
                                }
                                MouseArea {
                                    id: removeMouse
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: if (root.service) root.service.removeWatchPathAt(parent.parent.index)
                                }
                            }
                        }
                    }

                    Text {
                        width: parent.width
                        visible: !root.service || root.service.watchEntries.length === 0
                        text: "No paths yet. Focus a writing app and the critter will try to find where you write on its own."
                        color: root.barForeground
                        opacity: 0.6
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WordWrap
                    }

                    TextField {
                        id: watchInput
                        width: content.width
                        visible: !root.watchLocked
                        placeholderText: "~/Documents/writing   (press Enter)"
                        font.family: "monospace"
                        font.pixelSize: Style.font.bodySmall
                        onAccepted: {
                            if (root.service && text.length > 0) root.service.addWatchPaths([text]);
                            text = "";
                        }
                    }

                    Rectangle {
                        width: content.width
                        height: Style.space(32)
                        radius: Style.cornerRadius
                        visible: !root.watchLocked
                        color: root.service && root.service.discovering
                            ? Qt.rgba(root.barForeground.r, root.barForeground.g, root.barForeground.b, 0.12)
                            : Color.accent
                        Text {
                            anchors.centerIn: parent
                            text: root.service && root.service.discovering ? "Looking..." : "Find where I write"
                            color: root.service && root.service.discovering ? root.barForeground : Color.background
                            font.bold: true
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            enabled: root.service && !root.service.discovering
                            onClicked: if (root.service) root.service.discover(false)
                        }
                    }

                    Text {
                        width: parent.width
                        visible: root.service && root.service.discoveryNote.length > 0
                        text: root.service ? root.service.discoveryNote : ""
                        color: root.barForeground
                        opacity: 0.7
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WordWrap
                    }

                    Text {
                        width: parent.width
                        text: "SOURCES"
                        color: root.barForeground
                        opacity: 0.5
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.caption
                    }

                    Text {
                        width: parent.width
                        text: root.sourcesText
                        color: root.barForeground
                        opacity: 0.8
                        font.family: "monospace"
                        font.pixelSize: Style.font.bodySmall
                        wrapMode: Text.WordWrap
                    }

                    Text {
                        width: parent.width
                        text: root.service ? "state: " + root.service.stateFile : ""
                        color: root.barForeground
                        opacity: 0.45
                        font.family: "monospace"
                        font.pixelSize: Style.font.caption
                        wrapMode: Text.WrapAnywhere
                    }
                }

                // ---------------------------------------------- actions
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: Style.space(8)
                    visible: root.mode !== "menu"

                    Rectangle {
                        width: Style.space(96)
                        height: Style.space(34)
                        radius: Style.cornerRadius
                        color: Color.accent
                        Text {
                            anchors.centerIn: parent
                            text: root.service && root.service.pausedToday ? "Resume" : "Pause"
                            color: Color.background
                            font.bold: true
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.togglePause()
                        }
                    }

                    Rectangle {
                        width: Style.space(72)
                        height: Style.space(34)
                        radius: Style.cornerRadius
                        color: Qt.rgba(root.barForeground.r, root.barForeground.g, root.barForeground.b, 0.12)
                        Text {
                            anchors.centerIn: parent
                            text: "Reset"
                            color: root.barForeground
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: if (root.service) root.service.resetToday()
                        }
                    }

                    Rectangle {
                        width: Style.space(84)
                        height: Style.space(34)
                        radius: Style.cornerRadius
                        color: Qt.rgba(root.barForeground.r, root.barForeground.g, root.barForeground.b, 0.12)
                        Text {
                            anchors.centerIn: parent
                            text: root.mode === "config" ? "Back" : "Settings"
                            color: root.barForeground
                            font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.mode = (root.mode === "config" ? "main" : "config")
                        }
                    }
                }
            }
        }
    }

    // ------------------------------------------------------ derived rows

    readonly property bool goalLocked: service ? service.isOverridden("goal") : false
    readonly property bool canAddFocusedApp: service
        && service.activeApp.length > 0
        && !service.isWritingApp(service.activeApp)
        && !service.isOverridden("whitelist")

    readonly property var originRows: {
        var rows = [];
        var origins = service ? service.byOrigin : ({});
        for (var key in origins) {
            if (Object.prototype.hasOwnProperty.call(origins, key))
                rows.push({ name: key, words: origins[key] });
        }
        if (rows.length === 0) rows.push({ name: "file watch", words: 0 });
        return rows;
    }

    readonly property var streakRows: {
        var rows = [];
        var history = service ? service.history() : [];
        var start = Math.max(0, history.length - 6);
        for (var i = start; i < history.length; i++)
            rows.push({ met: history[i].words >= history[i].goal });
        rows.push({ met: root.wordsToday >= root.goal });
        return rows;
    }

    readonly property string whitelistText: {
        if (!service) return "";
        var list = service.whitelist;
        return list.length ? list.join(", ") : "(none configured)";
    }

    readonly property bool watchLocked: service ? service.isOverridden("watch") : false

    readonly property string sourcesText: {
        if (!service) return "";
        var rows = service.sourceStatus();
        if (!rows.length) return "(none)";
        var out = [];
        for (var i = 0; i < rows.length; i++)
            out.push(rows[i].id + "  " + rows[i].words + "  " + (rows[i].active ? "live" : "inactive"));
        return out.join("\n");
    }

    function runMenuAction(key) {
        if (key === "pause") {
            togglePause();
            close();
        } else if (key === "reset") {
            if (service) service.resetToday();
            close();
        } else if (key === "config") {
            mode = "config";
        }
    }

    function addFocusedApp() {
        if (!service) return;
        var list = [];
        for (var i = 0; i < service.whitelist.length; i++) list.push(service.whitelist[i]);
        list.push(service.activeApp);
        setSetting("whitelist", list);
    }
}
