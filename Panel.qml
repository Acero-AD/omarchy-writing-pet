import QtQuick
import qs.Ui

// Loaded via Loader from BarWidget.qml; deliberately NOT a manifest entry point.
// Scaffold only — panel layout lands in task group 5.
Panel {
    id: root
    moduleName: "io.github.acero-ad.writing-critter"
    manageIpc: false
}
