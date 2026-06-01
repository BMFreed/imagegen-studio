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
- generation history;
- immutable generation snapshots;
- presets;
- canvas projects and layers;
- references на файлы изображений, масок и моделей.

Файловая система хранит тяжёлые артефакты:

- checkpoint / LoRA / VAE / ControlNet files;
- generated images;
- thumbnails, если будут добавлены;
- canvas raster assets;
- mask assets.

Sidecar JSON и embedded metadata не входят в MVP.

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
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
```

`workflow_type` — категория применимости пресета, а не параметр генерации.

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
  vae?: PresetResourceRef
  params?: {
    width?: number
    height?: number
    sampler?: string
    scheduler?: string
    steps?: number
    cfgScale?: number
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
- Source of truth для model/LoRA/VAE настроек находится внутри `PresetPayload`.
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
├─ canvas-assets/
│  ├─ rasters/
│  └─ masks/
└─ temp/
   └─ downloads/
```

## Правила целостности

- Модель считается установленной только после успешного скачивания, проверки и записи в SQLite.
- Скачивание идёт во временный файл, затем выполняется атомарный перенос в managed directory.
- Generation snapshot создаётся после успешной генерации и больше не изменяется.
- Generation snapshot должен сохранять фактический `predictionType` основной модели, чтобы результат можно было воспроизвести с правильным scheduler mode.
- Удаление файла вне приложения не удаляет историю: UI показывает fallback.
- При применении preset/snapshot проверяются только выбранные секции.
- Другая версия той же CivitAI-модели не считается валидной заменой.

## Что стоит уточнить перед схемой миграций

- Нужен ли soft delete для моделей, пресетов и истории.
- Где хранить CivitAI API token: OS keychain или зашифрованная app config.
- Какой минимальный набор thumbnail'ов нужен для MVP.
- Нужно ли хранить нормализованные поля snapshot'а отдельно от JSON для поиска и фильтров.
