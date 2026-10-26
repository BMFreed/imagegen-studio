# Explicit orphan Smart Patch Raster acceptance

## Scope and revision

Implemented in the working tree on `master@10115df581d9e07049478dee3866a280886794fd`
plus the preserved, uncommitted selected-freshness and frozen-Retry changes.
This is a **high-risk** PP-007/PP-008 slice: accepted provenance, Project history,
durable shadow, shared acceptance intent and staging disposal cross storage boundaries.
Neither promise is promoted by this work.

The [Results contract](../features/project/generate-mode/generation-results.md)
requires explicit **Add as Raster Layer** for a geometry-compatible orphaned
Smart Patch candidate. Conversion creates a new top-level Raster at the frozen
world bbox, without changing neighbors. It neither retargets a Patch nor saves
the Project. Export and Discard remain available when conversion is unavailable.

## Confirmed source boundaries before implementation

- `ProjectSmartPatchResultResource` exposes missing targets as `orphaned` and
  foreign documents separately. `ProjectSmartPatchResultsTray` currently has an
  unconditionally disabled Raster action; public result actions only accept
  variants, export and discard.
- `SmartPatchGenerationStagingRepository.readVerifiedCandidate` retains the
  frozen payload, world-result PNG and final contribution mask.
  `projectVerifiedSmartPatchVariant` validates the exact PNG identity, world
  dimensions, canonical sRGB profile and alpha against that retained mask. Its
  portable provenance preserves both model/internal resolution and world bbox;
  no current layer, Canvas pixels or inference worker is needed for this proof.
- A top-level Raster currently accepts only ordinary Raster provenance. Recasting
  Smart input as an ordinary generated candidate would lose its original mode,
  internal resolution and source context. The portable Raster boundary must
  explicitly admit unchanged Smart provenance and verify its actual output alpha.
- `ProjectGenerationAcceptanceRecovery` shares admission markers with Raster Add,
  Smart Add and Close. An accepted document must reach a synced shadow or a fully
  verified saved package before SQL session tombstones release staged recovery.
  A second independent, unclassified Add owner would break this recovery boundary.

## Design constraints and rejected alternatives

Use a dedicated public request carrying reviewed identities, revision and exact
target-local candidate/job sets. Only the original open document with the
original Patch absent qualifies. Hidden/locked existing Patches and foreign
documents do not become orphans. Main rechecks ownership after gate admission
and asynchronous reads; a restored target makes the reviewed action stale.

Keep the original Smart provenance discriminator and source snapshot in the new
Raster. The committed contribution PNG is already geometry-compatible; copy its
bytes, place it at the frozen bbox with identity scale/rotation, normal blend
and full opacity. Later normal Raster transforms do not rewrite its historical
source bbox. Do not rerun preparation, alpha processing or inference; do not
fabricate ordinary Raster generation settings or use today's mask.

`ProjectGenerationAcceptance.acceptSmartPatchOrphans()` adds a typed Smart source
adapter to the existing Raster journal/recovery owner. Its intent retains a
strict Smart source block; staged Smart candidates never masquerade as ordinary
generation candidates. The public identity-only `acceptSmartPatchRaster` request
passes through `withRasterAdd()`, with captured coordinator/epoch checks before
and after recovery admission. The secondary menu acts on its clicked candidate;
the existing review explains target-local cancellation and unselected disposal.

Portable Raster provenance admits the unchanged Smart discriminator. Package,
autosave and shadow verification enumerate both nested variants and top-level
Smart contributions, including actual alpha in cached proofs. Existing common
history projections retain the new Raster owner. History DTOs admit 1–2048 world
dimensions; migration `0019` changes only the saved index's two dimension
constraints while retaining its rows, foreign key and seek index. Compare/Preset
expose an explicit unsupported reason rather than inventing ordinary Size.

A standalone import followed by staging deletion is rejected: interrupted
autosave could lose the only recoverable candidate. Export/import is a useful
fallback but cannot stand in for provenance-preserving Add. The deleted parent's
opacity, blend mode and stack position are not frozen in the generation context;
the new layer follows normal Raster Add semantics, preserving its contribution
pixels rather than claiming to reconstruct that parent.

