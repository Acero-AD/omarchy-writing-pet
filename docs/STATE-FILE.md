# The state file

The engine publishes today's progress to one file. Anything that wants to draw
the critter — the bar widget, a CLI, a different status bar, your own script —
reads that file and nothing else. No IPC, no daemon handshake, no protocol
negotiation, and it is inspectable with `cat` while you debug.

## Location

```
$XDG_STATE_HOME/writing-critter/state.json
```

falling back to `~/.local/state/writing-critter/state.json` when
`XDG_STATE_HOME` is unset. `writing-critter status` prints the resolved path.

## Shape

```json
{
  "schema": 1,
  "date": "2026-09-02",
  "goal": 500,
  "wordsToday": 412,
  "byOrigin": { "filewatch": 412 },
  "history": [ { "date": "2026-09-01", "words": 980, "goal": 500 } ],
  "mascot": "bird",
  "gateOpen": true,
  "updatedAt": 1788363011.42
}
```

| Field | Meaning |
|---|---|
| `schema` | Always `1` for this layout. Refuse anything else. |
| `date` | The engine's local date. Compare against your own to detect a missed rollover. |
| `goal` | Words per day, for rendering progress. |
| `wordsToday` | Today's total. This is the number to display. |
| `byOrigin` | Per-source breakdown. Currently just `filewatch`. |
| `history` | Recent finished days, oldest first, capped at 365. |
| `mascot` | Which mascot set the user chose. |
| `gateOpen` | Whether counting is currently active — a writing app is focused, or was within the grace window. |
| `updatedAt` | Unix seconds of the last write. This is how you detect a stopped engine. A running engine refreshes it at least every 30 seconds even when nothing is being written, so treat silence beyond about 90 seconds as stopped. |

Per-file bookkeeping lives in a sibling `tracking.json`, not here. It is the
bulk of the data — on a 267-note vault it was 99% of a combined file — and it
names every file the engine has seen. Keeping it separate means a bar widget
neither parses it on every update nor ever holds the user's note titles in the
desktop shell process. **Readers must not open it.**

## Rules for readers

**1. Never write.** The engine is the only writer. Rendering must not require
write access to any path.

**2. A missing file is normal**, not an error. It means the engine has not run
yet. Render a resting state.

**3. Tolerate a torn read.** Writes are atomic — temp file plus rename — so you
will normally see either the whole previous version or the whole new one. If a
parse fails anyway, keep your last good value and retry. Never crash.

**4. Treat every value as untrusted.** Range-check before use. A reader that
renders inside a long-lived shell process must not be the reason that process
dies.

**5. Detect staleness from `updatedAt`.** More than **60 seconds** old means the
engine is not running. Say so rather than showing a frozen count as if it were
live.

## Deriving what to draw

`wordsToday` and `goal` give progress. Stage is the five-step ladder at 0–24%,
25–49%, 50–74%, 75–99%, 100%+. Mood comes from `gateOpen` plus how recently
`wordsToday` last changed — the reference implementation of both, along with the
mascot art, is `Model.js` in this repository.

Stage must never decrease within a day. Because totals are per-file high-water
marks, `wordsToday` is monotonic, so this holds if you derive rather than cache.
