# Standalone Linux app package

Base: `3905ef1b6b85ef730ac600af19617d8dca71cc0e`, clean `master`.
Risk: **High** — package membership, native SQLite ABI, bundled migrations and
static resources determine whether the app can open and preserve user state.
Contracts: [Phase 5](../specs/01-implementation-roadmap.md#фаза-5-первый-linuxnvidia-релиз),
[application updates](../features/application-updates.md),
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md).

## Current gap and finite consumer

`app:build` produces `dist` and externalizes `better-sqlite3`; previous native
checks launch a development Electron from the checkout. There is no versioned
standalone app package. The next consumer is the existing Main, renderer,
sandboxed preload, SQLite binding, bundled SQL migrations and placeholder PNGs
running outside the checkout with isolated app data. No inference change.

The first local artifact uses development version `0.1.0-dev.1`, Linux x64 and
AppImage. This selects the Invoke launcher's package mechanism for subsequent
qualification, not a proven signed distribution/update/recovery guarantee.
There is no publishing feed, signing identity, automatic app-update check or
runtime source. The user already confirmed no shipping publisher exists.

## Fresh Invoke basis and callers

Read clean local InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`,
`docs/src/content/docs/start-here/installation.mdx`: the desktop distribution
owner is Invoke launcher. Read clean launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce`:

- `electron-builder.config.ts`: Linux AppImage, payload selection, ASAR and
  Electron fuses; `package.json` package command calls build and electron-builder
  with `--publish never`; `.github/workflows/build.yml` build-linux actually calls
  that command and retains AppImage artifacts.
- `src/main/updater.ts` uses electron-updater check/download/quitAndInstall;
  `src/main/main-process-manager.ts:167` invokes check on ready-to-show. Studio's
  manual-only contract excludes this scheduling. No updater is added here.
- Launcher quitAndInstall lacks Studio's Project/queue/staging and confirmed
  physical-exit barriers. It cannot be copied as a restart shortcut.

Invoke already supplies the packaging mechanism. Its config has no Studio
payload, SQLite or signed-runtime trust policy; those are mapped to the existing
Studio owners. Missing signing/publisher and clean-machine recovery guarantees
were reported before adaptation. No custom installer, sampler, runtime, queue
or acceptance wrapper is introduced.

## Boundary and parameters

The pinned builder is `26.17.0` from the launcher version range, with exact
lockfile integrity. Electron remains the existing exact `44.4.5`. The payload
allowlist includes package metadata and `dist/main`, `dist/preload`,
`dist/renderer`; `dist` sourcemaps are excluded. Builder's standard production
dependency collector and native rebuild own SQLite/transitive payloads.
Source checkout, tests, docs, worker environment, weights and user app data do
not belong to the package. ASAR and native unpack follow the Invoke mechanism.
No native compatibility is inferred from successful packaging alone.

Builder26.0.12 initially failed the existing pnpm exotic-subdependency policy
because its rebuild3.7 selects Git node-gyp. A tested override to registry
rebuild4.2 failed its private `search-module` import and was removed. Builder
26.18.0 selects an unpublished rebuild4.2.1 in the observed registry, so the
compatible 26.17.0 is pinned instead; it resolves registry rebuild4.2.0 without
overrides or weakening policy. The Windows installer build script is explicitly
disabled for this Linux-only target. Existing direct dependency pins are unchanged.
The existing Kysely-codegen/better-sqlite3 peer-range mismatch is not introduced
by this packaging change. These setup failures are not semantic REDs.

Builder may rebuild workspace native dependencies. Qualification must protect
and compare the existing binding and restore any changed bytes before claiming
host checks or handing back. A separate package copy is required for deliberate
payload mutations; mutating a hardlink to the original is prohibited.

Local heavy checks are serial, 4 GiB per launcher/service, zero swap and a
600-second outer deadline; native scopes are separately bounded and their
aggregate recorded. No ML environment/model is copied and no unrelated process
is stopped. The existing ~36 GiB protected artifact root is a recorded budget
exception; only this stage's package/build fixtures are disposable after
retention, restoration and physical exit.

## Verification and limits

Verify payload membership, selected Electron/version/fuses and native binding;
then launch the actual package outside the checkout with empty isolated app
data. Observe real Home/preload/IPC, SQL migrations and persisted own state after
normal close/reopen. Default Setup must still refuse clearly without a provider.
Check static resources through actual owners. Package bytes and original app
data/source dependencies must not change. A meaningful payload mutation needs
neighboring GREEN and exact restoration; setup/OOM/deadline failures are separate.

This is local Linux package qualification on the current host. It does not
establish clean-machine driver support, shipping signature/trust, successful
app update/interruption recovery, migration compatibility across released app
versions, native model quality/capacity, NoobAI release matrix or full MVP
acceptance. PP-001/005/007/008 remain **«Пока не обещать»**.

## Execution

Root executed the versioned package command with the existing exact local
Electron distribution (no second Electron download), isolated builder cache,
4 GiB/zero-swap/600-second outer limit. Builder26.17 completed its actual native
rebuild, standard production dependency collection, ASAR, fuses and AppImage
producer. All eight existing workspace SQLite bindings retained original bytes,
inodes, modes and mtimes; no restoration mutation was required. The actual
payload has 11,991 ASAR members, 42 matching non-map built consumers and all
30 SQL migrations. Native linux-x64 SQLite is unpacked and byte-exact. Root's
payload/fuse audit verifies the actual package, without establishing shipping
signature/trust. Typecheck, three source package guards and 35 existing
host-storage/portable-package/placeholder tests pass.

