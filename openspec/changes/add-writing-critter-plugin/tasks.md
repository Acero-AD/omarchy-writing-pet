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
- [ ] 6.6 Verify a fresh install with no configuration counts words written in Omawrite

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
- [ ] 8.2 Integration pass: typing in Omawrite, Obsidian and Typora increments within ~3 s; typing in a browser or terminal never increments
- [ ] 8.3 Integration pass: confirm no subprocess spawns while a non-writing app is focused
- [ ] 8.4 Integration pass on a 2000-document collection confirming steady-state tick cost stays flat
- [ ] 8.5 Integration pass: rename, delete, and a bulk checkout inside a watch directory neither crash nor dump counts into the total
- [ ] 8.6 Integration pass: midnight rollover, shell restart state restore, and malformed companion JSON
- [ ] 8.7 Integration pass: point the shell font alias at a proportional family and confirm bar and panel art stay aligned
- [ ] 8.8 Integration pass: vertical bar mode for both mascot sets

## 9. Release

- [ ] 9.1 Write the README security-disclosure section stating what is read, what is never done, and where state lives
- [ ] 9.2 Document scope limits: no terminal or modal editors, no binary formats in v1, CJK counting approximation, and how to discover app identifiers
- [ ] 9.3 Capture `preview.png` and resolve whether it shows the bar face, the panel, or both
- [ ] 9.4 Confirm the documented state path against the shipped Quickshell and record the literal path in the README for companion authors
- [ ] 9.5 Validate the manifest against the published marketplace schema and re-run `omarchy plugin validate` and `qmllint`
- [ ] 9.6 Tag v1.0.0, submit to the marketplace under Productivity, and request verification
