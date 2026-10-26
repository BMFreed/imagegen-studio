# Private Regional CUDA FP16 execution

Status: private CUDA FP16 checkpoint complete; ROOT qualification PASS, independent
source/retention reviews and owned-payload release complete on dirty
`master@10115df581d9e07049478dee3866a280886794fd`, following the completed
[CPU Euler denoising/decode checkpoint](./phase-4-regional-guidance-denoising-research.md).
Its 1,082 tests and Main/native observations are historical evidence; they do
not establish this CUDA lane.

## Finite owner

Extend the existing adapter, owned-conditioning, recipe and denoising owners
with one explicit CUDA FP16 lane. The numerical planner, world-to-latent sampler,
ordinary encoder, scheduler and pipeline loop remain unchanged. There is no new
wrapper, diffusion loop, public worker command or reusable tensor bank.

The high-level signatures remain unchanged. Encoding selects
`ordinary-canvas-static-dualclip-cuda-fp16-v1`; denoising selects
`ordinary-canvas-euler-txt2img-cuda-fp16-v1`. CPU/CPU and CUDA/CUDA are the only
admitted profile pairs. The new lane is fixed to `cuda:0`; complete device
equality includes the index. The qualified device is an RTX 4080, not every
GPU/runtime. Existing lower-level APIs gain an optional `tensor_profile`, with
`cpu-float32-v1` as their unchanged default and `cuda-float16-v1` as the explicit
new choice. No input-based dtype/device inference or automatic fallback occurs.

The caller supplies already configured, eval, native, uncompiled and non-offloaded
models. Both CLIPs must already have their native output-capture hooks initialized.
The consumer performs no `.to()`, `.half()`, `.float()`, `.eval()`, warm-up,
precision configuration, resource loading or repair of caller state.

| Tensor role | CUDA lane |
| --- | --- |
| Used floating model state | FP16 on exact `cuda:0` |
| Integer/Boolean model buffers | Original dtype on `cuda:0` |
| Context, pools, samples, time IDs | FP16 on `cuda:0` |
| Euler timestep | Finite FP32 scalar on `cuda:0` |
| Expanded attention permissions | Boolean on `cuda:0` |
| Prior additive attention masks | FP16 on `cuda:0`, exactly 0, -10000 or -inf |
| Root key mask | Boolean or binary FP16 on `cuda:0` |
| Native returned pt image | Original finite FP16 `[1,3,H,W]` on `cuda:0` |

Autograd and both CPU/CUDA autocast must be disabled for CUDA execution.
Validate both signs, selected pools and complete model/input placement before
owned allocation and `copy_`; copying must not conceal an unintended conversion.
Owned tensors and value-equal hook replacements preserve exact device, dtype,
shape and values. Existing CPU validation and refusal behavior remain unchanged.

For denoising, require explicit `vae_precision="FP16"`, an already-half VAE and
`force_upcast is False`; Auto, FP32, external VAE and mixed placement/precision
refuse before encoding. The ordinary production loader already supports manual
FP16 preparation. Auto/upcast restoration is a separate lifecycle owner; it is
not silently introduced here. The one-shot recipe still excludes unused VAE
tensor state from its reservation/validation.

## Actual flow and preserved ownership

The flow remains real Main capture/concrete recipe → real CLIP/Compel → existing
geometry → owned conversion/assembly → original regional attention processors
through native Euler denoising → native VAE decode. Context ranges, sign order,
terminal padding, explicit global support/pools, absent versus empty positives,
local/inherited negatives and all four coverage kinds retain their prior semantics.

Allocate support tensors and expanded masks on the selected device. Interpret
FP16 additive masks as additive masks; the old float32-only branch must not
misclassify them as Boolean permissions. Spatial support, sign padding and prior
permissions intersect on every call, including equal lengths. Effective all-masked
rows refuse before the original processor.

Keep the fresh CPU generator from the matched seed, as ordinary production does.
Diffusers owns the intentional noise transfer to the execution device. Keep
global CPU/CUDA RNG state unchanged; do not require CPU/GPU output equality.
Native SDPA selects its implementation; this owner does not force global backend
flags or claim a particular fused kernel.

One native call still owns the original one/two-step Euler/epsilon loop, CFG
1–30, zero rescale, one image and the existing fixed scaled-linear/linspace
schedule. The output is the original native GPU-half result, not a converted
CPU replacement. Actual transparent-target mode, Main batch membership/seed
history and installed checkpoint identity remain trusted caller preconditions;
the recipe cannot authenticate them.

The shared reservation, full UNet/VAE pre-existing-hook refusal, guarded CLIP
hooks, adapter failure latch and reverse journals remain. Verify exact weights,
configs, vocabularies, training flags, tensor devices/dtypes, processors, hooks,
call-entry/forward slots and reservations on success and recoverable failure.
Nonfinite UNet/VAE output refuses before postprocessing can clamp it. A later-step
or decode exception returns no partial result and must permit a fresh call after
restoration. This does not promise recovery from a poisoned GPU driver/context.

