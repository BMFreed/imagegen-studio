# Generation Settings

## Feature

Generation settings define the model and core inference parameters for the current Generate operation.

## Reference

Reference: InvokeAI Generation and Advanced settings accordions.

ImageGen Studio adapts Invoke's controls, but not Invoke's separate lower `Advanced` accordion.

## ImageGen Studio Decision

Use an Invoke-like model-aware settings panel, adapted to ImageGen Studio's supported model families and worker protocol.

Project does not ask the user to choose Text to Image or Image to Image. The runtime generation path is derived from visible raster/mask content in the current finite target bbox when the job is frozen. For normal generation that is the movable project-owned primary bbox, not a fixed Project Canvas frame.

Normal Project generation uses a project-owned generation draft. Each Smart Patch Layer owns its own generation draft; selecting a Smart Patch Layer binds the settings panel to that layer, so edits only affect and potentially mark that layer `outdated`.

For normal generation, `Size` configures the project-owned primary generation bbox dimensions, not a finite canvas size. Smart Patch `internalResolution` and layer-owned bbox geometry do not become generic preset `Size` fields.

LoRAs remain structured generation resources. Positive and negative prompts are
plain text with separate embedding-resource reference sidecars; editing the text
does not turn embeddings into UI chips or serialized prompt tokens.

All generation-related advanced controls live inside the `Generation` card's own `Advanced Options` area. Do not create a separate Invoke-like `Advanced` dropdown/accordion below `Generation`.

Supported advanced values that affect generation are explicit optional fields
in the generation payload. `cfgRescale` and `vaePrecision` are frozen with a job,
shown in comparison, and can be independently included in presets. There is no
generic advanced-options bag.

## Scope

Product MVP controls:

- model selector;
- model version selector for the selected model;
- base model family badge;
- for Illustrious, a read-only display of the current exact-file prediction
  type from Model Manager, including whether `epsilon` is an assumption;
  the editable control belongs only to Model Manager. Anima has no SDXL
  prediction type control;
- separate LoRAs selector and selected LoRA stack;
- unified prompt autocomplete for embeddings and active LoRA trigger phrases;
- for Illustrious, sampler/scheduler; for Anima, one native sampling method;
- steps;
- guidance/CFG;
- denoising strength, visible but disabled with a reason when the current target has no raster input or the selected model does not support it;
- seed;
- randomize seed;
- shuffle/advance seed;
- images per click beside `Generate` in the fixed action bar at the top of the left panel rather than duplicated inside the settings card;
- model compatibility warnings for selected LoRAs/embeddings/presets.

`Generation > Advanced Options` controls:

- VAE selector;
- VAE precision where relevant, preferably `Auto` by default with manual precision only as an advanced troubleshooting/performance control;
- CFG rescale where the active model/pipeline supports it;
- clip skip where relevant;
- model-family-specific encoder/decoder options only when the selected pipeline needs them.

Rejected for MVP:

- separate Invoke-like `Advanced` dropdown/accordion outside `Generation`;
- seamless X/Y toggles as generic Generate controls;
- generic color correction/compensation as a Generate control.

## Project Settings Order

The compact Project panel uses this stable order: Preset actions, Size, Prompt, Negative Prompt, LoRAs, Generation and contextual Smart Patch compositing. The Add LoRA control stays above selected rows; embeddings are inserted through each prompt's inline autocomplete.

The UI does not display a persistent txt2img/img2img label such as `Canvas content`. The derived request type is frozen into queue/provenance data; only contextual reasons such as disabled denoising are exposed to the user.

If color matching is needed later, design it as a Smart Patch/compositing behavior such as `Match source colors`, not as an always-visible global generation toggle.

## Production coverage through the Phase 2B draft-controls checkpoint

