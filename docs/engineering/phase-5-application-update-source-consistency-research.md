# Captured application source consistency

## Finite contract and risk

High risk, PP-002 Application Updates: preserve an ephemeral source observation
from the current Main and consume it in existing Review/preflight/close/staging
owners. Current HEAD at research: `7fe6411b6ba6ba3aadf70bbc2228b14a9dcf7296`.
The preceding signed offline inspector authenticates current target bytes only.
This next slice refuses observed source substitution before Project close and
prevents staging from silently rebasing the current AppImage after preflight.
All eight promise statuses stay unchanged. Publisher URL/key remain unavailable.

Ordinary Projects/Save and explicit Check/Download/status stay available if the
observation is unsupported. Retained-stage refusal retains precedence. A changed
current source must not invalidate a healthy downloaded candidate or request a
new download. Postseal failures retain existing sealed normal-exit behavior.
No global lease, read-only startup refusal, new signing profile/extractor, rollback,
recovery adoption, healthy-start acknowledgement or retirement is introduced.

## Fresh source check and disclosed gap

Clean InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/frontend/webv2/src/workbench/canvas-engine/rasterSnapshotCapture.ts`:
  private source membership, immutable capture, currency before/after async
  rasterization and a final check across every captured guard. Callers:
  `canvas-engine/engine.ts`, `canvas-operations/generationComposite.ts`,
  `widgets/canvas/invoke/prepareCanvasInvocation.ts`, `invocationSubmit.ts`.
- `invokeai/app/services/model_install/install_staging_ledger.py`:
  `protect_source`, `claim`, `begin_transfer`, recovery preservation and source
  claims; `model_install_default.py:install_path/_register_or_install/
  _install_path_with_info_claimed`, probe/before_transfer and restoration callers.
  These protect lifecycle; they do not provide byte snapshots of an external file.
- `api_app.py:lifespan`, `api/dependencies.py:initialize`, installer startup.

Clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`: `updater.ts`,
`main-process-manager.ts` caller, `electron-builder.config.ts`. Studio donors:
current stage held-FD/path/hash/final guards, `runtime-release-transport.ts`
`inspectFile/verifyCompleteTransportSnapshot`, `offline-runtime-assembly.ts`
`copyVerifiedFile`, native downloaded artifact revalidation.

Invoke/launcher do not provide Electron cached-ASAR/proc/executable discovery or
Linux loaded-body attestation. This was disclosed before implementation. Adapt
their capture/revalidation mechanism inside the existing stage filesystem owner
and add only the pinned Linux/Electron descriptor adapter. No parallel queue,
installer, cryptography or general storage manager is needed.

