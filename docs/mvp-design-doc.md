# ImageGen Studio — MVP Design Document

> Этот документ — канонический обзор scope и production-архитектуры. Для реализованных Home, Project, Model Manager и preset-system точные layout, visible labels, mock states и переходы определяет `docs/prototype-app`; документ синхронизируется с ним. Vue/Naive Project реализует трёхпанельный Project workspace, plain-text CodeMirror prompt editor с embedding sidecars и contextual LoRA-trigger autocomplete, stacked generation settings, DOM/CSS canvas simulation, sortable layer architecture, multi-select staging и mock queue lifecycle. Его DOM/CSS geometry, queue, save и resource states являются in-memory simulation, а не готовыми Konva/worker/filesystem contracts.

> Короткие продуктовые обещания, явные не-обещания и публичные статусы зафиксированы отдельно в [Product Promises](./product-promises.md); точные правила живут в linked supporting contracts. PP-001 закрепляет понятную product-owned композицию вместо IDE-like workbench; PP-002 требует одного явного intent на control; PP-003 закрепляет canonical ownership и lifecycle каждой пользовательской сущности и настройки; PP-004 определяет модели как managed resources и включает безопасное версионирование в MVP; PP-005 обещает, что каждый принятый результат помнит, как он был создан, а его [supporting contract](./features/project/generate-mode/generation-provenance.md) определяет provenance, comparison и preset boundaries; PP-006 обещает сохранение и повторное применение generation settings с честным предупреждением о missing resources, а [Preset supporting contract](./features/presets.md) определяет точный flow и текущие prototype gaps.

> PP-007 обещает переносимый пользовательский `.igs`, явное сохранение и защиту
> dirty работы через recovery; [Document Lifecycle](./features/project/document-lifecycle.md)
> определяет точные границы. PP-008 обещает явное принятие результатов генерации
> с возможностью отмены; [Staging](./features/project/generate-mode/generation-results.md)
> определяет temporary candidates, acceptance и cleanup. Production готовность
> этих обещаний не подтверждается in-memory mock flows.

