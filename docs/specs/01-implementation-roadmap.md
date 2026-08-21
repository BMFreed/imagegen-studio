# Implementation Roadmap

## Документационный трек перед production-разработкой

Vue/Naive prototype уже закрыл базовую интерактивную проработку Home, Model Manager и presets. Перед стартом production renderer/main-process реализации остаётся поддерживать два документационных шага ниже в актуальном состоянии.

### Шаг 1. Закрыть open questions

Ответить на вопросы из [open-questions.md](../open-questions.md), которые влияют на архитектуру первого среза:

- где хранить CivitAI API token;
- какой inference backend берём первым;
- какие base model families поддерживает MVP;
- входит ли LoRA в первый generation slice;
- нужна ли очередь генераций в MVP;
- где и как создаются thumbnails;
- нужен ли soft delete для history/models/presets; для managed projects уже зафиксирован app-managed Trash.

Результат: открытые вопросы превращаются в зафиксированные решения или явно помечаются как `Later`.

### Шаг 2. Составить подробный feature catalog

Создать каталог фич в `docs/features/`, чтобы явно отделить MVP от later-scope и зафиксировать отношение к InvokeAI как к reference product.

Предварительная структура:

```text
docs/features/
├─ README.md
├─ generation.md
├─ model-manager.md
├─ presets.md
├─ history.md
├─ canvas-smart-patch.md
├─ settings.md
└─ import-export.md
```

Для каждой фичи фиксировать:

- `Feature` — что именно делает пользователь.
- `InvokeAI reference` — как похожий сценарий устроен в InvokeAI.
- `ImageGen Studio decision` — берём как есть, берём с доработками, берём другой mature reference, откладываем или отказываемся. Своя реализация с нуля допустима только после явного обоснования, почему готовые механизмы не подходят.
- `Reason` — почему выбрано такое решение.
- `Scope` — `MVP`, `Post-MVP`, `Later`, `Rejected`.
- `Dependencies` — модели, worker, БД, UI, canvas, presets и т.д.
- `Acceptance criteria` — как понять, что фича готова.

Формулировать это как reference-анализ. Базовая стратегия проекта — брать из InvokeAI всё, что уже хорошо работает, и адаптировать под доменную модель ImageGen Studio, вместо того чтобы изобретать велосипед. NIH недопустим: для сложных механизмов вроде моделей, очередей, worker protocol, canvas lifecycle, caching и generation pipeline сначала проверяем InvokeAI, затем другие зрелые решения, и только потом проектируем своё. Если поведение InvokeAI важно для решения, его нужно проверять по актуальным docs/source/UI, а не по памяти.

Результат: feature catalog становится инструментом отсечения scope, а не бесконечным списком хотелок.

## Фаза 0. Каркас приложения

- Vite + Vue 3 + TypeScript.
- Electron main/preload/renderer.
- Naive UI и базовая тёмная тема.
- `Home` tab shell according to [Home Screen](../features/home-screen.md).
- Typed `window.api` без прямого доступа renderer к Node.js.
- SQLite init, migrations, app data directory.
- App-owned `runtime/`, `cache/` и logs roots без зависимости от системного Python или global packages.
- Runtime manager boundary для versioned environments, active-runtime pointer и install-operation lock.

Результат: приложение запускается как desktop shell, renderer общается с main process через безопасный typed API.

## Фаза 1. Model Manager

Подробный user flow и scope зафиксированы в [Model Manager](../features/model-manager.md).

- Настройка CivitAI API token.
- Импорт модели по CivitAI URL.
- Получение metadata и preview перед скачиванием.
- model install/download pipeline с временным файлом и очередью внутри Model Manager, без отдельной Download Manager surface.
- Проверка size/hash, если данные доступны.
- Определение и хранение model compatibility metadata, включая `baseModelFamily` и `predictionType`.
- Запись Model / ModelVersion / LocalModelFile в SQLite.
- Обнаружение доступных CivitAI-версий и явный `Update available` state.
- Preview и установка новой exact version рядом с уже установленными версиями.
- Явный `Set Default` только для новых selections без изменения existing references.
- Интерактивный prototype flow и regression coverage для version discovery,
  side-by-side install и default-version switching. Текущий Model Manager
  prototype показывает эти controls только presentation-only, поэтому этот flow
  является первым приоритетом следующего расширения прототипа.

