# Generation Provenance

## Feature

Generation provenance is immutable metadata attached to an accepted generated Raster Layer or Smart Patch variant. It explains how that persistent project result was produced.

It is not an undo snapshot, a staging candidate or an independent History item.

## Reference

Reference: InvokeAI generation metadata, adapted to ImageGen Studio `.igs`, presets and layer-owned Smart Patch workflows.

## ImageGen Studio Decision

Only results explicitly added to Project receive generation provenance.

```text
frozen queue job
→ temporary staging candidate
→ Add to Project
→ persistent layer/variant + GenerationProvenance
```

Discarded candidates do not create project-local provenance or global history entries.

Provenance may be serialized as a separate referenced JSON object inside `.igs`, but in the domain model it belongs to the accepted result rather than to a standalone snapshot catalog.

## Contents

Provenance should include:

- model identity and exact version/hash metadata;
- prediction type metadata;
- serialized positive and negative prompts plus frozen structured source tokens;
- concrete expanded dynamic prompt where relevant;
- actual seed and seed behavior;
- automatically derived generation mode: txt2img, img2img, inpaint or outpaint;
- Project Canvas bounds for normal generation, or Smart Patch Layer-owned bbox for Smart Patch generation;
- internal resolution;
- sampler/scheduler;
- steps;
- guidance/CFG;
- denoising strength when it affected the job;
- LoRA stack;
- embedding resource refs nested in the prompt tokens where they were used;
- VAE and other active model-aware options;
- enabled Regional Guidance state and image refs used by the job;
- Smart Patch compositing/infill/mask settings;
- source composite, mask and layer-input hashes where relevant;
- queue item/batch identity for diagnostics;
- application, worker and backend versions where useful.

## Uses

Generation provenance supports:

- `Recall Settings`;
- `Create Preset from Result`;
- missing-resource diagnostics;
- explaining how an accepted layer/variant was produced;
- reproducibility and support/debug details;
- Smart Patch `outdated` comparison.

It does not power undo/redo. Undo/redo stores project mutations; provenance is simply part of the layer/variant added by an accepted-result mutation.

## Smart Patch Identity And Staleness

Each Smart Patch variant stores its own provenance and source revision hash.

The active variant is compared with the layer's current owned inputs:

- mask asset/hash;
- bounding box;
- internal resolution;
- layer-owned generation draft;
- relevant model resources;
- compositing settings;
- source composite hash.

If current owned inputs differ from the active variant provenance, the Smart Patch Layer becomes `outdated`.

## History Boundary

Global generation history is a derived index of accepted project results.

- one accepted candidate → one accepted result → one history entry;
- multi-accept creates several history entries but one grouped project undo step;
- discarded staging candidates never appear in history;
- Queue Manager rows remain operational job records and are independently prunable.

## Vue Prototype Coverage

Queue items freeze serialized prompts, structured source tokens, iteration and derived request mode, and accepted layers/variants carry enough mock identity to validate the acceptance workflow. The prototype does not construct or persist the full `GenerationProvenance` object, hash source composites/masks, write `.igs` references or update a global accepted-result history index. Consequently, Recall Settings and Create Preset from accepted provenance remain product behavior rather than current interactive coverage.

## Acceptance Criteria

- Every accepted generated Raster Layer or Smart Patch variant has immutable provenance.
- Completed but unaccepted candidates have no project-local provenance record.
- Provenance can recall settings and create a preset draft.
- Missing model/LoRA resources and prompt-owned embedding resources can be detected from provenance.
- Smart Patch outdated state can be derived from active variant provenance versus current layer-owned inputs.
- Provenance is not presented or implemented as an undo snapshot.