The cooperative scope excludes in-place owned-input mutation, registry/model
mutation and direct concurrent forwards. CUDA support does not make arbitrary
Python plugins or hostile writers safe.

## Risk, bounds and alternatives

Risk is high: a dtype/device gap can silently cast a signed stream, expose blocked
keys, drop later-step spatial restrictions or leak borrowed model state. Keep the
existing three-region, 308-row-per-sign, 16-stream-per-sign, geometry, alpha-work,
sample and finite-scratch bounds. Expanded masks remain bounded by 33,554,432
Boolean elements per call, including heads, before encoding/model mutation and
before allocation. No limit is raised to accommodate a wrong factor binding.

| Payload | CUDA FP16 arithmetic under existing bounds |
| --- | --- |
| Two contexts plus selected pools | At most 2,528,256 bytes |
| Terminal latent | At most 500,000 bytes |
| CFG sample | At most 1,000,000 bytes |
| Decoded RGB | At most 24,000,000 bytes |
| Expanded Boolean attention mask | At most 33,554,432 elements |

Encoding/conversion copies, validation scratch, model state, native attention/VAE
workspaces, CUDA context/libraries and test observations are additional. These
figures are neither a total VRAM/RSS ceiling nor maximum-geometry/model-capacity
qualification. Native runs are serial in owned 3 GiB host-memory groups, zero
swap, with a 600-second deadline. GPU qualification records allocator peaks and
observation-boundary synchronization; test-only allocator policy is not consumer
behavior or a bound on allocations outside PyTorch's allocator.

Production CUDA/FP16 is a concrete gap after the CPU checkpoint. Scheduler
expansion leaves that gap open. Output publication adds filesystem/result
ownership before CUDA consumption is qualified. Exact regional embeddings are
material later work: the current loader mutates tokenizer vocabularies and CLIP
embedding tables, so a borrowed fresh pipeline wrapper does not isolate loading.
Same literals bound to different exact regional resources need their own full
resolution/loading/encoding lifecycle, not a metadata-only resolver.

## Initial acceptance plan and evidence

ROOT verified all 1,369 baseline source files before edits and reused the existing
runtime without downloads or model/environment copies. Inventory was about
6.2 GiB under the artifact root with about 80 GiB free. The CUDA runtime probe
confirms Python 3.12.13, Torch 2.7.1+cu126/CUDA 12.6, Diffusers 0.40.0,
Transformers 5.5.4 and Compel 2.4.0 on RTX 4080 `cuda:0`.

The separate ordinary native baseline passes one two-step CUDA-half Euler/VAE
case at 24×40. Actual UNet samples are `[2,4,3,5]` CUDA-half, timestep scalars
CUDA-float32, decode input/output CUDA-half, with finite original native pt output.
The fixture preconfigures the models and `force_upcast=False` before the observed
call. Host peak is 1,380,892,672 bytes; PyTorch GPU allocated/reserved peaks are
55,463,936 / 71,303,168 bytes. Its isolated test process uses allocator fraction
0.125. This establishes ordinary mechanics only, not regional execution.

Required qualification enters through whole freshly produced Main recipes and
the existing consumer. Observe actual CUDA contexts, ranges, selected pools,
permissions, padding, time IDs, scheduler transitions and decode on both native
calls, including both layouts. Include unchanged encoding counts between one and
two steps, zero-region ordinary equivalence, same-seed/changed-seed controls and
global RNG preservation. Add a real multi-resolution native UNet with explicit
factor bindings and odd rectangular grids; the one-level fixture's blanket factor
1 must not become production topology inference.

An independent dense attention oracle and permitted/blocked interventions must
qualify actual original SDPA consumption, with a justified FP16 tolerance and
exact mask/context association. Refusal cases cover profile pairs, placement,
dtype, autocast/grad, VAE/upcast, hooks, masks, bindings and budgets. Setup, encoder,
second-step, scheduler, nonfinite and decode failures require exact restoration
and fresh-call recovery.

Execute a valid second-step spatial mutation through original native processing:
regional permission/prediction or decoded-result assertions turn semantic RED;
a zero-region control stays GREEN; exact restoration returns GREEN. Separately
prove sensitivity to the upcast/precision refusal. Import, collection, OOM or
CUDA setup errors do not qualify as semantic RED. Existing CPU behavioral assertions remain regression coverage. The exact
lower-API signature assertion additionally admits the new keyword and verifies
its unchanged CPU default and keyword-only form. Independent source/retention reviews and final
release are still pending.

## Current execution chronology

