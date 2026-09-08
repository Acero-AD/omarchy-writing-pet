# Post-mortem: the orphaned read

On 2026-09-02 this plugin segfaulted `quickshell` roughly forty times in a
crash loop, taking the whole Omarchy desktop shell down with it. Recovery meant
removing the plugin from `shell.json` and from disk and restarting the shell.

This document exists so the shape is recognisable next time, rather than
rediscovered.

## What happened

`Service.qml` declared a `FileView` with `preload: true` over the plugin's
`state.json`. That read is asynchronous. Before it returned, the `Loader` in
`BarWidget.qml` flipped its `active` binding to `false` and destroyed the whole
service tree.

Destroying a QML component invalidates its `QQmlContext`: the context's engine
pointer is nulled and its destruction signal fires. The C++ objects underneath
are deleted later, on the event loop. In that gap the `FileView` was still
alive, still subscribed, and still holding a pending read — attached to a
context that no longer had an engine.

When the read landed, `dataChanged` fired into the orphaned `JsonAdapter`, which
walked the JSON looking for matching properties. On the first `property var` it
reached, it asked for the engine and used the answer without checking it:

```cpp
// quickshell/src/io/jsonadapter.cpp:177
auto jsValue = qmlEngine(this)->fromVariant<QJSValue>(newVariant);
//             ^^^^^^^^^^^^^^^ nullptr — the context had been invalidated
```

Read out of the core dump:

```
QJSEngine::create (this=0x0)

QQmlContextData 0x7fa7d9449020
  m_engine                 = 0x0   // invalidated
  m_hasEmittedDestruction  = 1     // teardown already announced
  m_refCount               = 23    // objects still referencing it
```

Crash chain: `FileViewOperation::finished` → `FileView::emitDataChanged` →
`FileViewAdapter::onDataChanged` → `JsonAdapter::deserializeAdapter` →
`deserializeRec` → `QJSEngine::create (this=0x0)`.

## Four things had to be true at once

None is a mistake by itself. That is why the combination survived review — each
was defensible in the commit that introduced it.

| | |
|---|---|
| **The work** | `preload: true` starts an async read immediately. Nothing ties its completion to whether the requester still exists. |
| **The teardown** | `active: root.hostService === null` is a live binding. `bar.shell` resolved later in startup, it re-evaluated, and it destroyed the tree it had just built. |
| **The deref** | Only `var`-typed adapter properties reach the engine-dereferencing branch. The adapter had four. |
| **The amplifier** | A 2-second retry timer calling `reload()` until state loaded guaranteed a read was always in flight, turning a narrow race into a certainty. |

The commit that added the preload argued that behaviour "should not depend on a
single signal arriving" — and then added a retry timer that kept a read
permanently in flight. Robustness added to one failure mode fed another.

## Rules

1. **Never gate a component's lifetime on a value that settles late.** If the
   expression can be null at construction and non-null a moment later, the
   `Loader` will build and destroy a tree during startup. Gate on something
   already resolved, or mount unconditionally.
2. **Treat "started async work" as a reason not to be destroyed.** A `preload`,
   a pending `reload()`, a `Process`, or a timer is a live claim on the object.
3. **Retry timers belong outside the thing they retry.** A timer inside a
   component, re-arming work on that component, keeps it permanently busy and
   permanently unsafe to tear down.
4. **Mount shared services once, at a stable owner.** One bar per monitor means
   a per-widget fallback can instantiate several services.
5. **An isolated shell instance is not evidence of safety.** `Service.qml` ran
   fine in a throwaway Quickshell the same afternoon it was crash-looping the
   desktop. Run both, in that order, every time.

## Recognising it again

- **Shape** — a tight crash loop, not a single crash. Same stack every time,
  roughly one second after launch.
- **Stack tell** — top frames in a completion callback (`::finished`,
  `onDataChanged`, `::deserialize*`) reached from `sendPostedEvents`, never from
  a call you made.
- **Pointer tell** — `this=0x0` on a getter that "cannot fail": `qmlEngine()`,
  `qmlContext()`, `engine()`.
- **Confirming** — in the core, read the object's `QQmlContextData`.
  `m_engine == 0` with `m_hasEmittedDestruction == 1` is this bug, conclusively.
- **Not this bug** — crashes needing user interaction, varying in stack, or
  surviving removal of the plugin.

## Whose bug

Both, in different proportions. Quickshell should not dereference
`qmlEngine(this)` unguarded, and arguably should not deliver `dataChanged` into
a context that has already emitted destruction. Omarchy is not implicated; its
configuration plays no part.

But the trigger is avoidable in plugin code, and a plugin that crashes the shell
it runs inside owns the problem regardless of who holds the missing null check.
Rules 1 and 2 are what keep it from happening again.

## Correction, 2026-09-03

The Phase 2 rewrite claimed `blockLoading: true` made `FileView` reads
synchronous, and therefore made teardown safe on its own. That is false.
Quickshell logs `Starting async load` for a `FileView` with `blockLoading` set;
the reads are still asynchronous.

What actually closes the hazard is ownership: every `FileView` is held by a
`Singleton`, which lives for the process and cannot be destroyed by a binding, a
`Variants` model change, or a monitor hotplug. An in-flight read has nothing to
outlive. `blockLoading` is kept for a smaller reason — it makes the first
`text()` return data rather than an empty string.

