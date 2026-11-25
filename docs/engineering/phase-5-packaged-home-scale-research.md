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
