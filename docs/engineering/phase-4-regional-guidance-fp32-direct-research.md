# Direct assignment with fixed FP32 Invoke initialization

Base: clean `a730f2512a150d175c1d5eb273cdef58707f2cb1`. The preceding
[FP32 draw control](./phase-4-regional-guidance-fp32-ancestral-research.md)
gives two narrow swapped PASS, with blue left/red right. This finite continuation
checks red left/blue right at the same seeds, completing the selected four-case
count/color reversal matrix without a new model, prompt or seed search.
Full prompt, age, framing, general quality and human acceptance remain separate.

## Source and unchanged execution

Recheck clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:
`app/invocations/latent_noise.py`, `backend/util/devices.py`, configuration and
noise invocation select FP32 CPU drawing, then cast on CPU to compute dtype.
`app/invocations/sd/denoise_latents.py` transfers that noise to the compute
device/dtype; `backend/stable_diffusion/diffusion_backend.py` and the legacy
`diffusers_pipeline.py` use original `scheduler.add_noise` with zero txt2img
latents. The ancestral generator is separately seeded with `seed ^ 0xFFFFFFFF`.

Reuse the preceding frozen probe SHA-256
`5175cf0aa5a09a77faec1f28a99c9b886e7c5e8afea86ff62a42bc996ff1a3e6`.
Only two metadata functions change: contract membership/ceiling and genuine
Main input association. All other function ASTs, including the initializer,
original native observers, numeric checks, loader and output path remain exact.
No diffusion loop, model components, production profile/default or source
worker is changed. The preceding six executed CPU/CUDA native tests remain
historical evidence for the unchanged adapter, not fresh tests in this run.

The previous probe cannot accept direct-assignment inputs by changing constants
alone: it unconditionally requires the old report's swapped input hashes to
match the current case. The adapted metadata guard instead pins that report's
own `rngWitnessInput`, preserves its status/seed/report/PNG ownership checks,
and independently verifies the actual assignment handoff/request/target.
The preceding swapped report is solely an initial-generator/CUDA-step-RNG
witness, not an oracle for assignment text, context, prediction or image equality.

## Preregistration

Contract `fp32-direct-assignment-v1`, SHA-256
`5006dcb73b14ea8c18beac9b909c5ddce2ba5e7407d54a0733bc7e949fe2dcbc`.
Evidence: `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-fp32-direct/20261105-assignment`.
Exactly two new trained requests: seed123 assignment, then seed124 assignment.
No baseline, repeat, extra swapped call, adaptive retry, or image-driven
prompt/seed/model/setting change is introduced. Inspect only after both finish.

Consume the complete retained genuine saved/reopened Main assignment handoffs
and their matching concrete requests unchanged. Fresh operational request IDs
and owned staging paths preserve the original target bytes and generation
fields. This does not establish a fresh Main capture, queue transport, durable
candidate or public application request. The two already retained swapped FP32
outputs and their complete source/data associations stay pinned for comparison.

Keep official Illustrious XL v0.1 epsilon, SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024² at bbox `(-13,5)`, Euler a/28, CFG5/rescale0, Main scaled-linear,
false-ZTSNR/leading policy, embedded manual-FP16 VAE and seeds123/124.
Initial noise is drawn FP32 on CPU, cast FP16 on CPU and transferred to GPU
before original `add_noise`; compute-device ancestral RNG remains separate.

Global count-tag text, empty negatives, no TI/LoRA/references, binary half masks
split at x512, Everywhere global supports, current-canvas pools, negative-first
CFG and `invoke-canvas-v1` stay fixed. Direct regional text is
`1girl, long hair, red hair` left / `1girl, long hair, blue hair` right.
The comparison uses authored text swaps on the same fixed mask owners; it does
not mutate a Python recipe into an allegedly equivalent Main input.

## Acceptance and limits

Model-free preflight must accept both actual envelopes and detect their
association with retained sources. Snapshot installed worker/config/native
source pins before reuse. No model/environment copy, download or provisioning.
Serial units retain a 12 GiB host ceiling, zero swap, 600-second deadline and 0.75
CUDA allocator fraction. These are operational guards, not capacity claims.

Retain original draw, compute noise, selected preparation, UNet/step descriptors,
decode and PNG. Independently reproduce each FP32 CPU draw/post-state and CPU
cast; require the same raw noise, initialization and every ancestral RNG state
as the same-seed retained swapped FP32 candidate. Schedules, pools and time IDs
remain exact. Regional contexts should change with authored text assignment;
do not require their equality. Check first native scaled UNet input, step chains,
response association and every decoded-to-PNG RGB byte. Preservation is the
unchanged recorded metadata scope, not a full trained-value scan or a fresh
all 70-site permission witness; terminal/VAE descriptors add no independent
numerical terminal-to-VAE rescaling oracle.

Use one anonymous four-image cohort containing both new direct assignments and
the two pinned swapped candidates. An independent image-only observer sees no
prompts/key. Apply the prior conservative count/color rule: two distinct
head/body associations, one per half, red left/blue right for direct and the
reverse for swapped. Extra/missing/fused figures or clear wrong association
FAIL; ambiguous count/color stays INCONCLUSIVE. Record anatomical, scale,
framing and full-prompt limitations separately. Passing this four-case matrix
qualifies only the finite AI count/color observation, not human visual approval,
age, full-prompt compliance, general quality or a production default.

## Executed metadata and numerical checks

