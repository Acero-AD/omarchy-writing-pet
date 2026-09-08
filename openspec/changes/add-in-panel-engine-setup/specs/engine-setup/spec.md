## ADDED Requirements

### Requirement: Service state is obtained from the bundled engine
When the user opens the panel, the plugin SHALL ask the engine executable in the
checked-out plugin for structured service status. It MUST distinguish an absent
installation, an installed but outdated engine, an installed but stopped
service, a service that is starting, an active service whose state is stale, and
a ready service. It MUST NOT infer those states from the presence of the state
file alone.

#### Scenario: Plugin has never been set up
- **WHEN** the panel opens and neither the installed engine nor user service exists
- **THEN** the panel reports that setup is required and offers to review the installation

#### Scenario: Service stopped after previously running
- **WHEN** the panel opens with a current installed engine and unit whose service is inactive
- **THEN** the panel reports that the engine is stopped and offers a start action rather than an install action

#### Scenario: Active service is not publishing
- **WHEN** systemd reports the service active but the published state is older than the freshness window
- **THEN** the panel reports an unhealthy engine and offers a restart action

#### Scenario: Merely loading the widget
- **WHEN** the shell loads the plugin and the user never opens its panel
- **THEN** no status or service-management process is spawned

### Requirement: Installation is disclosed and explicitly confirmed
The panel SHALL show a review step before installation. The review MUST name the
resolved engine destination and user-unit destination, state that the service
will be enabled and started, and state that setup uses no administrator access
and no network connection. No installation effect SHALL occur until the user
confirms that disclosure.

#### Scenario: User reviews and cancels setup
- **WHEN** the user opens the installation review and selects cancel
- **THEN** no file is copied, no unit is enabled, and no process other than the read-only status probe is invoked

#### Scenario: User confirms setup
- **WHEN** the user selects install and start after reviewing the disclosure
- **THEN** the bundled engine performs the disclosed user-owned file and service operations

### Requirement: Setup is fixed-scope, offline, and unprivileged
The service-management interface SHALL install only the engine and unit shipped
in the current plugin checkout, to fixed destinations derived internally from
the user's home and XDG configuration directory. It MUST NOT accept source or
destination paths from the panel, access the network, invoke a package manager,
or request privilege escalation. Installation, update, start, restart, and
uninstall MUST preserve the user's writing configuration, state, tracking data,
and history.

#### Scenario: Install into a fresh account
- **WHEN** setup runs for a user who has no installed engine or unit
- **THEN** it atomically installs the bundled files, enables the user service, and starts it without sudo or network access

#### Scenario: Setup is repeated
- **WHEN** the user confirms installation for files that already match the bundled release
- **THEN** the operation succeeds without duplicating units or altering writing data

#### Scenario: Existing writing data
- **WHEN** any lifecycle operation runs after the user has accumulated configuration and history
- **THEN** those data remain byte-for-byte outside the operation's target set

### Requirement: Installed engine drift requires user action
The service status SHALL compare the installed engine and unit with the files in
the current plugin checkout. When either differs, the panel SHALL offer an
update-and-restart action and MUST NOT replace the installed files merely
because the plugin was updated or the panel was opened.

#### Scenario: Plugin files are newer than the installed engine
- **WHEN** a plugin update changes the bundled engine or unit
- **THEN** opening the panel reports that an engine update is available and leaves the running installation untouched

#### Scenario: User accepts the engine update
- **WHEN** the user confirms update and restart
- **THEN** the service-management interface atomically replaces the installed files with the bundled files and restarts the user service

### Requirement: Engine removal is symmetric
The panel SHALL offer an explicit engine-uninstall action with confirmation. The
operation SHALL stop and disable the user service, remove only the installed
engine and unit, reload the user service manager, and preserve all writing
configuration and state so reinstalling can resume from the retained data.

#### Scenario: User removes the engine before removing the plugin
- **WHEN** the user confirms engine removal
- **THEN** the service no longer runs or starts automatically and the installed engine and unit no longer exist

#### Scenario: User cancels engine removal
- **WHEN** the user dismisses the uninstall confirmation
- **THEN** the service and files remain unchanged

### Requirement: UI and terminal setup share one implementation
The engine SHALL own service status and lifecycle semantics. The QML panel,
`install.sh`, and any uninstall wrapper MUST delegate to that interface rather
than independently copying files or composing systemctl commands. QML MUST
invoke only the fixed bundled engine path from a stable singleton and MUST pass
only internally mapped argument sequences.

#### Scenario: Install from the terminal wrapper
- **WHEN** a user runs `install.sh`
- **THEN** it requests the same engine installation operation and receives the same result as the panel action

#### Scenario: Panel requests setup
- **WHEN** a panel button requests a service lifecycle action
- **THEN** the singleton maps that action to a fixed engine argument sequence without executing a shell or accepting arbitrary arguments

### Requirement: Setup failures are contained and actionable
Every status and lifecycle operation SHALL have a bounded runtime and SHALL
return a stable structured result. On failure, the panel SHALL remain usable,
show the failed operation and sanitized reason, and provide a copyable terminal
command for the same operation. A failed setup MUST NOT be reported as ready.

#### Scenario: User service manager is unavailable
- **WHEN** a systemctl user operation fails or times out
- **THEN** the panel reports the failure, offers the equivalent bundled-engine command, and leaves the shell responsive

#### Scenario: Engine becomes ready
- **WHEN** installation or repair succeeds and fresh state is published
- **THEN** the panel transitions to ready without requiring a shell restart