## Invariants, failures and verification plan

| Boundary / trigger                                                                 | Required observable outcome                                                                                                                               |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid orphan, either model family and all four recorded modes                      | Exact world PNG, alpha, seed, complete Smart provenance and frozen placement become one ordinary Raster per selected result.                              |
| Target exists, is hidden/locked, is restored during preflight, or document changes | Refusal preserves Project, candidate bytes and reviewed selection; no implicit retargeting.                                                               |
| Unselected target-local results or unfinished siblings                             | Explicit review before cancellation/disposal; unrelated Patch and ordinary candidates survive.                                                            |
| Corrupt PNG, missing frozen mask, crossed identity or unsupported geometry         | Refuse conversion before Add; preserve recoverable state, with export/discard according to independently verified asset availability.                     |
| Journal acknowledgement, apply, shadow flush or cleanup fails                      | Retain exact intent/candidate recovery and fence uncertain generation; reconcile only proven complete or absent adoption.                                 |
| Crash before apply versus after durable shadow                                     | First keeps temporary results; second recovers accepted pixels and completes only the recorded handoff.                                                   |
| Undo/Redo and explicit Save/reopen                                                 | One Add history entry, no reconstructed staging on Undo, exact pixels/provenance on Redo and through the real package loader. Add never implicitly Saves. |
| Compare/Preset on a Raster retaining Smart provenance                              | Explicit unsupported diagnostic; never invent ordinary Size or erase the saved Smart record.                                                              |

Existing format ceilings remain defensive limits, not measured product capacity:
64 accepted candidates per operation; Smart world output at most 2048 per axis
and 4,000,000 pixels; bounded PNG bytes from `IGS_GENERATION_PNG_MAX_BYTES`;
10,000 archive entries and 16 MiB Project JSON from `IGS_SAFETY_CEILINGS`.
Package/preview preflight must happen before destructive sibling cancellation.
No new capacity claim or timeout policy is introduced.

Planned checks use real SQLite/files, the public result-action entry point,
Project shadow/writer/loader, neighboring normal/Smart flows, an executed isolated
semantic mutation, and a freshly built native renderer menu/confirmation flow.
Prepared candidates are declared fixture setup, not inference qualification.
Actual screenshots must be opened; prototype mocks do not prove persistence.

## Executed evidence and review

- Portable/storage suite: **11 passed**, covering both families × four modes,
  exact 7×5 pixels, 1px history, real shadow/Save/loader/index/reopen, immutable
  source bbox under later Raster transforms and metadata-only alpha tampering.
- Migration/history suite: **6 passed**, including actual upgrade/reopen,
  byte-exact legacy rows, seek index, rollback, retained constraints and cascade.
- Public actions plus new request schemas: **42 passed** (39 public / 3 schema).
  Actual CPU preparation/output supplies candidates with controlled numerical
  inference; Raster Add runs with both runtime and its action worker unavailable.
- Isolated semantic mutation removes top-level Smart contributions from image
  validation: GREEN 2 passed; RED exactly one expected-rejection failure and one
  valid 1px neighbor passed; byte-exact restoration returns 2 passed. Actual
  workspace source stayed unchanged. Logs, patch and restoration proof are kept.
- Final typecheck and fresh app build pass after the cancellation corrections.
  Lint passes with automatic sorting/type-assertion corrections. Initial typing
  failures were Naive menu aria attribute typing and an ordinary-only test's
  explicit Size narrowing; the production contracts were preserved.
- Core fault suite's initial failures were fixture defects: dispatch-owned
  scratch naming, ordinary PNG geometry and an omitted ordinary sibling review.
  They are retained separately from semantic mutation; production guards remain.
- Independent static review R1 found one P2: target-wide reviewed unfinished jobs
  can include a fresh frozen-Retry session without a completed candidate, while
  cancellation sessions originally came only from completed candidates. This
  makes Raster Add repeatedly stale. The same real public Retry regression fails
  preserved R1 source with `ACCEPTANCE_SELECTION_STALE` and passes with only the
  corrected acceptance/journal source. Pending-only sessions retain strict frozen
  job/session/hash witnesses, with metadata preflight before cancellation.
