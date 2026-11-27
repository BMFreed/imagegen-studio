# Packaged Home catalog performance

The release backlog calls for desktop performance evidence. The public scope
leaves general accessibility and performance targets open. This check records
a baseline for Home catalog size on the stock development AppImage, using the
existing Project writer, Main and renderer. [Acceptance backlog](./mvp-acceptance-backlog.md),
[open questions](../open-questions.md), [Home contract](../features/home-screen.md).

## Fixture and measurements

Use `IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=home-scale` with the private KDE
Wayland launcher and `IMAGEGEN_HOME_SCALE_PROJECTS=32` or `512`. Supply the
current AppImage and a fresh `runs/packaged-home-scale/<date>-rN/home-scale`
evidence directory plus a sibling `package-proof.json`. Its schema version is
1, with the package's canonical path, byte size and SHA-256. Use a short owned
`TMPDIR`, a 4 GiB user scope with zero swap and a 180-second wrapper deadline.
The fixture creates a fresh
Uncategorized workspace and uses `saveIgsPackage` to write each Project. The
files have distinct titles, document IDs and revisions. Each has one synthetic
2×2 Raster and the same small encoded images. The 32 files totaled 89,056 bytes
and the 512 totaled 1,424,896 bytes. [Fixture](../../scripts/fixtures/packaged-home-scale.mjs),
[packaged runner](../../scripts/smoke-linux-package.mjs).

Each population has one first index and one restart on the same AppData. The
OS cache remains in its ordinary state after fixture preparation and between
launches. Startup measures immediately before AppImage spawn to the exact list
at 1380×900 followed by two renderer frames. It includes AppImage extraction,
the renderer connection and test observation. Interactions run at 900×620,
DPR 1, using native KWin resizing and ordinary renderer controls. Each
lifetime records five searches, six layout changes, three loaded Inspector
previews and one Refresh that reaches `aria-busy` and returns to idle. These
samples include driver overhead and two frames.

## Results

| Projects | First index to all cards | Indexed restart to all cards | First Refresh | Indexed restart Refresh |
| -------- | -----------------------: | ---------------------------: | ------------: | ----------------------: |
| 32       |                   3.45 s |                       3.69 s |        0.44 s |                  0.41 s |
| 512      |                  11.43 s |                      11.21 s |        6.40 s |                  6.85 s |

Home's shell appeared at 2.80–2.99 seconds with 32 fixtures and at 4.94–5.06
seconds with 512. At 512, the longest observed search was 384 ms and the longest
layout change was 666 ms. The three previews in each lifetime all rendered.
CDP observed 3,269–3,278 DOM nodes and about 25 MiB of used JavaScript heap in
the 32-project runs, versus 40,730–40,741 DOM nodes and about 180 MiB in the
512-project runs. These counters cover the renderer at the settled-list sample.

Both untraced runs used AppImage SHA-256
`96dc47d03b9564fbf97192932e4b2d116f1510696fb19db721e7829a709897ad`, built
from production source at `3e28e688`. Independent readback rehashed the AppImage
and six shared qualification pins. All four lifetimes closed normally with
40 confirmed process exits. The fixture checked the closed SQLite index and
exact Project bytes after each close. The report covers small synthetic
Packages and this host. Larger Rasters, additional workspaces, other host
configurations and a public response-time target remain separate acceptance work.

An initial 512-project attempt stopped at the harness's five-second grid wait.
Its accessibility snapshot already showed 512 for Uncategorized while the
project pane was loading. The successful runs both use the same exact-card
observer with its 60-second bound before checking grid visibility.

The untraced receipts are in the local artifact root under
`runs/packaged-home-scale/20261123-r3` and `runs/packaged-home-scale/20261123-r4`.

## Repeated archive reads

A separate 512-project run traced `openat`, `openat2` and thread creation.
The reader follows `CLONE_THREAD` from each Electron Main PID and counts
successful read-only opens of the exact fixture paths. The first launch and
indexed restart each included one Refresh. They recorded 7,261 and 7,177
archive opens. In the two lifetimes, 489 and 509 of the 512 files were opened
exactly 14 times. Both
lifetimes closed normally. The latency table uses the earlier untraced runs.

The baseline source explains that observed minimum. Startup initializes and scans
Uncategorized. Home's `list` and `listWorkspaces` then independently scan
the workspace, and the ready Project summary opens the archive for recovery
inspection. Manual Refresh repeats the latter three checks. A full package
check opens the archive for preflight and again for member validation. Together
these paths account for 14 opens across startup and Refresh. Thumbnail and
preview access can add opens. The trace counts syscalls across a lifetime.
[Project service](../../src/main/projects/project-service.ts),
[workspace scanner](../../src/main/projects/project-index.ts),
[package validation](../../src/main/projects/igs-package.ts),
[recovery inspection](../../src/main/projects/project-autosave.ts).

The comparable InvokeAI paths were read from clean revision
`4875d96531ca6712b288f6e660fcbb34143408c1`. Model Manager and Model Select
share in-flight readiness reads through
`invokeai/frontend/webv2/src/features/models/data/modelsStore.ts` and
`invokeai/frontend/webv2/src/platform/state/singleFlight.ts`. The workflow library
separates initial and explicit refresh reads in
`invokeai/frontend/webv2/src/features/workflow/data/libraryBrowseStore.ts`,
backed by indexed records in `invokeai/app/api/routers/workflows.py`. Studio's
workspace discovery and portable `.igs` validation remain separate contracts.

Trace receipts are under `runs/packaged-home-scale/20261123-r5` in the local
artifact root. Scoped Prettier, ESLint, syntax checks and AppImage packaging
passed. Cleanup removed the development package, private profiles and scratch
after confirming physical exits and rechecking dependencies. It reclaimed
583,680,000 allocated bytes. The closed indexes, exact fixture and package
manifests, screen evidence and raw trace remain. The compressed trace's 456
entries were checked against their original SHA-256 hashes before disposal.

## Share discovery within one Home request

The implementation pass reread clean InvokeAI revision
`4875d96531ca6712b288f6e660fcbb34143408c1`. Under
`invokeai/frontend/webv2/src`, the consulted owners and callers were
`platform/state/singleFlight.ts`, `features/models/data/modelsStore.ts`,
`features/models/ui/ModelManagerView.tsx`, `ui/launchpad/ModelsNotice.tsx`,
`features/workflow/data/libraryBrowseStore.ts` and
`features/workflow/ui/library/WorkflowLibraryDialog.tsx`. The workflow API
caller boundary was `invokeai/app/api/routers/workflows.py`. InvokeAI shares
model readiness reads through an active request and clears ownership on
settlement. The workflow library starts a fresh explicit refresh. Its
indexed library does not have Studio's portable `.igs` scan or separate Home
card and sidebar projections.

Main already serialized the old requests under the catalog lock. Home now
requests both lists through one guarded IPC. The Project service shares each
successful workspace scan between the two projections for the lifetime of
that request. A subsequent request scans again. An unavailable workspace stays
eligible for the second projection to retry. Package validation, availability
checks and Recovery inspection still run through their existing owners. The
renderer publishes workspace counts with the combined response and falls back
to separate reads on error, so a failure elsewhere in the catalog can coexist
with healthy cards in the selected workspace. Both lists keep their own request
freshness checks, including before any fallback.
[Project service](../../src/main/projects/project-service.ts),
[Main](../../src/main/index.ts), [Preload](../../src/preload/index.ts),
[Home renderer](../../src/renderer/App.vue).

### Packaged comparison

| Projects | First index to all cards | Indexed restart to all cards | First Refresh | Indexed restart Refresh |
| -------- | -----------------------: | ---------------------------: | ------------: | ----------------------: |
| 32       |            3.45 → 3.16 s |                3.69 → 3.01 s | 0.44 → 0.30 s |           0.41 → 0.28 s |
| 512      |           11.43 → 8.81 s |               11.21 → 8.72 s | 6.40 → 3.65 s |           6.85 → 3.69 s |

Each column compares one baseline sample with one optimized sample on the
same KDE Wayland host. The fixture uses synthetic 2×2 Rasters and leaves the
OS cache in its ordinary state. Startup includes AppImage extraction and the
renderer connection. A separate trace with the new package recorded 5,213 and
5,129 successful archive opens, down from 7,261 and 7,177. The minimum fell
from 14 to 10 opens across startup and one Refresh, for the same 489 and 509
archives respectively. A shared scan eliminates two opens per archive on each
Home request. The comparison table uses untraced runs.

After the 512-project timing samples, the app detected three external changes
on an explicit Refresh. It showed a new title and revision for a replaced
`.igs` with the same identity, added the new Project and marked a moved file
missing with Open disabled. The closed index contained exactly 513 rows, and
the other 510 files and the moved file's bytes matched their input witnesses.
The freshness check is opt-in via `IMAGEGEN_HOME_SCALE_REFRESH_CONTROL=1`.
A semantic mutation that shared the completed-scan set across requests
returned the old title and omitted the newly added file in the Project service
test. The same test passed on the original and restored sources.
[Service tests](../../src/main/projects/project-workspaces.test.ts),
[native fixture](../../scripts/fixtures/packaged-home-scale.mjs).

Typecheck, AppImage build and scoped lint passed. The focused Node suite passed
134 tests and the renderer browser suite passed 26, including independent
failure handling and rejection of stale responses.
[Renderer tests](../prototype-app/tests/home-catalog-app.spec.ts).

All six app lifetimes closed normally. The optimized AppImage SHA-256 is
`9ceb182824db2a0363f787d52c735ce36711de0f02a0abf22b54051155b6388c`.
Independent live readback rehashed the package, current harness pins, 1,057
synthetic Projects and all three closed SQLite indexes. The independent trace
readback confirmed four fewer opens for every archive in both lifetimes. The
optimized receipts are under `runs/packaged-home-scale/20261123-r6` (32),
`20261123-r7` (512 and freshness) and `20261123-r8` (trace) in the local
artifact root. Cleanup reclaimed 1,117,245,440 allocated bytes from the private
profiles, scratch, source fixture and development packages. The closed indexes,
package hashes, measurement and freshness receipts, screenshots and the
454-member byte-verified trace archive remain.

The comparison establishes the reduction on this host for the fixture workload.
The next section adds a separate matched check with larger Rasters and linked
workspaces.

## Larger Rasters across linked workspaces

The stock AppImage consumes two matched 128-project fixtures under
`IMAGEGEN_HOME_SCALE_PROJECTS=128`. Set `IMAGEGEN_HOME_SCALE_FIXTURE` to
`linked-tiny` or `linked-raster`. Both profiles use the same 32/48/48
distribution across Uncategorized and two linked directories. The fixture
registers empty folders through the current Project repository and closes
SQLite with an empty Project index before writing the packages. This measures
discovery in packaged Main and browsing in packaged Home. The native Add
Workspace picker is outside this fixture.

