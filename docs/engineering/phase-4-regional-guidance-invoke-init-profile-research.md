# Opt-in Invoke initialization profiles

Base: `5aef4ae4671b6dc75b82c2ebde64223215ab8470`. The preceding
[FP32 direct-assignment check](./phase-4-regional-guidance-fp32-direct-research.md)
retains 3 narrow PASS/ 1 INCONCLUSIVE; it does not qualify general quality or a
default change. This implementation moves the already measured Invoke mechanism
from the test adapter into an explicitly selected private worker profile.

## Source, scope and ownership

Recheck current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:
`app/invocations/latent_noise.py:generate_noise_tensor`,
`backend/util/devices.py:choose_noise_dtype`, the configuration/default CPU noise
invocation and `app/invocations/sd/denoise_latents.py` callers. They draw FP32 on
CPU, cast on CPU to compute dtype, transfer to compute device and supply zero
txt2img latents. `backend/stable_diffusion/diffusion_backend.py` and the legacy
`diffusers_pipeline.py` call original `scheduler.add_noise`; ancestral sampling
uses a distinct compute-device generator seeded `seed ^ 0xFFFFFFFF`.

Add exactly two explicit private names:

- `ordinary-canvas-euler-ancestral-invoke-init-txt2img-cpu-v1`
- `ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1`

Existing Euler/Euler-ancestral names, meanings, defaults, high-level signatures
and `illustrious_regional_worker` automatic selection stay unchanged. No Main,
protocol, queue, capability, frozen-job or public-admission schema changes.
The existing four-field noise profile continues to describe schedule only.
Recording initialization identity in durable jobs is a separate prerequisite
before public routing; historical absence must retain historical behavior.

The private runner alone selects a scoped method on its fresh native pipeline.
This adapts the Invoke mechanism directly with `torch.randn` on CPU, CPU cast,
device transfer and original native `scheduler.add_noise`. It does not call
native `prepare_latents` first, consume a second initial draw, intercept global
or module random functions, alter borrowed modules or replace the diffusion
loop. The ordinary native pipeline still owns timesteps, later begin-index
setup, progress, Euler transitions and VAE decode/publication.

Require one native batch/four-channel latent, existing geometry bounds, exact
lane dtype/device, absent supplied latents and a fresh CPU generator with the
requested seed/state. Refuse an occupied fresh method slot and repeat/reentry.
Before/after preparation, scheduler begin/step indices stay None and input
scaling remains unconsumed. A successful scope must complete one preparation;
failure skips that completion assertion and always restores method absence.
Existing component reservation, value/finite guards and ancestral RNG owner
remain in force.

## Bounds and acceptance

Keep all six existing explicit policies: Boolean zero-SNR choice ×
leading/linspace/trailing spacing, epsilon Euler ancestral, integer steps 1–200,
CFG 1–30/rescale 0, CPU FP32 or explicit CUDA0 FP16 and embedded VAE rules.
No new sampling default, schedule construction or policy inference is added.
Existing sides≤2048, area≤4,000,000, text/TI/row/attention budgets remain.
At maximum area the new raw CPU FP32 latent payload is 1,000,000 bytes; CPU cast,
transfer, zero/sample tensors, finite checks and native workspaces remain
additional lifetimes. This arithmetic does not establish RSS/VRAM capacity.

Focused new small CPU/CUDA tests must observe actual draw/cast/initial sample,
independent step RNG and original native consumption, preserve old-profile
controls, and cover refusals plus setup/native/decode/publication recovery.
Strict typing, scoped lint/format and relevant existing suites remain required.
An isolated wrong-initialization mutation must fail the new-profile oracle while
old profiles remain GREEN, then exact restoration must recover GREEN.

Mechanical trained qualification reuses exactly four pinned previous Main
requests/original PNGs (assignment/swapped × seeds123/124), same official
Illustrious v0.1, 1024², Euler a/28, CFG5, leading/false-ZTSNR and FP16 VAE.
This is replay of a fixed candidate, not further visual calibration/search.
Run current workspace worker code with the one compatible installed dependency
runtime; fence both source roots and keep the old installed worker unchanged.
Do not call the experimental initializer or patch random aliases. Require exact
prior predictions/latent/RNG/conditioning traces and whole PNG bytes, plus
independent fresh/prior decoded-to-PNG quantization. Actual CPU post-draw state
and first consumed sample must match their independent FP32 CPU oracle.