Executed probe SHA-256:
`083bbdf05914422480ff05eb789fdba29112e53c48053574cf1241e5eec07099`.
Independent source/retained-metadata review supports the adaptation. Full Main
recipes compare equal to their matching concrete requests. Against same-seed
swapped recipes, only document revision and both authored/effective regional
positive text locations differ. Complete authored documents likewise differ
only in revision and the two texts. IDs, mask owners/revisions, encoded alpha
coverage, global text, local-empty negatives, resources, seed, checkpoint,
sampling, bbox and target metadata remain exact. Authentic capture labels,
package hashes, planner IDs, paths and timestamps are retained as such.

AST and scoped Ruff lint pass. Ruff format reports one metadata guard line that
would be wrapped; executed frozen bytes are retained unchanged. This is a private
probe formatting exception, not a native failure. Installed-Python preflight
accepts both complete inputs without ML execution. The preceding six native
tests remain historical; no fresh small suite is claimed here.

Both declared requests finish. There are no failed/excluded native attempts,
retries or extra calls: **2 fresh completions, 56 original UNet calls, 56 ancestral
transitions, 2 original VAE decodes, 2 published PNGs and 56 scalar progress events**.

| Case               | Unit seconds | Peak host bytes | Swap bytes |
| ------------------ | ------------ | --------------- | ---------- |
| seed123 assignment | 26.766       | 1,801,342,976   | 0          |
| seed124 assignment | 26.518       | 1,794,826,240   | 0          |

Both units exit 0 and have no remaining physical PIDs. Observed unit peaks are
not general capacity or whole-machine residency guarantees. The same compatible
Studio 0.14.0 runtime/config and 63 worker/asset pins remain verified, with no
provisioning, downloads or model/environment copies.

ROOT's separate CPU-only post-check confirms both FP32 draws, CPU FP16 casts and
post-draw states independently. Each direct request's complete preparation row,
raw draw, compute noise and selected initialized latent exactly match its
retained same-seed swapped FP32 candidate. Schedule/config/sigmas, global pools,
time IDs and all 28 ancestral RNG before/after states remain exact. First scaled
UNet inputs and latent/RNG chains pass. Native context and guided prediction
hashes change at all 28 steps as authored regional text is reassigned:

| Seed | Changed context steps | Changed prediction steps | Changed RGB channels | Changed pixels |
| ---- | --------------------- | ------------------------ | -------------------- | -------------- |
| 123  | 28 / 28               | 28 / 28                  | 3,108,180            | 1,048,574      |
| 124  | 28 / 28               | 28 / 28                  | 3,137,153            | 1,048,574      |

Every reopened direct and reused swapped PNG matches independent quantization
of its original decoded tensor. ICC, dimensions, seed/request/output correlation,
recorded borrowed metadata/global RNG and observer restoration checks pass.
No new full trained-value scan, all 70-site numerical permission witness or
independent terminal-to-VAE rescaling oracle is added. This is private native
output evidence; it does not requalify installed UI/queue/durable publication.

## Four-image visual result

After both requests complete, exact new originals and pinned swapped originals
are randomized into `anonymous-visual-observations/20261105-set-l`. A fresh
image-only agent sees no prompts/key. ROOT freezes descriptions before opening
the key but recognizes prior swapped images and is not independently blinded.
The following is ROOT's conservative application of the existing narrow rubric:

| Case               | Anonymous | Visible result                                                                                          | Narrow result |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| seed123 assignment | 01        | Two readable associations; smaller red/rose figure heavily occluded left of a large central blue figure | INCONCLUSIVE  |
| seed124 assignment | 02        | Two separated full figures; red/coral left and clear dark blue right                                    | PASS          |
| seed123 swapped    | 03        | Two separate bodies; periwinkle/light-blue left, saturated red right                                    | PASS          |
| seed124 swapped    | 04        | Two similarly scaled full figures; blue left and red right                                              | PASS          |

At seed123 direct, count is two rather than a count FAIL. Red/rose confidence
on the partly hidden figure remains conservative; heavy overlap, central
foreground placement and scale mismatch are recorded without silently treating
the result as an unambiguous association success. No new anatomy or full-prompt
requirement is added to manufacture a narrow FAIL. A human may evaluate the
retained original, but no human acceptance is supplied here.

The two unchanged swapped PASS retain their preceding full observations and
original bytes. In seed124 swapped, the current observer also mentions rose
shading; the prior blind observer explicitly described vivid red, and ROOT
still sees clear red. That earlier accepted observation is not erased. Minor
hands/shoes, cropping, stylized age and hair-length/full-prompt limits remain.

New direct subset: **1 PASS / 0 FAIL / 1 INCONCLUSIVE**. Complete selected
four-case count/color matrix: **3 PASS / 0 FAIL / 1 INCONCLUSIVE**, overall
**NOT_QUALIFIED**. Same-seed reversal is confirmed by this narrow AI observation
for seed124; seed123 direct remains inconclusive. The numerical change proves
influence of authored reassignment, not universal layout/quality success, full
Invoke pixel parity or a unique Studio attention defect. No additional image
search, settings change or default promotion follows from these two calls.

## Retention and scope

Keep all new and reused originals, frozen source/input associations, anonymous
descriptions, raw native data, resource reports and prior negative findings.
ROOT verifies all 19 archived payload entries: 16 regular files and 3 directories,
15,717,136 regular-content bytes. After physical-exit/source/incoming/reader
gates, only the own exact idle `payloads` directory is removed. Both deletion-only
run/root intervals decrease by **15,745,024 allocated bytes**. The archive,
manifest, gates and closure record remain. Shared runtime/model,
previous raw archives and all required compact dependencies remain protected.
PP-001/007/008 remain **«Пока не обещать»**. No production profile/default,
public permission, persistence, UI, Anima or provenance change follows.
