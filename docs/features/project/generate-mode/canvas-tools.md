# Canvas Tools

## Feature

Generate canvas tools provide direct manipulation for layers, masks and bounding boxes.

## Reference

Reference: InvokeAI canvas interaction patterns, adapted to ImageGen Studio's Konva-based canvas pipeline.

## ImageGen Studio Decision

Canvas is the central working surface inside `Project` / `Generate`.

Panels and popovers provide precision editing, but direct canvas manipulation remains the primary interaction path.

## Scope

MVP tools:

- select/move;
- pan;
- zoom;
- bbox edit;
- raster layer transform;
- Smart Patch mask brush;
- Smart Patch mask eraser;
- mask visibility toggle;
- fit view;
- actual size;
- send composite to Upscale.

Post-MVP:

- more transform modes;
- alignment/snapping;
- advanced brush engines;
- tiled preview/performance tooling.

## UI Rules

Canvas tools should be close to the canvas and visually distinct from project mode tabs.

Tools should not be visible in readonly Home preview unless they actually work there. Readonly preview gets viewer tools only: pan, zoom, fit view and project actions.

Generate canvas tools should not create a separate `Viewer` mode.

## Acceptance Criteria

- User can manipulate bbox, masks and raster layers directly on canvas.
- Precision controls exist in panels/popovers where needed.
- Generate does not expose inactive Launchpad/Viewer controls.
- `Send Composite to Upscale` is available from Generate.
