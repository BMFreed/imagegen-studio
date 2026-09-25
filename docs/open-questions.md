# Open Questions

## Открытые продуктовые детали до первой реализации

По текущему MVP scope блокирующих продуктовых решений не осталось. Если при
описании исполнимых контрактов появится новый выбор, его следует вынести сюда,
а не принимать молча в реализации.

## Инженерные контракты до первой реализации

- Для pinned Invoke reference `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`
  дополнить source map по обещанным операциям, исполнимые типизированные worker
  request/response DTO и per-family capability matrix для Illustrious и Anima.
  Для Anima региональный negative prompt требует проверки маскирования отрицательной CFG
  ветки на реальной модели; regional reference images недоступны в MVP.
- Развести создание изображений/thumbnail в worker и владение исходниками,
  путями, cache и атомарной публикацией в main process. Установить scheduling
  правила для thumbnail tasks рядом с одним active inference job, включая
  project preview после Save, когда Project уже закрыт.
- Довести typed IPC для `presets.getDeleted`/`presets.restore` и idempotent
  30-дневной cleanup операции до реализации SQLite lifecycle.
- По результатам Linux/NVIDIA packaging и inference tests установить минимальные
  driver/CUDA/VRAM требования; это release qualification, не выбор другого
  inference backend.
- До релизной фазы выбрать проверяемый Linux app package/update channel:
  trusted manifest, версия/совместимость, integrity/signature verification,
  handoff системному installer/updater и поведение при interrupted update.
  Продуктовое решение о встроенной проверке и установке уже принято; это
  инженерный контракт доставки, отдельный от Python runtime update. User flow
  описан в [Application Updates](./features/application-updates.md).
- До production dynamic batch expansion определить верхний лимит jobs по
  capacity tests для поддерживаемого Linux/NVIDIA профиля; прототипный лимит
  не является автоматически production-значением. Freeze/queue и UI должны
  показывать один и тот же лимит и причину отказа.

## Можно решить позже

- Числовой лимит локального staging recovery остаётся инженерным параметром
  до capacity tests перед disk-backed generation. Уже принято: валидные
  неразрешённые candidates нельзя молча вытеснять ради quota; нехватка места
  требует понятной ошибки и действия для пользователя.
- Отдельный privacy/offline promise: определить допустимые внешние запросы,
  telemetry/crash reports и поведение без сети. Local desktop/inference scope
  сам по себе не доказывает, что данные никогда не покидают устройство.
- Общие accessibility/performance гарантии: определить измеримые границы до
  появления публичного promise; существующие feature-level требования остаются.

- Sidecar JSON and embedded metadata.
- Local model import by file/hash.
- Поиск модели по hash через CivitAI.
- Batch experiments.
- Workflow graph.
- Plugin API.
- Custom image-export rectangle beyond the adopted visible-content default and explicit `Export Generation BBox` action.

## Уже закрытые решения

