# Home grid/list and bounded split panels

Base `60932a595577c859f08dcee51d2a349b9a12514a`, clean master/origin at entry.
PP-001 Home browser composition; supporting Home and interface-composition
contracts. Medium-risk UI-only change: no Main/preload/API, package writer,
resource/storage/queue/recovery or provenance mechanism changes. Invoke non-UI
application logic is untouched; no independent domain implementation is added.

## Source and user path

Current sources: `HomeView.vue`, `HomeProjectInspector.vue`, `HomeProjectPreview.vue`
and App-owned Home controls. Approved Vue/Naive prototype: HomePrototype nested
NSplit panels, HomeBrowserToolbar view toggle, HomeProjectCard real layout and
opaque condition-stack vocabulary; Home tests include view and drag/collapse cases.
The installed Naive Split API and implementation own resize/drag, numerical or CSS
size/min/max and disabled handle behavior. Existing IconButton and shared tag-theme
API supplies repeated controls. Preserve this design, not a new palette/docking UI.

App owns viewMode and two preferred pane ratios alongside existing collapse,
search/sort/status. Home exposes ordinary `defineModel` bindings. Both view modes
consume the exact existing visible Project set and existing selection/action
owners; grid uses real thumbnails, never mock artwork. Selection, nested actions,
health/workspace/Trash/pending/recovery guards and signed full-preview source keep
their existing semantics. Switching view or moving a divider must not Open, Save,
resolve recovery, change a saved file/index timestamp or reset the selected viewer.

Grid is the prototype's initial mode; List remains an explicit alternative.
Reset filters keeps view/sort. Scope changes clear selection while retaining view
and panel preferences. Home remount within the App session retains these controls;
no cross-launch preference storage is introduced or qualified.

## Panels and bounds

Two nested NSplit owners redistribute the existing fixed zones. Preferred numeric
ratios default sidebar0.18 and browser/content0.67; these are UI decisions aligned
with prototype density, not domain/capacity limits. ResizeObserver reports actual
available geometry; projected sizes clamp to sidebar210–360px, Inspector260–440px
and Browser at least280px for the supported900px+ desktop widths. Competing bounds
must consider all panes and handles together. Viewport clamping must not overwrite
the user's preferred ratios, so returning to the same width restores the preference.

Collapsed Inspector remains44px and its inner resize handle is unavailable.
Expanding restores the preferred expanded split. No source/Inspector replacement
on toggle or drag: actual viewer state belongs to its existing keyed source owner.
Browser/Inspector/sidebar preserve their own scroll regions, with bounded narrow
controls and readable card conditions. Grid shows at most two opaque condition
tags; Inspector retains the full independent conditions. More metadata and complete
current/new-tab/middle/modifier navigation remain separate consumers.

## Planned verification and remaining scope

Actual built Electron checks will exercise Grid/List, selection and source/zoom
preservation, both divider drags and clamps, collapse/expand, window resize,
filter/scope changes and App-session remount. Real package/shadow/index snapshots
before explicit Open prove that viewing does not mutate document/recovery authority.
Owned fixture setup is controlled and is not crash/ML/visual-quality qualification.
Review actual narrow/wide screenshots and interactive geometry; type/lint/build
alone does not verify the layout. Existing camera/browse tests are neighbors, not
proof of new UI. No low-value tests mirroring CSS or NSplit internals are added.

No prototype source changes are planned; do not rerun its full matrix without a
new reason. Medium UI scope does not require a domain mutation or repeated Main/
Python/inference matrices. Public PP-001/005/007/008 statuses remain **Пока не обещать**;
full Home, remaining Models/export/runtime/release/update and MVP acceptance are
separate. Source, ROOT native execution, visual self-review and retained-byte audit
must keep their distinct evidence levels.

RUN: artifact-root `runs/home-grid/20261112`, temp `t-hg-1112`. Initial root29GiB
(shared17/runs12), disk63GiB free, GPU1398MiB used/14621MiB free. No GPU/ML work,
SHARED/model/runtime copy or dependency, or foreign process change. Serial checks
4GiB/600s/zero swap; native launcher2GiB plus owned app2GiB/controller600s/lifetime300s.
Retain exact source/bundles/fixtures and compact reports before exact idle payload
cleanup after all readers, physical exit and restoration.

## Executed evidence

ROOT ran10 unchanged camera/browse neighbor tests:10PASS/0fail/0skip. These do not
prove the new UI. Final full `typecheck-r3`, four-partition `lint-r2`, later scoped
UI/harness ESLint and fresh `app:build` r2 PASS. Sole unchanged parser exclusion:
`scripts/qualify-installed-regional-init.mts`; existing renderer chunk advisory
remains. Initial lint found four fixable App v-model ordering errors. Prototype
source, Main/preload/shared/worker behavior were unchanged; no broad old runtime,
Python or inference matrix and no domain mutation were repeated for this medium
UI change.

