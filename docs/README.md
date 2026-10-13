# ImageGen Studio Docs

Документация проекта хранится в `docs/`, чтобы большой MVP-документ не превращался в единственное место для всех решений.

## Главные документы

- [mvp-design-doc.md](./mvp-design-doc.md) — канонический обзор продуктового scope и архитектуры MVP.
- [product-promises.md](./product-promises.md) — реестр коротких нормативных продуктовых обещаний, явных не-обещаний, публичных статусов и ссылок на supporting contracts.
- [contracts/](./contracts/) — supporting contracts PP-001–PP-004: композиция интерфейса, явные действия, ownership и managed model library.
- [engineering/README.md](./engineering/README.md) — адаптация процессов work project, действующие правила и pending pilots.
  - [research-protocol.md](./engineering/research-protocol.md) — исследование перед изменением по уровню риска.
  - [review-protocol.md](./engineering/review-protocol.md) — проверка обещанного поведения и evidence.
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
  - [features/presets.md](./features/presets.md) — supporting contract PP-006: сохранение и переиспользование generation settings, editable apply draft, partial apply, missing-resource diagnostics и Preset Manager.
  - [features/project/generate-mode/README.md](./features/project/generate-mode/README.md) — карта фич `Project` / `Generate`: plain-text CodeMirror prompt editor, bbox, Smart Patch Layer, LoRA, embedding refs, dynamic prompting, staging и regional guidance.
  - [features/project/generate-mode/generation-provenance.md](./features/project/generate-mode/generation-provenance.md) — supporting contract PP-005: provenance принятого результата, read-only comparison, preset mapping и Smart Patch boundaries.
  - [features/project/undo-redo.md](./features/project/undo-redo.md) — project-local undo/redo для `.igs` document mutations.
  - [features/project/document-lifecycle.md](./features/project/document-lifecycle.md) — supporting contract PP-007: portable `.igs`, dirty/save/autosave/recovery/close lifecycle.
  - [features/project/generate-mode/generation-results.md](./features/project/generate-mode/generation-results.md) — supporting contract PP-008: temporary candidates, explicit acceptance и undo.
  - [features/queue-manager.md](./features/queue-manager.md) — Invoke-like persistent Queue Manager для frozen generation jobs и temporary candidate outputs.
  - [features/project/generate-mode/tag-autocomplete.md](./features/project/generate-mode/tag-autocomplete.md) — Danbooru-style tag autocomplete для prompt editor.
- [open-questions.md](./open-questions.md) — решения, которые лучше закрыть до или во время ранней разработки.

Текущий generation checkpoint: [Anima image MAX→0](engineering/phase-2c-anima-image-seed-wrap-research.md): Euler256 IMG/normal mixed-alpha OUT: 8 admissions/completions/accepted layers, 6 Save-reopen packages, 4 own MAX/0 wholeRGBA matches и 2 same-prompt contrasts. Independent raw readback PASS (18700 checks), 6 cursor/Save snapshots, 11 old SQL tables и 43 worker identities сохранены; 3 OUT previews / 166656 protected source pixels. Actual Main modulo fault: 18 executions, 2 RED / 16 GREEN; restored и guarded-cleaned 584 files. Portable provenance сохраняет raw weighted text, actual seed и resource/source context; compiled/step/posterior проверены отдельно в frozen worker inputs. Следующий finite gate — Anima image cap32/prefix refusal; broader inputs/quality/Invoke parity/fullMVP/release остаются открытыми.

Предыдущий checkpoint: [Installed Anima image Random → Fixed](engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. На этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — Anima image cap32/prefix refusal.

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

Если решение меняет ожидания пользователя или сознательно отказывается от целого класса возможностей, нужно обновить краткую запись в [product-promises.md](./product-promises.md) и её linked supporting contract. Product promise не считается готовым публичным утверждением, пока его не подтверждают реализованный flow, UI и тесты.

Матрица в реестре отражает coverage, публичную готовность и gaps. Изменение
статуса требует актуального evidence, а не только принятого roadmap. Перед
medium/high-risk изменениями применяется [research protocol](./engineering/research-protocol.md),
при review — [review protocol](./engineering/review-protocol.md) по уровню риска.

## Глобальный инженерный принцип

ImageGen Studio следует InvokeAI-first reference-подходу. Готовые механизмы InvokeAI заимствуются и адаптируются настолько, насколько это возможно в рамках выбранного стека, бизнес-логики и UX проекта.

Reference-first подход подчиняется [продуктовым обещаниям](./product-promises.md). Наличие готового механизма в InvokeAI или другом продукте не является основанием переносить его пользовательскую форму, если она конфликтует с принятыми promise, negative scope или UX-инвариантами ImageGen Studio.

NIH недопустим: сложные механизмы не проектируются с нуля, если уже есть рабочий подход в InvokeAI или другом зрелом решении. Изобретательство проекта сосредоточено в UX, продуктовой форме и workflows.

Для SDXL/Illustrious-like `.safetensors` checkpoint'ов MVP следует InvokeAI-пути: исходный файл остаётся пользовательским артефактом, worker грузит его через Diffusers single-file loading, а результат кэшируется на уровне загруженных моделей в RAM/VRAM. Неявная постоянная конвертация checkpoint'а в diffusers-директорию не выполняется.
