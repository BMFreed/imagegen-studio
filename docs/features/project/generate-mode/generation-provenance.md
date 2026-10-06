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

## Current Anima boundary

[Public Anima generation and acceptance](../../../engineering/phase-2c-anima-public-generation-research.md)
connect the existing durable native jobs to Project Generate and explicit Add.
Operational candidates remain local; only accepted Raster layers carry strict
portable `anima-txt2img` / `anima-img2img` v1 provenance. Native configuration
records the original architecture, exact checkpoint/Qwen3/VAE hashes and sizes,
concrete raw weighted signs, native method, Steps/CFG, actual seed/policy/behavior,
applied img2img strength and complete configured LoRA stack. Explicit neutral
CFG Rescale 0 / VAE precision Auto remain distinct from omitted fields.
SD sampler/scheduler/prediction type, compiled arrays, paths, raw dynamic
templates and all regional data are absent. No unavailable runtime version is
invented. Legacy Illustrious records retain their exact shape.

Both native modes and mixed-family Add use the same all-selection preflight,
journal, grouped Undo/Redo and shadow recovery owner. Explicit Save/readback,
portable copy/open and saved-result indexes preserve the immutable baseline.
Read-only comparison uses native rows, raw signs and exact portable bundle
identity; availability still requires current installed bindings. Local IDs are
advisory recorded bindings, not portable identity. Missing native catalog
metadata or unsupported current controls never become Same. Catalog status is
the existing fast metadata/stat/cache check; Generate requalifies actual bytes.
Preset creation, Smart Patch, regions and trained-model release qualification
remain separate roadmap work. Public outpaint admission follows the checkpoint below.

## Historical internal outpaint checkpoint (06.10.2026)

The [internal execution checkpoint](../../../engineering/phase-2c-outpaint-execution-research.md)
adds strict portable `illustrious-outpaint` and `anima-outpaint` v1 records only
after explicit Add of source-bound RGBA contributions. Their generation
configuration records `mode: outpaint`, applied denoising strength and the actual
completed uint32 seed, including a valid deviation from the scheduled seed.
Layer/source context retains captured source PNG/keep-mask identities and exact
policy/LaMa identity; execution/result context retains the contribution PNG and
actual alpha8 identity. Machine-local paths, source PNG bytes, mask assets and
model weights are absent from `.igs`.

Staging verifies contribution semantics against its independently owned source,
including after queue pruning. Save/readback binds the accepted layer asset to
its original contribution and checks actual RGBA alpha against the portable
identity without requiring local recovery files. Grouped Undo/Redo, shadow
recovery and portable copy/open preserve the record. Read-only settings
comparison includes outpaint mode and denoising strength while leaving private
source/execution groups outside the settings payload.

At this checkpoint, public mixed-alpha Generate/Retry, first-setup LaMa installation
and installed trained or release qualification remained open. The research note
separates that checkpoint's executed storage/native boundary evidence and its
counts from those gaps. Public admission and the scoped installed trained
qualification were connected in the 07.10.2026 checkpoint below; first setup and
signed release qualification remain open.
PP-005/007/008 and phase 2C are not complete.

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
App-level saved Raster history browser/navigation and bounded read-only IPC are
connected by the [browser checkpoint](../../../engineering/phase-2b-accepted-history-browser-research.md). Smart Patch indexing remains pending.
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
external inference; at that earlier checkpoint comparison and result-to-preset
were not implemented in production. The subsequent Project-local history checkpoint below connects the
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

## Production Raster settings comparison

The [preparatory Phase 2C checkpoint](../../../engineering/phase-2c-raster-comparison-research.md)
connects `Compare generation settings` to the production Raster context menu and
the same read-only UI in the focused Vue prototype. Locked generated layers are
inspectable; imported layers retain the disabled `No generation data` item.
Opening or closing the popover does not select or mutate the layer. Escape or
Close returns focus to its menu trigger; outside dismissal leaves the clicked
control's focus alone. The bounded popover stays horizontally next to that trigger and vertically
centered in the viewport, with a scrolling body and reachable unchanged-settings
toggle at the supported minimum window size.

Main reads only the exact owning document/layer's cloned generation configuration.
Preload validates both the strict portable shape and requested document/layer
identity. The current side combines the live renderer draft, primary bbox size,
exact installed catalog and document-scoped completed seed. Model prediction type
uses the current library override; the saved value remains immutable. Resource
comparison uses exact portable identity, while presence requires a matching ready
local binding. Random seeds are not allocated for comparison.

Current mode comes from verified CPU target composition, including actual alpha
coverage. Off-bbox or transparent layers do not imply img2img. This read starts
no GPU inference/queue job or Prepare, and writes no history/seed/document state.
If CPU composition is unavailable, recorded settings remain inspectable and the
mode row says `Unavailable`. Main rejects edits, Undo ABA and close/reopen during
the read; renderer tokens discard superseded or dismissed responses.

