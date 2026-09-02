# Writing Critter — Omarchy Topbar Plugin Specification

**Version:** 0.4 (draft for implementation)
**Target platform:** Omarchy (Quickshell/QML shell plugins, Hyprland compositor)
**Verified against:** Quickshell 0.3.1, Hyprland 0.56.2, `omarchy-shell` at `/usr/share/omarchy/shell`
**Plugin id:** `io.github.<AUTHOR>.writing-critter` (replace `<AUTHOR>`)
**License:** MIT
**Distribution:** Public GitHub repo → Omarchy plugin marketplace submission

> **Changes in 0.4:** emoji removed from the bar entirely — the bar now renders a fixed-width
> ASCII face using the same `{eyes}` mood substitution as the panel art (§3.5.4, §3.7.3).
> This **deletes** the `barStrategy` concept and the `showMiniBar` setting, which existed only
> to work around emoji's missing snail ladder. Corrects the 0.2 claim that Omarchy's shell
> font may be proportional — it is the fontconfig `monospace` alias by default (§3.6.2).
>
> **Changes in 0.3:** activation model settled — always-on, woken by focusing a configured
> app, with no manual session (§1.1, §3.2.3); mascot sets generalised into a declared
> interface and **two sets ship in v1** — `bird` (default) and `snail` (§3.7); per-set art
> grids replace the single fixed grid; the two remaining product questions in §10 are closed.
>
> **Changes in 0.2:** polling architecture replaced with a benchmarked probe-then-recount
> loop on a 2 s cadence (§3.2); focus tracking simplified from raw Hyprland socket parsing
> to `ToplevelManager` (§3.1); bar and panel presentation fully specified with measured
> size constraints and a normative mascot art grid (§3.5, §3.6, §3.7); several §10 open
> questions resolved against the live shell.

---

## 1. Product summary

Writing Critter is a topbar (bar-widget) plugin that shows a small animal mascot which "grows" as the user approaches a daily writing word goal. Words are counted **only** from configured writing applications (Omawrite, Obsidian, Typora, LibreOffice Writer, etc.).

Word counting is done by **watching document files on disk and diffing word counts** — never by capturing keyboard input. This is a hard requirement for marketplace safety (see §9).

Optionally, per-app **companion plugins** (called *sources*) running inside the editors themselves can report exact real-time counts through a simple local file protocol, giving keystroke-level responsiveness without any input capture.

### 1.1 Activation model — always on, woken by focus

**There is no session to start or stop.** The critter tracks *today*, continuously, and it
wakes when the user focuses a configured writing app:

```
  focus a configured app  ──▶  critter wakes, poll loop runs, words count
  focus anything else     ──▶  critter sleeps, poll loop stops, nothing counts
  (grace window keeps counting for graceMs after focus leaves, for late autosaves)
```

Clicking the bar widget opens the Panel — it does **not** start or stop counting. The only
manual override is *Pause counting today* in the right-click menu (§3.5.5).

Consequences that the rest of this spec depends on:

- The whitelist (§3.1) is doing double duty: it decides both *what counts* and *when the
  plugin is awake*. Getting it wrong is the most likely user-visible failure, so the Panel's
  "detect current app" button (§3.6.3) is a v1 requirement, not a nicety.
- The `sleeping` mood (§3.7.1) is not decoration — it is the honest, visible signal that the
  plugin is idle and costing nothing. Users should be able to tell at a glance that focusing
  their editor is what turns it on.
- Daily totals are the unit of progress; a "session" number is deliberately not modelled.

### Why file watching is sufficient

The usual objection to file watching is latency — you see nothing until the user saves. That is a **modal-editor problem**, and this plugin explicitly scopes to GUI writing apps, which autosave on idle (typically ~2 s after the user stops typing).

```
  terminal editors:  type ───────────── :w ──▶ file changes   (minutes of nothing)
  GUI writing apps:  type ─▶ pause ─▶ autosave ──▶ file changes   (~2 s)
```

With autosave in the loop, file watching *is* the liveness signal, and the plugin needs no privileges at all. See §9 for why the alternative (evdev keystroke counting) is rejected outright.

### Non-goals
- No keyboard/input device access of any kind (`/dev/input`, evdev, libinput, interception-tools are forbidden).
- No network access. 100% local.
- No storage of any written text content. Only integers (counts), timestamps, and file paths chosen by the user.
- No elevated privileges, no sudo, no polkit rules, no extra daemons outside `omarchy-shell` (except optional companions that live inside their host editors).
- No terminal/modal editor support in v1 (nvim, helix, emacs). They defeat the autosave assumption above. Revisit only if a companion protocol source appears.

---

## 2. Architecture overview

```
┌──────────────────────── omarchy-shell (Quickshell) ─────────────────────────┐
│                                                                             │
│  ┌───────────────┐      ┌───────────────────────────┐    ┌───────────────┐  │
│  │ BarWidget.qml │◄────►│ Service.qml (singleton)   │◄──►│ Panel.qml     │  │
│  │ glyph + n/goal│state │  - FocusTracker           │    │ art, stats,   │  │
│  └───────────────┘      │  - ProbePoll source (2 s) │    │ config        │  │
│                         │  - Companion source reader│    └───────────────┘  │
│                         │  - Aggregator + persister │                       │
│                         └────┬─────────────────┬────┘                       │
└──────────────────────────────│─────────────────│───────────────────────────-┘
                               │                 │
        Quickshell.Wayland     │                 │  probe + count
        ToplevelManager        │                 ▼
            .activeToplevel    │      find -newermt  →  wc -w
                  .appId       │           (user-configured watch dirs)
                               ▼
                       ~/.local/state/omarchy/<id>/
                         ├── state.json      (persisted totals, settings)
                         └── sources/        (companion drop-box)
                               ├── obsidian.json
                               └── libreoffice.json
```

Three QML entry points inside one plugin repo:

| Kind | File | Responsibility |
|---|---|---|
| `service` | `Service.qml` | Headless singleton: focus tracking, probe polling, companion reading, aggregation, persistence, daily reset |
| `bar-widget` | `BarWidget.qml` | Mascot glyph + progress text; click opens Panel |
| (internal) | `Panel.qml` | Mascot art, stats, config UI; loaded via `Loader` from BarWidget, **not** listed in `entryPoints` |

