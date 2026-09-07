## MODIFIED Requirements

### Requirement: The panel displays the engine's configuration, not its own
Displayed settings SHALL be read back from the engine's own files. The panel
MUST NOT show an optimistic value that the engine has not accepted. A control
the user has edited MUST return to displaying the stored configuration once the
engine has answered, whether it accepted the value or refused it, so an edited
control cannot become a place where a value lives that the engine never took.

#### Scenario: A change made elsewhere
- **WHEN** the configuration is changed from a terminal while the panel is open
- **THEN** the panel reflects the new value without user interaction

#### Scenario: A rejected change
- **WHEN** a configuration command fails
- **THEN** the panel continues to display the configuration as it actually is, and reports that the change did not apply

#### Scenario: A refused value left in an edited control
- **WHEN** the user types a value the engine refuses, and the engine reports the failure
- **THEN** the control returns to showing the configured value rather than continuing to display the refused one

## ADDED Requirements

### Requirement: Arguments are constrained before they are sent
Each argument the panel sends SHALL be constrained at its source. A path MUST
come from a directory the user selected in the picker, an application id MUST
come from one the engine itself published, and a mascot name MUST come from the
known set. A numeric setting MAY be typed, and when it is, the control MUST
restrict it to the range the engine already enforces, so that a value the engine
would refuse cannot ordinarily be sent. The panel MUST NOT relax a bound the
engine enforces, and MUST NOT impose a policy bound of its own where the engine
has none; a limit inherent to the control's own numeric type is not such a
bound.

#### Scenario: Non-numeric arguments
- **WHEN** the panel's path, application and mascot controls are exercised in every combination
- **THEN** every argument sent originates from a value the panel was given, never from keyboard entry

#### Scenario: A typed number outside the engine's range
- **WHEN** the user tries to enter a value the engine's validation would reject
- **THEN** the control does not offer it, and no command carrying it is issued

#### Scenario: The panel does not narrow the engine
- **WHEN** the user enters a value the engine accepts but an earlier control could not express
- **THEN** the command is issued and the value is stored unchanged

### Requirement: A control that receives keystrokes blocks the panel's key catcher
The panel SHALL block its key catcher for as long as a control that receives
keystrokes holds focus, and SHALL restore it when that focus is released. The
catcher takes keys before its descendants, so an unblocked catcher swallows
every keystroke and the control can never receive one. Dismissing the
panel MUST remain reachable from inside such a control: the dismiss key SHALL
first release the control's focus, and dismiss the panel when pressed again.

#### Scenario: Typing into a focused field
- **WHEN** a control that accepts keystrokes has focus and the user types
- **THEN** the characters reach the control, and the catcher's own bindings do not fire

#### Scenario: Leaving a focused field
- **WHEN** the control loses focus
- **THEN** the catcher resumes handling keys as it does when no control is focused

#### Scenario: Dismissing from inside a field
- **WHEN** the user presses the dismiss key while a control that accepts keystrokes has focus
- **THEN** the control loses focus and the panel stays open, and a second press closes the panel

### Requirement: A value control commits once, when the interaction ends
A control whose value passes through intermediate states SHALL commit only when
the interaction ends, and MUST NOT send the states it passed through. What ends
the interaction depends on the control: for a dragged control it is release, for
a typed field it is acceptance or loss of focus, and for a stepper held down it
is the value the stepper settles on.

#### Scenario: Typing a goal
- **WHEN** the user types a new goal and accepts it
- **THEN** exactly one configuration command is issued, carrying the accepted value, and none was issued for the partial numbers typed along the way

#### Scenario: Holding a stepper
- **WHEN** the user holds a stepper so that it repeats across many values
- **THEN** the engine is not invoked once per repeat, and the value that is stored is the one the control settles on

## REMOVED Requirements

### Requirement: Every committed value is chosen from a presented set
**Reason**: The rule forbade text input outright, and its second scenario
asserted that the key catcher needs no blocking because nothing needs
keystrokes. Both stop being true when the goal becomes typable. The rule was
also stricter than the problem it protected against: the hazard was the panel
inventing or validating configuration semantics, not the keyboard. Its intent
survives in "Arguments are constrained before they are sent", which keeps every
non-numeric argument set-derived, and the key-catcher concern is promoted from a
scenario to its own requirement because it is now load-bearing rather than
vacuous.
**Migration**: Paths, application ids and mascot names are unaffected and are
still chosen, never typed. The goal is typed into a field bounded by the
engine's own rule. Any panel adding a control that takes keystrokes must satisfy
"A control that receives keystrokes blocks the panel's key catcher".

### Requirement: A continuous control commits once, on release
**Reason**: Written around the goal slider, which is being removed. The slider
stepped by 50 and stopped at 3000, so it could neither represent nor preserve a
goal the engine accepts, and touching it silently rewrote one.
**Migration**: Replaced by "A value control commits once, when the interaction
ends", which keeps the commit-once rule and states what ends an interaction for
each kind of control rather than assuming a drag.
