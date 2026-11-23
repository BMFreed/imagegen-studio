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
