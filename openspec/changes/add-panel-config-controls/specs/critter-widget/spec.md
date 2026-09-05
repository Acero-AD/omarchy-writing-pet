## ADDED Requirements

### Requirement: The widget writes nothing, and spawns only from a singleton
The bar widget and its panel MUST NOT write any file, MUST NOT use a writable
file adapter, and MUST NOT create components dynamically at runtime. They MAY
read the engine's state and configuration files and MAY list directories for the
path picker. A process MAY be spawned only from a singleton, only with a program
on a fixed allowlist, and only in response to an explicit user action.

#### Scenario: No writes from the shell process
- **WHEN** the widget and panel run for a full session, including changing every setting
- **THEN** no file is written by the plugin's QML

#### Scenario: Source-level guard
- **WHEN** the repository is checked by CI
- **THEN** the QML sources contain no write adapter and no dynamic component creation, and every process declaration is inside a singleton with an allowlisted program

#### Scenario: No process without a user action
- **WHEN** the shell starts and the panel is never opened
- **THEN** the plugin spawns no process

## MODIFIED Requirements

### Requirement: Panel controls act through the engine, never by writing state
Controls offered in the panel SHALL change configuration only by invoking the
engine, which remains the sole writer of the configuration file. The panel MUST
NOT write configuration itself, MUST NOT write the state file, and MUST NOT
duplicate the engine's validation. A setting the engine cannot express as a
subcommand MUST be presented as a command the user can run, not performed by the
widget.

#### Scenario: Configuration is delegated, not performed
- **WHEN** the user changes a setting in the panel
- **THEN** the engine performs the write after validating the value, and the panel writes nothing

#### Scenario: Validation is not duplicated
- **WHEN** an invalid value somehow reaches the engine from the panel
- **THEN** the engine rejects it with its existing validation, and the panel has no separate rule that could disagree

## REMOVED Requirements

### Requirement: The widget performs no I/O beyond reading the state file
**Reason**: Written as a blanket prohibition immediately after the 2026-09-02
crash, when the priority was reducing surface area rather than isolating the
mechanism. The crash was caused by asynchronous work outliving a subtree
destroyed by a late-settling binding — not by writing or by spawning. The
prohibitions that were actually load-bearing (no writes, no adapter, no dynamic
creation, singleton ownership of async work) are retained; the two that were not
are narrowed.

**Migration**: Replaced by "The widget writes nothing, and spawns only from a
singleton" in this same capability. Reading the configuration file and listing
directories are now permitted reads; spawning is permitted only from a singleton
with an allowlisted program. Writing remains forbidden without exception.
