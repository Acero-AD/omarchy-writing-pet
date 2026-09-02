# Writing Critter — Companion Source Protocol v1

Writing Critter counts words by watching files on disk. That works for any
editor that autosaves, but it can only see what has been written to disk, and it
cannot see inside a document.

A **companion source** is an optional plugin that lives inside an editor and
reports exact, real-time counts. This document is the whole contract. Implement
it in any language, in any editor, without touching Writing Critter.

## The drop-box

Write one JSON file per source into:

```
$HOME/.local/state/omarchy/io.github.acero-ad.writing-critter/sources/<sourceId>.json
```

The directory is created by Writing Critter at shell startup. If it does not
exist, Writing Critter is not installed or has not run yet — create it yourself
rather than failing.

Only `*.json` files at the top level are read. Subdirectories are ignored.

## The file

```json
{
  "protocol": 1,
  "sourceId": "obsidian",
  "app": "obsidian",
  "date": "2026-09-02",
  "wordsAddedToday": 342,
  "updatedAt": "2026-09-02T10:42:13+02:00",
  "claimsPaths": ["/home/you/Vaults/Main"]
}
```

| Field | Required | Rules |
|---|---|---|
| `protocol` | yes | Must be the number `1`. Anything else is ignored entirely. |
| `sourceId` | yes | `[A-Za-z0-9._-]`, 1–64 chars. Must match the filename stem. |
| `app` | no | Free-text label. Not interpreted. |
| `date` | yes | `YYYY-MM-DD`, the source's **local** date. |
| `wordsAddedToday` | yes | Integer `0 … 1000000`. **Absolute daily total, not a delta.** |
| `updatedAt` | yes | ISO 8601 timestamp. Unparseable is treated as "never updated". |
| `claimsPaths` | no | Array of absolute paths this source is authoritative for. |

## The five rules

**1. Report absolute totals, never deltas.** `wordsAddedToday` is your running
total for the day so far. Writing Critter reduces with `max(previous, reported)`
per source per day.

This is the rule that makes the protocol safe. A re-read, a half-written file, a
crash, or your plugin restarting and resuming from a lower number can never
inflate or double-count the day. A delta protocol cannot promise that.

**2. Write atomically.** Write to `<sourceId>.json.tmp` in the same directory,
then `rename()` over the target. A partially written file will be parsed, found
malformed, and ignored — no crash, but your update is lost until the next write.

**3. Reset yourself at local midnight.** When your date changes, write
`wordsAddedToday: 0` with the new `date`. A file whose `date` is not the
reader's current local date contributes nothing.

**4. Keep `updatedAt` fresh.** A source not updated for **10 minutes** is marked
*inactive*. It keeps the contribution it already reported for today — closing
your editor at lunch must not erase the morning — but it stops suppressing file
counting (see rule 5).

**5. Claim only what you are authoritative for.** While your source is active,
Writing Critter skips its own file counting for every watched file at or beneath
a `claimsPaths` entry. This is the double-counting guard.

Paths match on segment boundaries: claiming `/vault` covers `/vault/a.md` but
not `/vault2/a.md`.

When your source goes stale, file counting resumes for those paths using the
files' *current* counts as fresh baselines, so edits made while you owned them
are not suddenly added to the day.

## Debounce to match the reader

Writing Critter polls every 2 seconds. Writing more often than once per 2
seconds produces no visible benefit and only costs disk writes. Debounce
accordingly.

## Your file is untrusted input

Writing Critter validates every field for type and range, ignores anything
malformed, never evaluates content, and renders strings only as plain text. Do
not rely on being able to pass through rich content — you cannot.

Equally: the drop-box is a user-writable directory. Do not put secrets in it.

## Minimal example

```python
import json, os, tempfile
from datetime import datetime

DIR = os.path.expanduser(
    "~/.local/state/omarchy/io.github.acero-ad.writing-critter/sources")

def report(source_id, words, claims=()):
    os.makedirs(DIR, exist_ok=True)
    payload = {
        "protocol": 1,
        "sourceId": source_id,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "wordsAddedToday": int(words),
        "updatedAt": datetime.now().astimezone().isoformat(),
        "claimsPaths": list(claims),
    }
    fd, tmp = tempfile.mkstemp(dir=DIR, suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(payload, f)
    os.replace(tmp, os.path.join(DIR, f"{source_id}.json"))  # atomic
```

## Checklist

- [ ] `protocol` is the number `1`
- [ ] `wordsAddedToday` is an absolute daily total
- [ ] Writes are `tmp` + `rename`, never in place
- [ ] `date` resets to today and `wordsAddedToday` to `0` at local midnight
- [ ] `updatedAt` refreshed on every write
- [ ] `claimsPaths` covers only what you are authoritative for
- [ ] Writes debounced to at most one per 2 seconds
