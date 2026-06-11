# Generate Action Behavior

## Feature

Pressing `Generate` creates one or more generation jobs from current Generate state.

## Reference

Reference: InvokeAI generation queue behavior, adapted to ImageGen Studio `.igs` project storage and Smart Patch Layer model.

See also: [Queue Manager](../../queue-manager.md).

## ImageGen Studio Decision

Generation output is written into the open project as raster assets and immutable generation snapshots.

The generation target depends on selection/context:

- no Smart Patch Layer target: create/fill a raster layer;
- Smart Patch Layer target: regenerate that Smart Patch Layer by creating a new raster sub-layer;
- regional guidance entities: included as conditioning data when supported.

When a Generate action produces multiple results, each completed result is written into project state immediately and appears in [GenerationResults](./generation-results.md) for review, activation and cleanup.

Pressing `Generate` does not call the worker directly. It creates one or more Queue Manager items from frozen project/generation state. The queued jobs must not change if the user edits prompts, layers, masks or bbox while they are pending.

## New Raster Generation

When no Smart Patch Layer is the generation target:

- worker receives prompt/settings/model resources;
- worker receives current working bbox/dimensions;
- each completed result is stored as a raster asset inside `.igs`;
- each completed result creates a new Raster Layer or fills an explicitly selected empty target layer;
- every result stores its own generation snapshot;
- all new results appear in `GenerationResults`.

## Smart Patch Regeneration

When a Smart Patch Layer is the generation target:

- worker receives the flattened source composite for the layer bbox;
- worker receives the layer mask;
- worker receives the layer-owned bounding box;
- worker receives the layer internal resolution;
- worker receives prompt/settings/model resources;
- each completed result is stored as a raster asset inside `.igs`;
- each completed result creates a new raster sub-layer variant inside the Smart Patch Layer;
- the selected/auto-switched raster sub-layer becomes active;
- the Smart Patch Layer status becomes `ready`;
- previous raster sub-layers remain available but inactive.

If multiple Smart Patch results are generated, all completed results become permanent Smart Patch raster sub-layer variants. `Set Active` chooses which variant becomes active. Unwanted variants are removed through `GenerationResults` or the Smart Patch variant controls.

## Dynamic Prompt Expansion

Dynamic prompting can expand one visible Generate action into multiple concrete jobs.

Each generated result stores the concrete expanded prompt used for that result.

Every concrete prompt/seed combination becomes its own queue item, grouped by one batch id for the originating user action.

## Generate To Upscale

`Send Composite to Upscale` is not a normal generation job.

It:

- takes flattened composite of visible layers;
- creates immutable upscale input asset inside `.igs`;
- stores source metadata;
- switches Project to `Upscale`.

## Acceptance Criteria

- Generate creates raster output inside the open `.igs`.
- Generate creates queue items from frozen project/generation state.
- Smart Patch regeneration can create one or more raster sub-layer variants, with only one active.
- Multi-result generation auto-commits completed outputs and shows them in `GenerationResults`.
- Dynamic prompt expansion can create multiple concrete jobs.
- `Send Composite to Upscale` creates an immutable input and switches mode.