Helper JS: `Model.js` (pure functions: word counting, diffing, daily reset, stage/mood selection, art assembly). Keep all logic that can be pure in `Model.js` so it is unit-testable outside the shell.

**Reference implementation to copy structure from:** `io.github.rookepoole.focus-forge` (a working third-party bar-widget + panel plugin). Its `BarWidget.qml` shows the required `open()/close()/toggle()/closeForPopoutSwitch()` forwarding, the `Loader`-based panel, and the `injectPanel()` pattern for wiring `bar`, `anchorItem`, and `hostWidget`.

---

## 3. Component specs

### 3.1 FocusTracker (inside Service.qml)

Purpose: know whether a **whitelisted writing app** currently has focus, so word deltas can be attributed to a writing session, and so the poll loop can idle when nothing is being written.

**Mechanism: `ToplevelManager` from `Quickshell.Wayland`.** This is what Omarchy's own `plugins/bar/widgets/ActiveWindow.qml` uses:

```qml
import Quickshell.Wayland
readonly property var toplevel: ToplevelManager.activeToplevel
readonly property string activeApp: toplevel ? (toplevel.appId || "") : ""
```

This replaces the v0.1 plan of parsing `$XDG_RUNTIME_DIR/hypr/$HYPRLAND_INSTANCE_SIGNATURE/.socket2.sock` and polling `hyprctl activewindow -j` as a fallback. Rationale:

- No socket lifecycle, no line parsing, no `EVENT>>DATA` format coupling.
- No `hyprctl` subprocess on a timer — removes an entire class of spawn cost and removes `hyprctl` from the external-command allowlist (§9.7).
- Compositor-agnostic; it is Wayland-level, not Hyprland-level.
- It is the sanctioned first-party pattern, so it will track shell changes.

Expose:
- `property string activeApp` — the Wayland `appId` (equivalent to window class; e.g. `omawrite`, `obsidian`).
- `property bool writingAppFocused` — `activeApp` matches whitelist, case-insensitive.
- `property real lastWritingFocusAt` — epoch ms of last time a whitelisted app was focused.

**Default whitelist:** `["omawrite", "obsidian", "Typora", "soffice", "libreoffice-writer"]`.

`omawrite` is first deliberately: Omarchy ships its own markdown writer (`/usr/bin/omawrite`, `StartupWMClass=omawrite`, "Dead-simple Markdown writing app"). Having it in the default whitelist means the plugin does something useful on a **stock Omarchy install with zero configuration** — which is worth a paragraph in the README.

Document that users can discover their own app ids with `hyprctl clients` (as a *manual user step*, not a runtime dependency).

**Grace window:** a delta is attributable if a whitelisted app is focused **now or was focused within the last `graceMs` (default 15000 ms)** — autosaves often fire right after focus leaves.

### 3.2 ProbePoll source (universal baseline)

Purpose: count words from documents the user is writing, with zero app cooperation, at a cost that does not scale with vault size.

#### 3.2.1 The loop

```
  every 2 s, only while the poll gate is open (§3.2.3):

    find <watchDirs> -name '*.md' ... -newermt '-3 seconds'
        │
        ├── nothing returned ──▶ done.  ~2-3 ms, zero file reads.  (common case)
        │
        └── paths returned ────▶ wc -w on ONLY those paths
                                  update lastKnownCounts[path]
                                  re-sum the map → new total
```

Maintain `lastKnownCounts: { path -> wordCount }`. The daily total is derived by **re-summing the map**, never by accumulating deltas into a running counter.

#### 3.2.2 Why probe-then-recount, and why 2 s

Measured on this hardware (SSD, warm page cache), synthetic vaults of `.md` notes:

| | 300 notes / 210k words / 2.4 MB | 2000 notes / 1.8M words / 16 MB |
|---|---|---|
| full recount (`find` + `wc -w` on everything) | 8–9 ms | **38–40 ms** |
| mtime probe only (`find -newermt`) | 2–3 ms | **2–3 ms** |
| probe + recount of one changed file | — | **3 ms** |

Full recount cost is proportional to *what the user owns*; probe cost is proportional to *what the user just wrote*, and is flat. At 2000 notes a naive full recount reads 16 MB from disk every 2 seconds, forever, inside the **shared long-lived `omarchy-shell` process**. That is the version that generates "this plugin thrashes my disk" issues after release.

Real-world worst case to design for: vaults on spinning disks behind cloud-sync folders (e.g. `/mnt/HDD/OneDrive/Obsidian`). Full recount there keeps the disk spinning and churns against the sync client. Probe-first largely sidesteps it, since directory metadata stays cached and only edited files are read.

**2 s is a floor, not an arbitrary choice.** End-to-end latency is dominated by the editor's own autosave debounce:

```
  user stops typing
      ├─ ~2 s ──▶ editor autosave fires        ← not ours to control
      └─ 0–2 s ─▶ our poll notices             ← ours
                    ≈ 3 s perceived, either way
```

Polling faster than the editor writes buys nothing, because the file does not change more often than that. Sub-second polling would be 4× the wakeups for zero visible improvement. **Do not make the interval shorter than 2000 ms**; expose it as `pollMs` (default `2000`, minimum enforced `1000`, maximum `30000`) only so power users can slow it down.

**Lookback window must exceed the interval.** Probe with a 3 s window on a 2 s poll. Without the overlap, a file saved exactly on a tick boundary is missed permanently. The overlap means a file can be recounted on two consecutive ticks — which is harmless precisely because §3.2.1 stores absolute per-file counts and re-sums, rather than accumulating deltas. Expose as `probeLookbackMs` (default `3000`); assert `probeLookbackMs > pollMs` at load and clamp if violated.

#### 3.2.3 The poll gate — this *is* the activation model

Per §1.1 there is no session object. The poll gate is the entire activation mechanism, and
it is a pure function of focus. Run the timer only when **all** hold:

1. Counting is not paused for today (§3.5.5 right-click menu).
2. A whitelisted writing app is focused, **or** was focused within `graceMs` (§3.1).
3. At least one watch entry is configured.

Otherwise `Timer.running = false` — the critter dozes and the plugin costs literally zero.
Gate transitions come free from the `writingAppFocused` binding; no start/stop state to
persist, nothing to get stuck in, nothing to recover after a shell restart.

