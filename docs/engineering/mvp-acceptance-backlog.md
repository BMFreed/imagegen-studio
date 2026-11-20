# MVP acceptance backlog

Updated through the [Retry runtime transition fix](./phase-5-retry-runtime-transition-research.md),
[packaged frozen Retry](./phase-5-packaged-noobai-components-research.md#packaged-frozen-retry-with-all-three-components)
and [historical NoobAI queue qualification](./phase-5-noobai-legacy-queue-research.md).
All eight public promise statuses remain **«Пока не обещать»**. Earlier roadmap
entries record the state at their checkpoint.
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
- Packaged migration 29→30 and Project Save/reopen originally used a controlled
  incompatible protocol peer. The SQLite online backup checkpoint preserved
  committed WAL in the Main initializer. The packaged installed-worker follow-up
  verifies the pre-migration backup and a real CPU preview on Save of a nonempty
  historical Project. [Historical state](./phase-5-application-state-upgrade-research.md),
  [startup backup](./phase-5-database-migration-backup-research.md),
  [installed-worker follow-up](./phase-5-packaged-installed-historical-upgrade-research.md).

## Ordered acceptance work

1. **Verification baseline restored.** All 81 former regressions pass and the
   mutation reaches the actual weighted IMG/OUT consumers while the plain
   neighbors pass. All 470 `app:test` files completed. Across the stock cases,
   exact fixture opt-ins bring coverage to 8,469 PASS, one inapplicable platform
   SKIP and zero failures. [Qualification evidence](./anima-qualification-oracles-research.md),
   [test command](../../package.json).
2. **Bounded packaged trained generation passed.** One actual 256×256 TXT job
   for each family reaches public Generate, explicit Add, Save and reopen with
   exact resource identities, frozen provenance and retained result bytes. The
   compatible installed engine and original AppData are restored after both
   runs. Missing-engine Setup has a fresh packaged control. The incompatible
   worker refusal for the release candidate remains in step 6.
   [Packaged installed engine](./phase-5-packaged-installed-engine-research.md),
   [packaged trained jobs](./phase-5-packaged-trained-generation-research.md),
   [packaged installed harness](../../scripts/qualify-packaged-installed-upgrade.mjs),
   [packaged smoke](../../scripts/smoke-linux-package.mjs),
   [runtime owner](../../src/main/runtime/index.ts),
   [runtime acceptance](../specs/07-python-runtime-management.md#acceptance-criteria).
3. **Qualify generation utility and capacity.** Fix the scenes, exact official
   Illustrious XL v0.1 bytes, inputs, seeds and visual rubric before execution. Use
   actual no-region ordinary controls and matched region/reference assignment
   controls. Both prior ordinary TXT baselines failed, the 1024 resolution
   diagnosis was inconclusive, and the fixed common-runtime CLIP operators matched.
   The source-anchored IMG pilot preserved geometry in all three jobs. Both
   reference cards failed the preregistered red/blue recoloring criterion.
   The signed Anima IMG pilot held the source and regional
   positives fixed while swapping the same negative between sides. Both red
   scarves survived all variants. The current original Invoke denoiser on the
   held source latent repeats that result. Exact negative permissions and
   prompt inputs match. Selective attenuation remains unqualified.
   Retain both IMG pilots and record a new hypothesis before any further
   visual run. Record all images and a human acceptance verdict. Consult model-aware
   settings and the guards before classifying additional combinations as supported.
   The representative Illustrious 512×512 IMG case with three separately masked
   references completed on the RTX 4080 with 9.50 GiB peak group RAM and
   8,852 MiB maximum sampled worker VRAM. A saved Project with four references
   refused Generate before capture or admission and preserved queue and Project
   state. The original-image byte and dimension limits and wider hardware
   capacity remain open. [Reference capacity](./phase-4-regional-reference-capacity-research.md),
   [visual utility](./phase-4-regional-reference-utility-research.md),
   [source-anchored IMG](./phase-4-reference-img-utility-research.md),
   [signed Anima IMG placement](./phase-4-anima-negative-spatial-utility-research.md),
   [current Invoke comparison](./phase-4-anima-negative-invoke-control-research.md),
   [resolution](./phase-4-ordinary-resolution-research.md),
   [CLIP comparison](./phase-4-ordinary-invoke-conditioning-research.md),
   [regional contract](../features/project/generate-mode/regional-guidance.md#scope).
4. **Finish packaged runtime failure and shipping qualification.** Use the existing
   metadata-first backend and Setup, cache, extraction, assembly, health and
   rollback owners with an explicitly scoped qualification source. The private
   AppImage checks review before transfer, dismissal, cancellation, a mismatched
   archive digest and incompatible-driver refusal. A valid archive reaches the
   assembly disk-space guard after transfer, extraction and LaMa publication.
   The fresh private AppImage then installed successfully and reopened ready
   on Ubuntu 26.04.1 with RTX 4080 and driver 615.71.09. Repair reused the
   signed runtime cache, published a distinct slot and reopened ready. A
   separate native startup confirmed the previous worker remained runnable.
   A separate packaged control reached candidate activation, observed
   actual worker refusal, restored the previous pointer byte for byte
   and reopened the original ready runtime. Repeat on the shipping
   artifact and supported host matrix when the publisher is available.
   The measured inputs imply a floor of 28,217,106,280 B on one filesystem
   before the new slot and any Repair reserve. It includes the signed 20 GiB
   assembly floor, the exact cached and extracted runtime and LaMa. Repair
   also keeps the previous good slot. The passing run recorded 65.04 GB free
   at Setup consent and 43.72 GB at Repair consent on ext4.
   [Packaged Setup controls](./phase-5-packaged-runtime-setup-research.md),
   [Clean Setup and Repair](./phase-5-packaged-runtime-setup-repair-research.md),
   [Packaged rollback](./phase-5-packaged-runtime-rollback-research.md),
   [Runtime contract](../specs/07-python-runtime-management.md),
   [native engine](./phase-5-native-engine-qualification-research.md),
   [Setup progress](./phase-5-runtime-setup-progress-research.md).
5. **Finish interrupted application update recovery.** Main owns the
   signed stage, close and relaunch barriers, and startup inspection. Real Linux
   process-death controls preserve A before replacement and B after activation,
   keep the stage, and refuse signed C before close. A separate B path can be
   updated to C in the controlled transaction. A test unleased writer can
   replace the target while a competing participating updater receives Busy.
   Updates now verifies and saves signed B to a fresh pathname through the
   system Save dialog. The three-lifetime AppImage test cancels once, saves B,
   reopens the same Project, uses ordinary Save on close and installs signed C.
   C reopens the saved edit and reports the target verified and the runtime
   unverified. The original stage is preserved. Production publisher trust,
   post-upgrade runtime validation, legacy/unleased machines,
   the publication-before-final-journal window, in-place recovery and retirement
   still require a supported ownership and qualification boundary. Re-read
   Invoke before changing owners. Keep manual SQLite recovery separate.
   [Updates recovery](./phase-5-public-appimage-recovery-research.md),
   [Fresh-path recovery](./phase-5-application-recovery-fresh-path-research.md),
   [update interruption](./phase-5-application-update-interruption-research.md),
   [stage owner](../../src/main/application-updates/application-update-staging.ts),
   [startup authority](./phase-5-application-update-startup-authority-research.md),
   [application updates](../features/application-updates.md#acceptance-criteria).
6. **Run the NoobAI and joint release matrix.** Cover the remaining Model
   Manager policies and the supported desktop backends.
   Stock AppImage import passed system picker Cancel, transfer Cancel,
   external Copy and Move, and managed reopen through the GTK portal.
   The managed package kept the original bytes, revision and NoobAI
   provenance. Repeat chooser coverage on the supported desktop backends.
   [Packaged Project import](./phase-5-packaged-project-import-research.md)
   Stock AppImage Locate passed picker Cancel, unregistered-workspace and
   wrong-revision refusal, exact rebind, and explicit Open after restart.
   The local key, saved package and accepted Raster survived the rebind.
   [Packaged Project Locate](./phase-5-packaged-project-locate-research.md)
   The stock Model Manager removed one unshared IllustriousPhoto embedding
   after explicit review. Compare reported the missing resource after
   restart and kept the exact accepted reference and image. Exercise the
   pending and running queue policies on the release candidate.
   [Packaged managed embedding removal](./phase-5-packaged-noobai-component-remove-research.md)
   The stock AppImage upgraded the legacy NoobAI DB17 profile and preserved
   its full queue and accepted index. Queue Manager and Compare read the exact
   historical V-prediction settings, and packaged Retry refused a changed
   frozen input. The selected accepted Raster reopened unchanged.
   [Packaged legacy NoobAI readback](./phase-5-noobai-legacy-queue-research.md#stock-appimage-upgrade-and-readback)
   The stock AppImage refused the incompatible installed worker on a fresh
   profile and on a copied DB29 upgrade. Generate and historical Retry
   were refused, and both Projects saved and reopened. Repeat the refusal
   on the shipping candidate across the supported clean-install and upgrade
   matrix. [Packaged installed worker refusal](./phase-5-packaged-installed-engine-research.md#stock-appimage-with-an-incompatible-installed-worker)
   The current AppImage covered the Cancel-to-Retry transition and frozen replay
   with the installed CUDA worker. Repeat on the shipping candidate and cover
   the remaining release cases for Generate, Cancel, frozen Retry, explicit Add/Undo/Redo/Save,
   immutable Compare and result-derived presets. Check joint Home/Trash, resource
   removal and export behavior, interrupted recovery, keyboard/focus/contrast and
   performance at supported desktop sizes on the final candidate. [NoobAI matrix](../specs/01-implementation-roadmap.md#noobai-полная-поддержка-в-рамках-mvp),
   [release criteria](../specs/01-implementation-roadmap.md#фаза-5-первый-linuxnvidia-релиз),
   [model lifecycle](../features/model-manager.md#acceptance-criteria),
   [review protocol](./review-protocol.md).

   The stock AppImage passed live CivitAI Preview and Cancel for exact EPS
   833294/1022833/928571 and V 1147756/2679856/2566634. A separate controlled
   AppImage selected each exact file over a neighboring primary file, with
   zero body transfers or installation rows. The current signed worker
   passed its live CUDA and protocol preflight. A stock AppImage with an
   exact borrowed Cyberfalafel V file then passed a manual prediction
   override and one 256×256 Generate, Add, Save and reopen. The same stock
   AppImage now also completed live download, exact publication and
   credential-free catalog reopen for EPS. Those installed bytes passed
   one 256×256 Generate, Add, Save and reopen at the Epsilon default.

   The stock AppImage installed exact Cyberfalafel V 1.2 and 1.1 beside
   EPS. Default changed to 1.1 only on explicit selection and persisted
   across restart. A portable `.igs` discovered by its managed workspace
   opened from Home and linked exact V 1.2 while 1.1 remained Default.
   Save and reopen preserved the accepted raster and provenance. [Managed
   NoobAI versions](./phase-5-packaged-noobai-versions-research.md)

   The stock AppImage also completed live download of the exact DigitalArt
   LoRA and IllustriousPhoto embedding in separate fresh profiles. Each file's
   published hash, source metadata, completed job and ready catalog entry
   persisted through restart after credential removal. Their prior installed
   inference cases exercised NoobAI checkpoints. The packaged standalone
   VAE follow-up verified live download, credential-free restart and exact
   same-digest file selection for Euge_'s VAE. The installed VAE passed
   Main's preparation and rejected the neighboring file ID. A packaged
   NoobAI EPS TXT case used the managed VAE on CUDA and preserved its
   exact reference in accepted provenance after draft Reset, Add, Save
   and reopen.
   A follow-up executed one packaged NoobAI EPS TXT case with the
   exact managed VAE, DigitalArt LoRA and negative IllustriousPhoto
   embedding together. Their references survived Add, Save and reopen
   after removing the components from the draft.
   A running Cancel and a same-session Retry after idle gave identical
   frozen bytes and the same PNG as the prior combined Generate.
   Queue Manager now waits during runtime worker transitions and retains
   Retry while another healthy worker owns the engine. The current stock
   AppImage observed disabled Retry with the worker transition reason, followed
   by enabled Retry and an identical frozen replay in the same session.
   The controlled runtime and browser checks cover admission across Projects.
   [Retry transition fix](./phase-5-retry-runtime-transition-research.md),
   [Packaged frozen Retry](./phase-5-packaged-noobai-components-research.md#packaged-frozen-retry-with-all-three-components),
   [Combined managed components](./phase-5-packaged-noobai-components-research.md#packaged-noobai-generation-with-all-three-managed-components),
   [Packaged VAE generation](./phase-5-packaged-noobai-components-research.md#cuda-generation-with-the-installed-vae),
   [Live component installation](./phase-5-packaged-noobai-components-research.md),
   [Managed EPS qualification](./phase-5-packaged-noobai-install-research.md),
   [Packaged qualification](./phase-5-packaged-noobai-preview-research.md),
   [Model Manager contract](../features/model-manager.md),
   [exact fixture identities](../../scripts/noobai-noise-qualification.mjs).

   The production database and queue readers passed a historical
   17→30 upgrade with 1,329 queue rows preserved. Two exact Cyberfalafel
   V jobs and the accepted Raster retained their pre-noise-profile
   configuration. A changed target byte reached the real refusal and
   the restored input passed again. [Historical NoobAI evidence](./phase-5-noobai-legacy-queue-research.md)

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
