# Illustrious textual inversion inference

## Scope and revision

Base `774a8fea02aac4eefb0def41344aa9917a3e5914`, clean `master`.
This high-risk Phase 2C slice connects installed exact Illustrious embeddings to
both normal generation modes, frozen batch/Retry, accepted concrete prompt
sidecars and read-only comparison. Sources are PP-004/005/008,
[managed library](../contracts/managed-model-library.md),
[embedding literals](../features/project/generate-mode/embeddings-selector.md),
[provenance](../features/project/generate-mode/generation-provenance.md),
[queue](../features/queue-manager.md) and
[preceding authoring evidence](./phase-2c-embedding-authoring-research.md).
Anima embeddings, alternate textual-inversion layouts, generic SDXL checkpoint
support, raw dynamic-template provenance and release runtime installation remain
outside this slice.

## Confirmed baseline and qualification

Worker 0.9.0 supports the qualified Illustrious txt2img/opaque img2img, ordinary
LoRA, VAE precision and exact external VAE paths. Main and renderer refuse all
embedding inference. The existing accepted v1 schema already permits exact
positive/negative embedding sidecars; its producer currently writes empty refs.
The provenance contract explicitly keeps authored dynamic templates in the live
draft and stores concrete prompts on accepted results. Do not add templates or
invent them for older records.

Invoke snapshot `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` patches both CLIP
encoders and supplies multi-vector expansion to Compel. Its manager's 75-token
truncation conflicts with our existing four-chunk conditioning and will not be
copied. Existing local pinned Diffusers 0.40, Transformers 5.5.4 and Compel 2.4
probes load full-width dual CLIP tensors with the public textual-inversion loader
targeted separately to each encoder/tokenizer. Direct loading of the two-key
dict is unsupported by that loader. AddedToken normalization is case-insensitive;
worker-private aliases must therefore replace only contract-approved literal
ranges. No private aliases enter saved prompts or provenance.

Executed extended CPU probes confirm separate positive/negative identities,
three-vector attention weight propagation, complete 300-content-vector/four-chunk
hidden conditioning and refusal above the existing chunk budget before encoder
forward. CLIP2 pooled output retains the pinned Compel first-chunk semantics;
hidden conditioning retains every qualified chunk. Tiny native txt2img/img2img
execute. These synthetic structure probes do not establish trained-model quality.

## Boundary map and frozen contract

```text
Main-owned Project prompt refs → exact byte/header verification
→ detached verified resource pool + original per-polarity refs
→ each concrete dynamic branch + longest-first effective refs
→ strict worker DTO + atomic durable batch
→ exact Retry/dispatch revalidation → native dual-CLIP loading/conditioning
→ staging → explicit Add → concrete portable refs → Save/reopen/comparison
```

- New context fields: optional `embeddingRefs: {positive, negative}` holds the
  frozen original authored refs; optional `embeddings: {positive, negative}`
  holds effective `{token, byteSize, managedPath, reference}` entries for its
  concrete prompt strings. Both absent is the historical form. New empty pairs
  are explicit known-empty state.
- A transient preparation `embeddingPool` retains verified descriptors for all
  original refs before expansion, including overlapping/inactive literals. It
  is not part of a queued record, IPC or provenance. Concrete jobs derive active
  subsets from this captured pool, never current Project or library Default.
- Worker `job.embeddings` is an optional positive/negative pair of
  `{token, byteSize, path, sha256}` lists. Empty effective pairs need no wire
  field, preserving older qualified plain-text workers. Nonempty input requires
  worker **0.10.0** and **illustrious-embeddings**, plus all retained capabilities.
- Both prompts match literals case-sensitively, with existing word-side boundaries
  and longest-first overlap handling. Conflicting files for the same literal in
  one polarity refuse. Different files for the same literal across polarities
  are valid and receive separate internal aliases.
- Dynamic expansion can create a known canonical token absent from its template
  (`<{clean|other}-style>`). Every concrete job checks unbound tokens before atomic
  enqueue; generation never invents a reference during expansion. Proper literal
  choices in a template retain their copied refs and activate only when selected.
- Accepted existing `positivePrompt`/`negativePrompt` fields contain concrete
  literal strings and effective exact refs only. Full original refs stay in the
  operational frozen context; no new raw-template provenance field is added.
  Copied metadata, exact identity and no-local-path rules remain unchanged.

## Parameters and failure behavior

Qualification accepts safetensors with the paired `clip_l`/`clip_g` floating
embeddings matching widths 768/1280 and equal positive vector counts. Both
rank-one singleton tensors and `[N,width]` matrices are supported; mixed ranks
are equivalent only when their vector counts agree. Main screens
bounded header/layout; Python verifies all tensors and finite values before and
after conversion to the actual encoder dtype. Unsupported key/layout, one-encoder,
pickle and Anima formats refuse explicitly. Source labels and shape do not prove
training lineage. Saved custom literal tokens remain usable; inference does not
require the canonical filename token used for new authoring.

- Existing CLIP content budget: 4 × 75 = **300** vectors per polarity; special
  tokens/padded chunks yield at most **308** encoded positions.
- Per-file count ≤300; paired FP32 tensor payload ≤**2,457,600 bytes**, plus the
  existing bounded safetensors header. Main and worker enforce the profile.
