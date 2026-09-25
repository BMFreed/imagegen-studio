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
- project-scoped operational last-actual-seed cursor, updated on validated
  completed outputs independently of queue and staging retention;
- presets;
- references на файлы изображений, масок и моделей.

Project file `.igs` — источник истины для конкретного canvas-проекта:

- canvas document metadata;
- unbounded Project Canvas coordinate metadata, project-owned primary generation
  bbox and color/profile metadata;
- layer stack;
- raster layer assets;
- masks;
- generation settings and immutable generation provenance attached to accepted Raster Layers / Smart Patch variants;
- the last-actual-seed snapshot as of the most recent explicit Project Save;
- references на модели, LoRA, VAE и другие внешние ресурсы.

SQLite не хранит сам canvas project и его слои как основной документ. Для проектов SQLite может хранить только индексируемые и восстанавливаемые поля: путь к `.igs`, workspace id/path, project thumbnail cache key/path, last opened time, modified time, display name, нормализованное display name для поиска, optional `trashed_at`, file health `ready`/`missing`/`corrupt`/`unsupported_schema` и похожую служебную информацию. Home search в MVP ищет только по display name и не требует индексации prompts, model names или generation settings.

Project `open` state не хранится в index row: Home вычисляет его по in-memory document-tab registry. `recovery_available` отражает наличие валидированного незавершённого document shadow или completed staging recovery после сбоя, а не обычный autosave progress.

Queue rows are not project source of truth or generation result history. They describe operational jobs that produce temporary staging candidates. Completed queue rows can be pruned without deleting accepted project results or valid unaccepted candidate recovery: each completed candidate owns a separate durable manifest entry with its frozen generation context.

Seed `Reuse` takes the most recent completed output's actual seed for this same
Project, even when that candidate was subsequently discarded. Its local cursor
is operational metadata, not a document edit: job completion does not mark the
Project dirty or add an undo step. The cursor is keyed to the local Project
identity and survives graceful tab close, staging cleanup and queue pruning.
An explicit Project Save snapshots its current value into `.igs`; until then,
the newer local cursor stays on this computer. Opening a portable `.igs` without
a local cursor starts from its saved snapshot, if any. A copied `.igs` at a new
local identity does not inherit an unrelated local cursor. A managed Project
move migrates the local identity mapping along with the project index.

Файловая система хранит тяжёлые артефакты:

- checkpoint / LoRA / VAE / ControlNet files;
- generated images;
- `.igs` project files;
- workspace directories;
- derived thumbnail/cache previews;
- autosave shadow directories;
- app-managed generation staging recovery manifests and candidate assets;
- temporary exports/downloads.

Sidecar JSON рядом с пользовательскими изображениями и embedded metadata не входят в MVP. Project metadata хранится внутри `.igs`.

CivitAI API token is stored by Electron main process using `safeStorage`; only
its encrypted value may be persisted in app-managed configuration. The token is
not stored in SQLite, `.igs`, presets, queue payloads or logs. On Linux, if
`safeStorage` reports the unprotected `basic_text` backend or secure storage is
unavailable, the app refuses to persist the token and shows an actionable
connection/setup error. It must not silently fall back to plaintext storage.

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
│  ├─ references/
│  └─ profiles/
└─ provenance/
   └─ generation-*.json