Final actual built `native-r5.json`: **12 checks, two normally closed physical
lifetimes, six screenshots, zero page errors/Vue warnings**,11.755s controller.
Grid/List retain selection, actual thumbnail/full PNG source, same image element
and manual zoom. Both real NSplit handles redistribute space and clamp at900,
1440 and1920; collapse44px disables the handle and expand restores the ratio.
View/width/collapse preferences survive actual Home remount within the App session.
Filter Reset retains view/sort; scope changes clear selection. Real Grid Trash,
Restore and canceled Delete confirmation reuse existing lifecycle owners; no
permanent deletion was executed. All four packages/keys and actual dirty shadow
remain exact. Last-opened changes only for explicit Open, with unique Switch/Close
and no Save. Missing fixture is restored only after final physical closure; no
post-restoration Refresh or crash-recovery claim.

ROOT visually inspected all six final screenshots at900×620,1440×900 and1920×1080,
plus failure and pre-fix List controls. A local density regression was corrected:
new toolbar controls need an850px wrapping breakpoint, while compact List action
rows retain their previous720px breakpoint. Native r4 already passed12checks before
this CSS-only correction; r5 qualifies the final source/bundle. Manual viewer
camera remains manual during viewport resize (Fit is explicit); a partially
panned/zoomed image in the narrow shot is not an automatic fit claim. No remaining
material local issue observed in this bounded self-review; full accessibility,
large-library capacity and whole-Home acceptance remain unqualified.

Independent three-owner source-only review is **CLEAN / READ_FINISHED** and did
not run tests/runtime or inspect screenshots. Final CSS breakpoint separation is
recorded as a subsequent ROOT visual self-review delta, not reviewer execution.

## Retained diagnostics

Earlier attempts are excluded from the final success count:

- r1: one fixture check/one normal lifetime, then browser WebP codec embeds a
  noncanonical ICC profile and the existing strict `.igs` loader correctly refuses
  it. No new UI consumer was reached. Fixture serialization now uses installed
  system Python/Pillow12.2.0 without an ICC override. Fresh clean Invoke
  `4875d96531ca6712b288f6e660fcbb34143408c1` `image_files/image_files_disk.py` thumbnail
  `.save` and its `images/images_default.py` caller were consulted for this test
  codec; application logic and loader constraints are untouched. No ML runtime
  dependency/copy or package install.
- r2: four checks/two normal lifetimes, then exact `Trash` selector fails when the
  accessible name includes its count. Updated the harness selector to retain
  that real UI metadata. The explicit Trash commit in this failed owned fixture
  remains retained; no claim that every lifecycle row was rolled back.
- r3: seven checks/two normal lifetimes, then boundingBox waits for the correctly
  absent collapsed handle. Harness now accepts absent before measuring a present
  handle. Product resize code was unchanged.
- r4:12checks/two normal lifetimes, prior to the List-density CSS correction above.
  Kept as pre-fix visual/control evidence, not added to final12checks.

Exact original harness snapshots for r1/r2/r3 and the common pre-style HomeView
source are retained with SHA matched to their reports. All missing controls in
r2/r3 were restored after normal closure. No OOM, deadline kill or forced close is
reported as success. Legacy `smoke-home-workspaces.mjs` now explicitly selects List
because its lifecycle cases use direct compact actions; syntax/scoped lint only
for that harness change, not a claim of repeating its full native matrix.

## Retention and reproduction

RUN keeps per-check logs/resources, all native reports/screens, source-review
manifest and diagnostic sources. Final source/bundle/payload archives with per-entry
SHA/type inventories and `delivery.patch` bind the staged tree and exact fixtures.
A separate retained-byte audit, physical-exit recheck, lifecycle, release gates and
commit proof establish their own facts. Payload cleanup follows only after those
readers finish, restoration/dependency checks and exact PID/start/scope exit.
No SHARED/model/runtime or external app-data deletion.

Verify archive and every inventory entry before isolated reconstruction. Restore
source with compatible existing pnpm/Electron dependencies and verified built
bundles. Raw native paths may have been removed: do not resume them blindly.
The final saved packages and dirty shadow retain exact original bytes; final
Missing health in the cached index predates its deliberate post-close file restore
and should be refreshed before reusing that catalog. A fresh replay uses
`scripts/smoke-home-grid.mjs --report-file NEW_OWNED_ABSOLUTE_REPORT` under the
recorded controller and system Python/Pillow fixture codec. No runtime provision
or model download is needed. App-session layout is not app-restart persistence.
