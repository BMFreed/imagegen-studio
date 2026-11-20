# Packaged AppImage with an installed engine

Qualification for the first local Linux/NVIDIA row of the
[MVP acceptance backlog](./mvp-acceptance-backlog.md). The existing offline engine
runner can now stop after one complete installation, with its final data root in
the normal packaged XDG layout. The existing AppImage smoke can use that exact
slot. These are harness changes. Product installation, worker protocols and
Project behavior use the existing owners.
[Runtime contract](../specs/07-python-runtime-management.md),
[offline engine](./phase-5-native-engine-qualification-research.md),
[standalone AppImage](./phase-5-linux-app-package-research.md).

## Source and scope

Re-read InvokeAI at `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/services/model_install/install_staging_ledger.py` and its callers
in `model_install_default.py` supply conservative staging ownership and restart
restoration. `invokeai/app/run_app.py` calls `app/util/startup_utils.py` for host
checks. `tests/family_e2e/test_gpu_memory.py` uses an isolated CUDA subprocess.
`invokeai/backend/image_util/infill_methods/lama.py` and its invocation caller
`invokeai/app/invocations/infill.py` supply actual installed LaMa execution.
The existing Studio runtime and test owners adapt these mechanisms. Packaging
uses the existing launcher-derived `electron-builder.config.cjs` and
`scripts/smoke-linux-package.mjs` normal-close checks.

The protected shared 0.14.0 slot is a distinct historical peer. Its latest
runtime pointer report matches its 72 payload members, but two common source
files differ from current source and it lacks the current dependency-policy
module and CPU export capability. The retained qualification transport instead
contains the current 73-file worker package byte for byte. Its Ed25519
qualification envelopes, 67-wheel lock closure and pinned LaMa resource are
reused. The original shared runtime and model catalog retain their prior state.

`full-engine-install` takes the same exact signed inputs as `full-engine` and
keeps the native install, fresh status, CUDA/refusal, LaMa and exit checks. It
creates one slot at its final absolute path. The packaged probe binds the report,
pointer, provenance and worker files, then expects both normal AppImage lifetimes
to return Ready for that runtime ID with available outpaint infill. An existing
application database at that location refuses this fresh-fixture profile.

The offline release selector is explicitly `qualification-0.1.0`. The built
desktop is `0.1.0-dev.1` and consumes an already active slot via its ordinary
runtime resolver. Setup under that desktop's app-version selector, packaged CPU
derivative execution, historical state upgrade, trained generation and visual
acceptance remain separate. Production publisher inputs are still unavailable.

## Executed evidence

- Actual host metadata preflight passed four checks on glibc 2.43, RTX 4080
  `sm_89`, NVIDIA driver `615.71.09`. The check qualifies this host against the
  fixture declaration and exercises refusal for unsupported driver/ABI floors.
- The signed engine run passed **11 checks**. It adopted the exact retained
  transport and built one managed CPython 3.12.13 slot with 67 distributions.
  Three CPU self-tests physically exited and advertised `export-composition`.
  The native checks exercised inference qualification, actual CUDA kernel
  work, the hidden-CUDA refusal and pinned LaMa infill. The installer consumed
  explicit local source, with the existing assembly, activation and pointer
  owners. The 8 GiB unit took 184.8 seconds with zero swap and recorded no OOM.
- The freshly built fused AppImage passed both normal lifetimes. Actual packaged
  Main/preload IPC reached Ready for the exact slot and LaMa, created and
  reopened an empty Project, loaded its stored thumbnail, and closed normally.
  Its two `.igs` bodies match byte for byte. The 76 input hashes (report, pointer,
  provenance and 73 installed worker files) match before and after both lifetimes.
  The probe records normal physical AppImage close and leaves short-lived
  readiness-worker termination details at the level exposed by Main.
- The same AppImage also passed two normal lifetimes on a separate empty data
  root without the engine. The default provider still reports unavailable Setup
  in that configuration. Both installed-engine SQLite snapshots passed an
  independent read-only `quick_check` and contain one Project and zero jobs.
- The runtime CLI and Linux package checks passed **69 tests**, and the changed
  qualification scripts passed lint.
- The packaged build reused local Electron and the native SQLite prebuild and
  disabled dependency rebuild for this isolated worktree. The earlier packaging
  attempt stopped at pnpm's linked-dependency check. The passing retry called
  the same Vite, Main build and electron-builder owners directly. The executed
  harness printed the old unavailable-Setup success label after emitting the
  correct installed-engine report; delivery selects the label by profile.

Artifacts and exact command/exit receipts are under
`~/.codex/artifacts/imagegen-studio/runs/packaged-installed-engine/20261118`.
An independent read-only audit recomputed the package, reports, input hashes,
Project and database checks, and reconciled process identities after close.
After its reader finished, exact owned extraction, package/build caches, source
worktree and short TMPDIR were disposed, reclaiming 3,792,633,856 allocated bytes.
The installed slot is reserved for the subsequent historical/real-model packaged
qualification at the same canonical path. It and the AppImage are the recorded
temporary budget exception. The local AppImage has qualification
scope. The eventual shipped app and runtime need production trust, delivery and
the supported hardware matrix. All eight promise statuses remain **«Пока не
обещать»**.

