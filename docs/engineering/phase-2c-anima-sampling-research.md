# Phase 2C — deterministic Anima sampling

## Scope and risk

Continue PP-004/PP-005 from clean `master`
`29e34ff01642a7db7ce24c2747ce703594ab30a1`. Add an internal typed plan and native
execution for the finite deterministic set Euler, Heun and DPM++ 2M. Preserve
weighted conditioning, exact signed LoRAs, source normalization, seed domains,
finite outputs and scoped restoration. Public Anima Generate, editor controls,
capability/wire/queue/Retry/accepted provenance and release readiness stay open.

Risk is high: schedule, timestep, clipping or dtype errors can silently change
pixels. This slice does not install resources, migrate storage or publish files.
Existing Illustrious execution and the original versioned Euler API stay intact.

## Confirmed reference and policy

The checked Invoke checkout is
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`. Its finite Anima registry in
`invokeai/backend/flux/schedulers.py` has Euler, Heun, DPM++ 2M, DPM++ 2M SDE,
ER-SDE and an optional LCM entry. Stochastic methods and LCM remain subsequent
work; a dropdown label alone does not establish a usable runtime method.

`invokeai/backend/anima/scheduler_driver.py` constructs a fresh native scheduler,
uses shift 3 for Heun and flow-prediction/flow-sigmas/flow-shift 3/order 2 for
DPM++ 2M, clips the full schedule with `set_begin_index` and feeds its timestep
divided by 1000 to Anima. Heun doubles noninitial evaluations; DPM++ keeps its
native multistep history. These schedules are not the built-in Euler schedule.
Pinned Diffusers 0.40.0 source and real tiny native controls confirm the different
sigma/timestep representations. In particular, DPM++ timesteps are integers and
are not recovered by directly using its float32 sigma as the model timestep.

Business interpretation belongs to the new immutable TS compiler: explicit
scheduler, full native schedule interpretation, exact strength clipping, begin
index, initial noise level and actual evaluation count. Python validates and
captures the plan before model work, constructs the pinned public native
scheduler and verifies its arrays against that plan; it does not override private
native schedules or use model metadata as executable configuration. Each request
gets its own native state. The Euler neighbor keeps its existing exact arithmetic.

Invoke `anima_denoise.py` preblends img2img with the Euler sigma before selecting a
native scheduler and explicitly records the resulting mismatch. We correct only
interior strengths: use the selected scheduler's actual first sigma when
`0 < strength < 1`. Strength zero stays VAE-only without conditioning/denoising;
strength one stays pure diffusion noise, preserving exact equality with txt2img
at the same seed. This is a stated compatibility correction, not an assertion
that Invoke already implements it.

Native guided predictions are float32. Heun/DPM++ outputs are cast back to the
original Cosmos dtype before each subsequent model evaluation; native solver
history retains its own precision. This preserves the existing worker placement
policy and avoids feeding float32 latent inputs into BF16 native model weights.
The model still receives raw scheduler timestep/1000, without prediction negation.

## Parameters and failures

| Parameter            | Source and finite boundary                                                 | Refusal or behavior                                    |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Scheduler            | Explicit `euler`, `heun`, `dpmpp_2m` in this internal version              | Unknown/stochastic/LCM input refused, no default       |
| Dimensions/steps/CFG | Existing Euler envelope: aligned 64–2048, 4M pixels, 1–200 steps, CFG 1–30 | Existing bounds, no new model-quality promise          |
| Strength/start       | Existing IEEE `floor((1-strength)*steps)`                                  | No boundary rounding; zero runs only VAE               |
| Evaluations          | Euler/DPM++: `N-start`; Heun: `2*(N-start)-1` when positive                | Progress counts completed evaluations, at most 399     |
| Native arrays        | Pinned native sigma/timestep schedule and exact begin index                | Changed, missing or forged schedule refused            |
| Seed                 | Existing unsigned 32-bit noise seed and separate posterior domain          | Preserve zero and caller global RNG                    |
| Placement            | Existing original model dtype plus F32 native guidance/history             | Nonfinite native output refuses before pixels/progress |
| Memory               | Resolution, model placement and solver history                             | No new VRAM ceiling or offload/cache qualification     |

The progress meaning follows the current application's actual-evaluation contract,
rather than Invoke's logical-step Heun callback grouping. This internal helper
does not change that public progress schema. Invalid capture precedes optional
imports/model mutation; native setup or execution failures cannot publish an image.
Existing LoRA finally cleanup and VAE guard must also run after scheduler or
progress failures, and the next request on reused models must reproduce baseline.

## Verification plan

Compare actual TS plans with independently initialized native schedules for the
finite method/step domain and clipping controls. Test the real TS → Python →
Qwen/conditioner/Cosmos/Wan path against fresh native numerical references, both
normal modes, weighted prompt polarities, signed LoRAs, exact replay, BF16 cast
policy, source/payload detachment, zero/full-strength neighbors and interruption
cleanup. Numerical references must not reuse the compiler's output as their
expected algorithm. Execute isolated semantic mutations for schedule identity,
clipping, evaluation counts, native configuration/history, timestep convention,
initial blend, cast policy and progress. Run required TS/Python checks and bounded
trained NVIDIA probes. Record all actual executed/skipped counts and limitations.

Artifacts:
`~/.codex/artifacts/imagegen-studio/anima-sampling-2026-10-05/`.

## Remaining boundaries

Other Anima methods, remaining applicable options, family-aware editor handoff,
public admission/queue/Retry/provenance and Linux/NVIDIA release qualification
remain Phase 2C work. Original Invoke hides CLIP Skip, CFG Rescale and ordinary VAE
precision controls for Anima; this slice does not invent those algorithms or
widen the accepted exact pinned-companion resource contract.

## Executed verification (05.10.2026)

Evidence applies to the resulting working tree above, with pinned Diffusers
0.40.0, Transformers 5.5.4, Torch 2.7.1 and isolated PEFT 0.21.2. Native ML uses
the existing read-only local environment, not an installed application runtime.
No Invoke checkout, runtime package or source model file was modified. No new
product decision remains unresolved within this bounded internal slice.

The 24 new TS cases exercise the real compiler, alongside 27 untouched legacy
Euler cases. Independent full native arrays for every authored step count 1–200
are encoded as binary64 little-endian digests; tests compare the actual output
against those measured fixtures, not a copied implementation formula. Heun digest:
`ec86bd5fdc36ac218c4815a2070ee98614a4383f19d158b3073b9335918a5d6b`;
DPM++ digest:
`da257719d47280b6d8a2b88b03ae35a9d83ff4a92ed7b34b8ba5a3e00fb49744`.
Actual TS/native comparison covers 2400 plans: both native methods, every step
count and txt2img/strength 0, .2, .5, .8, 1. All arrays, indices, initial levels
and counts agree; the same final plans pass Python capture. A separate 4200-plan
cross-language check also covers Euler and subprecision positive strength. It
confirms capture, not ML execution for every parameter combination.

The 50 focused Python cases comprise 12 plan-capture controls and 38 ML execution
controls. They cover the real TS compiler and Python capture boundary, plus actual
Qwen/conditioner/Cosmos/Wan modules and real safetensors LoRAs entered through the
new Python function. Independent numerical references construct fresh public native solvers
from authored values, without using compiled sigmas, timesteps, initialSigma or
counts as expected outputs. They compare latents, pixels and progress, signed
adapters on all three components, both weighting polarities, CFG pass counts,
BF16 placement, request/payload detachment, zero/full-strength neighbors, finite
refusal and callback failure/restoration. Old Euler and LoRA cases preserve the
extracted common image boundary; public fixture aliases only share existing
native fixture operations, not a substitute inference implementation.

The initial module-missing TS RED executed zero behavioral assertions; a corrected
posterior-seed fixture typo was not a production defect. An early 48-case Python
mutation probe exposed a test gap: removing only value comparison in pure capture
survived, because existing malformed-array controls changed lengths. Execution
still used canonical values, so this was not a numerical pipeline defect. Two
same-length transported sigma/timestep corruption controls now verify explicit
refusal beside valid input. Earlier probes remain in artifacts; setup/collection
failures are not credited as mutation kills.

A later review also found that one native DPM timestep drift fixture attempted
in-place floating-point multiplication on an integer tensor and failed before
changing the schedule. The corrected fixture assigns the value and proves that
it changed before checking refusal before conditioning. Final evidence below
uses the corrected tests; interrupted earlier campaigns are not final proofs.

Final trained RTX 4080 CUDA BF16 run passes 28/28 cases at 256×256 and three
authored steps. It preserves the prior Euler output hash and new-version Euler
equality. Heun/DPM++ replay, enabled-zero equality, positive PEFT/negative Kohya
backbone effects and exact neighboring restoration pass. Interior img2img,
strength-zero VAE roundtrip, strength-one txt2img equality and actual-evaluation
progress pass. Original model graph/configuration/gradient flags and CPU/CUDA RNG
restore after every call; six input files retain identity and no network attempt
occurs. Tiny native tests additionally check full tensor equality and adapters on
Qwen/conditioner. Trained GPU evidence does not cover those adapters, all sizes,
model quality, memory/cache/offload/tiling or public Generate/release integration.
Measured CUDA allocated/reserved peaks: 6,249,140,736 / 6,320,816,128 bytes.

Final GPU report SHA-256:
`2c1e1a1c7d186e46e72cec8d29afdb78371db74d7455b5b23bea7e51ddde02ea`.
Sampling helper SHA-256:
`b45dbd3fef96bb5a4c556b6efc79623a29c3ff22482fea7afeb305112b69ca84`.
Shared Euler helper SHA-256:
`ce4eb7a5e3c1029a561f9cb9a4d5317bb860e09a46e21ff80495d6c28183b2d7`.
TS compiler SHA-256:
`f526b77325b37bf91021fc1fe5bfda2b0ca5ec9569afa6f99d476e6713bebf84`.
The final probe's before/after source hashes match the live modules. Fresh offline
wheel inspection confirms exact sampling/Euler/LoRA/profile bytes; wheel SHA-256
`cb6697fe54ce6ca8cf3ae085300b4e36a15527fb7555ada3bb0f66b607d7bc6d`.
This proves packaging inclusion, not a bundled runtime installation.

Aggregate commands and results:

- `pnpm run app:test`: 1227 passed, zero failed/skipped.
- `pnpm run typecheck`, `pnpm run lint`: pass.
- `uv run --frozen pytest -q`: 342 passed, 332 optional-ML skips.
- Full native CPU regression with CUDA/Hub disabled: 674 passed, zero skips,
  34 existing native library warnings.
- `uv run --frozen ruff check src tests`, full `basedpyright` and changed-file
  formatting checks: pass.
- TS isolated semantic mutations: 30/30 reachable changes assertion-killed;
  baseline/restored 24/24 green, live source unchanged. One extra DPM cast-order
  change yields identical integers throughout allowed N=1–200, is recorded as
  equivalent within that domain, and is excluded from the kill count.
- Python isolated semantic mutations: 19/19 killed against the final 50-case
  suite; each mutant executes all 50 cases with zero collection errors or skips.
  Baseline/restored controls pass 50/50, and isolated source identity plus every
  live dependency hash match the frozen snapshot. Native array drift, wrong
  solver/order/history/time, initial blend/clipping, BF16 cast, CFG, weighting,
  LoRA timing, progress, finite output and request-state controls all detect their
  corresponding changes. The real BF16 inference dtype refusal is an execution
  failure caused by the mutation, not an import or fixture setup failure.

These are targeted controls, not an exhaustive proof of pipeline correctness.
No UI changed, so no visual or prototype test is claimed. Existing public
Illustrious paths and wire/storage versions are unchanged. PP-004/PP-005 remain
open; this does not enable Anima Generate, queue/Retry or accepted provenance.
