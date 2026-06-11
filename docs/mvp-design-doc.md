# ImageGen Studio — MVP Design Document

> Последнее обновление: документ перенесён в `docs/`, зафиксированы термины **Bounding Box** и **Smart Patch Layer**, а также правило `N raster sub-layers → 1 active/visible raster sub-layer` внутри одного Smart Patch Layer.

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

В сложных низкоуровневых механизмах — работа с моделями, compatibility metadata, очереди, worker protocol, canvas lifecycle, caching, compositing, generation pipeline — проект опирается на InvokeAI настолько, насколько это возможно в рамках выбранного стека. Если механизм InvokeAI не подходит, сначала ищем другое зрелое готовое решение или reference implementation, и только после этого проектируем своё.

Это не означает механическое копирование. Решения InvokeAI используются как проверенная отправная точка:

- берём подход как есть, если он хорошо ложится на ImageGen Studio;
- адаптируем, если наша модель данных или UX требуют другой формы;
- отказываемся или проектируем своё только если подход конфликтует с целями проекта, выбранным стеком, UX, бизнес-логикой или создаёт неочевидное состояние.

Основная идея приложения: не просто дать пользователю кнопку `Generate`, а помочь ему управлять творческим процессом:

- организовывать работы через `Home` screen с workspace'ами;
- открывать несколько `.igs` проектов одновременно, каждый в своей `Project` tab;
- хранить canvas-проекты как переносимые `.igs` project files;
- скачивать и обновлять модели;
- хранить версии моделей и LoRA;
- сохранять полные snapshot'ы генераций;
- переиспользовать настройки через развитую систему пресетов;
- применять пресеты целиком или частично;
- быстро находить старые удачные настройки и пробовать их с другими моделями.

Проект позиционируется как:

```text
Локальная ImageGen Studio для управления моделями, пресетами, генерациями и экспериментами.
```

Основная shell-модель — document-based editor:

- `Home` является обычной вкладкой со workspace'ами, recent projects, new/open project и доступом к Model Manager;
- `.igs` project file открывается как `Project` tab;
- `Project` tabs могут быть открыты одновременно;
- `Canvas` является рабочей поверхностью внутри `Project`, а не отдельной top-level вкладкой;
- внутри `Project` есть project modes `Generate` и `Upscale`;
- `Upscale` работает с immutable flattened composite input, созданным из текущего состояния `Generate`;
- один и тот же `.igs` нельзя открыть дважды: повторное открытие фокусирует уже существующую `Project` tab.

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
- Python используется только для ML/inference-слоя.
- Основная бизнес-логика приложения не должна жить в Python.

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
  ├─ generation history
  ├─ download manager
  ├─ Python worker manager
  └─ IPC handlers
Python ML Worker
  └─ PyTorch / diffusers / transformers / inference
```

### 3.2. Роль Electron main process

Electron main process в этом проекте выступает как локальный backend/application layer.

Это не отдельный HTTP-сервер, а системный слой приложения, отвечающий за:

- работу с SQLite;
- работу с файловой системой;
- управление Python worker'ом;
- скачивание моделей;
- проверку целостности файлов;
- хранение истории генераций;
- хранение пресетов;
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
  models: {
    importFromCivitaiUrl,
    checkUpdates,
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
    apply,
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
generation:enqueue
generation:cancel
history:getRecent
presets:create
presets:apply
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
7. Генерация изображений через Python ML worker.
8. Сохранение истории генераций.
9. Сохранение immutable generation snapshot для каждой генерации.
10. Плоские пресеты без наследования и композиции.
11. Создание пресета вручную.
12. Создание пресета из генерации.
13. Редактирование пресета.
14. Full apply пресета.
15. Partial apply пресета.
16. Проверка отсутствующих моделей/LoRA при применении выбранных секций.
17. Warning при несовместимости base model family.
18. Fallback-состояние, если файл изображения отсутствует.
19. Invoke-like persistent Queue Manager для generation/upscale jobs.
20. Project-local undo/redo для `.igs` document mutations.

### 7.2. Что НЕ входит в MVP

В MVP не входят:

- поиск моделей внутри CivitAI из приложения;
- полноценный marketplace/browser моделей;
- автоматическое обновление всех моделей;
- silent auto-update моделей;
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
Download manager скачивает файл во временный путь
↓
Приложение проверяет размер/hash файла
↓
После успешной проверки файл переносится в managed models directory
↓
В SQLite создаются записи Model / ModelVersion / LocalModelFile
```

