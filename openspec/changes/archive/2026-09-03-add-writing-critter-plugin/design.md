## Context

Omarchy shell plugins are QML components loaded into the long-lived, **unsandboxed** `omarchy-shell` process with full user permissions. That single fact drives most of this design: anything the plugin can do, it does with the user's whole identity, and anything it costs, it costs continuously inside a process the user cannot easily restart.

The verified target environment is Quickshell 0.3.1 and Hyprland 0.56.2, with the shell at `/usr/share/omarchy/shell`. Two things there are load-bearing: `FileView` exposes `adapter`, `writeAdapter`, `atomicWrites` and `watchChanges`, so JSON persistence needs no custom code; and `Commons/Style.qml` sets the shell font family to the fontconfig `monospace` alias, so fixed-width ASCII aligns by default.

A working third-party plugin, `io.github.rookepoole.focus-forge`, is installed locally and is structurally almost identical to what this change needs: a bar widget with internal state and a `Loader`-mounted panel. It is the template for the QML wiring rather than a thing to invent.

The full technical specification lives at `writing-critter-spec.md` (v0.4) in the repository root. This document records the decisions behind it; that document carries the detail.

## Goals / Non-Goals

**Goals:**
- Make daily writing progress visible in the topbar without the user leaving their editor.
- Require **zero privileges and zero runtime dependencies**, so installation is a single `omarchy plugin add`.
- Cost approximately nothing when the user is not writing, and stay flat in cost as the user's document collection grows.
- Work correctly on a stock Omarchy install with no configuration.
- Keep all countable logic pure and unit-testable outside the shell.
- Present a critter with enough character that people install it for the critter, not the counter.

**Non-Goals:**
- Terminal and modal editors (nvim, helix, emacs). They defeat the autosave assumption this design rests on.
- Binary document formats (odt, docx) in v1. Covered later by a companion source.
- Building the companion plugins themselves. This change defines and consumes the protocol; the Obsidian and LibreOffice companions are separate deliverables.
- Any form of input capture, network access, or privilege escalation — permanently, not just in v1.

## Decisions

### D1. Count words by observing files, not keystrokes

**Chosen:** poll user-configured document paths and diff word counts.

**Alternative considered:** read raw keyboard events from `/dev/input` via a minimal helper that emits only counters, never keycodes.

The keystroke route was investigated seriously because it gives instant feedback. It was rejected on three grounds. First, cost of entry: on a stock machine those device nodes are `root:input 0660` with an empty `input` group, so the plugin's install instructions would include `sudo usermod -aG input $USER` and a re-login — a grant that is **not scoped to this plugin** and hands every process the user runs permanent keylogging ability. Second, it is self-defeating: counting *words* requires recognising word boundaries, which requires knowing which key was pressed, so "count clicks but not keys" cannot be honoured at the word level without the helper seeing keycodes anyway. Third, and decisively, once the scope narrowed to GUI writing apps, the latency advantage evaporated — those apps autosave on idle, so file observation is already live.

### D2. Probe first, recount only what changed, every 2 seconds

**Chosen:** each tick runs a metadata-only scan for recently modified files, then reads and re-counts only those.

**Alternative considered:** recount the whole watch set each tick; or maintain a `FileView` per file with `watchChanges`.

Measured on synthetic collections, asserting on rows returned rather than elapsed time alone: a full recount costs 8 ms at 300 documents and 38 ms at 2000, because it reads every byte. The metadata probe is flat at 3 ms at both sizes on an idle tick, and 4–5 ms when one file has changed. Full recount also means reading 16 MB from disk every 2 seconds forever inside the shared shell process, which on a spinning disk behind a cloud-sync folder is actively hostile. Per-file `FileView` watchers were the v0.1 plan and were dropped because they force a watch cap and a directory-scanning primitive the shipped Quickshell may not offer; the probe needs neither.

2 seconds is chosen to match editor autosave debounce rather than to race it. End-to-end latency is autosave (~2 s, not ours) plus half the poll interval, so polling faster buys nothing the user can perceive. The interval is floored at 1 s to keep a misconfiguration from turning the widget into a disk load generator.

### D3. Focus tracking via `ToplevelManager`, not the Hyprland socket