- Corrected core fault suite: **15 passed**. The late-completion fixture claims
  its job before acceptance fences new dispatch, then publishes that running
  claim during cancellation; it does not bypass the generation fence.
- Full Vue prototype: **180 passed**, one worker, 356.9 seconds, zero swap,
  observed group peak about 2.42 GB. These are prototype checks, not persistence.
- Final DB/shared/renderer suite: **600 passed**. An old 15px rejection was updated to
  the adopted world-geometry contract; fractional/out-of-range dimensions still
  refuse. The new positive guard explicitly covers 1, 5, 7, 15 and 2048.
- Independent static review R2 closes the session omission but finds another P2:
  pruning a canceled pending-only Retry before cancellation finishes removes the
  row needed by the next orchestrator/acceptance read. The retained scope/fence
  can then block until restart. A real public-action/SQLite reproduction deletes
  B through `deleteTerminal()` immediately after actual cancellation commits and
  fails preserved R2 source with `QUEUE_ITEM_NOT_FOUND`. The identical public
  test passes with the corrected source. Exact frozen job witnesses permit a
  missing row only after independent session/receipt validation and scoped
  physical drain. Unknown exit retains the fence and can reconcile later.
  The corrected core suite passes **18/18**, including delete, prune, uncertain
  drain, altered/dropped job witnesses and independent receipt proof.
- Independent static review R3 found one P2 in the shared Raster owner: ordinary
  Add could register its cancellation while an uncertain Smart cancellation was
  retained, causing reconciliation to stop before reaching the Smart drain.
  Ordinary Add now refuses before registering that competing scope. A preserved
  source countercheck accepts either initial refusal code, acknowledges the actual
  SQL claim, then fails during reconciliation with `CANCELLATION_UNCERTAIN`.
  Replacing only the subject source returns GREEN through reconciliation, a fresh
  ordinary Add and Close. The regression preserves unrelated ordinary siblings.
- Independent static review R4 finds no new reachable material issue in that
  correction or adjacent cancellation/recovery boundaries. Review is source/report
  inspection; executed tests and native UI evidence are recorded separately.

- Final Main regression: **1950 passed / 0 failed / 2 explicit skips**, 295 seconds,
  zero swap, recorded physical exit and group peak about 1.01 GB. Both skips are
  existing actual OUT-capture checks requiring pinned LaMa weights; no weights
  were provisioned for this acceptance slice. The new R3 guard regression and
  all 19 core acceptance cases run in this suite. Combined with the disjoint
  DB/shared/renderer suite, **2550 tests pass**; focused reruns are not added again.

- Freshly built native **R7 passes 15 checks**, 17.4 seconds, no page errors,
  with literal prepared PNGs and no installed runtime/catalog throughout. The
  actual secondary menu/confirmation reaches production IPC, cancels both
  reviewed jobs (including a candidate-free Retry session), preserves unrelated
  results and creates exact 129×127 Raster pixels/provenance at the frozen bbox.
  Keep results, stale/duplicate refusal, one Undo/Redo, unsaved SIGKILL/shadow
  recovery, explicit Save, real loader/index and native reopen pass.
  Default 1440×900 and actual minimum 900×620 menus/dialogs are checked for full
  glyphs, clipping and reachable controls; the accepted Raster menu displays its
  disabled Compare/Preset reasons. Fifteen screenshots are retained and viewed:
  eight key states at full size, the remaining seven in a contact sheet.
  This is a local flow/layout check, not a full accessibility or Project audit.
- R7 verifies four compact checkpoints, **64 files / 7,292,628 bytes**, including
  exact staged contributions/masks, complete Smart and ordinary frozen inputs,
  consistent SQLite backups, actual dirty shadow assets and paired `.igs` bytes.
  The original raw R6 report stays unchanged; a supplementary manifest retains
  its two ordinary input files identified by the independent native-source review.