ROOT's fresh Service/package/coordinator probe produced four complete concrete
recipes from two saved/reopened projects. Actual target composition and separate
PNG-alpha classification admit only the transparent txt2img fixtures; opaque
and partially opaque controls retain their distinct modes. Main state stays
unchanged. The CUDA handoff consumes those exact recipe texts and alpha bytes,
with literal independent encoding/permission expectations. Both layouts give
**eight runs / 16 UNet calls / 16 Euler steps / eight VAE decodes** and original
finite FP16 `cuda:0` results. The same paired contexts, pools and masks reach
both steps. This is test-only transport, not worker IPC or a public caller.

The first unchanged CPU regression execution records **1,080 PASS / one failure**:
its exact-key signature expectation predates the authorized `tensor_profile`
keyword. The correction preserves its other checks and explicitly verifies the
CPU default and keyword-only form. The first CUDA-focused execution records
**111 PASS / seven failures / two teardown errors**, zero skips. Three refusals
revealed that complete UNet runtime/native-call validation occurred after
length tokenization; the existing read-only validator now covers UNet and VAE
before tokenization. Other corrections are exact refusal-code expectations and
fixture shadow-slot absence restoration. Assertion diagnostics also reproduced
native `ConfigMixin` repr/config pollution on failure; subsequent bounded runs
use short plain assertions without changing test assertions.

Zero-region native output with an explicit all-true regional Boolean mask has
small FP16 differences from ordinary execution without a mask. ROOT measured
maximum absolute difference **0.0009765625** in each layout, mean
0.0001595815 / 0.0001396603 across 1,152 image elements. Regional same-seed repeat
remains bit-exact. Only this ordinary-versus-regional comparison uses
`atol=0.001, rtol=0.001`; association, permissions, storage and restoration remain
exact. Different SDPA rounding paths are a plausible explanation, not a claim
that a particular GPU kernel was observed. The separate dense attention oracle
uses `atol=rtol=0.004` after native half projections and float32 reference
accumulation; its permissions are exact.

Final focused/combined checks, isolated semantic mutations and independent
source/retention reviews remain pending at this source freeze.

## R1 review correction and R2 boundary

Independent frozen R1 source review found one P2 in the separate one-shot recipe
frontend: complete UNet placement/native-call validation still followed input
snapshots and length tokenization. The denoising correction did not cover that
entry point. ROOT first executed two new invalid-model cases (one UNet parameter
on CPU or FP32) and a valid native control: **two semantic RED / one GREEN**,
zero errors/skips. Both REDs are the exact supplied sample reaching `clone`
before required profile refusal. The one-shot frontend now invokes the existing
read-only UNet module validator before `_native_arguments`; the same three
cases pass. The unused VAE remains excluded from that frontend's used objects.

The new suite is now **121 cases across 32 functions**, preserving the previous
118 cases. The old conditioning test only admits the new keyword and checks its
CPU default and keyword-only shape. R1's initial implementation/results,
source-review finding, byte audit and all three causal experiments remain
historical evidence. R2 gets its own source freeze, final-source runtime and
mutation mapping rather than inheriting a runtime claim from R1.

R1 mutation-controller r1 completed the spatial GREEN/RED/restored executions,
then over-required a changed decoded image. Raw observations show a changed
second-step prediction entering original Euler, with **unchanged terminal FP16
latent and decoded image** in that tiny fixture. The contract requires native
prediction/scheduler-input or decoded sensitivity; this evidence establishes the
former only. Controller r2 verified/reused those retained spatial phases but
stopped before upcast mutation because the anchor omitted a comma. Controller
r3 reused the same spatial executions without rerun claims, executed valid
upcast/allocation phases and verified full source restoration. These controller
issues and their diagnostics stay retained and are not additional semantic REDs.

R1 combined qualification records **1,200 PASS = 1,081 CPU neighbors + 118 CUDA
cases + one actual Main handoff**, zero failures/errors/skips, 646 dependency
warnings. R1 byte audit is CLEAN within its four declared candidates. Its RUN
allocation was a timed snapshot, not a claim of a final constant size. Final R2
combined checks, fresh causal experiments, independent R2 source review and
release are pending at this freeze.

## Early profile and existing adapter ownership

The R2 combined run records **1,202 PASS / one failure**, zero errors/skips.
The early one-shot model check encountered an already active lower adapter's
legitimate call-entry wrappers and changed the established overlap diagnostic
from `SCOPE_CONFLICT` to `PROFILE_INVALID`. The old CPU overlap assertion remains
unchanged. The one-shot frontend now reads the adapter ownership registry under
its existing lock before the early module-profile check. It neither reserves a
second adapter owner nor treats active-owned wrappers as custom model code.
The CPU overlap case plus the three CUDA preflight/control cases pass together
(**four PASS**), preserving early bad-placement refusal and exact outer-scope
restoration. The final source gets a new R3 freeze and its own qualification.

