# Canvas Viewport Controls

## Feature

Generate mode needs compact viewport controls, canvas-area metadata/actions and a clear place for Project Canvas work-area actions.

The current Project prototype does not use a large top canvas toolbar. Viewport controls live in a bottom bar attached to the canvas area. Project Canvas numeric sizing lives in the left `Size` section, while direct Project Canvas crop/resize manipulation lives in the left canvas rail.

## Reference

Reference: InvokeAI canvas toolbar, adapted to ImageGen Studio's document-based `.igs` workflow.

Useful InvokeAI reference points:

- `features/controlLayers/components/Toolbar/CanvasToolbarScale.tsx` — zoom out, percent input/dropdown and zoom in;
- `features/controlLayers/components/Toolbar/CanvasToolbarResetViewButton.tsx` — fit visible layers to the stage;
- `features/controlLayers/components/Toolbar/CanvasToolbarFitBboxToLayersButton.tsx` — useful as a reference for fitting a rect to visible layer bounds, adapted as Project Canvas fit/grow behavior;
- `features/controlLayers/components/Toolbar/CanvasToolbarFitBboxToMasksButton.tsx` — useful behavior, but moved out of the global toolbar in ImageGen Studio;
- `features/controlLayers/components/Toolbar/CanvasToolbarProjectMenuButton.tsx`, `CanvasToolbarSnapshotMenuButton.tsx`, `CanvasToolbarSaveToGalleryButton.tsx` and `CanvasToolbarNewSessionMenuButton.tsx` — rejected as top-toolbar patterns for ImageGen Studio.

## ImageGen Studio Decision

Use Invoke's proven viewport and rect-fitting commands, but do not copy its global bbox or file/session toolbar model.

ImageGen Studio treats `.igs` as the default project document. Saving, opening, exporting and project-level reset commands belong in the app menu, project menu or command palette, not in the canvas toolbar.

## MVP Scope

Include in the bottom viewport bar:

- zoom out;
- zoom percent input/dropdown;
- zoom in;
- `Fit View`;
- context-sensitive interaction hints.

`Fit View to Layers` changes only the viewport/camera. It does not mutate layers, Project Canvas size or Smart Patch bbox.

`Fit Project Canvas to Layers` / `Fit Size to Layers` changes Project Canvas size. It is used for the common workflow where the user drops or imports a large image as a Raster Layer and wants the document work area/export bounds to match that visible content.

This command belongs in the left `Size` section, not in the bottom viewport bar, so the user does not see two visually similar `fit` controls doing different things.

`Crop / Resize Project Canvas` is the direct manipulation tool for changing the document work area by dragging handles on canvas. It changes Project Canvas bounds only. It does not crop, resample or transform Raster Layer pixels.

When fitting Project Canvas to layers:

- prefer selected visible Raster Layers when there is an explicit layer selection;
- otherwise use the bounds of visible Raster Layers;
- ignore hidden layers;
- preserve Raster Layer pixels and transforms;
- preserve Smart Patch Layer bboxes and masks in project coordinates;
- support undo/redo;
- after Project Canvas is updated, the viewport may also fit the relevant layers for convenience.

Canvas-area overlays:

- Project Canvas size label sits at the top-left edge of the `canvas-area`;
- the canvas context menu button sits at the top-right edge of the `canvas-area`;
- both overlays are outside the canvas frame/wrapper so they do not cover the image content itself;
- contextual menus may include canvas/layer actions, but primary save/load/export/reset commands remain outside this control.

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

Canvas interaction hints are required and live in the bottom viewport bar in the current prototype.

The hint area should be context-sensitive:

- `Pan Tool` shows pan/zoom/fit hints;
- `Crop / Resize Project Canvas` shows crop/resize/commit/cancel hints;
- `Bounding Box` shows move/resize/snap/aspect hints;
- `Transform Mask` shows move/scale/rotate hints;
- Lasso/Polygon Lasso/Brush/Eraser show mask editing hints.

Hints must not appear as inactive chrome in Home previews.

## Follow-Up Scope

Document separately:

- drag-and-drop/importing images into canvas as new Raster Layers;
- snapping rules for Project Canvas resize/grow and Smart Patch Layer bbox;
- exact design of the canvas context menu.

## Acceptance Criteria

- User can zoom with explicit controls and a percentage readout.
- User can fit the viewport to visible layers/content.
- User can fit Project Canvas to visible/selected Raster Layers from the left `Size` section.
- User can directly crop/resize Project Canvas from the left canvas rail without destructive Raster Layer crop.
- Project Canvas size label and canvas context menu are positioned as `canvas-area` overlays, not inside the image/canvas frame.
- Smart Patch Layer exposes `Fit Patch BBox to Mask` in its contextual left toolbar.
- Regional Guidance Layer does not expose any bbox fit-to-mask action.
- Project save/load/export/snapshot/reset actions are not presented as primary canvas toolbar controls.
