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
- derived global history index of accepted generated project results and recoverable project index for Home;
- Queue Manager runtime/history records: queue items, batches, status, progress, errors and serialized worker job payloads;
- presets;
- references на файлы изображений, масок и моделей.

Project file `.igs` — источник истины для конкретного canvas-проекта:

- canvas document metadata;
- canvas size and color/profile metadata;
- layer stack;
- raster layer assets;
- masks;
- generation settings and immutable generation provenance attached to accepted Raster Layers / Smart Patch variants;
- references на модели, LoRA, VAE и другие внешние ресурсы.

SQLite не хранит сам canvas project и его слои как основной документ. Для проектов SQLite может хранить только индексируемые и восстанавливаемые поля: путь к `.igs`, workspace id/path, project thumbnail cache key/path, last opened time, modified time, display name, нормализованное display name для поиска, optional `trashed_at`, file health `ready`/`missing`/`corrupt`/`unsupported_schema` и похожую служебную информацию. Home search в MVP ищет только по display name и не требует индексации prompts, model names или generation settings.

Project `open` state не хранится в index row: Home вычисляет его по in-memory document-tab registry. `recovery_available` отражает наличие валидированного shadow candidate, а не обычный autosave progress.

Queue rows are not project source of truth or generation result history. They describe operational jobs that produce temporary staging candidates. Completed queue rows can be pruned without deleting accepted project results.

Файловая система хранит тяжёлые артефакты:

- checkpoint / LoRA / VAE / ControlNet files;
- generated images;
- `.igs` project files;
- workspace directories;
- derived thumbnail/cache previews;
- autosave shadow directories;
- temporary generation staging candidates;
- temporary exports/downloads.

Sidecar JSON рядом с пользовательскими изображениями и embedded metadata не входят в MVP. Project metadata хранится внутри `.igs`.

## Workspaces и `.igs` project files

Workspace — обычная папка на диске. В MVP workspace не может быть вложенным workspace'ом: приложение сканирует только прямые `.igs` файлы в выбранной папке, а вложенные папки и файлы других форматов игнорирует.

Всегда существует дефолтный workspace `Uncategorized` как реальная app-managed папка `ImageGen Studio/workspaces/Uncategorized/`. Пользователь может перемещать `.igs` project files между workspace'ами. Проект не может существовать вне workspace в пользовательской модели, но физически `.igs` остаётся обычным переносимым файлом.

Новый проект без другого явно выбранного writable workspace физически создаётся в `Uncategorized`. При открытии `.igs` вне известных workspace'ов пользователь должен переместить или скопировать файл в `Uncategorized` либо другой выбранный workspace. До подтверждённого move/copy такой файл не индексируется и не открывается. Приложение не создаёт implicit workspace из родительской папки и не хранит внешние пути как виртуальные элементы `Uncategorized`.

Home использует app-managed Trash lifecycle. `Move to Trash` сохраняет project index row, исходный `workspaceId` и `trashedAt`, исключает запись из `Projects` и workspace counters и показывает её только в Trash view. `Restore Project` очищает `trashedAt` и возвращает проект в прежний workspace. Физическое удаление managed `.igs` и index row происходит только после отдельного `Delete Permanently` confirmation. Открытый project нельзя переместить в Trash.

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
│  └─ references/
└─ provenance/
   └─ generation-*.json
