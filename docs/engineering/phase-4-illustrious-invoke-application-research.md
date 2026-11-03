# Installed InvokeAI ordinary reference

## Question and frozen scope

Base: clean `5a1eae7513d4c97f1a350c1d0b439d8b9db091ee`.
The [author-sampling control](./phase-4-illustrious-author-sampling-research.md)
left a predominantly white mug at seed123. The next agreed comparison was one
ordinary generation in the actual installed InvokeAI application, against that
already retained Studio image. No new Studio generation, prompt/seed search or
regional algorithm change belongs to this comparison.

Use the exact official Illustrious XL v0.1 checkpoint, SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
6,938,040,760 bytes. Fixed visible settings are seed123, 1024², Euler a, 28 steps,
CFG 5, rescale zero, CPU noise, embedded untiled FP16 VAE and empty negative.
Positive text is unchanged:

> a still life of a red apple and a blue ceramic mug on a plain table, two separate objects, soft studio lighting

No regions, TI, LoRA, reference images, external VAE, refiner or HiDiffusion.
The previously frozen visual criterion remains one recognizable red apple and
one blue mug, plausible support/geometry, coherent scene and no extra mugs/fruit.

## Actual application and source boundaries

Current source checkout remains clean Invoke
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`. Its real frontend graph producer
`invokeai/frontend/webv2/src/features/generation/core/graph.ts` supplies the
conditioning/noise/denoise/decode ownership, with the same text into SDXL prompt
and style and separate global positive/negative collections.

The user's existing installed application is **InvokeAI 6.14.3**, under
`<external-drive>/InvokeAI/.venv`. It has different source bytes from
that checkout. ROOT read the installed implementation before using it and
retained 19 relevant source files with hashes. Installed owners include:

- `app/run_app.py`, real model-install/session-queue API routers and services;
- `app/invocations/{sdxl,compel,noise,latent_noise,denoise_latents,latents_to_image}.py`;
- `backend/model_manager/load/model_loaders/stable_diffusion.py`;
- `backend/stable_diffusion/{diffusers_pipeline,schedulers/schedulers}.py` and
  `backend/util/devices.py`.

The installed environment supplies Torch 2.7.1+cu128, Diffusers 0.40.0,
Transformers 5.5.4, Compel 2.4.0 and safetensors 0.8.0. Studio's retained request
used Torch's CUDA12.6 build. This is a complete installed-application reference,
with explicitly different runtime/input policies; it is not a claim of complete
numerical equivalence or a single-factor causal experiment.

Known differences were frozen before execution:

- Installed noise draws CPU FP16 through `choose_torch_dtype`; it lacks the
  current checkout's FP32-default `choose_noise_dtype` mechanism. Studio drew
  CPU FP32 and then converted to FP16. Equal seed numbers do not equalize draws.
- Installed legacy initialization uses `scheduler.add_noise` on zero latents;
  Studio retains native Diffusers `init_noise_sigma` initialization.
- Invoke derives the scheduler from its loaded model configuration, while
  Studio consumes Main's detached versioned noise policy. Actual configuration
  and timesteps are observed, rather than inferred from the scheduler name.

The selected `l2i.fp32=false` matches the saved Studio VAE precision; it does not
claim the current Invoke frontend's FP32 fallback. No installed source or user
configuration is patched to hide a difference.

## One real queue request

Evidence owner:
`runs/regional-guidance-invoke-application/20261103-seed123/`.
`reference-contract.json` freezes a maximum of **one** new native request.
The installed app runs through its real entry point/API on localhost, with a
separate agent-owned root, database, queue, models directory and outputs. The
user's Invoke database, catalog, history and original configuration are unused.
The exact checkpoint is independently SHA-256 verified and registered **in
place** through the real model API. Its returned BLAKE3 identity is retained
separately from the SHA-256 input identity. No weight or environment copy is made.
Seventeen existing HF configuration/tokenizer files are copied into an isolated
offline cache to avoid modifying the shared cache; no model download occurs.

The genuine graph has eight nodes: SDXL model loader, two SDXL Compel prompt
nodes, two collectors, noise, denoise and `l2i`. Fixed text/seed fields replace
only frontend input-value nodes. The real API validates/enqueues the graph and
the original installed loader, conditioning, denoising loop and image service
consume it. The output's embedded `invokeai_graph`, submitted/accepted graph,
model record and completed queue item are retained.

Transparent observers call original noise, scheduler, UNet and VAE functions
unchanged and return their original results. They retain bounded hashes and one
raw decoded image, without another denoising loop or a second model request.
Source review corrected unsupported CLI flags and a batched-timestep observer
assumption before execution. ROOT also made the final report create-only so a
later interrupted-resume attempt cannot overwrite the original record.

The **application and queue item completed**, producing one PNG: one noise draw,
28 original UNet forwards, 28 ancestral scheduler transitions and one decode.
The output is RGB 1024². Every reopened RGB byte matches independently calculated
quantization of the observed original FP16 decode. Invoke's PNG has its graph
metadata and no ICC profile; Studio's retained PNG has the pinned 588-byte ICC.
That metadata difference is recorded, not silently normalized into equality.

Actual text context `[2,77,2048]` is byte-exact to Studio at all 28 UNet calls.
The scheduler is EulerAncestralDiscreteScheduler, epsilon, scaled-linear,
false-ZTSNR, leading spacing, offset1; the grid `946,911,...,1` also matches.
Raw initial noise, first scheduler input and first prediction differ. Thus the
earliest observed difference is already before denoising; later pixel differences
cannot be uniquely assigned to attention, the model, initialization or runtime.
Pooled/time-ID tensor equality was not independently observed in this run.

## Visual finding and interpretation

ROOT viewed both originals. A separate image-only reader saw anonymous copies
without prompts, provenance or the key. Its descriptions agree with ROOT:

- Invoke produces one red apple and **five white drinking vessels** with blue
  decoration/rims, plus additional tableware and an ambiguous foreground item.
- Studio's retained image has one red apple and one predominantly white handled
  mug with blue decoration/liquid, with broadly coherent support and geometry.

The actual Invoke reference **fails the frozen scene criterion**, too. The PNGs
differ in 3,103,127 RGB channels / 1,048,519 pixels. These numbers show a changed
image, not useful visual improvement. Human acceptance and regional visual
assignment/reversal remain unqualified.

This weakens the hypothesis that this scene's count/color errors arise only
from Studio. It does not prove a sole checkpoint cause or equivalence of the
complete implementations: noise, initialization and runtime differ. The proposed
ordinary installed-reference question is now answered. Further sampler/seed
sweeps or a regional-mask rewrite are unsupported by this outcome. Future
regional evaluation must keep ordinary model/prompt limitations distinct from
region-association behavior; a perfect ordinary apple/mug render cannot be
assumed merely because the reference product is Invoke.

No Studio implementation, production default, public admission, Main durability
or Anima capability changes. Frozen Retry independence, Smart target-only
permissions and provenance/Compare/preset exclusions remain intact;
PP-001/007/008 remain **«Пока не обещать»**.

## Operational result and retained limits

The single owned unit lasts 39.093 seconds with host MemoryPeak
10,815,848,448 bytes, zero unit swap, MemoryMax12GiB and 600-second deadline;
the app uses CUDA allocator fraction0.75 and explicit 8GiB RAM/VRAM cache budgets.
These are observations for this request, not a general capacity result.

The controller reports **exit90**, separately from application success: after
the successful parent exit, it detected one remaining owned PID and stopped
the entire owned group. Its fresh `physicalRemainingPids` is empty. This cleanup
flag is preserved; the unit is not relabelled a clean zero-exit PASS, and no
generation is repeated. The isolated database and its startup backup both pass
integrity checks with zero foreign-key violations.

Required evidence includes contract, source/config pins and source archive,
actual OpenAPI/version, model registration, submitted graph, queue completion,
native observations/raw decode, PNGs, blinded descriptions/key and numeric
comparison. ROOT closes physical/source/dependency/reader gates before archiving
and disposing only this run's payloads. Shared checkpoint/runtime and historical
comparators remain protected.

Retention closes all **92 payload entries** (50 regular files, 42 directories;
no links or special files) with full archive read-back and a fresh exact live
inventory. `retained-payloads-r1.tar.gz` is 7,587,871 bytes, SHA-256
`1931637b98d6b8d7b026d7da47855c997e178eea5d1c4a364396cb840ff6a985`.
It preserves the isolated database/backup, actual root config, offline inputs,
native decode and original app output. Before deletion, ROOT freshly verifies
both recorded units/groups, completed readers, current Studio/installed source
pins and scoped incoming references. Accessible same-UID handles have no
candidate users; inaccessible preexisting desktop-service handles remain
explicit exclusions, not a complete OS census.

Only the exact owned `payloads` tree is removed: **17,444,864 allocated bytes
reclaimed during the deletion-only interval**. All original display PNGs,
native observations, API/graph/model/queue evidence and source manifests remain
directly readable; raw paths inside disposed payloads now refer to archived
reproduction bytes. Lifecycle is `retained` with no live payloads. The installed
runtime, shared checkpoint, original HF cache and historical controls remain
protected; no second ML environment is provisioned.
