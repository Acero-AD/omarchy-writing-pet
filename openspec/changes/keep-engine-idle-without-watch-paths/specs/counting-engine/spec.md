## ADDED Requirements

### Requirement: Incomplete counting configuration is an idle daemon state
The engine SHALL remain running when no watch path or no writing application is
configured. It MUST publish fresh state with a closed gate, MUST identify the
blocking configuration in terminal status and daemon logs, and MUST NOT scan or
read document files until both prerequisites are present. Adding a prerequisite
through the configuration interface MUST take effect in the running engine
without a service restart, and newly visible existing files MUST be seeded as
baselines before they can contribute to today's count.

#### Scenario: Engine starts before a watch path is selected
- **WHEN** the systemd user service starts with an empty watch-path list
- **THEN** the engine remains active, publishes a fresh zero-word closed-gate
  state, and records that it is waiting for a watch path
- **AND** it does not exit unsuccessfully or enter a restart loop

#### Scenario: A watch path is added to an idle engine
- **WHEN** a user adds a watch path while the engine is already running with
  incomplete configuration
- **THEN** the engine reloads the configuration and seeds existing files before
  normal counting resumes
- **AND** the service is not restarted and pre-existing document words do not
  inflate today's count

#### Scenario: No writing application is selected
- **WHEN** the engine has watch paths but an empty writing-app list
- **THEN** it remains active with a closed gate and reports the missing writing
  application without scanning document contents
