# Implementation Roadmap

## Границы плана и исходники-ориентиры

Первый рабочий релиз — одно Linux/NVIDIA desktop-приложение с Illustrious
(семейство моделей на архитектуре SDXL) и Anima. Базовая SDXL как отдельное семейство не
поддерживается. UI установки и восстановления runtime находится **в том же
основном окне ImageGen Studio**. Отдельное приложение или окно лаунчера не создаётся;
Python ML Worker остаётся
управляемым фоновым процессом без собственного UI. Граница процессов описана
в [Electron architecture](./02-electron-architecture-cqrs.md), безопасная
установка — в [runtime contract](./07-python-runtime-management.md).

| Reference       | Локальный путь                        | Проверенная ревизия                                                                                 | Что изучаем                                                                                                                                                                          |
| --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| InvokeAI        | `/home/user/Work/sources/InvokeAI/` | `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`                                                          | Inference graph/invocations, model loading, queue и Canvas; это уже закреплённый source snapshot для [worker protocol](./05-worker-protocol.md), а не заявление о свежести upstream. |
| Invoke launcher | `/home/user/Work/sources/launcher/` | `c267bdb439519216b277a7a8c6ad408b9d79efce` (`main`, после fast-forward до `origin/main` 25.09.2026) | GPU probe, `uv`/artifact download, status/progress и single-instance handling как исходный материал для **встроенного** setup/repair flow.                                           |

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

