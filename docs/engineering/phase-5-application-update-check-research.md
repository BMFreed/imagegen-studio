# Manual application update check

Base: `d727707b167297a99acb868f294e8c1095071592`, clean `master`.
Risk: **High** at the public IPC/native package boundary, although this finite
consumer never downloads or installs an application update. Contracts:
[application updates](../features/application-updates.md),
[PP-002](../product-promises.md#pp-002-явное-намерение-вместо-магического-control),
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю),
[research](./research-protocol.md), [review](./review-protocol.md),
[artifact lifecycle](./artifact-lifecycle.md).

## Fresh source and rejected assumptions

Read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` installation
delegation (`docs/src/content/docs/start-here/installation.mdx`), clean Invoke
launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`:
`src/main/updater.ts`, actual `main-process-manager.ts:167` ready-to-show caller,
`src/main/index.ts:124` quit cleanup and `electron-builder.config.ts`.
Launcher lock pins electron-updater **6.6.2**; its exact published bytes and
lock integrity were inspected, then that version installed locally for this
adaptation. The library remains the metadata/provider/version-comparison owner.

Confirmed in exact package `out/AppUpdater.js:97–107`: autoDownload,
autoInstallOnAppQuit and autoRunAppAfterInstall default to true. Constructor
infers prerelease policy from app version. Studio explicitly disables all three
automatic actions and sets the inherited prerelease/downgrade flags false before checking.
Prerelease selection remains provider-specific; the native fixtures qualify the
selected generic stable channel, not every provider/channel permutation. Caller scheduling
is manual; nothing calls app-update check from startup, status reads or normal
close. There is no new provider/download implementation.

Important installation gaps were reported to the user before implementation:
`out/BaseUpdater.js:12–20` installs before scheduling quit;
`out/AppImageUpdater.js:72–110` unlinks the old executable before moving the new
one, with no backup/journal/rollback. DownloadedUpdateHelper can reuse in-process
cache by existence/metadata, without a final hash; Linux publisher signatures and
Studio worker/runtime compatibility are absent. Therefore this consumer exposes
no download/installer/restart authority. Install Update remains an obligatory
separate owner requiring final-byte, compatibility and recovery qualification.
No custom replacement is silently introduced.

Current normal close is not a read-only update preview: appShutdown.prepareWindowClose
begins admission shutdown/cancellation. Its open-tab impact does not cover all
recovered pending rows that queue shutdown cancels, and the resource installer
does not yet expose a full shutdown barrier. This change never enters that path.

## Data and ownership

Existing Help/menu styling and a Naive dialog present explicit Check results.
Main owns availability, updater instantiation/check and a transient projected
snapshot. Renderer sends no feed URL, key, path, version or installer argument.
Availability requires the packaged Linux AppImage and its own bundled
`app-update.yml`; absent shipping configuration gives a fixed unavailable result.
The default package still has no publisher/feed. A qualification-only bundled
generic loopback feed is a controlled source, never shipping trust.

The exact five public fields are currentVersion, availableVersion, status,
releaseNotes and notesTruncated. SemVer-shaped labels are bounded to 128 ASCII
characters; notes are plain text bounded to 16,000 UTF-16 units (an explicit UI
projection decision, not an upstream capacity measurement). No remote HTML is
executed. The native library may create its ordinary app-owned updater/staging
identity; this is not a Project/runtime or app-binary mutation. Its existing
HTTP socket timeout (builder-util-runtime9.3.1, 60 seconds) is retained. The finite states are idle/checking/unavailable/up-to-date/available/error.
Only available carries a remote version/notes. Errors contain no native paths or
URLs. Getter is read-only; native check coalescing is retained. Project, queues,
runtime and close authority do not enter this domain.

Main uses the existing trusted current-frame/document IPC pattern, with strict
zero-argument calls, DTO checks, post-await epoch checks and disposal. Dismissal
only invalidates UI replies; it does not claim to cancel native work. Reopening
cannot be overwritten by old requests. Current version and offline/check error,
retry, no-update, available notes and unconfigured provider are explicit.

## Verification plan and negative scope

Use real service/IPC boundaries, the actual library metadata path on a controlled
feed and actual packaged Main/preload/renderer. Observe no requests before manual
Check or from getStatus, no artifact download on available, no binary replacement
or restart on check/ordinary close, and preserved own Project/database state.
Malformed metadata/network failure must remain retryable. Public responses are
privacy bounded. Browser cases use explicitly controlled ports; they do not
qualify native library behavior. Semantic mutation must reach the consumer and
have neighboring GREEN/restoration, not setup/OOM/deadline failure.

Heavy checks are serial, 4 GiB per service/native group, zero swap, aggregate
native <=8 GiB, finite outer600/owned120-second deadlines. GPU work is unnecessary;
observed foreign GPU work is left untouched. Existing protected artifact root
~37 GiB is an explicit exception; no runtime/weights copies. Temporary package
variants are disposed only after retention, source restoration and physical exit.
AppImageLauncher integration is disabled in qualification (previous incident is
already resolved, not repeated).

Shipping publisher, Download/Install Update, Linux replacement/recovery,
clean-machine install, upgrade/migration/protocol/NoobAI/visual acceptance and
full MVP remain open. PP-001/005/007/008 keep **«Пока не обещать»**.

## Execution

Root executed checks on the dirty delivery tree over the base above:

- **61 Main/shared/IPC PASS**, no skips: the new service/protocol/schema cases
  plus neighboring runtime setup IPC. Constructor/getter cannot invoke metadata;
  held checks coalesce; observers receive independent copies; sync factory and
  network failures settle and permit explicit retry. Invalid/private metadata,
  native errors, caller/document replacement and disposal refuse safely.