```

Формат `.igs` проектируется как ZIP-пакет без обязательной compression. Обычный save может собирать новый archive во временный файл, валидировать его и затем атомарно заменять старый `.igs`.

Первый исполняемый формат фазы 2A использует точный `mimetype` payload
`application/vnd.imagegen-studio.project+zip` и `schemaVersion: 1` в
`manifest.json`. Manifest хранит portable `documentId`, `documentRevision`,
`preview.status` (`rendered`, `empty`, `unavailable`), preview rect и перечень
member paths с uncompressed byte size и SHA-256. `project.json` хранит тот же
document ID/revision, title, primary bbox, generation draft, ordered Raster
Layers с точными asset references и saved last-actual-seed snapshot. ZIP member
names и ссылки валидируются строго; неизвестное или более новое schema version
не переписывается молча. В этом первом срезе Smart Patch, Regional Guidance,
masks и accepted provenance ещё не сериализуются: их добавление требует явной
schema extension/migration до поддержки production Project. Project и рабочие
raster assets используют sRGB. При импорте worker приводит pixels с исходным
ICC к sRGB, а оригинальные ICC bytes сохраняются в
`assets/profiles/{sha256}.icc` и ссылаются из metadata слоя; одинаковые profiles
могут разделять один member. Для изображения без ICC нет исходного profile
asset. EXIF Orientation исходного изображения применяется к пикселям до
сохранения рабочего raster asset: размеры слоя и preview соответствуют
ориентированному изображению. Композиция и экспорт первого релиза выполняются в sRGB. Import с
некорректным ICC нельзя молча трактовать как корректный sRGB; он получает
явную диагностику. Прототипные artwork fixtures не подтверждают эту конверсию.
Нормализованный worker output содержит закреплённый sRGB ICC (SHA-256
`113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1`);
main сверяет его bytes и совместимость других PNG color chunks. `.igs` v1
отклоняет встроенный ICC с другим отпечатком и противоречащие PNG color chunks.
RGB-изображение без ICC и без другого цветового сигнала считается sRGB по
правилу для untagged RGB; его фактическое исходное пространство невозможно
доказать только чтением файла. PNG без ICC, но с явными `gAMA`, `cHRM`, `cICP`
или `sRGB`, принимается лишь тогда, когда все эти chunks совместимы с sRGB;
иначе import останавливается с диагностикой вместо скрытой подмены цветов.
Untagged CMYK worker не импортирует. Исходный профиль хранится отдельно от
рабочего asset.

Пределы первой реализации — защитные engineering ceilings, а не измеренная
ёмкость продукта: 10 000 ZIP entries, 32 GiB суммарных распакованных данных,
8 GiB на member, 4 MiB на ICC profile, 4 MiB на manifest JSON,
16 MiB на project JSON и 32 768 px
на сторону raster asset. Реальные проекты и Linux/NVIDIA worker должны пройти
capacity tests до релиза; лимит генерации не выводится из этих потолков и не
копируется из mock UI.

Модели, LoRA, VAE и другие большие reusable resources не встраиваются в `.igs` по умолчанию. Project file хранит ссылки и compatibility metadata: local resource id, file hash, CivitAI ids, base model family, `predictionType`, display name/version и отсутствующий-resource status после проверки.

`preview/thumbnail.webp` и `preview/merged.png` внутри `.igs` являются переносимыми preview-артефактами проекта. Они едут вместе с project file и являются источником истины для project preview.
На бесконечном Project Canvas их конечный rasterization rect определяется по
union bounds видимого composited raster content: видимые Raster Layers и
активные видимые Smart Patch variants. Скрытое содержимое и primary generation
bbox не расширяют этот rect. `manifest.preview.rect` хранит эти координаты в
пространстве Canvas; размеры PNG/WebP могут быть меньше из-за downsampling.
Защитный лимит 32 768 px относится к закодированному изображению и отдельному
layer asset, а не к ширине/высоте world-space rect. Для проекта без видимых raster pixels оба preview
артефакта содержат детерминированный placeholder для Home, не «размер canvas»
и не изображение, доступное для `Export As`; `preview.status=empty` сохраняется
даже без worker. Default image export использует тот же visible-content bounds
rule и в пустом проекте недоступен.

Save не блокируется отсутствующим или упавшим ML Worker. Когда worker не может
построить актуальный raster preview для проекта **с видимыми пикселями**, main
кладёт в **оба** обязательных preview-файла статический, поставляемый с
приложением placeholder и отмечает в `manifest.json`
`preview.status=unavailable`; содержимое слоёв и assets сохраняется полностью.
В этом случае manifest по-прежнему сохраняет world-space rect видимого
содержимого, даже если он больше разрешённого размера PNG и сами preview-файлы
содержат статическую заглушку.
При недоступном worker и compositor main использует консервативные bounds
видимых Raster Layers: прозрачность отдельных пикселей и взаимное перекрытие
неизвестны. Поэтому видимый, но полностью прозрачный слой может получить
`unavailable`; `empty` без worker означает, что нет ни одного потенциально
видимого raster layer. После восстановления worker актуальный preview
пересчитывается по действительно видимому composited content.
Состояния `rendered`, `empty` и `unavailable` различаются в этом поле, чтобы placeholder
при отказе worker не выдавался за пустой проект или актуальный composite.
Нельзя повторно использовать старый preview от предыдущей ревизии как новый.
Следующий явный Save с доступным worker пересоздаёт previews и меняет состояние
на `rendered`. Для чистого Project то же делает явное `Rebuild Preview` из
Home: main атомарно пересобирает `.igs`, меняя только preview/manifest и cache,
не меняя document revision, dirty/undo, accepted results или staging.
Команда сериализуется с Save и непосредственно перед заменой повторно
проверяет project identity и dirty state; на dirty Project она открывает
Project для Save, чтобы не записать preview от старой ревизии вместо текущих
изменений. Document revision/hash нельзя вычислять из всего ZIP package,
preview bytes или mtime: maintenance rebuild меняет package fingerprint, но
не документные данные. Ошибка worker/rebuild оставляет старый пакет с placeholder
читаемым. Main не создаёт производное изображение и не запускает отдельный
preview worker ради этой ветки.

`ImageGen Studio/previews/project-thumbnails/` используется только как derived cache для быстрого отображения Home. Этот кэш можно удалить и пересобрать из `.igs`. Если cache preview отсутствует или устарел, приложение читает `preview/thumbnail.webp` из `.igs` и обновляет cache entry.

Storage serves [PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю):
the portable saved project remains authoritative independently of derived indexes.
The acceptance boundary is defined by
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению)
and the [staging contract](../features/project/generate-mode/generation-results.md).

### Generation provenance

Generation provenance — immutable metadata of an accepted Raster Layer or Smart Patch variant: recorded settings, resources, non-regional source context and runtime parameters associated with that persistent result. It is not a complete reconstruction recipe when Regional Guidance was used.

Provenance exists only after explicit `Add N as Layers` / `Add N as Variants`. Worker completion and a temporary staging candidate do not create a project-local provenance record.

Acceptance attaches project-local provenance to the open document and its
recovery shadow; explicit Save stores it inside `.igs`, referenced by its
accepted layer/variant. Its payload logically distinguishes portable
`generationConfiguration`, diagnostic `layerSourceContext` and
`executionResultContext`. The eventual physical schema may encode these as
explicit nested groups, but must preserve the ownership boundary.

`generationConfiguration` contains:

- prompt / negative prompt;
- actual seed, requested Seed policy and dynamic seed behavior;
- sampler, scheduler, steps, CFG and applicable reusable primary generation
  bbox width/height, never Smart Patch geometry or internal resolution;
- model, LoRA, VAE references and compatibility metadata;
- фактический `predictionType`;
- automatically derived txt2img/img2img/inpaint/outpaint mode;
- CFG Rescale, VAE Precision and other supported, reproducible
  generation/conditioning options.

Regional Guidance is excluded from every accepted-result provenance group,
including `generationConfiguration` and `layerSourceContext`. Frozen operational
worker input may contain Regional Guidance needed to run the job, but acceptance
does not copy it into provenance. A saved result generated with regions therefore
cannot fully reconstruct that regional setup.

`layerSourceContext` contains, where relevant:

- input image/source composite identity;
- Smart Patch mask, bounding box and internal resolution;
- compositing state;
- source composite/mask/layer revision hashes.

`executionResultContext` contains:

- stable accepted-result identity in the open document and, after Save, `.igs`;
- created_at и worker/runtime metadata, нужные для воспроизводимости.

The latter two groups are retained for diagnostics, explainability and Smart
Patch `outdated`; they are not a preset payload and are not presented as
generation settings.

Immediately after Add, each accepted result appears in the open Project's
history UI projection; the projection is rebuilt from the recovered document
shadow after a crash. SQLite may store a derived durable global history index
for saved accepted results: project path, result/provenance id, created_at,
thumbnail/cache key and searchable metadata. Explicit Save synchronizes that
index with the accepted layer/variant and project-local provenance in `.igs`,
which remain its source of truth.

`Compare generation settings` is derived at runtime and is not serialized as a
second snapshot or cached diff. A generated Raster Layer contributes its
provenance; a Smart Patch Layer contributes active-variant provenance. The other
side is always a current projection of portable generation configuration in the
open `ProjectDocumentModel`. Layer/source context is excluded from this settings
diff. The comparison never uses a second variant's provenance as `Current
Canvas`.

One multi-accept may create several history rows but one grouped Project undo step. Discarded candidates never enter global history.

Accepted-result history has no soft-delete/tombstone lifecycle. Its global
SQLite rows are derived from accepted results in `.igs`; removing or rebuilding
an index row cannot silently delete or hide the source result. Queue Manager's
independent terminal-job pruning is not accepted-result history deletion.

### Temporary generation staging

Queue completion writes candidate assets to application-managed recovery storage,
separate from both the document autosave shadow and the user-owned `.igs`:

```text
ImageGen Studio/recovery/generation-staging/{local-project-key}/{session-id}/
├─ manifest.json
└─ assets/
   └─ {candidate-id}.png
