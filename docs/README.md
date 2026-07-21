# ImageGen Studio Docs

Документация проекта хранится в `docs/`, чтобы большой MVP-документ не превращался в единственное место для всех решений.

## Главные документы

- [mvp-design-doc.md](./mvp-design-doc.md) — канонический обзор продуктового scope и архитектуры MVP.
- [specs/00-product-scope.md](./specs/00-product-scope.md) — краткая продуктовая рамка: что строим и что доказывает MVP.
- [specs/01-implementation-roadmap.md](./specs/01-implementation-roadmap.md) — порядок разработки, чтобы можно было начинать без расползания scope.
- [specs/02-electron-architecture-cqrs.md](./specs/02-electron-architecture-cqrs.md) — Electron best practices, IPC-границы и CQRS-подход.
- [specs/03-data-storage.md](./specs/03-data-storage.md) — SQLite, `.igs`, staging candidates, accepted-result provenance, ресурсы и правила целостности.
- [specs/04-ui-ux-navigation.md](./specs/04-ui-ux-navigation.md) — основные экраны, навигация и UX-поведение MVP.
- [specs/05-worker-protocol.md](./specs/05-worker-protocol.md) — контракт Python worker'а и формат job/progress/error.
- [specs/06-python-worker-tooling.md](./specs/06-python-worker-tooling.md) — development tooling, типизация, linting и formatting для Python worker'а.
- [specs/07-python-runtime-management.md](./specs/07-python-runtime-management.md) — `uv`, app-managed CPython, versioned environments, staged installation, activation и rollback Python runtime.
- [features/README.md](./features/README.md) — каталог фич: scope, reference, решения и acceptance criteria.
  - [features/home-screen.md](./features/home-screen.md) — UX главной страницы: Workspaces, project browser, preview, new/import project flows, Trash и recovery states.
  - [features/model-manager.md](./features/model-manager.md) — user flow и scope Model Manager: CivitAI URL import, install queue, managed model list, metadata, missing-resource diagnostics.
  - [features/presets.md](./features/presets.md) — Project preset UX: компактный Invoke-like selector, editable apply draft, partial apply и create/edit mode Preset Manager.
  - [features/project/generate-mode/README.md](./features/project/generate-mode/README.md) — карта фич `Project` / `Create`: structured prompt tokens, bbox, Smart Patch Layer, LoRA, embedding prompt tokens, dynamic prompting, staging и regional guidance.
  - [features/project/undo-redo.md](./features/project/undo-redo.md) — project-local undo/redo для `.igs` document mutations.
  - [features/project/document-lifecycle.md](./features/project/document-lifecycle.md) — dirty/save/autosave/recovery/close lifecycle opened `.igs` document.
  - [features/queue-manager.md](./features/queue-manager.md) — Invoke-like persistent Queue Manager для frozen generation jobs и temporary candidate outputs.
  - [features/project/generate-mode/tag-autocomplete.md](./features/project/generate-mode/tag-autocomplete.md) — Danbooru-style tag autocomplete для prompt editor.
- [open-questions.md](./open-questions.md) — решения, которые лучше закрыть до или во время ранней разработки.

## Vue/Naive Prototype App

- [prototype-app](./prototype-app/) — текущий источник истины для интерактивных Home, Project, Model Manager и preset-system прототипов на реальных компонентах Naive UI.

`prototype-app` — это отдельный Vite/Vue/TypeScript playground для итераций над UI. Он не является production renderer'ом. Для уже реализованных в нём поверхностей код компонентов, mock-state и Playwright-сценарии являются источником истины по layout, visible labels, состояниям и пользовательским переходам. Текстовые документы описывают production intent и обязаны синхронизироваться с прототипом, а не переопределять его поведение.

Корневой URL открывает Home. Остальные Vue-поверхности выбираются query-параметром `prototype`: `home`, `project`, `model-manager`, `preset-manager`, `apply-preset` или `save-preset`.

Home mock-сценарии выбираются через `?prototype=home&scenario=default|first-run|no-model|problems`.

Project открывается через `?prototype=project`; его стабильные mock-сценарии выбираются через `?prototype=project&scenario=default|empty-project|errors|regional-guidance|smart-patch|staging`.

Tooling проекта использует `pnpm`. Основные команды для Vue/Naive prototype app:

- `pnpm run prototype:dev`;
- `pnpm run prototype:typecheck`;
- `pnpm run prototype:build`;
- `pnpm run prototype:test` / `pnpm run prototype:screenshots` — Playwright-сценарии Vue-прототипов.

## Правило обновления

Если решение меняет scope, архитектуру или пользовательское поведение, его нужно записать в один из документов выше. `mvp-design-doc.md` остаётся каноническим обзором, а `specs/` содержит рабочие уточнения для production-реализации. Для Home, Project, Model Manager и preset-system визуальное/интерактивное поведение сверяется с `prototype-app`; его компоненты, mock state и Playwright-сценарии являются источником истины для реализованных UI-переходов.

## Глобальный инженерный принцип

ImageGen Studio следует InvokeAI-first reference-подходу. Готовые механизмы InvokeAI заимствуются и адаптируются настолько, насколько это возможно в рамках выбранного стека, бизнес-логики и UX проекта.

NIH недопустим: сложные механизмы не проектируются с нуля, если уже есть рабочий подход в InvokeAI или другом зрелом решении. Изобретательство проекта сосредоточено в UX, продуктовой форме и workflows.

Для SDXL/Illustrious-like `.safetensors` checkpoint'ов MVP следует InvokeAI-пути: исходный файл остаётся пользовательским артефактом, worker грузит его через Diffusers single-file loading, а результат кэшируется на уровне загруженных моделей в RAM/VRAM. Неявная постоянная конвертация checkpoint'а в diffusers-директорию не выполняется.
