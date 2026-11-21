# Signed AppImage relaunch with the installed worker

This checkpoint combines the [signed recovery and native relaunch path](./phase-5-public-appimage-recovery-research.md)
with the [installed engine and Project Save checks](./phase-5-packaged-runtime-continuity-research.md).
The three packages use qualification-only signing and a loopback feed.
Their versions are 0.1.0, 0.2.0 and 0.3.0, built from the same application
sources at `de964e25` with the existing observation bootstrap.

## Source and fixture

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/services/model_install/install_staging_ledger.py` publishes
its claim, durably replaces the marker and preserves ambiguous entries.
Its install startup and transfer callers are in `model_install_default.py`.
`invokeai/app/api_app.py::lifespan` invokes `api/dependencies.py::initialize`
before services use the stable root. The dependencies owner checks abandoned
workers before opening that root. The clean Launcher `c267bdb4` calls
`src/main/updater.ts::checkForUpdates` from `main-process-manager.ts` and
delegates the install handoff to `quitAndInstall`. The existing Studio update
and runtime owners supply the app-specific signed installation and slot checks.

The qualifier claims the idle retained runtime and temporarily displaces
its ordinary non-runtime AppData by same-filesystem rename. It keeps that
installation at its original canonical path so the saved Python pointer
requires the same executable. The old profile's full inventory and the
selected engine inputs are verified around the run. A small owned copy of
the retained 48×32 Raster Project supplies data for the ordinary Save path.

The recovery runner uses the controlled picker responses in A to cancel
and then save signed B to a fresh path. B opens this Project, edits its
prompt and uses ordinary close consent to Save and install C. C must be a
new physically observed Main at the same recovered AppImage pathname. The
private X11 run holds the controller and enrolled applications in one 4 GiB
user service with zero swap, with B and C checked against the same kernel
cgroup identity. The original KDE observation path remains available for
its existing fixture runs.

The startup recovery projection and the installed engine status are two
different reads. C's signed version-1 application release authenticates
the target and leaves the application runtime declaration unverified.
The installed image engine separately reports the original slot ready.
Actual Save in C must publish a new revision and rendered CPU preview from
the original Raster. The exact `.igs` and closed SQLite are retained after
the owned applications exit and before the original test profile returns.

## Executed checks

R1 passed. A, B and C had distinct Main PIDs and reported normal exit code
0 in the private X11 session. B closed its database once and requested
Electron relaunch. The release gate observed B's physical exit before
letting C continue Main startup on the same pathname. The qualifier verified
C's executable identity and reopened B's saved Project revision. Startup
made no network requests and both stages retained their respective predecessor.

B and C reported the same installed `linux-nvidia` runtime ID and ready
outpaint resource after startup, including the runtime's lightweight CUDA
readiness probe. Each Save used the installed CPU derivatives worker. The
two new revisions kept the 48×32 Raster, rendered merged preview and
WebP thumbnail with exact decoded pixels and retained ICC bytes. The
closed SQLite Project index points to C's saved revision. The qualifier
restored the original 112 AppData entries by identity and bytes and
rechecked the 77 installed engine inputs.

The focused runtime, worker, application update, Linux package and
resource-limit selection passed 211 tests with zero failures or skips.
`app:build`, the three AppImage builds and scoped syntax, ESLint and Prettier
checks passed. The package check matched 42 compiled files per image. The
native fixture used 12 pinned checkout files and a 300-second service
deadline. The largest recorded cgroup memory peak was 3,210,260,480 bytes.

The package manifest's `embedded.executableSha256` was sampled by
electron-builder's `afterPack` hook before its fuse changes. The signed
artifact identity binds the final AppImage body. The independent readback
verified the final fuse settings on all three images and reproduced each
manifest executable digest by restoring only the original fuse bytes.

The independent artifact audit also verified all three Ed25519 release
bodies, both stage predecessors, the saved images and closed SQLite, exact
restoration and exit of all 24 recorded process identities. The final
database contains 30 installed migrations, one rendered Project and empty
generation and model tables. The audit read existing files and process
receipts without launching the apps.

The local evidence lives in `runs/packaged-recovery-action/20261121-runtime-r1`
and `runs/packaged-installed-engine/20261118/signed-update-r1` under the
artifact root. It retains both saved `.igs` packages, closed SQLite,
signed stage metadata, payload hashes, the independent audit and restoration
receipt. Cleanup removed the three idle payload and scratch directories
after the audit released its readers and reclaimed 2,193,645,568 allocated
bytes. The reusable runtime and pinned inputs stay available for replay.

This run covers signed fresh-path recovery and the subsequent native update
on one host with separate installed-slot readiness and save checks. Trained
inference after update, interruption of a running generation, production
signing and feed, legacy-process ownership and stage retirement remain open.

## Replay

Run `pnpm run app:build` and then
`node --import tsx scripts/prepare-packaged-recovery-action.mjs <build-run>`.
Use a fresh owned `runs/packaged-recovery-action/<date>-runtime-rN` directory
with lifecycle state `running`. Launch the installed-runtime qualifier via
the private X11 wrapper in `scripts/fixtures/packaged-project-chooser-x11.py`
with `--xvfb <owned-Xvfb> -- node --import tsx scripts/qualify-packaged-installed-upgrade.mjs`.
Pass `--engine-report <installed-engine.json> --recovery-run <build-run>`
and `--artifacts <engine-run>/signed-update-rN`. The latter must be a fresh
child of the report's directory. The original slot and the historical
48×32 Project are pinned inputs. Use one 4 GiB user service with zero swap,
a short owned temporary directory and a 300-second deadline.