The gate must drive the `sleeping` mood (§3.7.1) from the *same* binding, so the critter's
appearance can never disagree with whether the plugin is actually counting. Do not compute
mood independently.

#### 3.2.4 Counting rules

1. Read changed files' text **in memory only** (never persist it).
2. `wordCount = countWords(text)` — Unicode-aware split on whitespace; counting CJK characters as words is acceptable for v1 (note it in the README).
3. **First sight of a file records a baseline and contributes 0.** A newly configured vault must never dump its entire historical word count into today's total. This is the single most important correctness rule in the plugin.
4. A delta counts toward today only if FocusTracker says it is attributable (§3.1) **and** the path is not claimed by an active companion (§3.3).
5. **Negative deltas do not subtract** from the daily total; just update `lastKnownCounts[path]`. Deleting a paragraph must not erase the morning's progress. Config flag `netMode: "additive" | "net"`, default `additive`.
6. Deleted/renamed watched files: drop from `lastKnownCounts` without touching the daily total.

**Implementation note.** Quickshell's `Process` does not use a shell, so wrap as `["sh", "-c", "..."]` or invoke `find`/`wc` with explicit args. Prefer `-print0` / `xargs -0` so paths with spaces survive. Cap the number of paths recounted in a single tick (default 200) to bound a pathological tick after e.g. a `git checkout` inside a watch dir.

**Binary formats (odt/docx)** are **out of scope for v1**. In the Panel, hint that LibreOffice users should write plaintext/markdown or install the LibreOffice companion (§4.3). Do not shell out to converters in v1.

### 3.3 Companion source reader (the "internal plugins" channel)

Purpose: let per-app companion plugins report exact, real-time counts. This is a **generic, app-agnostic protocol** on the Omarchy side; companions are per-app (§4).

- Drop-box directory: `<statePath>/sources/`. The service watches this directory; each `*.json` file is one source. Schema (v1):

```json
{
  "protocol": 1,
  "sourceId": "obsidian",
  "app": "obsidian",
  "date": "2026-09-01",
  "wordsAddedToday": 342,
  "updatedAt": "2026-09-01T10:42:13+02:00",
  "claimsPaths": ["/home/user/Vaults/Main"]
}
```

- Semantics:
  - `wordsAddedToday` is an **absolute daily total from that source** (not a delta). The service takes `max(previousReported, wordsAddedToday)` per source per day. The day's grand total = probe-poll contribution + Σ companion contributions. Absolute-total semantics make the protocol crash-safe and idempotent (re-reads never double-count).
  - `date` must equal today's local date; otherwise ignore the file (stale from yesterday).
  - Staleness: if `updatedAt` is older than `staleAfterMs` (default 10 min), keep counting its reported total but mark the source "inactive" in the Panel.
  - `claimsPaths` (optional): while the source is active (fresh `updatedAt`), the probe-poll source must **skip deltas** for any watched file under a claimed path. This is the double-counting guard. When the source goes stale, probe-poll resumes for those paths using current file counts as new baselines.
  - Companions do their own daily reset (they write `wordsAddedToday: 0` with the new date). Service also resets at midnight regardless (§3.4).
  - Writes must be atomic: companions write to `sourceId.json.tmp` then rename. Service tolerates malformed/partial JSON by ignoring the read and retrying on next change.
  - Trust model: the drop-box is user-writable local state; treat contents as untrusted input — validate types/ranges (e.g. `0 ≤ wordsAddedToday ≤ 1_000_000`), never execute anything from it, never render its strings as rich text.

### 3.4 Aggregator + persistence (inside Service.qml)

State file: `<statePath>/state.json` via `FileView` + `JsonAdapter` (`onAdapterUpdated: writeAdapter()`, `atomicWrites: true`). **Confirmed available** in the shipped Quickshell 0.3.1 (`adapter`, `writeAdapter`, `atomicWrites`, `watchChanges` all present in `quickshell-io.qmltypes`).

```json
{
  "schema": 1,
  "date": "2026-09-01",
  "goal": 1000,
  "wordsToday": 415,
  "byOrigin": { "probepoll": 73, "obsidian": 342 },
  "lastKnownCounts": { "/path/file.md": 1201 },
  "history": [ { "date": "2026-08-31", "words": 980, "goal": 1000 } ],
  "settings": {
    "whitelist": ["omawrite", "obsidian", "Typora", "soffice"],
    "watch": [ { "path": "~/Documents/Vault", "recursive": true, "extensions": [".md"] } ],
    "pollMs": 2000,
    "probeLookbackMs": 3000,
    "graceMs": 15000,
    "netMode": "additive",
    "mascot": "bird",
    "showNumbers": true,
    "idleNudge": true
  }
}
```

- **Config precedence.** Omarchy's `Ui/BarWidget.qml` base class provides `settings` (the widget's inline `shell.json` layout entry) and a `setting(name, fallback)` helper. Any key present in the `shell.json` entry **overrides** the same key in `state.json.settings`, so declarative users can pin config in `shell.json` and GUI users can edit in the Panel. Panel edits always write to `state.json`; the Panel must show a lock badge on any field currently overridden by `shell.json` and explain why it is read-only.
- **Daily reset:** at local midnight (QML `Timer` checking date change every 30 s — robust across suspend/resume), push `{date, words, goal}` to `history` (cap 365 entries), zero `wordsToday` and `byOrigin`, keep `lastKnownCounts` (baselines carry over).
- **Expose to widgets:** `wordsToday`, `goal`, `progress` (0–1), `stage` (0–4), `mood` (§3.7), `celebrating` (bool, true for 10 s after crossing goal), per-source status list for the Panel.

---

### 3.5 BarWidget.qml — the critter in the bar

#### 3.5.1 Hard size constraint

Measured from `Commons/Style.qml`:

```
Style.bar.sizeHorizontal = 26 px      (top/bottom bar)
Style.bar.sizeVertical   = 28 px      (left/right bar)
Style.font.body          = 12 px
```

**A 26 px bar fits exactly one line of text. Multi-line ASCII art is impossible in the bar.** This is the defining constraint of the whole presentation design, and it is why the critter exists at two resolutions:

