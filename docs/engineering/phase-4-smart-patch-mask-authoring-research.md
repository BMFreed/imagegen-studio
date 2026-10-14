# Smart Patch owned mask authoring

## Prospective scope and risk

Base: `e22ce66`. High risk: editable mask pixels cross typed IPC, document
history, asset capabilities, atomic `.igs` Save and local shadow recovery.
Supporting contracts: [owned masks](../features/project/generate-mode/smart-patch-layer.md#mask),
[Canvas tools](../features/project/generate-mode/canvas-tools.md),
[document lifecycle](../features/project/document-lifecycle.md), PP-007/008 and
the [empty foundation](./phase-4-smart-patch-foundation-research.md).

This slice implements Brush, Eraser, Lasso and Polygon Lasso, explicit
add/subtract, mask overlay and clear, independent layer-owned mask pixels,
one history step per gesture, Save/reopen and local crash recovery.
Transform Mask and Fit Patch BBox to Mask remain the next required MVP tools;
their affine/padding/grid behavior is not represented by inactive controls.
Smart Patch generation, variants, staleness, compositing and Regional Guidance
remain later phase-4 slices. Public promise statuses stay unchanged.

## Data path and decisions

Native pointer → captured renderer gesture → validated preload/IPC → Main
ProjectService → deterministic typed mask rasterizer/PNG encoder → existing
document/history/shadow coordinator → package → signed owned mask resource.
Renderer preview is provisional; Main creates authoritative pixels and asset
references. No image worker, model, runtime or generated Raster output is used.

The existing empty descriptor `{id, revision: 0, asset: null}` remains readable.
Clearing a nonempty mask retains its identity and increments revision. Painted
masks add a bounded immutable PNG and its integer project-space bounds. One
mask pixel covers one project pixel, independent of the Patch bbox and internal
resolution. Moving/resizing the bbox does not move, resize or clip mask pixels.
An affine transform is not added until its consumers actually implement it.

Assets live at `assets/masks/<mask-id>/<sha256>.png`. Alpha bytes represent
linear coverage; canonical 8-bit RGBA uses white RGB and alpha coverage, so RGB
color conversion cannot change mask meaning. Content hashes and ownership are
validated on Save/load/shadow/resource access. Masks belong to the document
asset inventory, but contribute no composite pixels, Project preview bounds,
accepted-history record or generation provenance.

Each gesture captures Project/document/layer/mask identities, baseline document
and mask revisions, tool, operation and size at its start. Owner/revision change,
Escape, pointer cancellation or loss of the owned pointer capture cancels the local preview.
Polygon keeps its session between clicks without capture; unrelated/implicit
capture loss does not cancel that session.
The final command never consults current selection to choose its destination.
Stale commands refuse before mutation; exact no-op leaves history/revision alone.
One completed gesture is one Undo step, and retained immutable assets remain
available for Undo/Redo and recovery through the existing asset owner.

Implementation choices: brush starts at 50 project pixels (current Invoke source
default), diameter 1–512, opaque round brush with fixed edge antialiasing, no
pressure/advanced brush engine. Lasso closes on release; Polygon closes on Enter
or its first vertex. Polygons use even-odd filling. Add/Subtract is explicit and
captured at gesture start. Hidden or locked Patch editing is disabled; Pan stays
available. The selected mask overlay is an inspection state independent of layer
visibility/lock, matching the approved prototype; its viewer toggle remains
available. Overlay visibility never changes mask pixels or generated Raster data.
The operation selector is visibly labeled Lasso operation: Brush adds coverage,
Eraser subtracts, Lasso/Polygon use the captured Add/Subtract choice.

## Finite limits and refusal plan

These are engineering safety ceilings, not measured model/runtime capacity:
mask bitmap at most 4,000,000 pixels, each dimension at most 4096, encoded PNG at
most 32 MiB with at most 256 IDAT chunks, up to 8192 points per gesture, and at
most 32,000,000 candidate pixel
visits per edit. Coordinates use the existing project-space range. Main validates
shape and prospective work/allocation before publishing. A too-large or invalid
gesture leaves document, history, assets and saved package unchanged; no silent
clipping to the bbox or downsampling is used. The IDAT limit rejects the 257th
chunk before retaining its data view; the current encoder writes one IDAT.
A byte ceiling alone would allow millions of tiny chunk objects even for a
small bitmap, so chunk count is bounded separately. Tiled masks/advanced brush engines
are outside this slice. Refusal tests use small inputs/headers, not huge buffers.

## Verification plan

- Real Service/SQLite/package/shadow boundary: paint B changes only B, preserves
  A, normal draft/bbox and Raster bytes; stale/wrong-document/wrong-mask/missing/
  Raster/locked/hidden targets refuse without history or asset effects. Neighbor:
  corresponding valid A edit. Mutation: always write first Patch.
- Actual rasterizer/PNG: literal interior/exterior/erased pixels, precise world
  coordinates and even-odd fill; no-op and clear. Neighbor: additive brush.
  Mutation: Eraser becomes Brush.
- Actual package/recovery and retained assets: decoded pixels survive Undo/Redo,
  Save/reopen and crash→Recover; missing/corrupt/unsafe mask data refuses rather
  than becoming an empty mask. Neighbor: old empty Patch/Raster-only document.
  Mutation: mask assets disappear from the shared asset collector.
- Built native pointer interaction: actual camera/zoom coordinate contrast,
  captured owner, cancel, two masks, one grouped history action, overlay-only
  viewing and unavailable-worker Save. Independent browser PNG decoding provides
  pixel assertions; using only the production rasterizer as an oracle is avoided.
- Required typecheck, lint/build and bounded serial regression checks. Inspect
  final screenshots at 1440×900 and 900×620. Preserve compact evidence and dispose
  exact idle isolated payloads only after physical exit/restoration.

## Executed evidence

Evidence root: `~/.codex/artifacts/imagegen-studio/runs/smart-patch-mask-authoring/20261014-authoring/`.
No model weights, runtime copies or ordinary user library were used.

- `app-tests-r2.log`: full application regression, **3751 PASS / 0 FAIL / 0 SKIP**,
  serial 2 GiB/zero swap, 640.6 MiB peak. This full run preceded the additional
  IDAT-count guard/test; test inputs were hashed and unchanged during execution.
- `focused-final.log`: all affected schema/codec/resource/Service/package/session/
  shadow/autosave/gesture and legacy view tests after IDAT hardening,
  **176 PASS / 0 FAIL / 0 SKIP**, 223.9 MiB peak. This includes the independent
  valid 256/refused 257 PNG inputs, each below 4 KiB, and dense 512/100-point lasso.
- `native-r5/report.json`: **33 named checks PASS** in built Electron. Actual UI
  mouse gestures exercise Brush/Eraser/Lasso/Polygon, explicit Subtract, two
  independent masks, cancellation on owner change and Escape, overlay scene
  pixels, Clear with exact Undo, whole PNG Undo/Redo, zoom200%/Pan coordinates,
  independent bbox movement, strict refusal without state/file effects,
  Save/raw ZIP/reopen, corrupted package Import plus valid neighbor, and actual
  dirty shadow → owned process death → Home Recover → explicit Save/reopen.
  Literal world samples and a separate PNG-standard decoder cross-check Chromium
  alpha bytes; the harness does not import the production mask codec/rasterizer.
  Two native window sizes 1440×900/900×620 have measured geometry and viewed PNGs.
- `native-r6/report.json`: final **33 named checks PASS** after the Lasso label and
  history readiness polish. The harness waits an enabled real Undo/Redo control,
  observes the changed Main documentRevision, then renderer-ready Save plus two
  native frames. Every source hash is unchanged at completion; bundle/source
  hashes identify the built code. Two final screenshots were opened and inspected.
- `typecheck-final.log`, `lint-final.log`, `build-final-label.log`: full required
  typecheck, non-mutating lint and fresh desktop build PASS. Limits were4 GiB for
  typecheck, 6 GiB for lint and 2 GiB for build, zero swap/deadlines; observed peaks
  1.6 GiB/3.4 GiB/~1 GiB. Native actor and actual application scopes each have
  2 GiB/zero-swap limits and deadlines; native process identities/start times and
  physical exits are recorded before restart/disposal. No ML child was launched.
- `mutations/report.json`: **five semantic RED / five neighboring GREEN** targeted
  real tests, isolated sibling modules only; original source bytes unchanged and
  all copies removed. `restored-focused.log`: **176 PASS / 0 FAIL / 0 SKIP** on
  restored/current production modules, 223.1 MiB peak. Prototype source was not
  changed; no prototype visual test run is claimed.

## Excluded attempts and fixes

`focused-r1.log` had125 PASS/2 FAIL: old foundation assertions incorrectly compared
transient DTO `maskImageUrl` with persisted `.igs` layer data. Their final comparison
omits the transient capability along with existing DTO status; actual stored mask
identity/bytes/history checks remain intact. Early typecheck errors in DTO fixtures
and Node's `inflateSync(info:true)` declarations were fixed before green checks.

Native-r1/r2/r4 stopped on the retiring New Project dialog before mask qualification.
The built UI had created the Project, but the closing transition remained at its
leave-from class without the next native animation frames. The final harness
observes the actual new tab and two requestAnimationFrame callbacks before waiting
for dismissal, as the earlier foundation harness does; it does not mutate component
state or fabricate replies. Existing anti-backgrounding flags are retained. These
attempts are excluded, not semantic mutation results. Native-r3 reached real Brush
pixels and cross-decoder assertions but then exposed an incorrect test predicate:
legacy Raster DTO `kind` is optional, while saved Raster documents have explicit
`kind`. The final observer counts the validated Raster union rather than forcing a
new DTO shape. Each failed actor has independent physical-exit evidence.

Source review also found missing `igs-mask:` CSP allowances. The renderer now
explicitly allows signed mask image/fetch resources, preserving the rest of its
policy. The native scenario proves actual protocol display and fetch. PNG review
found chunk-object amplification; a separate 256-IDAT guard and tiny boundary case
close it before accumulation. Owned capture-loss and nonzero viewport readiness
were hardened before the native run. Physical pen/pressure behavior is not claimed.

An initial mutation wrapper syntax/import-specifier failure was excluded, with its
log retained. The corrected isolated sibling-module campaign keeps original files
byte-exact; failures count as semantic RED only at the selected behavioral test,
never loader/timeout/OOM failure. Final causal pairs/restoration appear below.

## Review and remaining limits

Read-only source review followed owner/revision fences through async reads and the
actual coordinator commit, canonical PNG/package/shadow validation, capability
ownership and retained assets. It was a collaborating-agent source review, not a
new blind product/release audit. No unresolved implementation blocker was found.
The UI-audit pass covers the new mask rail/settings/layer context and two native
sizes: readable unclipped controls, distinct selected states, quiet light tool
buttons, scrollable settings and stable layer details. The local operation label
clarifies which tools use the selector; final after screenshots are checked below.

Qualification uses small masks and native mouse input. The 4M/4096/32MiB/256-chunk/
8192-point/32M-work ceilings are engineering safeguards, not throughput or drawing
quality benchmarks. No pen-pressure/tiled masks, cross-computer recovery, model
inference, accepted Patch variants, compositing quality, Invoke pixel parity or
release-readiness claim follows. Transform Mask and Fit Patch BBox to Mask remain
required next; generation/inpaint, variants/staleness, Regional Guidance and Patch
preset handoffs remain later. PP-007/008 public statuses stay **Пока не обещать**.

## Causal sensitivity pairs

| Mutation in real production module copy                                              | Selected observable RED                                                              | Neighboring GREEN                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Service routes a valid B request to A and adjusts owner identity coherently          | B's actual mask revision remains 0 instead of 1; real Service/package scenario fails | The corresponding valid A scenario saves/reopens successfully          |
| Destination-out coverage becomes additive                                            | Literal erased alpha 53 becomes 128                                                  | Continuous additive brush capsule retains exact literal samples        |
| Decoder stops rejecting non-white RGB                                                | Valid-CRC wrong-RGB PNG no longer throws                                             | All five independently authored PNG filter fixtures decode exact alpha |
| Shared asset collector omits masks; actual Session/package graph uses that collector | Painted Save refuses `PROJECT_INVALID_EDIT: An asset is not in the Project`          | Real empty Project Undo/Save/portable reopen passes                    |
| Decoder's IDAT-count guard is removed                                                | Valid 257-chunk PNG is no longer refused                                             | Independent small PNG filter fixtures still decode                     |

These are behavior failures at real boundaries, not a test-local fake entity,
text-regex check, snapshot-only signal or infrastructure error. The selected
mutation tests and their controls are name-filtered intentionally; this is not
a full mutation-score campaign or new installed inference qualification.

## Artifact handoff

Six owned native fixture payloads (native-r1 through native-r6) were removed after
terminal reports, physical PID/start/cgroup exit checks and a fresh `/proc`
command/maps/fd reference scan. Original sources remained byte-exact after
mutations. **70,045,696 allocated bytes (about 66.8 MiB)** were reclaimed. The
artifact root remains about 28 GiB; this run retains about 5.6 MiB of compact logs,
reports, masks, final/before screenshots and standalone saved/recovered `.igs`
packages. Exact corrupted import packages are retained separately for reproducing
the refusal. Historical/shared ML data was unused and untouched; its existing
cross-run dependency/evidence budget exception remains recorded. There are no
new runtime/model copies or active process/payload dependencies. `cleanup.json`
and `artifact-lifecycle.json` record disposed paths and retained pins; historical
native reports remain intact, and their former payload paths are explicitly gone.

To repeat the finite native scenario, create a fresh canonical evidence directory
inside the artifact root, inventory space and use the bounded actor/native limits:
`pnpm run app:smoke:smart-patch-mask --report-file /absolute/new/report.json`.
The report must not already exist. The command builds the real app and requires a
Linux graphical session; it never points at the ordinary user library. Preserve
reports, inspect PNGs and dispose only the verified idle owned fixture afterward.
