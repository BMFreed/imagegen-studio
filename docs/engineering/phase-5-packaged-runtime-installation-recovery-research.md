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