```
   BAR  (26 px, ONE line)                PANEL (opens on click)
  ┌──────────────────────┐             ┌────────────────────────┐
  │  \(o o)/  412/1000   │  ◀── click  │        ,-""-.          │
  └──────────────────────┘             │       /      \         │
   1-line ASCII face                   │      | o   o  |        │
   + counter                           │       \  __  /         │
                                       │        '-..-'          │
                                       │      412 / 1000        │
                                       └────────────────────────┘
```

Bar = **status**. Panel = **character**. Do not attempt to squeeze art into the bar.

#### 3.5.2 Horizontal bar layout

```
   ┌────────────────────────────────┐
   │   \(o o)/  412/1000            │      showNumbers: true  (default)
   └────────────────────────────────┘
        │        └── Style.font.body, bar.fontFamily, barForeground
        └─────────── ASCII face, fixed width, monospace, vertically centred
```

- Structure: a single `WidgetButton` (from `qs.Ui`) filling the widget, exactly as `focus-forge` does. `implicitWidth: button.implicitWidth`, `implicitHeight: button.implicitHeight`.
- Text: `"<glyph>  <wordsToday>/<goal>"`. Use a figure-space or fixed-width number rendering so the widget does not jitter as digits change; alternatively animate `implicitWidth` with a `NumberAnimation { duration: 180; easing.type: Easing.OutCubic }` as `ActiveWindow.qml` does.
- `showNumbers: false` → face only. Still fully readable, because the face itself encodes the stage (§3.5.4) — this is the recommended mode for crowded bars.
- There is no separate mini-meter setting. The face *is* the meter.

#### 3.5.3 Vertical bar layout

The bar can be vertical (`BarWidget.vertical` is provided by the base class; `Style.bar.sizeVertical = 28`). In vertical mode a horizontal `glyph + 412/1000` string does not fit.

- Vertical: render **face only**, always. Ignore `showNumbers`. The face is 9–10 columns wide, which at the 28 px vertical bar width means it must be rotated 90° (`rotation: -90` on the `Text`) or replaced by the set's declared `barFrameCompact` — a 3-column fallback (e.g. `(o o)` → `o o`). Prefer rotation; it keeps one source of art.
- Put the full `wordsToday / goal` in the tooltip.
- Mirror how `ActiveWindow.qml` handles this — it simply sets `visible: title !== "" && !vertical`. Hiding the counter (not the widget) is the analogous move here.

#### 3.5.4 The bar face

**No emoji.** The bar renders a small fixed-width ASCII face, driven by the *same* `{eyes}`
substitution as the panel art (§3.7.3) — one mechanic, two resolutions. Stage is carried by
the form around the eyes; mood is carried by the eyes themselves.

Why ASCII beats emoji here, for a plugin shipped to strangers:

- **Emoji is a font dependency the plugin cannot verify.** It renders only if a colour emoji
  font is installed *and* the bar font's fallback chain reaches it. When it does not, the user
  gets a tofu box in their topbar and the plugin has no way to detect that.
- **Emoji have no stable advance width**, so the widget's width jumps between stages.
- **Omarchy's shell font is already the fontconfig `monospace` alias** (`Commons/Style.qml:269`,
  resolving to e.g. JetBrainsMono Nerd Font), so fixed-width ASCII columns hold by default.
- It **deletes a concept**: see below.

> **This removes `barStrategy` and `showMiniBar` from the design.** In 0.3, `barStrategy`
> existed *only* because Unicode has an emoji growth ladder for birds (🥚🐣🐤🐦🦅) and none
> for snails, which forced the snail into a "fixed glyph + mandatory meter" special case. With
> ASCII every set simply draws its own five forms, and the snail's trail is its own progress
> read. One less flag, one less branch in `BarWidget.qml`, one less setting to document.

**Bird** — 9 columns; the creature progressively opens up:

```
  |  (o o)  |   stage 0 · egg        bare, contained
  | ,(o o), |   stage 1 · cracking   shell fragments
  | <(o o)> |   stage 2 · chick      stubby wings
  | \(o o)/ |   stage 3 · fledgling  wings out
  |~\(o o)/~|   stage 4 · soaring    in flight
```

**Snail** — 10 columns; generated by rule, `pad = 4 - stage`, `trail = "~" × stage`:

```
  |    (@)o o|   stage 0 · setting out   trail 0
  |   ~(@)o o|   stage 1                 trail 1
  |  ~~(@)o o|   stage 2 · halfway       trail 2
  | ~~~(@)o o|   stage 3                 trail 3
  |~~~~(@)o o|   stage 4 · arrived       trail 4
```

**Mood** occupies the eye slot plus one trailing FX column, so the cell width is constant at
`barCols + 1` in every state:

| Mood | Eyes | FX | Trigger |
|---|---|---|---|
| `writing` | `o o` | *(space)* | words counted within last 60 s |
| `idle` | `- -` | *(space)* | writing app focused, no words for 60 s+ |
| `sleeping` | `- -` | `z` | no writing app focused, or counting paused |
| `celebrating` | `^ ^` | `!` | 10 s after crossing the goal |

All four, for the bird at stage 3 — note the constant 10-column cell:

```
  | \(o o)/  |   writing      eyes 'o o', fx ' '
  | \(- -)/  |   idle         eyes '- -', fx ' '
  | \(- -)/ z|   sleeping     eyes '- -', fx 'z'
  | \(^ ^)/ !|   celebrating  eyes '^ ^', fx '!'
```

- **Eyes closed (`- -`) is the whole idle/sleep signal.** It is quiet, it needs no font support,
  and it reads instantly at 12 px. The `z` distinguishes "asleep because you're not writing"
  from "awake but paused mid-thought".
- **Celebration:** `SequentialAnimation` on the face's `scale` (1.0 → 1.25 → 1.0, ~250 ms,
  3 repeats), capped at 10 s total. No sound. No notification by default — offer `notifyOnGoal`
  (default **off**) which uses `Quickshell.execDetached(["notify-send", ...])` as `focus-forge` does.
- **Idle nudge** (`idleNudge`, default on) controls only the `z`; eyes still close either way.
  This is the only "nag" in the plugin and it must stay silent and disableable.
- **Theming:** colours come from `qs.Commons` — `Color.accent`, and `bar.barForeground` /
  `bar.fontFamily` off the injected `bar` object. **No hardcoded colours anywhere.**
