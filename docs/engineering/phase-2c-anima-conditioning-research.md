# Anima compiled prompt weighting and conditioning foundation

Base: clean `174ec1bde4cc7c2f208339f5bfca0e35c347cfaa`, 05.10.2026.
This Phase 2C slice implements the deterministic weighting/conditioning boundary
required by PP-004/005/008 and [Anima prompt weighting](../features/project/generate-mode/prompt-weighting.md).
The preceding [offline loader](./phase-2c-anima-qualification-research.md) is
qualified; Anima Generate, denoising, queue/Retry, provenance and release runtime
are not. No public capability or new worker command is enabled in this slice.

## Confirmed data flow and owners

```text
concrete authored weighted prompt
 -> typed TS compiler, versioned cleaned text and Unicode-code-point spans
 -> Python strict compiled-input validation, no second attention grammar
 -> bundled pinned local Qwen3 and complete T5 tokenization
 -> last Qwen3 hidden state and aligned T5 IDs/weights
 -> actual native AnimaTextConditioner/LLM Adapter
 -> weights applied once to post-adapter rows, neutral zero-padded tail
 -> conditioning returned for a subsequent qualified denoising slice
```

Authored text remains Project/preset/provenance truth. The operational compiled
interpretation is separate and not yet a `.igs`, durable queue or IPC field.
Both positive and global negative prompts use the same compiler/consumer.
Regional paths reuse it only when their separate Phase 4 gates are implemented.

Current InvokeAI source `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`
`anima_text_encoder.py` uses direct Base Qwen3 input, no chat template, final
hidden state, an empty-input synthetic pad token and bundled T5 IDs. The original
transformer applies `t5xxl_weights` after adapter projection/norm and before
padding to 512. Native Diffusers 0.40 AnimaTextConditioner already pads its
post-adapter output; our wrapper applies aligned weights once and leaves that
zero tail intact. No independent Python attention parser or Invoke class port
is needed. Original Base companion identity remains unchanged.

Actual Transformers 5.5.4 tokenizer probes show T5 offsets count Unicode code
points, including non-BMP emoji. Normalization can skip characters; SentencePiece
offsets can overlap. Validate each range, not disjointness or total token-offset
coverage. Tokenizing `embedding` whole differs from separately tokenizing `emb`
and `edding`, so fragment tokenization cannot preserve the intended token IDs.

## Parameters, invariants and refusal

- Input: the existing 16 KiB UTF-8 concrete prompt ceiling, not the 1 MiB authored
  document ceiling. Unpaired JS surrogates are refused before cross-language
  UTF-8 serialization. Compiled text obeys the same ceiling.
- Grammar: implicit/explicit parentheses and nested inherited multiplication,
  literal escapes and actual editor Compel suffixes. Ambiguous unsupported
  operators fail explicitly; actual pinned Compel probes establish suffix
  semantics. No invented model weight range; finite signed explicit weights and
  zero are valid. Overflow or unrepresentable nonzero tensor weights fail.
- Nesting: provisional 128-level syntax-work bound within 16 KiB; it is an
  implementation bound, not measured model capacity. Exceeding it refuses.
- Version: `anima-prompt-weighting-v1`; `cleanedText` and contiguous ordered
  `{start,end,weight}` spans cover every code point. Empty text has no spans.
  Python validates complete canonical coverage and finite weights.
- Qwen3 token ceiling 8192 and T5 ceiling 512 follow the checked Invoke source.
  Tokenization is one complete call per tokenizer; truncation keeps IDs, masks,
  offsets and weights aligned and is observable in returned metadata. These
  bounds do not establish VRAM capacity. Empty Qwen3 uses pad ID with attention 1;
  T5 retains EOS. Special/EOS and zero-offset tokens have neutral weight 1.
- Character spans map to ordinary T5 token weights by overlap-length-weighted
  average. Special IDs and masks are preserved. Changing weight must not change
  cleaned text, Qwen3 IDs/hidden input or T5 IDs.
- Tokenizer assets are exact bundled local snapshots with hashes, sizes,
  bounded decompression and upstream license/notice. No Hub/cache discovery,
  downloads during encoding or remote code. Native package versions are pinned.