- Sum of distinct active alias vectors ≤300 per polarity before loading tables;
  actual repeated occurrences, ordinary text and sentence chunking are checked
  through pinned Compel token/weight expansion before encoder forward. Exceeding
  the budget fails clearly, without success pixels or silent truncation.
- Existing prompt, IPC, JSONL, output, cancellation and storage ceilings remain;
  these bounds do not promise VRAM capacity or image quality.

Missing/changed bytes, invalid shape, non-finite weights, unsupported capability,
unbound/conflicting literals and over-budget prompts publish no successful output.
Retry reads frozen identity and verifies only effective files, preserving the
selected version and original wire. Failed admission keeps prior staging,
Project/Undo/seed and saved `.igs`. Acceptance still requires explicit Add and Save.

## Verification plan

Execute real ModelService filesystem/SQLite qualification, strict context/wire
agreement, per-branch selection, queue/staging/Retry/dispatch and accepted
writer/loader/comparison tests. Cover case variants, custom literals, overlaps,
same-token cross-polarity files, corrupt/missing/tampered data, long/repeated
multi-vector prompts and older-worker plain-text neighbors.

Use actual pinned public loaders, CLIP/Compel and both native normal pipelines on
CPU and local Linux/NVIDIA where available. Separate synthetic full-width weights,
trained checkpoint bytes and controlled JSONL Electron evidence. Verify cleanup
and ordinary LoRA/external-VAE neighbors. Execute isolated semantic mutations and
restored green baselines; run required typecheck, lint, app/Python checks, fresh
native smoke and actual screenshot inspection. Prototype components are unchanged.

## Execution evidence and remaining gaps

Implementation is complete for this bounded Illustrious slice. Research artifacts
are retained locally under
`/home/user/.codex/artifacts/imagegen-studio/embedding-inference-2026-10-04/`.
The preceding read-only token-source question was resolved by authoring; trained
embedding quality and broad file/profile compatibility remain separate limits.

- Final app regression: **1083/1083**, no skips. Typecheck covers prototype and
  app; repository ESLint and scoped formatting pass. No prototype components changed.
- Resource/helper boundary: **208/208** focused tests; **19/19** isolated semantic
  mutations detected, restored baseline **58/58**. Main uses actual SQLite/files;
  custom longer tokens beat nested canonical tokens, uncovered neighbors still refuse.
- Job/queue/staging/provenance/acceptance/comparison: **146/146** focused tests;
  **16/16** semantic mutations detected, restored **146/146**. Removing only one
  redundant admission check survived because durable parsing still enforced it;
  disabling both defenses caused the expected assertion failure. No false gap
  or syntax/import failure was counted as a killed mutation.
- Controller/batch/dispatch/capability: **71/71** baseline/restored and **5/5**
  isolated mutations detected. Per-concrete unbound refusal, polarity subsets,
  old-worker early admission and changed-file dispatch all have causal assertions.
- Fresh Electron build and **all seven native suites passed**. Generation actions
  check **36** checkpoints, **54** screenshots and no page errors. The new `.10`
  path exercises typed authoring, exact dynamic +/− files, Cancel/Retry, Add,
  Save/reopen and read-only comparison. The separate `.9` suite still proves
  explicit old-engine refusal. Controlled runtime/pixels do not prove CUDA inference.
- Actual comparison screenshots at **1380×900 and 900×620** were opened and
  inspected through local ui-audit: labels/hash wrapping, modal bounds, scroll and
  footer remain readable. This is a scoped check, not a full accessibility audit.

Review aligned previously divergent overlap behavior in Main and Python, including
UTF-16 literal-length ties for supplementary Unicode characters. Cross-branch
consistent active path/size descriptors now reject coordinated context/wire tamper.
Async test teardown waits real autosave completion; early ENOTEMPTY cleanup and
an Images-per-click fixture default mismatch were harness faults, not product
failures. These fixes preserve the behavioral assertions.

Python full suite passes **394/394**; strict typecheck and Ruff pass. **11/11**
isolated Python semantic mutations detect wire loss, snapshot hash/reopen, truncation,
expanded preflight, finite guards, overlap/UTF-16 drift and polarity alias reuse.
Across TS and Python, **51/51** intentional semantic mutations are assertion-killed
and restored baselines pass. Python native/full/GPU evidence is in `research/`
beneath the artifact root. Ten actual RTX 4080 JSONL cases execute txt2img and
opaque img2img with a trained Illustrious checkpoint and synthetic dual-CLIP files:
plain/exact/altered/weight/polarity/300-vector and LoRA+external-VAE neighbors.
Both native encoder tables preserve every row; causal pixel controls differ.
Production GC releases job objects/tables. The plain worker retains a measured
8,519,680-byte CUDA overhead and allocator cache; this is not zero-total-VRAM
or caching/performance evidence. The initial cleanup probe measured before the Python
worker-loop GC and was corrected without changing production cleanup behavior. It separates exact trained Illustrious checkpoint denoising
from synthetic dual-CLIP embedding tensors. No trained CivitAI embedding was
installed for a quality/compatibility claim. Per-file dtype/format and expanded
chunk-budget errors remain explicit; ordinary LoRA and external VAE neighbors
retain their own qualification. Release runtime/wheelhouse, model cache/performance,
Anima, masks/regions/outpaint, other advanced options, Smart Patch and Presets are
not completed by this slice. Phase 2C and public promises remain incomplete.
