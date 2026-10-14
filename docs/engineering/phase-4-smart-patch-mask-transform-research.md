# Smart Patch mask Transform and Fit

## Prospective scope

Base `cd07cee`, initially clean working tree. High risk: existing mask command,
PNG source/history/Save/recovery ownership. Implements selected-layer Transform
Mask (move/scale/rotate) and Fit Patch BBox to Mask, preserving other layers,
normal Project draft/bbox, internal resolution and accepted provenance.
[Canvas tools](../features/project/generate-mode/canvas-tools.md#transform-tools),
[owned mask](../features/project/generate-mode/smart-patch-layer.md#mask),
PP-007/008 and the [authoring checkpoint](./phase-4-smart-patch-mask-authoring-research.md)
define the boundary. Smart Patch inference/variants/Regional/preset handoffs stay
open; public statuses remain unchanged.

## Decisions and source evidence

Renderer owns a provisional transform session and captured document/layer/mask
identities/revisions. Konva handles edit a separate world-space rectangle, not
Raster nodes or bbox. Apply/Enter submits one command; Escape, owner/revision,
camera/busy/visibility/lock or external focus changes cancel. Main reads actual
verified pixels and bakes transformed alpha to the existing immutable PNG format.
Interactive release rounds anchors and displayed dimensions to whole project
pixels (minimum1px), following Invoke `CanvasEntityTransformer.snapProxyRectToPixelGrid`
and its drag-end rounding. Main command/continuous preview still support fractional
geometry. No new affine persistence schema or worker is required. One Apply is one Undo;
identity/no-op changes no history. Undo restores exact old bytes, not reverse
resampling. Geometry actions do not depend on brush diameter input validity.

Command extends the existing captured edit API with `kind: transform` and finite
world origin x/y, positive scaleX/scaleY and normalized rotationDegrees. Current
bounds define source dimensions. Unit integer translations and quarter turns
preserve exact alpha/PNG content. Other transforms use fixed 2×2 inverse bilinear
samples per destination pixel, clamped interpolation within source pixel-area
rectangle and transparent exterior, followed by tight crop. All-zero minification
refuses rather than silently deleting the nonempty mask. Interpolation is explicit
Main CPU policy, not a claim of Invoke pixel parity; current Invoke defaults
transform smoothing off and also bakes transforms.

User decision: Fit adds **24 project pixels per side**, matching Invoke default
maskBlur16 + padding8. This is the current fixed fitting policy, not a new
configurable blur control or a claim that Smart Patch inference already applies
blur. Its future pipeline/settings owner must consume/update the same policy.
Current Illustrious and Anima generation grid is 8, confirmed in our shared
schemas/plans and Invoke `optimalDimension.getGridSize`; missing model uses 8.
Fit rounds x/y down and right/bottom up to grid 8, retaining at least the requested
padding. Invoke's current fitRectToGrid rounds inward; that behavior could reduce
the explicit 24px margin and is not copied. Bbox/internal resolution are independent;
no invented 64px minimum or mask bitmap allocation is needed for Fit.

Empty/hidden/locked/stale mask operations refuse; Fit reads verified mask bytes
before changing only that layer's bbox. Repeated Fit is a no-op. New resource URLs
are transient current-revision capabilities; mask revision/bytes do not change
on Fit. Existing reader/member/hash/source limits and retained asset owner apply.

## Finite parameters and verification plan

Existing 4M mask pixels,4096 sides,32MiB PNG/256IDAT,32M work and project coordinate
limits remain. Transform scale positive <=10000, angle[-360,360]; Main preflights
actual output extent before allocation, so scale cap alone does not admit huge
bitmaps. General resampling counts conservative19×output +2×source visits; exact
integer/quarter paths count2×source and retain the existing4M coverage ceiling.
Masks are never clipped to bbox/downsampled to evade limits. Source descriptors
and pixels must both validate; failure leaves old document/history/files intact.

- Core actual engine: literal asymmetric matrices for translation/quarter turns,
  fractional coverage and nonuniform scale; finite/all-zero refusal with neighbor.
  Semantic mutation: skip rotation or write additive/incorrect source samples.
- Real Service/SQLite/package: Transform changes only requested mask; Fit changes
  only owned bbox and preserves mask identity/revision/pixels. Save/Undo/Redo and
  staged/recovered asset paths retain exact sources. Mutation: route to first
  Patch; Fit changes primary bbox or drops padding.
- Actual built native UI: real drag/resize/rotation handles, Apply/cancel/owner
  switch, no per-drag commit, literal PNG/Chromium samples, one Undo, source/bundle
  hashes, Save/reopen and actual owned crash→Recover. Reuse mask smoke via optional
  scenario module rather than duplicate fixture/decoder/exit infrastructure.
- Required typecheck, focused/full regression by impact, lint/build, screenshots
  1440×900/900×620 viewed under ui-audit; serial bounded native scopes/actors and
  exact verified-idle payload disposal at completion.

## Executed evidence

Executed 14.10.2026 on the working tree over `cd07cee`. Compact evidence is at
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-transform/20261014-transform/`.
Invoke source was inspected locally at
`/home/user/Work/sources/InvokeAI/`, revision
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`:
`useAutoFitBBoxToMasks.ts` (blur16/padding8), `optimalDimension.ts` (grid8),
`konva/util.ts` (inward fit, intentionally adapted), and
`CanvasEntity/CanvasEntityTransformer.ts` (terminal pixel snapping).

| Actual boundary                                   | Executed evidence                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main transform, codec and request parsing         | Literal asymmetric alpha arrays for translations/quarter turns, fractional/nonuniform resampling, empty/invalid/coordinate/output/work refusals and valid neighbors. Maximum existing coverage remains usable for exact translation.                                                                                                                                                                         |
| Real ProjectService, SQLite and package ownership | Target B preserves A, normal draft/bbox, Raster and internal resolution; one Undo/Redo restores exact mask PNG. Fit changes only B bbox and no mask revision/bytes. Save/read/reopen preserves transformed coverage. A separately packaged valid split-IDAT mask keeps exact original bytes/hash through actual translation and Save/reopen.                                                                 |
| Renderer gesture producer                         | Captured identities/revisions, preview/cancel/no-op and fresh command ownership; fractional API retained, Konva roundoff corrected, terminal pixel-grid snapping tested with nonsquare dimensions/rotation.                                                                                                                                                                                                  |
| Built native Electron                             | `native-r4/report.json`: **57 named checks PASS**, no page errors. Genuine handles move +16/−8, scale X1.5 and rotate90, preview-only pointerup, Apply/Enter, one Undo/Redo, Escape/owner switch, focused-host wheel cancellation, identity/refusals/disabled tools. Independently decoded whole-alpha/PNG comparisons and analytical witnesses; no production transform/codec imports in the native oracle. |
| Persistence/recovery                              | Actual UI Save/raw ZIP readback/clean reopen, rejected corrupted Import, unsaved Transform followed by actual owned process death → Home Recover → Save/readback. Old saved package remains byte-exact until explicit Save; both masks and original Raster retained.                                                                                                                                         |

Regression: `projects-regression.log` has **1820 PASS / 0 FAIL / 0 SKIP**, covering
all `src/main/projects`, renderer component and shared project tests. This ran
before the final terminal pixel-grid helper and layout adjustment; after those
changes, `focused-pixel-grid-final.log` has **59 PASS / 0 FAIL / 0 SKIP** for the
current mask/Service/storage/gesture sources, followed by fresh build/native57.
Required `pnpm run typecheck`, full `pnpm run lint`, `pnpm run app:build` pass
(`typecheck-final.log`, `lint-pass.log`, `build-final.log`). No prototype files
changed; a prototype test would not prove this production boundary.

Reproduce native coverage with a new existing owned evidence directory:
`pnpm run app:smoke:smart-patch-mask --report-file ABSOLUTE_NEW_REPORT --with-transform`.
The existing mask runner is reused; the flag selects additional Transform/Fit
scenarios and an asymmetric fixture authored through real mask tools.
Native source/bundle hashes and final source hashes match. Actual native
process/start identities, cgroup limits and physical exit are retained in reports.

### Sensitivity and corrected findings

Three isolated semantic mutations each produced assertion RED and a neighboring
GREEN, with byte-exact original restoration and all sibling copies removed:

- Wrong quarter selection (`%4 → %2`) fails the actual engine's asymmetric
  quarter-turn matrix; identity/translation remains green.
- Dropping blur from Fit (`margin = padding`) fails the real Service's literal
  owned bbox/Save expectation; real Transform/Undo/Save remains green.
- Always re-encoding an unchanged mask fails the real imported split-IDAT
  translation's exact asset/PNG expectation; changed-dimension real Transform
  remains green. The first core-only neighbor was too remote from Service and
  was replaced by this actual Service control (`mutations-png-service-control`).

Source review identified imported-PNG packaging loss; Main now reuses verified
bytes when dimensions/alpha are unchanged. Test narrowing errors were corrected
without changing runtime assertions. UI self-review identified a conflated
camera test: clicking Zoom out first caused host blur. Final native coverage
uses wheel over the focused host, verifies actual scale change and retained
focus, then checks no command/document publication.

Under `ui-audit`, active Transform screenshots were actually viewed at1440×900
and900×620. Before (`native-r2`), the narrow-window readout/actions overlapped by
4166.97px²; the ordinary-window control did not. The shared top-overlay flex flow
now wraps actions below the readout in narrow windows and places warnings after
both. After (`native-r4`), real rectangles are disjoint and both action-button
centers are reachable at both sizes. Rotation preview and final fitted bbox were
also viewed; approved controls/colors/density are preserved.

Excluded attempts are retained separately and never counted as qualification:
missing owned report parent before launch; native-r1 incorrect test aria-label;
native-r2/r3 fractional pointer displacement when CSS/client sizing and browser
pointer quantization met. Strict alpha/geometry oracles were not weakened.
Final UI release snapping follows inspected Invoke behavior and has an actual
helper test. Earlier typecheck fixture errors and one numeric-separator lint
error are retained in logs; final required checks pass.

### Limits and cleanup

No ML runtime/models/workers or inference were used. This does not qualify Smart
Patch generation/inpaint, variants/staleness/compositing/comparison, Regional
Guidance, presets, blur settings/pipeline, trained Invoke parity, arbitrary image
formats, cross-computer transfer or release readiness. Hidden/locked/empty and
stale commands are exercised through Main. Owner-switch UI cancellation can also
occur through blur; independently isolated owner-watch, window-blur, busy and
external document-revision transitions are not separately native-qualified here,
although their guards and captured producer/Main refusals were inspected/tested.

Heavy actors ran serially with zero swap and deadlines: tests/native actor and
actual native scopes2GiB, typecheck4GiB, lint6GiB. Final native actor peak944.3MiB;
project regression559.7MiB, typecheck1.6GiB, lint3.5GiB. The12GiB generic resource
helper ceiling is not the actual run budget; recorded groups are each2GiB.

After every native process physically exited and mutation restoration was
confirmed, cleanup removed only this run's four owned `native-mask-payload-*`
directories, reclaiming **48,365,568 allocated bytes (46.1MiB)**. Standalone saved
packages, corrupted Import fixture, viewed before/after screenshots, masks,
reports and RED/GREEN logs remain. Current run evidence8.8MiB; global root28GiB,
free43.1GiB. Existing shared27GiB runtime/catalog and historical1.3GiB evidence
remain untouched with the lifecycle's dependency/budget exception. Exact paths,
process checks and inventory are in `cleanup.json`/`artifact-lifecycle.json`.

This closes Transform Mask/Fit authoring only. Public PP-007/008 statuses remain
unchanged. The next roadmap slice is Smart Patch inpaint/generation and accepted
variants, with the remaining Phase4 owners still explicit.