The production Project settings edit the normal Project's exact installed
checkpoint/version reference, positive and negative plain prompt text and
Seed `Fixed`/`Random`/`Reuse` policy, plus sampler/scheduler, Steps and CFG scale. `Fixed` stores an
explicit unsigned 32-bit value; `Random` and `Reuse` store no draft value.
The first Illustrious sampler/scheduler menu is an explicit finite pair list.
The draft starts with both values unset; selecting a sampler does not invent a
scheduler, and changing it clears an incompatible scheduler. The pair passes
through typed IPC, document shadow, explicit Save and `.igs` reopen. The
Illustrious selectors are disabled with an explanation when the selected model
lacks a verified Illustrious family. The Anima authoring checkpoint below adds
its separate native control. Editing sampling does not itself make Generate
available.
Steps is a positive safe integer and CFG scale is a finite nonnegative number;
both can remain unset in the draft. These controls do not infer a default or
claim model-specific runtime compatibility before the inference pipeline is
qualified. Changes use the Project document's dirty/shadow/explicit Save path
and reopen from `.igs`.
Model selection passes only resource/version IDs across IPC: main verifies the
file and required Anima companions before copying the exact registry metadata
into the Project. Changing Model Manager's Default never changes a saved
Project reference. If its exact version becomes unavailable, Project keeps
the saved name/version and shows a diagnostic with access to Model Manager;
it does not select another version. A copied `.igs` with obsolete local IDs
can explicitly link the same installed CivitAI checkpoint when main verifies
the exact portable identity and file; this changes only local IDs in the
document. Selection and relinking do not load a model in the worker or make
Generate available.
The production Project now displays the current Illustrious prediction type
read-only from Model Manager. The only editable control is in Model Manager,
keyed by SHA-256 and size. Electron smoke covers the library control and Project
display. Main can prepare an unlisted Illustrious checkpoint with the current
effective type or labeled `epsilon` fallback, regardless of an older `.igs`
snapshot; a changed library setting invalidates a prepared request before
materialization. Model selection alone does not activate an inference runtime.
Custom CivitAI Anima installation with pinned Qwen3/VAE is available; later
checkpoints below qualify its internal bundle and worker execution. Public Anima
Project admission and the full frozen pipeline remain open.

The [Anima authoring checkpoint](../../../engineering/phase-2c-anima-authoring-research.md)
adds one native sampling-method selector: Euler, Heun, DPM++ 2M, DPM++ 2M SDE,
ER-SDE and LCM. It writes optional `sampling.animaMethod` through typed draft
IPC, history, recovery shadow and explicit `.igs` Save/reopen. Unset stays unset;
clearing removes the field. Family switches retain the inactive Illustrious pair
and native choice. The existing SD pair is not reinterpreted as Anima sampling.
LCM availability describes the implemented solver, not a distilled Base-model
quality promise. No separate Karras/Normal/Exponential scheduler applies.
Prototype Project and the shared preset editor use explicit model-family
metadata for the same control and preserve/explain inapplicable SD-only Advanced
settings. Production preset storage stays open; public generation is connected
by the later integration below.

The [Main preparation checkpoint](../../../engineering/phase-2c-anima-main-preparation-research.md)
captures one Project snapshot, its document-scoped resolved seed and exact
checkpoint/Qwen/VAE/ordered enabled LoRAs. It expands the captured dynamic policy
into concrete positive/negative prompts and one native plan per item, then
materializes a complete qualified ephemeral batch. Inactive SD sampling and
disabled rows remain authored data. Neutral CFG Rescale `0` and precision `Auto`
add no Anima wire fields; nonneutral/manual policies, external VAE, CLIP Skip and
embedding refs refuse explicitly. This preparation does not enqueue, update the
seed cursor or document, or publish accepted results. Public Generate and frozen
accepted integration remain subsequent work for that preparation boundary.
The [durable jobs checkpoint](../../../engineering/phase-2c-anima-durable-jobs-research.md)
now stores concrete per-item text/native plans and supports exact frozen Retry,
dispatch and operational recovery separately. Queue Manager shows the saved native
method; neither Retry nor dispatch reads today's draft or chooses a new seed.
The subsequent [public Anima integration](../../../engineering/phase-2c-anima-public-generation-research.md)
connects that native capture to Project Generate and immutable accepted records.
Renderer advice uses the native qualified-engine flag, independently of the
Illustrious img2img flag; Main rechecks the actual peer and exact resources.
Opaque raster input permits Denoising Strength including zero. Missing method,
unsupported embeddings/external VAE/CLIP Skip/nonzero CFG Rescale/manual VAE
precision and mixed-alpha outpaint refuse explicitly, without an SD fallback.
Unset optional controls remain absent and do not block saving the authored
Project. Six native methods and raw weighted signs compare against the accepted
baseline; exact companion identity comes from the installed catalog's existing
fast metadata/stat/cache status, not a new full-file hashing loop. Missing bundle
metadata and unsupported current controls are Unavailable. Installed release
runtime, trained-model quality, regions/outpaint, Smart Patch and presets remain
separate work.

