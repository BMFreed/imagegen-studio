# Exact CivitAI embedding Repair in the stock AppImage

This check covers a saved NoobAI EPS Raster whose exact IllustriousPhoto
embedding still has a catalog record but whose managed file is missing. The
[Model Manager contract](../features/model-manager.md#missing-resource-repair)
allows the user to review and redownload that exact CivitAI file while keeping
the resource identity and Project references. The
[managed removal check](./phase-5-packaged-noobai-component-remove-research.md)
covers the different starting state where the catalog records are gone.

## Source basis

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/models/ui/add-models/useInstallActions.ts`
passes the source-scoped credential through
`invokeai/frontend/webv2/src/features/models/data/api.ts::installModel`.
`invokeai/frontend/webv2/src/features/models/ui/install-queue/useInstallJobActions.ts`
uses the same API when resubmitting an install. In the InvokeAI API server,
`invokeai/app/api/routers/model_manager.py::install_model` calls
`heuristic_import`, `_import_from_url` and `_enqueue_remote_download` in
`invokeai/app/services/model_install/model_install_default.py`.
`invokeai/app/services/download/download_default.py::_do_download` streams the
authenticated body. Invoke's `get_model_records_by_hash` documents stable hash
lookup across reinstallations where the UUID changes. The Studio gate exercises
its existing exact-version repair transaction, which retains the resource,
version and file records, through the packaged renderer and Main.

## Fixture and assertions

The pinned 147,139,886-byte stock AppImage has SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The SquashFS `resources/app.asar` body matches the retained stock package
manifest. That manifest records 42 built files and the ordinary Main entry
point. Its Main source hash matches the checkout, and the model backend,
migrations, preload, Model Manager and Compare owners are unchanged from the
[earlier packaged consumer checkpoint](./phase-5-packaged-noobai-queue-remove-research.md).
The package predates the later Home recovery focus change.

The fixture copies the saved Project and the three original catalog rows from
the prior live install into a fresh application profile. It removes only its
own verified managed copy to prepare the missing-file case. The CivitAI
model/version/file tuple is `2360940/2655289/2542976`. The file has 49,736
bytes and SHA-256
`91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36`.

- Compare identifies the missing generated-side reference and opens the
  version in Model Manager. Repair opens the exact version URL and selects the
  original file. Cancel leaves the three catalog rows, install queue, managed
  path and Project unchanged.
- Explicit confirmation runs one live download. The Main install job and
  ready artifact identify the exact source and transferred byte count. The
  existing resource, version and file IDs, Default and managed path stay the
  same. The file verification timestamp advances and the repaired bytes
  match the pinned SHA-256.
- Closing Model Manager returns to Compare with its unavailable resource
  action removed and focus on Close. The saved Raster still uses its
  original embedding, while the current draft still omits it. The accepted
  index and Project bytes remain exact.
- The isolated credential is removed before normal close. After cold reopen,
  Compare, the exact catalog rows, the repaired file and the install job
  agree with the first lifetime. Reopening the Project advances its last-opened
  timestamp.

## Observed result

Run `20261121-r3` passed with two normal physical exits and launcher code 0.
The single 4 GiB scope peaked at 1,090,002,944 bytes and recorded no OOM
events. The first attempt verified the completed live download and stopped
on a fixture locator that expected a capitalized status. The second reached
the restored Compare and stopped on a fixture assertion that expected focus
on the link that disappears after Repair. Both attempts closed normally.
The final run checks the lowercase status and the Compare Close button's
focus fallback. The 125 focused Model Service, repository and Compare tests
passed. The original packaged Remove mode also passed with two normal closes
in `packaged-noobai-component-remove/20261121-r6`. Scoped ESLint, formatting
and syntax checks passed.

An independent readback checked 25 SQLite tables and 30 migrations, the stable
resource IDs, the repaired bytes, both Projects and the physical exit receipts.
The retained evidence is under
`~/.codex/artifacts/imagegen-studio/runs/packaged-noobai-component-repair/`.
After the audit released its readers, disposal of the three owned profiles and
scratch directories reclaimed 30,572,544 allocated bytes. The three closed
R3 database snapshots, matching Projects, repaired file, screenshots and audit
receipt remain available.

## Replay

Use the [private X11 launcher](./phase-5-packaged-project-import-research.md#reproduce)
with `IMAGEGEN_LINUX_PACKAGE_NOOBAI_COMPONENT_REPAIR=1` and a fresh `repair`
child under `runs/packaged-noobai-component-repair/<dated-run>/`. Provide a
private `IMAGEGEN_LINUX_PACKAGE_NOOBAI_TOKEN_FILE` and remove that temporary
file at exit. The app and launcher share a 4 GiB scope with zero swap and a
140-second outer deadline. The gate uses one installed embedding identity,
no installed worker and a real CivitAI endpoint. A later Default, a corrupted
file, a missing catalog record and shipping delivery require their own
evidence. The [product promise statuses](../product-promises.md) are unchanged.