### 8.3. Скачивание файлов

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

### 8.4. Ошибки CivitAI

На этапе MVP ошибки CivitAI показываются через стандартный toast.

Примеры:

```text
Не удалось скачать модель.
Не удалось получить данные модели.
CivitAI API token недействителен.
Файл модели недоступен.
```

Под каждый тип ошибки отдельный UX-сценарий в MVP не делается.

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

Если пресет или snapshot использует `Model A v1`, наличие `Model A v2` не считается наличием нужного ресурса.

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

Поэтому snapshot должен хранить не только ID, но и копии human-readable данных:

```ts
type ModelPredictionType = 'epsilon' | 'v_prediction' | 'sample'

type SnapshotModelRef = {
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

## 10. Generation Snapshot

### 10.1. Назначение

Generation snapshot — это полный неизменяемый слепок настроек, использованных при создании конкретного изображения.

В контексте canvas-проекта snapshot является project-local записью внутри `.igs`: он фиксирует, каким job'ом был создан конкретный raster layer или raster sub-layer, и ссылается на результат внутри того же project package.

Snapshot нужен для:

- воспроизводимости;
- восстановления настроек из истории;
- создания пресетов из старых генераций;
- диагностики отсутствующих моделей/LoRA;
- понимания, каким конфигом была создана картинка.

### 10.2. Snapshot не равен preset

Важно различать две сущности:

```text
GenerationSnapshot = исторический факт
Preset = редактируемый пользовательский шаблон
```

Snapshot:

- создаётся автоматически;
- привязан к конкретной генерации;
- immutable;
- не редактируется вручную;
- не меняется при изменении модели;
- не меняется при изменении пресета.

Preset:

- создаётся пользователем вручную или из snapshot'а;
- редактируется;
- имеет имя, описание, теги;
- применяется full/partial apply.

### 10.3. Где хранить snapshot

В рамках MVP есть два контекста хранения snapshot'ов:

- global generation history index хранится в SQLite;
- project-local generation snapshots, относящиеся к canvas-проекту, хранятся внутри `.igs`.

Sidecar JSON не делается.

Embedded metadata в изображении не делается.

Правило MVP:

```text
SQLite = источник истины для глобального индекса истории генераций.
.igs = источник истины для snapshot'ов внутри конкретного canvas-проекта.
```

### 10.4. Иммутабельность snapshot'а

Snapshot создаётся в момент успешной генерации и больше не изменяется.

Запрещено:

- изменять snapshot при редактировании пресета;
- изменять snapshot при обновлении модели;
- изменять snapshot при удалении модели;
- изменять snapshot при переименовании модели;
- изменять snapshot при partial apply.

### 10.5. Состав snapshot'а

Минимальный состав snapshot'а:

```ts
type GenerationSnapshot = {
  generationId: string
  createdAt: string
  appVersion: string
  workerVersion?: string
  engineName?: string
  engineVersion?: string
  workflowType: 'txt2img' | 'img2img' | 'inpaint'

  prompt: string
  negativePrompt?: string

  model: SnapshotModelRef

  loras: Array<{
    localResourceId?: string
    civitaiModelId?: number
    civitaiVersionId?: number
    name: string
    versionName?: string
    fileHash?: string
    baseModelFamily?: string
    weight: number
    triggerWords?: string[]
  }>

  params: {
    width: number
    height: number
    steps: number
    cfgScale?: number
    sampler?: string
    scheduler?: string
    seed?: number
    clipSkip?: number
    vae?: SnapshotModelRef
  }

  output: {
    imageId: string
    fileName: string
    filePath: string
    format: 'png' | 'jpg' | 'webp'
  }
}
```

---

## 11. Изображения и история генераций

### 11.1. Имена файлов

Сгенерированные изображения должны называться через UUID.

Пример:

```text
f0d7c7a0-2b92-4f2f-9f91-5e8f9f7a1c6b.png
```

### 11.2. Привязка к БД

В SQLite хранится:

- UUID изображения;
- путь к файлу;
- дата создания;
- snapshot генерации для global history, либо ссылка на project-local snapshot внутри `.igs`;
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

При создании из генерации snapshot копируется в editable preset-структуру.

Исходный snapshot при этом не меняется.

### 12.3. Редактирование пресета

Пользователь может редактировать:

- название;
- описание;
- теги;
- prompt;
- negative prompt;
- модель;
- LoRA stack;
- веса LoRA;
- resolution;
- sampler/steps/CFG;
- seed policy;
- другие параметры генерации.

### 12.4. Типы секций пресета

На MVP-уровне пресет может включать секции:

```text
Prompt
Negative prompt
Model
LoRA stack
Resolution
Sampler / steps / CFG
Seed
VAE
Other generation params
```

В UI `VAE` и VAE precision не становятся отдельной нижней панелью. Они находятся внутри `Generation -> Advanced Options` вместе с другими model-aware advanced generation params, например CFG rescale.

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
[x] Resolution
[ ] Sampler / steps / CFG
```

