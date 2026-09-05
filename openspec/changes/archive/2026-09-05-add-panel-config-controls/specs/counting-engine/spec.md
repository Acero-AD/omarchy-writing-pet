## MODIFIED Requirements

### Requirement: The engine owns configuration
Goal, watch paths, whitelist, grace window and cadence SHALL live in an
engine-owned config file that can be read and edited with no shell running. The
engine SHALL expose subcommands to add and remove watch paths and whitelist
entries, and to set the goal, the mascot and the scan interval. Configuration
mutations SHALL be serialised against one another, so that two commands issued
at the same moment cannot lose an update.

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

### Requirement: The engine runs outside the desktop shell process
All word counting, focus tracking, file scanning and state writing SHALL happen in a process separate from `quickshell`. No part of the counting engine may execute inside the shell. The shell MAY start the engine as a short-lived process to apply a configuration change, which is the opposite of running the engine inside it: the work still happens elsewhere, and the shell only waits for an exit code.

#### Scenario: An engine fault cannot take down the desktop
- **WHEN** the engine crashes, hangs, or is killed
- **THEN** the desktop shell continues running normally and only the critter's display stops updating

#### Scenario: The engine runs without a desktop at all
- **WHEN** the engine is started from a plain terminal with no bar widget installed
- **THEN** it tracks focus, counts words, and writes state normally

#### Scenario: The shell invokes the engine rather than doing its work
- **WHEN** a setting is changed from the bar
- **THEN** a short-lived engine process performs the validation and the write, and the shell process does neither

## ADDED Requirements

### Requirement: Counting cadence is driven by time, not by compositor events
The interval between counting cycles SHALL be measured from the previous cycle. A cycle MUST NOT be skipped because the loop was woken by a focus event instead of by its own timer.

#### Scenario: A stream of focus events does not starve counting
- **WHEN** the compositor emits focus events more frequently than the scan interval, as it does when an editor rewrites its title while the user types
- **THEN** cycles continue to run at the configured interval

#### Scenario: Events do not accelerate counting either
- **WHEN** many focus events arrive within one scan interval
- **THEN** at most one counting cycle runs in that interval

### Requirement: Installing replaces the engine that is running
The installer SHALL leave the newly installed engine running. Replacing the executable on disk while an older process continues to serve MUST NOT be a possible outcome of a successful install.

#### Scenario: Installing over a running engine
- **WHEN** the installer is run while a previous version is already running
- **THEN** the previous process is replaced, and the behaviour of the running engine matches the version just installed
