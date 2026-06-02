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
- регистрацию IPC handlers;
- отправку событий во frontend.

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

В рамках MVP snapshot хранится только в SQLite.

Sidecar JSON не делается.

Embedded metadata в изображении не делается.

Правило MVP:

```text
SQLite = единственный источник истины для истории генераций и snapshot'ов.
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
- snapshot генерации;
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

В MVP `Regenerate` создаёт новый raster sub-layer внутри Smart Patch Layer и делает его активным.

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

После успешной генерации:

- создаётся новый raster sub-layer;
- `activeRasterSubLayerId` указывает на новый raster sub-layer;
- в raster sub-layer записывается новый immutable generation snapshot;
- статус слоя становится `ready`.

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
- более сложные типы Smart Patch Layer'ов: control, regional guidance.

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

Эта схема описывает минимальные SQLite-таблицы, нужные для хранения canvas-проектов, слоёв и raster/mask assets в MVP.

### 15.2. Таблицы

#### canvas_projects

```text
id
name
width
height
created_at
updated_at
metadata_json
```

#### canvas_layers

```text
id
project_id
type
name
visible
opacity
blend_mode
order_index
layer_json
created_at
updated_at
```

Для `Smart Patch Layer` поле `layer_json` хранит:

```text
mask_asset_id
raster_sub_layers_json
active_raster_sub_layer_id
bounding_box_json
internal_resolution_json
status
```

Каждый элемент `raster_sub_layers_json` хранит:

```text
id
name
raster_asset_id
generation_snapshot_json
created_at
```

#### canvas_assets

```text
id
project_id
asset_type
file_name
file_path
mime_type
width
height
metadata_json
created_at
updated_at
```

`canvas_assets` используется для хранения растровых результатов слоёв и масок.

---

## 16. Python ML worker

### 16.1. Назначение

Python worker отвечает только за ML/inference.

Он не должен быть основным backend'ом приложения.

### 16.2. Ответственность worker'а

Python worker:

- загружает модели;
- держит модель в памяти;
- принимает generation job;
- выполняет inference;
- отдаёт progress;
- сохраняет output image или возвращает путь;
- сообщает об ошибках.

### 16.3. Ответственность Electron main process

Electron main process:

- запускает worker;
- останавливает worker;
- перезапускает worker при падении;
- отправляет jobs;
- читает stdout/stderr;
- нормализует ошибки;
- пересылает progress events в renderer;
- сохраняет результат в SQLite.

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
Пользователь открывает canvas
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
Результат сохраняется как raster sub-layer
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

### 17.6. Отсутствующее изображение в истории

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
- snapshot хранится только в SQLite.

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