Serial native units retain 12 GiB host, zero swap, 600-second deadline and 0.75
CUDA allocator guard; lower tests use 3 GiB. No model/environment copies,
downloads or provisioning. Evidence lives under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-invoke-init-profile/20261105-worker`.

## Executed checks and source review

ROOT records **296 distinct lower cases PASS, 416 warnings, zero failures/errors/
skips**: 35 new cases and 261 existing ancestral/sampling/denoising/output/worker
cases. Existing Euler/Euler-ancestral controls pass. All six explicit policies
are exercised in the new CPU matrix; both actual CPU/CUDA lanes exercise the
initialization oracle, refusals, restoration/recovery and publication. Failures
after original initialization, native UNet/decode and publisher directory fsync
retain the expected exception/cause, remove authoritative partial output and
permit a fresh request. Tiny-model preservation snapshots do not extend to a
full trained-weight scan.

Full strict `basedpyright --project worker-python` passes with 0 errors,
0 warnings, 0 notes. Scoped Ruff lint/format and AST/diff checks pass. An initial
typing invocation omitted project configuration (0 errors/374 warnings); the
corrected source invocation passes. Two optional-generator test diagnostics were
fixed by one local annotation; normalized runtime AST, assertions and inputs
remain exact. The original 35-case execution precedes that type-only edit.

Independent SOURCE review is CLEAN for the four-file qualification delta. It
reads the complete new helper/tests, old-profile consumers and current Invoke
sources. All seven consulted Invoke files match clean revision `a61ac4fb…a9bdd`.
It supplies no independent runtime, visual or public certification.

## Isolated semantic mutation

The qualified source snapshot is extracted into owned disposable mutation
material, with no model/environment copy. A valid wrong implementation calls
original `add_noise` but then returns `noise * scheduler.init_noise_sigma` only
inside the new initializer. The new CPU/CUDA semantic selectors must detect
the wrong consumed initial sample; old Euler/Euler-a selectors remain controls.

Qualified sequence: **4 GREEN → 2 semantic RED + 2 old-profile GREEN → 4 restored
GREEN**. These are 12 executions of four already-counted selectors, not 12 new
distinct tests. Original private bytes and live workspace source are restored
exactly; semantic failures occur at initialization assertions, not setup/OOM.

The first mutation attempt did not pass its environment through the systemd
boundary, so pytest imported the workspace package: baseline/mutant each gave
four uninformative GREEN and the controller refused that outcome. Those eight
executions are excluded from mutation acceptance. R2 explicitly supplies the
isolated source path/cwd and checks the imported module path **and digest** before
pytest. Its mutation/original/restore reports remain alongside the first attempt.

## Trained mechanical equivalence

All four fixed requests complete through the current workspace implementation
and the canonical compatible dependency Python. The old installed worker's 63
files remain unchanged. Separate fences require all 63 workspace worker/asset
pins and actual imported worker paths, plus the three pinned native Diffusers
source files. Nothing installs or updates the public worker.

The qualification harness never calls the experimental initializer, patches
`prepare_latents` or replaces random functions. A delegated original native
class kwargs observer records the actual CPU generator **after** production
initialization. Small new tests directly observe raw draws; this trained run
instead checks that actual post-state and the first consumed sample against an
independent CPU FP32 draw/cast oracle. This distinction is explicit in reports.

| Fixed case         | Unit seconds | Peak host bytes | Swap bytes |
| ------------------ | ------------ | --------------- | ---------- |
| seed123 swapped    | 31.132       | 3,520,921,600   | 0          |
| seed124 swapped    | 29.855       | 1,964,531,712   | 0          |
| seed123 assignment | 30.892       | 1,958,510,592   | 0          |
| seed124 assignment | 29.864       | 1,829,195,776   | 0          |

Every unit exits 0 with empty owned physical groups. There are four loads/four
requests, 112 original UNet calls/ancestral transitions/progress events, four
original VAE decodes and four PNGs. Unit peaks are not whole-machine residency
or capacity guarantees; the lower regression unit reaches its 3 GiB guard and
still completes without an OOM failure.

All four complete prior UNet/step traces match exactly, ignoring only
process-local generator IDs. Contexts, pools, time IDs, schedule/config/sigmas,
CPU post-draw state, first prepared/scaled sample, every independent ancestral
RNG state and native predictions/latents remain exact. Fresh method slots and
class observers restore, while recorded borrowed metadata/global RNG, targets,
workspace and installed source fences remain unchanged.

Each whole output PNG is byte-identical to its fixed experimental predecessor.
Fresh **and** retained original decoded tensors independently quantize to all
RGB bytes, with exact ICC/dimensions and response/thumbnail associations.
No tolerance relaxation, new scene/seed, adaptive retry or new visual verdict
is introduced. The same images preserve the earlier **3 PASS / 1 INCONCLUSIVE,
NOT_QUALIFIED** finding. No fresh all 70-site numerical attention witness, trained
value clone/scan or independent terminal-to-VAE rescaling oracle is claimed.

## Retention and remaining boundary

Keep the exact source/typing history, all fixed requests/originals, native traces,
qualified mutation RED/controls/restoration and excluded attempt. ROOT verifies
all 1,567 archived entries: 1,491 regular files, 76 directories and 58,904,227 content
bytes. The isolated mutation tree matches all 1,470 qualified source members after
restoration; pytest cache entries are retained separately in the inventory.
After 15 unit physical-exit records, unchanged source, incoming dependencies and
four completed readers are checked, only this run's exact `payloads` directory
is removed. Deletion-only run/root reductions are both **62,484,480 allocated
bytes**. Archive/manifest, resource/dependency/reader gates and cleanup records
remain. Shared dependency runtime/model and incoming source/input archives stay
protected.

Only private callers that explicitly select the new name use this mechanism.
Main transport, frozen-job initialization identity, capabilities and public/
default routing remain the next implementation boundary. Historical absence
must retain old behavior. Human/age/full-prompt/general quality, Anima and
PP-001/007/008 **«Пока не обещать»** remain unchanged.
