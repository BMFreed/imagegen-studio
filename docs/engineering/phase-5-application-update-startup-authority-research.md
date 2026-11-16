# Offline authority for a retained application update

## Contract and risk

High risk: PP-002 supporting Application Updates contract, executable replacement,
restart, durable filesystem authority and Project close ordering. Continue the
existing explicit Check/Download/Review/Install, stage and native relaunch owners.
This slice preserves signed release authority across process exit, authenticates
only the on-disk current target offline, and refuses another Review/Install while
a stage is retained or its absence cannot be established safely. Projects remain
open on this refusal. Check/Download/status remain explicit and available.

All eight promise statuses stay unchanged. Publisher URL/key remain unavailable;
no production trust, publishing, background network check or shipping readiness
is introduced.

## Fresh donor check

Read the clean InvokeAI checkout at
`4875d96531ca6712b288f6e660fcbb34143408c1`, including callers:

- `invokeai/app/services/model_install/install_staging_ledger.py`: atomic fsynced
  marker publication, conservative claims, `recoverable_installs`, preserving
  malformed/unsupported/recovery-required markers.
- `invokeai/app/services/model_install/model_install_default.py`: `start`,
  `_restore_incomplete_installs`, `_write_install_marker`, restoration wait and
  transfer callers; `invokeai/app/util/no_replace.py`.
- `invokeai/app/api_app.py` lifespan, `invokeai/app/api/dependencies.py` and
  `invokeai/app/services/invoker.py`: owner startup and shutdown ordering.

Rechecked launcher at `c267bdb439519216b277a7a8c6ad408b9d79efce`,
`src/main/updater.ts` and `src/main/main-process-manager.ts`, plus Studio
`src/main/runtime/runtime-installation.ts` and its manager callers.

Invoke has recoverable model-install markers, not signed Electron/AppImage
startup authority. Launcher has ready-to-show lifecycle, not a signed durable
backup retirement protocol. The runtime pointer rollback does not authenticate
a previous application executable. This gap was disclosed to the user before
implementation. Adapt the conservative ledger gate in the existing stage owner
and reuse the existing canonical Ed25519 release verifier; do not introduce
parallel cryptography, queue, install wrapper or unsigned backup trust.

## Finite implementation

`ApplicationReleaseAuthority` retains the exact signed envelope and complete
canonical raw release-notes JSON, each independently bounded to 1 MiB and valid
UTF-8. Native selection owns an immutable copy, revalidated with the artifact.
Offline verification derives selectors from the authenticated payload and uses
only the new application's separately bundled keyring and current compatibility.
Keys alongside the capsule cannot establish trust.

The existing staging metadata writer publishes two fixed fresh0600 members,
`release-envelope.json` and `release-notes.json`, fsynced before candidate/prepared.
Schema2 journal references their snapshots/digests. Both participate in exact
membership, asynchronous snapshots and final synchronous guards for every
activation/rollback/relaunch transition. Legacy/partial stages remain retained.

The same read-only stage inspector derives the fixed claim from captured
`APPIMAGE`, never journal paths. No stage means no trust/current-body read. A
coherent activated/relaunching schema2 stage needs the original envelope, exact
notes, current bundled trust, matching current version/manifest/current full
AppImage bytes and safe anchored identities. With null trust it returns retained
before current-body hashing, supporting cheap fresh Review/preflight admission.
Uncertainty is retained/unverified, with all bytes/modes preserved.

Main inspects offline after database initialization/close registration, before
Project/runtime/UI startup. A captured retained result immediately vetoes Review
and preflight. The same inspector with null trust also catches claims introduced
later in that process, before artifact/impact reads or normal close. IPC exposes
only the fixed recovery-required error. The existing modal shows that reason
without the contradictory unsupported-build sentence.

## Authority limits

A signed target B does not authenticate backup A. Hashing the current pathname
plus `app.getVersion()` does not prove the process loaded those exact bytes:
a same-version B1 could have been replaced by B2. Renderer resource-load success
is not engine handshake or healthy application startup. A per-dataRoot
single-instance lock is not exclusive ownership of a shared AppImage path.
Therefore this slice does not acknowledge startup, retire/delete stages or
backups, automatically roll back/relaunch, execute backups, or clear retained
recovery gates. Those consumers require a further finite ownership contract.

## Validation plan

Run focused release/native/staging/transaction/relaunch/service/IPC/close tests,
full TypeScript/Vue checks, production build and prototype tests. Exercise real
filesystem signed synthetic images independently of updater memory; coherent
forgeries and same-byte replacement must reach the inspector and refuse.
Require a semantic consumer mutation with adjacent GREEN and exact restoration.
Qualify a production packaged A to signed B restart, original authority retained
without updater cache, offline target diagnostic and early public next-release
Review refusal before Project close. Inspect actual modal screenshots. Record
failures separately from semantic RED and preserve evidence before cleanup.

## Current evidence

Root executed the affected Main matrix: **437 PASS,1 platform SKIP,0 failures**
(438 including nested cases). The skipped unsupported-host capability case is
inapplicable on this Linux/x64 host. Full TypeScript/Vue checks, production
`app:build`, scoped lint of all19 changed TS/Vue/test files and whitespace checks
pass. Full prototype matrix: **343 PASS**. A focused **2 PASS** follow-up only
settles the new screenshot observer on idle Refresh; initial screenshots caught
its transient spinner. Both1280×800 and900×620 images were actually inspected:
error fully readable, no contradictory unavailable-build text, no Install, usable
deferral and refresh controls. Renderer fixtures do not prove native recovery.

