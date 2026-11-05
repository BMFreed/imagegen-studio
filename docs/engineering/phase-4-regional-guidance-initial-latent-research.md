# Same-runtime initial-latent control

Base: clean `e949f54f489f301e6a763d6452dbd7eaf5cb69ff`. The
[installed Invoke Euler-a reference](./phase-4-regional-guidance-invoke-ancestral-research.md)
and Studio both leave the narrow color/side reversal gate unqualified. Their
initialization differs, but its causal contribution has not been measured.
The user retains official Illustrious XL v0.1. This is a test-only intervention,
not an inference repair or a new execution default.

## Fixed question and source

Read current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:
`app/invocations/sd/denoise_latents.py` creates zero txt2img latents and its
caller supplies the compute-device noise/initial timestep;
`backend/stable_diffusion/diffusion_backend.py` and the legacy
`diffusers_pipeline.py` call original `scheduler.add_noise` on those values.
The legacy comment about `init_noise_sigma` remains a source TODO, not evidence
that either behavior is universally correct.

Pinned Diffusers 0.40.0 SDXL retrieves timesteps before `prepare_latents`. That
method draws raw noise once via its module's `randn_tensor` alias and returns
`noise * scheduler.init_noise_sigma`. For leading Euler ancestral this scale is
`sqrt(max(sigmas)^2 + 1)`. Original ancestral `add_noise` instead converts the
selected first-timestep sigma to the sample device/dtype and computes
`zeros + noise * sigma`. It uses local schedule copies without changing
scheduler state. These arithmetic paths can differ in FP16; no division of the
already scaled result or algebraic rescaling is an adequate raw-noise recovery.

Use the same Studio installed runtime and original private owners in both arms.
The test adapter observes the original SDXL module alias only inside the original
bound preparation method, retaining its untouched raw-noise object. Native arm
returns the original prepared result. Candidate arm returns original native
`add_noise(zeros_like(raw), raw, first_timestep.expand(batch))`. Do not patch
`torch.randn`, the shared utility namespace, the scheduler's separate random
alias, the denoising loop or trained tensors. Restore the private method's
attribute presence, original module alias and factory-observer slot in `finally`.

## Preregistration

Contract `initial-latent-control-v1`, SHA-256
`91d3a4bf0dd13df0605299f9b9abaa83a80986397f27081670a7fe64e0b296e5`.
Evidence: `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-initial-latent/20261105-euler-a`.
Exactly four fresh native calls: seeds123/124, each with native and Invoke-style
initialization. Reuse each complete genuine saved/reopened Main **swapped**
handoff unchanged. Operational request ID and owned target/output paths are
fresh; original target bytes and all generation fields remain exact. This is
not a new Main capture or worker-transport qualification.

Keep the exact official epsilon file SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², bbox `(-13,5)`, Euler a/28, CFG5/rescale0, Main scaled-linear/false-ZTSNR/
leading policy and embedded explicit FP16 VAE. Texts remain the count-tag global
and regional `1girl, long hair, blue hair` left / `1girl, long hair, red hair`
right. Empty negatives, no TI/LoRA/references, binary half-mask owners at x512,
Everywhere global supports, current-canvas pools, negative-first CFG and
`invoke-canvas-v1` are fixed.

Do not adopt current Invoke's FP32 initial draw in this control. Both arms keep
Studio's original compute-dtype CPU draw and separate compute-device ancestral
step generator at `seed ^ 0xFFFFFFFF`. This isolates initialization arithmetic,
not full Invoke parity or the independent noise-dtype question.

## Oracles and bounds

Before trained calls, exercise the adapter on existing small native CPU/CUDA
fixtures, including restored slots and recoverable failure. Observe exactly one
raw draw, same bytes and generator state across paired arms, unchanged source
inputs, timeline/config, contexts/pools/time IDs and ancestral RNG progression.
Require no supplied latents, generator list, reentry or extra draw. Initial
scheduler step/begin indices stay None during preparation; the original pipeline
sets its begin index later. Check the first original step sample equals the
chosen prepared tensor and the first UNet consumes its native scaled value.
Retain predictions, terminal/decode association and independently quantized PNG
bytes. No model preservation clone or second diffusion loop is introduced.

