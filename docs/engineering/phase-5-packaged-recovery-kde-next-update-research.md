# Next signed update from KDE's recovered AppImage

## Scope

Base `195302f63b5d575288665e288a2d8aac83c110ca`. The
[native KDE recovery checkpoint](./phase-5-packaged-recovery-kde-chooser-research.md)
proved that A can cancel, then save and reopen exact signed B using the
lowercase suffix supplied by KDE. The separate
[subsequent update checkpoint](./phase-5-public-appimage-recovery-research.md)
installed and relaunched C from an uppercase AppImage path supplied by its
Save dialog fixture. This run joins those paths to exercise the ordinary
next Install from KDE's exact lowercase original.

The current InvokeAI checkout was
`4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/services/model_install/install_staging_ledger.py::_publish_claim`
creates and syncs a complete ownership claim before `publish_noreplace`.
`invokeai/app/services/model_install/model_install_default.py` calls the
ledger to reconcile and retain interrupted storage. The existing Studio
production owners are
[admission](../../src/main/application-updates/application-update-admission.ts),
[staging](../../src/main/application-updates/application-update-staging.ts)
and [native relaunch](../../src/main/application-updates/electron-application-relaunch.ts).
The qualification reuses them and changes only its own harness.

The fixture builds A, B and C from a single pinned set of current
production bundles with versioned package metadata and a disposable
qualification Ed25519 publisher. A starts over an isolated profile and
retained stage. The real Updates action downloads B and uses separate
native KDE Wayland SaveFile requests for Cancel and Save. The driver
accepts the unedited lowercase default. B must start at that exact path,
report recovery clear for its own namespace and reopen the byte-identical
saved Project. The controller then edits its prompt and chooses the real
Updates Install action. The existing fixture selects Save in the
Project-close dialog and observes the production Save and relaunch.

The controlled C startup must read the exact same lowercase path, report
the target verified and reopen the saved prompt. The only Project payload
changes allowed are document revision and the chosen prompt. The runner
captures closed SQLite and Project snapshots for each lifetime. The
original A and its retained journal, backup and lock must retain their
exact identities. C must own a distinct stage containing signed release
authority and the exact B backup. The three app identities are required
to exit normally. A single inherited user service bounds the native
controller, private KDE session and application lifetimes to 4 GiB with
zero swap.

## Native result

The three test packages built once in 39.549 seconds. The native
controller completed in 71.284 seconds and reported a rounded 1.7 GiB
peak group memory. All work stayed in the inherited 4 GiB, zero-swap
service.

- The native KDE portal returned Cancel with no URI and then returned
  the exact lowercase recovery filename. Main saved signed B there.
  A and its retained journal, backup, authority and lock kept their
  original bytes and file identities.
- B started at that exact lowercase path, reported recovery clear and
  reopened the same saved Project. The native Install action saved the
  edited prompt and closed SQLite exactly once. Electron reported a
  native relaunch at the same lowercase path.
- C opened at that path as version 0.3.0, reported recovery required
  with target verified and runtime unverified, and reopened the edit.
  The new stage retained the signed C authority and a byte-exact B
  backup. A, B and C each closed normally.

The post-exit byte readback reverified three Ed25519 declarations and
their complete AppImage bodies. It checked both D-Bus traces and 25
PID/start identities. It validated all archive members and all 30
migration digests in each closed SQLite image. The B-close and
C-close Project copies are byte-identical. Comparing against A's
closed copy shows the prompt and document revision as the precise
Project changes. The first byte-reader attempt compared access time
while reading a file. The corrected reader verifies content, ownership,
inode, mode, link count and change times. The original log is retained.
All 121 focused staging, window-close, recovery action and resource-limit
tests passed. Scoped ESLint, Prettier and the native source digest check
also passed.

An independent read-only pass verified the live signed bodies, the portal
receipts, the two stages, the closed Project and SQLite files, and the
normal physical exits before cleanup. The local run
`runs/packaged-recovery-action/20261121-kde-next-r1` retains the package
declarations, witnesses, logs, raw portal traces, screenshots, both
stage metadata sets and all six closed snapshots. Removing two exact
idle payload and scratch paths reclaimed 2,187,821,056 allocated bytes.
All 50 sealed evidence files verified after disposal.

The run covers the current local bundle, one KDE Wayland environment
and a qualification publisher. The existing harness selects the
Project-close Save response. The KDE FileChooser responses come from
the real native dialog. Shipping trust, a changed runtime or installed
engine, and safe retirement of either retained stage remain open.

## Replay

Use a fresh owned child of `runs/packaged-recovery-action` and a short
owned temporary directory inside the artifact root. Create its running
lifecycle record, build the application, then execute
`node --import tsx scripts/prepare-packaged-recovery-action.mjs <run> --kde-install-next`.
Run
`/usr/bin/python3 scripts/fixtures/packaged-project-chooser-wayland.py -- node --import tsx scripts/qualify-packaged-recovery-action.mjs <run> --kde-install-next`
under the owned 4 GiB, zero-swap, 600-second user service. Keep both
wrapper completion receipts and momentary source pins.
