# Recovery after Main exits during a live CivitAI download

The [prepared startup matrix](./phase-5-packaged-model-install-startup-research.md)
covers inactive catalogs and persisted install states. This check takes
the interruption boundary from a live provider transfer in the unchanged
stock AppImage. It stops the owned Main, keeps the actual SQLite/WAL and
partial-file evidence, and reopens the same profile twice.

## Source and fixture

Studio base `587a6e6d86301b4f599c86093722de581c74bae8`. Re-read clean
InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/dependencies.py` starts the Invoker and services.
`invokeai/app/services/model_manager/model_manager_default.py::start`
starts the installer. In
`invokeai/app/services/model_install/model_install_default.py`,
`_import_from_url` and `_enqueue_remote_download` pass the source to
the download service. `invokeai/app/services/download/download_default.py::_do_download`
streams into a partial file and can resume it using validated range
metadata. Invoke startup uses `_restore_incomplete_installs` and
`install_staging_ledger.py::recoverable_installs` to resume eligible
marked transfers. This check exercises the existing Studio startup
contract and its terminal `failed/interrupted` state.

The stock AppImage is 147,049,484 bytes with SHA-256
`f34da4d3a4e13d1172fff312689a9a91afe71d25166b2ae3ce4361475caec06b`.
Its embedded ASAR matches the retained 42-file build. Eleven current
Main, renderer and preload sources match the packaged owners.
The test reuses the real CivitAI VAE preview and exact selection from
the [live component install](./phase-5-packaged-noobai-components-research.md).
The exact file is `1219546/1594319/1494323`, size 334,640,988 bytes,
with advertised SHA-256
`fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6`.
Its same-digest primary neighbor remains separate in the preview.

## Exact interruption

The isolated profile starts with an empty catalog and install queue.
The test reviews and approves the file through the actual Model Manager.
Once Main has admitted the job and captured its credential, the test
removes the encrypted copy through the normal API. The cut requires a
persisted `downloading` job with positive bytes and one unique regular
UUID staging part smaller than the expected body. It rechecks the
job, file identity and incomplete size immediately before signaling.

The AppImage and controller share one bounded private X11 scope.
The pidfd helper checks the actual controller parent, wrapper and Main
ancestry, UID, start time, group and extracted executable. It establishes
profile ownership through Main's open file descriptor for the exact
private SQLite device and inode.
It verifies this authority before any provider work. The second check
signals only the enrolled Main. The controller corroborates the actual
abnormal exit and confirms physical exit of the enrolled cohort.

The test captures the raw SQLite, WAL and SHM after physical exit and
reads them from a disposable clone. The retained partial evidence is
limited to a 64 KiB prefix and the full file's size and inode. The next
startup must remove the incomplete file and settle the same job and
artifact without creating a catalog entry. A second cold startup
checks idempotence against the first closed database.

## Executed result

R4 passed on the real VAE transfer. At the last check before signaling,
the UUID part contained 1,245,184 bytes. The same inode contained
1,441,792 bytes after Main and the enrolled processes exited. The job's
last committed progress in WAL was 401 bytes. That counter is written
asynchronously and can lag the staging file. The job still read
`downloading`, with no published resource.

The first cold startup removed the part and changed the exact job and
its primary artifact to `failed/interrupted`. The real queue showed the
failure and the exact version. The catalog and registered files stayed
empty. The second cold startup displayed the same terminal state.
Both recovery lifetimes closed normally. Their closed SQLite copies
are byte-identical.

The first two attempts stopped at the test ownership checks before any
provider action. R1 assumed Main was a direct wrapper child. Its
private launcher reached the outer deadline, and the disconnected
owned portal mount was removed after exit. R2 accepted the ancestry
and stopped at the exact command-line flag assertion. R4 used the exact open
database descriptor as profile evidence. R3 stopped during credential
setup. The same credential passed direct validation with the
production client, and the packaged R4 attempt connected successfully.

R4 used one 4 GiB scope with zero swap and a 170-second outer deadline,
peaking at 969,637,888 bytes with no OOM events. All 285 focused model,
transfer and process-scope tests passed. Typecheck, application build
and scoped ESLint passed.

The independent audit read the exact AppImage and ASAR, 19 source pins
and all retained database bodies. It reconstructed the database from
342 WAL frames and found the live job in the resulting database. The saved
prefix decoded as a Safetensors header describing 248 contiguous
tensors and the same advertised file size. The audit checked the
one-job and one-artifact delta across all 25 SQLite tables and all
30 migrations. All 30 observed application process identities had
exited, and both credential paths were absent.

The successful run and the three earlier diagnostics live under
`runs/packaged-model-install-interruption/20261122-r1` through `20261122-r4`
in the artifact root. After physical exit and independent readback,
cleanup reclaimed 427,806,720 allocated bytes from 24 idle paths.
The retained logs, database bodies and prefix were rehashed after cleanup.

## Replay

Use [the private X11 launcher](./phase-5-packaged-project-import-research.md#reproduce)
with `IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=model-install-interruption`,
a fresh matching child of `runs/packaged-model-install-interruption/<dated-run>`,
the pinned stock AppImage and an adjacent `package-proof.json`. The
outer scope name is `igs-model-install-interruption-<dated-run>.scope`.
Provide the credential through a private temporary
`IMAGEGEN_LINUX_PACKAGE_NOOBAI_TOKEN_FILE` and remove it on launcher
exit. The run retains only the partial prefix, identity receipts and
SQLite bodies. Its boundary is one file on the live provider and
Main process death on this Linux host.