Native baselines must reproduce retained Studio RGB exactly. Baseline drift
blocks attributing candidate differences to this initialization; no tuning or
extra attempt is allowed to manufacture agreement. Inspect all four images only
after completion. Keep the existing conservative swapped count/color rubric,
recording scale/framing/anatomy artifacts and ambiguous shades honestly.
Even two successful candidates cannot qualify the complete four-case reversal
gate, general quality, age compliance or human acceptance.

One FP16 latent/noise tensor is131,072 bytes. Serial units retain a12 GiB aggregate
host ceiling, zero swap and600-second per-unit limit, with existing0.75 CUDA
allocator guard. Reuse the one protected Studio runtime/config and checkpoint;
no model/environment copies or provisioning. Payload arithmetic is not a
capacity guarantee. Preserve failed attempts and physical-exit evidence.

## Executed checks and setup exclusions

ROOT executed six small original-native CPU/CUDA tests: **6 PASS, 28 warnings,
zero failures/errors/skips** in 9.68s. They exercise the actual adapter, raw draw,
unchanged step RNG, native repeat and restoration after preparation/observation
failures. AST and scoped Ruff lint/format checks pass. Independent source review
agrees with the original Invoke/native consumers; it supplies no runtime
certification. Its one setup finding is recorded below.

Three setup attempts remain excluded from trained inference evidence:

- A wrong config-directory assertion occurred before model loading; the existing
  installed prefix's `resources/sdxl-config` is the correct dependency.
- A system-Python input preflight lacked `imagegen_worker`; the actual installed
  Python subsequently validates all four inputs without native requests.
- The first trained preparation loaded the checkpoint but the existing output
  validator refused a group-writable test staging directory. It had zero latent
  preparations, UNet/Euler/VAE calls or progress events. Original metadata/slots
  and sources were restored; the owned process exited. The only probe correction
  is `stage.mkdir(mode=0o700, parents=True, exist_ok=False)`. Original source,
  failed report and logs remain under `setup-attempt-r1`; this is one additional
  loading attempt, not a completed diffusion request or semantic RED.

Frozen contract is unchanged. Executed probe SHA-256:
`10f319186fedb05a3b3aa1b0094a495fb9cc7522a5a18b8f3ecff7d6303fdfbb`.
The six earlier small tests used the original probe; this one-line staging fix
does not affect their adapter code. A model-free check verifies the 0700 mode.

## Same-runtime numerical result

All four declared trained calls complete through the installed Studio 0.14.0
runtime, Torch 2.7.1+cu126 and pinned Diffusers 0.40.0. The runtime/config and all 63
installed worker/asset pins match the retained guarded update; no provisioning,
downloads or model/environment copies are introduced.

| Case           | Unit seconds | Peak host bytes | Swap bytes |
| -------------- | ------------ | --------------- | ---------- |
| seed123 native | 29.091       | 1,914,179,584   | 0          |
| seed123 Invoke | 27.533       | 1,792,397,312   | 0          |
| seed124 native | 27.274       | 1,787,572,224   | 0          |
| seed124 Invoke | 27.273       | 1,808,977,920   | 0          |

All owned units report exit0 and empty physical groups. Total: 112 original UNet
calls, 112 ancestral transitions, 4 original VAE decodes, 4 published PNGs and 112
scalar progress events. Peaks are observations for these units, not general
capacity limits; checkpoint-read file cache and an excluded setup have separate
resource reports.

ROOT's independent CPU-only post-check re-reads the retained raw tensors and
all original PNGs. Each native baseline exactly reproduces its retained Studio
RGB. For each paired seed, it confirms:

- One identical compute-dtype CPU draw, independently reproduced with the seed;
  equal before/after initial-generator state and original native-prepared bytes.
- Exact schedule/config/sigmas, native UNet contexts, pools and time IDs at all 28
  steps; equal ancestral generator states before/after every step.
