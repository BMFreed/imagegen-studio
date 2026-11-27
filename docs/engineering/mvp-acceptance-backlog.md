# MVP acceptance backlog

## MVP acceptance checklist

**We are qualifying the local candidate.** One pinned stock AppImage
passed installed-worker EPS/V, frozen Retry, historical-worker refusal
and exact model relink in step 4. The same source passed Setup and
Repair on ext4 with the qualification publisher. The stock Setup path
requires the production publisher in step 5.
The two-plinth reference swap failed the same visual gate in Studio and
installed InvokeAI. Explicit Refresh and indexed restart passed local
256-project checks. Early selection and preview also passed with one
workspace. Complete discovery and same-workspace Open remain open in step 2.
Retained update ownership remains open in step 3.

The [verification baseline and bounded packaged generation checks](#ordered-acceptance-work)
are complete for their recorded builds and fixtures. Check off a step when
its acceptance criteria pass. Link the result with the tested build,
environment and remaining limits, and update the current stage and next run.

### Local candidate

- [ ] **1. Qualify visual generation utility.** On Anima, verify two-seed
      regional object placement with swapped assignments and test local negative
      independently. On official Illustrious XL v0.1, verify visible influence
      from swapped references while preserving the scene. For Smart Inpaint,
      verify useful insertion and preservation of protected pixels. Use
      no-region controls and record human verdicts.
      [Anima visual results](./phase-4-anima-smart-regional-public-research.md#connected-smart-edit-with-the-same-regional-masks)
      · [Illustrious visual results](./phase-4-regional-reference-placement-research.md)
  - [x] Named both subjects in the Anima tabletop global positive. Both
        ordinary controls and three regional assignments passed. The
        seed-124 swap centered the apple inside the mug in Studio and
        in a matched run of the current Invoke denoiser.
        [Global subject and Invoke comparison](./phase-4-anima-countertop-global-subjects-research.md)
  - [x] Ran ordinary Smart Inpaint on official Illustrious XL v0.1 and
        the matched installed InvokeAI graph. Both preserved all 163,636
        protected pixels and failed the single grounded apple criterion.
        [Smart Inpaint tabletop comparison](./phase-4-illustrious-smart-tabletop-research.md)
  - [x] Checked responsiveness to the Anima apple negative across the full
        image. The apple remained recognizable with the image-wide phrase
        and both earlier local assignments. The local suppression gate
        stays open.
        [Image-wide negative control](./phase-4-anima-apple-negative-research.md#image-wide-negative-on-the-same-apple)
  - [x] Compared the failed Illustrious two-plinth assignment and swap
        with installed InvokeAI. Both engines failed recognizable
        placement on the held recipe.
        [Matched comparison](./phase-4-regional-reference-placement-research.md#matched-installed-invokeai-control)
  - [x] Compared one film-camera reference on each of the same plinths.
        Both engines produced lens-like fragments, and the camera body
        remained unreadable on the right. The visual placement gate
        stays open.
        [Single-reference comparison](./phase-4-regional-reference-placement-research.md#a-single-reference-on-either-plinth)
- [ ] **2. Close remaining UI and data checks.** Finish the keyboard, focus,
      contrast and Home performance checks on the candidate.
  - [x] The stock AppImage kept Trash across workspace removal and restart,
        refused Restore with a different folder registered, and restored the
        exact Project after native selection of the original folder.
        [Workspace and Trash result](./phase-5-packaged-workspace-chooser-research.md#restore-trash-after-re-registering-its-workspace)
  - [x] Native keyboard input kept focus in Remove Workspace. Escape returned
        focus to the workspace action, confirmation focused Home search and
        the search placeholder passed the sampled text contrast threshold.
        [Workspace focus and search contrast](./phase-5-packaged-workspace-chooser-research.md#workspace-removal-focus-and-search-contrast)
  - [x] The stock Updates dialog opens from Help by keyboard, contains focus,
        and returns it to Help on Escape or Close. Chromium exposes the
        corrected modal semantics and the four sampled labels meet 4.5:1
        text contrast at 900×620.
        [Native Updates result](./phase-5-application-updates-keyboard-research.md#packaged-verification)
  - [x] Saved generations exposes a modal dialog in Chromium and retains
        visible keyboard focus through Tab, Shift+Tab, Escape and Close.
        Both stock AppImage FUSE lifetimes also preserved the exact
        34 saved history records and navigated to the expected layers.
        [Native Saved generations result](./phase-5-stock-appimage-fuse-research.md#saved-generations-keyboard-and-modal-semantics)
  - [x] Canceling the system folder chooser from Add Workspace restores
        visible focus to the name field or the submit button. Escape returns
        focus to Home. The name and color survived cancellation and were used
        by the subsequent successful registration.
        [Native Add Workspace result](./phase-5-packaged-workspace-chooser-research.md#keyboard-focus-after-canceling-add-workspace-folder-selection)
  - [x] Canceling Locate Folder from the Home warning returns focus to the
        action with the cached workspace intact. Workspace Settings opens from
        the sidebar as a modal, keeps Tab inside, and returns focus after Escape.
        Four sampled labels meet 4.5:1 at 900×620.
        [Native Locate and Settings result](./phase-5-packaged-workspace-chooser-research.md#locate-folder-cancellation-and-workspace-settings)
  - [x] Canceling the real KDE Locate Project chooser returns visible focus
        to the Inspector action on the rebuilt AppImage. The Chromium
        regression also preserves focus if the user has moved it to File.
        [Locate Project focus](./phase-5-packaged-project-locate-research.md#keyboard-focus-after-cancel)
  - [x] The stock AppImage located a moved Project in another registered
        workspace through KDE. It preserved the original key, accepted Raster
        and distinct neighboring revision through close and explicit reopen.
        [Cross-workspace Locate](./phase-5-packaged-project-locate-research.md#cross-workspace-locate-on-kde-wayland)
  - [x] After a keyboard-confirmed Move to Trash, the AppImage visibly
        focuses Search projects in the current Home view. The closed Project
        and its Trash record survive restart, and the neighboring Project
        survives Restore and permanent deletion of the target.
        [Native Move to Trash result](./phase-5-packaged-project-and-preset-research.md#keyboard-focus-after-move-to-trash)
  - [x] Both AppImage launches discovered all 256 four-Raster Projects,
        opened saved previews and preserved the archives and index through
        normal close.
        [256-project catalog result](./phase-5-packaged-home-scale-research.md#256-projects-with-four-raster-layers-each)
  - [x] Folder selection uses the complete catalog and passed at 0.18–0.38 s
        on the 256-project fixture. The same AppImage passed native workspace
        removal and Trash restoration.
        [Home navigation result](./phase-5-packaged-home-scale-research.md#browse-folders-from-a-completed-home-catalog)
  - [x] Explicit Refresh on the pinned AppImage discovered a replacement,
        addition and move on a 32-project corpus after restart.
        [Pinned Refresh control](./phase-5-packaged-home-scale-research.md#external-changes-on-the-pinned-candidate)
  - [x] On the 256-project layered fixture, aggregate Refresh fell from
        19.43–22.46 s to 3.09–3.30 s across the two local lifetimes.
        [Archive reuse result](./phase-5-packaged-home-scale-research.md#reuse-validated-metadata-for-byte-identical-archives)
  - [x] On the 256-project fixture, deferring discovery brought visible Home
        from 6.10–6.38 s to 3.11–3.19 s. The full catalog still took
        22.23–22.93 s on the candidate. Complete-catalog response time
        remains open.
        [Cold Home startup comparison](./phase-5-packaged-home-scale-research.md#discover-projects-after-the-home-window-opens)
  - [x] Profiled the first complete 256-Project Main catalog with both a fresh
        and an existing SQLite index. PNG member reads and validation took
        7.56–7.69 s.
        [Cold Main timings](./phase-5-packaged-home-scale-research.md#time-spent-on-the-first-256-project-catalog)
  - [x] Cached validation across restart brought all 256 cards from 20.73 s
        to 6.88 s in the matched AppImage check. Archive changes still
        trigger full validation and saved history rebuilds from `.igs`.
        The sampled fresh profile took 19.79 s to show all cards.
        [Indexed restart comparison](./phase-5-packaged-home-scale-research.md#reuse-full-archive-validation-on-indexed-restart)
  - [x] The matched AppImage check on 256 Projects with repeated Raster
        bodies brought first discovery from 21.23 s to 10.26 s. A separate
        Main-only comparison with 1,024 distinct Raster bodies measured
        medians of 10.67 s before and 10.08 s after, with overlapping ranges.
        New PNG bytes still receive the full structural check.
        [First discovery comparison](./phase-5-packaged-home-scale-research.md#reuse-structural-validation-for-repeated-png-members-during-discovery)
  - [x] Measured 1,024 distinct Raster bodies on the same AppImage as the
        repeated-layer control. The fresh profile showed Home at 3.61 s,
        its first selectable card at 22.55 s and all 256 cards at 22.56 s.
        Indexed restart reached all cards in 7.58 s. First discovery still
        leaves Home waiting for the complete catalog.
        [Distinct-layer AppImage measurement](./phase-5-packaged-home-scale-research.md#first-packaged-discovery-with-distinct-raster-bodies)
  - [x] On the same distinct-layer fixture, Home exposed the first 64
        verified cards at 6.86 s. A separate AppImage run decoded the selected
        saved preview at 8.78 s while the remaining folders were still scanning.
        Complete discovery remains a separate check.
        [First verified workspace](./phase-5-packaged-home-scale-research.md#show-the-first-verified-workspace-during-initial-discovery)
  - [x] On the same cohort the ordinary Open prepared the exact editor at
        163 of 256 indexed Projects. The previous AppImage reached that
        editor with all 256 rows already indexed. Opening can still wait
        for the currently scanned workspace.
        [Open during initial discovery](./phase-5-packaged-home-scale-research.md#open-a-verified-project-during-the-first-home-scan)
  - [x] Compared complete discovery on the same 256 Projects. Main did
        160 fewer PNG decodes with a bounded cache that keeps recent
        verifications. Both AppImages rendered all cards in about 21 s
        on the local software Wayland configuration. A broader speed
        target and supported-host coverage remain open.
        [Full-discovery comparison](./phase-5-packaged-home-scale-research.md#reuse-recent-png-checks-throughout-a-large-workspace-scan)
  - [x] On 256 distinct-layer Projects in one empty workspace index,
        Home exposed 60 verified cards at 6.98 s without a click, down from
        19.78 s for the first card on the control. Full discovery in these
        runs took 19.90 s and 19.88 s respectively. A separate run decoded
        the selected saved preview while only 60 cards were visible.
        [Single-workspace first scan](./phase-5-packaged-home-scale-research.md#show-verified-projects-during-the-first-scan-of-a-single-workspace)
- [ ] **3. Finish interrupted application-update recovery.** Saving and
      launching a signed recovery copy and applying the next signed update from
      that path already passed locally. Manual archive procedures for
      dedicated and shared local folders passed controlled ext4 runs.
      General ownership of legacy writers during a live session remains open.
      [Update ownership and recovery](./phase-5-application-update-interruption-research.md#interrupted-and-adjacent-paths)
  - [x] Signed D reached Review and preflight after C on the used recovery
        path. Both refused before any close callback and preserved the
        two retained stages. The same D passed preflight on a fresh C
        path in the transaction fixture.
        [Next-release control](./phase-5-application-update-interruption-research.md#a-subsequent-release-on-the-used-recovery-path)
  - [x] The AppImage refused D Review from the used C path. The native
        KDE dialog saved signed D to a new path with both older stages intact.
        C kept the dirty draft until explicit Project Save. D reported
        recovery clear and opened that exact revision.
        [Repeated native recovery](./phase-5-packaged-recovery-kde-next-update-research.md#a-subsequent-signed-recovery-on-a-fresh-path)
  - [x] A live unleased writer replaced the target while signed target and
        runtime verification had matched and the cooperating lock was held.
        A fresh inspection demoted both matches and preserved recovery data.
        [Signed runtime ownership control](./phase-5-application-update-interruption-research.md#a-signed-runtime-match-and-an-unleased-writer)
  - [x] A stage prepared after eligible Review caused the AppImage to
        refuse Install and Refresh with save-and-restart guidance.
        Manual dismissal preserved the dirty Project and signed download.
        Explicit Save and cold reopen preserved the new revision.
        [Native late-stage refusal](./phase-5-application-update-interruption-research.md#prepared-stage-after-review-on-the-appimage)
  - [x] KDE supplied an occupied AppImage path after its overwrite prompt.
        Studio preserved the file and retried with the same signed download
        at a fresh path. Both lifetimes closed normally with the exact
        Project and old stage preserved.
        [Occupied recovery destination](./phase-5-packaged-recovery-kde-chooser-research.md#an-occupied-recovery-destination-selected-through-kde)
  - [x] With the same version in the signed feed, the AppImage reported
        up-to-date. KDE Cancel and Save published a verified copy to a new
        path using only the local target. The copy reopened the exact
        Project and the original stage and backup stayed intact.
        [Recovery without a newer release](./phase-5-application-update-interruption-research.md#recovery-without-a-newer-release)
  - [x] After normal exit and physical readback of the controlled
        AppImage processes, the ext4 fixture archived the dedicated
        original folder with its image, stage, backup and lock intact.
        The verified copy reopened the exact Project from a separate
        path. A live descriptor control shows why the real operation
        requires exclusive offline access.
        [Dedicated folder archive](./phase-5-application-update-interruption-research.md#archive-a-dedicated-old-appimage-folder-after-exit)
  - [x] In a shared ext4 folder, the old AppImage and exact stage moved
        separately after the controlled processes exited. Both occupied
        destinations refused replacement. Between moves the inspector
        retained the old stage. The original lock and neighbors kept
        their identities and the verified copy reopened the exact Project.
        [Shared folder archive](./phase-5-application-update-interruption-research.md#archive-one-old-appimage-from-a-shared-folder)
- [x] **4. Qualify the rebuilt local candidate on RTX 4080.** The exact
      stock AppImage passed SQLite migration and backup, Generate → Add →
      Save → reopen, queue recovery and frozen Retry, NoobAI EPS/V, exact
      model relink and incompatible-worker refusal. Setup and Repair
      passed on ext4 with the matching production assets and the signed
      qualification publisher. Production delivery remains in step 5.
      [Packaged upgrade and worker Repair](./phase-5-packaged-runtime-protocol-repair-research.md)
  - [x] **Check again** in the open AppImage distinguished the two runtime
        recovery states after confirmed installer exit. Cold launches matched
        both observations.
        [Same-window recheck](./phase-5-packaged-runtime-installation-recovery-research.md#check-again-after-installer-exit-in-the-open-appimage)
  - [x] The pinned stock AppImage ran both NoobAI objectives on the
        RTX 4080. V passed Add, Undo, Redo, Save and reopen. EPS recovered
        one live CUDA job after Main death, completed frozen Retry and
        preserved the accepted Raster through Save and reopen.
        [Pinned candidate results](./phase-5-pinned-stock-candidate-research.md)
  - [x] The same AppImage backed up and migrated historical DB29, refused
        Generate and Retry with a protocol-2 worker, and preserved the
        historical Project and queued inputs across Save and reopen.
        [Historical refusal and migration](./phase-5-pinned-stock-candidate-research.md#historical-db29-and-incompatible-worker-refusal)
  - [x] The pinned candidate source passed explicit Setup, fresh-slot
        Repair and two cold readiness checks on ext4 with the signed
        qualification publisher.
        [Setup and Repair result](./phase-5-pinned-stock-candidate-research.md#candidate-setup-and-repair-on-ext4)
        [Replay matching the rebuilt stock](./phase-5-pinned-stock-candidate-research.md#setup-and-repair-with-the-rebuilt-candidate-on-ext4)
  - [x] The stock AppImage linked the exact Cyberfalafel v1.2 file with
        v1.1 as Default and preserved the accepted Raster and provenance
        through explicit Save and cold reopen.
        [Exact model relink](./phase-5-pinned-stock-candidate-research.md#exact-model-relink-on-the-stock-candidate)
        [Independent replay on 8a8af921](./phase-5-pinned-stock-candidate-research.md#exact-model-relink-replay-on-8a8af921)
        [Replay on the rebuilt stock](./phase-5-pinned-stock-candidate-research.md#exact-model-relink-on-the-rebuilt-stock-appimage)
  - [x] The rebuilt AppImage migrated a seeded DB29 profile twice, including
        after manually copying the chosen backup. The saved Project and the
        displaced database with its committed WAL survived both startups.
        [SQLite recovery on the rebuilt AppImage](./phase-5-packaged-sqlite-manual-recovery-research.md#replay-on-the-rebuilt-stock-appimage)
  - [x] On the rebuilt AppImage, the retained historical DB29 profile
        migrated after backup. The real installed worker announced an
        incompatible protocol in isolation. Generate and Retry refused,
        and the historical Raster and frozen queue inputs survived Save
        and cold reopen.
        [Historical refusal on the rebuilt AppImage](./phase-5-pinned-stock-candidate-research.md#historical-refusal-on-the-rebuilt-stock-appimage)
  - [x] The rebuilt AppImage ran the exact NoobAI V recipe with the
        compatible CUDA worker and confirmed Add, Undo, Redo, Save
        and cold reopen.
        [NoobAI V on the rebuilt AppImage](./phase-5-pinned-stock-candidate-research.md#noobai-v-on-the-rebuilt-stock-appimage)
  - [x] The rebuilt AppImage recovered the interrupted EPS CUDA job and
        completed frozen Retry despite edited draft settings. Explicit Add,
        Save and cold reopen preserved the accepted Raster and provenance.
        [EPS recovery on the rebuilt AppImage](./phase-5-pinned-stock-candidate-research.md#noobai-eps-interruption-on-the-rebuilt-stock-appimage)

### Public release

- [ ] **5. Configure production delivery.** Publish signed runtime metadata
      and artifacts, provide the trusted public Ed25519 key and configure the
      AppImage update channel. The production runtime URLs and public publisher
      key are still unavailable. [Delivery gates](#scope-and-delivery-gates)
- [ ] **6. Qualify delivery on supported Linux/NVIDIA hosts.** Pin the
      driver, CUDA and VRAM matrix. Exercise clean installation, upgrade with
      existing data, damaged download and interrupted update recovery. Verify
      actual post-upgrade generation with the installed worker and models.
      [Release criteria](../specs/01-implementation-roadmap.md#фаза-5-первый-linuxnvidia-релиз)
- [ ] **7. Record release acceptance.** Save the AppImage, runtime and model
      identities and the results for supported scenarios. Update each promise
      and its matrix row together when the production flow passes.
      [Promise matrix](../product-promises.md)

## Background

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
[mug IMG with explicit color emphasis](./phase-4-ordinary-img-mug-weight-research.md) and
[native first CivitAI Save](./phase-5-civitai-token-presence-research.md#integrating-setup-into-save).
The [two-plinth regional placement comparison](./phase-4-regional-reference-placement-research.md#matched-installed-invokeai-control)
passes native execution in Studio and installed InvokeAI. The fixed
recipe fails recognizable placement in both, and visual regional utility
remains open.
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
   At `4edf900e` the browser suite reached 368 unique passes by matching
   194 completed cases from the bounded run and executing the 174 remaining
   cases in seven disjoint batches. [Browser coverage](./phase-4-home-missing-remove-research.md#complete-browser-coverage-after-the-deadline)
   On checkout `0886a840`, all 246 focused Main and shared-contract tests
   passed across ten SQLite, Projects and application-update files. The three
   Updates and Model Manager browser files passed all 67 cases. Together with
   the previous 33 Home cases, this covers the four changed browser files
   since `4edf900e` and the Home prototype file on the rebuilt candidate.
   Receipts are in `runs/candidate-regression/20261127` under the artifact root.
   The follow-up matched all **377 browser cases** by test ID, file, source
   position and full title. It carried 111 recorded passes and added 265
   passes across ten disjoint batches. The remaining Preset Manager case
   had clicked an already expanded Prompt section, then waited for its
   hidden textarea. The repaired case edits the visible draft and still
   checks that creation requires confirmation. Its isolated rerun passed.
   The original timeout, screenshot and trace remain with the combined
   coverage receipt in `runs/prototype-browser-completion/20261127-r1`.
   The complete application-update test matrix initially exposed four
   permission-fixture failures under `umask 077`. A 22-case control
   passed under `022`. The fixtures now set their intended permissions
   explicitly. The repeated matrix under `077` finished with 644 passes,
   zero failures and the existing unsupported-host skip.
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
   native requests completed. Installed InvokeAI reproduced the same
   failed placement. Both blind reviewers found no recognizable pair
   in either treatment in either engine. Any further visual trial
   needs a distinct acceptance question.
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
   A matched tabletop follow-up raised both local subject spans to 1.5.
   The ordinary controls replayed exactly, and all four new regional PNGs
   retained the background. The same two of four placements passed.
   The 123 assigned frame still overlapped the subjects at the center
   and the 124 swapped frame still omitted the apple.
   [Weighted tabletop subjects](./phase-4-anima-countertop-subject-weight-research.md)
   The touching-mask comparison closed the 64-pixel strip using
   the original unweighted prompts. All six installed CUDA requests
   completed and both ordinary controls matched byte for byte. Blind
   review found the background intact in all six frames and passed one
   of the four regional placements, down from two with the strip. The
   two-seed placement criterion remains open.
   [Touching tabletop masks](./phase-4-anima-countertop-gap-closed-research.md)
   The matched original Invoke source at seed 123 reproduced the same
   visual result. The ordinary scene and swapped placement with a gap
   passed, and the swapped touching-mask case lost the recognizable apple.
   Compiled prompts and token-grid permissions agreed across the measured paths.
   [Current Invoke comparison](./phase-4-anima-countertop-gap-closed-research.md#matched-current-invokeai-source-comparison)
   Naming both subjects in the global positive preserved the apple and
   mug in all six frames and increased correct opposing assignments from
   two to three out of four. The seed-124 swap put the apple inside the
   mug near the center. The matched current Invoke denoiser passed the
   ordinary and assigned cases and repeated the same swapped result.
   [Anima global subjects](./phase-4-anima-countertop-global-subjects-research.md)
   A frozen Smart Inpaint follow-up completed three installed CUDA requests.
   Exact compositing preserved all 179,368 zero-contribution pixels in each
   result. Both blind readers passed the ordinary control. The assigned mug
   crossed the protected center and lost part of its silhouette. The swapped
   pair occupied the intended areas and had visible joins along the table.
   Both defects were present in the decoded processing outputs. The
   matched original Invoke denoiser reproduced both defects with the
   same source, KEEP and regional conditioning. Both ordinary controls
   passed the six-image blind review. Regional insertion visual utility
   remains open on this scene.
   [Smart Inpaint tabletop insertion](./phase-4-anima-smart-regional-public-research.md#installed-tabletop-insertion-with-a-frozen-smart-mask)
   [Matched original Invoke](./phase-4-anima-smart-regional-public-research.md#matched-original-invokeai-inpaint-comparison)
   Filling only the gap in the Smart mask retained exact outside pixels
   and removed the interrupted silhouettes and table steps. Both connected
   regional cases produced a single centered mug with no recognizable apple.
   The connected ordinary control kept both subjects. This one-variable
   trial leaves regional placement open on the scene.
   [Connected Smart edit](./phase-4-anima-smart-regional-public-research.md#connected-smart-edit-with-the-same-regional-masks)
   An ordinary Smart Inpaint control using official Illustrious XL v0.1
   preserved all 163,636 zero-contribution pixels. Studio and installed
   InvokeAI produced byte-identical contribution masks. Both outputs
   failed the one-apple insertion criterion and showed a visible join.
   [Illustrious Smart Inpaint control](./phase-4-illustrious-smart-tabletop-research.md)
   The red-apple IMG follow-up has a frozen baseline, a treatment over
   the apple and a spatial control over the mug. CPU preparation verified
   exact decoded source pixels and local negative owners. Three installed
   CUDA calls finished. Both blind readers found a wooden box in all
   outputs. Baseline and spatial control lost both original subjects, so
   local negative utility stays open for this trial.
   [Anima red-apple negative](./phase-4-anima-apple-negative-research.md)
   The matched follow-up names the apple and mug in their respective
   local positives. The installed CUDA baseline passed on the frozen
   source and seed. Both visual readers recognized both objects on their
   original sides. The three-request follow-up replayed the baseline
   byte for byte and preserved both subjects in the right-mask control.
   The apple remained recognizable with the negative on its own mask as
   well. Selective suppression stays unqualified on this source and seed.
   The current original Invoke denoiser on the same prepared apple
   source also retained the recognizable apple in all three cases. The
   measured source differences offer no verified fix for this recipe.
   [Baseline with named subjects](./phase-4-anima-apple-negative-research.md#baseline-with-named-subjects),
   [spatial comparison](./phase-4-anima-apple-negative-research.md#installed-spatial-result),
   [matched Invoke source comparison](./phase-4-anima-apple-negative-research.md#current-original-invoke-denoiser-on-the-matched-apple-scene).
   The held recipe also retained the apple with the same weighted phrase
   added to the global negative and both local negatives cleared. Both
   blind readers recognized both objects and the scene in all four
   matched Studio images.
   [Global negative control](./phase-4-anima-apple-negative-research.md#image-wide-negative-on-the-same-apple)
   Retain the IMG pilots and record a new hypothesis before any further
   visual run. Record all images and a human acceptance verdict. Consult model-aware
   settings and the guards before classifying additional combinations as supported.
   The representative Illustrious 512×512 IMG case with three separately masked
   references completed on the RTX 4080 with 9.50 GiB peak group RAM and
   8,852 MiB maximum sampled worker VRAM. A saved Project with four references
   refused Generate before capture or admission and preserved queue and Project
   state. The next installed run accepted three originals totaling 95.61 MiB,
   including exact width and area boundaries. The genuine importer refused
   adjacent width, height and area overflows. A saved reference just above
   32 MiB refused Generate before capture or queue admission. The allowed
   run reached its 12 GiB memory cap without an OOM. The exact stored byte
   follow-up held the same 96 MiB aggregate across both saved states. Main
   refused a one-byte per-file overflow and the installed worker completed
   the three-file exact-cap IMG control. The joint follow-up completed one
   installed IMG job with the same 96 MiB and 191,995,904 decoded pixels,
   including two exact 64-million-pixel originals and one maximum-width
   original. The one-byte overflow still refused before capture or admission.
   Same-host replays completed with separate 8 GiB and 6 GiB cgroup limits
   and exact PNG parity. Their observed group peaks were 5.69 GiB and
   5.61 GiB. Different hardware and concurrent host capacity remain open.
   [Reference capacity](./phase-4-regional-reference-capacity-research.md#original-png-dimensions-and-near-limit-byte-capacity),
   [exact stored byte limits](./phase-4-regional-reference-capacity-research.md#exact-stored-png-byte-boundaries),
   [joint byte and geometry capacity](./phase-4-regional-reference-capacity-research.md#exact-stored-bytes-with-large-original-geometry),
   [lower cgroup caps](./phase-4-regional-reference-capacity-research.md#same-host-replay-at-8-gib-and-6-gib),
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
   and reopened the original ready runtime. After a real installation owner
   died before pointer publication, the stock AppImage kept the previous
   pointer and cleared the dead claim. After death during post-activation
   qualification, it kept the candidate pointer, journal and claim and showed
   that recovery was required. Stock AppImage startup while the exact owner
   was still alive showed the recovery notice at both cuts and kept the
   runtime files and installation claim. The same Project opened before
   and after owner exit at both cuts. A
   separate manager check with an empty release loader refused the uncertain
   Repair before contacting that loader. Repeat on the shipping artifact and
   supported host matrix when the publisher is available.
   The measured inputs imply a floor of 28,217,106,280 B on one filesystem
   before the new slot and any Repair reserve. It includes the signed 20 GiB
   assembly floor, the exact cached and extracted runtime and LaMa. Repair
   also keeps the previous good slot. The passing run recorded 65.04 GB free
   at Setup consent and 43.72 GB at Repair consent on ext4.
   [Packaged Setup controls](./phase-5-packaged-runtime-setup-research.md),
   [Clean Setup and Repair](./phase-5-packaged-runtime-setup-repair-research.md),
   [Packaged rollback](./phase-5-packaged-runtime-rollback-research.md),
   [Packaged startup with live and exited installers](./phase-5-packaged-runtime-installation-recovery-research.md),
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
   The local AppImage also reopened the real post-rename `activating` stage
   after its owned installer exited. Updates kept recovery required and the
   target unverified, while the completed-stage control verified the same
   signed target. Both preserved the original path and backup and reopened
   the same Project from the separately saved signed recovery copy.
   [Native startup after the publication cut](./phase-5-packaged-recovery-kde-chooser-research.md#startup-after-replacement-before-the-activation-journal)
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
   A separate stock AppImage run used the native KDE directory picker for
   Add Workspace and Locate Folder. Cancel kept the Add draft and the existing
   Locate registration. Locate refused a folder with one different saved
   document, then repointed both exact Projects together after the owner moved
   the original folder. Both Project keys and bytes survived, and a Project
   reopened from the new path after restart.
   [Native workspace folder chooser](./phase-5-packaged-workspace-chooser-research.md)
   The current stock AppImage repeated that folder flow through direct Type 2
   FUSE launch. The same package also passed Saved generations in FUSE and
   extract-and-run mode. It opened the exact seed-zero Raster and focused an
   inactive Smart Patch variant in the other Project. Both saved Projects and
   all 34 history results survived reopen. All five FUSE mounts released on
   ordinary close. Clean-machine setup and the shipping host matrix remain open.
   [Stock FUSE and Saved generations](./phase-5-stock-appimage-fuse-research.md)
   On this KDE Wayland host, the stock AppImage now opens a managed `.igs`
   from the command line at cold launch and forwards a relative path from
   a second process to the existing window. It reuses an open tab with
   unsaved edits, waits for open dialogs, and uses the ordinary Copy or
   Move confirmation for an external file. The exact Projects and closed
   index survived cancellation and reopen. Test file associations and deep
   links separately when shipping their desktop integration.
   [Project path handoff](./phase-5-project-launch-research.md)
   Stock AppImage Home blocks Trash while the Project is open. After close it
   preserves the exact saved Project across Trash, restart and Restore. Confirmed
   permanent deletion retires only the target and preserves a neighboring Project
   and file. [Packaged Trash](./phase-5-packaged-project-and-preset-research.md#home-trash)
   On native KDE Wayland at 900×620, the destructive confirmation opened on
   Cancel and trapped Tab in both directions. Escape and Cancel returned focus
   to the Delete action. Restore and confirmed Delete now leave visible focus
   in the Trash search when the row disappears. The exact Project and its
   neighbor passed the existing persistence controls.
   [Trash keyboard focus](./phase-5-packaged-project-and-preset-research.md#trash-keyboard-focus-on-kde-wayland)
   A follow-up made Enter select the focused Trash project in Grid and List.
   Native Wayland showed selected state, the Project Inspector and continued
   Home focus in both layouts. The regular project still opened in the current
   tab. [Enter on Home cards](./phase-5-packaged-project-and-preset-research.md#enter-on-home-project-cards)
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
   A combined stock AppImage run exported both PNGs, put the saved Project
   in Trash, and refused Open before and after cold startup. Restore kept
   the same Project identity, inode, exact .igs and accepted index. Both
   repeat exports matched their original PNG bytes.
   [Trash and export after Restore](./phase-5-packaged-project-image-export-research.md#trash-cold-restart-and-both-exports-after-restore)
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
   `basic_text` control retained the unavailable diagnostic.
   [Fresh KDE token status](./phase-5-civitai-token-presence-research.md)
   With a provisioned, locked KDE wallet, the stock AppImage passed
   live CivitAI Save, cold unlock and revalidation, Remove and cold
   missing. On a fresh standard KDE profile, the Model Manager Save button
   now completes native wallet creation and writes `v11` in the same process
   on KWallet 6.24 and 6.29. On 6.29, cancel and explicit retry passed. A custom
   empty profile preserved its settings, and a normal close during setup
   exited the helper. Chromium's Linux fixed-key fallback is refused.
   Existing fallback files can be removed explicitly. The same AppImage
   repeated the native Install Queue keyboard transitions and Clear finished.
   Repeat on the shipping candidate across the supported desktop matrix.
   [Secure Save and wallet bootstrap](./phase-5-civitai-token-presence-research.md#integrating-setup-into-save)
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
   The local signed qualification AppImage joined DB29 upgrade, installed
   protocol-2 refusal and explicit staged Repair in one owned profile.
   A distinct protocol-1 slot reached Ready again on cold startup. The
   original slot, historical Raster and frozen Retry inputs survived.
   Explicit Save produced both CPU previews and the exact package reopened.
   A third AppImage lifetime used the repaired slot for one real NoobAI EPS
   CUDA job with a separate exact checkpoint. Both PNGs matched the earlier
   control. Add, Save and reopen retained the accepted Raster and provenance,
   while the historical canceled job and its frozen inputs survived.
   Repeat on the shipping artifact and supported host matrix.
   [Historical protocol Repair](./phase-5-packaged-runtime-protocol-repair-research.md)
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
   Stock AppImage Home completed the 32- and 512-project catalog checks on
   KDE Wayland. Sharing discovery within one Home request lowered the observed
   512-card indexed restart from 11.21 to 8.72 seconds and its Refresh from
   6.85 to 3.69 seconds. The latter run independently confirmed that explicit
   Refresh picked up a replacement, a new file and a moved file. The fixtures
   use small synthetic Projects on this host. A matched 128-Project check
   across three folders also passed with 1024×1024 Rasters and merged previews.
   It measured 5.72 seconds to the complete list on indexed restart and 2.48
   seconds for aggregate Refresh. All three scoped views, a scoped Refresh,
   Inspector previews and the closed indexes passed. A matched CPU run with
   128 projects and up to four 1024×1024 Rasters per project qualified the
   Main catalog, external Refresh and preview resources. A matched AppImage
   run at 900×620 in private software-rendered KWin then passed the layered
   catalog, folder navigation, Refresh and saved Inspector previews. The
   four-layer profile took 23.82 s to all cards and 18.81 s for Refresh on
   indexed restart under the CPU limit. A 256-project layered catalog now
   passes the same interactions and records the remaining response time gap.
   Qualify response time and the supported host matrix.
   [Home catalog performance](./phase-5-packaged-home-scale-research.md#packaged-comparison)
   [Linked-workspace measurements](./phase-5-packaged-home-scale-research.md#linked-workspace-measurements)
   [Four Raster layers in Main](./phase-5-packaged-home-scale-research.md#four-raster-layers-per-project-in-main)
   [Layered AppImage measurements](./phase-5-packaged-home-scale-research.md#multi-layer-home-in-the-appimage-renderer)
   [256-project layered AppImage](./phase-5-packaged-home-scale-research.md#256-projects-with-four-raster-layers-each)
   Home now reuses the current scan's archive validation for terminal
   shadow checks. The matched four-Raster Main Refresh improved from
   7.90 s to 4.50 s. Dirty shadows and files replaced during the
   request go through the full reader. The current AppImage passed both
   four-Raster lifetimes on private KDE Wayland and reached all 128 cards
   on indexed restart in 11.96 s.
   [Per-request archive validation](./phase-5-packaged-home-scale-research.md#reuse-archive-validation-within-one-home-request)
   The combined Home request now updates the sidebar count when a retry
   discovers a Project in a folder that has just returned.
   [Workspace retry regression](./phase-5-packaged-home-scale-research.md#sidebar-count-after-a-workspace-returns)
   Keyboard confirmation of Remove from Home now restores visible focus to
   search when the missing entry disappears. Escape returns to the original
   Inspector action. Both paths passed in the built Electron app on private
   KWin with real SQLite and Project files.
   [Remove from Home keyboard focus](./phase-4-home-missing-remove-research.md#keyboard-focus-after-the-missing-entry-disappears)
   The Model Manager removal dialog now starts on Cancel and requires a
   separate acknowledgement. Escape returns focus to the original action.
   On confirmed removal, focus moves to catalog search. Built Electron
   passed both paths on private KWin with real removal and catalog reopen.
   [Model Manager removal keyboard focus](./phase-4-model-removal-usage-research.md#keyboard-focus-after-local-resource-removal)
   Queue Manager now restores visible focus after confirming a single
   history-row deletion. At 900×620, trusted KDE Wayland input passed ten
   checks, including Escape, deletion with neighbors and the last row.
   The accepted Project and remaining frozen inputs stayed exact, and
   the final empty queue persisted on restart.
   [Queue Manager Delete focus](./phase-5-generation-queue-delete-focus-research.md)
   The restored controlled-worker Electron smoke passed all 36 checks,
   including confirmed bulk Clear with an unaccepted candidate, and
   verified the saved Project, draft and last seed after cleanup.
   [Generation-action smoke recovery](./phase-5-generation-queue-delete-focus-research.md#generation-action-smoke-recovery)
   Trusted keyboard input now dismisses only the Clear history menu on
   the first Escape. At 900×620, all 32 checks passed for the All terminal
   flow, including cancellation, exact cleanup and cold Project reopen.
   The controlled-worker smoke now includes this dismissal regression
   and passes all 37 checks.
   [Clear history keyboard dismissal](./phase-5-generation-queue-delete-focus-research.md#clear-history-keyboard-dismissal)
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
