# Exact embedding authoring

## Scope and revision

Base `34d4f8113ffa45d095fbb551aa199ad38a6efb60`, clean `master`.
This high-risk Phase 2C prerequisite connects installed Illustrious embeddings
to the existing plain-text Project editors. Sources are PP-004/007/008,
[managed resources](../contracts/managed-model-library.md),
[embedding semantics](../features/project/generate-mode/embeddings-selector.md),
[autocomplete](../features/project/generate-mode/tag-autocomplete.md) and
[Project prompt history](../features/project/generate-mode/prompt-editor.md).
It does not load embedding weights, qualify Anima textual inversion, change
accepted provenance or claim the full generation pipeline is complete.

## Confirmed baseline and policy

Model Manager already installs Illustrious-labeled TextualInversion safetensors
with exact file verification and SQLite metadata. Project prompt edits currently
retain/prune saved sidecars only. Both normal preparation modes explicitly
refuse embedding refs; these guards remain until a qualified worker checkpoint.
The editor currently offers LoRA triggers only. Prototype resource identities
and polarity aliases are mocks, not production metadata.

Confirmed Invoke snapshot `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` inserts
`<model.name>` in either prompt; its default single-file model name is the
original file stem. CivitAI trainedWords do not define positive/negative aliases.
New production tokens therefore use `<original safetensors filename stem>` in
both polarities; trainedWords remain source/search metadata. This is an
app-defined literal, not a claim that CivitAI supplied the activation token.
Copied existing ref tokens remain unchanged. Filename collisions across exact
installed versions require explicit selection; mutable Default and display
names never substitute an existing identity.

## Boundary map and invariants

```text
Catalog → shared literal projection → CodeMirror text/effect + ID-only choice
→ typed IPC → main verified reconciliation → Project history/shadow
→ explicit Save/reopen → saved identity + missing/ambiguous diagnostics
```

- Ordinary text and selection stay native CodeMirror behavior, with no chips
  or persisted offsets. A completion changes only its search fragment.
- Existing literal refs survive file loss, rename and competing candidates.
  Removing all literal occurrences prunes the sidecar. Unique exact canonical
  manual input links the verified resource; ambiguous input remains unbound.
- Only main creates trusted refs. Renderer supplies text and optional exact
  resource/version IDs plus the chosen literal, never metadata or paths.
  New refs require verified managed bytes. Explicit portable relink changes
  only local IDs after exact source/hash/family checks.
- Main captures document revision and monotonic epoch across asynchronous
  verification. Later edits, edit/Undo ABA and close cannot accept stale data.
  Failure leaves the previous durable document intact and has visible feedback.
- Prompt edits retain the existing focus-to-blur history group. Undo/Redo,
  shadow recovery and `.igs` Save/reopen preserve text and refs together.
- Missing, unbound ambiguity and family mismatch have visible diagnostics.
  A ready installed resource is not proof of ML qualification. Generate with
  embedding refs retains its explicit unsupported explanation.

## Alternatives and verification plan

Do not infer a negative alias from trainedWords, use a mutable display name,
trust renderer reference metadata or silently select a Default among collisions.
Reuse shared pure literal/ranking rules and public CodeMirror completion/effect
APIs, preserving the approved layout and theme.

Verify actual ModelService filesystem/SQLite, ProjectService/history/shadow and
writer/loader boundaries; exercise real CodeMirror transactions and native
Electron UI/IPC with temporary managed fixtures. Fixtures qualify authoring,
not dual-CLIP ML compatibility or live CivitAI installation. Execute isolated
semantic mutations for resource identity, pruning/ambiguity, epoch and persistence
guards, restore green baselines, run typecheck/lint/app checks, and inspect popup,
warning and compact viewport screenshots. Prototype components are unchanged.

## Execution evidence and remaining gaps

The production Project editors now offer installed embeddings through the real
CodeMirror completion source, with literal decorations and metadata hover. A
completion carries only registry IDs and the literal through typed IPC. Main
reconciles against verified managed files; text and sidecars enter history,
shadow and explicit Save together. Diagnostics offer Model Manager navigation
or explicit portable relink. Anima exposes no new embedding choices. Both Main
Generate entry paths refuse saved refs and known unbound tokens before worker
composition or queue publication; successful ordinary text remains a neighboring
control.

Executed against the final working tree based on the revision above:

- `pnpm run app:test`: **1023 passed, 0 failed/skipped**.
- `pnpm run typecheck` and `pnpm run lint`: passed.
- `pnpm run app:smoke`: fresh build and **all seven native Electron suites
  passed** (desktop, results, actions, accepted history, comparison, VAE,
  embeddings). The new embedding suite checks **10 checkpoints**, **7 screenshot
  geometries**, **0 page errors** at 1380×900 and 900×620. Popup, warning,
  portable-link and exact Model Manager selection screenshots were inspected.
- Resource boundary regression: **155 passed**; exact authoring mutations:
  **13/13 assertion-killed**, green baseline/restored **15/15**.
- Project/history/Save and IPC regression: **141 passed**; exact authoring,
  relink, draft sync and epoch mutations: **20/20 assertion-killed**, green
  baseline/restored **26/26**.
- Shared literal/diagnostic and real CodeMirror regression: **11 passed**;
  actual Generate-controller admission controls: **2 passed**. Their **12/12**
  semantic mutations failed on assertions and restored green. These scopes
  overlap the aggregate test suite and must not be summed as independent tests.

Self-review reproduced and fixed three boundary defects: an unsupported unbound
token suggested unavailable autocomplete choices; overlapping literals favored
an earlier shorter decoration; and a healthy installed version could be
auto-selected after its same-token sibling went missing or corrupt. All installed
applicable owners now participate in ambiguity. Decoration projection uses
longest-first ranges while diagnostics keep every warning, so overlap cannot
hide a missing saved ref. Self-review is not an independent blind audit.

Evidence, source hashes, isolated mutation logs and screenshots live locally at
`/home/user/.codex/artifacts/imagegen-studio/embedding-authoring-2026-10-04/`:
`root-app-test.log`, `root-typecheck-final.log`, `root-lint-final.log`,
`resources/resource-report.json`, `project/delivery-evidence.json`,
`root-mutations/mutation-report.json`, `root-mutation-seal.json`,
`aggregate-delivery/native-aggregate.log` and
`aggregate-delivery/embeddings/native-report.json`.
Native UI evidence uses temporary SQLite/managed-file fixtures and a controlled
qualified peer, not live model generation. Early aggregate attempts retained
two harness failures: the prior help-copy expectation excluded embeddings, and
Tab-to-commit focused Browse, whose intentional focus tooltip covered the hover
target. Updated the copy assertion and refocused the actual editor before
hovering a rendered text segment; exact resource-tooltip assertions remain.
Failure cleanup is bounded to the owned temporary Electron process. Final
aggregate passed without forced cleanup.

Embedding weights/inference, full Anima pipeline, other raster modes, Smart Patch,
Presets and release runtime remain outside this authoring checkpoint. Finite
dual-CLIP authoring fixtures do not prove trained-model compatibility or image
quality. Worker capability/version and accepted provenance are unchanged.
Phase 2C and public promises remain incomplete.