| Область             | Реализовано в исходниках (Electron указан отдельно)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Осталось в принятом MVP                                                                                                                                                      | Фаза завершения |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Каркас              | Main/preload/renderer, typed IPC, SQLite, single instance; внутренний live qualification и эксклюзивный generation worker lease                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Release runtime install/repair вместо заглушек, проверка release artifact                                                                                                    | 2A, 5           |
| Model Manager       | CivitAI URL install/repair, install queue, integrity, versions/default; поддерживаемые Illustrious/Anima `.safetensors`, custom Anima с закреплёнными Qwen3/VAE; единственный editable Illustrious prediction override по SHA-256+size с отмеченным `epsilon` default; Project → Manager focus и Electron smoke изменения библиотечного типа; первый SDXL structural preflight перед Prepare                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Полная model/component compatibility для обоих семейств, условия custom checkpoint от источника, hard remove, остальные resource handoff, release model-load/download checks | 2B–2C, 3, 4, 5  |
| Home                | Create/list/search/open, external `.igs` Copy/Move в Uncategorized, thumbnails/Rebuild                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Пользовательские workspaces, rename/move/Trash/restore/permanent delete, Status/sort/view/Inspector и unavailable-workspace flows                                            | 4               |
| Project document    | Реальные `.igs` Save/reopen, close guards, document shadow autosave/recovery, exact checkpoint/LoRA relink; отдельный repository для первого непринятого Illustrious candidate; подтверждённый Project close с отменой своих jobs и долговечным staging discard; [read-only Results recovery view](../engineering/phase-2b-results-recovery-ui.md) после restart проверен Electron smoke; явный Add Raster с typed provenance, shadow-before-staging cleanup и Save/reopen; Project-local Undo/Redo с grouped prompt input, toolbar/shortcuts и bounded asset retention                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Smart Patch acceptance, derived accepted history, остальные production Canvas gestures                                                                                       | 2B–2C           |
| Raster Canvas       | Konva, pan/zoom/bbox, import PNG/JPEG/WebP, visibility/lock/opacity/blend/reorder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Остальные layer actions, undo/redo, инструменты, masks, Smart Patch и Regional Guidance                                                                                      | 4               |
| Generation draft    | Exact checkpoint, read-only текущий prediction type из библиотеки и advisory snapshot в `.igs`, exact LoRA stack (версии/вес/enabled/remove/relink), plain prompts с exact-version LoRA autocomplete/подсветкой, phrase selection/attention/Copy/Clear, общей справкой и локальными syntax diagnostics, Seed policy/Fixed, явная пара sampler/scheduler для Illustrious, Steps/CFG; общий UI размера для New Project и bbox; внутренний Prepare/enqueue берёт фактический Seed Reuse из local cursor или сохранённого `.igs` snapshot; dynamic settings с Undo/shadow/Save и production preview обеих prompts через bounded planner (одна iteration, cap32, parse/refusal/truncation) ; [Generate](../engineering/phase-2b-generate-actions-research.md) использует документный actual seed cursor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Остальные sampling/resource/advanced controls, embedding diagnostics/insertion, Danbooru autocomplete, tokenizer                                                             | 2B–2C           |
| Python worker       | Dev import normalization, sRGB/ICC, composition/previews, frozen raster target; отдельный локально проверенный Linux/NVIDIA entrypoint для Illustrious `txt2img` с ограниченным dual-CLIP Compel conditioning и маской padding в закреплённом Diffusers 0.40; [target composition](../engineering/phase-2b-inference-target-composition.md) теперь доступна в том же qualified inference child с shared main PNG/ICC/alpha verifier; [denoising progress](../engineering/phase-2b-generation-progress-research.md) от callback закреплённого pipeline проходит до transient UI; [result thumbnails](../engineering/phase-2b-result-thumbnails-research.md) создаются best-effort в том же inference child, без изменения полного PNG                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Устанавливаемый app-owned ML runtime, остальной Invoke-like conditioning, LoRA/Anima, кэш моделей и остальные generation operations                                          | 2A–2C           |
| Generate/results    | Frozen raster target, exact Illustrious txt2img context и строгий TS/Python request boundary; app-owned durable input и SQLite queue; repository публикации проверенного candidate, seed cursor и restart reconciliation; приватный processor, TS subprocess transport, внутренний Project → queue → staging handoff и локальный GPU smoke до provisional sRGB PNG; SDXL structural preflight; Electron удерживает recovered repositories и создаёт coordinator с подтверждаемым worker lease и барьером закрытия; pending jobs отменяются при app close; per-Project fence/cancel и staging tombstones проверены сквозным Electron сценарием; recovered candidate виден в Project через typed IPC и приватный canvas preview; `Save Candidate Image` сохраняет проверенный PNG отдельно; Results multi-selection и Add Raster проходят renderer→IPC→shadow→Save с immutable provenance; Project Undo/Redo восстанавливает принятое Raster-изменение одним шагом без staging; Seed Reuse читает document-scoped cursor для внутреннего Prepare/enqueue и переносит его snapshot в `.igs` при Save; durable acceptance journal восстанавливает точный captured cleanup после crash; ранний Add подтверждает exact sibling jobs и ждёт worker exit перед journal/shadow handoff; внутренний qualified batch атомарно публикует N jobs с общими batch/session IDs после recovery capacity preflight; prepared-batch planner bounded раскрывает prompts, назначает uint32 seeds и переносит seed behavior в accepted provenance; qualified inference client готовит frozen Canvas без development child; [production Generate](../engineering/phase-2b-generate-actions-research.md) с transient count, retained frozen capture, typed IPC, serial SQLite drain, pending/running queue/current Cancel и exact confirmed replacement; [app-level Queue Manager](../engineering/phase-2b-queue-manager-research.md): all5 statuses/counts, frozen details/timestamps, reviewed pending/running Cancel, qualified frozen Retry с current-document/shared-close gate, confirmed Delete/Clear сохраняющие staging и seed; [denoising progress](../engineering/phase-2b-generation-progress-research.md) проходит в transient UI; [bounded Results thumbnails](../engineering/phase-2b-result-thumbnails-research.md) используют verified signed cache с placeholder при отказе | Полный pipeline и release runtime, admission при занятом GPU, Queue Manager result previews/output-session navigation, Smart Patch variants, derived history/comparison      | 2B–2C, 4        |
| Preset Manager      | Только отдельный in-memory Vue prototype                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Production manager/SQLite, create/edit/result-to-preset, full/partial Apply, resource diagnostics, 30-day delete/restore/cleanup                                             | 3               |
| Image export        | Контракт bounds/sRGB; production Save Candidate Image с повторной проверкой PNG, отдельным file export и native Save/Cancel evidence; staging и Project остаются неизменными                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Export As, Export Generation BBox; worker→main→file checks                                                                                                                   | 2B, 4           |
| Релиз и app updates | Продуктовые контракты                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Artifact/install/repair/rollback, GPU qualification, ручной Electron updater, clean install/upgrade evidence                                                                 | 5               |

