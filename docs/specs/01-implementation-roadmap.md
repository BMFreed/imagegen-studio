# Implementation Roadmap

## Границы плана и исходники-ориентиры

Первый рабочий релиз — одно Linux/NVIDIA desktop-приложение с Illustrious/SDXL
и Anima. UI установки и восстановления runtime находится **в том же основном
окне ImageGen Studio**. Отдельное приложение или окно лаунчера не создаётся;
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

## Документационный трек перед production-разработкой

Vue/Naive prototype уже закрыл базовую интерактивную проработку Home, Model
Manager и presets. Перед production renderer/main-process реализацией нужно
закрыть оставшиеся детали и довести worker/storage contracts до исполнимого
уровня, сохраняя различие между prototype mocks и production evidence.

### Шаг 1. Зафиксировать принятые продуктовые решения во всех контрактах

Основные архитектурные решения уже находятся в [реестре](../open-questions.md#уже-закрытые-решения):
Linux/NVIDIA, Illustrious и Anima, единый Invoke-like inference pipeline внутри
MVP, LoRA, worker-created previews, `safeStorage`, очередь и lifecycle удаления.
Model Manager ставит обязательные Anima Qwen3/VAE components вместе с моделью,
показывая суммарный объём до скачивания. Удалённые пресеты доступны для
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

## Фаза 1. Model Manager

Подробный user flow и scope зафиксированы в [Model Manager](../features/model-manager.md).

**Зависимости:** фаза 0 и модель SQLite/IPC; installation не должен ждать
реализации полного inference pipeline.

- Настройка CivitAI API token.
- Импорт модели по CivitAI URL.
- Получение metadata и preview перед скачиванием.
- Установка Anima checkpoint вместе с проверенными Qwen3 encoder и VAE после
  показа полного объёма всех обязательных файлов и одного подтверждения.
- model install/download pipeline с временным файлом и очередью внутри Model Manager, без отдельной Download Manager surface.
- Проверка size/hash, если данные доступны.
- Определение и хранение model compatibility metadata, включая `baseModelFamily` и `predictionType`.
- Запись Model / ModelVersion / LocalModelFile в SQLite.
- Обнаружение доступных CivitAI-версий и явный `Update available` state.
- Preview и установка новой exact version рядом с уже установленными версиями.
- Явный `Set Default` только для новых selections без изменения existing references.
- CivitAI preview показывается из metadata/источника; локальные derivatives,
  которые должен создавать worker, подключаются после фазы 2A. Недоступный
  thumbnail не делает модель установленной или пригодной для генерации.
- Интерактивный prototype flow и regression coverage для version discovery,
  side-by-side install и default-version switching. Текущий Model Manager
  prototype показывает эти controls только presentation-only, поэтому этот flow
  является первым приоритетом следующего расширения прототипа.

**Выходная проверка:** модель можно установить локально, увидеть после restart,
безопасно добавить другую версию и выбрать default. Отмена, ошибка проверки и
недостающий Anima component не оставляют selectable установку. Существующие
Project/Preset/provenance refs не переписываются; их сквозная проверка с реальными
файлами — в фазах 2–3. PP-004 остаётся неполным до worker/load и Project picker.
Если Linux `safeStorage` даёт `basic_text` или secure provider недоступен,
token не сохраняется plaintext и требующий его импорт блокируется с объяснением.

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
  Raster Layer stack и минимальным Konva compositor. Compositor выдаёт finite
  frozen target input для будущей генерации; полный набор инструментов — фаза 4.
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

## Фаза 2B. Очередь и первая сквозная генерация

**Зависимости:** 2A, установленная Illustrious-модель из фазы 1, исполнимые
generation DTO и source map из документационного трека.

- Расширить worker до долгоживущего inference process. Main process готовит
  immutable input и владеет файлами/очередью; worker выполняет model loading,
  conditioning и denoising. Реально загрузить установленный в фазе 1 exact
  Illustrious checkpoint и показывать несовместимость, которую metadata не
  могла доказать при установке.
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
- После durable candidate publication и validated completion сохранить
  фактический seed в отдельном Project-scoped recovery cursor атомарно с
  queue completion; после сбоя reconciliate незавершённую транзакцию. Cancel,
  failure, discard candidate и prune queue row не подменяют и не откатывают
  cursor.
- При graceful close Project pending/running jobs отменяются и staging
  отбрасывается после подтверждения; после crash старые unfinished jobs
  получают `canceled`, валидные completed candidates восстанавливаются даже
  после успешного Save. Повторный late event не оживляет закрытую сессию.

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
- Закрыть реальное взаимодействие Model Manager и Project picker, локальные
  thumbnails для installed resources и version/default references.

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
установка Illustrious и Anima с обязательными компонентами, LoRA для обоих,
сохраняемый `.igs` Project с базовым Canvas, automatic `txt2img`/`img2img`,
temporary staging и explicit Add as Raster Layer с provenance/history.
Preset create/apply, Smart Patch, regional controls и `inpaint`/`outpaint`
завершают принятый MVP в следующих фазах; этот срез не равен полному релизу.