Recorded because a comment asserting a guarantee the code does not provide is
worse than no comment: it invites exactly the reasoning that caused the original
crash.

## Narrowing the rules, 2026-09-04

Two of the rules written here the day after the crash have been narrowed, and it
is worth recording why, because the reasoning applies to the next rule someone
is tempted to write in an emergency.

The original text forbade the shell process from writing any file and from
spawning any process. Neither prohibition was derived from the failure. The
crash needed four conditions — a `Loader.active` bound to a value that settled
late, a `preload`ed `FileView`, a `JsonAdapter` dereferencing `qmlEngine(this)`
unguarded, and a read completing into a destroyed context. None of them is a
write, and none is a spawn. The write path in the old code was *adjacent* to the
failure — it is how the component that crashed came to exist — but it was not
the mechanism.

Those two rules were prophylactic: written to shrink the surface area while the
desktop was still crashing, which was the right call at the time. The rule that
was actually load-bearing is the ownership one, and it is unchanged:

> Nothing holding outstanding asynchronous work may live in a destroyable
> subtree.

So that is what the linter now enforces for subprocesses. A `Process` is
permitted, but only inside a `pragma Singleton` component, and only to run the
plugin's own engine. `startDetached` stays forbidden outright: it survives its
owner by design and reports no exit status, so a failed change would be
invisible. Writing from the shell stays forbidden outright too — not because it
crashes, but because the engine's config file must keep exactly one writer.

Measured while implementing this: `FolderListModel` populates asynchronously. A
probe read `count == 0` immediately after setting `folder`, and the real entries
one tick later. Had it been placed in the panel, where it naturally belongs, it
would have been a directory scan running inside a subtree that is rebuilt on
every monitor hotplug — the same shape as the original crash, arrived at from a
completely different direction. It lives in the singleton instead.

The lesson is not that the emergency rules were wrong to write. It is that a
rule written to stop bleeding should say so, so that whoever revisits it knows
whether they are relaxing a safeguard or removing a splint.

## Admitting one numeric field, 2026-09-07

The settings panel now uses a `NumberField` for the daily goal. This reverses
the temporary no-text-input rule recorded after the crash, but it does not
restore the crash's shape: none of the four necessary conditions was a text
field, the field still invokes the external engine rather than writing from
QML, and every process and file read remains owned by a singleton.

It does reintroduce one separate hazard. `PanelKeyCatcher` handles keys with
`Keys.BeforeItem`, so an unblocked catcher consumes input before a focused field
can receive it. The field and catcher are therefore a required pair:
`blocked` is bound to the field's `activeFocus`, Escape first releases that
focus, and the lifecycle linter rejects any focusable input without such a
binding. A second Escape reaches the catcher and closes the panel normally.

## The panel that installs things, 2026-09-07

The panel can now install, update, repair and remove the engine's systemd user
service. That is a much larger claim than "the panel can set a goal", so it is
worth being precise about which of these rules it touches, and which it does
not.

**Rule 4 is unchanged and load-bearing.** The QML in this plugin still writes
nothing. Not a file, not a unit, not a systemctl invocation. Every effect the
setup card describes happens in `bin/writing-critter service …`, a separate
process, one the shell starts and then only reads the exit code and one line of
JSON from. The distinction that matters is not "does a button cause a write" —
it always did, that is what `config set-goal` is — but *where the writing code
lives*. It lives outside the shell, where a bug is a dead script rather than a
dead desktop. That was the whole conclusion of this document and it is the same
conclusion here.

**Rule 3 (`Process` ownership) is the one under pressure**, because setup is a
much more tempting place to spawn something from the panel: the button is in
the panel, the state is in the panel, and the panel is where the failure needs
to be shown. It is not spawned from the panel. `Control.qml` — a singleton,
so nothing can destroy it mid-flight — owns the one `Process`, and the panel
calls a function on it. Service actions share the *same* queue as configuration
actions rather than getting a second `Process`, so there is still exactly one
subprocess in this plugin's half of the shell, and two of them can never
overlap.

**What the panel supplies is a name, never an argument list.** `requestService`
takes one of five action names and maps it, in `Control.qml`, to a fixed argv.
There is no path from a panel button, a config value, or an engine message to a
command line. The lifecycle linter enforces the program; the security guard
enforces the argument shape on both sides of the process boundary.

**The status probe is bound to an explicit user action.** Loading the widget
spawns nothing; opening the panel spawns one probe, shared across every monitor
because the singleton coalesces them. The one timer here is a bounded settling
delay after a lifecycle action — three checks, then it stops — and not a poll.
Rule 3 in its original form ("retry timers belong outside the thing they
retry") is satisfied the same way everything else here is: the timer lives in
the singleton, not in the panel that asked.

The reason to write all of this down is the same as in the section above. A
future reader will find a plugin whose bar panel installs a systemd unit and
will reasonably wonder whether the lesson of 2026-09-02 was quietly dropped.
It was not. The lesson was *where the dangerous code runs*, and it still runs
somewhere a crash cannot take the desktop with it.