Валидация применяется только к выбранным секциям.

Если пользователь применяет только prompt, отсутствие модели/LoRA из пресета не должно блокировать применение.

### 12.7. Apply из старой генерации

Из старой генерации можно:

1. Применить настройки напрямую.
2. Создать новый пресет.

UI должен явно различать эти действия:

```text
Apply settings from image
Save preset from image
```

---

## 13. Валидация применения пресетов и snapshot'ов

### 13.1. Общий принцип

При применении пресета или snapshot'а проверяются только те секции, которые пользователь реально выбрал для применения.

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
Эта LoRA относится к SDXL, а выбранная модель относится к Flux. Результат может быть некорректным.
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
= N raster sub-layers
= 1 active/visible raster sub-layer
= 1 current generation snapshot
```

Smart Patch Layer является самодостаточным слоем, который хранит визуальные результаты и данные, необходимые для повторной генерации patch-области.

Зафиксированные решения по терминологии и поведению:

- слой называется **Smart Patch Layer**, потому что он покрывает не только inpainting, но и outpainting / локальное patch-редактирование;
- область генерации в UI называется именно **Bounding Box**, а не `Generation Box`, чтобы не путать её с `Mask`;
- внутри одного Smart Patch Layer может храниться несколько raster sub-layers;
- одновременно активным и видимым может быть только один raster sub-layer;
- включить два raster sub-layers одного Smart Patch Layer одновременно запрещено.

### 14.2. Canvas size и bounding box — разные интерфейсные сущности

В ImageGen Studio размер холста/изображения и bounding box локальной генерации не смешиваются в один инструмент.

```text
Canvas / Image Size
= размер проекта, холста, финальной композиции

Bounding Box
= область конкретного Smart Patch Layer, которая подаётся в генерацию
```

В UI это должны быть две разные секции:

```text
Project / Canvas Size
├─ canvas width
├─ canvas height
├─ resize canvas
├─ crop / extend canvas
└─ output/export size

