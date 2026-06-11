# Image Size And Bounding Boxes

## Feature

Generate needs image size and bounding-box controls similar to Invoke, but with explicit ownership.

This document covers project/canvas sizing and bbox boundary rules. Smart Patch Layer's full ownership model lives in [Smart Patch Layer](./smart-patch-layer.md).

## Reference

Reference: InvokeAI Dimensions and Bbox controls.

## ImageGen Studio Decision

Separate three concepts in UI and state:

```text
Canvas Size
= size of the whole project canvas / final composition

Current Working Bounding Box
= the active generation area before it is attached to a Smart Patch Layer

Smart Patch Layer Bounding Box
= the bbox owned by one Smart Patch Layer
```

The UI must never collapse these into one ambiguous control.

## Canvas Size

Canvas Size changes the project canvas.

Controls:

- width;
- height;
- resize canvas;
- crop canvas;
- extend canvas;
- output/export size metadata where applicable.

Changing Canvas Size must not silently resize Smart Patch Layer bounding boxes.

## Current Working Bounding Box

The current working bbox is the Invoke-like generation bbox used when the user is preparing a generation operation.

It is used for:

- initial txt2img/new raster generation placement;
- creating a new Smart Patch Layer;
- setting the default area for a local patch operation;
- defining the area sent to the worker when no existing Smart Patch Layer owns the operation.

Controls:

- x/y when relevant;
- width;
- height;
- aspect ratio selector;
- swap width/height;
- lock aspect ratio;
- set optimal size for the selected model;
- fit to canvas;
- fit to visible/selected Raster Layers;
- scale before processing:
  - none;
  - auto;
  - manual internal width/height.

The canvas should expose direct bbox handles. Numeric controls are for precision and repeatability.

## Smart Patch Layer Bounding Box

When a Smart Patch Layer is selected, bbox editing switches from the current working bbox to the selected layer's owned bbox.

This bbox is part of Smart Patch Layer state. It is not a global project setting.

The selected Smart Patch Layer row/action bar shows a compact `Bounding Box` button or badge. Clicking it opens a popover with precision settings for that layer's bbox.

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

Canvas handles remain the primary way to move/resize the bbox. The popover is for exact values and less common actions.

Changing layer bbox or internal resolution marks the Smart Patch Layer as `outdated` if it already has an active raster sub-layer.

Hard rule: a Smart Patch Layer bbox is not a global project setting. It belongs to that layer. See [Smart Patch Layer](./smart-patch-layer.md) for the full layer-owned state model.

## Acceptance Criteria

- Canvas Size, current working bbox and Smart Patch Layer bbox are visually separate.
- User can edit bbox via canvas handles and numeric controls.
- Selected Smart Patch Layer exposes bbox precision editing through a compact popover.
- Selected Smart Patch Layer exposes `Fit Patch BBox to Mask` from its contextual toolbar.
- Regional Guidance Layer does not expose bbox controls.
- Changing Smart Patch bbox/internal resolution marks an existing result as `outdated`.
