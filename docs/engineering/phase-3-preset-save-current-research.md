# Project Save Current as Preset

Base `master`, `528bf4a`. Contract: [Save Current](../features/presets.md#save-current-as-preset),
PP-006 and the approved Project/Preset Manager Vue prototype. This slice adds
project-derived creation to the existing app-owned manager, not result-to-preset
or New Project customization.

## Prospective boundaries

Risk is medium for UI snapshot/manager lifecycle. Existing SQLite writes and
native close guards are sensitive consumers; their implementation remains the
existing Preset API/owner. No new Project mutation or persistence format is needed.

Project Save Current captures a detached copy of the acknowledged generation draft,
current bbox dimensions,
source name and summary. It opens the shared Manager with a pinned transient
Draft. It allocates no ID and writes no catalog row until Create Preset succeeds.
The normal create/edit fields, Included controls and unsaved guards apply.
Cancel/Discard returns to Project; failed writes preserve the draft/source.

Seed is absent by default. Authored prompts/embedding refs, exact resource
snapshots, signed/enabled LoRAs, supplied sampling values, Steps/CFG, optional
CFG Rescale/VAE Precision and Embedded/external VAE are portable authoring values.
Only dimensions become Size. Project IDs, bbox position, layers, provenance,
source/mask state, last-seed cursor and dynamic batch settings never enter the
definition. Brace templates are retained for Save Current; expanded result
prompts belong to the later result-to-preset slice. Missing resources warn but
remain saveable; library prediction/noise policy is never written by this flow.

Source workflow uses a current verified generation target mode. A Project with
no visible pixel contributors is safely Text to Image without an ML worker.
If pixel mode is unknown for a nonempty Canvas, the draft requires an explicit
Workflow choice instead of inferring it from layer count or denoising strength.
Incomplete persisted numbers remain editable; invalid reusable raw input and
unapplied bbox edits disable Save Current with an explanation, avoiding hidden
old values. Invalid raw seed/batch fields do not block capture because these
sections are excluded. Outstanding draft synchronization blocks capture until
the existing command acknowledges; Save Current issues no flush or history seal.
This matters for explicit embedding selection: the optimistic prompt text can
precede Main's exact embedding sidecar. Copying that overlay would lose the
binding. Review found this race, and the launcher plus App guard now wait for the
acknowledged settings rather than guessing an identity.

## Verification plan

- Mapping tests inspect the actual producer, section presence and exact values;
  neighboring controls cover absent vs empty/zero, known vs unknown mode and
  matching vs stale library metadata. Capture/cloning must resist later edits.
- Real session + SQLite tests prove no row before Create, explicit persistence,
  failure/retry, guards, cancel/source lifetime and stale async reads. Execute a
  semantic mutation of project-derived creation/capture in an isolated copy,
  preserve causal RED/neighbors and byte-exact restoration.
- Built native Electron UI proves Project launcher → shared Manager draft →
  actual API/SQLite, source banner/default fields/seed omission, editable source,
  Cancel/Create/failure/restart and an unchanged Project/package/history.
- Inspect screenshots at standard/narrow window widths, run typecheck/lint/build
  and scoped formatting. All heavy runs are serial and memory/deadline bounded.
  No ML runtime, downloaded weights or GPU inference is required.

## Executed evidence

This is self-review of the changed working tree over `528bf4a`; the independent
agent review read the implementation and is not a blind product audit.

- `focused-delivery`: **187 passed, 0 failed/skipped**, covering the real draft
  producer, manager owner, strict shared schema/application, SQLite repository,
  service/IPC, Project draft synchronization and Project history consumers.
  The held prompt-binding test uses the actual `ProjectDraftSync` and production
  reconciliation rule. Its transport collaborator is explicitly separate from
  native Main/file verification.
- `mutation-baseline`: **3 GREEN**. Aliasing the editable definition to its
  captured source in an isolated copy produced **1 causal RED / 2 GREEN**:
  editing the prompt/name changed the supposedly immutable source. Byte-exact
  restoration and an unchanged worktree were confirmed; **3 GREEN** afterward.
  Logs, patch and restoration digest are retained together.
- Actual native failure diagnosis found a second defect: with Seed empty, the
  source action received pointerdown/mousedown at `y=314.36`; blur restored seed
  `0` and changed Generate's reason from two lines to one. The button moved to
  `y=296.77`, and `click` reached a `DIV`, not the button. The Generate status
  slot now reserves two text lines, including its empty state, without clipping
  longer explanations or suppressing normal modal-trigger focus behavior.
  This is a measured layout defect, not an assumed IPC rejection.

- `native-probe-fifth`: **9 passed**, two physical Electron lifetimes, no page
  errors. Real Home/UI Save/close/open sets up the fixture; the production package
  writer changes only the closed owned test project. Actual Project launch opens
  the shared manager, and explicit Create writes the real Main/SQLite catalog.
  Checks cover pending actual IPC delivery, raw reusable/Seed boundaries,
  count-excluded draft/cancel/unsaved guards, edited metadata and Included
  sections, exact prompts/sidecars/resources, actual SQLite INSERT failure and
  retry, unknown nonempty workflow with incomplete Steps repair, and restart.
  Three explicitly created records survive. Project/package/history, model rows
  and seed `0` are neighboring controls. No row exists before Create.
- Pointer trace after the layout fix asserts that the source receives `click`
  and stays within 1 px of its mousedown position. Cancel restores trigger focus.
  Standard `1380 × 900` and narrow `900 × 680` screenshots were visually
  inspected: the source text wraps, the editor scrolls independently, and the
  footer's sole primary action remains visible. Final screenshot bytes match
  the inspected preceding captures. All **22 source / 5 bundle hashes** match
  the final native run; the final source build is the one under qualification.
- `typecheck-source-final`, `lint-delivery`, `script-eslint-delivery` and
  `build-source-final` pass. Scope is production UI; no prototype component was
  edited. Builds/checks/native runs were sequential, deadline bounded and had
  zero swap. Native scopes were limited to 2 GiB; no ML runtime or weights were
  copied. The largest observed check was full lint at about 3.5 GiB.

Probe attempts are retained with their actual outcomes. The first probe corrected
a harness assumption that Naive would retain seed `-` instead of filtering it.
The second/third exposed the actual pointer/layout defect above. The fourth
completed seven cases before a fixture used a Buffer instead of the writer's
`{ bytes }` asset-source API; the fifth corrected that setup and completed all
nine. Those earlier failures are not represented as successful qualifications.

## Evidence, cleanup and remaining scope

Compact evidence lives under
`~/.codex/artifacts/imagegen-studio/runs/preset-save-current/20261013-checks/`:
reports, bounded commands/ownership/physical-exit records, screenshots, causal
mutation logs/patch/restoration, and cleanup plan/report. `retained/` pins the
final source `.igs` and three actual preset SQLite rows as JSON, with hashes.
After all native/controller processes exited and the mutation/IPC probes were
restored, six owned disposable payloads were removed: **49,356,800 allocated
bytes (47.1 MiB)** reclaimed. Original reports retain their historical fixture
paths; cleanup records their disposal separately. Existing shared runtime/catalog
and the necessary historical compact-evidence budget exception remain protected.

Installed resource verification, worker-backed pixel-mode classification, result
provenance projection, Smart Patch capture and release packaging are not qualified
by this slice. PP-006 remains «Пока не обещать». Next is **New Project
customization**; result-to-preset, Models handoff and Smart Patch source/target
routing remain separate roadmap work.
