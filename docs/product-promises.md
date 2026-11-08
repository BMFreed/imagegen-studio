# Product Promises

Этот документ фиксирует продуктовые обещания ImageGen Studio и явные
не-обещания рядом с ними. Это нормативные ограничения для product scope, UX,
прототипов и production-реализации, а не набор маркетинговых слоганов.

Публично использовать обещание можно только тогда, когда его подтверждают
реальный пользовательский flow, UI и тесты. До этого оно остаётся принятым
направлением продукта и ограничивает новые решения, но не выдаётся за уже
готовую возможность.

Каждое обещание в этом реестре должно отвечать на четыре вопроса:

1. Что именно получает пользователь?
2. Какую понятную выгоду это даёт?
3. Чего продукт сознательно не обещает?
4. Подтверждено ли обещание реальным пользовательским flow?

Точные domain contracts, UX-решения, data boundaries, prototype gaps и
проверяемые инварианты живут в linked supporting contracts. Они доказывают и
ограничивают обещание, но не должны превращать его формулировку в feature spec.

## Матрица обещаний

Публичный статус относится к готовому продукту. Прототип может доказывать
взаимодействие, но не заменяет filesystem, worker или persistence evidence.

| ID     | Пользовательский результат                | Продуктовый статус   | Публичный статус | Supporting contract и evidence/gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ----------------------------------------- | -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PP-001 | Готовый понятный интерфейс                | Принятое направление | Пока не обещать  | [Global Anima regional LoRA](./engineering/phase-4-anima-regional-lora-research.md): ROOT1653 Main/652 distinct Python/210 browser PASS; existing Invoke/ordinary exact stack across TXT/IMG/OUT, additive combination capability including enabled zero, frozen configured-stack Retry and ordinary-only provenance. Eight installed requests/seven PNGs, visible signed/zero RGB contrasts, exact OUT alpha/replay/source protection; ten GREEN/two semantic RED/restoration. Source/retained/runtime/release levels separate; no quality/Smart/TI/reference/spatial-negative or status promotion. [Runtime startup](./engineering/runtime-checking-research.md): valid startup reports checking, owner events settle ready/failure, true metadata/exit failures stay fenced; ROOT256 focused Main/5 browser/actual preload IPC and isolated status mutation, no ML/release/status promotion. [Anima regional concrete batches](./engineering/phase-4-anima-regional-batch-research.md): ROOT1629 Main/203 browser PASS; existing Invoke-derived TXT/IMG/OUT batch/global-positive expansion, per-item frozen identity and32-job/data-dependent admission. Eight qualified native requests/seven PNGs; selected Add/history/Save, pending/running Cancel and exact per-member restarted Retry. Main association mutation5GREEN/1RED/restoration. Failed attempts excluded; no Python/schema/cap change, quality/Smart/resource/spatial-negative or status promotion. [Anima regional mixed-alpha OUT](./engineering/phase-4-anima-regional-outpaint-research.md): ROOT1580 Main/641 Python/200 browser PASS; installed Heun19/2/19 Generate/Cancel/frozen Retry, exact RGBA replay, source-preserving Add/Undo/Redo/Save-reopen and independent640-square composite. Three semantic RED with controls/restoration. Earlier reader/queue consumer defects corrected, failed attempts excluded; source/retention review separate. No quality/Smart/batch/resource/spatial-negative or status promotion. [Anima opaque regional IMG](./engineering/phase-4-anima-regional-img2img-research.md): ROOT1550 Main/413 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen preserve source, migration25 and three semantic mutations; readiness unchanged. [Anima regional sampling](./engineering/phase-4-anima-regional-sampling-research.md): ROOT1500 Main/340 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen, three semantic mutations with controls/restoration. Other methods have small-native/Main evidence; quality/readiness unchanged. [Anima public TXT](./engineering/phase-4-anima-regional-public-research.md): ROOT1466 Main/206 qualified Python/200 browser plus35 guard cases; three installed requests preserve progress/Cancel/exact frozen Retry RGB. Real Results Add plus separate zero-ML Recover/visibility history/Save-reopen; original Add Undo/Redo remains unverified. Quality/status unchanged. [Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. [Public IMG/VAE](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md): ROOT582 Main/223 Python/196 browser PASS;19 installed checks preserve A/FP32 frozen Retry after saved Embedded/FP16 through Add/Save-reopen; exact A replay and B resource contrast, no readiness/quality promotion. [Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. [Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md): ROOT520 Main/332 Python/192 browser PASS;18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through Add/Save-reopen. Direct replay matches UI and Euler contrast changes765,621 RGB channels; defaults/statuses unchanged. [Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md): ROOT499 Main/299 Python/190 browser PASS; real .7 Generate/Cancel/frozen Retry after saved .2, exact control/Add/Undo/Save/reopen; two read-only native replays establish RGB influence, no quality/readiness promotion. [Installed opaque IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md): ROOT 100 Main/188 browser PASS, real default RuntimeManager Generate/Cancel/frozen Retry/exact RGB/Add/Undo/Save/reopen; finite Euler/FP16 subset, no quality or readiness promotion. [Character visual](./engineering/phase-4-regional-guidance-character-visual-research.md): seven qualified backend requests/exact RGB repeat; AI assessment: 1 PASS / 4 FAIL / 1 INCONCLUSIVE, both ordinary two-figure controls FAIL. Human acceptance pending; two excluded harness requests retained, no production/readiness promotion. [Worker-only failure](./engineering/phase-4-regional-guidance-worker-fault-research.md): ROOT126 lower PASS/14 installed checks; actual nativeworker SIGKILL with Main alive yields normal failed row, cleared progress, no candidate, then explicit frozenRetry/control-identical PNG/Results/AddUndoSave. Existing production unchanged; quality, Anima and release remain open. [Regional numeric progress](./engineering/phase-4-regional-guidance-progress-research.md): ROOT477 distinct lower PASS and14 installed checks; real5/30,6/30, Cancel clears before childexit, frozenRetry1..30/control-identical PNG, Results/AddUndoSave-reopen and prior-state preservation. Scalar transient telemetry only; N/N does not publish. Status unchanged. [Linux Main-only ownership](./engineering/phase-4-regional-guidance-main-death-research.md): ROOT13 installed checks/3lifetimes, 407 distinct lower PASS; parent-only fault ends Python without assistance, marked transport reclaimed before Ready, frozenRetry/Recover/AddUndoSave-reopen preserved;21 mutation executions17GREEN/4semanticRED with restored bytes. Linux direct-child scope; quality/Anima/release remain open. Historical checkpoint: [Installed regional recovery](./engineering/phase-4-regional-guidance-installed-recovery-research.md): ROOT13 checks PASS/three Electron lifetimes, active owned-scope interruption→APP_RESTART→explicit frozenRetry→candidate crash/recovery→AddUndoSave-reopen;211 lowerPASS/typecheck/mutation. Previous history/packages intact. No orphan-reaping/Main-only restart, quality, Anima or release promotion. [Installed public Regional](./engineering/phase-4-regional-guidance-installed-research.md): ROOT native-r6 eight checks PASS, real renderer/IPC/default RuntimeManager0.14 through30-step1024² Cancel/frozenRetry/Results/RasterAdd/Undo/Save-reopen; 1019 MainPASS, typecheck/build. Developer provisioner, original checkpoint catalog setup; release Install/Repair, numeric regional progress, quality/Anima/capacity remain open. [Public regional Invoke Canvas](./engineering/phase-4-regional-guidance-public-invoke-research.md): finite Generate/Results/Retry and explicit Raster Add/Undo/Save; distinct public operation and preserved legacy isolation, base-only provenance. ROOT: 1,013 distinct Main cases, 813 Python PASS, prototype184, typecheck/basedpyright/build PASS; one actual public trained request through Results/Add/Save/reopen (41s). Runtime lease adapter and mocked renderer are not installed RuntimeManager/renderer-IPC qualification. Prior negative visuals and promise statuses unchanged. [Regional reference-image owner](./engineering/phase-4-regional-guidance-references-research.md): Inline bounded thumbnails, owner-bound actions, Current Canvas family/repair/lock guards and bounded root visual self-review. Source implemented; final lower checks and native-r10 12/12 PASS/191.188s, script1f5ac7ce/sourceR11 CLEAN. Python118, typecheck-r3, lint-r2, neighbors-r2 952/57files/0skip and fresh build-r1 PASS. Duplicate semantic RED/control GREEN/restored2GREEN, all1343 restored; productionR2 CLEAN after causal Save A/B fix. Attempts1–9 remain FAILED; oracle R7/R8 closed by replay. Root opened10 screenshots under ui-audit, bounded self-review. Controlled OS picker; actual development CPU; no ML/catalog injection or packaged/inference/installed-resource-transition qualification; transient preparation metadata-only. RetentionR1–R7 CLEAN candidate-only READ-FINISHED; contractR1 CLEAN source-only. Root exit/restoration/source/dependency/reader checks and cleanup complete:22 exact paths removed,216,420,352B measured root allocation reduction. Compact proof/external dependencies and final mapping retained; no public-status promotion. [Композиция](./contracts/interface-composition.md), [desktop UI review](./engineering/desktop-ui-layout-review.md): Electron shell, базовые Home/Project и Model Manager; [production Preset Manager](./engineering/phase-3-preset-manager-research.md) подключает ручной create/edit и Deleted через SQLite. Полный Home, preferences и Project preset flows ещё открыты; [исправления аудита](./engineering/product-audit-fixes.md): standalone Home/Project session mapping проверен [Regional Guidance foundation](./engineering/phase-4-regional-guidance-foundation-research.md): empty durable entities, grouped UI and explicit enabled-region NEW Generate refusal; root-confirmed 711 Node / 182 prototype / 12 native-r5 checks PASS, final typecheck/lint/build PASS; final [retention/cleanup completed](./engineering/phase-4-regional-guidance-foundation-research.md#retention-restoration-and-disposal): 15 exact payload paths removed, all candidate paths absent, 109,748,224 allocated bytes (104.66 MiB) reclaimed; no regional inference. [Regional prompt authoring](./engineering/phase-4-regional-guidance-prompts-research.md): finite authoring root-qualified; metadata APIs and ordinary draft target/change/group validation preserved, shared seal additionally accepts strict regional namespaced IDs. Root: 795 Node / 41 files, 0 failures/skips (before final single ARIA attribute), typecheck r7, full lint r2 (4 partitions) plus later row/script scoped lint, fresh app build r4 and prototype r1 182 PASS, no prototype source change; production R4/narrow ARIA R5 and native-source R7 CLEAN source-only. Final native-r8/script ff502357: 12/12 PASS in 97.714 s, healthy code 0 across two lifetimes, Save/reopen/recovery and protected-state controls; 7 screenshots opened/viewed by root, bounded self-review. Retention audits 1–4 CLEAN/READ-FINISHED and contract R2 CLEAN source-only; root release checks and cleanup complete: 18 exact idle paths removed, 116,359,168 allocated bytes (110.97 MiB) reclaimed; compact evidence/external dependencies protected. No regional masks/reference images, conditioning, inference, installed embedding/autocomplete, active-work/Main-ABA or full-promise qualification. [Regional Guidance owned-mask authoring](./engineering/phase-4-regional-guidance-masks-research.md): source implemented; lower-level checks and finite native-r7 qualification PASS (12 checks, 157.061 s; both 95-handler restorations, zero in-flight calls/page errors). Root reviews all 6 final screenshots at 1440×900/900×620 plus quarter-turn/recovered states without a material local finding; bounded self-review, not full accessibility audit. Root: 869 Node/50 files before lint-only delta; post-lint focused r3 89/typecheck r3, full lint r2, fresh app build r1 and prototype r2 182 PASS; production R2/source R4/R5 CLEAN source-only. Earlier failures/native3 restoration gap remain explicit; retention audits R1–R4 CLEAN/READ-FINISHED, contract R2 CLEAN source-only; root release checks and cleanup complete: 15 exact idle paths removed, 113,537,024 bytes (108.28 MiB) reclaimed, compact evidence/external dependencies retained. No regional conditioning/reference images/inference; public status unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PP-002 | Понятное намерение controls               | Принятое направление | Пока не обещать  | [Явные действия](./contracts/explicit-intent.md): production Create/Import/Save, install/repair и exact checkpoint явные; [syntax hints](./engineering/project-prompt-diagnostics-research.md) локальны и не меняют текст/Save; [Generate actions](./engineering/phase-2b-generate-actions-research.md) подключены в узком Illustrious txt2img срезе; [Project Apply](./engineering/phase-3-preset-apply-research.md) подключён; полный resource handoff остаётся открытым                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PP-003 | Понятные роли и места управления          | Принятое направление | Пока не обещать  | [Ownership](./contracts/canonical-ownership.md): базовые Electron Home/Project и Model Manager подключены; [production Preset Manager](./engineering/phase-3-preset-manager-research.md) использует одного app-level owner и detached drafts. Полный Preset/Apply resource handoff остаётся открытым; global saved-result browser/navigation подключён отдельным checkpoint. [Main-owned LaMa delivery](./engineering/phase-2c-lama-install-research.md): internal exact auxiliary installer and full-artifact engine byte planner; Set up/Install/Repair remain unimplemented. [Public outpaint admission](./engineering/phase-2c-public-outpaint-research.md): Generate/frozen Retry connected for both families; installed development qualification does not prove public setup or signed release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| PP-004 | Управляемые модели и версии               | Обязательный MVP     | Пока не обещать  | [Local resource previews](./engineering/phase-2c-resource-previews-research.md): real CPU derivatives/local cache, exact-version artwork/default ownership, built UI Save+offline restart, failure/exit fence and semantic mutations. Full model hard removal/Preset owners/packaged delivery remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PP-005 | Результат помнит настройки                | Обязательный MVP     | Пока не обещать  | [Global Anima regional LoRA](./engineering/phase-4-anima-regional-lora-research.md): ROOT1653 Main/652 distinct Python/210 browser PASS; existing Invoke/ordinary exact stack across TXT/IMG/OUT, additive combination capability including enabled zero, frozen configured-stack Retry and ordinary-only provenance. Eight installed requests/seven PNGs, visible signed/zero RGB contrasts, exact OUT alpha/replay/source protection; ten GREEN/two semantic RED/restoration. Source/retained/runtime/release levels separate; no quality/Smart/TI/reference/spatial-negative or status promotion. [Anima regional concrete batches](./engineering/phase-4-anima-regional-batch-research.md): ROOT1629 Main/203 browser PASS; existing Invoke-derived TXT/IMG/OUT batch/global-positive expansion, per-item frozen identity and32-job/data-dependent admission. Eight qualified native requests/seven PNGs; selected Add/history/Save, pending/running Cancel and exact per-member restarted Retry. Main association mutation5GREEN/1RED/restoration. Failed attempts excluded; no Python/schema/cap change, quality/Smart/resource/spatial-negative or status promotion. [Anima regional mixed-alpha OUT](./engineering/phase-4-anima-regional-outpaint-research.md): ROOT1580 Main/641 Python/200 browser PASS; installed Heun19/2/19 Generate/Cancel/frozen Retry, exact RGBA replay, source-preserving Add/Undo/Redo/Save-reopen and independent640-square composite. Three semantic RED with controls/restoration. Earlier reader/queue consumer defects corrected, failed attempts excluded; source/retention review separate. No quality/Smart/batch/resource/spatial-negative or status promotion. [Anima opaque regional IMG](./engineering/phase-4-anima-regional-img2img-research.md): ROOT1550 Main/413 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen preserve source, migration25 and three semantic mutations; readiness unchanged. [Anima regional sampling](./engineering/phase-4-anima-regional-sampling-research.md): ROOT1500 Main/340 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen, three semantic mutations with controls/restoration. Other methods have small-native/Main evidence; quality/readiness unchanged. [Anima public TXT](./engineering/phase-4-anima-regional-public-research.md): ROOT1466 Main/206 qualified Python/200 browser plus35 guard cases; three installed requests preserve progress/Cancel/exact frozen Retry RGB. Real Results Add plus separate zero-ML Recover/visibility history/Save-reopen; original Add Undo/Redo remains unverified. Quality/status unchanged. [Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. [Public IMG/VAE](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md): ROOT582 Main/223 Python/196 browser PASS;19 installed checks preserve A/FP32 frozen Retry after saved Embedded/FP16 through Add/Save-reopen; exact A replay and B resource contrast, no readiness/quality promotion. [Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. [Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md): ROOT520 Main/332 Python/192 browser PASS;18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through Add/Save-reopen. Direct replay matches UI and Euler contrast changes765,621 RGB channels; defaults/statuses unchanged. [Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md): ROOT499 Main/299 Python/190 browser PASS; real .7 Generate/Cancel/frozen Retry after saved .2, exact control/Add/Undo/Save/reopen; two read-only native replays establish RGB influence, no quality/readiness promotion. [Installed opaque IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md): ROOT 100 Main/188 browser PASS, real default RuntimeManager Generate/Cancel/frozen Retry/exact RGB/Add/Undo/Save/reopen; finite Euler/FP16 subset, no quality or readiness promotion. [Smart result presets](./engineering/phase-4-smart-patch-result-preset-research.md): active/exact inactive variants и converted Smart Rasters → worker-independent frozen copy → detached Manager/Create; geometry/Seed omission, strict ownership и source immutability; 790 focused/neighbor tests, 181 prototype tests и 15 native checks с 12 recipes после restart. [Smart settings Compare](./engineering/phase-4-smart-patch-compare-research.md): implemented active accepted variant / converted Smart Raster → current Project Canvas through strict `getSmartResultComparisonData`; no Smart Size/context/geometry or mutation. The scoped qualification passes 852 neighbor tests, 182 prototype tests and 18 native checks. Smart-target Apply has a separate [implemented finite checkpoint](./engineering/phase-4-smart-patch-preset-apply-research.md), with 363 focused/neighbor tests and 12 native checks, no provenance mutation, installed inference or release claim; статус не повышен. [NoobAI Karras refusal](./engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». [Anima image cap32/prefix](engineering/phase-2c-anima-image-batch-cap-research.md):76 accepted outputs/4 packages/12 own prefix matches/2 preserving confirmed33 refusals; finite Euler256 scope. [Anima image MAX→0](engineering/phase-2c-anima-image-seed-wrap-research.md): Installed Anima image MAX→0: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 wholeRGBA matches с собственными numeric MAX/0 controls и 2 same-prompt contrasts. Frozen worker inputs сохраняют MAX→0 actual/step/posterior seeds и compiled weighting; 6 cursor/Save snapshots и 8 portable provenance сохраняют raw weighted text, actual seed и resource/source context. Три OUT previews сохраняют 166656 protected source pixels. Independent raw reader PASS (18700 checks); actual Main modulo fault: 18 executions, 2 RED / 16 GREEN. Все 584 copied source members restored and guarded-cleaned. Только Euler256/N3/two updates/exact ресурсы; cross-pair wrap/cap32/new installed mutation/quality/Invoke parity/fullMVP/release не заявлены. [Installed Anima image Reuse после crash](engineering/phase-2c-anima-image-reuse-crash-research.md): Euler256 IMG/normal mixed-alpha OUT,22 admissions/18 completions/4 APP_RESTART/18 accepted layers/2 Save-reopen packages,16 Reuse+2 recovered own fullRGBA matches. Home Recover сохраняет source/candidate/cursor B; public Reuse/value null, hidden recovered Fixed layer и8 fresh Reuse layers сохранены вместе с source. Source-only Save snapshot null; final(B+7),10 layers/9 provenance,18 owning comparisons; OUT55552 protected pixels. Исключённый первый native3/1/2cancel/0accepted учтён отдельно; raw total25/19/6cancel/18accepted. FullMVP/quality/Invoke parity/release не заявлены. [Installed Anima image Random → Fixed](engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PP-006 | Настройки сохраняются и переиспользуются  | Обязательный MVP     | Пока не обещать  | [Smart result presets](./engineering/phase-4-smart-patch-result-preset-research.md): active/exact inactive variants и converted Smart Rasters → worker-independent frozen copy → detached Manager/Create; geometry/Seed omission, strict ownership и source immutability; 790 focused/neighbor tests, 181 prototype tests и 15 native checks с 12 recipes после restart. [Smart settings Compare](./engineering/phase-4-smart-patch-compare-research.md): implemented active accepted variant / converted Smart Raster → current Project Canvas through strict `getSmartResultComparisonData`; no Smart Size/context/geometry or mutation. The scoped qualification passes 852 neighbor tests, 182 prototype tests and 18 native checks. [Smart-target Apply](./engineering/phase-4-smart-patch-preset-apply-research.md): finite selected-Patch draft implementation, dedicated review/apply APIs, selected-only copy, Size refused/omitted, Seed off by default and ephemeral coordinator/epoch/revision/layer token through staged commit; no implicit Save or source/geometry/variant/provenance/queue/cursor/policy mutation. Qualification: 363 focused/neighbor tests (including the 33 + 18 subset), 12 native checks, typecheck/lint/build and a restored semantic mutation PASS. No installed Smart inference or release claim; статус не повышен. [Preset storage/API](./engineering/phase-3-preset-storage-research.md): strict definitions, real SQLite lifecycle, native restart/purge; [production Preset Manager](./engineering/phase-3-preset-manager-research.md): manual CRUD/Deleted and guards. [Project Apply](./engineering/phase-3-preset-apply-research.md): detached preview, selected-only diagnostics and one Main Undo mutation. [Save Current](./engineering/phase-3-preset-save-current-research.md) connects acknowledged Project source creation after draft synchronization, without flush/seal, with authored prompts/sidecars, seed/batch omission and explicit unknown-workflow choice. [Smart draft Save Current](./engineering/phase-4-smart-patch-current-preset-research.md): synchronous exact acknowledged selected-Patch authored settings → detached Manager/explicit Create; Smart workflow, no initial Size/Seed/batch/geometry/source context; hidden/locked read sources without ML/catalog, whole-Project pending guard and no flush/seal. Root execution: 222 neighbor tests (0 fail/0 skip), typecheck r3/full lint r2/fresh build PASS; isolated wrong-owner GREEN2 → semantic RED/control GREEN → restored GREEN2, all 1,313 source members byte-exact restored; focused owner RED→GREEN with unchanged causal assertion and same-owner invalid raw input retained. Actual native-r2: 12 automated checks PASS/code 0, two healthy Electron lifetimes/two persisted recipes, actual failed INSERT/retry and frozen source despite later authoring/catalog changes; exact PNG/provenance/Project/seed/library policy/package unchanged; 1440×900 and real 900×620 keyboard/focus/layout. Production review R2 and final native-source R4 review of two useInnerText assertions clean; scoped final-harness ESLint PASS. Root opened six final native-r2 screenshots (normal/min900 source/scrolled/restored/SQLite failure/restart), no material UI defect in scope; root-visual-review.json retained. Both retention audits clean; root completes scoped temporary-data cleanup (96.59 MiB reclaimed), preserving compact byte evidence and dependency targets. No inference/release/complete PP-006 claim; public status unchanged. [New Project customization](./engineering/phase-3-new-project-preset-research.md) connects a detached active TXT source to the shared editor, selected-only validation and initialization before the first `.igs` write with clean history; selected missing refs warn without blocking Create. New Project qualification: 221 focused tests/9 native scenarios; exact limits belong to its checkpoint. Qualification results belong to each checkpoint. [Accepted Raster result](./engineering/phase-3-result-preset-research.md) connects a worker-independent immutable provenance read to detached Create: concrete expanded prompts, recorded portable fields, Seed/batch omission, no source mutation; qualification belongs to its checkpoint. [Project Apply Models handoff](./engineering/phase-3-preset-model-handoff-research.md): exact edited diagnostic references, preserved suspended editor, guarded refresh/return, baseline RED→GREEN pilot. [Installed Project presets EPS/V](./engineering/phase-3-installed-presets-research.md): native full/partial Apply, 8 trained completions, 4 wholeRGBA manual controls, 4 accepted Save/reopen/Compare/result-preset chains; current library policy wins over advisory hints, 646 raw checks and restored source mutations. Only declared Euler256/N3 recipe; Anima Apply/other recipes remain unqualified. Other-context handoffs remain pending; finite Smart-target Apply qualification is recorded at its linked checkpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| PP-007 | Пользователь владеет переносимым проектом | Обязательный MVP     | Пока не обещать  | [Global Anima regional LoRA](./engineering/phase-4-anima-regional-lora-research.md): ROOT1653 Main/652 distinct Python/210 browser PASS; existing Invoke/ordinary exact stack across TXT/IMG/OUT, additive combination capability including enabled zero, frozen configured-stack Retry and ordinary-only provenance. Eight installed requests/seven PNGs, visible signed/zero RGB contrasts, exact OUT alpha/replay/source protection; ten GREEN/two semantic RED/restoration. Source/retained/runtime/release levels separate; no quality/Smart/TI/reference/spatial-negative or status promotion. [Anima regional concrete batches](./engineering/phase-4-anima-regional-batch-research.md): ROOT1629 Main/203 browser PASS; existing Invoke-derived TXT/IMG/OUT batch/global-positive expansion, per-item frozen identity and32-job/data-dependent admission. Eight qualified native requests/seven PNGs; selected Add/history/Save, pending/running Cancel and exact per-member restarted Retry. Main association mutation5GREEN/1RED/restoration. Failed attempts excluded; no Python/schema/cap change, quality/Smart/resource/spatial-negative or status promotion. [Anima regional mixed-alpha OUT](./engineering/phase-4-anima-regional-outpaint-research.md): ROOT1580 Main/641 Python/200 browser PASS; installed Heun19/2/19 Generate/Cancel/frozen Retry, exact RGBA replay, source-preserving Add/Undo/Redo/Save-reopen and independent640-square composite. Three semantic RED with controls/restoration. Earlier reader/queue consumer defects corrected, failed attempts excluded; source/retention review separate. No quality/Smart/batch/resource/spatial-negative or status promotion. [Anima opaque regional IMG](./engineering/phase-4-anima-regional-img2img-research.md): ROOT1550 Main/413 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen preserve source, migration25 and three semantic mutations; readiness unchanged. [Anima regional sampling](./engineering/phase-4-anima-regional-sampling-research.md): ROOT1500 Main/340 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen, three semantic mutations with controls/restoration. Other methods have small-native/Main evidence; quality/readiness unchanged. [Anima public TXT](./engineering/phase-4-anima-regional-public-research.md): ROOT1466 Main/206 qualified Python/200 browser plus35 guard cases; three installed requests preserve progress/Cancel/exact frozen Retry RGB. Real Results Add plus separate zero-ML Recover/visibility history/Save-reopen; original Add Undo/Redo remains unverified. Quality/status unchanged. [Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. [Public IMG/VAE](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md): ROOT582 Main/223 Python/196 browser PASS;19 installed checks preserve A/FP32 frozen Retry after saved Embedded/FP16 through Add/Save-reopen; exact A replay and B resource contrast, no readiness/quality promotion. [Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. [Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md): ROOT520 Main/332 Python/192 browser PASS;18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through Add/Save-reopen. Direct replay matches UI and Euler contrast changes765,621 RGB channels; defaults/statuses unchanged. [Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md): ROOT499 Main/299 Python/190 browser PASS; real .7 Generate/Cancel/frozen Retry after saved .2, exact control/Add/Undo/Save/reopen; two read-only native replays establish RGB influence, no quality/readiness promotion. [Installed opaque IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md): ROOT 100 Main/188 browser PASS, real default RuntimeManager Generate/Cancel/frozen Retry/exact RGB/Add/Undo/Save/reopen; finite Euler/FP16 subset, no quality or readiness promotion. [Character visual](./engineering/phase-4-regional-guidance-character-visual-research.md): seven qualified backend requests/exact RGB repeat; AI assessment: 1 PASS / 4 FAIL / 1 INCONCLUSIVE, both ordinary two-figure controls FAIL. Human acceptance pending; two excluded harness requests retained, no production/readiness promotion. [Worker-only failure](./engineering/phase-4-regional-guidance-worker-fault-research.md): ROOT126 lower PASS/14 installed checks; actual nativeworker SIGKILL with Main alive yields normal failed row, cleared progress, no candidate, then explicit frozenRetry/control-identical PNG/Results/AddUndoSave. Existing production unchanged; quality, Anima and release remain open. [Regional numeric progress](./engineering/phase-4-regional-guidance-progress-research.md): ROOT477 distinct lower PASS and14 installed checks; real5/30,6/30, Cancel clears before childexit, frozenRetry1..30/control-identical PNG, Results/AddUndoSave-reopen and prior-state preservation. Scalar transient telemetry only; N/N does not publish. Status unchanged. [Linux Main-only ownership](./engineering/phase-4-regional-guidance-main-death-research.md): ROOT13 installed checks/3lifetimes, 407 distinct lower PASS; parent-only fault ends Python without assistance, marked transport reclaimed before Ready, frozenRetry/Recover/AddUndoSave-reopen preserved;21 mutation executions17GREEN/4semanticRED with restored bytes. Linux direct-child scope; quality/Anima/release remain open. Historical checkpoint: [Installed regional recovery](./engineering/phase-4-regional-guidance-installed-recovery-research.md): ROOT13 checks PASS/three Electron lifetimes, active owned-scope interruption→APP_RESTART→explicit frozenRetry→candidate crash/recovery→AddUndoSave-reopen;211 lowerPASS/typecheck/mutation. Previous history/packages intact. No orphan-reaping/Main-only restart, quality, Anima or release promotion. [Installed public Regional](./engineering/phase-4-regional-guidance-installed-research.md): ROOT native-r6 eight checks PASS, real renderer/IPC/default RuntimeManager0.14 through30-step1024² Cancel/frozenRetry/Results/RasterAdd/Undo/Save-reopen; 1019 MainPASS, typecheck/build. Developer provisioner, original checkpoint catalog setup; release Install/Repair, numeric regional progress, quality/Anima/capacity remain open. [Public regional Invoke Canvas](./engineering/phase-4-regional-guidance-public-invoke-research.md): finite Generate/Results/Retry and explicit Raster Add/Undo/Save; distinct public operation and preserved legacy isolation, base-only provenance. ROOT: 1,013 distinct Main cases, 813 Python PASS, prototype184, typecheck/basedpyright/build PASS; one actual public trained request through Results/Add/Save/reopen (41s). Runtime lease adapter and mocked renderer are not installed RuntimeManager/renderer-IPC qualification. Prior negative visuals and promise statuses unchanged. [Regional reference-image owner](./engineering/phase-4-regional-guidance-references-research.md): Ordered owned PNG/WebP/ICC, independent Duplicate/Undo/Save/reopen/recovery within the finite controlled-picker/development-CPU boundary. Source implemented; final lower checks and native-r10 12/12 PASS/191.188s, script1f5ac7ce/sourceR11 CLEAN. Python118, typecheck-r3, lint-r2, neighbors-r2 952/57files/0skip and fresh build-r1 PASS. Duplicate semantic RED/control GREEN/restored2GREEN, all1343 restored; productionR2 CLEAN after causal Save A/B fix. Attempts1–9 remain FAILED; oracle R7/R8 closed by replay. Root opened10 screenshots under ui-audit, bounded self-review. Controlled OS picker; actual development CPU; no ML/catalog injection or packaged/inference/installed-resource-transition qualification; transient preparation metadata-only. RetentionR1–R7 CLEAN candidate-only READ-FINISHED; contractR1 CLEAN source-only. Root exit/restoration/source/dependency/reader checks and cleanup complete:22 exact paths removed,216,420,352B measured root allocation reduction. Compact proof/external dependencies and final mapping retained; no public-status promotion. [Accepted Smart variant history](./engineering/phase-4-smart-patch-history-research.md): nested variants own history UUIDs; current-parent navigation focuses stored inactive/hidden/locked members without activation, authoring or implicit Save; global membership follows verified Save. Exact resource guards remain. History native R8: 16 checks on portable accepted fixtures, including cross-project read-only navigation and Save/reopen; no inference. Smart Compare/Preset and release readiness were outside that history checkpoint. [Explicit orphan Raster Add](./engineering/phase-4-smart-patch-orphan-raster-research.md): verified world PNG/alpha, unchanged Smart provenance and frozen bbox; shared reviewed journal/recovery, one Undo, explicit Save; current original document only, no runtime or retargeting. Converted Raster history supports 1px/nonaligned world sizes; Smart Compare/Preset were unavailable at that orphan-acceptance checkpoint; later source/Compare slices are separate. Native R7: 15 checks on prepared PNGs, actual menu/confirmation, 900×620/1440×900, Undo/Redo, crash recovery and Save/reopen; inference is not part of this acceptance qualification. [Frozen Smart Retry](./engineering/phase-4-smart-patch-retry-research.md): one reviewed failed/canceled concrete job, independent verified input copy, original seed/settings/pixels, source CAS, shared admission/drain; no automatic acceptance/Save or candidate replacement. [Selected freshness](./engineering/phase-4-smart-patch-freshness-research.md): App-owned automatic row/browser source inspection; no document/provenance/acceptance changes; resource and Generate readiness separate. [Installed Smart Patch qualification](./engineering/phase-4-smart-patch-installed-generation-research.md): 27 native checks; 10 trained Illustrious V/Anima completions and explicit Add/Undo/Redo/Save/reopen cycles across four modes plus INP replay per family. Exact world RGBA/provenance, current authoring and neighbors survive; two raw RGB contrasts and whole-RGBA replays pass. Actual rendered progress, busy Select and healthy-close/no-Repair readiness are verified. All 51 installed worker files/source/bundle/model hashes remain unchanged; 80 observed actors physically exited. Failed attempts stay separate. Reopened stored rows can remain `unverified`; automatic freshness after worker lifecycle is outside these assertions. At that installed checkpoint, Compare/Preset, arbitrary options, quality, full Invoke parity and release remained open. [Regional Guidance foundation](./engineering/phase-4-regional-guidance-foundation-research.md): empty durable entities, grouped UI and explicit enabled-region NEW Generate refusal; root-confirmed 711 Node / 182 prototype / 12 native-r5 checks PASS, final typecheck/lint/build PASS; final [retention/cleanup completed](./engineering/phase-4-regional-guidance-foundation-research.md#retention-restoration-and-disposal): 15 exact payload paths removed, all candidate paths absent, 109,748,224 allocated bytes (104.66 MiB) reclaimed; no regional inference. [Regional prompt authoring](./engineering/phase-4-regional-guidance-prompts-research.md): finite authoring root-qualified; metadata APIs and ordinary draft target/change/group validation preserved, shared seal additionally accepts strict regional namespaced IDs. Root: 795 Node / 41 files, 0 failures/skips (before final single ARIA attribute), typecheck r7, full lint r2 (4 partitions) plus later row/script scoped lint, fresh app build r4 and prototype r1 182 PASS, no prototype source change; production R4/narrow ARIA R5 and native-source R7 CLEAN source-only. Final native-r8/script ff502357: 12/12 PASS in 97.714 s, healthy code 0 across two lifetimes, Save/reopen/recovery and protected-state controls; 7 screenshots opened/viewed by root, bounded self-review. Retention audits 1–4 CLEAN/READ-FINISHED and contract R2 CLEAN source-only; root release checks and cleanup complete: 18 exact idle paths removed, 116,359,168 allocated bytes (110.97 MiB) reclaimed; compact evidence/external dependencies protected. No regional masks/reference images, conditioning, inference, installed embedding/autocomplete, active-work/Main-ABA or full-promise qualification. [Regional Guidance owned-mask authoring](./engineering/phase-4-regional-guidance-masks-research.md): source implemented; lower-level checks and finite native-r7 qualification PASS (12 checks, 157.061 s; both 95-handler restorations, zero in-flight calls/page errors). Root reviews all 6 final screenshots at 1440×900/900×620 plus quarter-turn/recovered states without a material local finding; bounded self-review, not full accessibility audit. Root: 869 Node/50 files before lint-only delta; post-lint focused r3 89/typecheck r3, full lint r2, fresh app build r1 and prototype r2 182 PASS; production R2/source R4/R5 CLEAN source-only. Earlier failures/native3 restoration gap remain explicit; retention audits R1–R4 CLEAN/READ-FINISHED, contract R2 CLEAN source-only; root release checks and cleanup complete: 15 exact idle paths removed, 113,537,024 bytes (108.28 MiB) reclaimed, compact evidence/external dependencies retained. No regional conditioning/reference images/inference; public status unchanged.                   |
| PP-008 | Результаты принимаются явно               | Обязательный MVP     | Пока не обещать  | [Global Anima regional LoRA](./engineering/phase-4-anima-regional-lora-research.md): ROOT1653 Main/652 distinct Python/210 browser PASS; existing Invoke/ordinary exact stack across TXT/IMG/OUT, additive combination capability including enabled zero, frozen configured-stack Retry and ordinary-only provenance. Eight installed requests/seven PNGs, visible signed/zero RGB contrasts, exact OUT alpha/replay/source protection; ten GREEN/two semantic RED/restoration. Source/retained/runtime/release levels separate; no quality/Smart/TI/reference/spatial-negative or status promotion. [Runtime startup](./engineering/runtime-checking-research.md): valid startup reports checking, owner events settle ready/failure, true metadata/exit failures stay fenced; ROOT256 focused Main/5 browser/actual preload IPC and isolated status mutation, no ML/release/status promotion. [Anima regional concrete batches](./engineering/phase-4-anima-regional-batch-research.md): ROOT1629 Main/203 browser PASS; existing Invoke-derived TXT/IMG/OUT batch/global-positive expansion, per-item frozen identity and32-job/data-dependent admission. Eight qualified native requests/seven PNGs; selected Add/history/Save, pending/running Cancel and exact per-member restarted Retry. Main association mutation5GREEN/1RED/restoration. Failed attempts excluded; no Python/schema/cap change, quality/Smart/resource/spatial-negative or status promotion. [Anima regional mixed-alpha OUT](./engineering/phase-4-anima-regional-outpaint-research.md): ROOT1580 Main/641 Python/200 browser PASS; installed Heun19/2/19 Generate/Cancel/frozen Retry, exact RGBA replay, source-preserving Add/Undo/Redo/Save-reopen and independent640-square composite. Three semantic RED with controls/restoration. Earlier reader/queue consumer defects corrected, failed attempts excluded; source/retention review separate. No quality/Smart/batch/resource/spatial-negative or status promotion. [Anima opaque regional IMG](./engineering/phase-4-anima-regional-img2img-research.md): ROOT1550 Main/413 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen preserve source, migration25 and three semantic mutations; readiness unchanged. [Anima regional sampling](./engineering/phase-4-anima-regional-sampling-research.md): ROOT1500 Main/340 Python/200 browser PASS; installed Heun Generate/Cancel/exact frozen Retry and Add/Undo/Redo/Save-reopen, three semantic mutations with controls/restoration. Other methods have small-native/Main evidence; quality/readiness unchanged. [Anima public TXT](./engineering/phase-4-anima-regional-public-research.md): ROOT1466 Main/206 qualified Python/200 browser plus35 guard cases; three installed requests preserve progress/Cancel/exact frozen Retry RGB. Real Results Add plus separate zero-ML Recover/visibility history/Save-reopen; original Add Undo/Redo remains unverified. Quality/status unchanged. [Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. [Public IMG/VAE](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md): ROOT582 Main/223 Python/196 browser PASS;19 installed checks preserve A/FP32 frozen Retry after saved Embedded/FP16 through Add/Save-reopen; exact A replay and B resource contrast, no readiness/quality promotion. [Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. [Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md): ROOT520 Main/332 Python/192 browser PASS;18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through Add/Save-reopen. Direct replay matches UI and Euler contrast changes765,621 RGB channels; defaults/statuses unchanged. [Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md): ROOT499 Main/299 Python/190 browser PASS; real .7 Generate/Cancel/frozen Retry after saved .2, exact control/Add/Undo/Save/reopen; two read-only native replays establish RGB influence, no quality/readiness promotion. [Installed opaque IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md): ROOT 100 Main/188 browser PASS, real default RuntimeManager Generate/Cancel/frozen Retry/exact RGB/Add/Undo/Save/reopen; finite Euler/FP16 subset, no quality or readiness promotion. [Character visual](./engineering/phase-4-regional-guidance-character-visual-research.md): seven qualified backend requests/exact RGB repeat; AI assessment: 1 PASS / 4 FAIL / 1 INCONCLUSIVE, both ordinary two-figure controls FAIL. Human acceptance pending; two excluded harness requests retained, no production/readiness promotion. [Worker-only failure](./engineering/phase-4-regional-guidance-worker-fault-research.md): ROOT126 lower PASS/14 installed checks; actual nativeworker SIGKILL with Main alive yields normal failed row, cleared progress, no candidate, then explicit frozenRetry/control-identical PNG/Results/AddUndoSave. Existing production unchanged; quality, Anima and release remain open. [Regional numeric progress](./engineering/phase-4-regional-guidance-progress-research.md): ROOT477 distinct lower PASS and14 installed checks; real5/30,6/30, Cancel clears before childexit, frozenRetry1..30/control-identical PNG, Results/AddUndoSave-reopen and prior-state preservation. Scalar transient telemetry only; N/N does not publish. Status unchanged. [Linux Main-only ownership](./engineering/phase-4-regional-guidance-main-death-research.md): ROOT13 installed checks/3lifetimes, 407 distinct lower PASS; parent-only fault ends Python without assistance, marked transport reclaimed before Ready, frozenRetry/Recover/AddUndoSave-reopen preserved;21 mutation executions17GREEN/4semanticRED with restored bytes. Linux direct-child scope; quality/Anima/release remain open. Historical checkpoint: [Installed regional recovery](./engineering/phase-4-regional-guidance-installed-recovery-research.md): ROOT13 checks PASS/three Electron lifetimes, active owned-scope interruption→APP_RESTART→explicit frozenRetry→candidate crash/recovery→AddUndoSave-reopen;211 lowerPASS/typecheck/mutation. Previous history/packages intact. No orphan-reaping/Main-only restart, quality, Anima or release promotion. [Installed public Regional](./engineering/phase-4-regional-guidance-installed-research.md): ROOT native-r6 eight checks PASS, real renderer/IPC/default RuntimeManager0.14 through30-step1024² Cancel/frozenRetry/Results/RasterAdd/Undo/Save-reopen; 1019 MainPASS, typecheck/build. Developer provisioner, original checkpoint catalog setup; release Install/Repair, numeric regional progress, quality/Anima/capacity remain open. [Public regional Invoke Canvas](./engineering/phase-4-regional-guidance-public-invoke-research.md): finite Generate/Results/Retry and explicit Raster Add/Undo/Save; distinct public operation and preserved legacy isolation, base-only provenance. ROOT: 1,013 distinct Main cases, 813 Python PASS, prototype184, typecheck/basedpyright/build PASS; one actual public trained request through Results/Add/Save/reopen (41s). Runtime lease adapter and mocked renderer are not installed RuntimeManager/renderer-IPC qualification. Prior negative visuals and promise statuses unchanged. [Regional reference-image owner](./engineering/phase-4-regional-guidance-references-research.md): Authored attachments only; enabled-region NEW Generate refusal and independent published work/frozen Retry remain; active frozen work is not native-qualified. Source implemented; final lower checks and native-r10 12/12 PASS/191.188s, script1f5ac7ce/sourceR11 CLEAN. Python118, typecheck-r3, lint-r2, neighbors-r2 952/57files/0skip and fresh build-r1 PASS. Duplicate semantic RED/control GREEN/restored2GREEN, all1343 restored; productionR2 CLEAN after causal Save A/B fix. Attempts1–9 remain FAILED; oracle R7/R8 closed by replay. Root opened10 screenshots under ui-audit, bounded self-review. Controlled OS picker; actual development CPU; no ML/catalog injection or packaged/inference/installed-resource-transition qualification; transient preparation metadata-only. RetentionR1–R7 CLEAN candidate-only READ-FINISHED; contractR1 CLEAN source-only. Root exit/restoration/source/dependency/reader checks and cleanup complete:22 exact paths removed,216,420,352B measured root allocation reduction. Compact proof/external dependencies and final mapping retained; no public-status promotion. [Accepted Smart variant history](./engineering/phase-4-smart-patch-history-research.md): nested variants own history UUIDs; current-parent navigation focuses stored inactive/hidden/locked members without activation, authoring or implicit Save; global membership follows verified Save. Exact resource guards remain. History native R8: 16 checks on portable accepted fixtures, including cross-project read-only navigation and Save/reopen; no inference. Smart Compare/Preset and release readiness were outside that history checkpoint. [Explicit orphan Raster Add](./engineering/phase-4-smart-patch-orphan-raster-research.md): verified world PNG/alpha, unchanged Smart provenance and frozen bbox; shared reviewed journal/recovery, one Undo, explicit Save; current original document only, no runtime or retargeting. Converted Raster history supports 1px/nonaligned world sizes; Smart Compare/Preset were unavailable at that orphan-acceptance checkpoint; later source/Compare slices are separate. Native R7: 15 checks on prepared PNGs, actual menu/confirmation, 900×620/1440×900, Undo/Redo, crash recovery and Save/reopen; inference is not part of this acceptance qualification. [Frozen Smart Retry](./engineering/phase-4-smart-patch-retry-research.md): one reviewed failed/canceled concrete job, independent verified input copy, original seed/settings/pixels, source CAS, shared admission/drain; no automatic acceptance/Save or candidate replacement. [Selected freshness](./engineering/phase-4-smart-patch-freshness-research.md): App-owned automatic row/browser source inspection; no document/provenance/acceptance changes; resource and Generate readiness separate. [Installed Smart Patch qualification](./engineering/phase-4-smart-patch-installed-generation-research.md): 10 public trained completions remain temporary until 10 explicit Adds, each followed by one Undo/Redo and Save/reopen; Generate and Add do not implicitly Save. Illustrious V/Anima × TXT/IMG/INP/OUT plus INP replays pass independent alpha, two raw RGB contrast and exact whole-RGBA replay controls at processing 256/world 128, four steps, seed 123. Real rendered progress and healthy reopened Generate/no Repair pass; busy Select matches its guard. The 27-check successful matrix excludes failed attempts. Reopened stored rows can remain `unverified`; automatic freshness after worker lifecycle is outside these assertions. At that installed checkpoint, Compare/Preset, arbitrary options, quality, full Invoke parity and release remained open. [Regional Guidance foundation](./engineering/phase-4-regional-guidance-foundation-research.md): empty durable entities, grouped UI and explicit enabled-region NEW Generate refusal; root-confirmed 711 Node / 182 prototype / 12 native-r5 checks PASS, final typecheck/lint/build PASS; final [retention/cleanup completed](./engineering/phase-4-regional-guidance-foundation-research.md#retention-restoration-and-disposal): 15 exact payload paths removed, all candidate paths absent, 109,748,224 allocated bytes (104.66 MiB) reclaimed; no regional inference. [Regional prompt authoring](./engineering/phase-4-regional-guidance-prompts-research.md): finite authoring root-qualified; metadata APIs and ordinary draft target/change/group validation preserved, shared seal additionally accepts strict regional namespaced IDs. Root: 795 Node / 41 files, 0 failures/skips (before final single ARIA attribute), typecheck r7, full lint r2 (4 partitions) plus later row/script scoped lint, fresh app build r4 and prototype r1 182 PASS, no prototype source change; production R4/narrow ARIA R5 and native-source R7 CLEAN source-only. Final native-r8/script ff502357: 12/12 PASS in 97.714 s, healthy code 0 across two lifetimes, Save/reopen/recovery and protected-state controls; 7 screenshots opened/viewed by root, bounded self-review. Retention audits 1–4 CLEAN/READ-FINISHED and contract R2 CLEAN source-only; root release checks and cleanup complete: 18 exact idle paths removed, 116,359,168 allocated bytes (110.97 MiB) reclaimed; compact evidence/external dependencies protected. No regional masks/reference images, conditioning, inference, installed embedding/autocomplete, active-work/Main-ABA or full-promise qualification. [Regional Guidance owned-mask authoring](./engineering/phase-4-regional-guidance-masks-research.md): source implemented; lower-level checks and finite native-r7 qualification PASS (12 checks, 157.061 s; both 95-handler restorations, zero in-flight calls/page errors). Root reviews all 6 final screenshots at 1440×900/900×620 plus quarter-turn/recovered states without a material local finding; bounded self-review, not full accessibility audit. Root: 869 Node/50 files before lint-only delta; post-lint focused r3 89/typecheck r3, full lint r2, fresh app build r1 and prototype r2 182 PASS; production R2/source R4/R5 CLEAN source-only. Earlier failures/native3 restoration gap remain explicit; retention audits R1–R4 CLEAN/READ-FINISHED, contract R2 CLEAN source-only; root release checks and cleanup complete: 15 exact idle paths removed, 113,537,024 bytes (108.28 MiB) reclaimed, compact evidence/external dependencies retained. No regional conditioning/reference images/inference; public status unchanged. |

### Статусы и доказательства

Продуктовый статус определяет обязательство для новых решений. Публичный
статус определяет, что можно утверждать о доступной пользователю версии:

- `можно обещать` — полный flow доступен и подтверждён UI, кодом и проверками;
- `обещать аккуратно` — подтверждён только явно названный ограниченный flow;
- `пока не обещать` — есть существенные gaps или только prototype/architecture.

При изменении публичного статуса запись и матрица обновляются вместе.
Supporting contract указывает UI/entry points, проверки, известные ограничения
и ревизию/результат прогона, на котором основано повышение статуса.
Наличие файла теста не равно успешному прогону; mocked Save не доказывает запись
`.igs`. За актуальность evidence отвечает изменение, затронувшее promise.

Подход адаптирован из work project capability registry: короткий пользовательский
результат, negative scope и отдельная оценка готовности. Принятие обещания
само по себе не повышает его публичный статус.

## Принятые обещания

- [PP-001: Понятный интерфейс вместо собираемого workbench](#pp-001-понятный-интерфейс-вместо-собираемого-workbench)
- [PP-002: Явное намерение вместо магического control](#pp-002-явное-намерение-вместо-магического-control)
- [PP-003: Одна сущность, один владелец и одно каноническое место](#pp-003-одна-сущность-один-владелец-и-одно-каноническое-место)
- [PP-004: Управляемая библиотека моделей вместо ручной работы с файлами](#pp-004-управляемая-библиотека-моделей-вместо-ручной-работы-с-файлами)
- [PP-005: Принятый результат хранит настройки генерации](#pp-005-принятый-результат-хранит-настройки-генерации)
- [PP-006: Настройки генерации можно сохранять и переиспользовать](#pp-006-настройки-генерации-можно-сохранять-и-переиспользовать)
- [PP-007: Проект принадлежит пользователю](#pp-007-проект-принадлежит-пользователю)
- [PP-008: Генерация меняет проект только по явному решению](#pp-008-генерация-меняет-проект-только-по-явному-решению)

## PP-001: Понятный интерфейс вместо собираемого workbench

[Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md):
ROOT520 Main/332 Python/192 browser PASS, strict typing/scoped checks/build;
18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through
exact control RGB/Add/Undo/Save-reopen. Direct replays preserve SQL/packages,
match UI exactly and demonstrate765,621 changed RGB channels against Euler.
Separate combination capability; no default or visual/full-promise promotion.

[Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md):
ROOT 499 Main / 299 Python / 190 browser PASS, strict typing/scoped checks/build;
17 installed checks preserve .7 frozen Retry after saved .2 through exact control
RGB/Add/Undo/Save/reopen. Two direct replays preserve SQL/packages and demonstrate
569,646 changed RGB channels at zero versus .7. Default stays zero; separate
combination capability required. No visual-quality or full-promise promotion.

[Installed regional IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md)
устраняет старый renderer-отказ для opaque Canvas и проверяет фактический режим,
IMG capability и явную strength. ROOT: 100 Main/188 browser PASS, 10 oracle checks;
реальный default RuntimeManager/worker проходит Generate/Cancel/frozen Retry с
точным RGB, Add/Undo/Redo/Save/reopen и сохранением source/обычной IMG provenance.
Это конечный Euler/FP16 срез; качество, Anima, другие image modes и Install/Repair
не квалифицированы. Статус **«Пока не обещать»** и Regional exclusions сохраняются.

[Public regional IMG backend](./engineering/phase-4-regional-guidance-public-img2img-research.md)
добавляет конечный opaque Euler/FP16 path с frozen source/strength и отдельным
worker capability. ROOT:810 Main/200 Python PASS, actual installed backend
четыре admission/три native PNG receipt, canceled-before-dispatch Retry после
сохранённых правок с точным RGB, strength0 без фиктивного progress. Это не UI,
Add/result-Save, quality, runtime-manager lease или release qualification;
Regional provenance exclusions и статус **«Пока не обещать»** сохраняются.

[Character visual check](./engineering/phase-4-regional-guidance-character-visual-research.md)
сохраняет отрицательный результат: семь qualified backend requests, точный RGB
repeat; AI assessment: 1 PASS / 4 FAIL / 1 INCONCLUSIVE на шести originals. Оба ordinary controls
содержат одну фигуру вместо двух, поэтому общий visual gate не пройден. Два
более ранних native-запроса исключены из-за harness path assertion и сохранены
отдельно. Human acceptance pending; production и публичный статус не повышены.
**«Пока не обещать»** сохраняется. Следующие checkpoint-записи исторические.

[Worker-only failure](./engineering/phase-4-regional-guidance-worker-fault-research.md)
подтверждён отдельно:126 lower PASS и14 installed checks. После настоящего шага
завершён только проверенный inference worker; Main остаётся жив, progress очищен,
попытка failed без кандидата. Явный frozen Retry сохраняет исходные параметры и
контрольный PNG; Results/Add/Undo/Save/reopen и прежние данные сохранены. Production
ремонт не потребовался. Качество, Anima и release не повышаются;
**«Пока не обещать»** остаётся. Следующие записи исторические.

[Regional numeric progress](./engineering/phase-4-regional-guidance-progress-research.md)
подтверждён отдельно:477 distinct lower PASS и14 installed checks. Настоящие
5/30 и6/30 видны в Project/Queue; Cancel очищает telemetry до выхода worker-а,
а frozen Retry после сохранённых правок заново проходит1..30 с исходным seed.
PNG совпадает с прежним контролем; Results/Add/Undo/Save/reopen и старые данные
сохранены. Счётчик не меняет durable state, а N/N не означает публикацию.
Качество, Anima, capacity и release Install/Repair не повышаются;
**«Пока не обещать»** остаётся. Следующие checkpoint-записи исторические.

[Linux Main-only ownership](./engineering/phase-4-regional-guidance-main-death-research.md)
подтверждён отдельно:13 checks в трёх реальных Electron lifetimes,407 distinct
lower PASS и три восстановленные mutation sequences. После SIGKILL только Main
Python завершился без тестовой помощи; следующий guarded worker удалил только
подтверждённый transport до Ready. Frozen Retry, Recover, Results,
Raster Add/Undo/Redo и Save/reopen сохраняют прежнюю историю, включая старый
непринятый кандидат. Linux creating-parent-thread/direct-child scope; unmarked
legacy scratch сохраняется. Качество, Anima, capacity и release delivery не
повышаются; **«Пока не обещать»** остаётся. Следующие checkpoint-записи исторические.

[Installed regional recovery](./engineering/phase-4-regional-guidance-installed-recovery-research.md)
подтверждает finite восстановление после двух прерываний owned-scope приложения:
APP_RESTART без автопродолжения, явный frozen Retry после сохранённых правок,
возврат готового кандидата через Recover и явный Add/Undo/Save/reopen.
ROOT: 13 native-r2 checks, 211 lower PASS, typecheck и mutation/control/restoration.
Прежние задания и сохранённые проекты неизменны. Main-only/worker-only orphan
handling, качество и release lifecycle не квалифицированы; **«Пока не обещать»**
сохранено. Следующие записи остаются историческими со своими границами.

[Installed regional continuation](./engineering/phase-4-regional-guidance-installed-research.md)
теперь отдельно подтверждает finite renderer→IPC/default RuntimeManager путь:
30 шагов/1024², Cancel и frozen Retry после сохранённых правок, Results,
явный Raster Add, Undo/Redo и Save/reopen с точными PNG/ZIP bytes. ROOT: восемь
native-r6 checks и 1,019 Main PASS; developer provisioner не является release
Install/Repair. Numeric regional progress, качество, Anima и capacity не
квалифицированы; статус обещания **«Пока не обещать»** сохранён. Следующие
checkpoint-записи остаются историческими со своими границами.

Новый [public Invoke Canvas срез](./engineering/phase-4-regional-guidance-public-invoke-research.md)
подключает один finite Current Canvas regional Generate, причины отказа,
Queue/Results/export/Retry и существующий явный Raster Add. Versioned
`invoke-canvas-v1` не продвигает старые private jobs и не добавляет Anima/Smart
regional execution. ROOT: 1,013 distinct affected Main cases, 813 Python PASS,
typecheck/basedpyright PASS и один настоящий public trained request через
Results, Raster Add, Undo/Redo и explicit Save/reopen. Installed RuntimeManager /
renderer→IPC, качество и public release остаются отдельными границами.
PP-001 остаётся **«Пока не обещать»**. Следующие
исторические записи сохраняют evidence и ограничения своих checkpoints.

Текущий [Regional Guidance reference-image owner](./engineering/phase-4-regional-guidance-references-research.md)
имеет **source implemented; finite native-r10 PASS; retention/release complete**; preserved baseline —
1,331 source members. Current source добавляет inline thumbnail cards с
name/format/dimensions и Add/remove/reorder без изменения selection, prompt
mounting или Current Canvas context при выбранном Smart. Add доступен по
Current Canvas Illustrious metadata независимо от installed resources;
Anima/unknown показывает reason. Existing refs видимы и repairable через
remove/move в любом семействе; disabled editable, lock/pending guards запрещают
мутации. Guarded import callback восстанавливает только originating focus.

Root confirms **source implemented; lower-level checks and finite native-r10
qualification PASS**. Final lower checks are **Python 118 PASS**, post-lint
**typecheck-r3 PASS**, **full lint-r2 PASS**, **neighbors-r2: 952 PASS / 57 files /
0 skips**, and **fresh build-r1 PASS**. Later changes were harness-only, each with
syntax/format/scoped ESLint PASS. Earlier typecheck-r2 and neighbors-r1
950/57 preceded the final checks; neighbors-r1 predates the Save fix. The earlier
lint-r1's 196 autofixable ordering/braces errors in 16 changed files are historical,
not the final lint outcome.

The duplicate mutation records **2 GREEN → 1 semantic RED + 1 control GREEN →
2 restored GREEN**; all **1,343 mutation-source members** are restored.
Production **R2 source review is CLEAN** after the P2 Save A/B rebase fix and
external-replacement neighbor. Rebase requires full-document equality to exact
`baseDocument` or exact authorized `saveTarget`. The causal
`SAVED_PROJECT_CHANGED` assertion was unchanged when the explicit
Recover-new-revision test oracle was corrected; `save-rebase-green-r2` passed
both cases.

Final **native-r10: 12/12 PASS in 191.188 s**, script `1f5ac7ce`, with its
**R11 source review CLEAN**. The successful run uses the source-r2 archive
(1,343 members), exact script overlay and build-r1 (33 members). It observes
**882 Main calls, originals exactly once**, and **149 actual CPU children**
across two Electron lifetimes: intentional dirty SIGKILL, then healthy code 0.
Exact Main/dialog/spawn/kill/write restoration completes with zero in-flight
calls and zero page errors; root freshly confirms recorded PID/start identities
absent. Contract R1 is CLEAN source-only; final source/build/version mapping is retained.

Root actually opened **all 10 final screenshots** under `ui-audit`: 1440×900
and 900×620, reference cards, keyboard tooltips and recovered image states.
This bounded self-review found no material new reference-layout defect; it is
not independent review, full WCAG or all-compositor qualification.

Native attempts **1–9 remain FAILED**. Harness source-oracle findings R7/R8
were closed by subsequent code/reviews and successful replay; those failures
do not establish another product bug beyond the corrected Save rebase.

The OS picker result was controlled; the worker was the **actual development
CPU worker**, with no ML/catalog injection. Installed-resource transitions,
packaged-worker behavior, inference and frozen active work are not
native-qualified. Transient target/Smart-preparation outputs have metadata-only
witnesses, without raw replay. Prototype SVG/data URLs remain separate mock
behavior and do not extend this evidence boundary.

Retention **R1–R7 are CLEAN, candidate-only, READ-FINISHED**; contract **R1 is
CLEAN, source-only**. Root freshly verified source/build bytes, physical exits,
exact restoration, dependencies and all-reader completion, then released all
22 exact disposable paths: 2 unit and 20 native payloads. Measured artifact-root
allocation reduction is **216,420,352 bytes** (unit 35,950,592; native 180,469,760).
Compact evidence and external runtime/package dependencies remain protected.
Final source/build/version mapping is retained in the linked checkpoint.
PP-001/007/008 remain
**Пока не обещать**; finite qualification does not promote public readiness.

Prototype SVG/multiple data URLs не являются production proof. Weights/adapters,
conditioning/inference, admission/queue, provenance и model-policy expansion
исключены. Публичный статус **Пока не обещать** не повышен; прежние checkpoint
records ниже сохраняют исторические scope/evidence.

Текущий [Regional Guidance owned-mask checkpoint](./engineering/phase-4-regional-guidance-masks-research.md)
имеет **source implemented; lower-level checks и finite native-r7 qualification PASS**;
local visuals просмотрены root; retention/release завершены. CPU tools/Transform
Region/Clear, отдельная immutable PNG ownership и Save/shadow/recovery/resources
интегрированы; regional bbox/Fit отсутствуют. Disabled regions редактируются, lock
запрещает запись, selected overlay использует `overlayOpacity`. Captured command
сохраняет revision/epoch guards и защищённое состояние соседей.

Root: **869 Node / 50 files, 0 failures/skips** до lint-only production delta
(focused 89 входят в 869); post-lint typecheck r3/focused r3 **89**, full lint r2
(4 partitions), fresh app build r1 и prototype r2 **182 PASS**; production R2
**CLEAN, source-only**. Final **native-r7: 12 checks PASS, 157.061 s**,
`fullTwelveCheckQualification: true`: Save/read/reopen, dirty-PNG crash/recovery,
all tools/whole-alpha/geometry/history/refusals/namespaces/duplicate controls.
Both lifetimes: 95 handlers restored, in-flight/page errors 0; original IPC exactly
once. Root просмотрел все 6 final screenshots при 1440×900/900×620, включая
quarter-turn/recovered states, без material local finding; bounded self-review,
не full accessibility audit. Source R4/R5 CLEAN, source-only.

Ранние failures остаются failures: specific native5 hash cause не подтверждена;
native6 menu-selector mismatch не является feature RED, native3 restoration gap
сохраняется. Retention audits R1–R4 CLEAN/READ-FINISHED с указанной границей
R2; contract R2 CLEAN source-only. Final harness-scoped lint PASS. Root проверил
exit/restoration/readers и удалил только 15 exact idle paths: освобождено
113,537,024 bytes (108.28 MiB); compact evidence/external dependencies сохранены. Exact script/process/mutation boundaries — в linked research.
Enabled-region NEW Generate refusal сохраняется; conditioning/reference images/
inference вне owner. Статус **Пока не обещать** сохранён.

Завершённый [Regional Guidance prompt authoring](./engineering/phase-4-regional-guidance-prompts-research.md)
реализует durable optional positive/negative blocks и явное global-negative
inheritance. Общий compact PlainPromptEditor использует Current Canvas context,
включая selected Smart, и Main-owned exact embedding verification. Add сохраняет
пустой block, Clear оставляет его, последний Remove удаляет wrapper; inheritance
сохраняет dormant local text/refs, Remove Negative очищает их. Dedicated prompt
API и один document stream группируют live writes/ordered seals с revision/epoch
и lock guards; unpublished input доступен для correction/retry/pending-only
discard, без rebasing после external revision/observed Undo ABA. Metadata APIs и ordinary generation-draft target/change validation
сохранены. Shared seal endpoint дополнительно принимает strict regional
namespaced group IDs; ordinary draft group validation не расширена. Enabled NEW ordinary/Smart refusal, frozen Retry
и опубликованные jobs независимы. Geometry, provenance, presets, operational cursor,
queue/model policy, regional mask pixels/reference images и conditioning не входят в этот owner;
Regional Guidance исключён из accepted provenance и для будущих conditioned results.
**Finite authoring checkpoint и retention/release завершены root.**
795 affected/neighbor Node tests в 41 files, 0 failures/skips, предшествуют
последнему одиночному row ARIA attribute. Финальный row 20c2fb6e: typecheck r7,
later row/script scoped lint и fresh app build r4 PASS; full lint r2 (4 partitions)
и prototype r1 182 shared-consumer browser checks PASS, prototype source не менялся.
Complete production R4, narrow ARIA R5 и final native-source R7 CLEAN — source-only.
Root native-r8/script ff502357: **12/12 PASS, 97.714 s**, healthy final code 0,
две Electron lifetimes с dirty SIGKILL/recovery и healthy close; both observer
restorations true/inFlight0. Actual Save/loader/reopen, dirty recovery и полные
SQL/document/PNG/mask/variant/provenance/neighbor/cursor/policy controls PASS.
Root открыл/просмотрел все 7 screenshots при 1440×900/900×620: material layout
findings нет в scope; bounded self-review, не independent full accessibility audit.
Исторические failed attempts остаются failures в linked root research.
Retention audits 1–4 CLEAN/READ-FINISHED; contract R2 CLEAN source-only. Root
проверил exit/restoration/readers и удалил 18 exact idle paths: освобождено
116,359,168 allocated bytes (110.97 MiB); compact evidence/external dependencies
сохранены. Masks/reference images, conditioning, inference,
installed embedding/autocomplete, active-work/Main-ABA qualification и full promise
не заявлены. Root владеет final retention/release evidence; prototype остаётся
plain textareas/mock masks/references. Статус **Пока не обещать** сохранён.

Завершённый checkpoint [Regional Guidance foundation](./engineering/phase-4-regional-guidance-foundation-research.md)
добавил отдельные пустые durable entities: add/select/rename/enable/lock/overlay
opacity/duplicate/delete, ordinary Undo, explicit Save и local recovery. Optional
поле не материализуется в legacy Project; owned UUIDs и соседи сохраняются.
Каждый enabled region блокирует NEW ordinary/Smart Generate до подготовки и
публикации с явной причиной; disabled regions инертны, уже frozen jobs и Retry
независимы. Root подтверждает **711 Node tests / 33 test files, 0 failures/skips**:
54 focused, 3 actual-preload и 11 generation-guard cases входят в 711.
**182 full prototype browser tests**, typecheck r7, full lint r4 и fresh build r3
PASS; prototype code этот owner не менял. Isolated pre-SQL mutation:
2 GREEN → semantic RED (8 queue rows вместо 4), disabled control GREEN →
2 restored GREEN; все 1,320 source members и shared Queue subject восстановлены.
Final native-r5: **12 checks PASS**, 266.205 s, code 0 после intentional
dirty-shadow crash, recovery и healthy close; actual 1440×900/900×620,
legacy no-op Save/loader/reopen, lifecycle, meaningful Save и exact-neighbor
recovery, post-close protected SQL/package/assets/source bytes проверены root.
Rename focus получил causal RED → same-harness GREEN; финальные source reviews
clean, root просмотрел normal/minimum/recovered и focused-error screenshots.
Native не квалифицирует ML/inference или active-work execution; successful
frozen Retry подтверждён controlled unit tests. Historical failures сохранены.
Retention R1–R4 clean/read-finished; root независимо проверяет exit/restoration/
readers и удаляет только 15 временных каталогов: 104.66 MiB allocated space
освобождено, compact evidence и внешние зависимости сохранены. Prompts/inheritance/references/nonempty masks,
painting/transforms/conditioning и full release остаются вне этого среза;
публичный статус **Пока не обещать** сохранён.

**Продуктовый статус:** принято как продуктовое направление.

**Публичный статус:** пока не обещать как готовую возможность — Electron shell,
базовые Home/Project и Model Manager уже подключены; [production Preset Manager](./engineering/phase-3-preset-manager-research.md)
подключает ручное создание/редактирование и Deleted к SQLite. Полный Home,
сохранение preferences и Project preset flows остаются открытыми.

[Исправления аудита](./engineering/product-audit-fixes.md): standalone Project и
Home используют выбранную document session; переключения и сохранение UI state
проверяются browser regressions на обоих маршрутах прототипа.

### Обещание

Каждый экран ImageGen Studio имеет стабильное назначение и готов к работе.
Пользователь настраивает свою творческую работу, не собирая интерфейс из панелей.

### Пользовательская выгода

Пользователь занимается изображением без изучения docking, раскладки widgets
и отдельного сохранения layout presets.

### Явное не-обещание

- Произвольный docking, замена и дублирование основных панелей.
- Превращение одного режима в другой через пользовательский layout.

Ограниченные resize/collapse preferences допустимы по supporting contract.

### Supporting contract

[PP-001 Supporting Contract](./contracts/interface-composition.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

[Public selected-VAE opaque IMG](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md) extends the existing prepared owner through actual Generate/Cancel/frozen Retry and explicit Add/Save-reopen. ROOT582 Main/223 Python/196 browser PASS,19 installed checks, exact A/FP32 replay and controlled B pixel influence retain ordinary VAE provenance and existing Regional Guidance exclusions. Current Embedded/FP16 authoring cannot replace frozen A/FP32. This finite evidence does not promote PP-001 or visual/release readiness.

## PP-002: Явное намерение вместо магического control

**Продуктовый статус:** принято как продуктовое направление.

**Публичный статус:** пока не обещать как готовую возможность — Create/Import/Save,
Model Manager install/repair и выбор exact checkpoint используют production
команды; [Generate](./engineering/phase-2b-generate-actions-research.md) теперь подключён к typed main/queue в узком Illustrious txt2img срезе. Apply и полный resource handoff ещё не подключены. Локальные
проверки install не доказывают живую загрузку CivitAI в release-сборке.
Локальные [syntax diagnostics prompt](./engineering/project-prompt-diagnostics-research.md)
дают объяснения без автоматического изменения текста и блокировки Save;
проверены Electron Save/reopen и отдельный prototype Generate/Apply flow.

### Обещание

У каждого элемента управления одна понятная основная роль. Название и контекст
заранее объясняют действие; поиск не превращается незаметно в создание, импорт
или установку.

### Пользовательская выгода

Пользователь может искать и выбирать без риска случайно изменить данные
из-за формы введённой строки или пустого результата.

### Явное не-обещание

- Универсальный input, неявно переключающийся между разными намерениями.
- Скрытая mutation при поиске или навигации.

Autocomplete, явный creatable selector и command palette допустимы в границах
одного объяснимого намерения; точные исключения определены контрактом.

### Supporting contract

[PP-002 Supporting Contract](./contracts/explicit-intent.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

## PP-003: Одна сущность, один владелец и одно каноническое место

**Продуктовый статус:** принято как продуктовое направление.

**Публичный статус:** пока не обещать как готовую возможность — базовые Home/Project
и Model Manager работают через production команды; [production Preset Manager](./engineering/phase-3-preset-manager-research.md)
подключён как единая app-level модалка с detached drafts. Полный Preset/Apply
resource handoff и reuse flows остаются открытыми.

[Исправления аудита](./engineering/product-audit-fixes.md) проверяют, что
standalone Project tabs редактируют выбранный документ, сохраняют независимые
Undo/dirty/queue и показывают Home. Это evidence прототипа, не filesystem proof.

[Main-owned LaMa delivery](./engineering/phase-2c-lama-install-research.md) закрепляет один общий ресурс в
`appData/inference-resources`, вне checkpoint library, environments и disposable
cache. Worker получает только проверенный локальный файл. Installer и byte planner
пока внутренние: Set up/Install/Repair не подключены, статус PP-003 не повышается.

[Public outpaint admission (07.10.2026)](./engineering/phase-2c-public-outpaint-research.md)
использует этот общий exact local ресурс для Generate/frozen Retry обеих семей;
worker-only capability flags не заменяют verification при admission/dispatch.
Шесть trained installed development UI completions при 256×256/трёх шагах
подтверждают public path и общий helper owner. Fixed Main installer проверен с
genuine local transport substitute и exact reuse, без public network download,
first-setup integration или signed release claims; статус PP-003 не повышается.

### Обещание

У проектов, моделей, пресетов и результатов есть понятные роли и места
управления. Пользователь знает, где найти и изменить нужное, без выбора между
несколькими конкурирующими хранилищами одной работы.

### Пользовательская выгода

Устойчивый словарь и расположение настроек помогают понимать, что изменится
и какой части работы принадлежит это изменение.

### Явное не-обещание

- Несколько независимых мест полного управления одной сущностью.
- Новые пользовательские категории только ради внутренних storage/API types.

Несколько shortcuts к одному manager и read-only projections допустимы.

### Supporting contract

[PP-003 Supporting Contract](./contracts/canonical-ownership.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

## PP-004: Управляемая библиотека моделей вместо ручной работы с файлами

Текущий [local resource previews](engineering/phase-2c-resource-previews-research.md): Main fetch/cache → existing CPU worker → verified sRGB WebP512/96 → exact-version picker/manager. Built Electron Save/default switch/offline restart проверены; Generate/Prepare не запускают artwork fetch. Исторический resource URL нескольких версий не заимствуется. Полный lifecycle/Presets/release остаётся открыт, статус «Пока не обещать». Current [Phase2C exit ledger](engineering/phase-2c-exit-ledger.md) отделяет
finite generation qualification от owners фаз 3–5; следующий owner — production Presets.

Предыдущий [NoobAI Karras refusal](engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». Следующий implementation item — local thumbnails/previews installed resources. Сведения о прежних checkpoints и их «следующем gate» ниже исторические; исходный lost traceback не восстановлен.

Текущий подтверждённый [Anima image cap32/prefix](engineering/phase-2c-anima-image-batch-cap-research.md): Euler256 IMG/normal mixed-alpha OUT:76 admissions/completions/accepted layers,4 Save-reopen packages,12 собственных wholeRGBA prefix matches. Два confirmed33 refusals сохраняют32 временных результата и исходный слой без новых jobs/receipts. Independent raw readback PASS85373;4 cursor/Save snapshots7/5,11 прежних SQL tables и43 worker identities сохранены;2 OUT previews/111104 protected source pixels. Только N3/CFG4/strength0.5/Myth−0.5/exact resources; quality/Invoke parity/fullMVP/release не заявлены. Следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. Статус promise остаётся «Пока не обещать».

Предыдущий подтверждённый [Anima image MAX→0](engineering/phase-2c-anima-image-seed-wrap-research.md): Euler256 IMG/normal mixed-alpha OUT: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 own MAX/0 wholeRGBA matches и 2 same-prompt contrasts. Independent raw readback PASS (18700 checks), 6 cursor/Save snapshots, 11 old SQL tables и 43 worker identities сохранены; 3 OUT previews / 166656 protected source pixels. Actual Main modulo fault: 18 executions, 2 RED / 16 GREEN; restored и guarded-cleaned 584 files. Portable provenance сохраняет raw weighted text, actual seed и resource/source context; compiled/step/posterior проверены отдельно в frozen worker inputs. Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader inputs/quality/Invoke parity/fullMVP/release остаются открытыми.

Предыдущий подтверждённый [Installed Anima image Random → Fixed](engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.

Предыдущий подтверждённый [Installed Anima image per-prompt](engineering/phase-2c-anima-image-per-prompt-research.md): Euler × common-source IMG/normal mixed-alpha OUT:80 admissions/completions/accepted layers,4 Save/reopen packages и16 own same-input wholeRGBA per-prompt controls. В каждом режиме genuine numeric-control4pairs×8/Fixed0/per-iteration сравнивается с4pairs×2/Fixed0/per-prompt по seeds0…7; control slots0,1,10,11,20,21,30,31. Independent raw readback PASS23682:80 owning comparisons,4 cursor/Save snapshots7,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. Full frozen DTO сохраняется; только owner IDs и предварительно проверенный seedBehavior исключены из matching. Concrete raw weighted prompts остаются portable; templates/maxPrompts/compiled arrays — вне provenance. 98 focused tests PASS0skip;18 actual Main source executions дают2 semantic RED/16 GREEN. 64 within-pair seed contrasts, без scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; cap32-refusal/Random/Reuse/wrap/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md): Euler × common-source IMG/normal mixed-alpha OUT:20 admissions/completions/accepted layers,4 Save/reopen packages и4 own same-input wholeRGBA prefix controls. Четыре weighted positive×negative пары × две iterations; Fixed0/per-iteration seeds0/1, full authored templates и selected first-pair prefix. Полные compiled strings/spans остаются в frozen worker inputs; portable provenance содержит concrete raw weighted prompts без compiled arrays/templates/maxPrompts. Independent raw readback PASS18128:20 owning comparisons,4 cursor/Save snapshots1,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. 75 focused tests PASS0skip;18 actual Main source executions дают4 semantic RED/14 GREEN. 34 visible joint-input contrasts не доказывают scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image dynamic embedding subsets](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md): EPS/V × common-source IMG/normal mixed-alpha OUT:24 admissions/completions/accepted layers,8 Save/reopen packages и8 own same-input wholeRGBA prefix controls. Fixed0/per-iteration baseline4/prefix2 сохраняют full authored refs и effective signed native/portable subsets; ordinary wire omits embeddings. Independent raw readback PASS18641:24 owning comparisons,8 cursor/Save snapshots0,11 old tables,43 worker identities и4 OUT previews/222208 protected source pixels. 118 focused tests PASS0skip;48 actual Main source executions дают16 semantic RED/32 GREEN. 28 visible input contrasts не доказывают embedding-only causality; новых installed-worker mutations нет. Только256×256/Normal N3/exact resources; quality/fullMVP/release не заявлены. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён отдельным20/4/4 gate. Последующий [Anima Fixed/per-prompt image80/4/16 gate](engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. PP-004/005/007/008 остаются «Пока не обещать».

Предшествующий подтверждённый [Installed image cap32 and selected prefix](./engineering/phase-2c-illustrious-image-batch-cap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 152 qualified admissions/completions/accepted saved layers,8 Save/reopen packages,24 own same-input wholeRGBA prefix controls. Четыре genuine confirmed33 UI refusals сохранили все32 temporary candidates и source1 без новых jobs. Independent raw readback PASS (104613 checks):152 configurations/comparisons,8 cursor/Save snapshots, 11 old tables и43 worker identities сохранены;34 source keys/five bundles bound. Historical Main:16 semantic RED/84 GREEN in100 executions; fresh deadline DI:4 RED/371 GREEN in375 executions; обе536-source copies exact-restored and guarded-cleaned,preexecution261 focused tests PASS0skip. R2 boundary2700s/prefix1800s при прежних12+2GiB/14GiB/zero-swap/1600s completion poll. R0 timeout сохраняет32 actual accepted layers/one actual package/zero qualified stages; raw across attempts184, qualified counts exclude R0. Native seeds0…7 — только256×256/Normal N3/four pairs×8 boundary иfirst3pairs×2 prefix; MAX cross-pair wrap/Anima image/installed mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles в четырёх admissions:
Z/T и T/Z на objective,256×256/три steps/seed0, один literal на sign, exact
trained/zero versions, LoRA−0.5 и native external VAE/FP32. Strict catalog5/9
сохранён без публикации и новых managed files. Три успешных independent native
oracles проверили12 direct hidden/pooled/handoff assignments, не добавляя jobs.
Installed EPS sign-swap завершил два finite UI cycles до causal directional RED,
хотя pixels оставались разными; physical exit/restored43/original inode/mode/mtime/
bytes/backup absence подтверждены, fresh EPS pair2 GREEN. Final evidence связывает
все8 UI cycles с saved packages/Pillow pixels/SQLite receipts и точными signed refs;
mutant pixels равны противоположным normal choices, fresh pixels равны своим.
Подготовленные local sources не доказывают public delivery; arbitrary formats,
arbitrary multiple-LoRA combinations/order, Anima0.14, dynamic, quality/Invoke parity и release открыты.
Предыдущие counts и статус «Пока не обещать» сохранены.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
подтверждает 36 finite completions в 36 admissions: оба declared EPS/V recipes,
txt2img, common-source img2img и normal mixed-alpha outpaint, шесть matched
component choices на каждый mode/objective. Один canonical worker0.14 использует
пять resources/eight versions с сохранением исходных checkpoint/LoRA identities.
Проверены enabled/disabled LoRA −0.5, отдельно trained/zero embedding в каждом
sign и healthy native/finite decoder-control/same-weight LDM VAE. Это bounded
256×256/три requested steps. Четыре installed EPS-txt2img component mutations
дали causal RED после шести finite Generate/Add/Save/readback/reopen cases каждая.
Исходник восстановлен между прогонами; fresh restored EPS-txt2img normal прошёл
шесть finite cycles с подтверждённым native physical exit.
Exact local source/catalog preparation не доказывает
public CivitAI delivery или engine Install/Repair. Bounded polarity follow-up
описан выше; multiple-adapter order, Anima на worker0.14, dynamic batches,
Presets и release остаются открытыми. Статус «Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
завершил 8 finite EPS/V txt2img/strength0.5 img2img cases при256×256/трёх
requested steps. Native и artificial encoder-only control сохраняют decoder/config:
TXT pixels равны, IMG pixels различаются. Catalog5/9 сохраняет исходные восемь
versions; derived source preparation остаётся isolated local precondition,
не public delivery. Installed EPS-img2img encode-zero mutant завершил два full
finite cycles до causal pixel RED; после physical exit восстановлены 43 exact
source files с original inode/mode/mtime. Fresh restored pair прошла два finite GREEN cycles с physical exit.
Outpaint encoder, all-layer/format compatibility, качество и Invoke pixel parity
этим TXT/IMG срезом не квалифицируются; полный MVP по-прежнему не обещается.

Отдельный последующий [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
подтвердил четыре finite EPS/V normal OUT cycles в четырёх admissions при256×256,
трёх requested steps, FP32, seed0 и strength0.5; native schedule выполняет два
effective denoising evaluations. Две matched пары сохраняют contribution alpha
и protected source, меняя visible generated RGB и saved merged RGB на
соответствующих координатах после Add/Save/readback/reopen/comparison.
Catalog5/9 сохранён без новых managed files; оба native runs завершились с physical exit.
Installed EPS-OUT encode-zero mutant завершил два finite cycles до intended visible-RGB RED;
physical exit и восстановление 43 exact sources с original inode/mode/mtime
подтверждены. Fresh restored pair прошла два finite GREEN cycles с physical exit
и exact original EPS RGBA/merged pixels. Final evidence связывает все восемь OUT
cycles (4 normal +2 finite mutation cycles до causal RED +2 fresh GREEN) с CPU
control descriptors во всех frozen VAE refs и реальными SQLite completed rows/
receipt bytes; independent Pillow saved `.igs` decode подтверждает alpha, protected
source и corresponding visible/merged pixels. Main/worker/nativeData idle; все43
exact sources восстановлены с original inode/mode/mtime/bytes, backup отсутствует.
Это отдельные OUT counts, не расширение прежних 8 TXT/IMG cases; all-layer/formats/quality/Invoke parity,
public delivery и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Exact NoobAI standalone VAE source gate исправлен; controlled HTTP → настоящий installer/SQLite → repair/default/fresh connection/Prepare проверены для LoRA, dual-CLIP embedding и VAE с exact identities и реальными structural qualifiers. Неизвестные labels и generic SDXL checkpoints/LoRA/embeddings по-прежнему отклоняются. Credited local sources отдельно прошли Main preflight; unchanged installed worker0.14 CPU загрузил два полных VAE layouts и проверил finite paired embedding state. Прямой download embedding не является public app installation; trained combinations оставались открытыми на этом source/Prepare checkpoint и проверены последующим bounded installed срезом выше. Anima/new-worker regression и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
использует один worker0.14, exact three-resource catalog и pinned LaMa с проверкой
SHA/size через настоящий Main staging/publication при intercepted local transport.
Отдельный source download не доказывает engine first setup или live CivitAI
установку. Оба objectives прошли обычный mixed-alpha путь; Model Manager остаётся
единственным владельцем prediction/ZTSNR/spacing. Component combinations оставались
открытыми на этом checkpoint; последующий bounded срез описан выше. Independent
component gates, new-worker Anima regression, Presets и release остаются открытыми. Статус
«Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
использует один обновлённый non-editable worker0.14 и exact catalog из Cyberfalafel
v-pred, отдельного официального NoobAI epsilon и ordinary LoRA. Новый epsilon файл
прошёл реальный Main downloader/hash/size/staging с полностью intercepted local
transport и fake token, затем catalog publication; это не live CivitAI delivery
или Add-from-URL UI install. Model Manager остаётся единственным владельцем
prediction/ZTSNR/spacing. Пять trained single-axis controls, отдельные четыре
lifecycle completions и два прогона 832×1216/28 steps описаны с границами reports.
Component combinations и оба NoobAI outpaint objectives оставались открытыми
на этом author checkpoint; последующие bounded checkpoints описаны выше.
Presets и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий v-prediction срез (07.10.2026): [Installed Illustrious v-prediction qualification](./engineering/phase-2c-installed-v-prediction-research.md)
проверяет exact Cyberfalafel v-pred v1.2 by Knightus_Ai, CivitAI model/version/file
1147756/2679856/2566634, с сохранённым raw `baseModel=NoobAI` и принятой
Illustrious family mapping. Model Manager остаётся единственным владельцем
override точного файла; Project показывает текущую интерпретацию read-only.
Четыре finite installed txt2img/img2img completions прошли при
256×256/трёх шагах/seed `0`/Euler a/Embedded FP32/ordinary LoRA −0.5.
Native каталог из checkpoint и LoRA подготовлен локально; controlled API tests
source admission являются отдельным evidence, а не live CivitAI install/repair.
Смена `v_prediction`/`epsilon` на одних trained weights служит causal control,
не определяет training objective из tensors и не доказывает качество.
ZTSNR/trailing author recipe, другие installed samplers, v-outpaint, network
installation и release остаются открытыми. Статус PP-004 «Пока не обещать»
сохранён; прежние checkpoints ниже сохраняют исторические границы.

Текущий Euler срез (07.10.2026): [обычный Illustrious Euler](./engineering/phase-2c-euler-research.md)
проводит `Euler` / `Normal` → `euler` через выбор, frozen queue/Retry и portable
accepted settings. Worker0.13 с `illustrious-euler` использует настоящий pinned
EulerDiscreteScheduler; старые peers отказывают до публикации или wire request.
Численные CPU проверки и реальный tiny UNet/VAE pipeline отделены от управляемого
inference peer в SQLite/`.igs`/JSONL integration tests. Это не installed trained
Euler proof: ZTSNR, spacing policy, авторский NoobAI V-Pred recipe и полная
поддержка семейства остаются открытыми. Приняты отдельные Model Manager controls
и явно отмеченные неизвестные defaults. Статусы PP-005/007/008 не повышены.

Текущий embedding срез (07.10.2026): [Installed Illustrious embedding qualification](./engineering/phase-2c-installed-embeddings-research.md)
соединяет actual ID-only autocomplete с trained IllustriousPhoto by
CautionMergeAhead, WAI v15 1152steps, и отдельно обозначенным artificial zero
control. Обе exact версии используют один canonical literal; matched positive,
negative и weighted/repeated img2img pairs меняют pixels только при смене
trained/control weight identity. Восемь finite completions при 256×256/трёх
шагах/seed `0`/Embedded FP32/ordinary LoRA −0.5 не доказывают качество или
совместимость всех файлов. Прежние семь resources/девять versions и Defaults
сохранены; две embedding versions дают итоговые восемь resources/одиннадцать
ready versions. Требуемый автором credit сохранён. Local prepared sources не
квалифицируют live product CivitAI install/repair; Anima/presets и release
остаются открытыми. Последующие исторические authoring/inference checkpoints
сохраняют прежние границы evidence; публичный статус PP-004 не повышен.

Текущий внешний VAE срез (07.10.2026): [Installed external VAE qualification](./engineering/phase-2c-installed-external-vae-research.md)
соединяет точный выбор в Project с настоящим installed inference. Восемь finite
FP32 случаев проверяют Embedded, exact LDM/native и явно искусственный control
в txt2img и common-source img2img при strength 0. После настоящей смены library
Default и Reset frozen Retry сохраняет исходный native VAE. Это исполнение
локальных prepared weights, не live CivitAI install или отдельная training lineage;
полная совместимость библиотеки и release остаются открытыми.

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность. В production
Model Manager реализованы локальная установка из CivitAI URL, проверка целостности,
repair и независимые версии, в том числе custom Anima с закреплёнными Qwen3/VAE;
их пути проверены с SQLite и файловой системой.
Production Project выбирает точную установленную версию checkpoint и сохраняет
проверенную main ссылку в `.igs`; смена Default и исчезновение файла не
подменяют этот выбор. После переноса `.igs` пользователь может явно связать
сохранённую версию с точной установленной копией CivitAI-файла; меняются только
локальные ID, а правка сохраняется обычным Save. Полная загрузка/совместимость
моделей в worker и связи с Presets остаются открытыми;
LoRA и VAE имеют отдельные checkpoints ниже.

[Staging publication correction](./engineering/model-install-staging-publication-research.md)
удаляет собственные staging hardlinks и синхронизирует каталог до публикации
установленной версии в SQLite. Это предотвращает ложный integrity refusal,
когда прежняя post-success очистка меняла ctime корректного файла во время
точной проверки. Реальные install/repair, отказ удаления и late Cancel проверены
с соседними rollback/reuse cases; строгая проверка целостности сохранена.
Полный lifecycle и публичный статус PP-004 этим не закрываются.

[Anima loader foundation](./engineering/phase-2c-anima-qualification-research.md)
проверяет exact saved checkpoint и связанные pinned Qwen3/VAE в Main, затем
полный native Cosmos/conditioner/Qwen3/Wan state в Python. Реальные локальные
веса загрузились offline на CPU с production profile; это отдельная проверка
загрузки, без conditioning, denoising или GPU generation. Checkpoint SHA не
служит allowlist; несовместимая topology отвергается. Следующий
[conditioning foundation](./engineering/phase-2c-anima-conditioning-research.md)
добавляет exact bundled tokenizers и weighted Qwen3/adapter conditioning,
проверенные отдельно на trained CPU weights. Anima Generate остаётся
заблокированным до editor handoff и сквозной pipeline qualification;
PP-004 не объявляется завершённым.

Следующий [Anima Euler foundation](./engineering/phase-2c-anima-euler-research.md)
проверяет internal weighted Cosmos/Wan txt2img и opaque img2img, включая
actual trained NVIDIA pixels, seed replay и finite/padding guards. Проверка
ограничена 256×256 и тремя шагами; другие schedulers/options, editor handoff,
queue/provenance и release остаются открытыми. Это не открывает Anima Generate
и не завершает managed-library promise. Следующий
[ordinary Anima LoRA foundation](./engineering/phase-2c-anima-lora-research.md)
добавляет exact Main/file/native qualification и scoped signed adapters до
Qwen/conditioner encoding. Shared native Linear profile, complete tensor/rank/alpha
проверки, signed stack и cleanup подтверждены отдельно; trained GPU controls
охватывают три локальные backbone LoRA, tiny native tests — также Qwen и
conditioner. Public admission/queue/provenance и release не расширены.
Следующий [deterministic sampling foundation](./engineering/phase-2c-anima-sampling-research.md)
проверяет internal Euler/Heun/DPM++ 2M с отдельными native schedules и fresh solver
history, actual evaluation counts и selected-schedule interior img2img. Stochastic
методы/LCM реализованы в следующем checkpoint; public integration и release
остаются открытыми; PP-004 не завершён.

[Six-method flow sampling](./engineering/phase-2c-anima-flow-sampling-research.md)
завершает internal numerical registry DPM++ 2M SDE/ER-SDE/FlowMatch LCM рядом
с deterministic methods. ER solver переносится точными upstream bytes с
лицензиями; step RNG и history принадлежат одному запросу. Типизированная policy
и native controls проверяют LCM shift/clipping correction, replay и finite/cleanup
границы. Public integration, модельное качество и runtime/release qualification
остаются открытыми; PP-004 не завершён.

[Anima worker entrypoint](./engineering/phase-2c-anima-worker-entrypoint-research.md)
подключает typed compiled commands к inference worker 0.11.0: offline native
bundle, обе weighted полярности, шесть методов, signed LoRA, opaque img2img,
provisional sRGB PNG и thumbnail. Anima capability объявляется только при
native CUDA BF16; Illustrious остаётся доступным на остальных qualified CUDA
GPU. Это внутренний worker checkpoint: Project admission, durable queue/Retry,
accepted provenance и release остаются открытыми. Статус PP-004 не повышен.

[External VAE authoring](./engineering/phase-2c-external-vae-authoring-research.md)
добавляет установку/repair CivitAI VAE компонентов с labels `Illustrious` или
`SDXL 1.0`, сохраняя raw source metadata и запрет standalone SDXL checkpoints.
Project выбирает точную проверенную версию, сбрасывает к Embedded или явно
связывает portable reference; Undo/shadow/Save/reopen и смена Default сохраняют
эту identity. Late selection/relink не перезаписывают последующие действия,
включая edit → Undo. Anima companion остаётся закреплённым. Installation integrity
не объявляется ML qualification. Следующий
[external VAE inference checkpoint](./engineering/phase-2c-external-vae-inference-research.md)
подключает exact source/SHA/size/header verification перед Prepare, materialization,
Retry и dispatch. Worker 0.9.0 проверяет полный набор тензоров и загружает standalone
LDM/native Diffusers VAE с pinned SDXL config. Совпадение формы весов не доказывает
training lineage; старые peers и changed/unsupported files отказывают явно.
Публичный статус PP-004 не повышен.

[Exact embedding authoring](./engineering/phase-2c-embedding-authoring-research.md)
связывает установленную Illustrious версию с обоими Project prompts. Новый token
использует original safetensors filename stem в угловых скобках; `trainedWords`
служат поиску, без negative alias. Main проверяет managed bytes/source/token,
связывает uniquely owned canonical input либо ждёт explicit selection при
collision. Missing/corrupt installed owner не превращает соседнюю версию в
автоматический выбор. Сохранённая identity переживает rename/Default/file loss;
portable Link меняет только локальные IDs. SQLite/filesystem tests проверяют
authoring, не tensor loading. Qualified Illustrious inference подключён
следующим checkpoint; Anima embedding actions остаются открытыми; PP-004 не объявляется завершённым.

Project → Model Manager теперь фокусирует выбранный checkpoint и помечает его
точную версию без смены Default или Project reference; Electron smoke проверяет
повторное открытие после фильтров и предупреждение при отсутствующем локальном
ID. [Resource handoff](./engineering/phase-2c-resource-handoff-research.md) теперь
передаёт категорию даже без выбранного ресурса, добавляет LoRA entry и exact-row
переход, сохраняет embedding trigger при проверке каталога. Native checks
проверяют возврат с обновлением доступности exact файлов, различие Project
version/Default и неизменность draft/history/bbox/Save snapshot. Fixture
восстановления файла не доказывает CivitAI repair. Preset handoff, installed
resource thumbnails и полный PP-004 остаются открытыми.
[Model Manager read ordering](./engineering/phase-2c-model-manager-read-research.md)
отдельно квалифицирует запоздавшие catalog/jobs/storage/token ответы, ошибки и
loading после нового открытия. Native RED воспроизводит восемь сбоев, свежий
GREEN проходит все 11 checks. Полный список jobs сохраняет updates, наблюдавшиеся
во время запроса, и нетронутые строки Main. Guard не отменяет команды установки;
actual download/repair, token secret-storage mutation и полный PP-004 остаются
открытыми. Публичный статус не повышен.

Принятый [контракт](./contracts/managed-model-library.md)
разрешает установку любого поддерживаемого CivitAI Illustrious/Anima
`.safetensors` checkpoint. Illustrious prediction override хранится по точным
SHA-256 и размеру файла; `epsilon` предлагается как явно обозначенное предположение,
если нет подтверждённого значения. SHA-256 остаётся проверкой целостности и
identity. Текущий код устанавливает такие checkpoints, редактирует тип только в
Model Manager и показывает его в Project read-only. Prepare повторно хеширует
точный файл и берёт current effective type независимо от advisory snapshot в
`.igs`, включая прежние non-null и `null`. Frozen контекст фиксирует фактический
тип; если override изменился до materialization, старый контекст отвергается.
Model Manager и Project display проверены в Electron smoke; первый SDXL
structural preflight и локальный GPU worker с ограниченным dual-CLIP
conditioning проверены отдельно от
Electron dispatch. Их форма не доказывает Illustrious lineage, полную
совместимость модели или поддержку всего MVP pipeline. Для custom Anima показаны условия
обязательных компонентов и объём выбранного файла; SQLite/filesystem tests
проверяют откат поздней ошибки установки при repair компонента.

Project LoRA stack уже хранит точную проверенную версию, вес и enabled state;
добавление/удаление не переписывают prompt или embedding refs. Выбор и Save
проверены через Electron, recovery — через реальную SQLite/файловую систему.
Portable relink для LoRA проверен на двух библиотеках SQLite и в Electron:
только локальные ID меняются после проверки точного CivitAI-файла; настройки
и metadata остаются прежними. В Electron prompt подсказки и подсветка берут
триггеры выбранной точной версии, независимо от Default. Disable/remove и потеря
файла убирают контекст, сохраняя текст; неизвестное семейство не подтверждает
совместимость. [Проверки prompt](./engineering/project-lora-prompt-research.md).
[Обычные Illustrious LoRA](./engineering/phase-2c-lora-research.md) теперь проходят exact-file/header preflight и применяются в normal txt2img/img2img. Public Anima и другие adapter algorithms ещё не подключены; internal ordinary
Anima helper описан выше. Install сам по себе не доказывает inference compatibility.

[Размер файла до установки](./engineering/product-audit-fixes.md) берётся из
CivitAI `sizeKB` либо проверенных локальных exact bytes для repair/reuse. Без
корректного известного размера Main не создаёт install job, UI объясняет отказ.
Source estimate не заменяет проверку скачанных bytes/hash.

### Обещание

Пользователь выбирает модель и версию с CivitAI, а ImageGen Studio управляет
загрузкой, metadata и локальной библиотекой. Обновления устанавливаются явно
и сохраняют возможность пользоваться прежними версиями, не меняя настройки
существующих проектов и пресетов.

### Пользовательская выгода

Не нужно вручную скачивать и раскладывать файлы, собирать сведения о модели
или помнить, какая её версия использовалась в работе.

### Явное не-обещание

- Основной workflow через ручное скачивание и раскладывание файлов.
- Редактирование source metadata и кастомизация model cards.
- Поддержка любой модели, универсальный marketplace или silent auto-update.
- Гарантия повторной загрузки файла, который больше недоступен у источника.

Local import может появиться отдельным flow; подробные ограничения сохранены
в supporting contract.

### Supporting contract

[PP-004 Supporting Contract](./contracts/managed-model-library.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

[Illustrious embedding inference](./engineering/phase-2c-embedding-inference-research.md)
добавляет paired dual-CLIP safetensors в обе normal prompt-полярности worker
0.10.0. Exact Main verification, worker snapshot/finite/dtype checks и реальный
public loader/native pipeline имеют отдельные evidence от authoring. Dynamic
jobs/Retry/dispatch используют frozen effective files; old worker, changed или
unsupported input отказывают явно. Synthetic tensors не доказывают trained
embedding quality или совместимость всех CivitAI файлов. Этот исторический
checkpoint дополнен bounded installed trained evidence выше; PP-004 остаётся
неполным.

[Anima authoring](./engineering/phase-2c-anima-authoring-research.md) добавляет
optional native method в production draft, family-aware prompt attention и
history/shadow/explicit Save. Model switching сохраняет неактивные настройки;
редактор не придумывает Euler и не меняет квалификацию модели. Anima Main
admission, очередь, provenance и release остаются открытыми; PP-004 не завершён.

[Anima Main preparation](./engineering/phase-2c-anima-main-preparation-research.md)
захватывает Project inputs до await, квалифицирует exact linked bundle и ordered
enabled adapters, повторно проверяет файлы и строит qualified ephemeral requests для всех
concrete prompt/seed items. Это не расширяет public Generate или durable queue;
PP-004 остаётся открытым.

[Anima durable jobs](./engineering/phase-2c-anima-durable-jobs-research.md)
теперь повторно квалифицирует captured exact checkpoint/Qwen3/VAE и ordered
effective LoRAs при frozen Retry/dispatch, без чтения текущего Default или draft.
Это проверка операционной идентичности, а не обещание совместимости каждого
CivitAI файла, trained-model quality или установленного release runtime.
Public Anima Generate и portable accepted configuration остаются открытыми;
статус PP-004 не повышен.

[Public Anima integration](./engineering/phase-2c-anima-public-generation-research.md) теперь подключает captured Generate к
exact original checkpoint/Qwen3/VAE и signed LoRA через existing runtime/queue
owners. Native capability проверяется повторно Main; unsupported SD controls и
непригодные ресурсы отклоняются явно. Каталог передаёт path-free companion
identities из текущих verified installed bindings при прежнем быстром stat/cache
статусе, без обещания cold full-file tamper detection. Полная requalification
остаётся в Generate/dispatch. Trained-model/release qualification и полный
PP-004 остаются открытыми.

[Installed runtime checkpoint](./engineering/phase-2c-installed-runtime-qualification-research.md)
подтверждает startup изолированного app-owned development runtime и production
routing CPU derivatives без source/system Python fallback вне явного
development/test режима. Проверены canonical pointer/path, offline environment,
coexistence с работающим inference и единый physical-exit fence для failed
startup и failed close. Финальный native Electron прогон завершил четыре
trained сценария Illustrious/Anima × txt2img/opaque img2img при 1024×1024 и трёх
шагах через UI Generate, installed CUDA worker, signed LoRA, явный Add и rendered
Save/reopen. Точные существующие веса скопированы и проверены как предусловие
в isolated catalog; это не проверка CivitAI download/install, совместимости
каждого файла, качества моделей или других GPU. Release installer/repair,
полные options и связи с Presets остаются открытыми; PP-004 и его публичный
статус не повышаются.

## PP-005: Принятый результат хранит настройки генерации

[Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md):
ROOT520 Main/332 Python/192 browser PASS, strict typing/scoped checks/build;
18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through
exact control RGB/Add/Undo/Save-reopen. Direct replays preserve SQL/packages,
match UI exactly and demonstrate765,621 changed RGB channels against Euler.
Separate combination capability; no default or visual/full-promise promotion.

[Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md):
ROOT 499 Main / 299 Python / 190 browser PASS, strict typing/scoped checks/build;
17 installed checks preserve .7 frozen Retry after saved .2 through exact control
RGB/Add/Undo/Save/reopen. Two direct replays preserve SQL/packages and demonstrate
569,646 changed RGB channels at zero versus .7. Default stays zero; separate
combination capability required. No visual-quality or full-promise promotion.

[Installed regional IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md)
устраняет старый renderer-отказ для opaque Canvas и проверяет фактический режим,
IMG capability и явную strength. ROOT: 100 Main/188 browser PASS, 10 oracle checks;
реальный default RuntimeManager/worker проходит Generate/Cancel/frozen Retry с
точным RGB, Add/Undo/Redo/Save/reopen и сохранением source/обычной IMG provenance.
Это конечный Euler/FP16 срез; качество, Anima, другие image modes и Install/Repair
не квалифицированы. Статус **«Пока не обещать»** и Regional exclusions сохраняются.

[Public regional IMG backend](./engineering/phase-4-regional-guidance-public-img2img-research.md)
добавляет конечный opaque Euler/FP16 path с frozen source/strength и отдельным
worker capability. ROOT:810 Main/200 Python PASS, actual installed backend
четыре admission/три native PNG receipt, canceled-before-dispatch Retry после
сохранённых правок с точным RGB, strength0 без фиктивного progress. Это не UI,
Add/result-Save, quality, runtime-manager lease или release qualification;
Regional provenance exclusions и статус **«Пока не обещать»** сохраняются.

Текущий [Smart settings Compare](./engineering/phase-4-smart-patch-compare-research.md)
подключён для активного принятого варианта и converted Smart Raster через strict
`getSmartResultComparisonData`: immutable recorded settings сравниваются с текущим
**Project Canvas**, в том числе при выбранном Patch, без Smart Size, geometry и
layer/source/execution context. Просмотр не меняет Project; ordinary Raster Compare и прежние
preset actions сохранены. Пройдены 852 neighbor tests (включая 103 focused),
182 prototype tests и 18 native checks: реальные menu/preload/Main, normal/900×620,
оба семейства × четыре recorded modes, same-pixel active switch, late success/error,
Project recompute и immutable witnesses. Full typecheck/lint/build и actual CPU
modes/races/retention зелёные; изолированная epoch mutation даёт semantic RED,
control GREEN и два restored GREEN. Production R1/R2 reviews — source-only. Публичный статус — **Пока не обещать**;
На этом Compare checkpoint Smart-target Apply, inactive direct Compare, image
comparison и inference были вне среза. Позднейший
[finite Smart-target Apply](./engineering/phase-4-smart-patch-preset-apply-research.md)
реализован отдельно; его qualification ещё идёт, без native PASS, installed
inference или release claim. Он не меняет immutable result provenance.

[Smart result preset source](./engineering/phase-4-smart-patch-result-preset-research.md)
подключает активный и точный неактивный принятый вариант, а также Raster со
Smart provenance, к существующему detached Manager и явному Create. Копируются
concrete frozen prompts и только записанные reusable settings; workflow всех
Smart origins — `smartPatch`, geometry и Seed по умолчанию исключены. Чтение
не требует runtime/catalog и не меняет Project, active variant, Undo или `.igs`.
Пройдены 790 focused/neighbor tests, 181 prototype tests и 15 native checks:
реальный failed Create/retry, 12 recipes после restart, Save/loader PNG readback
и keyboard/focus при 900×620. Portable accepted fixtures не доказывают inference
или acceptance. Smart Compare имеет отдельный checkpoint с 18 пройденными native
checks. На этом result-source checkpoint Smart-target Apply ещё оставался
отдельной работой; позднейшая finite реализация связана ссылкой выше.
Публичный статус — **Пока не обещать**.

Текущий [NoobAI Karras refusal](engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». Следующий implementation item — local thumbnails/previews installed resources. Сведения о прежних checkpoints и их «следующем gate» ниже исторические; исходный lost traceback не восстановлен.

Текущий подтверждённый [Anima image cap32/prefix](engineering/phase-2c-anima-image-batch-cap-research.md): Euler256 IMG/normal mixed-alpha OUT:76 admissions/completions/accepted layers,4 Save-reopen packages,12 собственных wholeRGBA prefix matches. Два confirmed33 refusals сохраняют32 временных результата и исходный слой без новых jobs/receipts. Independent raw readback PASS85373;4 cursor/Save snapshots7/5,11 прежних SQL tables и43 worker identities сохранены;2 OUT previews/111104 protected source pixels. Только N3/CFG4/strength0.5/Myth−0.5/exact resources; quality/Invoke parity/fullMVP/release не заявлены. Следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. Статус promise остаётся «Пока не обещать».

Предыдущий подтверждённый [Anima image MAX→0](engineering/phase-2c-anima-image-seed-wrap-research.md): Euler256 IMG/normal mixed-alpha OUT: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 own MAX/0 wholeRGBA matches и 2 same-prompt contrasts. Independent raw readback PASS (18700 checks), 6 cursor/Save snapshots, 11 old SQL tables и 43 worker identities сохранены; 3 OUT previews / 166656 protected source pixels. Actual Main modulo fault: 18 executions, 2 RED / 16 GREEN; restored и guarded-cleaned 584 files. Portable provenance сохраняет raw weighted text, actual seed и resource/source context; compiled/step/posterior проверены отдельно в frozen worker inputs. Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader inputs/quality/Invoke parity/fullMVP/release остаются открытыми.

Предыдущий подтверждённый [Installed Anima image Random → Fixed](engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.

Дополнительные evidence references: [provenance в Vue prototype](./features/project/generate-mode/generation-provenance.md#vue-prototype-coverage) и [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md). Prototype comparison/result-to-preset использует mocks; Undo evidence относится к сохранению/откату уже принятых слоёв.

Предыдущий подтверждённый [Installed Anima image per-prompt](engineering/phase-2c-anima-image-per-prompt-research.md): Euler × common-source IMG/normal mixed-alpha OUT:80 admissions/completions/accepted layers,4 Save/reopen packages и16 own same-input wholeRGBA per-prompt controls. В каждом режиме genuine numeric-control4pairs×8/Fixed0/per-iteration сравнивается с4pairs×2/Fixed0/per-prompt по seeds0…7; control slots0,1,10,11,20,21,30,31. Independent raw readback PASS23682:80 owning comparisons,4 cursor/Save snapshots7,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. Full frozen DTO сохраняется; только owner IDs и предварительно проверенный seedBehavior исключены из matching. Concrete raw weighted prompts остаются portable; templates/maxPrompts/compiled arrays — вне provenance. 98 focused tests PASS0skip;18 actual Main source executions дают2 semantic RED/16 GREEN. 64 within-pair seed contrasts, без scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; cap32-refusal/Random/Reuse/wrap/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md): Euler × common-source IMG/normal mixed-alpha OUT:20 admissions/completions/accepted layers,4 Save/reopen packages и4 own same-input wholeRGBA prefix controls. Четыре weighted positive×negative пары × две iterations; Fixed0/per-iteration seeds0/1, full authored templates и selected first-pair prefix. Полные compiled strings/spans остаются в frozen worker inputs; portable provenance содержит concrete raw weighted prompts без compiled arrays/templates/maxPrompts. Independent raw readback PASS18128:20 owning comparisons,4 cursor/Save snapshots1,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. 75 focused tests PASS0skip;18 actual Main source executions дают4 semantic RED/14 GREEN. 34 visible joint-input contrasts не доказывают scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image dynamic embedding subsets](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md): EPS/V × common-source IMG/normal mixed-alpha OUT:24 admissions/completions/accepted layers,8 Save/reopen packages и8 own same-input wholeRGBA prefix controls. Fixed0/per-iteration baseline4/prefix2 сохраняют full authored refs и effective signed native/portable subsets; ordinary wire omits embeddings. Independent raw readback PASS18641:24 owning comparisons,8 cursor/Save snapshots0,11 old tables,43 worker identities и4 OUT previews/222208 protected source pixels. 118 focused tests PASS0skip;48 actual Main source executions дают16 semantic RED/32 GREEN. 28 visible input contrasts не доказывают embedding-only causality; новых installed-worker mutations нет. Только256×256/Normal N3/exact resources; quality/fullMVP/release не заявлены. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён отдельным20/4/4 gate. Последующий [Anima Fixed/per-prompt image80/4/16 gate](engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. PP-004/005/007/008 остаются «Пока не обещать».

Предшествующий подтверждённый [Installed image cap32 and selected prefix](./engineering/phase-2c-illustrious-image-batch-cap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 152 qualified admissions/completions/accepted saved layers,8 Save/reopen packages,24 own same-input wholeRGBA prefix controls. Четыре genuine confirmed33 UI refusals сохранили все32 temporary candidates и source1 без новых jobs. Independent raw readback PASS (104613 checks):152 configurations/comparisons,8 cursor/Save snapshots, 11 old tables и43 worker identities сохранены;34 source keys/five bundles bound. Historical Main:16 semantic RED/84 GREEN in100 executions; fresh deadline DI:4 RED/371 GREEN in375 executions; обе536-source copies exact-restored and guarded-cleaned,preexecution261 focused tests PASS0skip. R2 boundary2700s/prefix1800s при прежних12+2GiB/14GiB/zero-swap/1600s completion poll. R0 timeout сохраняет32 actual accepted layers/one actual package/zero qualified stages; raw across attempts184, qualified counts exclude R0. Native seeds0…7 — только256×256/Normal N3/four pairs×8 boundary иfirst3pairs×2 prefix; MAX cross-pair wrap/Anima image/installed mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles: literal prompts и
точные signed Z/T,T/Z refs сохраняются через Add/Save/readback/reopen/comparison
при256×256/трёх steps, frozen0/current draft37, LoRA−0.5 и native external VAE/FP32.
Три успешных native oracles независимо проверили12 direct T/T,T/Z,Z/T,Z/Z
hidden/pooled/handoff assignments с branch isolation; это не generated jobs.
Oracle использует rehydrated frozen queue jobs и queue ID для correlation;
точный live dispatch проверяют отдельно настоящие UI cycles.
Installed EPS sign-swap дал causal directional RED после двух finite UI cycles
при сохранённой pixel inequality; restored43/original inode/mode/mtime/bytes,
backup absence/physical exit и fresh EPS pair2 GREEN подтверждены. Final evidence
проверяет все8 saved packages/Pillow pixels, SQLite completed rows/receipt bytes,
exact signed refs/settings и accepted frozen0 при saved current draft37. Mutant
pixels равны противоположным normal assignments, fresh — своим normal choices.
Catalog5/9 сохранён без новых managed files. Multiple-LoRA order, Anima0.14,
dynamic, arbitrary formats/quality/Invoke parity/release и полный MVP открыты;
прежние counts и «Пока не обещать» сохранены.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
проверяет independently expected tuple во всех 36 EPS/V txt/img/outpaint cases
и двух completed restored Retry. Exact checkpoint/VAE/LoRA/embedding refs,
обе polarity, prediction/noise/sampler и actual seed0 сохраняются через explicit
Add/Save, независимый package readback, reopen и read-only comparison. Disabled
LoRA сохраняет authored reference/weight при пустом effective stack; каждый
embedding control сохраняет другой sign. Lifecycle Retry использует frozen0
при реальном current draft37 после Default/component/prompt edits. Native/LDM
pixel equality относится к одним и тем же extracted weights; decoder-only
control не доказывает независимый encoder effect. Это bounded256×256/три шага;
четыре installed EPS-txt2img component mutations дали causal pixel RED после
шести finite Generate/Add/Save/readback/reopen cases каждая. Fresh restored
EPS-txt2img normal прошёл шесть finite cycles с native physical exit.
Bounded polarity follow-up описан выше; multiple-adapter order, Anima worker0.14, dynamic batches,
legacy/relink/crash expansion, качество, Invoke pixel parity и release остаются
открытыми. Статус «Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
проверил 8 EPS/V TXT/strength0.5 IMG cases с independent expected exact VAE refs
и settings через Generate/Add/Save/readback/reopen/comparison. Actual current
draft seed37 сохраняется, immutable accepted provenance хранит frozen seed0
и исходную VAE version. Artificial control меняет только восемь
`encoder.conv_out.bias` значений на заявленный +0.5; остальные tensors/config
сохранены. TXT equality и IMG inequality доказывают этот bounded encoder effect,
не all-layer/formats compatibility, outpaint encoder или Invoke pixel parity на
этом TXT/IMG checkpoint.
Installed EPS-img2img mutant дал RED после двух finite cycles и восстановлен;
fresh restored pair прошла два finite GREEN cycles с physical exit. Статус «Пока не обещать» сохранён.

Отдельный [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
подтвердил четыре finite EPS/V normal OUT cycles/четыре admissions и две matched
пары при256×256/трёх requested steps/FP32/seed0/strength0.5 с двумя effective
native denoising evaluations. Exact VAE refs, target и neighboring inputs
сохраняются; одинаковая contribution alpha сопровождается visible generated RGB
и saved merged RGB differences на соответствующих координатах через
Add/Save/readback/reopen/comparison. Current draft37 не заменяет frozen0.
Catalog5/9 не добавляет managed files; physical exit обоих native runs подтверждён.
Installed EPS-OUT encode-zero mutant дал intended visible-RGB RED после двух finite
cycles; physical exit/restored43/original inode/mode/mtime подтверждены. Fresh
restored pair прошла два finite GREEN cycles с physical exit и exact original
EPS RGBA/merged pixels. Final8 OUT cycles (4 normal +2 finite mutation cycles до
causal RED +2 fresh GREEN) связывают CPU control descriptors со всеми frozen VAE
refs и actual SQLite completed rows/receipt bytes. Independent Pillow saved
`.igs` decode проверяет alpha/protected source/corresponding visible/merged pixels;
Main/worker/nativeData idle, restored43/original inode/mode/mtime/bytes, backup отсутствует.
Исторические 8 normal +2 mutation
+2 fresh TXT/IMG counts не меняются. All-layer/formats/quality/Invoke parity и
полный MVP остаются открытыми; статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Exact component references/bytes и copied metadata сохраняются при Default, side-by-side version, repair и fresh SQLite connection; controlled healthy frozen Retry сохраняет исходные resources/prompts/target/seed после draft edits. Этот source/Prepare checkpoint проверял identity и frozen owners; последующее trained Add/Save/readback/reopen/comparison evidence описано выше. Independent component gates, Anima/new-worker regression и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
проверяет два distinct objectives: frozen prediction/noise profile/strength,
contribution alpha и portable resource identities сохраняются через explicit
Add/Save, независимый readback и reopen. Source RGB, protected preview pixels и
bbox placement проверены отдельно. Read-only comparison одновременно показывает
Changed ZTSNR/Same spacing, recorded outpaint/current img2img и frozen0.5/current
0.25 strength. Library edits не переписывают accepted settings. Legacy/relink/crash,
full component scope, качество и Invoke pixel parity этим bounded256×256/three-step
evidence не закрываются. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
подтверждает exact выбранный checkpoint, фактические prediction/noise profile,
sampler, steps, CFG и dimensions через настоящий Generate/Add/Save, независимый
readback, reopen и comparison. Library ZTSNR edit не переписывает accepted
profile; сравнение показывает Changed ZTSNR и Same spacing. Recipe README/SHA
живут в qualification fixture/report, а не становятся новым `.igs` provenance
полем. Есть два source-grounded 832×1216/28-step results; V recipe — upstream
NoobAI guidance на credited Cyberfalafel, leading — явно отмеченное предположение.
Legacy/relink/crash и полный component/outpaint scope этим срезом не расширены;
качество и Invoke pixel parity не доказаны. Статус «Пока не обещать» сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий v-prediction срез (07.10.2026): [Installed Illustrious v-prediction qualification](./engineering/phase-2c-installed-v-prediction-research.md)
подтверждает четыре finite completions через public Generate, installed worker
0.12.0 и явный Add/Save/readback/reopen/comparison. Accepted record хранит exact
checkpoint и frozen prediction type; после UI смены library type comparison
показывает `Changed`, не переписывает provenance или сохранённый `.igs`.
Matched txt2img и common-source img2img при strength 0.5 сохраняют одинаковые
inputs/target после исключения только prediction interpretation и document
identity/revision; decoded pixels различаются. В каждом img2img наблюдались
два denoising evaluations из трёх requested steps. Actual installed
forced-epsilon mutation завершила два здоровых txt2img случая и была остановлена
causal pixel assertion; восстановление всех 43 worker source files и настоящий
startup/physical exit проверены отдельно. Это bounded development evidence при
256×256/seed `0`/Euler a/Embedded FP32/LoRA −0.5, без ZTSNR/trailing full recipe,
quality, других installed samplers, v-outpaint, public network install или
release claims. Статус «Пока не обещать» сохраняется.

Текущий embedding срез (07.10.2026): [Installed Illustrious embedding qualification](./engineering/phase-2c-installed-embeddings-research.md)
подтверждает восемь finite completions через actual editor/installed worker и
явный Add/Save/readback/reopen/comparison. Exact trained IllustriousPhoto by
CautionMergeAhead и labeled artificial zero control сохраняют concrete literal
text и deduplicated refs отдельно для обеих полярностей; weighted/repeated
literal occurrences не создают лишних sidecars. После actual Cancel, UI library
Default change и удаления всех current literals frozen Retry сохраняет original
trained prompts/refs/target/seed `0`/Embedded FP32. Portable accepted records
исключают model paths и private aliases; comparison показывает recorded refs
как `Removed` против current empty refs, known empty — как `Same`. Matched
positive/negative txt2img и common-source img2img strength 0.5 меняют pixels при
смене только exact trained/control weights; два native denoising evaluations
наблюдались в каждом img2img случае. Это bounded development evidence при
256×256/трёх requested steps/LoRA −0.5, без independent CLIP L/G или attention
ablation, dynamic multi-job/preset/Anima, format/quality или release claims.
Статус «Пока не обещать» сохраняется.

Текущий внешний VAE срез (07.10.2026): [Installed external VAE qualification](./engineering/phase-2c-installed-external-vae-research.md)
подтверждает восемь finite FP32 completions через явный Add/Save/readback/reopen/
comparison. Recorded exact VAE либо известный Embedded сохраняются отдельно
от текущего draft; native Retry остаётся frozen после UI Default/Reset.
Exact LDM/native воспроизводят pixels Embedded в txt2img и common-source
img2img при strength 0; combined искусственный control меняет pixels.
Nonzero denoising, independent encoder/decoder ablation, другие installed options
и release остаются открытыми; статус «Пока не обещать» не повышается.

Текущий precision срез (07.10.2026): [Installed VAE precision qualification](./engineering/phase-2c-installed-vae-precision-research.md)
проверяет шесть Illustrious Embedded VAE случаев Auto/FP32/FP16 × txt2img/opaque
img2img на настоящем installed worker: 6 finite completions, 0 точных
non-finite refusals и один canceled original перед frozen FP32 Retry.
Matched txt2img Auto/FP32 дают одинаковые decoded pixels; opaque случаи
проверяют encode/decode wiring, а не matched numerical ablation. Accepted
precision сохраняется после явного Add/Save/reopen и отличается от текущего
FP16/FP32 draft в comparison. Другие installed model/options
cases и release lifecycle остаются открытыми; статус «Пока не обещать».

Текущий outpaint срез (07.10.2026): [public Generate/frozen Retry](./engineering/phase-2c-public-outpaint-research.md)
подключены для обеих семей при qualified worker 0.12.0 и exact local LaMa.
Installed development Electron завершил шесть trained cases при 256×256/трёх
шагах: у каждой семьи normal source, mixed-alpha Generate и frozen Retry после
actual Cancel. Explicit Add/Save/reopen и outpaint comparison сохраняют source
layers, exact contribution alpha и portable provenance без local paths.
Статус обещания остаётся «Пока не обещать»; setup/release и прочие MVP gaps
перечислены в research note. Последующие описания прежних checkpoints
сохраняют исторические границы evidence, а не отменяют этот более новый срез.

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность. Production
Electron принимает выбранные проверенные Illustrious `txt2img` и opaque `img2img` candidates через
[явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md): Main
сверяет frozen context и PNG, создаёт слои с immutable provenance, записывает
dirty recovery shadow до очистки staging, а явный Save переносит результат в
`.igs`. Принятые слои проходят Save/reopen и перенос файла.
Project-local Undo/Redo возвращают принятые Raster Layers вместе с immutable
provenance как одну document-операцию; история остаётся только в открытой сессии.
Read-only ordinary Raster Compare и текущий scoped Smart Compare подключены к production;
для Smart пройдены 18 scoped native checks. Raster и принятые Smart result sources
подключены к detached preset creation отдельными checkpoints выше.

[Typed provenance storage](./engineering/phase-2b-accepted-provenance-storage.md)
содержит точный checkpoint/prediction type, prompts, sampling, seed и bbox без
локальных путей и Regional Guidance.
[Prepared-batch checkpoint](./engineering/phase-2b-batch-planning-research.md)
добавляет selected seed behavior в новые frozen/accepted записи и проверяет
его через Add/portable Save; legacy отсутствие поля остаётся unspecified.
[Внутренний handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md)
и [GPU boundary](./engineering/phase-2b-inference-worker-research.md) проверены
отдельно. [Generate из Electron](./engineering/phase-2b-generate-actions-research.md) подключён к frozen batch admission и serial queue/staging. Release inference runtime и полный MVP
pipeline обоих семейств со всеми advanced options ещё отсутствует. Illustrious
embedding inference имеет отдельный checkpoint ниже.

[CFG Rescale checkpoint](./engineering/phase-2c-cfg-rescale-research.md)
подключает одну advanced-настройку Illustrious: production draft,
зафиксированное значение в queue/Retry, фактическое применение worker и
immutable accepted provenance со сравнением. Новые результаты сохраняют
нейтральный `0`; историческое отсутствие остаётся unknown. Локальный NVIDIA
smoke проверяет neutral equality и nonneutral pixel change отдельно от native
Electron wiring. Остальные advanced options и полный release pipeline открыты.

[Installed CFG Rescale qualification](./engineering/phase-2c-installed-cfg-rescale-research.md)
теперь проверяет actual Advanced Options → установленный trained CUDA worker →
явный Add → rendered Save/reopen/comparison. При одинаковых frozen inputs unset
и явный ноль дают одинаковые decoded RGBA pixels, 0.7 меняет их. Captured
effective zero/0.7 сохраняется в accepted record после независимой правки draft
на 0.2; сравнение показывает оба значения. Nonzero opaque img2img отдельно
подтверждает wiring/provenance, без independent img2img numerical ablation,
обещания качества или готовности остальных options/release. PP-005 остаётся
«Пока не обещать».

[Opaque img2img checkpoint](./engineering/phase-2c-img2img-research.md)
добавляет derived mode по реальному alpha, contextual denoising field и frozen
strength/source pixels через queue/Retry/worker/Add/Save/reopen/comparison.
Строгий portable record различает txt2img и img2img; старые результаты не получают
выдуманного strength. Значение 0 проходит VAE без denoising. Локальная GPU проверка
отделена от native renderer с controlled inference peer. Частичная прозрачность,
inpaint, Anima и release runtime остаются открытыми; LoRA расширены следующим
checkpoint ниже. Статус PP-005 не повышен.

[Anima prompt weighting](./features/project/generate-mode/prompt-weighting.md)
зафиксирован как обязательная часть первого Anima pipeline в фазе 2C:
совместимость с current/saved editor attention syntax, cleaned Qwen3 input,
одна полная T5 tokenization и actual weights в conditioning/denoising. Authored/
concrete weighted prompts остаются воспроизводимыми настройками. Теперь
[conditioning foundation](./engineering/phase-2c-anima-conditioning-research.md)
реализует versioned typed compiler, native offline tokenizers и веса один раз
после adapter для обеих полярностей. Cross-language/native tests, semantic
mutations и trained CPU probe проверяют эту подготовительную границу. Family-aware
editor adjustment и frozen queue/Retry/provenance остаются открытыми. Следующий
[Euler foundation](./engineering/phase-2c-anima-euler-research.md) проводит эти
веса через native denoising/Wan pixels и проверяет trained NVIDIA neutral equality,
non-neutral changes обеих полярностей, seed replay и img2img strength 0/0.5/1.
Другие schedulers/options и release не подключены; результаты helper не
публикуются в staging/provenance. Следующий
[ordinary Anima LoRA foundation](./engineering/phase-2c-anima-lora-research.md)
проверяет exact adapters до кодирования обеих полярностей, signed/zero stacks,
native tensor/scaling и восстановление graph/weights/gradient flags/RNG после
успеха и ошибки. Public queue/Retry, `.igs` provenance и wire/capability versions
не расширены. Anima Generate и публичный статус PP-005 не повышены.
[Deterministic sampling foundation](./engineering/phase-2c-anima-sampling-research.md)
добавляет internal Heun/DPM++ 2M рядом с точным Euler, fresh native history,
selected-schedule interior img2img и progress по actual evaluations. Это не
создаёт queue/Retry/accepted records. На этом checkpoint stochastic методы/LCM
и editor handoff ещё не были подключены; их последующие checkpoints описаны
ниже. Публичная проводка и release остаются открытыми; PP-005 не завершён.

[Six-method flow sampling](./engineering/phase-2c-anima-flow-sampling-research.md)
добавляет internal DPM++ 2M SDE, ER-SDE и FlowMatch LCM. Versioned TS plan
фиксирует отдельный step seed, Python использует fresh request-owned noise/history
и сохраняет weighted conditioning/signed LoRA. LCM получает once-shifted authored
grid с clipping вместо rebuilt schedule Invoke. Native/model/GPU controls
проверяют replay, strength endpoints и restoration после interruption; Base
few-step quality или Turbo support не обещаны. Public Anima admission/queue/
Retry/accepted provenance и release остаются открытыми; PP-005 не завершён.

[Anima worker entrypoint](./engineering/phase-2c-anima-worker-entrypoint-research.md)
теперь принимает compiled обе полярности и полный typed sampling plan через
actual JSONL worker 0.11.0. Captured seed domains, clipping и progress сохраняются
до provisional PNG; source/profile/hash/size и exclusive publication проверяются
в общем файловом контуре с Illustrious. Worker success ещё не создаёт durable
queue/Retry/accepted record и не расширяет `.igs`. Public Anima Generate и
статус PP-005 не повышены.

[Anima authoring](./engineering/phase-2c-anima-authoring-research.md) соединяет
нативный метод и корректное редактирование обоих prompt с mutable Project draft.
Сохранение этих полей в `.igs` не создаёт frozen accepted configuration. Main
Generate/queue/Retry/accepted Anima provenance остаются открытыми; PP-005 не завершён.

[Anima Main preparation](./engineering/phase-2c-anima-main-preparation-research.md)
фиксирует concrete обе полярности, их versioned interpretations и full native
plan на каждый seed в отдельном Main batch. Все wire envelopes проверяются до
consumer; эти contexts не являются accepted provenance или durable Retry.
На этом preparation checkpoint public Generate/queue/accepted Anima records оставались открытыми.

[Anima durable jobs](./engineering/phase-2c-anima-durable-jobs-research.md)
добавляет внутренние `anima-txt2img`/`anima-img2img` attempts, concrete weighted
prompts и полный native plan в SQLite. Retry копирует сохранённую операцию,
повторно проверяет exact checkpoint/Qwen3/VAE и ordered enabled LoRAs; dispatch
принимает только qualified worker 0.11 и фактический native progress total.
Проверенные PNG и matching receipts восстанавливаются локально, с scoped actual
seed cursor. Queue Manager показывает native method без SD sampler/prediction.
Public Project Generate и portable accepted Anima configuration пока закрыты;
Anima-only или mixed Add явно отказывается до project/journal/cancel/discard.
Это операционное хранение, а не повышение готовности PP-005.

[Исправления аудита](./engineering/product-audit-fixes.md) связывают реальный
processor → staging → Add → Save/reopen: provenance хранит проверенный actual
seed даже при отличии от planned seed; изменение staging seed без matching
completion receipt не принимается. Inference transport в этих tests подставлен.

[Project-local accepted history](./engineering/phase-2b-project-accepted-results-research.md)
показывает current generated Raster results после Add/Undo/Redo/Recover/Save/reopen:
actual seed, copied checkpoint/version/SHA, original generated size и current
signed preview. Выбор выделяет и показывает owning layer row без изменения
документа. [Saved-result SQLite index](./engineering/phase-2b-saved-accepted-index-research.md)
синхронизирует metadata generated Raster Layers из verified saved `.igs` одной
транзакцией с Home. Original output/actual seed/checkpoint сохраняются отдельно
от current asset; internal scoped query исключает unhealthy/trashed/foreign lineage.
[Global saved-result browser](./engineering/phase-2b-accepted-history-browser-research.md)
показывает сохранённые результаты из Home/Project и переходит к owning layer через
обычный Open/Recover, сохраняя dirty changes. Подписанный ресурс читает exact saved
pixels; count/page и strict IPC проверяются отдельно.
[Read-only Raster comparison](./engineering/phase-2c-raster-comparison-research.md)
открывается из меню generated слоя, включая locked слой. Portable baseline
сравнивается с текущими draft/bbox/catalog и mode по реальным composed pixels;
при недоступности CPU worker baseline остаётся доступен, mode — `Unavailable`.
Exact resource identity не заменяется именем/default version. Legacy отсутствие
LoRA/VAE/advanced options не превращается в равные defaults. Просмотр не меняет
документ, Undo, seed или `.igs`; strict IPC и async edit/Undo/close guards
проверены отдельно. На этом Raster comparison checkpoint полные provenance/pipeline,
result-to-preset и Smart Patch history/comparison оставались открытыми; последующие
source/history/Compare срезы описаны отдельно выше. Эти checkpoints не означают
готовность всего PP-005.

[Internal outpaint provenance (06.10.2026)](./engineering/phase-2c-outpaint-execution-research.md)
добавляет после явного Add strict portable `illustrious-outpaint` и
`anima-outpaint` records. Mode/denoising strength и actual completed seed
сохраняются вместе с captured source/keep-mask/policy/LaMa и contribution PNG/alpha8
identities без local paths, source recovery bytes или weights. Save/readback и
portable open проверяют actual RGBA asset и alpha; comparison показывает
generation configuration, сохраняя private context вне settings diff. Valid
actual uint32 seed deviation сохраняется без переписывания planned seed.
Public mixed-alpha Generate/Retry, first-setup installation и installed/release
qualification остаются открытыми. Research note содержит executed evidence и
counts; PP-005 остаётся «Пока не обещать».

### Обещание

Каждый принятый результат хранит зафиксированные настройки генерации и
технический контекст запуска. Пользователь может посмотреть сохранённые
настройки, сравнить их с текущими и использовать как основу нового пресета.

> Принятый результат хранит свои сохранённые настройки; текущая работа не
> переписывает прошлое.

### Пользовательская выгода

Пользователь может изучать связь между результатом и настройками генерации, не
восстанавливать их по памяти и не создавать заранее отдельный preset для каждого
удачного изображения.

### Явное не-обещание

ImageGen Studio не обещает:

- автоматически откатывать или изменять текущую работу при просмотре прошлого
  результата;
- превращать сведения о генерации в полную историю всех состояний проекта;
- сохранять Regional Guidance в происхождении результата, сравнивать его с
  текущими регионами или переносить в пресет. Поэтому запись результата не
  восстанавливает полную региональную конфигурацию, повлиявшую на изображение;
- побитово идентичный output на другом hardware/backend/runtime только на
  основании одинаковых настроек.

### Supporting contract

Точные правила acceptance, immutable provenance, сравнения, preset mapping,
Smart Patch boundaries, storage и проверяемые инварианты определены в
[PP-005 Supporting Contract: Generation Provenance](./features/project/generate-mode/generation-provenance.md).

Связанные domain contracts:

- [Presets](./features/presets.md) — создание редактируемого preset из
  переносимых настроек результата;
- [Smart Patch Layer](./features/project/generate-mode/smart-patch-layer.md) —
  ownership mask, bbox, internal resolution и compositing state;
- [Data Storage](./specs/03-data-storage.md#generation-provenance) — хранение
  provenance внутри `.igs` и границы derived indexes.

Публичный статус меняется с `пока не обещать` только после того, как supporting
contract подтверждён реализованным пользовательским flow, UI и regression
tests.

[Illustrious LoRA checkpoint](./engineering/phase-2c-lora-research.md) добавляет
exact enabled resource/size/hash/weight в frozen queue/Retry и оба normal modes.
Accepted provenance сохраняет полный configured stack, включая disabled missing
refs; `.igs` Save/reopen и comparison отличают legacy absence от нового empty
stack. Локальная GPU проверка и Electron с controlled peer — отдельные границы.
Anima, другие adapter algorithms, remaining options и release runtime остаются
открытыми; публичный статус PP-005 не повышен.

[VAE precision checkpoint](./engineering/phase-2c-vae-precision-research.md)
добавляет Auto/FP16/FP32 встроенного Illustrious VAE в оба normal modes. Новые
jobs фиксируют policy, accepted metadata сохраняет её после Add/Save/reopen,
а comparison оставляет legacy отсутствие Unknown. Worker применяет precision
к encode и decode; non-finite VAE завершается ошибкой до публикации PNG.
Полный pipeline и публичная готовность PP-005 остаются открытыми.

[External VAE inference](./engineering/phase-2c-external-vae-inference-research.md)
фиксирует exact внешний VAE или explicit Embedded в обоих normal modes. Accepted
metadata переносит только portable identity; поздняя смена Project/Default и Retry
не меняют запись. Add/Save/reopen/comparison различают missing resources и legacy
omission; отсутствие старого поля не превращается в Embedded. Полный pipeline
и result-to-preset остаются открытыми.

[Embedding provenance](./engineering/phase-2c-embedding-inference-research.md)
сохраняет concrete literal text и effective positive/negative refs в existing
accepted v1 fields через Add, Undo/recovery и Save/reopen. Inactive choices,
raw dynamic templates, local paths и private aliases исключены. Comparison
проверяет portable identity/missing state; historical empty refs не дополняются.
Result-to-preset, Anima и полный MVP pipeline остаются открытыми; PP-005 не завершён.

[Accepted Anima records](./engineering/phase-2c-anima-public-generation-research.md) расширяют strict portable v1 отдельными
`anima-txt2img` / `anima-img2img` kinds: raw weighted signs, exact original
bundle identities/sizes, native method, actual seed, applied strength, complete
configured LoRAs и optional explicit neutral policies. Paths, compiled arrays,
SD sampling и Regional Guidance отсутствуют; legacy Illustrious shapes точны.
Add/Undo/recovery/Save/reopen и portable copy сохраняют immutable baseline;
семейный read-only comparison явно различает missing/unsupported current
settings и Same. Preset-from-result, Smart Patch и release proof остаются
открытыми; публичный статус PP-005 не повышается.

[Installed CPU ownership](./engineering/phase-2c-installed-runtime-qualification-research.md)
подключает target/comparison reads к установленному derivatives runtime через
Main owner; unavailable worker или неподтверждённый выход не заменяются
текущими defaults. Финальные четыре trained UI сценария в изолированном
installed development runtime подтверждают exact frozen inputs, actual seed
`0` и его Reuse, signed LoRA, raw weighted Anima prompts обеих полярностей и
коррелированные native Euler plans/progress. Явный Add и rendered Save/reopen
сохраняют точные output bytes и accepted configuration; existing layers не
подменяются. Native plans остаются техническим evidence, без их добавления в
portable provenance. Семейные правила comparison и исключение Regional Guidance
сохранены. Result-to-preset, все advanced options, качество моделей и release
proof остаются открытыми; PP-005 остаётся неполным.

[Public selected-VAE opaque IMG](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md) extends the existing prepared owner through actual Generate/Cancel/frozen Retry and explicit Add/Save-reopen. ROOT582 Main/223 Python/196 browser PASS,19 installed checks, exact A/FP32 replay and controlled B pixel influence retain ordinary VAE provenance and existing Regional Guidance exclusions. Current Embedded/FP16 authoring cannot replace frozen A/FP32. This finite evidence does not promote PP-005 or visual/release readiness.

## PP-006: Настройки генерации можно сохранять и переиспользовать

[Smart-target preset Apply](./engineering/phase-4-smart-patch-preset-apply-research.md)
реализован в finite границе выбранного Patch generation draft. Dedicated
`getSmartPatchPresetApplicationReview` / `applySmartPatchPreset` копируют только
выбранные reusable settings из detached preview, с проверкой по текущему Patch
model family и exact selected resources, без ML runtime. Ephemeral review token
связывает exact coordinator, document epoch, revision и layer от fixed preview
до staged commit; review/token никогда не сохраняется в `.igs`, preset или
provenance. Changed Apply даёт один Undo, no-op не добавляет history; implicit
Save, draft flush и prompt-history seal отсутствуют. Pending Project/sibling-Patch
draft synchronization блокирует открытие/submit; hidden target допустим,
locked target отклоняется с объяснением unlock.

Все preset workflows допустимы: badge advisory, не меняет generation mode и не
добавляет отсутствующие секции. Smart Size исключён из preview и Select all;
selected Size отклоняется, size-only source не имеет доступных секций. Preset
Size никогда не меняет Patch bbox/internal resolution. Seed по умолчанию не
выбран; explicit selection копирует policy/value без resolution или движения
cursor. Source preset, Project draft/primary bbox, other Patch drafts,
mask/coherence/compositing, variants/active member, accepted pixels/provenance,
queue/frozen jobs, seed cursor и library policies неизменны. Derived freshness
может отражать authored changes. Ordinary Apply, result-preset и Compare сохранены.

Пройдены **363 focused/neighbor tests** (включая 33 shared/renderer/control и
18 real Main), **12 native checks**, typecheck, lint и свежая сборка. Native R4
проверяет обе семьи, one Undo/Redo, actual Save/loader/reopen и layout/keyboard
при 900×620; завершён штатно с подтверждённым physical exit и final SQLite.
Изолированная mutation staged-review guard даёт semantic RED, соседний control
GREEN и byte-exact restored GREEN. Ранние неудачные попытки сохранены.
Portable fixtures не квалифицируют installed Smart Apply→inference или release.
Публичный статус PP-006 — **Пока не обещать**.

[Smart settings Compare](./engineering/phase-4-smart-patch-compare-research.md)
реализован отдельно от preset extraction: active accepted variant и converted
Smart Raster сравниваются с текущим Project Canvas без Smart Size/context/geometry
и mutation. Пройдены 852 neighbor tests, 182 prototype tests и 18 native checks.
Прежние preset actions сохранены. На этом Compare checkpoint Smart-target Apply
ещё оставался pending; позднейшая finite реализация связана ссылкой выше;
публичный статус PP-006 — **Пока не обещать**.

[Smart result preset source](./engineering/phase-4-smart-patch-result-preset-research.md)
подключает активный и точный неактивный принятый вариант, а также Raster со
Smart provenance, к существующему detached Manager и явному Create. Копируются
concrete frozen prompts и только записанные reusable settings; workflow всех
Smart origins — `smartPatch`, geometry и Seed по умолчанию исключены. Чтение
не требует runtime/catalog и не меняет Project, active variant, Undo или `.igs`.
Пройдены 790 focused/neighbor tests, 181 prototype tests и 15 native checks:
реальный failed Create/retry, 12 recipes после restart, Save/loader PNG readback
и keyboard/focus при 900×620. Portable accepted fixtures не доказывают inference
или acceptance. Smart Compare имеет отдельный checkpoint с 18 пройденными native
checks. На этом result-source checkpoint Smart-target Apply ещё оставался
отдельной работой; позднейшая finite реализация связана ссылкой выше.
Публичный статус — **Пока не обещать**.

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность — prototype flow
ещё имеет diagnostic gaps; production storage/API и ручной manager/editor
подключены; [Project Apply](./engineering/phase-3-preset-apply-research.md) добавляет
detached preview, selected-only validation и одну Main history mutation.
[Save Current](./engineering/phase-3-preset-save-current-research.md) подключает
project-derived create draft в том же Manager.
[New Project customization](./engineering/phase-3-new-project-preset-research.md)
подключает detached TXT copy к общему редактору и first-write initialization.
[Accepted Raster result projection](./engineering/phase-3-result-preset-research.md)
подключает frozen portable configuration к detached create. Принятые Smart
источники и finite Smart-target Apply подключены отдельными checkpoints выше.
Smart-target Apply имеет свою finite qualification. Новый
[Smart draft Save Current](./engineering/phase-4-smart-patch-current-preset-research.md)
синхронно копирует exact acknowledged выбранный Patch в detached Manager до
catalog reads: authored templates, точные refs, Smart workflow для любого Smart
origin и initial omission Size/Seed/batch/geometry/source/execution context, без
Project mutation или flush/seal. Hidden/locked read sources допустимы без ML или
доступного catalog; pending draft любого owner в Project блокирует capture.
Explicit Create владеет storage. Actual failed INSERT сохраняет source/draft для
retry; позднейшие authoring/catalog changes не меняют frozen source. Accepted
PNG/provenance, Project, seed/library policy и package bytes остаются точными.
Root execution: **222 neighbor tests, 0 fail / 0 skip**, typecheck r3,
full lint r2 и fresh build PASS. Изолированная wrong-owner mutation:
GREEN (2) → semantic RED/control GREEN → restored GREEN (2); все 1,313 archived
source members восстановлены byte-exact. Focused owner regression: RED до fix →
GREEN после fix с неизменным causal assertion; same-owner unpublished invalid raw
input сохраняется. Actual `native-r2`: **12 automated checks PASS**, code 0,
две healthy Electron lifetimes, две persisted recipes после restart; keyboard,
focus/layout при 1440×900 и реальном минимуме 900×620. Production review R2 и
final native-source R4 review двух `useInnerText` assertions — clean; scoped
final-harness ESLint PASS. Root открыл шесть финальных native-r2 screenshots
(normal, minimum-width source, scrolled, restored, SQLite failure и restart):
material UI defect в scope не найден; `root-visual-review.json` сохранён.
Оба retention audit clean; root завершил scoped cleanup временных данных:
освобождено 96.59 MiB, compact byte evidence и external dependencies сохранены.
Точные paths и lifecycle записаны в research.
Это authoring qualification, не inference, release или полный PP-006;
публичный статус остаётся **Пока не обещать**. Other-context Models handoff остаётся
отдельной работой.
[Installed Project presets EPS/V](./engineering/phase-3-installed-presets-research.md)
проверяет finite full/partial Apply → inference → accepted Save/reopen/Compare →
result preset: 8 actual completions, 4 wholeRGBA manual controls, 4 persisted
results; current exact-file policy сохраняется несмотря на conflicting preset
hints. Independent raw readback: 646 checks, production source mutations
восстановлены. Только Euler/Normal256/N3/CFG4/Fixed0/Digital Art−0.5/native VAE FP32;
Anima Apply, другие recipes и полный PP-006 этим не доказаны.
[Project Apply handoff](./engineering/phase-3-preset-model-handoff-research.md)
подключает selected-resource navigation и сохраняет detached editor при возврате.

[Production storage/API checkpoint](./engineering/phase-3-preset-storage-research.md)
подтверждает строгие definitions, SQLite CRUD/duplicate, soft-delete/restore,
30-day expiry и native restart/startup purge.
[Production Manager checkpoint](./engineering/phase-3-preset-manager-research.md)
подключает ручной create/edit/duplicate, Included sections, Deleted/Restore и
защиту несохранённых правок к существующему native API. Проверенные границы и
результаты execution фиксируются в checkpoint. [Project Apply checkpoint](./engineering/phase-3-preset-apply-research.md)
проверяет selected-only command, реальную history/persistence boundary и
неизменность исходного пресета. [Save Current checkpoint](./engineering/phase-3-preset-save-current-research.md)
подключает detached source snapshot, неизменный source banner, исключение Seed
и batch settings, явный Workflow при неизвестном режиме непустого Canvas и
исправление либо исключение незаполненных секций до Create. Authored prompts и
sidecars сохраняются; Project/history/seed cursor и библиотечная policy не
меняются. Capture принимает только acknowledged current tab: любой pending
generation-draft overlay блокирует кнопку с объяснением и App command guard,
чтобы текст embedding не опередил exact sidecar от Main. Save Current не вызывает
flush или seal; source фиксируется до async открытия Manager. Invalid raw в
исключённых Seed/batch полях после synchronization не блокирует копирование.
Фактические результаты qualification и ограничения описываются в
checkpoint; наличие реализации не доказывает оставшиеся flows. Публичный статус
не повышен.

[New Project checkpoint](./engineering/phase-3-new-project-preset-research.md)
подключает выбор active Text to Image preset, copied source, Use/reset mask и
selected-only validation. Seed исключён по умолчанию; No preset возвращает
1024 × 1024 и удаляет transient payload. Missing selected refs предупреждают,
но Create остаётся доступным для последующего repair. Top-level dimensions
каноничны; конфликтующий payload Size отклоняется до публикации. Main
инициализирует generation draft до первой записи `.igs`, без Apply undo step
или live link; model policy остаётся библиотечной. Qualification: 221 focused
tests и девять built Electron scenarios passed, включая first-package settings,
index refusal/rediscovery и restart. Typecheck, lint, build и visual checks на
двух размерах окна пройдены; границы записаны в checkpoint. PP-006 остаётся неполным.

[Result-to-preset checkpoint](./engineering/phase-3-result-preset-research.md)
подключает отдельный worker-independent read и принятую Raster Layer к тому же
Manager. Workflow и concrete expanded prompts берутся из saved provenance;
текущие Project draft/bbox и seed cursor не являются источником. Только записанные
optional settings копируются, отсутствующие объясняются, Anima bundle не становится
preset VAE. Seed и batch/private context исключены; edited Create сохраняет
отдельную SQLite definition. Cancel, stale source replies и storage retry не
меняют исходный Project или library policy. Qualification и ограничения записаны
в checkpoint. На этом Raster result-source checkpoint Smart Patch и Models
handoff оставались открыты; позднейший finite Smart-target Apply связан ссылкой
выше, статус не повышен.

[Project Apply Models checkpoint](./engineering/phase-3-preset-model-handoff-research.md)
подключает resource-bearing diagnostics из edited/selected copy к точной
категории и версии Model Manager. Expected file identity не заменяется Default
или совпадением local IDs с другим SHA. Logical Apply session остаётся mounted,
а presentation освобождает focus trap; возврат ждёт dismissal и guarded catalog
settlement. Edits, raw fields, selection/expansion и source preset сохраняются.
Failure остаётся явным; поздний response не возобновляет отменённый source.
Repair подтверждается новым exact catalog match, replacement остаётся явным.
Проверки, baseline RED→GREEN и review pilot описаны в checkpoint; другие контексты,
Smart Patch и installed Apply→inference сохраняют своих owners. Позднейший finite
Smart-target Apply связан ссылкой выше и не квалифицирует installed inference.

### Обещание

Пользователь может сохранить удачную комбинацию настроек генерации и
переиспользовать её в другой работе. До применения пресета ImageGen Studio
показывает, что изменится, и честно предупреждает, если выбранным для применения
настройкам нужна недоступная модель или другой ресурс.

> Настройки можно сохранить и применить снова; проблемы с необходимыми
> ресурсами видны до применения.

### Пользовательская выгода

Пользователю не нужно вручную собирать удачный набор настроек заново или
рисковать текущей работой ради проверки старого пресета. Он заранее видит
применяемые секции и проблемы с ресурсами, а затем сам решает, что использовать.

### Явное не-обещание

ImageGen Studio не обещает:

- незаметно заменять отсутствующую модель или другой ресурс похожим;
- применять неизвестные или проблемные настройки без предупреждения;
- сохранять в пресете состояние слоя, маску или полную историю проекта;
- гарантировать одинаковое изображение только потому, что использован тот же
  preset;
- поддерживать live-связь, при которой последующее редактирование preset
  автоматически изменяет уже созданные проекты.

### Supporting contract

Create/edit/apply flows, partial application, detached drafts, missing-resource
validation, Smart Patch boundaries, storage и проверяемые инварианты определены
в [PP-006 Supporting Contract: Presets](./features/presets.md).

[Anima authoring](./engineering/phase-2c-anima-authoring-research.md) синхронизирует
shared prototype preset editor: explicit family, native-only sampling, перенос
только заданных членов секции и сохранение source/невыбранных настроек. Это mock
редактирование и Apply в памяти, без production SQLite preset lifecycle. PP-006
остаётся неполным.

Публичный статус меняется с `пока не обещать` только после устранения prototype
gaps, перечисленных в supporting contract, и подтверждения production flow
тестами.

## PP-007: Проект принадлежит пользователю

[Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md):
ROOT520 Main/332 Python/192 browser PASS, strict typing/scoped checks/build;
18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through
exact control RGB/Add/Undo/Save-reopen. Direct replays preserve SQL/packages,
match UI exactly and demonstrate765,621 changed RGB channels against Euler.
Separate combination capability; no default or visual/full-promise promotion.

[Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md):
ROOT 499 Main / 299 Python / 190 browser PASS, strict typing/scoped checks/build;
17 installed checks preserve .7 frozen Retry after saved .2 through exact control
RGB/Add/Undo/Save/reopen. Two direct replays preserve SQL/packages and demonstrate
569,646 changed RGB channels at zero versus .7. Default stays zero; separate
combination capability required. No visual-quality or full-promise promotion.

[Installed regional IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md)
устраняет старый renderer-отказ для opaque Canvas и проверяет фактический режим,
IMG capability и явную strength. ROOT: 100 Main/188 browser PASS, 10 oracle checks;
реальный default RuntimeManager/worker проходит Generate/Cancel/frozen Retry с
точным RGB, Add/Undo/Redo/Save/reopen и сохранением source/обычной IMG provenance.
Это конечный Euler/FP16 срез; качество, Anima, другие image modes и Install/Repair
не квалифицированы. Статус **«Пока не обещать»** и Regional exclusions сохраняются.

[Public regional IMG backend](./engineering/phase-4-regional-guidance-public-img2img-research.md)
добавляет конечный opaque Euler/FP16 path с frozen source/strength и отдельным
worker capability. ROOT:810 Main/200 Python PASS, actual installed backend
четыре admission/три native PNG receipt, canceled-before-dispatch Retry после
сохранённых правок с точным RGB, strength0 без фиктивного progress. Это не UI,
Add/result-Save, quality, runtime-manager lease или release qualification;
Regional provenance exclusions и статус **«Пока не обещать»** сохраняются.

[Character visual check](./engineering/phase-4-regional-guidance-character-visual-research.md)
сохраняет отрицательный результат: семь qualified backend requests, точный RGB
repeat; AI assessment: 1 PASS / 4 FAIL / 1 INCONCLUSIVE на шести originals. Оба ordinary controls
содержат одну фигуру вместо двух, поэтому общий visual gate не пройден. Два
более ранних native-запроса исключены из-за harness path assertion и сохранены
отдельно. Human acceptance pending; production и публичный статус не повышены.
**«Пока не обещать»** сохраняется. Следующие checkpoint-записи исторические.

[Worker-only failure](./engineering/phase-4-regional-guidance-worker-fault-research.md)
подтверждён отдельно:126 lower PASS и14 installed checks. После настоящего шага
завершён только проверенный inference worker; Main остаётся жив, progress очищен,
попытка failed без кандидата. Явный frozen Retry сохраняет исходные параметры и
контрольный PNG; Results/Add/Undo/Save/reopen и прежние данные сохранены. Production
ремонт не потребовался. Качество, Anima и release не повышаются;
**«Пока не обещать»** остаётся. Следующие записи исторические.

[Regional numeric progress](./engineering/phase-4-regional-guidance-progress-research.md)
подтверждён отдельно:477 distinct lower PASS и14 installed checks. Настоящие
5/30 и6/30 видны в Project/Queue; Cancel очищает telemetry до выхода worker-а,
а frozen Retry после сохранённых правок заново проходит1..30 с исходным seed.
PNG совпадает с прежним контролем; Results/Add/Undo/Save/reopen и старые данные
сохранены. Счётчик не меняет durable state, а N/N не означает публикацию.
Качество, Anima, capacity и release Install/Repair не повышаются;
**«Пока не обещать»** остаётся. Следующие checkpoint-записи исторические.

[Linux Main-only ownership](./engineering/phase-4-regional-guidance-main-death-research.md)
подтверждён отдельно:13 checks в трёх реальных Electron lifetimes,407 distinct
lower PASS и три восстановленные mutation sequences. После SIGKILL только Main
Python завершился без тестовой помощи; следующий guarded worker удалил только
подтверждённый transport до Ready. Frozen Retry, Recover, Results,
Raster Add/Undo/Redo и Save/reopen сохраняют прежнюю историю, включая старый
непринятый кандидат. Linux creating-parent-thread/direct-child scope; unmarked
legacy scratch сохраняется. Качество, Anima, capacity и release delivery не
повышаются; **«Пока не обещать»** остаётся. Следующие checkpoint-записи исторические.

[Installed regional recovery](./engineering/phase-4-regional-guidance-installed-recovery-research.md)
подтверждает finite восстановление после двух прерываний owned-scope приложения:
APP_RESTART без автопродолжения, явный frozen Retry после сохранённых правок,
возврат готового кандидата через Recover и явный Add/Undo/Save/reopen.
ROOT: 13 native-r2 checks, 211 lower PASS, typecheck и mutation/control/restoration.
Прежние задания и сохранённые проекты неизменны. Main-only/worker-only orphan
handling, качество и release lifecycle не квалифицированы; **«Пока не обещать»**
сохранено. Следующие записи остаются историческими со своими границами.

[Installed regional continuation](./engineering/phase-4-regional-guidance-installed-research.md)
теперь отдельно подтверждает finite renderer→IPC/default RuntimeManager путь:
30 шагов/1024², Cancel и frozen Retry после сохранённых правок, Results,
явный Raster Add, Undo/Redo и Save/reopen с точными PNG/ZIP bytes. ROOT: восемь
native-r6 checks и 1,019 Main PASS; developer provisioner не является release
Install/Repair. Numeric regional progress, качество, Anima и capacity не
квалифицированы; статус обещания **«Пока не обещать»** сохранён. Следующие
checkpoint-записи остаются историческими со своими границами.

Новый [public regional owner](./engineering/phase-4-regional-guidance-public-invoke-research.md)
использует distinct `illustrious-regional-txt2img`/migration0021, исходные frozen
SHA/receipts и прежние capture, Retry, staging, journal/shadow и явный Save.
Private `illustrious-regional` rows остаются изолированными. Controlled Main
tests проходят mixed ordinary/regional Raster Add, Undo/Redo и настоящий
Save/reopen; accepted settings исключают все regional inputs и не являются
полным рецептом. ROOT: 1,013 distinct affected Main cases, 813 Python PASS,
typecheck/basedpyright PASS и один actual public trained request через
Results, Raster Add, Undo/Redo и explicit Save/reopen; runtime lease adapter и
mocked renderer не являются installed RuntimeManager / renderer→IPC qualification.
PP-007 остаётся
**«Пока не обещать»**; исторические checkpoints ниже не переписываются.

Текущий [Regional Guidance reference-image owner](./engineering/phase-4-regional-guidance-references-research.md)
имеет **source implemented; finite native-r10 PASS; retention/release complete** на preserved 1,331-member
baseline. Settled contract требует optional nonempty ordered `referenceImages`:
one PNG/JPEG/WebP per Add, cancel без записи/history, remove-last omits field,
fresh global owned IDs, canonical PNG + full-frame 128-side WebP + optional
original ICC. Independent Duplicate, Undo, explicit Save/reopen и dirty recovery
должны сохранять owned bytes вне composition; runtime signed `thumbnailUrl`
не хранится. Core storage source implemented; final lower checks и finite
native-r10 Save/reopen/recovery PASS с указанными ниже limits; release complete.

Root confirms **source implemented; lower-level checks and finite native-r10
qualification PASS**. Final lower checks are **Python 118 PASS**, post-lint
**typecheck-r3 PASS**, **full lint-r2 PASS**, **neighbors-r2: 952 PASS / 57 files /
0 skips**, and **fresh build-r1 PASS**. Later changes were harness-only, each with
syntax/format/scoped ESLint PASS. Earlier typecheck-r2 and neighbors-r1
950/57 preceded the final checks; neighbors-r1 predates the Save fix. The earlier
lint-r1's 196 autofixable ordering/braces errors in 16 changed files are historical,
not the final lint outcome.

The duplicate mutation records **2 GREEN → 1 semantic RED + 1 control GREEN →
2 restored GREEN**; all **1,343 mutation-source members** are restored.
Production **R2 source review is CLEAN** after the P2 Save A/B rebase fix and
external-replacement neighbor. Rebase requires full-document equality to exact
`baseDocument` or exact authorized `saveTarget`. The causal
`SAVED_PROJECT_CHANGED` assertion was unchanged when the explicit
Recover-new-revision test oracle was corrected; `save-rebase-green-r2` passed
both cases.

Final **native-r10: 12/12 PASS in 191.188 s**, script `1f5ac7ce`, with its
**R11 source review CLEAN**. The successful run uses the source-r2 archive
(1,343 members), exact script overlay and build-r1 (33 members). It observes
**882 Main calls, originals exactly once**, and **149 actual CPU children**
across two Electron lifetimes: intentional dirty SIGKILL, then healthy code 0.
Exact Main/dialog/spawn/kill/write restoration completes with zero in-flight
calls and zero page errors; root freshly confirms recorded PID/start identities
absent. Contract R1 is CLEAN source-only; final source/build/version mapping is retained.

Root actually opened **all 10 final screenshots** under `ui-audit`: 1440×900
and 900×620, reference cards, keyboard tooltips and recovered image states.
This bounded self-review found no material new reference-layout defect; it is
not independent review, full WCAG or all-compositor qualification.

Native attempts **1–9 remain FAILED**. Harness source-oracle findings R7/R8
were closed by subsequent code/reviews and successful replay; those failures
do not establish another product bug beyond the corrected Save rebase.

The OS picker result was controlled; the worker was the **actual development
CPU worker**, with no ML/catalog injection. Installed-resource transitions,
packaged-worker behavior, inference and frozen active work are not
native-qualified. Transient target/Smart-preparation outputs have metadata-only
witnesses, without raw replay. Prototype SVG/data URLs remain separate mock
behavior and do not extend this evidence boundary.

Retention **R1–R7 are CLEAN, candidate-only, READ-FINISHED**; contract **R1 is
CLEAN, source-only**. Root freshly verified source/build bytes, physical exits,
exact restoration, dependencies and all-reader completion, then released all
22 exact disposable paths: 2 unit and 20 native payloads. Measured artifact-root
allocation reduction is **216,420,352 bytes** (unit 35,950,592; native 180,469,760).
Compact evidence and external runtime/package dependencies remain protected.
Final source/build/version mapping is retained in the linked checkpoint.
PP-001/007/008 remain
**Пока не обещать**; finite qualification does not promote public readiness.

Current Canvas Illustrious gate, Anima/unknown reason, existing-ref repair в
любом семействе, disabled-editable/lock refusal входят в settled authoring scope.
Prototype SVG/multiple data URLs не являются storage proof. Conditioning,
inference, adapters/weights, queue/provenance/model-policy expansion исключены;
публичный статус **Пока не обещать** прежний. Предыдущие checkpoint records ниже
сохраняют исторические scope/evidence.

Текущий [Regional Guidance owned-mask checkpoint](./engineering/phase-4-regional-guidance-masks-research.md)
имеет **source implemented; lower-level checks и finite native-r7 qualification PASS**;
local visuals просмотрены root; retention/release завершены. CPU tools/Transform
Region/Clear, отдельная immutable PNG ownership и Save/shadow/recovery/resources
интегрированы; regional bbox/Fit отсутствуют. Disabled regions редактируются, lock
запрещает запись, selected overlay использует `overlayOpacity`. Captured command
сохраняет revision/epoch guards и защищённое состояние соседей.

Root: **869 Node / 50 files, 0 failures/skips** до lint-only production delta
(focused 89 входят в 869); post-lint typecheck r3/focused r3 **89**, full lint r2
(4 partitions), fresh app build r1 и prototype r2 **182 PASS**; production R2
**CLEAN, source-only**. Final **native-r7: 12 checks PASS, 157.061 s**,
`fullTwelveCheckQualification: true`: Save/read/reopen, dirty-PNG crash/recovery,
all tools/whole-alpha/geometry/history/refusals/namespaces/duplicate controls.
Both lifetimes: 95 handlers restored, in-flight/page errors 0; original IPC exactly
once. Root просмотрел все 6 final screenshots при 1440×900/900×620, включая
quarter-turn/recovered states, без material local finding; bounded self-review,
не full accessibility audit. Source R4/R5 CLEAN, source-only.

Ранние failures остаются failures: specific native5 hash cause не подтверждена;
native6 menu-selector mismatch не является feature RED, native3 restoration gap
сохраняется. Retention audits R1–R4 CLEAN/READ-FINISHED с указанной границей
R2; contract R2 CLEAN source-only. Final harness-scoped lint PASS. Root проверил
exit/restoration/readers и удалил только 15 exact idle paths: освобождено
113,537,024 bytes (108.28 MiB); compact evidence/external dependencies сохранены. Exact script/process/mutation boundaries — в linked research.
Enabled-region NEW Generate refusal сохраняется; conditioning/reference images/
inference вне owner. Статус **Пока не обещать** сохранён.

Завершённый [Regional Guidance prompt authoring](./engineering/phase-4-regional-guidance-prompts-research.md)
реализует durable optional positive/negative blocks и явное global-negative
inheritance. Общий compact PlainPromptEditor использует Current Canvas context,
включая selected Smart, и Main-owned exact embedding verification. Add сохраняет
пустой block, Clear оставляет его, последний Remove удаляет wrapper; inheritance
сохраняет dormant local text/refs, Remove Negative очищает их. Dedicated prompt
API и один document stream группируют live writes/ordered seals с revision/epoch
и lock guards; unpublished input доступен для correction/retry/pending-only
discard, без rebasing после external revision/observed Undo ABA. Metadata APIs и ordinary generation-draft target/change validation
сохранены. Shared seal endpoint дополнительно принимает strict regional
namespaced group IDs; ordinary draft group validation не расширена. Enabled NEW ordinary/Smart refusal, frozen Retry
и опубликованные jobs независимы. Geometry, provenance, presets, operational cursor,
queue/model policy, regional mask pixels/reference images и conditioning не входят в этот owner;
Regional Guidance исключён из accepted provenance и для будущих conditioned results.
**Finite authoring checkpoint и retention/release завершены root.**
795 affected/neighbor Node tests в 41 files, 0 failures/skips, предшествуют
последнему одиночному row ARIA attribute. Финальный row 20c2fb6e: typecheck r7,
later row/script scoped lint и fresh app build r4 PASS; full lint r2 (4 partitions)
и prototype r1 182 shared-consumer browser checks PASS, prototype source не менялся.
Complete production R4, narrow ARIA R5 и final native-source R7 CLEAN — source-only.
Root native-r8/script ff502357: **12/12 PASS, 97.714 s**, healthy final code 0,
две Electron lifetimes с dirty SIGKILL/recovery и healthy close; both observer
restorations true/inFlight0. Actual Save/loader/reopen, dirty recovery и полные
SQL/document/PNG/mask/variant/provenance/neighbor/cursor/policy controls PASS.
Root открыл/просмотрел все 7 screenshots при 1440×900/900×620: material layout
findings нет в scope; bounded self-review, не independent full accessibility audit.
Исторические failed attempts остаются failures в linked root research.
Retention audits 1–4 CLEAN/READ-FINISHED; contract R2 CLEAN source-only. Root
проверил exit/restoration/readers и удалил 18 exact idle paths: освобождено
116,359,168 allocated bytes (110.97 MiB); compact evidence/external dependencies
сохранены. Masks/reference images, conditioning, inference,
installed embedding/autocomplete, active-work/Main-ABA qualification и full promise
не заявлены. Root владеет final retention/release evidence; prototype остаётся
plain textareas/mock masks/references. Статус **Пока не обещать** сохранён.

Завершённый checkpoint [Regional Guidance foundation](./engineering/phase-4-regional-guidance-foundation-research.md)
добавил отдельные пустые durable entities: add/select/rename/enable/lock/overlay
opacity/duplicate/delete, ordinary Undo, explicit Save и local recovery. Optional
поле не материализуется в legacy Project; owned UUIDs и соседи сохраняются.
Каждый enabled region блокирует NEW ordinary/Smart Generate до подготовки и
публикации с явной причиной; disabled regions инертны, уже frozen jobs и Retry
независимы. Root подтверждает **711 Node tests / 33 test files, 0 failures/skips**:
54 focused, 3 actual-preload и 11 generation-guard cases входят в 711.
**182 full prototype browser tests**, typecheck r7, full lint r4 и fresh build r3
PASS; prototype code этот owner не менял. Isolated pre-SQL mutation:
2 GREEN → semantic RED (8 queue rows вместо 4), disabled control GREEN →
2 restored GREEN; все 1,320 source members и shared Queue subject восстановлены.
Final native-r5: **12 checks PASS**, 266.205 s, code 0 после intentional
dirty-shadow crash, recovery и healthy close; actual 1440×900/900×620,
legacy no-op Save/loader/reopen, lifecycle, meaningful Save и exact-neighbor
recovery, post-close protected SQL/package/assets/source bytes проверены root.
Rename focus получил causal RED → same-harness GREEN; финальные source reviews
clean, root просмотрел normal/minimum/recovered и focused-error screenshots.
Native не квалифицирует ML/inference или active-work execution; successful
frozen Retry подтверждён controlled unit tests. Historical failures сохранены.
Retention R1–R4 clean/read-finished; root независимо проверяет exit/restoration/
readers и удаляет только 15 временных каталогов: 104.66 MiB allocated space
освобождено, compact evidence и внешние зависимости сохранены. Prompts/inheritance/references/nonempty masks,
painting/transforms/conditioning и full release остаются вне этого среза;
публичный статус **Пока не обещать** сохранён.

Текущий [accepted Smart variant history срез](./engineering/phase-4-smart-patch-history-research.md)
включает каждый принятый nested variant в Project history и, после явного Save,
Saved generations. UUID принадлежит самому варианту; текущий parent определяется
по containment, а не по историческому target в provenance. Навигация открывает
точную сохранённую строку с меткой **From history**, включая inactive и hidden/locked,
без активации, изменения settings/Undo/dirty state или Save. Pending drafts блокируют
переход; missing/changed current owner сохраняет несохранённую работу. Точные
ресурсы проверяют revision/hash/ownership, а global preview — сохранённый package.
Native R8 проходит 16 проверок на portable accepted fixtures при 1440×900 и 900×620,
включая Save/reopen, dirty-current refusals и переходы между проектами без mutation IPC.
Это не квалификация inference. Smart Compare/Preset остаются вне среза; статус
**Пока не обещать** сохранён. Проверки и границы evidence указаны в research.

Текущий [явный orphan Raster Add](./engineering/phase-4-smart-patch-orphan-raster-research.md)
принимает выбранный готовый contribution в новый Raster при отсутствии исходного
Smart Patch в том же документе. Точные PNG/alpha, frozen bbox и полное Smart
provenance сохраняются без текущей маски, runtime или retargeting. Общий Raster
journal/recovery владеет отменой reviewed target-local заданий, включая новые
Retry-сессии, одним Undo и последующим явным Save. Соседние результаты независимы.
Converted Raster входит в Project/saved history, включая 1px и некратные восьми
world sizes; на этом orphan checkpoint Smart Compare/Preset были явно недоступны.
Последующие preset/Compare срезы описаны отдельно; native Compare qualification в процессе. Native R7 проходит
15 проверок на prepared PNG: меню/подтверждение при 900×620 и 1440×900, Undo/Redo,
crash recovery и Save/reopen. Inference в этот срез не входит. Проверки, исправления
review и границы квалификации перечислены в research. Статус **Пока не обещать**
сохранён; на этом checkpoint native Smart variant history ещё не квалифицирована.
Последующий history checkpoint описан выше; остальные незакрытые flows не объявлены готовыми.

Текущий [frozen Smart Patch Retry срез](./engineering/phase-4-smart-patch-retry-research.md)
добавляет повтор одного reviewed failed/canceled задания с независимой копией
исходных проверенных inputs, конкретными prompt/seed и прежними ресурсами.
Общая admission/очередь сохраняет одного владельца исполнения; original document
и coordinator, CAS и publication receipts проверяются в Main. Retry не меняет
текущий Project, Undo, accepted variants, старые кандидаты или `.igs`; результат
остаётся временным до явного Add. Отсутствующий текущий target остаётся orphaned,
без автоматического retarget/conversion. Статус **Пока не обещать** сохранён; actual checks и
границы collaborators/installed/release перечислены в research.

Текущий [selected Smart Patch freshness срез](./engineering/phase-4-smart-patch-freshness-research.md)
добавляет автоматическую read-only проверку source для выбранного stored Patch
и общий reader браузера вариантов. Проверенный source даёт `Matches current inputs`,
изменённые inputs — `Outdated`, недоступный source — `Unverified`. Диагностика
не меняет `.igs`, dirty, Undo или immutable provenance; Generate/resource readiness
проверяются отдельно. Один App-owned запрос и последний ожидающий owner сохраняют
границу при смене вкладок. Статус **Пока не обещать** сохранён; выполненные проверки
и ограничения указаны в research.

Предыдущий [installed Smart Patch срез](./engineering/phase-4-smart-patch-installed-generation-research.md)
прошёл 27 native checks: десять trained public completions для Illustrious
V-prediction и Anima в TXT/IMG/INP/OUT плюс INP replay каждой семьи при processing
256/world 128, четырёх шагах и seed 123. Все десять явных Add сохраняют точные
world RGBA и immutable provenance через один Undo/Redo, Save и reopen; текущие
Patch inputs, обычный draft и соседние слои сохранены. Два IMG/INP raw RGB
контроля различаются на всех 16,384 pixels; оба INP replay совпадают по whole RGBA.
Generate не принимает результат, Add не выполняет Save.

Реальные Smart steps доходят до видимого счётчика через общую transient telemetry.
Select учитывает существующий busy guard. Исправлен ложный Repair при healthy
worker close: каждый reopened selected Patch предлагает Generate без Repair до
диагностического getStatus. Все 51 installed worker files и final source/bundle/
original/managed hashes сохранены; все 80 observed actors физически завершены.
Неудачные попытки учтены отдельно от успешной матрицы. Reopened stored rows
могут показывать `unverified`: автоматическая source-freshness re-verification
после worker lifecycle этим срезом не квалифицирована. Orphan Raster
conversion, accepted-history navigation, Compare/Preset, arbitrary options,
quality, full Invoke parity и release остаются открытыми. Статус сохраняется
**Пока не обещать**.

Предыдущий [public Smart Patch Generate/Results/Add](./engineering/phase-4-smart-patch-public-generation-research.md)
connects dedicated public IPC, frozen layer-bound planning, one typed dispatch
owner, signed temporary results and reviewed journaled Add as Variants.
Target-scoped replacement preserves sibling Patches and ordinary candidates;
Project Close/recovery presence and teardown include both stores. Public Add
rechecks reviewed owner/revision inside the gate and retains Save's gate/image
lease order. Accepted variants keep immutable provenance and current authoring.
Orphans remain visible/exportable/discardable. That checkpoint records its
executed checks and declared inference collaborators; installed trained evidence
is qualified above. At that public checkpoint, orphan Raster conversion, Retry,
accepted-history navigation, Compare/Preset and release remained open. Full status stays **Пока не обещать**.

Предыдущий [Smart Patch variant lifecycle/status](./engineering/phase-4-smart-patch-variant-lifecycle-research.md)
adds real renderer/Main select, rename and delete for existing accepted variants,
strict document/revision binding, one-step Undo, final removal to the same empty
Patch and retained image bytes through Delete → Save → Undo. The persistent
browser separates current authored/actual-source freshness from resource
availability. Historical copied ownership never rewrites provenance. Unknown
source remains unverified; missing resources do not destroy or block stored
variant edits. At that lifecycle checkpoint, public Generate/Results/Add,
accepted-history navigation, Compare/Preset and installed inference remained open. Complete PP-007/008 status
stays «Пока не обещать». Executed evidence and finite limits belong to the linked
research; prototype mocks are separate.

Предыдущий [Smart Patch durable acceptance](./engineering/phase-4-smart-patch-durable-acceptance-research.md)
Private Main Add now appends verified world candidates to the exact Smart Patch,
preserving old variants and current authoring with one active anchor and one Undo.
A shared Project gate and SQL intent slot serialize Raster/Smart acceptance and
close. Dedicated Smart cancellation drains inference, claim startup, CPU work
and publication; late completions require renewed review. Captured sessions are
checked against foreign targets, documents and ordinary results.

The durable order is intent → asset adoption → synced shadow → atomic session
tombstones/intent removal → staging cleanup. Recovery dispatch selects one owner;
full immutable lineage completes, absence abandons without consuming candidates,
partial/changed lineage or unknown overlap stays fenced. A clean saved package
must pass actual member verification plus file/directory sync before replacing
shadow proof. Replays do not duplicate or reactivate variants. Add never performs
Save or rewrites completed receipts/seed cursor.

At that durable-acceptance checkpoint, public Smart Generate/Results/IPC, variant
lifecycle controls, freshness/resource UI, accepted-history navigation, Compare/Preset
and installed inference qualification remained later owners. PP-007/008 remain
«Пока не обещать». The next finite owner at that checkpoint was variant lifecycle
and current-state diagnostics before public integration.
Executed evidence and finite limits belong to the linked research.

Предыдущий [Smart Patch variant storage/display](./engineering/phase-4-smart-patch-variant-storage-research.md)
The document now owns nonempty Smart Patches: all active and inactive variant
images survive explicit Save, local recovery and Undo/Redo retention. Actual PNG
bytes, canonical sRGB profile, dimensions and immutable contribution alpha are
verified before package or new shadow publication. A metadata-only alpha change
cannot reuse a prior pixel proof. Current layer/mask/variant IDs are unique;
frozen source IDs remain historical when a later copy has new ownership.

Only the active image contributes pixels, at its own frozen world bbox and its
parent's stack position, visibility, opacity and blend mode. Current Patch bbox,
mask, blur and internal-resolution edits do not move, resize or remask stored
RGBA. Main source capture, preview/bounds and the signed renderer image resource
use this projection. The DTO/card reports `stored`, without claiming freshness
or current model availability. Top-level Raster mutation/history selectors stay
separate from this material projection.

This is storage/display support for an already populated document, not the
public acceptance command. Generate/Add, durable acceptance journal and sibling
cancellation/reconciliation, variant lifecycle controls, accepted-history
navigation, Smart Patch Compare/Preset and installed inference qualification
were later owners at that storage/display checkpoint. PP-007/008 remain «Пока не обещать». Executed evidence and
remaining limits belong to the linked research.

Предыдущий [Smart Patch acceptance plan](./engineering/phase-4-smart-patch-acceptance-plan-research.md)
adds strict standalone variant/provenance contracts and a read-only proposal;
the Project schema still accepts only empty Smart Patches. Identity-bound staging
reads consume actual world RGBA and final-mask bytes. The projector checks frozen
context, worker-confirmed seed, exact contribution alpha and inference prediction
type before proposing portable metadata without managed paths or reusable `Size`.
Owned authoring and independently composed current source pixels determine
ready/outdated; unrelated Project revisions and Fit-only padding do not.
This comparison does not qualify current model-registry or runtime availability.

Private `ProjectService.prepareSmartPatchVariantAcceptance` rechecks the exact
Project owner, document/revision, target and reviewed selection around byte reads
and current-source composition. Locked or hidden targets block the proposal;
missing targets remain orphaned. A changed eligible target keeps frozen proposal
metadata and reports outdated inputs. The returned plan is not an accepted result
or a capability to commit later without revalidation.

No Project/history/`.igs` mutation, sibling cancellation, acceptance journal,
staging discard or public UI is connected. Next owners are all-variant asset
storage/validation and active-variant composition, then durable Add/reconciliation,
variant lifecycle and public Generate/Results integration. PP-007/008 remain
«Пока не обещать»; executed evidence and limits belong to the linked research.
Evidence: affected2545 TS PASS, final65 focused+2 actual Main/native controls;
seven isolated causal RED/GREEN pairs, typecheck/lint/build PASS. An initial
bounded diagnostic OOM is excluded and recorded with cleanup in research.

Предыдущий [Private queued Smart Patch execution](./engineering/phase-4-smart-patch-queued-execution-research.md)
connects dedicated SQL claim, exact frozen inference, worker-confirmed uint32 seed,
CPU world composition and independently durable Smart Patch world candidates.
The private `GenerationOrchestrator.createSmartPatchExecution` handle waits for
admission and exposes explicit run/cancel/stop ownership; public drain stays off.
Both family operations share the global running-slot CAS with ordinary jobs;
normal dispatch/readers and Raster acceptance remain separate. One cancellation
owner drains inference, CPU startup/request/readback and publication before
acknowledging cancel or cleaning scratch; unconfirmed exit retains its owner,
slot and files. The private inference capability now also requires
`smart-patch-seed-confirmation`; older installed payloads refuse before ML.

A separate typed store at `recovery/smart-patch-staging` reserves the shared
receipt before fsynced world RGBA/final-mask/manifest publication, then commits
queue+receipt+actual-seed cursor atomically. Exact reload and APP_RESTART recovery
keep independent final alpha and context after terminal queue/input pruning;
USER_CANCELED cannot resurrect a candidate. Shared tombstones hide discarded
sessions across both stores. Normal Results never discovers these candidates,
and the Smart DTO cannot be assigned to the normal Raster DTO.

That checkpoint established a private executable/recoverable path. Public
Generate/Retry/Results, immutable variant acceptance/outdated/orphan handling,
portable provenance and installed GPU/release qualification were subsequent
owners. It introduced no Project/document/`.igs`/history/preset/Compare edits. PP-007/008 public readiness
remains «Пока не обещать»; actual checks and limits belong to the linked research.
Evidence: affected2480 TS/97 Python PASS, final106 focused+2 actual Main/native
cases, five isolated causal RED/GREEN pairs. Typecheck/lint/build/global Python
checks PASS; physical exit, source restoration and own-payload cleanup confirmed.

Предыдущий [Private Smart Patch queue admission](./engineering/phase-4-smart-patch-queue-admission-research.md)
adds real `illustrious-smart-patch` / `anima-smart-patch` pending rows to the common
SQL queue. One independent queue-owned bundle under
`generation-queued-inputs/smart-patch/<UUID>` serves1..32 concrete items;
caller-owned prepared bundles remain independent. Strict DTO and actual-byte
reload bind Project/document/layer, world/internal geometry, exact manifest and
item index. Resource/prediction/noise policy and current unlocked+visible target
are rechecked before atomic SQL insertion. Exact lost-ack readback confirms the
whole batch; unknown outcomes retain files and fence the Project. Cancel and
restart cancel unfinished jobs without replay; terminal pruning reclaims only
an exact verified bundle after its last SQL reference. Unknown/corrupt/incomplete
bundles are retained. Queue metadata understands both families; normal dispatch,
ordinary Retry and normal input readers refuse these jobs before runtime use.
This is private durable admission, not runnable public generation. No candidate,
receipt, actual-seed cursor, variant, Project/`.igs`/provenance/preset/Compare or
public Smart Patch Generate/acceptance UI is introduced; Retry remains explicitly
disabled. Next: dedicated typed dispatch with worker-confirmed
actualSeed, owned inference+CPU cancellation and independently durable world
candidates, then immutable variant acceptance. Public PP-007/008 remain
«Пока не обещать». Verification evidence and limits are in the linked research.

Предыдущий [Private durable inputs](./engineering/phase-4-smart-patch-durable-input-research.md)
добавляет `capture.prepareBatchInput` для1..32 уже concrete items и отдельный
fsynced bundle с source/authored mask/model RGB/latent KEEP/final contribution,
exact family metadata и frozen target context. Transient execution paths не
сохраняются; strict reload проверяет actual bytes/ICC/hash/geometry и связи полей.
Exclusive manifest marker фиксирует полный bundle; uncertain publication
сохраняет owner, explicit discard проверяет exact identity. Это подготовка до SQL
admission, не pending job/candidate/recovery session. Нет cursor/receipt/variant,
Project/`.igs`/UI/provenance/preset/Compare изменений. Dynamic expansion и выбор
Random/Reuse вне concrete boundary. Public Generate и Add as Variants запрещены
для locked **или** hidden target; private read-only подготовка разрешена. Далее —
complete queue/dispatch/staging и immutable acceptance. Public status прежний;
Affected2358 TS PASS (new24 contract/24 FS/16 Main included),four causal semantic RED/GREEN pairs; проверки и ограничения — в linked research.

Предыдущий [Private world output](./engineering/phase-4-smart-patch-world-output-research.md)
добавляет `capture.executeAndCompose`: generated RGB масштабируется BICUBIC до
frozen world bbox, готовая final GENERATE alpha присоединяется без изменений.
Main независимо проверяет actual RGBA/ICC/hash/geometry и точное равенство alpha
замороженной final mask; detached `worldContribution` размещается по
`context.bbox`. Повторного fade, latent-mask reconstruction или source pasteback
нет. Одна drained lease охватывает native inference, CPU composition и readback;
callback failure ждёт admitted work, unconfirmed worker exit сохраняет inputs.
CPU derivatives-only worker 0.1.0 требует `smart-patch-output-composition`; old
payload отказывает до dispatch. Operation stage `0700`, owned scratch base может
сохранять `0775`. Existing `capture.execute` RGB contract не меняется.
Нет durable jobs/queue/batch/candidates/receipts/recovery manifest, variants,
document/history/shadow/`.igs`, provenance/preset/Compare или UI/public Generate
изменений. Далее — durable queue/batch и immutable acceptance. Проверки и
qualification limits зафиксированы в linked research: affected2294 TS/705 Python PASS (new9 Main/4 JSONL/58 Python included),three isolated semantic RED/GREEN pairs; PP-007 остаётся
«Пока не обещать».

Предыдущий [Private Main/worker execution bridge](./engineering/phase-4-smart-patch-execution-bridge-research.md)
связывает owned capture, exact resource admission, сериализованный native worker,
exclusive processing-size RGB и строгий Main readback в одной drained lease.
Caller передаёт один concrete prompt pair и uint32 seed; dynamic expansion,
Random/Reuse resolution и seed-cursor mutation не выполняются. Worker0.14.0
обязан объявить private capability `smart-patch-execution`; installed runtime
автоматически не обновляется. World mode, independent internal resolution и
all255 KEEP сохраняются. При worker process failure/timeout cleanup ждёт physical exit;
неподтверждённый exit сохраняет staging, в том числе после callback failure.
Это transient private RGB, а не candidate/recovery/accepted result: нет durable
batch/queue/receipt, world composition, immutable variants, document/history/
shadow/`.igs`/schema/UI или provenance/preset/Compare изменений. Следующие owners —
world composition, durable queue/batch и immutable acceptance на том checkpoint;
текущий scope выше добавляет private world output. Выполненные
проверки:2281 TS и1541 Python PASS,16 Main execution/lease cases и four semantic RED/GREEN pairs; qualification limits зафиксированы в linked research; статус PP-007
остаётся «Пока не обещать».

Предыдущий [Private family VAE/denoising](./engineering/phase-4-smart-patch-denoising-research.md)
квалифицирует numerical adapters с prepared RGB/numeric latent KEEP и
caller-owned loaded models. TXT/IMG ordinary,INP/OUT masked;нет повторных
coherence/LaMa,source reclassification или pixel pasteback. All255 KEEP при потере
latent coverage всё равно выполняет VAE и denoising как Invoke,сохраняет world
mode и полностью защищает source latents. Это VAE reconstruction,а не обещание
новой детали в исчезнувшей tiny edit;нет отказа,fallback или invented coverage.
Focused72 Python PASS:65 real tiny native cases и семь actual CPU protocol
preparation→adapter cases,шесть solvers/family,Illustrious EPS/V. Prepared INP —
world128/internal64/Euler для обоих семейств. Random small CPU-native evidence
не доказывает trained/installed/GPU/full Invoke pixel parity. Нет Main transport/
public worker command,queue/publication,world compositing,variants,`.igs` state/
schema/UI,provenance/preset/Compare или нового persistence promise на том
numerical checkpoint. Последующий bridge checkpoint добавляет Main/worker execution и
resource admission; later world-output checkpoint добавляет private composition.
Immutable variants остаются отдельным owner. Full checks/mutations фиксируются отдельно в research;
статус PP-007 остаётся «Пока не обещать».

Предыдущий [Private model-source/LaMa preparation](./engineering/phase-4-smart-patch-model-source-research.md)
квалифицирует actual Main capture→compose/prepare/condition→lazy pinned Main
resolver для OUT→worker RGB внутри одного drained lease. TXT null,IMG/INP exact
RGB без LaMa,OUT full trained LaMa RGB с source-only alpha<255 holes,включая
resized uniform alpha без смены world mode. Шесть masks,original source,document/
history/shadow/Save/seed/queue остаются независимыми и неизменными. Affected1937 TS/
527 Python (focused65/68),two actual Main trained-source cases с unchanged storage/source,four
exact trained wholeRGB matches к pinned Invoke и three semantic RED/GREEN pairs
квалифицируют finite boundary. Global lint/typecheck/build и worker Ruff/basedpyright
PASS;ограничения фиксируются в research note. `.igs` schema/state не меняется;нет family diffusion/
VAE/denoising,jobs,candidates/variants,provenance/preset/Compare/UI или public
Generate. Normal OUT strict admission и публичный статус PP-007 сохранены.

[Owned coherence settings](./engineering/phase-4-smart-patch-coherence-settings-research.md)
добавляет optional per-Patch profile,compact controls и captured whole-profile
Undo/Save/local recovery. Legacy no-injection/default no-op preserves absence;
mask/geometry/draft/other owners remain unchanged. Frozen default conditioning
использует OWNED profile. Evidence: affected1927 TS/prototype180/native14,three semantic RED/GREEN,typecheck/lint/build PASS;native inference/variants/new
provenance/preset/comparison fields/public readiness не добавляются.

[Private processing-space coherence](./engineering/phase-4-smart-patch-coherence-research.md)
добавляет caller-owned frozen profile,six grouped numeric outputs и
projected WORLD contribution в drained lease. Affected1905 TS/268 Python PASS,
36 pinned Invoke comparisons и четыре isolated semantic RED/GREEN pairs.
Original masks/document/history/Save/seed/schema сохраняются;coherence UI/settings
persistence,ML/variants/public readiness не включаются.

[Private world contribution fade](./engineering/phase-4-smart-patch-contribution-fade-research.md)
добавляет четвёртый derived numeric world mask в одном admitted/drained
lease. Soft conditioning inputs/original mask/document/history/seed/Save остаются
неизменны;binary core/world-pixel blur используют frozen inputs,padding исключён.
Affected1888 TS/203 Python PASS,50 fade cases/21 pinned Invoke comparisons;three
semantic RED/neighbor GREEN и typecheck/lint/build/global Python checks PASS,
physical exit/temporary-copy cleanup confirmed. Это pre-coherence geometry без schema/inference/
variants/public readiness.

[Private effective-mask/internal-size preparation](./engineering/phase-4-smart-patch-mask-preparation-research.md)
квалифицирует read-only Main/CPU owner: world clipped numeric coverage,
internal sRGB source/numeric mask и world-derived mode с отдельным coverage-loss
report. Final focused33 TS/Python24 PASS,three isolated semantic RED/neighbor GREEN
pairs,affected1871 TS/125 Python и global Python Ruff/basedpyright PASS; required
typecheck/lint/build PASS, physical exit/temporary-copy cleanup confirmed. Original mask/document/history/
seed/Save и `.igs` schema сохраняются; queue/inference/accepted variants не
включаются. Public readiness не повышается.

[Private Main/CPU Smart Patch input capture](./engineering/phase-4-smart-patch-generation-capture-research.md)
квалифицирует read-only Main slice: leased below-target source и verified
whole owned mask, bbox/internal/draft/settings без document/history/seed/Save
mutation. Null/disjoint masks валидны; locked/hidden existing targets читаются.
Focused14/affected1852 PASS, четыре actual CPU tests/nine production calls,
три isolated semantic RED/neighbor GREEN probes и typecheck/lint/build PASS;
lifecycle/physical exit/cleanup подтверждены в checkpoint.
`.igs` variants/inference/public readiness не заявлены.

Текущий [Owned mask settings](./engineering/phase-4-smart-patch-mask-settings-research.md)
добавляет portable optional `maskSettings: { blur, padding }` у каждого Patch,
integer0..512/default16/8. Legacy absence сохраняется при parse/open и default
no-op, без dirty/history или подмены hashes. Captured scalar edit использует
Undo/Redo, Save и local recovery, не меняя painted PNG/revision/bbox/internal
resolution/other owners. Fit использует owned blur+padding только при вызове.
Impacted regression1835 PASS до final UI refinement, final affected104/native109,
three semantic RED/GREEN и typecheck/lint/build PASS; chronology/source/exit proof
и реальные Save/crash recovery — в checkpoint. Inpaint/variants/presets/release
остаются открытыми и публичный статус не повышен.

Предыдущий [Transform/Fit implementation](./engineering/phase-4-smart-patch-mask-transform-research.md)
использует существующий portable mask format без affine metadata. Captured local
preview завершается явным Apply/Enter или Cancel/Escape; Main читает verified
pixels и запекает world-grid PNG. Один changed Apply — один Undo, cancel/no-op
не создают revision/history. Unit integer translation и quarter turns сохраняют
alpha точно; при неизменных dimensions/alpha переиспользуются исходные PNG
bytes/hash, включая валидную упаковку импортированного файла. На том checkpoint
Fit менял только owned bbox с fixed 24px margin/outward grid8, сохраняя mask
identity/revision/pixels и internal resolution. Нынешние owned defaults16/8
дают тот же запас. Regression1820 PASS до final
terminal snapping, final affected59/native57/three semantic RED-GREEN и
typecheck/lint/build PASS; chronology/source/exit proof и ограничения — в
linked checkpoint.
Inpaint/generation, accepted variants/staleness/compositing/comparison,
Regional Guidance, Patch presets и release остаются открытыми; публичный статус
«Пока не обещать» не повышен.

Предыдущий [Smart Patch owned mask authoring](./engineering/phase-4-smart-patch-mask-authoring-research.md)
расширяет portable document отдельным painted mask asset: immutable
`assets/masks/<mask-id>/<sha256>.png`, white RGBA8 и linear alpha8 coverage,
integer world bounds с одним mask pixel на один Project pixel. Bbox/internal
resolution не сдвигают и не обрезают coverage. Null asset после Clear сохраняет
identity, повышает revision и не содержит bounds; исходная empty revision `0`
остаётся валидной. Strict package/shadow/source readers проверяют ownership,
hashes, размеры, PNG structure и nonempty tight coverage. PNG ограничен 256 IDAT
chunks; 257-й отклоняется до накопления data view, текущий encoder пишет один
IDAT. Общий asset owner
удерживает bytes для Undo/Redo, explicit Save и local recovery.
Brush, Eraser, Lasso и Polygon Lasso используют Main CPU-authority; renderer preview
временный, thumbnail — scaled stored PNG, без нового worker или ML-generation.
Восемь реальных Service scenarios, полный app regression 3751 PASS, affected 176
PASS и native 33 named checks PASS подтвердили actual pointer tools, независимые
PNG/Chromium alpha pixels, один Undo, Save/reopen и crash→Home Recover. Five
semantic RED/neighbor GREEN pairs и byte-exact restoration подтверждены;
typecheck/lint/build PASS. Полный suite предшествовал дополнительному IDAT guard;
affected run включает его tiny 256/257 boundary case. Его evidence не включал
Transform/Fit; текущая реализация и её qualification описаны выше. Inpaint,
variants/staleness, Regional Guidance, Patch presets и релиз ещё открыты.
Публичный статус «Пока не обещать» сохранён.

Предыдущий [Smart Patch document foundation](./engineering/phase-4-smart-patch-foundation-research.md)
добавляет production `+ Patch` без ML runtime: отдельные owned empty mask
`{ id, revision: 0, asset: null }`, bbox, internal resolution и detached generation
draft. Targeted authoring сохраняет normal Project и другие Patch; selection,
Undo/Redo, явный Save/reopen и local crash recovery проверены в built Electron.
Final native-race-green завершил 17 named checks на двух размерах окна, с независимым чтением
сохранённого `.igs` и recovered document; обычные Raster данные сохранены.
На момент foundation painting, inpaint, accepted variants, Regional Guidance и
preset Apply на Patch оставались следующими срезами. Это document foundation, без claims переноса между
компьютерами или ML-generation. Статус «Пока не обещать» сохранён.

Текущий [NoobAI Karras refusal](engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». Следующий implementation item — local thumbnails/previews installed resources. Сведения о прежних checkpoints и их «следующем gate» ниже исторические; исходный lost traceback не восстановлен.

Текущий подтверждённый [Anima image cap32/prefix](engineering/phase-2c-anima-image-batch-cap-research.md): Euler256 IMG/normal mixed-alpha OUT:76 admissions/completions/accepted layers,4 Save-reopen packages,12 собственных wholeRGBA prefix matches. Два confirmed33 refusals сохраняют32 временных результата и исходный слой без новых jobs/receipts. Independent raw readback PASS85373;4 cursor/Save snapshots7/5,11 прежних SQL tables и43 worker identities сохранены;2 OUT previews/111104 protected source pixels. Только N3/CFG4/strength0.5/Myth−0.5/exact resources; quality/Invoke parity/fullMVP/release не заявлены. Следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. Статус promise остаётся «Пока не обещать».

Предыдущий подтверждённый [Anima image MAX→0](engineering/phase-2c-anima-image-seed-wrap-research.md): Euler256 IMG/normal mixed-alpha OUT: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 own MAX/0 wholeRGBA matches и 2 same-prompt contrasts. Independent raw readback PASS (18700 checks), 6 cursor/Save snapshots, 11 old SQL tables и 43 worker identities сохранены; 3 OUT previews / 166656 protected source pixels. Actual Main modulo fault: 18 executions, 2 RED / 16 GREEN; restored и guarded-cleaned 584 files. Portable provenance сохраняет raw weighted text, actual seed и resource/source context; compiled/step/posterior проверены отдельно в frozen worker inputs. Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader inputs/quality/Invoke parity/fullMVP/release остаются открытыми.

Предыдущий подтверждённый [Installed Anima image Random → Fixed](engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.

[Phase 2A sampling/Save evidence](./engineering/phase-2a-project-storage-research.md#production-sampling-draft-controls) и [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md) сохраняют отдельные references для document lifecycle и history; они не заменяют installed inference qualification.

Предыдущий подтверждённый [Installed Anima image per-prompt](engineering/phase-2c-anima-image-per-prompt-research.md): Euler × common-source IMG/normal mixed-alpha OUT:80 admissions/completions/accepted layers,4 Save/reopen packages и16 own same-input wholeRGBA per-prompt controls. В каждом режиме genuine numeric-control4pairs×8/Fixed0/per-iteration сравнивается с4pairs×2/Fixed0/per-prompt по seeds0…7; control slots0,1,10,11,20,21,30,31. Independent raw readback PASS23682:80 owning comparisons,4 cursor/Save snapshots7,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. Full frozen DTO сохраняется; только owner IDs и предварительно проверенный seedBehavior исключены из matching. Concrete raw weighted prompts остаются portable; templates/maxPrompts/compiled arrays — вне provenance. 98 focused tests PASS0skip;18 actual Main source executions дают2 semantic RED/16 GREEN. 64 within-pair seed contrasts, без scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; cap32-refusal/Random/Reuse/wrap/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md): Euler × common-source IMG/normal mixed-alpha OUT:20 admissions/completions/accepted layers,4 Save/reopen packages и4 own same-input wholeRGBA prefix controls. Четыре weighted positive×negative пары × две iterations; Fixed0/per-iteration seeds0/1, full authored templates и selected first-pair prefix. Полные compiled strings/spans остаются в frozen worker inputs; portable provenance содержит concrete raw weighted prompts без compiled arrays/templates/maxPrompts. Independent raw readback PASS18128:20 owning comparisons,4 cursor/Save snapshots1,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. 75 focused tests PASS0skip;18 actual Main source executions дают4 semantic RED/14 GREEN. 34 visible joint-input contrasts не доказывают scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image dynamic embedding subsets](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md): EPS/V × common-source IMG/normal mixed-alpha OUT:24 admissions/completions/accepted layers,8 Save/reopen packages и8 own same-input wholeRGBA prefix controls. Fixed0/per-iteration baseline4/prefix2 сохраняют full authored refs и effective signed native/portable subsets; ordinary wire omits embeddings. Independent raw readback PASS18641:24 owning comparisons,8 cursor/Save snapshots0,11 old tables,43 worker identities и4 OUT previews/222208 protected source pixels. 118 focused tests PASS0skip;48 actual Main source executions дают16 semantic RED/32 GREEN. 28 visible input contrasts не доказывают embedding-only causality; новых installed-worker mutations нет. Только256×256/Normal N3/exact resources; quality/fullMVP/release не заявлены. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён отдельным20/4/4 gate. Последующий [Anima Fixed/per-prompt image80/4/16 gate](engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. PP-004/005/007/008 остаются «Пока не обещать».

Предшествующий подтверждённый [Installed image cap32 and selected prefix](./engineering/phase-2c-illustrious-image-batch-cap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 152 qualified admissions/completions/accepted saved layers,8 Save/reopen packages,24 own same-input wholeRGBA prefix controls. Четыре genuine confirmed33 UI refusals сохранили все32 temporary candidates и source1 без новых jobs. Independent raw readback PASS (104613 checks):152 configurations/comparisons,8 cursor/Save snapshots, 11 old tables и43 worker identities сохранены;34 source keys/five bundles bound. Historical Main:16 semantic RED/84 GREEN in100 executions; fresh deadline DI:4 RED/371 GREEN in375 executions; обе536-source copies exact-restored and guarded-cleaned,preexecution261 focused tests PASS0skip. R2 boundary2700s/prefix1800s при прежних12+2GiB/14GiB/zero-swap/1600s completion poll. R0 timeout сохраняет32 actual accepted layers/one actual package/zero qualified stages; raw across attempts184, qualified counts exclude R0. Native seeds0…7 — только256×256/Normal N3/four pairs×8 boundary иfirst3pairs×2 prefix; MAX cross-pair wrap/Anima image/installed mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles при256×256/трёх
steps, сохранив catalog5/9 без публикации файлов, exact signed Z/T,T/Z refs и
accepted frozen0 через Add/Save/readback/reopen/comparison при current draft37.
Нормальные runs не добавили Cancel/refusals. Три успешных independent native
oracles проверили12 direct hidden/pooled/handoff assignments без новых jobs.
Installed EPS sign-swap завершил два finite cycles до directional RED; physical
exit/restored43/original inode/mode/mtime/bytes/backup absence подтверждены,
fresh EPS pair2 GREEN. Final evidence независимо проверяет все8 saved packages,
Pillow pixels, actual SQLite completed rows/receipt bytes и signed refs/settings;
mutant pixels равны противоположным normal choices, fresh — своим. Physical
Main/worker idle подтверждён. Historical component/encoder/outpaint counts не
расширяются; arbitrary multiple-LoRA combinations/order, Anima0.14, dynamic, arbitrary formats/quality/
Invoke parity/release и статус «Пока не обещать» остаются прежними.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
подтверждает 36 normal completions и отдельные два lifecycle: два restored
Retry completions, четыре admissions, две actual Cancel и шесть preserving
missing-component refusals. Реальные snapshots проверяют Project/layers/bbox,
autosave/recovery/scratch, весь generation-input parent, saved package и
queue/receipt/seed/tombstone rows. Default/component/prompt/seed edits сделаны
перед refused Retry; current seed37 не заменяет frozen0. После восстановления exact
managed files успешный Retry сохраняет original frozen context и target bytes;
все rollback завершены после подтверждённого physical inference-child exit. Add/Save/readback/
reopen/comparison сохраняют portable exact tuple и pixels. Четыре installed
EPS-txt2img component mutations дали causal RED после шести finite cases каждая;
исходник восстановлен между прогонами. Fresh restored EPS-txt2img normal прошёл
шесть finite cycles с native physical exit. Final source evidence подтверждает
idle Main/worker, byte-exact все 43 worker source files и пять restored mutation
journals без backup, включая excluded LoRA attempt; original inode/mode/mtime
сохранены. Bounded polarity follow-up описан выше; multiple-adapter order, Anima worker0.14, dynamic
batches, crash/relink expansion и release остаются открытыми. Статус
«Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
завершил 8 finite EPS/V TXT/strength0.5 IMG full UI cycles, сохранив исходные
catalog owners в5 resources/9 versions и actual current draft37 при frozen0.
Add/Save/independent readback/reopen/comparison сохраняют exact provenance/pixels.
Один installed EPS-img2img encode-zero mutant завершил два finite cycles до
causal RED; physical exit и восстановление всех 43 source files с original
inode/mode/mtime подтверждены. Fresh restored pair прошла два finite GREEN cycles с physical exit. Outpaint
encoder не проверялся этим TXT/IMG срезом; all-layer/formats qualification и multiple-LoRA order,
Anima worker0.14, dynamic и release остаются вне этого proof.

Отдельный [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
завершил четыре finite EPS/V normal OUT cycles в четырёх admissions при256×256,
трёх requested steps, FP32, seed0/strength0.5 и двух effective native denoising
evaluations. Две matched пары сохраняют source layers/protected source и exact
contribution alpha; visible contribution RGB и saved merged RGB меняются на
соответствующих координатах. Add/Save/independent readback/reopen/comparison
сохраняют immutable provenance при actual current draft37/frozen0. Catalog5/9
сохранён, newManagedFiles0; оба native physical exit подтверждены.
Installed EPS-OUT encode-zero mutant завершил два finite cycles до intended
visible-RGB RED; physical exit/restored43/original inode/mode/mtime подтверждены.
Fresh restored pair прошла два finite GREEN cycles с physical exit и exact
original EPS RGBA/merged pixels. Final8 OUT cycles (4 normal +2 finite mutation
cycles до causal RED +2 fresh GREEN) имеют independent Pillow saved `.igs` alpha/
protected source/corresponding visible/merged pixel proof, actual SQLite completed
rows/receipt bytes и CPU control binding ко всем frozen VAE refs. Idle Main/worker/
nativeData и восстановление43 exact files/original inode/mode/mtime/bytes без
backup подтверждены. Прежние 8 normal +2 mutation
+2 fresh TXT/IMG cases остаются отдельными; bounded polarity follow-up описан выше, multiple-LoRA order,
Anima worker0.14, dynamic, broader compatibility/quality и release открыты.
Статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Controlled Generate/Retry component refusals сохраняют Project, полный autosave tree, saved `.igs`, queue/receipt/seed rows и private inputs/staging/scratch. После восстановления resolver healthy Retry использует original frozen target/context и не меняет Project/shadow/package. Installed CPU component loading проверено отдельно; это не trained component portable Add/Save/reopen или полный MVP. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
проверяет source RGB, protected merged-preview pixels, placement и сохранность
исходного слоя после Add/Save/readback/reopen. Две actual Cancel и шесть preserving
Retry refusals независимо меняют prediction/ZTSNR/spacing для EPS/V. Изначальные
queue/receipt/candidate/seed/staging/target/Project/saved bytes сохраняются; public
error — `GENERATION_INPUT_CHANGED` с безопасным объяснением. Восстановление policy
разрешает прежний frozen Retry после draft edits, без новой composition.
Component combinations оставались открытыми на этом checkpoint; последующий
bounded срез описан выше. Independent component gates, new-worker Anima regression, dynamic batches,
crash/relink expansion и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
проверяет сохранение Project draft, bbox, source layers, Undo и saved bytes при
Model Manager policy edits. Реальные Add/Save/readback/reopen сохраняют immutable
exact settings. После actual Cancel три независимых Retry изменения prediction,
ZTSNR или spacing дают отказ без queue/receipt/candidate/seed/staging/package
effects; восстановление всех полей разрешает прежний frozen Retry. При Cancel
actual seed не продвигается. Crash/reopen Reuse, dynamic batches, полный NoobAI
outpaint/component scope и release остаются открытыми; статус «Пока не обещать»
сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий outpaint срез (07.10.2026): [public Generate/frozen Retry](./engineering/phase-2c-public-outpaint-research.md)
подключены для обеих семей при qualified worker 0.12.0 и exact local LaMa.
Installed development Electron завершил шесть trained cases при 256×256/трёх
шагах: у каждой семьи normal source, mixed-alpha Generate и frozen Retry после
actual Cancel. Explicit Add/Save/reopen и outpaint comparison сохраняют source
layers, exact contribution alpha и portable provenance без local paths.
Статус обещания остаётся «Пока не обещать»; setup/release и прочие MVP gaps
перечислены в research note. Последующие описания прежних checkpoints
сохраняют исторические границы evidence, а не отменяют этот более новый срез.

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность — reader/writer
`.igs`, production Home/Project IPC, bbox Save/reopen, document shadow, Move/Copy
`.igs` и бесконечный raster Canvas проверены на файлах и в Electron. Изменение
свойств и порядка Raster Layers прошло сервисные тесты с реальными файлами;
Electron проверяет видимость, opacity, blend mode, lock и перестановку мышью/через
меню до Save и после reopen. PNG импорт из UI проверен в Electron: новый слой
виден до Save, его ассет сохраняется в `.igs` и открывается снова; отмена и
некорректный файл не меняют документ. При этом тест запускает development
`derivatives-only` worker. JPG/WebP покрыты нормализацией в worker tests, но не
отдельными UI-прогонами. Save с development worker создаёт embedded PNG/WebP
preview из видимых Raster Layers; Electron smoke проверяет повторное чтение
`.igs`, world-space rect и реальные пиксели обоих превью. При ошибке worker
Save сохраняет слои с обозначенным placeholder. Raster-only finite target
теперь строится из frozen bbox и видимых слоёв отдельной worker-командой,
без принятия результата или изменения `.igs`. [Qualified target transport](./engineering/phase-2b-inference-target-composition.md)
теперь даёт этот путь в том же inference child с shared проверкой реального PNG,
ICC, bbox и alpha mode. Интеграция реального ProjectService проверяет frozen
input без изменения документа; transport peer и Python compositor проверены
отдельно. Это пока не пользовательская генерация или proof CUDA readiness. В production Project можно редактировать обычный текст позитивного
и негативного prompt, политику Seed, значение Fixed seed, явную пару
sampler/scheduler, Steps и CFG scale
как часть `generationDraft`. [Dynamic settings/preview](./engineering/phase-2b-dynamic-preview-research.md)
добавляет `maxPrompts` и seed behavior с Undo/Redo, recovery shadow и Save/reopen.
Для старого документа отсутствие settings сохраняется; effective-default no-op
не создаёт dirty/Undo. Сам preview не меняет draft, actual seed или `.igs`. Эти правки принадлежат документу и проходят через
dirty/shadow/явный Save; они не устанавливают фактический seed для `Reuse`.
[Seed Reuse checkpoint](./engineering/phase-2b-seed-reuse-research.md) отдельно
проверяет фактический cursor для открытого `documentId` и переносимый snapshot
только после явного Save. Значение `0` сохраняется корректно; Save не создаёт
редактирование или Undo step. [Production Generate actions](./engineering/phase-2b-generate-actions-research.md) теперь используют retained capture и typed queue/cancel; transient count/status и bbox guard не изменяют документ или Save. Полный inference pipeline остаётся открытым.
Electron smoke проверяет немедленный Save→`.igs`→reopen и native `app.quit()` с
Save сразу после ввода prompt и CFG. Некорректные Fixed seed, Steps или CFG
блокируют Save; при потере фокуса поле возвращается к последнему валидному
значению draft.
Project также сохраняет точную выбранную версию установленного checkpoint и
не заменяет её при смене Default. После копирования `.igs` на другой компьютер
Project предлагает явно связать сохранённую версию с точным установленным
CivitAI-файлом. Проверка идентичности файла выполняется в main; меняются только
локальные ID, и результат проходит dirty/shadow/явный Save. Открытие проекта
само по себе ссылку не меняет.
LoRA stack также проходит dirty/shadow/Save/reopen: версии не заменяются при
смене Default или исчезновении файла; правки веса/enabled и удаление сохраняют
prompt и embedding refs. Явный relink после переноса `.igs` меняет только локальные
ID LoRA, отвергает повреждённый файл и устаревший ответ после правки/закрытия.
LoRA completion вставляет обычный текст: Electron Save и настоящий `.igs` loader
проверяют результат без LoRA ownership или новых embedding refs.
[Проверки prompt](./engineering/project-lora-prompt-research.md).
[Редактирование prompt](./engineering/project-prompt-actions-research.md) проверено
через pointer/keyboard и Save: phrase selection, attention и Copy/Clear работают
в Electron. Project prompt теперь использует общий Project Undo/Redo с одним
шагом на сеанс focus→blur; история не переживает закрытие проекта. На новом
[embedding authoring checkpoint](./engineering/phase-2c-embedding-authoring-research.md)
текст и exact refs составляют одну правку: Delete/Clear prune можно отменить
вместе с ref. Shadow recovery и явный Save/reopen сохраняют оба значения;
portable relink меняет только local IDs. Revision/epoch отвергают позднюю
verification, edit→Undo ABA и close, включая async commit hook.
Generation pipeline от этих authoring
actions не становится готовым.
[Anima Main preparation](./engineering/phase-2c-anima-main-preparation-research.md)
использует captured document ID/revision, leased visible pixels и scoped Reuse
cursor без изменения документа, `.igs`, queue или actual seed. Temporary request
paths принадлежат одной lease и не становятся переносимыми project assets.
Эти ephemeral contexts сами по себе не являются durable Anima pipeline.
[Durable Anima checkpoint](./engineering/phase-2c-anima-durable-jobs-research.md)
теперь сохраняет отдельные concrete attempts и verified local recovery candidates
через общие receipts/tombstones. Это не меняет `.igs` до явного принятия: portable
Anima Add ещё запрещён, как и public Generate. Discard/Cancel/Retry/restart
сохраняют документный seed и чужие sessions; capacity проверяется по фактическому
экранированному манифесту при прежних лимитах.
[Проверки LoRA](./engineering/phase-2a-project-storage-research.md#project-lora-stack-validation)
не доказывают её загрузку и применение в ML pipeline.
Не готовы полный generation pipeline и composite export, устанавливаемый
Linux/NVIDIA runtime и принятие Smart Patch variants. Явный Add Raster для
проверенных восстановленных результатов теперь проходит recovery shadow и
последующий Save в переносимый `.igs`; см.
[Raster acceptance](./engineering/phase-2b-raster-acceptance-research.md). Локальное
[восстановление и read-only preview](./engineering/phase-2b-results-recovery-ui.md)
из staging repository теперь подключены к Project UI; отдельный
[Save Candidate Image](./engineering/phase-2b-candidate-image-export.md)
сохраняет его проверенный PNG без изменения `.igs`.
Electron удерживает одну восстановленную queue/staging пару; [проверки](./engineering/phase-2b-owned-dispatch-and-recovery.md)
на том checkpoint не покрывали Project close/discard или acceptance; [следующий checkpoint](./engineering/phase-2b-electron-shutdown.md#per-project-close-extension-проверенный-checkpoint) проверяет close/discard, а текущий Add — отдельный acceptance checkpoint. Live self-test app-owned runtime
проверен как внутренняя граница, но без
проверенного release artifact и installer он не доказывает готовую установку.
[Native app close](./engineering/phase-2b-electron-shutdown.md) теперь отменяет
ожидающие jobs до закрытия SQLite; Project показывает проверенные recovered
results до явного закрытия с discard.
Home загружает
подписанные thumbnails из проверенного `.igs` или пересобираемого cache.
Clean Rebuild Preview проверен
через UI→IPC→development worker→`.igs`: исходный документ и ассеты остаются
неизменными, а worker failure сохраняет прежний пакет.

[New Generate during inference](./engineering/phase-2b-busy-generate-research.md)
удерживает frozen Project/Canvas input для CPU preparation, сохраняет close gate,
accepted layers, dirty/Undo и явную границу Save. Второй Project может поставить
batch в очередь при processing; `.igs` и actual seed не меняются. CPU startup/
request прерывается при shutdown, unconfirmed exit удерживает owner и блокирует
новые claims. Проверены реальные SQLite/files и Electron с controlled peers;
это не повышает готовность полного CUDA/release flow.

[Result sessions](./engineering/phase-2b-result-sessions-research.md) добавляют
transient preview filter без изменения global checkbox/Add scope. Hidden selected
count и полный confirmation сохраняют видимость последствий Add. Closed Queue
Open продолжает exact result focus после ordinary Open или явного Recover;
Cancel/context/close/failure отзывают одноразовое намерение. Explicit Discard
Recovery отменяет его, фиксирует tombstones всех временных результатов этого
Project, затем удаляет shadow и открывает saved `.igs`. Ошибка до фиксации
tombstones сохраняет shadow; отложенная очистка файлов показана warning.
Saved файл и его accepted assets, operational queue history, actual seed и
другие Projects сохраняются. Несохранённые правки, включая принятые слои только
в shadow, удаляются. [SQLite lock safety](./engineering/sqlite-lock-safety-research.md)
убирает raw descriptor checks: pending sibling jobs остаются видимыми после
закрытия и повторного открытия соседнего соединения; altered SQLite file
permissions требуют явного repair. Fresh read
проверяет actual document и exact job/session, без подстановки соседнего кандидата.
Filter/navigation не меняют `.igs`, dirty/Undo, bbox, actual seed, queue/staging,
accepted layers или provenance. Native proof использует реальные Electron/IPC/
SQLite/files и controlled generation fixtures; полный GPU/release flow на этом историческом checkpoint оставался открытым;
публичный статус не повышается.
[Saved-result browser](./engineering/phase-2b-accepted-history-browser-research.md)
даёт общую модалку из Home/Project и точный переход к owning accepted layer.
Saved-only SQLite/preview остаются отдельно от current dirty tab и staging;
Cancel/Discard/context change отменяют pending focus, а отсутствующий dirty layer
вызывает notice без потери правок. Навигация не добавляет/удаляет результаты и
не меняет `.igs`, seed, visibility или Undo. Read-only Raster comparison
подключён отдельным [PP-005 checkpoint](./engineering/phase-2c-raster-comparison-research.md);
Smart Patch, пресеты, полные provenance/comparison поля и полный GPU/release flow
остаются открытыми.
[Staging-only recovery](./engineering/phase-2b-staging-only-recovery-research.md)
добавляет Home/Open/Import decision для closed ready Project с verified completed
Results без dirty shadow. Recover открывает saved документ clean; Cancel не
открывает вкладку; Discard сохраняет прежний all-session scope. Недоступный
staging при absent/clean shadow показывается как unavailable с диагностикой,
сохраняя saved Open/Import/Save/rebuild и неизвестные файлы; pending document
shadow сохраняет свой статус и decision first. Fresh inspections и общий Project gate
сохраняют границы dirty recovery, acceptance и seed; это не full GPU/release proof.

[Project-local accepted history](./engineering/phase-2b-project-accepted-results-research.md)
теперь реконструирует список current accepted Raster results из owned provenance
после Add, Undo/Redo, shadow Recover и portable Save/reopen. Temporary candidates
и imported raster без provenance исключены; Queue prune и Clear Undo history не
удаляют accepted entries. Выбор записи меняет только transient layer selection/
Layers scroll. [Saved-result SQLite index](./engineering/phase-2b-saved-accepted-index-research.md)
теперь заменяет Home и accepted-result metadata одной транзакцией из verified
saved `.igs`; unsaved Add/Undo/shadow Recover и Queue prune не публикуют изменения
в нём. Отказ индекса после committed Save сохраняет `.igs`, прежний целый DB
snapshot и warning; workspace Refresh восстанавливает projection из saved source.
Internal query исключает unhealthy/trashed/foreign-lineage записи. Cross-project
history browser/navigation и public IPC пока отсутствуют, публичный статус не повышается.

### Обещание

Проект ImageGen Studio — переносимый `.igs`-файл пользователя. Приложение явно
показывает несохранённые изменения и помогает восстановить рабочий документ и
завершённые непринятые результаты после сбоя из локального хранилища приложения,
не подменяя сохранённую версию скрытым состоянием.

### Пользовательская выгода

Пользователь знает, где хранится его работа, может перенести проект и отличает
сохранённую версию от текущих изменений и предложенной recovery-копии.

### Явное не-обещание

- Cloud sync, совместное редактирование или замена внешнего backup.
- Абсолютная защита от потерь при повреждении диска либо любого сбоя.
- Перенос незавершённой работы на другую машину до явного Save или непринятых
  результатов вместе с `.igs`: они остаются в локальном staging даже после
  Save и попадают в переносимый проект только после принятия и последующего
  Save.
- Восстановление undo history после restart.
- Встраивание model weights в каждый проект или запуск на другой машине без
  необходимых ресурсов.

### Supporting contract

[Queue Manager](./engineering/phase-2b-queue-manager-research.md) хранит и очищает
operational history отдельно от `.igs`, staging и фактического seed. Retry
проверяет открытый исходный документ, а close ждёт его admission gate.
[Миниатюры Results](./engineering/phase-2b-result-thumbnails-research.md) теперь
хранятся отдельно от authoritative PNG/receipt и `.igs`; повреждение кэша не
препятствует recovery, просмотру полного PNG, export или явному Add.
[Queue result navigation](./engineering/phase-2b-queue-result-preview-research.md)
теперь показывает доступный candidate через свежую проверку document/job/session,
не меняя `.igs`, dirty/Undo или completed seed.
[Frozen Retry during inference](./engineering/phase-2b-busy-retry-research.md)
публикует новый frozen attempt при занятом worker без команд текущему процессу
или второго child; admission сохраняет document/close gate и отдельные `.igs`,
staging и actual seed. Будущий dispatch снова проверяет runtime и ресурсы.

[PP-007 Supporting Contract: Project Document Lifecycle](./features/project/document-lifecycle.md)
определяет Save, dirty state, close guards, shadow autosave и recovery.
[Home](./features/home-screen.md) определяет workspace import, relink и Trash,
а [Data Storage](./specs/03-data-storage.md) — пакет `.igs` и derived indexes.
Переносимость проекта не подразумевает готовый Save As flow или preset export.

[Portable accepted Anima](./engineering/phase-2c-anima-public-generation-research.md) проходит настоящий Add journal/shadow,
Undo/Redo, crash reconciliation, Recover и explicit Save/readIgsPackage/reopen.
Saved-only indexes/history и перенос копии сохраняют native provenance;
непринятые результаты остаются локальными. Package overflow отказывает до
отмены siblings и любых изменений. Seed cursor сохраняет operational ownership
и snapshot только при Save. Старые binaries не читают новые native record kinds.
Полная release qualification и PP-007 остаются незавершёнными.

[Installed Save/import routing](./engineering/phase-2c-installed-runtime-qualification-research.md)
использует app-owned CPU worker отдельно от readiness ML pipeline.
Отсутствующий/непригодный runtime сохраняет документ с обозначенными
placeholder previews. Завершённый Save сохраняет свой успешный исход при
ошибке close; retained child блокирует новые CPU/CUDA процессы до подтверждения
физического выхода. Shutdown ждёт этого подтверждения перед закрытием storage.
Реальные filesystem/SQLite и controlled lifecycle peers проверены отдельно от
финального trained UI прогона. Последний завершил четыре rendered Save/reopen
сценария обеих семей и проверил настоящую соседнюю границу: отсутствие active
runtime pointer → UI Save с placeholder без потери accepted pixels/provenance →
восстановление pointer → Home Rebuild Preview, меняющий только derivatives.
Реальный PNG также импортирован через installed CPU worker, нормализован и
сохранён без изменения прежних слоёв; OS chooser контролируется только для
выбора source file. Это isolated development runtime, без доказательства
signed installer/repair/rollback, качества моделей или fleet compatibility.
Release lifecycle и публичный статус PP-007 остаются открытыми.

[Installed CFG Save/reopen](./engineering/phase-2c-installed-cfg-rescale-research.md)
отдельно подтвердил four-case CFG путь на настоящих `.igs`: captured effective
zero/0.7 и independently edited current draft 0.2 сохраняются как разные данные.
Превью создаёт installed CPU worker; actual package loader и повторное открытие
сохраняют pixels, provenance и draft. Это здоровый development runtime на одном
Linux/NVIDIA host; missing-runtime/rebuild controls принадлежат предыдущему
checkpoint, release lifecycle и PP-007 остаются открытыми.

[Internal outpaint persistence (06.10.2026)](./engineering/phase-2c-outpaint-execution-research.md)
сохраняет независимый source PNG в staging до публикации candidate manifest,
чтобы source-bound contribution verification переживал restart и pruning
terminal queue rows. Add, grouped Undo/Redo и shadow используют прежних owners;
явный Save/readback и перенос `.igs` сохраняют RGBA contribution и immutable
provenance без локального source PNG или LaMa. Изменение source/output
отклоняется при проверке staging; неверный portable output/alpha отклоняется
до замены сохранённого файла. Непринятые candidates,
operational receipts и actual seed остаются локальными; seed snapshot входит в
`.igs` только при Save. Public mixed-alpha Generate/Retry, first-setup LaMa
installation и installed/release qualification остаются открытыми. Counts и
границы evidence находятся в research note; PP-007 не завершён.

[Public selected-VAE opaque IMG](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md) extends the existing prepared owner through actual Generate/Cancel/frozen Retry and explicit Add/Save-reopen. ROOT582 Main/223 Python/196 browser PASS,19 installed checks, exact A/FP32 replay and controlled B pixel influence retain ordinary VAE provenance and existing Regional Guidance exclusions. Current Embedded/FP16 authoring cannot replace frozen A/FP32. This finite evidence does not promote PP-007 or visual/release readiness.

## PP-008: Генерация меняет проект только по явному решению

[Regional outpaint](./engineering/phase-4-regional-guidance-outpaint-research.md): ROOT1175 Main/302 Python PASS,198 distinct browser cases;16 installed checks preserve frozen source/LaMa/seed/.5/.7 through RGBA Results/Add/Save-reopen;10GREEN/2semanticRED with restoration. Readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG DPM++ 2M](./engineering/phase-4-regional-guidance-img2img-dpmpp-2m-research.md): ROOT550 Main/450 Python/194 browser PASS;18 installed checks preserve frozen DPM/Karras/.7 after saved Euler/cleared-schedule/.2 through Add/Save-reopen. Normal/Karras controls qualify15/16 selected steps and exact Karras UI RGBA; defaults/readiness/quality unchanged. Статус остаётся **«Пока не обещать»**.

[Opaque IMG Euler a](./engineering/phase-4-regional-guidance-img2img-euler-ancestral-research.md):
ROOT520 Main/332 Python/192 browser PASS, strict typing/scoped checks/build;
18 installed checks preserve frozen Euler-a/.7 after saved Euler/.2 through
exact control RGB/Add/Undo/Save-reopen. Direct replays preserve SQL/packages,
match UI exactly and demonstrate765,621 changed RGB channels against Euler.
Separate combination capability; no default or visual/full-promise promotion.

[Opaque IMG CFG Rescale](./engineering/phase-4-regional-guidance-img2img-cfg-rescale-research.md):
ROOT 499 Main / 299 Python / 190 browser PASS, strict typing/scoped checks/build;
17 installed checks preserve .7 frozen Retry after saved .2 through exact control
RGB/Add/Undo/Save/reopen. Two direct replays preserve SQL/packages and demonstrate
569,646 changed RGB channels at zero versus .7. Default stays zero; separate
combination capability required. No visual-quality or full-promise promotion.

[Installed regional IMG UI](./engineering/phase-4-regional-guidance-img2img-installed-research.md)
устраняет старый renderer-отказ для opaque Canvas и проверяет фактический режим,
IMG capability и явную strength. ROOT: 100 Main/188 browser PASS, 10 oracle checks;
реальный default RuntimeManager/worker проходит Generate/Cancel/frozen Retry с
точным RGB, Add/Undo/Redo/Save/reopen и сохранением source/обычной IMG provenance.
Это конечный Euler/FP16 срез; качество, Anima, другие image modes и Install/Repair
не квалифицированы. Статус **«Пока не обещать»** и Regional exclusions сохраняются.

[Public regional IMG backend](./engineering/phase-4-regional-guidance-public-img2img-research.md)
добавляет конечный opaque Euler/FP16 path с frozen source/strength и отдельным
worker capability. ROOT:810 Main/200 Python PASS, actual installed backend
четыре admission/три native PNG receipt, canceled-before-dispatch Retry после
сохранённых правок с точным RGB, strength0 без фиктивного progress. Это не UI,
Add/result-Save, quality, runtime-manager lease или release qualification;
Regional provenance exclusions и статус **«Пока не обещать»** сохраняются.

[Character visual check](./engineering/phase-4-regional-guidance-character-visual-research.md)
сохраняет отрицательный результат: семь qualified backend requests, точный RGB
repeat; AI assessment: 1 PASS / 4 FAIL / 1 INCONCLUSIVE на шести originals. Оба ordinary controls
содержат одну фигуру вместо двух, поэтому общий visual gate не пройден. Два
более ранних native-запроса исключены из-за harness path assertion и сохранены
отдельно. Human acceptance pending; production и публичный статус не повышены.
**«Пока не обещать»** сохраняется. Следующие checkpoint-записи исторические.

[Worker-only failure](./engineering/phase-4-regional-guidance-worker-fault-research.md)
подтверждён отдельно:126 lower PASS и14 installed checks. После настоящего шага
завершён только проверенный inference worker; Main остаётся жив, progress очищен,
попытка failed без кандидата. Явный frozen Retry сохраняет исходные параметры и
контрольный PNG; Results/Add/Undo/Save/reopen и прежние данные сохранены. Production
ремонт не потребовался. Качество, Anima и release не повышаются;
**«Пока не обещать»** остаётся. Следующие записи исторические.

[Regional numeric progress](./engineering/phase-4-regional-guidance-progress-research.md)
подтверждён отдельно:477 distinct lower PASS и14 installed checks. Настоящие
5/30 и6/30 видны в Project/Queue; Cancel очищает telemetry до выхода worker-а,
а frozen Retry после сохранённых правок заново проходит1..30 с исходным seed.
PNG совпадает с прежним контролем; Results/Add/Undo/Save/reopen и старые данные
сохранены. Счётчик не меняет durable state, а N/N не означает публикацию.
Качество, Anima, capacity и release Install/Repair не повышаются;
**«Пока не обещать»** остаётся. Следующие checkpoint-записи исторические.

[Linux Main-only ownership](./engineering/phase-4-regional-guidance-main-death-research.md)
подтверждён отдельно:13 checks в трёх реальных Electron lifetimes,407 distinct
lower PASS и три восстановленные mutation sequences. После SIGKILL только Main
Python завершился без тестовой помощи; следующий guarded worker удалил только
подтверждённый transport до Ready. Frozen Retry, Recover, Results,
Raster Add/Undo/Redo и Save/reopen сохраняют прежнюю историю, включая старый
непринятый кандидат. Linux creating-parent-thread/direct-child scope; unmarked
legacy scratch сохраняется. Качество, Anima, capacity и release delivery не
повышаются; **«Пока не обещать»** остаётся. Следующие checkpoint-записи исторические.

[Installed regional recovery](./engineering/phase-4-regional-guidance-installed-recovery-research.md)
подтверждает finite восстановление после двух прерываний owned-scope приложения:
APP_RESTART без автопродолжения, явный frozen Retry после сохранённых правок,
возврат готового кандидата через Recover и явный Add/Undo/Save/reopen.
ROOT: 13 native-r2 checks, 211 lower PASS, typecheck и mutation/control/restoration.
Прежние задания и сохранённые проекты неизменны. Main-only/worker-only orphan
handling, качество и release lifecycle не квалифицированы; **«Пока не обещать»**
сохранено. Следующие записи остаются историческими со своими границами.

[Installed regional continuation](./engineering/phase-4-regional-guidance-installed-research.md)
теперь отдельно подтверждает finite renderer→IPC/default RuntimeManager путь:
30 шагов/1024², Cancel и frozen Retry после сохранённых правок, Results,
явный Raster Add, Undo/Redo и Save/reopen с точными PNG/ZIP bytes. ROOT: восемь
native-r6 checks и 1,019 Main PASS; developer provisioner не является release
Install/Repair. Numeric regional progress, качество, Anima и capacity не
квалифицированы; статус обещания **«Пока не обещать»** сохранён. Следующие
checkpoint-записи остаются историческими со своими границами.

Новый [public regional срез](./engineering/phase-4-regional-guidance-public-invoke-research.md)
подключает finite Current Canvas Generate к temporary Results, exact replacement
confirmation и frozen Retry. Completion/export не принимают результат;
явный Add создаёт Raster через прежний journal/shadow handoff, один Undo и
последующий отдельный Save. Original candidate SHA сохраняется; regional state
не переносится в accepted provenance/Compare/result-derived preset. ROOT evidence: 1,013 distinct affected Main cases, 813 Python PASS,
typecheck/basedpyright PASS, шесть genuine Main recipes и один actual public
trained request через Results, Raster Add, Undo/Redo и explicit Save/reopen.
Runtime lease adapter и mocked renderer не равны installed RuntimeManager /
renderer→IPC qualification. Отрицательные visual
findings сохраняются. PP-008 остаётся **«Пока не обещать»**; ограничения
исторических owners ниже относятся к их собственным checkpoints.

Текущий [Regional Guidance reference-image owner](./engineering/phase-4-regional-guidance-references-research.md)
имеет **source implemented; finite native-r10 PASS; retention/release complete**; preserved baseline содержит
1,331 source members. Это authored Project attachments с optional nonempty
ordered state, one authorized PNG/JPEG/WebP per Add, fresh owned IDs,
canonical PNG/full-frame 128-side WebP/original ICC и явными remove/reorder,
Duplicate/Undo/Save/recovery semantics. Core storage source implemented;
final lower checks и finite native-r10 authoring PASS; release ещё pending. Cancel не должен добавлять record/history;
thumbnail error остаётся локальным UI placeholder. Current Canvas Illustrious
определяет Add; Anima/unknown объясняются, existing refs repairable в любом
семействе, disabled editable и lock refuses.

Enabled-region NEW ordinary/Smart Generate refusal сохраняется; published jobs
и frozen Retry независимы. Этот owner не включает conditioning/inference,
reference weights/adapters, automatic acceptance/Save, provenance,
queue/admission или model-policy expansion и не квалифицирует их.

Root confirms **source implemented; lower-level checks and finite native-r10
qualification PASS**. Final lower checks are **Python 118 PASS**, post-lint
**typecheck-r3 PASS**, **full lint-r2 PASS**, **neighbors-r2: 952 PASS / 57 files /
0 skips**, and **fresh build-r1 PASS**. Later changes were harness-only, each with
syntax/format/scoped ESLint PASS. Earlier typecheck-r2 and neighbors-r1
950/57 preceded the final checks; neighbors-r1 predates the Save fix. The earlier
lint-r1's 196 autofixable ordering/braces errors in 16 changed files are historical,
not the final lint outcome.

The duplicate mutation records **2 GREEN → 1 semantic RED + 1 control GREEN →
2 restored GREEN**; all **1,343 mutation-source members** are restored.
Production **R2 source review is CLEAN** after the P2 Save A/B rebase fix and
external-replacement neighbor. Rebase requires full-document equality to exact
`baseDocument` or exact authorized `saveTarget`. The causal
`SAVED_PROJECT_CHANGED` assertion was unchanged when the explicit
Recover-new-revision test oracle was corrected; `save-rebase-green-r2` passed
both cases.

Final **native-r10: 12/12 PASS in 191.188 s**, script `1f5ac7ce`, with its
**R11 source review CLEAN**. The successful run uses the source-r2 archive
(1,343 members), exact script overlay and build-r1 (33 members). It observes
**882 Main calls, originals exactly once**, and **149 actual CPU children**
across two Electron lifetimes: intentional dirty SIGKILL, then healthy code 0.
Exact Main/dialog/spawn/kill/write restoration completes with zero in-flight
calls and zero page errors; root freshly confirms recorded PID/start identities
absent. Contract R1 is CLEAN source-only; final source/build/version mapping is retained.

Root actually opened **all 10 final screenshots** under `ui-audit`: 1440×900
and 900×620, reference cards, keyboard tooltips and recovered image states.
This bounded self-review found no material new reference-layout defect; it is
not independent review, full WCAG or all-compositor qualification.

Native attempts **1–9 remain FAILED**. Harness source-oracle findings R7/R8
were closed by subsequent code/reviews and successful replay; those failures
do not establish another product bug beyond the corrected Save rebase.

The OS picker result was controlled; the worker was the **actual development
CPU worker**, with no ML/catalog injection. Installed-resource transitions,
packaged-worker behavior, inference and frozen active work are not
native-qualified. Transient target/Smart-preparation outputs have metadata-only
witnesses, without raw replay. Prototype SVG/data URLs remain separate mock
behavior and do not extend this evidence boundary.

Retention **R1–R7 are CLEAN, candidate-only, READ-FINISHED**; contract **R1 is
CLEAN, source-only**. Root freshly verified source/build bytes, physical exits,
exact restoration, dependencies and all-reader completion, then released all
22 exact disposable paths: 2 unit and 20 native payloads. Measured artifact-root
allocation reduction is **216,420,352 bytes** (unit 35,950,592; native 180,469,760).
Compact evidence and external runtime/package dependencies remain protected.
Final source/build/version mapping is retained in the linked checkpoint.
PP-001/007/008 remain
**Пока не обещать**; finite qualification does not promote public readiness.

Prototype SVG/multiple data URLs не заменяют native/storage qualification.
Публичный статус **Пока не обещать** не повышен. Прежние checkpoint records ниже
сохраняют свои исторические scope/evidence.

Текущий [Regional Guidance owned-mask checkpoint](./engineering/phase-4-regional-guidance-masks-research.md)
имеет **source implemented; lower-level checks и finite native-r7 qualification PASS**;
local visuals просмотрены root; retention/release завершены. CPU tools/Transform
Region/Clear, отдельная immutable PNG ownership и Save/shadow/recovery/resources
интегрированы; regional bbox/Fit отсутствуют. Disabled regions редактируются, lock
запрещает запись, selected overlay использует `overlayOpacity`. Captured command
сохраняет revision/epoch guards и защищённое состояние соседей.

Root: **869 Node / 50 files, 0 failures/skips** до lint-only production delta
(focused 89 входят в 869); post-lint typecheck r3/focused r3 **89**, full lint r2
(4 partitions), fresh app build r1 и prototype r2 **182 PASS**; production R2
**CLEAN, source-only**. Final **native-r7: 12 checks PASS, 157.061 s**,
`fullTwelveCheckQualification: true`: Save/read/reopen, dirty-PNG crash/recovery,
all tools/whole-alpha/geometry/history/refusals/namespaces/duplicate controls.
Both lifetimes: 95 handlers restored, in-flight/page errors 0; original IPC exactly
once. Root просмотрел все 6 final screenshots при 1440×900/900×620, включая
quarter-turn/recovered states, без material local finding; bounded self-review,
не full accessibility audit. Source R4/R5 CLEAN, source-only.

Ранние failures остаются failures: specific native5 hash cause не подтверждена;
native6 menu-selector mismatch не является feature RED, native3 restoration gap
сохраняется. Retention audits R1–R4 CLEAN/READ-FINISHED с указанной границей
R2; contract R2 CLEAN source-only. Final harness-scoped lint PASS. Root проверил
exit/restoration/readers и удалил только 15 exact idle paths: освобождено
113,537,024 bytes (108.28 MiB); compact evidence/external dependencies сохранены. Exact script/process/mutation boundaries — в linked research.
Enabled-region NEW Generate refusal сохраняется; conditioning/reference images/
inference вне owner. Статус **Пока не обещать** сохранён.

Завершённый [Regional Guidance prompt authoring](./engineering/phase-4-regional-guidance-prompts-research.md)
реализует durable optional positive/negative blocks и явное global-negative
inheritance. Общий compact PlainPromptEditor использует Current Canvas context,
включая selected Smart, и Main-owned exact embedding verification. Add сохраняет
пустой block, Clear оставляет его, последний Remove удаляет wrapper; inheritance
сохраняет dormant local text/refs, Remove Negative очищает их. Dedicated prompt
API и один document stream группируют live writes/ordered seals с revision/epoch
и lock guards; unpublished input доступен для correction/retry/pending-only
discard, без rebasing после external revision/observed Undo ABA. Metadata APIs и ordinary generation-draft target/change validation
сохранены. Shared seal endpoint дополнительно принимает strict regional
namespaced group IDs; ordinary draft group validation не расширена. Enabled NEW ordinary/Smart refusal, frozen Retry
и опубликованные jobs независимы. Geometry, provenance, presets, operational cursor,
queue/model policy, regional mask pixels/reference images и conditioning не входят в этот owner;
Regional Guidance исключён из accepted provenance и для будущих conditioned results.
**Finite authoring checkpoint и retention/release завершены root.**
795 affected/neighbor Node tests в 41 files, 0 failures/skips, предшествуют
последнему одиночному row ARIA attribute. Финальный row 20c2fb6e: typecheck r7,
later row/script scoped lint и fresh app build r4 PASS; full lint r2 (4 partitions)
и prototype r1 182 shared-consumer browser checks PASS, prototype source не менялся.
Complete production R4, narrow ARIA R5 и final native-source R7 CLEAN — source-only.
Root native-r8/script ff502357: **12/12 PASS, 97.714 s**, healthy final code 0,
две Electron lifetimes с dirty SIGKILL/recovery и healthy close; both observer
restorations true/inFlight0. Actual Save/loader/reopen, dirty recovery и полные
SQL/document/PNG/mask/variant/provenance/neighbor/cursor/policy controls PASS.
Root открыл/просмотрел все 7 screenshots при 1440×900/900×620: material layout
findings нет в scope; bounded self-review, не independent full accessibility audit.
Исторические failed attempts остаются failures в linked root research.
Retention audits 1–4 CLEAN/READ-FINISHED; contract R2 CLEAN source-only. Root
проверил exit/restoration/readers и удалил 18 exact idle paths: освобождено
116,359,168 allocated bytes (110.97 MiB); compact evidence/external dependencies
сохранены. Masks/reference images, conditioning, inference,
installed embedding/autocomplete, active-work/Main-ABA qualification и full promise
не заявлены. Root владеет final retention/release evidence; prototype остаётся
plain textareas/mock masks/references. Статус **Пока не обещать** сохранён.

Завершённый checkpoint [Regional Guidance foundation](./engineering/phase-4-regional-guidance-foundation-research.md)
добавил отдельные пустые durable entities: add/select/rename/enable/lock/overlay
opacity/duplicate/delete, ordinary Undo, explicit Save и local recovery. Optional
поле не материализуется в legacy Project; owned UUIDs и соседи сохраняются.
Каждый enabled region блокирует NEW ordinary/Smart Generate до подготовки и
публикации с явной причиной; disabled regions инертны, уже frozen jobs и Retry
независимы. Root подтверждает **711 Node tests / 33 test files, 0 failures/skips**:
54 focused, 3 actual-preload и 11 generation-guard cases входят в 711.
**182 full prototype browser tests**, typecheck r7, full lint r4 и fresh build r3
PASS; prototype code этот owner не менял. Isolated pre-SQL mutation:
2 GREEN → semantic RED (8 queue rows вместо 4), disabled control GREEN →
2 restored GREEN; все 1,320 source members и shared Queue subject восстановлены.
Final native-r5: **12 checks PASS**, 266.205 s, code 0 после intentional
dirty-shadow crash, recovery и healthy close; actual 1440×900/900×620,
legacy no-op Save/loader/reopen, lifecycle, meaningful Save и exact-neighbor
recovery, post-close protected SQL/package/assets/source bytes проверены root.
Rename focus получил causal RED → same-harness GREEN; финальные source reviews
clean, root просмотрел normal/minimum/recovered и focused-error screenshots.
Native не квалифицирует ML/inference или active-work execution; successful
frozen Retry подтверждён controlled unit tests. Historical failures сохранены.
Retention R1–R4 clean/read-finished; root независимо проверяет exit/restoration/
readers и удаляет только 15 временных каталогов: 104.66 MiB allocated space
освобождено, compact evidence и внешние зависимости сохранены. Prompts/inheritance/references/nonempty masks,
painting/transforms/conditioning и full release остаются вне этого среза;
публичный статус **Пока не обещать** сохранён.

Текущий [accepted Smart variant history срез](./engineering/phase-4-smart-patch-history-research.md)
включает каждый принятый nested variant в Project history и, после явного Save,
Saved generations. UUID принадлежит самому варианту; текущий parent определяется
по containment, а не по историческому target в provenance. Навигация открывает
точную сохранённую строку с меткой **From history**, включая inactive и hidden/locked,
без активации, изменения settings/Undo/dirty state или Save. Pending drafts блокируют
переход; missing/changed current owner сохраняет несохранённую работу. Точные
ресурсы проверяют revision/hash/ownership, а global preview — сохранённый package.
Native R8 проходит 16 проверок на portable accepted fixtures при 1440×900 и 900×620,
включая Save/reopen, dirty-current refusals и переходы между проектами без mutation IPC.
Это не квалификация inference. Smart Compare/Preset остаются вне среза; статус
**Пока не обещать** сохранён. Проверки и границы evidence указаны в research.

Текущий [явный orphan Raster Add](./engineering/phase-4-smart-patch-orphan-raster-research.md)
принимает выбранный готовый contribution в новый Raster при отсутствии исходного
Smart Patch в том же документе. Точные PNG/alpha, frozen bbox и полное Smart
provenance сохраняются без текущей маски, runtime или retargeting. Общий Raster
journal/recovery владеет отменой reviewed target-local заданий, включая новые
Retry-сессии, одним Undo и последующим явным Save. Соседние результаты независимы.
Converted Raster входит в Project/saved history, включая 1px и некратные восьми
world sizes; на этом orphan checkpoint Smart Compare/Preset были явно недоступны.
Последующие preset/Compare срезы описаны отдельно; native Compare qualification в процессе. Native R7 проходит
15 проверок на prepared PNG: меню/подтверждение при 900×620 и 1440×900, Undo/Redo,
crash recovery и Save/reopen. Inference в этот срез не входит. Проверки, исправления
review и границы квалификации перечислены в research. Статус **Пока не обещать**
сохранён; на этом checkpoint native Smart variant history ещё не квалифицирована.
Последующий history checkpoint описан выше; остальные незакрытые flows не объявлены готовыми.

Текущий [frozen Smart Patch Retry срез](./engineering/phase-4-smart-patch-retry-research.md)
добавляет повтор одного reviewed failed/canceled задания с независимой копией
исходных проверенных inputs, конкретными prompt/seed и прежними ресурсами.
Общая admission/очередь сохраняет одного владельца исполнения; original document
и coordinator, CAS и publication receipts проверяются в Main. Retry не меняет
текущий Project, Undo, accepted variants, старые кандидаты или `.igs`; результат
остаётся временным до явного Add. Отсутствующий текущий target остаётся orphaned,
без автоматического retarget/conversion. Статус **Пока не обещать** сохранён; actual checks и
границы collaborators/installed/release перечислены в research.

Текущий [selected Smart Patch freshness срез](./engineering/phase-4-smart-patch-freshness-research.md)
добавляет автоматическую read-only проверку source для выбранного stored Patch
и общий reader браузера вариантов. Проверенный source даёт `Matches current inputs`,
изменённые inputs — `Outdated`, недоступный source — `Unverified`. Диагностика
не меняет `.igs`, dirty, Undo или immutable provenance; Generate/resource readiness
проверяются отдельно. Один App-owned запрос и последний ожидающий owner сохраняют
границу при смене вкладок. Статус **Пока не обещать** сохранён; выполненные проверки
и ограничения указаны в research.

Предыдущий [installed Smart Patch срез](./engineering/phase-4-smart-patch-installed-generation-research.md)
прошёл 27 native checks: десять trained public completions для Illustrious
V-prediction и Anima в TXT/IMG/INP/OUT плюс INP replay каждой семьи при processing
256/world 128, четырёх шагах и seed 123. Все десять явных Add сохраняют точные
world RGBA и immutable provenance через один Undo/Redo, Save и reopen; текущие
Patch inputs, обычный draft и соседние слои сохранены. Два IMG/INP raw RGB
контроля различаются на всех 16,384 pixels; оба INP replay совпадают по whole RGBA.
Generate не принимает результат, Add не выполняет Save.

Реальные Smart steps доходят до видимого счётчика через общую transient telemetry.
Select учитывает существующий busy guard. Исправлен ложный Repair при healthy
worker close: каждый reopened selected Patch предлагает Generate без Repair до
диагностического getStatus. Все 51 installed worker files и final source/bundle/
original/managed hashes сохранены; все 80 observed actors физически завершены.
Неудачные попытки учтены отдельно от успешной матрицы. Reopened stored rows
могут показывать `unverified`: автоматическая source-freshness re-verification
после worker lifecycle этим срезом не квалифицирована. Orphan Raster
conversion, accepted-history navigation, Compare/Preset, arbitrary options,
quality, full Invoke parity и release остаются открытыми. Статус сохраняется
**Пока не обещать**.

Предыдущий [public Smart Patch Generate/Results/Add](./engineering/phase-4-smart-patch-public-generation-research.md)
connects dedicated public IPC, frozen layer-bound planning, one typed dispatch
owner, signed temporary results and reviewed journaled Add as Variants.
Target-scoped replacement preserves sibling Patches and ordinary candidates;
Project Close/recovery presence and teardown include both stores. Public Add
rechecks reviewed owner/revision inside the gate and retains Save's gate/image
lease order. Accepted variants keep immutable provenance and current authoring.
Orphans remain visible/exportable/discardable. That checkpoint records its
executed checks and declared inference collaborators; installed trained evidence
is qualified above. At that public checkpoint, orphan Raster conversion, Retry,
accepted-history navigation, Compare/Preset and release remained open. Full status stays **Пока не обещать**.

Предыдущий [Smart Patch variant lifecycle/status](./engineering/phase-4-smart-patch-variant-lifecycle-research.md)
adds real renderer/Main select, rename and delete for existing accepted variants,
strict document/revision binding, one-step Undo, final removal to the same empty
Patch and retained image bytes through Delete → Save → Undo. The persistent
browser separates current authored/actual-source freshness from resource
availability. Historical copied ownership never rewrites provenance. Unknown
source remains unverified; missing resources do not destroy or block stored
variant edits. At that lifecycle checkpoint, public Generate/Results/Add,
accepted-history navigation, Compare/Preset and installed inference remained open. Complete PP-007/008 status
stays «Пока не обещать». Executed evidence and finite limits belong to the linked
research; prototype mocks are separate.

Предыдущий [Smart Patch durable acceptance](./engineering/phase-4-smart-patch-durable-acceptance-research.md)
Private Main Add now appends verified world candidates to the exact Smart Patch,
preserving old variants and current authoring with one active anchor and one Undo.
A shared Project gate and SQL intent slot serialize Raster/Smart acceptance and
close. Dedicated Smart cancellation drains inference, claim startup, CPU work
and publication; late completions require renewed review. Captured sessions are
checked against foreign targets, documents and ordinary results.

The durable order is intent → asset adoption → synced shadow → atomic session
tombstones/intent removal → staging cleanup. Recovery dispatch selects one owner;
full immutable lineage completes, absence abandons without consuming candidates,
partial/changed lineage or unknown overlap stays fenced. A clean saved package
must pass actual member verification plus file/directory sync before replacing
shadow proof. Replays do not duplicate or reactivate variants. Add never performs
Save or rewrites completed receipts/seed cursor.

At that durable-acceptance checkpoint, public Smart Generate/Results/IPC, variant
lifecycle controls, freshness/resource UI, accepted-history navigation, Compare/Preset
and installed inference qualification remained later owners. PP-007/008 remain
«Пока не обещать». The next finite owner at that checkpoint was variant lifecycle
and current-state diagnostics before public integration.
Executed evidence and finite limits belong to the linked research.

Предыдущий [Smart Patch variant storage/display](./engineering/phase-4-smart-patch-variant-storage-research.md)
The document now owns nonempty Smart Patches: all active and inactive variant
images survive explicit Save, local recovery and Undo/Redo retention. Actual PNG
bytes, canonical sRGB profile, dimensions and immutable contribution alpha are
verified before package or new shadow publication. A metadata-only alpha change
cannot reuse a prior pixel proof. Current layer/mask/variant IDs are unique;
frozen source IDs remain historical when a later copy has new ownership.

Only the active image contributes pixels, at its own frozen world bbox and its
parent's stack position, visibility, opacity and blend mode. Current Patch bbox,
mask, blur and internal-resolution edits do not move, resize or remask stored
RGBA. Main source capture, preview/bounds and the signed renderer image resource
use this projection. The DTO/card reports `stored`, without claiming freshness
or current model availability. Top-level Raster mutation/history selectors stay
separate from this material projection.

This is storage/display support for an already populated document, not the
public acceptance command. Generate/Add, durable acceptance journal and sibling
cancellation/reconciliation, variant lifecycle controls, accepted-history
navigation, Smart Patch Compare/Preset and installed inference qualification
were later owners at that storage/display checkpoint. PP-007/008 remain «Пока не обещать». Executed evidence and
remaining limits belong to the linked research.

Предыдущий [Smart Patch acceptance plan](./engineering/phase-4-smart-patch-acceptance-plan-research.md)
adds strict standalone variant/provenance contracts and a read-only proposal;
the Project schema still accepts only empty Smart Patches. Identity-bound staging
reads consume actual world RGBA and final-mask bytes. The projector checks frozen
context, worker-confirmed seed, exact contribution alpha and inference prediction
type before proposing portable metadata without managed paths or reusable `Size`.
Owned authoring and independently composed current source pixels determine
ready/outdated; unrelated Project revisions and Fit-only padding do not.
This comparison does not qualify current model-registry or runtime availability.

Private `ProjectService.prepareSmartPatchVariantAcceptance` rechecks the exact
Project owner, document/revision, target and reviewed selection around byte reads
and current-source composition. Locked or hidden targets block the proposal;
missing targets remain orphaned. A changed eligible target keeps frozen proposal
metadata and reports outdated inputs. The returned plan is not an accepted result
or a capability to commit later without revalidation.

No Project/history/`.igs` mutation, sibling cancellation, acceptance journal,
staging discard or public UI is connected. Next owners are all-variant asset
storage/validation and active-variant composition, then durable Add/reconciliation,
variant lifecycle and public Generate/Results integration. PP-007/008 remain
«Пока не обещать»; executed evidence and limits belong to the linked research.
Evidence: affected2545 TS PASS, final65 focused+2 actual Main/native controls;
seven isolated causal RED/GREEN pairs, typecheck/lint/build PASS. An initial
bounded diagnostic OOM is excluded and recorded with cleanup in research.

Предыдущий [Private queued Smart Patch execution](./engineering/phase-4-smart-patch-queued-execution-research.md)
connects dedicated SQL claim, exact frozen inference, worker-confirmed uint32 seed,
CPU world composition and independently durable Smart Patch world candidates.
The private `GenerationOrchestrator.createSmartPatchExecution` handle waits for
admission and exposes explicit run/cancel/stop ownership; public drain stays off.
Both family operations share the global running-slot CAS with ordinary jobs;
normal dispatch/readers and Raster acceptance remain separate. One cancellation
owner drains inference, CPU startup/request/readback and publication before
acknowledging cancel or cleaning scratch; unconfirmed exit retains its owner,
slot and files. The private inference capability now also requires
`smart-patch-seed-confirmation`; older installed payloads refuse before ML.

A separate typed store at `recovery/smart-patch-staging` reserves the shared
receipt before fsynced world RGBA/final-mask/manifest publication, then commits
queue+receipt+actual-seed cursor atomically. Exact reload and APP_RESTART recovery
keep independent final alpha and context after terminal queue/input pruning;
USER_CANCELED cannot resurrect a candidate. Shared tombstones hide discarded
sessions across both stores. Normal Results never discovers these candidates,
and the Smart DTO cannot be assigned to the normal Raster DTO.

That checkpoint established a private executable/recoverable path. Public
Generate/Retry/Results, immutable variant acceptance/outdated/orphan handling,
portable provenance and installed GPU/release qualification were subsequent
owners. It introduced no Project/document/`.igs`/history/preset/Compare edits. PP-007/008 public readiness
remains «Пока не обещать»; actual checks and limits belong to the linked research.
Evidence: affected2480 TS/97 Python PASS, final106 focused+2 actual Main/native
cases, five isolated causal RED/GREEN pairs. Typecheck/lint/build/global Python
checks PASS; physical exit, source restoration and own-payload cleanup confirmed.

Предыдущий [Private Smart Patch queue admission](./engineering/phase-4-smart-patch-queue-admission-research.md)
adds real `illustrious-smart-patch` / `anima-smart-patch` pending rows to the common
SQL queue. One independent queue-owned bundle under
`generation-queued-inputs/smart-patch/<UUID>` serves1..32 concrete items;
caller-owned prepared bundles remain independent. Strict DTO and actual-byte
reload bind Project/document/layer, world/internal geometry, exact manifest and
item index. Resource/prediction/noise policy and current unlocked+visible target
are rechecked before atomic SQL insertion. Exact lost-ack readback confirms the
whole batch; unknown outcomes retain files and fence the Project. Cancel and
restart cancel unfinished jobs without replay; terminal pruning reclaims only
an exact verified bundle after its last SQL reference. Unknown/corrupt/incomplete
bundles are retained. Queue metadata understands both families; normal dispatch,
ordinary Retry and normal input readers refuse these jobs before runtime use.
This is private durable admission, not runnable public generation. No candidate,
receipt, actual-seed cursor, variant, Project/`.igs`/provenance/preset/Compare or
public Smart Patch Generate/acceptance UI is introduced; Retry remains explicitly
disabled. Next: dedicated typed dispatch with worker-confirmed
actualSeed, owned inference+CPU cancellation and independently durable world
candidates, then immutable variant acceptance. Public PP-007/008 remain
«Пока не обещать». Verification evidence and limits are in the linked research.

Предыдущий [Private durable inputs](./engineering/phase-4-smart-patch-durable-input-research.md)
добавляет `capture.prepareBatchInput` для1..32 уже concrete items и отдельный
fsynced bundle с source/authored mask/model RGB/latent KEEP/final contribution,
exact family metadata и frozen target context. Transient execution paths не
сохраняются; strict reload проверяет actual bytes/ICC/hash/geometry и связи полей.
Exclusive manifest marker фиксирует полный bundle; uncertain publication
сохраняет owner, explicit discard проверяет exact identity. Это подготовка до SQL
admission, не pending job/candidate/recovery session. Нет cursor/receipt/variant,
Project/`.igs`/UI/provenance/preset/Compare изменений. Dynamic expansion и выбор
Random/Reuse вне concrete boundary. Public Generate и Add as Variants запрещены
для locked **или** hidden target; private read-only подготовка разрешена. Далее —
complete queue/dispatch/staging и immutable acceptance. Public status прежний;
Affected2358 TS PASS (new24 contract/24 FS/16 Main included),four causal semantic RED/GREEN pairs; проверки и ограничения — в linked research.

Предыдущий [Private world output](./engineering/phase-4-smart-patch-world-output-research.md)
добавляет `capture.executeAndCompose`: generated RGB масштабируется BICUBIC до
frozen world bbox, готовая final GENERATE alpha присоединяется без изменений.
Main независимо проверяет actual RGBA/ICC/hash/geometry и точное равенство alpha
замороженной final mask; detached `worldContribution` размещается по
`context.bbox`. Повторного fade, latent-mask reconstruction или source pasteback
нет. Одна drained lease охватывает native inference, CPU composition и readback;
callback failure ждёт admitted work, unconfirmed worker exit сохраняет inputs.
CPU derivatives-only worker 0.1.0 требует `smart-patch-output-composition`; old
payload отказывает до dispatch. Operation stage `0700`, owned scratch base может
сохранять `0775`. Existing `capture.execute` RGB contract не меняется.
Это transient private RGBA, не `GenerationCandidate` или accepted pixels.
Нет durable jobs/queue/batch/candidates/receipts/recovery manifest, variants,
document/history/shadow/`.igs`, provenance/preset/Compare или UI/public Generate
изменений. Далее — durable queue/batch и immutable acceptance. Проверки и
qualification limits зафиксированы в linked research: affected2294 TS/705 Python PASS (new9 Main/4 JSONL/58 Python included),three isolated semantic RED/GREEN pairs; PP-008 остаётся
«Пока не обещать».

Предыдущий [Private Main/worker execution bridge](./engineering/phase-4-smart-patch-execution-bridge-research.md)
связывает owned capture, exact resource admission, сериализованный native worker,
exclusive processing-size RGB и строгий Main readback в одной drained lease.
Caller передаёт один concrete prompt pair и uint32 seed; dynamic expansion,
Random/Reuse resolution и seed-cursor mutation не выполняются. Worker0.14.0
обязан объявить private capability `smart-patch-execution`; installed runtime
автоматически не обновляется. World mode, independent internal resolution и
all255 KEEP сохраняются. При worker process failure/timeout cleanup ждёт physical exit;
неподтверждённый exit сохраняет staging, в том числе после callback failure.
Это transient private RGB, а не candidate/recovery/accepted result: нет durable
batch/queue/receipt, world composition, immutable variants, document/history/
shadow/`.igs`/schema/UI или provenance/preset/Compare изменений. Следующие owners —
world composition, durable queue/batch и immutable acceptance на том checkpoint;
текущий scope выше добавляет private world output. Выполненные
проверки:2281 TS и1541 Python PASS,16 Main execution/lease cases и four semantic RED/GREEN pairs; qualification limits зафиксированы в linked research; статус PP-008
остаётся «Пока не обещать».

Предыдущий [Private family VAE/denoising](./engineering/phase-4-smart-patch-denoising-research.md)
исполняет existing native loops с prepared RGB/numeric latent KEEP и caller-owned
loaded models,возвращая transient numerical results,не staged/accepted pixels.
TXT/IMG ordinary;INP/OUT masked без repeated coherence/LaMa или source
reclassification. All255 KEEP сохраняет frozen world mode и всё равно выполняет
VAE+denoising с полностью защищёнными source latents. Результат — VAE
reconstruction,не новая detail для потерянной tiny edit;нет refusal/fallback или
fabricated coverage. Focused72 Python PASS:65 real tiny native cases плюс семь
actual CPU protocol preparation→adapter cases;шесть solvers/family,Illustrious
EPS/V,prepared INP world128/internal64/Euler для обоих семейств. Это random small
CPU-native evidence,не trained/installed/GPU/full Invoke pixel parity. Нет Main
transport/public worker command,queue/publication,world compositing,candidates/
variants,provenance/preset/Compare/schema/UI/public Generate на том numerical
checkpoint. последующий bridge checkpoint добавляет Main/worker execution и resource
admission; later world-output checkpoint добавляет private composition. Immutable
acceptance остаётся отдельным owner.
Prototype mocks не меняются. Full checks/mutations фиксируются
отдельно в research;статус PP-008 остаётся «Пока не обещать».

Предыдущий [Private model-source/LaMa preparation](./engineering/phase-4-smart-patch-model-source-research.md)
добавляет actual Main→worker temporary RGB после шести conditioning planes,не
generated candidate или accepted pixels. TXT null,IMG/INP exact RGB без LaMa;
OUT вызывает trained LaMa с binary holes только из processing source alpha<255,
включая resized0/255 без silent mode fallback. Полный RGB не вставляется в Project
и не смешивается обратно с source. Normal OUT strict admission остаётся прежним.
Affected1937 TS/527 Python (focused65/68),two real Main trained-source cases с unchanged storage/
source,four exact wholeRGB comparisons к pinned Invoke и three semantic RED/GREEN
pairs квалифицируют finite boundary. Global lint/typecheck/build и worker
Ruff/basedpyright PASS;ограничения записаны в research note. Family diffusion/VAE/denoising,public
Generate/jobs/candidates/accepted variants/provenance,preset/Compare/schema/UI
не включаются;prototype acceptance/staleness mocks не меняются. Текущий private
adapter выше определяет all255 latent-coverage behavior;execution bridge и
immutable variant lifecycle остаются отдельными owners;PP-008 status прежний.

[Owned coherence settings](./engineering/phase-4-smart-patch-coherence-settings-research.md)
фиксирует compositing profile у слоя и default private capture,не создавая result.
Captured one-change/one-Undo сохраняет authored mask/bbox/internal/source owners;
later edits не подменяют frozen inputs. Evidence: affected1927 TS/prototype180/native14,three semantic RED/GREEN,typecheck/lint/build PASS;queue/candidates/
accepted variants/provenance/public Generate не включаются,public status прежний.

[Private processing-space coherence](./engineering/phase-4-smart-patch-coherence-research.md)
задаёт numerical WORLD keep-before-resize,processing-pixel Gaussian/Box/Staged
coherence и восстановление WORLD edit core перед owned WORLD blur. Profile
caller-owned/frozen,не новая persisted control. Affected1905 TS/268 Python PASS;
36 pinned Invoke comparisons и четыре isolated semantic RED/GREEN pairs.
Latent loss report не меняет world mode и не повышает inference readiness;
public Generate/jobs/candidates/accepted variants остаются закрытыми.

[Private world contribution fade](./engineering/phase-4-smart-patch-contribution-fade-research.md)
задаёт full/binary output core при сохранении soft conditioning inputs:TXT/IMG
whole bbox,INP authored clipped coverage,OUT authored/source-alpha union. Frozen
project-pixel blur добавляет external Invoke distance/curve,без padding и silent
retargeting. Affected1888 TS/203 Python PASS,three semantic RED/neighbor GREEN и
required checks PASS,physical exit/temporary-copy cleanup confirmed.
Pre-coherence geometry не включает
public Generate/jobs/candidates/accepted variants и не повышает PP-008 status.

[Private effective-mask/internal-size preparation](./engineering/phase-4-smart-patch-mask-preparation-research.md)
добавляет world-derived mode и three grouped derived inputs, сохраняя
original inputs и drained callback lease. Final focused33 TS/Python24 и three
isolated semantic RED/neighbor GREEN pairs,affected1871 TS/125 Python PASS; required
typecheck/lint/build PASS, physical exit/temporary-copy cleanup confirmed;
public Generate/jobs/candidates/provenance/accepted variants не включаются.
Strict all255 source и any-nonzero soft-mask coverage явно отличаются от Invoke;
full mode/pixel parity не заявлена. На preparation checkpoint blur/fade/coherence
были следующими owners; последующие contribution/coherence checkpoints выше
квалифицируют world geometry,processing-space coherence и projected world fade.
ML admission и masked inference остаются открытыми. PP-008 status не повышается.

[Private Main/CPU Smart Patch input capture](./engineering/phase-4-smart-patch-generation-capture-research.md)
не публикует jobs/candidates/accepted variants и не включает Patch Generate.
Первый capture сохраняет whole mask и source RGBA/source alpha; clipped mask,
four-mode classification и internal-size preparation были следующими owners и
квалифицированы последующим private preparation checkpoint выше. Numerical latent
conditioning квалифицировано последующим coherence checkpoint;ML admission и
masked inference остаются открытыми.
Для будущего pipeline null/disjoint masks используют source-only mode; explicit Add в
still-existing changed target сохраняет frozen result/context и выводит `outdated`,
а не подменяет inputs. Missing target остаётся orphaned. Focused14/affected1852
PASS, четыре actual CPU tests/nine production calls, три isolated semantic
RED/neighbor GREEN и typecheck PASS квалифицируют только private capture;
lint/build PASS; cleanup confirmed. Public status и negative scope сохраняются.

Текущий [Owned mask settings](./engineering/phase-4-smart-patch-mask-settings-research.md)
подключает два compact controls в Mask: Mask blur16px/BBox padding8px. Один
captured Enter/blur — один targeted scalar Undo; no-op/invalid/owner cancellation
не публикуют settings. Setting edit не двигает bbox автоматически и не запекает
blur в painted PNG, не повышает mask revision и не создаёт accepted result.
Явный Fit читает owned значения и сохраняет outward grid8. Будущий inpaint должен
freeze/consume этот blur, сохраняя исходную маску; worker pipeline не заявлен
готовым. Impacted regression1835 до final UI refinement, final affected104/native109,
three semantic RED/GREEN и required checks PASS квалифицируют этот settings/Fit
срез; chronology/source/exit proof — в checkpoint. Остальные owners/statuses неизменны.

Предыдущий [Transform/Fit implementation](./engineering/phase-4-smart-patch-mask-transform-research.md)
сохраняет explicit publication boundary: drag/resize/rotate меняют только local
preview; один Apply/Enter публикует один captured Main edit и один Undo.
Cancel/Escape, смена owner/revision/camera/busy/focus и no-op не публикуют маску.
Main-baked PNG не меняет Raster pixels, bbox, internal resolution или draft;
На том checkpoint Fit менял только selected owned bbox с fixed 24px margin/outward
grid8 и не повышал mask revision; нынешние owned defaults16/8 дают тот же запас.
Transform/fit не создают accepted result/provenance.
Исходные PNG bytes сохраняются при неизменных dimensions/alpha; прочие transforms
используют явную CPU interpolation policy, без Invoke pixel-parity claim.
Regression1820 PASS до final terminal snapping, final affected59/native57,
three semantic RED/GREEN и required checks PASS; chronology/limits — в checkpoint. На этом Transform/Fit checkpoint Smart Patch
inpaint/generation, accepted variants/staleness/compositing/comparison,
Regional Guidance и Patch preset source/target оставались открытыми; позднейший
[finite Smart-target Apply](./engineering/phase-4-smart-patch-preset-apply-research.md)
имеет отдельное evidence. Публичный статус «Пока не обещать» сохранён.

Предыдущий [Smart Patch owned mask authoring](./engineering/phase-4-smart-patch-mask-authoring-research.md)
добавляет реальные layer-owned mask pixels без публикации generated Raster или
accepted variants. Brush/Eraser/Lasso/Polygon и Clear проходят captured identity/
revision guards → Main CPU rasterizer → один document/history commit. Stale,
locked/hidden, malformed или слишком большой gesture отклоняется до commit;
no-op не повышает mask revision и не добавляет Undo step. Pixels не клиппируются
по bbox и не превращаются в Project composite/preview или immutable provenance.
Маска хранится как white RGBA8 с alpha coverage; UI thumbnail использует тот же
stored asset, без отдельного preview worker. Engineering limits: 4 000 000 pixels,
4096 по каждой оси, PNG 32 MiB/256 IDAT chunks, 8192 points и 32 000 000 candidate
pixel visits. Ограничение chunks закрывает allocation overhead при малом bitmap;
текущий encoder пишет один IDAT.
Восемь реальных Service tests, полный regression 3751 PASS, affected 176 PASS и
native 33 named checks PASS подтвердили owner-specific pixels, cancellation,
Overlay/Clear, history, Save/reopen, corrupted Import refusal и actual crash
recovery. Five semantic RED/neighbor GREEN pairs с exact restoration и
typecheck/lint/build PASS; полный suite до дополнительного IDAT guard, affected
run после него. Его evidence не включал Transform/Fit; текущая реализация
описана выше. На этом mask-authoring checkpoint Smart Patch inpaint/generation,
acceptance as variants, staleness, Regional Guidance и Patch preset Apply ещё не
были подключены. Позднейший finite Smart-target Apply имеет отдельный checkpoint
по ссылке выше. Публичный статус
«Пока не обещать» сохранён.

Предыдущий [Smart Patch document foundation](./engineering/phase-4-smart-patch-foundation-research.md)
сохраняет границу explicit acceptance: пустой Patch не содержит accepted variants,
не создаёт image assets, pixels или accepted-history entries. Generate для такого
Patch явно недоступен, без ordinary Project fallback. Реальный ordinary Raster
Add сохраняет owned mask/draft и normal Project inputs; accepted Raster bytes и
immutable provenance переживают Save/reopen вместе с Patch. Final native-race-green
завершил 17 named checks на двух размерах окна, включая selection, Undo/Redo, Save/reopen
и local crash recovery с независимым чтением document. На момент foundation
painting/inpaint, `Add N as Variants`, staleness, Regional Guidance и preset Apply
на Patch оставались открытыми; этот срез не квалифицирует Smart Patch ML-generation. Публичный статус
«Пока не обещать» сохранён.

Текущий [NoobAI Karras refusal](engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». Следующий implementation item — local thumbnails/previews installed resources. Сведения о прежних checkpoints и их «следующем gate» ниже исторические; исходный lost traceback не восстановлен.

Текущий подтверждённый [Anima image cap32/prefix](engineering/phase-2c-anima-image-batch-cap-research.md): Euler256 IMG/normal mixed-alpha OUT:76 admissions/completions/accepted layers,4 Save-reopen packages,12 собственных wholeRGBA prefix matches. Два confirmed33 refusals сохраняют32 временных результата и исходный слой без новых jobs/receipts. Independent raw readback PASS85373;4 cursor/Save snapshots7/5,11 прежних SQL tables и43 worker identities сохранены;2 OUT previews/111104 protected source pixels. Только N3/CFG4/strength0.5/Myth−0.5/exact resources; quality/Invoke parity/fullMVP/release не заявлены. Следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. Статус promise остаётся «Пока не обещать».

Предыдущий подтверждённый [Anima image MAX→0](engineering/phase-2c-anima-image-seed-wrap-research.md): Euler256 IMG/normal mixed-alpha OUT: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 own MAX/0 wholeRGBA matches и 2 same-prompt contrasts. Independent raw readback PASS (18700 checks), 6 cursor/Save snapshots, 11 old SQL tables и 43 worker identities сохранены; 3 OUT previews / 166656 protected source pixels. Actual Main modulo fault: 18 executions, 2 RED / 16 GREEN; restored и guarded-cleaned 584 files. Portable provenance сохраняет raw weighted text, actual seed и resource/source context; compiled/step/posterior проверены отдельно в frozen worker inputs. Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader inputs/quality/Invoke parity/fullMVP/release остаются открытыми.

Предыдущий подтверждённый [Installed Anima image Random → Fixed](engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.

[Production candidate export checkpoint](./features/project/generate-mode/generation-results.md#production-candidate-image-export-checkpoint) и [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md) описывают отдельные staging/export и multi-Add history boundaries.

Предыдущий подтверждённый [Installed Anima image per-prompt](engineering/phase-2c-anima-image-per-prompt-research.md): Euler × common-source IMG/normal mixed-alpha OUT:80 admissions/completions/accepted layers,4 Save/reopen packages и16 own same-input wholeRGBA per-prompt controls. В каждом режиме genuine numeric-control4pairs×8/Fixed0/per-iteration сравнивается с4pairs×2/Fixed0/per-prompt по seeds0…7; control slots0,1,10,11,20,21,30,31. Independent raw readback PASS23682:80 owning comparisons,4 cursor/Save snapshots7,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. Full frozen DTO сохраняется; только owner IDs и предварительно проверенный seedBehavior исключены из matching. Concrete raw weighted prompts остаются portable; templates/maxPrompts/compiled arrays — вне provenance. 98 focused tests PASS0skip;18 actual Main source executions дают2 semantic RED/16 GREEN. 64 within-pair seed contrasts, без scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; cap32-refusal/Random/Reuse/wrap/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md): Euler × common-source IMG/normal mixed-alpha OUT:20 admissions/completions/accepted layers,4 Save/reopen packages и4 own same-input wholeRGBA prefix controls. Четыре weighted positive×negative пары × две iterations; Fixed0/per-iteration seeds0/1, full authored templates и selected first-pair prefix. Полные compiled strings/spans остаются в frozen worker inputs; portable provenance содержит concrete raw weighted prompts без compiled arrays/templates/maxPrompts. Independent raw readback PASS18128:20 owning comparisons,4 cursor/Save snapshots1,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. 75 focused tests PASS0skip;18 actual Main source executions дают4 semantic RED/14 GREEN. 34 visible joint-input contrasts не доказывают scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image dynamic embedding subsets](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md): EPS/V × common-source IMG/normal mixed-alpha OUT:24 admissions/completions/accepted layers,8 Save/reopen packages и8 own same-input wholeRGBA prefix controls. Fixed0/per-iteration baseline4/prefix2 сохраняют full authored refs и effective signed native/portable subsets; ordinary wire omits embeddings. Independent raw readback PASS18641:24 owning comparisons,8 cursor/Save snapshots0,11 old tables,43 worker identities и4 OUT previews/222208 protected source pixels. 118 focused tests PASS0skip;48 actual Main source executions дают16 semantic RED/32 GREEN. 28 visible input contrasts не доказывают embedding-only causality; новых installed-worker mutations нет. Только256×256/Normal N3/exact resources; quality/fullMVP/release не заявлены. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён отдельным20/4/4 gate. Последующий [Anima Fixed/per-prompt image80/4/16 gate](engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. PP-004/005/007/008 остаются «Пока не обещать».

Предшествующий подтверждённый [Installed image cap32 and selected prefix](./engineering/phase-2c-illustrious-image-batch-cap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 152 qualified admissions/completions/accepted saved layers,8 Save/reopen packages,24 own same-input wholeRGBA prefix controls. Четыре genuine confirmed33 UI refusals сохранили все32 temporary candidates и source1 без новых jobs. Independent raw readback PASS (104613 checks):152 configurations/comparisons,8 cursor/Save snapshots, 11 old tables и43 worker identities сохранены;34 source keys/five bundles bound. Historical Main:16 semantic RED/84 GREEN in100 executions; fresh deadline DI:4 RED/371 GREEN in375 executions; обе536-source copies exact-restored and guarded-cleaned,preexecution261 focused tests PASS0skip. R2 boundary2700s/prefix1800s при прежних12+2GiB/14GiB/zero-swap/1600s completion poll. R0 timeout сохраняет32 actual accepted layers/one actual package/zero qualified stages; raw across attempts184, qualified counts exclude R0. Native seeds0…7 — только256×256/Normal N3/four pairs×8 boundary иfirst3pairs×2 prefix; MAX cross-pair wrap/Anima image/installed mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](./engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](./engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles через explicit
Add/Save/readback/reopen/comparison: exact crossed trained/zero refs, один literal
на sign,256×256/три steps/seed0, LoRA−0.5 и native external VAE/FP32.
Completion остаётся temporary до Add. Три успешных native oracles проверили12
direct hidden/pooled/handoff assignments до denoising, без новых jobs/receipts.
Installed EPS sign-swap завершил два finite UI cycles до causal directional RED,
сохранив unequal pixels; restored43/original inode/mode/mtime/bytes/backup absence
и physical exit подтверждены, fresh EPS pair2 GREEN. Final evidence связывает
все8 saved packages/Pillow pixels с SQLite completed rows/receipt bytes, exact
signed refs/settings и frozen0/current draft37. Mutant pixels равны противоположным
normal choices, fresh — своим; catalog5/9 сохранён, новых managed files нет.
Multiple-LoRA order, Anima0.14, dynamic, arbitrary formats/quality/Invoke parity,
public delivery/release и полный MVP открыты. Прежние counts, negative scope и
статус «Пока не обещать» сохранены.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
завершил 36 normal admissions/completions и два отдельных lifecycle с четырьмя
admissions, двумя Cancel, шестью preserving missing-component refusals и двумя
completed restored Retry. Completion остаётся temporary до explicit Add;
package меняется через Save. Refusal не добавляет queue/candidate/receipt/seed
effects и сохраняет durable owners после реальных current draft37 edits;
restored Retry выполняет frozen seed0. `MODEL_FILE_MISSING/CORRUPT` используют
фиксированное neutral resource сообщение; шесть causal public-controller RED
на actual missing/same-size-corrupt managed files отделены от installed
missing-only lifecycle. Installed EPS-txt2img semantic mutations и fresh
restored normal run проверены отдельно: четыре mutations (ignored VAE,
validated LoRA omitted before application, positive-only и negative-only
embedding masking) дали causal pixel RED после шести finite
Generate/Add/Save/readback/reopen cases каждая. Исходник восстановлен между
прогонами; fresh restored EPS-txt2img normal прошёл шесть finite cycles с native
physical exit. Все 43 worker source files byte-exact восстановлены, Main/worker idle.
Bounded polarity follow-up описан выше; multiple-adapter order, Anima worker0.14,
dynamic batches и release остаются открытыми. Статус «Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
завершил 8 finite EPS/V TXT/strength0.5 IMG cases через реальный Generate и
explicit Add/Save/readback/reopen/comparison. Completion остаётся temporary;
current draft37 не заменяет frozen0 или exact VAE в accepted record. Installed
EPS-img2img encode-zero mutant дал intended pixel RED после двух full finite
cycles, а не setup/non-finite refusal. Source restored43 с physical exit и
original inode/mode/mtime подтверждён; fresh restored pair прошла два finite GREEN cycles с physical exit.
Outpaint encoder не проверялся этим TXT/IMG срезом. All-layer/formats/quality/Invoke parity,
arbitrary multiple-LoRA combinations/order, Anima worker0.14, dynamic и release остаются открытыми.
Статус «Пока не обещать» сохранён.

Отдельный [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
прошёл четыре finite EPS/V normal OUT Generate cycles в четырёх admissions,
без Cancel/refusals, при256×256/трёх requested steps/FP32/seed0/strength0.5
и двух effective native denoising evaluations. Completion остаётся temporary до
explicit Add; Save/readback/reopen/comparison сохраняют exact frozen refs и pixels
при current draft37. Две matched пары имеют одинаковую contribution alpha,
сохраняют protected source и меняют visible generated/saved merged RGB на
соответствующих координатах. Catalog5/9 сохранён без новых managed files;
physical exit обоих native runs подтверждён. Installed EPS-OUT encode-zero mutant
дал intended visible-RGB RED после двух finite cycles; physical exit/restored43/
original inode/mode/mtime подтверждены. Fresh restored pair прошла два finite
GREEN cycles с physical exit и exact original EPS RGBA/merged pixels. Final8 OUT
cycles (4 normal +2 finite mutation cycles до causal RED +2 fresh GREEN) связаны
с actual SQLite completed rows/receipt bytes и CPU control descriptors всех
frozen VAE refs; independent Pillow saved `.igs` decode проверяет alpha/protected
source/corresponding visible/merged pixels. Main/worker/nativeData idle; restored43
с original inode/mode/mtime/bytes и отсутствие backup подтверждены. Прежние
8 normal +2 mutation +2 fresh TXT/IMG counts не меняются.
Bounded polarity follow-up описан выше; arbitrary multiple-LoRA combinations/order, Anima worker0.14, dynamic, all-layer/formats,
quality/Invoke parity, public delivery и release открыты. Статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Три component incompatibility codes имеют фиксированные безопасные Generate/Retry сообщения без arbitrary resolver paths. Controlled healthy/refused/restored tests подтверждают отсутствие новых rows/candidates/receipts/seed effects при refusal и сохранность existing owners; completion остаётся temporary. Четыре isolated source/controller semantic mutations краснят нужные assertions и восстановлены; это отдельное evidence от последующих четырёх installed EPS-txt2img numerical REDs, описанных выше. Trained combinations оставались открытыми на этом source/Prepare checkpoint и проверены bounded срезом выше. Anima/new-worker regression, dynamic batches и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
завершён GREEN: четыре finite completions — два txt2img source preconditions и два
completed frozen outpaint Retry; шесть admissions включают два отменённых originals.
Шесть preserving policy refusals не добавляют durable effects; восстановление
профиля разрешает прежний Retry с frozen source/seed0/strength0.5 несмотря на
current draft edits. Completion остаётся temporary до Add; saved `.igs` меняется
через Save. Component combinations оставались открытыми на этом checkpoint;
последующий bounded срез описан выше. Independent component gates, new-worker Anima regression, dynamic batches,
authored masks/Regional Guidance/Smart Patch и release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
подтверждает temporary completion до явного Add, actual Cancel без нового
candidate/receipt/actual seed и три preserving frozen Retry refusals. Успешный
отдельный lifecycle report имеет четыре finite completions/пять admissions/одну
отмену/три отказа; два author-parameter completions сохранены отдельно. Пять
matched trained controls завершили свои assertions в partial report, который
затем упал на oracle-launcher setup; он не объявлен full bounded GREEN. Installed
CPU numerical mutations и restored startup/exit описаны отдельно от trained GPU
controls. Dynamic batches, NoobAI outpaint/component matrix и release остаются
открытыми; статус «Пока не обещать» сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий v-prediction срез (07.10.2026): [Installed Illustrious v-prediction qualification](./engineering/phase-2c-installed-v-prediction-research.md)
подтверждает четыре finite completions в пяти admissions, один retained canceled
original и один public Retry refusal после смены library type на `epsilon`.
Отказ не создаёт row/candidate/receipt, не продвигает actual seed и сохраняет
Project/source/staging/сохранённый `.igs`. После настоящего UI восстановления
`v_prediction` успешный Retry использует исходные frozen inputs/target; completion
остаётся временным до явного Add. Save/readback/reopen сохраняют accepted
prediction и исходные imported pixels; comparison отличает его от текущего
opposite library type. Отдельный production IPC replay подтвердил исправленное
объяснение `GENERATION_INPUT_CHANGED` для checkpoint или prediction type,
сохранение queue/results/Project/package и physical exit без новой inference
completion. Bounded installed evidence использует 256×256/три шага/seed `0`/
Euler a/Embedded FP32/LoRA −0.5 и img2img strength 0.5. Dynamic multi-job batches,
actual seed cursor/crash-reopen `Reuse`, полный author recipe, quality и release
остаются открытыми; PP-008 сохраняет «Пока не обещать».

Текущий embedding срез (07.10.2026): [Installed Illustrious embedding qualification](./engineering/phase-2c-installed-embeddings-research.md)
подтверждает восемь finite completions в девяти real admissions. Один original
остаётся canceled без completion receipt/candidate/seed advance; после настоящей
смены library Default на artificial zero control и удаления обоих current
literal refs public Retry сохраняет original trained IllustriousPhoto
prompts/refs/target/seed `0`/Embedded FP32. Completion остаётся временным до
явного Add. Save/readback/reopen/comparison сохраняют accepted portable identity,
исходные imported pixels и отличие от live empty refs. Positive/negative
txt2img causal pairs и weighted/repeated common-source img2img при strength 0.5
меняют pixels только при смене trained/control weights. Это installed worker
0.12.0 development evidence при 256×256/трёх requested steps/LoRA −0.5; prior
catalog/source bytes сохранены. Live CivitAI install, dynamic batches,
Anima/presets, arbitrary formats/quality и signed release остаются отдельными
gaps; публичный статус PP-008 не повышен.

Текущий внешний VAE срез (07.10.2026): [Installed external VAE qualification](./engineering/phase-2c-installed-external-vae-research.md)
подтверждает восемь finite completions и девять настоящих admissions: один
original остаётся canceled без receipt/candidate/seed advance. После смены
Default и Reset public Retry сохраняет original native VAE/target/prompt/seed/
FP32, не следует текущему Embedded. Completion требует прежнего явного Add;
исходные imported layers и recorded portable metadata сохраняются через Save/
reopen/comparison. Это bounded installed development evidence при 256×256,
трёх requested steps, img2img strength 0, без CivitAI/release/whole-MVP claims.

Текущий precision срез (07.10.2026): [Installed VAE precision qualification](./engineering/phase-2c-installed-vae-precision-research.md)
подтверждает 6 finite completions и 0 точных non-finite refusals в
шести installed Illustrious policy/mode случаях. Refusal имеет Main-owned
`GENERATION_VAE_NON_FINITE` и понятное объяснение, не публикует PNG/candidate,
не меняет source layers, receipts, actual seed или сохранённый `.igs`.
Actual Cancel сохраняет canceled original; Retry использует frozen FP32
после правки текущего draft на FP16. Completion требует прежнего явного
Add/Save. Это bounded development evidence при 256×256/трёх шагах,
не внешний VAE, release lifecycle или весь MVP; статус «Пока не обещать».
GPU отказ в этом fixture не наблюдался; путь ошибки отдельно проверен controlled JSONL → actual Main/SQLite.

Текущий outpaint срез (07.10.2026): [public Generate/frozen Retry](./engineering/phase-2c-public-outpaint-research.md)
подключены для обеих семей при qualified worker 0.12.0 и exact local LaMa.
Installed development Electron завершил шесть trained cases при 256×256/трёх
шагах: у каждой семьи normal source, mixed-alpha Generate и frozen Retry после
actual Cancel. Explicit Add/Save/reopen и outpaint comparison сохраняют source
layers, exact contribution alpha и portable provenance без local paths.
Статус обещания остаётся «Пока не обещать»; setup/release и прочие MVP gaps
перечислены в research note. Последующие описания прежних checkpoints
сохраняют исторические границы evidence, а не отменяют этот более новый срез.

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как полностью готовый flow.
[Results recovery view](./engineering/phase-2b-results-recovery-ui.md) и
[Save Candidate Image](./engineering/phase-2b-candidate-image-export.md)
позволяют просмотреть и отдельно сохранить проверенный временный PNG.
[Явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md) теперь
добавляет выбранные завершённые результаты в Project одной document-операцией,
сохраняет recovery shadow до удаления staging и оставляет основной `.igs`
неизменным до Save. Перед удалением невыбранных результатов показывает их число
и требует подтверждения; устаревший набор результатов отклоняется. После
crash/reopen принятое изображение и provenance
восстанавливаются. У результата от другого документа при том же пути Add
недоступен, но preview/export остаются.

[Ранний Add](./engineering/phase-2b-early-raster-acceptance.md) показывает число
незавершённых sibling jobs и невыбранных candidates, подтверждает оба точных
набора и ждёт выхода worker перед принятием. Новое завершение во время отмены
требует повторного подтверждения и остаётся в recovery; другие сессии, Projects
и документы при том же пути не отменяются. После успешного Add admission может
возобновиться; неподтверждённый выход worker сохраняет fence до явного retry.
[Внутренний `enqueueBatch`](./engineering/phase-2b-batch-grouping-research.md)
теперь принимает ordered list уже qualified concrete Illustrious jobs одного
frozen snapshot и создаёт общий batch/session. Все input files синхронизируются
до единой SQLite-транзакции; capacity и отсутствие ранее использованной сессии
проверяются до публикации. 64 candidates, 128 KiB payload и 8 MiB escaped manifest
— существующие storage ceilings, а не измеренный пользовательский batch cap.
Integration test создаёт shared membership через этот entry point, завершает
один job, принимает его с отменой siblings и сохраняет в `.igs`.
[Prepared batch planning](./engineering/phase-2b-batch-planning-research.md)
теперь раскрывает concrete prompt pairs от одной frozen preparation, сохраняет
порядок и uint32 seed schedule, проверяет каждый varied request и возвращает
явную информацию о `maxPrompts` truncation. Fixed/Random/Reuse база уже разрешена
Prepare; один Random выбор и completed Reuse seed `0` проверены отдельно.
Выбранный seed behavior переносится в immutable provenance через Add/Save;
legacy results без этого поля остаются unspecified. Persistent-storage harness
выполнил 47 matrix cases и 4 targeted cases: 46 completed, 5 ожидаемых preflight
refusals, 0 errors. Начальный prepared-batch cap — 32 jobs с независимым byte
preflight; это замер на одном Linux-компьютере без GPU inference.
[Production dynamic preview](./engineering/phase-2b-dynamic-preview-research.md)
теперь открывается из обеих prompt toolbar, использует тот же cap32 planner
с одной iteration и показывает ошибки/явное truncation. Настройки принадлежат
draft и сохраняются через Undo/shadow/Save; открытие preview не запускает jobs
и не выбирает фактический seed. Native Save/reopen проверен; сам preview не доказывает model/transport qualification. Пользовательский Generate подключается отдельным checkpoint ниже.
[Qualified target transport](./engineering/phase-2b-inference-target-composition.md)
добавляет подготовку Canvas к тому же inference child и общему target verifier.
Composition/generation имеют одного serial владельца, ID/type correlation и
confirmed close; повреждённые PNG/ICC/rect/mode не принимаются. Transport tests
запускают настоящий child с подставным peer, Python tests — реальный compositor;
это не новый GPU smoke и не release installer.
[Production Generate actions](./engineering/phase-2b-generate-actions-research.md) теперь подключают fixed bar/images-per-click к frozen batch и автоматическому serial drain. Queue badge/panel показывают actual pending/running rows; current Cancel проверяет document/job ID и ждёт worker exit. Keep/Escape отменяет Generate. Exact Discard+Generate сначала публикует новый batch, затем очищает только подтверждённые старые сессии; known queue отказ сохраняет PNG, uncertain cleanup отменяет новые jobs и удерживает fence. Generate не принимает результат и не меняет `.igs`.
Полный контракт ещё не выполнен: Smart Patch variants и полный pipeline не подключены; runtime installer отсутствует; busy Generate подключён отдельным checkpoint ниже.
`enqueueOne` и Retry продолжают создавать независимые сессии.
Принятие нескольких Raster результатов можно отменить и повторить одним Project
Undo/Redo без возврата временного staging.
[Acceptance journal](./engineering/phase-2b-acceptance-journal-research.md) сохраняет
точный набор сессий перед Add. После сбоя cleanup требует подтверждённого
immutable layer/asset/provenance и synced shadow или проверенного `.igs`,
затем фиксирует tombstones исходных выбранных и невыбранных сессий и завершение
журнала одной SQLite-транзакцией; файлы очищаются после неё. Более новые сессии
и другой документ по тому же пути сохраняются. Без доказанного принятия кандидаты не удаляются;
старые операции без journal остаются под консервативным recovery-правилом.
Generate IPC подключён в указанном узком срезе; release inference pipeline остаётся открытым.
[Queue history lifecycle](./engineering/phase-2b-queue-history-research.md) добавляет
внутренний frozen retry и очистку terminal jobs без удаления completed candidates;
[Queue Manager actions](./engineering/phase-2b-queue-manager-research.md) теперь
подключают global history, reviewed Cancel, frozen Retry с проверкой текущего
document identity и confirmed terminal Delete/Clear. Очистка сохраняет candidate
PNG/manifest и actual-seed cursor; GPU/release pipeline ещё открыты. [Denoising progress](./engineering/phase-2b-generation-progress-research.md) подключён отдельными typed events: реальные шаги worker видны в Project и Queue Manager, счётчик не меняет durable state и очищается при Cancel/settlement.
[Миниатюры Results](./engineering/phase-2b-result-thumbnails-research.md) создаются
тем же inference child и передаются через проверенный подписанный WEBP cache.
Отсутствующий или повреждённый кэш даёт плейсхолдер; full PNG, recovery/export,
selection/Add, seed и `.igs` сохраняют свои границы. Native cached/placeholder
states и semantic mutations проверены; автоматический rebuild, Queue Manager
previews и output/session navigation ещё не реализованы. Публичный статус
PP-008 не повышается: полный MVP pipeline остаётся открытым.
[Queue result previews/navigation](./engineering/phase-2b-queue-result-preview-research.md)
теперь соединяют завершённый job/session с проверенным candidate и одноразовым
Canvas focus/show/fit. Missing cache не блокирует full-PNG preview; старый
document допускает просмотр с прежним запретом Add. Ручной Refresh повторяет
Results/cache read; viewing не меняет queue, document/bbox, seed, Undo или `.igs`.
Flat sessions и reviewed cross-session acceptance сохранены. Session filtering,
автоматическое продолжение после Open/recovery и accepted history ещё открыты.
[Frozen Retry during inference](./engineering/phase-2b-busy-retry-research.md)
допускает новый reviewed attempt без ожидания конца текущего job. Live ready
копируется только для проверки сохранённого request; источник, capacity и
document/close gate остаются прежними. Serial drain подхватывает publication
даже после idle observation, а следующий worker снова квалифицируется.
Retry не меняет existing candidates/seed/Project/`.igs`.
[New Generate during inference](./engineering/phase-2b-busy-generate-research.md)
готовит новый frozen target через один CPU child того же установленного runtime,
пока текущий GPU продолжает работу. Generate другого Project добавляет pending
batch; same-Project Generate сохраняет точное подтверждение replacement и
повторяет его при late completion. Подтверждённый выход CPU/GPU предшествует
следующему inference, unconfirmed exit удерживает owner и блокирует claims.
Dirty/Undo/accepted layers/actual seed/`.igs` сохраняются; подготовка прерывается
при закрытии приложения, per-Project close сохраняет operation gate. Native
evidence использует controlled peers, а полный GPU/release
pipeline остаётся открытым, статус PP-008 не повышается.
[Seed Reuse checkpoint](./engineering/phase-2b-seed-reuse-research.md) теперь
подключает document-scoped completed cursor к внутреннему Prepare/enqueue,
отображает его в Project и переносит snapshot в `.igs` только при Save;
renderer Generate использует этот cursor и bounded planning, включая admission во время GPU busy; полный production flow scheduling остаётся открытым.

[Opaque img2img checkpoint](./engineering/phase-2c-img2img-research.md) расширяет
тот же durable контур очереди и staging на fully opaque Illustrious input.
Source pixels и denoising strength фиксируются до enqueue, Retry их копирует;
непринятый output остаётся временным, только явный Add создаёт Raster с provenance.
Migration сохраняет исторические txt2img attempts, receipts и seed cursor;
advisory CPU-чтение canvas не создаёт jobs и входит в app-close barrier.
Частичная прозрачность отклоняется до принятого результата, существующие правила
Cancel, recovery, явного Save и Undo сохраняются. Это не закрывает весь PP-008.

[Исправления аудита](./engineering/product-audit-fixes.md) подтверждают Add
результата с допустимым actual seed, отличным от planned seed, и его portable
Save. Подмена seed в staging manifest без durable receipt отклоняется без
изменения документа и удаления PNG.

[Result sessions](./engineering/phase-2b-result-sessions-research.md) добавляют
transient preview filter без изменения global checkbox/Add scope. Hidden selected
count и полный confirmation сохраняют видимость последствий Add. Closed Queue
Open продолжает exact result focus после ordinary Open или явного Recover;
Cancel/context/close/failure отзывают одноразовое намерение. Explicit Discard
Recovery отменяет его, фиксирует tombstones всех временных результатов этого
Project, затем удаляет shadow и открывает saved `.igs`. Ошибка до фиксации
tombstones сохраняет shadow; отложенная очистка файлов показана warning.
Saved файл и его accepted assets, operational queue history, actual seed и
другие Projects сохраняются. Несохранённые правки, включая принятые слои только
в shadow, удаляются. [SQLite lock safety](./engineering/sqlite-lock-safety-research.md)
убирает raw descriptor checks: pending sibling jobs остаются видимыми после
закрытия и повторного открытия соседнего соединения; altered SQLite file
permissions требуют явного repair. Fresh read
проверяет actual document и exact job/session, без подстановки соседнего кандидата.
Filter/navigation не меняют `.igs`, dirty/Undo, bbox, actual seed, queue/staging,
accepted layers или provenance. Native proof использует реальные Electron/IPC/
SQLite/files и controlled generation fixtures; полный GPU/release flow на этом историческом checkpoint оставался открытым;
публичный статус не повышается.
[Staging-only recovery](./engineering/phase-2b-staging-only-recovery-research.md)
добавляет Home/Open/Import decision для closed ready Project с verified completed
Results без dirty shadow. Recover открывает saved документ clean; Cancel не
открывает вкладку; Discard сохраняет прежний all-session scope. Недоступный
staging при absent/clean shadow показывается как unavailable с диагностикой,
сохраняя saved Open/Import/Save/rebuild и неизвестные файлы; pending document
shadow сохраняет свой статус и decision first. Fresh inspections и общий Project gate
сохраняют границы dirty recovery, acceptance и seed; это не full GPU/release proof.

[Project-local accepted history](./engineering/phase-2b-project-accepted-results-research.md)
теперь реконструирует список current accepted Raster results из owned provenance
после Add, Undo/Redo, shadow Recover и portable Save/reopen. Temporary candidates
и imported raster без provenance исключены; Queue prune и Clear Undo history не
удаляют accepted entries. Выбор записи меняет только transient layer selection/
Layers scroll. [Saved-result SQLite index](./engineering/phase-2b-saved-accepted-index-research.md)
теперь заменяет Home и accepted-result metadata одной транзакцией из verified
saved `.igs`; unsaved Add/Undo/shadow Recover и Queue prune не публикуют изменения
в нём. Отказ индекса после committed Save сохраняет `.igs`, прежний целый DB
snapshot и warning; workspace Refresh восстанавливает projection из saved source.
Internal query исключает unhealthy/trashed/foreign-lineage записи. Cross-project
history browser/navigation и public IPC пока отсутствуют, публичный статус не повышается.

### Обещание

Завершённая генерация не изменяет проект автоматически. Готовые непринятые
результаты сохраняются локально для восстановления после сбоя. Пользователь
сначала просматривает их и явно выбирает, какие станут слоями или вариантами;
принятое изменение можно отменить.

### Пользовательская выгода

Можно экспериментировать и сравнивать варианты, сохраняя контроль над тем,
что попадёт в текущую работу.

### Явное не-обещание

- Бессрочная история всех непринятых или явно отброшенных candidates и
  восстановление после любого повреждения диска.
- Восстановление staging session при Undo принятия результата.
- Undo очереди, выполнения worker или удаления temporary candidates.
- Автоматическое принятие или запись всех результатов в основной `.igs`.

Окончание staging с потерей невыбранных результатов или отменой оставшихся
jobs должно быть объяснено до подтверждения.

### Supporting contract

[PP-008 Supporting Contract: GenerationResults And Staging](./features/project/generate-mode/generation-results.md)
определяет preview, multi-selection, acceptance и cleanup.
[Queue Manager](./features/queue-manager.md#frozen-job-rule) сохраняет frozen job
независимо от дальнейших edits; [Undo/Redo](./features/project/undo-redo.md)
определяет один undo step на acceptance и границы session history.
Provenance принятого результата регулируется PP-005.

[Illustrious LoRA checkpoint](./engineering/phase-2c-lora-research.md) сохраняет
точные ресурсы и веса при поздней правке Project/Default, Cancel и Retry.
Worker получает только verified enabled subset; результат остаётся в staging
до явного Add, а полный frozen stack попадает в `.igs` только после Save.
Disabled missing refs не блокируют generation; incompatible/corrupt/unsupported
active files и старый worker отклоняются явно. Срез не завершает PP-008.

[VAE precision checkpoint](./engineering/phase-2c-vae-precision-research.md)
сохраняет выбранную policy при поздней правке Project и Cancel/Retry; старый
worker отказывает manual precision, но сохраняет нейтральный Auto путь.
Finite-output refusal не публикует успешный candidate и не меняет `.igs`.
Контролируемый Electron сценарий проверяет явный Add/Save/reopen отдельно
от actual CPU/NVIDIA ML; PP-008 не объявляется завершённым.

[External VAE inference](./engineering/phase-2c-external-vae-inference-research.md)
сохраняет exact resource/size/hash при поздней правке Project, смене Default,
Cancel и Retry. Выбранный компонент управляет txt2img decode и opaque img2img
encode/decode с прежними precision/finite guards. Успех worker не добавляет слой
без явного Add; unsupported, changed и non-finite input не публикуют candidate.
Проверки Electron с controlled peer и actual ML имеют отдельные evidence;
PP-008 остаётся неполным.

[Embedding authoring checkpoint (04.10.2026)](./engineering/phase-2c-embedding-authoring-research.md)
на этом историческом срезе не добавлял ML-возможность: saved embedding refs и known unbound installed
tokens отказывали до composition/enqueue с объяснением, без silent plain-text
fallback или автоматической привязки во время Generate. Этот срез не менял
accepted-result provenance, staging или границу явного Add; qualified embedding
weights оставались открытыми до последующего inference checkpoint. Bounded
installed trained evidence добавлен выше; полный pipeline остаётся открытым,
PP-008 не завершён.

[Public Anima Generate and Add](./engineering/phase-2c-anima-public-generation-research.md) используют original click capture,
app-wide runtime lease, whole-batch publication и exact replacement review.
Document/index/close races отказывают или отменяют только новый batch, сохраняя
прежние результаты. Worker success остаётся временным candidate до Add; mixed
Illustrious/Anima selection предварительно проверяется целиком. Настоящие
owners проверены с явно controlled qualification/inference peers; UI/IPC и
saved comparison проверены native Electron отдельно от CUDA/trained weights.
Regions/outpaint, Smart Patch, presets и release pipeline остаются открытыми;
публичный статус PP-008 не повышается.

[Empty-queue dispatch correction](./engineering/phase-2c-installed-runtime-qualification-research.md)
проверяет pending metadata до GPU reservation: пустая очередь, fenced-only jobs
или существующий running row не создают idle qualification/inference child.
Preflight не читает frozen файлы, не занимает слот и не меняет SQLite; actual
verification и cross-instance claim CAS остаются окончательным решением.
Реальные queue/controller/runtime tests и semantic mutations сохраняют late
fences, enqueue barrier, successful Retry wake после idle и shutdown.
Финальный installed development runtime прогон отдельно завершил четыре
trained UI сценария Illustrious/Anima × txt2img/opaque img2img при 1024×1024 и
трёх шагах: public Generate не изменяет document до явного Add, приёмка сохраняет
прежние слои, а accepted bytes/settings проходят rendered Save/reopen. Opaque
img2img использует exact frozen target, Reuse сохраняет actual seed `0`.
Это не автоматический Add/Save или доказательство всех options, Smart Patch,
regions/outpaint, качества моделей и release lifecycle. PP-008 остаётся
неполным и «Пока не обещать».

[Installed CFG Generate/Add](./engineering/phase-2c-installed-cfg-rescale-research.md)
проверяет three matched txt2img cases и nonzero opaque img2img: completion
публикует temporary candidate и не меняет layers/сохранённый `.igs` до явного
Add/Save. После durable admission правка draft на 0.2 не меняет frozen queue
или accepted effective zero/0.7. Case/job/receipt identities и target pixels
сверяются с реальными output bytes. Numerical txt2img effect и healthy
Save/reopen не объявляют готовыми outpaint, masks, Smart Patch, остальные
options или release lifecycle.

[Normal outpaint conditioning foundation](./engineering/phase-2c-outpaint-conditioning-research.md)
adds internal Main-owned exact target/soft-alpha/policy/LaMa snapshots and worker
CPU coherence/fade/local infill/contribution helpers. External Invoke method
comparison and trained local CPU LaMa evidence do not constitute family masked
inference, durable candidate publication, accepted RGBA provenance or recovery.
Mixed-alpha Generate still refuses both families; PP-005/007/008 status remains
«Пока не обещать». First-engine auxiliary delivery and release lifecycle remain
open under the existing accepted installation decision.

[Internal Illustrious masked denoising](./engineering/phase-2c-illustrious-outpaint-research.md)
now checks the native denoising loop with protected source/noise before both
UNet and scheduler, strict progressive thresholds and final protected VAE input.
57 native CPU tests cover five methods, both prediction types and strength;
11 trained CUDA cases cross Main snapshot/local LaMa/masked loop/contribution
with replay, black/unmasked, white/zero and changed-seed controls. These are
development internal numerical checks, not installed public outpaint jobs,
durable RGBA acceptance/provenance or Save/reopen. Coupled durable integration
and auxiliary installation remain open.
PP-005/007/008 matrix and public readiness remain «Пока не обещать».

[Internal Anima masked denoising](./engineering/phase-2c-anima-outpaint-research.md)
adds source/noise restoration after completed user steps through all six existing
flow methods, with inverse-shift linear thresholds and shifted noise mixing.
Heun predictors retain their native intermediate state. Weighted both-sign
conditioning, LoRA and seed streams use the shared ordinary executor. Native
external-source oracle tests and trained BF16 controls verify this internal path;
public mixed-alpha admission, durable RGBA/provenance, auxiliary installation and
installed Generate/Add/Save/reopen remain open. These results do not raise the
public readiness of PP-005/007/008 or complete phase2C.

[Internal frozen outpaint jobs](./engineering/phase-2c-outpaint-jobs-research.md)
now retain exact mixed-alpha PNG/derived keep mask, fixed policy/resource identities
and family settings in two distinct durable operations. Whole-batch admission,
restart and internal Retry use the existing real SQLite/owned input store.
A Main resolver verifies the pinned local LaMa under shared application storage.
Public mixed-alpha Generate, worker dispatch, staging RGBA publication and accepted
portable outpaint provenance remain explicitly closed. This checkpoint does not
qualify installation or Generate/Add/Save/reopen and leaves PP-005/007/008 public
readiness and phase2C completion unchanged.

[Internal outpaint execution (06.10.2026)](./engineering/phase-2c-outpaint-execution-research.md)
теперь подключает два frozen operations к explicit strict worker 0.12.0 commands
и native masked executors обеих семей. Worker сохраняет RGBA contribution;
Main независимо сверяет expected contribution alpha с owned source и exact
policy перед temporary publication. Completion не меняет Project или `.igs`.
Selected Add preflight проверяет contributions/provenance до journal, sibling
cancellation и discard; portable Add/Save/read/comparison сохраняют actual seed,
включая valid uint32 deviation. Public mixed-alpha Generate и public outpaint
Retry остаются закрытыми; first-setup LaMa installer и installed trained/release
qualification — следующие границы. Executed evidence и counts находятся в
research note. PP-005/007/008 остаются «Пока не обещать», phase2C не завершена.

[Main-owned LaMa delivery](./engineering/phase-2c-lama-install-research.md) добавляет pinned Main downloader,
внутреннюю exact filesystem installation/reuse и план полного объёма по trusted
runtime artifacts плюс LaMa. Auxiliary preview явно weights-only и не заменяет
полный engine preview. Set up/Install/Repair, public mixed-alpha Generate/Retry
и installed/release qualification остаются открытыми; PP-008 не повышается.

[Public outpaint admission (07.10.2026)](./engineering/phase-2c-public-outpaint-research.md)
подключает mixed-alpha Generate и failed/canceled frozen Retry для Illustrious и
Anima при явно qualified worker 0.12.0 и exact local LaMa. Изменение current
document/close/shutdown до final SQL commit запрещает publication; revocation
при последующем child-exit wait отменяет только новые owned jobs с status proof.
Missing/corrupt/unsafe helper не блокирует ordinary queue/history recovery.
Completion остаётся временным; Add/Save/reopen сохраняют два portable outpaint
kinds и original frozen baseline. Built Electron и installed worker завершили
шесть trained UI completions при 256×256/трёх шагах и signed LoRA −0.5:
у каждой семьи normal source, mixed-alpha Generate и frozen Retry после actual
Cancel. Два canceled originals сохранены; Retry не подменяет original source,
policy/LaMa и strength новым draft. Genuine CPU LaMa и CUDA worker сохраняют
source layers/exact contribution alpha через Add/Save/reopen/comparison; portable
records не включают local paths или source/weight bytes. Fixed Main installer
с genuine local transport substitute и exact reuse не доказывает public network
download или setup. Executed evidence и qualification limits находятся в research
note. First-setup installation, signed release, remaining
options, authored masks/regions/Smart Patch и preset work остаются открытыми;
PP-005/007/008 сохраняют «Пока не обещать».

[Public selected-VAE opaque IMG](./engineering/phase-4-regional-guidance-public-img2img-vae-research.md) extends the existing prepared owner through actual Generate/Cancel/frozen Retry and explicit Add/Save-reopen. ROOT582 Main/223 Python/196 browser PASS,19 installed checks, exact A/FP32 replay and controlled B pixel influence retain ordinary VAE provenance and existing Regional Guidance exclusions. Current Embedded/FP16 authoring cannot replace frozen A/FP32. This finite evidence does not promote PP-008 or visual/release readiness.

## Карта покрытия и открытые границы

| Область продукта                                                       | Опорные promises / решение                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Home, tabs, managers, navigation                                       | PP-001, PP-002, PP-003                                                                            |
| Project files, Save, recovery, Trash                                   | PP-007; PP-001 для переключений                                                                   |
| Model install, metadata, versions, missing resources                   | PP-004; PP-006 для применения preset                                                              |
| Provenance, settings comparison, preset from result                    | PP-005, PP-006                                                                                    |
| Queue, staging, Raster/Smart Patch acceptance, undo                    | PP-008; PP-007 для сохранения; PP-005 для provenance                                              |
| Prompt, autocomplete, dynamic prompts, canvas tools, Regional Guidance | Features, доказывающие PP-001–PP-006 и PP-008; отдельный promise для каждого control не требуется |
| Local inference, privacy, offline operation                            | Локальный desktop scope принят; отдельные privacy/offline гарантии требуют data-egress contract   |
| Accessibility, performance                                             | Feature-level требования; отдельные общие гарантии требуют измеримых границ и evidence            |
| Upscale, ControlNet, training, plugins                                 | Отложенный scope; не основание для публичного MVP promise                                         |

Новый promise нужен, когда появляется самостоятельное устойчивое ожидание
пользователя, которое не выражается существующими. Это не каталог всех features.
Supporting contract может поддерживать несколько promises, сохраняя одного
владельца точного правила.

## Как добавлять следующие обещания

Новые и постепенно обновляемые записи используют ту же структуру:

- `Обещание` — простое описание пользовательского результата;
- `Пользовательская выгода` — зачем это важно в реальной работе;
- `Явное не-обещание` — broad negative scope и граница ожиданий;
- `Supporting contract` — отдельный документ с product, UX, data и architecture
  decisions, prototype gaps и проверяемыми инвариантами;
- `Публичный статус` — `можно обещать`, `обещать аккуратно` или `пока не
обещать`, подтверждённый фактическим состоянием продукта.
- `Допустимые исключения` — узкие случаи, не размывающие обещание.

Если новое решение конфликтует с принятым обещанием, конфликт должен быть
назван явно. Нельзя обойти обещание переименованием сущности: dockable widgets
не перестают быть workbench только потому, что называются modes или presets.

[Embedding inference](./engineering/phase-2c-embedding-inference-research.md)
заменяет blanket refs refusal на qualified dual-CLIP loading. Каждый concrete
branch получает свой exact набор; known token без привязки отклоняет batch до
publication. Corrupt/unsupported/over-budget input не создаёт successful candidate;
Retry проверяет frozen active files, success сохраняет прежнюю explicit Add/Save
границу. Authoring checkpoint выше описывает прежний отказ, не текущее ограничение.
Controlled Electron и actual synthetic ML evidence разделены; PP-008 не завершён.

[Anima durable jobs](./engineering/phase-2c-anima-durable-jobs-research.md)
использует общий operational staging для внутренних Anima attempts: receipt-owned
completion, PNG/color verification, Cancel, frozen Retry и restart recovery.
На этом историческом checkpoint Add ещё отказывал до побочных эффектов.
[Следующая интеграция](./engineering/phase-2c-anima-public-generation-research.md)
подключает public Generate и portable mixed-family Add через прежние owners;
полный release pipeline остаётся открытым.

[Installed Anima image Reuse после crash](engineering/phase-2c-anima-image-reuse-crash-research.md): Euler256 IMG/normal mixed-alpha OUT,22 admissions/18 completions/4 APP_RESTART/18 accepted layers/2 Save-reopen packages,16 Reuse+2 recovered own fullRGBA matches. Home Recover сохраняет source/candidate/cursor B; public Reuse/value null, hidden recovered Fixed layer и8 fresh Reuse layers сохранены вместе с source. Source-only Save snapshot null; final(B+7),10 layers/9 provenance,18 owning comparisons; OUT55552 protected pixels. Исключённый первый native3/1/2cancel/0accepted учтён отдельно; raw total25/19/6cancel/18accepted. FullMVP/quality/Invoke parity/release не заявлены. Следующий finite gate: Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.

[Anima image MAX→0](engineering/phase-2c-anima-image-seed-wrap-research.md): Installed Anima image MAX→0: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 wholeRGBA matches с собственными numeric MAX/0 controls и 2 same-prompt contrasts. Frozen worker inputs сохраняют MAX→0 actual/step/posterior seeds и compiled weighting; 6 cursor/Save snapshots и 8 portable provenance сохраняют raw weighted text, actual seed и resource/source context. Три OUT previews сохраняют 166656 protected source pixels. Independent raw reader PASS (18700 checks); actual Main modulo fault: 18 executions, 2 RED / 16 GREEN. Все 584 copied source members restored and guarded-cleaned. Только Euler256/N3/two updates/exact ресурсы; cross-pair wrap/cap32/new installed mutation/quality/Invoke parity/fullMVP/release не заявлены. Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.
