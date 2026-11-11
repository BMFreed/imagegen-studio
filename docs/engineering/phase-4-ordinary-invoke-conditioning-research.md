# Ordinary CLIP conditioning: current Invoke source on the common runtime

Base `b7f3caa2a3ccaec6b7368c203dafff57aa99dcf2`. The preceding
[resolution diagnostic](./phase-4-ordinary-resolution-research.md) leaves the
fixed cat scene unqualified. Before changing generation defaults, compare its
actual text encoding with the original current Invoke implementation.

## Fresh source reconciliation

Invoke is clean at `4875d96531ca6712b288f6e660fcbb34143408c1`.
The ordinary frontend `core/graph.ts::buildSDGraph`, called by
`core/canvas/compileCanvasGraph.ts`, sends global text to both SDXL prompt/style;
`app/invocations/sd/sdxl.py` initializes CLIP skip0.
`text_encoder/compel.py::SDXLPromptInvocationBase.run_clip_compel` and
`SDXLCompelPromptInvocation.invoke` use independent CLIP1/CLIP2 penultimate
non-normalized states, sentence splitting/no truncation, CLIP2 pool, exact-empty
zeros, zero length-alignment and CLIP1→CLIP2 concatenation. Original
`ModelPatcher.apply_ti`/`apply_clip_skip`, textual-inversion manager and
`TorchDevice.choose_torch_dtype` are applicable to the no-resource/skip0 case.
Studio `inference.py::build_sdxl_conditioning` has the same stated operations.

Fresh noise/scheduler/caller review also reads `noise.py`, `latent_noise.py`,
`devices.py`, `sd/denoise_latents.py`, `diffusers_pipeline.py`,
`diffusion_backend.py`, `shared_invokeai_diffusion.py`, scheduler map and CUDA
VAE decode. Against the old `a61ac4fb…` reference, the known CPU FP16 versus
configurable/default FP32 noise and native `init_noise_sigma` versus Invoke
`add_noise(zeros,noise,first_timestep)` differences persist. They were already
measured in the [previous comparison](./phase-4-regional-guidance-invoke-parity-research.md);
they are not new bugs or demonstrated causes of the fixed cat result.
Euler's separate step-generator difference is inactive at `s_churn=0`.
Current Invoke scheduler initialization returns a dataclass rather than the old
tuple; reuse cannot silently ignore that adapter boundary.

One source option differs: Invoke supplies its device dtype selector to Compel;
Studio leaves Compel's default FP32 weighting dtype. The fixed unweighted text
takes the identity bypass, so source review alone does not establish an effect.
Weighted-prompt equivalence remains outside this comparison.

The earlier trained comparison shared already encoded contexts/pools/time IDs.
It did not numerically compare original Invoke CLIP encoding against Studio.
This is the next material consumer, not a rerun of the attention/noise matrices.

## Fixed execution boundary

Medium risk: one new opt-in engineering test, reusing the existing generic AST
reference loader and native Studio model/conditioning owners. Historical source
revision guards remain unchanged. No production worker, queue, persistence,
resource, UI, protocol or default changes.

RUN: `runs/ordinary-invoke-conditioning/20261111-fixed-cat`. Reuse installed
noneditable0.14.0 Python/runtime/config/model; no environment/weight copies or
downloads. It has no pytest: the real probe uses a stdlib CLI, while workspace
pytest discovers model-free tests. Do not inject workspace site-packages into
the installed interpreter. Source AST fingerprints use runtime Python3.12.13,
not host Python3.13.

