# Implementation Roadmap

## Документационный трек перед активной разработкой

Перед стартом реализации нужно закрыть два документационных шага.

### Шаг 1. Закрыть open questions

Ответить на вопросы из [open-questions.md](../open-questions.md), которые влияют на архитектуру первого среза:

- где хранить CivitAI API token;
- какой inference backend берём первым;
- какие base model families поддерживает MVP;
- входит ли LoRA в первый generation slice;
- нужна ли очередь генераций в MVP;
- где и как создаются thumbnails;
- нужен ли soft delete.

Результат: открытые вопросы превращаются в зафиксированные решения или явно помечаются как `Later`.

### Шаг 2. Составить подробный feature catalog

Создать каталог фич в `docs/features/`, чтобы явно отделить MVP от later-scope и зафиксировать отношение к InvokeAI как к reference product.

Предварительная структура:

```text
docs/features/
├─ README.md
├─ generation.md
├─ model-library.md
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

Результат: приложение запускается как desktop shell, renderer общается с main process через безопасный typed API.

## Фаза 1. Model Library

Подробный user flow и scope зафиксированы в [Model Manager](../features/model-manager.md).

- Настройка CivitAI API token.
- Импорт модели по CivitAI URL.
- Получение metadata и preview перед скачиванием.
- Download manager с временным файлом.
- Проверка size/hash, если данные доступны.
- Определение и хранение model compatibility metadata, включая `baseModelFamily` и `predictionType`.
- Запись Model / ModelVersion / LocalModelFile в SQLite.

Результат: модель можно установить локально и увидеть в библиотеке.

## Фаза 2. Generation Slice

- Долгоживущий Python worker.
- Python worker tooling: BasedPyright для типов, Ruff для formatting/linting.
- Invoke-like persistent Queue Manager baseline: SQLite-backed generation/upscale jobs в main process.
- Worker protocol вокруг queue item lifecycle, даже если active worker job в MVP один.
- Минимальная форма txt2img.
- Progress/done/error events.
- Сохранение изображения UUID-именем.
- Сохранение immutable generation snapshot.
- История генераций с fallback для отсутствующего файла.

Результат: пользователь выбирает модель, генерирует изображение и видит его в истории.

## Фаза 3. Presets

- Создание пресета вручную.
- Создание пресета из generation snapshot.
- Редактирование секций пресета.
- Full apply.
- Partial apply.
- Проверка missing resources только для выбранных секций.
- Warning при base model family mismatch.

Результат: snapshot превращается в переиспользуемую настройку, а настройки можно применять точечно.

## Фаза 4. Smart Patch Layer

- `.igs` Project tab with embedded Canvas.
- Project mode bar: `Generate` and `Upscale`.
- Generate mode according to `docs/features/project/generate-mode/README.md`.
- Layer stack.
- Konva-based interactive canvas pipeline with app-owned manager/compositor/cache.
- Smart Patch Layer с mask, bounding box, internal resolution.
- `GenerationResults` для просмотра, выбора active result и очистки свежих multi-result generations.
- Project-local undo/redo для `.igs` document mutations.
- Completed results auto-commit into `.igs`.
- Normal Project Canvas generation creates Raster Layers for every completed result.
- Smart Patch regeneration creates raster sub-layer variants for every completed result.
- `Set Active` chooses the active raster sub-layer/result.
- Active raster sub-layer единственный видимый внутри Smart Patch Layer.
- Outdated status при изменении mask/bbox/settings.
- Regional Guidance Layer with owned region/mask, inline prompt/negative/reference-image controls and regional guidance images.
- `Send Composite to Upscale` creates immutable flattened composite input.
- Upscale mode can add result as new raster layer or export it.

Результат: появляется локальное генеративное редактирование без standalone-масок и неочевидных связей.

## Первый вертикальный срез

Минимальный срез для начала разработки: Фаза 0 + импорт одной модели + одна txt2img генерация + запись snapshot в историю. Всё остальное можно наращивать поверх этого скелета.
