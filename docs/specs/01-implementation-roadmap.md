# Implementation Roadmap

## Границы плана и исходники-ориентиры

Первый рабочий релиз — одно Linux/NVIDIA desktop-приложение с Illustrious
(семейство моделей на архитектуре SDXL, включая NoobAI-производные) и Anima.
Полная поддержка NoobAI в рамках принятого MVP запланирована в
[отдельном шаге фазы 2C](#noobai-полная-поддержка-в-рамках-mvp) с продолжением
проверок Presets, Canvas и релиза в фазах 3–5. Admission метки и текущий
v-prediction checkpoint не означают завершения этого шага.
Базовая SDXL как отдельное семейство не
поддерживается. UI установки и восстановления runtime находится **в том же
основном окне ImageGen Studio**. Отдельное приложение или окно лаунчера не создаётся;
Python ML Worker остаётся
управляемым фоновым процессом без собственного UI. Граница процессов описана
в [Electron architecture](./02-electron-architecture-cqrs.md), безопасная
установка — в [runtime contract](./07-python-runtime-management.md).

| Reference       | Локальный путь                        | Проверенная ревизия                                                                                 | Что изучаем                                                                                                                                                                          |
| --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| InvokeAI        | `~/Work/sources/InvokeAI/` | `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`                                                          | Inference graph/invocations, model loading, queue и Canvas; это уже закреплённый source snapshot для [worker protocol](./05-worker-protocol.md), а не заявление о свежести upstream. |
| Invoke launcher | `~/Work/sources/launcher/` | `c267bdb439519216b277a7a8c6ad408b9d79efce` (`main`, после fast-forward до `origin/main` 25.09.2026) | GPU probe, `uv`/artifact download, status/progress и single-instance handling как исходный материал для **встроенного** setup/repair flow.                                           |

Оба checkout — инженерные ориентиры, не runtime-зависимости приложения. Перед
переносом конкретного механизма нужно сверить актуальную ревизию, лицензии и
проверяемое поведение. Launcher Invoke открывает отдельное окно для самого
Invoke и может чинить активный `.venv` на месте; эти части не переносятся:
наш main process использует изолированный renderer и только staged runtime с
rollback. Подробные различия зафиксированы в [runtime contract](./07-python-runtime-management.md).

Точки входа для фаз: в Invoke —
`invokeai/app/services/model_install/model_install_default.py` (фаза 1),
`invokeai/frontend/web/src/features/nodes/util/graph/generation/` (2B–4),
`invokeai/app/services/session_queue/session_queue_sqlite.py` и
`invokeai/frontend/web/src/features/controlLayers/` (2B–4). В launcher —
`download_uv.ts`, `src/main/gpu-detection.ts` и
`src/main/install-manager.ts` (0/2B), `src/main/index.ts` (single-instance).
Привязка source map к точным операциям и тестам — отдельный результат
документационного трека.

Фазы 0–2C дают первый исполнимый вертикальный срез; фазы 3–4 закрывают принятый
MVP, фаза 5 допускает его к первому релизу. Следующую фазу можно начинать,
когда её зависимости доступны, но выполнение фазы подтверждается только
результатом и проверками ниже. Параллельные исследования и UI-доработки не
повышают [публичный статус обещаний](../product-promises.md) без production evidence.

## Текущая карта реализации и оставшихся работ

### Актуальный checkpoint на 10.11.2026

Public EPS checkpoint опирается на `4b56c127891fe951be44183783b5089e070cdca2`;
последующий V outcome и его source/evidence pins приведены в новом note ниже.
Исторические checkpoints ниже описывают состояние на момент своего выполнения;
их «следующий owner» не является актуальным backlog. Последний завершённый
[public Anima Smart regional TXT/IMG](../engineering/phase-4-anima-smart-regional-flow-public-research.md)
дополняет уже подключённые INP/OUT. Ordinary Smart обеих семей, variants,
freshness, frozen Retry, orphan Raster Add, accepted history, Smart Save Current,
Smart-target preset Apply, Compare и result-derived presets повторно не нужны.
Current Canvas regional batches, Anima global-positive expansion/global LoRA/
signed negatives и NoobAI V regional TXT/IMG/OUT с выбранными sampling
continuations также имеют свои checkpoints. Это не общая визуальная или
релизная приёмка.

Текущий [public Illustrious Smart Regional EPS checkpoint](../engineering/phase-4-illustrious-smart-regional-public-research.md)
добавляет все четыре Smart mode через существующие owners и installed qualification.
Его finite epsilon/Euler/Normal/static/Auto-VAE scope не закрывает NoobAI V,
ресурсы/batch/остальные методы, reference inference или визуальную приёмку.
Последующий [NoobAI V Smart Regional Euler checkpoint](../engineering/phase-4-illustrious-smart-regional-v-prediction-research.md)
подключает все четыре режима с actual objective, явной frozen noise policy и
четырьмя отдельными V grants. ROOT736 Main/252 Python/246 browser PASS;
installed44 checks/16 requests/12 world publications/four step-1 cancels,
четыре exact restarted Retry и восемь normal closes. EPS meanings сохранены.
Следующий материальный resource consumer — global LoRA в Smart Regional:
original Anima, затем Illustrious EPS/V. Конечная матрица остальных совместимых
сочетаний, visual/capacity/release gaps остаётся в linked notes.

Оставшиеся обязательные границы:

1. **Regional Guidance consumers:** оставшиеся совместимые Smart
   Regional combinations; Illustrious regional reference-image inference. `smart-patch-regional-guidance.ts` пока
   допускает original Anima и finite Illustrious EPS/V; `regional-invoke-generation.ts` отклоняет
   reference images. Authoring/storage references уже существуют и не заменяют
   inference. Smart Regional batch/dynamic prompts/resources/sampling нужно
   сверить конечной матрицей с контрактом: текущий отказ сам по себе не делает
   любую комбинацию новой обязательной функцией. Anima references и generic
   ControlNet/IP-Adapter остаются вне MVP. Private и public/installed evidence
   различаются; текущие public EPS/V checkpoints не квалифицируют все controls.
2. **Визуальная полезность и capacity:** фиксированные контроли, реальная
   совместимость и визуальная приёмка с выбранным официальным Illustrious XL
   v0.1. Pixel inequality, точный Retry и source audit не закрывают этот gate;
   defaults не меняются ради отдельного примера.
3. **Home/workspaces и Project Trash:** реальные workspace операции,
   rename/move/reveal/locate Project, sort/Status/grid-list/Inspector и
   move/restore/permanent delete с файлами/SQLite/restart. Нынешние Home
   search/create/import/open/refresh/rebuild и default workspace — foundation.
4. **Model Manager:** hard Remove Local Resource с running/pending/reference/
   shared-file guards; оставшиеся контексты, включая Project menu и missing
   accepted-result resources, Preset Manager/New Project. Project checkpoint/
   LoRA/VAE/embedding navigation, Project Apply diagnostic return и installed
   artwork уже подключены; не ставить их повторно в TODO.
5. **Image export:** `Export As` по visible-content bounds с active Smart
   variants и отдельный `Export Generation BBox`, sRGB, empty refusal и
   неизменность Project/`.igs`. Экспорт отдельного candidate этот consumer
   не заменяет; custom rectangle остаётся вне MVP.
6. **Release delivery:** Runtime Install/Repair остаются
   `RUNTIME_INSTALL_UNAVAILABLE`; нужны trusted artifacts, staged install/
   self-test/activation/rollback. Затем проверяемый Linux/NVIDIA distributable,
   clean install/upgrade/rollback и ручные Electron Check for Updates/Install
   Update с обычными close/cancel guards. Model-version check и developer
   provisioner не являются app updater или release installer.
7. **Итоговая приёмка:** migration/recovery/protocol compatibility, NoobAI
   release matrix и полный MVP acceptance на конкретном поддержанном профиле.
   PP-001/005/007/008 остаются **«Пока не обещать»**; повышение требует supporting
   contract и строки promise matrix с фактическим итоговым evidence.

### Историческая карта и накопленные checkpoints

Сверка кода, IPC, SQLite migrations и прототипа выполнена на `73196af`
(27.09.2026); последующая UI-доработка описана в
[desktop UI review](../engineering/desktop-ui-layout-review.md).
LoRA draft добавлен в `a188cd2`: [границы и проверки](../engineering/phase-2a-project-storage-research.md#project-lora-stack-validation).
Поверх него реализован явный portable LoRA relink: [проверки](../engineering/phase-2a-project-storage-research.md#portable-lora-relinking-validation).
LoRA-контекст prompt перенесён в Electron: [проверки](../engineering/project-lora-prompt-research.md).
Выделение фраз, attention, Copy/Clear и общая справка редактора также подключены:
[исторические проверки редактора](../engineering/project-prompt-actions-research.md).
Позднее локальная история Electron Project prompt заменена
[общей Project history](../engineering/phase-2b-project-undo-research.md).
Добавлены общие неблокирующие syntax diagnostics prompt:
[проверки](../engineering/project-prompt-diagnostics-research.md).
Строка «есть» означает указанный сценарий, а не завершение всей фазы.
Исторические checkpoints ниже сохраняют дату и границы своих проверок.
Runtime snapshot обновлён 06.10.2026 поверх `dba59a5`: development provisioning,
installed CPU production routes, empty-drain regression и четырёхсценарная
trained native qualification подтверждены. Это не закрывает release
Install/Repair, всю фазу 2C или публичные promises.

[Internal outpaint execution (06.10.2026)](../engineering/phase-2c-outpaint-execution-research.md)
добавляет explicit worker 0.12.0 dispatch обоих frozen family kinds, independent
Main contribution-alpha verification, owned staging source после queue pruning
и portable Add/Save/read/comparison. Public mixed-alpha Generate/Retry,
first-setup LaMa installation и installed/release qualification остаются
открытыми; counts и границы evidence находятся в research note.

[Main-owned LaMa delivery (06.10.2026)](../engineering/phase-2c-lama-install-research.md)
добавляет внутренние pinned download/publication/reuse и complete-artifact byte
planner. Set up/Install/Repair и общий runtime release пока не подключены;
public outpaint и installed/release qualification остаются открытыми.

[Public outpaint admission (07.10.2026)](../engineering/phase-2c-public-outpaint-research.md)
подключает public mixed-alpha Generate и frozen Retry для обеих семей при worker
0.12.0 и exact local LaMa. Final SQL и последующее ожидание child exit сохраняют
current document/close fences; проблемы LaMa не блокируют ordinary storage.
Installed development Electron подтвердил шесть trained UI completions: у каждой
семьи ordinary source, mixed-alpha Generate и frozen Retry после actual Cancel,
с explicit Add/Save/reopen/comparison при 256×256/трёх шагах. Fixed Main installer
использовал genuine local LaMa transport substitute и затем exact reuse; это не
public network download, first setup или signed release. Executed evidence и
остальные ограничения qualification находятся в research note.

| Область             | Реализовано в исходниках (Electron указан отдельно)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Осталось в принятом MVP                                                                                                                                                                                                                                                      | Фаза завершения |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Каркас              | Main/preload/renderer, typed IPC, SQLite, single instance; внутренний live qualification и эксклюзивный generation worker lease; [installed runtime checkpoint](../engineering/phase-2c-installed-runtime-qualification-research.md): isolated development provisioning собственного CPython/non-editable worker, installed CPU provider и глобальный physical-exit fence; built production Electron → installed trained CUDA normal modes подтверждены отдельно от release setup; [Main-owned LaMa delivery](../engineering/phase-2c-lama-install-research.md): внутренние pinned auxiliary download/install/reuse и complete-artifact byte planner; Set up/Install/Repair остаются заглушками                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Release runtime Install/Repair вместо заглушек, signed artifact/rollback и clean-install проверки                                                                                                                                                                            | 2A, 5           |
| Model Manager       | CivitAI URL install/repair, install queue, integrity, versions/default; [staging publication](../engineering/model-install-staging-publication-research.md) финализирует owned links+sync до ready; поддерживаемые Illustrious/Anima `.safetensors`, custom Anima с закреплёнными Qwen3/VAE; единственный editable Illustrious prediction override по SHA-256+size с отмеченным `epsilon` default; Project → Manager focus и Electron smoke изменения библиотечного типа; первый SDXL structural preflight перед Prepare; [exact Illustrious embedding authoring](../engineering/phase-2c-embedding-authoring-research.md): canonical filename literal, managed verification, collision selection and portable local-ID-only Link; [Anima qualification foundation](../engineering/phase-2c-anima-qualification-research.md): exact saved checkpoint/linked pinned components, complete original architecture and fresh hashes; public Generate/accepted wiring подключены; trained installed UI qualification подтверждена для двух exact checkpoints и ordinary LoRA, без обещания произвольного CivitAI layout; [installed v-prediction qualification](../engineering/phase-2c-installed-v-prediction-research.md): exact Cyberfalafel/NoobAI file policy через Model Manager, preserving refused Retry при смене type и frozen Retry после восстановления; native local catalog не квалифицирует public network install; [local resource previews](../engineering/phase-2c-resource-previews-research.md): exact-version sRGB artwork, offline cache, built manager/picker+Save+restart and confirmed-exit cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [NoobAI дальнейшая trained compatibility qualification](#noobai-полная-поддержка-в-рамках-mvp), полная model/component compatibility для обоих семейств, условия custom checkpoint от источника, hard remove, остальные resource handoff, release model-load/download checks | 2B–2C, 3, 4, 5  |
| Home                | Create/list/search/open, external `.igs` Copy/Move в Uncategorized, thumbnails/Rebuild                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Пользовательские workspaces, rename/move/Trash/restore/permanent delete, Status/sort/view/Inspector и unavailable-workspace flows                                                                                                                                            | 4               |
| Project document    | Реальные `.igs` Save/reopen, close guards, document shadow autosave/recovery, exact checkpoint/LoRA relink; отдельный repository для первого непринятого Illustrious candidate; подтверждённый Project close с отменой своих jobs и долговечным staging discard; [read-only Results recovery view](../engineering/phase-2b-results-recovery-ui.md) после restart проверен Electron smoke; явный Add Raster с typed provenance, shadow-before-staging cleanup и Save/reopen; Project-local Undo/Redo с grouped prompt input, toolbar/shortcuts и bounded asset retention; installed CPU Save/import/rebuild routes с сохранением успешного результата и workerless placeholder Save внутри Main lease; actual installed UI missing-runtime Save/restored Home Rebuild/CPU import подтверждены [Public outpaint admission](../engineering/phase-2c-public-outpaint-research.md): обе семьи Generate/frozen Retry с exact LaMa и final SQL/child-exit fences; шесть trained installed development UI completions при 256×256/трёх шагах сохраняют source layers/exact alpha/portable records через explicit Add/Save/reopen/comparison; release setup остаётся отдельным. [Smart Patch foundation](../engineering/phase-4-smart-patch-foundation-research.md): independent empty mask/bbox/internal resolution/draft, targeted edits, Undo/Redo, native Save/reopen и local crash recovery без runtime. [Owned mask authoring](../engineering/phase-4-smart-patch-mask-authoring-research.md): strict hash-linked PNG alpha, world bounds, immutable assets в existing Save/shadow/history; no composite/accepted pixel contribution. [Transform/Fit](../engineering/phase-4-smart-patch-mask-transform-research.md): baked PNG, retained original bytes when dimensions/alpha unchanged; regression1820 before terminal snapping, final affected59/native57/three semantic RED-GREEN and required checks PASS; chronology/limits in checkpoint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Smart Patch acceptance, остальные production Canvas gestures                                                                                                                                                                                                                 | 2B–2C           |
| Raster Canvas       | Konva, pan/zoom/bbox, import PNG/JPEG/WebP, visibility/lock/opacity/blend/reorder; shared mixed layer stack и empty Smart Patch document controls; Project-local Undo/Redo; Brush/Eraser/Lasso/Polygon Lasso для выбранного Smart Patch, captured gesture owner/revision, Overlay/Clear Transform Mask preview/Apply/cancel и Fit только owned bbox (24px/outward grid8), qualification in progress. [Owned mask settings](../engineering/phase-4-smart-patch-mask-settings-research.md): optional per-Patch blur/padding16/8, captured scalar editors and configurable Fit; regression1835/final104/native109, three semantic RED/GREEN and required checks PASS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | остальные layer actions, Smart Patch inpaint/generation/accepted variants/staleness/compositing/comparison/presets и Regional Guidance                                                                                                                                       | 4               |
| Generation draft    | [NoobAI Karras refusal](../engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». [Anima image cap32/prefix](../engineering/phase-2c-anima-image-batch-cap-research.md):76/4/12/2, preserved32 candidates on confirmed33 refusal. [Anima image MAX→0](../engineering/phase-2c-anima-image-seed-wrap-research.md): Installed Anima image MAX→0: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 wholeRGBA matches с собственными numeric MAX/0 controls и 2 same-prompt contrasts. Frozen worker inputs сохраняют MAX→0 actual/step/posterior seeds и compiled weighting; 6 cursor/Save snapshots и 8 portable provenance сохраняют raw weighted text, actual seed и resource/source context. Три OUT previews сохраняют 166656 protected source pixels. Independent raw reader PASS (18700 checks); actual Main modulo fault: 18 executions, 2 RED / 16 GREEN. Все 584 copied source members restored and guarded-cleaned. Только Euler256/N3/two updates/exact ресурсы; cross-pair wrap/cap32/new installed mutation/quality/Invoke parity/fullMVP/release не заявлены. [Installed Anima image Reuse после crash](../engineering/phase-2c-anima-image-reuse-crash-research.md): Euler256 IMG/normal mixed-alpha OUT,22 admissions/18 completions/4 APP_RESTART/18 accepted layers/2 Save-reopen packages,16 Reuse+2 recovered own fullRGBA matches. Home Recover сохраняет source/candidate/cursor B; public Reuse/value null, hidden recovered Fixed layer и8 fresh Reuse layers сохранены вместе с source. Source-only Save snapshot null; final(B+7),10 layers/9 provenance,18 owning comparisons; OUT55552 protected pixels. Исключённый первый native3/1/2cancel/0accepted учтён отдельно; raw total25/19/6cancel/18accepted. FullMVP/quality/Invoke parity/release не заявлены. [Installed Anima image Random → Fixed](../engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | broader inputs/geometry/method-policy/Advanced/quality/release; Danbooru autocomplete/tokenizer                                                                                                                                                                              | 2B–2C           |
| Python worker       | [NoobAI Karras refusal](../engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». [Installed Anima ER-SDE order3](../engineering/phase-2c-anima-er-sde-order3-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons. Installed dd_x0 omission: three-step pixels GREEN / five-step pixels RED до Add; оба controls имеют 0 accepted layers. Exact restoration всех43 source identities и fresh five-step pixel replay; independent aggregate 1750 checks. Superseded cleanup attempt учтён отдельно: raw8/8/5/5. Только TXT256/CFG4/Fixed0/Myth−0.5; full MVP/release status не повышен. На этом ER-SDE checkpoint Heun IMG/OUT был открыт; follow-up записан выше. Dev import normalization, sRGB/ICC, composition/previews, frozen raster target; отдельный локально проверенный Linux/NVIDIA entrypoint для Illustrious `txt2img` с ограниченным dual-CLIP Compel conditioning и маской padding в закреплённом Diffusers 0.40; [target composition](../engineering/phase-2b-inference-target-composition.md) теперь доступна в том же qualified inference child с shared main PNG/ICC/alpha verifier; [denoising progress](../engineering/phase-2b-generation-progress-research.md) от callback закреплённого pipeline проходит до transient UI; [result thumbnails](../engineering/phase-2b-result-thumbnails-research.md) создаются best-effort в том же inference child, без изменения полного PNG; [CFG Rescale](../engineering/phase-2c-cfg-rescale-research.md): qualified0.5 actual guidance_rescale, local pinned tensor/GPU neutral controls; [VAE precision](../engineering/phase-2c-vae-precision-research.md): qualified worker 0.8.0, native encode/decode policy and finite output guard; [Anima offline loaders](../engineering/phase-2c-anima-qualification-research.md): default native Cosmos/conditioner/Qwen3/Wan strict CPU loading with actual trained weights; [compiled weighting/conditioning](../engineering/phase-2c-anima-conditioning-research.md): both signs, exact bundled tokenizers, native and trained CPU evidence; [Anima Euler foundation](../engineering/phase-2c-anima-euler-research.md): internal default Euler txt2img/opaque img2img, trained RTX 4080 pixels at 256x256/three steps; [Anima ordinary LoRA](../engineering/phase-2c-anima-lora-research.md): internal scoped exact adapters; [Anima deterministic sampling](../engineering/phase-2c-anima-sampling-research.md): Euler/Heun/DPM++ 2M; [Anima six-method flow sampling](../engineering/phase-2c-anima-flow-sampling-research.md): DPM++ 2M SDE/ER-SDE/Flow LCM, independent step RNG, exact ER source and shifted/full-grid LCM clipping; remaining applicable options и quality/release остаются открытыми; [Anima worker 0.11](../engineering/phase-2c-anima-worker-entrypoint-research.md): TS compiled command through actual JSONL to native six-method pixels, hardware-gated capabilities, shared PNG validation/publication; public authoring/Main/queue/accepted wiring и четыре trained installed UI normal-mode сценария подтверждены; release qualification остаётся открытой; [installed runtime checkpoint](../engineering/phase-2c-installed-runtime-qualification-research.md): app-owned installed development graph и production CPU derivatives routes, zero-worker idle dispatch; [installed CFG qualification](../engineering/phase-2c-installed-cfg-rescale-research.md): actual Advanced Options, matched txt2img pixels and nonzero opaque img2img through Add/Save/reopen/comparison. [Public outpaint qualification](../engineering/phase-2c-public-outpaint-research.md): worker 0.12.0, genuine CPU LaMa и trained CUDA обеих семей через built Electron, шесть successful completions при 256×256/трёх шагах; public setup/release остаются открытыми. | Release Install/Repair и runtime artifact, остальной Invoke-like conditioning, остальные LoRA algorithms, кэш моделей и остальные generation operations                                                                                                                      | 2A–2C           |
| Generate/results    | [NoobAI Karras refusal](../engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать». [Anima image cap32/prefix](../engineering/phase-2c-anima-image-batch-cap-research.md):76/4/12/2, preserved32 candidates on confirmed33 refusal. [Anima image MAX→0](../engineering/phase-2c-anima-image-seed-wrap-research.md): Installed Anima image MAX→0: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 wholeRGBA matches с собственными numeric MAX/0 controls и 2 same-prompt contrasts. Frozen worker inputs сохраняют MAX→0 actual/step/posterior seeds и compiled weighting; 6 cursor/Save snapshots и 8 portable provenance сохраняют raw weighted text, actual seed и resource/source context. Три OUT previews сохраняют 166656 protected source pixels. Independent raw reader PASS (18700 checks); actual Main modulo fault: 18 executions, 2 RED / 16 GREEN. Все 584 copied source members restored and guarded-cleaned. Только Euler256/N3/two updates/exact ресурсы; cross-pair wrap/cap32/new installed mutation/quality/Invoke parity/fullMVP/release не заявлены. [Installed Anima image Reuse после crash](../engineering/phase-2c-anima-image-reuse-crash-research.md): Euler256 IMG/normal mixed-alpha OUT,22 admissions/18 completions/4 APP_RESTART/18 accepted layers/2 Save-reopen packages,16 Reuse+2 recovered own fullRGBA matches. Home Recover сохраняет source/candidate/cursor B; public Reuse/value null, hidden recovered Fixed layer и8 fresh Reuse layers сохранены вместе с source. Source-only Save snapshot null; final(B+7),10 layers/9 provenance,18 owning comparisons; OUT55552 protected pixels. Исключённый первый native3/1/2cancel/0accepted учтён отдельно; raw total25/19/6cancel/18accepted. FullMVP/quality/Invoke parity/release не заявлены. [Installed Anima image Random → Fixed](../engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | broader inputs/geometry/method-policy/Advanced/quality/release; Smart Patch variants/index                                                                                                                                                                                   | 2B–2C, 4        |
| Preset Manager      | [Production storage/API](../engineering/phase-3-preset-storage-research.md); [manager UI](../engineering/phase-3-preset-manager-research.md) подключает manual create/edit/duplicate, section editing, Deleted/Restore и guards через native API; [Project Apply](../engineering/phase-3-preset-apply-research.md) добавляет detached preview, selected diagnostics и одну Main history mutation; [Save Current](../engineering/phase-3-preset-save-current-research.md) подключает acknowledged Project source draft после synchronization, без flush/seal, immutable source banner, seed/batch omission, явный unknown Workflow и feedback для incomplete fields; qualification results описываются в checkpoint; [New Project customization](../engineering/phase-3-new-project-preset-research.md) подключает detached active TXT source через shared editor, selected-only validation и initialization до первой `.igs` write с clean history; missing selected refs предупреждают без блокировки Create; New Project qualification: 221 focused tests/9 native scenarios, с границами в checkpoint; [Accepted Raster result](../engineering/phase-3-result-preset-research.md) connects saved expanded prompts/portable settings through worker-independent read to detached Create; source and library unchanged.; [Project Apply Models handoff](../engineering/phase-3-preset-model-handoff-research.md) adds exact edited diagnostic routing, preserved raw/mask/expanded draft and guarded refresh/return. [Installed EPS/V Apply](../engineering/phase-3-installed-presets-research.md): 8 native completions, 4 manual controls и 4 accepted Save/reopen/comparison/result-preset chains в объявленном finite recipe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Smart Patch source/target (phase 4); other-context handoffs (phase 5)                                                                                                                                                                                                        | 3               |
| Image export        | Контракт bounds/sRGB; production Save Candidate Image с повторной проверкой PNG, отдельным file export и native Save/Cancel evidence; staging и Project остаются неизменными                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Export As, Export Generation BBox; worker→main→file checks                                                                                                                                                                                                                   | 2B, 4           |
| Релиз и app updates | Продуктовые контракты                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Artifact/install/repair/rollback, GPU qualification, ручной Electron updater, clean install/upgrade evidence                                                                                                                                                                 | 5               |

Проверяемые точки входа: [Electron App](../../src/renderer/App.vue),
[Home](../../src/renderer/components/HomeView.vue),
[Model Manager](../../src/renderer/components/ModelManager.vue),
[Project](../../src/renderer/components/ProjectView.vue),
[Project service](../../src/main/projects/project-service.ts),
[worker protocol](../../worker-python/src/imagegen_worker/protocol.py).
Для сквозных проверок — [desktop smoke](../../scripts/smoke-desktop.mjs);
результаты прогона и подмены указаны в evidence-документах, а не выводятся из
самого наличия тестов.

Dev worker намеренно не подключается при `app.isPackaged`. Production Main
теперь разрешает установленный app-owned CPU worker для Save, импорта растра,
Rebuild Preview и read-only composition; отсутствие или отказ worker сохраняет
документ с честным placeholder. Реальный development runtime можно provision
в изолированную app-data директорию, но release Install/Repair ещё заглушки.
Source-checkout smoke не подтверждает устанавливаемый релиз, живой CivitAI
download, системный keyring или inference на GPU. Отдельный installed native
checkpoint ниже подтверждает четыре trained CUDA сценария через реальные
production UI/IPC/worker/storage paths. Прототипные managers, queue/staging и
Canvas tools не считаются production-реализацией.

## Документационный трек перед production-разработкой

Vue/Naive prototype уже закрыл базовую интерактивную проработку Home, Model
Manager и presets. Перед production renderer/main-process реализацией нужно
закрыть оставшиеся детали и довести worker/storage contracts до исполнимого
уровня, сохраняя различие между prototype mocks и production evidence.

### Шаг 1. Зафиксировать принятые продуктовые решения во всех контрактах

Основные архитектурные решения уже находятся в [реестре](../open-questions.md#уже-закрытые-решения):
Linux/NVIDIA, Illustrious и Anima, единый Invoke-like inference pipeline внутри
MVP, LoRA, worker-created previews, `safeStorage`, очередь и lifecycle удаления.
Model Manager показывает суммарный объём Anima checkpoint и закреплённых
Qwen3/VAE до скачивания; установка группы не доказывает структурную
совместимость для Generate. Удалённые пресеты доступны для
восстановления 30 дней, затем автоматически очищаются. Блокирующих продуктовых
решений в принятом функциональном MVP scope сейчас нет. Для первого релиза
приняты проверка обновлений Electron-приложения только по нажатию
`Проверить обновления` и отдельная явная установка найденной версии;
их delivery mechanism выбирается в фазе 5. Новые обнаруженные варианты
поведения записываются в [реестр](../open-questions.md), а не выбираются при
реализации молча.

Результат: ни один пользовательский сценарий первого среза не опирается на
догадку при реализации.

### Шаг 2. Довести существующий feature catalog и worker contract

[Каталог фич](../features/README.md) уже существует. Перед production worker
дополнить source map для закреплённой версии Invoke reference, per-family
capability matrix, Anima component dependencies, типизированные request/response
DTO, pre-enqueue rejection несовместимых input и проверяемые acceptance
criteria. Отдельный packaging spike выбирает и доказывает Linux/NVIDIA delivery
между relocatable bundle и app-managed Python + offline wheelhouse по
[runtime contract](./07-python-runtime-management.md). До реализации каждого
этапа обновляем source map в пределах его операций, не пытаясь заранее
переписать весь Invoke.
До queue expansion в фазе 2C определить production batch cap для dynamic
prompts по capacity tests и показать его в UI; число из prototype не
переносится автоматически.
Внешние готовые решения можно изучать для UI, storage и runtime mechanisms,
но альтернативный inference engine не проектируется.

Результат: feature contracts описывают итоговое пользовательское поведение, а
worker protocol — точную границу TS domain logic и Python inference;
проверенный artifact format можно реализовать без client-side dependency
resolution. Нерешённая инженерная деталь не заменяется догадкой в коде.

## Фаза 0. Каркас приложения

**Зависимости:** документационный трек для IPC, storage и runtime boundary.

Изменения выполняются по [research](../engineering/research-protocol.md) и
[review](../engineering/review-protocol.md) protocols согласно риску.
При первой реализации `.igs` Save/recovery провести PP-007 research pilot с
реальными filesystem failure/reopen checks. При реализации `Open in Models`
handoff из Project Apply провести PP-006 review pilot с red→green tests без
ослабления assertions. Пилоты и критерий создания собственного review skill описаны в
[Engineering workflow](../engineering/README.md#пилоты-и-дальнейшая-автоматизация).

- Vite + Vue 3 + TypeScript.
- Electron main/preload/renderer.
- Naive UI и базовая тёмная тема.
- `Home` tab shell according to [Home Screen](../features/home-screen.md).
- Typed `window.api` без прямого доступа renderer к Node.js.
- SQLite init, migrations, app data directory.
- App-owned `runtime/`, `cache/` и logs roots без зависимости от системного Python или global packages.
- Runtime manager boundary для versioned environments, active-runtime pointer и install-operation lock.
- Экран состояния/установки/repair runtime и ошибки совместимости внутри
  основного окна, доступный даже без рабочего Python; установка пока может
  быть заглушена на уровне production service boundary.

**Выходная проверка:** приложение запускается без системного Python, Home
открывается, повторный запуск фокусирует тот же instance, renderer получает
состояние runtime и типизированную ошибку через безопасный API. Второе
launcher-окно не появляется. Наличие shell не доказывает готовность worker.

### Текущий baseline реализации фазы 0 (25.09.2026)

В рабочем дереве созданы Electron main/preload/renderer, одно основное окно с
Home shell, app-owned paths и SQLite bootstrap с `STRICT` migration. Typed
runtime API находится в `src/shared/api.ts`, `src/preload/index.ts` и
`src/main/index.ts`; `src/main/runtime/index.ts` создаёт app-owned roots и
проверяет active-runtime pointer, не обращаясь к системному Python. Проверки
`pnpm run app:typecheck` и `pnpm run app:test` прошли локально: 10 тестов,
0 ошибок, включая повторное открытие SQLite, rollback failed migration,
отклонение повреждённого runtime pointer и typed ошибки install/repair.
`pnpm run app:smoke` собрал и запустил настоящий Electron: Home, preload IPC,
закрытие/повторное открытие Home с клавиатуры и повторный запуск с тем же
`XDG_DATA_HOME`, но другим `XDG_CONFIG_HOME`, работают при одном окне.
Повреждённый `runtime/` не блокирует Home: renderer получает `needs-repair`.

Это evidence для начального каркаса, а не подтверждение готового runtime или
полного Home flow. `install` и `repair` пока возвращают
`RUNTIME_INSTALL_UNAVAILABLE`: проверенного runtime artifact, Python worker,
self-test и реальной установки ещё нет. Home показывает каркас и placeholder;
навигация по проектам и файловые действия остаются следующей итерацией
параллельно фазе 1. Install-operation lock ещё не реализован: текущие команды
не мутируют файлы и возвращают ошибку; lock обязателен перед реальной
установкой в фазе 2A. В автоматическом smoke подтверждены событие
`second-instance`, одно окно и вызов focus-обработчика в коде; фактический
фокус оконного менеджера на Wayland не измерялся.

## Фаза 1. Model Manager

Подробный user flow и scope зафиксированы в [Model Manager](../features/model-manager.md).

**Зависимости:** фаза 0 и модель SQLite/IPC; installation не должен ждать
реализации полного inference pipeline.

- Настройка CivitAI API token.
- Импорт модели по CivitAI URL.
- Получение metadata и preview перед скачиванием.
- Любой поддерживаемый CivitAI Illustrious/Anima `.safetensors` checkpoint
  проходит preview-first установку. Каждый custom Anima checkpoint, закреплённые
  Qwen3 encoder и VAE предлагаются одной подтверждаемой группой; это не
  доказывает структурную совместимость checkpoint для Generate. Условия весов
  показываются для каждого источника группы; базовые веса Anima имеют отдельную
  некоммерческую лицензию и не входят в дистрибутив приложения.
- model install/download pipeline с временным файлом и очередью внутри Model Manager, без отдельной Download Manager surface.
- Проверка size/hash, если данные доступны.
- Хранение source-owned metadata отдельно от пользовательского Illustrious
  `predictionType` override по точным SHA-256 и размеру файла. Единственный
  editable control находится в Model Manager. Если значение не подтверждено,
  `epsilon` предлагается там как редактируемое предположение; Project показывает
  текущий тип read-only. `.igs` non-null и старый `null` — advisory snapshots:
  Prepare повторно хеширует файл и берёт текущий effective type без переписывания
  `.igs`. Если override сменился до materialization, требуется новый Prepare.
  SHA-256 остаётся identity и
  integrity check, не allowlist. Anima использует отдельные rectified-flow
  capabilities и закреплённые Qwen3/VAE, без SDXL prediction mode.
- Запись Model / ModelVersion / LocalModelFile в SQLite.
- Обнаружение доступных CivitAI-версий и явный `Update available` state.
- Preview и установка новой exact version рядом с уже установленными версиями.
- Явный `Set Default` только для новых selections без изменения existing references.
- Hard remove установленного ресурса остаётся обязательным MVP-пунктом.
  Его реализация с проверкой jobs, Presets и provenance назначена фазе 4 после
  появления этих владельцев; текущая установка/repair не закрывает lifecycle.
- [Local resource previews](../engineering/phase-2c-resource-previews-research.md): existing CPU worker создаёт sRGB WebP512/96,
  Main проверяет/cache-публикует и отдаёт exact-version изображения в manager и
  Project picker. Cached artwork доступен offline без worker. Operational
  Prepare/Generate только читает cache; UI catalog/import строит недостающее.
  Недоступный thumbnail не меняет installation/Generate readiness. Legacy
  ambiguous multi-version URLs остаются fallback, packaged delivery — release gap.
- Интерактивный prototype flow и regression coverage для version discovery,
  side-by-side install и default-version switching. Этот mock flow уже проверяет,
  что смена default не переписывает существующие exact references.

**Выходная проверка:** модель можно установить локально, увидеть после restart,
безопасно добавить другую версию и выбрать default. Отмена и ошибка проверки
файла не оставляют установленную версию; custom Anima checkpoint публикуется
вместе с проверенными закреплёнными Qwen3/VAE, но Generate отдельно проверяет
структуру checkpoint и компонентов. Существующие
Project/Preset/provenance refs не переписываются; их сквозная проверка с реальными
файлами — в фазах 2–3. PP-004 остаётся неполным до worker/load и Project picker.
Если Linux `safeStorage` даёт `basic_text` или secure provider недоступен,
token не сохраняется plaintext и требующий его импорт блокируется с объяснением.

**Текущий implementation checkpoint:** production Electron Model Manager уже
имеет локальную CivitAI URL-установку, проверку и восстановление файлов, версии,
очередь и явную смену default; Anima checkpoint ставится с закреплёнными
Qwen3/VAE, а `.pth` upscaler сохраняется без исполнения файла в main process.
SQLite/filesystem и Electron IPC проверены локальными тестами, а version flow в
Vue-прототипе — Playwright. Production Project теперь выбирает установленный
checkpoint и точную версию через main-verified registry и сохраняет reference
в `.igs`; смена default не заменяет существующий выбор. Живую загрузку с
CivitAI, полный Anima download и загрузку моделей worker эти проверки не
подтверждают. По этой причине PP-004 остаётся неполным до следующих фаз.

**Staging publication correction (05.10.2026):**
[Owned hardlink finalization](../engineering/model-install-staging-publication-research.md)
переносит удаление staging links и sync каталога до SQLite readiness для
install/repair, сохраняя строгий selector, Cancel и rollback. Это устраняет
проверенную гонку ctime после успешной установки. Четыре regression controls,
80 полных model tests и пять semantic mutations прошли; реальные power cut и
fsync fault не моделировались. Полный lifecycle/release остаётся открытым.

## Фаза 2A. Runtime, Project document и реальное сохранение

**Зависимости:** фаза 0, готовые `.igs` schema/commands из
[storage](./03-data-storage.md) и [document lifecycle](../features/project/document-lifecycle.md),
выбранный Linux/NVIDIA artifact и DTO для image derivatives.
Model Manager может развиваться параллельно, но реальный выбор модели нужен
к фазе 2B.

- Создать Python project с `pyproject.toml`, committed `uv.lock`, BasedPyright и
  Ruff. Установить собственный exact CPython и проверенный Linux/NVIDIA
  runtime artifact через встроенный setup/repair: versioned staging,
  self-test, атомарная активация, previous known-good rollback. Системный
  Python, пользовательский `PATH`, client-side dependency resolution и
  `sdist` не используются.
- Запустить минимальный Python worker для image derivatives через versioned
  protocol. Для Save он строит `preview/thumbnail.webp` и
  `preview/merged.png` из immutable visible-composite input. Main проверяет
  output; worker не пишет `.igs` или SQLite. Для пустого Project или
  недоступного worker main включает bundled статические placeholders без
  запуска отдельного preview worker.
- Реальный `.igs` Project tab с бесконечным Canvas, независимым primary bbox,
  Raster Layer stack и минимальным Konva-отображением. Main фиксирует ревизию,
  bbox и ассеты видимых Raster Layers; отдельная worker-команда строит точный
  finite RGBA target для будущей генерации. Это raster-only input preparation,
  а не запуск inference или публикация результата; полный набор инструментов —
  фаза 4.
- Явный Save собирает и валидирует временный `.igs`, атомарно заменяет файл и
  синхронизирует производный Home index только после успеха. Reopen и перенос
  проекта не зависят от старого SQLite index/cache.
- Dirty state, close dialog, shadow autosave и Recover/Discard Recovery
  работают на реальных файлах. Document shadow и staging recovery имеют разные
  lifecycle; Save не принимает временные результаты.
- Основное окно и Project открываются при недоступном worker для
  диагностики/repair. Save по-прежнему сохраняет полный документ, отмечает
  `preview.status=unavailable` только для проекта с видимыми raster pixels и
  включает обязательные placeholders; пустой Project остаётся `empty`.
  Следующий явный Save с рабочим worker восстанавливает актуальные previews.
  Чистый Project может вызвать `Rebuild Preview` из Home без фиктивной правки;
  это явная атомарная операция над `.igs`, а dirty Project сначала Save.

**Выходная проверка (PP-007):** приложение без системного Python устанавливает
runtime, а Save создаёт валидный `.igs` с актуальными embedded previews при
рабочем worker или с явно помеченным placeholder при его отказе.
Пакет читается настоящим loader после переноса без исходного index/cache;
отказ worker не блокирует Save и не теряет document assets. Проверить отдельный
`Rebuild Preview` после восстановления worker на чистом Project, включая
конкуренцию с Save и отказ worker без потери старого пакета. Отказ записи,
валидации или замены сохраняет прежний читаемый файл, dirty state и shadow.
Crash recovery открывает shadow для проверки, не перезаписывая основной файл.
Неудачный runtime update не ломает предыдущий worker.
Выполнить [PP-007 research pilot](../engineering/README.md#пилоты-и-дальнейшая-автоматизация).

**Текущий checkpoint Phase 2A (27.09.2026):** production Home/Project IPC,
`.igs` Save/reopen, document shadow recovery, Raster Layer controls и PNG import
проверены на реальных файлах. Source-checkout `derivatives-only` worker теперь
создаёт embedded PNG/WebP Project previews при явном Save: Electron smoke
проверяет world-space rect и декодированные пиксели после повторного чтения
`.igs`; отказ worker сохраняет документ с `unavailable` placeholder.
Home показывает проверенные embedded thumbnails через пересобираемый cache;
явный `Rebuild Preview` для чистого Project восстанавливает превью без изменения
document revision, asset bytes и recovery. UI→IPC→worker→`.igs`→Home проверен
Electron smoke. Подробное evidence — [Phase 2A research](../engineering/phase-2a-project-storage-research.md#home-thumbnails-and-clean-preview-rebuild).
Для normal-generation raster target добавлена отдельная подготовка входа:
main копирует видимые asset bytes из текущего snapshot в app-owned scratch,
а source-checkout worker создаёт PNG ровно по frozen primary bbox с исходной
прозрачностью и определяет `txt2img`/`outpaint`/`img2img` по финальной alpha.
Main валидирует выход; это не запись в `.igs` и не рабочая генерация. Проверки
и границы результата перечислены в [Phase 2A research](../engineering/phase-2a-project-storage-research.md#frozen-raster-generation-target).
Узкий Project slice подключает к production UI и typed IPC
редактирование project-owned `generationDraft`: обычный текст позитивного и
негативного prompt, а также политику Seed `Fixed`/`Random`/`Reuse` и значение
`Fixed`. Изменения проходят через документный dirty/shadow/Save/reopen path.
На том checkpoint main только удалял прежний embedding ref, если его буквальный
token исчез. [Phase 2C embedding authoring](../engineering/phase-2c-embedding-authoring-research.md)
теперь добавляет проверенные exact refs через autocomplete/уникальный canonical
ввод; текст и refs используют тот же document history/shadow/Save path.
Electron smoke проверяет немедленный Save→`.igs`→reopen и Save после native
window close: последний ввод prompt не теряется в очереди IPC.
Связь с Model Manager добавляет выбор точной установленной версии checkpoint:
renderer отправляет только ID ресурса/версии, main заново проверяет файл и
Anima-компоненты и сохраняет exact ref с SHA/metadata. Electron smoke проверяет
выбор, смену Default без подмены сохранённой версии, явное переключение версии,
Save/reopen и диагностику отсутствующего файла. Worker ещё не загружает модель.
Копия `.igs` с устаревшими локальными ID теперь может явно привязать тот же
установленный checkpoint по CivitAI model/version/file ID, SHA-256 и семейству:
main проверяет точный файл, меняет только локальные ID и сохраняет правку через
dirty/shadow/Save. Сервисные тесты используют две SQLite-библиотеки, Electron
smoke проверяет импорт→Link→Save/reopen. Это не загружает веса в worker.
Production Project также редактирует Steps и CFG scale в существующем
`generationDraft` без навязанного model-specific default. Эти значения проходят
через тот же dirty/shadow/Save и повторное открытие `.igs`; их принятие
inference worker остаётся отдельной задачей Phase 2B/2C.
На этом историческом checkpoint выбор `Reuse` ещё не означал доступный
фактический seed: operational cursor и fallback к сохранённому `.igs` snapshot
были подключены позднее в фазе 2B. Редактирование draft их не обновляет.
Это не закрывает фазу: installable Linux/NVIDIA runtime остаётся задачей Phase
2A. Generation staging recovery, полный frozen job DTO, очередь, inference
и acceptance относятся к Phase 2B; document shadow recovery уже реализован.

## Фаза 2B. Очередь и первая сквозная генерация

**Зависимости:** 2A, установленная Illustrious-модель из фазы 1, исполнимые
generation DTO и source map из документационного трека.

- Расширить worker до долгоживущего inference process. Main process готовит
  immutable input и владеет файлами/очередью; worker выполняет model loading,
  conditioning и denoising. Реально загрузить установленный exact Illustrious
  checkpoint и показывать несовместимость, которую metadata не могла доказать
  при установке. До enqueue main повторно проверяет SHA-256 выбранного файла,
  структуру/компоненты и совместимость worker; при Prepare берёт current
  Illustrious `predictionType` из Model Manager и замораживает его. Смена override
  до materialization прерывает подготовку и требует повторного Prepare.
  Наличие SHA-256 в app-owned manifest не является
  условием Generate; worker обязан использовать выбранный тип без silent fallback.
- SQLite-backed Queue Manager в main process, frozen job payloads и
  progress/done/error events. Cancel pending/running, retry failed/canceled и
  delete/prune terminal rows не затрагивают валидный staging manifest.
  Первый реальный job — Illustrious `txt2img` через Invoke-like pipeline и
  versioned TS↔Python protocol.
- Main process проверяет provisional worker output и атомарно публикует
  завершённый candidate в отдельном staging recovery store. Canvas показывает
  preview по frozen bbox; пользователь явно принимает его как Raster Layer
  с immutable provenance и одним Project-local undo step. Принятые assets
  сначала переходят в document/shadow; main `.igs` меняется только при явном
  Save или explicit preview rebuild чистого Project. Только принятый
  результат попадает в производную историю.
- `Save Candidate Image` экспортирует валидные pixels отдельным явным
  действием, в том числе для orphaned candidate; не принимает candidate в
  Project и не удаляет его recovery record.
- После durable candidate publication и validated completion сохранить
  фактический seed в отдельном Project-scoped recovery cursor атомарно с
  queue completion; после сбоя reconciliate незавершённую транзакцию. Cancel,
  failure, discard candidate и prune queue row не подменяют и не откатывают
  cursor.
- При graceful close Project pending/running jobs отменяются и staging
  отбрасывается после подтверждения; после crash старые unfinished jobs
  получают `canceled`, валидные completed candidates восстанавливаются даже
  после успешного Save. Повторный late event не оживляет закрытую сессию.

**Подготовительный checkpoint:** main может собрать
[проверенный контекст](../engineering/phase-2b-generation-preparation-research.md)
одного Illustrious `txt2img` из замороженного Project target, точной локальной
версии checkpoint и конкретного Fixed/Random seed. На этом раннем этапе ещё
не было очереди и worker DTO; последующие checkpoints ниже расширяют границу.

**Request checkpoint:** [Illustrious `txt2img` boundary](../engineering/phase-2b-illustrious-request-research.md)
проверяет sampler/scheduler, CFG, размер, prediction type и capability, временно
материализует target PNG и формирует версионированный запрос. Python
`derivatives-only` worker распознаёт его, но отвечает `INFERENCE_UNAVAILABLE`;
этот scratch lease не является долговечным input или завершённой генерацией.

**Исторический durable enqueue checkpoint:** [точный manifest](../engineering/phase-2b-model-compatibility-manifest.md)
квалифицирует один официальный Illustrious v0.1 checkpoint по вычисленным
SHA-256/размеру и авторскому prediction type. Позднее allowlist gate заменён:
ModelService берёт тип из пользовательской настройки точного файла, затем из
manifest либо из помеченного `epsilon` assumption и повторно проверяет bytes
перед Prepare. [Generation input и SQLite queue](../engineering/phase-2b-durable-enqueue-research.md)
сохраняют один замороженный Illustrious `txt2img` как app-owned input и
`pending` row; Electron startup отменяет старые `pending`/`running` rows и
сверяет orphan input directories.

**Queue lifecycle и candidate publication checkpoint:** Project позволяет
выбрать sampler/scheduler из явных пар для первого Illustrious slice без
скрытого default; выбор проходит IPC, shadow и `.igs` Save/reopen. Queue
repository проверяет frozen input до claim, удерживает единственный running
слот при запросе отмены до подтверждённого выхода worker и защищает failure
от устаревшей sequence. [Candidate publication](../engineering/phase-2b-candidate-publication-research.md)
валидирует sRGB PNG, публикует app-owned manifest/asset раньше SQLite
completion и actual-seed cursor с проверкой той же sequence, а затем
восстанавливает этот crash window при Electron startup. Это всё ещё
внутренний repository/bootstrap boundary: renderer Generate,
реальный worker dispatch/GPU pipeline, Queue Manager UI, staging preview/acceptance,
retry/prune, quota/discard и подключение `Reuse` остаются незавершёнными.
Предусловие processor для отмены закрыто на уровне worker client:
`ProjectWorkerClient.close()` ждёт наблюдаемого завершения дочернего процесса
после `SIGTERM` или эскалации до `SIGKILL`. Если `exit` не подтверждён за
отдельные 2 секунды после `SIGKILL`, вызов завершается ошибкой
`WORKER_EXIT_UNCONFIRMED`; повторный вызов может дождаться позднего выхода или
повторить сигнал. [Приватный processor](../engineering/phase-2b-generation-processor-research.md)
проверяет успешное queue/staging recovery до claim, повторно сверяет exact
checkpoint и замороженный target, связывает ответ worker с request и передаёт
проверенный output в staging. При отмене он удерживает running slot и scratch
до подтверждённого выхода worker; при неподтверждённом выходе оставляет owner
для повторной отмены. Неверный PNG без publication receipt переводит job в
`failed` после остановки worker, а receipt с неопределённым исходом остаётся
для restart reconciliation. Этот processor пока проверен через подставной
inference transport; renderer Generate нет.

**Development inference checkpoint (28.09.2026):** [первый GPU boundary](../engineering/phase-2b-inference-worker-research.md)
добавляет SDXL structural preflight до Prepare, отдельный JSONL transport с
подтверждённым выходом процесса и узкий Linux/NVIDIA worker для короткого
plain-prompt Illustrious `txt2img`. Локальный offline smoke проверил настоящий
checkpoint, CUDA, TypeScript → Python и provisional sRGB PNG. Derivatives-only
worker по-прежнему не объявляет inference capability. Runtime installer ещё не
поставляет ML-зависимости и закреплённый SDXL config; Electron не создаёт этот
transport/processor. Raw Diffusers prompt не покрывает Invoke conditioning,
LoRA и прочие входы MVP, поэтому этот checkpoint не открывает Generate в UI.

**Следующий внутренний checkpoint (28.09.2026):** [Project → queue → staging и
dual-CLIP conditioning](../engineering/phase-2b-internal-handoff-and-conditioning.md)
проверены отдельно. Оркестратор связывает открытый Project, exact model и
восстановленные queue/staging repositories через реальную SQLite и файловую
систему; inference output в этом тесте подставной. Локальный GPU smoke
проверил Compel conditioning для взвешенного и длинного prompt; отдельная
GPU-проверка подтвердила маску padding в UNet при разной длине положительного
и негативного conditioning. RuntimeManager
может проверить app-owned worker через live handshake, но installer/release
artifact всё ещё отсутствуют. Electron не вызывает оркестратор; renderer
Generate, LoRA inference, acceptance и provenance ещё не готовы.

**Owned dispatch и retained recovery checkpoint (28.09.2026):**
[внутренняя граница](../engineering/phase-2b-owned-dispatch-and-recovery.md)
удерживает восстановленные queue/staging и их processor/orchestrator на время
работы Electron. RuntimeManager резервирует один qualified generation worker
до подтверждённого выхода процесса; отдельный внутренний coordinator исполняет
один pending job и останавливает его при shutdown. Project-scoped список
незавершённых jobs на этом checkpoint был только read-only. Тогда coordinator
ещё не был создан в Electron; следующие checkpoints ниже закрывают эти два
пробела. Generate IPC/UI остаётся следующим этапом.

**Electron shutdown checkpoint (29.09.2026):**
[проверка app lifecycle](../engineering/phase-2b-electron-shutdown.md) подключает
один coordinator к восстановленным generation services и настоящему
RuntimeManager. Native close ждёт подтверждения worker exit, отменяет все
оставшиеся pending jobs и закрывает SQLite до закрытия окна; Cancel в диалоге
сохраняет очередь. Desktop smoke проверяет этот путь без Generate IPC.
Это был checkpoint до отдельного Project close; пользовательский Generate
по-прежнему не подключён.

**Per-Project close checkpoint (29.09.2026):**
[проверенный close boundary](../engineering/phase-2b-electron-shutdown.md#per-project-close-extension-проверенный-checkpoint)
связывает typed IPC, renderer confirmation, Project-scoped enqueue/claim fence,
отмену только своих unfinished jobs с ожиданием worker exit и долговечные
staging tombstones перед удалением ассетов. Чистый Project с jobs/candidates
тоже требует предупреждения; Save сам по себе staging не удаляет. Main повторно
проверяет impact под fence и не выполняет неподтверждённый discard, если
результаты появились после проверки renderer. При недоступном generation
storage отдельное предупреждение позволяет закрыть вкладку/окно, сохранив
неизвестный staging для восстановления. На рабочем дереве от `09bf0f9`
прошли 402 app tests, typecheck, lint и Electron smoke с clean Project
Cancel/confirm и degraded recovery close; см. границы evidence в checkpoint.
Generate/Results UI, acceptance и provenance оставались открытыми на этом
checkpoint.

**Read-only Results recovery checkpoint (29.09.2026):**
[проверенный Project view](../engineering/phase-2b-results-recovery-ui.md)
показывает локально восстановленный, верифицированный кандидат через typed IPC
и приватный PNG URL. Canvas рисует его в исходном bbox без добавления слоя.
Сквозной Electron smoke проверяет crash/restart, изображение, Save без принятия,
Cancel и подтверждённый discard при закрытии. Generate action, принятие
результата в `.igs`, provenance и полный inference pipeline всё ещё открыты.

**Save Candidate Image checkpoint (29.09.2026):**
[отдельная операция экспорта](../engineering/phase-2b-candidate-image-export.md)
даёт сохранить проверенный PNG временного результата через native Save dialog.
Main повторно сверяет кандидата после диалога; экспорт не принимает слой,
не меняет `.igs` и не удаляет staging. Существующий файл не перезаписывается.
Generate, acceptance, provenance и полный pipeline остаются следующими
подэтапами фазы 2B/2C.

**Accepted Raster provenance storage checkpoint (29.09.2026):**
[строгая запись происхождения](../engineering/phase-2b-accepted-provenance-storage.md)
для первого Illustrious `txt2img` теперь имеет переносимый тип, parser и
проверяемое отображение из frozen staging context без локальных путей. Поле
опционально для старых Raster Layers; package Save/reopen и dirty shadow
сохраняют его вместе со слоем. Это основа для Add, а не готовое принятие:
production UI, идемпотентный staging → shadow handoff, Project Undo/Redo и
производная история ещё не подключены.

**Explicit Raster acceptance checkpoint (29.09.2026):**
[документированный handoff](../engineering/phase-2b-raster-acceptance-research.md)
связывает production Results tray, typed IPC, verified staging PNG, frozen
Illustrious context, Raster provenance, Project recovery shadow и явный Save.
Выбор нескольких результатов из разных staging sessions создаёт одно изменение
документа; shadow подтверждается до точечного tombstone, а повтор не создаёт
дубликаты. Project-local Undo/Redo foundation сохраняет 64 снимка и ассеты для
Redo после Save. [Production Project Undo/Redo](../engineering/phase-2b-project-undo-research.md)
подключает typed IPC, grouped prompt focus sessions, toolbar/shortcuts и очистку
недостижимых исторических ассетов. Ранний Add при незавершённых jobs, Smart Patch variants, derived
SQLite history, обычный Generate и полный pipeline остаются следующими шагами.
На этом историческом checkpoint crash в окне между shadow commit и tombstone
оставлял непринятые сессии для проверки: полный cleanup требовал durable
acceptance journal. Следующий journal checkpoint ниже закрывает этот пробел.

**Project Undo/Redo checkpoint (30.09.2026):**
[сквозной Project history](../engineering/phase-2b-project-undo-research.md)
подключает per-tab историю к typed IPC и Electron Project: Undo/Redo доступны
через кнопки, Edit и клавиатуру, Clear History — в настройках проекта.
Редактирование prompt группируется от focus до blur при сохранении
инкрементального recovery shadow. Принятие нескольких Raster candidates остаётся
одним шагом; Redo проверяет исторические ассеты, а вытесненные состояния
освобождают больше не нужные копии. История не входит в `.igs` и не переживает
закрытие вкладки. Это не подтверждает остальные Canvas gestures, Smart Patch
variants, ordinary Generate или release runtime.

**Queue history lifecycle checkpoint (30.09.2026):**
[проверяемый frozen retry и terminal cleanup](../engineering/phase-2b-queue-history-research.md)
добавляют на уровне main repository повтор failed/canceled job как новую
попытку с отдельной staging session и удаление/очистку terminal queue rows.
SQLite CAS не допускает дублирования одного устаревшего retry; `reserved`
candidate receipt удерживает исходную строку для recovery. Удаление истории
не удаляет completed candidate или actual-seed cursor. Renderer Queue Manager,
пользовательский Generate и полный release inference pipeline ещё не подключены.

**Seed Reuse checkpoint (30.09.2026):**
[document-scoped cursor, внутренний Prepare/enqueue и Save snapshot](../engineering/phase-2b-seed-reuse-research.md)
связывают completed actual seed с конкретным `.igs` `documentId` при том же
локальном пути. Renderer показывает cursor через Results IPC; при его
отсутствии внутренний Prepare использует saved snapshot либо явно блокирует
`Reuse`. Save записывает snapshot в `.igs` без dirty/Undo, включая recovery
shadow для конкурентной правки. Это не подключает кнопку Generate в Electron
и не подтверждает полный batch scheduler или release inference runtime.

**Acceptance journal checkpoint (30.09.2026):**
[durable intent и точный cleanup после crash](../engineering/phase-2b-acceptance-journal-research.md)
сохраняют captured session set до Add, затем требуют immutable accepted-layer
proof и synced shadow/проверенный `.igs`. Tombstones этих сессий и завершение
journal записываются одной SQLite-транзакцией. Recovery очищает также
невыбранные результаты исходного Add, сохраняя более новые сессии и другой
документ по тому же пути. Неприменённый или полностью отменённый Add не даёт
права удалить кандидаты; partial/изменённая lineage требует явного recovery.
На этом историческом checkpoint Early Add ещё отсутствовал; следующий
checkpoint закрывает его confirmation/cancel boundary для общей сессии.
Renderer Generate, production batch grouping, Smart Patch variants и release
runtime оставались открытыми на этом историческом checkpoint.

**Confirmed early Raster Add checkpoint (30.09.2026):**
[точные reviewed candidate/job sets и отмена sibling jobs](../engineering/phase-2b-early-raster-acceptance.md)
подключены к typed Results IPC и native confirmation. Selected PNG/document
preflight предшествует scoped cancellation; processor подтверждает выход worker
до journal/document/shadow handoff. Новое завершение во время отмены требует
повторного подтверждения, неопределённый выход сохраняет fence до retry.
Другие сессии/Projects и документы по тому же пути не отменяются; успешное
принятие не включает необратимый close marker, поэтому admission можно открыть.
`.igs` меняется только при Save. Shared-session очередь в tests/smoke — заданное
предусловие; production `enqueueOne` создаёт отдельную сессию на job.
На этом историческом checkpoint общий durable batch/session ID на N jobs,
пользовательский Generate action и полный release pipeline ещё отсутствовали;
он не подтверждает GPU inference/runtime install.

**Qualified batch grouping checkpoint (30.09.2026):**
[атомарная группа уже qualified concrete jobs](../engineering/phase-2b-batch-grouping-research.md)
создаётся через внутренний `enqueueBatch`: один frozen Project snapshot,
общие batch/session IDs, synced per-job inputs и единая SQLite-транзакция.
Обязательный preflight проверяет новую сессию и escaped manifest до публикации;
64 candidates, 128 KiB payload и 8 MiB manifest остаются recovery ceilings,
не измеренным public batch cap. Неопределённый commit сохраняет файлы и блокирует
admission/dispatch этого Project до startup recovery. Integration test проходит
создание группы → completion → Results siblings → ранний Add → portable Save,
сохраняя независимый соседний batch. Конкретные prompts/seeds предоставлены
caller, внешний inference transport подставлен. Renderer Generate,
expansion/seed planning, Smart Patch и полный Linux/NVIDIA release pipeline
оставались открытыми на этом историческом checkpoint; Phase 2B ещё не завершена.

**Prepared batch planning/capacity checkpoint (30.09.2026):**
[bounded planner и замер persistent storage](../engineering/phase-2b-batch-planning-research.md)
добавляют внутренний путь от одной frozen preparation/разрешённой seed базы
через concrete prompt pairs и shared request lease к атомарному admission.
Порядок pairs/iterations, один Random выбор, Reuse `0`, uint32 wrap, caller
immutability и каждый transport envelope проверены. Новые accepted results
сохраняют selected seed behavior через Add и portable Save; legacy metadata
не дополняется догадкой. Capacity harness использует реальную очередь,
staging, Results и restart на persistent filesystem; источник pixels/model
qualification подставлен. 51 cases: 46 completed, 5 ожидаемых refusals, 0 errors;
начальный planner cap — 32 jobs, дополнительно действует byte preflight.
Это qualification локального storage, не GPU throughput или fleet guarantee.
На этом историческом planning checkpoint renderer Generate, dynamic
preview/settings и persisted draft options оставались открытыми.

**Persisted dynamic settings/preview checkpoint (30.09.2026):**
[Production draft и shared preview](../engineering/phase-2b-dynamic-preview-research.md)
добавляют toolbar entry с обеих prompts, concrete Cartesian pairs, ошибки
syntax/byte/count и явное truncation. Используется реальный pure planner,
одна iteration и shared cap32; Random/Reuse база не выбирается, jobs не
создаются. Strict optional settings сохраняют legacy absence и effective-default
no-op; реальные правки проходят typed IPC, Undo/Redo, shadow и portable Save.
593 app tests, typecheck, lint и native desktop/Results smoke прошли; новая
isolated snapshot mutation краснит два настоящих sync/service теста.
Native проверяет `.igs` Save/reopen и доступные controls/Close при 900×620.
Generate с images-per-click, model/transport qualification и полный
GPU conditioning/release runtime остаются открытыми. Phase 2B ещё не завершена.

**Qualified inference target checkpoint (30.09.2026):**
[Canvas preparation в том же inference child](../engineering/phase-2b-inference-target-composition.md)
добавляет strict `compose-target` route к worker0.2.0 и typed operation к
GenerationWorkerClient. Shared verifier сохраняет path/hash/ICC/geometry/alpha
проверки derivatives client; один runtime lease может готовить target и затем
выполнять inference без дополнительного child. Missing target capability
отказывает до отправки; response ID/type, serial exclusion и confirmed close
не меняют прежние generation guards. Проверены реальный ProjectService frozen
target, controlled child transport и Python compositor с настоящими PNG.
Это prerequisite пользовательского Generate, а не готовый Generate UI,
автоматический drain, очередь/current cancel, Keep/Discard или runtime installer.
Полная inference capability 2C и выходная проверка 2B остаются открытыми.

**Production Generate actions checkpoint (30.09.2026):**
[Fixed bar → frozen batch → serial queue/staging](../engineering/phase-2b-generate-actions-research.md)
подключает main/preload/renderer, retained raster capture до чтения impact/qualification,
transient count1..100 и cap32 planner, actual pending/running rows и current Cancel.
Каждый job получает новый qualified worker lease; подтверждённый worker exit
предшествует следующему job. Keep/Escape отменяет запуск, exact Discard+Generate
сначала сохраняет новый batch, затем очищает подтверждённые старые сессии.
Known preparation/queue refusal сохраняет старый PNG; uncertain cleanup отменяет
новые jobs и удерживает fence. Shutdown ждёт admission/drain до pending cancel/DB close.
Это узкий Illustrious txt2img срез: busy engine пока блокирует новый Generate,
а редактирование, Save и ранний Add остаются доступны. Release installer, полное
conditioning/Anima/LoRA, другие raster modes, Smart Patch и terminal Queue Manager
остаётся реализовать. Контролируемый transport/qualification peer не доказывает
CUDA readiness; фактические проверки и их границы записаны в research note.

**Production Queue Manager checkpoint (01.10.2026):**
[App-level history/actions](../engineering/phase-2b-queue-manager-research.md)
подключает все пять SQLite statuses, global counts, bounded newest pages,
frozen settings и timestamps, reviewed pending/current Cancel, qualified Retry
и confirmed terminal Delete/Clear. Retry сохраняет старые сессии и использует
тот же Project gate, что close/Add; changed document, checkpoint, staging
capacity и unknown publication проверяются до дальнейшего dispatch. Queue
cleanup не меняет candidates, cursor, accepted document, Undo или `.igs`.
Native controlled-worker checks подтверждают UI/preload/main/storage проводку;
На этом checkpoint result thumbnails/session navigation, busy-engine admission,
installer и полный GPU pipeline ещё не закрыты. Phase 2B остаётся незавершённой.

**Production denoising progress checkpoint (01.10.2026):**
[Worker → Project/Queue Manager](../engineering/phase-2b-generation-progress-research.md)
передаёт реальные выполненные denoising evaluations через отдельный transient
канал. Поддерживаются точные worker versions 0.2.0 без счётчика и 0.3.0
с обязательной capability; неизвестные версии не допускаются. Step events
не меняют SQLite sequence, staging, seed, Undo, dirty или `.igs`, не перечитывают
всю историю/результаты. Cancel синхронно очищает счётчик; завершение denoising
не принимает candidate. Phase 2B остаётся открытой: release installation,
полный pipeline, busy admission, thumbnails/session navigation. Следующий
checkpoint добавляет bounded thumbnails в Results.

**Production result thumbnail checkpoint (01.10.2026):**
[Worker → verified staging cache → Results tray](../engineering/phase-2b-result-thumbnails-research.md)
добавляет optional sRGB WEBP максимум 256px/256 KiB в том же inference child.
Finite matrix принимает 0.4.0 с обеими capabilities, сохраняя qualified 0.2/0.3.
Cache публикуется отдельно от authoritative PNG/manifest/receipt и подписывается
с source/cache hash; fresh GET проверяет текущий candidate и открытый Project.
Отказ кэша даёт selectable placeholder, полный PNG остаётся для Canvas/export/Add.
Queue pruning/restart сохраняет cache; discard/close отзывает доступ и включает
его в очистку сессии. При отказе filesystem физическая очистка откладывается.
Cursor,
provenance, Undo, dirty и `.igs` не меняются. Results previous/next и reviewed
cross-session Add сохраняют прежний scope; session filtering не добавлен.
Проверены реальные Pillow/SQLite/filesystem boundaries, две semantic mutations
и native cached/placeholder/recovery/acceptance flows с controlled peer.
Автоматический rebuild cache, Queue Manager previews/output-session navigation,
busy admission, полный pipeline и release runtime остаются открытыми. Phase 2B
ещё не завершена; этот checkpoint не является замером UI/storage performance.

**Production Queue result preview/navigation checkpoint (01.10.2026):**
[Exact job/session → verified result → Canvas](../engineering/phase-2b-queue-result-preview-research.md)
добавляет bounded thumbnails в completed Queue Manager rows/details и `View result`
для доступного candidate. SQLite DTO несёт session ID без файловых чтений;
renderer использует уже проверенные Results и прежние signed resource guards.
Fresh read и текущий document проверяются до одноразового focus/show/fit запроса.
Повторная навигация разворачивает strip, не меняя checkboxes активного Canvas;
обычный mount из Home/другой вкладки сохраняет существующий default selection.
Missing/corrupt cache даёт placeholder, закрытый Project — обычный Open Project,
ручной Refresh перечитывает Results/cache без event loop. Flat sessions и scope
reviewed Add остаются прежними; orphan preview разрешён, его Add ограничен.
Queue, `.igs`, bbox/layers, provenance, dirty/Undo и seed не меняются. Проверены
native UI/IPC/storage/Canvas, три сессии и async semantic mutation.
Session filtering, автоматическое продолжение после Open/recovery, accepted
history navigation, busy admission, полный pipeline и release runtime ещё открыты.

**Production busy Retry checkpoint (01.10.2026):**
[Frozen Retry during inference](../engineering/phase-2b-busy-retry-research.md)
допускает Retry failed/canceled job, пока другой job обрабатывается. Admission
получает только копию qualified ready живого worker; сохранённый PNG и exact
checkpoint проверяются без новой composition, команд текущему процессу или
второго CUDA child. Source revision, document/close gate, capacity и атомарная
публикация прежние; будущий dispatch снова квалифицирует собственный worker.
Wake защищает новую запись от гонки с idle observation. Старые candidates,
actual seed, dirty/Undo/provenance и `.igs` сохраняются. Busy Generate с подготовкой
нового Canvas остаётся открытым, как и полный pipeline/release runtime;
Phase 2B ещё не завершена.

**Production busy Generate checkpoint (01.10.2026):**
[New Generate during inference](../engineering/phase-2b-busy-generate-research.md)
готовит frozen Canvas через один CPU derivatives child из того же установленного
runtime, с CUDA скрытым. Новый Project/batch попадает в pending, пока текущий
inference продолжает работу; следующий GPU child запускается после confirmed
exit и завершения admission. Same-Project Generate сохраняет exact replacement
confirmation, late completion требует нового подтверждения, durable publication
предшествует отмене старых jobs. Document/close, checkpoint/capacity и runtime
fingerprint gates остаются; startup/normal unconfirmed CPU exit удерживает owner
и блокирует dispatch до retry. Shutdown прерывает CPU startup/request.
Dirty/Undo/accepted layers/seed/`.igs` не меняются. Native Electron проверяет
A/B enqueue, frozen inputs, Keep/Cancel/replacement с controlled peers; реальные
CUDA inference и release installation этим не подтверждены. Полный pipeline,
session filtering/continuation, accepted history и release runtime остаются
открытыми; Phase 2B ещё не завершена.

**Production result sessions checkpoint (01.10.2026):**
[Result sessions and Open/recovery continuation](../engineering/phase-2b-result-sessions-research.md)
группирует verified candidates независимо от prunable Queue history и добавляет
transient All/session filter. Thumbnails/previous-next ограничены видимой сессией;
checkbox mask и Add остаются глобальными, скрытый выбранный count показан явно,
полное подтверждение unchecked candidates/unfinished siblings сохранено.
Closed completed Queue Open сохраняет одноразовый exact job/session/source intent;
после обычного Open либо выбранного Recover — fresh Results read,
actual-document recheck и прежний show/fit/expand. Cancel, manual context/close,
replacement, failure и superseding requests отменяют продолжение. Explicit
Discard Recovery удаляет shadow и все временные результаты этого Project через
durable staging tombstones, открывает saved `.igs` и отменяет navigation intent;
ошибка до tombstones сохраняет shadow, physical cleanup может быть отложен с
warning. Other Projects, saved accepted assets, seed и operational queue history
сохранены. [SQLite lock safety](../engineering/sqlite-lock-safety-research.md)
исправляет file bootstrap, который снимал POSIX locks и скрывал новые pending
rows после secondary close/reopen; existing unsafe SQLite file permissions
требуют явного repair. No candidate
fallback, auto Recover/Add/Retry или durable preference. `.igs`, seed, accepted
Project, queue/staging и provenance не меняются от filter/navigation.
Accepted history, full pipeline и release runtime
на этом checkpoint остаются открытыми; Phase 2B ещё не завершена. Home RecoveryAvailable для
staging-only recovery без dirty shadow на этом checkpoint ещё не был подключён;
следующий checkpoint ниже закрывает этот пробел.

**Production staging-only recovery checkpoint (01.10.2026):**
[Staging-only recovery decisions](../engineering/phase-2b-staging-only-recovery-research.md)
использует verified staging candidates независимо от prunable Queue history и
dirty document shadow. Закрытый ready Project с completed Results получает
Home badge и Recover/Discard/Cancel до создания вкладки. Recover без dirty shadow
открывает saved `.igs` clean, без Undo/acceptance; точная Queue continuation
применяется только после решения и fresh проверки candidate. Discard использует
прежние confirmed cancellation и durable all-session tombstones перед удалением
shadow; Cancel оставляет Project закрытым. Managed Import проходит тот же gate.
Resolve проверяет актуальные candidates/open tabs. При absent/clean shadow
unavailable staging получает отдельную Home диагностику; saved Open/Import/Save/
rebuild остаются доступны с warning, неизвестные файлы не удаляются. Pending
document recovery сохраняет свой статус и decision прежде всего, с diagnostic;
valid dirty Recover остаётся доступным. Existing invalid/stale shadow precedence
сохранён. Native checks используют real Electron/IPC/SQLite/files и controlled
generation fixtures; это не proof полного GPU pipeline/release runtime.
Accepted history, Smart Patch acceptance, полный pipeline
и release runtime на этом checkpoint остаются открытыми; Phase 2B ещё не завершена.

**Production Project-local accepted-history checkpoint (01.10.2026):**
[Project-local accepted-result history](../engineering/phase-2b-project-accepted-results-research.md)
строится из current Raster Layer provenance, а не Queue/staging/Undo. Layers
toolbar открывает read-only `Accepted results`: copied exact checkpoint/version/
SHA, actual seed включая `0`, original generated size, acceptedAt и current signed
layer preview. Hidden layer отмечен явно; выбор записи выделяет и показывает
её строку в Layers, не меняя visibility/camera/bbox/document/seed. Context
проверяется по Project/document и текущему layer membership. Add создаёт записи,
Undo убирает их, Redo возвращает; Clear Undo history сохраняет accepted results.
Shadow Recover и Save/reopen реконструируют список из реальных owned records;
Queue prune не удаляет их. Preload отвергает malformed/duplicate/foreign identity
и несогласованный signed image, сохраняя валидный случай current asset size,
отличающийся от original output. Global derived SQLite index, cross-project
history navigation, Smart Patch acceptance, полный pipeline
и release runtime на этом checkpoint остаются открытыми; Phase 2B ещё не завершена.

**Production saved accepted-result index checkpoint (02.10.2026):**
[Saved accepted-result SQLite index](../engineering/phase-2b-saved-accepted-index-research.md)
строит derived metadata из verified saved generated Raster Layers. Create,
Import, Save, preview rebuild и workspace Refresh используют один path-locked
owner и одну транзакцию для Home и полного replacement строк результатов.
Identity `(local_project_key, layer_id)` сохраняет независимость portable copies;
original seed/checkpoint/output/acceptedAt отделены от current asset metadata.
Internal Project-scoped query проверяет ready/nontrash, document lineage и
fingerprint; missing/corrupt/unsupported файлы не выдаются, repair/lost-index scan
восстанавливает записи. Unsaved Add/Undo/Recover и Queue prune не публикуют
изменения в durable index. При отказе индекса после committed Save `.igs` сохранён,
старый DB snapshot целиком остаётся, warning и Refresh позволяют восстановиться.
Global browser/navigation, public IPC, Smart Patch acceptance/index, полный
pipeline и release runtime ещё открыты; Phase 2B не завершена.

**Production saved accepted-result browser checkpoint (02.10.2026):**
[App-level Accepted results](../engineering/phase-2b-accepted-history-browser-research.md)
подключает отдельную модалку из Home и Project. SQLite выдаёт ready/nontrash
saved Raster rows страницами по 50 с total в той же транзакции; strict IPC не
передаёт локальные пути. Process-signed previews читают exact saved layer asset,
не подставляя dirty/staging/merged pixels; placeholder сохраняет навигацию.
Строка показывает Project/layer, copied checkpoint/version, actual seed и original
output size. Open/Recover выделяет и показывает owning layer; Cancel/Discard/
context change отзывают намерение. Уже открытая dirty вкладка сохраняет свои
правки и показывает unavailable notice при отсутствии/замене результата.
Навигация не меняет visibility/camera/bbox/seed/document/Undo/`.igs`/staging/queue.
Smart Patch acceptance/index, comparison/result-to-preset, filters, worker-produced
per-result thumbnails и полный pipeline/release runtime остаются открытыми.
Phase 2B ещё не завершена; readiness promises не повышается.

Pending-only sessions не являются отдельными восстанавливаемыми Results:
без valid completed candidate Recover нечего показывать. После restart
pending/running jobs отменяются согласно принятому контракту; их состояние
доступно в operational Queue history. Этот пункт не добавляет новую recovery-фичу.

**Выходная проверка (PP-005/007/008):** на Linux/NVIDIA worker выполняет
Illustrious `txt2img` из реально установленного exact checkpoint. Результат
остаётся вне `.igs` до явного Add; принятие можно отменить и повторить как
одно Project изменение, а Save даёт Raster Layer, provenance, актуальный
embedded preview и историю после reopen. Cancel/late done, retry и prune
проверяются независимо от staging; crash/restart сохраняет только валидные
completed candidates и фактический seed cursor, а pending/running отменяет.
Save не удаляет staging. Проверяются реальные filesystem, SQLite, IPC и
worker paths, не только prototype mocks.

## Фаза 2C. Полный первый generation slice

**Зависимости:** 2B, установленные Anima checkpoint + Qwen3 encoder + VAE и
LoRA для обеих семейств.

- Добавить Anima в тот же Invoke-like pipeline, `txt2img`/`img2img` для обоих
  семейств, compatible LoRA, advanced options, dynamic prompts и Seed `Reuse`
  как последний фактический completed seed данного Project. Добавить
  textual-inversion embeddings через текстовый prompt + sidecar refs и
  `clipSkip` согласно capability matrix: неподдерживаемая моделью опция
  отвергается до enqueue, а не игнорируется. Для текущего Invoke-like
  Illustrious pipeline пользовательский CLIP Skip не применяется; для Anima
  с Qwen3/T5 он также неприменим. Это проверка отказа, не недостающий селектор.
- Для Anima реализовать отдельный loader и проверку rectified-flow структуры,
  точной совместимости Qwen3 encoder/VAE и family capabilities перед enqueue.
  Установка любого поддерживаемого CivitAI Anima `.safetensors` checkpoint с
  закреплёнными Qwen3/VAE не доказывает их структурную совместимость; если
  проверка не пройдена, Generate объясняет причину и блокируется.
  Illustrious SDXL `predictionType` к Anima не применяется.
- Реализовать [Anima prompt weighting](../features/project/generate-mode/prompt-weighting.md)
  в первом Anima pipeline независимо от merge InvokeAI PR #9506. Typed TS
  compiler понимает parentheses/colon и текущие attention suffixes редактора;
  Python получает cleaned text и weighted spans, кодирует Qwen3 без markup и
  один раз tokenizes весь cleaned prompt bundled T5 tokenizer через
  `offset_mapping`. Token weights доходят до LLM Adapter/denoising для positive
  и global negative prompt. Не tokenize weighted fragments отдельно, не терять
  weights и не переписывать authored Project/preset/provenance text.
- Валидировать exact model/component/LoRA refs и семейные capabilities до
  enqueue; unsupported input блокируется с понятным сообщением, без silent
  fallback. Frozen job сохраняет все фактически использованные operational
  inputs. Accepted-result provenance и portable projection сохраняют
  воспроизводимые настройки, но исключают Regional Guidance.
- Read-only `Compare generation settings` уже подключён к Raster context menu
  для текущего provenance v1 (checkpoint ниже). Расширить recorded configuration
  и эту проекцию фактически используемыми LoRA/VAE/advanced options и полными
  pipeline modes; legacy отсутствие остаётся `Unavailable`. Smart Patch использует
  ту же проекцию после фазы 4;
  mask/bbox/source context не подменяет settings. Подготовить проекцию для
  `Save Preset from Result` без преждевременного создания самого пресета.
- Довести реальное взаимодействие Model Manager и Project picker: typed
  checkpoint/LoRA/VAE/embedding entry, exact version против Default и возврат
  с refresh каталога проверяются [resource handoff checkpoint](../engineering/phase-2c-resource-handoff-research.md) ниже.
  Локальные thumbnails installed resources завершены отдельным
  [previews checkpoint](../engineering/phase-2c-resource-previews-research.md);
  missing exact version Close/Escape проверен в
  [current exit ledger](../engineering/phase-2c-exit-ledger.md). Preset handoff остаётся фазой 3.
  Delayed presentation responses Model Manager отдельно квалифицированы
  [read-ordering checkpoint](../engineering/phase-2c-model-manager-read-research.md):
  opening/request guards и observed job merge сохраняют соседние строки.
  Это не квалификация download/repair или всех async command flows.
- Довести [NoobAI inference](#noobai-полная-поддержка-в-рамках-mvp): оба
  prediction type, профиль шумового расписания точного checkpoint, обычный
  Euler и сквозное сохранение фактически использованного профиля. NoobAI
  остаётся частью Illustrious; editable checkpoint policy принадлежит Model
  Manager. Source admission и четыре bounded v-prediction cases не заменяют
  реализацию и qualification полного профиля.

**Выходная проверка:** реальные Illustrious и Anima `txt2img`/`img2img` jobs
с LoRA проходят от Project UI через queue/worker до staging и явного Add.
Изменение Project после enqueue не меняет frozen job; несовместимые resource
combination отвергаются до worker. Seed `Reuse` и accepted provenance
сохраняют точный фактический результат после reopen; comparison не предлагает
Apply/Recall. Реальные jobs проверяют применимые `cfgRescale`, `vaePrecision`,
`predictionType=v_prediction`, embeddings и batch expansion с
фактическим seed scheduling; cursor `Reuse` переживает crash/reopen и не
подменяется случайным seed. Сохранённый неподдерживаемый `clipSkip` явно
отвергается до enqueue. Anima weighting проходит actual editor → typed
compiler → real T5 tokenizer → conditioning/LLM Adapter → denoising: weight `1`
эквивалентен plain text при том же seed, non-neutral attention влияет на
conditioning/output. Проверить nested explicit weights, saved editor suffixes,
Unicode offsets и isolated semantic mutations по supporting contract.
NoobAI epsilon и v-prediction checkpoints проходят
[отдельную выходную матрицу](#noobai-полная-поддержка-в-рамках-mvp), включая
обычный Euler, фактические timesteps/sigmas и сохранение профиля через
Cancel/Retry/Add/Save/reopen. Новые поля не переинтерпретируют legacy jobs или
accepted records; Anima и обычный Illustrious сохраняют прежние paths.
Это завершает первый вертикальный срез, но не весь MVP.

**External VAE resource/authoring checkpoint (04.10.2026):**
[Managed external VAE](../engineering/phase-2c-external-vae-authoring-research.md)
добавляет CivitAI `.safetensors` VAE с source label `Illustrious` или `SDXL 1.0`
как компонент Illustrious. Это не расширяет список checkpoint/LoRA семейств.
Exact selection, Reset to Embedded и portable relink проходят main verification,
Undo/shadow/Save/reopen. Смена Default не заменяет сохранённую версию; late
select/relink проверяет монотонный document epoch, включая edit → Undo.
Anima сохраняет закреплённый VAE. Installation integrity не является ML
qualification: на authoring checkpoint external VAE блокировал Generate;
следующий frozen-worker checkpoint ниже подключает qualified path.
Embedding inference, Anima, полный pipeline и публичная
готовность остаются открытыми.

**External Illustrious VAE inference checkpoint (04.10.2026):**
[Exact external VAE](../engineering/phase-2c-external-vae-inference-research.md)
подключает txt2img decode и opaque img2img encode/decode к выбранному standalone
LDM/native Diffusers VAE. Main-owned source/size/hash/header verification проходит
Prepare, materialization, Retry и dispatch. Worker 0.9.0 проверяет полный набор
тензоров и finite values, применяет pinned public offline AutoencoderKL/config,
precision и non-finite guards. Форма весов не доказывает training lineage;
scaling задаёт проверенная SDXL конфигурация. Поздняя смена Project/Default не
меняет queued/Retry identity. Accepted v1 хранит exact VAE или explicit Embedded;
legacy omission остаётся Unavailable в comparison. Older qualified peers
сохраняют embedded путь и явно отклоняют внешний VAE. Anima и остальные modes, Smart Patch, result-to-preset и release runtime остаются открытыми.
Phase 2B/2C и публичные promises не объявляются завершёнными.

**Exact Illustrious embedding authoring checkpoint (04.10.2026):**
[Installed embedding authoring](../engineering/phase-2c-embedding-authoring-research.md)
связывает обе normal Project prompt-полярности с Model Manager без chips или
offset annotations. Новый literal — `<original safetensors filename stem>`;
`trainedWords` и display names используются только для поиска. Main создаёт
exact refs после проверки managed bytes/source/token: unique canonical manual
input может связаться автоматически, collision требует explicit selection,
включая unavailable installed owner. Existing refs сохраняют copied metadata
и токен при Default/rename/file loss; portable Link меняет только local IDs.
Text+refs проходят focus-to-blur history, Undo/Redo, shadow recovery и явный
Save/reopen. Revision+monotonic epoch защищают late verification/commit, включая
edit→Undo ABA и close. Проверены 141 Project-boundary и 155 resource tests,
20 и 13 isolated semantic mutations соответственно. Эти counts не являются
проверкой native UI или ML compatibility. Итоговый app regression прошёл
1023/1023 без skips; 45 semantic mutations всего (Project/resource/shared
boundaries) обнаружены assertions с зелёным восстановленным baseline.
Свежий build и все семь Electron smoke suites прошли; embedding suite проверяет
10 checkpoints и 7 screenshot geometries без page errors. Это UI/IPC/storage
evidence с controlled peer, не генерация с обученными embedding weights.
Anima embedding authoring unsupported;
На authoring checkpoint Generate отклонял refs и known unbound tokens до
composition/enqueue. Embedding inference подключён следующим checkpoint ниже;
Anima pipeline, Presets и release runtime остаются открытыми. Phase 2C и публичные promises не завершены.

**Illustrious embedding inference checkpoint (04.10.2026):**
[Exact dual-CLIP inference](../engineering/phase-2c-embedding-inference-research.md)
подключает positive/negative refs к обоим normal modes worker 0.10.0.
Singleton/multi-vector paired safetensors проходят exact Main qualification и
worker snapshot/finite/dtype checks. Native Diffusers loaders и Compel получают
отдельные private aliases для каждой полярности и сохраняют literal/weight
semantics, longest-first overlaps и существующий четырёхчастный budget.
Каждый dynamic branch выбирает active refs из frozen authoring pool; unbound
expanded token отклоняет batch целиком. Retry/dispatch проверяют exact effective
files, не unused branches, текущий draft или Default. Accepted v1 сохраняет
concrete text и effective portable refs через Add/Undo/recovery/Save/reopen и
comparison без raw templates/paths/aliases. Исторические пустые refs сохраняются.
Actual tiny CPU/NVIDIA pipeline evidence и Electron controlled-peer UI/storage
разделены; качество trained embedding и произвольные CivitAI layouts не обещаются.
Anima, masks/regions/outpaint, прочие advanced options, Smart Patch, Presets и
release runtime остаются открытыми. Phase 2C и публичные promises не завершены.

**Anima exact qualification and offline loader foundation (05.10.2026):**
[Qualification and native loaders](../engineering/phase-2c-anima-qualification-research.md)
реализуют отдельный Main bundle resolver и Python loading boundary для исходной
Anima Base 1.0. Exact saved checkpoint и связанные pinned Qwen3/VAE повторно
проверяются по source/role/family/hash/size и полному bounded header; compatible
custom checkpoints не ограничены SHA allowlist. Python использует native
CosmosTransformer3DModel, AnimaTextConditioner, Qwen3Model и AutoencoderKLWan с
полным strict state/finite/snapshot validation. Реальные trained weights прошли
default-profile offline CPU loading без изменений исходных файлов; tiny native
tests и semantic mutations проверены отдельно. Generate, queue/protocol и
worker readiness не расширены. Weighting/compiler/tokenizers и conditioning
подключены следующим foundation checkpoint; denoising, LoRA и сквозная
queue/Retry/provenance qualification остаются открытыми. Полный Anima pipeline,
Phase 2C и публичные promises остаются незавершёнными.

**Anima compiled weighting and conditioning foundation (05.10.2026):**
[Versioned compiled conditioning](../engineering/phase-2c-anima-conditioning-research.md)
добавляет единственную TS attention grammar и очищенный текст с Unicode
code-point spans. Python строго валидирует обе captured интерпретации, загружает
exact bundled offline Qwen3/T5 tokenizers и использует native Qwen3/LLM Adapter.
Веса применяются один раз после adapter projection/norm для positive и global
negative; IDs/hidden input и zero-padded tail сохраняются. Native/cross-language
tests, 30 isolated semantic mutations, wheel probe и real trained-weight CPU
conditioning проверены отдельно от GPU denoising. Перед Anima Generate обязательны
family-aware editor adjustment (Increase existing implicit/explicit groups),
denoising/LoRA, frozen queue/Retry/provenance и Linux/NVIDIA output/release
qualification. Internal Euler execution выполнен следующим checkpoint; public capability, protocol,
queue, `.igs` и Anima admission пока не расширены.

**Anima internal default Euler execution (05.10.2026):**
[Typed Euler plan and native pixels](../engineering/phase-2c-anima-euler-research.md)
добавляют original default Euler txt2img и opaque img2img. TS фиксирует shifted
sigmas, exact strength clipping, authored/actual steps и независимый posteriorSeed.
Python сохраняет raw sigma/CFG/F32 update/cast-back, uses weighted conditioning
и native Wan sampled posterior/per-channel normalization. Zero padding/crop
сохраняет 8-aligned размеры, pre-clamp finite guards отказывают до pixels.
Actual trained RTX 4080 probe проверил 256×256/три шага: neutral weight equality,
изменение positive/negative, seed replay и strength 0/0.5/1. Это внутренний helper,
не public Generate/queue/provenance readiness. Ordinary Anima LoRA добавлены
следующим checkpoint. Следующий этап — остальные scheduler/advanced paths,
затем family-aware editor handoff и frozen admission/queue/Retry/provenance. Полные размеры, memory/cache/tiling и release
qualification остаются отдельными gates; Phase 2C и публичные promises не завершены.

**Anima ordinary LoRA foundation (05.10.2026):**
[Exact qualification and scoped native adapters](../engineering/phase-2c-anima-lora-research.md)
добавляют отдельный Main resolver exact Anima refs и общий generated profile
711 native Linear targets / 4977 aliases. Kohya up/down и PEFT A/B пары
проверяются целиком, включая rank/shape, optional finite scalar alpha и неизвестные
ключи. Python повторно проверяет точные bytes и native target/tensor/scaling,
затем применяет подписанный стек до кодирования обеих полярностей prompt.
Backbone, LLM Adapter и Qwen проверены на настоящих небольших native моделях;
три локальные trained backbone LoRA отдельно проверены на RTX 4080 при 256×256/
трёх шагах. Missing alpha → rank; generic training metadata не меняет config.
После успеха и ошибки восстанавливаются исходные слои, weights, gradient flags и
RNG; повторная загрузка проверяется на тех же моделях. Public Generate/capability,
wire/`.igs` versions, queue/Retry/provenance и Illustrious admission не меняются.
Остальные scheduler/options, family-aware editor и сквозная Linux/NVIDIA release
qualification остаются открытыми; Phase 2C и PP-004/PP-005 не завершены.

**Anima deterministic sampling foundation (05.10.2026):**
[Typed sampling plans and fresh native solvers](../engineering/phase-2c-anima-sampling-research.md)
добавляют internal Euler, Heun и DPM++ 2M для txt2img/opaque img2img. TS фиксирует
отдельные native sigmas/timesteps, begin index, strength и actual evaluations;
Python проверяет arrays и использует fresh native history без private schedule
overrides. Heun учитывает оба вычисления; DPM++ использует flow prediction, а не
Illustrious prediction type. Weighted обе полярности, signed LoRA, finite guards,
dtype/cast policy и scoped cleanup сохраняются. Interior img2img использует
реальный starting sigma выбранного метода вместо известного Euler-preblend
несоответствия Invoke; strength 0 остаётся VAE-only, strength 1 — тем же чистым
seeded noise, что txt2img. Public Anima controls/admission/queue/Retry/provenance
не расширены. Stochastic/LCM execution follows in the next checkpoint;
оставшиеся применимые options, family-aware editor и frozen public integration,
затем полная Linux/NVIDIA release qualification остаются открытыми.
Phase 2C и PP-004/PP-005 открыты.

**Anima six-method flow sampling foundation (05.10.2026):**
[Stochastic and FlowMatch LCM execution](../engineering/phase-2c-anima-flow-sampling-research.md)
добавляет internal DPM++ 2M SDE, exact vendored ER-SDE и native Flow LCM. Новый
versioned TS plan фиксирует stepSeed и full authored grids; Python сохраняет
request-owned RNG/history, old finite envelopes и shared weighted/LoRA image
boundary. ER/LCM once-shifted grids имеют отдельную terminal-zero setup policy;
LCM clipping исправляет известное Invoke rebuild/shift mismatch. Native
reference/control, trained NVIDIA pixels и scoped interruption restoration
проверены отдельно от model quality. Это завершает six-entry internal method
registry. Public settings подключает authoring checkpoint ниже; Generate/
capability/queue/Retry/provenance требуют frozen public pipeline integration с
оставшимися применимыми options. Затем следуют runtime installation и полная
Linux/NVIDIA release qualification. Base few-step LCM quality, Turbo и новые variants не обещаны;
Phase 2C и PP-004/PP-005 открыты.

**Anima qualified worker checkpoint (05.10.2026):**
[Worker entrypoint](../engineering/phase-2c-anima-worker-entrypoint-research.md)
соединяет versioned TS compiler для обоих concrete prompts и полного sampling
plan с actual inference JSONL worker 0.11.0. Native bundle/conditioning/signed
LoRA/six methods достигают provisional PNG, thumbnail и correlated progress/done.
Only native CUDA BF16 advertises Anima; existing qualified Illustrious support
сохраняется. Exact wire, immutable capture, snapshot-size interleaving guard и
exclusive output проверяются отдельно от model quality и release packaging.
Project Generate пока закрыт. Family-aware editor и native method representation
подключает authoring checkpoint ниже; следующие этапы — frozen Main
batch/admission, queue/Retry/dispatch и immutable accepted provenance. Generic progress уже допускает 400 evaluations; Anima handoff должен
связывать actual plan count (Heun до 399) с конкретным запросом. Runtime installation и полная
Linux/NVIDIA qualification остаются открытыми; PP-004/PP-005 не завершены.

**Anima Project authoring checkpoint (05.10.2026):**
[Authoring](../engineering/phase-2c-anima-authoring-research.md) добавляет finite
optional native method в mutable Project draft через typed IPC/Main, history,
shadow и explicit `.igs` Save/reopen. Unset не превращается в Euler; model switch
сохраняет inactive Illustrious pair и Anima choice. Shared attention actions
используют current family, изменяют implicit/explicit/suffix weights, сохраняют
escapes/precision/nested markup и дают advisory при неоднозначном target.
Prototype Project/preset consumers имеют declared family, native-only sampling
и supplied-member Apply; production preset storage этим не реализован.
Public Anima Generate и frozen accepted Raster DTO не расширены. Следующий этап
— exact Main batch/admission → durable queue/Retry/dispatch → immutable accepted
Anima configuration, включая проверку выбранного native method и actual progress.
Полная model quality и Linux/NVIDIA release qualification остаются открытыми.

**Anima Main preparation checkpoint (05.10.2026):**
[Captured preparation and concrete requests](../engineering/phase-2c-anima-main-preparation-research.md)
соединяют реальный Project snapshot/visible raster lease, document-scoped seed,
exact linked bundle и ordered signed enabled LoRAs с bounded concrete batch.
Оба prompt компилируются после dynamic expansion, каждый seed получает свой
full native plan. Общая private target lease и distinct outputs проходят полную
проверку всех request envelopes до callback; ошибки убирают только owned scratch.
Unsupported active SD-only settings явно отклоняются; neutral/inactive authoring
не превращается в новые Anima wire fields. Это отдельный Main контур подготовки:
Generate, durable queue/Retry/dispatch и immutable accepted records не открыты.
Этот preparation checkpoint использует прежний cap32, без новой GPU capacity promise.

**Anima durable jobs checkpoint (05.10.2026):**
[Concrete attempts, Retry and recovery](../engineering/phase-2c-anima-durable-jobs-research.md)
добавляют внутреннее durable admission полного qualified batch, миграцию 0014,
frozen Retry через action controller, dispatch/JSONL native progress и verified
local candidates/restart. Каждая запись хранит concrete weighted signs, resolved
seed, один full native plan и exact ordered ресурсы; capacity проверяется по
actual serialized payload и escaped session manifest при прежних caps.
Queue Manager отображает native method без выдуманных SD settings. На этом
историческом checkpoint Anima Add был явно закрыт до побочных эффектов;
следующая интеграция ниже подключает accepted configuration и public Generate.
После неё остаются installed Linux/NVIDIA runtime,
реальные модели/размеры и release qualification. Наличие controlled worker tests
не означает CUDA/model-quality или release readiness.

**Anima public Generate and portable acceptance checkpoint (05.10.2026):**
[Public integration](../engineering/phase-2c-anima-public-generation-research.md)
подключает original click snapshot к native batch через существующие runtime
lease, queue barrier, exact replacement review и Project/index/close fences.
Оба pixel modes и все шесть methods используют qualified peer и exact bundle;
SD-only active inputs и outpaint отклоняются буквально. Renderer получает
native capability и использует её для img2img strength вместо Illustrious flag.
Strict portable v1 `anima-txt2img` / `anima-img2img` records сохраняют raw weighted
signs, exact checkpoint/Qwen3/VAE identities+sizes, actual seed, native sampling,
full configured LoRAs и explicit neutral policies без paths/regions/compiled arrays.
Mixed Add, grouped Undo/Redo, acceptance interruption/reconcile, shadow Recover,
Save/readback, portable copy/open и saved-result indexes сохраняют baseline.
Read-only comparison показывает native method/bundle и явно сообщает unknown
bindings/unsupported current inputs. Legacy Illustrious records остаются точными.
Evidence использует реальные production owners и контролируемые qualification/
inference collaborators; native Electron подтверждает IPC/UI и saved comparison,
не trained CUDA inference. Installed development runtime и CPU routes добавлены
следующим checkpoint; там же подтверждены четыре сквозных normal-mode сценария
обеих моделей на реальных весах и размере 1024 × 1024. Presets/result-to-preset,
Smart Patch, regions/outpaint и
полная release qualification не завершены; PP-004/005/007/008 не повышены.

**Installed development runtime и trained native qualification checkpoint (05–06.10.2026):**
[Installed runtime qualification](../engineering/phase-2c-installed-runtime-qualification-research.md)
добавляет явный opt-in `provision-qualification-runtime.mjs` для новой изолированной
app-data директории. Собственный CPython 3.12.13 и non-editable distribution
`imagegen-worker` 0.1.0 находятся под app-owned runtime root; inference handshake
имеет worker version 0.11.0. Committed `uv.lock` задаёт inference graph,
offline pinned SDXL config копируется вместе с captured inputs. Ready обоих
семейств и физический exit проверены до публикации pointer. Provisioning использует
online dependency resolution по lock; это development bootstrap, не signed release
artifact, offline wheelhouse, relocatability proof или встроенный Install/Repair.

Production Main получает installed CPU worker через строгий canonical pointer,
с чистым offline environment и скрытым CUDA, независимо от доступности GPU и
ML config. Один Main owner держит source resolution, startup, Save/import/rebuild/
read-only composition и подтверждённый exit; явный development/test adapter
остаётся отдельным opt-in. Неудачный exit установленного image child теперь
создаёт глобальный запрет новых CPU/CUDA children, который снимается только
после наблюдаемого физического exit. Успешная операция сохраняет результат;
Save с недоступным worker пишет валидный документ и bundled placeholder.

После последнего job dispatcher проверяет реальные pending metadata до GPU
lease. Empty/fenced queue и глобальный running row не запускают idle qualification;
enqueue barrier, повторное пробуждение drain и shutdown сохранены. Frozen-input
verification и SQLite claim CAS остаются authoritative. Реальная subprocess
регрессия показывает переход от двух лишних children к нулю. Итоговые focused
checks прошли 321/321 без failed/skipped, lint и полный typecheck; десять
исполненных semantic mutations очереди/dispatch обнаружены по поведению.
Это отличается от проверки trained CUDA inference.

Итоговый `native-qualified-v5` завершился с `passed` и подтверждённым native
exit 0: девять checks, четыре генерации, ноль page errors. Built Electron
renderer/preload/Main в production environment использует installed non-editable
worker и реальные trained CUDA weights. Illustrious и Anima прошли `txt2img` и
opaque `img2img` через публичный UI Generate → durable queue/staging → явный Add →
Save/reopen с rendered previews и неизменяемым provenance. Каждый сценарий имеет
размер 1024 × 1024, три configured steps, CFG 4 и ordinary LoRA с весом −0.5;
`txt2img` фиксирует seed 0, следующий `img2img` действительно повторяет seed 0
через Reuse и strength 0.5. Illustrious использует Euler a/Normal; Anima — native
Euler и weighting в positive и negative prompts. Два шага фактического img2img
denoising соответствуют clipped плану, а не подменяют configured steps.

Соседние реальные UI controls подтвердили Save при отсутствующем installed
runtime с сохранением accepted pixels/provenance и валидным placeholder,
Home Rebuild Preview после восстановления runtime без изменения исходного
результата, а также installed CPU Raster import в начало bbox → sRGB pixels →
Save с rendered preview. Fixture заранее копирует и SHA-проверяет конкретные
существующие веса в изолированный catalog; она не доказывает CivitAI download
или автоматическое определение family/prediction type. Сохранены реальные
PNG/RGBA hashes, screenshots, source/bundle identity и наблюдения процесса/GPU.
Три шага и два конкретных checkpoints не доказывают image quality, полный
набор sampling/options, пределы разрешения/VRAM или устанавливаемый релиз.

Итоговый app regression прошёл 1595/1595 без failed/skipped, полный typecheck
и lint — зелёные. Точная цепочка `pnpm run app:smoke` завершилась с exit 0:
build и все десять native invocations, включая оба family comparison, VAE,
embeddings, Anima authoring и queue. Эти smokes используют controlled peers и
проверяют UI/IPC/storage отдельно от четырёх trained CUDA сценариев. Evidence
checkpoint содержит 36 исполненных semantic mutations разных ownership,
filesystem, queue и dispatch boundaries с поведенческими kills и зелёными
восстановленными controls; одни только сообщения об ошибках не засчитаны.

**Installed CFG Rescale checkpoint (06.10.2026):**
[Advanced Options → installed trained worker](../engineering/phase-2c-installed-cfg-rescale-research.md)
завершил matched-input unset/zero/nonzero txt2img и nonzero opaque img2img через
явный Add, rendered Save/reopen и видимое сравнение. Unset и явный ноль дают
одинаковые decoded RGBA pixels, 0.7 меняет их; frozen/accepted zero/0.7 остаются
неизменными после независимой правки текущего draft на 0.2. Это отдельный
параметр и конкретные trained weights, без обещания качества, independent
img2img pixel ablation, остальных options или готового release runtime.

**Installed embedded VAE precision checkpoint (07.10.2026):**
[Actual Advanced Options → installed worker](../engineering/phase-2c-installed-vae-precision-research.md)
прошли шесть Illustrious Auto/FP32/FP16 × txt2img/opaque img2img случаев:
6 finite completions, 0 точных VAE non-finite refusals и один
actual canceled original перед frozen FP32 Retry после текущей правки на FP16.
Matched txt2img Auto/FP32 дают одинаковые pixels; FP16 меняет txt2img pixels; completion/refusal outcome указан отдельно выше.
GPU отказ в этом fixture не наблюдался; путь ошибки отдельно проверен controlled JSONL → actual Main/SQLite. Main сохраняет понятную фиксированную
диагностику без raw worker paths. Явный Add/Save/reopen/comparison сохраняет
precision; opaque случаи доказывают wiring, а не numerical ablation.
Worker 0.12.0/six-resource catalog reused, 256×256/three steps,
без новых тяжёлых копий моделей или signed release/maximum GPU claims.
На этом precision checkpoint embeddings, installed v_prediction и batch
qualification оставались открытыми; последующий embedding checkpoint описан ниже.
Counts/checks/mutations и resource limits — в research note.

**Installed external Illustrious VAE checkpoint (07.10.2026):**
[Actual VAE selection → installed trained pipeline](../engineering/phase-2c-installed-external-vae-research.md)
прошли восемь finite cases при 256×256, трёх requested steps и FP32:
Embedded, exact LDM, exact native и искусственный finite bias control в txt2img
и common-source opaque img2img при strength 0. Exact форматы дают pixels Embedded;
control меняет pixels в обоих режимах. Это combined control, без независимой
encoder/decoder ablation или nonzero img2img denoising qualification.
Actual Cancel сохраняет canceled original; после настоящей смены library Default
и Reset текущего draft public Retry сохраняет исходный exact native VAE/target/
prompt/seed/FP32. Явный Add/Save/readback/reopen/comparison проверены.
В девяти admissions — восемь завершений и один canceled original; шесть прежних
resource rows сохранены, три локальных VAE files — версии одного нового ресурса.
Это installed development evidence, не CivitAI download/отдельная training lineage,
external outpaint, Anima alternate VAE, качество или signed release.
Проверки и sensitivity evidence находятся в research note.

**Installed Illustrious embeddings checkpoint (07.10.2026):**
[Actual prompt authoring → installed trained pipeline](../engineering/phase-2c-installed-embeddings-research.md)
завершил восемь finite cases в девяти admissions, включая один actual canceled
original: plain txt2img, matched positive trained/zero и negative trained/zero,
trained weighted/repeated literals в обеих полярностях и matched dual-polarity
opaque img2img. Trained source — IllustriousPhoto, CautionMergeAhead,
WAI v15 1152steps; авторская credit requirement сохранена. Artificial zero
control сохраняет layout, но обнуляет оба CLIP tensors, без отдельной training
lineage или independent L/G/attention ablation. При одинаковом literal text и
остальных normalized inputs смена только exact trained/control weights меняет
pixels в обоих txt2img polarity pairs и img2img pair.

Все случаи используют 256×256, три requested steps, seed `0`, Embedded VAE/FP32
и ordinary LoRA −0.5. Img2img импортирует один genuine plain txt2img PNG через
actual UI/Main/installed CPU worker; strength 0.5 даёт два наблюдаемых native
denoising evaluations. Positive prompt повторяет literal трижды с weight 1.3,
negative — дважды с weight 0.7; refs deduplicated отдельно по полярности.
Actual Cancel не создаёт receipt/candidate и не продвигает seed cursor. После
настоящей смены embedding library Default и удаления всех current literals
public frozen Retry сохраняет original trained refs/prompts/target/seed.
Explicit Add/Save/readback/reopen/comparison удерживает portable identity без
paths/private aliases и показывает `Removed` относительно current empty refs.
Прежние семь resources/девять versions и их Defaults сохранены; две declared
embedding versions дают итоговые восемь resources/одиннадцать ready versions.

Native matrix прошла 19 checks без page errors и завершилась с exit 0.
Обнаруженный pending-completion-after-blur дефект отдельно воспроизведён native
RED/GREEN; shared editor close-on-blur сохраняет обе prompt histories и обычный
completion. Его controlled-peer smoke отделён от trained inference. Полные
evidence, limits и sensitivity результаты находятся в research note.
Live product CivitAI install/repair, arbitrary embedding formats/quality,
Anima/presets, dynamic multi-job capacity и signed release остаются открытыми.

**Normal outpaint conditioning foundation (06.10.2026):**
[Alpha/coherence/LaMa contract](../engineering/phase-2c-outpaint-conditioning-research.md)
и внутренние production helpers фиксируют detached Main target/soft-alpha mask,
exact policy/resource identities, source-equivalent CPU gradient/fade,
transparent RGBA contribution и hash-bound local TorchScript infill. Источник
Canvas не перезаписывается; seam может перекрываться отдельным слоем. Это ещё
не исполняемый durable outpaint job или public capability.

**Illustrious masked denoising checkpoint (06.10.2026):**
[Internal native execution](../engineering/phase-2c-illustrious-outpaint-research.md)
захватывает original latents/один noise/selected schedule и подаёт одинаковое
восстановление protected source в UNet и scheduler. Сохранены actual Invoke
generation-mask thresholds, F32 inversion перед FP16 и final restore перед VAE.
57 native CPU tests охватывают пять методов, epsilon/v_prediction и strength,
а отдельный trained CUDA прогон проверяет Main snapshot → LaMa → masked loop
и RGBA contribution, replay/neutral/seed controls. Это внутренний adapter,
не новый public worker command или уже доступный durable outpaint job.

**Anima masked denoising checkpoint (06.10.2026):**
[Internal six-method execution](../engineering/phase-2c-anima-outpaint-research.md)
передаёт source/noise/mask как per-call collaborator существующих Euler/native
циклов. Порог использует inverse-shifted linear time, protected source — shifted
sigma; восстановление идёт после completed user step, пропуская Heun predictors.
Сохраняются weighted prompts, LoRA, independent RNG и обычные unmasked API;
публичные protocol/queue/provenance unions не расширены.

**Internal frozen outpaint jobs checkpoint (06.10.2026):**
[Durable input ownership](../engineering/phase-2c-outpaint-jobs-research.md)
добавляет два explicit internal queue kinds, strict PNG/soft-alpha/policy/LaMa
snapshots, сохраняющую старые строки SQLite migration, whole-batch preflight и
проверяемый internal Retry/restart. Main resolver закрепляет общий LaMa в
`appData/inference-resources` вне Python environments/cache; installer пока не
подключён. Public dispatch/Retry/publication/provenance явно отклоняют эти
операции до следующего согласованного checkpoint.

**Internal outpaint execution checkpoint (06.10.2026):**
[Explicit native dispatch and contribution ownership](../engineering/phase-2c-outpaint-execution-research.md)
подключает frozen operations к strict TS/Python commands worker 0.12.0 для обеих
семей. Base Illustrious требует outpaint capability; Anima дополнительно требует
native BF16 и шесть native capabilities. Worker повторно проверяет exact source
и local LaMa перед native masked execution и сохраняет RGBA contribution.
Main независимо проверяет exact contribution alpha по исходному PNG и policy.
Staging owns независимую durable source copy для recovery после queue pruning.
Явный Add создаёт два portable outpaint provenance kinds; Undo/Redo, shadow,
Save/readback, portable open и comparison сохраняют frozen settings и output
identity. Valid actual uint32 seed deviation допускается без изменения planned
seed. Executed evidence и counts принадлежат research note; это внутренний
checkpoint без public activation или installed/release qualification.

**Main-owned LaMa delivery checkpoint (06.10.2026):**
[Auxiliary installer and engine byte planner](../engineering/phase-2c-lama-install-research.md)
реализуют exact Main download/publication/reuse общего закреплённого файла,
без worker network. Planner всегда учитывает LaMa сверх полного trusted runtime
manifest; weights-only preview не выдаётся за полный engine volume. Renderer
Set up/Install/Repair пока остаются заглушками, release manifests и достаточный
free-space peak отсутствуют. Это внутренний delivery owner, не законченный setup.

**Public outpaint admission checkpoint (07.10.2026):**
[Public Generate/Retry](../engineering/phase-2c-public-outpaint-research.md) подключают
две native операции при exact local LaMa и worker 0.12.0. Final SQLite callback
синхронно проверяет current document/close после последнего SQL await; resource
qualification остаётся вне transaction mutex. Controller проверяет владельца
ещё раз после runtime child-exit wait и cleanup всего raster capture lease. Только
после свежей проверки document/confirmation начинается замена прежней работы;
поздний отказ отменяет только новые jobs. Восстановление ordinary queue/history
не зависит от helper root.
Built Electron и non-editable installed worker подтвердили у обеих семей normal
source → mixed-alpha Generate → canceled original/frozen Retry: шесть successful
trained completions, два retained canceled originals, explicit Add/Save/reopen и
comparison. При 256×256/трёх шагах и signed LoRA −0.5 сохранены source layers,
exact contribution alpha и portable provenance. Genuine CPU LaMa проходит fixed
Main installer с заменой только transport/DNS локальным файлом; native процесс
подтверждённо завершился. Это development Linux/NVIDIA evidence, без public
network/setup, signed release, all-model/all-GPU или всей фазы 2C claims.

**Installed v-prediction checkpoint (07.10.2026):**
[Exact Model Manager policy → trained installed worker](../engineering/phase-2c-installed-v-prediction-research.md)
проверен на credited Cyberfalafel v-pred v1.2 by Knightus_Ai с raw NoobAI source
и принятой Illustrious mapping. Четыре finite txt2img/img2img completions в пяти
admissions включают настоящий Cancel, отказ public Retry после UI смены exact
library prediction type и успешный frozen Retry после восстановления
`v_prediction`. Add/Save/readback/reopen/comparison сохраняют captured policy
против opposite current type и исходные imported pixels. При
256×256/трёх requested steps/seed `0`/Euler a/Normal/Embedded FP32/LoRA −0.5
matched inputs и targets одинаковы после исключения только prediction fields и
document identity/revision; decoded pixels различаются. Common-source img2img
strength 0.5 выполняет два denoising evaluations. Native exit подтверждён
физически; exact source weights и two-resource catalog closure сохранены.

Installed forced-epsilon mutation завершила два здоровых txt2img jobs и
остановлена causal pixel assertion при одинаковых decoded pixels. Все 43
installed worker source files восстановлены; настоящий production client
startup worker 0.12.0 и physical exit проверены. Отдельный native IPC replay
подтверждает исправленное checkpoint-or-prediction объяснение Retry refusal
без нового inference completion и без queue/results/Project/package effect.
Локально подготовленный native catalog не квалифицирует public CivitAI install;
controlled API source-admission tests имеют отдельную границу. Это не
ZTSNR/trailing full author recipe, качество, другие installed samplers,
v-outpaint, network install или signed release qualification.

**Предыдущий подтверждённый bounded per-prompt image срез:** [Installed Illustrious/NoobAI per-prompt IMG/OUT](../engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

**Предыдущий подтверждённый bounded dynamic image срез:** [Installed Illustrious/NoobAI dynamic IMG/OUT](../engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](../engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](../engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](../engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](../engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](../engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

**Предыдущий завершённый bounded multiple-LoRA image срез:** [Installed NoobAI multiple-LoRA IMG/OUT](../engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

**Предыдущий signed image checkpoint:** [Installed NoobAI signed embedding IMG/OUT](../engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

**Предыдущий V image checkpoint:** [Installed NoobAI V DPM++ 2M IMG/OUT](../engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

**Предыдущий V TXT checkpoint:** [Installed NoobAI V DPM++ 2M TXT](../engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

**Предыдущий five-sampler checkpoint:** [Installed five-sampler campaign](../engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

**Предыдущий DPM++ 2M checkpoint:** [Installed Anima DPM++ 2M IMG/OUT](../engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

**Предыдущий Heun checkpoint:** [Installed Anima Heun IMG/OUT](../engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

**Предыдущий ER-SDE checkpoint:** [Installed Anima ER-SDE order3](../engineering/phase-2c-anima-er-sde-order3-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons. Installed dd_x0 omission: three-step pixels GREEN / five-step pixels RED до Add; оба controls имеют 0 accepted layers. Exact restoration всех43 source identities и fresh five-step pixel replay; independent aggregate 1750 checks. Superseded cleanup attempt учтён отдельно: raw8/8/5/5. Только TXT256/CFG4/Fixed0/Myth−0.5; full MVP/release status не повышен. На этом ER-SDE checkpoint Heun IMG/OUT был открыт; follow-up записан выше.

**Предыдущий cap checkpoint:** [Installed cap32/bounded truncation](../engineering/phase-2c-generation-batch-cap-research.md): independent aggregate PASS, 114 admissions/114 finite/114 accepted saved layers/114 comparisons, 6 accepted saved/reopened packages; 96 boundary outputs + 18 selected-prefix outputs, 18 same-input pixel matches and 3 confirmed 33-job UI refusals retaining all 32 temporary results. Five actual-source mutants: 204 executed tests/22 semantic failures, baseline and fresh restored 52/52 GREEN each, 0 skipped; focused 349/349/typecheck/build GREEN. TXT-only 256×256/three steps; statuses/full MVP/readiness/release unchanged. ER-SDE order3 был открыт на этом checkpoint; его bounded follow-up описан выше.
**Предыдущий seed checkpoint:** [installed Random/uint32 seed boundaries](../engineering/phase-2c-generation-seed-boundary-research.md):
реальные Anima/EPS/V Random batches → same-input numeric Fixed replay,
UINT32_MAX→0→1→2 и fresh MAX/0. Independent aggregate (15,006 checks) подтвердил 54 qualified
admissions/45 finite outputs/42 accepted saved layers/12 reopened packages/9
APP_RESTART; raw 58/49/46/13/9 отдельно включают прежний healthy EPS 4/4/4/1.
Два исключённых setup 0/0 не являются semantic RED. Все три installed high-bit RNG
mutations дали pixel RED до Add; 43 sources восстановлены, fresh 6 GREEN и final
physical idle подтверждены. Исходные catalog 9/14/defaults/302 queue/186 cursors/
249 receipts/eight sources сохранены; PP readiness не повышена.
**Предыдущий finite per-iteration gate:** [Illustrious/NoobAI dynamic image qualification](#installed-dynamic-img-and-out-for-illustrious)
с Fixed0/per-iteration получил independent finite reader PASS (10833 checks):
48 completions, 40 accepted layers, 8 packages; numerical controls и restoration
подтверждены. Finite gate завершён: fresh system proof (820 checks), env/cwd guard
sensitivity и guarded cleanup прошли; ENODEV repair после original-source reader/
cleanup проверен в isolated actual two-file copy (30 baseline GREEN,
4 semantic RED/26 neighbor GREEN, 30 fresh restored GREEN, exact restoration).
Исходный cleanup ENODEV и отдельные exact physical-closure supplements сохранены;
ML reruns не добавлялись.
**Подтверждённый per-prompt follow-up:** [Installed Illustrious/NoobAI per-prompt IMG/OUT](../engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.
Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](../engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](../engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](../engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](../engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](../engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».
Multiple-LoRA evidence закрывает только declared AB/BA/zero/disabled image cases.
На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash оставались
gap; последующие finite follow-ups подтверждены выше. Installed V weight-swap
pixel causality, arbitrary formats/stacks/geometry и полный seed-policy/mode
matrix остаются gap.
Исторический Karras TXT wrong-EPS pixel RED и точная причина исходного отказа
по-прежнему не доказаны. Model Manager ownership, immutable source/receipt
preservation и DPM++ SDE + ZTSNR refusal сохраняются. Leading остаётся
export-based assumption; finite outcomes не превращают её в авторский recipe.
[Installed dynamic embedding subsets](../engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
завершены:20 qualified admissions/16 completions/4 APP_RESTART,4 packages/12 layers,
negative-vector numerical RED/ordinary GREEN/fresh4, snapshot0/source43 preserved.
Один исключённый memory-watchdog stop добавляет4 admissions/0 outputs к raw counts.
[Bounded Illustrious/NoobAI dynamic checkpoint](../engineering/phase-2c-illustrious-dynamic-batch-research.md)
завершён ниже:58 admissions/42 completions, оба crash/reopen Reuse, causal
installed generation-RNG mutation/restored pixels,6 packages/38 accepted layers.
[Anima dynamic evidence](../engineering/phase-2c-anima-dynamic-batch-research.md)
остаётся отдельным прежним срезом; новый Anima ML run не выполнялся в embedding
checkpoint. Последующие seed/cap gates включают Anima отдельно; max32 native
inference и bounded installed truncation проверены выше, полный Fixed/per-prompt matrix остаётся открытым.
Bounded installed NoobAI profile/component и [installed Anima worker0.14 regression](../engineering/phase-2c-anima-worker-014-regression-research.md)
подтверждены отдельными checkpoint ниже; они не завершают
[полную поддержку NoobAI](#noobai-полная-поддержка-в-рамках-mvp).
Применимые именованные Advanced controls
(VAE, precision, CFG Rescale) уже имеют production paths; CLIP Skip явно
неприменим к обоим MVP pipelines, нового selector не требуется.
Bounded installed Anima worker0.14 method/weighting gate завершён ниже:
шесть native TXT methods и representative Euler IMG/OUT. Позднейшие
Heun/DPM++ 2M и five-sampler gates закрыли выбранные finite non-Euler IMG/OUT;
остальные полные выходные критерии остаются открытыми.
First-setup integration остаётся зависимостью release/runtime installer;
вес LaMa обязан входить в общий preview.
Общие вспомогательные веса LaMa устанавливаются вместе с первой установкой
движка с предварительным показом полного объёма загрузки; Main владеет download,
cache и exact identity verification, worker получает готовый локальный путь.
Это принятое [решение runtime setup](./07-python-runtime-management.md#общие-вспомогательные-веса-для-outpaint),
а не уже реализованный first-setup flow в development runtime или release installer.
Qualification выше проверяет внутренний Main installer с локальной подстановкой
transport, не подключение этой установки к публичному Set up.
Полные authored masks/Regional Guidance/Smart Patch относятся к фазе 4; их
owned document assets не появляются от подключения normal img2img. Применимые
Advanced Options уже имеют production data/worker paths, но ещё требуют
расширенного installed trained-model прогона по выходной проверке выше.
Presets и result-to-preset остаются фазой 3. Release artifact, встроенный
Install/Repair, rollback/update и clean-install/upgrade проверки остаются
открытыми. Фаза 2C и PP-004/005/007/008 не объявляются завершёнными.

**Project resource handoff checkpoint (06.10.2026):**
[Project ↔ Model Manager](../engineering/phase-2c-resource-handoff-research.md)
использует renderer-only category request и optional exact saved IDs. Пустой
checkpoint открывает Checkpoints, Embedded VAE — VAE, LoRA header — LoRA;
каждая LoRA row открывает свою точную версию. Existing embedding diagnostics
используют тот же запрос и сохраняют trigger во время catalog checking.
Library Default не меняет Project selection; Close/Escape обновляет каталог
через существующий Main API. Native evidence отдельно проверяет реальные
Project authoring/history/Save/readback и контролируемое исчезновение/возврат
exact files; это не проверка CivitAI repair/download или inference. Installed
thumbnails, Preset handoff и полный выход фазы 2C остаются открытыми.
Итоговые проверки этого среза: 1595/1595 app tests, typecheck/lint, 24 native
handoff assertions и вся цепочка `pnpm run app:smoke` с 11 invocations прошли.

**Model Manager presentation read checkpoint (06.10.2026):**
[Read ordering](../engineering/phase-2c-model-manager-read-research.md) привязывает
catalog/jobs/storage/token responses и ошибки к открытию модалки и конкретному
запросу. Старый refresh не завершает новую загрузку и не выполняет старый scroll.
Full-list jobs merge сохраняет updates, наблюдавшиеся во время запроса, и
нетронутые строки Main. Команды установки и App-owned Project return refresh
сохраняют прежних владельцев. Native harness задерживает настоящие Main replies
и повторно доставляет genuine job DTO; он не доказывает actual download или
secret-storage mutation. Фаза 2C и PP-004 не объявляются завершёнными.
Итог: 1608/1608 app tests, typecheck/lint, 11/11 native read checks и полная
цепочка `app:smoke` с 11 invocations прошли; шесть isolated helper mutations
обнаружены поведенческими assertions.

**Illustrious VAE precision checkpoint (04.10.2026):**
[VAE precision](../engineering/phase-2c-vae-precision-research.md) подключает
Auto/FP16/FP32 встроенного VAE в txt2img и opaque img2img. Typed draft,
Undo/shadow/Save, exact frozen policy в queue/Retry, worker 0.8.0 и immutable
accepted metadata/comparison проходят единый production путь. Older qualified
peers сохраняют Auto без потери durable поля; manual precision отклоняется
до enqueue/Retry/dispatch при отсутствии capability. Auto сохраняет native
policy; явные precision управляют реальными encode/decode без изменения
UNet/CLIP. Non-finite VAE не превращается в успешный чёрный PNG. Actual tiny
CPU/NVIDIA и native Electron с controlled peer имеют раздельные evidence.
External VAE и embedding inference подключены отдельными checkpoints; Anima и остальные pipeline modes,
result-to-preset, Smart Patch и release runtime остаются открытыми; фазы
2B/2C и публичные promises не объявляются завершёнными.

**Illustrious LoRA checkpoint (02.10.2026):**
[Production LoRA slice](../engineering/phase-2c-lora-research.md) подключает
существующий exact-version stack к txt2img и opaque img2img. Main проверяет
managed bytes и ordinary Kohya headers/targets; worker 0.7.0 с pinned PEFT 0.21.2
повторно проверяет tensors и применяет точные signed weights к UNet и обоим CLIP
до conditioning. Full configured stack и verified enabled subset фиксируются
отдельно; disabled missing rows не требуют файла. Queue/Retry, Add, Save/reopen
и read-only comparison сохраняют frozen identity/order/enabled/weight, legacy
absence остаётся Unavailable. Actual tiny CPU, local NVIDIA и native Electron с
controlled inference peer проверены раздельно в evidence. Anima, другие adapter
algorithms (включая LyCORIS/DoRA), remaining Advanced Options,
inpaint/outpaint, result-to-preset, Smart Patch и release runtime остаются открытыми;
Phase 2B/2C и публичные promises не объявляются завершёнными.

**Opaque Illustrious img2img checkpoint (02.10.2026):**
[Следующий opaque img2img checkpoint](../engineering/phase-2c-img2img-research.md)
добавляет production contextual Denoising Strength → typed draft/shadow →
pixel-derived target → frozen queue/Retry → worker 0.6.0 → staging → Add →
immutable portable mode/strength и Save/reopen/comparison. Старые txt2img rows и
provenance сохраняются; partial alpha явно отклоняется как ещё не поддерживаемый
outpaint. Timestep window соответствует Invoke; strength 0 делает VAE roundtrip
без denoising, frozen seed воспроизводим. Native Electron wiring с controlled peer
и actual tiny CPU/NVIDIA ML имеют раздельные evidence boundaries. Anima,
inpaint/outpaint, remaining Advanced Options, result-to-preset, Smart Patch и
release runtime остаются открытыми. LoRA добавлены отдельным checkpoint выше. Phase 2B/2C и публичная готовность PP-005/PP-008
не закрыты этим срезом.

**Illustrious CFG Rescale checkpoint (02.10.2026):**
[CFG Rescale](../engineering/phase-2c-cfg-rescale-research.md) проходит production
Project Advanced Options → typed draft/shadow/Save → frozen queue/Retry → actual
worker → staging → Add → immutable provenance и Raster comparison. Версия 0.5.0
требует `illustrious-cfg-rescale`; прежние qualified peers сохраняют нейтральный
путь, ненулевое значение отвергается до enqueue. Legacy отсутствие в результатах
остаётся unknown. Локальные tensor/GPU проверки и native Electron wiring имеют
разные границы, описанные в evidence. На момент этого checkpoint остальные
advanced options, img2img, LoRA, Anima и release runtime оставались открытыми;
следующий checkpoint выше подключает opaque img2img. Phase 2B/2C не завершены.

**Preparatory Raster comparison checkpoint (02.10.2026):**
[Read-only Raster settings comparison](../engineering/phase-2c-raster-comparison-research.md)
подключён к реальному меню generated/locked слоя. Main/preload передают только
strict portable configuration exact document/layer, без execution context или
локальных путей. Generated with immutable; Current Canvas использует текущие
renderer draft, bbox size, exact library identity/prediction override и completed
seed. Mode вычисляется по verified CPU-composed pixels; worker unavailable не
скрывает baseline. Просмотр не запускает inference/Prepare, не меняет document,
Undo, seed, queue, shadow/index или `.igs`. Async edits, Undo ABA и close/reopen
отвергаются; поздние ответы не открывают закрытый popover. Legacy поля без записи
не подменяются defaults. Native old-bundle RED, compiled Electron GREEN,
projection/backend semantic mutations и normal/compact visual checks перечислены
в evidence. Full pipelines/runtime, полные provenance поля, Smart Patch и
result-to-preset остаются открытыми; фазы 2B/2C не объявляются завершёнными.

**Installed Anima worker0.14 regression checkpoint (08.10.2026):**
[installed Anima worker0.14 regression](../engineering/phase-2c-anima-worker-014-regression-research.md)
завершил 8 normal finite полных UI Generate/Add/Save/readback/reopen/comparison
cycles в 9 admissions с одним actual Cancel: шесть native TXT methods, Euler
opaque IMG и mixed-alpha OUT через frozen Retry. Settings — 256×256, три requested
steps, CFG4, fixed seed0, обычная Myth Portrait LoRA−0.5, raw positive weight1.3/
negative0.7. Frozen native plan, compiled spans, exact checkpoint/companion/LoRA
bindings и portable accepted configuration сохраняются после current prompt/
method/seed37/weight−0.25 edits. Heun TXT имеет пять evaluations; Euler IMG/OUT
strength0.5 — два. OUT сохраняет exact contribution alpha/protected source,
placement и saved merged preview через Add/Save/reopen.

Installed token-weight omission дала один finite provisional completed candidate
и causal same-input pixel RED до Add:0 accepted mutant layers/0 saved mutant
cycles. Raw native cleanup превысил deadline; независимый bounded late
physical-exit proof позволил protected restoration43 original worker sources.
Fresh Euler TXT/IMG/OUT3 полных cycles воспроизводят healthy same-choice pixels.
Итог —11 saved/reopened accepted packages/13 new admissions. Initial0-job UI
setup отдельно принял четыре managed files: три новых owners и Anima version
существующего Cyberfalafel resource, final9 resources/14 versions с сохранёнными
prior6/10/defaults. Source/catalog preparation не является live public delivery
или Set up/Install/Repair qualification.

На этом историческом checkpoint dynamic multi-job/actual seed/crash Reuse
оставались открытыми; bounded Anima follow-up завершён ниже. Production shared
cap32 определён по storage measurements и не изменён. Non-Euler IMG/OUT,
ER-SDE order3, arbitrary formats/geometry/VRAM, derivative-author recipe,
качество/Invoke parity/public delivery/release и полный MVP остаются открытыми.
PP-004/005/007/008 сохраняют «Пока не обещать»; previous counts ниже остаются
historical evidence, отдельным от данного bounded regression.

**Installed Anima dynamic-batch checkpoint (09.10.2026):**
[installed dynamic batches and crash Reuse](../engineering/phase-2c-anima-dynamic-batch-research.md)
проверил actual production renderer/preload/Main/SQLite/installed worker0.14,
Euler256×256/3steps/BF16/CFG4/Myth LoRA−0.5. Weighted positive×negative four pairs
с two images получают Fixed0/per-iteration `0,1,0,1,0,1,0,1`; current prompt/
method/seed37/weight−0.25 edits не меняют frozen/native/portable inputs.

Настоящий completed/running/pending SIGKILL cut оставляет candidate0 и local
cursor0 при unchanged empty saved package/null portable snapshot. Actual Recover
дает два APP_RESTART без receipt; Add1/Hide recovered candidate и Reuse/per-prompt
генерируют0…7. Normal17 finite completions/19 admissions завершаются двумя
saved/reopened packages/17 layers со snapshots1,7. Same-input recovered0 и
Reuse0/1 совпадают с healthy RGBA. Этот sequence сам по себе не исключает любую
ошибочную global-latest cursor implementation; identity guards проверяются
отдельно source/integration tests.

Installed constant-noise-seed mutation при correct declared seed дала2 finite
provisional outputs и pixel RED на seed1 до Add:0 accepted mutant layers.
Physical exit и protected restoration43 source/assets/original inode/mode/mtime/
bytes/backup absence подтверждены; fresh0/1 дают2 GREEN outputs через один
Add2/Save/readback/reopen/comparison cycle. Итог —3 saved packages/19 accepted layers. Независимый raw SQLite/
ZIP/Pillow aggregate PASS различает29 qualified admissions/21 completions и
40 raw attempts/22 completions/18 startup cancellations, включая8 excluded setup
admissions и first partial crash/recovery3 admissions/1 completion/one accepted
unsaved shadow. Old portable package того partial остаётся empty/null, его слой
не включён в19 saved layers. Original9/14/defaults/180 queue rows сохранены;
новых managed files, копий runtime/weights и downloads нет; final physical idle.

Illustrious/NoobAI counterpart описан ниже; отдельный seed follow-up идёт дальше.
На этом срезе cap32/bounded truncation и max32 native были открыты;
последующий bounded cap gate приведён ниже. Broader native inputs,
broader installed truncation/full Fixed/per-prompt matrix, replacement-document
identity, non-Euler IMG/OUT, ER-SDE order3, arbitrary formats/quality/Invoke recipe/
public delivery/release и полный MVP остаются открытыми. PP-004/005/007/008
сохраняют «Пока не обещать». Historical checkpoints/counts ниже не расширяются.

### Installed Illustrious/NoobAI dynamic batches and crash Reuse

[Bounded qualification (09.10.2026)](../engineering/phase-2c-illustrious-dynamic-batch-research.md)
проверила exact trained EPS/Euler a/non-ZTSNR и V/Euler/ZTSNR, leading spacing,
256×256/3steps/CFG5/Digital Art−0.5/native external VAE FP32. Four weighted
positive×negative pairs с two images дают Fixed0/per-iteration0,1,0,1,0,1,0,1;
crash-recovered local Reuse0/per-prompt —0…7. Current prompt/sampler/seed37/LoRA
edits не меняют frozen/native/portable configuration. Actual completed/running/
pending SIGKILL cut сохраняет candidate0/local0 при unchanged saved package/null
snapshot; startup отменяет unfinished с APP_RESTART, Recover/Add1/Hide/Reuse
проходит через настоящий UI.

Оба installed generation-RNG constant0 mutants сохраняют correct metadata и
дают same-input pixel RED на seed1 при GREEN0, до Add/0 accepted mutant layers.
После physical exit/restoration43/original inode/mode/mtime/bytes/backup absence
fresh0/1 каждого objective воспроизводят healthy RGBA через один Add2/Save/reopen
cycle. Независимый raw SQLite/ZIP/Pillow aggregate PASS (10230 checks):58
qualified/raw admissions,42 completions (34 normal,4 provisional mutant,4 fresh),
16 APP_RESTART,6 saved/reopened packages/38 accepted layers, snapshots1,7,1
для каждого objective. Excluded first0-job selector setup сохранён отдельно;
original catalog9/14/defaults/prior220 queue rows/14 managed и4 original sources
не изменены. Один shared runtime, no download/adoption/copies, final physical idle.
Shared driver с family adapters проверен; нового Anima ML run здесь нет.

Random/uint32 были открыты на этом historical checkpoint; отдельный seed
follow-up описан ниже. Max32 native/truncation/full Fixed-per-prompt matrix, replacement
identity, arbitrary formats/geometry/quality/Invoke recipe/public installer/release
и полный MVP не квалифицированы. PP-004/005/007/008 остаются «Пока не обещать».

### Installed Illustrious/NoobAI dynamic embedding subsets

[Bounded qualification (09.10.2026)](../engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
проверила четыре ordinary/negative-only/positive-only/both pairs у EPS/V через
real focused exact-version completion, Generate, Add/Save/readback/reopen и
comparison каждого слоя. Full authored signed refs остаются в frozen context,
native wire и accepted configuration содержат только effective subsets;
ordinary wire вовсе не содержит embeddings. Real current removal/sampler/seed37/
LoRA/dynamic edits не меняют frozen execution. Тот же full source с maxPrompts2
даёт representative ordered2-of4 truncation в fresh controls.

Обе installed negative-alias tensor-zero mutations сохраняют literal metadata,
дают GREEN ordinary и numerical RED на negative-only до Add/0 accepted. Exact
43-file/inode/mode/mtime/bytes restoration/backup absence и physical exit
подтверждены; fresh4 воспроизводят healthy pixels. Independent SQLite/ZIP/Pillow
aggregate PASS5802:20 qualified admissions/16 completions/4 APP_RESTART,
4 saved/reopened packages/12 layers/snapshot0 и12 comparisons. Отдельный
memory-watchdog stop4/0 сохранён как interrupted report с external exit proof;
raw totals24/16/8. Qualified launcher2GiB/native≤12GiB/combined14GiB/swap0,
actual combined peak~9.65GiB. Catalog9/14/defaults/prior278 rows и пять original
sources сохранены, runtime/weights не копировались, final physical idle.
Нового Anima ML run нет. PP-004/005/007/008 остаются «Пока не обещать».

Отдельные Random/uint32 seed и bounded cap follow-ups описаны ниже;
bounded TXT cap32 case и first-three-pair truncation проверены в последующем срезе.
Full Fixed/per-prompt combinations, broader caps/truncation, replacement-document
identity, Anima non-Euler IMG/OUT/ER-SDE order3, arbitrary formats/geometry/quality,
Invoke recipe/public installer/release и полный MVP остаются открытыми.

### Installed Random and uint32 seed boundaries

[Bounded installed seed checkpoint](../engineering/phase-2c-generation-seed-boundary-research.md)
проверил реальный Random switch, один оригинальный Main crypto base на batch и
независимые literal seed tuples у Anima и точных Illustrious-family EPS/V.
Random/per-iteration и Fixed numeric replay дали одинаковые same-input pixels;
requested policy различается, seed behavior и все native inputs сохраняются.
Wrap/per-prompt дал MAX/0/1/2, fresh restoration — MAX/0 с healthy pixels.
Full positive/negative templates остаются authored; maxPrompts 2/1 выбирают первые
пары без hidden job truncation. Current prompt/sampler/seed 37/LoRA/dynamic edits
не меняют frozen/native/portable settings; 42 comparisons сохранили requested
policy, actual seed и selected behavior каждого принятого слоя.

Три installed generation-noise high-bit mutations дали causal pixel RED до Add:
3 provisional outputs/0 accepted mutant layers. Physical exit, protected exact
43-file restoration/original inode/mode/mtime/bytes/backup absence и fresh 6 GREEN
подтверждены. Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified
admissions/45 finite outputs (36 normal, 3 provisional mutant, 6 fresh)/42 accepted
saved layers/12 reopened packages/9 APP_RESTART. Raw 58/49/46/13/9 включают отдельно
superseded healthy EPS Random 4/4/4/1; два excluded setup 0/0 не являются semantic
RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults/eight
original sources сохранены; final Main/worker physical idleness подтверждён.

Cap32/bounded truncation был следующим gate на этом seed checkpoint;
завершённый bounded follow-up приведён ниже.
Полный seed-policy/mode matrix, replacement-document identity, arbitrary formats/
geometry/quality/public delivery/release и полный MVP остаются открытыми.
PP-004/005/007/008 сохраняют «Пока не обещать».

### Installed NoobAI Karras numerical refusal

[UNet diagnostic checkpoint](../engineering/phase-2c-noobai-karras-failure-research.md): V/Karras wrong-EPS:5 qualified admissions/4 completions/1 UNet failure/2 Save-reopen packages,2 own wholeRGBA matches; raw6/5/1/3 includes one excluded observer attempt. No candidate/receipt/cursor publication on failure; independent raw PASS7754. PP statuses remain «Пока не обещать».
Exact V/true-ZTSNR/leading and EPS/false-ZTSNR/leading,TXT256/N4/CFG4/Fixed0,
DigitalArt−0.5/external VAE FP32 only. Worker distinguishes UNet/VAE refusal;
Main exposes safe diagnostics, preserves frozen Retry and changes no model policy.
Original installed43 files/identities restored; peak<=14GiB/swap0/1800s.
Older «next gate» statements below describe historical checkpoints.
Local installed-resource previews выполнены отдельным [finite срезом](../engineering/phase-2c-resource-previews-research.md).
Текущий [finite exit ledger](../engineering/phase-2c-exit-ledger.md) отделяет
закрытый generation slice от оставшихся owners фаз 3–5. Следующий шаг — production Presets.
Broader modes/Advanced/quality/fullMVP/release stay open.

### Installed Anima image cap32 and selected prefix

[Anima image cap32/prefix](../engineering/phase-2c-anima-image-batch-cap-research.md): Euler256 IMG/normal mixed-alpha OUT:76 admissions/completions/accepted layers,4 Save-reopen packages,12 собственных wholeRGBA prefix matches. Два confirmed33 refusals сохраняют32 временных результата и исходный слой без новых jobs/receipts. Independent raw readback PASS85373;4 cursor/Save snapshots7/5,11 прежних SQL tables и43 worker identities сохранены;2 OUT previews/111104 protected source pixels. Только N3/CFG4/strength0.5/Myth−0.5/exact resources; quality/Invoke parity/fullMVP/release не заявлены. Boundary4pairs×8/per-iteration32 и prefixfirst3pairs×2/per-prompt6 дают source1+32/6 layers. Reboot-interrupted32/11/21 относится к отдельному recovery observation и не входит в qualified76.

Запланированный здесь NoobAI V / DPM++ 2M Karras wrong-EPS закрыт отдельным diagnostic checkpoint выше; следующий implementation item — local thumbnails/previews installed resources. Invalid wrong-EPS может отказать до candidate; pixel RED не является обязательным результатом. Новый error evidence не восстанавливает утраченный исходный traceback.

### Installed Anima image Random → Fixed

[Installed Anima image Random → Fixed](../engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. PP-004/005/007/008 остаются «Пока не обещать».

### Installed Anima image per-prompt

[Installed Anima image per-prompt](../engineering/phase-2c-anima-image-per-prompt-research.md): Euler × common-source IMG/normal mixed-alpha OUT:80 admissions/completions/accepted layers,4 Save/reopen packages и16 own same-input wholeRGBA per-prompt controls. В каждом режиме genuine numeric-control4pairs×8/Fixed0/per-iteration сравнивается с4pairs×2/Fixed0/per-prompt по seeds0…7; control slots0,1,10,11,20,21,30,31. Independent raw readback PASS23682:80 owning comparisons,4 cursor/Save snapshots7,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. Full frozen DTO сохраняется; только owner IDs и предварительно проверенный seedBehavior исключены из matching. Concrete raw weighted prompts остаются portable; templates/maxPrompts/compiled arrays — вне provenance. 98 focused tests PASS0skip;18 actual Main source executions дают2 semantic RED/16 GREEN. 64 within-pair seed contrasts, без scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; cap32-refusal/Random/Reuse/wrap/quality/fullMVP/release не заявлены.

Восстановленная565-source copy удалена через проверенный held-FD guard после actual readback; освобождено10985472 allocated B. Random → Fixed32/4/16 подтверждён отдельно; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; cap32/prefix refusal, другие методы/форматы/геометрия/Advanced/качество/release остаются отдельными. Masks, Regional Guidance и Smart Patch — phase4. PP-004/005/007/008 сохраняют «Пока не обещать».

### Installed Anima dynamic image foundation

[Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md): Euler × common-source IMG/normal mixed-alpha OUT:20 admissions/completions/accepted layers,4 Save/reopen packages и4 own same-input wholeRGBA prefix controls. Четыре weighted positive×negative пары × две iterations; Fixed0/per-iteration seeds0/1, full authored templates и selected first-pair prefix. Полные compiled strings/spans остаются в frozen worker inputs; portable provenance содержит concrete raw weighted prompts без compiled arrays/templates/maxPrompts. Independent raw readback PASS18128:20 owning comparisons,4 cursor/Save snapshots1,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. 75 focused tests PASS0skip;18 actual Main source executions дают4 semantic RED/14 GREEN. 34 visible joint-input contrasts не доказывают scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; quality/fullMVP/release не заявлены.

Последующий [Anima Fixed/per-prompt image80/4/16 gate](../engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. Остальные методы/геометрия/форматы/Advanced/качество/release остаются отдельными. Masks, Regional Guidance и Smart Patch — phase4. PP-004/005/007/008 сохраняют «Пока не обещать».

### Installed image dynamic embedding subsets

[Installed image dynamic embedding subsets](../engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md): EPS/V × common-source IMG/normal mixed-alpha OUT:24 admissions/completions/accepted layers,8 Save/reopen packages и8 own same-input wholeRGBA prefix controls. Fixed0/per-iteration baseline4/prefix2 сохраняют full authored refs и effective signed native/portable subsets; ordinary wire omits embeddings. Independent raw readback PASS18641:24 owning comparisons,8 cursor/Save snapshots0,11 old tables,43 worker identities и4 OUT previews/222208 protected source pixels. 118 focused tests PASS0skip;48 actual Main source executions дают16 semantic RED/32 GREEN. 28 visible input contrasts не доказывают embedding-only causality; новых installed-worker mutations нет. Только256×256/Normal N3/exact resources; quality/fullMVP/release не заявлены.

Source-informed raw readback,48 actual Main source executions and guarded removal of547 restored members are complete; native24/8/8 counts exclude all historical cap/Wrap/TXT evidence and cleanup-only controls. Public statuses remain «Пока не обещать».

[Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) завершён отдельным20/4/4 gate. Последующий [Anima Fixed/per-prompt image80/4/16 gate](../engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика. Anima image seed policies, Karras wrong-EPS pixel RED, broader formats/geometry/method-policy/Advanced/quality/release remain separate. Masks, Regional Guidance and Smart Patch remain phase4.

### Installed image cap32 and selected prefix

[Installed image cap32 and selected prefix](../engineering/phase-2c-illustrious-image-batch-cap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 152 qualified admissions/completions/accepted saved layers,8 Save/reopen packages,24 own same-input wholeRGBA prefix controls. Четыре genuine confirmed33 UI refusals сохранили все32 temporary candidates и source1 без новых jobs. Independent raw readback PASS (104613 checks):152 configurations/comparisons,8 cursor/Save snapshots, 11 old tables и43 worker identities сохранены;34 source keys/five bundles bound. Historical Main:16 semantic RED/84 GREEN in100 executions; fresh deadline DI:4 RED/371 GREEN in375 executions; обе536-source copies exact-restored and guarded-cleaned,preexecution261 focused tests PASS0skip. R2 boundary2700s/prefix1800s при прежних12+2GiB/14GiB/zero-swap/1600s completion poll. R0 timeout сохраняет32 actual accepted layers/one actual package/zero qualified stages; raw across attempts184, qualified counts exclude R0. Native seeds0…7 — только256×256/Normal N3/four pairs×8 boundary иfirst3pairs×2 prefix; MAX cross-pair wrap/Anima image/installed mutation/quality/fullMVP/release не заявлены.

Boundary4pairs×8 сохраняет Fixed0/per-iteration seeds0…7 у каждой пары; prefixfirst3pairs×2 сохраняет Fixed0/per-prompt seeds0…5 и совпадает с boundary slots0,1,10,11,20,21. В сравнениях отличаются только seedBehavior metadata и portable document identity/revision; prompts, actual seeds, targets, conditioning, resources и algorithms остаются полными. Все8 packages содержат source1+accepted32/6; cursors/Save snapshots7/5 соответствуют last actual output. 33-job refusal проверен до Add с32 genuine temporary candidates; paired raw captures/save copies сохраняют source, candidates, rows, private inputs и Undo/Redo availability flags. Hidden Undo stack и later historical private-tree bytes не заявляются. На этом cap checkpoint следующим был image dynamic embedding subset gate; его последующий finite24/8/8 результат подтверждён выше. [Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) завершён отдельным20/4/4 gate. Anima image Fixed/per-prompt80/4/16 подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельно; на этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.

### Installed image uint32 wrap

[Installed image uint32 MAX→0 wrap](../engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Числовые MAX и0 controls используют отдельные проекты и тот же first weighted pair; wrap outputs сопоставлены до Add с собственными controls по полным executed inputs, без подмены seed/reference descriptor. Двенадцать saved packages сохраняют source1+accepted1/2; все12 cursor/Save snapshots соответствуют last actual seed, wrap snapshot0. Пять bundles/28 complete source keys unchanged; новый installed-worker mutation не выполнялся, старый TXT high-bit RED остаётся историческим evidence. На этом Wrap checkpoint следующим был image cap32; последующий [finite cap/prefix gate](../engineering/phase-2c-illustrious-image-batch-cap-research.md) завершён отдельно. Следующий finite gate — image dynamic embedding subsets (Illustrious-family EPS/V × IMG/normal mixed-alpha OUT); public promises остаются открытыми.

### Installed image Reuse after crash

[Installed image Reuse after crash](../engineering/phase-2c-illustrious-image-reuse-crash-research.md): four EPS/V × IMG/normal mixed-alpha OUT, Fixed B crash → Home Recover → public Reuse B+0…7 → Add/Save/reopen. Independent raw readback44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 packages,32 Reuse +4 crash wholeRGBA matches; source1/hidden recovered1/new8, immutable policies/configuration/source contexts, all11 old tables and43 worker identities preserved. Setup3/1/2cancel/1unsaved is excluded; raw47/37/10cancel/36saved+1unsaved remain separate. Main Reuse0/stale91 mutation gives4 semantic RED,8 neighbors GREEN and fresh12 restored GREEN;169 focused tests and lint pass. Only256×256/Normal N3/two updates/exact resources; no manifest-first/snapshot-fallback/wrap/cap32/Anima image/quality/fullMVP/release claim. At this historical checkpoint image uint32 wrap was next; the subsequent [finite MAX→0 gate](../engineering/phase-2c-illustrious-image-seed-wrap-research.md) records its own16 jobs/12 packages/8 numeric-control matches. Image cap32 was next at this historical checkpoint; the later [finite cap32/prefix gate](../engineering/phase-2c-illustrious-image-batch-cap-research.md) records152 jobs/eight packages/24 own controls/four retained32-result refusals. This historical next cut, image dynamic embedding subsets, is now qualified in the finite24/8/8 checkpoint above; Anima image Fixed/per-prompt80/4/16 now qualified separately; Anima image Random → Fixed32/4/16 qualified separately; at this checkpoint recovered Anima image Reuse was next; subsequent Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) and MAX→0 (8 outputs / 6 packages / 4 own controls) are qualified separately; Anima image cap32/prefix refusal is qualified separately76/4/12/2; current next gate: NoobAI V / DPM++ 2M Karras wrong-EPS observable failure/diagnostics; foundation [Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) qualified; PP-004/005/007/008 remain «Пока не обещать».

### Installed image Random → Fixed replay

[Installed Illustrious/NoobAI image Random → Fixed replay](../engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](../engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](../engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](../engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](../engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

### Installed dynamic IMG and OUT for Illustrious

[Finite qualification](../engineering/phase-2c-illustrious-dynamic-image-research.md)
для Illustrious/NoobAI получила independent finite reader PASS: 10833 checks.
Она использует отдельный common-source PNG для каждого EPS/V
objective, одинаковый в IMG и normal mixed-alpha OUT. Fixed0/per-iteration даёт
четыре weighted positive×negative
пары × две iterations с literal seeds `0,1,0,1,0,1,0,1`. Normal N3/CFG5/
strength0.5, Digital Art−0.5 и внешний VAE FP32 фиксированы; подтверждены два actual
updates. Полные authored templates, каждый concrete pair, captured target и
ресурсы сохранились после реальных поздних правок draft; сами поздние draft edits
сохранились отдельно от accepted settings при Save.

Исправленный frozen R2 plan фактически дал 32 healthy + 8 provisional controls +
8 fresh restored admissions/completions: 48 qualified completions, 40 accepted
layers и 8 saved/reopened packages. Protected generation-noise-seed→0 cycle дал
четыре causal pixel RED для seed 1 до Add, четыре seed 0 neighbor wholeRGBA GREEN
и восемь fresh restored fullRGBA matches. Все шесть same-seed контрастов между
четырьмя prompt pairs, включая диагонали, прошли для обоих seeds во всех четырёх
scopes: 48 prompt contrasts. Independent raw SQLite/ZIP reader проверил полную
source-over композицию; четыре OUT previews сохранили soft alpha и 222208
protected-source pixels. Все 43 исходные source identities восстановлены.

Один исходный native control report сохраняет cleanup ENODEV при чтении
исчезающего cgroup. Отдельные source-bound PID/start/cgroup supplements подтверждают
физический выход именно его native и launcher; этот cleanup race не является
numerical mutation RED. Final artifact cleanup и подготовленный ENODEV repair
с проверками завершены после original-source readback: fresh system proof дал
820 checks. Env/cwd guard component отказал точно своему controlled process;
isolated mutation только реального predicate дала semantic RED, затем own unit
128 MiB/swap0/deadline20 физически закрыт и fresh original guard прошёл.
Guarded cleanup удалил только nine R0 paths (9117696 allocated B) и seven R2 paths
(7651328 allocated B), сохранив все 43 original source identities.
ENODEV repair проверен в isolated complete actual two-file copy: 30 baseline
GREEN, 4 semantic RED/26 neighbor GREEN, 30 fresh restored GREEN; copied
inode/mode/mtime/SHA восстановлены точно. No ML reruns; finite gate подтверждён.

Первый EPS IMG attempt дал 8 outputs/8 accepted layers и сохранил пакет, затем
упал на неверном all-visible ожидании profile: production Add показывает только
выбранный anchor. Его report, bytes и отдельная exclusion сохранены. Новый hook
проверяет anchor-only default, явно показывает остальные variants через реальные
кнопки UI и проверяет, что изменилось только visibility перед Save. Исправление
sticky completion verification тоже находится в test harness. Production Add,
worker и Save не менялись. Qualified 48 completions/40 accepted отделены от raw
56/48 с первым failed attempt; исходная ошибка остаётся в evidence, а его accepted
package не становится одним из восьми qualified packages.

Подтверждённый последующий [Installed Illustrious/NoobAI per-prompt IMG/OUT](../engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](../engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](../engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](../engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. На этом историческом checkpoint следующим был image cap32; последующий [finite cap32/prefix gate](../engineering/phase-2c-illustrious-image-batch-cap-research.md) подтвердил152 admissions/completions/accepted saved layers,8 packages,24 own prefix wholeRGBA controls и4 confirmed33 refusals, сохранившие32 temporary candidates. На этом cap checkpoint следующим был image dynamic embedding subset gate; последующий [finite24/8/8 checkpoint](../engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён. [Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».
На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать».

### Installed NoobAI multiple-LoRA image modes

[Installed NoobAI multiple-LoRA IMG/OUT](../engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

### Installed NoobAI signed embedding IMG/OUT direction

[Installed NoobAI signed embedding IMG/OUT](../engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

### Installed NoobAI v-prediction DPM++ 2M image modes

[Installed NoobAI V DPM++ 2M IMG/OUT](../engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

### Installed NoobAI v-prediction DPM++ 2M TXT

[Installed NoobAI V DPM++ 2M TXT](../engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

### Installed five-sampler numerical campaign

[Installed five-sampler campaign](../engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

### Installed Anima DPM++ 2M image modes

[Installed Anima DPM++ 2M IMG/OUT](../engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

### Installed Anima Heun image modes

[Installed Anima Heun IMG/OUT](../engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

### Installed Anima ER-SDE order3

Предыдущий [installed Anima ER-SDE order3 checkpoint](../engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать».
Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

### Installed cap32 and bounded truncation

Последний [installed cap32/bounded truncation checkpoint](../engineering/phase-2c-generation-batch-cap-research.md)
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
ER-SDE order3 был открыт на этом checkpoint; его bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Отдельно выполнены три empty pre-refusal Save и сохранены шесть proof-copy `.igs`;
они не прибавляются к шести accepted saved/reopened packages. Source tests
negative saturation/asymmetric prefix и exact negative31/32/33 не являются
дополнительными installed ML runs. Original 360 queue/202 cursors/298 receipts,
catalog9/14/defaults,43 installed source/assets и eight model sources сохранены;
final physical idle подтверждён.

### NoobAI: полная поддержка в рамках MVP

**Статус на 08.10.2026:** запланировано, не реализовано целиком. База —
`86cb88e`: NoobAI admission и bounded Cyberfalafel v/epsilon qualification уже
есть. [Обычный Euler](../engineering/phase-2c-euler-research.md) добавлен в
authoring, frozen queue/Retry, native dispatch и portable accepted settings;
[noise-profile срез](../engineering/phase-2c-noise-profile-research.md)
добавляет exact-file controls, SQLite policy, frozen execution/Retry и accepted
readback/comparison. [Installed NoobAI author-recipe qualification](../engineering/phase-2c-noobai-author-recipe-research.md)
проверяет два distinct trained checkpoints, independent noise/sampler controls,
Cancel/refused/restored Retry и два source-grounded прогона 832×1216/28 steps.
Новый [installed NoobAI mixed-alpha outpaint checkpoint](../engineering/phase-2c-noobai-outpaint-research.md)
проверяет оба objectives на worker0.14: два source completions, два restored
frozen outpaint Retry, шесть admissions, две actual Cancel и шесть preserving
policy refusals. [Component source/Prepare checkpoint](../engineering/phase-2c-noobai-components-research.md)
закрывает точный NoobAI standalone-VAE source gate, реальные controlled-source
install/repair/reopen/qualifiers трёх компонентов и безопасную диагностику
Generate/Retry. На unchanged installed worker0.14 отдельно проверены CPU загрузка
обоих полных VAE layouts и finite trained dual-CLIP state. Последующий
[installed component checkpoint](../engineering/phase-2c-noobai-component-inference-research.md)
завершил 36 finite EPS/V txt/img/outpaint cases в 36 admissions при256×256/трёх
requested steps и два lifecycle: два completed restored Retry, четыре admissions,
две actual Cancel и шесть preserving missing-component refusals. Current draft37
и Default/component/prompt edits не меняют frozen seed0/resources/target.
Четыре installed EPS-txt2img component mutations дали causal RED после шести
finite Generate/Add/Save/readback/reopen cases каждая. Исходник восстановлен
между прогонами; fresh restored EPS-txt2img normal прошёл шесть finite cycles с
native physical exit. Final source evidence подтверждает 43 byte-exact worker
source files, idle Main/worker и все пять restored mutation journals без backup
с original inode/mode/mtime.
Последующий [bounded encoder checkpoint](../engineering/phase-2c-noobai-vae-encoder-research.md)
завершил 8 EPS/V TXT/strength0.5 IMG full finite cycles: matched TXT pixels equal,
IMG different при encoder-only bias control и unchanged decoder/config.
Catalog5/9 сохраняет исходные восемь versions; local derived sources не доказывают
public delivery. EPS-img2img encode-zero mutation дала causal RED после двух
finite cycles; physical exit/restored43/original inode/mode/mtime подтверждены,
fresh restored pair прошла два finite GREEN cycles с physical exit.
Отдельный [outpaint encoder checkpoint](../engineering/phase-2c-noobai-outpaint-encoder-research.md)
подтвердил четыре finite EPS/V normal OUT cycles/четыре admissions и две matched
пары при256×256/трёх requested steps/FP32/seed0/strength0.5 с двумя effective
native denoising evaluations. Exact contribution alpha/protected source и
Add/Save/readback/reopen/comparison сохраняются; visible generated RGB и saved
merged RGB меняются на соответствующих координатах. Catalog5/9 сохранён,
newManagedFiles0; physical exit обоих native runs подтверждён. Installed EPS-OUT
encode-zero mutant завершил два finite cycles до intended visible-RGB RED;
physical exit/restored43/original inode/mode/mtime подтверждены. Fresh restored
pair прошла два finite GREEN cycles с physical exit и exact original EPS RGBA/
merged pixels. Final8 OUT cycles (4 normal +2 finite mutation cycles до causal
RED +2 fresh GREEN) связаны с actual SQLite completed rows/receipt bytes и CPU
control descriptors во всех frozen VAE refs; independent Pillow saved `.igs`
decode проверяет alpha/protected source/corresponding visible/merged pixels.
Main/worker/nativeData idle, restored43/original inode/mode/mtime/bytes, backup
отсутствует. Прежние 8 normal +2 mutation +2 fresh TXT/IMG cases остаются отдельными. All-layer/formats/quality/Invoke parity, public
delivery и release этим normal срезом не квалифицируются.

Текущий installed [embedding polarity gate](../engineering/phase-2c-noobai-embedding-polarity-research.md)
прошёл четыре finite normal EPS/V TXT UI cycles/четыре admissions: Z/T и T/Z
на objective, один literal в каждом sign, exact trained/zero versions, LoRA−0.5,
native external VAE/FP32,256×256/три steps/seed0. Strict catalog5/9 сохраняется
без публикации managed files. Три успешных independent native oracles проверили12
direct T/T,T/Z,Z/T,Z/Z hidden/pooled/handoff assignments с branch isolation;
это не generated jobs. Oracle использует rehydrated frozen queue jobs и queue
ID для correlation; exact live dispatch проверяют настоящие UI cycles.
Installed EPS sign-swap дал causal directional RED после двух finite UI cycles
при unequal pixels; physical exit/restored43/original inode/mode/mtime/bytes/
backup absence подтверждены, fresh EPS pair2 GREEN. Final8 saved packages/Pillow
pixels/SQLite completed rows/receipt bytes/exact signed refs/settings/frozen0-
current37 проверены; mutant pixels равны противоположным normal choices, fresh —
своим. Main/worker idle подтверждён, прежние counts остаются отдельными.
Последующий [native multiple-LoRA checkpoint](../engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations: каждый
exact Digital Art−0.5/Lineless+0.75 source и union986 targets (UNet722/CLIP1 72/
CLIP2 192), independent source/graph mapping и temporary FP32 CPU module algebra
на half-loaded trained checkpoints. Source→adapter→weight/order, single/AB/BA/
enabled-zero controls и unload restoration проверены; оба normal PID exits/43
original sources подтверждены. Это0 UI jobs/images/receipts/conditioning/denoising,
readonly catalog5/9/153queue без adoption/download/model/runtime copies.
Installed weight-swap прошёл2 healthy single variants/1972 observations до точного
AB numeric RED. Physical child exit/restored43/original inode/mode/mtime/bytes/
backup absence подтверждены; fresh EPS6 GREEN/5916 observations воспроизводит
normal base SHA. Final full catalog/queue row SHA5/9/153 и managed files не
меняются, Main/worker idle; current delivered oracle SHA связывает все4 executions.
Отдельный [multiple-LoRA UI checkpoint](../engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT full Add/Save/readback/reopen/comparison cycles в
8 admissions: AB/BA/B-enabled-zero/B-disabled, 256×256/три steps/seed0/native
external VAE FP32. Exact Digital−0.5/Lineless+.75 задаются настоящим Add и
remove/re-add; configured и effective ordered tuples frozen после live reorder/
weight edits; portable provenance сохраняет exact refs, включая CivitAI IDs.
UI comparison проверяет ordered name/version/SHA/enabled/weight, без утверждения
о проверке каждого rendered description field. B-zero==B-disabled pixels, оба
full stacks отличаются от controls; AB/BA pixel relation не требуется. Strict6/10
сохраняет original9; отдельный setup выполнил единственную171540060B Lineless
adoption, normal/fresh runs добавили0 managed files. Installed weight-swap дал
same-input pixel RED после1 finite provisional AB candidate до Add:0 accepted
layers/0 полных saved mutant cycles. Physical exit/restored43/original inode/mode/
mtime/bytes/backup absence подтверждены; fresh restored EPS4 GREEN воспроизводит
healthy same-choice pixels. Independent SQLite/raw ZIP/Pillow aggregate PASS:
12 qualified saved packages/cycles (8 normal+4 fresh),14 total admissions включают
1 excluded saved setup partial и1 provisional mutant. Все prior model/queue rows
сохранены, final Main/worker idle43 exact подтверждён. Последующий bounded
Anima worker0.14 и bounded dynamic/seed/cap/Heun/DPM++ 2M/five-sampler gates описаны выше;
V DPM++ 2M TXT/common-source IMG/OUT, signed embedding и multiple-LoRA image срезы завершены выше; per-iteration dynamic image gate подтверждён: independent reader10833, fresh system proof820, guarded cleanup и ENODEV repair с isolated semantic controls завершены; последующий [Illustrious/NoobAI Fixed0/per-prompt common-source IMG/OUT gate](../engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md) уже подтверждён отдельно:32 healthy jobs/4 packages, четыре пары ×2/seeds0…7 в четырёх scopes, без дополнительных mutation/crash cases; broad formats/quality/release остаются gap. NoobAI не становится третьим семейством или отдельным backend.

**Основание:** [официальный NoobAI XL 1.0](https://huggingface.co/Laxhar/noobai-XL-1.0)
рекомендует Euler a; [NoobAI XL V-Pred 1.0](https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0#how-to-use-the-model)
использует обычный `EulerDiscreteScheduler`, `v_prediction` и
`rescale_betas_zero_snr=True`. До noise-profile среза worker при выборе prediction
type сохранял общий pinned schedule; теперь native scheduler получает независимый
frozen профиль точного файла. Euler больше не является implementation gap;
ZTSNR/spacing policy реализована отдельным срезом; установленный worker0.14 теперь
проверен на официальном epsilon NoobAI и v-trained Cyberfalafel. V recipe использует
upstream NoobAI guidance на credited derivative; leading spacing отдельно отмечен
как export-based assumption. Рекомендация автора по sampler не доказывает
техническую несовместимость всех остальных методов.

**Checkpoint 07.10.2026:** пункты 2–4 по policy/frozen execution имеют
[реализацию и evidence](../engineering/phase-2c-noise-profile-research.md):
Model Manager per-field assumptions/override/reset, exact SQLite persistence,
worker0.14 native schedules, preserving Retry, portable accepted profile/legacy
Unavailable. Предшествующий author-recipe installed checkpoint проверяет пять trained single-axis
controls (их partial report завершился oracle-launcher setup error), отдельный
успешный lifecycle stage с четырьмя finite completions/пятью admissions/Cancel/тремя
refusals и два author-parameter cases. Три installed CPU mutations независимо
ловят ignored ZTSNR, spacing и Euler dispatch; source bytes восстановлены.
Один canonical reusable environment обновлён до worker0.14 с native startup/exit
и свежим manifest; исторический worker0.12 provision report сохранён. Component
combinations оставались открытыми на этом author checkpoint; последующий bounded
36-case component checkpoint описан выше. Independent component gates и новые
Anima trained regressions на worker0.14 оставались открытыми на этом author
checkpoint; subsequent bounded component и Anima gates описаны отдельно выше.
Последующий outpaint checkpoint независимо проверяет shifted
source RGB, protected preview pixels, effective timestep cutoff и placement после
Add/Save/readback/reopen. Исправлена диагностика смены exact checkpoint/noise
policy при frozen outpaint Retry: сохраняющий отказ теперь сообщает
`GENERATION_INPUT_CHANGED`, без ослабления проверок. Это bounded256×256/three-step
evidence, а не full NoobAI/MVP или release qualification; пункты ниже сохраняют
полный scope.

Порядок реализации:

1. **Закрепить профиль и его происхождение.** Сверить source/config точных
   epsilon и v-prediction NoobAI checkpoints, реальные механизмы Invoke и
   pinned Diffusers. Зафиксировать независимые `predictionType`, zero-terminal
   SNR и timestep spacing, исходный beta/sigma schedule и версию его semantics.
   `v_prediction` не включает ZTSNR или `trailing` автоматически; обязательность
   каждого параметра проверяется для конкретного профиля. Решение пользователя
   07.10.2026: отдельные ZTSNR и timestep-spacing controls в Model Manager;
   prediction type остаётся только здесь. Для неизвестного файла сохраняем
   нынешние defaults (`false` / `leading`) с явной пометкой предположения и
   ручной настройкой, без обязательного выбора перед первой генерацией.
   Проверенные author values отличаем от предположений. Не выводить весь профиль
   из имени, метки
   `NoobAI` или формы tensors. Проверить применимость marker/config metadata,
   не превращая её в недоказанную автоматическую политику.
2. **Расширить canonical exact-file policy.** Хранить эксплуатационный профиль
   по SHA-256 и размеру отдельно от source metadata; его editable owner — Model
   Manager. Project показывает текущие checkpoint values read-only, а sampler
   остаётся обычной generation setting. Repair/reinstall того же файла сохраняет
   override; версия с другими SHA-256/размером не наследует его без явного действия.
   Другие source/version rows того же exact файла используют общую policy.
   `.igs` и Preset snapshots остаются advisory: новый Prepare использует текущую verified library
   policy. Поддерживаемые NoobAI checkpoints устанавливаются без SHA allowlist;
   совместимость весов проверяется отдельно. Пересмотреть type-aware matrix для
   compatible LoRA, dual-CLIP embeddings и external VAE. Source/Prepare часть
   выполнена 08.10.2026: точная метка NoobAI допустима для standalone VAE,
   реальные structural qualifiers и безопасные component refusals сохранены;
   complete native CPU VAE loading отделено от последующего trained GPU evidence
   в bounded36-case component checkpoint. Exact local source/catalog preparation
   остаётся precondition; оно не квалифицирует live public delivery или Install/Repair.
   Неизвестный компонент диагностировать явно. Обновить
   [managed-model contract](../contracts/managed-model-library.md) и
   [generation settings](../features/project/generate-mode/generation-settings.md)
   до изменения этих границ.
3. **Провести профиль через frozen execution.** Typed TS проверяет и фиксирует
   policy при Prepare; queue, strict IPC/worker DTO и Python получают один
   versioned snapshot. Worker применяет параметры к native scheduler; network
   и library defaults в Python не появляются. Реализовать обычный Euler через
   `EulerDiscreteScheduler` отдельно от Euler a. Для каждой доступной пары
   sampler/profile проверить поддержку pinned backend; неподдерживаемая пара
   или старый worker отклоняется до enqueue без silent fallback. Изменение policy
   между Prepare/materialization либо перед Retry даёт сохраняющий отказ без
   новых rows/receipts/candidates/seed effects. Восстановление original policy
   позволяет Retry с теми же frozen inputs/target, без новой composition.
4. **Сохранить воспроизводимость и старые данные.** Расширить queue/storage,
   [worker protocol](./05-worker-protocol.md) и
   [generation provenance](../features/project/generate-mode/generation-provenance.md):
   accepted result хранит фактический профиль, версию semantics и portable
   exact refs, без локальных путей. Add/Undo/Redo, shadow recovery, Save,
   независимый readback, portable reopen/relink и read-only comparison сохраняют
   его и исходные pixels. Library edits не переписывают Project/preset/accepted
   records. До migration определить legacy путь: прежние frozen jobs сохраняют
   исходный schedule и JSON; если исполнить его невозможно, показывается явный
   сохраняющий отказ. Отсутствующий профиль старого accepted result остаётся
   `Unavailable`, а не достраивается по текущей библиотеке. Новые capability/
   version gates не блокируют обычные legacy Generate и Save.
5. **Квалифицировать на настоящих моделях.** Проверить реальные trained epsilon
   и v-prediction NoobAI checkpoints или credited derivatives с подтверждёнными
   exact bytes и declared profile. Неверная epsilon-интерпретация одного v-trained
   файла остаётся causal control, а не заменой trained epsilon fixture. Матрица
   включает txt2img, common-source nonzero img2img, существующий normal mixed-alpha
   outpaint, compatible LoRA/embeddings/VAE, Cancel, refused/restored frozen Retry
   и явный Add/Save/reopen/comparison. Bounded smoke дополнить заранее ограниченным
   прогоном с авторскими steps/resolution, фиксируя окружение и источник recipe;
   finite output сам по себе не доказывает правильность расписания или качество.
   **Component checkpoint 08.10.2026:** оба declared EPS/V recipes завершили
   bounded256×256/three-step matrix: 36 finite completions/36 admissions,
   шесть choices для каждого txt/img/normal-outpaint mode. Common-source image
   modes используют один full-stack txt2img PNG на objective. Два отдельных
   lifecycle дали два restored Retry completions/четыре admissions/две Cancel/
   шесть preserving missing-component refusals после Default/component/prompt/
   current seed37 edits, сохранив frozen0 и exact target. Actual Add/Save,
   independent readback/reopen и read-only comparison проверяют portable tuple
   и pixels. Exact five-resource/eight-version catalog и sources — declared
   local preconditions; это не live CivitAI delivery или engine Install/Repair.
   Четыре installed EPS-txt2img ignored-component mutations дали causal pixel RED
   после шести finite Generate/Add/Save/readback/reopen cases каждая;
   source восстановлен между прогонами. Fresh restored EPS-txt2img normal прошёл
   шесть finite cycles с native physical exit; final source evidence подтверждает
   все 43 byte-exact worker source files, idle Main/worker и пять restored journals
   без backup с original inode/mode/mtime. Следующий
   [bounded encoder checkpoint](../engineering/phase-2c-noobai-vae-encoder-research.md)
   завершил 8 EPS/V TXT/strength0.5 IMG full cycles при256×256/трёх шагах:
   decoder/config unchanged, TXT equal/IMG different, exact5/9 catalog,
   Add/Save/readback/reopen/comparison и actual current37/frozen0 provenance.
   Один installed EPS-img2img encode-zero mutant завершил два finite cycles
   до intended pixel RED и восстановлен с physical exit/restored43/original
   inode/mode/mtime. Fresh restored pair прошла два finite GREEN cycles с physical exit.
   Отдельный [outpaint encoder checkpoint](../engineering/phase-2c-noobai-outpaint-encoder-research.md)
   добавил четыре normal finite EPS/V OUT cycles/четыре admissions и две matched
   visible contribution/corresponding saved merged RGB пары с exact alpha и
   protected source через Add/Save/readback/reopen/comparison. Bounded256×256,
   три requested steps, FP32, seed0/strength0.5 дают два effective native
   denoising evaluations; catalog5/9 сохранён, newManagedFiles0, оба native
   physical exit подтверждены. Installed EPS-OUT encode-zero mutant дал intended
   visible-RGB RED после двух finite cycles; physical exit/restored43/original
   inode/mode/mtime подтверждены. Fresh restored pair прошла два finite GREEN
   cycles с physical exit и exact original EPS RGBA/merged pixels. Final8 OUT
   cycles (4 normal +2 finite mutation cycles до causal RED +2 fresh GREEN) связаны
   с actual SQLite completed rows/receipt bytes и CPU control descriptors всех
   frozen VAE refs; independent Pillow saved `.igs` decode подтверждает alpha,
   protected source и corresponding visible/merged pixels. Main/worker/nativeData
   idle, restored43/original inode/mode/mtime/bytes, backup отсутствует.
   Исторические 8 normal +2 mutation +2 fresh TXT/IMG counts не расширяются.
   Отдельный [installed embedding polarity gate](../engineering/phase-2c-noobai-embedding-polarity-research.md)
   прошёл четыре finite normal EPS/V TXT UI cycles/четыре admissions (Z/T,T/Z на
   objective) при256×256/трёх steps/seed0, exact one-literal signed embeddings,
   LoRA−0.5 и native external VAE/FP32; catalog5/9 сохранён без публикации файлов.
   Три успешных native oracles независимо проверили12 direct hidden/pooled/handoff
   assignments и branch isolation без generated jobs. Installed EPS resource-sign
   swap завершил два finite UI cycles до directional RED при сохранённой pixel
   inequality; physical exit/restored43/original inode/mode/mtime/bytes/backup
   absence подтверждены, fresh EPS pair2 GREEN. Final8 saved packages/Pillow
   pixels/SQLite completed rows/receipt bytes/exact signed refs/settings/frozen0-
   current37 verified: mutant pixels равны противоположным normal choices, fresh —
   своим. Main/worker idle подтверждён. Historical counts не меняются.
   Отдельный [native multiple-LoRA checkpoint](../engineering/phase-2c-noobai-lora-stack-native-research.md)
   прошёл12 normal EPS/V loader variants/11832 all-target observations:986/source
   и986 union (UNet722/CLIP1 72/CLIP2 192), exact Digital−0.5/Lineless+.75,
   half-loaded trained checkpoints/independent temporary FP32 CPU layer algebra.
   Проверены source/adapter/weight/order, single/AB/BA/enabled-zero controls и unload
   restoration; normal physical PID exits/43 original sources подтверждены.
   Это0 UI jobs/images/receipts/conditioning/denoising, readonly5/9/153queue без
   adoption/download/model/runtime copies. Installed weight-swap завершил2 healthy
   single variants/1972 observations до точного AB numeric RED; physical child
   exit/restored43/original inode/mode/mtime/bytes/backup absence подтверждены.
   Fresh EPS6 GREEN/5916 observations воспроизводит normal base SHA; full catalog/
   queue row SHA5/9/153 и managed files unchanged, Main/worker idle и current
   delivered oracle SHA во всех4 executions проверены. Этот historical native
   checkpoint не создавал UI jobs; additive permutation equality не заменяет
   immutable recorded stack order. Отдельный [multiple-LoRA UI follow-up](../engineering/phase-2c-noobai-lora-stack-ui-research.md)
   подтвердил 8 normal EPS/V TXT cycles/8 admissions с actual Add/Save/readback/
   reopen/comparison: AB/BA/B-enabled-zero/B-disabled, exact Digital−0.5/Lineless+.75,
   256×256/три steps/seed0/native external VAE FP32. Configured и effective order
   frozen после настоящих current reorder/weight edits; оба full stacks меняют
   pixels относительно равных B-zero/B-disabled controls, без AB/BA pixel relation
   claim. Portable provenance проверяет exact refs/CivitAI IDs; UI comparison
   проверяет ordered name/version/SHA/enabled/weight, не каждый description field.
   Strict6/10 сохраняет original9; одна171540060B Lineless adoption выполнена в
   отдельном setup, normal/fresh runs newManagedFiles0. Installed weight-swap дал
   causal same-input pixel RED после1 finite provisional AB candidate до Add:
   0 accepted layers/0 full saved mutant cycles. Physical exit/restored43/original
   inode/mode/mtime/bytes/backup absence подтверждены; fresh restored EPS4 GREEN
   воспроизводит все healthy same-choice pixels. Independent SQLite/raw ZIP/Pillow
   aggregate PASS:12 qualified saved packages/cycles (8 normal+4 fresh),14 total
   admissions включают1 excluded saved setup partial и1 provisional mutant. Все
   prior model/queue rows сохранены, final Main/worker idle43 exact подтверждён.
   Последующий bounded Anima worker0.14 regression завершён отдельно выше:
   8 normal full cycles/9 admissions/1 Cancel, weighting-mutant provisional pixel
   RED до Add,3 fresh Euler TXT/IMG/OUT cycles с exact healthy pixels. Позднейшие
   bounded seed/cap/DPM++ 2M/five-sampler checkpoints завершены выше; V DPM++ 2M TXT/common-source IMG/OUT, signed embedding и multiple-LoRA image срезы завершены выше; per-iteration dynamic image gate подтверждён: independent reader10833, fresh system proof820, guarded cleanup и ENODEV repair с isolated semantic controls завершены; последующий [Fixed0/per-prompt common-source IMG/OUT gate](../engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md) подтверждён: 32 admissions/completions/accepted layers, четыре packages, восемь first-pair0/1 wholeRGBA references и 16 within-pair seed contrasts; image Random → numeric Fixed replay и последующий Reuse/crash подтверждены отдельными gate; [image MAX→0 wrap](../engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтверждён16-job/12-package gate с8 own numeric-control wholeRGBA matches; [image cap32/prefix gate](../engineering/phase-2c-illustrious-image-batch-cap-research.md) завершён152-job/eight-package gate с24 own same-input wholeRGBA controls и4 genuine confirmed33 refusals, сохраняющими32 candidates; последующий [image dynamic embedding subset gate](../engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md) подтверждён24/8/8; [Installed Anima dynamic image foundation](../engineering/phase-2c-anima-dynamic-image-research.md) завершён20/4/4; Anima image Fixed/per-prompt80/4/16 подтверждён отдельно; Random → Fixed32/4/16 подтверждён отдельно; Anima image Reuse после recovery подтверждён отдельно: 22 задания, 18 завершений, 4 APP_RESTART, 18 принятых результатов, 2 пакета; следующий finite cut — Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика; broader image embedding permutations и остальные Anima image seed-policy/batch combinations и broad formats/quality/release остаются gap;
   bounded Anima и seed evidence описаны выше.
   All-layer/formats compatibility, качество/Invoke parity, public delivery и
   release открыты; one-literal TXT
   direction не квалифицирует arbitrary embedding formats/syntax или IMG/OUT
   polarity. Author-resolution results предыдущего checkpoint не расширяются
   этим трёхшаговым component срезом.

**Выходная проверка шага 2C:** независимые oracles подтверждают prediction
interpretation, zero-SNR transform, фактические timestep/sigma sequences и
dispatch обычного Euler. Численные ожидания соответствуют pinned implementation,
включая terminal-alpha clamp, а не требованию буквального нуля. Matched controls
меняют по одной существенной оси; общая разница двух составных recipes не
доказывает проводку каждого поля. Semantic mutations, отдельно убирающие zero-SNR,
spacing или заменяющие Euler на Euler a, должны краснить соответствующие
assertions после здорового setup. Epsilon/Euler-a Illustrious и Anima остаются
соседними controls. Ресурсный preflight/refusal не меняет queue, staging, Project,
seed, provenance или saved package; completion остаётся temporary до Add.
Контролируемый transport источника, локальный native catalog и live CivitAI
download отражаются раздельно; source admission не выдаётся за ML qualification.

Тяжёлые прогоны выполняются последовательно по
[artifact lifecycle](../engineering/artifact-lifecycle.md): один совместимый
runtime/catalog, actual native cgroup limits, physical exit и byte-exact mutation
restoration перед cleanup. Новые weights или рекомендуемый размер изображения
не дают основания убрать лимиты либо размножить environments.

**Завершение полной поддержки MVP:** этот шаг закрывает NoobAI inference в 2C;
Presets/result-to-preset проверяются в фазе 3, authored masks/inpaint, Regional
Guidance и Smart Patch/variants — в фазе 4 с тем же профилем, clean-install/
upgrade/public model delivery — в фазе 5. ControlNet/IP-Adapter, workflow graph,
самостоятельное семейство SDXL и другие ОС/GPU этим планом не добавляются.
PP-004/005/007/008 сохраняют текущие открытые статусы до фактического evidence;
ни roadmap entry, ни предыдущие четыре small-resolution cases не закрывают
NoobAI MVP или release gate.

## Фаза 3. Presets

**Текущий checkpoint:** [Installed Project presets EPS/V](../engineering/phase-3-installed-presets-research.md)
поверх [Project Apply Models handoff](../engineering/phase-3-preset-model-handoff-research.md)
поверх [Accepted Raster result](../engineering/phase-3-result-preset-research.md),
[New Project preset customization](../engineering/phase-3-new-project-preset-research.md)
поверх [Save Current](../engineering/phase-3-preset-save-current-research.md),
[Project Apply](../engineering/phase-3-preset-apply-research.md),
[production Preset Manager](../engineering/phase-3-preset-manager-research.md)
и [preset storage/API](../engineering/phase-3-preset-storage-research.md).
Строгий shared payload, SQLite CRUD/duplicate/soft-delete/restore/30-day expiry,
startup/hourly cleanup и native API реализованы. Ручной manager/editor подключает
create/edit/duplicate, Included sections, Deleted/Restore и unsaved-change guards.
Фактические проверки UI/persistence и их границы записываются в checkpoint.
Project Apply подключает detached preview, full/partial section copy, selected-only
diagnostics и одну Main history mutation. Save Current подключает Project launcher
к detached create draft: authored prompts/sidecars и copied resources сохранены,
Seed/batch settings исключены, source banner неизменен. Capture принимает
только acknowledged tab: любой pending generation-draft overlay
блокирует launcher с tooltip и App guard, включая ожидание exact embedding
sidecar от Main. Capture не выполняет flush/seal и фиксирует source до async
открытия Manager. Invalid excluded Seed/batch input после synchronization не
блокирует Save Current. Current verified mode
задаёт Workflow; empty Canvas допускает TXT fallback, unknown nonempty Canvas
требует явного выбора. Incomplete copied values нужно исправить либо исключить
через Included до Create. Project/history/seed cursor и library policy не меняются.
Фактические результаты qualification записываются в Save Current checkpoint.
New Project customization подключает detached active TXT source к общему
редактору: Size задаёт initial generation area, Seed выключен по умолчанию,
Use/reset сохраняет mask, No preset восстанавливает 1024 × 1024 без payload.
Selected-only raw validation проверяет только используемые поля; missing refs
дают предупреждение и не блокируют Create. Top-level dimensions владеют bbox,
конфликтующий payload Size отклоняется до публикации. Main инициализирует settings
до первой записи `.igs`, с чистой history и без последующего Apply step.
Source/prediction/noise policy не изменяются. Qualification: 221 focused tests
и девять built Electron scenarios passed, включая first-package settings,
index refusal/rediscovery и restart. Typecheck, lint, build и visual checks на
двух размерах окна пройдены; границы записаны в новом checkpoint.
[Accepted Raster result](../engineering/phase-3-result-preset-research.md)
подключает saved portable settings и concrete expanded prompt к detached create;
no-worker read, transient guards, explicit Create и source ownership описаны в
checkpoint. Project Apply Models handoff теперь сохраняет edited/selected copy,
raw fields и focus при exact-resource browsing/return; expected SHA mismatch и
failed/stale catalog сохраняют явные diagnostics. Qualification и PP-006 pilot
описаны в новом checkpoint. Installed NoobAI EPS/V full/partial Apply → inference
проверен через native picker: 8 actual admissions/completions, 4 manual wholeRGBA
контроля, 4 accepted Save/reopen/Compare/result-preset цепочки. Source policy hints
остаются advisory, current exact-file policy владеет worker input и provenance.
Independent raw readback: 646 checks; два production source mutants дают 4 targeted
RED и 4 neighbor GREEN, оба восстановлены. Только Euler/Normal256/N3/CFG4/Fixed0,
Digital Art−0.5/native VAE FP32; Anima Apply и другие recipes этим не доказаны.
Smart Patch source/target и other-context handoff остаются открытыми.
PP-006 остаётся «Пока не обещать».

[Smart Patch document foundation](../engineering/phase-4-smart-patch-foundation-research.md)
подключена к production: `+ Patch` создаёт наверху стека независимые empty owned
mask/bbox/internal resolution/generation draft. Selection и targeted edits,
Undo/Redo, Save/reopen и local crash recovery проверены через built Electron без
ML runtime. В этом предыдущем foundation маска логически пустая; painting,
generation, variants и Regional Guidance его evidence не доказывает.

[Owned mask authoring](../engineering/phase-4-smart-patch-mask-authoring-research.md)
добавляет Main-owned world-grid PNG coverage, Brush/Eraser/Lasso/Polygon Lasso,
viewer overlay и Clear, с одной Undo-операцией на завершённый жест. Mask assets
участвуют в `.igs`/shadow/history, но не в Raster preview/accepted history.
Точные результаты production/native qualification и ограничения — в checkpoint.

Предыдущий [Transform/Fit implementation](../engineering/phase-4-smart-patch-mask-transform-research.md)
добавляет explicit preview/Apply/cancel и Main-baked mask PNG. На том checkpoint
Fit менял только owned bbox с фиксированным 24px margin/outward grid8;
нынешние owned defaults16/8 дают тот же запас. Qualification: regression1820 до terminal snapping, final affected59/native57,
three semantic RED/GREEN и required checks PASS; chronology/limits — в checkpoint.

**Исторический private Main/CPU срез фазы 4:**
[Smart Patch generation input capture](../engineering/phase-4-smart-patch-generation-capture-research.md),
read-only Main preparation source beneath target +owned mask/bbox/internal/draft/settings.
Focused14/affected1852 PASS, actual CPU четыре tests/nine calls и три semantic
RED/neighbor GREEN probes; typecheck PASS, lint/build PASS; lifecycle/cleanup подтверждены.
Generate/jobs/inference/variants не включались в этот checkpoint. Следующим finite owner был effective
mask clipping/mode/internal-scale conditioning, затем queue/inference и variants,
staleness/compositing/comparison, Regional Guidance и Patch presets.
Other-context Models handoffs остаются owner фазы 5. Каждая непроверенная
комбинация уже проверенных осей не становится автоматическим дополнительным
ML gate; ограничения текущего installed среза остаются явными.

**Зависимости:** первый generation slice 2C, production resources и `.igs`.

- Создание пресета вручную.
- Создание пресета из accepted-result provenance.
- `Save Preset from Result` копирует только portable generation configuration:
  один фактический expanded prompt для dynamic-result, без batch settings.
  Размер Smart Patch internal resolution не становится preset Size; маска,
  bbox, compositing и source state остаются свойствами слоя.
- Редактирование секций пресета.
- Общий `PresetPayloadEditor` для manager create/edit, Apply и New Project preset customization.
- Full apply.
- Partial apply.
- Editable application draft с `Current` / `Apply`, reset и guarded `Edit original`.
- Проверка missing resources только для выбранных секций.
- PP-006 production parity: сохранить уже проверенные на prototype Project
  diagnostics, nested-resource detection и восстановление Apply после deselect
  проблемной секции при переходе на реальные resources, commands и `.igs`.
  Завершить `Open in Models` handoff и проверить его через Project picker.
- Warning при base model family mismatch.
- Для [NoobAI](#noobai-полная-поддержка-в-рамках-mvp) проверить full/partial Apply
  и result-to-preset с sampler и записанным noise-profile snapshot. Apply не
  меняет exact-file policy Model Manager; несовпадение snapshot с current library
  остаётся видимым, новый Generate использует текущий verified profile.
- SQLite lifecycle с восстанавливаемым soft delete в течение 30 дней и
  автоматическим окончательным удалением после срока; deleted presets не
  смешиваются с Project Trash или модельной библиотекой.

**Выходная проверка (PP-006):** пресет переживает restart; `Save Preset from
Result` переносит фактический expanded prompt и portable generation settings,
а не маску, bbox или batch template. Full/partial Apply изменяет только
выбранные секции реального Project; missing resource виден до mutation и
блокирует только затронутую секцию. `Open in Models` возвращает к Apply после
решения проблемы. Восстановление до 30 дней работает, после срока запись
удаляется окончательно. Выполнить
[PP-006 review pilot](../engineering/README.md#пилоты-и-дальнейшая-автоматизация).

## Фаза 4. Полный Canvas и Smart Patch Layer

**Исторический private durable acceptance scope:**

[Smart Patch durable acceptance](../engineering/phase-4-smart-patch-durable-acceptance-research.md)
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

At this historical checkpoint, public Smart Generate/Results/IPC, variant lifecycle
controls, freshness/resource UI, accepted-history navigation, Compare/Preset and
installed inference qualification were later owners. Those integrations now have
their own later checkpoints; use the current gap list above. PP-007/008 remain
«Пока не обещать». The next finite owner at that time was variant lifecycle and
current-state diagnostics before public integration.
Executed evidence and finite limits belong to the linked research.

**Предыдущий variant storage/display scope:**

[Variant storage and material composition](../engineering/phase-4-smart-patch-variant-storage-research.md)
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
remain later owners. PP-007/008 remain «Пока не обещать». Executed evidence and
remaining limits belong to the linked research.

**Предыдущий private acceptance-plan scope:**
[Smart Patch acceptance plan](../engineering/phase-4-smart-patch-acceptance-plan-research.md)
adds strict standalone variant/provenance contracts and a read-only proposal;
the Project schema still accepts only empty Smart Patches. Identity-bound staging
reads verify actual world RGBA and final-mask bytes. The projector checks frozen
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

**Предыдущий private queued-execution scope:**
[Private queued Smart Patch execution](../engineering/phase-4-smart-patch-queued-execution-research.md)
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

**Предыдущий private SQL queue-admission scope:**
[Private Smart Patch queue admission](../engineering/phase-4-smart-patch-queue-admission-research.md)
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
disabled. At that admission checkpoint the next owners were dedicated typed
dispatch, worker-confirmed actualSeed, owned inference+CPU cancellation and
durable world candidates, now covered above; immutable acceptance remains next. Public PP-007/008 remain
«Пока не обещать». Verification evidence and limits are in the linked research.

**Предыдущий private durable-input scope:**
[Smart Patch durable inputs](../engineering/phase-4-smart-patch-durable-input-research.md)
добавляет `capture.prepareBatchInput` и отдельный app-owned input bundle до SQL
admission.1..32 caller-planned concrete items делят frozen source/authored mask,
model RGB, latent KEEP и final world contribution. Family inference metadata,
exact resources, target layer/document identity и world/internal geometry
сохраняются без transient execution paths. Strict reload читает actual PNG/hash/
ICC/alpha; files-first fsync и exclusive manifest marker отделяют полный bundle
от незавершённой записи. Publication uncertainty сохраняет bundle для сверки.
Нет новых SQL operations/dispatchable jobs, candidates/receipts/cursor/variants,
public Generate или `.igs`/UI/provenance/preset/Compare changes. Seed resolution и
dynamic expansion не входят в этот concrete-input boundary. Далее — целостное
подключение queue admission/dispatch/staging, затем immutable acceptance. Locked
или hidden targets запрещены для public Generate/Add as Variants по решению
пользователя15.10.2026; private read-only preparation остаётся доступной.
PP-007/008 остаются «Пока не обещать»; actual evidence/limits в linked research.

**Предыдущий private world-output scope:**
[Smart Patch world output](../engineering/phase-4-smart-patch-world-output-research.md)
добавляет `capture.executeAndCompose`: после native execution CPU worker
масштабирует generated RGB через BICUBIC до frozen world bbox и присоединяет
готовую final GENERATE alpha без изменений. Повторного fade, восстановления
alpha из latent KEEP или source pasteback нет. Main независимо проверяет actual
RGBA/ICC/hash/geometry и точное равенство alpha frozen final mask, возвращая
detached `worldContribution`; placement остаётся `context.bbox`, не worker DTO.
Одна drained lease охватывает всю цепь и readback; callback failure ждёт admitted
work, unconfirmed worker exit сохраняет inputs. CPU derivatives-only worker 0.1.0
обязан объявить `smart-patch-output-composition`; old payload отказывает до
dispatch. Operation stage `0700`, owned scratch base может сохранять `0775`.
`capture.execute` и inference worker0.14.0 RGB contract не меняются; installed
runtime не обновляется автоматически. Нет public Generate, durable jobs/queue/
batch/candidates/receipts, variants, document/`.igs`/schema/UI или provenance/
preset/Compare changes. Проверки и qualification limits — в linked research;
PP-007/008 остаются «Пока не обещать». Далее — durable batch/queue integration
и immutable variant acceptance.

**Предыдущий private Main/worker execution scope:**
[Smart Patch execution bridge](../engineering/phase-4-smart-patch-execution-bridge-research.md)
связывает `capture.execute` с реальным worker protocol, exact resource admission,
семейными native VAE/denoising и exclusive processing-size RGB publication.
Caller передаёт один concrete item: готовые positive/negative prompts и uint32
seed. Эта граница не разворачивает dynamic prompt, не выбирает Random/Reuse и
не читает/обновляет seed cursor. Worker0.14.0 обязан объявить private capability
`smart-patch-execution`; старый installed runtime не получает её автоматически.
Одна lease охватывает подготовку, resources, execution и строгий Main readback
RGB/ICC/hash/geometry. При worker process failure/timeout освобождение inputs ждёт
physical exit; при `WORKER_EXIT_UNCONFIRMED` staging сохраняется, в том числе
после ошибки callback. World mode и independent internal resolution сохраняются;
all255 latent KEEP продолжает VAE/denoising с полной защитой latents.
Нет public Generate, durable queue/batch/candidates/receipts, world composition,
accepted variants/provenance/preset/Compare, schema/UI или изменений `.igs`.
Точные выполненные проверки и границы qualification — в linked research;
PP-007/008 остаются «Пока не обещать». World composition была следующим owner
этого checkpoint и добавлена выше; durable batch/queue integration и immutable
variant acceptance остаются открытыми.

**Предыдущий private numerical family execution scope:**
[Smart Patch VAE and denoising](../engineering/phase-4-smart-patch-denoising-research.md)
передаёт prepared RGB и numeric latent KEEP в существующие native loops с
caller-owned loaded models. TXT/IMG используют ordinary route;INP/OUT — masked
route,без reclassification,repeated coherence/LaMa или pixel pasteback.
Принятое решение:при `latentMaskHasCoverage:false` (KEEP all255) VAE и denoising
всё равно выполняются как в Invoke,с полной защитой latents и прежним world mode.
Результат — VAE reconstruction,а не обещание новой детали в исчезнувшей tiny edit.
Focused72 Python PASS:65 real tiny native cases плюс семь actual CPU protocol
preparation→adapter cases;шесть solvers каждого семейства,Illustrious EPS/V.
Prepared INP проверен world128/internal64/Euler у обоих семейств. Это random small
native CPU models,не trained/installed/GPU/full Invoke pixel parity. Нет Main
transport/public worker command,queue,publication,world compositing,variants,
schema/UI changes или повышения public readiness. Full checks/mutations
фиксируются отдельно в linked research. Bridge/resource admission были следующим
owner на том numerical checkpoint; later bridge и последующий world-output checkpoint
выше добавляют их и private composition. Immutable variants остаются отдельным owner.

**Предыдущий qualified private Main/CPU model-source scope:**
[Smart Patch model-source and LaMa preparation](../engineering/phase-4-smart-patch-model-source-research.md)
добавляет actual `prepareModelSource`:compose→prepare→condition→lazy pinned Main
resolver для OUT→worker RGB в одном admitted/drained lease. TXT возвращает null;
IMG/INP — exact processing RGB без LaMa;OUT — full LaMa RGB с holes только из
source alpha<255,включая processing alpha целиком0/255 после BICUBIC resize.
Frozen world mode,шесть conditioning planes и strict normal OUT остаются прежними.
Affected1937 TS/527 Python (focused65/68),two actual Main trained-source cases с unchanged storage/
original source,four exact trained wholeRGB comparisons к pinned Invoke и three
semantic RED/GREEN pairs квалифицируют finite boundary. Global lint/typecheck/
build и worker Ruff/basedpyright PASS;границы evidence записаны в research note.
Нет `.igs` state/schema/UI changes,jobs,diffusion/variants,
provenance/presets/Compare/public Generate. Prototype mocks не меняются и не
доказывают source/infill или acceptance. Этот source checkpoint ещё не
квалифицировал family VAE/denoising;later numerical adapter выше закрывает
all255 policy. Текущий scope выше добавляет execution bridge/resource admission;
immutable variant acceptance остаётся отдельным owner.

**Предыдущий qualified owned coherence/UI persistence scope:**
[Smart Patch owned coherence settings](../engineering/phase-4-smart-patch-coherence-settings-research.md)
добавляет optional top-level per-Patch `coherenceSettings`:Gaussian Blur/Box Blur/
Staged,processing edge0..1024/default16,minDenoise0..1/default0. Legacy absence
остаётся absent без injection/dirty/default no-op. Compact Mask controls используют
captured whole-profile edit,one Undo,explicit Save/local recovery. Frozen capture
default использует OWNED profile,private override сохранён. Affected1927 TS/
prototype180/native14 (Save/reopen/owned SIGKILL→Home Recover),three semantic
RED/GREEN,typecheck/lint/build PASS;physical exit/restoration/cleanup confirmed.
Prototype profile/history does not yet feed variant staleness/provenance.
No jobs/native inference/variants/new preset/comparison/provenance fields;public
Generate не включается. Остальные compositing MVP candidates не повышаются.

**Предыдущий qualified private Main/CPU conditioning checkpoint:**
[Smart Patch processing-space coherence/world contribution](../engineering/phase-4-smart-patch-coherence-research.md)
добавляет private `prepareConditioning` с frozen caller profile:Gaussian Blur/
Box Blur/Staged,processing edge0..1024/default16,minDenoise0..1/default0.
WORLD keep собирается до BICUBIC resize:INP255-authored,OUT numerical Pillow
multiply с source alpha,TXT/IMG0. Latent BILINEAR и exact pinned F32 weighted
MAX/threshold дают six grouped numeric outputs;expanded processing keep→world
NEAREST плюс original binary world edit core,затем owned WORLD blur.
`latentMaskHasCoverage` не меняет frozen world mode и не доказывает ML admission.
Affected1905 TS/268 Python PASS,36 pinned Invoke comparisons,four semantic
RED/GREEN pairs. Только private CPU policy;no coherence UI/schema/
persistence,public Generate,infill/VAE/denoising/queue/candidates/variants.
Internal8-grid только для этого method,old one-pixel prep/schema32768 прежние.
Normal OUT fixed Gaussian не меняется. Public statuses прежние.

**Предыдущий qualified private Main/CPU contribution checkpoint:**
[Smart Patch world contribution core/external fade](../engineering/phase-4-smart-patch-contribution-fade-research.md)
добавляет private `prepareContribution`:existing prepare chain в одном admitted/
drained lease,четвёртый numeric world `contributionMask`. Soft authored alpha
остаётся conditioning input,output core full/binary. TXT/IMG core — whole bbox;
INP — clipped authored alpha>0;OUT — authored alpha>0 OR source alpha<255.
Owned blur0..512/default16 задаёт external Invoke distance/curve fade в project
pixels,padding исключён,internal dimensions не задают fade radius. Affected1888
TS/203 Python PASS,50 fade cases/21 pinned Invoke numerical comparisons,three
semantic RED/single-condition neighbor GREEN pairs и typecheck/lint/build/global
Python checks PASS;physical exit/temporary-copy cleanup confirmed. Только
pre-coherence geometry:на этом checkpoint edge/latent processing и infill были
следующими owners,квалифицированными отдельно выше. Inference/queue/candidates/
accepted variants и public Generate остаются позже.
Pillow-only prepare сохраняется;native NumPy/OpenCV lazy для nontrivial fade,
missing dependencies дают явный отказ без download/approximation. Status прежний.

**Предыдущий qualified private Main/CPU checkpoint:**
[Smart Patch effective mask/internal-size preparation](../engineering/phase-4-smart-patch-mask-preparation-research.md)
расширяет callback lease: exact integer world clipped numeric coverage,
internal sRGB source/numeric mask, BICUBIC resize и four-mode по исходному
verified world source alpha/actual world coverage. Internal coverage loss
фиксируется отдельно через `processingMaskHasCoverage` без silent modechange.
Final focused33 TS/Python24 PASS,три isolated semantic RED/neighbor GREEN pairs и
global Python Ruff/basedpyright и affected1871 TS/125 Python PASS; required
typecheck/lint/build PASS, physical exit/temporary-copy cleanup confirmed.
Finite internal/source2048side/4M limits не сужают document schema и не
подтверждают latent-grid/ML admission. Original mask/document/history/seed/Save
owners сохраняются. Strict all255 source и any-nonzero mask — явные adaptations
от Invoke; full pixel/mode parity не заявлена. На preparation checkpoint следующим
owner был numerical blur/fade/coherence/masked conditioning;последующие contribution/
coherence checkpoints выше квалифицируют world geometry,processing-space coherence
и numerical latent conditioning. ML admission,queue/inference/accepted variants
остаются открытыми.
Public Generate и `.igs` variant schema этим private срезом не включаются.

**Предыдущий qualified private Main/CPU checkpoint:**
[Smart Patch generation input capture](../engineering/phase-4-smart-patch-generation-capture-research.md)
freeze/read-only Main callback boundary для exact target, ниже-лежащих visible
source layers и original verified mask bytes, owned bbox/internal/draft/blur/padding.
Null или fully outside mask используют source-only mode как Invoke; nonzero
effective mask при opaque source даёт inpaint. Locked/hidden existing target
читается, future admission permissions отдельны. Эти four-mode rules — future
masked preparation: первый capture сохраняет только original whole mask и
source RGBA/source alpha, не вычисляет effective clipped mask/mode и не делает
internal-scale conditioning. Public Generate, очередь,
worker inference, candidate/variant Add и `.igs` schema не включаются этим срезом.
Focused14/affected1852 PASS, actual CPU четыре tests/nine production calls,
три semantic RED/neighbor GREEN и typecheck PASS; lint/build PASS; lifecycle/cleanup подтверждены.
На capture checkpoint следующим finite owner был effective mask
clipping/mode/internal-scale preparation, описанный выше; затем
queue/inference/accepted variants. Future acceptance в changed-existing target сохраняет
frozen output/context и маркирует active variant `outdated`; missing target
остаётся orphaned. Blur требует дальнейшей project-space scale adaptation;
padding Fit-only и не stale-ит результат до изменения bbox. Public statuses прежние.

**Предыдущий UI/settings checkpoint:** [Owned mask settings](../engineering/phase-4-smart-patch-mask-settings-research.md)
добавляет compact Mask blur16px/BBox padding8px, owned optional metadata с
integer0..512, legacy no-injection defaults и scalar Undo/Save/recovery. Fit читает
owned sum только при вызове; painted PNG/revision и bbox при edit не меняются.
Impacted regression1835 PASS до final UI refinement, final affected104/native109,
three semantic RED/GREEN и typecheck/lint/build PASS; chronology/source/exit proof
и просмотренные screenshots — в linked checkpoint. Следующий inpaint/compositing owner должен freeze/use
тот же blur и поддержать staleness; actual pipeline/accepted variants остаются
следующим срезом.

**Предыдущий implementation checkpoint:** [Transform/Fit](../engineering/phase-4-smart-patch-mask-transform-research.md)
добавляет selected-mask move/scale/rotation с captured local preview и явным
Apply/Enter или Cancel/Escape. UI release округляет anchor/displayed dimensions
до project pixels (minimum1px), сохраняя fractional Main API. Main запекает
world-grid PNG без affine metadata;
один changed Apply — один Undo. При неизменных dimensions/alpha исходные verified
PNG bytes сохраняются, включая упаковку импортированного PNG. Fit читает verified
mask и на том checkpoint менял только owned bbox: fixed24px per side, outward
grid8; mask revision/bytes, internal resolution и draft не меняются. Нынешние
owned defaults16/8 дают тот же запас; configurable blur UI добавлен новым
settings checkpoint, inpaint остаётся открытым. Regression1820 PASS до final UI snapping,
final affected59/native57/three semantic RED-GREEN и typecheck/lint/build PASS;
chronology, source/exit proof и ограничения — в linked checkpoint. Следующий owner — Smart Patch inpaint/generation
и accepted variants; staleness/compositing/comparison, Regional Guidance и Patch
presets остаются открытыми.

Предыдущий [Owned mask authoring](../engineering/phase-4-smart-patch-mask-authoring-research.md)
подключает Brush/Eraser/Lasso/Polygon, Main-owned world-space PNG coverage,
Overlay/Clear и retained mask assets для Undo/Redo/Save/recovery. App regression
3751 PASS, affected 176 PASS и native 33 named checks подтверждают declared
slice; five semantic RED/neighbor GREEN pairs имеют exact restoration.
Полный suite до дополнительного IDAT guard, affected run после него. Engineering
limits и excluded attempts записаны в checkpoint; inpaint/variants не заявлены.
Его evidence не включал Transform/Fit; новая реализация описана выше. Smart Patch
pipeline остаётся следующим owner.

Предыдущий [Smart Patch foundation](../engineering/phase-4-smart-patch-foundation-research.md)
закрыл создание и document lifecycle пустых Patch, независимый draft/bbox и
internal resolution, selection, targeted editing и Undo/Redo. Его собственные
native Save/reopen и dirty-shadow recovery без runtime не доказывали painting.
Empty Patch не добавлял pixels/assets/accepted results; обычный Raster Add
сохранял его. Оба checkpoint не квалифицируют inpaint, variants или Regional Guidance.

**Зависимости:** первый generation slice 2C; Presets 3 нужен для финальной
проверки result-to-preset у Smart Patch. Конкретные canvas инструменты можно
вести параллельно с Presets при стабильном document/provenance contract.

- Развить базовый `.igs` Project Canvas из фазы 2; domain mode остаётся
  `generate` с основным действием `Generate`, без заголовка `Create`. Upscale
  отложен.
- Generate mode according to `docs/features/project/generate-mode/README.md`.
- Layer stack.
- Расширить Konva-based interactive canvas pipeline: app-owned
  manager/compositor/cache, masks, transforms и bbox tools.
- Smart Patch Layer с mask, bounding box, internal resolution.
- Довести автоматическое определение `inpaint`/`outpaint` из frozen target-area
  content и выполнить оба режима для Illustrious и Anima в рамках capability
  matrix, без silent fallback.
- `GenerationResults` as multi-select staging: one focused preview plus one or more candidates selected for acceptance.
- Project-local undo/redo для `.igs` document mutations.
- Completed outputs remain temporary until explicit acceptance.
- `Add N as Layers` creates independent Raster Layers and one grouped undo step.
- `Add N as Variants` creates Smart Patch raster variants and one grouped undo step.
- The focused candidate becomes the accepted anchor when selected; otherwise the first selected candidate becomes active. Other accepted Smart Patch variants remain inactive.
- Active raster sub-layer единственный видимый внутри Smart Patch Layer.
- Outdated status при изменении mask/bbox/settings.
- Regional Guidance Layer with owned region/mask and inline prompt/negative
  controls for both families; regional reference images only for
  Illustrious/SDXL, no inverse-mask auto-negative.
- Anima regional text использует тот же [weighting compiler](../features/project/generate-mode/prompt-weighting.md)
  и проверенный путь token weights из фазы 2C; отдельный parser с иной attention
  semantics не вводится. Spatial gate regional negative text остаётся отдельным.
- Проверить [NoobAI epsilon/v-prediction](#noobai-полная-поддержка-в-рамках-mvp)
  на authored masks/inpaint, Regional Guidance и Smart Patch/variants с exact
  профилем из 2C. Queue/Retry, accepted provenance, staleness, Raster/Smart Patch
  comparison и result-to-preset сохраняют те же semantics без второй реализации.
  Regional Guidance по принятому контракту остаётся вне всех provenance groups.

**Выходная проверка:** реальный Canvas выполняет `inpaint`/`outpaint` для обоих
семейств без silent fallback; Smart Patch сохраняет mask/bbox/variants,
outdated state и provenance после Save/reopen. Multi-select Add создаёт
независимые слои/варианты одним undo step; queue completion не изменяет
документ. Принятие до конца batch отменяет unfinished sibling jobs; recovery
показывает orphaned Smart Patch candidate без скрытого retargeting. Сохранённая
regional mask открывается после переноса `.igs`; реальные генерации подтверждают
влияние positive regional text для обоих семейств и regional reference image
для Illustrious. Regional negative text для Anima допускается только после
проверенной spatial semantics на реальной модели; несовместимое regional
reference image блокируется до enqueue. Raster/Smart Patch comparison и
result-to-preset используют одну portable projection. `Generate` остаётся
основным действием, отдельные `Create` и Upscale не возвращаются в MVP.

### Завершение Home, Model Manager и экспорта

Эти пункты входят в фазу 4 и обязательны перед фазой 5. Их не закрывают
базовый Home shell фазы 0, installation flow фазы 1 или наличие прототипа.
Home можно развивать после document storage 2A; remove resources требует
реальных очередей 2B, provenance 2C и пресетов 3.

- Перенести [Home contract](../features/home-screen.md) на реальные команды:
  создание/переименование/цвет workspaces, снятие регистрации без удаления
  папки/проектов, выбранная workspace и cross-workspace
  Projects, sort/Status filtering/grid-list/Inspector, rename/move/reveal
  Project, rescan/locate недоступных путей и состояние unavailable workspace.
- App-managed Project Trash: move/restore/permanent delete, запрет отправки
  открытого Project в Trash и согласованность файлов с производным индексом.
  Не смешивать этот lifecycle с удалёнными пресетами или моделями.
- Завершить [Remove Local Resource](../features/model-manager.md#remove-local-resource):
  hard delete без model Trash; running job блокирует удаление, pending jobs
  требуют явной отмены, Preset/result refs — подтверждения. Shared Anima
  components и content-addressed файлы живых версий сохраняются. Существующие
  Projects/Presets/provenance сохраняют copied identity и показывают missing.
- Завершить `Open in Models` для остальных контекстов и обратный переход к
  исходному Project/Apply; Project → Manager для выбранного checkpoint уже есть.
  Довести все обещанные resource selectors и thumbnails installed resources.
- Реализовать [image export](../features/project/generate-mode/image-and-bounding-box.md#export-and-crop-boundary):
  `Export As` по visible-content bounds, включая активные Smart Patch variants;
  отдельный `Export Generation BBox`, sRGB, понятный отказ на пустом содержимом.
  Export не изменяет слой, bbox, dirty state или основную `.igs`.

**Выходная проверка:** Home операции проверены через UI→IPC→файлы/SQLite и
restart, с missing/unavailable workspace и закрытым/открытым Project.
Удаление модели проверено с running/pending jobs, ссылками из Preset/result
и общим companion-файлом; после удаления saved results читаются, Apply даёт
missing-resource diagnostic. Экспорт проверяет декодированные pixels, точные
границы и sRGB metadata для отрицательных координат, скрытых слоёв и активного
Smart Patch; соседний control case подтверждает неизменность Project/`.igs`.
UI всех этих действий проверен в поддерживаемом диапазоне размеров окна.

## Фаза 5. Первый Linux/NVIDIA релиз

**Зависимости:** функциональные фазы 0–4 и доказанный packaging artifact.
Release qualification начинается раньше, но итоговый gate закрывается здесь.
Перед реализацией app updater довести до исполнимого уровня
[user-flow/acceptance contract](../features/application-updates.md): ручную
проверку версии, offline/error, отложенную установку при dirty `.igs` и
активных jobs/staging, restart и interrupted update. Проверка при старте не
выполняется; Linux package/update mechanism должен доказать recovery path.

- Собрать подписанный/проверяемый дистрибутив и runtime artifacts для
  Linux/NVIDIA; проверить чистую установку и установку runtime из интерфейса
  основного окна без системного Python. Зафиксировать поддерживаемые
  driver/CUDA/VRAM и диагностировать неподдерживаемое окружение до генерации.
- Встроить действие `Проверить обновления` **самого Electron-приложения**, показ
  найденной версии/изменений и отдельное действие установки. Это отдельный
  lifecycle от Python runtime, моделей и проектов: пакет проверяется до
  применения, а обновление не удаляет app data, `.igs`, модели или previous
  known-good runtime. Выбор Linux package/update channel и подтверждение
  механизма на clean install входят в release engineering, не в worker.
- Пройти отказ загрузки, проверку повреждённого пакета, interrupted update,
  runtime rollback/repair, SQLite migration, перенос `.igs`, crash recovery,
  закрытие с активной очередью, точные model version refs и восстановление
  пресетов. Не запускать update-restart через несохранённый Project или
  незавершённую очередь без существующих явных close/cancel действий.
  Upgrade проверять на машине с уже установленными runtime/моделями/проектами:
  app ↔ worker protocol handshake, staged repair при несовместимости и
  открытие старых данных после миграции.
  Проверить UI/accessibility/performance для поддерживаемого профиля и
  пользовательские сценарии PP-001/002/003 в собранном приложении.
- Сверить [матрицу обещаний](../product-promises.md) с production evidence:
  повышать публичный статус только для действительно проверенных flows, обновляя
  запись обещания и строку матрицы вместе.
- Пройти [NoobAI release matrix](#noobai-полная-поддержка-в-рамках-mvp) на clean
  install и upgrade: реальный CivitAI preview/download, exact profile в Model
  Manager, trained epsilon/v-prediction generation, перенос/relink `.igs`, legacy
  queue/provenance и отказ несовместимого worker. Сохранять исходные source labels
  и условия весов; установленный NoobAI не означает пригодность любого component.

**Выходная проверка:** на чистом поддерживаемом Linux/NVIDIA устройстве
пользователь может установить приложение, его runtime и модель, пройти все
MVP workflows, сохранить/перенести проект, восстановиться после сбоя и
установить проверенное обновление приложения без потери данных. Отчёт о
прогоне указывает конкретные device/driver/artifact версии и ограничения.

## Post-MVP направления

Эти направления явно не входят в MVP и не должны блокировать первые вертикальные срезы.

### LoRA Training Workspace

Добавить встроенный workflow для тренировки LoRA как post-MVP функционал Model Manager / resource tooling.

Главный reference/inspiration: [LoRA Easy Training Scripts](https://github.com/67372a/LoRA_Easy_Training_Scripts). Ориентируемся на его подход как на удобный UI поверх зрелого training backend, а не проектируем обучение LoRA с нуля.

Ожидаемый scope направления:

- подготовка training dataset из пользовательских изображений;
- управление captions/tags для dataset;
- выбор base checkpoint и совместимой model family;
- пресеты training settings для простых сценариев;
- advanced training settings без перегруза основного UI;
- очередь training jobs рядом с общим подходом к Queue Manager;
- preview/sample generation по ходу или после тренировки;
- сохранение результата как обычной LoRA в Model Manager;
- metadata/trigger words/preview для обученной LoRA;
- явная проверка совместимости LoRA с base model family.

Технический принцип: training backend должен опираться на зрелое существующее решение вроде Kohya `sd-scripts` / производных workflow. ImageGen Studio отвечает за UX, orchestration, хранение metadata и интеграцию результата в Model Manager.

## Первый вертикальный срез

Первый исполнимый срез соответствует фазам 0–2C: Linux/NVIDIA runtime,
установка Illustrious и Anima с закреплёнными Qwen3/VAE, проверка структуры
и компонентов перед Anima Generate, LoRA для обоих,
сохраняемый `.igs` Project с базовым Canvas, automatic `txt2img`/`img2img`,
temporary staging и explicit Add as Raster Layer с provenance/history.
Preset create/apply, Smart Patch, regional controls и `inpaint`/`outpaint`
завершают принятый MVP в следующих фазах; этот срез не равен полному релизу.

[Installed Anima image Reuse после crash](../engineering/phase-2c-anima-image-reuse-crash-research.md): Euler256 IMG/normal mixed-alpha OUT,22 admissions/18 completions/4 APP_RESTART/18 accepted layers/2 Save-reopen packages,16 Reuse+2 recovered own fullRGBA matches. Home Recover сохраняет source/candidate/cursor B; public Reuse/value null, hidden recovered Fixed layer и8 fresh Reuse layers сохранены вместе с source. Source-only Save snapshot null; final(B+7),10 layers/9 provenance,18 owning comparisons; OUT55552 protected pixels. Исключённый первый native3/1/2cancel/0accepted учтён отдельно; raw total25/19/6cancel/18accepted. FullMVP/quality/Invoke parity/release не заявлены. Следующий finite gate: Anima image MAX→0 подтверждён отдельно8/6/4; Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.

[Anima image MAX→0](../engineering/phase-2c-anima-image-seed-wrap-research.md): Installed Anima image MAX→0: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 wholeRGBA matches с собственными numeric MAX/0 controls и 2 same-prompt contrasts. Frozen worker inputs сохраняют MAX→0 actual/step/posterior seeds и compiled weighting; 6 cursor/Save snapshots и 8 portable provenance сохраняют raw weighted text, actual seed и resource/source context. Три OUT previews сохраняют 166656 protected source pixels. Independent raw reader PASS (18700 checks); actual Main modulo fault: 18 executions, 2 RED / 16 GREEN. Все 584 copied source members restored and guarded-cleaned. Только Euler256/N3/two updates/exact ресурсы; cross-pair wrap/cap32/new installed mutation/quality/Invoke parity/fullMVP/release не заявлены. Anima image cap32/prefix refusal подтверждён отдельно76/4/12/2; текущий следующий finite gate — NoobAI V / DPM++ 2M Karras wrong-EPS: наблюдаемый отказ и диагностика.
