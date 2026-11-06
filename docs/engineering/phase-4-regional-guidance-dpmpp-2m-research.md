# DPM++ 2M with public Regional Guidance

Base: `25d2338462d2a38d6719ebecff41e3697f82a9ce`. High risk: native initialization
and multistep state, exact frozen sampling association, capability refusal before
composition/Retry/dispatch, installed worker lifecycle and accepted provenance.
Scope: Illustrious epsilon Current Canvas, DPM++ 2M with Normal or Karras. Existing
Euler/Euler-a profiles, static negatives/regions, dynamic global positive, exact
TI/LoRA/VAE owners and public provenance exclusions remain unchanged.

## Current InvokeAI and existing Studio owners

Current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `backend/stable_diffusion/schedulers/schedulers.py` maps `dpmpp_2m` and
  `dpmpp_2m_k` to native DPMSolverMultistepScheduler, solver order2, with the
  corresponding Karras flag.
- `app/invocations/sd/denoise_latents.py` chooses the scheduler independently of
  regional conditioning; `init_scheduler` creates its timeline and independent
  compute-device generator seeded with `seed ^ 0xFFFFFFFF`.
- `app/invocations/latent_noise.py` draws CPU FP32 noise, casts to compute dtype
  on CPU and transfers. `diffusion_backend.py` supplies zero txt2img latents and
  calls original `scheduler.add_noise` at the first timestep.
- `frontend/webv2/src/features/generation/core/graph.ts` and
  `canvas/addRegionalGuidance.ts` use that same denoiser for regional conditioning.

Studio's ordinary `select_inference_scheduler` already adapts the native DPM
construction. Reuse it and the original SDXL pipeline; add no second denoising
loop, scheduler implementation, recipe field or persistence schema.

Pinned native Diffusers0.40.0 source confirms DPM public `order=1`, despite
solver order2: there is one UNet/progress event per requested step. Timesteps
are selected-device int64, sigmas CPU float32, and `scale_model_input` is native
identity. `set_timesteps` resets model_outputs/lower_order_nums/step and begin
indices. Initialization must leave that history unconsumed; native SDXL sets
begin_index0 afterward. There is no Euler `is_scale_input_called` field.

The original add_noise computes the normalized noise contribution; multiplying
by init_noise_sigma1 is different. Preserve CPU draw/cast ordering, native state,
integer timesteps and the original multistep updates. Do not emulate Euler flags,
cast timesteps, reset history, or repair borrowed scheduler state.

## Finite extension and admission

Add three explicit execution profiles:

- `ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cpu-v1`
- `ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-fp16-v1`
- `ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1`

Each requires the existing Invoke encoding/composition, epsilon, detached
versioned noise policy, and command-selected `dpmpp_2m` or `dpmpp_2m_k`. Public
frozen material must carry existing `invoke-cpu-f32-add-noise-v1`. Its absence
does not select a new default. Legacy private/public Euler histories retain
their prior meanings and refusals.

Advertise `illustrious-regional-dpmpp-2m-v1` separately on the qualified worker.
Use existing capability/advisory wiring, including one optional strict transient
Boolean. Refuse absent support before composition, frozen Retry SQL and dispatch.
Retry selects the frozen sampler/policy/resources rather than the current draft.
Existing command scheduler keys, atomic queue ownership, schemas and provenance
serializers remain reusable; no .igs or queue migration is needed.

Retain current bounds:1..200 steps, public CFG `(1,30]`, rescale0, three enabled
regions, maxPrompts1..100 and aggregate32 jobs, existing dimensions/area, text/TI/
LoRA/mask/transport budgets and profile precision. Karras/noise-policy validation
continues through the existing ordinary policy validator. No SDE, v-prediction,
image mode, Anima, regional references, global-negative/regional dynamics or
product-default expansion belongs to this slice.

## Qualification boundary

