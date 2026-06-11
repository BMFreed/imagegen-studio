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
- project load, project close, snapshot restore and crash recovery restore do not become undo steps.

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

The runtime tab manager destroys this state when the project is closed. It is not stored in `.igs`.

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
- change global generation bounding box;
- change canvas/project-local generation settings if those settings are stored in `.igs`;
- add generated Raster Layer from a completed generation result;
- add generated Smart Patch raster variant from a completed generation result;
- delete persistent results from `GenerationResults`.

Undoable generation commits must be grouped:

- one generated Raster Layer from one completed queue item = one undo step;
- multiple generated Raster Layers from one user action may be grouped as one undo step;
- multiple Smart Patch variants produced by one user action may be grouped as one undo step;
- deleting several results via `Delete All Except Active` is one undo step.

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
- opening/closing project files;
- autosave writes;
- crash recovery load;
- project file validation;
- global settings;
- prompt text editing while the prompt textarea has focus, if the native text editor undo stack handles it.

Prompt editor behavior can use the browser/native text undo stack for text editing. Programmatic prompt actions may keep a small local "undo last prompt replacement" affordance, but they do not belong to Project document undo unless the prompt is part of persisted project state.

## Busy / Running Rules

Undo/redo is disabled when applying it would conflict with an active project mutation.

Examples:

- if a Smart Patch job is currently committing a result into the same project, wait until commit finishes;
- if a mask brush stroke is actively being drawn, create the undo step when the stroke ends;
- if a project is loading/recovering, do not allow undo/redo until the document reaches a valid ready state.

Queue jobs themselves are not undone. Undo can remove the project mutation produced by a completed job, such as a newly added Raster Layer or Smart Patch variant.

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
- `Edit > Clear Project History` can live behind project settings/debug settings rather than primary menu.

The action labels may be generic in MVP (`Undo`, `Redo`). Named labels (`Undo Mask Stroke`, `Undo Add Layer`) are post-MVP.

## Autosave Interaction

Autosave writes the current project state. It does not write undo history.

Undo/redo mutations mark the project dirty and participate in the normal autosave debounce flow. If the user undoes back to the last saved state, the dirty indicator may clear only if the implementation can cheaply compare project revision IDs or hashes.

## `.igs` Interaction

Undo history is not serialized into `.igs`.

Generation snapshots are serialized into `.igs` when they describe persisted results. Undo may remove the result that references a snapshot, but snapshot retention follows the project storage policy. If a snapshot becomes unreferenced, cleanup can happen during project maintenance/compaction.

## Acceptance Criteria

- Each open `.igs` Project tab has independent undo/redo.
- Undo/redo never affects another open project.
- Undo/redo covers layer operations, masks, Smart Patch bbox/settings, Regional Guidance edits and committed generation results.
- Project load/snapshot restore/autosave/recovery do not create undo steps.
- Rapid drag/resize operations do not flood the history stack.
- Freehand mask gestures undo as understandable operations.
- Queue item status changes are not undoable, but completed result commits are undoable.
- Undo/redo is disabled while the project is in an unsafe busy state.
