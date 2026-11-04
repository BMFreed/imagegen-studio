# App-level saved accepted-result browser

Base: clean `master` at `588f19f`. Risk: high at read-only IPC/resource and
Open/recovery boundaries. User chose a separate `Accepted results` modal from
Home and Project, with previews, Project names and owning-layer navigation.
PP-005/007/008 and the saved-history boundary in Data Storage are the sources.
The Project-local list remains a separate current-document projection.

## Scope and owners

- Global membership comes only from generated Raster Layers in verified saved
  `.igs`, through the existing derived index. Unsaved Add/Undo/Recover, staging,
  Queue jobs and imported/manual images are not global catalog entries.
- First browser lists all ready indexed Projects newest-first, with no search or
  filters yet. Use 50-row keyset pages (existing Queue display-page precedent):
  `acceptedAt DESC`, path key ASC, owning layer ID ASC. Copies remain separate.
  Page and total use one SQLite transaction and identical health/Trash/lineage
  filters; a removed cursor anchor does not invalidate continuation.
- Internal canonical/asset paths, fingerprints and full provenance stay in Main.
  Strict bounded IPC carries copied summary values, exact Project/document/layer/
  current-asset identity, optional signed image and next cursor. New migration
  adds only a global-order index, not another source of truth.
- Metadata pages do not inspect files, pixels or workers. Explicit Refresh uses
  existing workspace scan before a fresh first page. There is no background
  polling; page transitions read the current indexed snapshot.
- Closed saved-result previews have a distinct process-lifetime signed resource.
  Open-tab URLs cannot safely stand in for saved sources. The resolver checks
  MAC, current index identity, canonical workspace/path/key, file fingerprint,
  verified package and matching provenance/current asset before returning pixels.
  It never substitutes dirty/staged pixels or a merged Project thumbnail.
- No derivative is created in Main. This first browser uses lazy saved-asset
  images, with fallback for unavailable/oversized assets. Preview limits reuse
  generated PNG's 32 MiB ceiling and the supported generation-side ceiling 2048;
  they do not limit `.igs`, current Canvas layers or navigation. Worker-produced
  per-result thumbnails/caching are a later optimization.

## Navigation and refusals

A row click first checks the saved source reference in Main, then follows the
existing Project Open and explicit Recovery decision. After Open/Recover it
rechecks Project/document, layer ownership and current asset identity before a
one-use transient layer selection/reveal. An already-open dirty Project keeps
its unsaved document; absence/replacement of the saved layer yields a visible
unavailable notice, never reload/overwrite. Navigation does not mutate visibility,
camera, bbox, seed, document/Undo/dirty, `.igs`, staging or Queue.

Manual context changes, close, Cancel/Discard Recovery, a superseding row click,
failed Open or disposal cancel the pending intent. A delayed Open that Main
already completed may retain a background tab; it cannot override a later manual
context or show an abandoned recovery prompt. Same-active-Project navigation
never flushes/seals prompt history; genuine Project changes use the ordinary
existing departing-draft flush before Open. Do not reuse candidate/job
identity as accepted-layer identity. Resources from old saved revisions cannot
silently serve another layer or package; oversized/failed previews do not block
valid navigation.

## Parameters and verification

Page size 50 + SQL sentinel follows the existing queue-manager policy, not a
retention limit. Metadata text follows the portable document text domain, with
strict IPC caps. Cursor/reference are copied before awaits. URL MAC is opaque
and process-scoped; a restarted process rejects old resource capabilities.
Preview source-byte/side bounds above are a conservative first display policy;
current assets may legitimately differ from original output dimensions.

Use real `.igs`/SQLite and existing source owners for fixture preparation;
production flow runs compiled Electron/main/preload/renderer. Obtain behavioral
RED before building new code, then test >50 rows/equal times/copies, missing
anchor, health/lineage/count consistency, signed saved pixels, stale/unsafe paths,
Open/recovery continuation and dirty missing-layer refusal with neighboring
controls. Execute isolated semantic mutations and restored greens.

Reuse the approved modal/button/theme composition and shared plain Vue styles.
Inspect actual normal/compact, empty/populated, long-text, pagination/keyboard,
error/placeholder and recovery states. Prototype mocks, controlled generation
pixels and native checks are not full inference/GPU/release evidence. Run checks
required by changed surfaces, record tested source/bundle/migration identity,
and update current roadmap and promise rows/bodies without raising public status.

## Evidence

Executed against the dirty implementation based on `588f19f`, 02.10.2026:

- Backend behavioral RED enters real `.igs`/SQLite and fails on missing global
  page method. Native RED boots the previous delivered compiled bundle, confirms
  three ready real saved Projects/Home rows, then fails on the missing header
  entry point (`ACCEPTED_HISTORY_ENTRYPOINT_MISSING`), with no page errors. All 16
  previous bundle/migration hashes match retained `588f19f` delivery evidence.
- Full application suite: 796/796 green, no failed/skipped/cancelled. This includes
  real SQLite concurrent-writer count/page consistency, 50/50/14 keyset controls,
  copies/ties/removed anchors, invalid/foreign lineage, actual service public
  projection/preflight and unchanged dirty/saved states. Resource suite: 7/7 real
  `.igs`/filesystem tests, including current16 versus original8, symlinks/stale
  package, scratch cleanup and oversized preview with valid navigation.
- Isolated mutations: seven metadata/index mutants and four signed-resource
  mutants killed, with restored greens; two current-navigation guard mutants
  (wrong pixels/foreign document) killed and restored 2/2. Two separately built
  Vue mutants also fail the unchanged native flow: same-tab history incorrectly
  calls the real prompt-history seal handler; a late Open switches away from Home.
  The pristine copy passes all 14 checks. Total: 15 semantic mutants killed.
  Copy/root bundles differ only in esbuild's linked-package path annotations;
  normalized Main/preload and renderer bytes match. Missing-module/tooling setup
  failures were excluded from behavioral evidence.
- Native browser flow reads 96 actual saved records across two Projects and a
  portable copy through compiled Main/preload/renderer. UI pages50/46 retain
  identities and seed0; loaded saved16px images and Main `net.fetch` bytes match
  saved assets while original dimensions stay8px. Hidden-layer reveal, same-tab
  dirty preservation, removed/changed dirty owners, present-target Recovery
  Cancel, history→Recover, Discard-cancel and stale-file Refresh are covered.
  Main `net.fetch` checks exact resource bytes; renderer `img` proves display.
  Renderer fetch is deliberately outside this resource's CSP contract; an early
  harness fetch failure was corrected without widening renderer access.
- UI self-review inspected actual native normal1380×900 and compact900×620,
  saved-versus-dirty, hidden-layer and recovery states, plus shared-component mock
  long-name/empty/error cases. The first layout regression caught list/footer
  overflow: the installed Naive class is `n-card-content`, not the assumed
  `n-card__content`. A public `contentClass` hook and bounded flex body fixed the
  same failing scroll/last-row/footer assertions. Runtime snapshot from T3 preview
  failed repeatedly; navigation/evaluate worked. Native and repository regression
  captures provide the screenshot evidence; no alternate interactive browser was
  introduced.
- A separate targeted source review found unnecessary same-tab draft sealing and
  stale Open focus after manual context changes; both were corrected. This was a
  read-through review with known scope, not a blind product audit.
- Final native browser run: 14 checks, 12 screenshots, zero page errors. It also
  pauses the real Main Open handler, changes to Home, then verifies that the late
  reply only retains a clean background tab. Controlled malformed Main replies
  traverse the actual preload: extra private paths, over-limit pages and preview
  identity substitution return `IPC_INVALID_RESPONSE`; restoring the handler
  returns the real 96-row catalog.
- Full prototype regression: 161/161. Native Results and Generate/Queue regressions
  pass 19 and 29 checks respectively, with zero page errors. Desktop smoke passes.
  Typecheck, lint, formatting, database type generation and production build pass.
  An interrupted reused Vite server and an existing prompt-tooltip click timing
  failure required reruns; they are retained as execution failures, not claimed
  as product fixes.
- Final harness corrections preserve the production contract: Electron evaluate
  receives exports before the user argument; the malformed-reply probe now checks
  its mode before invocation. The post-Close step waits for the public idle state
  because tab removal precedes the real workspace rescan. No sleep or product
  behavior substitution is used to make these steps pass.

Final aggregate check counts, native async controls, exact source/bundle/helper
hashes and commit/upstream identity are recorded in the retained delivery manifest
under `~/.codex/artifacts/imagegen-studio/accepted-history-browser-2026-10-02/`.
Prototype mocks and fixture inference metadata do not qualify CUDA or release
runtime. Public statuses of PP-005/007/008 stay `Пока не обещать`; full pipelines,
Smart Patch history, comparison/result-to-preset and thumbnail optimization remain
separate roadmap work.