Selected Smart Patch Layer / Bounding Box
├─ x / y
├─ width / height
├─ internal generation resolution
├─ lock aspect ratio
├─ fit to mask
├─ fit to canvas
└─ regenerate
```

В режиме `Project` / `Generate` также может существовать **current working bounding box**: временная рабочая область генерации до того, как пользователь создаёт или выбирает Smart Patch Layer. Это Invoke-like bbox для подготовки операции. После создания Smart Patch Layer эта область копируется в слой и становится уже layer-owned bounding box.

Правила:

- изменение `Canvas Size` не должно неявно менять bounding box слоя;
- изменение bounding box не должно менять размер canvas;
- bounding box по умолчанию **не лочит aspect ratio**;
- `Lock aspect ratio` — опциональный режим;
- маска и bounding box являются разными сущностями и не должны путаться в UI;
- термин в интерфейсе оставляем именно **Bounding Box**, а не `Generation Box`, чтобы явно отделять его от `Mask`.

### 14.2.1. Canvas rendering pipeline

В MVP canvas строится по Invoke-like пайплайну:

```text
Konva scene graph
→ application canvas manager
→ entity adapters / layer lifecycle
→ compositor/cache
→ rasterized assets for worker/export
```

Konva используется как интерактивный 2D scene graph поверх browser Canvas 2D: stage, layers, groups, image/line/rect objects, pointer events, transforms и hit testing.

Логика продукта не должна зависеть напрямую от Konva-нод. Состояние проекта хранится в собственных структурах ImageGen Studio: canvas project, layer stack, Smart Patch Layer, mask, bounding box, raster sub-layers, assets и generation snapshots.

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
- snapshot'ом настроек, использованных для генерации текущего активного результата.

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

Regional Guidance Layer нужен не для хранения сгенерированного raster-result, а для regional conditioning во время генерации. Он следует InvokeAI Regional Guidance model максимально близко:

```text
Regional Guidance Layer
= 1 owned region/mask
= optional positive prompt
= optional negative prompt
= N regional reference images
```

В layer stack он отображается отдельной группой/секцией `Regional Guidance` и раскрывается inline:

```text
Regional Guidance
└─ Regional Guidance Layer
   ├─ + Prompt
   ├─ + Negative Prompt
   └─ + Reference Image
