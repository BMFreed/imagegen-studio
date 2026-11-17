# MVP acceptance backlog

Reconciled against `3c1d42ec95576c74519ea7cc02683ca29b2b8d02`. All eight public
promise statuses remain **«Пока не обещать»**. Earlier roadmap entries record
the state at their checkpoint.
[Product scope](../specs/00-product-scope.md), [promise matrix](../product-promises.md),
[roadmap](../specs/01-implementation-roadmap.md).

## Available checkpoints

- Home workspace and Project Trash operations, Models entry and return flows, guarded
  resource removal, and full-resolution visible-content and Generation BBox exports
  have finite production evidence. Qualify their combined packaged flows in step 6.
  [Workspace and Trash](../features/home-screen.md), [Models](../features/model-manager.md),
  [export](./phase-4-project-image-export-research.md).
- Both families have Current Canvas Regional Guidance and four-mode Smart Regional
  text and global LoRA consumers within explicit guards. Illustrious EPS reference
  guidance has separate Current Canvas TXT, IMG and OUT consumers. The last installed
  Smart LoRA Illustrious selection covered EPS TXT/INP and NoobAI V IMG/OUT.
  [Regional Guidance](../features/project/generate-mode/regional-guidance.md),
  [Smart LoRA](./phase-4-illustrious-smart-regional-lora-research.md),
  [regional references](./phase-4-regional-reference-image-research.md).
- The standalone Linux AppImage, reviewed runtime Setup, signed runtime transport and
  local native Install/Repair, and manual application Check, Download, Install and
  relaunch have separate checkpoints. Default Main constructs the runtime manager
  without a configured installation backend. Its public Setup flow therefore reports
  unavailable in that configuration. [Main](../../src/main/index.ts),
  [metadata review](./phase-5-runtime-metadata-provider-research.md),
  [native engine](./phase-5-native-engine-qualification-research.md),
  [AppImage](./phase-5-linux-app-package-research.md),
  [application updates](../features/application-updates.md).
- Packaged migration 29→30 and Project Save/reopen used a controlled incompatible
  protocol peer. The subsequent SQLite online backup checkpoint preserved committed
  WAL in a real Main database initializer run. Actual current packaged Main with an
  installed Python worker, nonempty historical Project and migration backup belongs
  to step 2. [Historical state](./phase-5-application-state-upgrade-research.md),
  [startup backup](./phase-5-database-migration-backup-research.md).

## Ordered acceptance work

1. **Verification baseline restored.** All 81 former regressions pass and the
   mutation reaches the actual weighted IMG/OUT consumers while the plain
   neighbors pass. All 470 `app:test` files completed. Across the stock cases,
   exact fixture opt-ins bring coverage to 8,469 PASS, one inapplicable platform
   SKIP and zero failures. [Qualification evidence](./anima-qualification-oracles-research.md),
   [test command](../../package.json).
