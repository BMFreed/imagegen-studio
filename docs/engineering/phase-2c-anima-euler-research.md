# Original Anima Euler denoising foundation

Base: clean `cf711acb1b7ebfe381d5cc1c121f72e3a2728568`, 05.10.2026.
This authorized Phase 2C slice continues PP-004/005/008 after the qualified
[loader](./phase-2c-anima-qualification-research.md) and
[compiled conditioning](./phase-2c-anima-conditioning-research.md). It implements
internal default Euler txt2img and opaque img2img execution. It does not enable
Anima Generate, add a worker command/capability, migrate queue/Retry/provenance
or qualify LoRA, other schedulers and the release runtime.

## Owners and checked reference

TS captures and validates one immutable `anima-euler-denoising-v1` plan: dimensions,
seed, authored step count, CFG, mode/strength, clipped shifted sigma schedule and
actual evaluation count. Python validates that interpretation, prepares ML
tensors, runs already weighted conditioning and the native Cosmos backbone,
integrates flow with Euler, and encodes/decodes through the original Wan VAE.
No second prompt grammar, model discovery or source-weight conversion is added.

Local InvokeAI remains pinned at
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`. Its
`invokeai/app/invocations/anima_denoise.py` defines:

- `_get_sigmas`, lines 411–425: `t = 1 - i/N`, `sigma = 3*t/(1+2*t)`.
- Lines 584–591: start `floor(denoising_start*N)`, end `N`, terminal zero retained.
  `graphBuilderUtils.ts:263–275` maps img2img strength to start `1-strength`.
- `_get_noise`, lines 363–382: CPU F32 seeded noise, then explicit device/dtype.
- Built-in default Euler, lines 854–875: raw sigma timestep, direct flow without
  v-prediction negation; `uncond + CFG*(cond-uncond)`, F32 Euler accumulation and
  cast back to the original latent dtype. Its `math.isclose(CFG, 1)` gate uses
  only positive forward at 1 and nearby values (default relative tolerance 1e-9).
- Original MiniTrainDIT pads odd latent dimensions to patch size 2 and crops
  output back. Native Diffusers Cosmos 0.40 lacks that pad/crop; the wrapper must
  preserve 8-aligned image dimensions, including dimensions not divisible by 16.
  The extra padding-mask channel stays zero, including padded cells. Native
  RoPE also creates `arange(max_size/patch_size)` whereas original Invoke uses
  the actual patch extent dynamically. Its trusted constructor capacity is now
  `(1,256,256)` latent cells, covering the 2048-pixel envelope. This changes only
  a nonlearned sequence ceiling; frequencies, parameters and existing coordinates
  are unchanged. No trusted config or shared module field is mutated per call.
- `anima_image_to_latents.py:95–104` samples Wan's posterior and normalizes
  `(z-mean)/std`; `anima_latents_to_image.py:175–204` applies `z*std+mean`, decodes
  one temporal frame, then clamps and truncates to RGB bytes.

The original Invoke VAE sampling is unseeded. This application must reproduce
its own fixed-seed result, so this internal boundary uses an explicit per-call
CPU generator for noise and an independent posterior generator. TS derives
`posteriorSeed = (seed ^ 0x9e3779b9) >>> 0` for img2img (null for txt2img), using
a fixed versioned stream separator, not a measured model parameter. Posterior
draws cannot alter the diffusion stream; strength 1 has the same initial noise
as txt2img. No global RNG is consumed. This is an
intentional deterministic stream contract, not pixel identity with Invoke's
unseeded posterior. Strength zero still traverses native VAE encode/decode and
does not invoke conditioning/denoising, preserving the existing product rule.

Invoke's six scheduler names are Euler, Heun, DPM++ 2M, DPM++ 2M SDE, ER-SDE and
optional LCM. This version fixes `scheduler=euler`; other names fail explicitly
and remain required work before full Anima admission. A universal SDXL or native
Anima modular pipeline is unsuitable: the pinned original companion uses Wan,
whereas the modular Anima decoder expects AutoencoderKLQwenImage. The narrow
native-component loop preserves the qualified original topology.

## Parameters and failure boundary

| Parameter         | Bound/source                                                                    | Observation/refusal                                     |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Width/height      | Existing generation protocol: 64–2048, multiples of 8, at most 4 million pixels | Reject before native work; not a VRAM promise           |
| Steps             | Existing worker transport: integer 1–200                                        | Full schedule N+1; clipped actual count returned        |
| CFG               | Existing request: finite 1–30                                                   | 1 skips negative forward; no silent alternate formula   |
| Seed              | Existing uint32, including zero                                                 | Fresh CPU generator per call; fixed stream reproduces   |
| Strength          | Null for txt2img, finite 0–1 for img2img                                        | Exact `floor((1-strength)*N)`, no epsilon correction    |
| Shift             | Original fixed 3                                                                | No Karras, dynamic shift or second scheduler shift      |
| Latents           | Original 16 channels, one frame, spatial compression 8                          | Native shape/placement/finite guards, explicit pad/crop |
| Tokenizers/models | Previous exact pinned helpers                                                   | No cache/Hub/network fallback or changed companions     |

IEEE clipping matters: `.8` at 30 steps yields start 5, not the visually expected 6. Preserve the actual source expression with adjacent-value controls. Strength
zero is an explicit application extension; original Invoke rejects start=end.
The native Cosmos forward also requires torchvision for its padding-mask resize.
Qualify the matching pinned version rather than mutating the trusted loaded
model config to avoid the dependency.

Inference semantics have medium/high consequences, but this slice changes no
storage/queue/IPC boundary. Validate/capture plans, prompts and source pixels
before model calls. An incompatible plan, non-opaque/wrong-sized source, invalid
placement, malformed native shape or non-finite VAE/flow/latent/decode output
fails without a successful image or Project/candidate mutation. Finite checks
must precede clamp/byte conversion. OOM/native failure has no CPU fallback or
silent tiling; release memory management remains separate work. The helper
returns pixels only; Main-owned publication is unchanged. Python uses an explicit
absolute comparison budget of 1e-12 for transported sigmas, then stores the
computed canonical values, including literal first 1 and terminal 0. Tolerated
caller rounding never becomes the execution schedule; the raw input is unchanged.

## Verification plan

Exercise the real TS plan and Python consumer, not a fixture's own schedule.
Use native scaled Cosmos/Qwen3/AnimaTextConditioner/Wan components with actual
bundled tokenizers; compare with separate native forward/Euler/VAE numerical
controls, including odd latent padding/crop and non-uniform latent means/stds.
Verify fixed seed A/B/A, plain versus weight 1, weighted both signs, CFG 1,
strength zero/one/clipped, progress after successful evaluations and finite
refusal before bytes. Run isolated semantic mutations for sigma/timestep/sign,
CFG, weights, seed, clipping, normalization, pad/crop and finite guards.
Attempt a separate actual trained-weight NVIDIA output probe, recording exact
models, settings, source preservation and limitations. Run final Python and app
regressions/static/build checks; no UI/prototype changes are planned.

## Executed evidence

### Executed production boundaries and controls

- [TS plan](../../src/shared/projects/anima-euler-plan.ts): 27 module tests and
  52 focused tests including existing Illustrious neighbors pass. Ten isolated
  semantic mutations are killed, with original/restored controls green. The
  initial RED was a missing-module error, not a semantic counterexample; one
  accidentally supplied extra `posteriorSeed` in a fixture was rejected by the
  actual input validator and the fixture was corrected without weakening it.
- [Python/native execution](../../worker-python/tests/test_anima_euler.py):
  37 tests pass with no skips in the qualified native development environment.
  Plans and prompts come from the actual TS compilers. Scaled native
  Qwen3/AnimaTextConditioner/Cosmos/Wan models use full original token vocabularies
  and bundled tokenizers; they are configured real ML components, not fake
  denoisers or fabricated pipeline results. These tests cover seed zero A/B/A,
  no global RNG consumption, plain/explicit-one equality, both weighted signs,
  independently evaluated Euler/CFG references, strength zero/one/clipped,
  captured caller edits, native odd-dimension pad/crop, CPU-F32 noise followed by
  BF16 cast, per-step cast restoration, normalization/decode and finite refusal.
- An independent read-only reference probe constructed original Invoke
  MiniTrainDIT (99,712 parameters), ran the actual Diffusers conversion and loaded
  all 27 converted tensors strictly into native Cosmos. Five even/odd latent
  shapes agreed with zero-pad/crop at `allclose(atol=rtol=1e-5)`; largest absolute
  error was 1.00434e-5. Unpadded odd shapes fail natively, and marking padded cells
  with 1 instead of 0 changes actual predictions. A native FlowMatch Euler
  reference agrees with the direct F32 loop within 1.2e-7; supplying its terminal
  zero twice creates an extra evaluation. Neither probe is full trained Invoke
  invocation parity.
- Source AST execution separately verified actual sigma generation/clipping,
  including `.8` versus the adjacent lower value at 30 steps. Native scheduler
  construction showed that Heun, DPM variants and LCM do not all preserve the
  default Euler schedule/evaluation count. Their implementation and numerical
  qualification remain explicit work; comments or shared names are insufficient.

### RED findings and mutation sensitivity

Two initial semantic REDs were observed before implementation fixes:
normalizing gray byte 128 after a BF16 cast produced 0.0078125 instead of the
original F32-normalized/BF16-cast 0.003936767578125; using exact `CFG != 1` performed
negative forward at 1.0000000005 whereas Invoke's `math.isclose` gate omits it.
The same native encoder/pass-count checks pass after correction. A third initial
failure was a test's exact rational `15/16` assertion against the actual IEEE
sigma 0.9374999999999999; that numerical reference now has an explicit 1e-12
absolute tolerance, while captured-input immutability retains exact equality.

The first 27-test suite **did not catch** applying both signs' padded T5 weights
a second time inside denoising: baseline, mutant and restored each passed 27/27.
Two independent weighted numerical references were then added (positive weight 2
at CFG 1, negative suffix weighting at CFG 4). The unchanged mutant now fails
exactly those two tests; all 29 execute without fixture/collection errors or
skips. The 29-test pass then killed 13/13 representative semantic mutations,
with green baseline/restored controls. This is retained as a pre-final snapshot;
the expanded final suite and constructor fix are checked separately below.

A source-aware delegate review then found a missing dimensional control: both
actual TS/Python boundaries accepted width 1928 or 2048, but native RoPE's default
240-latent-cell extent failed at 121 or 128 width patches. The same applied to
height. Six actual native controls were added using scaled ML widths with the
**real production constructor capacity**: 1920-width neighbor, wide/tall
1928/2048, and unchanged small coordinates/pixels. Before the fix, four failed
and two passed (`native-rope-red.log`). Expanding only the trusted nonlearned
constructor sequence capacity to 256 makes the identical tests green; it neither
changes NTK scaling nor requires mutable module hooks. The independent review
probe confirms exact cos/sin equality with extracted original Invoke dynamic
RoPE at widths 64/1920/1928/2048, exact old/new prefixes at 64/1920, and identical
27-entry native state keys/shapes/values (RoPE itself has no parameters/buffers).

The same review noted that tolerant sigma validation originally retained caller
perturbations, including a nonzero 5e-13 terminal. Validation now captures the
computed canonical tuple after its 1e-12 comparison, without modifying the input.
An actual TS-derived control verifies exact captured endpoints/interior values
for tolerated first/interior/terminal perturbations; a 1e-9 interior perturbation
fails. The final isolated mutation reverses this canonical capture to ensure the
new observable validation invariant is sensitive.

### Real trained NVIDIA pixels

A separate offline probe used the actual strict loader, actual TS plan/prompts
and full trained Qwen3/adapter/Cosmos/Wan models on an RTX 4080 with CUDA BF16.
Source files are existing read-only local weights, not installed test artifacts:

| Component               | Local file                                                         | Exact SHA-256                                                      | Bytes         |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------- |
| Checkpoint + adapter    | `Checkpoints/cyberfalafelFalafel_cyberfalafelAnimaV10.safetensors` | `0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941` | 4,182,275,752 |
| Qwen3 (renamed locally) | `VAE/cyberfalafelFalafel_cyberfalafelAnimaV10.safetensors`         | `cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba` | 1,192,135,096 |
| Original Wan VAE        | `VAE/qwen_image_vae.safetensors`                                   | `a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f` | 253,806,246   |

The first nine completed cases use 256×256, three authored steps, seed 0 and CFG 4. Plain,
explicit weight 1 and seed replay have bit-identical latents/pixels. Positive
prefix weight 1.8 and negative weight 0.5 each change both latents and pixels.
Img2img strength zero completes through VAE without conditioning/progress;
strength one equals txt2img; strength 0.5 completes two actual evaluations and
replays exactly. Source file size/mtime/ctime remain unchanged; a denied network
connection guard recorded zero attempts. After the RoPE capacity fix, all nine
cases were rerun with identical pixel hashes to the initial probe, plus trained
1928×64 and 64×2048 one-step/CFG-1 controls; all eleven pass. The final load took
24.47 s, peak allocated CUDA memory was 6,252,831,744 bytes and reserved
6,543,114,240 bytes. These are observations at these settings, not model quality,
full-resolution/VRAM or release promises. No queue, Retry, acceptance or UI path
participated.

### Regression checks and review boundary

App tests pass 1171/1171, typecheck and lint pass. Default Pillow-only Python
passes 330 tests with 231 explicit optional-ML skips. Ruff check/format and strict BasedPyright pass. Fresh desktop build and
all seven Electron smoke scripts pass, using controlled existing inference peers;
they prove the existing application boundaries, not Anima admission. Full native Python regression passes 561 tests with no skips and 30 existing
native-library warnings. Final isolated Python mutations kill 15/15 with no survivors:
wrong model timestep, reversed Euler sign, missing CFG, repeated prompt weights,
shared RNG streams, posterior mode, missing encode mean/std, missing pad/crop,
BF16-before-normalization, omitted raw VAE hooks, all finite guards bypassed,
omitted step cast-back, retained tolerated raw sigmas and the old RoPE240 limit.
Each mutant executes all 37 tests without skips or collection/fixture errors;
baseline/restored pass 37/37 and all six checked source/TS/test hashes match the
final working tree. Error-message-only failures are not credited: finite mutants
accept bad pixels or miss observable refusal, and dtype/padding mutants lose a
valid native result. Together with ten TS-plan mutants, 25 representative semantic
mutations are caught; this is targeted sensitivity, not exhaustive mutation coverage. No prototype UI changed.

Read-only delegate review is a source-aware implementation review, not a blind
product acceptance audit; trained output is a direct internal helper probe.

The qualified temporary environment uses CPython 3.12, Torch 2.7.1+cu128,
Diffusers 0.40.0, Transformers 5.5.4, tokenizers 0.22.2, torchvision 0.22.1+cu128
and PEFT 0.21.2. Native CPU regressions disable CUDA and external Hub/network
fallbacks. Existing Invoke packages supply the native libraries read-only; PEFT
is in an isolated temporary environment. This is development evidence, not a
bundled/reinstalled release runtime. The final changed-file Prettier/ruff checks,
`git diff --check` and 401 local documentation links pass. A fresh worker wheel
build/check includes the helper, both bundled tokenizer sets and existing
notice/license files, with torchvision pinned only in the inference extra. The
first packaging-inspection assertion incorrectly expected `NOTICE.md`; inspection
confirmed the actual shipped `NOTICE.txt`, and the corrected check passes. This
was an inspection-fixture mistake, not a missing notice or a semantic RED.

### Retained integration/release work

No Anima wire command, ready capability, `.igs`/queue version or public Generate
admission changes. Before admission, qualify Anima LoRA (apply before encoding
because it may alter the adapter), other schedulers/options, family-aware editor
weight adjustment, frozen queue/Retry/provenance and full Linux/NVIDIA sizes and
runtime packaging. Memory/cache/offload/tiling and original OOM tile fallback
remain separate work. The existing helper temporarily disables native VAE tiling
and restores its prior flag and only its own finite hooks after success/failure.
The new inference-extra torchvision pin is 0.22.1; default Pillow-only runtime and
existing installed Invoke packages/model files remain unchanged.

Local artifacts (not shipped application files):
`~/.codex/artifacts/imagegen-studio/anima-euler-2026-10-05/`
contains TS plans/mutations/source-AST evidence, native RED/green logs, aggregate
checks, isolated Python mutation artifacts, RoPE review evidence and trained GPU
probe/report/PNGs (`trained-gpu` initial, `trained-gpu-final` after the fix).
The independent original/native numerical probe is in
`~/.codex/artifacts/imagegen-studio/anima-denoising-2026-10-05/`.