Результат: модель можно установить локально, увидеть в Model Manager, безопасно
добавить другую версию и выбрать default без изменения существующих Projects,
Presets и provenance.

## Фаза 2. Generation Slice

- Долгоживущий Python worker.
- Python project: `pyproject.toml`, committed `uv.lock`, BasedPyright для типов и Ruff для formatting/linting; Poetry и `requirements.txt` не являются source of truth.
- Собственный exact CPython и platform/backend runtime artifacts; системный Python и пользовательский `PATH` не используются.
- Staged runtime installation: новый versioned environment, verification/self-test, atomic activation, previous known-good rollback.
- Production installation из проверенного runtime bundle либо app-managed Python + signed wheelhouse без client-side dependency resolution и `sdist` builds.
- Invoke-like persistent Queue Manager baseline: SQLite-backed generation jobs в main process.
- Worker protocol вокруг queue item lifecycle, даже если active worker job в MVP один.
- Минимальный canvas workflow с automatic txt2img/img2img derivation from target content.
- Progress/done/error events.
- Сохранение изображения UUID-именем.
- Staging candidates without automatic Project commit.
- Explicit acceptance into Raster Layers with immutable generation provenance.
- Mock and production-shaped `GenerationProvenance` for accepted Raster Layers
  and Smart Patch variants.
- Shared `Compare generation settings` entry in Raster and Smart Patch Layer
  context menus: semantic `Generated with` / `Current Canvas` diff in a bounded
  read-only popover. The diff projects portable generation configuration only;
  Smart Patch mask/bbox/internal resolution/compositing/source context remains
  available for diagnostics and `outdated` but is not shown as settings.
- `Same`/`Changed`/`Added`/`Removed`/`Missing resource`/`Unavailable` states and
  Playwright coverage for both layer types, active Smart Patch variant selection
  and disabled `No generation data` states. The popover has no Apply/Recall
  action. The current prototype has no full provenance or comparison surface, so
  this is the first priority of the provenance prototype pass rather than later
  UI polish.
- `Save Preset from Result` copies only portable generation configuration. It
  never maps Smart Patch internal resolution to preset Size or copies layer
  mask/bbox/compositing/source state; `Duplicate Layer` owns that reuse path.
- Derived history of accepted results with fallback for a missing accepted asset.

Результат: приложение поднимает воспроизводимый worker без системного Python; пользователь выбирает модель, генерирует изображение и видит его в истории. Ошибка установки или обновления нового runtime не ломает предыдущий рабочий worker.

## Фаза 3. Presets

- Создание пресета вручную.
- Создание пресета из accepted-result provenance.
- Редактирование секций пресета.
- Общий `PresetPayloadEditor` для manager create/edit, Apply и New Project preset customization.
- Full apply.
- Partial apply.
- Editable application draft с `Current` / `Apply`, reset и guarded `Edit original`.
- Проверка missing resources только для выбранных секций.
- Warning при base model family mismatch.

Результат: provenance принятого результата превращается в переиспользуемую настройку, а настройки можно применять точечно.

## Фаза 4. Smart Patch Layer

- `.igs` Project tab with embedded Canvas.
- domain mode `generate` with visible working label `Create`; Upscale is deferred.
- Generate mode according to `docs/features/project/generate-mode/README.md`.
- Layer stack.
- Konva-based interactive canvas pipeline with app-owned manager/compositor/cache.
- Smart Patch Layer с mask, bounding box, internal resolution.
- `GenerationResults` as multi-select staging: one focused preview plus one or more candidates selected for acceptance.
- Project-local undo/redo для `.igs` document mutations.
- Completed outputs remain temporary until explicit acceptance.
- `Add N as Layers` creates independent Raster Layers and one grouped undo step.
- `Add N as Variants` creates Smart Patch raster variants and one grouped undo step.
- The focused candidate becomes the accepted anchor when selected; otherwise the first selected candidate becomes active. Other accepted Smart Patch variants remain inactive.
- Active raster sub-layer единственный видимый внутри Smart Patch Layer.
- Outdated status при изменении mask/bbox/settings.
- Regional Guidance Layer with owned region/mask, inline prompt/negative/reference-image controls and regional guidance images.

Результат: появляется локальное генеративное редактирование без standalone-масок и неочевидных связей.

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

Минимальный срез для начала разработки: Фаза 0 + импорт одной модели + automatic canvas generation + staging одного результата + explicit Add as Layer with provenance/history. Всё остальное можно наращивать поверх этого скелета.
