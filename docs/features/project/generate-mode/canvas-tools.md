# Canvas Tools

## Feature

Generate canvas tools provide direct manipulation for masks, regional guidance regions and Smart Patch bounding boxes.

## Reference

Reference: InvokeAI canvas interaction patterns, adapted to ImageGen Studio's document-owned canvas entities. The current Vue prototype uses DOM/CSS; the production renderer remains a separate implementation decision.

## ImageGen Studio Decision

Canvas is the central working surface inside `Project` / `Generate`.

For the product, panels and popovers provide precision editing while direct canvas manipulation remains the primary interaction path. The Vue prototype currently validates tool availability, selection and deterministic state transitions rather than production pixel manipulation.

MVP canvas tools are scoped to generative editing primitives. ImageGen Studio does not try to become a raster editor in MVP.

## Scope

Always-visible side controls:

- collapse left panel;
- `Pan Tool`;
- `Crop / Resize Project Canvas`;
- collapse right panel.

`Pan Tool` is not a separate `Viewer` mode. It is the default navigation/inspection tool for pan, zoom, fit view and non-editing canvas interaction.

`Crop / Resize Project Canvas` edits the document work area bounds. It does not crop, resample or transform Raster Layer pixels. Layer pixels outside the Project Canvas remain preserved in `.igs` unless the user later runs an explicit destructive trim/export action.

Contextual tools when a Smart Patch Layer is selected:

- Transform Mask;
- Lasso;
- Polygon Lasso;
- Brush;
- Eraser;
- Bounding Box;
- Fit Patch BBox to Mask.

Contextual tools when a Regional Guidance Layer is selected:

- Transform Region;
- Lasso;
- Polygon Lasso;
- Brush;
- Eraser.

Raster Layer canvas editing is not in MVP.

Post-MVP:

- more transform modes;
- alignment/snapping;
- advanced brush engines;
- raster layer transform/crop/paint if ImageGen Studio later decides to become more than a generative editing workspace;
- tiled preview/performance tooling.

## UI Rules

Canvas tools should be close to the canvas and visually distinct from project mode tabs.

Tools should not be visible in Home preview unless they actually work there. Home preview gets viewer tools only: pan, zoom, fit view and project actions.

Generate canvas tools should not create a separate `Viewer` mode.

Side toolbars/tool rails:

- tool rails are solid light vertical panels, visually distinct from the dark checkerboard canvas background;
- panel collapse controls are always available at the canvas edges;
- `Pan Tool` is always available on the left rail;
- `Crop / Resize Project Canvas` is always available on the left rail;
- the Project Canvas size label is a `canvas-area` overlay, not a child of the canvas frame; a separate canvas context menu is not present in the current prototype;
- layer-specific editing tools appear only when a compatible layer is selected;
- layer selection in the right panel drives the contextual tool rail; there are no visible prototype state tabs in the product UI;
- Smart Patch mask/bbox tools appear in the Smart Patch contextual tool rail when Smart Patch Layer is selected;
- Regional Guidance region/mask tools appear in the Regional Guidance contextual tool rail when Regional Guidance Layer is selected;
- Raster Layer selection does not show raster editing tools in MVP.

`Fit Patch BBox to Mask` is shown in the Smart Patch Layer contextual left toolbar. It is not a global canvas toolbar action.

## Transform Tools

`Transform Mask` for Smart Patch Layer:

- moves, scales and rotates the layer-owned mask;
- does not move active raster sub-layer pixels;
- does not move or resize the Smart Patch Layer Bounding Box;
- uses the layer-owned mask as the transform target.

`Fit Patch BBox to Mask` for Smart Patch Layer:

- reads the selected Smart Patch Layer's owned mask bounds;
- expands the rect by required mask blur/padding;
- fits the rect to the model/bbox grid size;
- writes the result to the selected Smart Patch Layer's owned Bounding Box;
- is not available when no Smart Patch Layer is selected.

`Transform Region` for Regional Guidance Layer:

- moves, scales and rotates the layer-owned region/mask;
- does not expose Bounding Box controls because Regional Guidance Layer does not have a generation bbox;
- uses the regional guidance region/mask as the transform target.

Regional Guidance Layer does not expose `Fit Patch BBox to Mask` or any other bbox fit-to-mask command, because it has no generation bbox.

InvokeAI image/entity transform code can be used as an implementation reference, but ImageGen Studio applies this interaction to owned masks/regions, not to raster image editing.

## Exclusions

Not in MVP:

- raster pixel painting;
- raster layer transform;
- raster crop;
- raster filters;
- full image editor behavior for ordinary Raster Layers.

## Vue Prototype Coverage

Implemented:

- one vertically centered left rail containing the always-visible settings-panel collapse, Pan and Crop/Resize buttons plus contextual tools; the right-panel collapse button stays centered at its edge;
- context-specific Smart Patch and Regional Guidance tool rails;
- active/pressed tool state, accessible names and contextual viewport hints;
- pointer pan and viewport zoom;
- deterministic Smart Patch mask-revision/outdated transitions;
- deterministic `Fit Patch BBox to Mask` geometry update.

Simulated or not implemented:

- Brush, Eraser, Lasso, Polygon Lasso, Transform Mask and Transform Region do not create production raster/vector masks;
- bbox and crop handles are visual overlays rather than general pointer-resize implementations;
- there is no precision bbox popover, snapping engine, rotation transform or production compositor;
- Raster Layer pixel/transform editing remains absent.

## Acceptance Criteria

- Product canvas supports direct mask/region/bbox manipulation; the Vue prototype currently validates tool selection and deterministic revision/fit transitions only.
- Precision controls exist in panels/popovers where needed.
- Generate does not expose inactive Launchpad/Viewer controls.
- Pan Tool is available as the neutral canvas navigation tool.
- Crop / Resize Project Canvas is available as a Project Canvas tool, not a Raster Layer crop tool.
- Raster Layer canvas editing is not exposed in MVP.
- Smart Patch Layer selection shows Transform Mask, Lasso, Polygon Lasso, Brush, Eraser and Bounding Box.
- Smart Patch Layer selection shows `Fit Patch BBox to Mask` in its contextual toolbar.
- Regional Guidance Layer selection shows Transform Region, Lasso, Polygon Lasso, Brush and Eraser.
- Regional Guidance Layer selection does not show bbox actions.
- Upscale handoff controls are deferred to the future Upscale feature pass.