```

Формат `.igs` проектируется как ZIP-пакет без обязательной compression. Обычный save может собирать новый archive во временный файл, валидировать его и затем атомарно заменять старый `.igs`.

Модели, LoRA, VAE и другие большие reusable resources не встраиваются в `.igs` по умолчанию. Project file хранит ссылки и compatibility metadata: local resource id, file hash, CivitAI ids, base model family, `predictionType`, display name/version и отсутствующий-resource status после проверки.

`preview/thumbnail.webp` и `preview/merged.png` внутри `.igs` являются переносимыми preview-артефактами проекта. Они едут вместе с project file и являются источником истины для project preview.

`ImageGen Studio/previews/project-thumbnails/` используется только как derived cache для быстрого отображения Home. Этот кэш можно удалить и пересобрать из `.igs`. Если cache preview отсутствует или устарел, приложение читает `preview/thumbnail.webp` из `.igs` и обновляет cache entry.

Storage serves [PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю):
the portable saved project remains authoritative independently of derived indexes.
The acceptance boundary is defined by
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению)
and the [staging contract](../features/project/generate-mode/generation-results.md).

### Generation provenance

Generation provenance — immutable metadata accepted Raster Layer or Smart Patch variant: which settings, resources, inputs and runtime parameters produced that persistent result.

Provenance exists only after explicit `Add N as Layers` / `Add N as Variants`. Worker completion and a temporary staging candidate do not create a project-local provenance record.

Project-local provenance is stored inside `.igs` and referenced by its accepted
layer/variant. Its payload logically distinguishes portable
`generationConfiguration`, diagnostic `layerSourceContext` and
`executionResultContext`. The eventual physical schema may encode these as
explicit nested groups, but must preserve the ownership boundary.

`generationConfiguration` contains:

- prompt / negative prompt;
- seed;
- sampler, scheduler, steps, CFG and explicit reusable generation/Canvas size;
- model, LoRA, VAE references and compatibility metadata;
- фактический `predictionType`;
- automatically derived txt2img/img2img/inpaint/outpaint mode;
- reusable Regional Guidance and other conditioning inputs.

`layerSourceContext` contains, where relevant:

- input image/source composite identity;
- Smart Patch mask, bounding box and internal resolution;
- compositing state;
- source composite/mask/layer revision hashes.

`executionResultContext` contains:

- reference to the accepted result inside `.igs`;
- created_at и worker/runtime metadata, нужные для воспроизводимости.

The latter two groups are retained for diagnostics, explainability and Smart
Patch `outdated`; they are not a preset payload and are not presented as
generation settings.

SQLite may store a derived global history index for accepted results: project path, result/provenance id, created_at, thumbnail/cache key and searchable metadata. The accepted layer/variant plus project-local provenance in `.igs` remains source of truth.

`Compare generation settings` is derived at runtime and is not serialized as a
second snapshot or cached diff. A generated Raster Layer contributes its
provenance; a Smart Patch Layer contributes active-variant provenance. The other
side is always a current projection of portable generation configuration in the
open `ProjectDocumentModel`. Layer/source context is excluded from this settings
diff. The comparison never uses a second variant's provenance as `Current
Canvas`.

One multi-accept may create several history rows but one grouped Project undo step. Discarded candidates never enter global history.

### Temporary generation staging

Queue completion writes candidate assets to application-managed temporary/cache storage, for example:

```text
ImageGen Studio/temp/generation-staging/{project-id}/{session-id}/
```

Rules:

- candidates are previewed by `GenerationResults` without becoming layers;
- focus and checkbox selection are ephemeral staging state;
- accepting a candidate moves/copies its raster data into `.igs` and creates provenance;
- unselected/discarded candidates can be deleted when the staging session closes;
- Queue Manager rows may outlive candidate cleanup but never become accepted-result history;
- crash/reopen recovery of an unfinished staging session is a separate follow-up decision.

### Upscale assets follow-up

Upscale is deferred from the current Project pass. Its previously agreed storage direction remains an immutable flattened composite input rather than a live layer-stack reference.

При команде `Send Composite to Upscale` или `Use Current Composite` приложение создаёт внутри `.igs` отдельный upscale input asset:

```text
assets/upscale-inputs/{id}.png
```

Metadata input'а хранит:

- source layer stack hash;
- source canvas size;
- source project revision id или timestamp;
- visible layers metadata;
- created_at;
- исходный project mode/action, который создал input.

Если после создания input'а слой, маска, opacity, blend mode или canvas size изменились, input считается устаревшим относительно текущего Generate composite. Upscale mode должен показывать `Source is outdated` и предлагать refresh.

Upscale result хранится как отдельный asset:

```text
assets/upscale-results/{id}.png
```

In the future result can be:

- добавить в Project как новый raster layer;
- экспортировать наружу.

Destructive replace source/composite не входит в MVP.

### Project identity

Для runtime tab management каждый открытый `.igs` должен иметь стабильную identity.

MVP-правило:

- canonical project identity строится из нормализованного абсолютного пути к `.igs`;
- приложение держит in-memory registry открытых project identities;
- при попытке открыть `.igs`, identity которого уже есть в registry, приложение фокусирует существующую `Project` tab;
- создание второй вкладки для того же `.igs` запрещено для всех entry points: `Home`, file picker, menu action, drag/drop, deep link.
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
      ├─ provenance/
      └─ autosave-state.json
```

