# Data And Storage

## Продуктовая граница

ImageGen Studio остаётся однопользовательским desktop-приложением и в MVP, и после MVP.

Проект не планирует развиваться в сторону:

- server mode как основного режима работы;
- multi-user collaboration;
- hosted backend;
- tenant/user management;
- remote shared database.

Это важное ограничение влияет на выбор persistence-слоя: локальная embedded database предпочтительнее клиент-серверной БД.

## Источники истины

SQLite — источник истины для:

- installed resources;
- глобального индекса generation history/recent projects;
- Queue Manager runtime/history records: queue items, batches, status, progress, errors and serialized worker job payloads;
- presets;
- references на файлы изображений, масок и моделей.

Project file `.igs` — источник истины для конкретного canvas-проекта:

- canvas document metadata;
- canvas size and color/profile metadata;
- layer stack;
- raster layer assets;
- masks;
- generation settings and immutable generation snapshots, относящиеся к этому проекту;
- references на модели, LoRA, VAE и другие внешние ресурсы.

SQLite не хранит сам canvas project и его слои как основной документ. Для проектов SQLite может хранить только индексируемые и восстанавливаемые поля: путь к `.igs`, workspace id/path, project thumbnail cache key/path, last opened time, display name, derived search fields, статус missing/corrupt и похожую служебную информацию.

Queue rows are not project source of truth. They describe runtime/history state for jobs that may read from or commit into `.igs`. Completed queue rows can be pruned without deleting committed project results.

Файловая система хранит тяжёлые артефакты:

- checkpoint / LoRA / VAE / ControlNet files;
- generated images;
- `.igs` project files;
- workspace directories;
- derived thumbnail/cache previews;
- autosave shadow directories;
- temporary exports/downloads.

Sidecar JSON рядом с пользовательскими изображениями и embedded metadata не входят в MVP. Project metadata хранится внутри `.igs`.

## Workspaces и `.igs` project files

Workspace — обычная папка на диске. В MVP workspace не может быть вложенным workspace'ом: приложение сканирует только прямые `.igs` файлы в выбранной папке, а вложенные папки и файлы других форматов игнорирует.

Всегда существует дефолтный workspace `Uncategorized`. Пользователь может перемещать `.igs` project files между workspace'ами. Проект не может существовать вне workspace в пользовательской модели, но физически `.igs` остаётся обычным переносимым файлом.

`.igs` — переносимый рабочий формат ImageGen Studio. Базовый формат для MVP:

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

Формат `.igs` проектируется как ZIP-пакет без обязательной compression. Обычный save может собирать новый archive во временный файл, валидировать его и затем атомарно заменять старый `.igs`.

Модели, LoRA, VAE и другие большие reusable resources не встраиваются в `.igs` по умолчанию. Project file хранит ссылки и compatibility metadata: local resource id, file hash, CivitAI ids, base model family, `predictionType`, display name/version и отсутствующий-resource status после проверки.

`preview/thumbnail.webp` и `preview/merged.png` внутри `.igs` являются переносимыми preview-артефактами проекта. Они едут вместе с project file и являются источником истины для project preview.

`ImageGen Studio/previews/project-thumbnails/` используется только как derived cache для быстрого отображения вкладки `Workspaces`. Этот кэш можно удалить и пересобрать из `.igs`. Если cache preview отсутствует или устарел, приложение читает `preview/thumbnail.webp` из `.igs` и обновляет cache entry.

### Generation snapshots

Generation snapshot — immutable запись о конкретной генерации: какие настройки, ресурсы, входные изображения/маски и технические параметры привели к конкретному результату.

Project-local generation snapshots хранятся внутри `.igs` и относятся к конкретному canvas-проекту. Обычно snapshot связан с raster layer или raster sub-layer и содержит:

- prompt / negative prompt;
- seed;
- sampler, scheduler, steps, CFG and size;
- model, LoRA, VAE references and compatibility metadata;
- фактический `predictionType`;
- input image, mask, bounding box and internal resolution для img2img/inpaint;
- reference на результат внутри `.igs`;
- created_at и worker/runtime metadata, нужные для воспроизводимости.

SQLite может хранить только global history/project index для быстрых списков и поиска: project path, snapshot id, created_at, thumbnail/cache key и derived metadata. Source of truth для project-local snapshot остаётся `.igs`.

### Upscale assets