Focused native tests cover CPU/CUDA and both scheduler keys, true timeline/sigmas,
CPU noise/cast/add_noise, first native input, multistep history/transitions,
terminal decode and independently reopened PNG. Include selected VAE/TI/LoRA,
hostile borrowed scheduler history, refusal ordering, late recoverable failure,
fresh recovery and unchanged Euler/Euler-a controls. Main tests retain actual
Service/capture/planner/SQLite/files/Retry/provenance with explicitly controlled
catalog/compositor/numerical substitutes.

Installed qualification reuses the existing canonical runtime/catalog/checkpoint
and exact resources. A bounded worker payload refresh may update code/capability
in place after idle proof; no model/environment copy or dependency provisioning.
Original DPM++2M/Karras30, two positive variants/seeds123/124, observed Cancel at
steps5/6, saved Euler/Normal2 and other template/resource/mask edits, then explicit
frozen Retry124. Require three original wires/two PNGs, own Results/receipts,
concrete original provenance, Add/Discard/Undo/Redo and Save/reopen.

Use serial3GiB lower-test units and the existing aggregate12GiB host, zero-swap,
600-second installed envelope (2GiB launcher/10GiB native). Payload arithmetic
and finite completion do not establish general host/VRAM capacity or quality.
Preserve raw semantic RED/control/restoration and failed setup attempts separately.

Evidence: artifact-relative
`runs/regional-guidance-dpmpp-2m/20261106-normal-karras`. ROOT execution is
reported below; independent source review does not requalify that execution.
Anima, release and PP-001/005/007/008 statuses remain unchanged.

## Executed technical evidence

ROOT:576 Main PASS, including35 new projected cases, and352 distinct Python
PASS, including53 new native cases. The18 cases affected by final type-only
callback/alias corrections passed again; they are not added to the unique total.
The listed Python units report426 warnings including that repeated subset.
TypeScript typecheck, strict Python typing, scoped ESLint/Prettier/Ruff and build
PASS; the existing large-bundle build warning remains. No prototype UI changed.

Three isolated mutations produce24 selections:20GREEN/4semanticRED, with all
controls GREEN and exact1,497-file restoration. Missing capability and valid
Karras-to-Normal misrouting are Main RED cases. Bypassing add_noise with
noise*init_noise_sigma produces CPU/CUDA RGB RED after original native PNG
publication, against an independently initialized original SDXL oracle. Legacy
Euler controls remain GREEN. These prove the stated test sensitivity, not quality.

The canonical installed worker was refreshed in place, with unchanged dependencies,
models and configuration;52 Python modules and the new capability were verified.
Its new refresh companion is a protected runtime dependency. Installed native-r1
passes18 grouped checks in402.399s: real UI selection, DPM++2M/Karras30, dynamic
prefix2of3, A123/C124 batch, Cancel after genuine step progress, saved Euler/Normal2
and template/options/TI/mask/LoRA/VAE edits, then frozen C124 Retry. All three
original wires retain dpmpp_2m_k and the required initialization identity. Two
PNG receipts reach signed Results, reviewed Raster Add/Discard/Undo/Redo, explicit
Save ZIP and reopen with the original concrete base provenance. Prior SQL rows,
packages and candidate bytes remain preserved. Seeds differ, so these two images
do not establish resource causality.

Excluded diagnostics remain retained separately: initial resolver-count and old
unsupported-sampler expectations; an outdated ready-capability list; missing
parent directories in two native test launchers; and the first mutation campaign's
native setup error. Corrections preserve assertions about the intended owner;
the accepted campaign is R2. The first visual launcher refused the fixture's
parent-directory mismatch before any request; its byte-identical fixture was
placed beside the contract before the six-case run. None is a semantic RED.

Independent frozen source review is CLEAN within its source-only scope, including
all25 deltas/3 additions and six retained primary-source pins. Runtime, visual and
retained-byte conclusions are separate evidence levels.

## Fixed visual continuation

Reuse the existing genuine character Main producer and direct installed-worker
visual harness through one additive test-only `regional-dpmpp-2m-karras-v1`
profile. Six preregistered cases: baseline/assignment/swapped at seeds123/124,
1024 square at(-13,5),28 steps/CFG5, Embedded/FP16, empty negatives/resources,
two binary half masks, explicit Invoke composition/initialization for every
case. Baselines are genuinely authored with disabled regions and recipe.regions
empty, using the same regional execution owner as the other four images.