2. **Join the current packaged app and a real installed engine on one host.** Verify
   the actual runtime, dependency, capability, model and host identities first. Reuse
   a compatible owned slot at its canonical path if available. Otherwise assemble
   one exact slot at its final path through the existing signed offline mechanism.
   Extend the packaged qualification to observe real CPU derivatives and inference
   handshakes, one bounded trained request per family, explicit Add and Save/reopen.
   Run the upgrade lane over a pinned historical nonempty `.igs` with exact resource,
   preset and queue/provenance records. Check the pre-migration backup, startup rows,
   saved package and normal exits. Separate the real compatible worker lane from
   missing/incompatible worker refusal and verify that Project Save remains usable.
   [Packaged upgrade harness](../../scripts/qualify-application-state-upgrade.mjs),
   [packaged smoke](../../scripts/smoke-linux-package.mjs),
   [runtime owner](../../src/main/runtime/index.ts),
   [runtime acceptance](../specs/07-python-runtime-management.md#acceptance-criteria).
3. **Qualify generation utility and capacity.** Fix the scenes, exact official
   Illustrious XL v0.1 bytes, inputs, seeds and visual rubric before execution. Use
   actual no-region ordinary controls and matched region/reference assignment
   controls. Both prior ordinary reference baselines failed, the 1024 resolution
   diagnosis was inconclusive, and the fixed common-runtime CLIP operators matched.
   Advance a fresh falsifiable hypothesis before another visual run. Record all
   images and a human acceptance verdict. Check signed Anima regional text for
   actual spatial effect on the supported installed peer. Consult model-aware
   settings and the guards before classifying additional combinations as supported.
   Measure output, host memory and VRAM on the declared profile, including a
   representative maximum admitted regional/reference case and an above-limit
   refusal preserving queue and Project state. [Visual utility](./phase-4-regional-reference-utility-research.md),
   [resolution](./phase-4-ordinary-resolution-research.md),
   [CLIP comparison](./phase-4-ordinary-invoke-conditioning-research.md),
   [regional contract](../features/project/generate-mode/regional-guidance.md#scope).
4. **Qualify clean Setup and Repair through the packaged UI.** Use the existing
   metadata-first backend and Setup, cache, extraction, assembly, health and
   rollback owners with an explicitly scoped qualification source. Drive review,
   consent, transfer, cancellation, successful publication and reopened worker
   start from a clean data root. Check corrupt source, incompatible host, failed
   post-activation startup and preservation of the prior known-good slot. Report
   the actual app artifact, OS/ABI, device, driver/CUDA, disk, RAM and VRAM envelope.
   Treat one host as the first measured row of the declared support profile.
   [Runtime contract](../specs/07-python-runtime-management.md),
   [native engine](./phase-5-native-engine-qualification-research.md),
   [Setup progress](./phase-5-runtime-setup-progress-research.md).
5. **Qualify interrupted application update and the next update.** Main owns the
   signed application stage, close and relaunch barriers, and startup inspection.
   Re-read the Invoke sources before extending these owners. The donor checkpoint
   identified no signed AppImage stage-retirement mechanism. Explain that gap to
   the user before adapting an alternative. Establish authority for a recover or
   explicitly chosen reinstall flow and a subsequent B→C update. Cover interruption
   before and after activation, stale or foreign replacement, a competing updater
   and a legacy or unleased process. The retained startup snapshot, signed target
   match and free participating-writer lock give insufficient authority to use
   backup A or remove retained bytes. Keep manual SQLite recovery and executable
   recovery as distinct operations. [Stage owner](../../src/main/application-updates/application-update-staging.ts),
   [startup authority](./phase-5-application-update-startup-authority-research.md),
   [application updates](../features/application-updates.md#acceptance-criteria).
6. **Run the NoobAI and joint release matrix.** Through the packaged UI, exercise
   actual CivitAI URL preview and download for exact EPS and V checkpoints, their
   Model Manager policies and compatible LoRA, embedding and VAE resources. Cover
   exact side-by-side versions, explicit Default, portable `.igs` exact-resource
   relink, legacy queue/provenance and an incompatible worker refusal on clean install
   and upgrade. Verify Generate, Cancel, frozen Retry, explicit Add/Undo/Redo/Save,
   immutable Compare and result-derived presets. Check joint Home/Trash, resource
   removal and export behavior, interrupted recovery, keyboard/focus/contrast and
   performance at supported desktop sizes on the final candidate. [NoobAI matrix](../specs/01-implementation-roadmap.md#noobai-полная-поддержка-в-рамках-mvp),
   [release criteria](../specs/01-implementation-roadmap.md#фаза-5-первый-linuxnvidia-релиз),
   [model lifecycle](../features/model-manager.md#acceptance-criteria),
   [review protocol](./review-protocol.md).

## Scope and delivery gates

Smart Regional currently admits one static item, up to three regions, 64–512
processing sides divisible by eight, and world dimensions up to 2048 per side
and 4,000,000 pixels. Anima uses Euler/Heun, Illustrious uses Euler/Normal, and
both use embedded Auto VAE. Smart references and active textual inversion are
refused. Current Canvas reference guidance admits Illustrious EPS, Euler/Normal,
CFG Rescale 0, embedded FP16 VAE, one static item and up to three reference
images at 64–512 processing sides divisible by eight. Source PNGs have ceilings
of 32 MiB each, 96 MiB total, 16,384 per side and 64,000,000 pixels each. Active
global LoRA and active embeddings are refused. Qualify the usable promised set
and precise unsupported refusals under the existing contracts. General Smart
and batch support does not imply their regional reference combinations. Anima
regional references/TI, generic ControlNet/IP-Adapter, inverse-mask auto-negative
and shared regional masks stay outside this scope.
[Smart guards](../../src/shared/projects/smart-patch-regional-guidance.ts),
[Current Canvas guards](../../src/shared/projects/regional-invoke-generation.ts),
[finite contract matrix](./phase-4-regional-reference-image-research.md#finite-remaining-regional-scope).

The user confirmed that production signed runtime metadata/artifact endpoints and
the production public Ed25519 identity are unavailable. This blocks full shipping
delivery and final acceptance with production trust. Local qualification and
publisher-independent release work can proceed using explicit qualification inputs.
The portable `.igs` relink check uses exact verified resources through existing
owners. Arbitrary local-file relink and folder-scan model repair are later scope.
[Metadata source boundary](./phase-5-runtime-metadata-provider-research.md#expected-result-and-settled-boundary),
[model repair](../features/model-manager.md#missing-resource-repair).

Each gate records the tested revision and artifact identities, exact exercised rows,
controlled inputs, failures, normal physical exits and evidence limits. Before each
new non-UI behavior change, consult the current local InvokeAI implementation and
callers and record paths and revision. Before moving a public promise to a higher
status, validate the supported production flow and update both the contract and
matrix entry. [Research protocol](./research-protocol.md),
[review protocol](./review-protocol.md), [artifact lifecycle](./artifact-lifecycle.md),
[promise matrix](../product-promises.md).