If a text edit removes an existing embedding activation token, main prunes its
sidecar ref; retyping the token does not restore the ref until resource-aware
insertion is implemented. The later checkpoints below connect production
denoising strength, VAE precision, CFG Rescale and external VAE authoring/inference.
Smart Patch-owned draft controls remain open.
User-selectable CLIP Skip is not applicable to the current Invoke-like Illustrious
pipeline or to Anima's Qwen3/T5 encoders; a saved unsupported value is refused
before enqueue.
The chosen Seed policy is a request for a future job, not a completed seed.
Main now reads the document-scoped operational last-actual-seed cursor before
internal Prepare/enqueue, falling back to the saved `.igs` snapshot when no
local cursor exists. A missing seed blocks `Reuse` with an explicit error;
`0` is valid. Project displays the local value through Results IPC and Save
snapshots it into `.igs` without a dirty/Undo step. The renderer Generate
action and full release inference pipeline are still absent.

The Seed control shows a numeric value, a `Random` switch and `Shuffle Seed`, as
in Invoke. Random disables the number and Shuffle; switching it off selects
Fixed and restores the previous fixed value when it is available in the open
editor. Shuffle chooses a new unsigned 32-bit fixed seed.
`Reuse last seed` is a separate action because it remains a distinct requested
policy for batch scheduling and provenance. It shows the last completed seed of
this Project, and editing that number changes the policy to Fixed. Reuse cannot
be newly selected without a completed seed; an already selected Reuse policy
can still be turned off when the cursor is unavailable.

## Production CFG Rescale checkpoint

[CFG Rescale evidence](../../../engineering/phase-2c-cfg-rescale-research.md)
connects the existing optional draft field to a production control inside
`Generation > Advanced Options`, typed IPC, recovery shadow, explicit Save and
reopen. The supported operational range is 0–0.99. An absent Illustrious draft
value means effective zero without dirtying the document merely by viewing it.
Existing v1 drafts containing `1` remain loadable, but this pipeline rejects
them until edited or reset.

Nonneutral values require a qualified worker advertising
`illustrious-cfg-rescale` (introduced in 0.5.0 and retained by the currently
qualified 0.11.0 worker); unsupported/unavailable runtimes disable the numeric
control with a reason. Reset remains available for an editable draft. Main
independently checks capability before enqueue and again at dispatch. Neutral
zero can use older qualified workers through their previous wire schema.

Prepare freezes the effective value, the worker applies it through the pinned
Diffusers SDXL adapter, and Add records it in immutable provenance. Later draft
edits and Retry cannot change that record. Old results with no recorded value
stay unknown in comparison. This checkpoint supports Illustrious txt2img only;
Anima and the remaining advanced controls are still open. The following checkpoint
extends supported generation to opaque img2img.

