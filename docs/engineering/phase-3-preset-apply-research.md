# Production Project preset Apply

Base: `master`, `7be455e`. Contract: [Presets](../features/presets.md#apply-preview),
PP-006 and PP-003. Risk: medium for detached UI/editor state; high for the new
Main document mutation and exact-resource verification across asynchronous work.

## Prospective boundary and invariants

Project chooser reads the active Preset API catalog. A selected saved definition
is copied into the Project-scoped Apply modal. The shared payload editor edits
that temporary copy; cancellation and reset never write the preset repository.
Size and Seed initially remain deselected. Only selected source sections are
validated, including nested prompt embedding and LoRA references.

Renderer flushes pending Project edits before the new typed Apply IPC. Main
captures document identity, epoch and revision, verifies selected resource files,
then commits the selected values through one `applyDocument` operation. A late
response after another document edit or tab close must fail without an edit.
Unselected settings, bbox position, dynamic prompt settings, seed cursor, layers,
accepted-result provenance and saved preset definitions must remain unchanged.
Sampling copies supplied members only. Empty selected LoRAs clears the stack;
deselected LoRAs preserves it. Model prediction/noise policy stays library-owned.

The source must still be active when applying. No live preset identity or link is
stored in the Project. Resource diagnostics use the effective selected model,
or the current Project model when its section is deselected. Main repeats checks;
renderer availability alone is not proof of verified bytes.

## Verification plan

- Pure mapper/diagnostics tests: section mask, supplied sampling members, zero,
  empty values, exact identities, nested references and effective family.
- Real ProjectService/SQLite/package tests: one Undo/Redo, explicit Save,
  failed resource verification, asynchronous conflict and neighboring Project.
- Actual built Electron UI: choose/edit/cancel/apply, missing-section deselection,
  reset, guarded original edit, active/deleted filtering, screenshots and resize.
- Execute a semantic mutation at the Main mutation boundary, retain causal RED
  and neighboring GREEN, restore exact bytes and rerun healthy checks.
- Mandatory typecheck, lint, fresh build and scoped formatting. Root serializes
  bounded runs; no Python runtime, model download or GPU work is required.

## Remaining scope

Smart Patch target routing awaits its production layer. New Project preset
customization, Save Current/result-to-preset and resource handoff to Models are
separate roadmap slices. This checkpoint does not complete PP-006 or Phase 3.

## Implemented boundary

`ProjectPresetCard` reads active definitions through the existing Preset API.
`ApplyPresetModal` and the shared `PresetPayloadEditor` own temporary values,
selection, expansion, Current/Apply summaries and independent section resets.
The editor's manager defaults remain unchanged. A deselected section keeps its
raw unfinished numeric input; reselecting it restores the error. Reset remounts
only the affected section and preserves the selection mask. `Edit original`
discards temporary values only after confirmation and focuses the original
record in the same app-owned Manager.

`parsePresetApplication` validates the strict envelope and only the selected
fields. Main checks the source is active, uses the existing document operation
gate, rehashes selected exact resources through `ModelService` and rejects a
changed or closed captured Project. The mapper returns only generation draft
and bbox; publication goes through one normal Project undo operation. A no-op
creates no history. Source prediction/noise snapshots remain advisory and
differences from current library policy are explained without overriding it.

## Executed evidence

Evidence owner: `~/.codex/artifacts/imagegen-studio/runs/preset-apply/20261013-checks/`.
Checks cover the dirty tree over the base above, followed by the delivery commit.

- `focused-final`: **176 passed, 0 failed/skipped** across shared schema/Apply,
  real preset repository/service/IPC, manager/editor, draft synchronization and
  the complete ProjectService tests. They include one-step Undo/Redo, actual
  shadow/explicit `.igs` Save, neighboring Project preservation, failed verifier,
  immutable capture and async changed/closed destination rejection.
- `model-apply-final`: **2 passed, 0 failed/skipped** through actual ModelService
  and SQLite. A small synthetic embedding safetensors file verifies nested refs/custom aliases;
  changed same-size bytes are refused by forced hashing despite a cached ready
  catalog. Forged IDs/hash/CivitAI identities and missing files are refused.
  A labeled tiny checkpoint identity fixture verifies that existing library
  prediction/noise overrides and copied advisory metadata remain unchanged.
  This proves authoring verification, not inference or checkpoint architecture.
- Native qualification exercises built renderer → preload → authenticated Main
  → real Project/SQLite/package owners, including Home creation, active/deleted
  choices, detached Reset/Cancel, full/partial Apply, double activation, supplied
  sampling members, nested missing-resource deselection, empty LoRAs, raw numeric
  recovery, guarded original editing, Save/readback and physical restart.
  `native-delivery/report.json`: **13 passed, 0 failed**, no page errors, two
  confirmed physical Electron exits. It additionally checks actual Main refusal
  of an inactive source and an empty selection. Source and bundle SHA maps match
  the delivered implementation; no model/runtime stand-in proves inference.
- Semantic mutation `mutation-verify` bypasses the Main verifier in an isolated
  source copy: **1 expected failure, 2 neighboring passes**, with the specific
  `Missing expected rejection` failure. Byte-exact rollback and
  `mutation-restored` produce **3 passed, 0 failed/skipped**. Root sources were
  never mutated; final focused tests exercise the healthy current source.

Actual screenshots were opened and inspected: Project backdrop/ownership,
collapsed and expanded sections at 1380×900 and 900×680, footer visibility,
selected/missing diagnostics and reopened original values. This is self-review;
it is not a blind audit or full WCAG/accessibility qualification. No unexpected
layout defects were observed in these finite states. The shared T3 browser was
available; native Electron qualification uses the repository harness because
the HTTP preview does not exercise its Main/preload/SQLite boundary.

Initial native attempts are diagnostic setup failures, not semantic RED or
feature evidence: ambiguous Home New Project locator, API-only close leaving a
stale renderer tab, CodeMirror outer textContent losing line separators, and
Naive Alert overriding inherited status role. The latter is recorded in
[component contracts](./ui-component-contracts.md#naive-alert-semantics). The
stale-tab attempt required stopping its identity-checked owned native scope;
physical exit was independently confirmed before cleanup. Final fixtures use
actual App UI Save/Open/Close/Undo/Redo and per-document-line prompt assertions.

Runs are serialized and bounded with zero swap. Unit/build/native actor budgets
are 2 GiB, native Main has its own 2 GiB guard, and typecheck/lint use 6 GiB.
Observed final focused peak is about 332 MiB, native about 621 MiB for the first
complete run, typecheck about 1.6 GiB and full lint about 3.5 GiB. No ML runtime,
weights, downloads or GPU work were created. Existing protected shared ML data
is retained for its prior qualification chain; this slice adds compact evidence.

## Delivery checks and cleanup

`typecheck-delivery`, full `lint-final`, `build-delivery`, scoped Prettier and
`git diff --check` pass. The final native screenshots were opened and inspected.
No prototype source changed, so prototype behavior is not claimed or substituted
for the actual native checks. Typecheck covers both app and prototype consumers.

After identity-checked physical exit and mutation rollback, seven owned disposable
directories were removed: six isolated native XDG fixtures and the source
mutation copy. Actual reclaimed allocated space: **50,819,072 bytes (48.46 MiB)**.
Reports, relevant screenshots, causal RED/GREEN/restoration evidence and a compact
actual saved `.igs` copy remain. Historical fixture paths in original reports
are explicitly marked disposed by `cleanup-report.json`; reports are not rewritten.
Artifact root remains about **28 GiB**, including the protected previous ML
runtime/catalog. No ordinary application data or original models were touched.

PP-006 remains «Пока не обещать». The next implementation slice is **Save Current**;
New Project customization, result-to-preset, Models handoff, Smart Patch targets
and qualified installed-resource Apply remain open. Current tests qualify real
file validation and project application separately; they do not yet qualify
one installed trained checkpoint → native picker → Apply → inference workflow.
