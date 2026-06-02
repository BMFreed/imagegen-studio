# ImageGen Studio Docs

Документация проекта хранится в `docs/`, чтобы большой MVP-документ не превращался в единственное место для всех решений.

## Главные документы

- [mvp-design-doc.md](./mvp-design-doc.md) — исходный дизайн-документ и главный источник продуктовых решений MVP.
- [specs/00-product-scope.md](./specs/00-product-scope.md) — краткая продуктовая рамка: что строим и что доказывает MVP.
- [specs/01-implementation-roadmap.md](./specs/01-implementation-roadmap.md) — порядок разработки, чтобы можно было начинать без расползания scope.
- [specs/02-electron-architecture-cqrs.md](./specs/02-electron-architecture-cqrs.md) — Electron best practices, IPC-границы и CQRS-подход.
- [specs/03-data-storage.md](./specs/03-data-storage.md) — SQLite, файлы, snapshots, ресурсы и правила целостности.
- [specs/04-ui-ux-navigation.md](./specs/04-ui-ux-navigation.md) — основные экраны, навигация и UX-поведение MVP.
- [specs/05-worker-protocol.md](./specs/05-worker-protocol.md) — контракт Python worker'а и формат job/progress/error.
- [open-questions.md](./open-questions.md) — решения, которые лучше закрыть до или во время ранней разработки.

## Правило обновления

Если решение меняет scope, архитектуру или пользовательское поведение, его нужно записать в один из документов выше. `mvp-design-doc.md` остаётся каноническим обзором, а `specs/` содержит рабочие уточнения для реализации.

## Глобальный инженерный принцип

ImageGen Studio следует InvokeAI-first reference-подходу. Готовые механизмы InvokeAI заимствуются и адаптируются настолько, насколько это возможно в рамках выбранного стека, бизнес-логики и UX проекта.

NIH недопустим: сложные механизмы не проектируются с нуля, если уже есть рабочий подход в InvokeAI или другом зрелом решении. Изобретательство проекта сосредоточено в UX, продуктовой форме и workflows.

Для SDXL/Illustrious-like `.safetensors` checkpoint'ов MVP следует InvokeAI-пути: исходный файл остаётся пользовательским артефактом, worker грузит его через Diffusers single-file loading, а результат кэшируется на уровне загруженных моделей в RAM/VRAM. Неявная постоянная конвертация checkpoint'а в diffusers-директорию не выполняется.