```

Rules:

- candidates are previewed by `GenerationResults` without becoming layers or
  marking the Project dirty;
- the manifest records stable project/session/candidate/target identities,
  committed asset path and integrity metadata, frozen job inputs/resources and
  actual result metadata needed to create provenance on later acceptance. For
  Smart Patch candidates it also retains the frozen bbox and either a
  display-ready raster with transparency or immutable mask/compositing
  snapshot assets needed for faithful independent Raster Layer conversion if
  the target layer is missing after recovery;
  queue-row retention is never the only copy of that context;
- main process writes each output to a provisional file, validates it, then
  atomically publishes the asset and manifest update. Only a validated,
  manifest-backed candidate can be shown as completed/recoverable;
- each committed candidate records its actual seed and stable completion order.
  After manifest publication, a durable SQLite completion transaction marks
  its queue item completed and advances the Project seed cursor. If a crash
  occurs between those operations, startup reconciles valid committed
  manifests idempotently by candidate id and completion order before `Reuse`
  becomes available. A missing, corrupt or partial output never advances the
  cursor;
- a crash between filesystem and SQLite updates is reconciled idempotently by
  candidate id: valid committed manifest entries remain recoverable even if a
  queue row was not marked completed or has since been pruned; unreferenced partial
  files and manifest entries with missing/corrupt assets are not shown as
  usable candidates and are diagnosed/quarantined for cleanup;
- focus and checkbox selection are ephemeral staging UI state and may be
  initialized again when valid candidates are recovered;
- a valid Smart Patch candidate whose target layer is absent after recovery is
  retained and surfaced as orphaned, not treated as a corrupt/partial file.
  Original Add as Variant is disabled. The user may explicitly Add as Raster
  Layer at the frozen bbox only when its committed asset and retained geometry/
  compositing snapshot reproduce the candidate's own visible contribution
  without the missing layer. Otherwise Raster conversion is disabled. A valid
  asset still supports explicit Save Candidate Image export, and Discard remains
  available; export neither accepts it into the Project nor removes its
  recovery entry. None of these actions silently retargets or changes an
  existing layer;
- `Add N as Layers/Variants` first gives selected raster assets and frozen
  context to the open document and document recovery shadow, creating accepted
  provenance there. Only after that handoff is durable may their staging
  records/assets be removed. The main `.igs` receives accepted state on
  explicit Save; failed handoff leaves the candidate recoverable;
- Save of an otherwise dirty Project clears only its document shadow, never
  unaccepted staging recovery. A clean saved Project with valid completed
  candidates can therefore offer recovery after a crash;
- discarding a completed candidate or its staging session does not roll back
  the last actual seed: the output really completed. The cursor has its own
  retention lifecycle and is not derived from remaining candidate files;
- graceful confirmed Project close cancels its unfinished jobs, durably marks
  its staging session discarded before close commits, then cleans its
  candidates; late outputs for that session cannot be published. Explicit
  per-candidate/session discard follows
  the same cleanup rule without creating provenance/history;
- cleanup removes discarded, accepted-after-handoff, unreferenced filesystem
  orphans and invalid candidate data; a valid missing-target Smart Patch
  candidate is retained until explicit Add as Raster Layer or Discard. A quota
  must be checked before reserving new output space;
  when space is insufficient, enqueue/completion reports an actionable error
  instead of silently evicting valid unresolved recovery. A failed deletion
  remains hidden/tombstoned and is retried by GC;
- Queue Manager rows may outlive candidate cleanup but never become accepted-result history.

### Upscale assets follow-up

Upscale is deferred from the current Project pass. Its previously agreed storage direction remains an immutable flattened composite input rather than a live layer-stack reference.

При команде `Send Composite to Upscale` или `Use Current Composite` приложение создаёт внутри `.igs` отдельный upscale input asset:

```text
assets/upscale-inputs/{id}.png
```

Metadata input'а хранит:

- source layer stack hash;
- finite source capture bounds in Project coordinates;
- source project revision id или timestamp;
- visible layers metadata;
- created_at;
- исходный project mode/action, который создал input.

Если после создания input'а слой, маска, opacity, blend mode или выбранные
границы захвата изменились, input считается устаревшим относительно исходного
composite. Upscale mode должен показывать `Source is outdated` и предлагать refresh.

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

Portable `documentId` inside `.igs` identifies document content, but cannot be
the sole key for local autosave, staging or the last-seed cursor: copying a file
copies that id too. App-managed recovery uses a key derived from the canonical
local project identity/path. A managed move migrates the local key with its
recovery and cursor records; an independently imported copy receives a distinct
local key even if the portable `documentId` matches.

Если позже понадобится поддержка symlink-heavy workflow или network paths, identity policy можно расширить через filesystem inode/file id там, где платформа это поддерживает. Для MVP достаточно canonical path + rescan/relink поведения.

### Валидация `.igs`

При открытии `.igs` приложение должно:

- проверить, что файл является корректным project package ImageGen Studio;
- проверить `schemaVersion`;
- валидировать `manifest.json` и `project.json` через runtime schema;
- запретить опасные archive paths вроде `../` и абсолютных путей;
- проверить наличие обязательных assets, referenced layers, masks и previews;
- проверить допустимость preview state и формат обязательных preview-файлов;
  `unavailable` с валидными placeholders не делает сохранённый Project
  повреждённым;
- проверить допустимые размеры generation bbox, raster layers, masks и
  распакованных assets, включая лимиты на координаты и общий объём archive;
- показать понятную ошибку, если файл повреждён, не поддерживается или создан более новой версией приложения.

Изменения формата проходят через явные schema migrations. Старый `.igs` нельзя молча пересохранять в новой схеме без успешной миграции и атомарного save.

## Autosave для `.igs`

Autosave не должен часто пересобирать полный `.igs` archive. Базовое решение MVP:

```text
ImageGen Studio/
└─ autosave/
   └─ {local-project-key}/
      ├─ manifest.json
      └─ snapshots/
         └─ {snapshot-id}/
            ├─ project.json
            └─ assets/
