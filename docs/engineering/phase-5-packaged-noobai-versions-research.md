# NoobAI versions, Default and portable relink in AppImage

This checkpoint extends the isolated Model Manager catalog from the
[managed EPS qualification](./phase-5-packaged-noobai-install-research.md).
It uses the same retained stock AppImage and verified 42-file desktop
build. The original EPS file stays at its content-addressed path. Before
the catalog is advanced, its closed SQLite database and file identity
are retained as evidence. Both version cases use the normal Preview,
explicit Install, download and publication owners.

| Resource | CivitAI model / version / file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| NoobAI-XL EPS | 833294 / 1022833 / 928571 | 6,938,040,416 | ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1 |
| Cyberfalafel v-pred v1.2 | 1147756 / 2679856 / 2566634 | 6,938,040,794 | edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d |
| Cyberfalafel v-pred v1.1 | 1147756 / 2468033 / 2356667 | 6,938,040,794 | e3af301ae8c62073a7d28426c2e748b6953d7d6f0ad9a7b42a88f867e8b17337 |

Both Cyberfalafel files have the same model ID and distinct versions,
file IDs and bytes. EPS is an independent catalog resource. This lets the
test verify explicit Set Default within the Cyberfalafel card and an exact
portable v1.2 reference when v1.1 is Default. The products' existing default
and project ownership contracts are exercised as written.
[Model Manager contract](../features/model-manager.md#installed-versions),
[version 1.2 metadata](https://civitai.com/api/v1/model-versions/2679856),
[version 1.1 metadata](https://civitai.com/api/v1/model-versions/2468033).

## InvokeAI source basis

Re-read the local clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/routers/model_manager.py::install_model` calls
`invokeai/app/services/model_install/model_install_default.py::heuristic_import`,
`_import_from_url`, `_import_remote_model` and `_enqueue_remote_download`.
The download worker in `invokeai/app/services/download/download_default.py`
resolves the authenticated source, streams to a partial and renames the
completed file. Studio's matching production path is exercised through an
actual CivitAI account and its own content-addressed Model Install Coordinator.

Invoke's editable model defaults are keyed to an individual model record.
Studio already owns its per-resource version default in Model Service and
Model Repository. For portable input, Invoke's
`invokeai/frontend/webv2/src/workbench/projects/projectFile.ts::importProjectFile` and
`workbench/projects/invk/importProject.ts::readInvkArchive` read the project, and
`model_manager.py::get_model_records_by_hash` calls
`model_records_sql.py::search_by_hash` for changing model identities.
Studio's current Project Service and Model Service use an exact provider
tuple, family and SHA-256 and update the destination's draft registry IDs.

## Managed installation results

Both authenticated downloads completed through the retained stock AppImage,
SHA-256 `15d10d8c73305769cbe9ee68b89b8265b56ab427b811acc745d41a4f0f6fce35`.
Preview was bound to the exact requested file. Separate normal restarts
reopened each completed job and ready file after credential removal.
Independent readback streamed each new model body for its SHA-256,
checked the earlier file identities and verified the closed SQLite snapshots.
The two Cyberfalafel versions have one resource record and separate ready
files. Installing 1.1 left 1.2 as Default. The separate EPS resource,
file and Default persisted. The source lacked an explicit prediction type
for both Cyberfalafel versions. The UI showed the assumed default.

| Live operation | Terminal transfer time | Bounded service time |
| --- | ---: | ---: |
| Install v1.2 and reopen | 426.215 s | 450.956 s |
| Install v1.1 and reopen | 440.640 s | 470.313 s |

The focused baseline passed 235 tests with zero failures or skips.
Each live installation ran across two bounded 4 GiB scopes with zero
swap. Checks of 14 retained install diagnostics found no active test token
or signed URL query markers. The isolated catalog credential file and both
temporary credential files were absent at settlement.

## Default, exact relink and reopen

The stock AppImage changed Cyberfalafel Default to 1.1 via Model Manager.
The next Project picker selection used 1.1. The Project previously saved
with 1.2 reopened clean on 1.2 at its original document revision. EPS kept
its own Default. The changed setting persisted across a normal close and
restart.

For the portable test, the harness copied the exact signed-worker `.igs`
to the isolated managed workspace. Main indexed the copy and the driver
opened it through Home. The KDE chooser pilot did not expose an owned X11
file dialog. Use of workspace discovery leaves the system Import Project
dialog outside this evidence.

The stock Model Manager saved V-prediction for the exact 1.2 file. The
Project's Link installed version action updated the destination's local
resource and version IDs to 1.2 while 1.1 remained Default. The draft's
stored advisory prediction and the accepted V-prediction configuration
stayed equal. The complete accepted raster layer and its provenance
matched, and the PNG was byte-identical. Save wrote the changed
binding and regenerated the derived previews. Reopen showed the same
saved archive and raster hashes.

The integrated qualification ran in 72.363 s with four normal AppImage
closes and physical scope confirmations. Its initial footer miscounted
the closes. The structured report and four individual exit receipts give
the actual count. Three earlier attempts reached Default and stopped at
driver navigation. The final run used separate lifetimes for Default
change, relink and their reopen checks, starting each at real Home.
The focused tests and native checks cover these exact cases. The prior
worker generation checks remain separate evidence.

## Storage and retention

The run's cleanup released temporary extraction roots and one old
generated Python cache after checking process exit and readers, freeing
3,948,544 allocated bytes. The original closed EPS, two-file and three-file
catalog snapshots, native controls and exact portable fixtures stay with
the evidence. The reused profile has three managed bodies
totaling 20,814,122,004 B. They are retained for the remaining NoobAI
release cases.

The ext4 volume had 4.33 GB available after the native check. The
same-filesystem floor for clean Setup is 28,217,106,280 B before launch
for the exact qualification payloads. It includes the signed threshold
of 20 GiB still free at assembly. Repair has to keep its previous good
slot at that point. No successful Setup or Repair was executed in this
checkpoint. [Setup disk controls](./phase-5-packaged-runtime-setup-research.md)

## Evidence boundaries

The catalog belongs to the existing test profile. Fresh run output and
temporary credentials remain in separate owned paths. The live installation
launcher and native scope have a combined 8 GiB ceiling with zero swap.
The actual version payloads, local SQLite records, the Project picker and
portable accepted image/configuration are judged independently. The
portable source is the retained v1.2 Project from the signed worker pilot.
All eight promise statuses remain **«Пока не обещать»**.