```

Правила ownership:

- regional mask принадлежит конкретному Regional Guidance Layer;
- regional mask не является standalone layer;
- regional mask не переиспользуется Smart Patch Layer'ом;
- regional mask не переиспользуется другим Regional Guidance Layer;
- удаление Regional Guidance Layer удаляет его region/mask, prompts и reference image bindings из проекта;
- duplicate создаёт отдельный Regional Guidance Layer с копией region/mask, prompts и reference images.

Generic ControlNet/IP-Adapter layers в MVP не вводятся. Regional reference images являются частью Regional Guidance Layer, а не отдельным универсальным адаптерным workflow.

ControlNet остаётся post-MVP follow-up. Первые сценарии, которые стоит рассмотреть после MVP: tiled upscale, pose control, depth control, Canny/контуры. Остальные виды ControlNet добавляются только при появлении реальной пользовательской необходимости.

### 14.4.2. Layer row controls

Для Raster Layer, Smart Patch Layer и Regional Guidance Layer используется единый принцип строки слоя:

```text
visibility | thumbnail/preview | layer name + status | secondary actions | lock | delete
```

Решения:

- кнопка visibility находится слева от thumbnail/preview, как в Photoshop, а не справа как в Invoke;
- warning/status icons находятся рядом с именем/status area;
- Regional Guidance Layer сохраняет Invoke-like warning icon для compatibility/setup предупреждений;
- lock layers поддерживается;
- delete action поддерживается;
- правый action cluster не должен смешивать visibility с lock/delete.

Для Smart Patch Layer используется расширенная строка:

```text
visibility | active raster thumbnail | mask thumbnail | layer name + status | switch variants | lock | delete
```

Решения:

- Smart Patch Layer показывает два thumbnails: active raster result и mask;
- первым идёт active raster thumbnail, чтобы слой было проще найти по видимому результату на canvas;
- mask thumbnail идёт вторым и показывает область применения patch;
- saved raster variants не раскрываются вертикальным списком под слоем по умолчанию;
- action `switch variants` использует понятную cycle/swap-style icon и открывает `GenerationResults` или compact variants browser;
- если вариантов несколько, рядом с action можно показывать variant count.

### 14.4.3. Canvas side tools

В MVP canvas side tools не превращают ImageGen Studio в raster editor. Они обслуживают masks, regions и Smart Patch Bounding Box.

Всегда доступны:

```text
collapse left panel
View
collapse right panel
```

`View` — это navigation/inspection tool, а не отдельный Viewer mode.

Если выбран Smart Patch Layer, справа показываются:

```text
Transform Mask
Lasso
Polygon Lasso
Brush
Eraser
Bounding Box
```

`Transform Mask` двигает/масштабирует/вращает только layer-owned mask. Он не двигает active raster sub-layer и не меняет Bounding Box.

Если выбран Regional Guidance Layer, справа показываются:

```text
Transform Region
Lasso
Polygon Lasso
Brush
Eraser
```

У Regional Guidance Layer нет Bounding Box tool, потому что слой владеет region/mask для conditioning, а не generation bbox.

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

  rasterSubLayers: Array<{
    id: string
    name: string
    rasterAssetId: string
    generationSnapshot: GenerationSnapshot
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
- `generationSnapshot` внутри raster sub-layer — immutable snapshot настроек конкретного растрового результата;
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

Обе величины должны сохраняться в Smart Patch Layer и в generation snapshot активного raster sub-layer.

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
- каждый raster sub-layer хранит собственный immutable generation snapshot;
- mask, bounding box и internal resolution принадлежат Smart Patch Layer, а не отдельному raster sub-layer.

Это даёт возможность хранить несколько вариантов результата внутри одного Smart Patch Layer, но не превращает слой во внутреннюю систему ревизий всего состояния.

### 14.10. Regenerate

В MVP `Regenerate` для Smart Patch Layer использует **GenerationResults**, если генерация возвращает один или несколько results.

ImageGen Studio не использует философию временных preview results для completed results. Completed generation result сразу становится частью project state.

```text
Worker completed results
↓
Permanent raster sub-layer variants
↓
GenerationResults for review / active selection / cleanup
```

Для Smart Patch Layer:

- каждый completed result создаёт постоянный raster sub-layer;
- `GenerationResults` показывает свежесозданные variants;
- `Set Active` выбирает active raster sub-layer;
- `Delete Selected` удаляет соответствующий постоянный raster sub-layer;
- `Delete All Except Active` очищает лишние variants из текущего result set.

Для обычной генерации внутри общего bbox каждый completed result создаёт отдельный Raster Layer. `GenerationResults` позволяет быстро просмотреть новые Raster Layers, выбрать активный/видимый вариант и удалить ненужные.

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

После completed result:

- создаётся новый raster sub-layer;
- при `Set Active` `activeRasterSubLayerId` указывает на выбранный raster sub-layer;
- в raster sub-layer записывается новый immutable generation snapshot;
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
- generation snapshots.

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
Пользователь выбирает режим Smart Patch
↓
Рисует маску
↓
Настраивает bounding box
↓
Настраивает internal resolution
↓
Выбирает модель, LoRA и параметры генерации
↓
Нажимает Generate
↓
Создаётся Smart Patch Layer
↓
Python worker генерирует результат для bounding box
↓
Результат сохраняется как raster sub-layer
↓
В raster sub-layer записывается immutable generation snapshot
↓
Новый raster sub-layer становится active
↓
Слой появляется в layer stack
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

SQLite может хранить только восстанавливаемый project index:

- путь к `.igs`;
- workspace id/path;
- display name;
- project thumbnail cache key/path;
- last opened time;
- derived search fields;
- статус missing/corrupt.

Project index можно пересобрать сканированием workspace-папок.

Runtime tab manager дополнительно держит in-memory registry открытых `.igs` identities. В MVP identity строится из нормализованного абсолютного пути к `.igs`. Если пользователь пытается открыть уже открытый project file из Home, recent projects, file picker, menu action или другого entry point, приложение фокусирует существующую `Project` tab и не создаёт дубликат.

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
│  ├─ upscale-inputs/
│  ├─ upscale-results/
│  └─ references/
└─ snapshots/
   └─ generation-*.json
```

