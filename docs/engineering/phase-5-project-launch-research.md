# Linux AppImage Project path handoff

## Contract and source

Base `ce125101e0d58f01e019b3306b487278ad93b711`. The architecture requires
one Electron owner and routes an explicit `.igs` launch argument to the
existing instance. Before this change the second process already exited and
restored the window, while both cold and warm `.igs` arguments went unused.
This slice accepts native Linux path arguments. System file associations and
URL schemes are separate delivery work.
[Electron architecture](../specs/02-electron-architecture-cqrs.md#single-application-instance),
[Home import contract](../features/home-screen.md#import-existing-project-flow).

Fresh donor checks used clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`
and its current desktop release caller from
`docs/src/content/docs/start-here/installation.mdx`. Invoke Launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce` uses
`src/main/index.ts::requestSingleInstanceLock` and `second-instance`, which
call `src/main/main-process-manager.ts::focusOrRestore`. The donor has a
window activation path and no portable `.igs` owner. Studio keeps that
single-instance behavior and hands explicit paths to its existing project
owner.

## Ownership and verification

The first process holds a transient FIFO of paths from its own argv and
Electron's second-instance arguments. Relative paths use the caller's
working directory. Pending duplicates share a queue entry. Launch options
and URLs stay out of the path lane. Electron restores and focuses the first
window. The second process still quits before its database and services start.

The trusted renderer gets a payload-free hint and takes the next item through
the ordinary frame, close and workspace catalog guards. The file path stays
in Main. The same `ProjectService.selectImport` path as the file picker
validates the `.igs` package, checks its workspace and recovers or opens the
same canonical project key. A path outside a registered workspace presents
the existing Copy or Move confirmation. No transfer runs before confirmation.
The renderer waits for its active modal or close decision and settles the
current Project's draft before switching.
[Main](../../src/main/index.ts), [path queue](../../src/main/projects/project-launch-paths.ts),
[Preload](../../src/preload/index.ts), [App](../../src/renderer/App.vue).

The stock AppImage case uses private KDE Wayland and direct Type 2 FUSE.
It starts with a valid synthetic `.igs` in the private workspace, applies an
owned unsaved edit and passes a relative path to the second app process.
It repeats the original path to assert one tab per file and an intact draft.
A path outside the workspace opens the ordinary import confirmation. The
test delivers another managed path while that dialog is open and checks
that the existing selection stays until Cancel. It repeats deferral from
the Project's Dynamic Prompt Preview dialog. A second primary lifetime
cold-opens the original after explicit discard. The fixture matches the
three exact `.igs` files, their filesystem identities and the closed indexes.
[Fixture](../../scripts/fixtures/packaged-project-launch.mjs).

## Local qualification

- Baseline `20261124-r1` used a stock AppImage built from the Git base.
  Main reached Home under direct FUSE and closed normally. The fixture
  failed at the first required Project tab, with Home as the only tab.
- `20261124-r2` opened the cold Project and stopped at the fixture's dirty
  indicator assertion. The fixture invoked the Main edit IPC directly.
  Its return reached the fixture, while the real renderer updates the tab
  inside its own edit handler. The corrected fixture commits the bounding
  box width with Enter in the ordinary Project control and reads its exact
  dirty state and undo availability.
- `20261124-r3` passed the corrected native fixture. Its 15 runtime source
  pins predate the addition of the ProjectView runtime pin. The exact
  ProjectView source matches the R3 build owners. The 30 focused browser
  tests passed against this renderer. `20261124-r4` stopped before native
  launch at three lint ordering errors. Those corrections affect import
  and member order.
- Final `20261124-r5` passed 82 focused tests, full typecheck, the app
  build and AppImage packaging, and scoped ESLint and Prettier. The
  stock package passed the complete direct-FUSE scenario. Five secondaries
  exited with code zero while the first primary stayed open. Both primary
  lifetimes closed normally and released their FUSE mounts. Each run
  scope used 4 GiB, zero swap and a 160-second native deadline.

The final 147,065,920-byte AppImage SHA-256 is
`4c13a43bb97d976a2a225086e377cd9cc3ff728d3544eafd12a0c0c2ef6a2914`.
The packaged and mounted ASAR SHA-256 is
`0341798abda5c823eca9c9dfdb69e4312ac3eeb82bc79762cbe34962f718259e`.
Independent readback matched both hashes, seven build-owner pins,
16 native source pins, the three project files and nine package members,
and the two retained SQLite bodies plus the final live index. Each index
contained exactly the two managed Projects. The audit independently
checked both primary process trees and five secondary exit receipts.
The local artifact registry retains the logs, receipts and synthetic
Project and SQLite bodies under `runs/packaged-project-launch`.

The checks run on this KDE Wayland host with owned AppData and synthetic
Projects. They qualify the explicit command-line path, an existing window's
tab ownership, import cancellation and source preservation. File manager
integration and desktop-wide host coverage remain delivery checks.
