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
| --- | ---: | ---: | ---: | ---: |
| 32 | 3.45 s | 3.69 s | 0.44 s | 0.41 s |
| 512 | 11.43 s | 11.21 s | 6.40 s | 6.85 s |

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

The source explains that observed minimum. Startup initializes and scans
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