Upscale внутри `Project` работает не с живой ссылкой на слои, а с immutable flattened composite input.

При команде `Send Composite to Upscale` или `Use Current Composite` приложение создаёт внутри `.igs` отдельный upscale input asset:

```text
assets/upscale-inputs/{id}.png
```

Metadata input'а хранит:

- source layer stack hash;
- source canvas size;
- source project snapshot id или timestamp;
- visible layers metadata;
- created_at;
- исходный project mode/action, который создал input.

Если после создания input'а слой, маска, opacity, blend mode или canvas size изменились, input считается устаревшим относительно текущего Generate composite. Upscale mode должен показывать `Source is outdated` и предлагать refresh.

Upscale result хранится как отдельный asset:

```text
assets/upscale-results/{id}.png
```

В MVP результат можно:

- добавить в Project как новый raster layer;
- экспортировать наружу.

Destructive replace source/composite не входит в MVP.

### Project identity

Для runtime tab management каждый открытый `.igs` должен иметь стабильную identity.

MVP-правило:

- canonical project identity строится из нормализованного абсолютного пути к `.igs`;
- приложение держит in-memory registry открытых project identities;
- при попытке открыть `.igs`, identity которого уже есть в registry, приложение фокусирует существующую `Project` tab;
- создание второй вкладки для того же `.igs` запрещено для всех entry points: `Home`, recent projects, file picker, menu action, drag/drop, deep link.
- приложение запускается в single-instance режиме через Electron main process, чтобы второй OS-инстанс не мог открыть тот же `.igs` параллельно с первым.

Если позже понадобится поддержка symlink-heavy workflow или network paths, identity policy можно расширить через filesystem inode/file id там, где платформа это поддерживает. Для MVP достаточно canonical path + rescan/relink поведения.

### Валидация `.igs`

При открытии `.igs` приложение должно:

- проверить, что файл является корректным project package ImageGen Studio;
- проверить `schemaVersion`;
- валидировать `manifest.json` и `project.json` через runtime schema;
- запретить опасные archive paths вроде `../` и абсолютных путей;
- проверить наличие обязательных assets, referenced layers, masks и previews;
- проверить допустимые размеры canvas/layers/masks;
- показать понятную ошибку, если файл повреждён, не поддерживается или создан более новой версией приложения.

Изменения формата проходят через явные schema migrations. Старый `.igs` нельзя молча пересохранять в новой схеме без успешной миграции и атомарного save.

## Autosave для `.igs`

Autosave не должен часто пересобирать полный `.igs` archive. Базовое решение MVP:

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

Во время работы приложение пишет изменённые части проекта в shadow project directory внутри app data. Это recovery/cache слой, а не пользовательский project file.

Правила autosave:

- JSON state сохраняется с debounce, ориентировочно 500-1500 ms.
- Raster assets, masks и previews пишутся только по dirty-флагам.
- Autosave не изменяет основной `.igs` до явного save или scheduled safe save.
- При запуске приложение проверяет незавершённые autosave directories и предлагает восстановление.
- После успешного обычного save autosave state для проекта помечается clean или удаляется.
- Запись autosave-файлов выполняется через temp file + atomic rename.
- Main `.igs` save выполняется отдельно: собрать archive во временный файл, провалидировать, затем атомарно заменить исходный project file.

Такой подход сохраняет переносимость `.igs`, но не превращает каждое изменение canvas в перепаковку всего project archive.

## Типизированный доступ к SQLite

Предпочтительный вариант для MVP:

```text
Kysely + SqliteDialect + better-sqlite3 + kysely-codegen
```

Причины:

- Kysely уже знаком по рабочему опыту с PostgreSQL.
- Kysely официально поддерживает SQLite dialect.
- `better-sqlite3` хорошо подходит для embedded SQLite в Node/Electron main process.
- `kysely-codegen` входит в MVP как способ получить типы из реальной SQLite-схемы и отдельно проверить пригодность инструмента для будущего использования в `work-project`.
- Query builder сохраняет SQL-like модель мышления без тяжёлого ORM-слоя.
- SQL migrations являются источником истины для схемы БД, а `DatabaseSchema` генерируется из SQLite после применения миграций.

Правило архитектуры:

```text
Renderer → typed window.api → Electron main process → repositories/services → Kysely → SQLite
```

Renderer, preload и Python worker не должны открывать SQLite напрямую.

