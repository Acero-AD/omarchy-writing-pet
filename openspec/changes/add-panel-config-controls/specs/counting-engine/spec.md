## MODIFIED Requirements

### Requirement: The engine owns configuration
Goal, watch paths, whitelist, grace window and cadence SHALL live in an
engine-owned config file that can be read and edited with no shell running. The
engine SHALL expose subcommands to add and remove watch paths and whitelist
entries. Configuration mutations SHALL be serialised against one another, so
that two commands issued at the same moment cannot lose an update.

#### Scenario: Configuring with the shell stopped
- **WHEN** the user adds a watch path via the engine's subcommand while no desktop shell is running
- **THEN** the path is persisted and used on the next cycle

#### Scenario: Invalid configuration is reported
- **WHEN** the config file is malformed
- **THEN** the engine exits with a clear message naming the file and the problem, and does not write over it

#### Scenario: Two mutations at once
- **WHEN** two configuration commands run concurrently and each modifies a different setting
- **THEN** both changes are present afterwards, and neither is silently overwritten by the other

#### Scenario: The running engine is not a writer
- **WHEN** the engine is running and a configuration command is issued
- **THEN** the command writes the file and the running engine only reads it, so no lock is contended with the daemon
