# Direct Invoke Anima reference for the fixed scarf scene

## Question and fixed boundary

Base is clean `f204b9cee75fc5e8de8c2d79f0547642f398ba8b`. The preceding
[visual assessment](./phase-4-regional-guidance-anima-visual-research.md) found
correct scarf reversal at seed123, one red-scarfed cat in both regional seed124
images, and no bench in any regional image. Both ordinary controls showed two
cats on a bench. That outcome does not identify an error in Studio's adaptation.

Compare current local InvokeAI
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` before changing prompts, weights,
seeds, composition or implementation. The finite selection is seed124 ordinary,
assigned and swapped, plus seed123 assigned as a previous placement-positive
control. Reuse their complete genuine Main handoffs and original Studio PNGs.
All texts, weighted spans, authored masks and original bundle descriptors remain
unchanged:512x512,20 Euler steps,CFG4,CUDA BF16. No search or tuning is included.

## Consulted Invoke owners and comparison scope

Read the current implementations and callers:

- `invokeai/backend/anima/anima_transformer.py`: original28-block transformer,
  integrated LLM adapter and weighted context preparation;
- `invokeai/backend/model_manager/load/model_loaders/anima.py`: native config,
  checkpoint namespace/derived-state qualification, spatial RoPE scale4;
- `invokeai/backend/model_manager/checkpoint_prefix.py`: original namespace
  identification/stripping without an independent key-rewrite implementation;
- `invokeai/backend/anima/{prompt_weighting,conditioning_data,regional_prompting,anima_transformer_patch}.py`:
  parser/token weights, context ranges, nearest/binary/background masks and
  alternating even-block attention;
- `invokeai/app/invocations/anima/anima_denoise.py` and
  `invokeai/backend/flux/sampling_utils.py`: initial noise, shifted schedule,
  original built-in Euler loop and native calls;
- `invokeai/app/invocations/vae/anima_latents_to_image.py` and
  `invokeai/backend/util/mask.py`: normalization, quantization and mask conversion.

The reference uses original Invoke transformer/adapter/region owners and source
Euler, with the existing Qwen/Wan preparation as shared controls. It is not a
qualification of the installed Invoke application, queue, resource manager,
tiling/recovery, or public Anima generation. The complete invocation imports
application infrastructure; standalone source loading and unchanged AST
definitions isolate its native owners. Explicit CUDA selection replaces only
application device discovery. No alternative model, mask or solver is invented.
The existing Einops package is reused without copying a runtime or weights.

Two source facts require separate interpretation. Invoke also restricts global
context to background in even blocks; these masks cover the whole canvas. This
is a confirmed policy, not an isolated cause of the lost bench. Invoke converts
decoded BF16 directly to RGB8, while Studio explicitly converts to FP32 first.
Keep native Invoke RGB and a common FP32 quantization separately; rounding-only
pixel differences cannot establish a regional defect.

## Evidence and limits

The initial pre-run contract and source/input hashes are retained under
`runs/regional-guidance-anima-invoke-control/20261107-scarves/contract.json`,
with its original version preserved as `contract-r1.json`, SHA-256
`326ffdcf9a6ea5b479aa31d90550008f74fc02f7f929dd8f32437bd89cc52d33`.
Before execution, the standalone checkpoint-prefix dependency is additionally
pinned; the final contract SHA-256 is
`fd1ddf6caf03bc2dc5fcc52139fa94f8b39c09b63d418293fb5a4e7b82d14cfd`.
Serial units retain the12GiB host/zero-swap/600second envelope and CUDA allocator
fraction0.75. This is an execution envelope, not a capacity promise. Original
external weights, the repository runtime and prior evidence stay protected.

### First boundary: actual parser disagreement

The first native attempt stops before reference-model generation at a parser
agreement assertion. A separate weight-free diagnostic confirms a real
interpretation difference on identical authored strings:

| Authored text | Main cleaned text | Current Invoke cleaned text |
| --- | --- | --- |
| `(two white cats)1.25 on one bench` | `two white cats on one bench` | Same |
| `(blur)0.75, noise` | `blur, noise` | `blur , noise` |
| `(red scarf)1.5, one white cat` | `red scarf, one white cat` | `red scarf , one white cat` |
| `(blue scarf)0.75, one white cat` | `blue scarf, one white cat` | `blue scarf , one white cat` |

All three comma cases also differ in actual Qwen and T5 IDs. The initial
assumption of compiled-text equivalence is therefore false. Preserve that
diagnostic, original probe and failed resource record; it is not a visual result.
The pre-generation parser addendum keeps raw text/weights/seeds/settings fixed
and uses each real parser's interpretation. Invoke's own cleaned text supplies
its actual Qwen/T5 inputs. Main sidecars remain unchanged comparison data.
The separate common-Studio-context prediction check remains intact. No input
is silently rewritten to manufacture parity or a better picture.

### Executed native comparison

ROOT executes four successful reference requests in one serial unit:43.316s,
host MemoryPeak8,890,130,432 bytes, zero swap, physical remaining PIDs empty.
Observed CUDA peaks are5,759,847,424 allocated and5,802,819,584 reserved bytes for
this probe, not application capacity. The unchanged production loader first
prepares shared Qwen/Wan and Studio comparison contexts. Its backbone, adapter
and Qwen are released before native Invoke loading. Strict original-key loading
then verifies all685 Invoke persistent destinations against the exact checkpoint
cast to BF16, without a second complete CPU checkpoint or another runtime.

Each request observes20 Euler transitions,40 positive/negative predictions and
1,120 original cross-attention SDPA calls across all28 blocks. Totals are80
transitions,160 predictions and4,480 cross-attention calls. Eight additional
common-context first-prediction probes are separate from generation counters.
Actual masks, noise and schedules match the expected inputs. All outputs are
finite and all eight native/common-quantizer PNGs reopen with exact expected
RGB bytes, dimensions and pinned ICC.

Numerical parity is **not** claimed. With common Studio contexts, first native
predictions already differ: maximum absolute error0.03125, RMS approximately
0.00458–0.00475. Native own-context regional positive errors are larger at
seed124, RMS0.05084/0.05535. This separates residual backbone arithmetic from
upstream parser/adapter differences without isolating their causes. Invoke's
adapter rotary buffer is FP32; Studio's is BF16. The shared Qwen buffers remain
Studio-prepared on both sides, so this does not qualify an independent Invoke
Qwen loader. Native versus common FP32 quantization changes69,429–348,816 channel
bytes per image, with maximum channel delta1. Full RGB divergence therefore
cannot be attributed solely to regional attention or quantization.

### Visual observation and conclusion

An independent reader receives four anonymous full native-BF16 PNGs without
prompts, seeds, variants or the map. ROOT views the same originals afterward;
their visible-object descriptions agree.

| Case | Original Invoke observation | Gate |
| --- | --- | --- |
| Seed124 ordinary | Two separate white cats on a wooden bench, foliage/grass; no scarves. | Ordinary PASS |
| Seed124 assigned | One centered white kitten with a red neck scarf, cyan oval, no second cat or bench. | Placement FAIL |
| Seed124 swapped | One centered white kitten still wearing red, cyan oval, no second cat or bench. | Placement FAIL |
| Seed123 assigned | Two distinct cats, red neck scarf left and blue right; no bench. | Placement PASS |

The bounded reference reproduces the same qualitative limitation as Studio:
placement1PASS/2FAIL and ordinary1PASS, all three regional scenes omit the bench.
This four-case control does not rerun the complete both-seed reversal gate.
Visual status remains **NOT_QUALIFIED**. No conspicuous straight seam/fusion
explains the missing subject. These are agent observations, not human acceptance.

The failure is demonstrably present with original Invoke native owners; it
cannot currently be assigned solely to a Studio regional-port defect. This does
not prove every implementation detail equivalent or isolate the cause of scene
collapse. The first concrete adaptation discrepancy is comma/group parsing.
The next finite owner is a focused compiler regression against current Invoke,
with frozen-work interpretation preserved; residual numeric differences stay
separate. No composition, prompt, weight, seed or default is tuned in this slice.

Original/R2 probes, failed diagnostic, full records, input handoffs, source pins,
eight output PNGs, anonymous map/descriptions and assessment remain retained in
the run. The final probe SHA-256 is
`9379db13f814ce2eb1dd6364b909f8ea0977a7923fa517e6465ecfa1cbfceb93`.
Fresh independent source-only reviews are CLEAN for the initial owner and parser
correction; they do not independently rerun ROOT's measurements or inspect images.
Source/record checks, physical exit and release bookkeeping remain distinct.

Public Anima Regional Guidance,
spatial negatives/references, durable candidates, Smart and general visual
quality remain separate. PP-001/005/007/008 remain **«Пока не обещать»**.