- Required `pnpm run typecheck`: **PASS**. Scoped lint covers all 17 changed
  code/test sources; no whole-tree lint claim. `pnpm run app:build`: **PASS** with
  the existing chunk-size advisory. Exact electron-updater6.6.2 integrity matches
  the launcher lock; existing direct dependency pins are unchanged.
- Focused renderer checks: **13 PASS**. Required full
  `pnpm run prototype:test --workers=2`: **312 PASS**. These use the real App,
  chrome and modal with controlled API ports, not native network/storage.
  The later response-only mutation hook has its own GREEN/RED/restoration;
  production renderer/preload bytes were unchanged by subsequent lint fixes.
- Final actual fused AppImage matrix: **four selections / eight normal physical
  app lifetimes**. Default unavailable has **0 metadata / 0 artifacts**. The
  configured original has **10 / 0**, the isolated mutant **10 / 1**, restored
  original **10 / 0**. Every final app closes normally; source-before/after,
  package bytes, owned process/scopes and drained HTTP responses are checked.
  No Main service mock or Node inspector is used. Nine check sequences produce
  ten metadata requests because Chromium retries the controlled destroyed socket
  twice; that is inherited transport behavior, not a new retry policy.
- The actual current/up-to-date and available versions/notes, held duplicate
  calls, Close/reopen while checking, HTTP503, malformed YAML and controlled
  socket failure all reach the exact native checker. Each error remains visible
  and explicitly retryable. Available does not request an artifact in the normal
  original. Startup/status/restart/ordinary close do not perform metadata checks.
  The generic feed/config is bundled only into an isolated qualification package;
  the default package retains no publishing feed. This is not host-wide offline
  or live publisher qualification.
- **Eight final retained SQLite stores** have 30 exact migration name/hash rows
  and integrity_check=ok. Four own Projects preserve full `.igs` bytes through
  metadata checking and restart/reopen; normal saved thumbnail reads and initial
  placeholder assets remain real. This is current-schema persistence, not a
  cross-release migration, active ML/queue/resource concurrency or upgrade test.
- **Nine semantic selections = 6 GREEN + 3 intended RED**, all restored. An
  isolated Main IPC source copy admits a retired document when its epoch guard
  is removed (`true !== false`). A response-only renderer mutation displays old
  0.2.0/retired notes instead of current 0.3.0; the DOM records the wrong result,
  not merely an unobserved timeout. An isolated actual AppImage changes only
  compiled `autoDownload=false` to true: the drained server observes one forbidden
  artifact request (`1 !== 0`) after both normal exits. Remaining auto-install/
  auto-run flags stay false; the valid-hash dummy body is harmless and never
  installed. All 10,871 other regular ASAR files are identical, as is feed config;
  normal default/feed ASAR bytes match. Original source/dist/AppImages never mutate.

A source-only delegate review is CLEAN for the service, exact native adapter,
protocol, Main/preload/UI boundary and absence of download/install/close authority.
It ran no tests and inspected no native reports or QA helpers. Root's executed
results and final source/document/retained-byte self-audits remain distinct.

Early diagnostics are retained separately: a service result shared between two
awaiters (fixed with independent returned clones); an authored assert-narrowing
TypeScript error; local lint/style corrections; an unsupported Electron
Browser.getWindowForTarget RPC; and a payload byte-audit assertion that confused
valid ASAR traversal order with membership. None is a semantic mutation result.
The failed CDP attempt closes normally. The helper uses explicitly reported
packaged-renderer CSS viewport emulation, not physical native window resize.
An initial screenshot caught a modal fade; final capture waits for opaque
ancestors before taking PNG. Root viewed stable unavailable/available notes and
reachable actions at normal and 900×620 renderer viewports. Full accessibility,
all native window sizes and clean-machine appearance are not qualified.

Evidence lives at
`~/.codex/artifacts/imagegen-studio/runs/application-update-check/20261115`:
bounded commands/logs/receipts, exact source/lock/payload/fuse reports, native
metadata request traces, own stores, all semantic controls, retained sources and
lifecycle/retention/publication receipts. Previous and final package cohorts have
separate source hashes; early sources/helpers are retained, not relabeled as final.
Actual AppImages are retained. Idle unpacked producer scratch is inventoried and
removed separately because its exact executed AppImage is self-contained; extract
that retained image into a fresh owned directory rather than resume historical
raw paths. No ML environment, weights, shared Project/model or unrelated run is
copied/removed; AppImageLauncher integration stays disabled and no external
cleanup permission is required for this run.

Final retention compares all **7,594 remaining entries** (membership, kinds,
modes, link text and file hashes) with the archive before disposal; no entry is
omitted. The archive is 788,063,851 bytes. Removing the exact idle `payloads`,
short temporary directory and owned Python cache reclaims **950,345,728 allocated
bytes**; this excludes the separately inventoried unpacked producer scratch.
All five actual AppImages remain in the archive, and the final default package
is also pinned for the next concrete update/recovery consumer. The retained run
uses about 914 MiB; the full protected artifact root is about 37.76 GiB, with
about 50.37 GiB disk space available. Existing shared dependencies remain intact.

Shipping trust/publisher and Download/Install Update remain open. Upstream
unlink-before-move, final-byte verification, app/runtime compatibility and close
admission must be resolved before installer handoff. Promise statuses unchanged.
Git publication is recorded separately after the final audits.