```

Во время работы приложение пишет изменённые части проекта в shadow project directory внутри app data. Это recovery/cache слой, а не пользовательский project file.

Правила autosave:

- JSON state сохраняется с debounce, ориентировочно 500-1500 ms.
- Исполняемый v1 shadow хранит изменённые referenced raster assets и исходные
  ICC, проверяя их size/hash. Masks и future layer types добавляются вместе с
  расширением формата; derived previews не дублируются в document shadow.
- Опубликованный `manifest.json` указывает на один проверенный snapshot;
  незавершённые snapshot directories не являются recovery candidates. При
  пересечении Save A и последующей правки B manifest закрепляет hashes старой
  сохранённой ревизии S и конкретной committing A. Recovery принимает B только
  если текущий `.igs` точно равен S или A.
- Autosave не изменяет основной `.igs` до явного Save.
- Обычная запись в shadow directory является внутренним механизмом защиты и не создаёт пользовательский Home status.
- При запуске приложение проверяет незавершённые document shadow и отдельные staging recovery manifests. Валидный unclean document state или completed staging candidate после неожиданного завершения становится `Recovery available`; прежние pending/running jobs отменяются, а partial outputs не показываются.
- После успешного обычного Save только document autosave state для проекта помечается clean или удаляется; staging recovery остаётся до Add или explicit discard.
- После graceful `Discard Changes` соответствующий shadow state удаляется.
- `Recover` открывает shadow state как dirty `Project` document, когда он есть, иначе сохранённый `.igs`; валидные completed candidates возвращаются в staging, не меняя dirty state сами по себе.
- `Discard Recovery and Open Saved` удаляет оба вида recovery state для проекта и открывает основной `.igs`.
- `Cancel` не изменяет ни recovery candidate, ни основной `.igs`.
- Запись autosave и staging manifest/assets выполняется через temp file + atomic rename с валидацией ссылок и содержимого.
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
src/main/db/database.types.ts
```

