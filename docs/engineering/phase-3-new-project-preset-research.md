# New Project preset customization

Base `master`, `511ec66`. Contract: [New Project preset customization](../features/presets.md#new-project-preset-customization),
PP-006 and the approved Vue Home `NewProjectModal` prototype.

## Prospective boundaries

Risk is high at the create IPC and first `.igs` publication boundary, medium for
the detached editor. New Project initializes the chosen reusable settings before
the first package is published; it must not create an empty document followed by
a separate Apply command or Undo mutation. Existing atomic create/path ownership,
placeholder previews, indexing and recovery behavior remain the storage owners.

Home opens a production modal that reuses `PresetPayloadEditor`. The picker shows
active Text to Image presets only. Selection captures a detached source payload;
all sections begin collapsed, all source sections are used except Seed, and Size
always supplies the initial bbox dimensions. Absent Size falls back to 1024 × 1024.
Reset and reset-all restore copied values while preserving the Use mask. No preset
removes the transient payload and restores default dimensions. The Canvas remains
infinite; its initial bbox is at `(0, 0)`.

Renderer → preload → Main create carries `{ title, width, height, generationPayload? }`.
The payload contains selected sections only. Main strictly validates before
initialization or file/index creation. Width/height own geometry; a supplied Size
must match them. Text to Image does not admit denoising/source/layer/context fields.
The existing pure preset projection initializes the fresh document. Authored
prompt templates/embedding sidecars, exact resources, signed/enabled/empty LoRAs,
supplied sampling values, zero CFG Rescale, VAE/precision and explicit fixed seed
`0` remain meaningful values. Excluded seed uses the fresh random default; there
is no source seed cursor or last-actual-seed transfer. Prediction/noise policy
belongs to the library; the preset's advisory snapshot cannot change it.

Missing selected resources warn without blocking creation. Structural/raw invalid
selected settings block Create; deselected invalid temporary sections do not.
Cancel leaves no Project or preset row. Failed Create keeps the editable modal
draft. A failure after the file is committed but before indexing retains the
existing `PROJECT_CREATED_NOT_INDEXED` behavior: the committed project can be
rediscovered by Home. It is not represented as a no-file rollback.

## Verification plan

- Test the actual detached editor owner and source/mask/reset/No-preset lifecycle,
  not a controller redefined inside the test.
- Shared/Main/real-package tests exercise strict input rejection before publication,
  initial settings in the first `.igs`, clean history, immutable caller values,
  exact resource references and neighboring plain three-field creation.
- Execute a semantic mutation with causal RED, neighboring GREEN, byte-exact
  restoration and rerun. Inspect the implemented boundary before choosing it.
- Built native Electron uses actual Home/New Project interactions and real preset
  fixtures/SQLite. Test customization, selected-only invalid inputs, seed defaults
  and fixed zero, reset/Cancel, first-package data, missing resources, actual index
  refusal/rediscovery and physical restart. Record source/bundle hashes and actual
  failure diagnostics; inspect standard and narrow screenshots.
- Typecheck, lint, build and scoped formatting run serially with finite RAM/deadline
  and zero swap. No ML runtime, model weights or inference is required. Disposable
  fixtures are cleaned only after physical exit/restoration, with compact evidence
  retained according to artifact lifecycle.

## Executed evidence

This is self-review of the changed working tree over `511ec66`, with separate
code review of the post-create consumers. It is not a blind product audit.

- `main-first`: **108 passed** for shared Create validation, the real Project
  service and package/session consumers. `focused-final`: **221 passed, zero
  failures/skips**, adding detached renderer state and existing schema, Apply,
  SQLite preset ownership, Save Current and draft-synchronization neighbors.
- `mutation-baseline`: **3 GREEN**. Disabling initial payload projection in an
  isolated source copy produced **1 causal RED / 2 GREEN**: the first actual
  `.igs` contained an empty prompt instead of the authored settings. Invalid-input
  refusal and ordinary create/Undo/Save/reopen remained healthy. The production
  worktree was never mutated; the copy was restored byte-exactly and **3 GREEN**
  passed again. Logs, patch, original digest and restoration proof are retained.
- `native-probe-third`: **nine passed**, five real Home-created projects, two
  physical Electron lifetimes and no page errors. Actual preload/Main rejects
  malformed creation before file/index/recovery changes. The live dialog covers
  active TXT-only selection, collapsed defaults, source detachment, selected-only
  numeric validation, reset/Use masks, Cancel, No preset, absent-Size fallback,
  default random versus explicitly used Fixed `0`, exact missing refs/sidecars,
  authored brace templates, signed/empty LoRAs, CFG Rescale `0`, Auto precision and
  native sampling. First saved packages and returned drafts agree, with clean
  history and no accepted-result/source links. Source presets and model rows are
  neighboring immutable controls. Physical restart preserves those packages.
- An actual SQLite `project_index` INSERT refusal leaves one correctly initialized
  `.igs` with no partial index row. The user sees the existing actionable error,
  their detached form remains available, and Home rediscovery after trigger removal
  indexes and opens the committed document. This is committed-file preservation,
  not a no-file rollback. Ordinary pre-publication invalid input remains separate.
- The Create consumer review traced `reconcileOpenedProjectGeneration`: fresh
  documents have no accepted-result overlap and it does not call resource/embedding
  reconciliation or Apply. `resolvePromptEmbeddings` runs during explicit prompt
  changes, not creation. Generate later reads the current exact-file library
  prediction/noise profile rather than overriding it from a copied snapshot.
- `typecheck-final`, `lint-final` and `build-first` pass. Only production components
  changed; no prototype UI was edited. Heavy checks/native runs are sequential,
  RAM/deadline bounded and swap-free. Native scopes are limited to 2 GiB. No ML
  runtime, downloaded models, worker stand-in or GPU inference is used here.

## Visual evidence and probe outcomes

Inspected collapsed and fully expanded forms at `1380 × 900` and `900 × 680`:
the body scrolls to its bottom, header/footer remain visible, the primary action
is solely Create, Use controls remain distinct from Reset, and warnings do not
hide the editing/creation path. Native geometry also checks heading, footer,
scroll boundaries and root scroll position. Final **24 source / five bundle
hashes** match the qualified working tree and build.

The first probe completed seven groups before a harness assertion expected the
internal `PROJECT_CREATED_NOT_INDEXED` code in the UI. The app intentionally shows
its actionable message; the assertion now checks that message. The second probe
passed nine groups, but one locator screenshot scrolled the hidden modal root
while taking the picture, clipping the header in that evidence. Capturing the
visible viewport rectangle and asserting heading/root-scroll geometry avoids the
capture side effect; the third run passed and its actual narrow expanded screenshot
was inspected. Previous reports retain their actual outcomes.

## Evidence and cleanup

Compact evidence lives under
`~/.codex/artifacts/imagegen-studio/runs/new-project-preset/20261013-checks/`:
bounded command/ownership/physical-exit records, native reports/screenshots,
causal mutation logs/patch/restoration, cleanup plan/report and delivery manifest.
`retained/` pins all five first packages and the actual source preset SQLite rows
as JSON, with digests. These include the committed file recovered after index
refusal. After physical exit, restored mutation/trigger and open-user checks,
four owned disposable payloads were removed: **32,477,184 allocated bytes
(31.0 MiB)** reclaimed. Original native reports keep their historical fixture
paths; cleanup records disposal separately. The existing shared runtime/catalog
and historical compact-evidence budget exception remain protected.

PP-006 remains «Пока не обещать». Next is result-to-preset; Models handoff and
Smart Patch sources/targets remain separate roadmap work. Installed-resource
resolution, runtime inference, accepted-result provenance projection and release
packaging are outside this finite qualification.
