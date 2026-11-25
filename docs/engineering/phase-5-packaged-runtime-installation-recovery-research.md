# Stock AppImage startup after runtime installer process death

## Scope and source

Studio base `684bf5c5c6ac99688b89a4d50f698a6dcfe2a3bb`. The previous
[packaged Repair control](./phase-5-packaged-runtime-rollback-research.md)
observed a caught worker refusal after candidate activation. This check
stops the actual `RuntimeInstallationController` owner in a dedicated Node
process and then runs the untouched stock AppImage on the owned AppData.
Coverage is limited to process-death recovery of the pointer and journal with
inert slots. The previous slot intentionally has no interpreter. Python worker
execution, assembly, power loss and public publisher delivery have separate
qualification requirements.
[Runtime installation contract](../specs/07-python-runtime-management.md#staged-install-lifecycle).

Consulted clean InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/services/model_install/install_staging_ledger.py` publishes
complete claims, checks Linux boot and process-start identity, sweeps
dead-owner claims with an inode recheck and retains recovery staging.
Its actual startup caller is
`invokeai/app/services/model_install/model_install_default.py::start`, which
runs the sweep and starts `_restore_incomplete_installs_async`. The app service
is wired through `invokeai/app/api/dependencies.py`. Studio's existing
controller applies the claim pattern to its own pointer and versioned slots.
The test uses that controller's existing publication and qualification
callbacks.
[Installation controller](../../src/main/runtime/runtime-installation.ts),
[status and Repair admission](../../src/main/runtime/index.ts).

## Fixture and native consumer

Run the private KDE Wayland launcher with
`IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=runtime-installation-recovery` and
`IMAGEGEN_RUNTIME_INSTALLATION_CUT=before-publication` or `post-qualifying`.
Use an empty owned
`runs/packaged-runtime-installation-recovery/<date>-rN/runtime-installation-recovery`
directory with a neighboring version-1 `package-proof.json` that pins the
AppImage's canonical path, size and SHA-256. The wrapper uses a short owned
`TMPDIR`, 4 GiB zero swap and a 150-second deadline. Each cut has its own
fresh AppData and two AppImage lifetimes.

The real installer writes its claim and journal and prepares both inert slots.
At the first cut, the controller has removed both incomplete markers and
synced the temporary candidate pointer before rename. At the second cut,
the controller has published the candidate and persisted `post-qualifying`
before the qualification callback returns. The child publishes a synced
side receipt and stays alive. The controller refuses a concurrent recovery
with `RUNTIME_INSTALL_BUSY` while the exact PID, boot ID and start ticks
still match. The parent sends
SIGKILL only to that owned child, requires the child close receipt with
SIGKILL and checks that the original process identity has gone before
AppImage startup. Its cut-time pointer, claim, journal and slots still match
after reaping.
[Producer](../../scripts/fixtures/packaged-runtime-installation-cut.ts),
[native reader](../../scripts/fixtures/packaged-runtime-installation-recovery.mjs).

## Executed result

Stock AppImage SHA-256
`a186c307649f181e9bf71c87b4c1d32f748a0ef885a35ab86476ef10bb6bf311`.
Both wrapper commands exited zero.

| Cut                                  | Stock startup and reopen                                        | Durable runtime state                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Before pointer publication           | Ordinary invalid-runtime detail for the synthetic previous slot | Previous pointer bytes and inode retained, journal marked `rolled-back`, install claim gone, synced candidate temporary retained |
| During post-activation qualification | Details say recovery is required before image work can start    | Candidate pointer, `post-qualifying` journal and install claim retained byte-for-byte                                            |

Both slots and their file identities survived both lifetimes in each case.
The transient sweep claim was absent after settlement. Each lifetime opened
the same saved Project and then closed normally. All four saved Project
copies matched their originals and the four closed indexes kept exactly
one ready Project per lifetime and zero queue, receipt and seed entries.

Independent readback verified the AppImage and ASAR, 18 distinct source pins,
both producer deaths, 40 exited application identities, the `.igs` members,
the SQLite bodies, both slots and the exact branch-specific metadata. Each
run stayed in one 4 GiB zero-swap scope. The larger sampled peak was
1,240,203,264 bytes with no memory-limit or OOM events.

Stock Repair reported `RUNTIME_INSTALL_UNAVAILABLE` in both cases and had
no active installation or confirmation. The stock Main has no configured
installation backend. The packaged status distinguishes the two states.
A separate host invocation of the real `RuntimeManager` with a counting
empty release loader reached the loader once after safe recovery and never
called it in `post-qualifying`, where Repair returned
`RUNTIME_INSTALL_RECOVERY_REQUIRED`. That controlled call is separate from
the stock UI result.

Runs `20261124-r2` and `20261124-r3` carry the two passing reports, receipts
and screenshots. The initial X11 attempt in `20261124-r1` stopped because
Xvfb was absent on the host. It did not create an installation owner or
launch the app. The succeeding runs used the existing private KDE Wayland
launcher.

Typecheck, AppImage packaging, scoped ESLint, Prettier and syntax checks
passed. The focused runtime suite using the verified 17-file config snapshot
passed 246 cases with zero failures and two skips. The actual LaMa
publication and actual host preflight opt-ins were skipped. The earlier
config-free run remains in the receipts and is not added to this total.
Cleanup reclaimed 550,010,880 allocated bytes from exact private build and
fixture paths. The retained evidence includes the regular pointer, journal,
claim or temporary file as applicable, slot files, original link metadata,
closed Projects and indexes, screenshots and process receipts.

## Stock startup while the runtime installation owner is alive

Studio base `cc808287`. Rechecked the clean InvokeAI checkout at
`64ff2c600f04d220e470fdaeec570bd402af42a7`. The current
`invokeai/app/services/model_install/install_staging_ledger.py` publishes
the claim with Linux boot ID and start ticks, and
`sweep_stale_claims` preserves owners whose exit cannot be established.
The startup path in `model_install_default.py::start` sweeps before
`_restore_incomplete_installs_async`. The API startup in
`invokeai/app/api/dependencies.py` constructs the installer through
`invokeai/app/services/model_manager/model_manager_default.py`.
The Studio fixture exercises the
existing `RuntimeInstallationController.recover` → `RuntimeManager.getStatus`
→ runtime IPC → renderer notice path with the same real owner held at each
cut. The previous two post-exit launches are still checked.

The installer remained alive throughout a complete AppImage lifetime at
each cut. The controller returned `RUNTIME_INSTALL_BUSY` and the native
status reported that recovery was required before image work. The saved
Project opened through Home, and the app closed normally before the
controller test ended the installer. The pointer, journal, claim, slot
members and temporary pointer matched their pre-launch witnesses. The test
then reaped the exact owned installer and confirmed the original PID/start
identity had gone before the next cold startup.

| Cut                                  | While the owner is alive                                               | After the installer exits                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Before pointer publication           | Old pointer and `activating` journal survive with the claim            | Same pointer, `rolled-back` journal and removed claim. The notice reports an invalid runtime for the inert slot. |
| During post-activation qualification | Candidate pointer and `post-qualifying` journal survive with the claim | The same pointer, journal and claim remain. The recovery notice persists.                                        |

All six normal AppImage lifetimes opened the saved Project without saving
or generating. Each closed index kept one ready Project and an empty
generation queue. Stock Repair still returned `RUNTIME_INSTALL_UNAVAILABLE`
with zero active operations. The empty release-loader control still reads
its source once after the safe recovery and zero times at the retained cut.
The disposable slots contain no executable interpreter. This covers
startup admission and process exit with inert payloads. Installed worker
health, power-loss durability and production release delivery are separate
boundaries.

Passing runs `20261125-r2` (post-qualifying) and `20261125-r3`
(before publication) reuse the byte-pinned stock AppImage
`bead81dfeb229ee31d174fd0793cf479aa53e8284ef4ceefc914c0ff175c9078`
from the Project export qualification. Its 43 build files matched the
packaging manifest. No production source changed since that build.
Both runs used private KDE Wayland with 4 GiB, zero swap and a 150-second
deadline. Run `20261125-r1` reached all three lifetimes, then the outer
wrapper refused the old expectation of two. The wrapper now checks the
exact names and requires normal physical close for each lifetime.

The isolated AppImage in `20261125-r4` changed only the bundled
`RuntimeManager.getStatus` recovery branch. The real installer and kernel
claim were unchanged. The app showed the ordinary invalid-runtime detail
while the owner was still alive, and the exact native recovery-detail
assertion failed. The failure includes the actual accessibility tree.
The test AppImage still closed normally. The original stock package and
the tracked sources were untouched by the mutation. Repeating the same
pre-publication test with the exact stock AppImage in `20261125-r5`
passed all three lifetimes again.

The independent R2/R3 readback verified the AppImage, ASAR, wallet helper,
19 distinct source pins, six closed Projects, six SQLite snapshots and
both branch-specific sets of retained runtime metadata. It confirmed
physical exit of all 60 recorded AppImage identities and both installers.
The higher sampled peak was 1,334,218,752 bytes. The focused runtime,
IPC and package matrix passed 485 cases. The two opt-ins for actual LaMa
publication and host preflight were skipped. Scoped ESLint, formatting
and syntax checks passed.

Cleanup freed 588,738,560 allocated bytes by removing the private mutation
build, fixture profiles and scratch. The receipt rechecked 209 evidence
files and includes 31 copies of exact runtime metadata and slot contents.
The reusable stock package stays at its original path.