## Isolated installed worker protocol refusal

The protocol preflight re-read clean InvokeAI
`4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/run_app.py` calls the CUDA checks in
`invokeai/app/util/startup_utils.py`. The lifespan in `invokeai/app/api_app.py`
initializes services through `invokeai/app/api/dependencies.py`, and
`invokeai/app/services/invoker.py` starts and stops the session processor
around the other services. Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`
recognizes service readiness in `src/main/invoke-manager.ts` and handles
Repair in `src/main/install-manager.ts`. These mechanisms do not provide
a fixture for Studio's separate CPU and CUDA JSONL handshakes.

This preflight calls the production
[`ProjectWorkerClient`](../../src/main/projects/worker-client.ts) and
[`GenerationWorkerClient`](../../src/main/projects/generation-worker-client.ts)
against the actual signed slot's installed Python and worker at their
original paths. A private Linux mount namespace makes the installed runtime
read-only. For the middle case, the namespace binds a copy of
`imagegen_worker/__init__.py` with protocol `2` over the original path.
The first and last cases use the exact protocol `1` body. The isolated
worker uses a private writable `/tmp`. The initial attempt with read-only
`/tmp` stopped at CUDA startup before any protocol mismatch.

Both clients accepted protocol `1` and closed, refused protocol `2`
with the exact `WORKER_VERSION_MISMATCH` error, then accepted protocol
`1` again. All six checks left no unconfirmed worker exit. The original
installed module hash matched before and after. The systemd unit exited
0 in 18.688 seconds with zero swap. The evidence is under
`protocol-namespace-preflight-20261120` in the installed-engine run.
The AppImage's clean-start and upgrade behavior with an incompatible
worker is covered by the next checkpoint.

## Stock AppImage with an incompatible installed worker

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
In addition to the startup and service callers above, rechecked
`invokeai/app/services/shared/database/startup.py::init_database`,
`sqlite_migrator/sqlite_migrator_impl.py::run_migrations` and
`database/database.py::backup` for the pre-migration copy. The Retry route in
`invokeai/app/api/routers/session_queue.py` calls
`invokeai/app/services/session_queue/session_queue_default.py::retry_items_by_id`
after checking ownership, then validates and clones the saved graph. The
fixture uses Studio's existing runtime starts, queued input checks, SQLite
migration and Project Save. No production owner was added.

The stock AppImage used the production build `4f08d1cd` and SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The private mount namespace attaches fresh owned profiles at the installed
path and binds the exact Python, environment and inference resources there
read-only. Only the incompatible case mounts the same one-file protocol `2`
copy checked in the direct-client preflight. The launcher drops ambient and
inheritable capabilities before starting the package. Both the nested
user-namespace test and the actual packaged Main argv confirm that the
AppImage's sandbox fallback was unnecessary.

The historical profile restores five exact regular files from the prior
DB29 checkpoint, including the nonempty Project and the canceled job's
manifest and target PNG. It retains the original absolute paths inside the
namespace. SQLite creates one mode-`0600` backup with the DB29 schema and
rows, then adds migration `0030`. The restored Project's new inode and
mtime are checked against its actual file metadata. Other historical rows
stay intact, apart from ordinary Project index updates from opening and saving.

The incompatible runtime reports Repair. Main refuses Generate on the fresh
and historical Projects, and refuses the historical canceled job's Retry
with `GENERATION_RUNTIME_UNAVAILABLE`. The visible Queue Manager keeps the
canceled row and disables Retry. The two operations preserve the queue,
receipts and exact generation-input and staging inventory. Explicit Save
persists the edited prompt. The historical Project retains the exact Raster
and ICC, and its unavailable PNG/WebP match the bundled placeholders.
Both saved Projects reopen with byte-identical packages.

The initial isolation probe failed in the AppImage launcher under
`bwrap`. The passing mount namespace uses `unshare` and keeps the ordinary
fused package launch. One historical setup copy had permissive queue-input
directory modes. The application rejected that storage and no Retry was
tested in that attempt. The passing copy creates private directories.
An intermediate fresh-profile run recorded native exit 0 before a runner
edit interrupted its outer receipt. The final fresh-profile run retained
both successful exit receipts.

The healthy, fresh incompatible and historical incompatible profiles passed
at the same qualification source revision, with six normal physical exits
and 60 tracked process identities. The aggregate memory limit was 8 GiB
with zero swap. Independent readback verified all six closed SQLite stores,
the pre-migration backup, exact frozen input and saved Raster/ICC/preview.
The original slot still matched all 112 tracked app-data entries and 73
worker files. The focused runtime, worker-client, queue action, database
backup and package checks passed 338 tests with zero failures and zero skips.

Reports, checksums and the namespace commands are retained under
`protocol-appimage-20261120` in the installed-engine run. After process
and reader exit, cleanup released 472,600,576 allocated bytes from the
temporary package extraction and disposable profiles. The retained project
packages, databases, frozen input and diagnostics occupy about 10 MiB.
This covers the installed-worker refusal in the stock AppImage on one host.
Clean-machine installation, the app installer handoff and the shipping host
matrix have their own acceptance cases.
