# Anima decoded-output RGB precision

## Source and behavior

Base: `04b3c67b999f9c60051d6a0aa752e398646ba5f9`. The
[direct Invoke comparison](./phase-4-regional-guidance-anima-invoke-control-research.md)
identified different RGB bytes when the same BF16 decoded tensor was converted
with native arithmetic or widened to FP32. This checkpoint isolates that last
conversion after the separate [rotary fix](./phase-4-anima-rotary-precision-research.md).

Re-read clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/app/invocations/vae/anima_latents_to_image.py`, especially the
  finite decoded-output conversion at lines 185–192; SHA256
  `e2c248839b9346c0a0cdf8397eb9d4a773ca98bb8c1657436a6c3be5b8af99c2`.
- `invokeai/backend/util/qwen_image_vae.py`: the compatible VAE remains the
  original object, without an intervening precision wrapper.
- `invokeai/frontend/webv2/src/features/generation/core/graph.ts`: the Anima
  generation graph connects denoising latents and the selected VAE to `anima_l2i`.
- `invokeai/app/services/shared/invocation_context.py`,
  `invokeai/app/services/images/images_default.py` and
  `invokeai/app/services/image_files/image_files_disk.py`: save the resulting
  PIL image as PNG; they do not repeat floating-point quantization.

The original decoder removes the singleton temporal dimension, clamps in the
decoded tensor's dtype, rearranges CHW→HWC and evaluates
`(127.5 * (img + 1.0)).byte()`. It does not widen, round to nearest or apply a
second postscale clamp. Studio already uses the same operation order, truncating
uint8 cast and channel mapping; remove only its extra `.float()` before clamp.
F32 arithmetic is unchanged. F16/BF16 retain their native intermediate rounding.

The shared `execute_captured_anima_plan` owner reaches ordinary TXT/IMG, the six
existing sampling methods, OUT/zero-strength VAE reconstruction, Smart execution
and private regional output. No denoising, VAE weights/precision, masks, latent
normalization, scheduler, target/resource resolution, publisher or alpha policy
changes. Existing exact shape, raw/decoded finite-state, ICC and exclusive-file
refusals remain. Invoke's separate tiling/OOM/nonfinite recovery mechanisms are
outside this correction; Studio retains its existing fail-closed finite checks.

Frozen authored/compiled prompts and exact resource identities stay immutable.
Existing candidate/accepted PNG bytes are never rewritten. Regeneration uses the
current loader/converter; frozen input ownership does not pin a historical
runtime's numerical pixels. No schema, capability or interpretation marker is
needed for this numerical adaptation.

## Executed regression and trained acceptance

Acceptance uses unchanged original Invoke conversion AST statements as an
independent pixel oracle, entered through the actual shared executor. F32 is the
neighboring legacy control; lower-precision decoded samples must distinguish
native arithmetic from a float-first intervention. Publication is checked by
reopening PNG bytes, dimensions, ICC and response correlation. Invalid decode
values/shapes and an existing destination must refuse without false completion
or overwriting unrelated bytes, then allow fresh recovery.

All **11 new cases pass**, including actual tiny native encode/decode around the
controlled conversion samples. The full neighboring run has **700 distinct
PASS / 313 warnings**, zero failures/errors/skips, spanning loader, conditioning,
tokenizers, worker, Euler, LoRA, all six sampling methods, OUT, private regional
and Smart denoising/output/execution. Repeated focused checks are not added to
that count. Ruff check/format and strict BasedPyright pass for the four Python
files. There are no TypeScript or UI changes.

An isolated module intervention reinstates only `.float()`:
**3 GREEN → 2 actual RGB RED +1 F32 control GREEN → 3 restored GREEN**.
The live executor stays byte-exact through the experiment. Both lower-precision
failures occur at complete pixel equality with the independent original-source
oracle, not setup/import failures. F32 bytes remain exact.

The initial test observer used an instance patch whose automatic undo created
an instance method slot that was originally absent. That fixture error masked
the first BF16 result; it is retained and excluded. Correcting only the observer
to class-level delegation preserves the original decode call and restores the
class slot exactly. The 11-case and isolated mutation results above use that
corrected fixture. Three initial typing diagnostics, the observer correction's
typing diagnostics and the final one-cast correction remain separate from
runtime evidence; cast-erased AST confirms the final cast changes no behavior.

Neighboring outpaint tests retain their independently pinned historical Invoke
sources at `9e154096…`; the new quantization oracle pins the current decoder at
`a61ac4fb…`. Four retained external source files provide these per-test oracles;
they are explicitly not presented as one combined Invoke checkout.

The trained probe uses fresh genuine Main base/zero recipes and the same exact
Anima/Qwen/Wan files and existing CUDA BF16 runtime. It retains the original
decoded tensor from the real VAE, compares the resulting original PNG to the
Invoke AST oracle and measures a float-first counterfactual on that **same**
tensor. This isolates quantization from predictions, latent trajectories, VAE
computation and rotary/parser fixes. It is not a whole Invoke pipeline comparison
or a visual-placement assessment. The transparent target is test-owned; this
does not qualify Main target composition or public worker dispatch. Executed
native results:

- Two original trained requests pass in 65.612 seconds: Main base and zero,
  seed 123, 512², 20 Euler steps, CFG 4, CUDA BF16 with the preceding rotary fix.
- Both independently reopened original PNGs match the unchanged Invoke
  conversion **for every RGB byte**, with correct ICC/dimensions/request/seed.
  The same-decoded float-first controls differ in **345,890 / 253,894 channel
  values**, maximum delta 1. These are conversion-only counterfactuals, not
  additional model/VAE requests or a visual improvement measurement.
- Actual observations cover 80 Cosmos predictions, 40 Euler transitions and two
  original VAE decodes. Each following model input and the final VAE input
  matches its independently observed Euler predecessor.
- All 1,192 registered parameters/buffers retain exact values, identities,
  storage, placement and flags. Recorded native metadata/configs, tokenizer
  state, class slots, global CPU/CUDA RNG and target bytes stay exact; private
  model admission and ownership registries recover after each request.
- Host cgroup peak is 9,005,412,352 bytes with zero swap, below the declared
  12 GiB limit. The allocator-fraction guard is not a measured full-VRAM ceiling.

The original decoded BF16 bytes, original/output/control PNGs and complete Main
handoffs are retained. No second full Invoke pipeline or new visual assessment
is implied. The prior trained suite's BF16 expected-pixel expression and the
small regional pixel oracle are updated to native precision; their complete
RGB assertions and all other selectors/conditions remain intact. Historical
trained records are not relabelled as new whole-suite execution.

## Evidence ownership and limits

Run: `runs/anima-rgb-quantization/20261107-native`. ROOT owns bounded native
execution, physical exit and scratch lifecycle. The declared operational
envelope remains 12 GiB host memory, zero swap, 600 seconds/unit and CUDA allocator
fraction 0.75; no general capacity claim follows. Reuse original external weights,
the current repository worker venv and the separately pinned existing Einops
package. No model/environment copies or downloads.

Keep source pins, independent oracle statements, raw decoded samples, original
and counterfactual PNGs, Main handoffs, native counts, refusal/recovery records
and mutation controls together. Static/source review, retained-byte verification
and ROOT execution remain separate evidence levels.

Frozen source/probe R1 review is CLEAN within its declared scope. Its only later
Python delta is a typing cast, with an exact cast-erased AST comparison. ROOT
confirms all six owned bounded units ended, restoration, completed readers and
no incoming lifecycle dependency on the scratch. All 43 scratch entries (25
regular files, 18 directories) remain byte-exact in the verified archive,
including both raw BF16 samples, PNGs, Main DB/packages/handoffs and isolated
module variants. Releasing only this own scratch reclaims **13,479,936 allocated
bytes**. Current compact run is about 3.7 MiB; artifact root stays about 24 GiB.
Original external model files, runtime, source checkouts and parent evidence
remain protected. Final retained/source review does not independently certify
ROOT's execution or physical release.

The scarf-scene **NOT_QUALIFIED** visual result stays historical and unchanged.
Public Anima Regional Guidance, spatial negatives/references, Smart regional
guidance, durable regional candidate publication, whole-pipeline Invoke parity
and visual usefulness remain separate. Accepted provenance/Compare/result-derived
preset exclusions persist. PP-001/005/007/008 remain **«Пока не обещать»**.