Global text remains the previous `2girls, anime illustration of two women standing
apart side by side, waist-up, simple clothing, plain light gray background,
coherent daylight`; regional texts stay `1girl, long hair, red hair` and
`1girl, long hair, blue hair`. No prompt/seed search, repeat or automatic retry.
Current contract SHA is61b46004c99a7e0664d5706731ac14478be11222dd71811a5dc7a3dac587d073.

Blind observations precede assignment reveal. Two recognizable separate figures,
identifiable intended hair colors/sides and reversal at both seeds are required;
missing/extra/fused figures or clear wrong association fail, ambiguity is
inconclusive. Changed RGB is not a visual PASS. Human acceptance remains separate.
The old six-image Euler-a series used another initialization, so no sampler-only
historical causality claim follows. Direct Main/backend visual execution does
not add another Queue/UI/Add/Save qualification.

ROOT visual-r2 completes six original native calls and six mechanical PASS in
280.713s, with28 original scalar progress events each. All six reopened PNGs
match their own recorded RGB/file digests,1024-square dimensions and pinned ICC.
No extra request, repeat or adaptive retry was issued. Assignment/swapped differ
by3,118,253/3,126,448 RGB channels at seeds123/124; inequality is not visual PASS.

A fresh independent agent described randomly numbered full images without the
prompts or label map. ROOT then revealed the map and applied the fixed criterion:

| Case               | Narrow visual result | Observation                                                                                  |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------- |
| seed123 assignment | INCONCLUSIVE         | Two separate figures; red left, violet/blue-purple right, so the required blue is ambiguous. |
| seed123 swapped    | PASS                 | Two separate figures; icy-blue left, red right.                                              |
| seed124 assignment | PASS                 | Two separate figures; rose-red/auburn left, light-blue right.                                |
| seed124 swapped    | PASS                 | Two separate figures; cobalt/navy left, red right.                                           |

Both baselines show two distinct figures; they have no required color assignment.
Overall **NOT_QUALIFIED:3 narrow PASS/0 FAIL/1 INCONCLUSIVE**. Human acceptance
remains pending. Hand anomalies, decorative background lines, a text-like smear
and cutout contours remain visible; narrow color/side findings do not establish
general image quality. The blind descriptions, map, all original bytes and ROOT
adjudication remain retained. No sampler-only improvement over historical images
is claimed because their initialization differed.

## Retention and completion

All4,721 entries of six exact owned payloads are retained in a verified no-follow
archive;30 external input entries include the report-owned packages, exact tiny
TI/LoRA files, own queue inputs and a consistent SQLite backup. Two wholly owned
two-link negative fixtures retain both byte streams and explicit inode topology;
literal symlinks are preserved without following their targets. Checkpoint/full
VAE originals, current runtime/catalog/configuration, saved projects, historical
business data and the refreshed worker companion remain protected dependencies.
Independent complementary source/docs/retained-byte audit is CLEAN. It verifies
all source/archive members, both SQLite integrity/FK checks and21 migration hashes,
ten IGS packages, original mutation RGB contrasts285 CPU/290 CUDA channels and
the disclosed visual findings. This is retained-data verification, without a
native rerun or physical-release certification.

ROOT then confirms38 ended recorded units, exact mutation restoration, all readers
READFINISHED, current source agreement and247 lifecycle records with no incoming
exact-child dependency. Six exact idle payloads are disposed after archive
verification, reclaiming117,637,120 allocated bytes in the deletion-only interval.
Both approved hardlink groups show witnessed2→1→0 transitions; no normalization
or external deletion occurs. Lifecycle is retained with payloads empty. Compact
evidence, anonymous original PNG copies and all protected dependencies remain.
Finalization changes only these three documents; implementation/test/harness
bytes remain qualification-exact. Archive/audit and ROOT release evidence retain
their separate limits; none promotes public quality or promise readiness.
