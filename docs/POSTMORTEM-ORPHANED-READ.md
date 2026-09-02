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