`linked-tiny` uses the existing 2×2 control. `linked-raster` saves a real
1024×1024 RGB PNG as the Raster asset and full merged preview in every
package. The deterministic texture combines seeded high-entropy rows and
compressible rows. Both profiles retain the same small WebP thumbnail so
the comparison varies Raster and full-preview size with identical workspace
populations. Manifests pin every package and both preview encodings.
[Fixture](../../scripts/fixtures/packaged-home-scale.mjs),
[Home contract](../features/home-screen.md#imagegen-studio-decision).

Both launches in each profile measure exact card names and two rendered frames
after AppImage spawn, then Refresh, search, grid/list and three decoded Inspector
previews at 900×620. The test then selects each workspace and checks the exact
card set, count, selection and directory, refreshes the selected 48-card folder
and returns to all 128 cards. A successful Refresh requires the busy-to-idle
transition, expected rows and the absence of catalog errors. After each normal
close, the fixture checks each saved file's bytes and exact closed-index owners,
revisions and health. The default 32-/512-project and external Refresh modes
remain standalone controls.

The current source scan at InvokeAI
`4875d96531ca6712b288f6e660fcbb34143408c1` revisited
`invokeai/frontend/webv2/src/platform/state/singleFlight.ts`,
`invokeai/frontend/webv2/src/features/workflow/data/libraryBrowseStore.ts`,
its `features/workflow/ui/library/WorkflowLibraryDialog.tsx` caller under the
same frontend root and `invokeai/app/api/routers/workflows.py`. The InvokeAI
library refreshes indexed records and authorizes publication to the current
request. The new fixture exercises the existing Studio scan and does not
change the application's read or validation policy.

### Linked-workspace measurements

| Operation                         |    2×2 | 1024×1024 |
| --------------------------------- | -----: | --------: |
| First index to all 128 cards      | 4.21 s |    5.93 s |
| Indexed restart to all 128 cards  | 4.03 s |    5.72 s |
| Aggregate Refresh on first launch | 0.94 s |    2.49 s |
| Aggregate Refresh after restart   | 0.94 s |    2.48 s |
| Scoped Refresh on first launch    | 0.70 s |    1.86 s |
| Scoped Refresh after restart      | 0.73 s |    1.93 s |

The 128 archives totalled 356,224 and 202,856,320 bytes. Each large archive
contains the 791,080-byte PNG twice. Both profiles use the same AppImage,
KDE Wayland host (Core i9-11900KF, NVMe ext4), viewport, OS cache policy and
4 GiB zero-swap execution limit. There is one sample per operation and
lifetime in each profile. The large profile's scope peaked at 2.36 GiB
with zero memory-limit and OOM events.
With large Rasters, selecting each workspace took 1.89–2.40 seconds and
returning to all Projects took 2.54–2.65 seconds. All six full Inspector
previews in that profile reached the expected 1024×1024 dimensions in
100–117 ms from selection. Scoped Refresh still scans all workspace folders
for the sidebar counts. The 48-card label describes the active projection.
The measurements cover this workload and host. Several large layers per
Project, larger catalog populations combined with large Rasters, and the
supported host matrix remain open.

The packaged build and final three wrapper commands exited zero. The 32-project
regression detected an external replacement, addition and move on explicit
Refresh after restart. The index contained 33 rows, with the moved file marked
missing and 30 unchanged neighbors. All six final lifetimes closed normally.
An earlier large-Raster attempt reached normal close in both lifetimes but
failed the wrapper's end-of-run source hash check after the Refresh oracle was
edited. That attempt is excluded from the table. The two linked profiles were
then run again with the same pinned final fixture and no source changes.

The stock AppImage SHA-256 is
`7d99e49fe343b33bb2898b1e54d9d7797f255dd266f72cc26afd3284c9ab4e49`,
built from production source at `c0b52403`.
The artifacts are under `runs/packaged-home-scale/20261124-r4` (freshness),
`20261124-r5` (linked tiny) and `20261124-r6` (linked Raster), with the
build receipt in `20261124-r1` and the excluded run in `20261124-r3`.
Independent live readback verified the AppImage, 52 distinct source and build
pins, 289 `.igs` archives and the three final SQLite indexes. It decoded a
full Raster with Pillow and confirmed exit for all 60 final process identities.
Cleanup reclaimed 976,658,432 allocated bytes from the private profiles,
synthetic packages, development build and scratch. The measurements, checksums,
closed SQLite indexes and sample packages remain.

## Sidebar count after a workspace returns

The combined Home request could return one ready Project card and a zero
count for its folder. The first scan reported the folder unavailable and
the sidebar read the cached count. The card read retried after the folder
returned and indexed the Project.

The current InvokeAI checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`. The source check followed
`invokeai/frontend/webv2/src/features/workflow/ui/library/WorkflowLibraryDialog.tsx`
to `features/workflow/data/libraryBrowseStore.ts` and
`platform/state/singleFlight.ts` under the same frontend root. It also followed
`invokeai/app/api/routers/workflows.py` to
`invokeai/app/services/workflow_records/workflow_records_default.py`
and `invokeai/app/services/shared/database/queries/workflows.py`.
InvokeAI reads the list and its total together from the index. Studio applies
that ordering to its existing workspace scanner and reads the sidebar after
the card path has completed any applicable retry.

Healthy workspaces still complete one scan per combined request. A scoped
request can retry its selected folder. An aggregate request can retry each
unavailable folder. Cached counts still include unavailable Projects and
pending moves use their source workspace. External filesystem changes are
observed on a best-effort basis.

The regression moves a registered workspace away during the first scan and
restores it before the card read. With the original service it reaches the
ready card, then fails on `0 !== 1`. The corrected service returns the same
card and count one after two scan attempts. The saved `.igs` bytes match.
The aggregate control covers persistently missing folders and a healthy
neighbor. The final Node run passed all 162 focused tests across Project
Service, workspaces, index, Trash and relocation. Full typecheck, desktop
build and lint of the two TypeScript files passed. A separate source review
checked the scan order, retry scope, pending counts and IPC lock. The receipts
are under `runs/home-catalog-transient-retry/20261125`. This was a Main integration
check on SQLite and the real Project packages. The earlier AppImage
measurements remain the native baseline.
[Project service](../../src/main/projects/project-service.ts),
[workspace tests](../../src/main/projects/project-workspaces.test.ts).

## Four Raster layers per Project in Main

The CPU runner exercises the same `ProjectService.listHomeCatalog` used by
Home's IPC handler. Each profile has 128 real `.igs` archives in three
registered folders (32/48/48). The control has one 1024×1024 Raster per Project.
The treatment adds three distinct hidden 1024×1024 Rasters so both profiles can
keep the same primary Raster, merged PNG and WebP thumbnail. The Project writer
and closed-index assertions come from the packaged fixture. The one-layer
fixture preserves its original inputs and archive members.
[Runner](../../scripts/qualify-home-catalog-main.mjs),
[fixture](../../scripts/fixtures/packaged-home-scale.mjs),
[Home IPC](../../src/main/index.ts).

The current clean InvokeAI revision was
`4875d96531ca6712b288f6e660fcbb34143408c1`. The source check followed
`invokeai/frontend/webv2/src/features/workflow/ui/library/WorkflowLibraryDialog.tsx`
to `features/workflow/data/libraryBrowseStore.ts` and
`platform/state/singleFlight.ts` under the same frontend root. The API
`invokeai/app/api/routers/workflows.py` calls
`invokeai/app/services/workflow_records/workflow_records_default.py`, backed
by `invokeai/app/services/shared/database/queries/workflows.py`.
The qualification uses Studio's existing archive reader, scan and refresh
policy through their current owners.

| Main operation                   | 1 Raster | 4 Rasters |
| -------------------------------- | -------: | --------: |
| Open DB, initialize, first list  |   4.60 s |   11.58 s |
| Reopen indexed DB to first list  |   4.32 s |   12.92 s |
| Aggregate Refresh, same files    |   3.82 s |   10.70 s |
| Aggregate Refresh, changed files |   4.50 s |   10.93 s |
| Scoped Refresh, 49 cards         |   2.58 s |    8.62 s |

The profiles contain 202,856,320 and 506,926,848 archive bytes. Each operation
has one sample in a fixed order on the same host. The runner first creates
and hashes its files, then closes and reopens the real database and creates a
new service in the same Node process. The OS cache remains in its ordinary
state. The 120% CPU quota, 4 GiB memory ceiling and zero swap applied to the
whole run. Peak cgroup memory was 1.20 GiB with zero memory-limit and OOM
events. A game was open on the desktop during the run. These measurements cover
Main's archive and index work on this host. Native launch, visual preview
rendering and application performance targets require their own measurements.

The external-change Refresh found a same-path replacement with a new title and revision,
found a new Project in a linked folder, and marked the archive moved outside
the catalog as missing. The resulting 129 rows include 128 ready and one
`FILE_MISSING` entry. Sidebar counts are 32/49/48. All 126 unchanged neighbors
and the moved archive retain their exact bytes. The real preview reader served
the replacement and new Project's saved PNG and rejected the replaced and
moved entries' prior capabilities.

All 70 focused owner tests passed, alongside scoped lint, format and syntax
checks. An independent read-only audit checked all 514 rows in the four closed
SQLite copies, decoded seven PNGs and two WebP thumbnails, and matched 12 live
archive witnesses and both retained samples. The run exited zero. Following
physical exit and retention verification, cleanup reclaimed 716,541,952
allocated bytes from this run's synthetic payload. The reports, input hashes,
closed indexes and one sample per profile remain under
`runs/home-catalog-layered-main/20261125-r1` in the artifact root.

## Multi-layer Home in the AppImage renderer

The matched AppImage run uses the existing `linked-raster` control and
`linked-layered` with their shared CPU fixture. Each profile contains 128
Projects distributed 32/48/48, with the same saved 1024×1024 preview and
WebP thumbnail in both. The test runs the stock AppImage with
`APPIMAGE_EXTRACT_AND_RUN=1`, one private virtual KWin session per profile,
and `IMAGEGEN_HOME_SCALE_SOFTWARE=1`. The opt-in requires software Mesa and
asserts the private compositor's software mode and Chromium's disabled
hardware compositing.
[Packaged driver](../../scripts/smoke-linux-package.mjs),
[fixture](../../scripts/fixtures/packaged-home-scale.mjs),
[private Wayland launcher](../../scripts/fixtures/packaged-project-chooser-wayland.py).

The current InvokeAI source check at
`4875d96531ca6712b288f6e660fcbb34143408c1` followed the workflow library's
mount and refresh through
`invokeai/frontend/webv2/src/features/workflow/ui/library/WorkflowLibraryDialog.tsx`,
`features/workflow/data/libraryBrowseStore.ts`,
`invokeai/app/api/routers/workflows.py`,
`invokeai/app/services/workflow_records/workflow_records_default.py`, and
`invokeai/app/services/shared/database/queries/workflows.py`.
The clean launcher at `c267bdb439519216b277a7a8c6ad408b9d79efce` supplies
the packaging pattern in `electron-builder.config.ts`, the `package` command and
the Linux caller in `.github/workflows/build.yml`.

| Packaged Home operation          | 1 Raster | 4 Rasters |
| -------------------------------- | -------: | --------: |
| First index to all 128 cards     |  14.89 s |   24.04 s |
| Indexed launch to all 128 cards  |  13.29 s |   23.82 s |
| Aggregate Refresh on first start |   9.10 s |   20.47 s |
| Aggregate Refresh after restart  |   7.66 s |   18.81 s |
| Scoped Refresh after restart     |   5.50 s |   13.84 s |

All four lifetimes showed all 128 cards, searched by name, switched Grid and
List, and selected all three folders with exact sidebar counts. Each lifetime
loaded three saved Inspector previews at the native 900×620 window size.
The layered pair decoded those previews in 133–200 ms from selection. Both
profiles verified all archive bytes and their SQLite rows after each normal
physical close. Screenshot inspection at 900×620 confirmed that search,
folder counts, the selected card and Inspector preview were visible. Keyboard
and contrast acceptance need dedicated checks.

The build used source `2691507484ea0ba8b609a3020b600b6c1370b75f` and produced
AppImage SHA-256
`ba00ee21460d24561a7f43ebfaf3d6001d98d3f562055f398336635f4cea1ffb`.
The private compositor reported QPainter and Chromium reported
`gpu_compositing: disabled_software` in all four lifetimes.
Each profile had a 120% CPU quota, 4 GiB memory limit and zero swap. CS2
was open during the measurements. Each duration is one sample in fixed test
order with the normal OS cache. The measurements include AppImage extraction
and renderer work on this host. The release candidate still needs the
supported host matrix and settled performance targets.

An independent live audit rehashed the AppImage and verified all 40 process
identities had exited, both closed indexes with 256 exact rows and both sample
archives with decoded PNG and WebP members. Source review moved the Chromium
software assertion after bounded process enrollment so a failed check still
has process-exit authority. Two additional 32-project AppImage lifetimes
then passed on the final harness. Those lifetimes are outside the table.
All 47 resource-bound tests passed, along with scoped lint, format and syntax
checks.

The build receipts, matched profiles and 32-project regression are under
`runs/packaged-home-scale/20261125-r1` through `20261125-r4`. Cleanup after
physical exit and retention checks reclaimed 1,252,777,984 allocated bytes.
The reports, screenshots, source hashes, closed SQLite indexes and sample
archives remain.

## Reuse archive validation within one Home request

The clean InvokeAI source was `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/workbench/launchpad/home/RecentProjectsRow.tsx`
consumes the project library in `workbench/projects/library.ts` under the
same frontend source root. The library refresh shares an active request
through `platform/state/singleFlight.ts`. The project list in
`invokeai/app/api/routers/projects.py` calls
`invokeai/app/services/project_records/project_records_default.py`, which
projects lightweight SQLite summaries in
`invokeai/app/services/shared/database/queries/projects.py`.
The workbench boot in `workbench/projects/durableSyncedPersistence.ts`
selects and hydrates documents separately. Invoke's database summaries
have no external archive or separate filesystem recovery manifest to
validate. Studio keeps its package validation and adapts the lightweight
summary path to the already successful scan within one Home request.

Main records the exact ready package returned by the scanner. It shares
observations from completed workspace scans only. Before and after reading
the shadow manifest, Home matches the row's workspace and canonical path
and rechecks the file fingerprint, including device, inode, size,
modification time and change time. A terminal manifest status can use
that validation. A dirty shadow, missing scan observation or file change
uses the full archive reader and the ordinary shadow inspection. Opening
and resolving Recovery still use their own package checks. The ephemeral
scan observation is consumed within the same Home request.

The two regression cases replace the path with a corrupt file after the
workspace scan or after the preliminary shadow check. Both report an
invalid recovery check on the indexed card. The next Refresh marks it
corrupt, and the replacement bytes remain intact. The dirty shadow case
remains recoverable through Home and can still be opened and saved. An
isolated mutation removing the second fingerprint check fails the late
replacement test and passes its early-replacement neighbor. Restoring the
same source passes both.

The matched CPU runner used 128 projects in three folders with the same
128 four-Raster packages, 120% CPU quota, 4 GiB RAM and zero swap. These
are Main timings after initialization, with one sample per operation in
each run and the ordinary OS cache.

| Four-Raster Home operation in Main | Baseline | Shared validation |
| ---------------------------------- | -------: | ----------------: |
| First catalog on indexed restart   |   8.30 s |            4.69 s |
| Refresh, same files                |   7.90 s |            4.50 s |
| Refresh, changed files             |   7.66 s |            4.67 s |
| Scoped Refresh                     |   5.69 s |            4.71 s |

Both runs discovered the external replacement and added Project, marked
the moved archive missing, verified saved preview resources and preserved
the 126 unchanged neighbors. An independent audit verified 1,028 rows in
eight closed SQLite snapshots and rehashed 24 live and retained sample
archives. The final annotation adjustment emits identical JavaScript.
Code-order checks also match the measured and final method bodies and
preserve the order of other class members.

A separate `strace` run covered two calls to actual
`ProjectService.listHomeCatalog` after initialization, using the same
three packages. The control suppressed the scan observation. A ready
package with absent or clean shadow went from four successful read opens
to two. A dirty recoverable shadow still required four opens. The
catalog responses, package bytes and shadow states matched. The first
trace attempt stopped before measurement because normal Close retired
the clean fixture shadow. R2 created the clean manifest with Save and
`markClean` and verified all 24 trace files after their processes exited.

Local receipts and closed indexes are under
`runs/home-catalog-layered-main/20261125-repeat-read-a` and
`20261125-repeat-read-c`. Run B measured an intermediate implementation.
Its typecheck exposed saved-member access on a lazy loader. The final
implementation limits the preliminary check to the manifest and sends
dirty shadows down the existing reader.

The final source passed 198 focused tests, full typecheck and app build,
with scoped formatting and lint checks. The same source built an AppImage
that opened the 128 four-Raster Projects on private software-rendered KDE
Wayland at 900×620. The two lifetimes checked Grid and List, search, folder
counts and six saved Inspector previews. Both closed normally and
verified all 128 archive identities and the real index. First launch
reached all cards in 12.96 s and Refresh took 8.13 s. The indexed restart
reached all cards in 11.96 s and Refresh took 8.58 s. These are two
separate one-sample lifetimes with the existing 120% CPU quota. Peak group
memory was 2,377,981,952 bytes with zero swap and OOM.

Two earlier harness attempts stopped before launching Electron. One
lacked the package proof sidecar, and the other used a run name outside
the harness's accepted pattern. The successful attempt reused the
same AppImage bytes. Its reports, screenshots, closed index and sample
archive are under `runs/packaged-home-scale/20261125-r51`. The syscall
evidence is under `runs/home-catalog-repeat-read-trace/20261125-r2`.

## 256 projects with four Raster layers each

Consulted clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
In `invokeai/frontend/webv2/src/workbench`, the
`launchpad/pages/HomePage.tsx` and `launchpad/pages/ProjectsPage.tsx`
callers use `projects/library.ts` and `projects/api.ts`, with duplicate
requests shared by `platform/state/singleFlight.ts` under the frontend
source root. In the backend, `invokeai/app/api/routers/projects.py`
obtains the service from `invokeai/app/api/dependencies.py` and calls
`invokeai/app/services/project_records/project_records_default.py`.
Its `invokeai/app/services/shared/database/queries/projects.py`
queries return account-scoped project summaries. The Studio test uses
the existing archive discovery and workspace flows with a larger cohort.

The opt-in `linked-layered` profile adds 256 synthetic Projects, split
64/96/96 across three folders. Each archive contains four distinct
1024×1024 Raster assets and the saved preview. The corpus comprises
1,013,853,696 bytes across 256 archives. The profile requires software
compositing. Use `IMAGEGEN_HOME_SCALE_PROJECTS=256`,
`IMAGEGEN_HOME_SCALE_FIXTURE=linked-layered`, and
`IMAGEGEN_HOME_SCALE_SOFTWARE=1` in the existing private Wayland
`home-scale` harness.

The first attempt (`20261125-r52`) reached all cards in 31.80 s and
finished aggregate Refresh in 32.07 s. Its first AppImage launch closed
normally. The 330 s enclosing scope expired during the second launch's
folder navigation and returned 143. That launch left a screenshot and
an interrupted SQLite main/WAL/SHM set. Those bytes capture the
interruption. The first closed index's hash is in the measurement
receipt. The independent read-only audit found all 256 rows after
replaying 646 checksum-valid committed WAL frames in memory.

The full retry (`20261125-r53`) used the same AppImage
(`9df5920f071e776ca55e9c01dbb7dbb1e755986fe6f202ed0ffcd611c54dea95`).
The enclosing time budget was 450 s, with the same 120% CPU quota,
4 GiB memory limit and zero swap. Both launches reached every card,
matched titles and folder counts, exercised Grid and List, searched by
name, decoded three saved Inspector previews each and closed normally.
KWin ran with software Mesa and Chromium reported disabled GPU
compositing. Peak scope memory was 3,106,562,048 bytes, with zero
memory-limit and OOM events.

| Operation                                          |  First launch | Indexed restart |
| -------------------------------------------------- | ------------: | --------------: |
| First complete view, 256 cards                     |       25.40 s |         22.59 s |
| Aggregate Refresh                                  |       27.60 s |         23.73 s |
| Three folder selections, range                     | 15.15–20.70 s |   14.57–15.21 s |
| Scoped Refresh, 96 cards                           |       17.35 s |         17.31 s |
| Return to all 256 cards                            |       16.06 s |         15.77 s |
| Select and decode a saved Inspector preview, range |    225–350 ms |      150–233 ms |

Each column is one sequential sample on this host with the ordinary OS
cache. Startup includes AppImage extraction and initial rendering. These
results establish successful catalog operation for this cohort. The
observed 15–21 s folder switches and 24–28 s aggregate Refresh leave
response time open in the acceptance checklist.

In the current renderer, `selectWorkspace` clears the visible list
and invokes `refreshProjects`. The resulting `listHomeCatalog` call
awaits discovery across registered workspaces before returning the
selected folder's cards and sidebar counts. This is the path to profile
against ordinary explicit Refresh while preserving external changes and
recovery checks.

The independent live audit rehashed the package and source pins, 256
archives and 1,792 declared members. It matched the final closed SQLite
index's 256 ready rows and 30 migrations, checked integrity and foreign
keys, and confirmed both AppImage process groups had exited. The retained
evidence includes both screenshots and lifetime reports, the final closed
index and two sample archives. The R52 interruption retains its separate
SQLite trio and first-launch receipt. After exit and retention checks,
cleanup freed 3,411,804,160 allocated bytes across the scale and focus
runs. One verified AppImage is kept for the next CPU qualification.

## Browse folders from a completed Home catalog

Studio base `9cac30bac0736492d030076db793469e1e4c0a7c`. Re-read clean
InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`. Under
`invokeai/frontend/webv2/src/workbench`, the
`launchpad/pages/{HomePage,ProjectsPage}.tsx` callers use
`projects/{library,api}.ts`. The library publishes account-current
summary snapshots. `launchpad/projects/ProjectsBrowser.tsx` derives rows
from that snapshot via `projectLibraryView.ts` without a new fetch.
The `invokeai/app/api/routers/projects.py` handler calls
`app/services/project_records/project_records_default.py`, whose
`app/services/shared/database/queries/projects.py` query projects summaries
without opening documents. Invoke's summaries come from managed records.
Studio keeps its existing discovery and recovery checks for external
`.igs` files.

After a complete combined load, Home projects the same list for
`Projects` or the selected workspace. The sidebar switches views without
requesting a catalog, folder list or Trash list. Explicit Refresh and
Rescan still rediscover external files and publish current card and
sidebar data. An explicit Refresh while scoped loads a complete snapshot
so the user sees changes from other folders when returning to Projects.
Opening and recovery still validate the live files. The application
continues to refresh on Home return and after mutations. Independent
fallbacks use the current requested scope and cannot authorize fast
navigation. Superseded requests cannot publish a complete catalog.

A production-renderer browser check selected a card, switched through
two folders and the all-Projects view, and verified one initial catalog
and Trash request. Explicit Refresh in the first folder discovered a
change in the second folder. The second folder and aggregate then showed
the changed card from the same refreshed catalog. Running the same
check with the previous committed renderer reached the request-count
assertion and failed with five catalog and five Trash requests. The
restored version passed along with the existing fallback, stale-reply
and Remove from Home focus checks.

The stock AppImage in `20261125-r54` finished both private Wayland
lifetimes at 900×620 and closed normally. The matched R53/R54 fixture
has the same 256 titles, document identities and revisions, four Raster
assets, saved previews, per-file sizes and 64/96/96 split. Archive and
workspace path identities are pinned independently for each run.
Both scopes used 120% CPU, 4 GiB memory, zero swap and software
compositing. R54 peaked at 3,443,650,560 bytes with zero limit or OOM
events. These are one-sample comparisons on the local host.

| Operation                      |         R53 first / restart |     R54 first / restart |
| ------------------------------ | --------------------------: | ----------------------: |
| First complete view            |             25.40 / 22.59 s |         23.28 / 21.51 s |
| Three folder selections, range | 15.15–20.70 / 14.57–15.21 s | 0.18–0.38 / 0.21–0.34 s |
| Return to all cards            |             16.06 / 15.77 s |           0.56 / 0.53 s |
| Aggregate Refresh              |             27.60 / 23.73 s |         22.46 / 19.43 s |
| Scoped Refresh                 |             17.35 / 17.31 s |         16.75 / 15.12 s |

The regression distinguishes browsing from explicit file discovery.
The elapsed-time comparison leaves Refresh and supported-host
performance open. A separate audit rehashed 256 archives, 1,792
manifest members, 43 shipped application files, the ASAR, the native
wallet and the SQLite addon. The closed SQLite matched its 256 ready
projects and 30 migration pins, and passed integrity and foreign-key
checks. There were two normal closes and 20 exited process identities.

The same AppImage ran the keyboard, native folder picker, workspace
unregister and Trash restoration scenario. Escape and confirmed removal
returned focus to the expected actions. The different folder refused
Restore, and the original folder restored the exact Project after cold
reopen. An independent audit checked the three portal exchanges, three
Project pairs, both SQLite snapshots and both normal closes.
[Workspace preservation](./phase-5-packaged-workspace-chooser-research.md#workspace-removal-focus-and-search-contrast)

Final typecheck, app build, scoped lint, 65 Node checks and four
production-renderer browser checks passed.

Retained reports and bodies are under
`runs/packaged-home-scale/20261125-r54` and
`runs/packaged-workspace-trash-restore/20261125-r8`. Cleanup rechecked
110 retained files and reclaimed 1,587,011,584 allocated bytes. It
retired the superseded R53 AppImage after its cycle ended. The R54
AppImage, final closed index and two archive samples remain available.

## Time spent validating archives during explicit Refresh

Studio `8dde2807839a1bb96a224f8688c8f9681131a4b7` and clean InvokeAI
`64ff2c600f04d220e470fdaeec570bd402af42a7`. Re-read the Home and
Projects callers, library and API above, including
`platform/state/singleFlight.ts` and the backend list route and
summary query. The Invoke list reads already indexed database
summaries. Studio also supports external archives and performs
discovery, full archive validation and recovery checks on Refresh.
Invoke's managed project list has no external archive-validation
mechanism to adapt.

The diagnostic ran the existing 128-project, four-Raster Main
qualification with two timing wrappers. These call the original
`scanWorkspace` and `indexSaved` methods. Each call went through
`ProjectService.listHomeCatalog`, with 120% CPU, 4 GiB RAM and zero
swap. This measurement excludes Electron, IPC and renderer work.
Peak scope memory was 969,908,224 bytes, with no OOM or limit events.

| Main Refresh                    | Whole request | In workspace scans | In `indexSaved`, included in scans |
| ------------------------------- | ------------: | -----------------: | ---------------------------------: |
| Unchanged files                 |       4.484 s |            4.414 s |                            4.403 s |
| After external replace/add/move |       4.774 s |            4.763 s |                            4.747 s |
| Scoped after external changes   |       5.314 s |            5.307 s |                            5.279 s |

Every measured call did three workspace scans and checked 128 project
files. The run verified the replacement and addition, marked the moved
file missing, and retained 126 unchanged neighbors, preview checks and
closed SQLite snapshots. This puts over 98% of the unchanged Refresh in
the archive and index flow. Summary assembly and recovery annotations
outside all scans accounted for about 70 ms.

The separate V8 profile captured one additional visit to the stable
catalog after the external changes. It shows samples in file and ZIP
streaming, hash updates, Buffer allocation and garbage collection.
The `indexSaved` wall spans include archive reading, validation, waits
and SQLite writes. The V8 profile does not apportion native libuv work
or establish a timing for those operations in isolation.

The diagnostic, source pins and closed snapshots remain under
`runs/home-catalog-layered-main/20261125-refresh-profile`.
The independent audit matched 20 source pins, all 257 rows across the
two SQLite snapshots, 30 migrations and the external-change evidence.
After exit, cleanup rechecked 30 retained files and released
520,179,712 allocated bytes. The application build and the new
Invoke test controller's Ruff and Python syntax checks passed.

## External changes on the pinned candidate

The [pinned stock AppImage](./phase-5-pinned-stock-candidate-research.md)
ran the existing 32-project external-change control on a private KWin
session with software compositing. The clean InvokeAI
`64ff2c600f04d220e470fdaeec570bd402af42a7` project library in
`invokeai/frontend/webv2/src/workbench/projects/library.ts` calls
`invokeai/app/api/routers/projects.py` for indexed summaries. Studio's
existing fixture exercises external archive discovery through the real
Home Refresh action.

After an indexed restart, the driver replaced one archive, added one
and moved one outside the workspace. The UI matched the replacement's
new title, discovered the addition and disabled Open on the missing
row. The closed SQLite index held 33 project identities with one
missing row and 30 unchanged neighbors. Both AppImage lifetimes closed
normally. The final Refresh took 341 ms in this one small-fixture
sample. The 120% CPU, 4 GiB, zero-swap scope peaked at 1,586,032,640
bytes with zero OOM events. The native receipt and final index are
under `runs/packaged-home-scale/20261125-r55`.

This run verifies freshness on the pinned package.

## Reuse validated metadata for byte-identical archives

Base `52385cc27ccce7ba161e492f2ee84a9bc81624e9`. Re-read clean InvokeAI
`64ff2c600f04d220e470fdaeec570bd402af42a7`. The Home and Projects
workbench callers use `invokeai/frontend/webv2/src/workbench/projects/library.ts`
and `projects/api.ts`. The list route in `invokeai/app/api/routers/projects.py`
calls `invokeai/app/services/project_records/project_records_default.py`
and the summary query in `invokeai/app/services/shared/database/queries/projects.py`.
This path reads indexed summaries. It has no external archive validation
cache. Studio adapts the fixed-buffer full-file hashing in
`invokeai/backend/model_hash/model_hash.py`, used by
`invokeai/backend/model_manager/model_on_disk.py` and
`invokeai/backend/model_manager/configs/factory.py`.

The scan under the existing Project path lock reads a bounded stream
of the entire regular file and checks its open descriptor and path
identity. A SHA-256 hit reuses previously validated metadata. A miss
runs the full archive parser and requires the same raw digest around
that validation before retaining metadata. The in-memory cache holds
up to 512 paths with at most 64 KiB of source document JSON per entry
and hashes archives up to 128 MiB for reuse. Uncached files at the
limit go straight to the existing parser so scans of larger folders
keep a stable admitted subset. The same SQLite transaction rebuilds
the parent and accepted-result projection. Direct package indexing,
Open and recovery keep their own file checks.

The warmed regression rebuilt deleted accepted-result rows and diagnosed
same-size archive corruption with the original inode and mtime. Restoring
the exact archive restored the index. Removing only the digest equality
check made the corruption test return `ready` instead of `corrupt`.
The rebuilding neighbor passed. Restoring the exact source made both
tests pass. All 135 focused Project and application-update tests, full
typecheck, app build, packaging and scoped lint passed.

The separate 128-project Main comparison used the same four-Raster
fixture and CPU limit. Unchanged Refresh took 4.63 s in the baseline
and 0.85 s on the final source. After external changes, it took 4.37 s
and 0.92 s. Both executions found the replacement and added Project,
marked the moved source missing and preserved 126 neighbors. These
are individual measurements from the baseline and final runs under
`runs/home-catalog-layered-main/20261125-digest-*`.

| 256 layered Projects            | R54 first / restart | R57 first / restart |
| ------------------------------- | ------------------: | ------------------: |
| AppImage spawn to all cards     |     23.28 / 21.51 s |     21.80 / 20.32 s |
| Aggregate Refresh               |     22.46 / 19.43 s |       3.30 / 3.09 s |
| Scoped Refresh showing 96 cards |     16.75 / 15.12 s |       2.59 / 2.35 s |

Each column contains one measurement per lifetime on the local ext4
host with 120% CPU quota, a 4 GiB memory ceiling, zero swap and
software compositing. R57 used the same synthetic 64/96/96 workload.
Both R57 lifetimes confirmed complete indexes, preview decoding and
normal exit. The independent readback rehashed all 256 archives and
the AppImage, checked the 256 closed index rows and 30 migrations, and
confirmed exit for the 20 recorded process identities. Peak scope
memory was 3,331,559,424 bytes with zero OOM events. The AppImage SHA-256 is
`0d6d9b8d7415c2f614973f4e4e5d767a976c3fd719c8921af00eda5265f21513`.
The receipt, source pins and closed index are under
`runs/packaged-home-scale/20261125-r57`. These samples cover local
Refresh and leave cold startup and supported-host performance open.

## Discover Projects after the Home window opens

The default workspace used to be scanned before Main created the
window. The renderer's first catalog request then included Uncategorized in
the registered workspace sweep. With four Raster layers, Main alone spent
1.46–1.57 s in its pre-window Project initialization across the two 128-file
baseline lifetimes.

InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7` constructs
`ProjectRecordsStorage` in `invokeai/app/api/dependencies.py`. The
`HomePage.tsx` and `ProjectsPage.tsx` launchpad callers under
`invokeai/frontend/webv2/src/workbench/launchpad/pages` request the library
through `workbench/projects/library.ts` and `workbench/projects/api.ts` when
the view mounts. The route in `invokeai/app/api/routers/projects.py` delegates
to `invokeai/app/services/project_records/project_records_default.py` and
`invokeai/app/services/shared/database/queries/projects.py`. Those summaries
come from managed database records. Studio adapts the startup and listing
split and keeps its existing filesystem discovery to validate portable
archives that can be added or changed externally.

Main recovers pending Moves and committed Trash deletions and registers the
default workspace before opening the window. Home owns the first archive
sweep. Trash can already read its recovered records while the app starts.
Direct Project-ID operations and the history IPC can prepare the default
index on demand if they run first. The history IPC serializes this write with
catalog requests and observes their close guard. The history read still uses
the saved projection if preparation reports an error. When the first
default scan reports that the folder is briefly unavailable, Home still
retries it before publishing the sidebar, including when another workspace
is selected.

The three-folder AppImage comparison used 256 Projects with four
1024×1024 Raster layers each. Both runs used private 900×620 KDE Wayland,
software rendering, 120% CPU, 4 GiB RAM and zero swap. Each cell shows one
first launch and one indexed restart on the same local ext4 host.

| Measurement                  | Baseline R2     | Candidate R1    |
| ---------------------------- | --------------- | --------------- |
| Spawn to visible Home        | 6.38 / 6.10 s   | 3.19 / 3.11 s   |
| Spawn to all 256 cards       | 23.02 / 20.99 s | 22.93 / 22.23 s |
| Aggregate Refresh            | 3.84 / 3.44 s   | 3.62 / 3.86 s   |
| Scoped Refresh with 96 cards | 2.64 / 2.44 s   | 2.40 / 2.76 s   |

Home appeared about three seconds earlier in both candidate lifetimes.
The complete list took about 22–23 seconds and the sampled indexed restart
took 1.23 seconds longer. The full archive validation still runs on the
first catalog request. These timings describe the measured host and
workload.

The 202 focused tests passed along with full typecheck, app build, scoped
ESLint and AppImage packaging. In the isolated service copy, restoring the
eager scan made the startup test observe an extra Uncategorized scan.
Disabling the cold default retry broke the scoped default-folder case.
The three neighboring cases passed in each mutation. All four passed
before mutation and after restoring the source byte for byte.

The exact candidate AppImage SHA-256 is
`fa69985c57da523c250aefa5d5a7525834cdc259c88d5d4d2843b8a8880dffe7`.
The comparison runs are `packaged-home-scale/20261126-r2` and
`packaged-home-scale/20261126-r1`. Independent readback verified all
512 archive bodies, the two final 256-Project indexes, both AppImages,
the 30 migration digests per index and exit of 40 recorded process identities.
The two scopes recorded zero OOM events.

Because the cold initialization also feeds the history IPC, the same AppImage
ran the [Saved generations FUSE scenario](./phase-5-stock-appimage-fuse-research.md#saved-generations)
in `packaged-saved-results/20261126-r1`. Both lifetimes navigated to the
exact saved inactive variant and closed normally. Independent readback
matched the mounted ASAR and rederived 34 accepted results from the two
portable Projects in each closed database. It also confirmed both FUSE mounts
and 16 process identities had exited. This run covers the saved-history
and native close paths.

After the readbacks and physical-exit checks, cleanup reclaimed
3,956,248,576 allocated bytes of generated fixtures, unpacked build output
and private profiles. Each run retains its receipts and selected archive
witnesses. The two closed Home indexes, both Saved generations indexes and
the exact candidate AppImage remain available for review.

## Time spent on the first 256-Project catalog

An isolated copy of Studio `060023e2` timed the current Main catalog and
its existing archive readers. The fixture used 256 four-Raster Projects
across three registered folders and 1,013,853,696 archive bytes. The timing
wrappers call the same parser, hashing and SQLite code. Two fresh service
instances each made one first catalog request, with SQLite closed and reopened
between them in the same Node process. The workload used 120% CPU, 4 GiB RAM
and zero swap. The results measure elapsed time in Main, including waits.

| Main phase                        | Fresh index | Indexed restart |
| --------------------------------- | ----------: | --------------: |
| First complete catalog            |     12.48 s |         12.09 s |
| Full archive parser               |      8.71 s |          8.36 s |
| PNG member reads and validation   |      7.69 s |          7.56 s |
| Schema preflight                  |      0.40 s |          0.27 s |
| Whole-archive hashes before/after |      2.36 s |          1.89 s |

The parser includes the PNG and schema spans. Each cold request had 256
full validations, 1,280 PNG member reads and two whole-archive hashes per
file. A subsequent unchanged Refresh took 1.72 s and did one hash per
file. The external-change control validated two archives, found the
replacement and added file, marked the moved original missing and retained
254 unchanged neighbors. Both catalog lifetimes passed closed-index and
saved preview checks. Peak memory was 1,405,571,072 bytes with zero OOM
events. The timing excludes Electron and renderer work. Filesystem cache
could be warm. Independent readback rehashed 257 extant archive files and
checked both SQLite snapshots, the 30 migration hashes, the source pins
and the nested timing counts. The fixture had already superseded one
archive body, represented in the original input and initial index.

At clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`, the
Home and Projects callers under `invokeai/frontend/webv2/src/workbench/launchpad/pages`
fetch managed projections through `workbench/projects/library.ts` and
`workbench/projects/api.ts`. `invokeai/app/api/routers/projects.py` calls
`invokeai/app/services/project_records/project_records_default.py` and
`invokeai/app/services/shared/database/queries/projects.py`. That path does
not validate portable archives. The external font catalog gives a closer
precedent. `invokeai/app/services/fonts/fonts_default.py` reuses an indexed
record for matching file size and SHA-256, and parses the same bounded
buffer it hashed on a miss. The startup owner is
`invokeai/app/api/dependencies.py`, the rescan caller is
`invokeai/app/api/routers/fonts.py`, and the records are managed by
`invokeai/app/services/shared/database/queries/fonts.py`.

PNG member checks took most of the first-request time in this fixture.
Reusing a byte-verified durable projection across restart is the next
approach to qualify. It needs archive and validator identity and must
preserve invalidation on external changes and rebuilding of accepted
result rows. First discovery still requires full verification. The
diagnostic leaves catalog behavior unchanged and the complete-catalog gate
open. Results and the isolated instrumentation are under
`runs/home-catalog-layered-main/20261126-cold-costs`.
Cleanup kept the input manifests, timings, closed SQLite snapshots and a
sample archive, and reclaimed 1,068,609,536 allocated bytes.

## Reuse full archive validation on indexed restart

At InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`,
`invokeai/app/services/fonts/fonts_default.py` reads a bounded font file
once, checks its existing size and SHA-256, and gives the same bytes to the
parser on a miss. The startup and rescan callers are
`invokeai/app/api/dependencies.py` and `invokeai/app/api/routers/fonts.py`.
The stored directory entries and rescan replacement are owned by
`invokeai/app/services/shared/database/queries/fonts.py`.

Studio adapts that flow to portable `.igs` files. Packaged Main keeps up to
512 previously validated archive SHA-256s in a single derived
`app_metadata` row. The validator digest covers the bundled Main bytes and
the Node and zlib versions. The read of the serialized row is limited to
36 KiB. Missing, malformed or stale validation history falls back to a
full package check. No SQLite schema change is needed.

Eligible archives are bounded to 128 MiB on disk and 64 KiB of Project
JSON for reuse. The first scan in a Main process takes a bounded snapshot
of each eligible archive in turn. An unchanged archive can then supply
Home's manifest and Project JSON without decoding the image members. A
miss checks all members and validates the images before saving its hash.
The hash and both parsers consume the same snapshot. This also avoids
crossing two archives when an external process temporarily replaces a
workspace directory. Later in-process hits stream the full archive hash
through a 1 MiB buffer. The Home IPC serializes catalog work through the
existing app-data lock.

SQLite stores no Project document in the validation row. Accepted Results
are rebuilt from the Project document in the existing transaction. Open,
Save and recovery still use the complete archive reader. Missing files,
oversized candidates and failed snapshot acquisition use the existing
validation and diagnostic paths. Full validation is required when the
archive bytes have no known digest for the current validator.

The R6 stock AppImage (`192edffd2464eff6a452d33819c20ec88997cb41ff1d4436b93e09fe34b0ec6a`)
and the `fbedab3e` AppImage baseline ran the same 256-Project, four-Raster
workload from fresh profiles and again after normal close. The native runs
used local ext4, software Wayland rendering, 120% CPU, 4 GiB RAM and zero
swap. Times start before application spawn and use the initial 1380×900
viewport. The harness resized to 900×620 for the interaction checks.

| Home milestone                   | Baseline | Candidate |
| -------------------------------- | -------: | --------: |
| Visible Home on first launch     |   3.01 s |    3.01 s |
| All 256 cards on first launch    |  21.51 s |   19.79 s |
| Visible Home on indexed restart  |   2.80 s |    2.81 s |
| All 256 cards on indexed restart |  20.73 s |    6.88 s |

Both candidate lifetimes discovered all Projects, opened the sampled
saved previews and exited normally. Independent readback matched 2,304
corresponding ZIP member digests across the two workloads, validated all
256 candidate archive witnesses and their exact bundled validator, and
checked the closed index, 30 migration hashes and physical process exit.
Aggregate peak memory was 3,518,566,400 bytes with zero OOM events. The
restarted catalog arrived 66.8% sooner in this comparison. The first
full discovery remains open as a performance gate.

The 198 focused tests passed, including closed-DB history rebuild,
same-size Raster corruption with its original mtime, a stale validator and
malformed validation history. The temporary workspace swap test returned
the alternate title on R4 and the original card and exact Accepted Results
on R6. Scoped ESLint, the full typecheck, application build and packaging
passed. The production source review found no blocker. The matched runtime
reports are under `runs/packaged-home-scale/20261126-r3` and
`runs/packaged-home-scale/20261126-r6`.

The same candidate AppImage also passed the manual SQLite recovery
scenario in `runs/packaged-sqlite-manual-recovery/20261126-r2`. The saved
DB/WAL/SHM set kept the committed WAL marker. Copying the selected DB29
backup and relaunching preserved the original backup, re-applied the
migration to DB30 and rebuilt validation history for the unchanged `.igs`.
The historical oracles check every other `app_metadata` row exactly. The
installed-engine and runtime-continuity fixture changes received source
checks in this round. Their native worker runs remain separate.

## Reuse structural validation for repeated PNG members during discovery

At InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`,
`invokeai/app/services/fonts/fonts_default.py` reads bounded actual bytes
before checking the hash in `read_file`. `instance` uses the verified hash
and normalized parameters to reuse worker output from a bounded in-memory
cache. The service owner is `invokeai/app/api/dependencies.py` and the
instance endpoint is `invokeai/app/api/routers/fonts.py`.

Studio applies the verified-content rule to the existing PNG structure
validator. The workspace scan keeps up to 128 successful checks by
SHA-256 and byte length for ordinary layer and merged-preview PNGs up to
8 MiB. The cache lasts for one workspace scan and stores only these keys.
The first design buffered every eligible PNG before deciding whether to
decode. The linked fixture improved from 21.23 s to 10.33 s, but on 256
Projects with 1,024 distinct Raster bodies the real Main catalog slowed
from 9.40 s to 12.59 s. That design was rejected after the independent
readback in `runs/home-png-first/20261126-unique`.

In the revised reader, the parsed manifest provides a tentative lookup
key. Unknown PNGs go directly through the usual streaming parser. A known
key lets the reader try hashing the actual member stream without decoding
the PNG. If its bytes or digest differ, the same entry in the same owned
archive snapshot goes through the full validator. The manifest never
establishes that a member can skip decoding by itself. The ZIP reader
checks the stored or inflated size against the entry's declared size.

Every archive still checks its schema, manifest membership and hashes,
dimensions and accepted-result provenance. Regional references and masks
retain their role-specific checks. Interactive Open and Save use the
ordinary streaming validator. If a tentative match has both a broken ZIP
stream and malformed PNG data, discovery can report the ZIP failure
first. Either failure marks the archive unhealthy.

The revised scanner and `202eb114` also indexed the same 256 four-layer
Projects with 1,024 distinct Raster PNGs. The merged preview repeats the
first Raster within each Project, and no Raster body repeats across
Projects. Four runs per revision used both comparison orders, the same archive
bytes, a byte-identical initial SQLite index and the same 120% CPU, 4 GiB
RAM and zero-swap bounds. This measures `listHomeCatalog()` in Main and
excludes Electron startup and rendering.

| Distinct-Raster Main catalog |     Baseline | Revised scanner |
| ---------------------------- | -----------: | --------------: |
| Median across four runs      |      10.67 s |         10.08 s |
| Range                        | 9.42–12.36 s |    8.14–11.41 s |

The direction varied by pair, so these data leave the broader
first-discovery performance gate open. Independent readback checked the
archive bytes, 1,792 manifest-member hashes and all eight closed indexes
in `runs/home-png-first/20261126-unique-streaming`.

The matched stock AppImages ran the linked fixture with 256 Projects and
four repeated Raster bodies. R7 used `202eb114` and the retained R6 AppImage
(`192edffd2464eff6a452d33819c20ec88997cb41ff1d4436b93e09fe34b0ec6a`).
The final R9 AppImage SHA-256 is
`d12ed66ac5e54bd80906b53ce4c5daa01f4cd6b447330e9cb0f1c4c9014c09b5`.
Each measured lifetime started before spawn, on local ext4 with software
Wayland rendering, 120% CPU, 4 GiB RAM and zero swap.

| Home milestone                   |      R7 |      R9 |
| -------------------------------- | ------: | ------: |
| Visible Home on first launch     |  3.21 s |  3.18 s |
| All 256 cards on first launch    | 21.23 s | 10.26 s |
| All 256 cards on indexed restart |  8.14 s |  7.30 s |

Both AppImages found all 256 Projects, loaded the sampled saved previews
and exited normally in each lifetime. The R9 aggregate memory peak was
3,174,154,240 bytes with zero OOM events. Independent readback checked
each archive against its input hash and matched all 2,304 ZIP member
bodies across the two fixtures. For each run it verified 256 ready rows,
30 SQLite migrations, 256 full-archive witnesses bound to the bundled
validator, and exit of 20 observed processes. The matched run is under
`runs/packaged-home-scale/20261126-r7` and `runs/packaged-home-scale/20261126-r9`.

The 199 focused tests, typecheck, scoped ESLint, build and packaging passed
on the revised scanner. The direct regression reads the repeated member from a second ZIP,
observes decode only for the new preview, checks loss of reuse on different
bytes, and rejects wrong layer dimensions. It also rejects a same-size
corrupt PNG with a matching manifest and asset digest. An isolated
runtime mutation using size alone admitted the corrupt PNG and failed
the test at the expected rejection. A separate mutation dropped the
fallback decode and replaced the expected invalid-image diagnostic with a
manifest mismatch. Plain Open validated both PNGs.

## First packaged discovery with distinct Raster bodies

The 256-project AppImage comparison uses three registered folders with
64, 96 and 96 Projects. Both workloads have four 1024×1024 RGB layers per
Project. The repeated workload shares the same four layer bodies across
Projects. The distinct workload reproduces the earlier Main fixture's 1,024
seeded layer bodies. Each merged preview reuses its own first Raster. Both
workloads share the same small WebP thumbnail fixture. The distinct case
records the length and SHA-256 of each manifest-listed member for readback.

The source check used clean InvokeAI
`64ff2c600f04d220e470fdaeec570bd402af42a7`. Its `HomePage.tsx` calls
`invokeai/frontend/webv2/src/workbench/projects/library.ts` and `api.ts`.
`invokeai/app/api/routers/projects.py` dispatches to
`services/project_records/project_records_default.py` and
`services/shared/database/queries/projects.py`, where the list query reads
summary columns from already registered records. `useProjectFileActions.ts`
and `projectFile.ts` explicitly import and validate a selected `.invk` before
creating its record. The external-font rescan in `fonts_default.py`, reached
via `api/routers/fonts.py` and initialized in `api/dependencies.py`, reuses
metadata after comparing actual size and SHA-256. Studio already applies that
rule to indexed archives. InvokeAI has no Home path equivalent to opening a
registered folder of previously unseen portable `.igs` files.

Both workloads used the same AppImage built from `3e9f7b44`, with SHA-256
`c80da7b6b4e6ccfbb26d13111a1922f742fd911edb3b2a9d66244b0706740a31`.
They ran serially on local ext4 in private software-rendered KDE Wayland
sessions at 120% CPU, 4 GiB RAM and zero swap. The fresh profiles already
had folder registrations and had no Project rows. Fixture writes can warm
the OS file cache. The second launch reused the closed profile. The first
selectable-card milestone is an observed visible, enabled selection button,
and the complete milestone waits for exact card names and two renderer
frames. Both milestones use the driver clock from before AppImage spawn.

| Home milestone                     | Repeated layers | Distinct layers |
| ---------------------------------- | --------------: | --------------: |
| Visible Home, fresh index          |          3.65 s |          3.61 s |
| First selectable card, fresh index |         11.47 s |         22.55 s |
| All 256 cards, fresh index         |         11.48 s |         22.56 s |
| All 256 cards, indexed restart     |          8.06 s |          7.58 s |
| Aggregate Refresh, indexed restart |          3.55 s |          3.53 s |

The first usable card arrived with the full list in both fresh launches.
With distinct layers, the interval between visible Home and the first card
was 18.94 s. In the current renderer `refreshProjects()` applies the first
project list after `listHomeCatalog()` settles. Main scans the registered
workspaces before returning that response. Search, Grid/List, folder
selection and the three sampled 1024×1024 previews worked in both lifetimes
of both workloads. Each scope had zero OOM and memory-limit events.
[Renderer](../../src/renderer/App.vue) ·
[Main catalog](../../src/main/projects/project-service.ts)

The evidence is one fresh discovery and one indexed restart per workload on
a single host. It establishes a first-discovery delay on this fixture and
leaves the performance gate open. The 146 focused package, index and service
tests passed, along with scoped ESLint and AppImage packaging.

Independent readback checked both workloads against the same AppImage,
embedded runtime and source identities. It verified 2,304 ZIP members,
256 ready index rows, 256 archive witnesses bound to the bundled validator,
30 migrations and 20 exited process identities per workload. It also matched
the 1,024 distinct Raster hashes in order to the retained Main fixture and
verified all 1,792 manifest-listed members of the distinct archives.

The repeated run is `runs/packaged-home-scale/20261126-r10` and the distinct
run is `runs/packaged-home-scale/20261126-r11`. Both retain timing reports,
screenshots, full input manifests, independent audit receipts, the final
SQLite and one sample `.igs`. Cleanup removed the shared package build,
private profiles and scratch after both readers and application lifetimes
exited, reclaiming 2,577,670,144 allocated bytes.

## Show the first verified workspace during initial discovery

The source check used clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
Its `HomePage.tsx` calls `workbench/projects/library.ts` and `api.ts`, which
reach `api/routers/projects.py`, `project_records_default.py` and
`shared/database/queries/projects.py` for already registered summaries.
The Gallery's `useGalleryData.ts` and `data/backend.ts` carry partial
availability and active query scope through `api/routers/gallery.py`,
`gallery_default.py` and bounded SQL pages in `queries/gallery.py`.
The external font scanner in `fonts_default.py`, reached through
`api/routers/fonts.py`, commits the discovered set after scanning it.
InvokeAI has no equivalent to publishing verified portable Projects midway
through discovery across mounted folders. Studio adapts the Gallery's
scoped partial presentation and keeps the existing archive validation and
serialized catalog operations.

The first empty aggregate Home request can receive one projection. Main
completes a workspace scan, selects only ready rows with matching validation
witnesses from that request, rechecks their file identity and sends them
with the workspace's current availability and count. The normal final
catalog still owns all workspaces, missing files and relocation diagnostics.
Preload correlates the notice to the request and validates its contents.
The renderer checks that the request and workspace read still own the
current Home view. The first workspace can be browsed locally while the
aggregate request continues. A search miss stays in loading while more
results can arrive. Ordinary Refresh retains the previous complete-list flow.
[Service](../../src/main/projects/project-service.ts) ·
[Preload](../../src/preload/index.ts) · [Renderer](../../src/renderer/App.vue)

The ordinary Open route still needs the catalog lock. The early path is
verified for selection and the embedded image shown in the Inspector. The
service regression holds the next workspace scan, reads the exact saved
PNG from the first and excludes a corrupt archive and a file replaced
after validation. The hosted Chromium test holds the final IPC response
and checks preview selection, search, navigation and a stale notice.

The first packaged build reached the first enabled card only after all 256
had arrived. The launch-import startup request set Home busy even with an
empty path queue, because `takeLaunchImport` waited behind the catalog lock.
The opt-in native preview regression reached `Expected an early card` and
closed its window normally. A separate sandboxed Electron probe exercised
the real built preload, delivered a matching notice to the originating
frame and observed it before the final reply. The empty startup request now
returns without acquiring the catalog lock. A request with a queued path
still acquires it and rechecks close admission. Both paths keep caller
validation. InvokeAI's `useProjectFileActions.ts` returns on an empty picker
selection before invoking `projectFile.ts`; it has no Electron startup
queue for project paths.

The fixed AppImage SHA-256 is
`52f65bcec71318f4dad36199231af06c118990277a12bb09c1d8fab12ff1be26`.
The timing run used the same 256 Projects, 1,024 distinct Raster bodies,
software-rendered KDE Wayland, ext4, 120% CPU, 4 GiB RAM and zero swap as
the recorded R11 workload. The first launches both started with empty
Project indexes. Each cell is one observation. Writes during fixture
staging can warm the OS cache.

| Home milestone                     | Prior R11 | First verified workspace R14 |
| ---------------------------------- | --------: | ---------------------------: |
| Visible Home, fresh index          |    3.61 s |                       2.94 s |
| First selectable card, fresh index |   22.55 s |                       6.86 s |
| All 256 cards, fresh index         |   22.56 s |                      19.88 s |
| All 256 cards, indexed restart     |    7.58 s |                       7.09 s |

The first selection measurement in R14 observed 64 cards. In a separate
R15 run with an actual selection, the exact signed merged preview reached
its decoded 1024×1024 ready state at 8.78 s with the same 64 cards in the
grid. The selected card and preview source survived the full catalog reply.
That interaction run has its own timing receipt because selecting a Project
requests preview I/O during discovery. This establishes earlier selection
and preview on the multi-workspace fixture. Complete discovery and Open
latency remain separate performance checks.

The two final Home runs closed normally twice each. Independent byte
readback compared each of their 1,024 Raster hashes to the recorded
workload, checked 2,304 ZIP members and 1,792 manifest entries per run,
and verified 256 ready rows, 256 archive witnesses, 30 migrations and 20
exited process identities in each run. Typecheck, scoped lint, packaging,
175 focused Node tests and six controlled Playwright tests passed.

An adjacent run on the same package verified an explicit `.igs` argument
at cold launch, five secondary launches, deferred path intake and restart
using direct Type 2 FUSE. Both primary windows closed normally and released
their mounts. The earlier extract-and-run attempt reached the close boundary
and exited 127 with `Failed to clean up cache directory`. Its owned processes
exited and the failure receipt remains.

`runs/packaged-home-scale/20261126-r12` and `20261126-r13` keep the initial
measurement, sandboxed preload probe and native early-card failure.
`20261126-r14` and `20261126-r15` keep the final Home timings, input manifests,
audit receipts, sample `.igs` files and closed indexes. The path-launch
attempts are under `runs/packaged-project-launch/20261126-r1` and
`20261126-r2`. Cleanup after the native and audit scopes exited reclaimed
5,172,629,504 allocated bytes across the six runs.

## Open a verified Project during the first Home scan

At clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`,
`workbench/projects/useProjectActions.ts` calls `hydrateProjectFromServer`
in `durableSyncedPersistence.ts`. `workbench/projects/api.ts` requests one
Project through `app/api/routers/projects.py`. The record service
`project_records_default.py` reads its document and workspace in one SQL
snapshot through `shared/database/queries/projects.py`. Studio adapts that
per-Project read. InvokeAI has no equivalent to coordinating Open with a
live scan of multiple external portable Project folders.

Only the first aggregate discovery with an early-card subscriber takes the
existing catalog lock separately for each workspace scan. The lock still
serializes Open, workspace changes, and one full scan of a folder. A queued
Open can run between consecutive folders. Each slice resolves the currently
registered path, and the final catalog reads the current registry again.
A remapped path gets a fresh scan. Native close rechecks admission at every
lock acquisition before any later slice can access the store. Ordinary
Refresh uses the previous catalog-lock scope.

Open uses its selected ready index row if the registered workspace is
available and the actual file fingerprint matches. A changed or unavailable
entry takes the existing rescan path. Open still checks canonical location
and recovery and opens the complete `.igs` through the existing generation
gate and document coordinator. In the renderer the Project becomes usable
as soon as the ordinary Open succeeds. The still-running initial discovery
can populate Home while the editor is open, or when the user returns before
the final catalog is ready.

Both native runs staged the distinct-layer fixture with 256 archives across
three folders. They used local ext4, private software-rendered KDE Wayland,
120% CPU, 4 GiB RAM and zero swap. The prior ASAR matched the package from
`9b3044c6` byte for byte. The candidate AppImage SHA-256 was
`ec0b0e37bb25d6e9dd20e0f10ab0d5254abb64e18c6e741b04ddd2f3a989888b`.
The opt-in driver clicked the exact Home card and waited for its selected
tab, ready canvas and enabled Save Project button. It then sampled SQLite
through the existing WAL-aware reader. It did not issue Save.

| Fresh launch, same Open scenario    | Prior R16 | Candidate R17 |
| ----------------------------------- | --------: | ------------: |
| Open click to usable editor         |   18.33 s |        8.58 s |
| Spawn to usable editor              |   26.42 s |       16.15 s |
| SQLite rows just after editor ready |       256 |           163 |

The original AppImage reached the expected early-Open assertion with all
256 rows already indexed. The candidate kept the exact Project active with
the fixture's document and revision and later reached all 256 SQLite rows at
22.04 s from spawn. Its separate indexed restart showed all 256 cards at
7.01 s. These are single observations on this host. The fresh Open check
measures the editor and persistent index after Home has been replaced.

The Main test pauses the middle folder while Open queues behind it. It
checks the exact opened Project before the final folder proceeds, plus
workspace removal and addition between slices. A replaced archive takes
the previous scan path and opens its actual new revision. The Chromium test
holds the catalog reply while Open presents usable controls, then returns
to Home and observes one final catalog reply. The 200 focused Node tests,
seven browser tests, typecheck and AppImage packaging passed.

Independent readback verified the candidate's 256 archive hashes, 2,304 ZIP
members, 1,024 distinct Raster PNGs, 22 source pins and closed SQLite index
with 256 rows and 30 migrations. A supplemental readback confirmed the
previous ASAR and the shared embedded Electron bytes. It matched the
ordered corpus descriptors and confirmed that each closed index recorded
the exact selected Project as its only Open. The live timings and index
samples are the native harness observations.

The control and candidate receipts, audit reports, and closed SQLite
copies are retained in `runs/packaged-home-scale/20261126-r16` and
`runs/packaged-home-scale/20261126-r17` under the local artifact root.
After both native consumers and the independent reader exited, removing
their disposable packages and test profiles released 3,108,868,096
allocated bytes across the two runs. Each `retention.json` lists its
retained copies and exact disposal paths.

## Reuse recent PNG checks throughout a large workspace scan

At clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`,
`invokeai/app/services/fonts/fonts_default.py` verifies the actual source
bytes in `read_file`. `instance` refreshes the order of a cache hit and
evicts the least recently used entries when it stores a new result.
`invokeai/app/api/routers/fonts.py` calls this service for font instances
and `invokeai/app/api/dependencies.py` constructs it. InvokeAI Projects
list already managed rows and do not need to decode embedded PNGs during
a portable archive scan.

Studio applies the same replacement policy to its 128-key PNG cache in
`igs-package.ts`. The cache previously accepted only the first 128
distinct keys in each workspace scan. Once full, it could not reuse the
newly decoded merged PNG when it encountered the same bytes in a layer of
the same Project. On the distinct-Raster fixture the three folders contain
64, 96 and 96 Projects. Four distinct Raster bodies per Project fill the
cache after 32 Projects per folder, leaving 160 avoidable decodes.

The cache still stores only byte length and SHA-256 for previously checked
ordinary layer and merged PNGs no larger than 8 MiB. Each reuse reads the
real ZIP member and checks both values. A hint mismatch goes through full
PNG validation. The existing dimensions, role-specific checks, archive
bounds and final manifest checks still apply. The cache remains local to a
single workspace scan. Independent Open and Save use their usual validators.
Images repeated at long intervals can be evicted before their next use.

The regression passed two actual archives through the snapshot reader with
a full cache. The earlier reader decoded the new image twice and failed
the exact decode-count assertion. The candidate decoded it once for the
two members, kept the verified recent hit and removed the oldest key at
128 entries. The neighboring tests still reject changed bytes, a bad PNG
with valid ZIP and manifest checks, and mismatched layer dimensions.
The focused archive, index, workspace and preview tests passed
(84 tests), as did typecheck and scoped ESLint. Independent source review
found no regression in the byte and role checks.

The matched AppImages used the distinct 256-Project fixture with no
early preview or Open interaction, on the same ext4 and software KDE
Wayland envelope (120% CPU, 4 GiB memory, zero swap). The R18 ASAR matched
the previously recorded `b4198ade` package. The R19 AppImage SHA-256 was
`89058f455f2cd43956427c9d12e63c93bce995685536e529798263e3c8aa6ad0`.

| Home milestone                     | Prior R18 | Candidate R19 |
| ---------------------------------- | --------: | ------------: |
| Visible Home, fresh index          |    3.27 s |        3.37 s |
| First selectable card, fresh index |    7.60 s |        7.78 s |
| All 256 cards, fresh index         |   21.15 s |       21.28 s |
| All 256 cards, indexed restart     |    8.43 s |        7.46 s |

Each value is one observation. End-to-end first discovery showed no
measurable improvement in this pair. Both builds rendered the exact
catalog, decoded the sampled saved previews, passed navigation and
Refresh, and closed normally twice with the same 256 ready rows and
unchanged archives. The renderer measurement ends after the exact card
names and two frames. The supported-host matrix and a settled complete
discovery speed target remain open.

The Main probe used the same 256 source archives from R18 with an empty
index for each parser revision. It counted calls to the native PNG
inflater while `ProjectService.listHomeCatalog` ran, forwarding every
call to the actual inflater. The previous reader made **1,184** calls and
the candidate made **1,024**. Both returned the exact 256 ready cards.
The probe establishes the removal of 160 repeated decodes on this
fixture. The native timing includes the rest of discovery and rendering.

Independent byte readback verified 256 archive hashes, 2,304 ZIP entries,
1,792 manifest entries, 30 migrations, 256 ready rows with validator
witnesses, and 20 exited process identities per native run. It matched
the source fixture bodies and embedded Electron between the two AppImages.
The timing observations come from the native driver. Scope, measurements,
closed SQLite copies, count receipts and independent audit are retained
under `runs/packaged-home-scale/20261126-r18` and `20261126-r19`.
After the native sessions, audit and count scopes exited, cleanup removed
only their disposable packages, profiles and diagnostic scratch. It
released 3,135,930,368 allocated bytes. Each `retention.json` records the
sample archives, closed index and exact cleanup paths.

## Show verified Projects during the first scan of a single workspace

The multi-workspace initial catalog publishes after the first nonempty
validated workspace. With only Uncategorized and an empty index, the
same consumer could only show its cards after the full scan. A Main test
pauses the 61st archive and requires 60 ordinary selectable summaries and
an exact preview read. On `cc38a558` it reached the pause with zero initial
notifications. The candidate passes the same assertion and later returns
all 62 expected rows. An indexed restart sends only the complete reply.

Read clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
The Gallery in `invokeai/frontend/webv2/src/features/gallery/ui/useGalleryData.ts`
requests the first page at `GALLERY_PAGE_SIZE = 60` from
`features/gallery/core/paging.ts`, with the bounded gallery data backend
and `invokeai/app/api/routers/images.py::list_image_dtos` serving the
scoped page. Invoke's Project Home follows
`workbench/launchpad/pages/HomePage.tsx` and `workbench/projects/{library,api}.ts`
to a lightweight SQLite summary list in `invokeai/app/api/routers/projects.py`
and `project_records_default.py`. External portable archive discovery is a
Studio responsibility. This change adapts the first-page scope while using
Studio's existing archive checks and single advisory catalog notification.

`ProjectIndexRepository.scanWorkspace` calls the observer only after an
archive is indexed and outside the classification of archive errors.
`ProjectService.listHomeCatalog` publishes once after 60 successful
validations during an aggregate first Home request with one registered
workspace and no prior index rows. The existing projection rechecks path
and fingerprint before showing cards. The Inspector reads the exact saved
merged image through its existing project-file lock. A failed advisory
projection leaves discovery running. The final catalog, indexed restart,
explicit Refresh and multi-workspace discovery retain their existing paths.
Ordinary Open in the still-scanning folder continues to wait on the workspace
catalog lock. The focused 85 tests, typecheck, scoped lint and formatting,
app build and AppImage packaging passed.

### Packaged single-workspace measurements

The control was the retained AppImage built from `4d0cdae60ce30f06bd07974ce4b578d999f1eb6b`,
with SHA-256 `e0e45842ef0ec5d13372b56f2cd9161b68ea2ec41cdfdf4fc3a9c5b919493425`.
Between that build and the candidate base `cc38a558`, the runtime source
paths differ only in tests and test fixtures. The candidate was built with
the source pins in `source.sha256`. Its AppImage SHA-256 was
`f46c37572e601ad6c4715c14873bcf6c7467b87382756f5c20919f0280fd7c33`.
The embedded ASAR matched the package build output byte for byte.

Each run staged 256 Projects with 1,024 distinct Raster PNGs into the only
workspace, Uncategorized. Each had a fresh index and a second launch using
its closed index. Tests ran serially on local ext4 under private KDE Wayland
and software rendering, with 120% CPU, 4 GiB RAM, zero swap and a 300-second
scope bound. Startup times use the same driver clock from process spawn.

| Fresh Home measurement                 | Stock R22 | Candidate with preview R23 | Candidate without click R24 |
| -------------------------------------- | --------: | -------------------------: | -------------------------: |
| First selectable card                  |   19.78 s |                    17.16 s |                     6.98 s |
| Cards when selection became possible   |       256 |                         60 |                         60 |
| Exact selected preview ready           |         — |                    19.17 s |                          — |
| All 256 cards ready                    |   19.88 s |                    33.67 s |                    19.90 s |

R23 decoded the selected 1,024×1,024 preview with 60 cards visible. R24 reused
the exact R23 AppImage with no click during discovery. The slower full list
observed in R23 did not repeat in R24. Scope peak memory ranged from 2.86 to
3.11 GiB with zero OOM events. Each indexed restart showed all 256 cards at
its first selectable-card observation. Restart times varied from 6.68 to 19.93 seconds.
The new path only applies to an empty index, and these samples establish no
indexed-restart speed change. All six lifetimes exited normally.

Closed readback rehashed all Projects and 2,304 ZIP members per run. It
verified the same archive member bytes across R22–R24, including the
merged previews and Raster PNGs. ZIP headers reflect each staging time.
Every `.igs` kept its exact file bytes within its own run. Each closed
SQLite store contained the 256 expected ready rows and matching archive
validation digests. SQLite integrity and foreign key checks passed.

The first setup attempt failed the harness's run-directory naming guard
before launching an AppImage. R21 finished two native lifetimes but failed
the final source-stability guard when the working checkout changed. The
reported control is the separate R22 replay on stable sources. The result
qualifies early selection and preview on this single-folder fixture.
The follow-up below qualifies same-workspace Open. A broader Home
performance target remains open.

The reports, timings, filesystem inputs, native exit proofs and retained
closed SQLite stores are under `runs/packaged-home-scale/20261127-r22`,
`20261127-r23` and `20261127-r24`. Earlier failure receipts remain under
`20261127-single-r1` and `20261127-r21`.

The scoped cleanup reclaimed 4,608,913,408 allocated bytes from the five
attempts before removing a redundant intermediate SQLite copy. The
retention receipts identify restored evidence and disposed paths. The
held step-4 AppImage and ASAR remain available.

## Open a verified Project during the first scan of its own workspace

The 60-card startup page made selection and the Inspector usable before a
single-folder scan finished. An ordinary Open still waited at two boundaries.
Main held the catalog lock through that folder's scan. ProjectService also
awaited the default discovery promise when opening by ID. The native control
on `4b4b0cc2` clicked the first card with 65 of 256 rows indexed. The exact
editor became usable with all 256 rows already indexed. The harness rejected
that result at the early-Open criterion and closed the AppImage normally.

Reviewed clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`. The
`workbench/projects/useProjectActions.ts` caller starts hydration through
`durableSyncedPersistence.ts` and fetches one ID in `workbench/projects/api.ts`.
`invokeai/app/api/routers/projects.py::get_project` calls
`project_records_default.py::get`, using the current user's document and
workspace in one read-only transaction via `shared/database/queries/projects.py`.
Invoke's catalog is backed by its records. It has no external portable `.igs`
discovery lock. Studio adapts the individual Project read and keeps exclusive
catalog access for the rest of discovery and lifecycle operations.

Main retains authority for the project IDs and package fingerprints that the
first empty single-workspace scan published. One verified Open can run while
that scan holds the catalog lock, and concurrent requests for the same ID
share its reply. Other IDs use the ordinary locked path. The fast path looks
up the current row, checks workspace and exact file identity and runs the
usual recovery inspection. The session checks the witnessed fingerprint on
open and again at attachment after shadow inspection. A changed package falls
through to normal locked Open and rescan. The scan stops admitting early
requests before it settles the admitted Open, including the generation
reconciliation, and releases the lock. Native close still drains that lock
before snapshotting tabs. The IPC request still carries only the Project ID.

The deterministic service tests pause the 61st archive, open the exact saved
revision while only 60 rows are indexed and hold the post-open consumer while
the close barrier waits. A second test changes the saved file after publication
and verifies the ordinary path opens its new revision after discovery. The
coordinator test atomically replaces the package during shadow inspection and
verifies refusal and lease release before opening the replacement. These tests
kept the saved package bytes exact. The 152 focused tests, typecheck, scoped
lint and format checks, app build and AppImage packaging passed.
The post-inspection fingerprint guard was also removed in an isolated source
copy. The replacement test reached its real attach consumer and failed with
`Missing expected rejection`. Restoring the guard passed the same test. The
working checkout retained its original source hash throughout.

### Native same-workspace comparison

The control and candidate were rebuilt from base `4b4b0cc2`. The same native
fixture staged 256 Projects with 1,024 distinct Raster PNGs into Uncategorized.
Both AppImages ran in private software-rendered KDE Wayland on ext4 with a
120% CPU quota, 4 GiB RAM, zero swap and a 300-second scope deadline. The
control AppImage SHA-256 was
`db45439bd59c4103112a3982a61b18b3c85ba4ba7085f96b3d990fe4a75d1900`.
The candidate AppImage SHA-256 was
`c83832beb78f174a3c676ce23e03d46fb768003211d23c5bfa7136b7ba7891ea`.

| First-index Open observation                     | Control R25 | Candidate R26 |
| ------------------------------------------------ | ----------: | ------------: |
| Visible cards when invoking ordinary Open         |          60 |            60 |
| SQLite rows immediately before the click          |          65 |            65 |
| Click to exact usable editor                      |     13.29 s |        1.81 s |
| SQLite rows sampled when the editor was ready     |         256 |            74 |
| Time from launch to exact usable editor           |     20.20 s |        8.58 s |

The candidate showed the expected selected tab, ready Canvas and enabled
Save for the exact document and revision. The still-running scan reached
all 256 rows at 15.52 seconds from launch. The indexed restart displayed
all 256 cards at 6.69 seconds. No Save was issued. These are single samples
on the local software-rendered host. Complete discovery performance and
supported-host coverage remain open.

Closed readback checked both embedded ASARs, all 512 original archive hashes
and 4,608 ZIP entries, and both closed SQLite stores with the exact 256 ready
rows and only the selected Project recorded as opened. The control and
candidate member bytes matched across the two corpora. Both candidate
lifetimes and the expected control failure exited normally. Peak group RAM
was 2.44 GiB on the control and 3.01 GiB on the candidate. Both scopes had
zero OOM events.

The native observations, build and source receipts, closed SQLite states and
mutation logs remain in `runs/packaged-home-scale/20261127-r25` and
`20261127-r26`. After physical process exit and retained byte verification,
cleanup released 3,113,250,816 allocated bytes. The test AppImages and raw
profiles were removed from these two runs.

## Reuse verified small thumbnails after Home discovery

The first thumbnail requests on a fresh profile repeated work from discovery.
`ProjectIndexRepository` verified the entire bounded snapshot. On a cache
miss the `igs-preview` handler verified that archive again to serve one
embedded WebP. Earlier packaged scale fixtures used one shared 66-byte
thumbnail across the catalog, which obscured distinct-thumbnail misses.

Reviewed clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
`invokeai/app/services/images/images_default.py::create` calls
`image_files/image_files_disk.py::save` under the image mutation lock. It
prepares and caches the separate WebP with `invokeai/app/util/thumbnails.py`
and the bounded image-file cache. `gallery/gallery_default.py::_to_item`
supplies the URL. `invokeai/app/api/routers/images.py::get_image_thumbnail`
checks media access and maintenance before resolving it through
`images_default.py::get_path` and reading the WebP. The disk repair path uses
same-directory temporary files and `invokeai/app/util/no_replace.py`.
ImageGen Studio adapts the prepared derivative to self-contained external
`.igs` files, which still go through the package validator on first discovery.

Full snapshot validation can retain the already streamed WebP body after the
archive, member digest and WebP structure checks succeed. The index keeps up
to 256 recent digests with up to 64 KiB per body, a maximum of 16 MiB of WebP
bytes per repository. These limits apply to memory retention. The existing
package limits and lazy reads cover larger previews, evicted entries and the
exact-archive witness path. The first authorized request publishes the
verified bytes in the existing disposable
SHA cache. The writer uses exclusive temporary-file creation, sync and
rename, retaining the existing ability to replace a poisoned regular cache
file. The resource still checks the open catalog scope, lifecycle, workspace
path and current file fingerprint before serving bytes, and rechecks the
fingerprint before responding. The merged PNG takes its ordinary package
path.

### Main comparison on distinct thumbnails

The matched ext4 replay used the real Home catalog service, index repository,
project lock, SQLite and thumbnail resource. One corpus contained 64 Projects,
256 distinct 1024px Raster PNGs and 64 distinct 256px WebPs.
Each of six fresh database and disk-cache samples used the same archive
bytes and requested all 64 thumbnails, eight at a time, after discovery.
This comparison ran in Node at the Main boundary.

| Main boundary                                  | Control `2609c9c0` median (range) | Candidate median (range) |
| ---------------------------------------------- | --------------------------------: | -----------------------: |
| Full discovery                                 |                2.07 s (1.98–2.16) |       2.49 s (1.97–2.65) |
| Cold thumbnail requests                        |                1.82 s (1.72–1.84) |       0.11 s (0.10–0.13) |
| Discovery plus cold requests                   |                3.89 s (3.70–4.00) |       2.61 s (2.08–2.75) |
| PNG inflator starts during discovery           |                               256 |                      256 |
| PNG inflator starts on cold thumbnail requests |                               320 |                        0 |

All cold and warm responses and final cache files matched the independent
WebP inputs byte for byte. The merged PNG matched its expected digest and used
the original validation in both versions. Each replay checked the 64 exact
ready records in a copy of the closed database and the original archive
fingerprints and SHA-256 values. The first attempt hit a harness issue when
the read-only verification connection itself created empty SQLite companions
after the app database closed. The six accepted samples verified an exact copy
of the closed file instead. Discovery itself had overlapping ranges and a
higher candidate median. The supported-host speed target for Home remains open.

The 109 focused tests, full typecheck, scoped lint and format checks, and
AppImage build passed. On an isolated source copy, bypassing the retained
bytes reached the preview consumer and failed the zero-ZIP-reads assertion.
Restoring the original bytes passed that test again. The test also checks
that the disk cache starts empty, persists the requested thumbnail and can be
repaired on a fresh repository after cache poisoning.

The driver, input identities, mutation and six phase reports are in
`runs/home-thumbnail-main/20261127-cache-replay`.

### Packaged complete discovery in one and three workspaces

Both runs used AppImage SHA-256
`f661b36c47fe7801df505e8d99dd295cc8375268bd52bff540ace216dabff422`
on private software-rendered KDE Wayland on local ext4. The native fixture
contained 256 Projects, 1,024 distinct Raster PNGs and one common WebP. It
exercised list and grid, search, saved merged previews, manual Refresh, and
linked-workspace navigation where applicable. The timing starts immediately
before spawn and the full-card reading checks all expected titles and waits
two animation frames.

| Native boundary                            | One workspace R27 | Three workspaces R28 |
| ------------------------------------------ | ----------------: | -------------------: |
| First selectable cards from an empty index | 7.10 s (60 cards) |    7.58 s (64 cards) |
| All 256 cards from an empty index          |           18.53 s |              19.07 s |
| All 256 cards after indexed restart        |            7.33 s |               7.49 s |

The three-workspace catalog contained 64, 96 and 96 Projects. All four
lifetimes closed normally. These single samples cover the packaged catalog
and renderer on the local software-rendered host. The distinct-WebP effect
is measured in the Main replay above. The product speed target and
supported-host coverage remain open. The two native reports are in
`runs/packaged-home-scale/20261127-r27` and `20261127-r28`.

Closed readback verified the embedded ASAR, 512 original archives and 4,608
ZIP entries, both exact 256-row SQLite indexes, their archive witnesses and
SQLite integrity and foreign keys. The compact reports and closed database
copies are retained with the physical exit receipts. Cleanup of the disposable
AppImage, profiles, fixture archive bodies and source scratch reclaimed
2,904,776,704 allocated bytes.

### Unreadable derived thumbnail entries

On base `f6f74fef`, the Main thumbnail request opened the derived cache
before checking the opened descriptor type. An owned Linux test placed a
FIFO without a writer there. The request waited at open with the Project
path lock held. The test reported the stalled response and then opened a
temporary writer to let the original request and fixture teardown finish.

Re-read clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
`gallery/gallery_default.py::_to_item` makes the thumbnail URL.
`invokeai/app/api/routers/images.py::get_image_thumbnail` uses blocking
open after its read-access and maintenance checks and the path resolution
in `services/images/images_default.py::get_path` and
`services/image_files/image_files_disk.py::get_path`. Invoke's recovery
service treats occupied non-regular paths as unusable and preserves them
in `services/gallery_maintenance/gallery_maintenance_default.py::_stat`
and its caller `_regenerate_thumbnails`.

Studio applies that regular-file policy to the opened descriptor. Its
existing nonblocking open flag from the model preview reader lets a
Linux FIFO reach the type check without waiting for another process.
Main falls back to the exact embedded WebP. The regression checks status
200, exact WebP bytes, the same FIFO inode, no temporary cache output,
release of the Project path lock and exact original archive bytes.
The sustained check is the actual Main preview consumer with an owned
SQLite index and `.igs`. Its receipts are under
`runs/home-cache-special-file/20261128`.
