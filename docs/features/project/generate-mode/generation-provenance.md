# PP-005 Supporting Contract: Generation Provenance

This document is the canonical supporting contract for
[PP-005: Каждый принятый результат помнит, как он был создан](../../../product-promises.md#pp-005-каждый-принятый-результат-помнит-как-он-был-создан).
It translates the general user-facing promise into domain ownership, storage,
comparison, preset, prototype and acceptance rules.

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

Provenance deliberately contains three data groups with different product roles.

### Generation Configuration

This is the portable, user-comparable configuration that may seed a preset:

- model identity and exact version/hash metadata;
- prediction type metadata;
- frozen positive and negative plain text plus their embedding resource refs;
- concrete expanded dynamic prompt where relevant;
- actual seed and seed behavior;
- automatically derived generation mode: txt2img, img2img, inpaint or outpaint;
- explicit reusable generation/Canvas width and height where applicable, never
  Smart Patch internal resolution;
- sampler/scheduler;
- steps;
- guidance/CFG;
- denoising strength when it affected the job;
- LoRA stack;
- positive and negative `GenerationPromptEmbeddingRef[]` sidecars;
- VAE and other active model-aware options;
- enabled Regional Guidance state and other reusable conditioning inputs.

### Layer And Source Context

This is immutable evidence used to explain the run and derive Smart Patch
staleness, not a reusable generation-settings payload:

- Smart Patch Layer-owned bbox, mask identity/hash and internal resolution;
- Smart Patch compositing/infill state;
- source composite, mask and layer-input hashes where relevant;
- layer-owned draft revision where relevant.

### Execution And Result Context

This ties the record to the actual run and accepted output:

- queue item/batch identity for diagnostics;
- application, worker and backend versions where useful;
- accepted output identity inside `.igs`.

Layer/source and execution/result context remain in provenance even though
`Compare generation settings` and `Create Preset from Result` intentionally
exclude them.

## Uses

Generation provenance supports:

- `Compare generation settings` from the layer context menu;
- `Create Preset from Result`;
- missing-resource diagnostics;
- explaining how an accepted layer/variant was produced;
- reproducibility and support/debug details;
- Smart Patch `outdated` comparison.

It does not power undo/redo. Undo/redo stores project mutations; provenance is simply part of the layer/variant added by an accepted-result mutation.

## Compare Generation Settings

Both compositing result layer types use the same Project-scoped read-only
interaction:

1. User opens a Raster Layer or Smart Patch Layer context menu.
2. User chooses `Compare generation settings`.
3. A bounded popover shows `Generated with` versus `Current Canvas`.

The comparison never compares one Smart Patch variant with another. A generated
Raster Layer uses its own provenance as `Generated with`; a Smart Patch Layer
uses the provenance of its current active/visible accepted variant.

`Current Canvas` is always derived from the current open `ProjectDocumentModel`
at viewing time. It includes current generation settings and resources,
applicable generation size and derived mode, Regional Guidance and other
reusable conditioning inputs. It does not use another variant's provenance as
the current side.

The popover groups values into the same semantic sections used by
generation/preset UI instead of displaying raw serialized payloads:

- Prompt and Negative Prompt, including embedding refs;
- Model and exact version;
- LoRA stack;
- Sampling;
- Guidance;
- generation Size where applicable;
- Seed;
- Denoising Strength where applicable;
- VAE and other active model-aware options;
- applicable reusable generation context.

Smart Patch mask, bbox, internal resolution, compositing state and source
revision identities do not appear in this settings diff. They remain available
to staleness logic and diagnostics, where a mismatch may mark the layer
`outdated` without presenting a layer property as a changed generation setting.

Each section has a textual status: `Same`, `Changed`, `Added`, `Removed`,
`Missing resource` or `Unavailable`. Color may reinforce these statuses but
cannot be the only signal. Unchanged sections may be collapsed after the summary,
while changed sections expose `Generated with` and `Current Canvas` values side
by side.

The popover contains no `Apply`, `Recall`, `Restore` or preset-creation action.
Opening, expanding, closing or dismissing it never mutates the Project. Changes
to the current Canvas recompute the derived diff without modifying the provenance
baseline. Missing resources and fields unavailable in legacy provenance must be
reported explicitly rather than treated as equal.

An imported or manually created Raster Layer without provenance keeps the
context-menu item visible but disabled with `No generation data`. A Smart Patch
Layer without an active accepted variant uses the same state. `Create Preset from
Result` remains a separate result/layer action outside this popover and copies
only the generation-configuration group.

Direct `Recall Settings` / `Apply as Current` is deferred beyond this MVP flow.
If introduced later, it must remain a separate explicit Project mutation and
must not turn the comparison popover itself into an editor.

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

The Project prototype freezes a detached generation record when each mock job is
queued, then copies it onto a Raster Layer or Smart Patch variant only on explicit
acceptance. It includes expanded prompt text and embedding refs, exact mock model
version, actual simulated seed, portable payload, advanced options and enabled
Regional Guidance. Smart Patch owned inputs are kept separately for mock staleness.

Both result types expose a bounded, read-only `Compare generation settings`
popover. The current side always reads the Project Canvas draft, including while
a Smart Patch is selected. The comparison reports textual section statuses,
resource warnings and explicit unavailable fields in the legacy/error scenario.
Imported layers retain a disabled `No generation data` action. A separate
`Create Preset from Result` action opens an editable draft; Seed is excluded by
default and Smart Patch geometry is never copied. The shared in-memory catalog
makes the created preset available to Project Apply without reloading.

`project-provenance.spec.ts` covers detached queue records, acceptance, cleanup,
undo/redo, active-variant ownership, read-only comparison and result-to-preset-to-
Apply. `project-audit.spec.ts` covers replacement and cancellation boundaries.
These are prototype checks, not production evidence: source/mask hashes, exact
worker/runtime identities, real output assets, `.igs` serialization and the global
accepted-result index remain unimplemented. Mock staleness compares owned draft,
bbox, mask revision and internal dimensions; it does not hash source composites.

## Acceptance Criteria

- Every accepted generated Raster Layer or Smart Patch variant has immutable provenance.
- Completed but unaccepted candidates have no project-local provenance record.
- Raster Layer and Smart Patch Layer context menus expose the same comparison action.
- Generated Raster Layers compare provenance generation configuration with the current Project generation configuration.
- Smart Patch Layers compare active-variant generation configuration with the current open Project generation configuration (`Current Canvas`), never the layer-owned generation draft, another variant provenance or layer/source properties. Layer-owned inputs are used separately for `outdated` checks.
- Comparison reports semantic section statuses and does not mutate either side.
- Comparison popover contains no Apply/Recall/Restore actions.
- Layers without applicable provenance expose a disabled reason.
- Missing resources and unavailable legacy fields are not reported as equal.
- Provenance can create a preset draft through a separate action.
- Preset creation and the settings comparison exclude Smart Patch mask, bbox, internal resolution, compositing and source context.
- Smart Patch internal resolution is never mapped implicitly into generic preset Size.
- Missing model/LoRA resources and prompt-owned embedding resources can be detected from provenance.
- Smart Patch outdated state can be derived from active variant provenance versus current layer-owned inputs.
- Provenance is not presented or implemented as an undo snapshot.
