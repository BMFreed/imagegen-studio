# Canvas Tools

## Feature

Generate canvas tools provide direct manipulation for masks, regional guidance regions and Smart Patch bounding boxes.

## Reference

Reference: InvokeAI canvas interaction patterns, adapted to ImageGen Studio's Konva-based canvas pipeline.

## ImageGen Studio Decision

Canvas is the central working surface inside `Project` / `Generate`.

Panels and popovers provide precision editing, but direct canvas manipulation remains the primary interaction path.

MVP canvas tools are scoped to generative editing primitives. ImageGen Studio does not try to become a raster editor in MVP.

## Scope

Always-visible side controls:

- collapse left panel;
- `View`;
- collapse right panel.

`View` is not a separate `Viewer` mode. It is the default navigation/inspection tool for pan, zoom, fit view and non-editing canvas interaction.

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

Tools should not be visible in readonly Home preview unless they actually work there. Readonly preview gets viewer tools only: pan, zoom, fit view and project actions.

Generate canvas tools should not create a separate `Viewer` mode.

Side toolbars/tool rails:

- panel collapse controls are always available at the canvas edges;
- `View` is always available on the left side;
- layer-specific editing tools appear only when a compatible layer is selected;
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

## Acceptance Criteria

- User can manipulate masks, regional guidance regions and Smart Patch bounding boxes directly on canvas.
- Precision controls exist in panels/popovers where needed.
- Generate does not expose inactive Launchpad/Viewer controls.
- Raster Layer canvas editing is not exposed in MVP.
- Smart Patch Layer selection shows Transform Mask, Lasso, Polygon Lasso, Brush, Eraser and Bounding Box.
- Smart Patch Layer selection shows `Fit Patch BBox to Mask` in its contextual toolbar.
- Regional Guidance Layer selection shows Transform Region, Lasso, Polygon Lasso, Brush and Eraser.
- Regional Guidance Layer selection does not show bbox actions.
- `Send Composite to Upscale` is available from Generate.
