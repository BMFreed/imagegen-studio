# Project Undo / Redo

## Feature

Undo/redo lets the user safely edit an opened `.igs` project and recover from local document changes.

Undo/redo is project-local. Each open `Project` tab owns an independent history stack for its `.igs` document state.

## Reference

Reference: InvokeAI canvas undo/redo.

Useful Invoke source areas:

- `invokeai/frontend/web/src/features/controlLayers/store/canvasSlice.ts` — undoable canvas slice, history limit, ignored actions and throttled rapid actions;
- `invokeai/frontend/web/src/features/controlLayers/hooks/useCanvasUndoRedoHotkeys.tsx` — `mod+z`, `mod+shift+z`, `mod+y`, disabled while canvas is busy;
- `invokeai/frontend/web/src/features/controlLayers/components/Toolbar/CanvasToolbarUndoButton.tsx`;
- `invokeai/frontend/web/src/features/controlLayers/components/Toolbar/CanvasToolbarRedoButton.tsx`;
- `invokeai/frontend/web/src/features/controlLayers/components/Settings/CanvasSettingsClearHistoryButton.tsx`.

## ImageGen Studio Decision

Take Invoke's approach and adapt it to ImageGen Studio's document model.

ImageGen Studio should not invent a custom global undo system for the whole app. The history must be scoped to meaningful `.igs` project mutations, similar to how Invoke scopes undo to canvas state instead of all application state.

Unlike Invoke, ImageGen Studio can have multiple open project tabs. Therefore the undo/redo stack must live per project tab/document identity, not in one global canvas slice.

## Scope

MVP:

- per-Project undo stack;
- per-Project redo stack;
- default history limit of 64 undo states, matching Invoke unless UX testing suggests otherwise;
- toolbar buttons for undo and redo;
- keyboard shortcuts:
  - `mod+z` -> undo;
  - `mod+shift+z` -> redo;
  - `mod+y` -> redo;
- clear project history action in project settings/debug settings;
- undo/redo disabled while the selected Project canvas is busy with an operation that cannot safely be rewound;
- project load, project close and crash recovery restore do not become undo steps.

Post-MVP:

- named history entries in a visible History panel;
- user-configurable history depth;
- selective undo, only if there is a real workflow need.

Rejected:

- global app-wide undo that spans Home, Model Manager, Queue Manager and several Project tabs;
- undo for external file system side effects outside `.igs`;
- persistent undo stack across application restarts.

## Ownership Model

Each `Project` tab owns:

- `past`: previous document states or document patches;
- `present`: current project document state;
- `future`: redo states;
- `historyLimit`;
- `historySuspended` flag for load/restore/recovery operations;
- `lastActionType` / throttling metadata for drag-like actions.

The stack is tied to the canonical open project identity:

```ts
type ProjectUndoRedoState = {
  projectId: string
  projectPath: string
  past: ProjectHistoryEntry[]
  future: ProjectHistoryEntry[]
  limit: number
}
```

Production undo history is not stored in `.igs` and does not survive an application restart. The Vue prototype keeps the in-memory `ProjectSession` registry after a tab is closed, so reopening the same mock project within the current browser session also restores its history. This prototype behavior must not be interpreted as persisted undo history.

## What Is Undoable

Undoable project mutations:

- add/delete/duplicate/rename layer;
- reorder layers;
- change layer visibility;
- change layer lock state;
- change layer opacity/compositing settings where supported;
- edit Smart Patch Layer mask;
- transform Smart Patch Layer mask;
- edit Smart Patch Layer bounding box;
- change Smart Patch internal resolution/settings;
- add/delete/set-active Smart Patch raster variant;
- add/delete/edit Regional Guidance Layer;
- edit Regional Guidance region/mask;
- edit regional prompts/reference images;
- move/resize the project-owned primary generation bbox; an explicit destructive
  crop of Raster Layer pixels is a separate undoable mutation if implemented;
- change canvas/project-local generation settings if those settings are stored in `.igs`;
- apply selected preset sections into Project or Smart Patch generation draft as one ordinary grouped settings mutation;
- accept one or more staging candidates as Raster Layers;
- accept one or more staging candidates as Smart Patch variants;
- delete already accepted Raster Layers or Smart Patch variants through their persistent project controls.

Undoable generation commits must be grouped:

- `Add N as Layers` is one grouped undo step;
- `Add N as Variants` is one grouped undo step;
- each resulting layer/variant remains independently editable after acceptance.

## What Is Not Undoable

Not undoable:

- switching between `Home` and `Project` tabs;
- changing active Project tab;
- Model Manager actions;
- model downloads/imports/deletes;
- queue item status changes;
- enqueueing a job;
- canceling/retrying/deleting queue history;
- worker progress;
- worker completion;
- focusing, checkbox-selecting or discarding staging candidates;
- opening/closing project files;
- autosave writes;
- crash recovery load;
- project file validation;
- global settings;

