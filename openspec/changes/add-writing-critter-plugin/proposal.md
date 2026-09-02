## Why

Omarchy ships its own markdown writer (`omawrite`) but nothing that makes daily writing progress visible while you work. Writers who want a word-count goal must either trust their memory or alt-tab to a separate tool, which breaks the writing session it is meant to support.

A topbar critter that quietly counts today's words — and visibly reacts to whether you are writing — puts that feedback where it costs nothing to read. It has to earn its place by being honest about privacy: the obvious implementation (global keystroke capture) requires keylogger-grade permissions that no one should grant for a mascot, so the whole design is built to avoid needing them.

## What Changes

- **New Omarchy shell plugin** `io.github.acero-ad.writing-critter`, distributed as a public git repo installable via `omarchy plugin add`, with `bar-widget` and `service` entry points.
- **Word counting by file observation, not input capture.** A 2 s probe-then-recount loop (`find -newermt` → `wc -w` on changed files only) reads word counts from user-configured document directories. Cost is flat with respect to vault size.
- **Focus-gated activation.** There is no session to start or stop. Focusing a whitelisted writing app wakes the plugin; focusing anything else stops the poll loop entirely. `omawrite` ships in the default whitelist so the plugin works on a stock Omarchy install with zero configuration.
- **A critter at two resolutions.** A fixed-width ASCII face in the 26 px topbar (stage in the form, mood in the eyes), and multi-line ASCII art in the click-to-open panel. Two mascot sets ship: `bird` (default, grows in place) and `snail` (travels, its slime trail *is* the progress meter).
- **Daily goal, totals, and streak history**, persisted to `~/.local/state/omarchy/<id>/state.json`, resetting at local midnight.
- **An optional companion-source protocol** — a documented JSON drop-box that per-app plugins (Obsidian first, LibreOffice later) can write exact real-time counts into, with double-counting guards. Companions are separate deliverables, out of scope for v1 of this change.
- **Hard privacy constraints as testable requirements**, not documentation: no `/dev/input`, no evdev, no network, no privilege escalation, no storage of document text, enforced by a CI grep guard.

## Capabilities

### New Capabilities

- `word-tracking`: Counting words from user-configured document paths — the probe-then-recount poll loop, its cadence and gating, per-file baselines, delta attribution, additive vs net modes, daily reset, and persistence of totals and history.
- `critter-display`: How the critter is presented — the fixed-width ASCII bar face, the panel art, stage (progress) and mood (activity) axes, the mascot-set data interface with `bird` and `snail`, theming, and the grid invariants that keep art aligned.
- `plugin-configuration`: The settings surface and its precedence — `shell.json` inline widget settings overriding `state.json`, defaults that work unconfigured, the in-panel config UI, and app-whitelist discovery.
- `companion-sources`: The optional drop-box protocol for external per-app word sources — schema, absolute-total semantics, atomic writes, staleness, `claimsPaths` suppression, and untrusted-input validation.

### Modified Capabilities

_(none — this is a greenfield project with no existing specs.)_

## Impact

- **New repository**, public on GitHub, whose root *is* the plugin: `manifest.json`, `BarWidget.qml`, `Panel.qml`, `Service.qml`, `Model.js`, `tests/`, `README.md`, `LICENSE`, `preview.png`. No symlinks anywhere (marketplace requirement).
- **Runtime dependencies: none.** External commands limited to `find` and `wc`, plus `notify-send` only when the user opts into goal notifications. No `hyprctl` at runtime — focus comes from `ToplevelManager` in `Quickshell.Wayland`.
- **Host APIs consumed:** Quickshell 0.3.1 (`FileView` + `JsonAdapter` + `atomicWrites`, `Process`, `ToplevelManager`) and Omarchy shell modules `qs.Commons` (`Color`, `Style`) and `qs.Ui` (`BarWidget`, `Panel`, `KeyboardPanel`, `PanelKeyCatcher`, `WidgetButton`, `NumberField`).
- **User-visible state:** a new directory `~/.local/state/omarchy/io.github.acero-ad.writing-critter/`. Users may add an entry to `~/.config/omarchy/shell.json`'s bar layout; the plugin never writes that file.
- **Distribution:** public GitHub repo → Omarchy plugin marketplace submission under Productivity. Design is intended to pass automated checks without a security review flag.
- **Reference material:** `writing-critter-spec.md` at repo root (v0.4) is the detailed technical specification this change implements; `io.github.rookepoole.focus-forge` is the structural template for the QML.
