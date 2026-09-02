## ADDED Requirements

### Requirement: Words are counted by observing files, never by capturing input
The plugin SHALL derive all word counts from the contents of user-configured document files. It MUST NOT open `/dev/input*`, use evdev, libinput or interception-tools, request `input` group membership, or suggest such a grant in its documentation or UI. It MUST NOT make network requests, escalate privileges, or spawn a second shell process.

#### Scenario: Repository contains no input-capture or network code
- **WHEN** the CI guard greps the repository for `evdev`, `/dev/input`, `libinput`, `keylog`, `XGrabKey`, `XMLHttpRequest`, `fetch(`, `NetworkAccessManager`, `curl`, or `wget`
- **THEN** no matches are found and the check passes

#### Scenario: Document text is never persisted
- **WHEN** a watched file is read to compute its word count
- **THEN** only the resulting integer is retained, and no file text appears in `state.json` or in any log output

### Requirement: Counting is activated by focusing a configured writing app
The plugin SHALL have no user-startable session. The poll loop MUST run only when all of the following hold: counting is not paused for the day, at least one watch entry is configured, and a whitelisted writing app is currently focused or was focused within `graceMs`. Otherwise the poll timer MUST be stopped.

#### Scenario: Focusing a writing app starts counting
- **WHEN** the user focuses a window whose `appId` matches the whitelist
- **THEN** the poll timer starts and subsequent word changes count toward today's total

#### Scenario: Focusing a non-writing app stops counting
- **WHEN** the user focuses a window whose `appId` is not in the whitelist and `graceMs` has elapsed
- **THEN** the poll timer stops, no subprocess is spawned, and word changes do not count

#### Scenario: Autosave arriving just after focus loss is still counted
- **WHEN** a watched file changes within `graceMs` after a whitelisted app lost focus
- **THEN** the delta is attributed to today's total

#### Scenario: Clicking the widget does not change counting
- **WHEN** the user left-clicks the bar widget
- **THEN** the panel opens or closes and the counting state is unchanged

### Requirement: The poll loop probes before recounting
Each poll tick SHALL first list files modified within `probeLookbackMs` using a metadata-only scan, and MUST read and re-count only the files that scan returns. A tick that returns no changed files MUST NOT read any file contents.

#### Scenario: Idle tick reads nothing
- **WHEN** a poll tick runs and no watched file has changed
- **THEN** no file contents are read and the total is unchanged

#### Scenario: Cost does not scale with collection size
- **WHEN** one file changes in a directory containing 2000 documents
- **THEN** exactly one file is read and re-counted

#### Scenario: Pathological tick is bounded
- **WHEN** more than the configured maximum number of files change in a single tick
- **THEN** the number of files recounted in that tick is capped at that maximum

### Requirement: Poll cadence is bounded and the lookback exceeds the interval
The poll interval `pollMs` SHALL default to 2000 and MUST be clamped to the range 1000–30000. `probeLookbackMs` SHALL default to 3000 and MUST always be greater than `pollMs`; if configuration violates this, the plugin MUST clamp rather than fail.

#### Scenario: Interval below the floor is clamped
- **WHEN** configuration sets `pollMs` to 250
- **THEN** the effective interval is 1000

#### Scenario: Lookback not exceeding the interval is clamped
- **WHEN** configuration sets `pollMs` to 5000 and `probeLookbackMs` to 3000
- **THEN** `probeLookbackMs` is raised above `pollMs` before the timer starts

#### Scenario: Boundary saves are not missed
- **WHEN** a file is saved at the instant of a poll tick
- **THEN** the overlapping lookback window includes it on the following tick and it is counted exactly once

### Requirement: Totals are derived by re-summing absolute per-file counts
The plugin SHALL maintain a map of watched path to its last known absolute word count, and derive contributions by re-summing that map. It MUST NOT accumulate deltas into a running counter.

#### Scenario: Recounting the same file twice does not double-count
- **WHEN** a file is returned by two consecutive probe ticks without further edits
- **THEN** the day's total is identical after both ticks

### Requirement: A newly seen file establishes a baseline and contributes zero
The first time the plugin observes a watched file, it SHALL record that file's word count as a baseline and add nothing to the day's total.

#### Scenario: Adding an existing document collection
- **WHEN** the user configures a watch directory containing documents totalling 200000 words
- **THEN** today's total remains unchanged and each file's count is stored as a baseline

#### Scenario: Deleted file does not alter the total
- **WHEN** a watched file is deleted or renamed
- **THEN** its entry is removed from the map and the day's total is unchanged

### Requirement: Deletions do not reduce the day's progress
In the default `additive` mode, a negative per-file delta SHALL update the stored baseline without reducing today's total. A `net` mode MAY be offered as an explicit opt-in.

#### Scenario: Cutting a paragraph
- **WHEN** the user deletes 300 words from a document after having written 800 words today
- **THEN** today's total remains 800 and the file's stored count is updated to its new value

### Requirement: Totals reset daily and roll into history
At local midnight the plugin SHALL append the finished day's `{date, words, goal}` to a capped history list, zero the day's totals, and retain per-file baselines. The date check MUST survive suspend and resume.

#### Scenario: Midnight rollover
- **WHEN** the local date changes
- **THEN** the previous day is appended to history, today's total becomes 0, and baselines are preserved so no historical words are re-counted

#### Scenario: Rollover after suspend
- **WHEN** the machine resumes from suspend on a later date
- **THEN** the rollover occurs within one date-check interval

### Requirement: State survives shell restarts
The plugin SHALL persist date, goal, today's total, per-origin breakdown, baselines, history and settings to its state file using atomic writes, and restore them on startup.

#### Scenario: Shell restart mid-session
- **WHEN** `omarchy-shell` restarts after the user has written 412 words today
- **THEN** the bar shows 412 for today and no words are re-counted from baselines
