# Generate Action Behavior

## Feature

Pressing `Generate` creates one or more generation jobs from current Generate state.

## Reference

Reference: InvokeAI generation queue behavior, adapted to ImageGen Studio `.igs` project storage and Smart Patch Layer model.

## ImageGen Studio Decision

Generation output is written into the open project as raster assets and immutable generation snapshots.

The generation target depends on selection/context:

- no Smart Patch Layer target: create/fill a raster layer;
- Smart Patch Layer target: regenerate that Smart Patch Layer by creating a new raster sub-layer;
- regional guidance entities: included as conditioning data when supported.

When a Generate action produces multiple candidates, results first enter [StagingArea](./staging-area.md). StagingArea candidates are temporary. Kept or accepted candidates are written into the project/layer as final project state.

## New Raster Generation

When no Smart Patch Layer is the generation target:

- worker receives prompt/settings/model resources;
- worker receives current working bbox/dimensions;
- result is stored as a raster asset inside `.igs`;
- a new Raster Layer is added or the selected empty target layer is filled;
- generation snapshot is stored with the result.

## Smart Patch Regeneration

When a Smart Patch Layer is the generation target:

- worker receives the flattened source composite for the layer bbox;
- worker receives the layer mask;
- worker receives the layer-owned bounding box;
- worker receives the layer internal resolution;
- worker receives prompt/settings/model resources;
- result is stored as a raster asset inside `.igs`;
- a new raster sub-layer is created inside the Smart Patch Layer;
- the new raster sub-layer becomes active;
- the Smart Patch Layer status becomes `ready`;
- previous raster sub-layers remain available but inactive.

If multiple Smart Patch candidates are generated, the user may keep more than one candidate as permanent Smart Patch raster sub-layer variants. `Use as Active` / `Accept` chooses which variant becomes active. Unkept candidates are discarded by default.

## Dynamic Prompt Expansion

Dynamic prompting can expand one visible Generate action into multiple concrete jobs.

Each generated result stores the concrete expanded prompt used for that result.

## Generate To Upscale

`Send Composite to Upscale` is not a normal generation job.

It:

- takes flattened composite of visible layers;
- creates immutable upscale input asset inside `.igs`;
- stores source metadata;
- switches Project to `Upscale`.

## Acceptance Criteria

- Generate creates raster output inside the open `.igs`.
- Smart Patch regeneration can create one or more kept raster sub-layer variants, with only one active.
- Multi-candidate generation uses StagingArea before committing project state.
- Dynamic prompt expansion can create multiple concrete jobs.
- `Send Composite to Upscale` creates an immutable input and switches mode.
