# Generate Action Behavior

## Feature

Pressing `Generate` creates one or more generation jobs from current Generate state.

## Reference

Reference: InvokeAI generation queue behavior, adapted to ImageGen Studio `.igs` project storage and Smart Patch Layer model.

See also: [Queue Manager](../../queue-manager.md).

## ImageGen Studio Decision

Generation output first enters a project-scoped staging session. Worker completion does not mutate the open project.

The generation target depends on selection/context:

- no Smart Patch Layer target: stage normal candidates for the project-owned primary generation bbox;
- Smart Patch Layer target: stage candidates for that self-contained Smart Patch Layer;
- regional guidance entities: included as conditioning data when supported.

The user can select one or more completed candidates in [GenerationResults](./generation-results.md). Only explicit `Add N as Layers` / `Add N as Variants` adds raster assets and [generation provenance](./generation-provenance.md) to the open Project document and its recovery shadow. These document changes reach the main `.igs` only through explicit Save. An explicit `Rebuild Preview` may replace only preview/manifest for a clean Project; it cannot accept candidates or change document content.

Pressing `Generate` does not call the worker directly. It creates one or more Queue Manager items from frozen project/generation state. The queued jobs must not change if the user edits prompts, layers, masks, the primary generation bbox or a Smart Patch bbox while they are pending.

## Current public outpaint boundary (07.10.2026)

The [public admission checkpoint](../../../engineering/phase-2c-public-outpaint-research.md)
connects mixed-alpha Project Generate and failed/canceled frozen Retry to explicit
qualified worker 0.12.0 commands for both families. It requires the exact local
pinned LaMa file. Older workers and missing/corrupt helpers refuse with a diagnostic;
ordinary txt2img/opaque img2img and recovered history remain usable. Worker capability
flags are advisory and do not substitute for admission/dispatch resource verification.

Current document and close/shutdown fences apply through final SQLite commit and
through the runtime's subsequent child-exit wait. A late refusal cancels only this
action's newly published jobs, with confirmed canceled status or a recovery fence.
Retry retains the source PNG/alpha/policy/resources and settings despite later draft edits.

For otherwise valid frozen Illustrious outpaint input, a changed verified
checkpoint, prediction type or noise profile refuses with
`GENERATION_INPUT_CHANGED`: "The exact checkpoint, prediction type or noise
profile changed after preparation." Restoring the original policy permits Retry
without recomposition or adopting later draft edits. Malformed queue storage
retains its existing classification. The targeted Main diagnostic regression is
recorded in the [NoobAI outpaint research](../../../engineering/phase-2c-noobai-outpaint-research.md).

The [internal execution checkpoint](../../../engineering/phase-2c-outpaint-execution-research.md)
continues to own native masking, independent Main contribution-alpha verification,
source-bound temporary RGBA and explicit portable Add/Save/read/comparison. Completion
does not change the Project or saved `.igs`. First-setup LaMa installation, signed
release qualification, authored masks/regions/Smart Patch remain separate boundaries.
Executed evidence belongs to the public research note; phase 2C and PP-005/007/008
are not declared complete by this slice.

## Generate Action Area

### Component incompatibility diagnostics (08.10.2026)

Generate and frozen Retry preserve the Main component refusal code and project
these three codes to fixed safe messages before the generic model fallback:

| Code                           | Public message                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `MODEL_LORA_INCOMPATIBLE`      | The selected LoRA is incompatible with this image engine. Review this component in Model Manager.         |
| `MODEL_EMBEDDING_INCOMPATIBLE` | The selected embedding is incompatible with this image engine. Review this component in Model Manager.    |
| `MODEL_VAE_INCOMPATIBLE`       | The selected external VAE is incompatible with this image engine. Review this component in Model Manager. |

Arbitrary resolver messages and local paths are not exposed. Changing the current
draft does not repair a frozen Retry: review its exact component in Model Manager.
These messages do not broaden admission or change refusal timing. Controlled
public-controller evidence covers unchanged queue/receipts/seed/candidates,
private inputs/staging/scratch, autosave shadow, Project and saved package, followed
by a healthy Retry of the original context. It is recorded separately from
trained inference in the [component research](../../../engineering/phase-2c-noobai-components-research.md).

`MODEL_FILE_MISSING` and `MODEL_FILE_CORRUPT` can describe a checkpoint or any
selected component. Both use the fixed resource-neutral message: “The selected
model resource could not be verified for generation. Review it in Model Manager.”
The original code and preserving refusal behavior remain unchanged. Actual
managed-file missing and same-size corruption evidence for LoRA, embedding and
external VAE is recorded in the
[combined component research](../../../engineering/phase-2c-noobai-component-inference-research.md).

### Action bar

In the current Project UI, generation commands live in a fixed action bar at the top of the left panel, above the independently scrolling settings stack. No separate `Create` header is shown. A compact target label appears only when generating into a Smart Patch:

```text
[ wand Generate ] [ 1 ]                         [ queue badge ] [ x ]
```

Rules:

- `Generate` starts one batch from the current frozen project/generation state;
- the integer count input accepts any value from 1 through 100 and controls iterations per concrete prompt;
- the icon-only queue action opens the project queue and shows the current non-terminal job count in a badge;
- `x` is the visible cancel-current-generation action and must not be hidden inside the menu.

The bar uses a grid so the primary action and count remain content-sized on the left while queue and cancel stay grouped on the right. Queue and cancel use visible secondary surfaces. Queue pause/resume is not exposed from the Project action bar in the current scope.

## Automatic Canvas Workflow

Project does not expose a manual txt2img/img2img mode switch. At enqueue time it derives the worker path from visible raster content in the current target area:

- fully transparent composite → txt2img;
- partially transparent composite → outpaint;
- opaque composite without an effective mask → img2img;
- raster content plus an effective Smart Patch mask → inpaint.

For normal generation the target area is the primary generation bbox, which may be partly or wholly outside existing raster content on the unbounded Project Canvas. For Smart Patch generation it is the selected layer-owned bbox.

The mere existence of a Raster Layer elsewhere in the document does not imply img2img; only visible raster pixels inside the frozen target area matter. That frozen composite includes visible Raster Layers and the active variants of visible Smart Patch Layers according to their shared z-order.

## New Raster Generation

When no Smart Patch Layer is the generation target:

- worker receives prompt/settings/model resources;
- worker receives the frozen primary bbox position/dimensions as the normal generation target;
- worker receives the frozen visible composite inside that bbox, including transparent areas beyond existing raster content;
- completed outputs remain temporary candidates;
- selected candidates become independent new Raster Layers at the frozen bbox coordinates only after `Add N as Layers`; this does not expand Project Canvas or change the primary bbox;
- an existing selected Raster Layer is never overwritten implicitly;
- the accepted anchor candidate starts selected/visible, while other accepted opaque alternatives start hidden;
- accepted layers store immutable generation provenance.

## Smart Patch Regeneration

When a Smart Patch Layer is the generation target:

- worker receives the flattened source composite beneath the target Smart Patch Layer for its bbox;
- the target layer's current active variant is excluded from its own regeneration input;
- worker receives the layer mask;
- worker receives the layer-owned bounding box;
- worker receives the layer internal resolution;
- worker receives the layer-owned generation draft and compositing settings;
- completed outputs remain temporary candidates;
- selected candidates become variants only after `Add N as Variants`;
- the accepted anchor candidate becomes active;
- other newly accepted candidates and the previous active variant remain inactive;
- every accepted variant stores immutable generation provenance;
- the Smart Patch Layer becomes `ready` when the active accepted variant matches current owned inputs.

Unselected candidates are discarded when the staging session closes and never become Smart Patch variants.

## Dynamic Prompt Expansion

Dynamic prompting can expand one visible Generate action into multiple concrete jobs.

Each candidate remains associated with the concrete expanded prompt used for its frozen job. The prompt becomes persistent generation provenance only if that candidate is accepted.

Every concrete prompt/seed combination becomes its own queue item, grouped by one batch id for the originating user action.

## Upscale Follow-Up

Upscale and `Send Composite to Upscale` are deferred to a separate Project pass. They do not block the current Project generation prototype or its acceptance criteria.

## Vue Prototype Coverage

`Generate` creates deterministic in-memory queue items. The images-per-click input accepts integers from 1 through 100; dynamic prompt pairs multiply that value and the prototype blocks a combined batch above 100 jobs. Each item freezes plain positive/negative prompt text, embedding sidecar refs, iteration and an internally derived request mode.

One item runs at a time and the remaining items stay pending. Deterministic completion creates temporary candidates in the Project staging session; it does not add layers. The compact queue panel shows current, pending and terminal jobs, and the action bar can cancel the current job. This is a project-scoped mock lifecycle, not the production Queue Manager, worker transport or filesystem asset pipeline.

Automatic mode derivation uses prototype-only deterministic layer coverage metadata rather than real alpha analysis. Smart Patch selection with an effective mask takes the inpaint path. The derived mode is frozen technical data and is intentionally not shown as a user-facing txt2img/img2img switch or status label.

## Production coverage at the Phase 2A checkpoint

At this earlier checkpoint, the production Project could store a normal-generation
draft's positive and negative plain prompt text and Seed policy through Project
document edits. A separate main-process operation could prepare an exact,
frozen raster-only target for the primary bbox. Neither operation enqueued a job
or ran Generate; no production candidate, staging session or acceptance path
existed then.

## Earlier production boundary: Phase 2B repository checkpoint

The Project now saves an explicit Illustrious sampler/scheduler draft pair, and
main can enqueue one frozen Illustrious `txt2img` input in SQLite. The queue
repository can claim it; given a qualifying provisional output, the separate
staging repository can publish/recover a temporary candidate and advance the
Project's actual-seed cursor. That checkpoint had no Project Generate action,
worker dispatch or candidate preview/acceptance UI.

## Earlier production boundary: Results recovery and image export