`.igs` является ZIP-пакетом без обязательной compression. Обычный save собирает новый archive во временный файл, валидирует его и атомарно заменяет исходный `.igs`.

`preview/thumbnail.webp` и `preview/merged.png` внутри `.igs` являются переносимыми preview-артефактами проекта. Они являются source of truth для project preview.

`ImageGen Studio/previews/project-thumbnails/` может хранить только derived cache для быстрого отображения `Workspaces`. Этот кэш можно удалить и пересобрать из `.igs`.

`project.json` хранит:

```text
canvas metadata
canvas size
layer stack
Smart Patch Layer state
mask references
raster asset references
upscale input/result asset references
generation settings
project-local snapshots
resource references
```

Модели, LoRA, VAE и другие большие reusable resources не встраиваются в `.igs` по умолчанию. Project file хранит ссылки и compatibility metadata: local resource id, file hash, CivitAI ids, base model family и `predictionType`.

Upscale mode не работает с живой ссылкой на слои. Команды `Send Composite to Upscale` и `Use Current Composite` создают immutable flattened composite input внутри `.igs`:

```text
assets/upscale-inputs/{id}.png
```

Metadata input'а хранит source layer stack hash, source canvas size, source project snapshot id или timestamp, visible layers metadata и created_at. Если source composite после этого изменился, Upscale показывает состояние `Source is outdated` и предлагает refresh.

Upscale result хранится как:

```text
assets/upscale-results/{id}.png
```

В MVP результат можно добавить как новый raster layer или экспортировать.

### 15.3. Autosave

Autosave не пересобирает полный `.igs` archive на каждое изменение. Во время работы приложение пишет dirty-части проекта в shadow project directory внутри app data:

```text
ImageGen Studio/
└─ autosave/
   └─ {project-id}/
      ├─ manifest.json
      ├─ project.json
      ├─ assets/
      ├─ snapshots/
      └─ autosave-state.json
```

Правила:

- JSON state сохраняется с debounce, ориентировочно 500-1500 ms.
- Raster assets, masks и previews пишутся только по dirty-флагам.
- Autosave не изменяет основной `.igs` до явного save или scheduled safe save.
- После краша приложение предлагает восстановление из autosave.
- После успешного обычного save autosave state помечается clean или удаляется.
- Запись autosave-файлов выполняется через temp file + atomic rename.

### 15.4. Валидация

При открытии `.igs` приложение проверяет package signature, `schemaVersion`, runtime-схемы `manifest.json`/`project.json`, отсутствие опасных archive paths, наличие обязательных assets и допустимые размеры canvas/layers/masks.

Повреждённый или несовместимый `.igs` должен давать понятную ошибку, а не частично открытый проект с неочевидным состоянием.

---

## 16. Python ML worker

### 16.1. Назначение

Python worker отвечает только за ML/inference.

Он не должен быть основным backend'ом приложения.

### 16.2. Ответственность worker'а

Python worker:

- загружает модели;
- держит модель в памяти;
- принимает active worker job из main-process queue;
- выполняет inference;
- отдаёт progress;
- сохраняет output image или возвращает путь;
- сообщает об ошибках.

### 16.3. Ответственность Electron main process

Electron main process:

- запускает worker;
- останавливает worker;
- перезапускает worker при падении;
- владеет SQLite-backed queue generation/upscale jobs;
- отправляет worker'у active job;
- читает stdout/stderr;
- нормализует ошибки;
- пересылает progress events в renderer;
- сохраняет результат в `.igs`/SQLite согласно политике queue item.

Queue Manager следует InvokeAI-like модели:

- queue source of truth хранится в SQLite;
- job создаётся из frozen project/generation snapshot;
- статусы: `pending`, `running`, `completed`, `failed`, `canceled`;
- один active worker job одновременно допустим для MVP;
- pending jobs могут накапливаться и выполняться по очереди;
- completed results commit'ятся в `.igs` и появляются в `GenerationResults`;
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

---

