# Prompt weighting for Anima

## Decision and current boundary

Prompt weighting is required in the first Anima pipeline in
[Phase 2C](../../../specs/01-implementation-roadmap.md#фаза-2c-полный-первый-generation-slice),
for both positive and global negative prompts. Regional text reuses the same
compiler in Phase 4; Anima regional negative text retains its separate
spatial-semantics gate.

Historical check on 02.10.2026 at ImageGen Studio `8f7d501`: checkpoint/Qwen3/VAE
installation exists, but Anima inference does not. Main rejects that family in
`src/main/projects/project-generation-preparation.ts`; the worker advertises
only `illustrious-txt2img` and its generation route is
`generate-illustrious-txt2img`. Editor attention actions change authored text;
they do not prove model-side weighting. Current Python Compel normalization
and dual-CLIP conditioning belong to Illustrious only.

The [05.10.2026 conditioning foundation](../../../engineering/phase-2c-anima-conditioning-research.md)
now implements the typed TS compiler, strict Python compiled-input validation,
bundled offline tokenizers and actual native Qwen3/AnimaTextConditioner path for
both signs. Native tests and a separate trained-weight CPU probe verify weights
once after adapter projection/norm. The subsequent
[Euler execution foundation](../../../engineering/phase-2c-anima-euler-research.md)
verifies weighted native denoising through trained NVIDIA pixels for both signs,
including plain/weight-one equality and fixed-seed replay at 256×256.
The subsequent ordinary LoRA, six-method sampling and
[worker 0.11](../../../engineering/phase-2c-anima-worker-entrypoint-research.md)
checkpoints connect weighted txt2img/opaque img2img through the actual native
worker. Public Generate remains unavailable: authoring is covered by the
checkpoint below, while Main admission, frozen queue/Retry/provenance and release
qualification remain open.

[Main preparation](../../../engineering/phase-2c-anima-main-preparation-research.md)
now applies the existing bounded dynamic planner before compiling both concrete
signs and the native plan for each item. Source text stays authored text in the
captured Project snapshot; the compiled interpretations are transient request
inputs. A later invalid planned branch or oversized complete worker command
refuses the whole batch before the consumer runs. This does not persist Anima
queue/Retry or accepted provenance, or enable Project Generate.

Reference: [InvokeAI PR #9506](https://github.com/invoke-ai/InvokeAI/pull/9506),
checked open/unmerged at head
[`2c38ae6405d0214718b9eadde5b58aab43b6441b`](https://github.com/invoke-ai/InvokeAI/commit/2c38ae6405d0214718b9eadde5b58aab43b6441b).
It cleans text before Qwen3 encoding, tokenizes the complete cleaned prompt once
with the bundled T5 tokenizer, maps character weights through token offsets
and supplies `t5xxl_weights`. The checked local InvokeAI reference
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` already carries that tensor through
normal/regional denoising and the LLM Adapter, but its encoder returns `None`.
Our implementation is required regardless of upstream merge. Anima needs T5
token IDs, not an additional T5-XXL encoder-model download.

## Authored syntax

Keep authored text as the Project/preset source of truth. Compilation must not
rewrite it in the editor or replace concrete weighted prompts in provenance.
Compile dynamic prompts after expansion and freeze their concrete interpretation.

| Authored text   | Cleaned text | Weight                        |
| --------------- | ------------ | ----------------------------- |
| `long hair`     | `long hair`  | `1`                           |
| `(long hair)`   | `long hair`  | `1.1`                         |
| `(long hair:2)` | `long hair`  | `2`                           |
| `((long hair))` | `long hair`  | `1.1²`                        |
| `(long hair:1)` | `long hair`  | `1`, equivalent to plain text |
| `\(literal\)`   | `(literal)`  | `1`, literal parentheses      |

Nested implicit and explicit groups multiply inherited weights. For example,
both `((long hair:2))` and `((long hair):2)` give `2.2`. The checked PR head
resets inherited weight for an inner explicit group; this is a reference edge
case to correct, not behavior to copy without a test.

The current shared editor also emits Compel forms: `word+`, `(two words)+`,
`word--` and `(word)1.1`. PR #9506 alone does not interpret these suffixes;
it can leave the marker/number in Qwen3/T5 text and turn a grouped decrease into
an implicit increase. Support these editor-produced forms, including previously
saved prompts, with the same attention semantics as the supported
Illustrious/Compel path. Helper parentheses for a multiword suffix target are
grouping only: `(two words)+` must not acquire a second implicit multiplier.
Verify suffix compatibility against the pinned real Compel parser, not UI
labels. Neutral up/down round-trips must restore neutral conditioning.

Literals and escapes remain literal. Authoring diagnostics stay advisory.
Family compilation rejects unsupported/ambiguous conditioning before enqueue
with a clear error; it must not silently discard weights or invent a different
prompt. The compiler uses the existing **16 KiB UTF-8 limit per concrete
generation prompt** (`generation-batch-plan.ts`, `generation-queue.ts`), not the
separate **1 MiB authored-text limit** in `.igs` `PromptTextSchema`. Establish
bounded nesting and finite-weight validation within that generation limit when
implementing the executable contract. Do not invent an unmeasured model-specific
weight range here.

The current compiler enforces a provisional 128-level nesting bound, finite
weights and nonzero numeric-underflow refusal. Python also refuses weights that
overflow or become zero in the native model dtype. Its versioned interpretation
is `anima-prompt-weighting-v1`; spans are contiguous and coalesced over the
cleaned text's code points. This is an internal preparation contract, not yet
a durable job or worker command.

**Family-aware editor handoff before Generate:** the
[Anima authoring checkpoint](../../../engineering/phase-2c-anima-authoring-research.md)
addresses the old Compel-only helper: Increase on `(long hair)` formerly yielded
`(long hair)+`, leaving the same `1.1` weight, while adjusting `(word:2)` created
a conflicting suffix. For Anima, actions now change the existing outer operator,
preserve nested markup, escapes and authored numeric precision, and read the
current model family for both buttons and keyboard. Implicit groups start at one
positive level; explicit scalars move by `0.1`. Ambiguous or malformed targets
stay unchanged with advisory diagnostics. Illustrious/null/unknown retain their
existing behavior. Authoring tests use actual compilation after real dynamic
expansion; editing itself does not apply the smaller generation-text limit.
This handoff does not qualify public generation admission or frozen provenance.

## Owners and inference path

Deterministic syntax/attention compilation belongs to typed TS business logic,
not a renderer-only helper or a second independent Python grammar:

```text
concrete frozen prompt → TS compiler → cleaned text + weighted spans
→ Python Qwen3 encoding + one complete T5 tokenization
→ token weights → Anima conditioning / LLM Adapter → denoising
```

- Main validates family syntax before enqueue. Frozen requests retain compiled
  input under versioned inference semantics; Retry never reparses current editor
  state or silently switches parser defaults. Concrete weighted text stays in
  reproducible generation configuration. Operational spans do not replace it
  or introduce Regional Guidance into accepted provenance.
- Span offsets use Unicode code points of the cleaned text, independently of
  JS UTF-16 indexing. TS/Python guards check ordered bounds, finite weights,
  complete text coverage and no inconsistent overlap. Non-BMP/emoji fixtures
  must prove cross-language alignment.
- Python owns tokenizer calls, tensors and conditioning. Qwen3 receives cleaned
  text without attention markup. Tokenize the entire same cleaned text once for
  T5 with `offset_mapping` and the special-token mask. Do not tokenize weighted
  fragments separately: SentencePiece boundaries and IDs can change.
- Derive token weights from overlap-length-weighted character spans, as in the
  reference. Special/EOS and zero-length-offset tokens have neutral weight `1`;
  truncation keeps IDs and weights aligned. Carry correctly shaped/device/dtype
  tensors through the LLM Adapter and both prompt signs into denoising.

## Required executed verification

Before marking the capability ready:

1. Exercise the actual TS compiler: implicit/explicit/mixed nesting, escapes,
   empty text, Unicode and invalid inputs. Feed actual shared editor action
   output through it, including decreases, saved suffix syntax and neutral
   round-trips.
2. Use the pinned real bundled T5 tokenizer. Plain text and equivalent weight
   `1` have identical cleaned Qwen3 input, T5 IDs and all-one weights.
   Non-neutral attention preserves those IDs and changes the correct token
   weights. Cover subwords, whitespace, multi-span overlap, EOS and truncation;
   fake token IDs alone cannot prove this.
3. Test the actual worker conditioning/LLM Adapter consumer for positive and
   negative input, and regional paths when introduced. Verify weights reach
   denoising and TS code-point offsets match Python tokenizer offsets.
4. Run isolated semantic mutations: drop weights, encode markup in Qwen3,
   tokenize fragments separately or ignore editor suffixes. Each applicable
   mutation must fail a real boundary assertion and restore green afterward.
5. Run real Anima generation on Linux/NVIDIA with fixed exact model/components,
   seed and settings. Plain text and equivalent weight `1` agree at conditioning
   and deterministic output; non-neutral attention changes the intended
   conditioning/output. A reference PR's QA report is not our inference evidence.

The historical 02.10.2026 checkpoint changed documentation only. Direct probes of the actual shared
editor helper and the referenced PR parser confirmed suffix/nesting behavior;
these were not tokenizer, conditioning or GPU tests. Results and the fetched
PR source/status are retained in
`/home/user/.codex/artifacts/imagegen-studio/anima-prompt-weighting-2026-10-02/`.
No ImageGen Studio Anima inference tests were executed at that checkpoint.
The subsequent conditioning research note records executed compiler/native
tests, isolated mutations, bundled-wheel verification and trained CPU evidence.
The separate Euler foundation adds bounded real GPU output evidence; full
Anima admission and public promise readiness remain open.