- The face `Text` must pin `font.family: "monospace"` explicitly rather than inheriting
  `bar.fontFamily` — see §3.6.2 for why the default is safe but not guaranteed.

#### 3.5.5 Interactions

- **Left-click:** toggle `Panel.qml` via the `Loader` + `injectPanel()` pattern; forward `open()/close()/toggle()/closeForPopoutSwitch()` and expose `opened` and `popoutSwitchClosing`, exactly as `focus-forge/BarWidget.qml` does. Escape closes via `PanelKeyCatcher`; Tab routes to the neighbouring panel via `bar.switchPanelFrom`.
- **Right-click:** quick menu — *Pause counting today* / *Reset today* / *Open config*.
- **Hover tooltip:** `wordsToday / goal`, percentage, per-origin breakdown, active source list. In vertical mode this is the only place the numbers appear.

---

### 3.6 Panel.qml — the critter up close

This is where the ASCII art lives and where the plugin earns its personality. Structure mirrors `focus-forge/Panel.qml`: a `Panel` root with `manageIpc: false`, containing a `KeyboardPanel` anchored to the bar button, containing a `PanelKeyCatcher`, containing a `Column`.

Sizing: `contentWidth: panel.fittedContentWidth(Style.space(300))`, `contentHeight: panel.fittedContentHeight(content.implicitHeight)`.

#### 3.6.1 Layout

```
┌──────────────────────────────────────┐
│           WRITING CRITTER            │  Style.font.subtitle, bold, centred
│                                      │
│              ,-""-.                  │
│             /      \                 │  ← mascot art (§3.7)
│            | o   o  |                │    MONOSPACE, centred, Color.accent
│             \  __  /                 │    5 lines × 11 cols, fixed grid
│              '-..-'                  │
│                                      │
│             412 / 1000               │  Style.font.displayLarge, accent
│                                      │
│   ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱   41%         │  progress meter, full width
│                                      │
│   "The shell is thinning."           │  status line, 0.72 opacity, italic
│                                      │
│  ── today ─────────────────────────  │  PanelSectionHeader
│   file watch              73         │
│   obsidian               342  ● live │  ● = active companion
│                                      │
│  ── streak ────────────────────────  │
│   ▪▪▪▪▪▫▪   6 of last 7 days         │  goal-met history sparkline
│                                      │
│  [ Pause ]  [ Reset ]  [ Config ]    │  Row of PanelActionButtons
└──────────────────────────────────────┘
```

#### 3.6.2 Mandatory implementation details

- **The art `Text` element MUST pin `font.family: "monospace"` explicitly.** Omarchy's `Style.fontFamily` already *defaults* to the fontconfig `monospace` alias (`Commons/Style.qml:269` — "defaults to `monospace` so the bar and every `qs.Ui` component follows the fontconfig alias `omarchy-font-set` writes"), resolving to e.g. JetBrainsMono Nerd Font. So in the common case ASCII art aligns for free. It is pinned anyway because that alias is **user-redirectable** via `omarchy font set`: a user who points it at a proportional family would silently shred every frame in both the bar and the panel. Pinning costs nothing and removes the failure mode. Everything else in the panel inherits the theme font normally.
- Set `textFormat: Text.PlainText`, `horizontalAlignment: Text.AlignHCenter`, and a fixed `lineHeight` so vertical rhythm is stable across stages.
- The art element must reserve a **constant height** (5 lines) regardless of stage, so the panel does not resize when the critter grows mid-session.
- **Status line** is derived from `(stage, mood)` — a small phrase table in `Model.js`, e.g. stage 0 writing → *"Something is stirring."*; stage 2 idle → *"It is waiting for you."*; stage 4 → *"Goal met. It soars."* Keep them short, warm, and never guilt-tripping.
- Progress meter, **only when the active set declares `meterMode: "widget"`** (§3.7.2): a themed `Rectangle` pair (track + fill) is preferable to block characters here — the panel is not size-constrained the way the bar is. Use `Color.accent` for fill and a low-alpha `barForeground` for the track, as `focus-forge` does for its secondary buttons.
- When the set declares `meterMode: "art"` (the `snail` set, §3.7.6), **omit the meter row entirely** — the art already encodes progress and a second meter is redundant clutter. Keep the `412 / 1000` numeric line in both modes; it is the precise read that the art deliberately is not. The panel must not change height between the two modes, so reserve the meter row's vertical space regardless.
- `onActivateRequested` (Enter) on the `PanelKeyCatcher` maps to **Pause/Resume counting**.

#### 3.6.3 Config sub-view

Reached via **Config** button; replaces the panel body (do not open a second window).

1. **Goal** — integer input (`NumberField` from `qs.Ui`), presets 250 / 500 / 1000 / 2000.
2. **Writing apps** — editable list of app ids; "detect current app" button reads `FocusTracker.activeApp`; helper text pointing at `hyprctl clients`.
3. **Watched paths** — add/remove `{ path, recursive, extensions }`; show current watched-file count.
4. **Sources** — read-only list of companions: status (live/inactive/stale), today's contribution, claimed paths.
5. **Critter** — mascot set picker (v1 ships `bird` (default) and `snail`; see §3.7.5–§3.7.6), `showNumbers`, `idleNudge`, `notifyOnGoal`. The picker previews **both** the set's bar face and its stage-2 panel frame live, so the choice is visual at the resolution the user will actually see it.
6. **Data** — Reset today, Clear history, show state file path, show effective `pollMs`.

Fields overridden by `shell.json` (§3.4) render disabled with a lock badge.

---

### 3.7 Mascot art system

#### 3.7.1 The two axes

The critter reads on two independent axes, which is what makes it feel alive rather than like a progress bar with eyes:

```
   STAGE  ── progress toward the daily goal (the long arc, monotonic per day)
      0 egg      1 cracking     2 chick      3 fledgling    4 soaring
      0–24%      25–49%         50–74%       75–99%         ≥100%

   MOOD   ── recent activity (the short arc, flips many times a day)
      writing        idle            sleeping        celebrating
      words <60s     no words 60s+   app unfocused   10s after goal
```

`stage` never regresses within a day (it tracks `wordsToday`, which is additive by default). `mood` flips freely. This means the critter can be a *sleeping fledgling* — correct and charming. Per §3.2.3, `sleeping` must be bound to the same expression as the poll gate, so the critter can never look awake while the plugin is idle.

