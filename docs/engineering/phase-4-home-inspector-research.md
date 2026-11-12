# Home selected Project Inspector and saved merged preview

Base `ee20865eaf5a0da15d2dededd40485583d07a6a7`, clean master/origin at entry.
PP-001 Home composition and PP-007 explicit document/recovery ownership; supporting
contracts: `docs/features/home-screen.md` and `docs/contracts/interface-composition.md`.
Risk: high for the expanded media-read authority, medium for transient UI selection.
No new persistence/schema/queue/recovery writer is introduced.

## Fresh source and adaptation

Clean Invoke `4875d96531ca6712b288f6e660fcbb34143408c1` was read before implementation:

- `invokeai/app/api/routers/images.py`: full/thumbnail routes, read access and
  storage-maintenance refusal; callers of the image service.
- `invokeai/app/services/images/images_default.py`: record-owned `get_path` and
  URL/DTO projection; `image_files/image_files_disk.py`: canonical/traversal-safe
  image path resolution.
- `invokeai/frontend/webv2/src/workbench/widgets/preview/PreviewWidgetView.tsx`:
  selected image uses full URL independently of thumbnail; `PreviewFrame.tsx`
  and `PreviewMetadataPanel.tsx`: source-keyed load/error/metadata state.
- Gallery `features/gallery/core/imagePaths.ts`, `data/backend.ts`, `data/queries.ts`
  and `ui/useGalleryImageRecovery.ts` provide the referenced URL/request callers.

Invoke has no `.igs` merged-member read. This mismatch and the adaptation were
reported before adding the path. Studio adapts the separate full-image resource
through its existing HMAC preview owner, current index/lifecycle authority, path
lock and validated package loader. No new storage/cache/queue or acceptance owner.

## Finite user path

Single click/keyboard selection of an existing list row → selected Inspector →
`ProjectSummary.previewUrl` → existing `igs-preview` protocol → authenticated
merged capability → current index, workspace/canonical path and file witness →
lock/re-read lifecycle/index → full package validation → mandatory
`preview/merged.png` → source-keyed viewer with actual image dimensions.
Viewing has no Open, Save, Add, recovery resolution or last-opened write.
Open/Move/Reveal/Rebuild/Locate/Trash actions reuse existing explicit callbacks and
guards. Existing Open navigation remains its prior owner; this slice does not
qualify all current/new-tab/middle/modifier opening semantics.

Inspector follows the approved Vue/Naive prototype vocabulary, with real saved
pixels replacing synthetic artwork. Available metadata is title, workspace,
saved generation-area size and saved/cached timestamps/conditions. Model, layer
count and active filename are not fabricated from unavailable summary fields.
The image is the saved merged preview, which may be downsampled and have a finite
visible-content rectangle different from the primary generation bbox. It is not
an export or a live unsaved Project composition. Unavailable preview, empty,
missing/corrupt/unsupported Project, workspace and recovery conditions stay
independent. Open Projects still preview saved bytes.

Selection clears when scope changes or its row leaves the visible set; it never
chooses a replacement Project implicitly. Inspector collapse persists for the
App session across Home remount. Viewer resets with Project/source identity;
late events for another source must not publish stale dimensions/error/pixels.
Zoom/pan/fit/reset are reversible viewer geometry, with pointer cancel/lost capture
and actual image/viewport aspect ratio. Browser and Inspector retain usable own
scroll regions at 900×620 and 1440×900. Grid, panel resize, richer saved metadata
and cross-launch layout preferences remain separate consumers.

## Media authority and failure controls

A thumbnail SHA cannot identify a merged PNG: preview-only maintenance can keep
both thumbnail and document revision while changing the merged image. Therefore
merged URL includes SHA-256 of the indexed file fingerprint as well as Project
key and thumbnail SHA, with a distinct `merged` HMAC domain. No machine path is
published in that URL. Old thumbnail URL format/signature remains compatible.
The preload admits only the opaque PNG URL shape (or omitted/null for older
producers); the Main protocol checks its process-lifetime MAC. Only GET is served.

Before and under the existing file lock, media reads verify health, current
identity/workspace/fingerprint and positive-delete/relocation authority. Merged
reads additionally compare the version token and validate actual package document
ID/revision. Loader checks embedded member SHA/format and the final lstat witness
must remain current. Missing/replaced/unsafe package or stale version refuses;
no fallback to another Project/thumbnail cache masks this failure. Trash may read
its existing saved owner, but committed Delete denies reads. A fresh Refresh can
publish a new capability; selection/viewer resets to its changed source.

Merged reads use no new derived cache. Existing thumbnail cache repair behavior
is exercised by neighboring tests. Cache-directory failures remain advisory;
package bytes stay authoritative. As with the existing owner, external processes
are outside app locks and final-stat/response timing is not a universal filesystem
transaction or malicious same-stat mutation guarantee.

## Limits and planned evidence

No new product numeric cap. Existing package ceilings are mergedPreviewBytes and
readMemberBytes256MiB, raster side32768. The compositor's MAX_PREVIEW_SIDE2048 is
an output convention, not an external-package capacity promise. PNG decode/GPU
capacity and arbitrary huge Projects remain unqualified. Viewer zoom bounds are
presentation controls, not generation limits. Controls use two rendered PNGs with
the same thumbnail/revision, empty/unavailable/missing siblings, and a real shadow.

