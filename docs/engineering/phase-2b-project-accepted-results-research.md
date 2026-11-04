# Project-local accepted-result history

## Expected result and scope

Base: clean `master` at `c526cfb`. The next Phase 2B checkpoint implements the
open-Project history projection required by PP-005/008 and
[provenance ownership](../features/project/generate-mode/generation-provenance.md#history-boundary),
[Results acceptance](../features/project/generate-mode/generation-results.md)
and [data storage](../specs/03-data-storage.md). Each accepted generated Raster
Layer contributes one entry immediately after Add and after Save/reopen or
document-shadow Recover. Selecting an entry selects its owning layer.

This is a read-only view of current accepted layers. It is distinct from
Project Undo/Redo and the independently prunable Queue Manager. The global
SQLite index of saved `.igs` results is separate roadmap work; this checkpoint
does not implement a cross-project browser or reinterpret an in-memory list as
that durable index. Smart Patch variants remain a later phase.

## Confirmed path and missing boundary

- `project-schema.ts` already stores strict optional Raster
  `generationProvenance`, including acceptance timestamp, actual seed and copied
  exact checkpoint identity. The Raster Layer ID is the accepted-result identity;
  candidate/queue IDs describe origin rather than history-row identity.
- Raster acceptance already attaches validated provenance/assets to the document
  and recovery shadow before staging cleanup. Grouped Undo/Redo changes current
  document layers; Save and Recover preserve the stored record.
- `ProjectService.toTab` currently maps layers to display DTOs without a result
  projection. `ProjectTab` and the preload runtime validator have no such field.
- `ProjectView` already owns transient layer selection. Its LayerStack shares
  the approved row/action components; a secondary accepted-results entry point
  can use that selection without adding a document command.
- No accepted-history table/repository exists. Queue and seed storage must not
  become substitutes for accepted provenance.

## Risk, owners and implementation choice

Conservative high-risk verification because provenance crosses typed main/IPC/
renderer boundaries, although this slice does not modify `.igs`, SQLite or
acceptance persistence. Main projects its validated current document into
`ProjectTab.acceptedResults`. The DTO contains layer identity/name, acceptance
time, actual seed, copied checkpoint name/version, output dimensions and the
existing signed layer image URL. It never sends worker/model/staging paths or
Regional Guidance, and never changes the provenance record.

Use newest acceptance time first, with layer ID as a deterministic tie-breaker.
Layers without provenance are excluded. Hidden generated layers remain listed
and labeled as hidden; selecting one does not unhide it. Removed/undone layers
are absent because the projection follows current document ownership. Rename,
opacity, visibility and transform edits preserve immutable generation metadata;
display dimensions are original generated output dimensions, not current
transformed coverage. Seed `0` is a valid value.

Renderer uses an existing-style bounded read-only modal/list and a secondary
`Accepted results` action. Clicking an entry closes the list and selects only
the owning layer and reveals its row in the Layers scroll container. Keyboard activation follows native/Naive button behavior;
selection, focus, close and transient modal state never change bbox, camera,
visibility, dirty state, Undo, queue/staging or seed. The view resets on Project
identity changes and rejects stale/missing layer selection. Empty state explains
that results appear after explicit Add; completed staging is not listed.

## Finite states, limits and failures

Current schema supports Raster Layers only. Membership is exactly the optional
strict `generationProvenance` field on current layers, not queue status,
thumbnail existence, dirty state or filename. Imported layers with no provenance
are excluded; a valid generated result in an imported `.igs` remains included.
No Smart Patch approximation is introduced.

Reuse existing `.igs` ceilings (16 MiB project JSON, 10,000 archive entries),
accepted-output dimension/PNG checks and signed-resource lifetime/ownership
guards. No new capacity, cache, worker thumbnail or file lease is introduced.
Use the verified existing layer asset for previews with a placeholder on image
load failure; missing preview never invents or erases history. Modal scrolling
must reach the last entry at normal and compact native window sizes. Preserving
an open list across asynchronous updates must not retain removed layer actions.

## Verification plan

Before projection implementation, add a regression through actual Project
service/acceptance returning a tab and observe missing history. Before rebuilding
the native app, extend the retained Results acceptance script and observe the
new assertion fail against the verified previous bundle. Missing-module or
harness errors are not behavioral red evidence.

Tests use actual schema/provenance/Project service, `.igs`, shadow and the real
acceptance owner where relevant. Cover multi-Add cardinality and stable IDs,
actual seed `0`, immutable copied checkpoint/output fields, timestamp order/ties,
imported versus generated layers, hidden/renamed/transformed layers, pending and
discarded staging, Undo/Redo, Save/reopen, dirty Recover and Queue prune. Native
renderer/preload/main/storage coverage opens the real list and selects an owning
layer, checking selection and document/storage invariants. Source pixels and
inference remain deterministic controlled fixtures, not CUDA/release evidence.

Execute isolated semantic mutations that include imported layers, omit accepted
results or use planned/live seed instead of actual recorded seed. Run focused
and full app tests, typecheck, lint/build and sequential native regressions.
Inspect actual normal/compact/empty/long-list screenshots with `ui-audit`.
Preserve source/bundle/script identity and report actual executed counts.
Update PP-005/008 matrix/body and supporting contracts together without promoting
public readiness; explicitly retain the global derived index/navigation gap.

## Evidence

Implementation follows the planned owners: a pure main projection is attached
by the existing `ProjectService.toTab`; shared scalar and actual preload guards
validate the required array, unique owning layer identity, current name and
signed image. No document/storage schema, migration, acceptance write or worker
operation changed. `ProjectView` owns modal context and transient selection;
the existing LayerStack exposes only local row reveal, after modal focus
restoration. Original output size deliberately need not equal current PNG size.

Executed behavioral red evidence:

- Before the service projection was implemented, the actual `.igs` import/
  ProjectService regression ran **1 test, 1 failed, 0 skipped/cancelled**:
  the accepted entry was missing. This was not a missing-module failure.
- Before rebuilding, the extended native Results script verified the previous
  `c526cfb` bundle and reached actual two-result Add before failing the required
  accepted-history array assertion. Retained preceding controls still ran.

Focused tests executed **6/6**. They use the actual schema, ProjectService,
writer/loader, queue/staging/acceptance journal and recovery owners where those
boundaries are asserted. The saved/imported control has current PNG16×16,
original output8×8, actual seed `0` and live planned seed `913`. It checks immutable
copied values, imported exclusion, deterministic timestamp/tie ordering, renamed/
hidden/transformed layers, stable owning IDs, resource revisions, Add/Undo/Redo,
shadow Recover, Save/reopen and Queue prune. Shared scalar validation also runs
against the real value returned by the service.

Semantic mutations ran in an isolated source mirror with real owners and
unchanged/restored live source hashes. All valid runs executed 6 tests with
zero skipped/cancelled:

| Mutation                         | Passed | Failed | Restored |
| -------------------------------- | ------ | ------ | -------- |
| Omit accepted results            | 2      | 4      | 6/6      |
| Include imported raster          | 4      | 2      | 6/6      |
| Use live planned seed as history | 3      | 3      | 6/6      |

The complete `pnpm run app:test` executed **770/770**, zero failed/cancelled/
skipped. `pnpm run typecheck`, `pnpm run lint` and `pnpm run app:build` exited 0
on final production source. Build retains the existing large-chunk advisory.
No prototype source changed; prototype UI tests were not a substitute for the
native renderer checks.

Final native Results ran against that build, exited **0**, and recorded
**17 checks, 29 screenshots, 0 page errors**. This retains the full Results,
recovery/Discard, exact Queue continuation, session filtering, early Add,
grouped Undo/Redo, durable shadow and portable Save/reopen scenarios. New checks
exercise actual modal buttons and signed preview decoding, Enter/Space selection
and Layers row reveal, hidden visibility preservation, empty history after Undo,
Redo identity/seed restoration and Clear Undo preservation. Before/after real
API state, saved package hash, bbox, dirty/Undo, seed, queue/staging and Canvas
zoom agree for read-only navigation.

The same final build also passed sequential native Desktop and Generate/Queue
regressions, both exit **0**. Desktop covers Home, Model Manager IPC, Project
Save/reopen and single-instance behavior. Generate/Queue records **29 checks,
31 screenshots, 0 page errors**, retaining confirmed cancellation/replacement,
frozen retries, terminal pruning, independent Project progress and confirmed
worker exits. Controlled runtime/pixels remain a named inference substitution.

The long-list control is an actual saved/opened 32-result `.igs`, with unique
layer/candidate/job IDs, long copied names, alternating hidden layers and seed
`0`. Current verified PNG16×16 remains distinct from original output64×64. At
1380×900 and 900×620, the last row and Close footer are reachable; selection
reveals the owning row even at the bottom of Layers. Root and a separate UI
agent opened the actual normal/compact/empty/last-row/hidden-row screenshots
using `ui-audit`; no confirmed visual defect remained. This is production
Electron layout evidence with fixture pixels, not GPU inference evidence.

The built preload was also exercised via real IPC with five deliberately
malformed main response payloads: missing array, duplicate owning ID, foreign
layer ID, another layer's signed image and invalid actual seed all return
`IPC_INVALID_RESPONSE`. The valid original-output/current-asset mismatch still
passes. This final scenario substitutes only main response payloads to test
preload; Project/storage owners are not replaced or mutated.

Earlier new-bundle harness attempts are retained separately and are not red
feature evidence: missing writer imports, an unavailable preview with invalid
null rect, and an additional API Open issued before the UI Open completed.
The final fixture waits for the rendered tab, requires no storage warning and
retains exact before/after equality. Source review verified that ordinary UI
Open has a synchronous pending-action guard. Direct concurrent Open IPCs expose
a pre-existing handler hardening opportunity outside this slice; no normal UI
path to that race was found here.

An additional source-aware read-only reviewer checked projection/IPC/selection,
dimension ownership and supporting-document boundaries. This was not a blind
behavioral review and did not independently execute GUI/tests.

Evidence artifacts: `~/.codex/artifacts/imagegen-studio/project-accepted-results-2026-10-01/`
holds root logs, old-bundle baseline, final native report/screenshots and delivery
identity. `~/.codex/artifacts/imagegen-studio/accepted-results-2026-10-01/backend/`
holds the service red log, focused log, replayable isolated mutation runner and
hash/count report. Native script/helper/bundle hashes are checked before and
after the run; shared native-window isolation was unchanged.

Public PP-005/007/008 readiness remains unchanged. This finishes current-layer
Project history only; global saved-result SQLite indexing/cross-project browse,
full settings comparison/result-to-preset, pending-only recovery, Smart Patch,
complete inference pipeline and release/runtime delivery remain open.