#### 3.7.2 Mascot set interface

**v1 ships two sets:** `bird` (default) and `snail`. The user picks in the Panel (§3.6.3) or pins `"mascot": "snail"` in `shell.json`. A set is pure data in `Model.js` — adding a third means adding a table entry, never touching QML:

```js
{
  id:        "bird",
  label:     "Bird",
  meterMode: "widget",          // "widget" | "art"   (§3.6.1)
  barCols:   9,                 // bar face width, constant across stages
  barFrames: [ /* 5 strings, each barCols wide, containing {eyes} */ ],
  rows: 5, cols: 11,            // panel art grid
  frames:    [ /* 5 strings, each rows×cols, containing {eyes} */ ]
}
```

A set therefore declares **two** resolutions of the same creature: a one-line `barFrames` entry per stage (§3.5.4) and a multi-line `frames` entry per stage (§3.7.5–§3.7.6). Both use the same `{eyes}` placeholder, so mood is one substitution rule across the whole plugin.

Sets declare their own grids because creatures need different room: the bird grows *in place* (9 bar cols, 11 panel cols), the snail *travels* (10 bar cols, 24 panel cols).

#### 3.7.3 Art assembly

Do **not** author 5 stages × 4 moods = 20 drawings per set. Author **one base frame per stage** with an `{eyes}` placeholder, and let mood substitute:

```js
// panel art: a 5-column eye slot;  bar face: a 3-column eye slot
const EYES_WIDE   = { writing:"o   o", idle:"-   -", sleeping:"-   -", celebrating:"^   ^" }
const EYES_NARROW = { writing:"o o",   idle:"- -",   sleeping:"- -",   celebrating:"^ ^"   }
const FX          = { writing:" ",     idle:" ",     sleeping:"z",     celebrating:"!"     }

panelArt = SET.frames[stage].replace("{eyes}", EYES_WIDE[mood])
barFace  = SET.barFrames[stage].replace("{eyes}", EYES_NARROW[mood]) + FX[mood]
```

`{eyes}` is exactly **5 columns** in panel frames and exactly **3 columns** in bar frames, in every set, so substitution can never change a frame's width. Ten short strings per set (five bar, five panel), one placeholder, and the whole stage × mood matrix falls out at both resolutions.

#### 3.7.4 Normative grid invariant

> **Invariant:** within a set, every assembled **panel** frame is exactly `rows` lines of exactly `cols` columns (with `{eyes}` occupying 5 columns), and every assembled **bar** face is exactly one line of exactly `barCols + 1` columns including the FX slot (with `{eyes}` occupying 3 columns). Both are space-padded and ASCII-only.

- **ASCII-only, no box-drawing or Unicode bullets in the art.** `•` and `─` render at inconsistent widths across the arbitrary monospace fonts a released plugin will meet. `o`, `-`, `^`, `~`, `\`, `/`, `_`, `'`, `.`, `(`, `)`, `,` are safe everywhere. (Emoji appear only in the *bar*, never in panel art.)
- A `node --test` case MUST assert, **for every set × stage × mood**, that the assembled panel art is `rows` lines of `cols` columns **and** that the assembled bar face is exactly `barCols + 1` columns. This turns alignment from an eyeballing problem into a CI gate — essential, because misaligned art is the single most visible way this plugin can look broken, and it now has to hold for two sets instead of one.

#### 3.7.5 Set: `bird` (v1 default)

Growth in place: egg → cracking → chick → fledgling → soaring. Panel grid **5 × 11**, bar width **9**, `meterMode: "widget"`. Bar faces are in §3.5.4. Panel frames shown with `writing` eyes; other moods substitute per §3.7.3.

```
   stage 0 · egg        stage 1 · cracking     stage 2 · chick
     ,-""-.                  \/\/                   .---.
    /      \               .-'  '-.                ( o   o )
   | o   o  |             | o   o  |                \  v  /
    \  __  /               \  \/  /                  _/ \_
     '-..-'                 '-..-'                   ^   ^

   stage 3 · fledgling   stage 4 · soaring
     \ .---. /             \\       //
      ( o   o )             \( o   o )/
       \  v  /            ---\   v   /---
       _/ \_                  ^^^^^
       ^   ^
```

#### 3.7.6 Set: `snail` (v1 alternate)

The snail does not grow — it **travels**. Progress is distance crossed, and the slime trail it leaves *is* the progress meter, so this set sets `meterMode: "art"` and the Panel suppresses its separate meter bar (§3.6.1). Panel grid **5 × 24**, bar width **10**, and the same travel metaphor drives both resolutions — the bar face grows its trail by one `~` per stage (§3.5.4) while the panel snail crawls the full 24 columns.

Frames are **generated by rule**, not hand-authored — this is the normative definition:

```
  body (9 cols, constant):        offset(stage) = stage * 3   →  0, 3, 6, 9, 12
      "  {eyes}  "                body occupies cols  off+1 .. off+9
      "   \ /   "                 rows 1-3: prefixed with spaces × off
      "  .---.  "                 rows 4-5: prefixed with `~` × (off+1), replacing the
      " ( ,-. )_"                           body leading space, so the slime touches
      " '-----' "                           the shell instead of leaving a 1-col gap
                                  every row right-padded to 24
```

Which yields (pipes mark the 24-column frame; count the tildes against the ruler):

```
  |123456789112345678921234|   <- 24-column frame

  stage 0 · setting out   (offset 0  · no trail)
  |  o   o                 |
  |   \ /                  |
  |  .---.                 |
  | ( ,-. )_               |
  | '-----'                |

  stage 2 · halfway       (offset 6  · trail cols 1-7)
  |        o   o           |
  |         \ /            |
  |        .---.           |
  |~~~~~~~( ,-. )_         |
  |~~~~~~~'-----'          |

  stage 4 · arrived       (offset 12 · trail cols 1-13)
  |              o   o     |
  |               \ /      |
  |              .---.     |
  |~~~~~~~~~~~~~( ,-. )_   |
  |~~~~~~~~~~~~~'-----'    |
```

The snail visibly crawls left-to-right across the panel as the day's words accumulate, laying slime behind it. Because the frames are computed, the CI invariant in §3.7.4 is checking a generator rather than transcription — assert it anyway; an off-by-one in the padding is exactly the bug it exists to catch.

