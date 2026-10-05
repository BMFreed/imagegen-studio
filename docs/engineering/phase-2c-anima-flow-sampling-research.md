# Phase 2C — Anima stochastic and FlowMatch LCM sampling

## Scope and risk

Continue PP-004/PP-005 from clean `master`
`d2b3c6dee85adb3274d4902055ca26455c091951`. Complete the internal finite Invoke
Anima method registry with DPM++ 2M SDE, ER-SDE and FlowMatch LCM beside the three
[deterministic methods](./phase-2c-anima-sampling-research.md). This adds a new
immutable typed plan and native numerical execution, not public editor,
capability/wire/queue/Retry/provenance or release admission.

Risk is high: wrong RNG ownership, history, sigma representation, clipping or
dtype can silently change pixels or destroy img2img source influence. Preserve
weighted conditioning, signed ordinary LoRAs, exact seed replay, sRGB/source
capture, finite output, VAE/adapter restoration and old versioned APIs. No model,
existing native ML environment or installed Invoke file is modified. The sampling
helper does not write persistent storage. A separate existing model-install race
found by the full regression run is recorded in
[staging publication research](./model-install-staging-publication-research.md).

## Confirmed source and choices before implementation

Pinned Invoke checkout:
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`. Its finite Anima registry is in
`invokeai/backend/flux/schedulers.py`; actual orchestration is in
`invokeai/backend/anima/scheduler_driver.py`. The existing read-only native
environment has Diffusers 0.40.0 and Torch 2.7.1. These are checked sources, not
assumptions based on dropdown labels or older Invoke versions.

- DPM++ 2M SDE uses the existing native DPM grid with `flow_prediction`, flow
  sigmas, shift 3, order 2 and `algorithm_type="sde-dpmsolver++"`. Keep midpoint,
  lower-order final and terminal zero defaults explicit.
- ER-SDE is Invoke's custom class in
  `invokeai/backend/rectified_flow/er_sde_scheduler.py`, not a Diffusers export.
  Its source SHA-256 is
  `3c18bd6a847fcf0ecf0a6b67c37744546dc4dfbb88a0595915fe2391d437fbd7`.
  Preserve an exact vendored copy with upstream attribution and license notices;
  typed application wrappers own policy. Only the rectified-flow/order-3/
  stochastic configuration is admitted by this Anima boundary. Other algorithms
  inside third-party source do not become supported product families.
- `FlowMatchLCMScheduler` is available in the pinned runtime. It consumes flow as
  `x0 = sample - sigma * flow` and then performs seeded re-noising. It is distinct
  from legacy `LCMScheduler` and needs no new conditioner or automatic adapter.
  The [original implementation PR](https://github.com/huggingface/diffusers/pull/11170)
  targets distilled models. The [official Anima model card](https://huggingface.co/circlestone-labs/Anima/raw/main/README.md)
  distinguishes Base and distilled Turbo and recommends ER-SDE/DPM SDE for Base.
  Executable sampling on the supported original Anima bundle does not establish
  few-step quality, acceleration, Turbo support or distilled-artifact admission.

Invoke's LCM driver deliberately bypasses explicit sigmas and clipping, rebuilding
an unshifted schedule at the remaining step count. A native CPU control with
authored N=4 and start=2 gives intended shift-3 clipped times `[750, 500]`, whereas
the Invoke branch gives `[1000, 1]`. Simply replacing its Euler preblend with the
regenerated first sigma 1 would discard img2img source for every positive strength.

This slice explicitly corrects that schedule mismatch: generate the full authored
Euler shift-3 grid once, pass it to public native setup, then clip with
`set_begin_index(start)`. ER accepts terminal-inclusive sigmas; Flow LCM expects
nonterminal sigmas and appends zero itself. Native arrays are compared with the
captured TS policy before conditioning or adapter mutation. No private native
schedule override, dynamic shift or LCM scale-factor/upscale feature is used.
This is a documented technical correction, not exact parity with Invoke's LCM
branch. Existing zero/full-strength endpoint semantics remain unchanged.

Step randomness uses a fresh request-owned native-device generator, seeded with
the actual generation seed, independently from CPU initial-noise and VAE
posterior streams. Clipping does not consume discarded steps. Measured native
DPM SDE and LCM draw noise even at the terminal step, although its value has no
output effect; ER draws only for positive next sigma. A one-step seed-effect
assertion would therefore be invalid. Nonterminal controls are required.

## Data boundary, parameters and failures

`compileAnimaFlowSamplingPlan` captures strict plain authored values in TS. Its
`anima-flow-denoising-v1` envelope has the previous 16 fields plus explicit
`stepSeed = seed`. Old Euler and deterministic envelopes remain accepted only by
their existing finite APIs. Python captures and validates the new exact shape
before optional imports, builds fresh native state and returns pixels through
the existing shared Anima image boundary. There is no worker command or candidate
publication in this slice.

| Parameter              | Owner and finite domain                                                       | Behavior / refusal                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Method                 | Explicit six-entry Invoke registry                                            | Unknown names or inappropriate old envelopes refuse, no fallback                     |
| Geometry / steps / CFG | Existing typed Euler envelope: aligned 64–2048, 4M pixels, 1–200, CFG 1–30    | Preserve existing limits, no GPU ceiling or quality claim                            |
| Strength               | Existing IEEE `floor((1-strength)*N)`                                         | Full authored grid then clipping; zero evaluations bypass scheduler and conditioning |
| Sigma / time           | DPM native integer time; ER/LCM float32 explicit shifted grid                 | Exact transported and native arrays; same-length corruption refuses                  |
| Step seed              | Generation uint32 seed, separate generator object                             | Seed 0 preserved, unrelated global CPU/CUDA RNG unaffected                           |
| History                | Fresh DPM order-2 / ER order-3 / LCM state each request                       | No state cache or reuse after success/interruption                                   |
| Precision              | Existing Cosmos dtype, F32 guidance/native history, cast back each evaluation | Nonfinite/shape or cast overflow refuses before pixels/progress                      |
| Memory                 | Native model placement, resolution and multistep history                      | No offload/cache/tiling or maximum resolution qualification                          |

Native setup failure occurs before model conditioning and LoRA mutation. Later
solver, output or progress failures run existing LoRA/VAE cleanup and cannot
return successful pixels. A subsequent request on reused models must reproduce
its baseline. There is no partial candidate, saved resource or database state to
recover because this helper does not publish any of them.

## Verification plan and falsification

Use independently initialized native schedules and the original pinned Invoke
ER class, not our vendored class as its own expected algorithm. Compare actual
TS plans across the finite N=1–200 domain and strength/clipping neighbors. Test
real TS capture and Qwen/conditioner/Cosmos/Wan execution with separate native
RNG, full fresh history, independent latent/pixel references, weighting, signed/
zero LoRA, BF16 cast policy, progress, caller edits, strength 0/.5/1 and N1/N2/N4/N5.
Keep old Euler/deterministic regressions. Independent LCM one-step algebra and ER
history/boundary controls strengthen the reference comparison.

Execute isolated semantic mutations for stochastic-to-deterministic fallback,
missing/reset/shared generator, wrong seed domain, lost history/order, LCM
rebuild/double-shift/terminal shape, model time, native array qualification,
cast/finite/progress and cleanup. Every counted mutant needs executed behavioral
failures and restored green controls; import/fixture/collection failure is not a
kill. Native drift fixtures must prove that the value actually changed.

Run required TS/Python checks, an offline worker wheel inspection including
vendored source/notices and bounded trained NVIDIA probes after source freeze.
Record actual executed/skipped counts and source hashes. Synthetic scheduler
controls, tiny native models and trained GPU evidence are separate boundaries.

Artifacts:
`/home/user/.codex/artifacts/imagegen-studio/anima-flow-sampling-2026-10-05/`.

## Executed verification

The dirty working tree includes the new untracked modules and tests, not just
base HEAD. Native evidence uses the existing read-only environment
`/tmp/igs-anima-native-peft-fjzlsjl1/venv/bin/python`: Torch 2.7.1+cu128,
Diffusers 0.40.0, Transformers 5.5.4 and PEFT 0.21.2. Models and installed Invoke
were unchanged. Ordinary `uv run --frozen` refreshed the development editable
worker metadata after the tooling exclusion change; this is distinct from the
native ML environment.

| Boundary               | Executed evidence                                                                                                                          | Limit                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| TS plan capture        | 25 new tests plus 51 Euler/deterministic neighbors, all passed                                                                             | Typed plan policy, not public admission                                               |
| TS/native schedules    | 7000 plans across five native methods, N=1–200 and txt2img/strength 0, MIN_VALUE, .2, .5, .8, 1; zero array or Python capture differences  | Schedule/capture parity, no model execution for all 7000 plans                        |
| Python flow suite      | 61 passed, no skips: 14 pure capture and 47 native ML cases                                                                                | Tiny actual Qwen/conditioner/Cosmos/Wan modules, not trained image quality            |
| Full worker suite      | 735 passed, no skips, 34 dependency warnings in the native environment; default development environment 356 passed / 379 optional ML skips | Native and dependency-light runs are distinct                                         |
| Full application suite | 1256 passed, no failures or skips after the separate staging-publication fix                                                               | Production Main/TS boundaries; no new Anima editor or Electron generation route       |
| Trained NVIDIA         | 46 successful outputs plus 6 refusal/interruption controls, all passed                                                                     | One original Anima bundle, RTX 4080, CUDA BF16, 256×256, N=3 with extra ER N=5 replay |
| Worker wheel           | Offline build, 40 entries; eight new/shared source and notice entries match final checkout bytes                                           | Packaging inclusion, not installed runtime qualification                              |

The numerical tests use independently initialized native solvers, an original
pinned external Invoke ER class and independent LCM algebra/latent references.
The external source root is configurable with `IGS_INVOKE_SOURCE_ROOT`; missing
reference source explicitly skips only its oracle cases. It was present here.
N=3/4 cannot distinguish ER order 2 from 3: the nonterminal third-order correction
first needs N=5. The N=5 control and mutation execute that actual correction;
trained N=5 baseline/replay also passed.

Trained controls cover legacy/general Euler pixel equality, separate stochastic
trajectories, same-seed replay, interior img2img and strength endpoints, positive
PEFT rank-32, negative Kohya rank-32 and enabled-zero PEFT rank-64 backbone LoRAs,
actual progress, forged stepSeed refusal before model execution, and interruption
after the first evaluation with a signed adapter. Every subsequent baseline
replayed exactly. CPU/CUDA RNG, original module classes, absence of PEFT configs/
wrappers, gradient flags and VAE hooks/tiling were restored. This does not snapshot
every native model config or checksum full trained weights after each call; tiny
native controls separately snapshot all base tensors of the three adapter-capable
components (transformer, Qwen and conditioner). Peak allocated/reserved
CUDA memory was 6,249,501,696 / 6,320,816,128 bytes, not a supported capacity limit.
All six local model/adapter inputs retained their identity, with no network use.

Isolated semantic mutation campaigns killed **34 TS** and **23 Python** mutants
with executed assertions, plus **5** for the separate model publication fix.
One TS candidate was correctly excluded as equivalent: changing the scalar
validation delegate for ER/LCM does not alter their explicitly rebuilt grids.
Baseline/restored TS runs passed all 25 tests; every Python mutant executed all
61 tests, with no collection, fixture or setup errors. The recorded imported
module paths and SHA-256 prove which copied implementation was exercised.
These targeted campaigns are sensitivity checks, not exhaustive mutation scores.

Two initial survivors exposed test gaps, then were killed after strengthening
controls: a nonplain object carrying all eight own input fields, and expanding
the old deterministic whitelist to a new stochastic method. Historical runs are
retained in `main/initial24/` and the Python campaign evidence. During the Python
campaign only `vendor/NOTICE.txt` attribution prose changed; its broad manifest
correctly records that drift. Executable sources, tests and runtime data stayed
frozen. The final offline wheel contains the corrected notice.

The initial full app run had two failures on unchanged Main code. The actual
installer/SQLite/selector reproduction proved a staging hardlink ctime race with
unchanged bytes; the separate fix now finalizes owned links and syncs staging
before publication. Its four regressions, 80 model suite tests and five mutations
passed. The other Anima rollback timeout was not localized: its focused rerun
passed in about 1095 ms versus the existing 5000 ms deadline. It was not relabeled
as a proven flake or silently given a longer timeout. The final complete app run
passed all 1256 tests.

Full `pnpm run typecheck`, `pnpm run lint`, worker Ruff and strict basedpyright
passed on the final code/tests. Exact third-party ER bytes alone are narrowly
excluded from style/type rewriting; application wrappers and all tests remain
checked. Formatting and local document-link checks are recorded separately from
native numerical evidence. Review is self-review plus a source-aware reviewer,
not a blind product audit.

Staged diff whitespace checks exclude only the byte-exact upstream
`LICENSE-InvokeAI.txt` from trailing-blank/EOF rules: the original license itself
contains these blanks. Its bytes match the pinned checkout and final wheel.
All other staged files pass ordinary `git diff --cached --check`; the license
also passes with only those two whitespace rules disabled.

Relevant artifacts are `main/final-report.json`, `main/mutation-report.json`,
`python/final-evidence.json`, `python/mutations-final.json`,
`reference/native-ts-parity-report.json`, `reference/er-third-order-report.json`,
`trained-gpu/report.json`, `wheel-final-report.json`, `app-test-final.log`,
`python-native-final.log` and `python-default-final.log` under the root above.
Frozen executable SHA-256:

- TS compiler: `b8220de86927bc2a6e23685ec23d9a879ef9826637b4404642de7858ffc14619`.
- Python flow entry: `31a2f0375dfa06ecd6771e12bb50d7a5ee9a3552c2af68c9af6e11ae1d836a8b`.
- Shared native factory: `7b30215d089bea2ecfc50cbf8315915b6c3f17e1d3f75aa4c6010960dc6c9935`.
- Final worker wheel: `8025d0a1887ba9f838b07f13e94a66eee7f157b1e13eecd6d64c6eb8b2354690`.

## Remaining boundaries

Family-aware editor controls, applicable remaining options, full frozen public
admission/queue/Retry/provenance and Linux/NVIDIA release qualification remain
open. PP-004/PP-005 are not complete. This does not claim Base-Anima few-step LCM
quality, new model variants, new LoRA algorithms, stochastic CPU/GPU cross-device
pixel equality, or trained Qwen/conditioner adapter coverage.
