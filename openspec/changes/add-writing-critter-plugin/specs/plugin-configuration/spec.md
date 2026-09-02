## ADDED Requirements

### Requirement: The plugin is useful with no configuration
The plugin SHALL ship defaults that produce working behaviour on a stock Omarchy install without the user editing any file. The default writing-app whitelist MUST include Omarchy's own writing app.

#### Scenario: Fresh install, nothing configured
- **WHEN** the user adds the widget to their bar and writes in Omawrite with no further setup
- **THEN** the critter wakes and today's count increases

#### Scenario: Default goal is present
- **WHEN** no goal is configured
- **THEN** a documented default daily goal is used and shown in the bar

### Requirement: Inline shell.json settings override stored settings
Settings present in the widget's inline `shell.json` layout entry SHALL take precedence over the same keys in the plugin's state file. Settings absent from `shell.json` SHALL fall back to the state file, then to defaults.

#### Scenario: Declarative override wins
- **WHEN** `shell.json` sets a goal of 750 and the state file stores 1000
- **THEN** the effective goal is 750

#### Scenario: Unset key falls through
- **WHEN** `shell.json` sets only the goal and the state file stores a mascot selection
- **THEN** the stored mascot selection remains in effect

### Requirement: Settings overridden by shell.json are read-only in the UI
For any setting currently overridden by `shell.json`, the configuration UI SHALL display the effective value, disable editing of that field, and indicate why it cannot be edited. The plugin MUST NOT write to `shell.json`.

#### Scenario: Locked field
- **WHEN** the goal is pinned in `shell.json` and the user opens the configuration view
- **THEN** the goal field shows 750, is not editable, and is marked as pinned by shell configuration

#### Scenario: Plugin never edits the user's shell config
- **WHEN** the user changes any setting in the panel
- **THEN** only the plugin's own state file is written

### Requirement: The panel provides a configuration surface
The panel SHALL let the user set the daily goal, edit the writing-app whitelist, add and remove watched paths, choose the mascot set, toggle presentation and notification options, and reset today's count or clear history.

#### Scenario: Changing the goal
- **WHEN** the user sets a new goal in the panel
- **THEN** the value persists across a shell restart and progress recalculates immediately

#### Scenario: Mascot picker previews both resolutions
- **WHEN** the user opens the mascot picker
- **THEN** each option previews both its bar face and a panel frame

### Requirement: The whitelist can be populated by detection
The configuration UI SHALL provide a control that adds the currently focused application's identifier to the writing-app whitelist, and SHALL document how a user can discover identifiers manually.

#### Scenario: Detecting the current app
- **WHEN** the user focuses their editor and then activates the detect control
- **THEN** that application's identifier is added to the whitelist and counting begins to apply to it

### Requirement: Notifications and nudges are off or silent by default
Goal notifications SHALL default to off. The idle indicator SHALL be silent, visual only, and disableable.

#### Scenario: Reaching the goal without opting in
- **WHEN** the user crosses the daily goal and has not enabled notifications
- **THEN** no desktop notification is sent and only the in-bar celebration is shown

### Requirement: Counting can be paused for the day
The plugin SHALL offer a control to pause counting for the remainder of the day and to reset today's count, reachable without opening the configuration view.

#### Scenario: Pausing
- **WHEN** the user pauses counting
- **THEN** the poll timer stops, the critter sleeps, and word changes are not counted until resumed or the day rolls over
