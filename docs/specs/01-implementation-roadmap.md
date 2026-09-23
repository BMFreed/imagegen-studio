# Implementation Roadmap

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
решений в принятом MVP scope сейчас нет; новые обнаруженные варианты поведения
записываются в реестр, а не выбираются при реализации молча.

Результат: ни один пользовательский сценарий первого среза не опирается на
догадку при реализации.

### Шаг 2. Довести существующий feature catalog и worker contract

[Каталог фич](../features/README.md) уже существует. Перед production worker
дополнить source map для закреплённой версии Invoke reference, per-family
capability matrix, Anima component dependencies, типизированные request/response DTO,
pre-enqueue rejection несовместимых input и проверяемые acceptance criteria.
Внешние готовые решения можно изучать для UI, storage и runtime mechanisms,
но альтернативный inference engine не проектируется.

Результат: feature contracts описывают итоговое пользовательское поведение, а
worker protocol — точную границу TS domain logic и Python inference.

## Фаза 0. Каркас приложения

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

Результат: приложение запускается как desktop shell, renderer общается с main process через безопасный typed API.

## Фаза 1. Model Manager

Подробный user flow и scope зафиксированы в [Model Manager](../features/model-manager.md).

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
- Интерактивный prototype flow и regression coverage для version discovery,
  side-by-side install и default-version switching. Текущий Model Manager
  prototype показывает эти controls только presentation-only, поэтому этот flow
  является первым приоритетом следующего расширения прототипа.

Результат: модель можно установить локально, увидеть в Model Manager, безопасно
добавить другую версию и выбрать default без изменения существующих Projects,
Presets и provenance.

## Фаза 2. Project core и первый Generation Slice

- Реальный `.igs` Project tab, базовые Save/reopen/recovery, бесконечный Canvas,
  primary generation bbox и Raster Layer stack до первой пользовательской
  генерации. Минимальный Konva compositor даёт frozen finite target input и
  показывает принятый Raster Layer; полные инструменты развиваются в фазе 4.
- Долгоживущий Python worker.
- Python project: `pyproject.toml`, committed `uv.lock`, BasedPyright для типов и Ruff для formatting/linting; Poetry и `requirements.txt` не являются source of truth.
- Собственный exact CPython и Linux/NVIDIA runtime artifact; системный Python и пользовательский `PATH` не используются.
- Staged runtime installation: новый versioned environment, verification/self-test, atomic activation, previous known-good rollback.
- Production installation из проверенного runtime bundle либо app-managed Python + signed wheelhouse без client-side dependency resolution и `sdist` builds.
- Invoke-like persistent Queue Manager baseline: SQLite-backed generation jobs в main process.
- Worker protocol вокруг queue item lifecycle, даже если active worker job в MVP один.
- Illustrious/SDXL и Anima в одном Invoke-like pipeline, включая LoRA для
  обоих семейств и проверку обязательных Anima Qwen3/VAE dependencies.
- Первый исполнимый Canvas flow выводит `txt2img` или `img2img` из frozen target
  content. `inpaint`/`outpaint` и полный Smart Patch workflow входят в MVP после
  расширения canvas в фазе 4, а не в этот узкий вертикальный срез.
- Progress/done/error events.
- Main-managed provisional output, проверка результата worker'а и атомарная
  публикация temporary candidate.
- Staging candidates without automatic Project commit.
- Explicit acceptance into Raster Layers with immutable generation provenance.
- Mock and production-shaped `GenerationProvenance` for accepted Raster Layers
  and Smart Patch variants.
- Shared `Compare generation settings` entry in Raster and Smart Patch Layer
  context menus: semantic `Generated with` / `Current Canvas` diff in a bounded
  read-only popover. The diff projects portable generation configuration only;
  Smart Patch mask/bbox/internal resolution/compositing/source context remains
  available for diagnostics and `outdated` but is not shown as settings.
- `Same`/`Changed`/`Added`/`Removed`/`Missing resource`/`Unavailable` states
  and production comparison for accepted Raster results. The prototype already
  covers Raster and Smart Patch comparison on mocks; production storage,
  worker context and real assets remain to be verified. The popover has no
  Apply/Recall action.
- Подготовить portable projection принятого результата для будущего
  `Save Preset from Result`; сам create flow входит в фазу 3, а Smart Patch
  variant integration — в фазу 4.
- Derived history of accepted results with fallback for a missing accepted asset.

Результат: приложение поднимает воспроизводимый worker без системного Python;
пользователь открывает сохраняемый Project, выбирает Illustrious или Anima с
LoRA, генерирует временный результат и явно принимает его как Raster Layer.
Только принятый результат попадает в производную историю. Ошибка установки или
обновления runtime не ломает предыдущий рабочий worker.

## Фаза 3. Presets

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

Результат: provenance принятого результата превращается в переиспользуемую настройку, а настройки можно применять точечно.

## Фаза 4. Полный Canvas и Smart Patch Layer

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

Первый исполнимый срез соответствует фазам 0–2: Linux/NVIDIA runtime,
установка Illustrious и Anima с обязательными компонентами, LoRA для обоих,
сохраняемый `.igs` Project с базовым Canvas, automatic `txt2img`/`img2img`,
temporary staging и explicit Add as Raster Layer с provenance/history.
Preset create/apply, Smart Patch, regional controls и `inpaint`/`outpaint`
завершают принятый MVP в следующих фазах; этот срез не равен полному релизу.