Before execution, pin the complete retained seed123/1024 Main handoff, concrete
request and original transparent target. No new Main integration is needed and
no disposed raw path is resumed. Only transient operational target/output paths
are rebound into the new owned payload directory; generation fields and bytes
stay exact. CLIP encoding is seed-independent, so a second seed is redundant.
Use the original fixed positive text and empty negative, official Illustrious
XLv0.1 SHA256 `3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
no LoRA/TI, skip0, fixed1024²/crop0 and compute FP16.

Exactly one checkpoint load; **zero UNet, scheduler-step, VAE decode or image
generation calls**. Execute original selected Invoke AST bodies/decorators on
the same real tokenizer/CLIP components as Studio. IO/context/DTO adapters are
explicit and reject resources outside the declared empty case; they do not
replace text encoding, padding, concatenation, pooling or time-ID algorithms.
No sampler or second inference pipeline is introduced.

Compare consumed token IDs/masks/forward flags, CLIP1/CLIP2 penultimate outputs,
combined `[1,77,2048]`, CLIP2 pool `[1,1280]`, exact-zero negative, signed CFG
order and time IDs. Expected encoder forwards: three per lane, six total;
the empty negative runs none. Retain bounded raw consumed tensors/descriptors,
not model weights. Record the measured model/tokenizer/RNG/observer-slot scope;
do not call cheap identity/version checks a full immutable object-graph proof.
Legitimate tokenizer/library initialization must be distinguished from observers.

CPU/source guards first, including an isolated semantic mutation reaching the
original assembly consumer, adjacent GREEN and restoration. Setup/refusal/OOM is
not semantic RED. Then one serial real-component phase≤600s, inherited host
cgroup≤12GiB, swap0; small checks≤4GiB. Fresh VRAM/physical-idle checks precede
heavy execution. No CUDA allocator fraction or peak VRAM is claimed unless
explicitly measured. Retain/audit before exact idle own-payload cleanup.

Exact common-runtime equality eliminates only this fixed encoding boundary as
an explanation. It cannot establish whole installed-Invoke equivalence: current
Invoke declares different Diffusers/Transformers/Torch versions. A mismatch
requires localization; it does not authorize default tuning or an image search.
No human/visual/regional/capacity/release acceptance or PP promotion follows.

## Execution result

ROOT executes the fixed comparison once, with one actual installed-library
model load, three CLIP forwards per lane and no failed/extra trained attempt.
Token IDs/masks/forward flags, penultimate states, CLIP2 pools and assembled
positive/negative vectors agree exactly. All16 paired raw tensor roles have
identical bytes/dtypes/shapes:32 retained files,3190848 bytes total. Both empty
negative embeddings/pools are zero. Native preprocessing time IDs are
`[1024,1024,0,0,1024,1024]` for both signed rows.

Real Diffusers `encode_prompt` receives the supplied vectors without further
CLIP execution; `_get_add_time_ids` executes its original preprocessing. Final
CFG vectors are explicitly **prospective assembly**. No actual UNet-consumption
claim follows: the denied counters for UNet, VAE operations, scheduler steps and
pipeline evaluation are all0. No PNG is published. This is direct installed
library execution, not a worker RPC/UI/queue or full Invoke application run.

The bounded unit completes in25.046s, host cgroup peak1293922304 bytes
(about1.21GiB), swap0 and no remaining physical processes. Peak VRAM and allocator
fraction are not claimed. The same noneditable0.14.0 runtime/model/config is
reused without refresh. All72 installed worker files match repository/report,
all17 config files and runtime companions remain exact before/after.

Six portable model-free manifest guards pass; full Python strict typing returns
0 errors/warnings, scoped Ruff lint/format and diff checks pass. The installed
Python CPU/source phase also passes original assembly GREEN → one targeted
`target_width`→`crop_left` time-ID semantic RED, neighboring concat/pool GREEN →
restored GREEN. The RED reaches original Invoke assembly with literal CPU
adapter tensors; it is not a trained CLIP test or a setup/refusal error.

Measured preservation includes streaming parameter/buffer values plus identity,
storage and versions, module/training/hook slots, attention processors,
tokenizer vocabulary/special/config state and CPU/CUDA/Python/NumPy RNG.
Transformers lazy capture hooks are installed before the baseline without a
warmup forward. Tokenizer BPE cache population is allowed; unmeasured object
graphs are excluded. Probe module/hook/forbidden-call slots restore.

ROOT's separate zero-ML readback checks every one of16 raw pairs, the zero
negative/pools and both signed time-ID rows. The CLI verify mode checks all32
retained tensor files without another model load. These are byte checks,
separate from the actual numerical execution and source-only peer review.

## What this closes

For this exact unweighted prompt/empty negative, shared components and pinned
runtime, a difference in the checked text-encoding operators does not explain
the previous images. This is new evidence at the encoding boundary; it does
not repeat the old comparison with already shared embeddings. No source result
or numerical mismatch justifies a conditioning rewrite or a production-default
change here.

It does not compare original Invoke model loading, its whole runtime/dependency
versions, source-default noise/initialization, weighted/TI/LoRA prompts, other
models, actual denoising or visual quality. The previous scene/ref utility gates
stay NOT_QUALIFIED. No new images, prompt/seed search, regional guard extension,
human acceptance or PP promotion is performed.

## Retention and closure

The final valid closure is `retention-summary-r2.json` with
`payload-inventory-r2.json` and `retained-payloads-r2.tar.gz`:113 entries
(91 regular files/22 directories). Independent byte audit is **CLEAN** for
all113 tar/raw entries,1645 repository source files,76 qualified source bindings,
15 Invoke files/11 selected AST definitions, four external pins and the declared
72 worker/17 config files/three runtime companions. All32 raw tensors/16 pairs,
token/call metadata, CLIP column concatenation, pools, zero negative and signed
prospective CFG/time-ID bindings match. Audit reads bytes/source; it does not
repeat ROOT's numerical execution, small mutation or process observation.

Two retention issues remain recorded rather than overwritten. The first reader
expects an older RNG flag name; it is corrected to require the actual stronger
`cpuCudaPythonNumpyRng:true` scope before any archive outputs are made. The next
114-entry closure incorrectly includes its still-active `retain-r2.log` writer:
it is archived empty, then grows to123 bytes. Independent audit correctly returns
BLOCKED. The mutable unit ledger would also grow on later launches. Exact failed
helper bytes, logs, original archive/inventory/summary and the BLOCKED audit
remain preserved; that closure is not the final qualified artifact.

The corrected selector excludes retention controller/log/resource roles and
the mutable ledger from the stable archive; diagnostics and a frozen ledger
remain separate. Fresh `-r2` output names preserve the failed closure. Post-writer
raw verification and the second independent audit pass113 entries. No tensor,
input, probe, production source or native result changes; no second model load.

After all readers close, ROOT separately checks fresh runtime idle, all nine
bounded unit exits,296 lifecycle records, no incoming payload dependencies and
the exact final archive/origins. Only this RUN's `payloads` is removed:
3280896 allocated bytes, also the measured artifact-root delta. Archive-only
verification then passes all113 entries. Lifecycle is `retained`, `payloads: []`.
Copied Invoke source, compact numeric evidence, both closures/diagnostics,
borrowed original Main inputs and shared runtime/model/config companions remain
protected. Disposed raw paths are not reusable `--resume` inputs; reconstruct
regular owned roles in a fresh namespace using the recorded dependencies.

The dated RUN retains the contract, native/small/readback reports, original
tensor archive, audit/cleanup records and pre-native/final source snapshots.
Current delivery bytes remain separate from actually qualified/executed source.
The fixed encoding boundary agrees; visual and release acceptance remain open.