At that checkpoint, Project could display, preview and explicitly save the raw
PNG of an already verified, locally recovered candidate. This did not enable
Generate or acceptance. The current
worker does not cover all visible generation inputs, and the release runtime
installer is not complete. Prototype interactions above do not prove a full
production generation flow. See the
[Results recovery checkpoint](../../../engineering/phase-2b-results-recovery-ui.md)
and [candidate image export](../../../engineering/phase-2b-candidate-image-export.md).

## Earlier production boundary: explicit Add, preview and target preparation

[Explicit Raster Add](../../../engineering/phase-2b-raster-acceptance-research.md),
[confirmed early Add](../../../engineering/phase-2b-early-raster-acceptance.md) and
[Project Undo/Redo](../../../engineering/phase-2b-project-undo-research.md) now
connect verified recovered candidates to shadow/Undo and explicit `.igs` Save.
[Dynamic settings/preview](../../../engineering/phase-2b-dynamic-preview-research.md)
uses the shared bounded planner without creating jobs or choosing actual seeds.
[Target composition](../../../engineering/phase-2b-inference-target-composition.md)
now runs through the same qualified inference client with real PNG verification;
it is an internal prerequisite. Renderer Generate, current queue/cancel actions,
Keep/Discard replacement and release runtime installation remain open.

## Current production boundary: Generate and serial dispatch

[Production Generate actions](../../../engineering/phase-2b-generate-actions-research.md)
connect the fixed action bar, transient images-per-click, typed main/preload IPC,
real SQLite queue and serial dispatch. Main freezes the admitted document and
raster sources before reading result impact or qualifying runtime. Each concrete
job gets its own qualified worker lease. The Project queue shows actual pending/
running rows, concrete prompts and seeds; current Cancel checks the document and
reviewed running job ID and awaits worker exit. Notifications also refresh Results.

Keep/Escape cancels the replacement action. Discard and generate confirms exact
current-document candidate/job sets and rechecks them. New batch publication must
succeed before old sessions are discarded; known preparation/queue failures keep
old PNGs. Uncertain post-publication cleanup cancels new jobs and fences generation.
Completed outputs remain in staging until Add; Generate does not dirty the Project
or save `.igs`. Raw invalid/uncommitted bbox size blocks Generate until Enter;
this guard and the transient count do not block Save or enter Undo/recovery.

This first historical slice supports the existing narrow Illustrious txt2img worker and
requires a qualified app-owned runtime. At that checkpoint, while admission or inference was busy,
another Generate is explicitly unavailable; editing, Save, current Cancel and
early Add remain available during inference. LoRA/embeddings/advanced conditioning,
Anima, img2img/outpaint/inpaint, Smart Patch, progress, terminal Queue Manager
history/retry/prune and release runtime install/repair remain open. Visible
unsupported inputs are rejected rather than ignored. UI/mock tests do not prove
installed CUDA inference or completion of Phase 2B.

## Production busy Generate checkpoint

[New Generate during inference](../../../engineering/phase-2b-busy-generate-research.md)
permits another Generate while a qualified job is processing. Main retains the
admitted Project/document, draft, bbox and visible raster sources before awaiting
preparation. One CPU derivatives child from the same installed runtime composes
and verifies that target with CUDA hidden; the current inference child lends only
a copied ready message. No second CUDA worker or system Python is used. Idle
Generate keeps the existing qualified inference composition path.

Generate in another Project adds a frozen pending batch without canceling the
current job. In the same Project, existing candidates and unfinished jobs still
require exact Keep / Discard and generate confirmation. A completion during
preparation requires renewed confirmation. New publication precedes old-job
cancellation and staging discard. The serial drain waits for admission and
confirmed CPU/GPU exit before claiming the next job; dispatch freshly qualifies
its own inference worker. Unconfirmed exit fences generation and retains its
process owner, including startup failures, until an explicit retry confirms exit.

One admission and at most one CPU target-preparation child are allowed. Existing
Save/import workers keep their own lifecycle. Qualification,
stale runtime/config/executable, missing target capability, concurrent admission,
closed/replaced document and shutdown refuse safely. Application shutdown cancels
preparation without waiting for its ordinary request deadline; per-Project close
uses the existing operation gate. Generate leaves dirty/Undo,
accepted layers, actual seed and `.igs` unchanged; future jobs use the frozen
payload even after edits. Save preview fallback remains a placeholder if its
worker is unavailable. Evidence uses actual Electron/SQLite/files and controlled
worker peers; full CUDA pipelines, Anima, conditioning and release runtime remain
separate work.

## Acceptance Criteria

- The prototype creates in-memory queue items from frozen project/generation state; production Queue Manager/worker integration remains separate.
- Generation mode is derived from target-area raster/mask content rather than a manual txt2img/img2img switch.
- Completed outputs appear as temporary candidates without mutating `.igs`.
- User can accept one or more normal candidates as new Raster Layers.
- User can accept one or more Smart Patch candidates as variants, with only one active.
- Existing Raster Layers and Smart Patch variants are never overwritten implicitly.
- Only accepted results store generation provenance and enter result history.
- Dynamic prompt expansion can create multiple concrete jobs.