> Разработка следует [Research protocol](./engineering/research-protocol.md) и
> [Review protocol](./engineering/review-protocol.md) по уровню риска.
> [Матрица обещаний](./product-promises.md#матрица-обещаний) показывает coverage,
> публичные статусы и supporting evidence.

> Рабочее название документа: **ТЗ / дизайн-документ MVP**  
> Проект: локальное desktop-приложение для генерации изображений нейросетями  
> Основной фокус MVP: **удобное управление моделями, пресетами, генерациями и воспроизводимостью настроек**

---

## 1. Цель проекта

Цель проекта — создать локальное desktop-приложение для генерации изображений с помощью нейросетей, похожее по классу задач на InvokeAI / Forge / ComfyUI, но с другим продуктовым акцентом.

InvokeAI рассматривается как основной reference product для рабочих паттернов генерации, canvas, истории, presets, model management, очередей и локального inference pipeline.

Глобальный инженерный принцип проекта: **NIH недопустим**. ImageGen Studio не должен изобретать заново уже хорошо работающие механизмы без причины. Если подход InvokeAI доказал практическую ценность, мы сначала рассматриваем его как базовый вариант и адаптируем под нашу доменную модель, desktop-архитектуру, typed storage и UX-цели.

Расхождения с InvokeAI ожидаются прежде всего в:

- технологическом стеке;
- бизнес-логике ImageGen Studio;
- модели данных и границах desktop security;
- UX, навигации и пользовательских workflow.

В сложных низкоуровневых механизмах — работа с моделями, compatibility metadata, очереди, worker protocol, canvas lifecycle, caching, compositing, generation pipeline — проект опирается на InvokeAI настолько, насколько это возможно в рамках выбранного стека. Для UI, storage и runtime mechanisms, которым подход InvokeAI не подходит, сначала изучаем другие зрелые решения. Inference при этом остаётся одним Invoke-like pipeline для принятого MVP scope; альтернативные inference engines не проектируются.

Это не означает механическое копирование. Решения InvokeAI используются как проверенная отправная точка:

- берём подход как есть, если он хорошо ложится на ImageGen Studio;
- адаптируем, если наша модель данных или UX требуют другой формы;
- отказываемся или проектируем своё только если подход конфликтует с целями проекта, выбранным стеком, UX, бизнес-логикой или создаёт неочевидное состояние.

Основная идея приложения: не просто дать пользователю кнопку `Generate`, а помочь ему управлять творческим процессом:

- организовывать работы через `Home` screen с workspace'ами;
- открывать несколько `.igs` проектов одновременно, каждый в своей `Project` tab;
- хранить canvas-проекты как переносимые `.igs` project files;
- скачивать модели и устанавливать несколько версий рядом;
- хранить версии моделей и LoRA;
- сохранять immutable provenance только для принятых generated results;
- переиспользовать настройки через развитую систему пресетов;
- применять пресеты целиком или частично;
- быстро находить старые удачные настройки и пробовать их с другими моделями.

Первый рабочий релиз рассчитан только на Linux с NVIDIA GPU. Генерация
поддерживает Illustrious (SDXL architecture) и Anima, включая LoRA для обеих
семей, через один Invoke-like inference pipeline в границах принятого MVP.
Model Manager устанавливает необходимые Anima Qwen3 encoder и VAE вместе с
моделью, заранее показывая полный объём загрузки.

Проект позиционируется как:

```text
Локальная ImageGen Studio для управления моделями, пресетами, генерациями и экспериментами.
```

Основная shell-модель — document-based editor:

- `Home` является обычной вкладкой со workspace'ами, cross-workspace view `Projects`, app-managed `Trash`, new/import project и доступом к Model Manager и Preset Manager;
- `.igs` project file открывается как `Project` tab;
- `Project` tabs могут быть открыты одновременно;
- `Canvas` является рабочей поверхностью внутри `Project`, а не отдельной top-level вкладкой;
- внутри `Project` используется domain mode `generate`; основное действие — `Generate`, отдельного заголовка `Create` и переключателя единственного режима нет;
- txt2img/img2img/inpaint/outpaint определяется автоматически по target-area canvas content;
- Upscale отложен до отдельного feature/prototype pass;
- один и тот же `.igs` нельзя открыть дважды: повторное открытие фокусирует уже существующую `Project` tab.

Document tabs, domain modes и presets не подменяют друг друга. Пользователь может настраивать содержимое своей работы и bounded presentation preferences, но не собирать основные экраны из взаимозаменяемых widgets. Эта ограниченность является частью продуктового обещания понятности, а не временным недостатком layout engine.

Search, create, import, install и scan являются отдельными пользовательскими намерениями и не объединяются в универсальный input. Project, Workspace, Model, Preset, temporary Generation candidate, accepted Layer/variant, provenance и Queue item имеют разные owners и lifecycle. Internal storage terms вроде `asset` или `record` не становятся top-level navigation только из-за присутствия в data model.

Model Manager и Preset Manager открываются как app-level modal overlays с native Naive transitions и `Esc` close; они не становятся document tabs. Apply Preset остаётся Project-scoped modal surface. Home, открытый под manager overlay, остаётся смонтированным и inert, поэтому browse state восстанавливается после закрытия.

---

## 2. Технологический стек

### 2.1. Основной стек

Для MVP выбран стек:

```text
Vue 3
Electron
Naive UI
TypeScript
SQLite
Python ML worker
```

### 2.2. Обязательные требования к стеку

- TypeScript обязателен для frontend-слоя и Electron main process.
- UI пишется на Vue.
- Desktop shell — Electron.
- UI-библиотека — Naive UI.
- Локальная база данных — SQLite.
- Python используется для model loading, conditioning, inference и создания связанных image derivatives/previews в ML Worker; application business logic остаётся в TypeScript.
- Основная бизнес-логика приложения не должна жить в Python.
- Python project и dependencies управляются только через `uv`, `pyproject.toml` и committed `uv.lock`; Poetry и `requirements.txt` не являются source of truth.
- Приложение использует собственный exact CPython и не зависит от системного Python, пользовательского `PATH`, Conda или global `site-packages`.

### 2.3. Почему Electron, а не Tauri

Tauri рассматривался как вариант, но был отложен из-за необходимости писать системный слой на Rust.

Для текущего проекта Electron предпочтительнее, потому что:

- системный слой можно писать на TypeScript/Node.js;
- можно работать с filesystem, SQLite и процессами без отдельного backend-сервера;
- проще управлять Python worker'ом через Node.js;
- не требуется изучать Rust;
- для AI-приложения размер Electron не является критичным на фоне моделей, CUDA, кешей и изображений.

---

## 3. Общая архитектура

### 3.1. Основная схема

```text
Vue Renderer
  ↓ typed preload API
Electron Preload
  ↓ IPC
Electron Main Process
  ├─ SQLite
  ├─ filesystem
  ├─ model manager
  ├─ preset manager
  ├─ accepted generation result index
  ├─ model install/download service
  ├─ Python runtime manager
  ├─ Python worker manager
  └─ IPC handlers
Python ML Worker
  └─ PyTorch / diffusers / transformers / inference / image derivatives
```

### 3.2. Роль Electron main process

Electron main process в этом проекте выступает как локальный backend/application layer.

Это не отдельный HTTP-сервер, а системный слой приложения, отвечающий за:

- работу с SQLite;
- работу с файловой системой;
- установку, проверку, активацию и rollback app-owned Python runtime;
- управление Python worker'ом;
- скачивание моделей;
- хранение CivitAI token через Electron `safeStorage` без постоянного plaintext fallback;
- проверку целостности файлов;
- хранение истории генераций;
- хранение пресетов;
- владение путями, cache и атомарной публикацией результатов и preview, созданных worker'ом;
- single-instance lifecycle через Electron `app.requestSingleInstanceLock()`;
- обработку `second-instance` intents для повторного запуска, file association и deep links;
- регистрацию IPC handlers;
- отправку событий во frontend.

Приложение должно работать в single-instance режиме. Второй OS-процесс не создаёт окно, не открывает SQLite, не запускает worker и не меняет autosave state. Он передаёт intent уже запущенному instance, а существующий main process фокусирует окно и передаёт open-project intent в tab manager.

Это нужно, чтобы пользователь не мог открыть один и тот же `.igs` в двух независимых инстансах приложения. Запрет дублей внутри одного instance всё равно остаётся обязанностью Project tab manager: повторное открытие уже открытого `.igs` фокусирует существующую `Project` tab.

### 3.3. Роль Renderer process

Renderer process отвечает за:

- UI;
- Vue-компоненты;
- Pinia/state management;
- пользовательские сценарии;
- отображение истории;
- отображение каталога пресетов;
- формы генерации;
- partial/full apply пресетов;
- показ ошибок, warning'ов и fallback-состояний.

Renderer не должен напрямую иметь доступ к:

- `fs`;
- `child_process`;
- SQLite driver;
- Python worker;
- произвольным shell-командам;
- сырому `ipcRenderer`.

Доступ к системным функциям должен происходить только через typed `window.api`.

### 3.4. Роль Preload

Preload-слой предоставляет безопасный ограниченный API через `contextBridge`.

Примерная форма:

```ts
window.api = {
  workspaces: {
    getList,
    create,
    update,
    removeRegistration,
    rescan,
    locate,
  },
  projects: {
    getIndex,
    create,
    importExternal,
    rename,
    move,
    moveToTrash,
    restore,
    deletePermanently,
    recover,
    locate,
    removeFromHome,
    rebuildPreview,
    applyPresetDraft,
  },
  models: {
    importFromCivitaiUrl,
    getInstalled,
    deleteLocalModel,
  },
  generation: {
    enqueue,
    cancel,
    onProgress,
    onDone,
    onError,
  },
  presets: {
    create,
    update,
    delete,
    getList,
  },
  history: {
    getRecent,
    getById,
    delete,
    createPresetFromGeneration,
  },
  canvas: {
    createSmartPatchLayer,
    updateSmartPatchLayer,
    duplicateLayer,
    regenerateSmartPatchLayer,
  },
  files: {
    revealInFolder,
    chooseDirectory,
    chooseProjectFile,
  },
}
```

---

## 4. Electron IPC best practices

### 4.1. Основные правила

Для общения UI и main process используется IPC.

IPC — Inter-Process Communication, то есть обмен сообщениями между процессами Electron.

Правильная схема:

```text
Renderer → window.api → preload → ipcRenderer.invoke → ipcMain.handle → main service
```

Неправильная схема:

```text
Renderer напрямую импортирует ipcRenderer / fs / child_process
```

### 4.2. Security-настройки окна

Для BrowserWindow:

```ts
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}
```

### 4.3. Принципы IPC API

- Не пробрасывать `ipcRenderer` напрямую в renderer.
- Не делать универсальный `window.api.invoke(channel, payload)`.
- Не давать renderer'у произвольный SQL.
- Не давать renderer'у произвольный filesystem-доступ.
- Не давать renderer'у запускать произвольные shell-команды.
- Все методы `window.api` должны быть доменными.
- Все payload'ы в main process должны валидироваться runtime-схемами.
- Все IPC channels должны быть вынесены в общий shared-модуль.
- Для больших бинарных данных через IPC передавать не сами данные, а пути/ID.

### 4.4. Commands vs Events

Commands вызываются через `invoke/handle`:

```text
models:importFromCivitaiUrl
workspaces:create
workspaces:removeRegistration
projects:create
projects:importExternal
projects:moveToTrash
projects:restore
projects:deletePermanently
projects:locate
projects:removeFromHome
projects:rebuildPreview
projects:applyPresetDraft
generation:enqueue
generation:cancel
history:getRecent
presets:create
presets:update
presets:delete
canvas:createSmartPatchLayer
canvas:regenerateSmartPatchLayer
canvas:duplicateLayer
```

Events отправляются из main в renderer:

```text
generation:progress
generation:done
generation:error
models:downloadProgress
models:downloadDone
models:downloadError
worker:statusChanged
```

Каждая подписка на event должна возвращать unsubscribe-функцию.

---

## 5. Runtime validation

### 5.1. Общая политика

TypeScript проверяет типы только на этапе разработки, поэтому входящие данные в main process должны дополнительно валидироваться на runtime.

Для runtime-схем рассматривается современный TypeScript-first подход.

Предпочтительная библиотека для MVP:

```text
Valibot
```

Альтернатива:

```text
Zod v4
```

### 5.2. Что валидировать

Обязательно валидировать:

- параметры генерации;
- данные создания/редактирования пресетов;
- CivitAI URL;
- пути к файлам/папкам;
- команды удаления;
- payload'ы partial apply;
- настройки модели;
- данные импорта/скачивания.

### 5.3. Ошибки

Ошибки в main process должны нормализоваться.

Пример формата:

```ts
type AppError = {
  code: string
  message: string
  details?: unknown
}
```

В UI на этапе MVP большинство ошибок можно показывать стандартным toast'ом.

---

## 6. UI-библиотека

### 6.1. Выбранная библиотека

Для UI выбрана:

```text
Naive UI
```

### 6.2. Причины выбора

Naive UI выбрана из-за:

- Vue 3-first подхода;
- хорошей TypeScript-поддержки;
- большого набора компонентов;
- нормальной тёмной темы;
- хорошей кастомизации;
- нейтрального визуального языка;
- пригодности для desktop-like creative tool;
- меньших рисков по качеству TypeScript-кода по сравнению с PrimeVue.

### 6.3. Почему не PrimeVue

PrimeVue рассматривалась, но не выбрана как основная библиотека из-за сомнений в TypeScript-first качестве исходников.

Опыт использования PrimeVue показал риск runtime-багов, которые могли бы быть пойманы TypeScript'ом, если бы компоненты библиотеки были написаны на TS.

Для данного проекта важно не только наличие `.d.ts` для потребителя, но и качество внутренней типизации самой библиотеки.

---

## 7. MVP scope

### 7.1. Главные фичи MVP

MVP включает:

1. Импорт моделей с CivitAI по ссылке.
2. Скачивание модели только при наличии активного API-токена.
3. Скачивание metadata модели.
4. Скачивание preview/avatar модели.
5. Хранение модели, версии, автора и metadata в SQLite.
6. Проверка целостности скачанного файла.
7. Обнаружение доступных CivitAI-версий и явный update flow.
8. Установка нескольких версий модели рядом без перезаписи старых файлов.
9. Явный default version для новых selections при сохранении exact version в существующих Projects, Presets и provenance.
10. Генерация изображений через Python ML worker.
11. Staging completed outputs without automatic Project commit.
12. Multi-select acceptance into layers/variants with immutable generation provenance and accepted-result history.
13. Layer-context read-only comparison of generated settings with current Canvas state for Raster and Smart Patch Layers.
14. Плоские пресеты без наследования и композиции.
15. Создание пресета вручную.
16. Создание пресета из генерации.
17. Редактирование пресета.
18. Full apply пресета.
19. Partial apply пресета.
20. Проверка отсутствующих моделей/LoRA при применении выбранных секций.
21. Warning при несовместимости base model family.
22. Fallback-состояние, если файл изображения отсутствует.
23. Invoke-like persistent Queue Manager для generation jobs.
24. Project-local undo/redo для `.igs` document mutations.

### 7.2. Что НЕ входит в MVP

В MVP не входят:

- поиск моделей внутри CivitAI из приложения;
- полноценный marketplace/browser моделей;
- автоматическая установка обновлений моделей;
- silent auto-update или silent default-version switching;
- sidecar JSON рядом с изображением;
- embedded metadata в изображении;
- наследование пресетов;
- композиция пресетов;
- переменные внутри пресетов;
- сложная compatibility matrix;
- headless mode;
- web/server mode;
- remote generation;
- multi-user mode;
- plugin API;
- OpenAPI/HTTP API;
- workflow-graph как в ComfyUI;
- сложная отдельная логика обработки каждого CivitAI error case.

---

## 8. Интеграция с CivitAI

### 8.1. Ограничения MVP

На этапе MVP:

- модель скачивается только по ссылке CivitAI;
- CivitAI API token обязателен;
- без активного API token скачивание не запускается;
- внутренний поиск по CivitAI не реализуется;
- browsing/discovery моделей не реализуется.

### 8.2. Сценарий импорта

```text
Пользователь вставляет CivitAI URL
↓
Приложение валидирует URL
↓
Приложение проверяет наличие API token
↓
Main process получает metadata модели/версии
↓
Приложение показывает preview импорта
↓
Пользователь подтверждает скачивание
↓
Model install service скачивает файл во временный путь
↓
Приложение проверяет размер/hash файла
↓
После успешной проверки файл переносится в managed models directory
↓
В SQLite создаются записи Model / ModelVersion / LocalModelFile
```

### 8.3. Сценарий обновления версии

Версионирование моделей входит в MVP. Model Manager использует стабильную
CivitAI model identity для обнаружения связанных версий, но каждая точная
version/file identity остаётся отдельным generation resource.

```text
Model Manager проверяет известную CivitAI model identity
↓
Показывает Update available без автоматической установки
↓
Пользователь открывает preview новой версии и файла
↓
Пользователь подтверждает Install Version
↓
Новая версия проходит обычный download/verify/install pipeline
↓
Новая и старая версии остаются установленными рядом
↓
Пользователь при желании явно делает новую версию Default
```

`Default` применяется только к новым model selections. Existing Projects,
Presets и accepted-result provenance остаются привязаны к exact version/hash и
не переписываются после update check, установки версии или смены default.

### 8.4. Скачивание файлов

Скачивание должно происходить во временный файл.

Пример:

```text
model.safetensors.download
```

После успешной проверки целостности файл переименовывается:

```text
model.safetensors
```

Модель считается установленной только после:

- успешного завершения скачивания;
- проверки размера, если размер известен;
- проверки hash, если hash доступен;
- записи в SQLite.

### 8.5. Ошибки CivitAI

Ошибки привязаны к операции в Model Manager. Статус token и его настройка
доступны из header pill; отсутствие защищённого хранилища на Linux объясняется
там же, а import с token не начинается, пока проблема не устранена. Ошибка
metadata/dependency разрешения остаётся в import preview/dialog, а failed
download — в install job с Retry/Cancel. Toast может дополнительно уведомить
об ошибке, но не является единственным местом диагностики.

Примеры:

```text
Не удалось скачать модель.
Не удалось получить данные модели.
CivitAI API token недействителен.
Файл модели недоступен.
```

Конкретные states и доступные действия определяет
[Model Manager](./features/model-manager.md).

---

## 9. Модельная библиотека

### 9.1. Версия модели как отдельный ресурс

Внутри системы версия модели считается отдельной моделью/ресурсом.

То есть:

```text
Model A v1
Model A v2
```

— это разные generation resources.

Если preset или accepted-result provenance использует `Model A v1`, наличие `Model A v2` не считается наличием нужного ресурса.

### 9.2. Идентичность ресурса

Минимальная identity ресурса:

```ts
type ResourceIdentity = {
  type: 'checkpoint' | 'lora' | 'vae' | 'controlnet' | 'other'
  source: 'civitai' | 'local' | 'unknown'
  civitaiModelId?: number
  civitaiModelVersionId?: number
  fileHash?: string
}
```

Для CivitAI-ресурса главным идентификатором является версия модели и hash файла.

### 9.3. Хранение human-readable данных

Даже если локальный файл модели удалён, история генераций должна оставаться читаемой.

Поэтому accepted-result provenance должен хранить не только ID, но и копии human-readable данных:

```ts
type ModelPredictionType = 'epsilon' | 'v_prediction' | 'sample'

type ProvenanceModelRef = {
  localResourceId?: string
  civitaiModelId?: number
  civitaiVersionId?: number
  name: string
  versionName?: string
  fileHash?: string
  baseModelFamily?: string
  predictionType?: ModelPredictionType
}
```

То же правило применяется к LoRA.

Удаление локальной модели в MVP — жёсткое, без пользовательского soft delete.
Main process блокирует удаление используемой running job модели, предлагает
разобраться с pending jobs и предупреждает о ссылках из Projects, Presets и
provenance до подтверждения. Скопированная display/identity metadata сохраняет
читаемость отсутствующих ссылок, но не делает весы восстановимыми. Общий
resource lifecycle определяет [Model Manager](./features/model-manager.md#remove-local-resource).

`predictionType` — compatibility metadata модели. Для `v_prediction`-моделей scheduler должен работать в `v_prediction` mode; запуск такой модели как обычной `epsilon`-модели приводит к неверному denoising.

### 9.4. Загрузка SDXL/Illustrious-like checkpoint'ов

Для SDXL/Illustrious-like `.safetensors` checkpoint'ов MVP следует InvokeAI-пути.

Правило:

```text
.safetensors = исходный пользовательский артефакт
Diffusers single-file loading = runtime path
RAM/VRAM model cache = основной cache MVP
```

Worker не должен скрыто заменять checkpoint на diffusers-директорию и не должен выполнять destructive-конвертацию исходного файла. Обычный запуск модели загружает `.safetensors` через Diffusers single-file mechanism, аналогично InvokeAI `from_single_file`, после чего уже загруженные pipeline/components могут кэшироваться в памяти.

Постоянная конвертация в diffusers-формат допускается только как явное пользовательское действие или как отдельная будущая оптимизация. Если позже понадобится ускорить cold load, можно добавить internal non-destructive disk cache по hash файла, но это не является базовым поведением MVP.

---

## 10. Generation Provenance

### 10.1. Назначение

Generation provenance — immutable metadata принятого generated result: настройки, ресурсы, входы и runtime metadata, которыми был создан persistent Raster Layer или Smart Patch variant.

Provenance принадлежит принятому layer/variant и хранится project-locally внутри `.igs`. Completed staging candidate не получает provenance до explicit `Add N as Layers` / `Add N as Variants`.

Provenance нужен для:

- воспроизводимости;
- сравнения фактических настроек результата с current Canvas state;
- создания пресетов из старых генераций;
- диагностики отсутствующих моделей/LoRA;
- понимания, каким конфигом была создана картинка.

Он не нужен для undo/redo. Undo/redo хранит project mutation, а provenance является частью добавленного layer/variant.

### 10.2. Provenance не равен preset

Важно различать две сущности:

```text
GenerationProvenance = immutable evidence accepted result'а
Preset = редактируемый пользовательский шаблон
```

Provenance:

- создаётся только при принятии candidate;
- привязан к persistent layer/variant;
- immutable;
- не редактируется вручную;
- не меняется при изменении модели;
- не меняется при изменении пресета.

Preset:

- создаётся пользователем вручную или из provenance принятого результата;
- редактируется;
- имеет имя, описание, теги;
- применяется full/partial apply.

### 10.3. Где хранить provenance

Project-local provenance хранится внутри `.igs` и является source of truth для принятого result. SQLite хранит только derived global history index accepted results.

Sidecar JSON не делается.

Embedded metadata в изображении не делается.

Правило MVP:

```text
SQLite = derived index истории принятых результатов.
.igs = source of truth для accepted layers/variants и их provenance.
```

Staging candidates хранятся в локальном app-managed recovery с durable manifest
и assets. Они не входят ни в `.igs`, ни в global history до принятия; Save
самого проекта не переносит непринятые кандидаты в `.igs`.

### 10.4. Иммутабельность provenance

Provenance создаётся в момент acceptance и больше не изменяется. Оно объединяет frozen job inputs с actual seed/output/worker metadata.

Запрещено:

- изменять provenance при редактировании пресета;
- изменять provenance при обновлении/удалении/переименовании модели;
- изменять provenance при просмотре comparison или создании preset draft;
- создавать project-local provenance для discarded candidate.

### 10.5. Состав provenance

Минимальный состав:

```ts
type GenerationProvenance = {
  generationId: string
  createdAt: string
  appVersion: string
  workerVersion?: string
  engineName?: string
  engineVersion?: string
  workflowType: 'txt2img' | 'img2img' | 'inpaint' | 'outpaint'

  prompt: string // serialized frozen form sent to the worker
  negativePrompt?: string
  promptEmbeddingRefs: GenerationPromptEmbeddingRef[]
  negativePromptEmbeddingRefs: GenerationPromptEmbeddingRef[]

  model: ProvenanceModelRef

  loras: Array<{
    localResourceId?: string
    civitaiModelId?: number
    civitaiVersionId?: number
    name: string
    versionName?: string
    fileHash?: string
    baseModelFamily?: string
    weight: number
    triggerPhrases?: string[]
  }>

  params: {
    width: number
    height: number
    steps: number
    cfgScale?: number
    sampler?: string
    scheduler?: string
    seed: number // actual worker-used seed
    requestedSeedPolicy: 'fixed' | 'random' | 'reuse'
    seedBehavior: 'per-iteration' | 'per-prompt'
    clipSkip?: number
    vae?: ProvenanceModelRef
    cfgRescale?: number
    vaePrecision?: 'Auto' | 'FP16' | 'FP32'
  }

  output: {
    imageId: string
    fileName: string
    filePath: string
    format: 'png' | 'jpg' | 'webp'
  }
}
```

Внутри provenance эти поля образуют переносимую `generation configuration`.
Для Smart Patch variant рядом хранится отдельный `layer/source context`: source
composite hash, mask hash, bbox/internal resolution, layer-owned generation
draft revision and compositing inputs. Этот context нужен для объяснимости и
сравнения active variant с current owned inputs при вычислении `outdated`, но не
является preset payload или частью generation-settings diff.

### 10.6. Compare generation settings

Контекстное меню обычного Raster Layer и Smart Patch Layer предоставляет одно и
то же read-only действие `Compare generation settings`.

- для generated Raster Layer стороной `Generated with` является provenance
  этого слоя;
- для Smart Patch Layer стороной `Generated with` является provenance текущего
  active/visible accepted variant;
- comparison не сравнивает Smart Patch variants между собой;
- стороной `Current Canvas` всегда является derived snapshot текущего открытого
  `ProjectDocumentModel`;
- current Canvas projection включает применимые generation settings/resources,
  generation size/derived mode и переносимые inputs; Regional Guidance
  исключён с обеих сторон;
- Prompt, Negative Prompt, Model/version, LoRAs, embeddings, Sampling, Guidance,
  generation Size, actual Seed и requested Seed policy, Denoising Strength,
  VAE, CFG Rescale, VAE Precision и применимый generation context
  сравниваются по semantic sections;
- Smart Patch mask, bbox, internal resolution, compositing state и source
  revisions не входят в settings diff; они остаются отдельным layer/source
  context для diagnostics и `outdated`;
- section status имеет текстовое значение `Same`, `Changed`, `Added`, `Removed`,
  `Missing resource` или `Unavailable`;
- popover не содержит `Apply`, `Recall`, `Restore` или иных mutation actions;
- imported Raster Layer без provenance и Smart Patch Layer без active accepted
  variant показывают disabled action с причиной `No generation data`.

Сравнение открывается как bounded popover из layer context menu, а не как modal
или отдельная History surface. Оно вычисляется реактивно, не сохраняется как
отдельный diff и ничего не изменяет при открытии или закрытии. `Create Preset
from Result` остаётся отдельным layer/result action вне popover.

`Create Preset from Result` копирует только `generation configuration`. Оно не
копирует Smart Patch mask, bbox, internal resolution, compositing state или
source identities; internal resolution не преобразуется в preset `Size`.
Переиспользование этих layer-owned свойств выполняется через `Duplicate Layer`.

Текущий Vue-прототип создаёт in-memory mock provenance для accepted generated
Raster Layer и active Smart Patch variant и реализует общий read-only popover
`Generated with` / `Current Canvas`, disabled states и Playwright coverage.
Production `.igs` serialization, exact runtime identities и source hashes пока
не реализованы; mock не является доказательством production persistence.

---

## 11. Изображения и история генераций

### 11.1. Имена файлов

Сгенерированные изображения должны называться через UUID.

Пример:

```text
f0d7c7a0-2b92-4f2f-9f91-5e8f9f7a1c6b.png
```

### 11.2. Привязка к БД

Global history indexes only accepted generated results. For each accepted result SQLite may store:

- UUID изображения;
- путь к файлу;
- дата создания;
- project path plus accepted layer/variant and provenance id inside `.igs`;
- preview/thumbnail path, если будет реализовано;
- статус файла.

### 11.3. Отсутствующее изображение

Если запись в БД есть, но файл изображения отсутствует, UI должен показать fallback.

Пример текста:

```text
Изображение не найдено.
Файл мог быть удалён или перемещён вне приложения.
```

На этапе MVP достаточно fallback-состояния.

Дополнительные действия вроде “выбрать новый файл” или “удалить запись из истории” можно добавить позже.

---

## 12. Пресеты

### 12.1. Общая модель

На этапе MVP пресеты плоские.

Не поддерживаются:

- наследование;
- композиция;
- зависимости между пресетами;
- override rules;
- переменные;
- условия применения.

Preset — это редактируемый пользовательский шаблон, который может содержать разные секции настроек.

### 12.2. Создание пресета

Пресет можно создать:

1. Вручную.
2. Из текущей генерации.
3. Из старой генерации в истории.

При создании из принятого результата provenance копируется в editable preset-структуру.

Исходный provenance при этом не меняется.

Создание всегда проходит через create mode Preset Manager. Новая структура существует как transient draft без `id` и записи в SQLite, пока пользователь не нажмёт `Create Preset`. Draft из текущего проекта или accepted-result provenance полностью редактируем: пользователь может изменить не только состав секций, но и сами значения. Ручной `New Preset` начинает с минимального Text to Image draft, содержащего только пустую секцию Prompt.

Project-derived draft копирует reusable generation sections, но исключает Seed по умолчанию и объясняет это в source banner/Seed section. `Cancel` закрывает manager и возвращает к project context; manual create `Cancel` возвращает ранее выбранный preset.

### 12.3. Редактирование пресета

Пользователь может редактировать:

- название;
- описание;
- теги;
- favorite;
- workflow;
- prompt;
- negative prompt;
- модель;
- LoRA stack;
- веса LoRA;
- plain-text positive/negative prompts and their embedding-reference sidecars;
- size;
- sampler и scheduler;
- steps и CFG;
- denoising strength для Image to Image / Smart Patch;
- seed policy;
- VAE;
- CFG Rescale и VAE Precision, когда поддерживаются выбранной моделью.

### 12.4. Типы секций пресета

На MVP-уровне пресет может включать секции:

```text
Prompt
Negative prompt
Model
LoRA stack
Size
Sampler & Scheduler
Steps & CFG
Denoising Strength (Image to Image / Smart Patch)
Seed
VAE
CFG Rescale
VAE Precision
```

Наличие секции в сохранённом пресете определяется наличием соответствующего поля в `PresetPayload`; отдельный persisted `includedSections` не хранится. Embedding refs являются sidecar-ресурсами соответствующего plain-text Prompt или Negative Prompt и не имеют собственной секции. `VAE`, `CFG Rescale` и `VAE Precision` являются явными отдельными секциями. Общего `Advanced`/`engineSpecific` bag в пресете нет: новый параметр добавляется отдельным типизированным полем и секцией только после явного продуктового решения.

При переключении workflow на `Text to Image` поле `denoisingStrength` удаляется. Обратное переключение не включает его автоматически: пользователь должен явно включить секцию.

### 12.5. Full apply

Full apply применяет все доступные секции пресета.

Перед применением выполняется валидация ресурсов.

Если обязательная модель/LoRA отсутствует, применение блокируется ошибкой.

### 12.6. Partial apply

Partial apply позволяет пользователю выбрать, какие секции применить.

Пример:

```text
[x] Prompt
[ ] Negative prompt
[x] LoRA stack
[ ] Model
[x] Size
[ ] Sampler & Scheduler
[ ] Steps & CFG
```

Валидация применяется только к выбранным секциям.

Если пользователь применяет только prompt, отсутствие модели/LoRA из пресета не должно блокировать применение.

Перед применением создаётся отдельный application draft. Пользователь может раскрыть секцию, изменить копируемые значения и сравнить `Current` с `Apply`. Эти изменения никогда не обновляют исходный preset; `Apply` копирует в проект только выбранные секции. Selection mask существует только во время операции применения и не сохраняется в `PresetPayload`. По умолчанию выбираются все секции исходного preset, кроме `Size` и `Seed`; все accordion-секции изначально свёрнуты. UI постоянно называет редактируемые значения временной копией, поддерживает `Expand all` / `Collapse all` и отделяет действие `Edit original`, которое открывает исходный preset в Preset Manager после подтверждения потери изменённого application draft.

### 12.7. Действия из старой генерации

Из старой генерации можно:

1. Посмотреть read-only сравнение с current Canvas из layer context menu.
2. Создать новый preset отдельным действием.

UI должен явно различать эти действия:

```text
Compare generation settings
Save preset from image
```

Прямой `Apply` / `Recall` настроек provenance не входит в MVP comparison flow.

Обе команды работают с generation configuration. `Save preset from image` не
копирует Smart Patch mask, bbox, internal resolution, compositing state и source
identity; эти свойства переиспользуются через `Duplicate Layer`. Layer/source
context может оставаться в provenance для diagnostics и `outdated`, но не
показывается как generation-settings difference.

---

## 13. Валидация применения пресетов

### 13.1. Общий принцип

При применении preset проверяются только те секции, которые пользователь реально
выбрал для применения. Provenance comparison не применяет значения и показывает
missing resource как read-only diagnostic, поэтому не использует Apply validation.

### 13.2. Missing resource

Если выбранная секция требует модель/LoRA, а точная версия ресурса отсутствует, это hard error.

Пример:

```text
LoRA "Zyra v1.2" не найдена.
```

или

```text
Модель "Illustrious v1.0" не найдена.
```

### 13.3. Version mismatch

Если найдена та же CivitAI-модель, но другая версия, это не считается валидным совпадением.

Для системы это другой ресурс.

Пример:

```text
Требуется Zyra LoRA v1.2, но локально установлена только Zyra LoRA v1.3.
```

На этапе MVP автоматическая замена на другую версию не выполняется.

### 13.4. Base model family mismatch

Если ресурс найден, но его base model family не совпадает с активной моделью, показывается warning.

Пример:

```text
Эта LoRA относится к SDXL, а выбранная модель относится к Anima. Результат может быть некорректным.
```

Это warning, а не hard error.

Пользователь может продолжить применение.

### 13.5. Resource status badges

Желательное поведение UI:

```text
Model: OK / Missing / Version mismatch
LoRAs: 3/3 found
LoRAs: 2/3 found
Base family: warning
```

Это можно реализовать в MVP или сразу после MVP.

---

## 14. Canvas, слои и Smart Patch Layer

### 14.1. Цель слойно-масочной модели

ImageGen Studio должен поддерживать локальное генеративное редактирование изображения через canvas, слои, маски и bounding box, но без проблемы "бесхозных" масок, которые существуют отдельно от результата генерации.

В MVP основная пользовательская единица локального генеративного редактирования — **Smart Patch Layer**.

Название **Smart Patch Layer** выбрано потому, что слой может использоваться не только для inpainting, но и для outpainting / локального patch-редактирования области изображения.

Ключевая формула MVP:

```text
1 Smart Patch Layer
= 1 mask
= 1 bounding box
= 1 internal resolution
= 1 layer-owned generation draft
= N raster sub-layers
= 1 active/visible raster sub-layer
= immutable provenance per accepted raster sub-layer
```

Smart Patch Layer является самодостаточной generative entity, которая хранит mask/bbox/internal resolution, собственный generation draft, accepted variants и данные, необходимые для повторной генерации patch-области.

Зафиксированные решения по терминологии и поведению:

- слой называется **Smart Patch Layer**, потому что он покрывает не только inpainting, но и outpainting / локальное patch-редактирование;
- область генерации в UI называется именно **Bounding Box**, а не `Generation Box`, чтобы не путать её с `Mask`;
- внутри одного Smart Patch Layer может храниться несколько raster sub-layers;
- одновременно активным и видимым может быть только один raster sub-layer;
- включить два raster sub-layers одного Smart Patch Layer одновременно запрещено.

### 14.2. Бесконечный Project Canvas и отдельные generation bbox

Project Canvas — бесконечная координатная область композиции без фиксированных width/height и края документа, как в InvokeAI. Предыдущая модель `Project Canvas / Work Area = default generation/export bounds` и обязательный auto-expand при outpainting больше не действуют.

```text
Project Canvas = unbounded composition space
Primary Generation BBox = project-owned normal-generation x/y/width/height
Selected Smart Patch Layer / Bounding Box = layer-owned patch x/y/width/height
Raster Layer Transform = placement/scale/rotation of one layer
Export Bounds = finite rectangle resolved by an explicit export action
```

New Project создаёт primary generation bbox в x=0, y=0 с width/height из `Size` (по умолчанию 1024 × 1024) и открывает viewport в `Fit View` относительно bbox. Добавление Raster Layer в открытый Project не передвигает bbox автоматически; пользователь явно выбирает `Fit BBox to visible layers`, если хочет подогнать область под изображение.

В `Size` секции normal generation пользователь меняет width/height, aspect и fit-to-visible-layers **primary generation bbox**, а не размер Project Canvas. Numeric x/y находятся в bbox precision controls. Bbox можно свободно перемещать и изменять handles на canvas; positional snapping по умолчанию выключен, координаты могут быть отрицательными. Допустимые размеры generation request проверяются по ограничениям модели/worker, не по границам canvas. Выбор Smart Patch переключает target на его собственный layer-owned bbox и generation draft. Изменение primary bbox не меняет Smart Patch bbox или Raster Layers. Маска и bbox остаются разными сущностями; aspect lock — опциональный режим.

При enqueue normal generation использует frozen primary bbox; Smart Patch generation — frozen layer-owned bbox. После явного `Add N as Layers` normal candidates становятся новыми Raster Layers в координатах frozen bbox, даже вне прежнего изображения. Принятие не расширяет canvas, не сдвигает существующие слои и не меняет текущий primary bbox. Smart Patch outpainting и `Add N as Variants` тоже не требуют расширения canvas.

Project не показывает manual txt2img/img2img switch. При enqueue compositor анализирует visible raster/mask content inside frozen target area:

```text
fully transparent composite → txt2img
partially transparent composite → outpaint
opaque composite without effective mask → img2img
raster content + Smart Patch mask → inpaint
```

Наличие Raster Layer вне target area не включает img2img. Denoising Strength остаётся в Generation settings, но disabled with a clear reason when current target has no applicable raster input.

Правила:

- изменение primary bbox не должно неявно менять Smart Patch bbox или Raster Layers;
- изменение Smart Patch bbox не должно двигать primary bbox или Raster Layers;
- bounding box по умолчанию **не лочит aspect ratio**;
- `Lock aspect ratio` — опциональный режим;
- маска и bounding box являются разными сущностями и не должны путаться в UI;
- термин в интерфейсе оставляем **Bounding Box** и явно показываем владельца target: Project или выбранный Smart Patch;
- Raster Layers могут размещаться в любых project coordinates; вне конечного bbox они не теряются и не обрезаются.

`File > Export As` по умолчанию использует конечное объединение bounds видимого raster content, включая active visible Smart Patch variants. `Export Generation BBox` — отдельное действие. Если видимого raster content нет, image export недоступен, но `.igs` можно сохранить. Export не обрезает исходные layer assets; custom export rect откладывается.

Текущий Vue-прототип всё ещё использует конечный `Project Canvas` frame, изменяет его через `Size` и `Crop / Resize Project Canvas` и генерирует в этих границах. Это gap к принятой модели, а не готовая реализация бесконечного canvas/primary bbox.

### 14.2.1. Canvas rendering pipeline

Production-направление canvas строится по Invoke-like пайплайну:

```text
Konva scene graph
→ application canvas manager
→ entity adapters / layer lifecycle
→ compositor/cache
→ rasterized assets for worker/export
```

Konva используется как интерактивный 2D scene graph поверх browser Canvas 2D: stage, layers, groups, image/line/rect objects, pointer events, transforms и hit testing.

Текущий Vue-прототип намеренно не доказывает этот renderer: он использует deterministic DOM/CSS composition, CSS transforms и mock coverage metadata. В нём работают viewport pan/zoom, tool/context switching, layer visibility/order, staging preview и отдельные deterministic geometry transitions. Pixel painting, real alpha coverage, general bbox/crop handle manipulation, compositor/cache и rasterization отсутствуют. Поэтому выбор Konva здесь остаётся production architecture direction, а не описанием уже реализованного prototype pipeline.

Логика продукта не должна зависеть напрямую от Konva-нод. Состояние проекта хранится в собственных структурах ImageGen Studio: canvas project, layer stack, Smart Patch Layer, mask, bounding box, raster sub-layers, assets и accepted-result provenance.

Композиция, кэширование, rasterization для worker'а/export и lifecycle canvas-сущностей являются ответственностью приложения, а не Konva. Это позволяет позднее заменить или дополнить renderer без изменения доменной модели canvas.

В MVP не закладываем WebGPU как основной renderer. WebGL/WebGPU можно рассмотреть позже как отдельный backend для узких тяжёлых задач: tiled preview, фильтры, большие композиции, GPU mask operations.

### 14.3. Почему не standalone-маски

В InvokeAI inpaint mask может существовать как отдельная сущность: её можно включать, выключать и переключать видимость независимо от результата генерации.

Для ImageGen Studio в MVP такой подход не используется, потому что он создаёт неочевидные связи:

- какая маска относится к какому результату;
- была ли маска уже использована;
- что делать, если bounding box захватывает две маски;
- что значит отключение маски для уже созданного результата;
- что делать с масками, которые больше ни к чему не привязаны.

В MVP маска не является самостоятельным top-level layer object. Маска принадлежит конкретному Smart Patch Layer.

### 14.4. Ownership-модель

Smart Patch Layer владеет:

- собственной editable mask;
- собственным bounding box;
- собственным internal resolution внутри bounding box;
- набором raster sub-layers с результатами генерации;
- одним active raster sub-layer, который участвует в композиции canvas;
- layer-owned generation draft;
- immutable provenance каждого accepted raster sub-layer.

Это означает:

```text
маска не переиспользуется несколькими Smart Patch Layer'ами;
одна маска не может обслуживать несколько patch-слоёв;
один Smart Patch Layer не агрегирует несколько масок;
один Smart Patch Layer соответствует одной локальной patch-операции;
несколько raster sub-layers могут храниться внутри одного Smart Patch Layer;
одновременно видимым может быть только один raster sub-layer.
```

Если пользователю нужно сохранить альтернативное состояние маски/bounding box/internal resolution, он дублирует Smart Patch Layer.

### 14.4.1. Regional Guidance Layer

Помимо Smart Patch Layer в MVP есть **Regional Guidance Layer**.

Regional Guidance Layer нужен не для хранения сгенерированного raster-result, а для regional conditioning во время генерации. Regional text prompts входят в MVP для Illustrious и Anima. Regional reference images поддерживаются только для Illustrious/SDXL: выбранный Invoke-like Anima pipeline не предоставляет совместимый региональный image-adapter path.

```text
Regional Guidance Layer
= 1 owned region/mask
= optional positive prompt
= optional negative prompt
= N regional reference images (Illustrious/SDXL only)
```

В layer stack он отображается отдельной группой/секцией `Regional Guidance` и раскрывается inline:

```text
Regional Guidance
└─ Regional Guidance Layer
   ├─ + Prompt
   ├─ + Negative Prompt
   └─ + Reference Image
```

Текущий Vue-прототип показывает отдельную conditioning-секцию, постоянные
inline prompt/reference blocks, add/select/enable/delete, compatibility warning
и контекстный tool rail без bbox. Prompt и reference-image add/remove работают
в mock; reorder reference images, реальное редактирование mask на canvas и
worker conditioning ещё не реализованы.

Правила ownership:

- regional mask принадлежит конкретному Regional Guidance Layer;
- regional mask не является standalone layer;
- regional mask не переиспользуется Smart Patch Layer'ом;
- regional mask не переиспользуется другим Regional Guidance Layer;
- удаление Regional Guidance Layer удаляет его region/mask, prompts и reference image bindings из проекта;
- duplicate создаёт отдельный Regional Guidance Layer с копией region/mask, prompts и reference images.

Generic ControlNet/IP-Adapter layers в MVP не вводятся. Regional reference images являются частью Regional Guidance Layer, а не отдельным универсальным адаптерным workflow.

Invoke-style `auto-negative` — позитивный prompt региона как negative вне его
маски — исключён для обеих моделей. `Use global negative prompt` означает
наследование текущего общего negative prompt при фиксации Generate job, а не
этот режим. При выбранной Anima добавление regional reference image объясняет
несовместимость; job с включёнными несовместимыми reference inputs не попадает
в очередь. Regional Guidance не копируется ни в одну группу accepted-result
provenance, settings comparison или result-derived preset. Пространственная
семантика regional negative prompt у Anima требует проверки реальной генерацией
до заявления о поддержке.

ControlNet остаётся post-MVP follow-up. Первые сценарии, которые стоит рассмотреть после MVP: tiled upscale, pose control, depth control, Canny/контуры. Остальные виды ControlNet добавляются только при появлении реальной пользовательской необходимости.

### 14.4.2. Layer row controls

Raster Layers and Smart Patch Layers share one compositing `Layers` stack and can be reordered across types. Regional Guidance remains a separate conditioning section because it does not contribute ordinary raster pixels to the visual z-order.

Для Raster Layer, Smart Patch Layer и Regional Guidance Layer используется единый принцип строки слоя:

```text
visibility | thumbnail/preview | layer name + status | lock | actions menu
```

Решения:

- кнопка visibility находится слева от thumbnail/preview, как в Photoshop, а не справа как в Invoke;
- warning/status icons находятся рядом с именем/status area;
- Regional Guidance Layer сохраняет Invoke-like warning icon для compatibility/setup предупреждений;
- lock layers поддерживается;
- duplicate/delete и перемещение находятся в actions menu;
- правый action cluster не должен смешивать visibility с lock/actions;
- общие свойства выбранного слоя (blend для Raster, opacity для Raster/Regional display) находятся в компактной строке над стеком; отдельная карточка-инспектор под стеком не нужна;
- Raster, Smart Patch и Regional Guidance используют одну поверхность строки и одинаковые hover/selected states; региональные prompts/references и Smart Patch details постоянно видны внутри строки; выделение не меняет её высоту. Общий компонент строки получает состояние и команды через DI и не знает типов слоёв.

Для Smart Patch Layer используется расширенная строка:

```text
visibility | mask thumbnail | active raster thumbnail | layer name + status | switch variants | lock | actions menu
```

Решения:

- Smart Patch Layer показывает два thumbnails: active raster result и mask;
- первым идёт mask thumbnail, чтобы строка читалась как Photoshop-like masked layer;
- active raster thumbnail идёт вторым и показывает текущий видимый result;
- saved raster variants не раскрываются вертикальным списком под слоем по умолчанию;
- action `switch variants` использует понятную cycle/swap-style icon и открывает compact persistent variants browser; `GenerationResults` reserved for current staging session;
- если вариантов несколько, рядом с action можно показывать variant count.

### 14.4.3. Canvas side tools

В MVP canvas side tools не превращают ImageGen Studio в raster editor. Они обслуживают masks, regions и Smart Patch Bounding Box.

Всегда доступны:

```text
collapse left panel
Pan Tool
collapse right panel
```

`Pan Tool` — это navigation/inspection tool, а не отдельный Viewer mode.

Если выбран Smart Patch Layer, в контекстном canvas tool rail показываются:

```text
Transform Mask
Lasso
Polygon Lasso
Brush
Eraser
Bounding Box
Fit Patch BBox to Mask
```

`Transform Mask` двигает/масштабирует/вращает только layer-owned mask. Он не двигает active raster sub-layer и не меняет Bounding Box.

`Fit Patch BBox to Mask` подгоняет layer-owned Bounding Box выбранного Smart Patch Layer под bounds его layer-owned mask с учётом padding/blur и model grid size. Эта команда не является глобальной canvas toolbar action.

Если выбран Regional Guidance Layer, в контекстном canvas tool rail показываются:

```text
Transform Region
Lasso
Polygon Lasso
Brush
Eraser
```

У Regional Guidance Layer нет Bounding Box tool, потому что слой владеет region/mask для conditioning, а не generation bbox.

По той же причине для Regional Guidance Layer не показывается `Fit Patch BBox to Mask`.

Обычные Raster Layers в MVP не редактируются на canvas: без raster transform, crop, paint и filters. Для полноценного растрового редактирования пользователь использует внешний редактор вроде Photoshop/Krita.

### 14.5. Что входит в Smart Patch Layer

Предварительная структура:

```ts
type SmartPatchLayer = {
  id: string
  type: 'smart-patch'

  name: string
  visible: boolean
  opacity: number
  blendMode?: string

  maskAssetId: string

  generationDraft: PresetPayload

  rasterSubLayers: Array<{
    id: string
    name: string
    rasterAssetId: string
    provenance: GenerationProvenance
    sourceRevisionHash: string
    createdAt: string
  }>

  activeRasterSubLayerId: string | null

  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }

  internalResolution: {
    width: number
    height: number
  }

  status: 'empty' | 'ready' | 'outdated' | 'generating' | 'failed'

  createdAt: string
  updatedAt: string
}
```

Где:

- `maskAssetId` — текущая маска слоя;
- `rasterSubLayers` — сохранённые растровые результаты внутри Smart Patch Layer;
- `activeRasterSubLayerId` — единственный raster sub-layer, который участвует в композиции canvas;
- `boundingBox` — область canvas, которая подаётся в генерацию;
- `internalResolution` — разрешение, в котором содержимое bounding box обрабатывается worker'ом;
- `generationDraft` — layer-owned editable generation state, shown in the left editor when this Smart Patch is selected;
- `provenance` внутри raster sub-layer — immutable evidence конкретного accepted result;
- `status` — состояние слоя относительно результата генерации.

Важно: `rasterSubLayers` не являются полноценными ревизиями состояния Smart Patch Layer. Они хранят только альтернативные raster results. Состояние mask/bounding box/internal resolution общее и текущее для всего Smart Patch Layer.

### 14.6. Bounding box и internal resolution

Bounding box хранит координаты и размер области на canvas.

Internal resolution хранит разрешение, в котором эта область фактически подаётся в генерацию.

Это нужно для сценария, где пользователь совмещает inpainting/outpainting с downsampling/upscaling:

```text
bounding box на canvas: 1536x1536
internal generation resolution: 768x768
```

Обе величины сохраняются в Smart Patch Layer и в provenance accepted raster sub-layer.

### 14.7. Статусы Smart Patch Layer

Smart Patch Layer имеет простую state-модель:

```text
empty
ready
outdated
generating
failed
```

#### empty

Маска и bounding box созданы, но raster sub-layer ещё отсутствует.

#### ready

Есть active raster sub-layer, соответствующий текущей маске, bounding box, internal resolution и generation settings.

#### outdated

Пользователь изменил маску, bounding box, internal resolution или generation settings после последней генерации active raster sub-layer.

В этом состоянии текущий active raster sub-layer остаётся видимым, но UI показывает, что слой требует regenerate.

#### generating

Для слоя сейчас выполняется генерация.

#### failed

Последняя генерация слоя завершилась ошибкой.

### 14.8. Поведение при изменении слоя

Если у слоя уже есть active raster sub-layer, а пользователь меняет:

- маску;
- bounding box;
- internal resolution;
- prompt;
- negative prompt;
- модель;
- LoRA stack;
- sampler / steps / CFG / seed;

текущий active raster sub-layer не удаляется автоматически.

Вместо этого слой помечается как `outdated`.

Пользователь может:

- оставить старый активный результат;
- нажать `Regenerate`;
- продублировать слой и регенерировать копию.

### 14.9. Raster sub-layers

Smart Patch Layer может хранить несколько растровых подслоёв с результатами генерации.

Правила MVP:

- одновременно активным/видимым может быть только один raster sub-layer;
- включить два raster sub-layers одного Smart Patch Layer одновременно нельзя;
- переключение raster sub-layer меняет видимый результат слоя;
- каждый accepted raster sub-layer хранит собственный immutable generation provenance;
- mask, bounding box и internal resolution принадлежат Smart Patch Layer, а не отдельному raster sub-layer.

Это даёт возможность хранить несколько вариантов результата внутри одного Smart Patch Layer, но не превращает слой во внутреннюю систему ревизий всего состояния.

### 14.10. Regenerate

В MVP `Regenerate` для Smart Patch Layer использует **GenerationResults**, если генерация возвращает один или несколько results.

ImageGen Studio использует Invoke-like staging, расширенный multi-selection. Completed output остаётся temporary candidate и не становится project state автоматически.

```text
Worker completed results
↓
Temporary GenerationResults candidates
↓
Select one or more
↓
Add N as Variants
↓
Permanent raster sub-layer variants
```

Для Smart Patch Layer:

- focus chooses one candidate for canvas preview;
- checkbox selection chooses one or more candidates for acceptance;
- `Add N as Variants` creates only selected raster sub-layers;
- accepted anchor candidate becomes active;
- other accepted candidates and the previous active variant remain inactive;
- unselected candidates are discarded when staging closes.

Для обычной генерации на бесконечном Project Canvas `Add N as Layers` создаёт отдельный Raster Layer для каждого selected candidate в координатах frozen primary generation bbox. Accepted anchor candidate становится selected/visible, остальные accepted opaque alternatives начинают hidden. Existing layers never overwrite implicitly; границы документа не расширяются.

```text
Smart Patch Layer
├─ mask
├─ bounding box
├─ internal resolution
├─ generation settings
└─ raster sub-layers
   ├─ result 01
   ├─ result 02 ← active
   └─ result 03
```

После explicit acceptance:

- создаётся один или несколько raster sub-layers;
- `activeRasterSubLayerId` указывает на accepted anchor candidate;
- в каждый accepted raster sub-layer записывается immutable generation provenance;
- статус слоя становится `ready`, если active raster sub-layer соответствует текущим editable inputs.

Старые raster sub-layers остаются доступны для переключения, но одновременно может отображаться только один из них.

### 14.11. Duplicate layer вместо source mask snapshot

В MVP Smart Patch Layer не хранит отдельный source mask snapshot.

Если пользователю нужно сохранить предыдущее состояние маски/bounding box/internal resolution, он делает копию слоя:

```text
Smart Patch — face fix 01
Smart Patch — face fix 02 [hidden]
```

Дубликат является самостоятельным Smart Patch Layer со своей копией:

- маски;
- bounding box;
- internal resolution;
- raster sub-layers;
- active raster sub-layer;
- accepted-result provenance.

Пользователь может скрыть дубликат, переименовать его, изменить и регенерировать отдельно.

### 14.12. Что НЕ входит в MVP

В MVP не реализуются:

- полноценные внутренние ревизии состояния Smart Patch Layer;
- отдельный `sourceMask` внутри Smart Patch Layer;
- standalone mask layers как top-level сущности;
- переиспользование одной маски несколькими Smart Patch Layer'ами;
- bounding box, агрегирующий несколько масок;
- сложная композиция масок;
- одновременная видимость нескольких raster sub-layers внутри одного Smart Patch Layer;
- nested/grouped smart layers.

Эти возможности можно рассмотреть после MVP.

### 14.13. Потенциальное развитие после MVP

После MVP можно рассмотреть:

- полноценные внутренние ревизии состояния Smart Patch Layer;
- `Duplicate & Regenerate` как отдельное удобное действие;
- сохранение маски как reusable mask asset;
- создание нового Smart Patch Layer из маски существующего слоя;
- сравнение вариантов генерации;
- группировку Smart Patch Layer'ов;
- более сложные типы Smart Patch Layer'ов: control.

### 14.14. Пользовательский сценарий Smart Patch Layer

```text
Пользователь нажимает Add Smart Patch Layer
↓
Создаётся empty Smart Patch Layer со своими mask, bbox, internal resolution и generation draft
↓
Пользователь рисует маску и настраивает bounding box/internal resolution
↓
Редактирует layer-owned prompt/model/LoRA/parameters
↓
Нажимает Generate
↓
Python worker генерирует результат для bounding box
↓
GenerationResults показывает temporary candidates
↓
Пользователь фокусирует candidate и выбирает один или несколько checkbox'ами
↓
Add N as Variants
↓
Accepted anchor candidate становится active, остальные accepted variants — inactive
↓
В accepted variants записывается immutable generation provenance
```

Если пользователь хочет альтернативное состояние mask/bounding box/internal resolution:

```text
Duplicate Smart Patch Layer
↓
Изменить маску / bbox / параметры
↓
Regenerate duplicate
↓
Сравнить варианты через visibility/opacity/layer order
```

---

## 15. Предварительная модель данных для canvas

### 15.1. Назначение

Canvas-проект в MVP хранится как переносимый `.igs` project file. SQLite не является источником истины для canvas-проекта, слоёв и raster/mask assets.

`Uncategorized` является реальной app-managed папкой `ImageGen Studio/workspaces/Uncategorized/`. Новый проект без другого явно выбранного workspace создаётся в ней. Внешний `.igs` должен быть перемещён или скопирован в известный workspace до индексирования и открытия; виртуальные external-path entries не используются.

Import Project destination flow по умолчанию предлагает `Move`, позволяет явно выбрать `Copy` и использует ту же destination policy, что New Project: current concrete writable workspace или `Uncategorized`.

Home по умолчанию открывает `Projects`, а выбор workspace становится отдельным browse selection. `Move to Trash` помечает managed project как trashed и сохраняет возможность восстановления; окончательное удаление файла выполняется только отдельным `Delete Permanently` confirmation из Trash view.

Home `New Project` использует текущий concrete writable workspace, а из `Projects`, `Trash` или unavailable workspace — `Uncategorized`; остальные defaults — `No preset` и primary generation bbox `(0, 0, 1024 × 1024)` на бесконечном Canvas. Если выбран Text to Image preset, диалог клонирует его в detached editable initialization payload через общий `PresetPayloadEditor`: Size задаёт начальные размеры bbox, Seed исключён по умолчанию, missing resources предупреждают, но не блокируют создание.

SQLite может хранить только восстанавливаемый project index:

- путь к `.igs`;
- workspace id/path;
- display name;
- project thumbnail cache key/path and derived preview state;
- last opened time;
- modified time;
- normalized display name для поиска по имени;
- optional `trashed_at` для app-managed Trash;
- file health `ready`/`missing`/`corrupt`/`unsupported_schema`.

Project index можно пересобрать сканированием workspace-папок.

Runtime tab manager дополнительно держит in-memory registry открытых `.igs` identities. В MVP identity строится из нормализованного абсолютного пути к `.igs`. Если пользователь пытается открыть уже открытый project file из Home, file picker, menu action или другого entry point, приложение фокусирует существующую `Project` tab и не создаёт дубликат.

### 15.2. `.igs` package

```text
project.igs
├─ mimetype
├─ manifest.json
├─ project.json
├─ preview/
│  ├─ thumbnail.webp
│  └─ merged.png
├─ assets/
│  ├─ layers/
│  ├─ masks/
│  └─ references/
└─ provenance/
   └─ generation-*.json
```

`.igs` является ZIP-пакетом без обязательной compression. Обычный save собирает новый archive во временный файл, валидирует его и атомарно заменяет исходный `.igs`.

`preview/thumbnail.webp` и `preview/merged.png` внутри `.igs` являются переносимыми preview-артефактами проекта. Они являются source of truth для project preview.

`ImageGen Studio/previews/project-thumbnails/` может хранить только derived cache для быстрого отображения Home. Этот кэш можно удалить и пересобрать из `.igs`.

`project.json` хранит:

```text
canvas metadata
primary generation bbox x/y/width/height
layer stack
Smart Patch Layer state
mask references
raster asset references
generation settings
accepted-result provenance references
resource references
```

Модели, LoRA, VAE и другие большие reusable resources не встраиваются в `.igs` по умолчанию. Project file хранит ссылки и compatibility metadata: local resource id, file hash, CivitAI ids, base model family и `predictionType`.

Upscale storage is deferred with the feature. Future Upscale mode should not work with a live layer-stack reference; it should create an immutable flattened composite input inside `.igs`:

```text
assets/upscale-inputs/{id}.png
```

Metadata input'а хранит source layer stack hash, конечный source composite rect/dimensions, source project revision id или timestamp, visible layers metadata и created_at. Если source composite после этого изменился, Upscale показывает состояние `Source is outdated` и предлагает refresh. Для будущего handoff исходный rect определяется по bounds видимого raster content, а не по несуществующему `canvas size`.

Upscale result хранится как:

```text
assets/upscale-results/{id}.png
```

Future result can be added as a new raster layer or exported.

### 15.3. Autosave

Autosave не пересобирает полный `.igs` archive на каждое изменение. Во время работы приложение пишет dirty-части проекта в shadow project directory внутри app data:

```text
ImageGen Studio/
└─ autosave/
   └─ {project-id}/
      ├─ manifest.json
      ├─ project.json
      ├─ assets/
      ├─ provenance/
      └─ autosave-state.json
```

Правила:

- JSON state сохраняется с debounce, ориентировочно 500-1500 ms.
- Raster assets, masks и previews пишутся только по dirty-флагам.
- Shadow autosave не изменяет основной `.igs`; документное содержимое попадает
  туда только по явному Save. Отдельный explicit `Rebuild Preview` может
  атомарно заменить только preview/manifest чистого Project без изменения
  document revision.
- Нормальная shadow autosave activity не показывается на Home как статус проекта.
- После неожиданного завершения валидный незавершённый shadow state становится recovery candidate и показывается как `Recovery available`.
- После успешного обычного save autosave state помечается clean или удаляется.
- Graceful `Discard Changes` удаляет соответствующий shadow state.
- `Recover` открывает восстановленное состояние как dirty document без автоматической перезаписи основного `.igs`.
- `Discard Recovery and Open Saved` удаляет recovery candidate и открывает сохранённый `.igs`; `Cancel` не меняет ни одно состояние.
- Запись autosave-файлов выполняется через temp file + atomic rename.

### 15.4. Валидация

При открытии `.igs` приложение проверяет package signature, `schemaVersion`, runtime-схемы `manifest.json`/`project.json`, отсутствие опасных archive paths, наличие обязательных assets и допустимые размеры generation bboxes/layers/masks.

Повреждённый или несовместимый `.igs` должен давать понятную ошибку, а не частично открытый проект с неочевидным состоянием.

---

## 16. Python ML worker

### 16.1. Назначение

Python worker отвечает за model loading, conditioning, inference и создание
связанных image derivatives/previews. Основная бизнес-логика и владение
постоянными ресурсами остаются в TypeScript/main process.

Он не должен быть основным backend'ом приложения.

### 16.2. Ответственность worker'а

Python worker:

- загружает модели;
- держит модель в памяти;
- принимает active worker job из main-process queue;
- выполняет inference;
- создаёт image derivatives и thumbnails по типизированным заданиям main process;
- отдаёт progress;
- записывает output в назначенную staging-область и возвращает manifest результата;
- сообщает об ошибках.

### 16.3. Ответственность Electron main process

Electron main process:

- запускает worker;
- останавливает worker;
- перезапускает worker при падении;
- владеет SQLite-backed queue generation jobs;
- отправляет worker'у active job;
- читает stdout/stderr;
- нормализует ошибки;
- пересылает progress events в renderer;
- проверяет output manifest, владеет paths/cache и атомарно публикует worker
  output как temporary staging candidate или derived preview;
- управляет CivitAI preview download и source files, не передавая worker'у
  обязанности глобального resource manager.

Queue Manager следует InvokeAI-like модели:

- queue source of truth хранится в SQLite;
- job содержит frozen payload from Project/Smart Patch state;
- статусы: `pending`, `running`, `completed`, `failed`, `canceled`;
- один active worker job одновременно допустим для MVP;
- pending jobs могут накапливаться и выполняться по очереди;
- completed outputs появляются как temporary candidates в `GenerationResults`;
- only explicit multi-accept commits layers/variants, provenance and accepted-result history;
- queue status не участвует в undo/redo.

### 16.4. Worker должен быть долгоживущим

Worker не должен запускаться заново на каждую генерацию.

Правильная схема:

```text
app start
↓
start worker
↓
load model
↓
receive jobs
↓
generate
↓
keep worker alive
```

### 16.5. Python tooling

Python worker типизируется и проверяется с самого начала.

Решение MVP:

- BasedPyright — основной type checker и language server;
- Ruff — formatter и linter;
- `ty` можно запускать экспериментально, но не делать обязательным CI gate;
- mypy не является baseline-инструментом MVP.

Strict typing применяется к собственному worker/domain-коду: worker protocol DTO, parsing/validation generation jobs, model metadata, progress/error/result messages и application-level inference adapters.

Diffusers/PyTorch остаются за прагматичным adapter-слоем. Внутри adapter'а допустимы локальные `Any`, `cast(...)` или suppressions, если они не протекают в остальной worker-код. Проект не пишет stub-файлы для Diffusers/PyTorch заранее и не переписывает inference-механику ради чистоты типов.

Dependency workflow использует только `uv`: `pyproject.toml` описывает зависимости, `uv.lock` фиксирует точные версии, локальный `.venv` служит development environment. Poetry не используется, а ручная установка undeclared packages не считается частью проекта.

### 16.6. Python runtime lifecycle

ImageGen Studio поставляет или загружает собственный app-managed CPython. Worker запускается по абсолютному пути и никогда не выбирает `python`/`python3` из пользовательского `PATH`, системного каталога, Conda или случайно активированного `venv`.

Production runtime хранится в per-user app data отдельно от Electron executable, моделей и проектов. Каждая версия worker/runtime profile получает отдельный environment. Обновление, смена Python и Repair всегда создают новый staging runtime; активный environment не мутируется на месте.

```text
verified runtime bundle или managed Python + signed wheelhouse
↓
new versioned staging runtime
↓
dependency/backend/worker protocol self-test
↓
atomic active-runtime pointer replacement
↓
previous known-good runtime retained for rollback
```

Release client не разрешает произвольные версии из public indexes и не собирает `sdist` на машине пользователя. Первая release matrix — Linux × NVIDIA; runtime artifacts формируются и тестируются для поддерживаемых OS × architecture × device/runtime profiles, а не альтернативных inference engines. Минимальные driver/CUDA/VRAM требования устанавливаются packaging и реальными inference tests. Failed download/install/self-test оставляет предыдущий worker рабочим; повреждённый cache можно удалить независимо.

GPU driver, поддерживаемая ОС, filesystem permissions и hardware capability остаются внешними системными условиями. Их несовместимость диагностируется отдельно и не является поводом пробовать случайный системный Python.

Сторонние плагины не могут автоматически устанавливать packages в основной worker environment. Plugin isolation требует отдельного post-MVP architecture decision.

Подробный нормативный контракт: [Python Runtime And Dependency Management](./specs/07-python-runtime-management.md).

---

## 17. Основные пользовательские сценарии

### 17.1. Импорт модели с CivitAI

```text
Пользователь открывает Model Manager
↓
Нажимает Add from CivitAI URL
↓
Вставляет URL
↓
Приложение проверяет API token
↓
Приложение получает metadata
↓
Показывает preview модели
↓
Пользователь подтверждает скачивание
↓
Файл скачивается
↓
Файл проверяется
↓
Модель появляется в Model Manager
```

### 17.2. Генерация изображения

```text
Пользователь выбирает модель
↓
Вводит prompt
↓
Выбирает LoRA и параметры
↓
Нажимает Generate
↓
Main process derives txt2img/img2img/outpaint from visible target-area composite
↓
Main process creates frozen Queue Manager jobs
↓
Worker генерирует изображение
↓
GenerationResults показывает progress и temporary candidates
↓
Пользователь фокусирует candidates и выбирает один или несколько
↓
Нажимает Add N as Layers
↓
Selected candidates становятся independent Raster Layers in one undo step
↓
Each accepted layer receives immutable provenance and derived history entry
```

### 17.3. Создание пресета из генерации

```text
Пользователь открывает принятый результат из истории или layer details
↓
Нажимает Save preset from image
↓
Приложение копирует generation-configuration часть accepted-result provenance в editable preset
↓
Preset Manager показывает transient Draft без записи в БД
↓
Пользователь редактирует metadata, секции и generation values
↓
Нажимает Create Preset
↓
Приложение создаёт ID и сохраняет preset
```

Для Smart Patch этот flow намеренно не копирует mask, bbox, internal resolution,
compositing state или source revisions. Если нужен повторно используемый patch
контекст, пользователь дублирует слой.

### 17.4. Применение пресета частично

```text
Пользователь выбирает пресет в компактном Project / Generate selector
↓
Открывается Apply Preset с временной копией значений
↓
Пользователь редактирует application draft и выбирает секции для применения
↓
Приложение валидирует только выбранные секции
↓
Если выбранный resource отсутствует — показывает warning и блокирует Apply
↓
Если есть base family mismatch — показывает warning
↓
Пользователь нажимает Apply
↓
Выбранные значения применяются к текущей форме генерации, исходный preset не изменяется
```

### 17.5. Smart Patch Layer

```text
Пользователь открывает Project tab
↓
Создаёт Smart Patch Layer
↓
Рисует маску
↓
Настраивает bounding box и internal resolution
↓
Запускает генерацию
↓
Worker возвращает результат
↓
GenerationResults показывает temporary candidates
↓
Пользователь фокусирует и checkbox-selects один или несколько candidates
↓
Нажимает Add N as Variants
↓
Selected candidates получают raster sub-layers и provenance
↓
Accepted anchor candidate становится active; остальные accepted и предыдущий variant остаются inactive
↓
Слой получает статус ready
```

Если пользователь меняет маску, bounding box или настройки после генерации:

```text
Слой получает статус outdated
↓
Старый результат остаётся видимым
↓
Пользователь может нажать Regenerate, чтобы создать новый active raster sub-layer
```

Если нужно сохранить старую версию:

```text
Duplicate Smart Patch Layer
↓
Скрыть или переименовать копию
↓
Регенерировать другую версию отдельно
```

### 17.6. Upscale follow-up

Upscale is deferred to a separate Project feature/prototype pass. The following direction is retained for that future work but is not part of current Project acceptance criteria:

```text
Пользователь находится в Project tab / Generate mode
↓
Нажимает Send Composite to Upscale
↓
Приложение flatten'ит видимые слои текущего Project
↓
Создаёт immutable upscale input asset внутри .igs
↓
Сохраняет source layer stack hash и metadata источника
↓
Переключает Project в Upscale mode
↓
Пользователь запускает ESRGAN-like upscale
↓
Worker возвращает result
↓
Пользователь добавляет result как новый raster layer или экспортирует наружу
```

### 17.7. Отсутствующее изображение в истории

```text
Пользователь открывает историю
↓
Приложение видит запись в БД
↓
Файл изображения не найден
↓
UI показывает fallback "Изображение не найдено"
```

---

## 18. Риски MVP и принятые решения

### 18.1. Риск: переусложнение CivitAI-интеграции

Решение:

- только импорт по ссылке;
- только с API token;
- без поиска и marketplace-функций.

Статус: закрыто для MVP.

### 18.2. Риск: переусложнение пресетов

Решение:

- пресеты плоские;
- без наследования;
- без композиции;
- full/partial apply.

Статус: закрыто для MVP.

### 18.3. Риск: невозможность воспроизвести генерацию

Решение:

- для каждого accepted result сохраняется immutable generation provenance;
- discarded candidates do not enter result history;
- provenance supports read-only settings comparison, preset creation and
  missing-resource diagnostics; direct Recall is not part of the MVP comparison
  flow.

Статус: закрыто для MVP.

### 18.4. Риск: модель найдена, но версия другая

Решение:

- версия модели считается отдельным ресурсом;
- другая версия не считается валидной заменой.

Статус: закрыто для MVP.

### 18.5. Риск: отсутствующие модель/LoRA при применении пресета

Решение:

- при применении проверяются выбранные секции;
- missing resource для выбранной секции = hard error.

Статус: закрыто для MVP.

### 18.6. Риск: несовместимая base model family

Решение:

- при недостаточной metadata о совместимости LoRA/embedding показывать warning;
- заведомо неисполняемое сочетание model family и feature отклонять до
  enqueue с объяснением. Например, Anima regional reference images нельзя
  тихо игнорировать или отправлять worker'у. Точные правила для остальных
  сочетаний ресурсов задаёт Generate validation contract.

Статус: закрыто для MVP.

### 18.7. Риск: неверный prediction type модели

Некоторые checkpoint'ы обучены как `v_prediction`, а обычные Stable Diffusion checkpoint'ы чаще используют `epsilon`.

Если `v_prediction`-модель запустить как `epsilon`, генерация может дать неправильный контраст, мыло, пересветы или плохую сходимость.

Решение:

- хранить `predictionType` в metadata основной модели;
- передавать `predictionType` в Python worker вместе с generation job;
- сохранять фактический `predictionType` в immutable accepted-result provenance;
- если prediction type неизвестен, показывать пользователю compatibility warning и не маскировать это как художественную настройку.

Статус: закрыто для MVP.

### 18.8. Риск: изображение удалено вне приложения

Решение:

- показывать fallback "Изображение не найдено".

Статус: закрыто для MVP.

### 18.9. Риск: битые/неполные скачивания

Решение:

- скачивать во временный файл;
- проверять целостность;
- помечать модель installed только после успешной проверки.

Статус: закрыто для MVP.

### 18.10. Риск: ошибки CivitAI/API token

Решение:

- показывать token status/setup, import-preview error и failed install job рядом
  с соответствующим действием в Model Manager;
- toast использовать как дополнительный сигнал, не как единственную диагностику.

Статус: достаточно закрыто для MVP.

### 18.11. Риск: рассинхрон БД и sidecar/metadata

Решение:

- sidecar не делается;
- embedded metadata не делается;
- global history indexes accepted generated results in SQLite;
- project-local provenance belongs to accepted layers/variants inside `.igs`;
- temporary candidates remain outside project source of truth.

Статус: закрыто для MVP.

### 18.12. Риск: бесхозные маски и неочевидные связи mask/result

**Решение:** в MVP standalone-маски не используются как top-level слои.

Маска всегда принадлежит конкретному Smart Patch Layer.

```text
1 Smart Patch Layer = 1 mask = 1 bounding box = N raster sub-layers = 1 active/visible raster sub-layer
```

### 18.13. Риск: переусложнение smart patch layer'ов внутренними ревизиями

**Решение:** в MVP Smart Patch Layer может хранить несколько raster sub-layers, но не хранит полноценные внутренние ревизии всего состояния слоя и отдельный source mask snapshot.

Для сохранения альтернативного состояния mask/bounding box/internal resolution пользователь дублирует слой и при необходимости скрывает копию. Одновременно видимым внутри одного Smart Patch Layer может быть только один raster sub-layer.

---

## 19. Отложенные решения / после MVP

После MVP можно рассмотреть:

- sidecar JSON рядом с изображением;
- embedded metadata в PNG/WebP;
- импорт существующих локальных моделей по hash;
- поиск модели по hash через CivitAI;
- внутренний поиск по CivitAI;
- игнорирование конкретной версии обновления;
- export/import пресетов;
- resource status badges в каталоге пресетов;
- explicit `Recall Settings` / `Apply as Current` from provenance after the
  read-only comparison workflow is validated;
- более сложную compatibility matrix;
- composition presets;
- preset inheritance;
- variables in presets;
- experiment sessions;
- batch testing across models;
- ControlNet follow-up: tiled upscale, pose control, depth control, Canny/контуры;
- remote/headless mode;
- plugin API;
- более продвинутый workflow editor.

---

## 20. Предварительная структура проекта

```text
src/
├─ shared/
│  ├─ contracts/
│  │  ├─ generation.contract.ts
│  │  ├─ presets.contract.ts
│  │  ├─ models.contract.ts
│  │  ├─ history.contract.ts
│  │  └─ files.contract.ts
│  ├─ ipc/
│  │  ├─ channels.ts
│  │  ├─ api.types.ts
│  │  └─ errors.ts
│  └─ types/
│
├─ electron/
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ ipc/
│  │  │  ├─ register-model-handlers.ts
│  │  │  ├─ register-generation-handlers.ts
│  │  │  ├─ register-preset-handlers.ts
│  │  │  └─ register-history-handlers.ts
│  │  ├─ services/
│  │  │  ├─ model-library-service.ts
│  │  │  ├─ civitai-client.ts
│  │  │  ├─ download-manager.ts
│  │  │  ├─ generation-service.ts
│  │  │  ├─ preset-service.ts
│  │  │  ├─ history-service.ts
│  │  │  ├─ python-runtime-manager.ts
│  │  │  └─ worker-manager.ts
│  │  ├─ db/
│  │  │  ├─ db.ts
│  │  │  ├─ migrations.ts
│  │  │  └─ repositories/
│  │  └─ filesystem/
│  │
│  └─ preload/
│     └─ index.ts
│
├─ renderer/
│  ├─ app/
│  ├─ components/
│  ├─ features/
│  │  ├─ generation/
│  │  ├─ model-library/
│  │  ├─ presets/
│  │  └─ history/
│  ├─ stores/
│  └─ services/
│
└─ worker-python/
   ├─ pyproject.toml
   ├─ uv.lock
   ├─ .python-version
   ├─ src/
   │  └─ imagegen_worker/
   │     ├─ worker.py
   │     └─ protocol.py
   └─ tests/
```

---

## 21. MVP definition of done

MVP можно считать готовым, если пользователь может:

1. Указать CivitAI API token.
2. Импортировать модель по CivitAI URL.
3. Скачать модель и metadata.
4. Убедиться, что файл скачан корректно.
5. Увидеть доступную новую CivitAI-версию и preview её exact file до установки.
6. Установить несколько версий модели рядом и явно выбрать default для новых selections.
7. Убедиться, что update/default change не переписал exact version в существующих Projects, Presets и provenance.
8. Выбрать модель и точную установленную версию в UI.
9. Запустить генерацию изображения.
10. Увидеть completed output как temporary candidate без автоматического изменения Project.
11. Выбрать один или несколько candidates и добавить их как independent Raster Layers / Smart Patch variants.
12. Открыть историю принятых результатов и увидеть provenance их генерации.
13. Открыть одинаковый context-menu comparison для Raster или Smart Patch Layer и увидеть `Generated with` / `Current Canvas` без возможности применить старые настройки.
14. Создать пресет из генерации.
15. Создать пресет вручную.
16. Отредактировать пресет.
17. Применить пресет полностью.
18. Применить пресет частично.
19. Получить понятный warning и заблокированный Apply, если выбранный для применения resource отсутствует.
20. Получить warning, если base model family потенциально несовместима.
21. Увидеть fallback, если файл изображения отсутствует.
22. Организовывать `.igs` через Home: `Projects`, workspace'ы, app-managed `Trash`, поиск, Status filter и preview.
23. Создать новый проект с `No preset` или detached Text to Image preset payload и импортировать внешний `.igs` через явный Move/Copy в managed workspace.
24. Открывать несколько разных `.igs` в document tabs без создания дубликата одного и того же project file.

---

## 22. Ключевая продуктовая формула

Главное отличие проекта от конкурентов:

```text
Не просто UI для генерации изображений,
а инструмент для управления моделями, пресетами, версиями и воспроизводимыми творческими конфигурациями.
```

MVP должен доказать именно эту ценность.
