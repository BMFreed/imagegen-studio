# Infinite Project Canvas And Generation Bounds

## Feature

Project Canvas is an unbounded composition space, as in InvokeAI. A finite, movable generation bounding box defines where a normal generation runs. Smart Patch Layers retain their own separate, layer-owned bounding boxes.

This document distinguishes the canvas coordinate space, generation targets, Raster Layer placement and export bounds. [Smart Patch Layer](./smart-patch-layer.md) owns the full local-editing contract.

## Reference

InvokeAI's canvas scene and draggable generation bbox are the primary interaction reference. Its `saveCanvasHooks.ts` and `copyHooks.ts` use visible Raster Layer bounds for the `canvas` region and the generation bbox for the `bbox` region; `useExportCanvasToPSD.ts` also derives a finite rectangle from visible Raster Layers. ImageGen Studio adopts that separation for normal image export versus an explicit bbox export.

Photoshop, Affinity Photo and Krita remain references for independent layer transforms and explicit raster export/crop operations. Their fixed document canvas is **not** the Project Canvas model adopted here.

## ImageGen Studio Decision

Keep these concepts separate in state and UI:

```text
Project Canvas = unbounded project-coordinate composition space
Primary Generation BBox = project-owned x/y/width/height for normal generation
Smart Patch BBox = layer-owned x/y/width/height for one Smart Patch Layer
Raster Layer Transform = placement/scale/rotation of one layer
Export Bounds = a finite rectangle chosen by an explicit export rule or user action
```

There is no fixed Project Canvas width/height and no document edge that generation or layers must stay inside. The previous rule that normal generation uses Project Canvas bounds, and the previous Smart Patch outpainting auto-expand rule, are retired. The primary generation bbox is the finite target for normal generation. It can be moved or resized independently of layers and may lie partly or wholly outside existing raster content.

The runtime derives txt2img/img2img/outpaint/inpaint from the frozen visible raster/mask content **inside the active target bbox**, without a manual mode switch. A Raster Layer elsewhere in the project does not turn an empty target into img2img.

## Project Canvas And Raster Layers

Project Canvas provides shared coordinates for Raster Layers, Smart Patch masks/bboxes and Regional Guidance regions. Pan, zoom and `Fit View` change only the viewport. Layer positions are not clipped by a document frame, and placing a new layer outside existing content does not resize a document.

Raster Layer transforms remain independent of either generation bbox. Normal generation never overwrites or moves an existing selected Raster Layer implicitly. After explicit acceptance, each selected normal candidate becomes a new Raster Layer placed at the frozen primary generation bbox coordinates. The accepted result can extend beyond every existing image; acceptance does not enlarge Project Canvas or silently change the primary bbox. Other accepted opaque alternatives begin hidden, as specified in [GenerationResults](./generation-results.md).

Project data must preserve negative and positive project coordinates. A finite rasterization rectangle is still required for worker input and export, but that rectangle is an operation input, not the boundary of Project Canvas.

## Primary Generation BBox

The project owns one default bbox for normal generation, separate from every Smart Patch Layer's bbox. It has x, y, width and height in project coordinates. A new Project starts at x=0, y=0 with width/height from New Project `Size` (1024 × 1024 by default), and its initial viewport fits that bbox. InvokeAI also starts its bbox at x=0, y=0, though ImageGen Studio uses its own default dimensions.

The `Size` controls edit bbox width/height, aspect ratio and swap. Manually entered numeric width/height edits commit on `Enter` after validation, without a separate `Apply` button; selecting a ratio preset that changes dimensions or swapping width/height applies immediately. The Project generation-area controls do not show numeric x/y: with the Bounding Box tool active and canvas focused, arrow keys move the bbox by one project pixel, or ten with Shift. Dragging the bbox also moves it freely; handles resize it, positional snapping is off by default, and coordinates may be negative. Worker/model constraints validate allowable generation dimensions without imposing a canvas boundary. These controls no longer edit a fixed document size.

Importing an image as a Raster Layer into an already open Project inserts it at the top of the compositing stack. Its initial transform places the image's top-left pixel at the current primary bbox origin (`x`, `y`), using the normalized image's own dimensions without automatically scaling it to the bbox. Import never moves or resizes the primary bbox implicitly. The user can select that visible Raster Layer and explicitly run `Fit to active layer` when the imported image should become the next generation target.

The `Size` card's existing aspect catalog remains useful: `Free`, `8:1`, `4:1`, `21:9`, `16:9`, `3:2`, `5:4`, `4:3`, `1:1`, `3:4`, `4:5`, `2:3`, `9:16`, `1:4`, `9:21`, `1:8`. Supported min/max dimensions and any model-specific size multiple constrain the **generation request**, not the canvas or bbox position. The prototype's 64–4096 clamp and grid-8 rounding are mock rules pending worker-specific validation.

At enqueue, freeze the bbox, target-area composite, prompts, model/resources and settings into the job. Moving the bbox or editing layers afterward must not change that job. The worker receives only the finite frozen bbox/composite, including transparent pixels where the bbox extends beyond current raster content. Generated candidates preview at the same project coordinates before acceptance.

