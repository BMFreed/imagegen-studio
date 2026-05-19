# Open Questions

## Желательно решить до первой реализации

- Как хранить CivitAI API token: OS keychain, Electron safeStorage или app config с предупреждением.
- Какой inference backend берём первым: diffusers, ComfyUI как backend, Invoke-like pipeline или отдельный минимальный PyTorch/diffusers worker.
- Какие base model families поддерживает MVP: SD 1.5, SDXL, Flux, Illustrious, Pony.
- Нужна ли поддержка LoRA в первом generation slice или её можно добавить сразу после txt2img checkpoint-only.
- Нужна ли очередь генераций в MVP или достаточно одного активного job.
- Какой формат thumbnail'ов и где они создаются: main process или worker.
- Нужен ли soft delete для истории, моделей и пресетов.

## Можно решить позже

- Import/export presets.
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
- История и snapshots: SQLite как источник истины.
- Типизированный доступ к SQLite: Kysely + SqliteDialect + better-sqlite3 + kysely-codegen входит в MVP.
- Product direction: только однопользовательское desktop-приложение; server/multi-user направление не планируется.
- Presets: плоские, без наследования и композиции в MVP.
- Preset storage: гибридная SQLite-модель; каталог и `workflow_type` в колонках, настройки генерации в валидируемом `payload_json`.
- Smart Patch Layer: mask принадлежит слою, standalone mask layers не входят в MVP.