#### 3.7.7 Adding a set later

A third set (`plant` — a sprout that thickens and branches, `meterMode: "widget"`) needs one table entry, five bar faces and five panel frames. No QML changes, no new settings key, one line in the Panel's mascot picker. Keep it that way: any set that requires touching `BarWidget.qml` or `Panel.qml` means the interface in §3.7.2 is wrong and should be extended instead.

---

## 4. Companion plugins (per-app sources)

Companions are separate repos/deliverables, **optional** for users. Each implements the same contract: compute words-added-today inside its host app and atomically write the §3.3 JSON to the drop-box. Priority order:

### 4.1 Obsidian companion — build first (v1.1)
- TypeScript Obsidian community plugin (standard `esbuild` template).
- Hook `this.app.workspace.on("editor-change", ...)`; compute per-edit word deltas (compare word counts of the changed range, or debounce full-doc counts at 1 s).
- Maintain `wordsAddedToday` (additive, floor negative edits at 0 to match service default), reset on date change.
- Write drop-box JSON (atomic tmp+rename) debounced at ≤1 write / 2 s — matching the service poll cadence (§3.2.2) means no wasted writes.
- Settings tab: drop-box path (default to the documented Omarchy state path), vault `claimsPaths` (default: vault root).
- Prior art to study (patterns only, no code copying): `lukeleppan/better-word-count`, `dhruvik7/obsidian-daily-stats`.

### 4.2 Typora — do not build
No official plugin API; only an unofficial fragile loader. Typora users are fully covered by the probe-poll baseline (Typora autosaves markdown). Document this.

### 4.3 LibreOffice companion — later (v1.2, optional)
- Python-UNO extension (`.oxt`) hooking document-modified events; word count via UNO document statistics; same drop-box protocol with `sourceId: "libreoffice"`.
- This is the clean answer to binary odt/docx counting, which probe-poll v1 skips.

### 4.4 Generic contract doc
Ship `docs/COMPANION_PROTOCOL.md`: schema, atomic-write rule, daily-reset rule, `claimsPaths` semantics, staleness, drop-box location. Anyone can add an editor without touching the Omarchy plugin.

---

## 5. Repository layout

The repo root **is** the plugin — `omarchy plugin add <git-url>` installs it directly, so `manifest.json` and the QML entry points must sit at top level.

```
io.github.<AUTHOR>.writing-critter/
├── manifest.json
├── BarWidget.qml
├── Panel.qml
├── Service.qml
├── Model.js
├── docs/
│   └── COMPANION_PROTOCOL.md
├── tests/
│   └── model.test.mjs        # node --test; includes the §3.7.3 art-grid invariant
├── README.md                 # security disclosure section is mandatory, see §9
├── LICENSE
└── preview.png
```

### manifest.json (v1)

```json
{
  "schemaVersion": 1,
  "id": "io.github.<AUTHOR>.writing-critter",
  "name": "Writing Critter",
  "version": "1.0.0",
  "author": "<AUTHOR>",
  "license": "MIT",
  "description": "A bar critter that grows as you hit your daily writing goal — counts words only from your configured writing apps, by watching files. No keyboard access, no network.",
  "kinds": ["bar-widget", "service"],
  "entryPoints": { "barWidget": "BarWidget.qml", "service": "Service.qml" },
  "barWidget": {
    "displayName": "Writing Critter",
    "description": "Grows as you write toward your daily word goal.",
    "category": "Productivity",
    "allowMultiple": false,
    "defaultSection": "right"
  }
}
```

Example user config in `~/.config/omarchy/shell.json` (§3.4 precedence applies):

```json
{ "id": "io.github.<AUTHOR>.writing-critter", "goal": 750, "mascot": "snail", "showNumbers": false }
```

Notes for implementer: `schemaVersion`, `id`, `name`, `version`, `kinds`, `entryPoints` are mandatory; `Panel.qml` is **not** an entry point (it is `Loader`-ed from the bar widget); the id must not use the reserved `omarchy.*` namespace; **no symlinks anywhere in the repo**; if scaffolding via `omarchy plugin clone omarchy.clock --edit`, remove the injected `omarchy.clonedFrom` field before publishing.

---

## 6. Implementation plan (milestones)

**M1 — Skeleton & state.** Scaffold from `focus-forge`'s structure; manifest; Service singleton with `JsonAdapter` persistence; BarWidget showing a static `  (o o)   0/1000`; Panel shell with title + static art. Passes `omarchy plugin validate <folder>` and `qmllint -I "$OMARCHY_PATH/shell" *.qml`.

**M2 — Focus tracking.** `ToplevelManager.activeToplevel.appId`, whitelist matching (case-insensitive), grace window, poll gate, "detect current app" in config.

**M3 — ProbePoll source.** 2 s timer, `find -newermt` probe, targeted `wc -w`, `lastKnownCounts` map + re-sum, first-sight baseline rule, additive/net modes, daily reset, history. `Model.js` unit tests land here.

**M4 — Critter presentation.** Mascot set interface (§3.7.2) with **both `bird` and `snail`** shipped, stage × mood matrix, `{eyes}` substitution at **both** resolutions (3-col bar slot, 5-col panel slot), per-set grid CI invariant for bar faces and panel frames, `meterMode` handling (widget vs art), pinned-monospace rendering, panel layout, mascot picker with live preview, celebration animation, tooltip breakdown, right-click quick menu, vertical-bar mode, theme integration.

Build `bird` end-to-end first and only then add `snail`. If adding the second set requires editing anything outside the `Model.js` set table, the interface is wrong — fix the interface rather than special-casing the snail.

**M5 — Companion channel.** Drop-box watcher, schema validation, max-semantics, `claimsPaths` suppression, staleness, Sources section, `COMPANION_PROTOCOL.md`.

**M6 — Release.** README with security disclosure (§9), preview.png, marketplace submission (§8).

**M7 (separate repo) — Obsidian companion** per §4.1.

---

## 7. Testing checklist

