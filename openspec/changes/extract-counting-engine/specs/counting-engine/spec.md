## ADDED Requirements

### Requirement: The engine runs outside the desktop shell process
All word counting, focus tracking, subprocess execution and state writing SHALL happen in a process separate from `quickshell`. No part of the counting engine may execute inside the shell.

#### Scenario: An engine fault cannot take down the desktop
- **WHEN** the engine crashes, hangs, or is killed
- **THEN** the desktop shell continues running normally and only the critter's display stops updating

#### Scenario: The engine runs without a desktop at all
- **WHEN** the engine is started from a plain terminal with no bar widget installed
- **THEN** it tracks focus, counts words, and writes state normally

### Requirement: The engine is observable from a terminal
The engine SHALL provide a foreground mode that logs each decision it makes — focus changes, gate transitions, probe results, counts committed — and a `status` subcommand that prints the current count, goal, stage, mood and watched paths without requiring a running shell.

#### Scenario: Watching it work
- **WHEN** the user runs the engine in the foreground and types in a configured writing app
- **THEN** the log shows the focus change, the probe result, and the words added, in order

#### Scenario: Inspecting without the desktop
- **WHEN** the user runs the `status` subcommand
- **THEN** today's count, the goal, and the resolved watch paths are printed to stdout

#### Scenario: A misconfiguration explains itself
- **WHEN** no watch path is configured, or the focused application is not in the whitelist
- **THEN** the status output states which condition is preventing counting

### Requirement: Counting is gated on a configured application having focus
The engine SHALL count only while a whitelisted application is focused, or was focused within the configured grace window. When the gate is closed it MUST NOT spawn subprocesses.

#### Scenario: Gate closed spawns nothing
- **WHEN** a non-whitelisted application is focused and the grace window has elapsed
- **THEN** no `find` or `wc` process is spawned for as long as that remains true

#### Scenario: Autosave after focus loss is still counted
- **WHEN** a watched file changes within the grace window after a whitelisted app lost focus
- **THEN** the change is counted

### Requirement: Application matching tolerates reverse-DNS identifiers
A whitelist entry SHALL match a window identifier when it equals it outright or equals the segment after its final dot, case-insensitively. An entry containing a dot MUST match exactly. Substrings MUST NOT match.

#### Scenario: A short name matches a reverse-DNS identifier
- **WHEN** the whitelist contains `obsidian` and the focused window reports `md.obsidian.Obsidian`
- **THEN** the application matches and counting is enabled

#### Scenario: A substring does not match
- **WHEN** the whitelist contains `write` and the focused window reports `omawrite`
- **THEN** the application does not match

### Requirement: The counting loop probes before reading
Each cycle SHALL first list files modified within the lookback window using a metadata-only scan, then read and re-count only the files that scan returns. A cycle returning no changed files MUST NOT read any file contents.

#### Scenario: Idle cycle reads nothing
- **WHEN** a cycle runs and no watched file has changed
- **THEN** no file contents are read

#### Scenario: Cost does not scale with collection size
- **WHEN** one file changes in a directory holding 2000 documents
- **THEN** exactly one file is read and re-counted

### Requirement: The modification scan does not depend on an external tool
The engine SHALL determine which files changed in-process, comparing each candidate's modification time against an absolute cutoff. It MUST NOT shell out to `find` or any equivalent, because implementations differ in ways that fail silently: the previous version passed a relative timestamp that GNU findutils accepts and `bfs` rejects outright, so on an Omarchy machine the scan errored on every cycle and counted nothing.

#### Scenario: No external tool is involved in the scan
- **WHEN** a counting cycle runs
- **THEN** no subprocess is spawned for the modification scan, on any system

#### Scenario: An unreadable path is reported, never silent
- **WHEN** a watched path cannot be walked or a file cannot be read
- **THEN** the engine logs the failure rather than treating it as "nothing changed"

### Requirement: Totals are re-derived, and progress never decreases
The engine SHALL store per watched file a day-start baseline and a high-water mark of words added, and derive today's total by summing those marks. Recounting an unchanged file MUST NOT change the total, and deleting text MUST NOT reduce it.

#### Scenario: First sight of a file contributes nothing
- **WHEN** a watch path containing existing documents is configured
- **THEN** today's total is unchanged and each file's count is recorded as a baseline

#### Scenario: Re-reading is idempotent
- **WHEN** the same unchanged file is counted on consecutive cycles
- **THEN** today's total is identical after each

#### Scenario: Cutting text holds the total
- **WHEN** the user writes 800 words and then deletes 300
- **THEN** today's total remains 800

### Requirement: Totals reset daily and roll into history
At local midnight the engine SHALL append the finished day to a capped history, zero the day's total, and carry per-file baselines forward. The check MUST survive suspend and resume.

#### Scenario: Rollover after suspend
- **WHEN** the machine resumes on a later date
- **THEN** the previous day is archived, today starts at zero, and no historical words are re-counted

### Requirement: The engine owns configuration
Goal, watch paths, whitelist, grace window and cadence SHALL live in an engine-owned config file that can be read and edited with no shell running. The engine SHALL expose subcommands to add and remove watch paths and whitelist entries.

#### Scenario: Configuring with the shell stopped
- **WHEN** the user adds a watch path via the engine's subcommand while no desktop shell is running
- **THEN** the path is persisted and used on the next cycle

#### Scenario: Invalid configuration is reported
- **WHEN** the config file is malformed
- **THEN** the engine exits with a clear message naming the file and the problem, and does not write over it
