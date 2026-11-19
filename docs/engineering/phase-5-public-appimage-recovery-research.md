# Save a signed recovery AppImage from Updates

Base `196e9dcd71f8eddcf2fbe871e11ce138678d5804`. High risk at the IPC and
executable publication boundaries. This connects the
[private signed publisher](./phase-5-application-recovery-fresh-path-research.md)
to the existing [Updates contract](../features/application-updates.md) and
PP-002. The user can explicitly save a separately downloaded, verified
AppImage while the original installation still reports recovery required.
Updates tells the user to finish ordinary close and then open the saved image.

## Current donor and limits

Reread clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/util/database_copy.py:246–296` takes a chosen path, prepares and
verifies a sibling copy, and publishes with
`invokeai/app/util/no_replace.py:57–125`.
`invokeai/app/services/model_install/install_staging_ledger.py:114–133`
publishes a complete synced exclusive claim. The direct-copy fallback does
not meet the executable publication contract. The same clean Launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce` calls
`src/main/updater.ts:36–65` from `src/main/main-process-manager.ts`.
It asks for consent before download and then installs through its native updater.

The donor lacks a desktop action for saving a separate signed recovery
executable and Studio's publisher trust/current-document boundary. That gap
was disclosed before implementation. Studio reuses its existing release
verifier, downloaded-artifact selection, current-document IPC, native save
picker and complete no-replace publisher. A qualification publisher is
supplied only to the private packaged fixture.

## Material flow and adjacent cases

- The action is available in the existing Updates dialog only for its
  `required` startup recovery state and a signed downloaded release. Check
  and Download stay explicit and usable around it. Review/Install stays gated
  for the original path. A metadata-only, downloaded or unconfigured feed
  without signed verification cannot offer recovery save.
- Renderer sends only the displayed version. Main derives the exact native
  artifact and independently bundled keyring/current compatibility, verifies
  the detached declaration and opens its own Save dialog. Cancel writes no
  destination. After the picker returns, it verifies the same capability,
  authority, source path and trust selection again. The current-document and
  close-epoch check also runs synchronously before the final filesystem link.
- A duplicate request or competing update mutation is busy while Save is
  active. Status reads remain available. A stale frame/close, changed
  selection/trust, or invalid destination cannot publish. The atomic
  publisher preserves occupied paths and reports uncertain post-link outcomes
  with fixed path-free copy. A result exposes only `saved` or `canceled`.
- The original AppImage, journal, backup, Projects and database remain
  outside this action. Save never launches a process or requests Project
  close. The saved image is opened separately after ordinary close and
  startup remains responsible for its own health and recovery observations.

## Automated verification

- The focused Main, shared and release matrix had 668 passes, one existing
  platform skip and zero failures. The final production sources passed
  `pnpm run typecheck` and `pnpm run app:build`. The browser matrix had 362
  passes from `pnpm run prototype:test --workers=2` and peaked at 3.6 GiB
  with zero swap. Scoped lint passed for the changed code and test files.
- The browser tests cover the native-choice confirmation state, cancellation,
  retry, dismissal and failed save, and discarding feedback from B when C is
  checked or downloaded. The UI inspection used 900×620 and 1280×800 viewports.
- A source-isolated mutation removed the final synchronous publication guard.
  The stale-request test reached the actual publisher and failed with
  `Missing expected rejection`. Both selected tests passed with the original
  source and again after byte restoration.

## Native boundaries

The three test releases share the final built application. Packaging adds an
owned bootstrap for the loopback feed, ephemeral qualification signing,
deterministic replies to the native pickers, and process observation. The
test never changes the default application publisher configuration. The
AppImages use the real Electron Main, preload, renderer, download, filesystem,
SQLite, Project and relaunch paths. The initial interrupted stage is seeded
through the existing staging owner. Prior death controls are documented in
[interrupted update qualification](./phase-5-application-update-interruption-research.md).

The first observer failed to find Chromium's loopback endpoint. A separate
attempt reached normal A and B exit and launch of C, then failed while the
observer expected a separately observable relaunch helper. That attempt's C
was forcibly settled within its owned group. The next observer verified the
handoff and scope but found neither a port file nor inherited stderr for C.
An owned socket probe later opened the Project in that C and closed it
normally. The underlying run remains failed. The final observer resolves
C's own loopback listener and checks the browser PID again at the CDP handshake.

## Native result

The final R5 run reused three byte-identical R4 AppImages and verified the
signed envelopes, exact SHA-512, production bundles and bootstrap before
launch. It exited zero in 67.381 seconds. The launcher and native scope had a
combined ceiling of 8 GiB and zero swap. Its three lifetimes exited normally.

1. A reported recovery required. Updates downloaded signed B. Cancel left the
   destination absent. Save published the exact verified B under a fresh inode.
   The original AppImage, stage, backup and lock stayed intact. The open Project
   and its saved bytes remained available until the user closed A.
2. B started from the saved path with the same isolated app data and recovery
   clear. It reopened the same clean Project, edited its prompt, downloaded
   signed C and reached Review. Choosing Install and restart and then Save in
   the ordinary close flow committed the edit, closed SQLite once, retained
   the exact B backup and performed the native relaunch.
3. C started from the recovered path and reported the target verified and the
   runtime unverified. It reopened the clean Project with the edited prompt.
   The retained AppImage was exact signed C, and the original A path and stage
   had the same before and after identities. The new stage had the verified C
   authority and the retained B backup.

An independent read-only audit verified all three signed AppImage bodies,
12 native source pins, 42 built files, the Project archive, SQLite integrity
and all 30 migration hashes. It matched 26 PID and start-time pairs, three
owned scopes and four timers against the final exit evidence.

The receipt, source and package manifests, Project and SQLite snapshots,
screenshots, lifecycle events and failure logs are retained under
`runs/packaged-recovery-action/20261119-r5` and its earlier sibling runs in the
local artifact store. After physical exit and release of the audit readers,
the owned build and scratch trees were removed, freeing 9,581,625,344
allocated bytes. Signed package identities and digest receipts remain.

Qualification covers the signed UI path on this host with a loopback
publisher and no installed inference engine in the test profile. Production
publisher configuration, real post-upgrade runtime validation, legacy
process ownership and safe retirement of the original stage remain open.
All eight promise statuses remain **«Пока не обещать»**.
