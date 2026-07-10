# Open Questions

## Желательно решить до первой реализации

- Как хранить CivitAI API token: OS keychain, Electron safeStorage или app config с предупреждением.
- Какой inference backend берём первым: diffusers, ComfyUI как backend, Invoke-like pipeline или отдельный минимальный PyTorch/diffusers worker.
- Какие base model families поддерживает MVP: SD 1.5, SDXL, Flux, Illustrious, Pony.
- Нужна ли поддержка LoRA в первом generation slice или её можно добавить сразу после txt2img checkpoint-only.
- Где создаются thumbnail/previews: main process или worker.
- Нужен ли soft delete для истории, моделей и пресетов.

## Можно решить позже

- Sidecar JSON and embedded metadata.
- Local model import by file/hash.
- Поиск модели по hash через CivitAI.
- One-click model update.
- Batch experiments.
- Workflow graph.
- Plugin API.

## Уже закрытые решения

- Desktop shell: Electron.
- Renderer: Vue 3 + TypeScript.
- UI kit: Naive UI.
- Runtime validation: Valibot как предпочтительный вариант.
- Global history index: SQLite. Project-local generation snapshots: `.igs`.
- Типизированный доступ к SQLite: Kysely + SqliteDialect + better-sqlite3 + kysely-codegen входит в MVP.
- Product direction: только однопользовательское desktop-приложение; server/multi-user направление не планируется.
- Presets: плоские, без наследования и композиции в MVP.
- Preset import/export: не планируется; отдельный portable preset bundle format не проектируем.
- Preset storage: гибридная SQLite-модель; каталог и `workflow_type` в колонках, настройки генерации в валидируемом `payload_json`.
- Smart Patch Layer: mask принадлежит слою, standalone mask layers не входят в MVP.
- Model compatibility: `predictionType` (`epsilon`, `v_prediction`, `sample`) хранится как metadata модели, передаётся worker'у и сохраняется в generation snapshot.
- Canvas renderer: MVP берёт Invoke-like пайплайн через Konva scene graph поверх Canvas 2D, но compositor/cache/layer lifecycle остаются логикой ImageGen Studio; WebGL/WebGPU откладываются как возможные backend'ы для тяжёлых задач.
- Project UX: document-based shell. `Home` is a normal tab with Workspaces and cross-workspace `Recent` / `All Projects` views; opened `.igs` files are `Project` tabs; `Canvas` is an entity inside `Project`, not a primary tab. Отдельная `Generate` вкладка, `Launchpad`, `Viewer` и постоянный Boards sidebar не входят в целевую модель.
- Project modes: внутри `Project` tab есть `Generate` и `Upscale`. `Upscale` принимает immutable flattened composite input из Generate и может добавить результат как новый layer или экспортировать его.
- Project tabs: несколько `.igs` проектов могут быть открыты одновременно, но один и тот же `.igs` нельзя открыть дважды; повторное открытие фокусирует существующую `Project` tab.
- Electron runtime: приложение работает в single-instance режиме через `app.requestSingleInstanceLock()`. Повторный запуск или open-file/deep-link intent передаётся в уже запущенный instance, чтобы нельзя было открыть один `.igs` в двух независимых процессах.
- Project storage: `.igs` project file является источником истины для canvas-проекта; SQLite хранит только глобальные сущности и восстанавливаемый индекс проектов/workspace'ов.
- `.igs` format: MVP использует переносимый ZIP-package без обязательной compression; основной save собирается во временный файл, валидируется и атомарно заменяет исходный project file.
- Project thumbnails: source of truth хранится внутри `.igs` в `preview/thumbnail.webp`; `previews/project-thumbnails/` является только пересобираемым кэшем для быстрого UI.
- `.igs` autosave: частое автосохранение работает через shadow project directory в app data, с debounce для JSON state и dirty-флагами для raster/mask assets. Обычная autosave activity не является Home status; только валидный незавершённый state после неожиданного завершения показывается как `Recovery available`.
- Global engineering policy: InvokeAI-first reference, no NIH. Готовые механизмы InvokeAI заимствуются настолько, насколько возможно в рамках стека и бизнес-логики ImageGen Studio; если InvokeAI не подходит, сначала ищем другое зрелое готовое решение.
- SDXL/Illustrious-like checkpoint loading: `.safetensors` остаётся исходным пользовательским файлом; worker использует Invoke-like Diffusers `from_single_file` path и RAM/VRAM model cache. Постоянная diffusers-конвертация допускается только как явное действие или отдельная будущая оптимизация, но не как скрытый шаг MVP.
- Python worker tooling: BasedPyright — основной type checker/LSP, Ruff — formatter/linter, `ty` можно запускать экспериментально, mypy не является baseline. Строго типизируем собственный worker/domain-код, а Diffusers/PyTorch держим за прагматичным adapter-слоем.
- Queue Manager: берём InvokeAI-like persistent queue как архитектурный baseline MVP. Очередь хранится в SQLite, job'ы создаются из frozen project/generation snapshots, статусы `pending/running/completed/failed/canceled`, completed results commit'ятся в `.igs` и появляются в `GenerationResults`. Один active worker job одновременно допустим для MVP, но UI/протокол проектируются вокруг очереди, а не ad-hoc single job.
- Undo/redo: берём InvokeAI-like canvas undo/redo, но scoped per `.igs` Project tab. История покрывает project/document mutations, маски, bbox, слои, Regional Guidance и committed generation results; queue status, Model Manager, Home и глобальные настройки не undoable.
- Tag autocomplete: MVP поддерживает Danbooru-style tag autocomplete с manual update tag database, alias search и local usage ranking. Rule34, custom extra CSV import, translation search, chants/styles, embedding token autocomplete и wildcard expansion не входят в эту фичу.
- Project Generate mode: строим Invoke-like Generate внутри `Project`, но без standalone `Generate` tab, `Launchpad`, `Viewer`, Boards sidebar и `Choose Prompt Template` dropdown. В scope входят LoRA selector, отдельный embeddings selector, tag autocomplete, dynamic prompting, Smart Patch Layer, Regional Guidance Layer with owned region/mask and images, `GenerationResults` для auto-committed multi-result generation, Forge-like prompt token counter/bracket checker без generic ControlNet/IP-Adapter feature families. ControlNet отложен на post-MVP follow-up; первые сценарии: tiled upscale, pose control, depth control, Canny/контуры.
- Smart Patch bbox UX: основной bbox можно редактировать Invoke-like controls/handles, а bbox выбранного Smart Patch Layer редактируется через canvas handles плюс компактный `Bounding Box` popover в selected-layer controls. Изменение bbox/internal resolution помечает слой `outdated`.
