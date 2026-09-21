# Feature Catalog

Feature documents describe user-facing capabilities separately from the large MVP design document.

Each feature should answer:

- `Feature` — what the user can do.
- `Reference` — mature product or implementation to learn from.
- `ImageGen Studio decision` — take, adapt, defer, reject, or replace with another mature reference.
- `Scope` — `MVP`, `Post-MVP`, `Later`, or `Rejected`.
- `Dependencies` — UI, storage, worker, Model Manager, canvas, presets, or other features.
- `Promises` — relevant [product promises](../product-promises.md) and supporting contracts; a feature does not need a new promise if an existing one covers its user outcome.
- `Acceptance criteria` — how we know the feature is implemented.

The feature catalog is a scope-control tool. It should make explicit what is included, what is deferred, and what is intentionally not part of the feature.

For surfaces already implemented in `docs/prototype-app`, the Vue components, mock state and Playwright scenarios are authoritative for visible UI and interaction behavior. Feature documents describe and explain that behavior plus production-only requirements; they must label behavior that is not yet interactive instead of presenting it as prototype coverage.

## Features

- [Project / Generate mode](./project/generate-mode/README.md)
- [Home Screen](./home-screen.md)
- [Model Manager](./model-manager.md)
- [UX supporting contracts](../contracts/interface-composition.md) — PP-001 composition, [PP-002 intent](../contracts/explicit-intent.md), [PP-003 ownership](../contracts/canonical-ownership.md).
- [Managed Model Library](../contracts/managed-model-library.md) — supporting contract PP-004, resource identity and version lifecycle.
- [Presets](./presets.md) — supporting contract PP-006 для сохранения и повторного применения generation settings с pre-apply resource diagnostics.
- [Project undo / redo](./project/undo-redo.md)
- [Project document lifecycle](./project/document-lifecycle.md) — supporting contract PP-007, portable `.igs`, explicit Save and recovery.
- [GenerationResults And Staging](./project/generate-mode/generation-results.md) — supporting contract PP-008, explicit acceptance and undo boundaries.
- [Queue Manager](./queue-manager.md)
