## MODIFIED Requirements

### Requirement: Installation is disclosed and explicitly confirmed
The panel SHALL show a review step before installation, presented as a modal
confirmation over the panel rather than as inline content beside the settings.
The review MUST name the resolved engine destination and user-unit destination,
state that the service will be enabled and started, and state that setup uses no
administrator access and no network connection. No installation effect SHALL
occur until the user confirms that disclosure. The modal MUST be dismissible
from the keyboard, and dismissing it MUST NOT close the panel in the same
keystroke.

#### Scenario: User reviews and cancels setup
- **WHEN** the user opens the installation review and selects cancel
- **THEN** no file is copied, no unit is enabled, and no process other than the read-only status probe is invoked

#### Scenario: User confirms setup
- **WHEN** the user selects install and start after reviewing the disclosure
- **THEN** the bundled engine performs the disclosed user-owned file and service operations

#### Scenario: User dismisses the review with the keyboard
- **WHEN** the review is open and the user presses Escape
- **THEN** the review closes with no effect and the panel remains open

#### Scenario: Review is presented over the panel
- **WHEN** the review is open
- **THEN** the settings beneath it are not operable until the user answers it

## ADDED Requirements

### Requirement: Every lifecycle action states its outcome
When an install, update, start, restart or uninstall finishes, the panel SHALL
state what happened in terms of the action the user requested, and SHALL keep
that statement visible until the user dismisses it or another action replaces
it. A success MUST be stated as explicitly as a failure. A read-only status
probe MUST NOT produce an outcome statement, and MUST NOT clear one.

#### Scenario: Setup succeeds
- **WHEN** an installation completes and the engine becomes ready
- **THEN** the panel states that the engine is installed and running, and continues to say so until the user dismisses it

#### Scenario: Removal succeeds
- **WHEN** the user removes the engine
- **THEN** the panel states what was removed and that the settings, count and history were kept

#### Scenario: A later probe does not erase the statement
- **WHEN** the panel refreshes service status after an action has been reported
- **THEN** the statement remains until the user dismisses it or another action replaces it

#### Scenario: User dismisses the statement
- **WHEN** the user dismisses the outcome
- **THEN** the panel returns to showing only what the current service state requires

### Requirement: An action's outcome outlives the panel that started it
The outcome SHALL be held where it is shared by every panel rather than in any
one of them, so that closing and reopening the panel, or opening a panel on
another screen, reports the same result. Dismissing the outcome on one panel
SHALL dismiss it everywhere.

#### Scenario: Panel is closed during an action
- **WHEN** the user starts an installation, closes the panel, and reopens it
- **THEN** the panel reports the result of that installation rather than nothing

#### Scenario: Panels on two screens
- **WHEN** an action completes while panels are open on more than one screen
- **THEN** both report the same outcome, and dismissing it on either clears it on both
