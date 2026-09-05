# panel-configuration Specification

## Purpose
TBD - created by archiving change add-panel-config-controls. Update Purpose after archive.
## Requirements
### Requirement: Settings are applied from the panel, not merely printed
The panel SHALL offer controls that change the daily goal, the watch paths, the
whitelisted writing applications, and the mascot. Each control MUST commit by
invoking the engine's existing configuration subcommands. The panel MUST NOT
write the configuration file, and MUST NOT introduce configuration semantics the
command line does not already have.

#### Scenario: A setting changes from the panel alone
- **WHEN** the user adjusts a setting in the panel
- **THEN** the engine's configuration is updated and the running engine applies it without the user opening a terminal

#### Scenario: The command line stays sufficient
- **WHEN** the panel's controls are compared against the engine's subcommands
- **THEN** every control maps onto a subcommand that already exists, and no subcommand is added for the panel's benefit

### Requirement: Every committed value is chosen from a presented set
No control SHALL send a value the user typed freely. Each argument MUST come
from a bounded slider position, a directory the user selected in the picker, an
application id the engine itself published, or a known mascot name. The panel
MUST contain no text input.

#### Scenario: No free text reaches the engine
- **WHEN** the panel's controls are exercised in every combination
- **THEN** every argument sent originates from a value the panel was given or a range it enforces, never from keyboard entry

#### Scenario: No key catcher conflict
- **WHEN** the panel is open
- **THEN** the panel's key catcher requires no blocking, because no child needs to receive keystrokes

### Requirement: Watch paths are selected by browsing, and browsing only reads
An **Add path** control SHALL open a directory picker that opens at the user's
home directory and allows navigating into subdirectories and up to parent
directories, so a location outside `$HOME` remains reachable. The picker MUST
list directories only, MUST NOT read file contents, and MUST NOT accept a typed
path. Selecting a directory commits it as a watch path.

#### Scenario: Choosing a vault
- **WHEN** the user opens the picker and navigates to a directory
- **THEN** only directories are listed at each level, and confirming the selection adds it as a watch path

#### Scenario: A location outside the home directory
- **WHEN** the user's writing lives under a mount point outside `$HOME`
- **THEN** the picker can reach it by navigating upward, without any path being typed

#### Scenario: Browsing writes nothing
- **WHEN** the user opens, navigates and closes the picker without confirming
- **THEN** nothing is written and no subprocess is spawned

### Requirement: A whitelist candidate is offered, never guessed
The panel SHALL offer the most recently focused application that is not already
whitelisted, identified by the exact id the engine matched against. Adding it
MUST be a single action.

#### Scenario: Adding the editor you were just in
- **WHEN** the user has focused an editor that is not whitelisted, then opens the panel
- **THEN** the panel names that application by its exact id and adding it takes one action

#### Scenario: Nothing to suggest
- **WHEN** every recently focused application is already whitelisted
- **THEN** the panel offers no candidate rather than an empty or placeholder control

### Requirement: Anything that can be added can be removed
Every watch path and every whitelisted application SHALL be listed individually
with a control that removes it.

#### Scenario: Undoing a mistake
- **WHEN** the user has whitelisted an application in error
- **THEN** the panel lists it and removes it in one action, without the user recalling its id

### Requirement: A continuous control commits once, on release
A slider or other continuous control SHALL commit its value when the user
finishes the interaction, not while the value is changing. Intermediate values
MUST NOT be sent.

#### Scenario: Dragging the goal slider
- **WHEN** the user drags the goal slider across its range and releases it
- **THEN** exactly one configuration command is issued, carrying the released value

### Requirement: The panel displays the engine's configuration, not its own
Displayed settings SHALL be read back from the engine's own files. The panel
MUST NOT show an optimistic value that the engine has not accepted.

#### Scenario: A change made elsewhere
- **WHEN** the configuration is changed from a terminal while the panel is open
- **THEN** the panel reflects the new value without user interaction

#### Scenario: A rejected change
- **WHEN** a configuration command fails
- **THEN** the panel continues to display the configuration as it actually is, and reports that the change did not apply