Проверяемые точки входа: [Electron App](../../src/renderer/App.vue),
[Home](../../src/renderer/components/HomeView.vue),
[Model Manager](../../src/renderer/components/ModelManager.vue),
[Project](../../src/renderer/components/ProjectView.vue),
[Project service](../../src/main/projects/project-service.ts),
[worker protocol](../../worker-python/src/imagegen_worker/protocol.py).
Для сквозных проверок — [desktop smoke](../../scripts/smoke-desktop.mjs);
результаты прогона и подмены указаны в evidence-документах, а не выводятся из
самого наличия тестов.

Dev worker намеренно не подключается при `app.isPackaged`: в этой сборке импорт
растра и Rebuild Preview пока недоступны, а Save использует placeholder.
Source-checkout smoke не подтверждает устанавливаемый релиз, живой CivitAI
download, системный keyring или inference на GPU. Прототипные managers,
queue/staging и Canvas tools не считаются production-реализацией.

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
- CivitAI preview показывается из metadata/источника; локальные derivatives,
  которые должен создавать worker, подключаются после фазы 2A. Недоступный
  thumbnail не делает модель установленной или пригодной для генерации.
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
При правке текста main удаляет прежний embedding ref, если его буквальный
activation token исчез; повторный ввод токена не вернёт ref без будущего
resource-aware picker/autocomplete. Новые refs этот UI пока не создаёт.
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
  отвергается до enqueue, а не игнорируется.
- Для Anima реализовать отдельный loader и проверку rectified-flow структуры,
  точной совместимости Qwen3 encoder/VAE и family capabilities перед enqueue.
  Установка любого поддерживаемого CivitAI Anima `.safetensors` checkpoint с
  закреплёнными Qwen3/VAE не доказывает их структурную совместимость; если
  проверка не пройдена, Generate объясняет причину и блокируется.
  Illustrious SDXL `predictionType` к Anima не применяется.
- Валидировать exact model/component/LoRA refs и семейные capabilities до
  enqueue; unsupported input блокируется с понятным сообщением, без silent
  fallback. Frozen job сохраняет все фактически использованные operational
  inputs. Accepted-result provenance и portable projection сохраняют
  воспроизводимые настройки, но исключают Regional Guidance.
- В Raster Layer context menu подключить read-only
  `Compare generation settings`: `Generated with` против `Current Canvas`, включая missing resource
  и unavailable states. Smart Patch использует ту же проекцию после фазы 4;
  mask/bbox/source context не подменяет settings. Подготовить проекцию для
  `Save Preset from Result` без преждевременного создания самого пресета.
- Довести реальное взаимодействие Model Manager и Project picker: Project →
  Manager focus точных checkpoint/версии уже проверен в Electron; остаются
  обратный переход, другие resource selectors, локальные thumbnails installed
  resources и version/default references.

**Выходная проверка:** реальные Illustrious и Anima `txt2img`/`img2img` jobs
с LoRA проходят от Project UI через queue/worker до staging и явного Add.
Изменение Project после enqueue не меняет frozen job; несовместимые resource
combination отвергаются до worker. Seed `Reuse` и accepted provenance
сохраняют точный фактический результат после reopen; comparison не предлагает
Apply/Recall. Реальные jobs проверяют применимые `cfgRescale`, `vaePrecision`,
`predictionType=v_prediction`, `clipSkip`, embeddings и batch expansion с
фактическим seed scheduling; cursor `Reuse` переживает crash/reopen и не
подменяется случайным seed. Это завершает первый вертикальный срез, но не
весь MVP.

## Фаза 3. Presets

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
