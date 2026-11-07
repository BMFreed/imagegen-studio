# Private Anima positive regional prompting

## Boundary and source

This continuation starts from clean
`master@72f4ad2aa9955a8661a3e5f13dac3e7e7ce29c26`, after the separate
[Illustrious outpaint qualification](./phase-4-regional-guidance-outpaint-research.md).
The next missing consumer is original Anima Base positive regional text. This
slice does not enable public Anima regional admission, queues or Smart Patch.

Current InvokeAI source is clean
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`. Consulted implementation and callers:

- `invokeai/backend/anima/conditioning_data.py`: independent per-stream adapter
  outputs, ordered context ranges and associated image masks.
- `invokeai/backend/anima/regional_prompting.py`: NEAREST mask resizing to the
  actual ceil latent-patch grid, background global support, eligibility above
  one half, regional attention on even blocks and full attention on odd blocks.
- `invokeai/backend/anima/anima_transformer_patch.py`: temporary cross-attention
  adaptation and restoration.
- `invokeai/app/invocations/anima/anima_denoise.py`: conditioning preparation
  before the existing original-Base diffusion loop and separate CFG calls.
- `invokeai/backend/util/mask.py` and
  `invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`:
  binary mask normalization and effective regional-positive selection.

Studio uses pinned Diffusers 0.40.0 `CosmosTransformer3DModel`, not Invoke's
transformer class. Its original `CosmosAttnProcessor2_0` already accepts an
attention mask at `transformer_blocks[i].attn2`. The adaptation delegates all
projection, normalization, native attention and output arithmetic to that
processor. It does not copy Invoke's attention forward or diffusion loop.
The top-level Cosmos mask argument is a token mask and cannot carry the spatial
query/key mask directly.

Invoke's context-length heuristic cannot establish positive/negative ownership.
The existing Studio conditional/unconditional caller supplies the role explicitly;
the temporary processor scope ends before the negative call, even when context
lengths happen to match. The global negative remains one ordinary unmasked stream.
This adapts the existing Invoke mechanism to Studio's separate negative gate.

## Finite ownership and non-goals

Risk is high at the private native-component borrowing and verified output-file
boundaries. Existing publication remains authoritative. No new public command,
dispatch branch, capability, queue operation, migration, persistence schema,
renderer control or accepted-provenance field is added.

The private frontend consumes one complete detached Main recipe and one exact
ordinary Anima txt2img command. Command sampling, seed and output identity are
authoritative. The existing Main compiler produces ordered source/polarity/text
sidecars through `compileAnimaPromptWeighting`; Python validates the compiled
interpretation and association without parsing attention syntax again. Main
provenance and checkpoint-to-prepared-model association remain trusted caller
preconditions, not cryptographic authentication.

An actual saved/reopened ProjectService capture and concrete planner item produce
the Anima-family recipe through the existing recipe owner, without its optional
Illustrious resource collaborator. Literal mask PNGs and authored model metadata
are fixture setup; they do not attest installed Anima weights. A synthetic
transparent target is verified by the existing target owner before encoding.

The selected subset is original Anima Base, TXT and Euler, with no LoRA, TI,
image references, source image or newer semantic connector. Effective regional
negative text must be empty. Local-empty and inherited-empty are permitted;
inherited text/refs must agree with global authoring. A nonempty global negative
is permitted when every regional negative is local-empty. Dormant local metadata
does not become an effective input.

Invoke's graph emits a positive stream only when its raw prompt is nonempty.
Absent and exact-empty positives therefore retain their authored metadata but
emit no context and subtract no global background. Whitespace is not trimmed.
An emitted positive with no sampled eligible coverage refuses before encoding:
Invoke's graph also rejects a region without masked content. It must not become
unlocated global guidance through the unmasked odd blocks. The private
zero-effective-stream control does not grant public empty-region admission.
There is no inverse-mask auto-negative or Anima regional-reference fallback.

## Existing owners and parameter register

`encode_anima_prompt` retains Qwen3/T5 tokenization, native conditioner and weighted
adapter output. `execute_captured_anima_plan` retains the original Euler loop,
CPU-seeded noise, CFG arithmetic, Wan normalization/decode and Anima quantization.
One trusted internal prediction factory prepares additional positive contexts
once after the existing global pair. Ordinary default calls remain unchanged.

The source/alpha sidecars are detached and checked completely before the first
encoder forward. All contexts and nonempty attention rows are checked before
the first Cosmos call. Even-block cross-attention is scoped around the positive
call only; exact original processors are restored on partial setup and failure.
Qualified callers cooperate with reservations and do not mutate borrowed graphs
concurrently. Arbitrary hooks, callbacks and custom native state are not a sandbox
contract and must not be silently discarded.

Pinned Transformers fast tokenization persists backend truncation/padding state.
This private borrowed-model boundary therefore uses owned tokenizer graphs for
preflight and encoding; it must preserve supplied tokenizer state. It reuses the
existing private-copy mechanism, without copying model weights. Native Wan cache
attributes likewise have a bounded presence/reference restoration scope because
the native decoder creates/replaces them. These ownership adaptations do not
change the Invoke mask algorithm, parser, native solver or ordinary call defaults.

| Parameter | Existing or selected boundary |
| --- | --- |
| Regions / positive streams | At most three / four including global |
| Text | 16 KiB per text, 128 KiB aggregate |
| Qwen / T5 | Existing 8192 / 512 token ceilings |
| Original conditioner | 512 output rows per contributing stream |
| Dimensions / area | Existing 64–2048, divisible by eight / at most 4,000,000 pixels |
| Steps / CFG | Existing exact integer 1–200 / finite 1–30 |
| Token geometry | `ceil((height/8)/2) × ceil((width/8)/2)` |
| Expanded permission arithmetic | `batch × heads × queries × keys ≤ 33,554,432` |
| Owned tokenizer backend preflight | At most 32 MiB aggregate serialized native backends; payload guard, not RSS |
| Private native lane | Explicit CPU FP32 or `cuda:0` BF16; no fallback |
| Lower/native test envelope | Serial 3 GiB host, zero swap, 600 seconds per unit |

These are defensive admission and qualification selections, not measured full
Anima capacity. The same installed dependency set is reused; no model or runtime
copy/download belongs to this slice. Pinned versions are Torch 2.7.1,
Torchvision 0.22.1, Diffusers 0.40.0 and Transformers 5.5.4. Small random native
models preserve full tokenizer vocabularies and original latent topology, while
scaling model widths/depths for mechanical tests.

## Executed acceptance

The bounded dependency probe confirms the pinned versions, CUDA and native BF16
on the existing RTX 4080. A separate two-lane original-processor probe succeeds:
CPU FP32 and CUDA BF16 consume a `[1,1,35,1024]` Boolean mask, differ from the
unmasked output and preserve the original processor. An independently calculated
dense-attention reference measures maximum absolute errors of
`7.450580596923828e-8` and `0.0009765625`, respectively. This is preliminary seam
evidence, not qualification of the new frontend or trained-model accuracy.

ROOT qualifies **163 Main PASS**, including 35 new compiler/association cases,
and **461 distinct Python PASS**: 73 new regional cases and 388 existing
conditioning/tokenizer/Euler/six-method/outpaint/LoRA/worker neighbors. Accepted
case identities and source mappings are retained in `qualification-summary.json`;
the mixed initial neighbor run is not represented as an all-green run. The final
61-case outpaint rerun has no skips. Its external oracle deliberately requires
Invoke `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`; exact historical source bytes
are supplied without changing the test or the current regional implementation.
App/prototype TypeScript typecheck, scoped ESLint, Python Ruff check/format and
final strict BasedPyright pass; the latter reports zero errors/warnings.

Whole recipes cross saved/reopened Main capture, actual planner/compiler and
native Qwen3/conditioner/Cosmos, then existing Euler/Wan and exclusive PNG
publication. CPU FP32 and CUDA BF16 random native fixtures use full Qwen/T5
vocabularies, three Cosmos blocks and original latent topology, with reduced
model widths/depths. The principal geometry is 104×72 at world origin (-13,5),
with two Euler steps; genuine 64×64 coverage controls distinguish alpha 127/128
and overlapping support. Odd latent grids distinguish ceil from floor.

Independent oracles check compiled weighted text, stream ranges, exact binary
nearest/ceil permissions at original native processor/SDPA consumption, even/odd
blocks, unmasked negative ownership, predictions, RGB/ICC and response identity.
Zero-effective-region output matches the ordinary path exactly. The equal-length
negative control qualifies the explicit scope/helper with fixed latents; it does
not claim a whole-Main equal-length request, whose positive bank includes the
global and regional contexts. No final pixel locality is promised.

Later-stream refusals precede encoding, including the empty-Qwen fallback's pad
ID. Partial processor installation, later encoding/step, decode, conversion and
publication/link/fsync failures preserve borrowed tensors/storage, mutable
metadata, hooks/method presence, tokenizers, Wan caches, reservations, target
bytes and RNG, then allow a fresh successful call. This is a cooperative native
contract, not isolation from arbitrary callbacks.

An isolated one-line mask-association mutation reverses the native query
permission vector while preserving valid shapes, text, schedule and actual
computation/publication. Both CPU/CUDA target cases fail the independent native
association oracle after publishing PNG; ordinary controls remain GREEN. Across
12 selections the result is **10 GREEN / 2 semantic RED**. Independently reopened
RGB differs by **1,711 CPU / 9,806 CUDA channels**; controls change zero channels.
All 1,529 copied source files and live sources restore exactly; recovered native
records and RGB are exact. Changed later negative predictions follow changed
latents and are not evidence of a masked negative call.

## Diagnoses, source review and bounded execution

Two legitimate pinned native classes, Diffusers `Timesteps` and Transformers
`SiLUActivation`, were initially missing from admission; their pure native
forwards were inspected and narrowly admitted. Independent R1 source review also
found a tokenizer phase-count oracle (two versus actual four calls per stream)
and coverage fixtures outside their authored intersections. Those test fixtures
were corrected without relaxing geometry. R2 found a reachable late empty-Qwen
pad fallback refusal; complete preflight and a regression close it. R3 source
review is CLEAN within the finite contract. ROOT's later negative-fixture change
restores the absence of inherited `forward` through a dictionary-key undo;
ordinary attribute undo left an instance shadow and contaminated five following
tests. Final line wrapping has exact semantic-AST proof.

Native T5 deepcopy's Rust JSON round-trip perturbs some Unigram f64 scores by one
ULP. Only the private copy's native model is reconstructed through the pinned
T5 constructor mechanism from original scores/IDs; strict whole-backend equality
remains required. An independent probe verifies exact backend bytes and five
token/offset controls. The bounded tokenizer graph walker uses iterative DFS;
the initial recursive visitor retained its large identity set until collection.
This correction did not by itself solve whole-suite memory pressure.

Two complete new-suite attempts hit the unchanged 3 GiB envelope at the large
Main mask-budget fixture; neither supplies qualified passes. The same genuine
2048×1920 handoff and unchanged 33,554,432 attention ceiling pass in a fresh unit
when native model setup follows fixture production. That one case and the
remaining 72 run separately: peaks are 1,026,850,816 and 2,481,090,560 bytes,
respectively. No capacity limit was raised. Long-TMPDIR Unix-socket setup,
initial admission/copy refusals, historical-oracle mismatch and missing ER
oracle skips are diagnostic attempts, excluded from accepted counts.

Typing diagnostics progress 134→6→0, then 8→0 after later helpers; final typing
remains zero. Cast/annotation-erased AST proof covers the original typing-only
correction, not the subsequent behavioral fixes. Source review is read-only and
does not independently rerun ROOT's native evidence.

## Retention and remaining boundary

Evidence lives under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-anima-positive/20261107-native/`:
complete source freezes, commands/resources/JUnit, genuine Main packages/SQLite,
tokenizer/native/Invoke pins, original/mutated/restored outputs and independent
observations. The existing repository test runtime is reused; no trained weights,
new environment or ordinary application data are created or changed.
Independent retained-byte/dependency audit is CLEAN: all 5,422 inventory entries,
38 SQLite databases with 23 migration hashes, 38 IGS packages, 76 decoded masks,
36 complete handoffs and 126 independently specified compiled prompts verify.
One truncated OOM handoff stays diagnostic. The twelve mutation PNGs independently
confirm the recorded contrasts and restoration. Audits read retained evidence;
they neither rerun native execution nor authorize deletion.

ROOT separately confirms physical exit of all 34 owned units, exact source
restoration, all-reader completion and zero incoming payload dependencies. Idle
short-TMP residuals are relocated into the candidate tree before archiving; no
live socket or reader remains. Only this run's exact `payloads` tree is released,
reclaiming **442,716,160 allocated bytes** in a deletion-only measurement matching
the inventory. The verified 113,208,488-byte archive, source/native/Invoke pins,
reports and reproduction inputs remain; lifecycle is `retained`, `payloads: []`.
Repository `.venv`, shared model/runtime/catalog, all other runs and ordinary app
data are protected. Historical compact evidence exceeds its soft budget and
remains explicitly pinned; no broad pruning is performed. Final source/document
review is a later read-only boundary, distinct from these historical release gates.

ROOT execution, independent source review, retained-byte verification and cleanup
authority remain separate. No authored test or small random native result proves
trained Anima, visual usefulness, public regional admission, regional negatives,
references, generic SDXL support or release readiness. Regional state stays
excluded from accepted provenance, Compare and result-derived presets.
PP-001/005/007/008 remain **«Пока не обещать»**.
