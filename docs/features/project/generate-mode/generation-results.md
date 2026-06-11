# GenerationResults

## Feature

`GenerationResults` lets the user inspect, navigate, activate and clean up the latest generated results.

Unlike InvokeAI `StagingArea`, ImageGen Studio does not treat completed generated results as temporary by default. A generated image is project material immediately.

This applies to:

- new raster generation;
- Smart Patch Layer regeneration with mask;
- dynamic prompting or multi-output generation when it produces multiple results.

## Reference

Reference: InvokeAI Canvas `StagingArea`.

Useful Invoke source areas:

- `features/controlLayers/components/StagingArea/state.ts` — queue item tracking, flattened entries, selection and auto-switch;
- `features/controlLayers/components/StagingArea/context.tsx` — app integration;
- `features/controlLayers/components/StagingArea/StagingAreaToolbar.tsx` — toolbar shape;
- `features/controlLayers/components/StagingArea/StagingAreaItemsList.tsx` — thumbnail strip;
- `features/controlLayers/components/StagingArea/QueueItemPreviewMini.tsx` — result thumbnail/status/progress preview.

ImageGen Studio adapts the navigation and preview UX, but changes the persistence model.

## ImageGen Studio Decision

Generated results are auto-committed into `.igs`.

The product philosophy is:

```text
generated result = project state
```

The user should not lose useful generation results because they forgot to press `Keep`.

`GenerationResults` is therefore not a temporary staging area. It is a recent-results tray for already saved outputs.

## Scope

MVP:

- generate several result images for one Generate action;
- auto-create persistent project outputs for every completed result;
- show those new outputs in `GenerationResults`;
- navigate previous/next;
- show result count;
- show thumbnails;
- activate/select one result;
- show/hide selected result on canvas where relevant;
- delete selected result;
- delete all generated results from the current result set;
- delete all except active/selected;
- support auto-switch modes;
- support Smart Patch Layer mask regeneration;
- store generation snapshot for every generated result.

Post-MVP:

- compare results side by side;
- mark/favorite results;
- group generated raster layers into named result sets;
- cleanup assistant for old generated results.

## Persistence Model

Every completed result is written to project state.

For normal generation targeting Project Canvas:

```text
Generate action
├─ output image 0 -> Raster Layer 01
├─ output image 1 -> Raster Layer 02
└─ output image 2 -> Raster Layer 03
```

For Smart Patch Layer regeneration:

```text
Smart Patch Layer
├─ output image 0 -> Variant 01
├─ output image 1 -> Variant 02
└─ output image 2 -> Variant 03
```

Each result stores:

- raster asset id;
- generation snapshot;
- source queue/job item id;
- output image index;
- result set id;
- created-at timestamp.

## Result Set Model

Invoke flattens staged outputs into entries: each output image becomes navigable, even if it came from a multi-output queue item.

ImageGen Studio should follow that navigation model, but each entry points to a persistent project object:

```text
Queue item
├─ output image 0 -> GenerationResults entry -> Raster Layer / Smart Patch Variant
├─ output image 1 -> GenerationResults entry -> Raster Layer / Smart Patch Variant
└─ output image 2 -> GenerationResults entry -> Raster Layer / Smart Patch Variant
```

Each entry tracks:

- result set id;
- queue/job item id;
- output image index;
- target type: `raster-layer` or `smart-patch-variant`;
- target id;
- status: pending, in progress, completed, failed, canceled;
- progress event;
- progress image if available;
- loaded image state.

Pending/in-progress entries may be temporary worker state until completion. Completed entries immediately create persistent project outputs.

## Toolbar Behavior

MVP toolbar actions:

- show/hide thumbnails;
- previous;
- next;
- result count;
- set selected as active;
- show/hide selected result on canvas where relevant;
- delete selected;
- delete all in result set;
- delete all except active/selected;
- regenerate more;
- auto-switch mode.

`Keep Variant` and `Keep All` are not needed because completion already commits results.

## Activation And Deletion Behavior

For Smart Patch Layer:

- each completed result becomes a permanent raster sub-layer variant;
- `Set Active` chooses which variant is active/visible;
- only one permanent variant can be active/visible at a time;
- `Delete Selected` deletes the corresponding permanent raster sub-layer variant;
- `Delete All Except Active` keeps the active variant and deletes the other variants from that result set.

For normal raster generation:

- each completed result becomes a Raster Layer;
- `Set Active` selects/focuses the corresponding Raster Layer and may hide/show siblings according to current UI mode;
- `Delete Selected` deletes the corresponding Raster Layer;
- `Delete All Except Active` keeps the active/selected Raster Layer and deletes the other layers from that result set.

Because deletion affects persistent project state, it must participate in the app's undo/confirm policy. Until that policy is fully defined, destructive batch deletion should require confirmation.

## Auto-Switch

Use Invoke-like auto-switch modes:

- `off` — do not automatically switch selected result;
- `switch_on_start` — switch to a result entry when its job starts;
- `switch_on_finish` — switch to a result entry when its image is loaded/completed.

Default can follow Invoke's `switch_on_start` unless UX testing shows it feels too jumpy.

## Smart Patch Behavior

For Smart Patch Layer regeneration:

- all results are generated from the same layer-owned mask, layer-owned bbox, internal resolution and generation settings;
- every completed result becomes a permanent raster sub-layer variant;
- `GenerationResults` shows each new variant in patch/canvas context;
- `Set Active` chooses which raster sub-layer becomes active;
- deleting from `GenerationResults` deletes the saved raster sub-layer variant.

This preserves the rule that only one raster sub-layer inside one Smart Patch Layer can be active/visible at a time.

## Layer Stack Relationship

Layer stack should stay compact.

For Smart Patch Layer, the layer row shows the active raster thumbnail and a variant count. It does not expand into a long column of saved variant thumbnails by default.

`GenerationResults` is the richer browser for recently generated variants/results.

## Acceptance Criteria

- User can generate multiple results and inspect them in `GenerationResults`.
- Completed results are automatically persisted into `.igs`.
- Normal Project Canvas generation creates persistent Raster Layers for all completed outputs.
- Smart Patch regeneration creates persistent raster sub-layer variants for all completed outputs.
- `GenerationResults` supports thumbnails, previous/next, set active, delete selected and delete all except active.
- `GenerationResults` supports show/hide selected result on canvas where relevant.
- `GenerationResults` supports auto-switch modes.
- Smart Patch Layer mask regeneration supports `GenerationResults`.
- Every completed result stores an immutable generation snapshot.
- Deleting from `GenerationResults` is documented as deletion of persistent project state, not temporary preview cleanup.
