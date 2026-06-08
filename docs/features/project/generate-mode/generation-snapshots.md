# Generation Snapshots

## Feature

Generation snapshots are immutable records of how a generated raster result was produced.

## Reference

Reference: InvokeAI generation metadata/snapshot ideas, adapted to ImageGen Studio `.igs` storage and preset workflow.

## ImageGen Studio Decision

Every generated raster result stores an immutable generation snapshot in `.igs`.

Snapshots are source evidence for recall, preset creation, missing-resource checks and Smart Patch stale-state detection.

## Snapshot Contents

Snapshot should include:

- model identity and version/hash metadata;
- prediction type metadata;
- prompts;
- expanded dynamic prompt text where relevant;
- negative prompt;
- seed and seed behavior;
- dimensions;
- current working bbox or Smart Patch Layer-owned bbox;
- internal resolution;
- sampler/scheduler;
- steps;
- guidance/CFG;
- LoRA stack;
- embeddings refs/tokens;
- regional guidance state used for the job;
- regional guidance image refs/metadata used for the job;
- compositing/infill/mask settings;
- source layer/composite hash where relevant;
- worker/backend version metadata where useful.

## Uses

Snapshots are used for:

- recall settings;
- create preset from image/result;
- detect missing resources;
- explain how a layer/result was produced;
- mark Smart Patch Layer results as stale when editable inputs change.

## Identity And Staleness

For Smart Patch Layer results, snapshot identity should be compared against the current layer-owned editable inputs:

- mask asset/hash;
- bounding box;
- internal resolution;
- generation settings;
- relevant model resources;
- compositing settings.

If current editable inputs differ from the active raster sub-layer snapshot, the layer becomes `outdated`.

## Acceptance Criteria

- Every generated raster result stores a snapshot in `.igs`.
- For `GenerationResults`, every completed result stores a snapshot because every completed result is automatically persisted into project state.
- For Smart Patch Layer, every completed result creates a permanent raster sub-layer variant with its own snapshot.
- Snapshot can recall settings and create presets.
- Missing LoRA/embedding/model resources can be detected from snapshot metadata.
- Smart Patch Layer stale status can be derived from snapshot vs current editable state.