**Chosen:** `ToplevelManager.activeToplevel` from `Quickshell.Wayland`.

**Alternative considered:** subscribe to Hyprland's `.socket2.sock` event stream, with `hyprctl activewindow -j` polling as a fallback.

The Wayland route is what Omarchy's own `ActiveWindow.qml` uses, so it tracks shell changes. It removes socket lifecycle handling, event-format coupling, a subprocess on a timer, and `hyprctl` from the external-command allowlist entirely. It is also compositor-agnostic, which matters for a plugin published to users whose setups are not identical to the author's.

### D4. Focus *is* the activation model

**Chosen:** no session object. The poll gate — not paused, has watch paths, writing app focused or recently focused — is the whole activation mechanism.

**Alternative considered:** an explicit start/stop session started by clicking the widget.

A session introduces persistent state that can desynchronise from reality, get stuck across restarts, and require recovery logic. Deriving activation purely from focus means there is nothing to persist and nothing to repair. The consequence is that the app whitelist becomes load-bearing for *both* what counts and when the plugin is awake, which is why whitelist detection in the UI is a requirement rather than a convenience. The `sleeping` mood is bound to the same expression as the gate, so the critter's appearance can never lie about whether the plugin is working.

### D5. ASCII everywhere, no emoji

**Chosen:** a fixed-width ASCII face in the bar and ASCII art in the panel.

**Alternative considered:** an emoji stage ladder in the bar.

Emoji is an unverifiable font dependency: it renders only if a colour emoji font is installed and the fallback chain reaches it, and a missing glyph is a tofu box in the user's topbar that the plugin cannot detect. Emoji also have no stable advance width, so the widget jitters between stages. The decisive point was structural: an emoji ladder exists for birds but not for snails, which had forced a `barStrategy` flag and a "fixed glyph plus mandatory meter" special case into the design. Moving to ASCII deleted that flag and a settings key with it.

### D6. One creature, two resolutions, one substitution rule

**Chosen:** each mascot set declares five one-line bar frames and five multi-line panel frames, each containing a single `{eyes}` placeholder; mood substitutes a 3-column string in the bar and a 5-column string in the panel.

**Alternative considered:** authoring a drawing per stage × mood.

The bar is 26 px, so it holds exactly one line; the panel has room for character. Rather than treat these as two artworks, they are two resolutions of one creature with a shared mood mechanic. Substitution turns 5 stages × 4 moods into 5 drawings per resolution instead of 20, and makes the whole set a data table that new creatures can join without touching QML. Because misaligned ASCII is the most visible way this plugin can look broken, frame geometry is enforced by an automated grid invariant rather than by eye.

### D7. Absolute per-file counts, re-summed; deletions never subtract

**Chosen:** store a path-to-count map and derive totals by re-summing it; negative per-file deltas update the baseline without reducing the day's total.

**Alternative considered:** accumulate deltas into a running counter; or count net words.

Re-summing makes the counter idempotent, which is what allows the probe window to safely overlap the poll interval — a file recounted twice yields the same total, so boundary saves can be caught with an overlap instead of a fragile exact-window scan. The additive rule is a product judgement: a counter that falls when you cut a paragraph teaches you not to edit. Net mode remains available as an explicit opt-in for people who disagree.

The single most dangerous edge is first sight of a file: without an explicit baseline rule, configuring a watch directory would dump its entire historical word count into today. This is called out as a requirement and a regression test rather than left implicit.

### D8. Companion sources report absolute daily totals into a drop-box

**Chosen:** a documented JSON drop-box; each source reports its own words-added-today as an absolute value; the plugin takes the maximum per source per date, and active sources suppress file counting for paths they claim.

**Alternative considered:** sources report deltas; or the plugin exposes an IPC endpoint.

Absolute totals make the protocol crash-safe and idempotent — a re-read, a partial write, or a source restart cannot double-count, which a delta protocol cannot promise. A file drop-box needs no endpoint, no handshake, and no cooperation from the shell's IPC surface, so a companion author can implement it in any language. The claimed-paths mechanism is the double-counting guard where both channels can see the same document.

Drop-box contents are written by other software and are therefore treated as untrusted input: validated for type and range, never evaluated, never rendered as rich text.

### D9. Declarative config overrides stored config

