# Project Canvas And Bounding Boxes

## Feature

Generate needs Photoshop/Affinity/Krita-like project canvas controls plus explicit Smart Patch bounding boxes.

This document defines the difference between the document work area, raster layer transforms and Smart Patch generation regions.

Smart Patch Layer's full ownership model lives in [Smart Patch Layer](./smart-patch-layer.md).

## Reference

Primary reference: Photoshop, Affinity Photo and Krita canvas/document models.

The shared pattern:

- canvas/document work area can be resized independently from layer pixels;
- raster layers can be smaller than, larger than or partially outside the canvas;
- layer transform and canvas resize are separate operations;
- canvas can be fit/trimmed/grown to layer or selection bounds;
- local editing tools may have their own generation/selection region.

InvokeAI bbox controls remain useful as implementation inspiration for grid-snapped handles, but ImageGen Studio does not model the whole project as a global Invoke-like generation bbox.

## ImageGen Studio Decision

Separate three concepts in UI and state:

```text
Project Canvas
= document work area / visible composition / default export bounds

Raster Layer Transform
= position/scale/rotation of an individual raster layer relative to Project Canvas

Smart Patch Layer Bounding Box
= layer-owned generation region for one Smart Patch Layer
```

The UI must never collapse these into one ambiguous control.

There is no separate `Current Working Bounding Box` for the whole image.

Normal generation targets the Project Canvas. Smart Patch generation targets the selected Smart Patch Layer's owned bbox. The runtime derives txt2img/img2img/outpaint/inpaint from visible raster/mask content inside that target rather than exposing those as manual Project modes.

## Project Canvas

Project Canvas is the document work area.

It defines:

- visible composition bounds;
- default generation bounds for normal non-Smart-Patch generation;
- default export bounds;
- the coordinate space in which layers, masks, regions and Smart Patch bboxes live.

Raster Layers can be:

- smaller than Project Canvas;
- larger than Project Canvas;
- partially outside Project Canvas;
- exactly aligned to Project Canvas.

Project Canvas resizing must not resample or transform Raster Layer pixels by default.

Controls:

- width;
- height;
- resize canvas/work area;
- crop canvas/work area;
- extend/grow canvas/work area;
- fit canvas to selected visible Raster Layers;
- fit canvas to all visible Raster Layers;
- fit canvas to selection where relevant;
- output/export size metadata where applicable.

The `Size` card exposes `Free` plus `8:1`, `4:1`, `21:9`, `16:9`, `3:2`, `5:4`, `4:3`, `1:1`, `3:4`, `4:5`, `2:3`, `9:16`, `1:4`, `9:21` and `1:8`. It includes a compact CSS aspect preview, ratio lock, swap and fit-to-visible-layers actions. Automatic calculations preserve approximate area, snap to the model grid and clamp the prototype canvas to 64–4096 pixels. No separate aspect-preview dependency is needed.

Changing Project Canvas size must not silently resize Raster Layers or Smart Patch Layer bounding boxes.

In the current Project prototype, Project Canvas numeric size controls live in the left `Size` section. Direct crop/resize manipulation is exposed as `Crop / Resize Project Canvas` in the left canvas rail. The canvas area may show a compact `Project Canvas W x H` label at the top-left edge as readout/context, but that label is not the primary editing control and must not cover important image content.

`Crop / Resize Project Canvas` behaves like a document work-area crop tool, not a Raster Layer crop tool:

- it changes Project Canvas bounds;
- it does not resample Raster Layer pixels;
- it does not transform Raster Layer positions;
- it preserves off-canvas layer pixels in `.igs`;
- destructive pixel trimming, if added later, must be an explicit separate command.

If Project Canvas shrinks, off-canvas layer pixels are preserved in `.igs` unless the user explicitly trims/crops layer pixel data.

## Raster Layer Transform

Raster Layer Transform is separate from Project Canvas resizing.

It controls:

- x/y position;
- scale;
- rotation;
- future crop/trim behavior if added later.