Planned: affected real-package/SQLite/Service/preload suites, full typecheck/lint/
app build, actual built native UI/merged protocol and source-replacement flow,
byte-exact package/shadow/index controls before explicit Open, narrow/wide UI
self-review, one causal version-check mutation with adjacent GREEN/restoration,
scoped independent source review and separate retained-byte audit. No prototype
source change, ML run, runtime/model copy, foreign process stop or SHARED dependency.
PP-001/005/007/008 stay **Пока не обещать**; this is not full Home/MVP acceptance.

RUN: artifact-root `runs/home-inspector/20261112`; own temporary root `t-hi-1112`.
Initial inventory root29GiB(shared17/runs12), disk62GiB free, GPU7463MiB used/
8556MiB free. Serial checks4GiB/600s/zero swap; native launcher2GiB plus owned
app2GiB, controller600s/lifetime300s. No GPU work is scheduled in this slice.

## Executed evidence and diagnostics

ROOT executed **195 affected tests in nine files**, no failures/skips; focused
26 are a subset. `typecheck-r3`, four-partition `lint-r2`, later scoped Home/
harness ESLint and fresh `app:build` r2 PASS. The sole unchanged parser exclusion
is `scripts/qualify-installed-regional-init.mts`; the existing renderer chunk
advisory remains. Prototype source was not changed, so no prototype rerun.
Initial lint found11 auto-fixable Vue-key/sorting errors; they were fixed before
final checks. No Python/inference/release matrix was repeated.

Final built native `native-r3.json`: **10 checks, two normal physical lifetimes,
six screenshots, zero page errors/Vue warnings**, 7.98 seconds controller time.
Actual saved PNG/browser decode, viewer tools, source/scope/filter selection,
empty/unavailable/missing controls, unchanged package/shadow/last-opened and
explicit Open/Switch/Close pass. A same-thumbnail/same-document-revision preview
replacement preserves exact project.json/raster bytes while changing merged PNG.
Old URL refuses before and after actual Refresh; the new URL serves exact PNG.
Deliberate final replacement stays coherently indexed, with original retained
separately; the missing control file is restored after normal closure.

Earlier attempts are retained and excluded from this success count:

- Native r1 stops after fixture setup because the Naive row Button receives
  `textColor="var(--app-text)"`. Its hover-color computation throws
  `[seemly/rgba]: Invalid color value var(--app-text).`; row content disappears.
  ROOT inspected the failure screenshot, reproduced the installed-library error
  directly and removed this prop so the existing Naive theme owns the colors.
  Both app lifetimes closed normally; the missing fixture restored exactly.
- Native r2 proves the rendered preview/zoom/pan, then stops on an incorrect
  harness assertion that Reset must differ from Fit. The128×64 fixture fits at
  centered100%; the existing camera intentionally does not upscale. The corrected
  scenario zooms away first, then asserts centered100% Reset. Product geometry
  was not changed. Both lifetimes closed normally and restoration was exact.

One version-guard mutation was executed with byte-exact restoration. The final
control pair (`mutations-control.json`) has **six selections = five GREEN + one
semantic RED**: removing both merged fingerprint-hash comparisons returns200
instead of404 for the old capability after rescan. Thumbnail/cache-repair control
stays GREEN. The first pair (`mutations.json`) is retained too: six selections,
four GREEN/two semantic RED, because the nominal success test also contains a
version-rejection assertion. It was not an unchanged positive control, so a
separate thumbnail control was selected. Neither RED is an import/setup/OOM/
timeout result. Both experiments restore exact ROOT/isolated owner SHA.

Independent seven-owner backend/API source review is **CLEAN / READ_FINISHED**,
with fresh Invoke/callers, no edits or execution. UI/harness/capacity and artifact
bytes are outside that review. A later ESLint-only order of two API fields is
recorded separately as ROOT self-check. ROOT visually inspected all six final
900×620/1440×900 screenshots and both failure screenshots: no remaining material
local defect observed. This bounded self-review is not independent UI, full
accessibility, generation visual-quality or whole-Home acceptance.

## Retention and reproduction

The RUN keeps check/resource logs, source-review manifest, native reports/screens,
UI failure diagnostic, both mutation experiments and exact rollback snapshots.
`final-source.json`/`.tar.gz`, `delivery.patch`, `qualified-bundles.json`/`.tar.gz`
and `payload-inventory.json`/`retained-payloads.tar.gz` bind source, built app and
fixtures to the staged tree. Separate `final-retained-audit.json`, physical-exit
recheck, lifecycle, release gates and commit proof must confirm their own facts;
the authored note alone does not establish them. Raw payloads are removed only
after that audit finishes, restoration, exact PID/start/scope exit and dependency
checks. No SHARED/ML dependency, model or external app data is touched.

Verify archive SHA and every inventory entry before reconstructing into an
isolated destination. Restore source with its compatible existing pnpm/Electron
installation and verified built bundles. Native reports may refer to removed raw
paths: do not resume them blindly. The final rendered fixture is deliberately
the replacement version; `retainedRendered` preserves the original. Other saved
packages, actual dirty shadow and its stable keys remain exact. For a fresh run,
use `scripts/smoke-home-inspector.mjs --report-file NEW_OWNED_ABSOLUTE_REPORT` under
the documented bounded controller. Fixtures are prepared while physically closed,
not crash qualification. OS picker control and Main `net.fetch` diagnostics are
explicit; actual image rendering uses the unchanged CSP image resource path.
