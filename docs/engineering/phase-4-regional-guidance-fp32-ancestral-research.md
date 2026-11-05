# FP32 CPU noise with fixed Invoke initialization

Base: clean `f3179e5940bb0ac4a0f4f41ec4762318d0f5649d`. The
[initial-latent control](./phase-4-regional-guidance-initial-latent-research.md)
isolated initialization arithmetic while keeping the original FP16 CPU draw.
It removed the extra third figure at seed123, but both selected swapped cases
remain visually inconclusive. The user keeps official Illustrious XL v0.1.
This next finite, test-only control isolates the initial draw dtype with
Invoke-style `add_noise` fixed in both arms.

## Source and mechanism

Consult current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `app/invocations/latent_noise.py`, `generate_noise_tensor`: draw once on CPU
  using a fresh seeded CPU generator, then cast on CPU to requested output dtype.
- `backend/util/devices.py`, `choose_noise_dtype`, and
  `app/services/config/config_default.py`: the default noise draw is FP32;
  the explicit legacy option uses the requested compute dtype.
- `app/invocations/noise.py`: CPU noise is the default. The callers in
  `app/invocations/sd/denoise_latents.py` transfer the already-cast tensor to the
  compute device/dtype and create zero txt2img latents.
- `backend/stable_diffusion/diffusion_backend.py` and the legacy
  `diffusers_pipeline.py`: original `scheduler.add_noise` initializes latents.
  The separate ancestral generator uses the xor-inverted seed.

Reuse the previous private observer seam around the original SDXL bound
`prepare_latents`. Temporarily intercept only that pipeline module's saved
`randn_tensor` alias during its original call. The control delegates once with
original arguments. The candidate delegates once with the same shape/layout
and CPU generator but `device=cpu`, `dtype=float32`; it casts on CPU to the
originally requested compute dtype, then transfers to the requested device.
FP32 transfer followed by a GPU cast is not the selected Invoke ordering.

Both arms then return the original scheduler's
`add_noise(zeros_like(compute_noise), compute_noise, first_timestep.expand(batch))`.
The original native sigma-scaled preparation is observed but not selected.
Do not patch `torch.randn`, global utility aliases, the scheduler's random alias,
model tensors or the denoising loop. Restore the original module alias, private
method's attribute presence and observer/factory slots on every exit.

## Fixed preregistration

Contract `initial-noise-dtype-control-v1`, SHA-256
`547e4219ad31336ecae922a68dc71fc9253fa1b73d431d64b1cf03d67f4ebaef`.
Evidence: `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-fp32-ancestral/20261105-add-noise`.
Exactly four trained calls, in order: seed123 compute-dtype draw, seed123 FP32
draw, seed124 compute-dtype draw, seed124 FP32 draw. No adaptive retries,
prompt/seed/model search or further trained cases after inspecting outputs.

Use the same complete retained genuine Main swapped handoffs and transparent
target bytes. Only operational request IDs and owned target/output paths change.
This does not claim a fresh Main capture or worker transport qualification.
The compute-dtype controls must exactly reproduce the previous `add_noise`/FP16
output RGB, not the earlier native `init_noise_sigma` outputs. Drift blocks
causal interpretation and is not corrected by tuning settings.

Keep the exact official epsilon checkpoint SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², bbox `(-13,5)`, Euler a/28, CFG5/rescale0 and Main's scaled-linear,
false-ZTSNR/leading policy. Embedded VAE remains explicit FP16. Retain global
count-tag text and regional `1girl, long hair, blue hair` left /
`1girl, long hair, red hair` right, empty negatives, no TI/LoRA/references,
binary half-mask owners at x512, Everywhere global supports, current-canvas
pools, negative-first CFG and `invoke-canvas-v1`.

## Oracles, bounds and failure scope

Before trained execution, exercise the actual adapter on small CPU/CUDA native
fixtures with original methods, independent draws, failures/restoration and a
fresh recovery. The CPU fixture's compute dtype is FP32: its draw arms can
coincide and cannot alone discriminate the candidate. CUDA FP16 supplies that
distinction; retain a control against the unchanged preceding adapter.

