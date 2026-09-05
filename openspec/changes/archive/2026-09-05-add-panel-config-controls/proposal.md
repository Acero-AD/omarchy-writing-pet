## Why

Every setting in this plugin is reachable only from a terminal, and the two that
matter most are the two a terminal is worst at. Pointing the engine at a vault
means typing a path buried under `/mnt`; whitelisting an editor means knowing
that Obsidian's Hyprland appId is `md.obsidian.Obsidian` and not `obsidian` —
which no user can guess and which cost real debugging time during Phase 1. The
reverse is just as bad: an app added by mistake (a terminal, say) stays counted
until the user recalls its exact id to pass to `remove-app`.

The panel already renders these settings and prints the commands to change them.
Making them clickable is the last gap between "works" and "usable by someone who
did not build it".

## What Changes

- The panel's SETTINGS section becomes interactive:
  - **Goal**: a slider, committed on release, replacing the printed `set-goal` line.
  - **Watch paths**: each path listed with a remove control, plus an **Add path**
    button opening a directory picker rooted at `$HOME`.
  - **Writing apps**: each app listed with a remove control, plus one-tap add of
    the most recently focused non-shell application, offered by id.
  - **Mascot**: a two-way toggle.
- A new QML singleton owns everything the panel is not allowed to own: the
  outbound command invocation, the read-only directory listing, and a read-only
  view of the engine's config file. The panel stays a pure view.
- Settings are applied by invoking the engine's existing CLI. **No new config
  verbs are added** — `add-path`, `remove-path`, `add-app`, `remove-app`,
  `set-goal` and `set-mascot` already exist and already validate their input.
  The engine remains the only writer of `config.json`.
- The engine publishes the id of the last focused non-whitelisted application so
  the panel can offer it, and serialises config mutations so that two rapid
  clicks cannot lose an update.
- The QML lint rule forbidding subprocesses is narrowed rather than removed: a
  process may be declared only in a singleton, and only with an allowlisted
  program.

## Capabilities

### New Capabilities
- `panel-configuration`: interactive settings in the panel — what may be
  offered, how a change is committed, how directory browsing and app suggestion
  work, and what the panel must still refuse to do itself.

### Modified Capabilities
- `critter-widget`: the no-I/O requirement is narrowed from "no processes, no
  writes, no extra reads" to "no writes, and processes only from a singleton with
  an allowlisted program"; the panel-controls requirement changes from
  *display the command* to *invoke the command*.
- `counting-engine`: configuration mutations must be serialised against each
  other, since the panel can now issue them faster than a human types.
- `engine-state-file`: state gains the last focused application id, so the panel
  can offer a whitelist candidate without performing any discovery itself.

## Impact

- **New**: `Control.qml` (singleton), its `qmldir` entry.
- **Modified**: `Panel.qml` (SETTINGS section replaced), `bin/writing-critter`
  (focus tracking published; `cmd_config` locked), `scripts/qml-lifecycle-lint.py`
  (rule 3 narrowed), `docs/STATE-FILE.md` (new field), `README.md`.
- **Dependency**: `Qt.labs.folderlistmodel`, present in the Qt 6 install this
  plugin already requires. No new package.
- **Unchanged**: the security constraints — no input capture, no network, no
  privilege escalation, no document text stored. The external command allowlist
  gains one entry: the plugin's own CLI.
- **Risk**: this reverses a deliberate post-crash prohibition. The crash's actual
  mechanism — async work in a subtree destroyed by a late-settling binding — is
  addressed by singleton ownership, which is the rule that survives.
