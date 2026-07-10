# Feature Catalog

Feature documents describe user-facing capabilities separately from the large MVP design document.

Each feature should answer:

- `Feature` — what the user can do.
- `Reference` — mature product or implementation to learn from.
- `ImageGen Studio decision` — take, adapt, defer, reject, or replace with another mature reference.
- `Scope` — `MVP`, `Post-MVP`, `Later`, or `Rejected`.
- `Dependencies` — UI, storage, worker, Model Manager, canvas, presets, or other features.
- `Acceptance criteria` — how we know the feature is implemented.

The feature catalog is a scope-control tool. It should make explicit what is included, what is deferred, and what is intentionally not part of the feature.

For surfaces already implemented in `docs/prototype-app`, the Vue components, mock state and Playwright scenarios are authoritative for visible UI and interaction behavior. Feature documents describe and explain that behavior plus production-only requirements; they must label behavior that is not yet interactive instead of presenting it as prototype coverage.

## Features

- [Project / Generate mode](./project/generate-mode/README.md)
- [Home Screen](./home-screen.md)
- [Model Manager](./model-manager.md)
- [Presets](./presets.md)
- [Project undo / redo](./project/undo-redo.md)
- [Queue Manager](./queue-manager.md)