The first native attempt reached real packaged Home, unavailable Setup, UI
Create and normal physical close. The installed host AppImageLauncher's binfmt
integration moved the test artifact into `~/Applications` and wrote one desktop
entry plus six icons outside the intended XDG fixture; restart then failed to
spawn the original path. This is a retained harness-isolation failure, not a
semantic RED or successful restart. The exact own bytes/paths were inventoried,
a verified copy restored inside artifact root, and qualification now sets
`APPIMAGELAUNCHER_DISABLE=1`, following the
[maintainer's documented bypass](https://github.com/TheAssassin/AppImageLauncher/discussions/679).
The user explicitly authorized deletion of only those eight retained/inventoried
external files. After identity/hash/physical-exit rechecks, Root removed exactly
those files (146,677,782 bytes); no other external file or system integration
service was changed. Inventory and cleanup receipts are retained.

A second excluded native attempt read Chromium's stale DevToolsActivePort after
normal first close. Its owned restart wrapper was forcibly settled; this is not
a successful normal close. The harness now clears only its own discovery files
between physically closed lifetimes. Root separately confirmed both recorded
PIDs absent and no remaining process with this owned extraction path before
retry. The successful controls below do not include either excluded attempt.

Final Root execution:

- `native-r3` and `native-restored`: **two complete GREEN selections, four normal
  app lifetimes**, eight recorded checks per selection. Actual fused AppImage
  starts outside checkout with isolated cwd/XDG, no Main Node inspector and no
  service mocks. Home/preload/IPC, unavailable Setup, explicit UI Create, fresh
  startup/reopen and actual saved thumbnail all pass. Current generation defaults
  and empty resource identities are preserved. Process identities/scopes are
  physically exited after all successful closes. Each native group is <=4 GiB,
  zero swap, aggregate <=8 GiB with 120-second owned deadlines.
- Root opened both retained SQLite stores from the first GREEN: **30 exact
  migration name/hash rows each, integrity_check=ok**, plus valid five-member
  `.igs` ZIPs whose two preview members match the real bundled placeholders.
  `.igs` bytes are identical after restart/reopen. This is current-schema
  persistence, not a cross-release migration or binary-update test.
- One isolated rebuilt AppImage omits exactly `dist/main/placeholders/empty.webp`.
  All 10,622 common regular ASAR files are byte-identical. Its actual UI Create
  reaches the packaged consumer and returns a visible error: **semantic RED**
  (`error !== created`), followed by normal physical close. The original source
  and AppImage are unchanged, and the subsequent full GREEN uses that original
  artifact. **Three selections = 2 GREEN + 1 intended semantic RED**. No setup,
  OOM, forced close or global timeout is counted as RED.
- Scoped ESLint passes all three new config/test/smoke sources. No renderer or
  prototype implementation changed; the previous full browser matrix was not
  rerun or relabeled as current evidence. Root viewed actual packaged Home with
  unavailable feedback and restarted Home/thumbnail at 1380×900 using the local
  ui-audit checklist. No clipping or inaccessible action observed there; this
  does not qualify all window sizes/accessibility.
- A bounded source-only delegate review reports CLEAN for config, dependency,
  lock and publishing boundaries. It did not read the smoke script, execute
  tests/native flows or audit retained bytes. Root's smoke/source/runtime and
  archive audits are distinct self-verification.

Known package limits include the default Electron external icon and unqualified
Linux desktop association; in-app approved artwork is unchanged. Signing,
publisher discovery, clean-machine/FUSE installation, manual app updates,
interrupted replacement/recovery, release protocol/NoobAI/visual matrices and
full MVP acceptance remain open. No promise status is promoted.

Evidence lives at
`~/.codex/artifacts/imagegen-studio/runs/linux-app-package/20261115`: bounded
commands/logs/receipts, package payload hashes, source review, actual native
reports/physical-exit and own stores, mutation byte proof/GREEN/RED/restoration,
source freeze and lifecycle/retention/publication receipts. The canonical
unsigned development AppImage is retained in `retained-package/` (146,606,129
bytes, SHA256 `136d39ccd4178bed25197ee9809aca8a57039f6d91f70df2a85255338e458a21`).
It is a local qualification artifact, not a published trusted release. No ML
runtime, model, shared managed Project or unrelated run was copied or removed.
Raw temporary paths become historical after retention; use the retained archive
and reconstruction instructions rather than assuming they still exist.

Root retained **all 5,656 raw entries**, with no omissions, in the
612,706,818-byte archive. Before deletion it verified full archive/live
membership, kinds, modes, symlink text and regular-file hashes; no symlink target
was followed. Exact idle `payloads`, short `t-lap-1115` and harness cache were
disposed, reclaiming **1,158,627,328 allocated bytes** (hardlink-aware). The full
run is about 875 MiB including the separately retained AppImage, external-event
evidence and original/mutated package reproduction bytes. The protected root
remains about 37 GiB under the recorded existing-root exception. No shared ML
payload or unrelated data was removed. Archive/source/retention checks are Root
self-audits; Git commit/push proof is recorded separately from local validation.