- Model/device/dtype mismatch, malformed compiled data/token offsets, changed
  assets, non-finite hidden/adapter/weighted tensors or cast overflow/underflow
  fail explicitly. No successful conditioning silently drops weights.

This medium/high consequence inference-semantic boundary affects only new
preparation helpers; existing generation state/storage/Save/cancellation paths
are not changed. Failure creates no queue/candidate and modifies no Project,
seed, recovery record or source weights. Repair/reinstall of a damaged future
runtime is the recovery path for invalid bundled assets; invalid syntax asks
for corrected concrete text. User-facing admission remains subsequent work.

## Verification plan

Exercise the actual shared compiler, including actual editor-action output,
neutral round trips, implicit/explicit nesting, suffixes, escapes, Unicode,
invalid syntax, 16 KiB and nesting bounds. Feed its JSON into actual Python
validation and pinned bundled tokenizers to prove the code-point boundary.
Compare weight-1 equivalence and non-neutral changes through actual native
Qwen3/Anima conditioner and a small native transformer consumer, for both signs.
Separate synthetic small native models from a trained-weight CPU probe and from
unimplemented Linux/NVIDIA generation. Execute semantic mutations for dropped
weights, raw/incorrect Qwen input, fragment T5 tokenization, Unicode offsets,
suffix semantics, exact tokenizer snapshots and version/coverage validation.
Run restored greens and final app/Python/type/lint/build checks. No UI/prototype
component changes are planned. Record actual results and remaining gaps below.

## Executed evidence and review

Checked against the implementation working tree based on `174ec1b`; all changes
are new internal helpers/assets/tests and documentation. Root performed
self-review of the tokenizer/conditioning boundaries. A collaborating agent
reviewed conditioning and ran isolated mutations; this was not a blind product
audit. Authored prompts, current capabilities, queue/Retry, storage, seed,
Project Save and `.igs` are unchanged.

Evidence directory:
`/home/user/.codex/artifacts/imagegen-studio/anima-conditioning-2026-10-05/`.

| Boundary                            | Executed evidence                                                                                                                                                | Practical limit                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Actual TS compiler                  | 14/14 tests; 31/31 with real editor/batch neighbors; 13/13 semantic mutants killed, restored 14/14                                                               | Internal helper, no Generate admission                          |
| Exact bundled tokenizers            | 37/37 native tests; six semantic mutants killed; socket-denied installed-wheel probe loads all eight resources                                                   | Direct Base input path only, no chat/config equivalence claim   |
| Compiled Python/native conditioning | 35/35 tests; actual TS-to-Python Unicode fixture, native full-vocabulary Qwen3/conditioner with scaled widths/layers, native small Cosmos forward for both signs | Synthetic native models, no trained output-quality claim        |
| Conditioning mutations              | 11/11 killed; all 35 tests execute without skips/collection errors in every baseline/mutant/restored run                                                         | Plausible checked faults, not exhaustive proof                  |
| Real trained weights                | Actual TS compiler, verified existing full loader, BF16 CPU Qwen3/adapter; neutral equality and non-neutral exactly-once output verified for both signs          | No denoising, generated image or NVIDIA result                  |
| App regression                      | `pnpm run app:test`: 1144/1144, zero skips; full typecheck and lint passed                                                                                       | Existing UI flows, new helper not wired into them               |
| Worker default environment          | `uv run pytest -q`: 318 passed, 206 explicitly skipped                                                                                                           | Pillow/dev environment lacks optional ML packages               |
| Worker native environment           | Full suite: 524/524, zero skips; Ruff format/check and BasedPyright passed                                                                                       | CPU development environment, no release installer qualification |

Fresh `pnpm run app:smoke` completed successfully: build and all seven existing
Electron smoke suites, including real IPC/storage flows with controlled
inference peers. This is retained-flow regression, not Anima UI/GPU evidence.
Affected files also pass Prettier and `git diff --check`.

The compiler initially had no entrypoint; the resulting loader error is not a
behavioral RED. Actual behavioral compiler REDs caught an unsupported `.swap`
operator hidden behind long whitespace and a nonzero explicit weight underflow
to zero. Conditioning's first setup was blocked by the absent tokenizer helper
(zero executed assertions). Its subsequent actual native RED executed two tests
that caught unused weights; both became green after the post-adapter multiply.
A later real Qwen forward hook changed the caller's negative input while the
positive sign ran: one RED demonstrated rereading mutable input. Capturing both
validated interpretations before either native call fixed the same assertion.