**Chosen:** keys in the widget's inline `shell.json` entry override the plugin's state file; the plugin never writes `shell.json`.

Omarchy's `BarWidget` base already injects per-widget settings from the bar layout, so declarative users get the idiomatic path for free while GUI users get the panel. The precedence direction matters: the file the user hand-edits must win, or their edits appear to be ignored. Fields under a `shell.json` override are shown but locked in the UI, with the reason stated, so the plugin never silently discards an edit.

### D10. All countable logic lives in pure JavaScript

**Chosen:** word counting, delta and baseline handling, daily rollover, stage and mood selection, art assembly, and source validation live in `Model.js` as pure functions, tested with `node --test`.

QML is difficult to test outside a running shell, and the parts of this plugin most likely to be wrong — baselines, rollover, idempotency, frame geometry — are all pure. Keeping them out of QML means the risky logic is covered by fast tests, and the QML layer is reduced to wiring and rendering.

## Risks / Trade-offs

- **Modal editors are unsupported, and the plugin cannot tell the user why.** A vim user configures a watch path, writes for an hour, and sees nothing until `:w` — and normal-mode navigation would not have counted as words anyway. → Scope is stated in the README and the non-goals; revisit only through a companion source.
- **A wrong app identifier fails silently.** The critter simply never wakes, and the user has no signal distinguishing "misconfigured" from "broken". → Ship `omawrite` and the common GUI editors as defaults so the zero-config path works; provide detect-current-app in the UI; show the currently focused identifier in the config view so the mismatch is visible.
- **Slow or synced storage.** Collections on spinning disks or inside cloud-sync folders make file reads expensive and can churn against a sync client. → The probe reads only changed files; directory metadata stays cached; the timer stops entirely when the user is not writing.
- **`find` is not one program.** Omarchy ships **bfs**, which rejects the relative `-newermt` timestamps GNU findutils accepts. The first implementation used a relative form, so the probe errored on every tick and counted nothing — invisibly, because stderr was discarded, and an early benchmark that measured only elapsed time reported it as fast. → Absolute `@<epoch>` cutoffs, understood by both; stderr collected and logged from every subprocess; benchmarks assert on rows returned.
- **The shell font alias is user-redirectable.** `omarchy font set` can point `monospace` at a proportional family and shred every frame. → Art elements pin monospace explicitly; an integration check covers the redirected case.
- **Word counting is approximate for some scripts.** Whitespace splitting treats CJK text unreasonably; v1 counts CJK characters as words. → Documented in the README as a known limitation rather than silently wrong.
- **The plugin runs unsandboxed.** Nothing here is enforced by the platform; the constraints hold only as long as the code honours them. → The privacy constraints are written as testable requirements with a CI grep guard, so a regression fails the build rather than shipping.
- **Two artwork resolutions can drift.** Bar and panel frames are authored separately per set. → The grid invariant test covers both, and the snail's frames are generated by rule rather than transcribed.
- **Panel and bar share one long-lived process.** A runaway timer or an unbounded tick degrades the whole shell, not just this widget. → The tick caps how many files it will recount, and the gate stops the timer whenever the user is not writing.

## Migration Plan

This is a greenfield plugin; there is no existing installation to migrate.

**Rollout:** build and verify `bird` end-to-end first, then add `snail` as the test of whether the mascot-set interface is genuinely data-driven — if adding it requires editing QML, the interface is wrong and should be fixed rather than special-cased. Validate with `omarchy plugin validate` and `qmllint` before every release. Publish the public repository, then submit to the marketplace under Productivity and request verification so the listing pins a reviewed commit.

**Rollback:** `omarchy plugin remove <id>` uninstalls; the plugin's only footprint outside its own directory is its state directory under `~/.local/state/omarchy/`, which the user may delete. The plugin never writes the user's `shell.json`, so removing it cannot corrupt their bar configuration.

## Open Questions

- The exact resolution of the per-plugin state path on this Omarchy version needs confirming against the shipped Quickshell, and the literal result must be documented in the README so companion authors can target the drop-box.
- Whether the marketplace manifest schema requires fields beyond those observed in shipped plugins — to be validated against the published developer documentation before release.
- Whether `preview.png` should show the bar face, the open panel, or both; this affects how the listing reads to someone deciding whether to install.