- ImageGen Studio всегда остаётся бесплатным open-source приложением. Это не
  меняет лицензию весов Anima: базовый checkpoint распространяется по
  [CircleStone Non-Commercial License](https://huggingface.co/circlestone-labs/Anima/blob/main/LICENSE.md)
  и поддерживается у нас только для некоммерческого использования вне
  production. Веса не входят в дистрибутив приложения; перед установкой
  пользователь видит источник, ограничение и ссылку на условия модели.
- Setup/status/repair Python runtime встроены в основное окно ImageGen Studio;
  отдельного приложения или окна лаунчера нет. Код Invoke launcher из
  `/home/user/Work/sources/launcher/` можно использовать как reference для
  отдельных механизмов установки, сохраняя наше staged/rollback поведение.
- Если ML Worker отсутствует или упал, Project Save всё равно сохраняет полный
  `.igs` с обязательными статическими preview placeholders и manifest state
  `preview.status=unavailable` для Project с видимыми raster pixels; пустой
  Project остаётся `empty`. Отдельный preview worker не создаётся. Актуальные
  previews строит восстановленный worker при следующем явном Save либо
  `Rebuild Preview` чистого Project.
- Рабочее пространство композиции и экспорт первого релиза используют sRGB.
  При импорте изображения с ICC worker переводит pixels в sRGB, а оригинальный
  ICC сохраняется как метаданные слоя внутри `.igs`. Повреждённый ICC не
  игнорируется молча. Файловые тесты уже проверяют Adobe RGB → sRGB и перенос
  исходных ICC bytes через Save/reopen; production Canvas и экспорт ещё должны
  подтвердить эту цветовую границу до выпуска.
- Первый Linux/NVIDIA релиз включает встроенную проверку и установку
  обновлений самого Electron-приложения из интерфейса. Это отдельный lifecycle
  от обновления Python runtime и моделей; приложение не удаляет пользовательские
  `.igs`, модели и app data при update. Проверка выполняется только после
  нажатия `Проверить обновления`, установка найденного пакета — отдельное
  явное действие; фоновой проверки при старте нет.
- Первый релиз поддерживает Linux + NVIDIA. Другие ОС и CPU/AMD/Metal профили
  не входят в первую release matrix.
- Inference для Illustrious (SDXL architecture) и Anima повторяет полный
  Invoke-like pipeline **в принятом MVP scope**. Бизнес-правила, queue,
  compatibility checks и frozen requests строго типизируются на TypeScript;
  model loading, conditioning и denoising выполняет Python ML Worker. Другие
  inference engines не планируются ни как MVP fallback, ни как будущий backend.
- LoRA входит в первый generation slice для обеих поддерживаемых семей; worker
  создаёт image derivatives/thumbnail. Main process управляет CivitAI download,
  файлами приложения и публикацией worker outputs.
- Model Manager устанавливает проверенные Qwen3 encoder и VAE, необходимые
  Anima, вместе с моделью как один managed install flow. До начала скачивания
  пользователь видит полный объём всех обязательных компонентов.
- CivitAI token хранится через Electron `safeStorage`. На Linux нельзя
  сохранять его при незащищённом `basic_text` backend или недоступном secure
  provider: импорт, требующий token, недоступен до появления защищённого
  хранилища, а UI объясняет причину и способ исправления. Session-only token и
  молчаливый plaintext fallback не входят в принятый flow.
- История принятых результатов и модели не имеют пользовательского soft delete;
  пресеты имеют: их можно восстановить в течение 30 дней после удаления,
  после чего приложение окончательно очищает их автоматически. Удаление модели
  может сохранять минимальную metadata отсутствующего ресурса для читаемости
  refs — это не восстановимая модель.
- Пресет из результата с dynamic prompt переносит один фактически раскрытый
  prompt конкретного результата, а не исходный batch template, `maxPrompts`
  или `seedBehavior` партии.
- Invoke-style inverse-mask auto-negative не входит в MVP ни для Illustrious,
  ни для Anima. `Use global negative prompt` у региона — отдельное наследование
  общего negative prompt при freeze job. Anima regional reference images
  несовместимы с выбранным pipeline и блокируются с объяснением.
- Primary generation bbox: новый Project начинает с origin `(0, 0)` и
  default `Size` 1024 × 1024; импорт изображения не двигает bbox автоматически.
  Явное `Fit` подгоняет bbox к изображению. Помимо свободного drag через canvas
  handles доступны числовые x/y; snapping по умолчанию выключен.
- Seed `Reuse`: базой новой генерации становится последний фактический seed
  completed output того же Project. Без completed seed Generate блокируется с
  объяснением, без случайной подмены. Project-scoped operational cursor
  обновляется только после validated/committed candidate, живёт в app-managed
  recovery отдельно от staging manifest и prunable queue rows, не создаёт
  dirty/undo и переживает graceful close/reopen. Явный Save также записывает
  snapshot cursor в `.igs`; более новый несохранённый cursor остаётся локальным.
- PP-007: переносимый `.igs` принадлежит пользователю; Save, dirty state и
  recovery имеют разные роли. Completed unaccepted candidates восстанавливаются
  локально после crash из отдельного app-managed staging manifest/assets;
  document content основного `.igs` не меняется до явного Save; отдельный
  explicit `Rebuild Preview` может обновить только preview/manifest чистого
  Project. Unaccepted staging не переносится вместе с `.igs` даже после Save.
  Успешный Save не удаляет
  unaccepted staging. Production persistence
  остаётся обязательным недоказанным flow, а не свойством in-memory prototype.
- PP-008: генерация даёт temporary candidates; только явное принятие добавляет
  слои/варианты одним undoable изменением. Queue progress, discard и завершение
  worker не являются Project history. Graceful Project close после confirmation
  отменяет его pending/running jobs и отбрасывает staging; после crash startup
  отменяет previous-lifetime pending/running, но сохраняет валидные completed
  candidates для recovery. Валидный Smart Patch candidate без target layer
  остаётся видимым как orphaned: Add as Variant недоступен, а явный Add as Raster
  Layer разрешён только при валидных asset/geometry/compositing; иначе доступен
  Discard. Валидный asset можно отдельно экспортировать через действие
  `Save Candidate Image` без acceptance. Автоматической конверсии или retargeting нет.
- Engineering workflow: risk-based research/review protocols приняты в
  [engineering/](./engineering/README.md). work project command не переносится напрямую;
  собственный review skill проектируется после PP-007/PP-006 пилотов.

- Desktop shell: Electron.
- Renderer: Vue 3 + TypeScript.
- UI kit: Naive UI.
- Runtime validation: Valibot как предпочтительный вариант.
- Global history indexes only accepted generated results in SQLite. Each accepted Raster Layer / Smart Patch variant owns immutable generation provenance in `.igs`; discarded candidates have neither provenance nor history rows.
- Provenance comparison: the PP-005 supporting contract requires one read-only layer-context popover for
  both Raster and Smart Patch Layers. `Generated with` comes from layer/active
  variant provenance; `Current Canvas` always comes from the current open Project
  generation settings. MVP exposes no Apply/Recall/Restore action in this
  popover. Smart Patch mask/bbox/internal resolution/compositing remain
  layer/source context for diagnostics and `outdated`; they are excluded from
  the settings diff and from `Save preset from image`. `Duplicate Layer` is the
  reuse path for those properties.
- Типизированный доступ к SQLite: Kysely + SqliteDialect + better-sqlite3 + kysely-codegen входит в MVP.
- Product direction: только однопользовательское desktop-приложение; server/multi-user направление не планируется.
- Presets: плоские, без наследования и композиции в MVP.
- Preset import/export: не планируется; отдельный portable preset bundle format не проектируем.
- Preset storage: гибридная SQLite-модель; каталог и `workflow_type` в колонках, настройки генерации в валидируемом `payload_json`.
- Preset UX: manual/project-derived creation проходит через transient Draft в Preset Manager; Apply использует detached editable application draft, не изменяет сохранённый preset и хранит section selection только в памяти. Home New Project переиспользует тот же `PresetPayloadEditor` для Text to Image initialization payload.
- Preset resource diagnostics: PP-006 требует visible warning до mutation и hard block только для выбранных секций с missing model/LoRA/VAE/embedding. Standalone и Project-integrated mock Apply уже показывают текстовую диагностику и учитывают nested resources. Production resource registry, persistent storage и handoff `Open in Models` остаются незавершёнными; mock не доказывает готовность PP-006 в приложении.
- Smart Patch Layer: mask принадлежит слою, standalone mask layers не входят в MVP.
- Model compatibility: `predictionType` (`epsilon`, `v_prediction`, `sample`) хранится как metadata модели, передаётся worker'у и сохраняется в accepted-result provenance.
- Model versioning: MVP обнаруживает доступные CivitAI-версии, устанавливает
  новую exact version рядом со старой, позволяет явно выбрать default для новых
  selections и никогда не переписывает существующие Projects, Presets или
  provenance. Silent auto-update не поддерживается.
- Canvas renderer: MVP берёт Invoke-like пайплайн через Konva scene graph поверх Canvas 2D, но compositor/cache/layer lifecycle остаются логикой ImageGen Studio; WebGL/WebGPU откладываются как возможные backend'ы для тяжёлых задач.
- Project UX: document-based shell. `Home` is a normal tab and defaults to the cross-workspace `Projects` view, with Workspaces, app-managed `Trash`, New/Import Project and manager entry points; opened `.igs` files are `Project` tabs; `Canvas` is an entity inside `Project`, not a primary tab. Отдельная `Generate` вкладка, `Launchpad`, `Viewer` и постоянный Boards sidebar не входят в целевую модель.
- Project working mode: domain mode `generate` uses the primary action `Generate`, without a separate `Create` header or single-mode switch; txt2img/img2img/inpaint/outpaint is derived from target-area canvas content. Upscale is deferred to a separate pass.
- Project tabs: несколько `.igs` проектов могут быть открыты одновременно, но один и тот же `.igs` нельзя открыть дважды; повторное открытие фокусирует существующую `Project` tab.
- Electron runtime: приложение работает в single-instance режиме через `app.requestSingleInstanceLock()`. Повторный запуск или open-file/deep-link intent передаётся в уже запущенный instance, чтобы нельзя было открыть один `.igs` в двух независимых процессах.
- Project storage: `.igs` project file является источником истины для canvas-проекта; SQLite хранит только глобальные сущности и восстанавливаемый индекс проектов/workspace'ов.
- `.igs` format: MVP использует переносимый ZIP-package без обязательной compression; основной save собирается во временный файл, валидируется и атомарно заменяет исходный project file.
- Project thumbnails: source of truth хранится внутри `.igs` в `preview/thumbnail.webp`; `previews/project-thumbnails/` является только пересобираемым кэшем для быстрого UI.
- `.igs` autosave: частое автосохранение работает через shadow project directory в app data, с debounce для JSON state и dirty-флагами для raster/mask assets. Отдельный staging recovery store содержит manifest, committed candidate assets и frozen context; queue rows можно чистить независимо. Обычная autosave activity не является Home status; только валидное незавершённое document или staging state после неожиданного завершения показывается как `Recovery available`.
- Project deletion UX: Home использует app-managed `Trash`; `Move to Trash` обратим, открытый project сначала нужно закрыть, workspace counters исключают trashed records, а физическое удаление происходит только через `Delete Permanently` из Trash view.
- Global engineering policy: InvokeAI-first reference, no NIH. Готовые механизмы InvokeAI заимствуются настолько, насколько возможно в рамках стека и бизнес-логики ImageGen Studio; если InvokeAI не подходит, сначала ищем другое зрелое готовое решение.
- SDXL/Illustrious-like checkpoint loading: `.safetensors` остаётся исходным пользовательским файлом; worker использует Invoke-like Diffusers `from_single_file` path и RAM/VRAM model cache. Постоянная diffusers-конвертация допускается только как явное действие или отдельная будущая оптимизация, но не как скрытый шаг MVP.
- Python worker tooling: BasedPyright — основной type checker/LSP, Ruff — formatter/linter, `ty` можно запускать экспериментально, mypy не является baseline. Строго типизируем собственный worker/domain-код, а Diffusers/PyTorch держим за прагматичным adapter-слоем.
- Python runtime: Poetry не используется; `uv`, `pyproject.toml` и committed `uv.lock` являются единственным dependency/environment workflow. Приложение использует собственный exact CPython в per-user app data, создаёт versioned staging environments и активирует новый runtime только после self-test с previous known-good rollback. Системный Python и пользовательский `PATH` не используются.
- Queue Manager: берём InvokeAI-like persistent queue как архитектурный baseline MVP. Очередь хранится в SQLite, job'ы используют frozen payloads, статусы `pending/running/completed/failed/canceled`, а completed outputs становятся durably stored temporary candidates в Project staging session. Queue Manager не является result history; один active worker job одновременно допустим для MVP. Несмотря на SQLite persistence, прежние pending/running jobs после restart не возобновляются автоматически и получают `canceled`.
- Undo/redo: берём InvokeAI-like canvas undo/redo, но scoped per `.igs` Project tab. История покрывает project/document mutations, маски, bbox, слои, Regional Guidance и explicit acceptance of generation candidates; queue status, Model Manager, Home и глобальные настройки не undoable.
- Tag autocomplete: MVP поддерживает Danbooru-style tag autocomplete с manual update tag database, alias search и local usage ranking. Rule34, custom extra CSV import, translation search, chants/styles, embedding token autocomplete и wildcard expansion не входят в эту фичу.
- Project generation workspace: строим Invoke-like canvas workflow внутри `Project`, но без standalone `Generate` tab, `Launchpad`, `Viewer`, Boards sidebar и `Choose Prompt Template` dropdown. `GenerationResults` is a multi-select staging tray: one focused preview, several checkbox-selected candidates, explicit `Add N as Layers/Variants`, no auto-commit. ControlNet remains a post-MVP follow-up.
- Project Canvas: принимаем бесконечное coordinate space как в InvokeAI. Normal generation использует movable/resizable project-owned primary bbox, Smart Patch — отдельный layer-owned bbox; оба могут выходить за существующее изображение. `Add N as Layers/Variants` не расширяет document bounds. Старый finite Project Canvas в Vue-прототипе — gap, не реализация этого решения.
- Image export: `File > Export As` берёт bounds видимого composited raster content (включая active visible Smart Patch variants); `Export Generation BBox` — отдельное действие. Пустой проект нельзя экспортировать как изображение, но его `.igs` можно сохранить. Custom rectangle отложен.
- Smart Patch generation draft: each Smart Patch Layer owns its mask, bbox, internal resolution, generation draft, accepted variants and provenance; normal Project settings do not make unrelated patches outdated.
- Project layer ordering: Raster and Smart Patch Layers share one compositing z-order; Regional Guidance remains a separate conditioning section.
- Smart Patch bbox UX: primary bbox можно редактировать Invoke-like controls/handles, а bbox выбранного Smart Patch Layer редактируется через canvas handles плюс компактный `Bounding Box` popover в selected-layer controls. Изменение layer-owned bbox/internal resolution помечает слой `outdated`; изменение primary bbox не меняет Smart Patch.
