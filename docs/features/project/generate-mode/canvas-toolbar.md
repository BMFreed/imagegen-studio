# Canvas Toolbar

## Feature

Generate mode needs a compact canvas toolbar for viewport and global bbox actions.

This toolbar is not a project/file toolbar. It should contain actions that operate on the visible canvas workspace, not actions that replace `.igs` project saving, exporting or session management.

## Reference

Reference: InvokeAI canvas toolbar, adapted to ImageGen Studio's document-based `.igs` workflow.

Useful InvokeAI reference points:

- `features/controlLayers/components/Toolbar/CanvasToolbarScale.tsx` — zoom out, percent input/dropdown and zoom in;
- `features/controlLayers/components/Toolbar/CanvasToolbarResetViewButton.tsx` — fit visible layers to the stage;
- `features/controlLayers/components/Toolbar/CanvasToolbarFitBboxToLayersButton.tsx` — fit generation bbox to visible layers, then fit view;
- `features/controlLayers/components/Toolbar/CanvasToolbarFitBboxToMasksButton.tsx` — useful behavior, but moved out of the global toolbar in ImageGen Studio;
- `features/controlLayers/components/Toolbar/CanvasToolbarProjectMenuButton.tsx`, `CanvasToolbarSnapshotMenuButton.tsx`, `CanvasToolbarSaveToGalleryButton.tsx` and `CanvasToolbarNewSessionMenuButton.tsx` — rejected as top-toolbar patterns for ImageGen Studio.

## ImageGen Studio Decision

Use Invoke's proven viewport and bbox commands, but do not copy its file/session toolbar model.

ImageGen Studio treats `.igs` as the default project document. Saving, opening, exporting and project-level reset commands belong in the app menu, project menu or command palette, not in the canvas toolbar.

## MVP Scope

Include in the canvas toolbar:

- zoom out;
- zoom percent input/dropdown;
- zoom in;
- `Fit View to Layers` / `Fit Content`;
- `Fit Generation BBox to Layers`.

`Fit View to Layers` changes only the viewport/camera. It does not mutate layers, canvas size or bbox.

`Fit Generation BBox to Layers` changes the current working generation bbox. It is used for the common workflow where the user drops or imports a large image as a Raster Layer and wants the generation bbox to match that visible content.

When fitting the generation bbox to layers:

- prefer selected visible Raster Layers when there is an explicit layer selection;
- otherwise use the bounds of visible Raster Layers;
- ignore hidden layers;
- fit the resulting rect to the model/bbox grid size;
- do not resize the project canvas;
- after the bbox is updated, the viewport may also fit the relevant layers for convenience.

## Smart Patch Fit-To-Mask

Do not put `Fit BBox to Mask` in the global canvas toolbar.

For Smart Patch Layer, include a contextual button in the Smart Patch Layer left toolbar:

```text
Fit Patch BBox to Mask
```

This command:

- reads the selected Smart Patch Layer's owned mask bounds;
- expands the rect by required mask blur/padding;
- fits the rect to the model/bbox grid size;
- writes the result to the selected Smart Patch Layer's owned bounding box;
- marks the Smart Patch Layer as `outdated` if it already has an active raster sub-layer.

The same action may also be discoverable from the selected Smart Patch Layer bbox popover, but the primary visible command belongs to the contextual Smart Patch toolbar, not the global canvas toolbar.

For Regional Guidance Layer, do not show this button. Regional Guidance owns a region/mask for conditioning and does not own a generation bbox.

## Rejected Toolbar Actions

Do not include:

- brush color swatches — ImageGen Studio mask brushes do not need Invoke-style fill color controls in the global canvas toolbar;
- `Save Canvas Project` / `Load Canvas Project` — `.igs` is already the project document and is handled by File/Open/Save flows;
- `Save Canvas to Gallery` — use `File -> Export As` and explicit export actions instead of an Invoke-like gallery;
- `Save/Load Canvas Snapshot` — full project checkpoints are not MVP canvas toolbar actions;
- destructive reset/session actions — keep `Reset Generation Settings`, `Clear Layers` and similar actions in app/project menus with confirmation where needed.

Harmless viewport reset/fit actions are allowed near zoom controls.

## Tool Hints

Canvas interaction hints are required, but their final position is a UI layout decision.

The hint area should be context-sensitive:

- `View` shows pan/zoom/fit hints;
- `Bounding Box` shows move/resize/snap/aspect hints;
- `Transform Mask` shows move/scale/rotate hints;
- Lasso/Polygon Lasso/Brush/Eraser show mask editing hints.

Hints must not appear as inactive chrome in readonly Home previews.

## Follow-Up Scope

Document separately:

- drag-and-drop/importing images into canvas as new Raster Layers;
- snapping rules for current working bbox and Smart Patch Layer bbox;
- exact placement of zoom controls and interaction hints after UI layout exploration.

## Acceptance Criteria

- User can zoom with explicit controls and a percentage readout.
- User can fit the viewport to visible layers/content.
- User can fit the current working generation bbox to visible/selected Raster Layers.
- Smart Patch Layer exposes `Fit Patch BBox to Mask` in its contextual left toolbar.
- Regional Guidance Layer does not expose any bbox fit-to-mask action.
- Project save/load/export/snapshot/reset actions are not presented as primary canvas toolbar controls.