`Fit to active layer` is a compact icon action in the `Generation area` heading, with an accessible name and tooltip. It fits the full x/y/width/height of the primary generation bbox to the currently selected **visible Raster Layer** (visibility enabled and opacity greater than zero). Without such a selection it is disabled; there is no fallback to the union of visible layers. It does not crop layers or move the viewport. `Fit View to layers` changes only the camera. Neither command is an export or destructive trim operation.

## Smart Patch Layer BBox

Selecting a Smart Patch Layer switches the active generation target to its owned bbox and binds the settings panel to its owned generation draft. Editing the primary bbox does not change that layer's geometry or mark it `outdated`; editing the Smart Patch bbox/internal resolution can mark it `outdated` when it has an accepted active variant.

The product design calls for canvas handles plus a compact selected-layer `Bounding Box` precision popover with x/y/width/height, internal resolution, aspect lock, fit-to-mask, fit-to-primary-bbox and scale-before-processing. `Fit Patch BBox to Mask` remains a Smart Patch contextual toolbar action. The current prototype shows bbox dimensions and deterministic fit-to-mask but no general pointer resize or numeric precision popover.

Smart Patch outpainting can place its bbox beyond existing raster content. Generation and `Add N as Variants` do not expand Project Canvas; there are no document bounds to expand. Existing Raster Layer pixels and transforms remain unchanged.

Regional Guidance owns a conditioning region/mask, not a generation bbox.

## Export And Crop Boundary

`File > Export As` uses the union of visible raster-content bounds as its default finite image-export rectangle. In ImageGen Studio that composited content includes visible Raster Layers and the active visible variants of Smart Patch Layers. Hidden layers/variants do not enlarge the default rectangle. An explicit `Export Generation BBox` action exports the current primary bbox region instead. The bbox is never silently treated as a document boundary.

If there is no visible raster content, image export is unavailable with an explanatory empty-state message; the user can still Save the `.igs` project. Custom export rectangles can be designed later. Exporting does not crop source layer assets. This follows InvokeAI's visible-content versus bbox region distinction while adapting it to Smart Patch compositing.

The first release composites and exports in sRGB. Import converts pixels with
an ICC profile to sRGB and retains the original ICC as layer metadata in
`.igs`; export does not silently inherit an arbitrary source layer's profile.

An explicit destructive trim/crop of Raster Layer pixel data, if added, is a separate operation from moving a generation bbox or exporting a finite region.

## Production image export checkpoint

[Project image export](../../../engineering/phase-4-project-image-export-research.md)
connects the production File menu to full-resolution canonical sRGB RGBA PNG.
`Export As…` uses actual visible-content alpha bounds from existing CPU composition,
including only active visible Smart world contributions; `Export Generation BBox…`
uses the current primary bbox even when a Smart Patch is selected. Empty visible
content refuses. A bbox outside otherwise visible content can export transparency.

Both actions use the existing Project CPU worker independently of CUDA readiness;
missing runtime or a legacy worker lacking `export-composition` refuses explicitly.
The export image ceiling is16384side/64M pixels, distinct from unchanged generation
limits. Over-budget exports refuse without downsampling; these are safety ceilings,
not qualified maximum capacity. A changed owner/revision/epoch/path refuses even
if Undo restored a portable revision. Cancel leaves no destination. Export is
create-only: an existing or racing destination stays unchanged; choose another
PNG filename. Export never Saves `.igs`, crops layers, accepts results, or rewrites
history/provenance/source assets. Custom rectangles and overwrite are outside this
finite consumer. Prototype mock actions are not production export evidence.

## Vue Prototype Gap

The current Project prototype still renders a finite `Project Canvas W × H` frame. Its `Size` card and `Crop / Resize Project Canvas` tool mutate or depict that finite frame, and its normal jobs target those bounds. This is **outdated prototype behavior**, not evidence that the infinite-canvas contract is implemented. The deterministic Smart Patch fit-to-mask command does not close this gap. Production work must replace the finite frame semantics, add movable/resizable primary bbox interactions, and place staged/accepted results by frozen bbox coordinates.

## Acceptance Criteria

- Project Canvas has no fixed width/height or clipping document edge.
- The primary normal-generation bbox is project-owned, movable and resizable, and may be outside all existing raster content.
- New Project initializes that bbox at (0, 0) with `Size` dimensions and fits the viewport to it; importing a Raster Layer into an open Project places it at the bbox origin on top of the compositing stack and leaves the bbox unchanged until explicit fit or edit.
- Project generation-area controls omit x/y inputs; with Bounding Box tool and canvas focus, arrows move the bbox by 1 px and Shift+arrows by 10 px. Dragging allows negative coordinates and does not snap by default. Only worker/model generation dimensions are constrained.
- `Size` edits primary generation bbox dimensions, not Project Canvas size; Smart Patch bbox remains layer-owned.
- Valid manually entered width/height edits commit on `Enter` without an `Apply` button; ratio presets that resize and width/height swap apply immediately. `Fit to active layer` is a compact icon, enabled only for a selected visible Raster Layer.
- Worker mode derives from visible content inside the frozen active bbox, and later canvas edits do not mutate queued jobs.
- Explicitly accepted normal results become new Raster Layers at the frozen bbox location without expanding canvas or overwriting existing layers.
- Smart Patch generation/acceptance beyond existing image content requires no canvas auto-expand.
- Viewport fit, bbox fit, export and destructive raster crop are distinct actions.
- The finite-canvas Vue prototype is recorded as a gap until its behavior is replaced and tested.
