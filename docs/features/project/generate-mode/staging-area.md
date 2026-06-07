# StagingArea

## Feature

`StagingArea` lets the user generate temporary candidate results, inspect them before committing, keep useful variants, accept one active result, or discard candidates.

This applies to:

- new raster generation;
- Smart Patch Layer regeneration with mask;
- dynamic prompting or multi-output generation when it produces multiple candidates.

## Reference

Reference: InvokeAI Canvas `StagingArea`.

Useful Invoke source areas:

- `features/controlLayers/components/StagingArea/state.ts` — queue item tracking, flattened entries, selection, accept/discard, auto-switch;
- `features/controlLayers/components/StagingArea/context.tsx` — app integration and accept behavior;
- `features/controlLayers/components/StagingArea/StagingAreaToolbar.tsx` — toolbar actions;
- `features/controlLayers/components/StagingArea/StagingAreaItemsList.tsx` — thumbnail strip;
- `features/controlLayers/components/StagingArea/QueueItemPreviewMini.tsx` — candidate thumbnail/status/progress preview.

ImageGen Studio should copy this interaction closely because the Invoke flow is already useful: generated candidates enter a staging area, the user navigates them, accepts a chosen candidate, or discards one/all candidates.

## ImageGen Studio Decision

Multiple generated candidates should not immediately clutter the canvas/layer stack.

Candidates first appear in `StagingArea`. They are temporary session candidates, not permanent project/layer variants.

For Smart Patch Layer, permanent variants live as raster sub-layers inside the Smart Patch Layer. StagingArea candidates become permanent only when the user explicitly keeps or accepts them.

## Scope

MVP:

- generate several candidate images for one Generate action;
- show candidates in an Invoke-like `StagingArea`;
- let the user inspect candidates before committing;
- keep selected candidate as a permanent Smart Patch Layer variant when the target is Smart Patch;
- keep all candidates as permanent Smart Patch Layer variants when the target is Smart Patch;
- accept/use selected candidate as active;
- discard selected candidate;
- discard all candidates;
- show `Kept` status for already saved candidates;
- navigate previous/next;
- show candidate count;
- show thumbnails;
- toggle staged result visibility on canvas;
- support auto-switch modes;
- support this flow for Smart Patch Layer mask regeneration;
- store generation snapshot for the committed candidate.

Post-MVP:

- keep rejected candidates as optional history;
- compare candidates side by side;
- commit multiple candidates as separate raster layers for non-Smart-Patch workflows;
- mark/favorite candidates before committing.

## Candidate Lifecycle

Suggested lifecycle:

```text
queued
↓
generating
↓
candidate ready
↓
StagingArea
↓
keep selected / keep all / use as active
↓
write raster asset + snapshot into .igs
```

During staging, candidates may live as temporary worker/app-cache outputs.

Only kept or accepted candidates become project state.

## Temporary vs Permanent

StagingArea candidates are temporary.

They may have:

- temp asset ref;
- progress image;
- completed image data;
- source queue/job item;
- candidate index.

They are not part of `.igs` project state until the user performs an explicit keep/accept action.

Smart Patch Layer variants are permanent.

They are stored as raster sub-layers inside the Smart Patch Layer:

```text
Smart Patch Layer
├─ Variant 04 [active]
├─ Variant 03
├─ Variant 02
└─ Variant 01
```

Only one permanent variant can be active/visible at a time.

## Entry Model

Invoke flattens staged results into entries: each output image becomes a navigable entry, even if it came from a multi-output queue item.

ImageGen Studio should follow the same model:

```text
Queue item
├─ output image 0 -> StagingArea entry 0
├─ output image 1 -> StagingArea entry 1
└─ output image 2 -> StagingArea entry 2
```

Each entry tracks:

- queue/job item id;
- output image index;
- candidate asset/temp ref;
- status: pending, in progress, completed, failed, canceled;
- progress event;
- progress image if available;
- loaded image state.

## Toolbar Behavior

MVP toolbar actions:

- show/hide thumbnails;
- previous;
- next;
- image count;
- keep selected;
- keep all;
- use selected as active / accept selected;
- show/hide staged result on canvas;
- discard selected;
- discard all;
- auto-switch mode.

Invoke also has `Save Selected to Gallery`. ImageGen Studio adapts this idea for Smart Patch as `Keep Variant`.

## Keep And Accept Behavior

For Smart Patch Layer:

- `Keep Variant` saves the selected temporary candidate as a permanent raster sub-layer, but keeps StagingArea open;
- `Keep All` saves all completed temporary candidates as permanent raster sub-layers, but keeps StagingArea open;
- `Use as Active` / `Accept` saves the selected candidate if it is not already kept, makes its raster sub-layer active, and closes or clears the relevant StagingArea session;
- kept candidates show a `Kept` badge in StagingArea;
- `Discard Selected` removes the temporary candidate from StagingArea but must not delete an already kept permanent raster sub-layer;
- deleting a kept variant happens from the Smart Patch Layer variants list, not from StagingArea discard.

For non-Smart-Patch raster generation, MVP can keep Invoke-like accept behavior:

- `Accept` writes the selected candidate as a raster layer;
- unaccepted candidates remain temporary unless a later feature adds keep/save behavior for generic raster outputs.

## Auto-Switch

Use Invoke-like auto-switch modes:

- `off` — do not automatically switch selected candidate;
- `switch_on_start` — switch to a candidate when its job starts;
- `switch_on_finish` — switch to a candidate when its image is loaded/completed.

Default can follow Invoke's `switch_on_start` unless later UX testing shows it feels too jumpy.

## Smart Patch Behavior

For Smart Patch Layer regeneration:

- all candidates are generated from the same layer-owned mask, layer-owned bbox, internal resolution and generation settings;
- StagingArea shows each candidate in the patch/canvas context;
- `Keep Variant` can save multiple candidates as permanent raster sub-layers;
- `Use as Active` chooses which kept/accepted raster sub-layer becomes active;
- unkept candidates remain temporary and can be discarded.

This preserves the rule that only one raster sub-layer inside one Smart Patch Layer can be active/visible at a time.

## Acceptance Criteria

- User can generate multiple candidates and inspect them in StagingArea before committing.
- StagingArea supports thumbnails, previous/next, accept selected, discard selected and discard all.
- StagingArea candidates are documented as temporary, while Smart Patch raster sub-layer variants are permanent project state.
- User can keep more than one Smart Patch candidate as permanent variants.
- Kept candidates show a `Kept` status in StagingArea.
- Discarding a kept candidate from StagingArea does not delete its permanent Smart Patch raster sub-layer.
- StagingArea supports show/hide staged result on canvas.
- StagingArea supports auto-switch modes.
- Smart Patch Layer mask regeneration supports StagingArea.
- Unselected candidates do not automatically clutter the layer stack.
- The committed candidate is stored as a normal raster result with an immutable generation snapshot.