Project prompt editors update the generation draft while typing but use a transient focus-to-blur transaction. Focus captures a document baseline; input, attention, autocomplete and Clear update that transaction; blur creates one named history entry only when the final document differs. Switching prompts and every regular Project command first flush the active transaction. Project CodeMirror instances deliberately have no local history, so `Ctrl/Cmd+Z` restores the whole Project edit rather than one character.

## Busy / Running Rules

Undo/redo is disabled when applying it would conflict with an active project mutation.

Examples:

- if a Smart Patch job is currently committing a result into the same project, wait until commit finishes;
- if a mask brush stroke is actively being drawn, create the undo step when the stroke ends;
- if a project is loading/recovering, do not allow undo/redo until the document reaches a valid ready state.

Queue jobs and staging sessions are not undone. Undo can remove the explicit acceptance mutation that added one or more Raster Layers or Smart Patch variants. Undo does not reconstruct the previous staging session.

## Action Filtering

Follow Invoke's filtering strategy:

- ignore actions from unrelated app areas;
- ignore project load/restore/recovery actions;
- throttle rapid repeated actions so dragging/resizing does not create an unusable history stack;
- do not group freehand mask strokes incorrectly.

Suggested baseline:

- history limit: 64;
- throttle repeated non-freehand actions at roughly 1000 ms;
- brush/eraser/lasso/polygon operations commit one history entry at gesture completion.

## UX

Toolbar:

- icon button: Undo;
- icon button: Redo;
- disabled state when stack is empty or project is busy;
- tooltip includes shortcut.

Menu:

- `Edit > Undo`;
- `Edit > Redo`;
- `Clear Project History` may later live behind project settings/debug settings; the current Vue prototype does not expose it.

The visible actions remain generic (`Undo`, `Redo`). The current prototype already stores named internal history entries for diagnostics and tests; it does not expose a History panel or named Undo label in the toolbar.

## Production Electron checkpoint

The Electron Project keeps history in the open tab only. Main owns up to 64
document snapshots; typed IPC exposes `canUndo`/`canRedo`, Undo, Redo and Clear
History. Project prompt edits continue to reach the recovery shadow while
typing, then form one history step per focus session. Save, Add, ordinary
Project commands, tab switch and close flush and seal the session. The Project
CodeMirror editor uses Project history for its shortcuts; controls outside the
Project keep their own text-editing behavior.

Accepted Raster candidates form one Undo step even when several layers were
added. Undo does not recreate staging; Redo verifies retained raster sources.
History eviction and Clear History release unreferenced staged copies while
preserving assets still needed by the current document, saved package, or
reachable Undo/Redo states. These behaviors are covered by the
[production research and checks](../../engineering/phase-2b-project-undo-research.md).

This checkpoint covers production document edits already implemented. Smart
Patch variants, Regional Guidance, mask gestures and several Canvas operations
remain prototype behavior, so their Undo semantics are not yet production
evidence. Project history remains transient and is never written into `.igs`.

## Vue Prototype Coverage

The current prototype implements a 64-entry per-project document snapshot history. Undo and Redo are available from the bottom viewport bar, the `Edit` menu and `mod+z` / `mod+shift+z` / `mod+y` shortcuts.

Covered mutations include generation settings, grouped plain-text prompt edits, layer add/delete/duplicate/reorder/state changes, preset application and multi-candidate acceptance. Save, Generate, Apply Preset, close, tab switch, Undo and Redo flush an active prompt transaction first. Queue progress, candidate focus/selection and discard remain outside history. Acceptance is one grouped mutation and undoing it does not recreate the previous staging session. Prompt editors inside app-level managers/modals use local CodeMirror history and are excluded from Project shortcuts.

Canvas paint/transform fidelity remains mocked: tool selection and deterministic mask/bbox revision changes can produce history entries, but the prototype does not yet prove production gesture grouping, brush-stroke coalescing or busy-state arbitration against a real canvas/worker pipeline.

## Autosave Interaction

Autosave writes the current project state. It does not write undo history.

Undo/redo mutations mark the project dirty and participate in the normal autosave debounce flow. If the user undoes back to the last saved state, the dirty indicator may clear only if the implementation can cheaply compare project revision IDs or hashes.

## `.igs` Interaction

Undo history is not serialized into `.igs`.

Generation provenance is serialized into `.igs` only for accepted results. Undo may remove the result that references provenance; unreferenced provenance/assets can be cleaned during project maintenance/compaction after they are no longer needed for the in-memory redo stack.

## Acceptance Criteria

- Each open `.igs` Project tab has independent undo/redo.
- Undo/redo never affects another open project.
- Undo/redo covers layer operations, masks, Smart Patch bbox/settings, Regional Guidance edits and explicit acceptance of generation candidates.
- Project load/autosave/recovery do not create undo steps.
- Rapid drag/resize operations do not flood the history stack.
- Freehand mask gestures undo as understandable operations.
- Queue/staging state is not undoable; explicit multi-accept is one grouped undoable project mutation.
- Undo/redo is disabled while the project is in an unsafe busy state.
