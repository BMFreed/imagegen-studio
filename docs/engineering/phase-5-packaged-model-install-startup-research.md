# Cold startup after interrupted model installations

The [managed model library contract](../contracts/managed-model-library.md)
and [Model Manager evidence](./phase-1-model-manager-evidence.md) cover
terminal install failures, abandoned staging files and unreferenced
managed bytes. The [shutdown check](./phase-5-model-install-shutdown-research.md)
exercised drain and restart with an instrumented Main. This check
starts a stock AppImage on a closed profile prepared at the interruption
boundary and visits the real catalog and Install Queue on each startup.

## Source and packaged consumer

Studio base `135ffe7cabd26aac4c1d15838764244335b4b3df`. Re-read clean
InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/dependencies.py` starts the Invoker and services.
`invokeai/app/services/model_manager/model_manager_default.py::start`
starts the installer. In `services/model_install/model_install_default.py`,
`start` schedules `_restore_incomplete_installs_async`, which invokes
`_restore_incomplete_installs`. The installer reads eligible unclaimed
entries from `install_staging_ledger.py::recoverable_installs` and
resumes supported staging data. This qualification exercises Studio's
existing terminal failure and explicit retry contract.

Studio Main awaits `ModelInstallCoordinator.initialize` before model
IPC is available. It settles active job and artifact rows in one
repository transaction and then sweeps matching staging files and
unreferenced managed bodies. Installed file references protect the
published bytes. The fixture observes the same rows, storage and UI
after each startup.

The stock AppImage is 147,049,484 bytes with SHA-256
`f34da4d3a4e13d1172fff312689a9a91afe71d25166b2ae3ce4361475caec06b`.
Read the embedded ASAR directly from SquashFS and matched the retained
42-file build manifest's ASAR hash. The startup, model and renderer
owners used here match the packaged sources. The existing
[IllustriousPhoto Repair](./phase-5-packaged-noobai-component-repair-research.md)
supplies a pinned 49,736-byte embedding body for the installed control.

## Prepared cases

Use four unfinished jobs to cover waiting, active download, artifact
verification and job verification. Under the real serial installer,
artifact verification occurs while its job is downloading, and a job
reaches verifying after its artifacts become ready. The fixture
represents those boundaries in one closed database for coverage.

Expect `failed/interrupted` on each unfinished job and only its
previously active artifacts. The completed and canceled controls,
ready artifact metadata, progress counters, source identity and
installed resource identity stay exact. Remove the owned UUID staging
parts and unreferenced managed bodies. Preserve installed bytes and
neighbor files outside the cleanup patterns. Compare the full closed
database before startup, after the first normal close and after a second
cold reopen. The queue and catalog must agree with the stored outcome.

## Executed result

R2 passed with two normal application exits and wrapper exit 0. All
four unfinished jobs and three active artifacts became
`failed/interrupted`. The verifying job's ready artifact row survived,
as did the completed install, the canceled install and the registered
IllustriousPhoto file with its existing IDs and digest. The expected
changes were confined to the job and artifact tables.

The model store removed two UUID staging parts and two unpublished
managed files, including the repair-name variant. It preserved the
three near misses and the same-name control outside the model root.
The real Install Queue showed the terminal statuses and their reasons.
The model detail showed the ready version as Default. The catalog
had one resource and reported exactly 49,736 installed bytes on both
starts. The two post-close SQLite files were byte-identical.

R1 passed the packaged IPC readback and stopped at an ambiguous Home
selector because the sidebar and empty-generation banner both show
Manage Models. Its app closed normally. R2 selected the sidebar
action and passed the full sequence in a fresh profile.

The R2 scope used a 4 GiB limit and zero swap over both lifetimes.
It peaked at 995,188,736 bytes with no OOM events. All 238 focused
model, download, maintenance and shutdown tests passed. Typecheck,
the application build and scoped ESLint passed.

An independent audit rehashed the stock AppImage, its ASAR, 15 source
pins, and the installed and original model bodies. The three closed
SQLite copies contain 25 tables and 30 migrations. The audit checked
the exact four job and three artifact changes, the surviving file
identities, and the exit of all 18 recorded application processes.
Both runs retain their logs and closed stores under
`runs/packaged-model-install-startup/20261122-r1` and `20261122-r2`.
After the audit, cleanup reclaimed 27,234,304 allocated bytes from
12 idle profile and scratch paths. Retained files were rehashed after
disposal.

## Replay and boundary

Use the [private X11 launcher](./phase-5-packaged-project-import-research.md#reproduce)
in a 4 GiB zero-swap scope with a 150-second outer deadline.
Set `IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=model-install-startup`.
Use a fresh `model-install-startup` child of
`runs/packaged-model-install-startup/<dated-run>` under the artifact
root, an adjacent `package-proof.json` and the pinned stock AppImage.
The packaged scenario prepares the persisted boundary in a closed
profile. Actual interruption during a provider transfer and shipping
delivery remain outside this check.