Предварительный workflow:

```text
run migrations against local app.sqlite or temp schema db
↓
run kysely-codegen
↓
write src/main/db/database.types.ts
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

`deleted_at` is a preset-only soft-delete tombstone, recorded as a UTC time.
`NULL` means active. A deleted preset remains in SQLite with its entire
`payload_json` and resource refs, is excluded from active catalog/search and
Apply/New Project selectors, and is available in the Preset Manager's `Deleted`
view for `Restore`. Restore clears `deleted_at` without changing preset identity
or payload. Once 30 days have elapsed since `deleted_at`, cleanup permanently
deletes the row; if the application was closed at expiry, cleanup runs on the
next launch. Neither the preset payload nor its copied resource-reference
metadata is physically removed before expiry. The referenced model files have
their own lifecycle. This preset lifecycle is separate from managed `.igs`
Project Trash.

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
  | 'cfgRescale'
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
  | 'vaePrecision'

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
  cfgRescale?: number
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
  vaePrecision?: 'Auto' | 'FP16' | 'FP32'
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
- `cfgRescale` and `vaePrecision` are independent typed optional payload fields
  and `PresetSectionKey` values; they are not a generic `advanced` section.
  Absence means Apply leaves the current Project value unchanged. Future
  advanced settings require named typed fields and sections rather than an
  `engineSpecific` bag.
- `PresetPayload` represents only portable generation configuration. Smart Patch mask, bounding box, internal resolution, compositing state and source/revision identities are layer properties and must not be serialized into it.
- A Smart Patch `internalResolution` or layer-owned bbox must never be mapped
  implicitly into `PresetPayload.size`; when explicitly included, `size` carries
  portable primary normal-generation bbox width/height, never a fixed Project
  Canvas size or bbox x/y placement.
- Reusing Smart Patch layer/source context is implemented by duplicating the layer, not by extending `PresetPayload` with geometry or mask fields.
- Embeddings не образуют отдельную section/inclusion mask. Наличие `prompt` или
  `negativePrompt` включает plain-text prompt и соответствующий sidecar
  `embeddingRefs`; refs не являются токенами текста или UI chips.
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
│  └─ {local-project-key}/
├─ logs/
│  └─ worker/
└─ temp/
   ├─ downloads/
   └─ generation-staging/{local-project-key}/{session-id}/
```

