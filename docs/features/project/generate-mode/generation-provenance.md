# PP-005 Supporting Contract: Generation Provenance

This document is the canonical supporting contract for
[PP-005: Принятый результат хранит настройки генерации](../../../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации).
It translates the general user-facing promise into domain ownership, storage,
comparison, preset, prototype and acceptance rules.

## Feature

Generation provenance is immutable metadata attached to an accepted generated Raster Layer or Smart Patch variant. It records reusable generation settings and technical context, but is not a complete recipe for every conditioning input that affected the image.

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

Discarded candidates do not create project-local provenance or global history entries. A completed, unaccepted candidate may retain a frozen operational record in local recovery storage; that record is not accepted-result provenance and is not included in `.igs` before explicit acceptance and Save.

Provenance may be serialized as a separate referenced JSON object inside `.igs`, but in the domain model it belongs to the accepted result rather than to a standalone snapshot catalog.

## Contents

Provenance deliberately contains three data groups with different product roles.

### Generation Configuration

This is the portable, user-comparable configuration that may seed a preset:

- model identity and exact version/hash metadata;
- for Illustrious, the actual prediction type frozen for the job, even if it
  began as an editable `epsilon` default; Anima records its separate flow and
  exact compatible components instead of an SDXL prediction type;
- frozen positive and negative plain text plus their embedding resource refs;
- concrete expanded dynamic prompt where relevant;
- actual worker-used seed, requested Seed policy and dynamic seed behavior;
- automatically derived generation mode: txt2img, img2img, inpaint or outpaint;
- default generation bounding-box width and height where applicable, never
  Smart Patch internal resolution;
- sampler/scheduler;
- steps;
- guidance/CFG;
- denoising strength when it affected the job;
- LoRA stack;
- positive and negative `GenerationPromptEmbeddingRef[]` sidecars;
- VAE, CFG Rescale, VAE Precision and explicitly supported model-aware options.

Regional Guidance is deliberately excluded from every provenance group, not
only from preset creation and comparison. The queue request may still contain
regional inputs needed to execute a job; accepting its result does not copy
those inputs into result provenance. The saved record therefore cannot fully
reconstruct a generation that used regions.

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
- explaining the recorded settings and execution context of an accepted layer/variant;
- reapplying recorded settings and support/debug details, within the stated
  Regional Guidance and runtime limits;
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
applicable default generation bounding-box size and derived mode. It does not
use another variant's provenance as the current side.

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
- applicable reusable generation context. Regional Guidance is absent from
  both sides of the comparison, even when it affected the original image.

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

Global generation history is a derived view of accepted project results. The
open Project shows an in-memory history projection immediately after Add; its
durable SQLite metadata index is rebuilt from verified saved `.igs` results on
explicit Save and workspace Refresh. The
[saved-index checkpoint](../../../engineering/phase-2b-saved-accepted-index-research.md)
covers generated Raster Layers with path/layer identity and atomic Home/history
replacement; an internal query excludes unhealthy/trashed or foreign-lineage
sources. Unsaved changes do not enter it, and an index failure after committed
Save keeps the previous DB snapshot and reports a warning until rescan repairs it.
App-level history browser/navigation, public IPC and Smart Patch indexing are
still pending.
Crash recovery can reconstruct the unsaved projection from the document shadow.

- one accepted candidate → one accepted result → one history entry;
- multi-accept creates several history entries but one grouped project undo step;
- discarded staging candidates never appear in history;
- Queue Manager rows remain operational job records and are independently prunable.

## Production Raster storage checkpoint

The first production storage form is an optional, strict
`generationProvenance` record on a Raster Layer in the v1 `.igs` document. It
supports the currently frozen Illustrious `txt2img` context only. A main-only
mapper validates the candidate's frozen job, exact checkpoint/prediction type,
Project and bbox identity, actual seed and verified sRGB output before creating
the portable record. It deliberately omits managed model, worker and staging
paths and all Regional Guidance data. The owning Raster Layer ID is the
accepted-result identity; the record retains the candidate and queue IDs as
its origin.

Old Raster Layers without provenance still parse, and a malformed record is
rejected instead of being silently dropped. Real `.igs` Save/reopen and dirty
shadow recovery preserve the record when it is attached to a layer; ordinary
layer property edits preserve it as well. This storage foundation does not yet
implement the user-facing Add action, immutable attachment at handoff, undo,
history projection, comparison or result-to-preset. See the
[storage evidence](../../../engineering/phase-2b-accepted-provenance-storage.md).

Subsequent [explicit Add Raster](../../../engineering/phase-2b-raster-acceptance-research.md)
and [Project Undo/Redo](../../../engineering/phase-2b-project-undo-research.md)
checkpoints connect immutable attachment to renderer/IPC/shadow/Save.
The [prepared-batch checkpoint](../../../engineering/phase-2b-batch-planning-research.md)
stores optional `sampling.seedBehavior` (`per-iteration` or `per-prompt`) from
the frozen main context; legacy absence remains unspecified. Concrete prompts
and the actual completed seed belong to the accepted result, while authored
dynamic templates remain in the live draft. These integration checks replace
external inference; comparison and result-to-preset remain unimplemented in
production. The subsequent Project-local history checkpoint below connects the
read-only accepted-result projection; the global durable index remains separate.

## Production Project-local accepted results

[Project-local accepted-result history](../../../engineering/phase-2b-project-accepted-results-research.md)
projects current Raster Layers with provenance into `ProjectTab.acceptedResults`.
The Layers toolbar opens `Accepted results`: a read-only list showing the layer
preview, copied checkpoint/version/SHA, actual seed, original generated dimensions
and acceptance time. Hidden layers remain listed with a textual label. The list
uses current layer identity/name/image, while generation values remain frozen;
current asset dimensions can differ from the original recorded output.

Selecting an entry selects and reveals its owning row in the Layers viewport,
without changing visibility, camera, bbox, dirty state, Undo, seed or persistence.
Opening context is Project/document scoped and revalidated at selection. Undo
removes accepted entries, Redo restores them, and clearing Undo history keeps
accepted results. Recover and Save/reopen reconstruct the list from the owned
provenance; Queue pruning and remaining staging do not define membership.

This checkpoint supports generated Raster Layers only and adds no global
SQLite history index or cross-project browser. Full settings comparison,
result-to-preset and Smart Patch variants remain separate roadmap work. It is
not a catalog of every past generation or of layers removed from current state.

## Vue Prototype Coverage

The Project prototype freezes a detached generation record when each mock job is
queued, then copies it onto a Raster Layer or Smart Patch variant only on explicit
acceptance. It includes expanded prompt text and embedding refs, exact mock model
version, actual simulated seed, portable payload and advanced options, but no
Regional Guidance. Smart Patch owned inputs are kept separately for mock staleness.

Both result types expose a bounded, read-only `Compare generation settings`
popover. The current side always reads the Project default generation draft, including while
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
worker/runtime identities, real output assets, `.igs` serialization and the
saved-result SQLite index are not implemented by the prototype. Mock staleness compares owned draft,
bbox, mask revision and internal dimensions; it does not hash source composites.
The mock still reads generation Size from its finite Project Canvas frame rather
than an independently movable default generation bbox; this is a prototype gap.

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
- Regional Guidance never appears in result provenance, comparison or result-derived presets; results generated with regions cannot be fully reconstructed from their saved record.
- Smart Patch outdated state can be derived from active variant provenance versus current layer-owned inputs.
- Provenance is not presented or implemented as an undo snapshot.