The isolated actual stage-consumer mutation produced **4 GREEN → 3 GREEN +1
semantic RED → 4 restored GREEN**. Eliding only the offline current-image full
hash call makes a coherently rewritten unsigned journal falsely authenticate a
different body; both signed target controls remain GREEN. Original production
source was never edited by the mutation; original/restored SHA256 is identical.
This is a reached consumer assertion, distinct from setup/OOM/timeout failures.

Independent finite source reviews of Main/service/IPC/preload, authority/checker
and stage/inspector are CLEAN; authors reviewed each other's owners, not their own.
Reviewers did not run applications or tests.79 qualification source/build files
remain byte-identical after checks. Earlier Install/relaunch evidence remains a
separate historical checkpoint, not this turn's execution.

### Packaged native qualification

R1 is an **excluded harness resource/timing failure**. A saved its Project,
activated B and returned rawtrue from the original native relaunch call. B's
initial pre-Main receipt was inside A's capped scope, but Chromium then moved B
into its own KDE scope during asynchronous startup. A test console observer's
budget assertion threw into Main; B exited1. This neither qualifies a restart
nor establishes a product defect/semantic RED. Original events/results are
retained. A separate current-kernel receipt confirms all observed PID/start and
helper/wrapper identities gone, both exact expected KDE scopes absent, FUSE
unmounted, no extraction/open payload references and only exact owned deadline
timers stopped. It grants cleanup safety, never retrospective capacity proof.

The corrected nonshipping bootstrap delays only B's production `app.whenReady`
continuation until the driver admits its exact PID/start/runtime ASAR/promoted
scope inode through the existing qualification resource owner. Passive console
observation cannot throw into Main. Native promotion-to-cap overhead is recorded
and excluded from the claim of bounded production startup. Fresh pinned sources:
[Electron44.4.5 DEPS](https://raw.githubusercontent.com/electron/electron/v44.4.5/DEPS),
[Electron Browser](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/browser.cc),
[Electron main parts](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/electron_browser_main_parts.cc),
[Chromium152 portal](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.130/components/dbus/xdg/portal.cc),
[Chromium systemd](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.130/components/dbus/xdg/systemd.cc).
Those sources explain asynchronous native scope promotion independently of window
creation; the gate itself is an explicit test timing control, not shipping code.

Root executed corrected **R2 PASS** against actual production Main/preload/Vue
dist and production dependencies, with the declared nonshipping CDP/X11/dialog/
ready-continuation/final-close timing ports. Three separately embedded AppImages
A0.1.0/B0.2.0/C0.3.0 were built with Electron44.4.5/builder26.17.0; all42 packaged
production entries match the current build in each. Original Electron/SQLite
bytes remain unchanged. Private signing material stayed in producer memory.

A's ordinary Save/close writes a real `.igs`, activates B and calls the original
native helper once with rawtrue. While A's final close is held after handoff,
only the owned B download is renamed into retained evidence; its original cache
path is absent before B starts and after final exit, with all bytes preserved.
B's production continuation then runs in the admitted1GiB/swap0 KDE scope. The
original production inspector reports authenticated target after gate release in
that exact scope inode, with the publisher unavailable and **zero requests to the
owned release feed during startup**. This is not an unrestricted all-network audit.

B reopens A's saved prompt, explicitly Check/Downloads the separately signed C,
and public Review returns the exact recovery-required error. It starts no new
close/relaunch and does not change any retained stage member. The Project remains
open/editable; the new prompt is saved only by B's ordinary native Save/close.
Both applications and wrapper exit0, all recorded helper/native groups physically
exit, exact timers stop, old FUSE unmounts and B extraction is removed. The native
refusal screenshot was inspected. The later Project screenshot includes normal
modal-exit animation; editability/durability is established by actual editing,
Main state and saved package bytes, not a claim that this transient PNG is settled.

The serial native controllers retain the ≤3.375GiB aggregate cap (launcher1GiB,
old/new scopes each1GiB, three128MiB watchdog ceilings), swap0 and600s deadlines
for admitted work. Native promotion-to-admission overhead has raw `max` values
and is explicitly outside continuous-lifetime budget qualification. A/B/C use
the same actual30 SQL migration inventory and protocol declarations. Future
changed migrations/rollback, engine health, postcrash recovery/adoption, stage
retirement, next Install, publisher trust and shipping remain open. Early
artifact/impact-read ordering is evidenced by executed service tests and source;
native observes the public refusal and absence of a new close, not private counters.

## Evidence and lifecycle

Current run: `~/.codex/artifacts/imagegen-studio/runs/application-update-startup-authority/20261116`.
Compact owners are `qualification-summary.json`, `qualification-source.json`,
`native-package-manifest-r2.json`, `native-authority-r2-result.json`,
`native-authority-r1-result.json` with separate `native-authority-r1-exit.json`,
`mutation-target-hash.json`, `source-review.json` and `ui-audit.json`.

`payload-inventory.json`, `retained-payloads.tar.gz` and `retention.json` record
complete byte/mode/link retention, archive-internal content aliases and exact
reclaimed allocation. They require fresh independent reconstruction for executable
current/cache/backup files, never filesystem hardlink extraction or old PID/inode
reuse. No old raw resume is assumed. Independent source/retained-byte verdicts
are separate receipts (`final-audit-live.json` before disposal, `final-audit.json`
after disposal); delivery requires CLEAN plus retained lifecycle with empty raw
payloads/dependencies/pins. `commit-proof.json` binds final committed bytes/remote.
Only the exact idle run payloads and `t-ausa-1116` are disposable. No shared
runtime/model, ordinary app data, original binary, global cache or host integration
is a cleanup candidate. The second package set exists solely to preserve R1 and
qualify the corrected bootstrap; the artifact-root soft-budget exception is explicit.