The current `illustrious-txt2img` provenance v1 records model, prompts, seed,
sampling and original generation size. The subsequent
[CFG Rescale checkpoint](../../../engineering/phase-2c-cfg-rescale-research.md)
adds optional top-level `generationConfiguration.cfgRescale`: new preparations
record the frozen effective value, including neutral zero. Comparison uses the
current Illustrious draft's effective zero when unset. Historical absence of
CFG Rescale remains `Unavailable`; it is never migrated to zero. Historical
LoRA, VAE, Clip Skip and VAE precision likewise remain explicitly `Unavailable`.
Full pipeline provenance, Smart Patch comparison and
result-to-preset remain separate roadmap work. This checkpoint does not complete
PP-005 or prove release runtime/inference readiness.

[Installed CFG qualification](../../../engineering/phase-2c-installed-cfg-rescale-research.md)
separately records the genuine UI/installed-worker path: captured effective
zero/0.7 stays in accepted provenance and the actual saved/reopened package
after the current draft is independently changed to 0.2. Visible comparison
shows Recorded zero/0.7, Current 0.2 and Changed without editing the document.
The txt2img same-input decoded-pixel control checks numerical effect; the
nonzero opaque img2img case checks wiring/provenance. Historical missing values
and the remaining public readiness boundaries retain their rules above.

## Production opaque img2img provenance

The [opaque img2img checkpoint](../../../engineering/phase-2c-img2img-research.md)
extends the strict portable v1 record with `kind: illustrious-img2img`,
`generationConfiguration.mode: img2img` and required
`generationConfiguration.sampling.denoisingStrength`. The applied 0–1 value,
source target SHA, bbox and other supported settings come from the verified frozen
attempt, not the current draft. Txt2img keeps its existing shape and carries no
applied denoising strength. Source pixels remain an operational queue/recovery
input; local paths do not enter portable provenance.

Comparison uses the current pixel-derived mode and shows applied strength for
img2img, including 0. Transparent current input makes strength not applicable;
unknown current composition remains unavailable. Legacy absence is not silently
filled with a default. Add, Undo/recovery and explicit Save/reopen preserve the
record; result-to-preset, Smart Patch and the full MVP pipeline remain open.

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

## Illustrious LoRA recording checkpoint (02.10.2026)

[The LoRA slice](../../../engineering/phase-2c-lora-research.md) adds optional
`generationConfiguration.loras` to both normal-mode v1 records. New records copy
the full frozen configured stack: exact resource metadata, enabled state and
weight in authoring order. The verified enabled subset is separately frozen for
operational execution; disabled references do not require installed files and may
retain transferred string IDs or an unknown/different family. Portable records
never include managed paths. Old field absence is unknown, while new `[]` records
a known empty stack. Comparison retains this distinction and reports resource
availability only for enabled references. Other missing pipeline settings are
still Unavailable; this checkpoint does not complete PP-005 or result-to-preset.

## External Illustrious VAE recording checkpoint (04.10.2026)

[The external VAE slice](../../../engineering/phase-2c-external-vae-inference-research.md)
adds optional `generationConfiguration.vae` to both normal-mode v1 records.
Explicit null records a known Embedded choice; an exact portable Illustrious VAE
reference records the component actually frozen and verified for that attempt.
Paths and operational byte-size descriptors stay in queue/recovery inputs and
never enter this portable field. Historical omission remains unrecorded and
is never migrated to Embedded.

Changing the current Project VAE or library Default does not change the accepted
record or Retry input. Add, Undo/recovery and explicit Save/reopen preserve it.
Comparison reports exact source/hash identity, known Embedded and missing/unknown
catalog bindings separately; renamed display metadata does not change semantic
identity. Anima, result-to-preset and the complete pipeline remain separate work.

### Illustrious embedding inference checkpoint (04.10.2026)

[Embedding inference](../../../engineering/phase-2c-embedding-inference-research.md)
uses the existing prompt `embeddingRefs` fields without a schema revision.
Positive and negative concrete prompt strings retain the original saved literals
and copied exact metadata for the effective resources of that completed branch.
Inactive dynamic choices, managed paths, byte-size descriptors, private worker
aliases and authored dynamic templates do not enter this portable record.
Historical empty sidecars remain empty; no reference is invented for old results.

Add, Undo/recovery and explicit Save/reopen preserve the record. Comparison
compares portable source/hash/family identity independently of local IDs and
display names, and detects unavailable resources. This does not establish Preset
creation/Apply, Anima conditioning or full MVP pipeline readiness.

## Public outpaint admission (07.10.2026)

[Public Generate/Retry](../../../engineering/phase-2c-public-outpaint-research.md) now
reaches the existing two portable outpaint kinds. Public frozen Retry retains
original source, policy, resource identities, bbox and effective settings even
when the current draft differs. Worker completion remains temporary; provenance
appears only through explicit Add and reaches the saved `.igs` only through Save.
Admission/dispatch qualify local bytes rather than trusting advisory UI flags.
Installed development Electron qualification completes six trained cases across
both families: normal source, mixed-alpha Generate and frozen Retry after actual
Cancel, each with explicit Add/Save/reopen; outpaint comparison retains the frozen
baseline despite current edits. Source layers, exact contribution alpha and
portable identities survive at 256×256/three steps with genuine CPU LaMa and
trained CUDA models. This scoped evidence is recorded in the research note.
First setup and signed release qualification remain open.
