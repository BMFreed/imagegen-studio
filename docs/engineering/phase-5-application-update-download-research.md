# Explicit application update Download

Base: `31c528b2db927e8d978f08babc7fa26b482de2b8`, clean `master`.
Risk: **High**, public IPC and native download/cache filesystem boundary.
Contracts: [Application Updates](../features/application-updates.md),
[PP-002](../product-promises.md#pp-002-явное-намерение-вместо-магического-control),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md).

## Fresh source and finite consumer

Read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`
`docs/src/content/docs/start-here/installation.mdx` and clean launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce` `src/main/updater.ts`, its actual
`main-process-manager.ts:167` caller, `index.ts:124` quit caller and builder config.
Exact installed electron-updater **6.6.2** owns provider selection, comparison,
download, differential fallback, temporary file, SHA-512 transport check, rename
and pending cache: `out/AppUpdater.js:389,411–450,535–602`,
`AppImageUpdater.js:30–47`, `DownloadedUpdateHelper.js:33–38,85–148`,
`providers/Provider.js:findFile`. Callers and implementations were reread for this
change; previous research alone was not used as its source check.

The launcher offers explicit Download but no recoverable Linux binary replacement.
Its upstream installer unlinks the old executable before moving the candidate;
the cache skips hashing on same-process reuse. These gaps were reported before
implementation. This slice adapts the existing download and hash mechanisms,
including stable nofollow file checks from Studio's existing runtime transport,
and introduces no separate network loop or installer.

Native artifact cancellation is weaker than metadata cancellation: exact
builder-util-runtime9.3.1 `httpExecutor.doDownload` does not register the supplied
`onCancel` callback to abort the request. Token rejection does not establish
socket/file drain, especially with a held response. Therefore this finite consumer
has no Cancel action. Dismissal leaves the accepted download running; interruption
by normal process exit is handled by a later explicit native cache/download attempt.
There is no promise of partial-transfer resume or background work after process exit.

Publisher signatures, worker/runtime compatibility and safe replacement/recovery
are absent upstream and remain separate obligations. A checksum from metadata
proves integrity relative to that metadata, not publisher authenticity. No file
from this consumer can be passed to an installer. Default publisher configuration
is still absent, so the normal shipping build remains unavailable.

## Data, invariants and failure boundaries

Main owns a transient snapshot and native adapter. An explicit Download sends
only the displayed SemVer label through trusted current-frame/document IPC;
no renderer URL, key, path, hash or installer arguments are accepted. Main admits
only its latest available version. A new check retires old download eligibility
even when the native library retains its old available provider after no-update
or error. Check and Download serialize; repeated Download joins the same operation
and returns independent snapshot copies. Status getters never initiate network work.

The existing snapshot adds `downloadedBytes`/`totalBytes` and three states:
`downloading`, `downloaded`, `download-error`. Versions/notes remain bounded plain
text. Byte fields are null except current native progress and exact verified
completion. Invalid or retired progress is ignored. HTTP progress is advisory;
completion requires reading the actual completed file. Native progress cadence
is about one second and requires Content-Length; unknown progress remains explicit.
The UI status poll is a one-second presentation choice, not a transport timeout
or capacity result. It runs only while an opened dialog observes an active download.

The adapter admits exactly one case-sensitive `.AppImage` descriptor, canonical
64-byte SHA-512 and positive safe-integer size. It retains native differential
download and full-transfer fallback defaults. The sole returned file must be the
expected basename in the native canonical pending directory. Nonregular files,
symlinks, wrong paths, size/hash changes and changing FD/path identity refuse
completion. After an integrity failure, native cache invalidation permits explicit
fresh retry; unsafe cache roots are refused and preserved. A later installer must
independently revalidate final bytes and trust at its own handoff.

Cache path admission runs before native validation/cleanup, not only after the
download. A version-pinned bridge invokes native `getOrCreateDownloadHelper`
(private in its types, present in exact compiled6.6.2); no second cache selection
algorithm is added. Existing directory components and the pending root must be
canonical plain directories before native access. A pre-existing pending symlink
with malformed cache metadata otherwise lets native invalidation delete target
files. Root reproduced that loss on an owned external sentinel fixture, then
verified refusal before native access and preservation after the fix. Protection
against an actively hostile concurrent filesystem actor swapping ancestor paths
during native I/O is not qualified by this check.

Download success does not close a Project, cancel a job, Save/Add a result, alter
runtime/model pointers, replace the current app or register automatic installation.
`autoDownload`, `autoInstallOnAppQuit` and `autoRunAppAfterInstall` stay false.
The existing modal recovers Main download state after dismissal and protects
late replies with its document/dialog epochs. No startup checks or polling are added.

| Parameter | Value and basis | Observation/refusal |
| --- | --- | --- |
| Public labels/notes | Existing128 ASCII SemVer /16,000 UTF-16 units | DTO refuses invalid/private fields; notes clipping retained. |
| Descriptor/progress size | Positive safe integer; no new artifact-capacity claim | Invalid size refuses before native transfer; native I/O errors remain retryable. |
| Hash read buffer | 1MiB, adapted from native `hashFile` | Exact file size/hash and stable identity decide completion. |
| Status polling | 1s UI decision, active opened dialog only | Serialized read-only getter; dismissal/terminal reply retires stale polls. |
| Native socket timeout | Existing60s, builder-util-runtime9.3.1 | No new total-transfer timeout or partial-resume policy. |
| Native differential mode | Existing false `disableDifferentialDownload` | Fixture responds416 if Range is requested; no Range416 occurred in the final cohort. Native policy is unchanged; this branch is not qualified. |

## Verification and remaining acceptance

Verification targets the real service/IPC and native cache file, then actual
packaged Main/preload/renderer against a controlled feed. Corrupt transfer and
same-process cache corruption must refuse; a healthy retry must restore exact
bytes. Controls cover explicit intent, stale version/document, coalescing,
progress, dismissal/reopen, restart cache reuse and preserved own Project/app bytes.
The fixture payload is harmless and never installed; downloaded status does not
establish binary-version, executable-format, publisher or compatibility acceptance.
Semantic mutation must reach final cache verification and have adjacent GREEN
and exact restoration. Browser mocks do not qualify network/storage behavior.

Heavy checks remain serial, MemoryMax4GiB, zero swap, finite600-second outer
deadline; actual owned app scopes are bounded separately by the existing harness.
No GPU/ML/runtime/model copies are needed. Initial artifact root38GiB is a
protected-dependency exception; free disk51GiB, observed free VRAM14686MiB.
Foreign processes are untouched. Retention and physical-exit/restoration checks
precede disposal of exact owned payloads.

## Executed evidence

Root executed the dirty delivery tree over the base above:

- **99 Main/shared/IPC PASS**, no failures/skips:63 check/download/schema/native
  cache filesystem cases and36 neighboring runtime setup IPC cases. Native
  transfer is a controlled port in the adapter filesystem tests; the native cache
  helper, descriptor admission and final file reads are real.
- Required `pnpm run typecheck`, scoped lint of16 changed code/test sources and
  `pnpm run app:build`: **PASS**. Build retains the existing chunk-size advisory.
  Exact dependency pins and production package configuration remain unchanged.
- Focused renderer:20 PASS, then the extra transient progress-error/terminal
  success regression PASS. Required `pnpm run prototype:test --workers=2`:
  **320 PASS**,375.553s, peak3.4GiB, zero swap. These exercise production Vue
  surfaces with controlled API ports, not real network/storage.
- Final actual fused AppImage: four selections and **seven normal physical app
  lifetimes** (default2, healthy2, isolated mutant1, restored2). Default is
  unavailable with **0 metadata /0 artifact** requests. Healthy and restored
  each use **3/3**: three explicit metadata checks and three native transfers
  (corrupt body, held healthy body, explicit restoration after cache corruption).
  Restart cache revalidation adds no artifact request. Mutant stops at its
  semantic assertion with **2/2**, then its one app closes normally. All fixture
  responses drain; source/package identity and actual owned process exits are
  checked. No Node inspector or Main service mock is used.
- Actual Download refusal/retry, native SHA-512 mismatch, held byte progress,
  duplicate coalescing, check serialization, dismissal/reopen and restarted
  native cache reuse all reach packaged Main/preload/native downloader. Four
  own Projects keep exact `.igs` bytes. **Seven retained SQLite stores** each
  have30 exact migration name/hash rows and integrity_check=ok. This verifies
  current-schema persistence; no cross-release migration or active ML/resource
  concurrency is qualified.
- **3 semantic selections =2 GREEN +1 intended RED**. Only the final saved-file
  SHA-512 equality is removed in an isolated compiled AppImage; native transport
  digest remains intact. Same-size cached-byte corruption then produces actual
  `downloaded` instead of required `download-error`, recorded before strict
  comparison. No timeout/setup failure supplies the RED. The other10,871 regular
  ASAR files and feed configuration are identical; normal default/feed ASAR bytes
  match. Source/dist/original AppImages never mutate, and the exact original feed
  AppImage supplies the adjacent healthy/restored controls. The isolated mutant
  is retained for reproduction, never installed.

Independent source review found one cache-symlink blocker. Root reproduced actual
owned-sentinel deletion before the fix; the same regression and19 neighboring
adapter/filesystem cases pass afterward. A separate bounded source-only recheck
is CLEAN for the corrected pre-native admission/private helper bridge. Neither
review ran tests/native flows or inspected artifacts. Root's runtime and retained
byte audits are separate evidence.

Root viewed prototype and packaged progress/completion screenshots at900×620;
footer actions, version labels, real byte progress and literal notes are reachable
and readable. Native harness uses explicit renderer CSS viewport emulation, not
physical window resizing. No broad accessibility/clean-machine visual claim follows.

Excluded diagnostics remain retained: an initial direct Node test invocation
could not resolve `.js` imports (corrected to repository `tsx`); authored native
test types lacked full upstream UpdateInfo/ProgressInfo shape (fixed); first
packaging hit build-tool download ECONNRESET; initial native cache lookup recursed
into unrelated Chromium/font cache depth and failed after healthy download.
The harness now uses the exact bundled qualification cache path. Those failures
are not semantic mutation evidence. The receipt initially named
`poll-regression-red` actually exits0 because the UI fix was already present;
it is recorded as GREEN, never an observed RED. The build-tool bytes were
reconstructed selectively from the previous verified archive, with every copied
file hash checked; no ML environment/weights or shared Project/model was copied.

Evidence: `~/.codex/artifacts/imagegen-studio/runs/application-update-download/20261115`.
Final source/retention/publication receipts are maintained separately. Historical
raw paths require reconstruction; do not resume them after disposal. Actual
executed AppImages and mutation/control evidence are retained; unpacked producer
scratch is inventoried separately before removal. Default package is pinned for
the next concrete install/recovery consumer. AppImageLauncher integration stays
disabled; no host desktop entries or external cleanup are created by these runs.

Retention preserves all **5,916 remaining entries** with a complete archive/live
membership, kinds, modes, link-text and file-hash comparison before disposal.
The archive is480,886,733 bytes; an independent read-only audit confirms its hash,
headers/membership and canonical package bytes without rerunning native tests.
Removing exact idle raw payload/temp/cache paths reclaims591,429,632 allocated
bytes. Four separately inventoried producer directories reclaim1,520,271,360 bytes;
total **2,111,700,992 bytes** (about1.97GiB), without double counting. All three
actual AppImages remain archived, alongside harmless cache-body fixtures; the
default package is separately pinned. Retained run is about611MiB, protected root
about38.36GiB, free disk about49.74GiB. Shared runtime/model/Project dependencies
and unrelated runs are untouched. Git publication is recorded separately.

Shipping trust,
Download cancellation/drain, Install Update close preview, model-install drain,
binary replacement/rollback, migration/protocol/clean-machine and full visual/MVP
acceptance remain open. Runtime setup already has an awaited installation barrier
through `RuntimeManager.retryUnconfirmedGenerationExit`; it must not be duplicated.
PP-001/005/007/008 and all other public promise statuses remain unchanged.