Во время работы приложение пишет изменённые части проекта в shadow project directory внутри app data. Это recovery/cache слой, а не пользовательский project file.

Правила autosave:

- JSON state сохраняется с debounce, ориентировочно 500-1500 ms.
- Raster assets, masks и previews пишутся только по dirty-флагам.
- Autosave не изменяет основной `.igs` до явного save или scheduled safe save.
- Обычная запись в shadow directory является внутренним механизмом защиты и не создаёт пользовательский Home status.
- При запуске приложение проверяет незавершённые autosave directories. Валидный unclean state, оставшийся после неожиданного завершения работы, становится recovery candidate и отображается как `Recovery available`.
- После успешного обычного save autosave state для проекта помечается clean или удаляется.
- После graceful `Discard Changes` соответствующий shadow state удаляется.
- `Recover` открывает shadow state как dirty `Project` document и не перезаписывает основной `.igs` до явного Save.
- `Discard Recovery and Open Saved` удаляет recovery candidate и открывает основной `.igs`.
- `Cancel` не изменяет ни recovery candidate, ни основной `.igs`.
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
- Immutable provenance/operational JSON payloads хранить как validated `TEXT`/JSON, а поля для поиска и фильтров нормализовать отдельно.
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

`workflow_type` classifies intended preset context; it is not a manual Project generation mode. Project derives txt2img/img2img/inpaint/outpaint from target-area content. UI can use preset workflow to rank/filter candidates and validate context, while Apply still copies only explicitly selected sections.

### PresetPayload

`payload_json` содержит типизированные generation sections. Текущим доменным источником формы является `docs/prototype-app/src/prototypes/presets/presets.types.ts`; storage mapper не должен вводить другую группировку полей.

Предварительная TypeScript-форма:

```ts
type PresetWorkflow = 'imageToImage' | 'smartPatch' | 'textToImage'
type SeedPolicy = 'fixed' | 'random' | 'reuse'
type PresetSectionKey =
  | 'denoisingStrength'
  | 'guidance'
  | 'loras'
  | 'model'
  | 'negativePrompt'
  | 'prompt'
  | 'sampling'
  | 'seed'
  | 'size'
  | 'vae'

interface PresetResourceRef {
  id: string
  missing?: boolean
  name: string
  version?: string
}

interface PresetModelRef extends PresetResourceRef {
  baseModel: string
  predictionType: 'epsilon' | 'v-pred'
}

interface PresetLora {
  enabled: boolean
  resource: PresetResourceRef & { triggerPhrases: string[] }
  weight: number
}

interface GenerationPrompt {
  embeddingRefs: GenerationPromptEmbeddingRef[]
  text: string
}

interface GenerationPromptEmbeddingRef {
  resource: PresetResourceRef & {
    activationToken: string
    baseModel?: string
    negativeToken?: string
  }
  token: string
}

interface PresetPayload {
  denoisingStrength?: number
  guidance?: {
    cfgScale: number
    steps: number
  }
  loras?: PresetLora[]
  model?: PresetModelRef
  negativePrompt?: GenerationPrompt
  prompt?: GenerationPrompt
  sampling?: {
    sampler: string
    scheduler: string
  }
  seed?: {
    policy: SeedPolicy
    value?: number
  }
  size?: {
    height: number
    width: number
  }
  vae?: PresetResourceRef
}

interface PresetDefinition {
  description: string
  favorite: boolean
  name: string
  payload: PresetPayload
  tags: string[]
  workflow: PresetWorkflow
}

interface PresetRecord extends PresetDefinition {
  id: string
  updatedAt: string
}

type PresetCreateIntent =
  | { kind: 'manual' }
  | {
      kind: 'project'
      projectName: string
      projectSummary: string
      definition: PresetDefinition
    }

interface PresetApplicationDraft {
  payload: PresetPayload
  selectedSections: PresetSectionKey[]
  sourcePresetId: string
}
```