Semantic faults include dropping/doubling weights, raw markup in Qwen input,
actual fragment T5 tokenization, neutral special-ID policy, Unicode UTF-16
offsets, nested/suffix semantics, version/coverage validation, ignored later
spans, archive/decompressed hashes, exact asset set, bounded gzip, local-only
loading, no-follow symlink replacement and numeric overflow/underflow guards.
The precision tests observe actual Qwen/adapter pre-hooks: invalid casts invoke
neither model, while valid zero invokes both. Removing the overflow guard fails
that native-call assertion, rather than merely an error-message check. Reports
are `compiler/mutations.json`, `tokenizer-reference/mutations/report.json` and
`conditioning/semantic-mutations.json`; restored baselines are green.

The tokenizer wheel probe uses a separate `python -I` process and rejects
`socket.connect`. Original Apache-2.0 license and source/modification notice are
bundled and hash checked. Qwen3-0.6B-Base's official tokenizer revision
`da87bfb608c14b7cf20ba1ce41287e8de496c0cd` has the same base BPE vocabulary and
merges as the bundled Invoke Qwen snapshot. Twelve native input cases agree on
IDs/offsets/masks. Their EOS/chat configuration differs: this implementation
uses direct text without a chat template or added Qwen EOS/BOS, and the common
empty-input pad. See `tokenizer-reference/base-invoke-comparison.json` and
`tokenizer-reference/wheel/wheel-probe.json`.

The trained probe loads the existing checkpoint
`cyberfalafelFalafel_cyberfalafelAnimaV10.safetensors` (SHA prefix `0fc7507b`),
its pinned Qwen3 companion (`cd2a5120`) and VAE (`a70580f0`) through the previous
exact native loader. File sizes/timestamps remain unchanged and network
connection attempts are zero. Positive `(long hair:2)` and negative
`(soft blur)--` preserve IDs/Qwen hidden state and change adapter output exactly
once; explicit weight 1 is bit-identical to plain text. Both outputs are finite
`[1,512,1024]` with a zero-padded tail. Loading took 20.78 seconds, six prompt
encodes 0.40 seconds, peak RSS 9,005,264 KiB in this one CPU probe; these are
observations, not a performance/VRAM promise. Full identities and checks live
in `real-trained/report.json` and its probe source/log.

Native tests use CPython 3.12.13, Torch 2.7.1+cu128, Diffusers 0.40.0,
Transformers 5.5.4, tokenizers 0.22.2 and torchvision 0.22.1+cu128 with CUDA
disabled. The complete regression uses the preceding isolated PEFT 0.21.2 test
environment; no installed Invoke packages or source weights were modified.
The Cosmos consumer's resize path requires torchvision. That package is not
yet a worker runtime pin; qualify it during denoising/release implementation.
Default tests explicitly skip unavailable ML boundaries; native runs execute
them. The eight-file asset set is defined by the immutable manifest, grammar
support by explicit parser branches/refusal tests, and compiled interpretation
by exact version/fields/coverage. Counts alone do not establish full pipeline
or arbitrary-CivitAI compatibility.

## Remaining handoff and release gates

Actual shared editor probes found a mandatory Anima handoff gap:
`(long hair)` Increase becomes `(long hair)+`, leaving both at 1.1; colon-explicit
`(word:2)` plus/minus gains conflicting operators and correctly refuses. Nested
implicit groups have the same problem. Implement family-aware attention
adjustment and existing-group neutral round-trip tests before enabling Generate;
eight actual cases are retained in `compiler/editor-existing-group-probe.json`.
This is a future integration defect, not an unresolved product choice.

Next implement qualified Anima denoising and LoRA, then versioned compiled
inputs in frozen Main admission/queue/Retry and immutable accepted settings.
The complete chain must pass trained Linux/NVIDIA neutral/non-neutral output,
Cancel/recovery and release-runtime gates. Regional semantics retain their
separate Phase 4 gate. No existing readiness or promise status is raised by
this foundation.