Require one unconsumed CPU generator and one initial draw. Reject supplied
latents, generator lists, reentry, extra draws and unexpected shapes/devices.
Retain the raw draw, CPU cast and consumed compute noise separately. Reproduce
each branch with its own independently seeded CPU generator; require exact raw
bytes, cast and post-state for that branch. Initial CPU before-states match;
raw values and after-states need not match across draw dtypes.

The independent compute-device ancestral generator stays at
`seed ^ 0xFFFFFFFF`, with equal before/after states at every paired step.
Schedules/config, native contexts, pools, time IDs and source inputs remain
fixed. Check chosen first scheduler sample, original first scaled UNet input,
latent/RNG chains, original decode and every independently quantized reopened
PNG RGB byte. Retain the same metadata-preservation scope as the previous run;
do not claim a new full trained-weight scan or all 70-site permission witness.

Serial units retain a 12 GiB host ceiling, zero swap, 600-second deadline and 0.75
CUDA allocator fraction. Reuse the one protected compatible Studio runtime,
config and checkpoint, without copies, downloads or provisioning. Raw initial
noise payload is 262,144 bytes in FP32 and 131,072 bytes after FP16 conversion;
these figures are not a peak-memory guarantee. Preserve setup failures and
physical-exit evidence separately from completed requests.

Inspect all four original images only after completion. Use anonymous copies
and an independent image-only observer, then the same conservative two-figure,
blue-left/red-right rubric. Ambiguous colors remain INCONCLUSIVE; retain scale,
framing and anatomy artifacts. Two targeted cases cannot qualify the complete
four-case reversal gate, human/age/full-prompt acceptance or general quality.

## Executed checks

ROOT executes six small original-native CPU/CUDA cases: **6 PASS, 32 warnings,
zero failures/errors/skips**, 9.31s. They compare the control against the preceding
unchanged initializer, independently reproduce both draw branches, preserve
step RNG and recover after preparation/observation failures. AST and scoped
Ruff lint/format checks pass. The installed-Python input preflight validates
all four retained inputs. There are no excluded native/setup attempts in this
run. Independent source-only review is CLEAN; its ten unchanged helper ASTs and
seven consulted Invoke source pins agree. It does not certify runtime results.

Executed probe SHA-256:
`5175cf0aa5a09a77faec1f28a99c9b886e7c5e8afea86ff62a42bc996ff1a3e6`.
Tests SHA-256:
`cb4fe36d2271aa3b4e9ad91b84d0604d335c6ac83884948e87cd223d646bb7ca`.
The frozen contract and all 63 installed worker/asset pins remain exact, with
the same Studio 0.14.0 runtime, Torch 2.7.1+cu126 and Diffusers 0.40.0. No update,
provisioning, download or environment/model copy is introduced.

## Numerical result

All four declared calls finish with 112 original UNet calls, 112 ancestral
transitions, 4 original VAE decodes, 4 published PNGs and 112 scalar progress events.
Each owned unit exits 0 with no remaining physical PIDs.

| Case            | Unit seconds | Peak host bytes | Swap bytes |
| --------------- | ------------ | --------------- | ---------- |
| seed123 compute | 29.095       | 1,795,551,232   | 0          |
| seed123 FP32    | 28.573       | 1,799,262,208   | 0          |
| seed124 compute | 28.304       | 1,797,144,576   | 0          |
| seed124 FP32    | 29.329       | 1,795,444,736   | 0          |

These are observed unit peaks, not general memory/capacity guarantees. Reused
checkpoint cache and other processes are outside a claim about whole-machine
peak residency.

ROOT's separate CPU-only exact-byte post-check confirms:

- Each raw draw and its CPU-generator state against an independent per-arm
  CPU `torch.randn` oracle; the CPU cast and consumed compute noise are exact.
- The first selected `add_noise` sample and independently calculated original
  first scaled UNet input; every latent and ancestral RNG chain remains intact.
- Same native schedule/config/sigmas and contexts/pools/time IDs across all 28
  steps, with identical independent CUDA-generator states before/after each step.
- Both compute controls reproduce every prior observed UNet/step descriptor
  except process-local generator identity, and the exact previous PNG bytes.
- Every original decoded tensor independently quantizes to every reopened PNG
  RGB byte, with matching ICC, dimensions and response association.