- Final renderer/geometry typecheck, build and 600-test suite pass. Main source
  is unchanged from its full 1950-pass run; prototype consumers are unchanged
  from the full 180-pass run. Final full repository lint passes; payload disposal
  is recorded below.

## Actual renderer findings during native qualification

The built Electron renderer is inspected at native 1440×900 and 900×620, with
literal 129×127 world contribution fixtures, an empty model catalog and no image
runtime. Menu/dialog screenshots are actually opened, alongside pointer, glyph,
clipping and reviewed-scope assertions; prototype tests are separate evidence.

- **UI-01 — Confirmed Add could not reach IPC.** Native R6 displays “An object
  could not be cloned” after the real confirmation click; its passive observer
  records no conversion IPC for that click. Candidates, queue and Project stay
  unchanged. `pendingSmartReview` is a deep Vue ref; the confirmed request was a
  proxy. `confirmSmartReview()` now synchronously detaches the exact raw review
  before dispatch, covering Raster/Variant acceptance, Discard and Generate
  confirmation without changing their reviewed sets. Independent focused R5
  review finds no reachable nested proxy, alias or changed ownership boundary.
  The exact R6 App source, built bundle, failure screenshot and raw report are
  retained; R7 completes the same confirmed Add through actual IPC and durable
  acceptance. The follow-up typecheck/build pass.
- **UI-02 — Minimum-window preview collapsed to about one pixel.** The opened R6
  900×620 menu screenshot shows 0.787% zoom and an effectively invisible candidate.
  The taller results tray leaves less space than two fixed 64px fit margins.
  Camera fitting now limits that margin to available viewport space, preserving
  its existing margin on larger surfaces. A focused short/narrow-area regression
  checks visible content and containment; native minimum-size qualification also
  checks the contribution's actual projected dimensions. R7 records 45.2% scale
  and about **58×57 displayed pixels**, replacing the one-pixel collapse.

Initial native R1–R3 stopped before launch: authored-mask tight bounds/full edit
core and an incomplete ordinary-neighbor readiness fixture. These are setup
failures, not product REDs. R4 required explicit Recover for retained temporary
results; R5 used an unsupported Naive option-role locator despite a visible menu
label. Their raw diagnostics remain distinct from R6's actual renderer failure.
The native fixture now declares a tight authored opaque core with the original
final alpha stripes unchanged, uses an established readiness collaborator only
for setup, and performs both recovery and target selection through real UI.

The native evidence audit also found missing ordinary-neighbor frozen input
bytes. Checkpoints now retain its exact input manifest and target PNG, bound to
the queue row, alongside Smart bundles, staged outputs, shadow assets and
consistent standalone SQLite backups.

## Artifact lifecycle

Evidence owner:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-orphan-raster/20261022-explicit/`.
Initial allocated root is 2,898,264,064 bytes; about 92.5 GB is free. Historical
compact evidence above the 1 GiB soft budget stays pinned under its earlier
reference audit. No new trained model/runtime is planned. Heavy checks run
serially with finite systemd deadlines, zero swap and recorded physical exit.
All eight owned payloads are disposed after independent PID/start, cgroup/timer,
open-file/environment reference and canonical-path checks. No active user or
hardlink was found; the isolated dependency symlinks were removed without following
them, preserving the repository Node/Python targets. Alpha restoration and 113
retained checkpoint/supplementary files were reverified before disposal.

Actual root allocation immediately before/after disposal is 3,008,606,208 →
2,936,000,512 bytes: **72,605,696 bytes (69.2 MiB) reclaimed**. This excludes later
compact source/build archive growth. The complete isolated source archive,
semantic mutation originals/patch/RED/GREEN, review overlays, actual R6 renderer
RED bundle, native R7 checkpoints/packages/screenshots and raw reports remain.
Final source/build manifests and root allocation are recorded in the evidence
lifecycle. No trained runtime, model weights, user data or global cache was
created or deleted. Historical pinned evidence remains under its existing budget
exception; this slice performs no historical sweep.