Правила:

- `payload_json` валидируется runtime-схемой при чтении и записи.
- `PresetDefinition` — editable create-domain object без fake `id`/timestamp. `PresetRecord` появляется только после подтверждённого `Create Preset`; persistence layer одновременно заполняет internal `created_at`/`updated_at`, даже если UI domain record показывает только `updatedAt`.
- `PresetCreateIntent` и source banner metadata (`projectName`, `projectSummary`) являются transient UI context и не сериализуются как preset catalog fields.
- Catalog metadata (`name`, `description`, `workflow`, `tags`, `favorite`) живёт в `PresetDefinition` и строгих columns, но не внутри `PresetPayload`.
- Storage mapper нормализует nullable DB `description` в доменную пустую строку и SQLite `favorite` 0/1 в boolean; UI draft не должен разносить SQL-nullability по форме.
- `workflow_type` storage tokens маппятся на доменные значения: `txt2img` ↔ `textToImage`, `img2img` ↔ `imageToImage`, `inpaint` ↔ `smartPatch`. Storage tokens не показываются в UI.
- Source of truth для model/LoRA/VAE настроек находится внутри `PresetPayload`; prompt content/order хранится в `GenerationPrompt.text`, а embedding dependencies — в sidecar `embeddingRefs` соответствующего `prompt`/`negativePrompt`. Offsets, Danbooru metadata и LoRA trigger refs не сохраняются.
- Section inclusion is represented by field presence. An absent field or group is not part of the preset and must not be applied. A second `includedSections` list is not stored, because it would duplicate the payload structure and could drift from it.
- Temporary preset consumers may use an ephemeral `selectedSections` mask inside an in-memory application draft. Apply uses it to choose fields copied into the current project; New Project uses the same shape for the detached initialization payload. The mask is never serialized into `payload_json` or another preset column.
- `sampling`, `guidance`, `size` и `seed` остаются отдельными смысловыми секциями, как в общем `PresetPayloadEditor`; storage не сворачивает их обратно в generic `params`.
- `PresetPayload` represents only portable generation configuration. Smart Patch mask, bounding box, internal resolution, compositing state and source/revision identities are layer properties and must not be serialized into it.
- A Smart Patch `internalResolution` must never be mapped implicitly into `PresetPayload.size`; `size` remains the explicit generic generation/canvas-size section supplied by the source configuration.
- Reusing Smart Patch layer/source context is implemented by duplicating the layer, not by extending `PresetPayload` with geometry or mask fields.
- Embeddings не образуют отдельную section/inclusion mask. Наличие `prompt` или `negativePrompt` включает всю соответствующую structured prompt-секцию вместе с embedding refs внутри её tokens.
- При нормализации workflow `textToImage` удаляет `denoisingStrength`. Возврат к другому workflow не создаёт поле автоматически.
- `predictionType` хранит scheduler prediction mode модели. Доменный label `v-pred` маппится на worker/storage token `v_prediction`; это compatibility metadata, а не user-facing style setting.
- Optional `missing` — runtime/catalog resolution state в текущем prototype DTO. Production mapper может вычислять его по Model Manager registry, но должен сохранять human-readable `id`/`name`/`version` reference metadata, чтобы preset оставался понятным при отсутствии файла.
- `PresetResourceRef.id` является стабильным local resource identity и разрешается через Model Manager records, где остаются CivitAI ids/hash/base-family metadata. Если preset должен копировать дополнительные identifiers для offline diagnostics, они добавляются в доменный ref и runtime schema явно, а не скрываются в несовместимой storage-only форме.
- `has_loras`, `primary_model_resource_id` и похожие derived-поля в MVP не добавляются.
- `engineSpecific` в MVP не добавляется, чтобы не создавать неструктурированный escape hatch заранее.
- LoRA stack хранится внутри payload как часть цельной настройки пресета, а не в отдельной `preset_loras` таблице.
- Если payload versioning понадобится до появления общего preset migration envelope, изменение сначала добавляется в доменные types/runtime schema и Vue prototype; storage spec не вводит скрытое `schemaVersion`, отсутствующее в текущем контракте.
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
├─ runtime/
│  ├─ python/
│  ├─ environments/
│  │  ├─ {active-runtime-id}/
│  │  ├─ {previous-runtime-id}/
│  │  └─ {next-runtime-id}.staging/
│  └─ current-runtime.json
├─ cache/
│  ├─ uv/
│  └─ runtime-downloads/
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
├─ logs/
│  └─ worker/
└─ temp/
   ├─ downloads/
   └─ generation-staging/{project-id}/{session-id}/