**Unit (`node --test` on `Model.js`):**
- word counting: unicode, CJK, punctuation, empty, whitespace-only
- baseline logic: **first sight of a file contributes 0** (regression-critical)
- additive vs net modes; negative deltas never reduce the total
- daily rollover including suspend/resume simulation
- companion `max` semantics and date filtering
- `claimsPaths` overlap suppression
- **art grid invariant:** for **every set × stage × mood**, the assembled frame is `set.rows` lines and every line is exactly `set.cols` columns, ASCII-only (§3.7.4)
- **snail offset generator:** `offset(stage) === stage * 3`; trail length equals the offset; body block is unmodified at every stage
- `probeLookbackMs > pollMs` clamping

**Integration (manual, on a real Omarchy session):**
- typing in Omawrite / Obsidian / Typora increments the bar within ~3 s
- typing in a browser or terminal never increments
- alt-tabbing away stops the timer (verify with `top` that no `find` spawns while unfocused)
- 2000-note vault: confirm steady-state tick cost stays flat (no full recount)
- renaming / deleting / `git checkout` inside a watch dir does not crash or dump counts
- malformed companion JSON is ignored
- midnight rollover; shell restart restores state
- vertical bar mode renders the rotated face for both sets without overflow or clipping
- bar widget width does not change between stages or moods within a set (the constant-width claim in §3.5.4)
- with `omarchy font set` pointed at a **proportional** family, bar face and panel art still align (proves the pinning in §3.6.2)
- art stays aligned under a non-monospace theme font (proves §3.6.2)
- switching mascot set at runtime does not resize the panel or drop state
- `snail` set: panel shows no separate meter row, and panel height matches the `bird` set

**Regression guard (CI):** grep check that the repo never contains `evdev`, `/dev/input`, `libinput`, `keylog`, `XGrabKey`, or network calls (`XMLHttpRequest`, `fetch(`, `NetworkAccessManager`, `curl`, `wget`).

---

## 8. Marketplace submission

1. Public GitHub repo with `manifest.json`, `README.md`, `LICENSE` at root.
2. `omarchy plugin validate` and `qmllint` clean.
3. Submit via the marketplace issue form (`submit-plugin.yml`); category **Productivity**; tags e.g. `Bar`, `Productivity`, `Quickshell`.
4. Expect the automated checks (`validated` label). Nothing in this design should trigger `security-review-required`; if maintainers ask, the README disclosure (§9) is the evidence.
5. After listing, request verification so the listing pins the reviewed commit SHA.

---

## 9. Security requirements (hard constraints — do not relax)

Omarchy plugins run **unsandboxed inside the long-lived shell process with full user permissions**. Everything here follows from that.

**Why keystroke counting is rejected, in full.** On Wayland the compositor deliberately denies clients global input; the only user-space route is raw evdev on `/dev/input`. On a stock Omarchy machine those nodes are `root:input 0660` and the `input` group is *empty*, so reaching them requires `sudo usermod -aG input $USER` plus a re-login. That grant is **not scoped to this plugin** — it gives every process the user ever runs permanent keylogging capability over every application, including passwords and terminal input. Asking strangers to make that change to install a writing mascot is indefensible, and would rightly draw a `security-review-required` label. Because v1 scopes to GUI writing apps that autosave (§1), keystroke capture buys only sub-3-second latency that the editor's own autosave debounce already dominates. There is no version of this plugin that justifies the cost.

1. **No input capture.** Never open `/dev/input*`, never use evdev/libinput/interception-tools, never request `input` group membership, never suggest it in docs.
2. **No network.** No HTTP of any kind, including "check for updates".
3. **No privilege escalation.** No sudo, pkexec, polkit rules, systemd units, or extra processes; never spawn a second Quickshell instance.
4. **No content storage.** File text is read into memory transiently for counting and discarded. State files contain only integers, dates, settings, and user-chosen paths. Logs must never include document text.
5. **Untrusted-input handling.** Drop-box JSON is validated (types, ranges, date) and never executed or `eval`ed; watched file content is never `eval`ed or rendered as rich text.
6. **README disclosure section** (mandatory): what it reads (user-configured document paths + its own state dir), what it never does (keyboard, network, privileges, content storage), and where state lives. Frame as "100% local — no network access, no sudo, no input devices."
7. **External commands allowlist:** `find`, `wc`, and a single startup `mkdir -p` to create the plugin's own state directory (an atomic write cannot create its own parent), invoked with explicit args (or wrapped in `sh -c` since Quickshell `Process` has no shell), plus `notify-send` **only** when the user has opted into `notifyOnGoal`. `hyprctl` is no longer needed at runtime (§3.1). Anything else requires a spec revision.

---

## 10. Open questions

**Resolved in 0.2** (verified against the live install):
- ~~`JsonAdapter`-on-`FileView` availability~~ → present in Quickshell 0.3.1 (`adapter`, `writeAdapter`, `atomicWrites`, `watchChanges`).
- ~~`FolderListModel` / directory-watch primitive~~ → moot; the probe-poll design (§3.2) needs neither, and it removes the v0.1 500-file watch cap entirely.
- ~~Sanctioned theme singleton for third-party plugins~~ → `import qs.Commons` (`Color`, `Style`) and `import qs.Ui` (`BarWidget`, `Panel`, `KeyboardPanel`, `PanelKeyCatcher`, `WidgetButton`, `NumberField`, …), confirmed in use by the third-party `focus-forge` plugin.
- ~~Focus tracking mechanism~~ → `ToplevelManager.activeToplevel` from `Quickshell.Wayland` (§3.1).

**Still open:**
- Exact resolution of the per-plugin state path on this Omarchy version — confirm whether `Quickshell.statePath()` resolves under `~/.local/state/omarchy/<id>/`, and document the literal result in the README so companion authors can target the drop-box. (Omarchy's own bar uses `$HOME/.local/state/omarchy/...` directly.)
- Whether the marketplace manifest schema has additional required fields beyond those observed in shipped plugins — validate against https://plugins.omarchy.org/develop.html at build time.
_(none blocking; both former product questions are now closed — see below.)_

**Closed in 0.3:**
- ~~Session vs. always-on~~ → **always-on, woken by focusing a configured app** (§1.1). No session object, no start/stop state; the poll gate is the activation model (§3.2.3), and clicking the widget only opens the Panel.
- ~~`bird` vs. `snail`~~ → **ship both**, `bird` as default (§3.7.5, §3.7.6). Mascot sets are now a declared data interface (§3.7.2) rather than a hardcoded choice, so the decision cost is one table entry per creature.