## Правила целостности

- Python runtime, models, projects и caches имеют независимые lifecycle. Repair/replace runtime не удаляет модели или пользовательские данные, а очистка cache не меняет active runtime.
- `current-runtime.json` заменяется атомарно только после успешного staging self-test. Failed install не изменяет active runtime и не удаляет previous known-good runtime.
- Модель считается установленной только после успешного скачивания, проверки и записи в SQLite.
- Скачивание идёт во временный файл, затем выполняется атомарный перенос в managed directory.
- Anima requires its Qwen3 encoder and VAE alongside the chosen checkpoint.
  The install preview lists all required files and the total additional
  download size before consent. A checkpoint is not published as selectable
  until the checkpoint and all required companions are verified and their
  relationships are recorded; an interrupted/failed companion download leaves
  no partially installed selectable Anima model. Existing verified companions
  may be reused and are not counted as new download bytes. Shared companion
  files are not removed while another installed model still references them. If
  a companion later goes missing, the dependent checkpoint becomes unavailable
  for generation until the exact dependency is repaired.
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
- Если ML Worker недоступен, Save сохраняет валидный `.igs` со статическими
  preview placeholders и `preview.status=unavailable` только при видимых
  raster pixels; содержимое проекта не теряется. Пустой Project получает
  `preview.status=empty`. Для чистого Project восстановление актуальных
  previews доступно через явное `Rebuild Preview` без искусственного dirty.
- Один и тот же `.igs` нельзя открыть в нескольких `Project` tabs; repeated open фокусирует уже открытую вкладку.
- Удаление файла вне приложения не удаляет историю: UI показывает fallback.
- Удаление или перемещение `.igs` вне приложения не должно ломать БД: UI показывает missing project и может предложить relink/rescan workspace.
- `.igs` является источником истины проекта; SQLite project index можно пересобрать сканированием workspace'ов.
- При применении preset проверяются только выбранные секции. Provenance comparison
  является read-only и только показывает missing-resource diagnostics.
- Другая версия той же CivitAI-модели не считается валидной заменой.
- Model resources have no user-visible soft-delete/Trash state. Removing a
  local resource deletes its managed file after the existing job/reference
  checks; only minimal identity/display metadata needed for missing-resource
  diagnostics may remain. This metadata is not a restorable model copy.

## Что стоит уточнить перед схемой миграций

- Нужны ли дополнительные размеры cache thumbnail'ов сверх `.igs` `preview/thumbnail.webp` и `preview/merged.png`.
- Нужно ли хранить нормализованные поля accepted-result provenance отдельно от JSON для поиска и фильтров.