R1's isolated checkout was reused only after its source/retention readers ended
and all original bytes verified. The R1 full archive and rollback/causal records
remain outside the candidate. A pinned overlay records the R2 source transition;
subsequent source transitions and final mutation replay are recorded separately.
This reuses one owned source copy and no additional ML environment/model copy.

## Final R3 qualification and release gate

ROOT's final same-source **combined-r3 passes 1,203 cases**: 1,081 unchanged CPU
and neighboring cases, 121 CUDA cases and one actual Main→CUDA handoff. There
are zero failures, errors or skips and 646 dependency warnings. Strict
`basedpyright` with the worker project (`typing-r5`), scoped Ruff (`ruff-r2`) and
format check (`format-r2`) pass. No TypeScript/Vue production source changed;
this checkpoint makes no fresh application-build claim.

Final whole-Main evidence observes four complete recipes in both layouts:
**eight runs / 16 original UNet calls / 16 Euler transitions / eight VAE decodes**.
The eight native run observations, including image hashes, agree with the R1
combined observations. Diagnostics about GPU allocator counters are excluded
from that equality: the Main fixture previously reset counters late, and R3
removes that reset. Final combined whole-process PyTorch allocated/reserved peaks
are **425,718,272 / 503,316,480 bytes**, under the test process's allocator
fraction 0.125. Host cgroup peak is **1,967,341,568 bytes**, swap zero. These are
specific random tiny-model runs, not total VRAM/RSS or trained-checkpoint capacity.
Native suites and mutation runs are serial with 3 GiB / zero-swap / 600-second
owned-unit bounds; final static source checks run separately from native work.

The CUDA suite covers both layouts, actual Compel/dual-CLIP values and pools,
terminal padding, inherited/local and empty/absent streams, original half SDPA,
binary/additive prior intersections, all-masked refusal, same-seed repeat and
changed-seed controls. The three-stage random UNet has seven explicitly bound
Transformer sites at factors 2/4, with actual odd rectangular parent grids.
Its dimensions/factors do not become inferred production topology or a full
trained-SDXL qualification.

All three **fresh final-source R3** mutations complete **2 GREEN → one semantic
RED plus one control GREEN → 2 restored GREEN**, zero errors/skips. They change
only second-step spatial support, the manual-FP16/upcast refusal, or support-plane
device allocation. The spatial prediction entering original Euler changes on
step two, with step one exact; terminal half latent and image stay equal in this
specific mutation. No pixel-change claim is inferred. Controls' native outcomes
remain exact across phases. All **1,371 isolated source members** restore to
R3; the six implementation/test Python files remain the tested frozen bytes.

Independent full R2 source review is CLEAN within its pinned source-only scope;
ROOT's later old-CPU overlap regression and R3 correction are preserved above.
Independent R3 correction review is CLEAN, confirming ownership error priority,
early validation, lock ordering and restoration at source level. These reviews
ran no native code and do not independently certify ROOT execution.

Both scoped retained-byte audits are CLEAN. The final audit verifies **656
fixture mappings → 31 blobs / 667,317 bytes**, including four identical 163-file
CPU fixture sets and two IGS plus two immutable SQLite files. All 19 migrations,
assets/ICCs, generators, configuration/locks and local source dependencies close
outside disposal. The 19-byte checkpoint marker is not trained weights.

ROOT freshly verified 27 owned units idle, no remaining candidate process handles,
all 17 then-existing delegated tasks terminal without pending runs, exact source/
rollback restoration and known artifact/workspace incoming references/symlinks.
The six exact idle candidates were then deleted: **37,310,464 bytes reclaimed**,
with the same measured run and artifact-root reduction. The pre-release run
allocation was 84,475,904 bytes and fell to 47,165,440 before final compact
bookkeeping. Native/model/runtime directories were never deleted. The lifetime
record is retained with no live payloads. Timestamped earlier allocation
snapshots remain historical rather than being rewritten as constant final sizes.

Compact source archives, complete causal logs, original/mutant bytes, ten native
primary sources, fixture CAS and external reusable runtime/baseline dependencies
remain protected. R1/R2/R3 source and controller versions stay distinct. The final
source archive and version mapping pin tested Python separately from final
three-document changes. No source/byte audit independently reran qualification
or granted deletion authority; ROOT applied the authorized lifecycle gates.

## Preserved exclusions

No public caller, admission, UI, IPC/worker protocol, queue, persistence, acceptance
or provenance/Compare/result-derived-preset change. Enabled-region NEW refusal,
target-only Smart permission and published/frozen Retry independence remain.
Active embeddings, LoRAs/adapters, references, Smart and Anima remain refused.
Random local CUDA models establish mechanics, not trained regional quality,
installed-checkpoint attestation, packaged-worker or public readiness.
PP-001/007/008 remain **Пока не обещать**.
