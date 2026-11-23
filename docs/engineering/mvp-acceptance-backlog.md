# MVP acceptance backlog

Updated through the [Retry runtime transition fix](./phase-5-retry-runtime-transition-research.md),
[packaged frozen Retry](./phase-5-packaged-noobai-components-research.md#packaged-frozen-retry-with-all-three-components),
[historical NoobAI queue qualification](./phase-5-noobai-legacy-queue-research.md),
[recovery of a live CUDA job](./phase-5-packaged-live-queue-recovery-research.md),
[CUDA generation across signed relaunch](./phase-5-signed-appimage-cuda-research.md),
[ordinary Illustrious prompt comparison](./phase-4-ordinary-cat-tags-research.md),
[ordinary IMG recoloring](./phase-4-ordinary-img-recolor-research.md),
[ordinary IMG strength comparison](./phase-4-ordinary-img-strength-research.md),
[ordinary mug recoloring](./phase-4-ordinary-img-mug-research.md),
[installed Invoke mug IMG](./phase-4-invoke-ordinary-img-mug-research.md),
[mug reconstruction before denoising](./phase-4-ordinary-img-mug-vae-research.md),
[ordinary mug trajectory](./phase-4-ordinary-img-mug-trajectory-research.md),
[held mug IMG replay](./phase-4-ordinary-img-mug-held-replay-research.md), and
[mug IMG with explicit color emphasis](./phase-4-ordinary-img-mug-weight-research.md).
The next
[two-plinth regional placement trial](./phase-4-regional-reference-placement-research.md)
passes native execution and leaves visual regional utility open.
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
   Both stock builds from `3c1d42ec` and `353fe8f1` also opened the same
   profile in sequence, recognized the existing slot and saved the same
   Raster Project with rendered CPU previews. The signed relaunch with the
   installed runtime is covered in step 5. CUDA inference across the shipping
   upgrade remains in step 6.
   [Packaged runtime continuity](./phase-5-packaged-runtime-continuity-research.md)
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
   Same-seed 1024 prompt pairs reproduced both prose controls byte for byte.
   Both tagged variants failed the visual rubric because of tight framing.
   [Ordinary prose and tags](./phase-4-ordinary-cat-tags-research.md).
   The source-anchored IMG pilot preserved geometry in all three jobs. Both
   reference cards failed the preregistered red/blue recoloring criterion.
   The ordinary IMG text follow-up reproduced the neutral PNG byte for byte.
   Both color edits also left the head gray at strength 0.5. The matched
   follow-up at 0.75 changed facial details and added shapes around the head.
   Both color edits failed. A new gray mug source at 0.6 preserved its overall
   geometry, but both color edits left the mug gray and all three outputs
   altered the plain background. The installed InvokeAI IMG graph reproduced
   both failures on all three matching inputs and the same Euler schedule.
   Two VAE-only controls keep the source's background and gray ceramic.
   The original Invoke trajectory has visible fragmentation immediately
   after noise addition. The mug and transitional mosaic read at step 8.
   The recognizably patterned backdrop is clear by step 19. On one shared
   runtime, Invoke and Studio match byte for byte through initial noise
   addition and all 19 transitions with the source latent, noise, and
   conditioning held. The next installed run wrapped only the authored
   color word with Compel weight 2.0. The neutral PNG replayed exactly,
   both treatments kept the mug geometry, and both still showed gray
   bodies and patterned backgrounds. Installed InvokeAI 6.14.3 reproduced
   this weighted result on the same inputs and schedule. By product decision,
   exact prompt-only recoloring in ordinary IMG is outside the product
   goals. Qualify regional influence on a separate fixed scene with
   recognizable attributes, an ordinary no-region control, an assignment
   swap and a human verdict on the effect inside and outside the mask.
   The two-plinth trial preserved exact base inputs and moved the
   duck and camera reference PNGs between two fixed masks. The
   native requests completed. The blind review saw no recognizable
   pair in either treatment. Choose a new hypothesis before a repeat.
   [Ordinary IMG recoloring](./phase-4-ordinary-img-recolor-research.md),
   [strength comparison](./phase-4-ordinary-img-strength-research.md),
   [mug experiment](./phase-4-ordinary-img-mug-research.md),
   [installed Invoke mug IMG](./phase-4-invoke-ordinary-img-mug-research.md),
   [VAE controls](./phase-4-ordinary-img-mug-vae-research.md),
   [trajectory checkpoints](./phase-4-ordinary-img-mug-trajectory-research.md),
   [held mug IMG replay](./phase-4-ordinary-img-mug-held-replay-research.md),
   [explicit color emphasis and Invoke comparison](./phase-4-ordinary-img-mug-weight-research.md),
   [two-plinth regional placement](./phase-4-regional-reference-placement-research.md),
   [product scope](../specs/00-product-scope.md#продуктовые-нецели-mvp).
   The signed Anima IMG pilot held the source and regional
   positives fixed while swapping the same negative between sides. Both red
   scarves survived all variants. The current original Invoke denoiser on the
   held source latent repeats that result. Exact negative permissions and
   prompt inputs match. Selective attenuation remains unqualified.
   A separate positive TXT trial reserved 448 sampled background cells
   with shorter masks at seed 123. Both inset outputs gained a visible
   bench. One had two red scarves and the swapped case had a single
   red-scarf cat. Full masks placed both scarves correctly and omitted
   the bench.
   Raising just the blue scarf weight from 0.75 to 1.5 gave both
   inset outputs a blue scarf and a bench on the same seed. The
   assigned left cat was orange and the swapped right figure's
   anatomy remained unclear. Joint scene and placement utility remains open.
   [Anima global scene area](./phase-4-anima-global-background-visual-research.md),
   [matched scarf weight comparison](./phase-4-anima-equal-scarf-weight-research.md).
   The next Anima case used a paper lantern and fox mask on a festival
   stall at seeds 123 and 124. Both ordinary scenes passed. One of the
   four regional images preserved the readable stall and both assigned
   subjects. The two-seed assignment and swap criterion remains open.
   [Anima festival stall](./phase-4-anima-festival-stall-research.md)
   The next Anima TXT trial repeated the same tabletop and wall context
   in both locals. Both ordinary controls and all four regional backgrounds
   passed. Two regional images placed the apple and mug on the assigned
   sides. One centered and overlapped the pair, and one omitted the apple.
   The two-seed visual gate and local negative remain open.
   [Anima tabletop placement](./phase-4-anima-countertop-scene-research.md)
   The red-apple IMG follow-up has a frozen baseline, a treatment over
   the apple and a spatial control over the mug. CPU preparation verified
   exact decoded source pixels and local negative owners. Three installed
   CUDA calls finished. Both blind readers found a wooden box in all
   outputs. Baseline and spatial control lost both original subjects, so
   local negative utility stays open for this trial.
   [Anima red-apple negative](./phase-4-anima-apple-negative-research.md)
   The matched follow-up names the apple and mug in their respective
   local positives. CPU preparation passed with the exact source and
   frozen sampling. The visual baseline still needs one CUDA output.
   [Baseline with named subjects](./phase-4-anima-apple-negative-research.md#baseline-with-named-subjects)
   Retain the IMG pilots and record a new hypothesis before any further
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
   A SIGKILL immediately after replacement leaves exact B with an `activating`
   journal and the private A backup. Startup keeps recovery required and refuses
   signed C before Project close.
   Updates now verifies and saves signed B to a fresh pathname through the
   system Save dialog. The three-lifetime AppImage test cancels once, saves B,
   reopens the same Project, uses ordinary Save on close and installs signed C.
   C reopens the saved edit and reports the target verified and the runtime
   unverified. The original stage is preserved. The local signed route
   also passed with the installed runtime. B and the native successor C
   both reported the original slot ready and published distinct revisions
   with rendered CPU previews. The CUDA follow-up generated the same NoobAI
   EPS job before and after native relaunch on the retained slot. The frozen
   execution inputs and PNG bytes matched. C passed explicit Add, Save and
   reopen with the same accepted Raster and provenance. The shipping host
   matrix and inference across distinct release sources remain open.
   Native KDE Wayland SaveFile verified the AppImage filter and actual
   Cancel. KDE returned the default filename with a lowercase extension
   and the original local guard refused it. The corrected AppImage saves
   exact signed bytes at the selected spelling. Launching that copy reopens
   the same Project and clears recovery for the new path. Both lifetimes
   close normally. [Native KDE recovery](./phase-5-packaged-recovery-kde-chooser-research.md)
   A subsequent native test installed signed C from the same KDE-selected
   lowercase B path. The ordinary Project-close flow saved the edit and C
   reopened it after relaunch. C verified the target and kept its B backup
   in a separate stage, while A and its original stage stayed intact.
   [Next update from KDE's recovered path](./phase-5-packaged-recovery-kde-next-update-research.md)
   Production publisher trust, legacy/unleased machines, in-place recovery and retirement still require
   a supported ownership and qualification boundary. Re-read Invoke before
   changing owners. Keep manual SQLite recovery separate.
   A separate manual SQLite control copied a specifically selected
   schema 29 backup and re-migrated it in the current AppImage. The
   set-aside main/WAL/SHM trio kept the later committed marker, and
   the saved `.igs` and original backup survived.
   [Packaged manual SQLite recovery](./phase-5-packaged-sqlite-manual-recovery-research.md)
   [Updates recovery](./phase-5-public-appimage-recovery-research.md),
   [Signed relaunch with installed runtime](./phase-5-signed-appimage-installed-runtime-research.md),
   [CUDA across signed relaunch](./phase-5-signed-appimage-cuda-research.md),
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
   The stock AppImage repeated these Import and Locate controls through
   the KDE portal on a private native Wayland session. Twelve matched
   chooser responses and seven normal app closes preserved the exact
   Project and accepted Raster. Repeat on the shipping desktop matrix.
   [Packaged KDE Wayland chooser](./phase-5-packaged-kde-chooser-research.md)
   Stock AppImage Home blocks Trash while the Project is open. After close it
   preserves the exact saved Project across Trash, restart and Restore. Confirmed
   permanent deletion retires only the target and preserves a neighboring Project
   and file. [Packaged Trash](./phase-5-packaged-project-and-preset-research.md#home-trash)
   In a separate startup case, the AppImage finished two committed
   deletions. A different valid `.igs` at the old path stayed on disk
   with a pending diagnostic and Restore refused. The ordinary Trash
   entry and the active neighbor survived both cold starts.
   [Packaged Trash startup recovery](./phase-5-packaged-project-trash-recovery-research.md)
   A third committed deletion stayed pending when its owned workspace
   lost write access. After access was restored while the AppImage was
   open, Retry Delete finished exactly that operation. A cold start
   confirmed the retirement and preserved the remaining entries.
   [Packaged Retry Delete](./phase-5-packaged-project-trash-recovery-research.md#explicit-retry-after-restoring-workspace-permissions)
   The stock AppImage exported visible content and the primary Generation BBox
   through the installed CPU worker and KDE SaveFile. Cancel left no file, and
   the repeated content PNG matched byte-for-byte after restart.
   [Packaged image export](./phase-5-packaged-project-image-export-research.md)
   A confirmed KDE SaveFile selection of an existing BBox PNG reached
   Studio's create-only outcome. The existing bytes and inode survived,
   the export scratch cleared and the original installed CPU profile
   was restored.
   [Native existing PNG refusal](./phase-5-packaged-project-image-export-research.md#existing-png-selected-through-the-kde-overwrite-prompt)
   The stock Model Manager removed one unshared IllustriousPhoto embedding
   after explicit review. Compare reported the missing resource after
   restart and kept the exact accepted reference and image.
   [Packaged managed embedding removal](./phase-5-packaged-noobai-component-remove-research.md)
   With the catalog rows still present and the managed IllustriousPhoto file
   absent, Compare led to the exact CivitAI version. Cancel kept the file
   missing. Confirmed Repair restored the exact digest and local IDs, and
   the accepted Project reopened byte-identical without a provider token.
   [Packaged managed embedding Repair](./phase-5-packaged-noobai-component-repair-research.md)
   The stock AppImage settled a prepared matrix of four interrupted
   Model Manager jobs. It removed staged and unreferenced files,
   preserved the exact installed model and terminal jobs, and left the
   same closed database bytes after the second startup.
   [Packaged model install startup](./phase-5-packaged-model-install-startup-research.md),
   [model install shutdown](./phase-5-model-install-shutdown-research.md).
   A live CivitAI VAE transfer also passed the stock Main-death check.
   The captured WAL kept the job downloading before recovery. On restart
   the same job became interrupted, the part disappeared, and a second
   normal close produced the same SQLite bytes.
   [Live model install interruption](./phase-5-packaged-model-install-interruption-research.md)
   Starting from that failed job, the stock AppImage preserved the empty
   catalog on review Cancel. A fresh confirmed review installed the exact
   VAE. The failed and completed jobs and the verified file survived a cold
   reopen.
   [Explicit CivitAI reinstallation](./phase-5-packaged-model-install-retry-research.md)
   A subsequent AppImage used **Retry** on the failed row. Cancel kept
   the failed job and empty catalog. Main refused the same-digest
   sibling, and confirmation installed just the original file. Both
   jobs and the verified bytes survived a cold reopen.
   [Install Queue Retry](./phase-5-model-install-queue-retry-research.md)
   **Clear finished** removed completed, failed and canceled history from
   the AppImage queue. The ready embedding and empty queue survived a cold
   reopen. Main controls also cleared old history during an active transfer
   that later completed.
   [Install Queue history](./phase-5-model-install-history-research.md)
   At 1380×900 on isolated X11, the AppImage returned visible keyboard
   focus from Retry, moved from Clear finished to Back to models and
   the catalog search, and returned to the Home launcher after Escape.
   [Model Manager queue keyboard](./phase-5-model-install-queue-keyboard-research.md)
   Private KDE Wayland repeated all five transitions through native KWin
   keys in the secure-store unavailable state. The X11 missing-token
   control also passed.
   [Native Install Queue keyboard](./phase-5-model-install-queue-wayland-research.md)
   The follow-up AppImage completed the same flow with default KDE wallet
   settings and returned missing without an existing token file. Its
   `basic_text` control retained the unavailable diagnostic. First-time
   secure Save and unlock with a stored token remain separate checks.
   [Fresh KDE token status](./phase-5-civitai-token-presence-research.md)
   The stock AppImage also blocked an affected running queue claim and
   canceled exactly the two explicitly reviewed pending jobs. Unrelated
   running and pending rows and all frozen inputs survived the operation.
   [Packaged queue-aware Remove](./phase-5-packaged-noobai-queue-remove-research.md)
   With the installed CUDA worker running a NoobAI EPS job, the stock
   AppImage showed one affected running job and kept Remove disabled
   after acknowledgement. The same job completed, and explicit Add,
   Save and reopen kept the accepted embedding. Repeat on the release
   candidate and across the supported matrix.
   [Packaged live Remove review](./phase-5-packaged-live-remove-research.md)
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
   with the installed CUDA worker. Both NoobAI EPS and V-prediction also passed
   Add, Undo, Redo, explicit Save and reopen after one real packaged generation
   each. Verify these flows on the shipping candidate across the supported matrix.
   [Packaged Raster history](./phase-5-packaged-raster-acceptance-history-research.md)
   In an owned stock AppImage profile, Main was killed after publishing the
   unsaved accepted EPS Raster to the autosave shadow. Cancel preserved the
   shadow and saved Project. Recover restored the exact Raster as dirty,
   and explicit Save and restart read it back with the original queue result.
   [Packaged Raster crash recovery](./phase-5-packaged-raster-crash-recovery-research.md)
   The stock AppImage canceled one prepared running and one pending job with
   `APP_RESTART`, preserved the prior cancellation and exact frozen inputs,
   and repeated the same Queue Manager readback on a second startup. Retry
   remained unavailable without an installed engine.
   [Packaged queue restart](./phase-5-packaged-queue-startup-recovery-research.md)
   After Main death during an owned NoobAI EPS CUDA job, the stock AppImage
   reopened the same saved Project and canceled the live job with `APP_RESTART`
   exactly once. Public Retry used the frozen inputs despite draft edits,
   produced the exact reference PNG, and preserved it through explicit Add,
   Save and reopen. Repeat on the shipping host matrix.
   [Packaged live queue recovery](./phase-5-packaged-live-queue-recovery-research.md)
   The stock AppImage compares the accepted NoobAI EPS
   result with its edited draft and saves an exact detached preset without Seed.
   The preset and Project reopen in a profile without an installed worker or
   models. [Packaged result preset](./phase-5-packaged-project-and-preset-research.md#compare-and-save-preset-from-result)
   Packaged Home opened the saved Project by keyboard at 1440×900. At
   900×620 the Recovery dialog cycled focus through all actions and returned
   it to the same Home card after Escape and Cancel, with a visible ring.
   [Packaged Home and Recovery keyboard](./phase-5-packaged-home-recovery-keyboard-research.md)
   The same saved Project and prepared shadow passed on native KDE Wayland.
   Two KWin runs and an X11 regression preserved the Project bytes and
   recovery on both keyboard dismissals.
   [KDE Wayland Home and Recovery keyboard](./phase-5-packaged-home-recovery-wayland-keyboard-research.md)
   Check joint Home/Trash, resource removal and export behavior, interrupted
   recovery, remaining keyboard/focus/contrast and performance at supported
   desktop sizes on the final candidate. [NoobAI matrix](../specs/01-implementation-roadmap.md#noobai-полная-поддержка-в-рамках-mvp),
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