## 17. Основные пользовательские сценарии

### 17.1. Импорт модели с CivitAI

```text
Пользователь открывает Model Library
↓
Нажимает Import from CivitAI
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
Модель появляется в библиотеке
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
Main process отправляет job в Python worker
↓
Worker генерирует изображение
↓
UI показывает progress
↓
Изображение сохраняется с UUID-именем
↓
В SQLite сохраняется generation snapshot
↓
Картинка появляется в истории
```

### 17.3. Создание пресета из генерации

```text
Пользователь открывает изображение из истории
↓
Нажимает Save preset from image
↓
Приложение копирует snapshot в editable preset
↓
Пользователь задаёт имя, теги, описание
↓
Сохраняет пресет
```

### 17.4. Применение пресета частично

```text
Пользователь открывает Preset Catalog
↓
Выбирает пресет
↓
Нажимает Apply
↓
Выбирает секции для применения
↓
Приложение валидирует только выбранные секции
↓
Если ресурсов нет — показывает ошибку
↓
Если есть base family mismatch — показывает warning
↓
Пользователь подтверждает
↓
Настройки применяются к текущей форме генерации
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
Completed result автоматически сохраняется как raster sub-layer
↓
GenerationResults показывает новые variants
↓
Пользователь выбирает active variant через Set Active
↓
Пользователь удаляет ненужные variants, если нужно
↓
В raster sub-layer записывается generation snapshot
↓
Новый raster sub-layer становится active
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

### 17.6. Send Composite to Upscale

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

- сохраняется полный immutable generation snapshot.

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

- показывать warning;
- не блокировать пользователя.

Статус: закрыто для MVP.

### 18.7. Риск: неверный prediction type модели

Некоторые checkpoint'ы обучены как `v_prediction`, а обычные Stable Diffusion checkpoint'ы чаще используют `epsilon`.

Если `v_prediction`-модель запустить как `epsilon`, генерация может дать неправильный контраст, мыло, пересветы или плохую сходимость.

Решение:

- хранить `predictionType` в metadata основной модели;
- передавать `predictionType` в Python worker вместе с generation job;
- сохранять фактический `predictionType` в immutable generation snapshot;
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

- показывать стандартную ошибку через toast;
- отдельную UX-логику не делать в MVP.

Статус: достаточно закрыто для MVP.

### 18.11. Риск: рассинхрон БД и sidecar/metadata

Решение:

- sidecar не делается;
- embedded metadata не делается;
- global history index хранится в SQLite;
- project-local canvas snapshots хранятся внутри `.igs`.

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
- обновление моделей в один клик;
- проверку обновлений при запуске;
- управление несколькими версиями модели;
- откат на старую версию;
- игнорирование конкретной версии обновления;
- export/import пресетов;
- resource status badges в каталоге пресетов;
- удаление модели с проверкой usage;
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
   ├─ worker.py
   ├─ protocol.py
   └─ requirements.txt
```

---

## 21. MVP definition of done

MVP можно считать готовым, если пользователь может:

1. Указать CivitAI API token.
2. Импортировать модель по CivitAI URL.
3. Скачать модель и metadata.
4. Убедиться, что файл скачан корректно.
5. Выбрать модель в UI.
6. Запустить генерацию изображения.
7. Получить изображение в истории.
8. Открыть историю генераций.
9. Увидеть snapshot настроек генерации.
10. Создать пресет из генерации.
11. Создать пресет вручную.
12. Отредактировать пресет.
13. Применить пресет полностью.
14. Применить пресет частично.
15. Получить ошибку, если выбранный для применения ресурс отсутствует.
16. Получить warning, если base model family потенциально несовместима.
17. Увидеть fallback, если файл изображения отсутствует.

---

## 22. Ключевая продуктовая формула

Главное отличие проекта от конкурентов:

```text
Не просто UI для генерации изображений,
а инструмент для управления моделями, пресетами, версиями и воспроизводимыми творческими конфигурациями.
```

MVP должен доказать именно эту ценность.