[Installed CFG qualification](../../../engineering/phase-2c-installed-cfg-rescale-research.md)
now connects the actual Advanced Options control to the installed trained CUDA
worker, explicit Add, rendered Save/reopen and visible comparison. At otherwise
identical frozen inputs, unset and explicit zero txt2img produce equal decoded
RGBA pixels; 0.7 changes them. A nonzero opaque img2img case separately verifies
wiring and provenance, without claiming an independent img2img pixel ablation,
image quality, other options or release-runtime readiness.

## Production opaque img2img checkpoint

[Opaque img2img](../../../engineering/phase-2c-img2img-research.md) adds a visible
`Denoising Strength` control in Generation settings. Main reads the exact target
pixels through the existing CPU compositor without qualifying or starting a GPU
worker. The field explains disabled states for transparent input, unavailable
composition, unsupported model/runtime and partial-alpha outpaint. This advisory
read never modifies the Project or admission state; Generate independently
captures and verifies its real input again.

The existing nullable draft has no implicit production default: opaque img2img
requires an explicitly chosen finite value in 0–1. Viewing the field does not
persist the prototype's displayed 0.75 fallback. Reset restores unset; invalid
unacknowledged raw text blocks Save and Generate until corrected. A stored strength
is ignored for transparent txt2img and is not recorded as an applied setting there.

Qualified worker 0.6.0 is required for opaque img2img. Prepare freezes strength and
source pixels, Retry reuses them, and Add records actual mode/strength in immutable
portable provenance. Changing the current draft cannot alter a queued or accepted
result. Strength 0 uses the VAE roundtrip without denoising, so it does not guarantee
pixel-identical output. Partially transparent targets, inpaint, Anima, LoRA and
release runtime installation remain pending.

## Production VAE precision checkpoint

[VAE precision evidence](../../../engineering/phase-2c-vae-precision-research.md)
connects `Auto`, `FP16` and `FP32` in production `Generation > Advanced Options`
to typed draft edits, Undo, recovery shadow and explicit Save/reopen. Displaying
an absent field as Auto does not write a default or dirty the document. Reset
restores absence. Illustrious settings remain editable without an installed
runtime; a manual precision choice needs qualified worker 0.8.0 with
`illustrious-vae-precision` before Generate or Retry. Anima is explicitly disabled.

All new jobs freeze the effective policy, including Auto, and queue/worker inputs
must agree. Older qualified peers can use Auto through their previous request
shape; only the transport copy loses that field. Manual values never silently
fall back. The worker controls both native VAE encoding and decoding independently
of UNet/CLIP precision. Auto preserves the native checkpoint policy; it is not an
alias for an assumed hardware dtype. Under the pinned current config it uses FP32.

Add stores the copied policy in immutable portable metadata, and comparison
uses that record after Save/reopen. Historical results without precision remain
Unavailable. FP16 non-finite tensors fail before a successful PNG can be published.
FP32 uses more memory; this does not establish a supported maximum GPU resolution.
The subsequent external VAE checkpoint below extends these precision policies
to selected external components. CLIP Skip remains an explicitly refused input,
not a pending user control for either MVP family.

[Installed embedded precision qualification](../../../engineering/phase-2c-installed-vae-precision-research.md)
connects the actual Auto/FP32/FP16 control to trained installed worker 0.12.0,
staging, explicit Add, Save/reopen and comparison. Six 256×256/three-step cases
produced 6 finite completions and 0 exact native VAE refusals, with
one genuine canceled original followed by frozen FP32 Retry after a current
FP16 edit. Matched txt2img Auto/FP32 decoded pixels agree; opaque img2img
establishes encode/decode wiring, not numerical equivalence. External VAE,
arbitrary models/GPUs and signed release lifecycle remain separate.
The trained fixture produced no non-finite refusal; that error path is qualified separately by controlled JSONL through actual Main/SQLite.

Only the exact correlated Illustrious VAE non-finite error receives the public
Main-owned `GENERATION_VAE_NON_FINITE` diagnostic: choose FP32 for a **new**
generation; Retry preserves the failed attempt's original precision.
Other errors, Anima and composition never acquire that remedy. Raw worker
messages/paths are not displayed, and refusal changes no accepted source,
receipt, completed-seed cursor or saved `.igs`.

