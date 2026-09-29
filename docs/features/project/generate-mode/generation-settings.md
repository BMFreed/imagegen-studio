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
- sampler/scheduler;
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
through typed IPC, document shadow, explicit Save and `.igs` reopen. This
selector is disabled with an explanation when the selected model is Anima or
lacks a verified Illustrious family. It does not itself make Generate available.
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
materialization. The worker still reports
`INFERENCE_UNAVAILABLE`. Custom CivitAI Anima installation with pinned Qwen3/VAE
is available; structural qualification and Anima inference are still open.

If a text edit removes an existing embedding activation token, main prunes its
sidecar ref; retyping the token does not restore the ref until resource-aware
insertion is implemented. No production denoising-strength control, VAE,
advanced options or Smart Patch-owned
draft controls are connected yet.
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

VAE, precision and CFG Rescale update the active generation payload and participate in Project undo. CFG Rescale uses the Invoke-like 0–0.99 range for the current mock model; production must gate it by actual model/pipeline capability. Model and exact version selectors are placed above the prompts. The prototype Seed row uses the same Random, Shuffle and separate Reuse controls described above. `Reuse` uses the last actual seed from a completed output in this Project, or disables Generate with a reason when none exists. The last-actual-seed cursor changes only on completed output and is outside document dirty/undo state. Its production recovery and explicit-Save `.igs` snapshot are specified in [Dynamic Prompting](./dynamic-prompting.md#seed-behavior), but not implemented by the prototype. The prototype still uses fixture models rather than the production Model Manager registry; explicit advance-seed and clip skip remain gaps. Generation and seeds are simulated; no inference is performed.

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
extends the draft controls only; inference is not yet available. Exact-version
LoRA trigger completion and prompt editing actions are connected in Electron;
embedding insertion/diagnostics and Danbooru completion remain pending. See
[Prompt Editor](./prompt-editor.md#production-coverage-at-the-phase-2a-checkpoint).