### Практические правила

- Создавать один основной `Kysely<DatabaseSchema>` instance в main process.
- Включать `PRAGMA foreign_keys = ON`.
- Использовать WAL mode для нормальной локальной конкурентности чтения/записи.
- Создавать SQLite-таблицы в `STRICT` mode по умолчанию.
- Все записи выполнять через main-process services/repositories.
- Не хранить большие бинарные данные в SQLite.
- JSON snapshot'ы хранить как immutable `TEXT`/JSON payload, а поля для поиска и фильтров нормализовать отдельно.
- Для raw SQL использовать Kysely `sql` template только точечно и с типизированной обёрткой на уровне repository.

### SQLite STRICT tables

Все новые таблицы приложения должны создаваться как `STRICT`, если нет явно зафиксированной причины не делать этого.

Пример:

```sql
CREATE TABLE generation_images (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
```

Причины:

- SQLite по умолчанию использует гибкую type affinity модель.
- `STRICT` tables дают runtime enforcement объявленных типов.
- Это лучше соответствует TypeScript/Kysely-модели, где схема должна быть предсказуемой.

Исключения из `STRICT` допускаются только через отдельное архитектурное решение в docs/ADR или рядом с миграцией. Для JSON payload'ов `STRICT` не мешает: они хранятся как `TEXT`, а структура валидируется отдельно через runtime-схемы.

### DatabaseSchema / kysely-codegen policy

Для MVP `DatabaseSchema` генерируется через `kysely-codegen`:

```text
src/electron/main/db/database.types.ts
```

Предварительный workflow:

```text
run migrations against local app.sqlite or temp schema db
↓
run kysely-codegen
↓
write src/electron/main/db/database.types.ts
↓
use new Kysely<DatabaseSchema>(...)
```

Правила:

- миграции остаются источником фактической SQL-схемы;
- generated `database.types.ts` не редактируется вручную;
- изменение миграции должно сопровождаться обновлением generated DB types;
- если `kysely-codegen` выводит слишком широкий тип для JSON/TEXT payload, уточнение делается на уровне repository mapper или отдельного domain type, а не ручной правкой generated-файла;
- для нестабильных JSON payload'ов использовать `unknown` на DB-слое и валидировать в service/repository mapper;
- если инструмент окажется неудобным для SQLite/Electron, fallback-план — ручной `DatabaseSchema` по паттерну `work-project`, но это не основной путь MVP.

InvokeAI не является образцом для типизированного SQL-доступа: в Python backend он использует raw `sqlite3`, ручные SQL-запросы и Pydantic DTO/validators после чтения из БД. Для ImageGen Studio TypeScript + Kysely даёт более строгую compile-time проверку запросов.

## Storage-модель пресетов

Для MVP пресеты хранятся гибридно:

```text
строгие SQLite-колонки для каталога и применимости
+
typed JSON payload для настроек генерации
```

### Таблица presets

Предварительная форма:

```sql
CREATE TABLE presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
```

`workflow_type` — категория применимости пресета, а не параметр генерации.

`tags_json` and `favorite` are catalog metadata used for browsing and filtering. They do not belong in `PresetPayload`, because they do not change generation behavior. `tags_json` is validated as a string array at the storage boundary.

На MVP-уровне допустимые значения:

```text
txt2img
img2img
inpaint
```

Смысл:

- `txt2img` — пресет применим к генерации с нуля;
- `img2img` — пресет применим к image-to-image сценарию;
- `inpaint` — пресет применим к inpaint/local edit сценарию.

UI может использовать `workflow_type`, чтобы показывать релевантные пресеты в текущем режиме и не применять inpaint-пресет к txt2img форме без явного выбора пользователя.

### PresetPayload

`payload_json` содержит настройки генерации как версионированный payload.

Предварительная TypeScript-форма:

```ts
type ModelPredictionType = 'epsilon' | 'v_prediction' | 'sample'

type PresetPayload = {
  schemaVersion: 1
  prompt?: string
  negativePrompt?: string
  model?: PresetResourceRef
  loras?: Array<{
    resource: PresetResourceRef
    weight: number
    enabled: boolean
    triggerWords?: string[]
  }>
  embeddings?: PresetResourceRef[]
  vae?: PresetResourceRef
  params?: {
    width?: number
    height?: number
    sampler?: string
    scheduler?: string
    steps?: number
    cfgScale?: number
    denoisingStrength?: number
    seedPolicy?: 'random' | 'fixed' | 'reuse'
    seed?: number
  }
}

type PresetResourceRef = {
  localResourceId?: string
  civitaiModelId?: number
  civitaiVersionId?: number
  fileHash?: string
  name?: string
  versionName?: string
  baseModelFamily?: string
  predictionType?: ModelPredictionType
}
```