The enabled integrity fuse does **not** validate Linux ASAR bytes in pinned
[Electron44.4.5 archive.cc](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/common/asar/archive.cc):
header/block integrity branches are macOS/Windows only.
[Browser init](https://raw.githubusercontent.com/electron/electron/v44.4.5/lib/browser/init.ts)
deletes `process._getOrCreateArchive` before user Main. The usable adapter is
`process._linkedBinding('electron_common_asar').Archive(exactAppPath)`:
[native constructor and borrowed FD](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/common/api/electron_api_asar.cc),
[exact-path native cache](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/common/asar/asar_util.cc),
[loader/fs callers](https://raw.githubusercontent.com/electron/electron/v44.4.5/lib/node/asar-fs-wrapper.ts).

Require exact appPath/resources/main dirname/filename equality. No alternative
spelling normalization or fresh ASAR-path open is a cached-descriptor fallback.
Electron's patched `node:fs` exposes virtual ASAR stats; the source-only physical
reader must use `original-fs` in Electron and fail if it is unavailable.

## Owners and implementation invariants

The first Main statements capture only primitive paths, metadata, parent anchors
and own read-only duplicates of the borrowed cached archive and actual executable
descriptors. Finish full baseline hashes once under `whenReady`; metadata must
still match the early capture. Failed/disposed observation never recaptures a
replacement. Fixed file-size/identity checks and 1MiB chunks adapt current stage
readers without weakening ownership requirements for mutable staging files.
Only owned duplicates are closed; native archive FD and shared offsets survive.

A frozen private source capability revalidates complete bytes and identities
before/after async Review/preflight work. Main performs its synchronous current
assertion after document/close-epoch checks immediately before window.close.
The exact captured AppImage FileSnapshot goes into existing stage
`inspectImage(..., expected)` before the first stage write; source checks repeat
through prepublication awaits and final synchronous guards. Own activation
consumes old-target authority, so the intended A→B replacement is not rejected
by the old A snapshot. Existing target/backup/journal guards continue afterward.

## Limits and alternatives

Result means only stable observed sources since capture. It does not prove which
bytes V8 compiled earlier, correspondence among ASAR/executable/outer AppImage,
every unpacked native dependency, signed runtime identity or healthy startup.
A coherent B1/B2 mismatch already present before capture stays outside the claim.
Backup trust and recovery/retirement remain open.

A lifetime per-AppImage lease was researched and deferred. Invoke provides
PID/boot/start claims, but a writable sidecar cannot establish ordinary read-only
AppImage admission without a new startup policy. Allowing unleased Projects
preserves access but cannot prove global exclusivity after permissions change.
Legacy/unleased processes and different dataRoots remain unresolved; the existing
per-dataRoot Electron lock cannot substitute for global AppImage ownership.

## Validation plan

Real tiny-file tests cover unchanged sources, same-byte inode substitution,
in-place changes, FD closure/reuse, parent replacement, async capture/refusal and
owned-only disposal. Service tests observe pre-artifact/impact/close refusal and
healthy candidate preservation. Stage controls reach exact expected-current and
last-await guards, plus successful activation consuming only old-target authority.
Require original GREEN / reached semantic RED / exact restored GREEN in an
isolated actual consumer. TypeScript/Vue, scoped lint, production build and
focused real App/Updates presentation checks qualify the changed surfaces.

Native qualification uses actual production dist/dependencies and ephemeral
local signing material. Stable A→B must pass public Review/Install and normal
physical exits. Separate owned APPIMAGE substitution and pre-Main same-byte
ASAR pathname replacement must reach actual public refusal while Projects stay
usable; the latter distinguishes retained native archive FD from fresh-path
fallback. No ML runtime/models/GPU work is required. Each attempt, admission
overhead, restoration limit and lifecycle remains separately reported.

## Evidence

Root executed final **500 Main cases:499 PASS,1 platform SKIP**. These include
real tiny FD/file/parent snapshots, mode compatibility, no-fallback required FDs,
actual Service/stage/current matching, preflight/close ordering and post-activation
consumption. Final TypeScript/Vue, scoped lint and production build pass.

The two affected real App/Updates browser files have **47 PASS**. An initial
46PASS/one failure remains retained: a new test incorrectly expected Install to
remain after a preflight error, but the existing renderer correctly clears its
old preview. Only that assertion changed; production renderer/SFC/CSS did not.
The unchanged broader Canvas/generation browser matrix was not rerun. Both
1280×800 and900×620 settled prototype screenshots were actually inspected;
fixed source refusal fits without paths/FD details, contradictory unavailable
copy or an Install action. Native refusal PNGs were also inspected; they capture
the transient Refresh spinner and do not qualify an idle control state. Actual
Project editing/Save is established by runtime state and saved package bytes.

The isolated **actual expected-current stage consumer** gave **3 GREEN →2 GREEN
+1 semantic RED →3 restored GREEN**. With upstream currency deliberately held
GREEN, eliding only `currentSourceSnapshot` from `inspectImage(..., expected)`
incorrectly admits/prepares a same-byte replacement inode. Unchanged-source and
real capture/borrowed-FD ownership controls stay GREEN. The original source file
was never mutated; original/restored hashes match. This is a reached semantic
assertion, separate from browser setup mistakes or compatibility failures. The
first pre-correction mutation set is retained separately from final source pins.

Independent finite source reviews are CLEAN: authors reviewed each other's
Main/service/native adapter and FS/stage owners, with a narrow recheck for the
actual native compatibility correction below. These reviewers ran no product or
tests. Final83 qualification pins include relevant sources, exact dist and the
original Node executable observed before native fixture preparation.

### Actual compatibility finding and correction

First native flow R1 genuinely refused clean Review with the fixed source error.
The real packaged ASAR is0664 and its resources parent0775, including inside the
read-only FUSE mount. The new runtime reader's022 mask therefore rejected a
legitimate package before capture completed. This was a compatibility bug, not
semantic RED, and no native PASS is attributed to R1. Exact old source/build,
package/ASAR and native events are retained separately.

The correction changes only two source-runtime permission predicates: borrowed
runtime files/parents permit group-write but deny world-write0002, while exact
UID/inode/frozen modes/FD/path/hash checks remain. Current mutable AppImage and
its parent keep strict022/0755; generic stage directory/file guards are unchanged.
Observed0664/0775 GREEN, later mode drift/world-write RED and unchanged strict
current-image controls execute in the final matrix. The native fixture was not
chmod-ed to hide the failure. Source consistency is not permission-based trust.

R1 exited normally through controlled Cancel/Discard cleanup, with no handoff or
stage. Its original FAIL/pin is unchanged; a separate posthoc receipt confirms all
known PID/start, native/launcher scopes, timer state and FUSE/extraction exit.
An already-collected timer and inaccessible unrelated same-UID proc references
required explicit settlement reporting: accessible references show no owned
payload use; inaccessible references remain a visibility limit. No foreign
process was stopped or read with elevated permissions. This is known-client
settlement, not a global FD-visibility or retrospective qualification claim.

### Final native R2

Root executed three serial **PASS** cases on one new actual A0.1.0/B0.2.0 package
set. Electron44.4.5/builder26.17.0, production dependencies, all42 packaged dist
entries per image and native SQLite match the qualified build. Per-version raw
ASARs are retained and bound to their real AppImage contents. Ephemeral signing
private key remained in producer memory; no publisher identity was shipped.

- **flow-r2**: actual A/FUSE public Check/Download/Review/Install, ordinary Save,
  same stage/backup/native relaunch and actual B/extract-and-run. Saved Project
  prompt reopens in B. Old-target authority is consumed by own activation, and
  both ordinary lifetimes exit0 with physical group/helper cleanup.
- **outer-r2**: after capture, swap only the owned current AppImage for identical
  bytes at a new inode. Review returns the typed source refusal before close or
  stage; healthy B stays downloaded. Restore original inode/content with changed
  ctime, preserve the replacement bytes, and observe a second refusal. No exact
  metadata restoration or recapture is claimed. Project remains editable; Save
  occurs only during ordinary native close, which exits0.
- **asar-r2**: initially extract A; before user Main, keep the native cached-ASAR
  FD and rename only the owned original ASAR aside, replacing its pathname with
  prepared same-byte producer content. The native FD still names old inode while
  visible ASAR names the new one. Source capture refuses rather than reopen the
  fresh pathname; public Check/Download still succeeds, Review returns the fixed
  refusal, no stage/close begins, Project can be edited and normally saved/closed.
  This establishes the retained-descriptor boundary, not arbitrary V8 attestation.

Qualified totals: **four normal app lifetimes, six owned HTTP requests, three
actual saved Projects, three exact30-migration SQLite stores**. Every native
ASAR descriptor remains open in the observer registered after Main's source
disposer; no borrowed FD was read or closed by qualification. Own duplicates
are separately tested by the FS matrix. All original Electron/SQLite/Node bytes
are unchanged. No ML engine/model execution or GPU allocation is involved.

Both A/B production `whenReady` continuations are held until exact PID/start/ASAR
and promoted scope inode admission; full source hashes run after that gate.
Original native callbacks execute once. Explicit CDP/X11, native dialog choices
and posthandoff final-close timing are nonshipping controls. Native promotion
overhead before admission is measured but outside continuous-lifetime budget
claims. Admitted native envelope stays ≤3.375GiB aggregate (launcher1GiB,
old/new each1GiB, at most three128MiB watchdog ceilings), swap0,600s per phase.
No forced termination counts as a successful close. Existing engine Setup/Repair,
changed migration compatibility, recovery adoption, global lifetime ownership and
retirement remain open; all promise statuses stay unchanged.

## Evidence and lifecycle

Current run: `~/.codex/artifacts/imagegen-studio/runs/application-update-source-consistency/20261116`.
Compact owners: `qualification-summary.json`, `qualification-source.json`,
`native-package-manifest-r2.json`, all three `native-*-r2-result.json`, original
`native-flow-r1-result.json` plus `native-flow-r1-exit.json`,
`source-at-native-r1.json`/archive, browser JSON attempts,
`mutation-expected-current.json`, `source-review.json`, `ui-audit.json`.

Complete retention/disposal receipts are `payload-inventory.json`,
`retained-payloads.tar.gz`, `retention.json` and `artifact-lifecycle.json`.
Original failed attempts, source compatibility correction and settlement limits
remain separate from final PASS. Archive content aliases require fresh independent
reconstruction for current/cache/backup/executable files, never hardlink extraction
or old PID/inode reuse. Old raw --resume is not assumed. Independent full live/
archive audit precedes disposal (`final-audit-live.json`); final source/retained
audit is separate from Root executions (`final-audit.json`). Delivery requires
CLEAN, retained lifecycle with empty raw payloads/dependencies/pins, and exact
committed-byte/remote proof in `commit-proof.json`. Only this run's idle payloads
and `t-ausc-1116` are disposable. No shared runtime/model, ordinary app data,
global cache, host integration or original executable is a cleanup candidate.
