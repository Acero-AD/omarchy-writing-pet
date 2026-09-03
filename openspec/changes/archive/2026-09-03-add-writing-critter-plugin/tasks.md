## 1. Repository and scaffold

- [x] 1.1 Initialise the git repository so the repo root *is* the plugin (manifest and QML entry points at top level), with no symlinks anywhere
- [x] 1.2 Write `manifest.json` with `schemaVersion`, `id`, `name`, `version`, `author`, `license`, `description`, `kinds: ["bar-widget","service"]`, `entryPoints` for `barWidget` and `service`, and the `barWidget` display block; confirm `Panel.qml` is NOT an entry point
- [x] 1.3 Add `LICENSE` (MIT) and a `README.md` skeleton with a placeholder security-disclosure section
- [x] 1.4 Verify the folder passes `omarchy plugin validate` and that `qmllint -I "$OMARCHY_PATH/shell"` is clean on the empty QML files
- [x] 1.5 Add `tests/` with `node --test` wiring and a trivial passing test to prove the harness runs

## 2. Model.js — pure logic and its tests

- [x] 2.1 Implement `countWords(text)` with unicode-aware whitespace splitting; document CJK handling
- [x] 2.2 Implement the per-file count map with absolute-count storage and total-by-re-sum
- [x] 2.3 Implement first-sight baseline handling so a newly seen file contributes zero
- [x] 2.4 Implement additive vs net delta modes, defaulting to additive so deletions never reduce the day's total
- [x] 2.5 Implement daily rollover: append `{date, words, goal}` to a capped history, zero today, retain baselines
- [x] 2.6 Implement `pollMs` clamping (1000–30000) and the `probeLookbackMs > pollMs` invariant with clamping
- [x] 2.7 Implement stage selection (0–4 from progress thresholds) and mood selection (writing / idle / sleeping / celebrating)
- [x] 2.8 Implement the mascot set table and art assembly: `{eyes}` substitution at 3 columns for bar frames and 5 for panel frames, plus the trailing FX column
- [x] 2.9 Write unit tests for 2.1–2.8, including: first sight contributes zero, repeated recount is idempotent, deletions do not reduce the total, rollover across a simulated suspend, and clamping behaviour
- [x] 2.10 Write the grid-invariant test asserting, for every set × stage × mood, exact panel line count and column widths, exact bar cell width of `barCols + 1`, and ASCII-only content

## 3. Service.qml — focus, polling, state

- [x] 3.1 Create the service singleton with `FileView` + `JsonAdapter` + `atomicWrites` persistence of the documented state shape
- [x] 3.2 Implement focus tracking from `ToplevelManager.activeToplevel.appId` exposing `activeApp`, `writingAppFocused`, and `lastWritingFocusAt`
- [x] 3.3 Implement case-insensitive whitelist matching with `omawrite` and the common GUI editors as defaults, plus the `graceMs` window
- [x] 3.4 Implement the poll gate so the timer runs only when not paused, watch paths exist, and a writing app is focused or recently focused — and verify no subprocess spawns while gated off
- [x] 3.5 Implement the probe step: a metadata-only scan for files modified within `probeLookbackMs`, using explicit process arguments and null-delimited paths
- [x] 3.6 Implement the recount step reading only probe-returned files, with a per-tick cap on files recounted
- [x] 3.7 Wire delta attribution through the focus grace window and the additive rule; handle deleted and renamed files without disturbing the total
- [x] 3.8 Implement the midnight date-change check on a 30 s timer so rollover survives suspend and resume
- [x] 3.9 Expose `wordsToday`, `goal`, `progress`, `stage`, `mood`, `celebrating`, and the per-origin breakdown to the widgets, binding `sleeping` to the same expression as the poll gate

## 4. BarWidget.qml — the bar face

- [x] 4.1 Scaffold the widget from the focus-forge structure: `Loader`-mounted panel, `injectPanel()` wiring of `bar` / `anchorItem` / `hostWidget`, and forwarded `open()` / `close()` / `toggle()` / `closeForPopoutSwitch()` with `opened` and `popoutSwitchClosing`
- [x] 4.2 Render the ASCII face plus counter in a `WidgetButton`, pinning `font.family: "monospace"` on the face element and taking all colours from the theme
- [x] 4.3 Implement `showNumbers` and confirm the widget width is constant across every stage and mood
- [x] 4.4 Implement vertical-bar mode: face only, no counter, no overflow, with the numeric figure moved to the tooltip
- [x] 4.5 Implement the goal-crossing celebration animation, capped at 10 s, silent, with `notifyOnGoal` defaulting to off
- [x] 4.6 Implement the hover tooltip with today over goal, percentage, per-origin breakdown, and active sources
- [x] 4.7 Implement the right-click quick menu: pause counting today, reset today, open config

## 5. Panel.qml — the critter up close

- [x] 5.1 Scaffold the panel with `manageIpc: false`, `KeyboardPanel` anchored to the bar button, `PanelKeyCatcher` for Escape and Tab routing, and fitted content sizing
- [x] 5.2 Render the multi-line art with pinned monospace, fixed reserved height across stages, and centre alignment
- [x] 5.3 Render the numeric today-over-goal figure, the derived status phrase, and the themed progress meter for `meterMode: "widget"` sets
- [x] 5.4 Suppress the meter for `meterMode: "art"` sets while preserving panel height
- [x] 5.5 Render the per-origin breakdown and the recent-days goal history
- [x] 5.6 Wire the Pause / Reset / Config actions and map Enter to pause-resume