Правила:

- `payload_json` валидируется runtime-схемой при чтении и записи.
- Source of truth для model/LoRA/embedding/VAE настроек находится внутри `PresetPayload`.
- Section inclusion is represented by field presence. An absent field or group is not part of the preset and must not be applied. A second `includedSections` list is not stored, because it would duplicate the payload structure and could drift from it.
- Partial apply may use an ephemeral `selectedSections` mask inside an in-memory application draft. This mask controls which cloned payload fields are copied into the current project, is validated only for the duration of Apply, and is never serialized into `payload_json` or another preset column.
- `predictionType` хранит scheduler prediction mode модели. Это compatibility metadata, а не user-facing style setting.
- Для `v_prediction`-моделей generation worker должен получить `v_prediction`; запуск такой модели как `epsilon` считается несовместимой конфигурацией.
- `has_loras`, `primary_model_resource_id` и похожие derived-поля в MVP не добавляются.
- `engineSpecific` в MVP не добавляется, чтобы не создавать неструктурированный escape hatch заранее.
- LoRA stack хранится внутри payload как часть цельной настройки пресета, а не в отдельной `preset_loras` таблице.
- Если позже понадобится быстрый поиск affected presets перед удалением модели или глобальная проверка missing resources, можно добавить derived/index table вроде `preset_resource_refs`, пересобираемую из `payload_json`.

### Альтернативы

- `Drizzle ORM` — хороший SQLite-first вариант с typed schema и migrations, но менее знаком в этом проекте.
- `Prisma` — удобный generated client, но тяжелее для desktop/Electron и даёт меньше SQL-контроля.
- `node:sqlite` — перспективный встроенный Node.js модуль, но сам по себе не решает типизацию запросов и пока менее очевиден как основной stack choice.
- Plain `better-sqlite3` — максимально простой вариант, но без type-safe query builder.

## Каталоги приложения

Предварительная структура app data:

```text
ImageGen Studio/
├─ database/
│  └─ app.sqlite
├─ models/
│  ├─ checkpoints/
│  ├─ loras/
│  ├─ vae/
│  └─ other/
├─ outputs/
│  └─ generations/
├─ workspaces/
│  └─ Uncategorized/
├─ previews/
│  └─ project-thumbnails/
├─ autosave/
│  └─ {project-id}/
└─ temp/
   └─ downloads/
```

## Правила целостности

- Модель считается установленной только после успешного скачивания, проверки и записи в SQLite.
- Скачивание идёт во временный файл, затем выполняется атомарный перенос в managed directory.
- Generation snapshot создаётся после успешной генерации и больше не изменяется.
- Generation snapshot должен сохранять фактический `predictionType` основной модели, чтобы результат можно было воспроизвести с правильным scheduler mode.
- Project thumbnail source of truth хранится внутри `.igs` в `preview/thumbnail.webp`; `previews/project-thumbnails/` является только пересобираемым кэшем.
- Один и тот же `.igs` нельзя открыть в нескольких `Project` tabs; repeated open фокусирует уже открытую вкладку.
- Удаление файла вне приложения не удаляет историю: UI показывает fallback.
- Удаление или перемещение `.igs` вне приложения не должно ломать БД: UI показывает missing project и может предложить relink/rescan workspace.
- `.igs` является источником истины проекта; SQLite project index можно пересобрать сканированием workspace'ов.
- При применении preset/snapshot проверяются только выбранные секции.
- Другая версия той же CivitAI-модели не считается валидной заменой.

## Что стоит уточнить перед схемой миграций

- Нужен ли soft delete для моделей, пресетов и истории.
- Где хранить CivitAI API token: OS keychain или зашифрованная app config.
- Нужны ли дополнительные размеры cache thumbnail'ов сверх `.igs` `preview/thumbnail.webp` и `preview/merged.png`.
- Нужно ли хранить нормализованные поля snapshot'а отдельно от JSON для поиска и фильтров.
