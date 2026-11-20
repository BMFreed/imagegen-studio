# Remove an accepted NoobAI result's embedding on the stock AppImage

## Coverage and source

This gate covers an installed, unshared embedding with zero queue or
install work. The [Model Manager removal contract](../features/model-manager.md)
requires an explicit review and keeps existing Projects, images and
their settings intact. The
[resource-specific removal checkpoint](./phase-4-model-removal-usage-research.md)
has the separate pending and running queue controls.

The clean local InvokeAI checkout was
`4875d96531ca6712b288f6e660fcbb34143408c1`. In
`invokeai/frontend/webv2/src/features/models/`,
`ui/shared/ModelActionsMenu.tsx` presents the confirmation and calls
`ui/detail/useModelActions.ts`, which requests the operation through
`data/api.ts::deleteModel`. In `invokeai/app/`,
`api/routers/model_manager.py::delete_model` claims the model key and
calls `services/model_install/model_install_default.py`. Its `delete`,
`unconditionally_delete` and `unregister` own the distinction between
a managed file and a registration pointing outside the library.
This gate uses Studio's existing removal review, queue owner and
permanent managed-file operation. [Main removal service](../../src/main/models/model-removal-service.ts)

## Fixture and native path

The 147,139,886-byte stock AppImage has SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The test uses a fresh app profile, the exact
[combined NoobAI EPS result](./phase-5-packaged-noobai-components-research.md),
and IllustriousPhoto Embedding from CivitAI
`2360940/2655289/2542976`. The embedding is 49,736 bytes with SHA-256
`91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36`.
The accepted negative embedding reference in the archived Project has
the exact catalog local IDs and file tuple.

The test copies the original Project, embedding and prior closed
catalog into owned paths. After the app initializes a fresh database,
an isolated fixture transaction copies only the three compatible
resource, version and file rows. It changes the file path to the
owned managed copy and clears the artwork URLs. The product opens
and removes the resource through the actual Model Manager. The
profile doesn't install a worker or download a model.

- Compare initially shows the saved embedding as **Removed** from
  the current draft. The accepted embedding reference is resolvable.
- The review lists one unshared managed file and no running work.
  Its action is disabled until explicit acknowledgement. Cancel keeps
  the file, catalog, Project and accepted record exact.
- A fresh review requires fresh acknowledgement. Remove permanently
  unlinks the managed copy and drops the three catalog rows while
  preserving one exact reference-identity ledger tuple. The
  borrowed embedding, borrowed catalog and Project archive stay exact.
- Compare shows **Missing resource**. Main still reads the original
  accepted embedding configuration, and the Project archive and PNG
  keep their hashes. The same condition persists after normal close,
  cold restart and explicit Open.

## Replay and scope

The final gate is
`~/.codex/artifacts/imagegen-studio/runs/packaged-noobai-component-remove/20261121-r4/`.
It records two normal physical closes and a zero launcher exit.
The retained states include the database before removal, the
database and Project after removal, and the pair after restart.
Exploratory failures were confined to fixture code. The first
fixture rejected digits in deployed identifier names and the next
two selected duplicate item headings in Model Manager.

The 205 focused model-removal, queue, Compare and resource-scope
tests passed with zero failures or skips. Typecheck, app build
and scoped lint passed.

Use the [private X11 launcher](./phase-5-packaged-project-import-research.md#reproduce)
with `IMAGEGEN_LINUX_PACKAGE_NOOBAI_COMPONENT_REMOVE=1` and a fresh
`remove` child of `runs/packaged-noobai-component-remove/<dated-run>/`.
The app and launcher share a 4 GiB zero-swap scope, with a 140-second
outer deadline. The exact input pins live in the
[fixture](../../scripts/fixtures/packaged-noobai-component-remove.mjs).

The stock gate uses an empty queue with one unshared installed
embedding. Affected pending cancellation, active worker refusal,
shared ownership, partial filesystem failure, reinstall after removal
and the shipping matrix remain separate cases.
