# Project Document Lifecycle

Supporting contract for [PP-007: Проект принадлежит пользователю](../../product-promises.md#pp-007-проект-принадлежит-пользователю).
The promise registry owns the concise commitment and public readiness; this
document owns Save, dirty state, close and recovery rules.

Related contracts: [Home](../home-screen.md) owns workspaces, import/relink and
app-managed Trash; [Data Storage](../../specs/03-data-storage.md) owns the `.igs`
package and derived indexes; [Undo/Redo](./undo-redo.md) owns session history.

## Feature

An opened `.igs` Project has an explicit saved revision, in-memory document state, a recovery shadow and optional temporary generation staging sessions.

## ImageGen Studio Decision

Shadow autosave protects work from crashes but does not silently redefine the user's saved `.igs` revision.

```text
main .igs = explicit saved revision
open Project state = current editable document
autosave shadow = crash recovery
generation staging = temporary candidates, not document state
```

The portable `.igs` package owns saved canvas/layer assets, settings, accepted
results and their provenance. Project indexes and preview caches can be rebuilt;
they are not required as the sole copy of the saved project. Model weights stay
in the reusable library: moving a project may require installing its exact
resources, and missing resources must remain understandable from copied metadata.

## Dirty State

Project becomes dirty after persistent document mutations such as:

- generation/preset settings changes stored in Project;
- layer add/delete/reorder/visibility/opacity changes;
- Smart Patch or Regional Guidance edits;
- Project Canvas resize/crop/grow;
- `Add N as Layers` / `Add N as Variants`;
- undo/redo that moves away from the saved revision.

Queue progress, completed candidates, staging focus/selection and discarded candidates do not mark Project dirty.

If undo returns exactly to the saved revision, dirty may clear using a revision id/hash comparison.

## Save

`Save`:

- validates current Project state;
- assembles and validates a temporary `.igs` package;
- atomically replaces the managed project file;
- updates the saved revision marker, preview and Home index metadata;
- clears dirty state only after successful replacement;
- marks/removes the corresponding recovery shadow as clean.

Save failure keeps the Project open and dirty with an actionable error. It must not discard the recovery shadow.

`Save As` is not required for the current Project prototype. Project renaming/moving remains managed through Home/workspace flows until a separate Save As/export decision is made.

## Closing A Dirty Project

Closing a dirty Project tab opens a native dialog with:

- `Save`;
- `Discard Changes`;
- `Cancel`.

Rules:

- `Save` closes only after successful persistence;
- `Discard Changes` restores the last saved `.igs` revision and removes the dirty recovery shadow;
- `Cancel` returns to Project unchanged;
- `Esc` maps to `Cancel`;
- failed Save leaves the close dialog/Project available for recovery.

If an otherwise clean Project has an active staging session, close must explicitly warn that unaccepted candidates will be discarded. Staging candidates are not converted into layers automatically.

## Autosave And Recovery

Autosave writes debounced dirty state/assets into the app-managed shadow directory. It does not clear the dirty marker and does not silently overwrite the main `.igs`.

After an unexpected shutdown:

- valid unclean shadow becomes `Recovery available` on Home;
- `Recover` opens shadow state as a dirty Project;
- `Discard Recovery and Open Saved` deletes the candidate and opens main `.igs`;
- `Cancel` changes neither state.

Recovery of unfinished generation staging sessions is deferred. Current recovery guarantees cover persistent Project document edits, not unaccepted candidate outputs.

Recovery is best effort from validated shadow state and does not guarantee zero
lost edits since the latest debounce. It is not a backup against disk corruption,
external deletion or every crash. Recover opens a dirty document for review;
only explicit Save replaces the main `.igs`. Undo history does not survive restart.

## Vue Prototype Coverage

The interactive source of truth is `?prototype=project` and Project tabs opened from Home.

The prototype keeps one app-owned `ProjectSession` per project id for the lifetime of the browser session. Switching tabs preserves the document, saved baseline, history, queue/staging state and Project UI state. Closing and reopening a mock project preserves the retained session, but a confirmed close explicitly discards staging; `Discard Changes` also restores the saved baseline and clears history before closing. This is an in-memory prototype convenience, not persisted undo history or a recovery implementation.

Implemented lifecycle behavior:

- dirty is computed by comparing `document` with `savedDocument`;
- persistent settings/layer/canvas/acceptance mutations can make the tab dirty, while queue progress and staging selection do not;
- mock `Save` updates the saved baseline and clears dirty;
- the `errors` scenario keeps the project open and dirty after a simulated Save failure;
- closing a dirty project offers `Save`, `Discard Changes` and `Cancel`;
- closing a clean project with staging warns that temporary candidates will be discarded;
- Project metadata can be reflected back into the in-memory Home catalog.

Not implemented by the Vue prototype:

- filesystem `.igs` package assembly or atomic replacement;
- autosave shadow writes and crash-startup recovery of Project document state;
- real file validation, asset cleanup or Home index persistence.

Home's `Recovery available` scenario is a separate mock of the intended recovery decision flow. It must not be read as evidence that the Project prototype writes or restores recovery shadows.

[Project tests](../../prototype-app/tests/project.spec.ts) and
[Home tests](../../prototype-app/tests/home.spec.ts) are prototype evidence sources,
not evidence of completed production I/O. PP-007 stays publicly unavailable until
the save/reopen and failure/recovery paths are exercised against real files.
The pending process pilot is tracked in [Engineering workflow](../../engineering/README.md#пилоты-и-дальнейшая-автоматизация).

## Acceptance Criteria

- Dirty state represents divergence from the explicit saved `.igs` revision.
- Shadow autosave protects dirty work without masquerading as Save.
- Dirty close offers `Save`, `Discard Changes` and `Cancel`.
- Failed Save never closes the Project or deletes recovery state.
- Staging-only state does not mark Project dirty and is never auto-accepted on close.
- Undo/redo can clear dirty when it returns to the saved revision.
- A saved supported `.igs` can be reopened after transfer/import without relying on the original installation's project index or preview cache; unavailable model weights produce diagnostics.
- Save success is verified by reopening through the real loader; a write/validation/replacement failure keeps the previous saved package readable and the document dirty.
- Valid recovery opens for review without replacing the saved package until explicit Save; failed Save does not delete the recoverable shadow.