MVP does not expose full Raster Layer editing by default, but the document model must support layer bounds that differ from Project Canvas bounds.

InvokeAI's entity transform implementation can be used as a reference when ImageGen Studio adds Raster Layer transform controls.

## Smart Patch Layer Bounding Box

When a Smart Patch Layer is selected, bbox editing targets the selected layer's owned bbox.

This bbox is part of Smart Patch Layer state. It is not a global project setting.

The product design calls for a compact `Bounding Box` precision action/popover for the selected Smart Patch Layer. The current Vue prototype shows bbox dimensions in selected-layer details and exposes `Bounding Box` plus `Fit Patch BBox to Mask` in the contextual canvas rail; it does not yet implement the numeric precision popover.

Popover controls:

- x;
- y;
- width;
- height;
- internal resolution width;
- internal resolution height;
- aspect lock;
- fit to mask, exposed primarily as `Fit Patch BBox to Mask` in the Smart Patch Layer contextual toolbar;
- fit to canvas;
- scale before processing.

In the production interaction, canvas handles remain the primary way to move/resize the bbox and the popover is for exact values and less common actions. Current prototype handles are visual coverage only.

Changing layer bbox or internal resolution marks the Smart Patch Layer as `outdated` if it already has an active raster sub-layer.

Hard rule: a Smart Patch Layer bbox is not a global project setting. It belongs to that layer. See [Smart Patch Layer](./smart-patch-layer.md) for the full layer-owned state model.

## Outpainting Auto-Expand

Smart Patch Layer supports outpainting.

If a Smart Patch Layer bbox extends beyond Project Canvas bounds, ImageGen Studio should automatically expand Project Canvas to include the full Smart Patch bbox before or as part of the generation action.

Rules:

- auto-expand is undoable as part of the same user action;
- expansion preserves all existing Raster Layer pixels and transforms;
- expansion preserves Smart Patch mask/bbox coordinates in project space;
- expansion should snap to required model/grid constraints where needed;
- UI should preview or clearly indicate the canvas growth before generation when the change is non-trivial;
- user should not need to manually resize Project Canvas just to perform a straightforward outpaint.

This behavior follows the creative-editor mental model: the canvas grows to provide more work area, while layer pixels and local patch state remain their own objects.

## Vue Prototype Coverage

The Size card currently implements numeric dimensions, the full documented aspect catalog, lock/unlock, a CSS ratio preview, swap and deterministic fit-to-visible-layer bounds. Automatic ratio calculations use the documented 64–4096 clamp and grid-8 rounding.

The canvas renders separate Project Canvas, Smart Patch bbox and mask overlays. `Fit Patch BBox to Mask` writes deterministic owned bbox values and marks an existing patch outdated. Arbitrary bbox handle dragging, numeric x/y/width/height editing, Crop/Resize commit/cancel and outpainting auto-expansion are not implemented in the Vue prototype yet.

## Acceptance Criteria

- Project Canvas, Raster Layer transform and Smart Patch Layer bbox are visually separate.
- There is no global/current working bbox separate from Project Canvas.
- Normal generation uses Project Canvas as its target bounds.
- User can resize/grow/fit Project Canvas without transforming layer pixels.
- Project Canvas numeric resize/fit controls are presented in the `Size` section.
- Direct Project Canvas crop/resize is available from the left canvas rail as `Crop / Resize Project Canvas`.
- The canvas area shows a compact size readout, not a primary editing control.
- Raster Layers may be smaller, larger or partially outside Project Canvas.
- Product implementation lets the user edit Smart Patch bbox through canvas handles and numeric controls; current prototype coverage is limited to visual handles, read-only dimensions and deterministic fit-to-mask.
- A compact bbox precision popover remains unimplemented in the current prototype.
- Selected Smart Patch Layer exposes `Fit Patch BBox to Mask` from its contextual toolbar.
- Regional Guidance Layer does not expose bbox controls.
- Smart Patch outpainting auto-expansion remains product behavior and is not simulated by the current prototype.
- Changing Smart Patch bbox/internal resolution marks an existing result as `outdated`.