```

## Правила целостности

- Python runtime, models, projects и caches имеют независимые lifecycle. Repair/replace runtime не удаляет модели или пользовательские данные, а очистка cache не меняет active runtime.
- `current-runtime.json` заменяется атомарно только после успешного staging self-test. Failed install не изменяет active runtime и не удаляет previous known-good runtime.
- Модель считается установленной только после успешного скачивания, проверки и записи в SQLite.
- Скачивание идёт во временный файл, затем выполняется атомарный перенос в managed directory.
- CivitAI model identity и exact model version/file identity хранятся отдельно;
  несколько version records одной модели могут ссылаться на независимые managed
  files и существовать одновременно.
- Default version является catalog preference для новых selections. Смена
  default не обновляет resource references, уже записанные в `.igs`, Presets,
  queue payloads или accepted-result provenance.
- Worker completion creates a temporary candidate, not a persistent project result.
- Generation provenance is created only when a candidate is accepted and never changes afterward.
- Generation provenance stores the actual `predictionType` and actual seed so the accepted result can be reproduced with the correct scheduler mode.
- Provenance comparison is read-only derived state. Opening or closing it cannot
  mutate provenance or current Project state, and the MVP popover exposes no
  Apply/Recall/Restore action.
- Project thumbnail source of truth хранится внутри `.igs` в `preview/thumbnail.webp`; `previews/project-thumbnails/` является только пересобираемым кэшем.
- Один и тот же `.igs` нельзя открыть в нескольких `Project` tabs; repeated open фокусирует уже открытую вкладку.
- Удаление файла вне приложения не удаляет историю: UI показывает fallback.
- Удаление или перемещение `.igs` вне приложения не должно ломать БД: UI показывает missing project и может предложить relink/rescan workspace.
- `.igs` является источником истины проекта; SQLite project index можно пересобрать сканированием workspace'ов.
- При применении preset проверяются только выбранные секции. Provenance comparison
  является read-only и только показывает missing-resource diagnostics.
- Другая версия той же CivitAI-модели не считается валидной заменой.

## Что стоит уточнить перед схемой миграций

- Нужен ли soft delete для моделей, пресетов и истории.
- Где хранить CivitAI API token: OS keychain или зашифрованная app config.
- Нужны ли дополнительные размеры cache thumbnail'ов сверх `.igs` `preview/thumbnail.webp` и `preview/merged.png`.
- Нужно ли хранить нормализованные поля accepted-result provenance отдельно от JSON для поиска и фильтров.