## Production external VAE authoring checkpoint

[External VAE authoring evidence](../../../engineering/phase-2c-external-vae-authoring-research.md)
connects Model Manager's CivitAI VAE installation/repair to a compact exact-version
selector inside `Generation > Advanced Options`. Eligible source labels are
`Illustrious` and `SDXL 1.0`; the latter describes a component applicable to the
Illustrious architecture, not a supported SDXL checkpoint family. The raw source
label remains in library metadata. Anima continues to use its pinned companion
VAE and does not offer an alternative selector at this checkpoint.

The selector sends only resource/version IDs. Main verifies exact managed bytes
before storing the reference. Reset stores null (`Embedded`), retaining precision
and every other generation setting. Selection/reset/relink use Undo, recovery
shadow and explicit Save/reopen. A library Default change never changes the saved
exact version. Missing/corrupt resources retain their name/version and offer
Model Manager; a unique exact portable match offers explicit relink, changing
only local IDs. Delayed resolution rejects changes even after an edit/Undo cycle.

Authoring alone does not qualify the external VAE for ML loading or record it in
an accepted result. The subsequent frozen-worker checkpoint below opens the
qualified path; old workers retain an explicit Generate restriction. Embedded
VAE generation remains available with the existing precision policy. Legacy
result comparison keeps an unrecorded VAE as Unavailable.

## Production external Illustrious VAE inference checkpoint

[External VAE inference](../../../engineering/phase-2c-external-vae-inference-research.md)
connects the selected exact component to worker 0.9.0's
`illustrious-external-vae` capability. Main verifies source identity, size/hash
and bounded standalone LDM/native Diffusers header anchors at preparation,
materialization, Retry and dispatch. The worker reads one immutable verified
safetensors snapshot, checks every converted tensor/key/shape and finite value
against the pinned native AutoencoderKL, then uses the public offline loader.
Safetensors metadata cannot replace pinned SDXL scaling (`0.13025`). Shape
compatibility does not prove SDXL training lineage; API applicability and this
explicit execution configuration remain distinct evidence.

Both txt2img decoding and opaque img2img encoding/decoding use that same selected
module with the existing precision and finite-output policies. Queued attempts
and Retry retain the original exact choice despite later Project edits or
library Default changes. Unsupported structures, changed bytes and older worker
capabilities refuse generation explicitly; resetting to Embedded affects future
admissions. New portable accepted metadata records exact VAE or known Embedded;
historical absence remains Unavailable. Anima's required companion remains
pinned. This checkpoint does not complete the full MVP pipeline or release runtime.

## Installed external Illustrious VAE qualification

[Installed external VAE evidence](../../../engineering/phase-2c-installed-external-vae-research.md)
joins the actual Project selector to Main, noneditable installed worker 0.12.0,
trained CUDA execution and explicit Add/Save/readback/reopen/comparison. Eight
finite cases at 256×256, three requested steps and FP32 cover Embedded, exact
standalone LDM, exact native Diffusers and an explicitly artificial finite
bias control, each in txt2img and common-source opaque img2img at strength 0.
Both exact extracted formats reproduce Embedded decoded pixels; altered weights
change them. The combined control does not separately ablate encoder/decoder,
and zero strength does not qualify nonzero img2img denoising or image quality.

After real Cancel, library Default changes through Model Manager and the current
draft resets to Embedded. Public Retry retains the original native VAE, target,
prompt, seed and FP32. Completion stays temporary until Add; accepted portable
references survive Save/reopen and compare against the current different draft.
Local extracted/derived weights are catalog preconditions, not a live CivitAI
installation, independent training lineage, alternate Anima VAE or signed release
qualification. Full MVP promises remain open.

## Vue Prototype Coverage

The current Project settings stack implements:

