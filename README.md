# Writing Critter

A small ASCII critter that lives in your [Omarchy](https://omarchy.org) topbar and grows as you
write toward a daily word goal.

```
  |  (o o)  |   0-24%     just an egg
  | ,(o o), |   25-49%    cracking
  | <(o o)> |   50-74%    stubby wings
  | \(o o)/ |   75-99%    wings out
  |~\(o o)/~|   100%+     soaring
```

Focus your editor and it wakes up. Focus anything else and it goes to sleep — eyes closed,
timer stopped, costing nothing. Click it for the full-size critter, your progress, and a
per-day streak.

> **Status: specification complete, implementation not started.** There is no installable
> plugin in this repository yet. The full technical spec is in
> [`writing-critter-spec.md`](writing-critter-spec.md) and the work is broken down in
> [`openspec/changes/add-writing-critter-plugin/tasks.md`](openspec/changes/add-writing-critter-plugin/tasks.md).
>
> *(The repository is named `omarchy-writing-pet`; the plugin itself is "Writing Critter",
> id `io.github.acero-ad.writing-critter`.)*

## It does not read your keyboard

The obvious way to count words you type is to read the keyboard. On Wayland that means raw
access to `/dev/input`, which needs `sudo usermod -aG input $USER` — a grant that is **not
scoped to this plugin**. It hands *every* process you run permanent keylogging ability over
every application, passwords included. That is an absurd price for a mascot, so this plugin
does not pay it and never will.

Instead it watches the document files you point it at and diffs their word counts. Modern
writing apps autosave a couple of seconds after you stop typing, so this is live in practice
without any privilege at all.

**Guarantees, enforced by tests rather than promises:**

- No keyboard or input-device access of any kind. No `/dev/input`, no evdev, no libinput,
  no `input` group.
- No network access. Nothing leaves your machine.
- No sudo, no polkit, no systemd units, no extra daemons.
- No storage of anything you write. File text is counted in memory and discarded; only
  integers, dates, and paths you chose are saved.

A CI check greps the repository for all of the above and fails the build on a match.

## How it works

- **Counting.** Every 2 seconds — and only while a configured writing app is focused — a
  metadata-only scan looks for recently modified files, then re-counts *just those*. Cost is
  flat whether your vault holds 300 notes or 2000. Idle ticks read nothing.
- **Activation.** There is no session to start. Focusing a whitelisted app is the on switch;
  focusing anything else is the off switch. Omarchy's own `omawrite` ships in the default
  whitelist, so it works on a stock install with no configuration.
- **Honest counting.** Deleting a paragraph never reduces the day's total, and adding a new
  folder to watch never dumps its existing word count into today.
- **Two critters.** `bird` (default) grows in place. `snail` travels, and its slime trail is
  the progress meter.

## Scope

Built for GUI writing apps that autosave — Omawrite, Obsidian, Typora, LibreOffice Writer.
Terminal and modal editors (nvim, helix, emacs) are explicitly **not** supported: they save
only on command, and normal-mode navigation is not writing.

## Install

Not yet available. Once implemented:

```bash
omarchy plugin add https://github.com/Acero-AD/omarchy-writing-pet.git --enable
```

## Repository layout

| Path | What |
|---|---|
| `writing-critter-spec.md` | Full technical specification (v0.4) |
| `openspec/changes/add-writing-critter-plugin/` | Proposal, design decisions, capability specs, task breakdown |

## License

MIT — see [LICENSE](LICENSE).