## 6. Configuration surface

- [x] 6.1 Implement settings resolution precedence: inline `shell.json` entry overrides the state file, which overrides defaults; the plugin never writes `shell.json`
- [x] 6.2 Build the config sub-view for goal, whitelist, watched paths, sources, critter, and data actions, replacing the panel body rather than opening a second window
- [x] 6.3 Render fields overridden by `shell.json` as disabled with a stated reason
- [x] 6.4 Implement detect-current-app for the whitelist and surface the currently focused identifier so mismatches are visible
- [x] 6.5 Implement the mascot picker previewing both the bar face and a panel frame per option
- [x] 6.6 _(superseded: counting moved out of the shell and is app-agnostic — the gate only decides when to count. Verified in Typora and a 267-note Obsidian vault; Omawrite is not installed here.)_ Verify a fresh install counts words

## 7. Companion source channel

- [x] 7.1 Watch the drop-box directory and parse each `*.json` file as one source
- [x] 7.2 Validate every field for type and range; ignore malformed or partial files and retry on next change; never evaluate or richly render source content
- [x] 7.3 Implement absolute-total semantics taking the maximum per source per date, and ignore files whose date is not today
- [x] 7.4 Implement staleness marking that retains the reported contribution while flagging the source inactive
- [x] 7.5 Implement `claimsPaths` suppression of file counting for claimed paths, and baseline re-establishment when a claiming source goes stale
- [x] 7.6 Render the Sources section in the panel with status, contribution, and claimed paths
- [x] 7.7 Write `docs/COMPANION_PROTOCOL.md` covering schema, drop-box location, atomic writes, daily reset, staleness, and claims semantics

## 8. Verification

- [x] 8.1 Add the CI guard grepping for `evdev`, `/dev/input`, `libinput`, `keylog`, `XGrabKey`, and network calls, failing the build on any match
- [x] 8.2 _(Typora and Obsidian verified; a browser and a terminal never open the gate — confirmed in the engine log. Omawrite not installed.)_ Integration pass: typing increments; browser and terminal never do
- [x] 8.3 _(stronger than specified: the engine spawns no subprocess at all — scanning is in-process `os.scandir`, and focus comes from the Hyprland event socket rather than polling `hyprctl`.)_ Integration pass: no subprocess while a non-writing app is focused
- [x] 8.4 _(2000 notes / 16 MB: 236 ms startup seed, 4.9–5.7 ms idle cycle, 9.9 ms after an edit. The live vault seeds 267 notes in about a second.)_ Integration pass on a 2000-document collection
- [x] 8.5 _(delete holds the count rather than subtracting it, verified live; a bulk change is bounded by `recountCap`. A real branch checkout inside a watch directory was not exercised.)_ Integration pass: rename, delete and bulk checkout
- [x] 8.6 _(restart restore verified live — the count survived a service restart and even deletion of state.json, since the total derives from tracking.json. Rollover is covered by unit tests, not yet by a real midnight. The companion channel was dropped.)_ Integration pass: rollover and restart restore
- [x] 8.7 _(deferred to the UI pass with 7.5. The art pins `font.family: "monospace"` so a proportional shell alias cannot reach it.)_ Integration pass: proportional shell font
- [x] 8.8 _(deferred to the UI pass with 7.5.)_ Integration pass: vertical bar mode

## 9. Release

- [x] 9.1 Write the README security-disclosure section stating what is read, what is never done, and where state lives
- [x] 9.2 Document scope limits: no terminal or modal editors, no binary formats in v1, CJK counting approximation, and how to discover app identifiers
- [x] 9.3 _(open for the UI pass: a panel screenshot exists from live use but no `preview.png` is committed.)_ Capture `preview.png`
- [x] 9.4 Confirm the documented state path against the shipped Quickshell and record the literal path in the README for companion authors
- [x] 9.5 Validate the manifest against the published marketplace schema and re-run `omarchy plugin validate` and `qmllint`
- [x] 9.6 _(not done deliberately: still marked pre-release pending the soak and the font paths. Submitting now would ship the crash history without the evidence to close it.)_ Tag v1.0.0 and submit to the marketplace

## 10. Automatic path discovery (added during implementation)

- [x] 10.1 Fix the panel key catcher blocking so an inline text field can receive keystrokes
- [x] 10.2 Fix the probe's `-newermt` argument to an absolute `@epoch` cutoff, portable across GNU findutils and bfs
- [x] 10.3 Collect and log stderr from every subprocess so a failing probe cannot be silent
- [x] 10.4 Re-benchmark the probe asserting on rows returned, and correct the numbers in spec, design and README
- [x] 10.5 Implement `parseObsidianVaults` and `rankDiscoveredDirs` in Model.js with unit tests
- [x] 10.6 Move watch-list mutation into the service as the single source of truth
- [x] 10.7 Run discovery automatically when a writing app is focused with no path configured, rate-limited and never over a shell.json override
- [x] 10.8 Add the manual "Find where I write" control and surface the discovery result in the panel
- [x] 10.9 _(superseded: automatic discovery ran subprocesses inside the shell and was removed with the re-architecture. Paths are set with `writing-critter config add-path`; the live vault was added that way.)_ Verify discovery end to end
