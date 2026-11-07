# Anima native rotary-buffer precision

## Source and bounded correction

Base: `1601b8c2df2eea6188c56c8e1c2b672a93b53cbe`. The preceding
[original Invoke control](./phase-4-regional-guidance-anima-invoke-control-research.md)
identified an adapter-frequency difference after holding text/context inputs
fixed. This checkpoint corrects loading precision; it does not recalibrate the
separately **NOT_QUALIFIED** scarf-placement experiment.

Re-read clean local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/backend/anima/anima_transformer.py`: native adapter rotary
  construction and its FP32 frequency/position arithmetic.
- `invokeai/backend/model_manager/load/model_loaders/anima.py` and
  `invokeai/backend/model_manager/checkpoint_prefix.py`: cast checkpoint state
  before assignment, while generated nonpersistent buffers remain native state.
- `invokeai/backend/model_manager/load/model_cache/cached_model/cached_model_with_partial_load.py`:
  device-only placement, including nonpersistent buffers.
- `invokeai/backend/model_manager/load/model_loaders/{text_llm,z_image}.py`:
  Qwen preparation. The meta-only Qwen reconstruction branch is distinct from
  Studio's real-buffer constructor path.
- `invokeai/app/invocations/text_encoder/anima_text_encoder.py` and
  `invokeai/backend/anima/prompt_weighting.py`: actual conditioning callers.

Studio already casts and validates every checkpoint tensor before strict
`assign=True` installation. Its subsequent whole-module `.to(device,dtype)`
unnecessarily rounded native nonpersistent frequency buffers. Replace only this
last operation with device placement. No reconstruction from rounded values,
manual frequency formula, new profile, fallback, protocol or loading wrapper is
introduced. Missing/meta/nonfinite/overflow refusals remain unchanged.

Under the pinned Diffusers 0.40.0 / Transformers 5.5.4 / Torch 2.7.1 implementation,
the Anima conditioner has FP32 `rotary_emb.inv_freq`; Qwen3 has FP32 active
`inv_freq` and default-RoPE `original_inv_freq`. Current Cosmos computes its
position state inside forward and has no registered buffers. Checkpoint-backed
parameters still use the requested F32/F16/BF16 dtype. Private Anima admission
already permits native FP32 buffers alongside BF16 parameters; it needs no
relaxation. Ordinary and Smart loading share the corrected owner.

Frozen jobs retain their authored/compiled inputs and exact resources. Their
contract does not freeze a historical loader binary or guarantee identical
pixels across numerical bug fixes. This correction neither rewrites old jobs
nor changes the interpretation marker introduced by
[fragment compatibility](./phase-4-anima-fragment-parity-research.md).

## Executed regression and sensitivity evidence

The actual native tiny-model loader reproduces F16/BF16 frequency loss before
the fix; the F32 control passes. After correction **62 loader cases pass**,
including all three persistent-state dtype comparisons, exact fresh-constructor
frequency comparisons, and real BF16 Qwen→conditioner→Cosmos execution on CPU.
The generated buffers are deliberately not exactly representable in the lower
precisions, so widening a rounded value cannot satisfy these assertions.

An isolated module intervention restores only the old final dtype cast:
**3 GREEN → 2 semantic RED +1 F32 control GREEN → 3 restored GREEN**.
Each phase runs the same native precision cases; live production source stays
unchanged. Ruff check/format and strict BasedPyright pass for both changed files.

Across loader, conditioning, tokenizers, worker, Euler, LoRA, outpaint, sampling,
flow sampling and private regional neighbors, **526 distinct cases pass**.
The first combined run has 487 PASS/39 failures, all caused by an old outpaint
oracle pin disagreeing with the newer local Invoke file. Supplying the exact
three external source files from its documented `9e154096…` revision gives
61/61 outpaint PASS, resolving every failed case without changing source or
assertions. Current Invoke remains the reference for this loader correction.

An earlier diagnostic used an invalid assertion that every component had
registered buffers; current Cosmos has none. Removing only that fixture
assumption precedes the meaningful pre-fix RED run. That diagnostic is retained
and excluded from qualification. Repeated loader/outpaint/mutation executions
are not added to the 526 distinct-case count.

## Trained causal measurement

The finite probe uses one fresh genuine saved/reopened Main base recipe and the
same exact Cyberfalafel Anima/Qwen/Wan bundle as the preceding control. Inputs
remain 512², seed 123, CFG 4 and a 20-step Euler declaration; the probe evaluates
only the first positive/negative native predictions at sigma 1. It performs no
Euler trajectory, VAE decode, PNG generation or visual assessment.

Six stages preserve raw/compiled prompts, Qwen/T5 IDs, weights, masks, checkpoint
parameters and seeded FP32 initial noise: native FP32; adapter-only rounded;
active-Qwen-only rounded; original-Qwen-snapshot-only rounded; all rounded;
exact restoration. Four compiled streams match the actual current Invoke parser.
A separately loaded original Invoke 118-key adapter consumes fixed Qwen hidden
states for the adapter-isolation control. Its matched intervention is separate
from an unchanged original FP32 rotary reference.

The trained probe passes in 40.775 seconds. On the native FP32 path, all four
weighted production-adapter outputs are **bitwise equal** to the independently
loaded original Invoke adapter. Adapter/Qwen rotary cos/sin also match their
native FP32 references exactly on the declared 512/8192 position grids.

Adapter-only rounding preserves Qwen hidden states exactly but changes weighted
contexts (maximum absolute difference 0.01953125) and both native predictions
(maximum absolute difference 0.03125). Active-Qwen-only rounding changes hidden
states (maximum 1.0), weighted contexts (maximum 0.0224609375) and both predictions
(maximum 0.03125); the fixed-Qwen adapter controls remain exact. Rounding only
the inactive default-RoPE snapshot changes none of these observations. Rounding
all buffers reproduces the old policy's numerical influence; exact restoration
reproduces every baseline context and prediction.

These are six stages, 12 actual Cosmos predictions and 336 observed original
cross-attention calls. All 1,307 persistent production/reference tensors retain
their exact bytes, Parameter identities and storage; original buffer objects,
bytes/dtypes and forward CPU/CUDA RNG restore exactly. Existing private model
admission accepts both before and after the experiment. Host cgroup peak is
8,885,043,200 bytes, zero swap, under the declared 12 GiB/600-second unit. CUDA
uses the existing 0.75 allocator-fraction guard; this is not a measured VRAM or
general capacity claim.

The original Invoke adapter is an independent adapter consumer, not a complete
Invoke pipeline comparison. Even the rounded adapter implementations differ on
one held global-positive stream; the native FP32 path is exact for all four.
Do not infer whole-backbone equivalence, final pixel parity or better placement
from these first-prediction measurements.

## Limits and retention

Run: `runs/anima-rotary-precision/20261107-fp32`. Reuse the existing worker venv
and original external model files; no downloads, copied model bundle or second
environment. Source pins, commands, diagnostic/RED/GREEN JUnit, isolated mutant
and restoration bytes, original Invoke sources, fresh Main handoff and numeric
observations remain reproducible evidence. ROOT owns execution and physical
exit; independent source reading does not certify runtime measurements.

Independent source reviews of the two-file correction and the trained probe
are CLEAN within their frozen scopes. ROOT confirms all seven owned bounded
units ended, exact restoration, completed readers and no incoming lifecycle
dependency on the scratch. All 18 scratch entries (eight regular files and ten
directories) survive in the verified payload archive, including the fresh Main
DB/package/handoff and three isolated loader versions. Releasing only that
scratch reclaims **8,843,264 allocated bytes**. Original external weights, both
source checkouts, the reusable runtime and parent evidence remain protected.
Artifact root remains about 24 GiB, below the initial 30 GiB soft budget.
Final source/document/retained review and ROOT's physical release are distinct.

Whole-pipeline Invoke parity, output quantization, image quality, public Anima
regional jobs, spatial negatives/references, Smart regional guidance and durable
regional candidates remain separate. The previous visual NOT_QUALIFIED result
and provenance/Compare/result-derived-preset exclusions remain. No default or
readiness promotion: PP-001/005/007/008 stay **«Пока не обещать»**.
