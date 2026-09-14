## MODIFIED Requirements

### Requirement: Setup is fixed-scope, offline, and unprivileged
The service-management interface SHALL install only the engine and unit shipped
in the current plugin checkout, to fixed destinations derived internally from
the user's home and XDG configuration directory. It MUST NOT accept source or
destination paths from the panel, access the network, invoke a package manager,
or request privilege escalation. Installation, update, start, restart, and
uninstall MUST preserve the user's writing configuration, state, tracking data,
and history. A fresh installation with incomplete initial counting
configuration MUST start and remain active as an idle service rather than
restart-looping; the user SHALL be able to complete configuration from the
panel after setup succeeds.

#### Scenario: Install into a fresh account
- **WHEN** setup runs for a user who has no installed engine or unit and no
  watch path has yet been configured
- **THEN** it atomically installs the bundled files, enables the user service,
  and starts it as an idle user service without sudo or network access
- **AND** the service does not exit unsuccessfully or restart-loop before the
  user configures a path

#### Scenario: Setup is repeated
- **WHEN** the user confirms installation for files that already match the bundled release
- **THEN** the operation succeeds without duplicating units or altering writing data

#### Scenario: Existing writing data
- **WHEN** any lifecycle operation runs after the user has accumulated configuration and history
- **THEN** those data remain byte-for-byte outside the operation's target set

#### Scenario: Configuration follows setup
- **WHEN** a user adds the first watch path after successful fresh setup
- **THEN** the running service adopts it without requiring setup or a service
  restart