- one-shot Preset actions;
- explicit normal-generation / Smart Patch target context and the current prototype's finite `Canvas Size` controls after prompts; product `Size` must instead edit primary generation bbox dimensions;
- plain-text CodeMirror positive/negative prompt editors with embedding sidecars;
- the shared LoRA stack;
- model selection;
- exact mock installed-version selection and prediction-type readout;
- sampler, scheduler, steps, CFG, Denoising Strength and fixed/random/reuse seed;
- images-per-click as an integer input from 1 through 100 in the fixed Generate bar;
- an `Advanced Options` disclosure containing VAE, VAE precision and CFG Rescale controls.

VAE, precision and CFG Rescale update the active generation payload and participate in Project undo. CFG Rescale uses the Invoke-like 0–0.99 range for the current mock model; production must gate it by actual model/pipeline capability. Model and exact version selectors are placed above the prompts. The prototype Seed row uses the same Random, Shuffle and separate Reuse controls described above. `Reuse` uses the last actual seed from a completed output in this Project, or disables Generate with a reason when none exists. The last-actual-seed cursor changes only on completed output and is outside document dirty/undo state. Its production recovery and explicit-Save `.igs` snapshot are specified in [Dynamic Prompting](./dynamic-prompting.md#seed-behavior), but not implemented by the prototype. The prototype still uses fixture models rather than the production Model Manager registry; explicit advance-seed remains a gap; user-selectable CLIP Skip is inapplicable to both MVP pipelines. Generation and seeds are simulated; no inference is performed.

Selecting a Smart Patch binds the visible settings to its layer-owned draft. Denoising stays visible and is disabled with an explanation when the effective target has no raster input. The prototype uses deterministic layer coverage metadata for this decision because it has no pixel compositor.

## Model-Aware Visibility

The selected model controls which fields are visible.

Unsupported controls should be hidden or disabled with a clear reason.

The selected model version is project-local state. The prototype selects exact
version refs from shared generation fixtures (including Illustrious v1.1 and
v1.0); production Project selects installed checkpoints from the Model Manager
registry. The inference worker still needs to consume and verify that reference.

Model versioning is mandatory MVP scope under PP-004. Interactive selection of
an exact installed version should therefore be implemented alongside the first
interactive Model Manager version/update pass rather than left as optional
prototype polish.

Rules:

- the first installed version becomes the initial default, and later new
  selections use the version explicitly marked `Default` in Model Manager;
- existing `.igs` projects preserve their exact selected version;
- changing the version in Generate updates the current project settings and future jobs for that project;
- changing Model Manager's default version must not silently rewrite open projects, presets or accepted-result provenance;
- if the exact version used by a project is missing, show a missing-resource warning and offer to open Model Manager; if the same exact version exists under different local IDs, offer an explicit verified link.

Model Manager is the only place to edit Illustrious prediction type for exact
SHA-256 and size. Project shows the current effective value read-only; if no
value is explicitly known, `epsilon` is labeled as an assumption. New selections
may store that value in the `.igs` reference for diagnostics, but the field is an
advisory snapshot. Existing non-null and old `null` values likewise never decide
future inference. Prepare rehashes the exact installed file and takes the current
effective library value without rewriting `.igs`. Main rechecks file integrity,
structure and required components before enqueue. If the library override
changes between Prepare and materialization, main aborts and requires a new
Prepare; it never silently substitutes a type in the frozen job. The worker
uses the frozen type without fallback, and accepted-result provenance stores
the actual type. Anima uses a separate
rectified-flow loader and compatible-component checks, never an SDXL prediction
type. An installed but structurally unsupported checkpoint remains visible and
Generate explains the blocking reason. SHA-256 binds the exact files and saved
references, not an app-owned allowlist of permitted checkpoint hashes.

The accepted next NoobAI slice adds separate exact-file ZTSNR and timestep
spacing controls in Model Manager, alongside prediction type; Project does not
edit this policy. Unknown profiles keep current `false` / `leading` defaults
with an explicit assumption label and manual override, without a mandatory
first-generation choice. These controls and their frozen execution are still
[planned](../../../specs/01-implementation-roadmap.md#noobai-полная-поддержка-в-рамках-mvp);
ordinary Euler support alone does not qualify the zero-SNR author recipe.

## Acceptance Criteria

- User can select a model and configure core sampling parameters.
- Generate verifies the chosen checkpoint's exact bytes, structural compatibility,
  required components and worker capability before enqueue; absence from an
  app-owned hash manifest alone does not block it.
- Project derives txt2img/img2img/inpaint/outpaint from the frozen target-area composite rather than a manual workflow toggle.
- Normal generation and each Smart Patch Layer have correctly scoped generation drafts.
- Product implementation lets the user select an installed version; the current
  prototype models this choice against mock installed resources. Its readout
  does not prove the production Model Manager edit or worker qualification.
- Unsupported controls are not shown as generic always-on clutter.
- The current exact-file Illustrious prediction type from Model Manager is
  frozen at Prepare, used by the worker and stored in accepted-result provenance.
  Project displays it read-only; any `.igs` snapshot is advisory. A change
  before materialization aborts the old preparation. Anima has no SDXL
  prediction type and uses pinned Qwen3/VAE subject to structural checks.
- LoRAs have a structured stack; embeddings are plain prompt text with sidecar `embeddingRefs` and have no standalone section.
- Denoising strength is shown in Generation settings, not above or inside the layer stack.
- Denoising strength stays visible but explains its disabled state when the current target has no applicable raster input.
- Model-aware secondary controls live in `Generation > Advanced Options`; current prototype coverage includes payload-bound VAE, VAE precision and CFG Rescale controls, while model capability gating remains required.
- A separate Invoke-like `Advanced` accordion is not implemented.
- Seamless X/Y and generic color compensation are excluded from MVP Generate settings.

## Resource selection presentation

Model choices show a preview, base model and version. LoRA choices also show trigger words; search matches the name, base model and triggers. Already added LoRAs remain visible but disabled. Selecting a LoRA does not insert its triggers into the prompt. The same rich option component is used in Project and the preset payload editor; the collapsed selector remains a compact text control. Preview artwork is a local illustrative fixture, not a generated sample or installed model asset.

Production LoRA selection/editing is now covered separately in
[LoRA selector](./lora-selector.md#production-coverage-27092026): exact versions,
weights, enabled state, removal and explicit portable relinking persist through
document recovery/Save. This
describes the authoring checkpoint; ordinary Illustrious LoRA inference is now
covered by the checkpoint below. Exact-version
LoRA trigger completion and prompt editing actions are connected in Electron;
installed Illustrious embedding insertion/diagnostics are connected by the
authoring checkpoint below. Danbooru completion remains pending. See
[Prompt Editor](./prompt-editor.md#production-coverage-at-the-phase-2a-checkpoint).

## Illustrious LoRA generation checkpoint (02.10.2026)

The existing LoRA selector now feeds qualified Illustrious txt2img and opaque
img2img through [frozen exact inputs](../../../engineering/phase-2c-lora-research.md).
Signed finite weights, enabled 0 and disabled missing rows retain their authoring
semantics. Unsupported formats/families fail explicitly before enqueue; successful
installation is not inference qualification. The whole configured stack is copied
to accepted provenance and its read-only comparison; only enabled verified
resources reach ML. Anima, other adapter algorithms and remaining advanced options
are still open.

## Exact embedding authoring checkpoint (04.10.2026)

[Normal Project prompt authoring](../../../engineering/phase-2c-embedding-authoring-research.md)
uses installed Illustrious embeddings through each prompt's autocomplete rather
than a separate selector. Both polarities insert `<original safetensors filename
stem>`; `trainedWords` aid search only. Main receives text and an optional ID-only
choice, verifies managed bytes and exact source/version identity, then stores
text and refs atomically through document history/shadow/Save/reopen.
Unique canonical manual input can link after verification; filename collisions
require selection even when another installed owner is unavailable. Saved refs
survive Default changes, rename and file loss. Portable Link changes local IDs
only; deleting the literal prunes its ref and document Undo can restore it.

Anima embedding authoring is unsupported. This checkpoint does not load weights
or add generated embedding provenance: stored refs and known unbound installed
tokens still block Generate with an explanation before enqueue. Full inference
and Preset resource integration remain open.

## Internal Anima deterministic sampling (05.10.2026)

[Versioned plans and native execution](../../../engineering/phase-2c-anima-sampling-research.md)
add an internal explicit `euler` / `heun` / `dpmpp_2m` choice. It is separate from
the public Illustrious sampler/scheduler pair list. TS freezes the selected
schedule, exact strength clipping, native begin index and actual evaluation
count. Python verifies those arrays against a fresh pinned native solver and
preserves weighted conditioning, signed LoRAs and the original model dtype.

Interior img2img starts from the selected solver's noise level, correcting
Invoke's acknowledged Euler-preblend mismatch. Strength zero stays VAE-only;
full strength stays pure noise and matches txt2img at the same seed. Heun progress
counts both evaluations, following the existing application progress contract.

This is internal execution evidence. Public Anima sampling/denoising controls,
queue/Retry and immutable provenance remain unconnected. Stochastic methods,
LCM and release qualification remain open. Original Invoke's Anima path does not
expose CLIP Skip, CFG Rescale or ordinary VAE precision controls; the conditional
Advanced scope does not require inventing those algorithms for Anima. The accepted
exact pinned-companion VAE contract is unchanged.

## Internal six-method Anima flow sampling (05.10.2026)

[Stochastic and FlowMatch LCM execution](../../../engineering/phase-2c-anima-flow-sampling-research.md)
adds explicit internal `dpmpp_2m_sde`, `er_sde` and `lcm` choices. The new
versioned TS plan freezes the step seed beside the generation/posterior seeds;
the step generator is a separate request-owned stream. Existing Euler and
deterministic envelopes retain their original finite policy and outputs.

All methods retain the full authored schedule before clipping. ER-SDE and
FlowMatch LCM receive an explicit once-shifted Euler grid, with terminal zero
included only for ER setup. This corrects Invoke's LCM unshifted/rebuilt-step
branch; interior img2img uses the selected clipped sigma. Fresh solver history,
weighted conditioning, signed LoRAs, finite/BF16 guards and cleanup remain shared.

This completes numerical execution of the six-entry internal Anima registry,
including actual stochastic replay and restoration controls. It does not connect
public Anima settings, Generate, queue/Retry or accepted provenance. Flow LCM
execution does not establish few-step Base quality, distilled acceleration or
Anima Turbo support. Family-aware public handoff and release qualification remain
open.

## Internal qualified Anima worker (05.10.2026)

[Worker entrypoint](../../../engineering/phase-2c-anima-worker-entrypoint-research.md)
connects a strict typed TS request assembler to inference worker `0.11.0`.
Both concrete prompts are compiled before the handoff; the complete six-method
plan freezes all seed domains, clipping and actual evaluation count. Python
validates/captures the wire and runs the existing native bundle, weighting,
ordinary signed LoRAs and selected flow method before publishing a provisional
sRGB PNG and optional thumbnail. Anima capabilities require native CUDA BF16;
the qualified Illustrious path remains available without it.

This is a worker checkpoint, not public Anima Generate. Family-aware Project
controls, explicit attention editing, portable native-method representation and
full frozen Main batch/admission/queue/Retry/accepted provenance remain open.
SD-only CLIP Skip, CFG Rescale, manual VAE precision, external VAE replacement
and embeddings are explicitly refused by this wire. Runtime installation,
trained-model quality and Linux/NVIDIA release qualification remain separate.