Observed CPU before-states **and after-states happen to match** across draw
dtypes at both seeds. This does not make their normal samples equal; each branch
passes its own independent raw-draw/post-state oracle. The initial compute noise
changes 65,528/65,531 of 65,536 elements. Its RMS difference is 1.418761/1.411519,
so this is substantially different fixed-seed noise, not merely a small final
rounding adjustment. Original `add_noise`, sigma and all step RNG remain fixed.

| Seed | Changed prepared elements | Changed prediction steps | Changed RGB channels | Changed pixels |
| ---- | ------------------------- | ------------------------ | -------------------- | -------------- |
| 123  | 65,527                    | 28 / 28                  | 3,106,334            | 1,048,565      |
| 124  | 65,531                    | 28 / 28                  | 3,139,581            | 1,048,573      |

Baseline raw-draw observation is the saved native alias's already-placed output;
its CPU descriptor is explicitly a copy of that output. Candidate records the
actual CPU FP32 draw and actual CPU cast before transfer. CPU-cast bytes equal
the retained compute-noise bytes; descriptors retain their distinct provenance.
This avoids claiming a pre-transfer baseline observation that was not made.

Preservation covers recorded component/tensor identities, placement, flags,
configs, vocabulary, hook keys, slot presence, borrowed scheduler metadata and
global RNG. No full trained-value scan/clone or fresh all70-site permission
witness is introduced. Terminal scheduler and original VAE descriptors are
retained without a new independent numerical terminal-to-VAE rescaling oracle.
This is a same-Studio-runtime source-based noise control, not numerical parity
with the separate installed Invoke application/runtime.

## Anonymous visual result

After all four completions, exact copies were randomized into
`anonymous-visual-observations/20261105-set-k`. An independent image-only agent
saw all four full originals without prompts, arm names or key. ROOT froze
descriptions before opening the key, but recognizes historical control images
and is not independently blinded. ROOT applies the fixed narrow count/color
rubric to those descriptions:

| Case            | Anonymous | Hair and figure observations                                             | Narrow result |
| --------------- | --------- | ------------------------------------------------------------------------ | ------------- |
| seed123 compute | 04        | Two; blue left, burgundy/pink-red right; extreme figure-scale mismatch   | INCONCLUSIVE  |
| seed123 FP32    | 03        | Two separate figures; periwinkle-blue left, saturated red right          | PASS          |
| seed124 compute | 02        | Two; silver/gray-white with icy-blue tint left, muted red/auburn right   | INCONCLUSIVE  |
| seed124 FP32    | 01        | Two separated, similarly scaled figures; dark blue left, vivid red right | PASS          |

For seed123 candidate, both ROOT and the blind observer describe blue hair,
with periwinkle/violet shading rather than silver-white dominance; red is
unambiguous. Its short/ponytailed hair and lower-body cropping remain material
full-prompt/framing limits. Seed124 candidate keeps both figures and feet inside
the frame, with sketchy hands, legs and footwear. Stylized appearance does not
establish adult age or human approval.

Control subset: **0 PASS / 0 FAIL / 2 INCONCLUSIVE**. Candidate targeted swapped
subset: **2 PASS / 0 FAIL / 0 INCONCLUSIVE**. The complete four-case reversal gate
remains **NOT_QUALIFIED**: no new direct-assignment cases were run under this
fixed FP32-plus-`add_noise` candidate. Earlier assignment images use a different
noise/initialization policy and cannot silently fill that gap.

This finite result supports keeping one source-grounded candidate for the
next direct-assignment/reversal check. It does not establish universal quality
improvement, a uniquely incorrect attention mechanism, full Invoke parity or
production-default/readiness promotion. No additional model/prompt/seed search,
adaptive generation or further trained call occurs in this run.

## Retention and scope

Keep all originals, anonymous copies/key/descriptions, frozen input/source pins,
raw tensors, native observations, tests, resource reports and prior negative
findings. ROOT verifies all 37 archived payload entries: 32 regular files and 5
directories, 31,350,365 regular-content bytes. After physical-exit, restoration,
incoming-dependency and reader checks, only the exact own `payloads` directory
is removed. Both deletion-only run/root intervals decrease by
**31,408,128 allocated bytes**. Archive/manifest, gates and closure records remain.
Shared runtime, model and previous Main/evidence dependencies
remain protected. No production profile/default, public admission, UI,
queue/persistence, Anima or provenance change.
PP-001/007/008 remain **«Пока не обещать»**.