- Exact chosen first scheduler sample and independently calculated first scaled
  UNet input; intact latent/RNG chains and restored observer/private slots.
- Every original decoded tensor independently quantizes to every reopened PNG
  RGB byte, with matching ICC, dimensions and response identity.

Native `init_noise_sigma` is 10.767897605895996. The first schedule sigma is
10.721362113952637; its FP16 value used by `add_noise` is 10.71875. The resulting
initialization difference alone changes all 28 guided prediction hashes per
seed and the following output bytes:

| Seed | Changed initial elements | Maximum initial absolute difference | Changed RGB channels | Changed pixels |
| ---- | ------------------------ | ----------------------------------- | -------------------- | -------------- |
| 123  | 65,481 / 65,536          | 0.21875                             | 3,099,778            | 1,048,536      |
| 124  | 65,482 / 65,536          | 0.1875                              | 3,020,404            | 1,046,952      |

Preservation checks cover recorded component/tensor identities, placement,
training/gradient flags, configs, vocabulary, hook keys, forward-slot presence,
borrowed scheduler metadata and global RNG. There is no full trained-value
preservation scan/clone or fresh all70-site permission witness. Original VAE
input/output and terminal scheduler descriptors are retained; this run adds no
independent numerical terminal-to-VAE rescaling oracle. Original native owners
still perform that computation.

## Anonymous visual result

All four originals were inspected only after completion. Byte-identical copies
were randomized into `anonymous-visual-observations/20261105-set-j`; an independent
image-only agent saw no prompts, arm labels or key. ROOT froze descriptions
before opening the key but knows the historical originals and is not an
independently blinded evaluator. The following is ROOT's conservative application
of the preregistered narrow rubric to those observations:

| Case           | Anonymous | Observation                                                      | Narrow result |
| -------------- | --------- | ---------------------------------------------------------------- | ------------- |
| seed123 native | 01        | Three figures: silver-white left, blue center, red low right     | FAIL          |
| seed123 Invoke | 02        | Two; blue/indigo left, red/magenta right; extreme scale mismatch | INCONCLUSIVE  |
| seed124 native | 03        | Two; silver/icy-blue left, warm red right                        | INCONCLUSIVE  |
| seed124 Invoke | 04        | Two; pale blue-white/silver left, warm red/copper right          | INCONCLUSIVE  |

ROOT sees dark red/burgundy on seed123 candidate's right figure; the independent
description retains red/magenta uncertainty, so the strict color gate is not
promoted. Its formerly extra third figure disappears, but one figure remains
much smaller. Seed124 still has ambiguous pale left hair. Framing, stylized
proportions, hands and footwear defects remain recorded separately.

Native subset: **0 PASS / 1 FAIL / 1 INCONCLUSIVE**. Candidate subset:
**0 PASS / 0 FAIL / 2 INCONCLUSIVE**, overall **NOT_QUALIFIED**. This establishes
initialization's causal contribution to these fixed-seed realizations, including
the count change at seed123. It does not establish a universally incorrect
Studio initializer, useful improvement across seeds, full Invoke parity or a
production-default change. Even a successful two-case subset could not qualify
the full four-case reversal gate. Human/age/full-prompt/general-quality acceptance
remains open. No tuning, extra trained cases or model/prompt/seed search follows.

## Retention and scope

Retain all four original output PNGs, anonymous copies/key/descriptions,
contract, source snapshots/pins, Main input links, failed setup, logs, JUnit,
per-step descriptors, pair validation and resource reports. Raw own payloads
are archived byte-for-byte: 33 entries, 28 regular files and 5 directories, with
30,788,307 regular-content bytes. ROOT verifies every archived member and its
bytes/metadata before removing only the confirmed idle `payloads` directory.
The deletion-only run and artifact-root intervals both decrease by
**30,842,880 allocated bytes**. The archive, manifest, physical-exit/source/reader
gates and cleanup record remain. Shared runtime, checkpoint and previous input/evidence dependencies stay
protected. No production code, profile/default, public admission, queue or
persistence, UI, Anima or provenance change.
PP-001/007/008 remain **«Пока не обещать»**.
