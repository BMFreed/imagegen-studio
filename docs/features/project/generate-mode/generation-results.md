# GenerationResults And Staging

Supporting contract for [PP-008: Генерация меняет проект только по явному решению](../../../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
The promise registry owns the concise commitment and public readiness. This
document owns selection, preview, acceptance and staging cleanup.
Related contracts: [frozen queue jobs](../../queue-manager.md#frozen-job-rule),
[Project Undo/Redo](../undo-redo.md), [document lifecycle](../document-lifecycle.md)
and [accepted-result provenance](./generation-provenance.md).

## Current Anima boundary

[Public Anima generation](../../../engineering/phase-2c-anima-public-generation-research.md)
uses the shared queue/staging/receipts and explicit Add owner. Generate freezes
the original click's native draft, pixels, bundle and seed; success still creates
only a temporary candidate. Add supports verified Anima txt2img/opaque img2img
and mixed selections with Illustrious. Every selected output, native provenance
and the prospective package must pass before journal, Project edits, sibling
cancellation or discard. A bad second candidate or package overflow preserves
the complete original selection. Grouped Undo/Redo, shadow Recover and explicit
Save/reopen keep the same native records. Public partial-alpha Generate/Retry,
regions and Smart Patch remain outside this implemented path.

## Current internal outpaint boundary (06.10.2026)

The [internal execution checkpoint](../../../engineering/phase-2c-outpaint-execution-research.md)
publishes verified RGBA contributions for both frozen outpaint kinds. Staging
keeps an independent durable source PNG before the candidate manifest, rederives
the original alpha and verifies the exact contribution policy after restart and
terminal queue pruning. Source or output changes hide the invalid candidate;
publication, recovery and acceptance retain the existing receipt/identity checks.
The actual completed uint32 seed may differ from the scheduled seed and remains
the candidate, Reuse-cursor and accepted-provenance value.

Explicit Add preflights the selected contributions and portable records before
journal, sibling cancellation or discard, then uses the shared grouped
Undo/Redo and shadow owner. Explicit Save/readback and portable reopening retain
the RGBA asset and immutable outpaint provenance; source recovery files and LaMa
weights stay local. These internal results do not activate public mixed-alpha
Generate/Retry or prove installed/release execution. Evidence and counts are
recorded in the research note.

## Feature

`GenerationResults` is the canvas-adjacent staging surface for pending, running and completed generation candidates.

A completed candidate is not project state yet. The user previews one candidate at a time, selects one or more candidates to keep and explicitly adds the selected set to the project.

This applies to:

- normal generation targeting the project-owned primary generation bbox on the unbounded Project Canvas;
- Smart Patch Layer generation;
- dynamic prompting and multi-output generation.

## Reference

Primary reference: InvokeAI Canvas `StagingArea`.

Useful Invoke source areas:

- `features/controlLayers/components/StagingArea/state.ts` — flattened queue outputs, focused candidate, progress and auto-switch;
- `features/controlLayers/components/StagingArea/context.tsx` — Accept/Discard lifecycle and conversion of a staged image into a Raster Layer;
- `features/controlLayers/components/StagingArea/StagingAreaToolbar.tsx` — canvas-adjacent actions;
- `features/controlLayers/components/StagingArea/StagingAreaItemsList.tsx` — thumbnail strip;
- `features/controlLayers/konva/CanvasStagingAreaModule.ts` — isolated preview layer over the canvas.

ImageGen Studio keeps this staging model but extends it with explicit multi-selection. Invoke's primary `Accept` commits one focused candidate; ImageGen Studio can add several selected candidates in one project mutation.

## ImageGen Studio Decision

The product model is:

```text
completed generation = temporary staging candidate
selected + Add to Project = accepted Raster Layer or Smart Patch variant in the open document
explicit Save = accepted state in the portable .igs
```

Generation completion durably records the completed candidate in app-managed
recovery storage, but must not mutate the main `.igs`, create an undo step or
add an entry to project/global result history. The candidate is recoverable
locally after an unexpected shutdown; it is not portable with `.igs` before
acceptance and explicit Save.

`GenerationResults` is the visible UI name. The domain/session model should use a less ambiguous name such as `GenerationStagingSession`.

## State Model

```ts
type GenerationCandidateStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled'

interface GenerationCandidate {
  assetId?: string
  id: string
  imageIndex: number
  queueItemId: string
  status: GenerationCandidateStatus
}

interface GenerationStagingSession {
  candidates: GenerationCandidate[]
  focusedCandidateId?: string
  selectedCandidateIds: string[]
  target: { kind: 'project-canvas' } | { kind: 'smart-patch'; layerId: string }
}
```

`project-canvas` remains the logical normal-generation target discriminator; it does **not** mean the whole infinite canvas is rasterized. Each candidate's frozen job/result context supplies the finite bbox used for preview and acceptance. Moving the current bbox while jobs run must not move their previews or accepted results.

The two selection concepts are intentionally separate:

- `focusedCandidateId` — the single candidate shown on canvas;
- `selectedCandidateIds` — the completed candidates that will be added to Project.

Changing the focused preview must not silently change the multi-selection mask.

## Candidate Lifecycle

When generation starts:

- Queue Manager receives frozen jobs;
- `GenerationResults` shows pending/running entries for the current staging session;
- progress images may be shown in the isolated canvas preview layer;
- project layers and Smart Patch variants are unchanged.

When a candidate completes:

- main process validates and atomically commits its raster asset, recovery
  manifest entry and frozen generation/result context before reporting it as a
  completed, previewable candidate;
- preview appears at the frozen job bbox coordinates;
- the first completed candidate becomes focused and selected by default;
- later auto-switch behavior may change focus, but never changes `selectedCandidateIds`;
- the candidate remains outside persistent project state until explicit acceptance.

Candidate assets and the context needed to create accepted-result provenance
live in app-managed staging recovery storage, independently of prunable Queue
Manager rows. They are not placed in the main `.igs` merely because the worker
completed or the user saved the Project. After crash/restart, valid completed
candidates return to staging without being accepted; pending/running jobs from
the previous lifetime are canceled and incomplete/invalid assets are excluded.
Focus and checkbox selection may be initialized again on recovery; neither is
Project document state.

If recovery opens a valid completed Smart Patch candidate but its target layer
is absent from the recovered document or saved `.igs`, keep the candidate
visible in staging as **orphaned** with an explanation. `Add as Variant` is
disabled; the app never retargets it or converts it automatically. The user may
explicitly `Add as Raster Layer` at the candidate's frozen Smart Patch bbox or
Discard it. Raster conversion is enabled only when the committed asset already
represents the candidate's visible contribution with transparency, or its
retained frozen mask/compositing snapshot can produce those same pixels at the
saved bbox without relying on a missing or current layer. Otherwise
show why conversion is unavailable and keep Discard available. Successful
conversion follows the normal Add handoff, provenance, history and Save rules;
it creates a new top-level layer without changing other layers.
For any valid recovered raster asset, including one whose compositing snapshot
cannot support Raster conversion, offer `Save Candidate Image` as an explicit
file export in that candidate's secondary actions. It preserves the generated
pixels without accepting them into the Project or claiming that the original
Smart Patch composition is reproducible; it does not add another permanent
button to the compact staging toolbar.

## Multi-Selection UX

The thumbnail strip supports:

- click a thumbnail to focus/preview it;
- checkbox a completed candidate to include/exclude it from acceptance;
- `Select all`;
- `Clear selection`;
- previous/next focus navigation;
- show/hide focused result on canvas;
- remove/discard one candidate;
- `Discard All`;
- context-specific primary action with selected count.

Primary labels:

```text
Add 1 as Layer
Add 3 as Layers
Add 1 as Variant
Add 3 as Variants
```

The primary action is disabled when no completed candidates are selected.

The accepted anchor candidate is resolved deterministically:

- use `focusedCandidateId` when the focused candidate is selected;
- otherwise use the first selected candidate in stable candidate order.

That anchor becomes the visible Raster Layer or active Smart Patch variant after acceptance. Focusing an unselected candidate for comparison therefore never changes the selection implicitly.

Acceptance does not need to wait for the full batch. If the user accepts completed candidates while sibling jobs are still pending or running, the confirmation/action copy must explain that the remaining jobs will be canceled and unselected candidates discarded. Confirming ends the staging session, requests cancellation for unfinished sibling jobs and commits only the completed selected candidates into the open Project document and its recovery shadow. These accepted document changes reach the main `.igs` only through explicit Save. A separate explicit `Rebuild Preview` on a clean Project can replace preview/manifest without changing candidates, accepted layers or provenance.

## Normal Generation Acceptance

For a `project-canvas` target, every selected candidate becomes an independent Raster Layer.

Rules:

- selected candidates are inserted as adjacent layers in deterministic candidate order;
- each new layer is placed at its candidate's frozen primary generation bbox coordinates, even beyond all existing raster content; acceptance does not expand Project Canvas or move the current bbox;
- the accepted anchor candidate becomes selected and visible;
- other accepted opaque alternatives at that location start hidden so they do not cover one another;
- all pre-existing project layers remain unchanged;
- an existing selected Raster Layer is never overwritten implicitly;
- unselected candidates are discarded when the staging session closes;
- accepting `N` candidates is one grouped undo step, while the resulting layers remain independently editable afterward.

## Smart Patch Acceptance

For a `smart-patch` target, every selected candidate becomes a raster variant inside that Smart Patch Layer, not a new top-level project layer.

Rules:

- the accepted anchor candidate becomes the active variant;
- other accepted candidates become inactive variants;
- the previously active variant remains stored but becomes inactive;
- only one variant is active/visible at a time;
- unselected candidates are discarded when the staging session closes;
- accepting `N` variants is one grouped undo step.

This preserves Smart Patch Layer as a self-contained generative entity.

A still-existing target can receive explicitly accepted candidates after its
inputs have changed since enqueue. Acceptance preserves the frozen output and
generation/source context; the newly active variant is `outdated` when those
inputs differ from the current target. It does not substitute current mask,
bbox, internal resolution, blur or draft into the candidate's provenance.
Only genuinely generation-relevant differences contribute to staleness;
padding alone is Fit policy, while a resulting bbox change is an input change.

This does not weaken the missing-target recovery rule: a candidate whose exact
target is absent remains orphaned, with Add as Variant disabled and only the
explicitly qualified Raster conversion/export/discard paths available. The
[input capture slice](../../../engineering/phase-4-smart-patch-generation-capture-research.md)
qualifies private Main/CPU source preparation (focused14/affected1852 PASS),
without candidate publication; this Smart Patch acceptance lifecycle is not yet
implemented or enabled by it.

## Auto-Switch

Supported focus modes may follow Invoke:

- `off`;
- `switch_on_start`;
- `switch_on_finish`.

Auto-switch changes only `focusedCandidateId`. It must never add or remove candidates from `selectedCandidateIds`.

`switch_on_finish` is the preferred initial default because it moves preview focus only when a real image is available.

## Undo, Queue And History Boundaries

Not undoable:

- enqueueing jobs;
- job status/progress;
- focusing or selecting staging candidates;
- discarding candidates;
- worker completion by itself.

Undoable:

- `Add N as Layers`;
- `Add N as Variants`.

Queue Manager owns job lifecycle and remains prunable operational history. It is not generation result history.

Only accepted layers/variants receive immutable generation provenance and
history entries. Add makes one entry per accepted result visible in the open
Project history projection; after a crash, document-shadow recovery rebuilds
that projection. Explicit Save persists those results in `.igs`. Synchronizing
the durable derived SQLite history index is planned separately and is not yet
implemented. Discarded candidates receive neither provenance nor history entries.

An accepted candidate's frozen context and raster asset must be handed off to
the Project working state/recovery shadow before its staging record is removed.
If the handoff fails, the valid candidate remains recoverable. Queue-history
pruning cannot remove that context. Discarding a candidate or confirming a
graceful Project close removes it from staging and schedules its recovery asset
for cleanup; neither action is undoable. Closing with staging or unfinished jobs
warns first, cancels only that Project's jobs and prevents late completions from
reappearing. A successful Save while Project stays open does not end staging.
If generation recovery storage cannot be inspected, a separately confirmed
degraded close preserves unknown local files for repair/recovery; it must not
report them as discarded.

Undo removes the accepted project mutation; it does not reconstruct the previous staging session.

## Placement

`GenerationResults` is a compact floating strip anchored above the bottom edge of the central canvas viewport:

- 64px candidate thumbnails above a compact toolbar;
- previous/count/next, explicit `Add N as Layers/Variants`, preview visibility, selection menu, discard and collapse actions in one row;
- Select all completed / Clear selection are secondary menu actions;
- selected candidate preview rendered through a dedicated non-project canvas layer;
- collapsed state hides thumbnails and keeps the acceptance toolbar available;
- at narrow canvas widths the toolbar wraps within the viewport;
- Fit reserves the strip's measured height so the image does not sit behind it;
- the tray is absent when no staging session exists.

It is not a permanent right sidebar and does not replace Queue Manager or the layer stack.

## Earlier production repository checkpoint

Main has a separate local recovery store for one completed Illustrious
`txt2img` candidate. Publication checks the frozen queue item and output PNG,
durably writes the asset and session manifest, then atomically marks the queue
item complete and advances the Project's actual-seed cursor in SQLite. Startup
reconciles a manifest published just before a crash; a user-canceled or corrupt
output is not exposed. A verified candidate remains listable after its queue
row is pruned. The Electron startup invokes this reconciliation after queue
recovery.

At that checkpoint, the production renderer did not list or accept these
candidates. The repository checkpoint alone did not fulfill the user-facing
PP-008 flow.

## Production recovery preview checkpoint

The Project lists verified local candidates through typed IPC and draws
the focused candidate at its frozen bbox over the canvas. Pixels use a private,
process-lifetime URL; neither an asset path nor the frozen job payload reaches
the renderer. A new image read verifies the candidate again and requires the
Project to remain open. The tray labels this as a temporary result.
It marks a candidate created for a different document previously at the same
path, without presenting it as selected for acceptance.

Save does not put the candidate in `.igs`. Canceling Project close leaves it
available; confirmed close discards its staging session and revokes new reads.
The [Phase 2B Results recovery view](../../../engineering/phase-2b-results-recovery-ui.md)
records the preview/close boundary.

## Production candidate image export checkpoint

Each verified candidate has `Save Candidate Image` in its secondary menu.
Main chooses the destination through a native Save dialog, rechecks the
candidate after the dialog, then writes its exact sRGB PNG without changing
the Project, `.igs`, provenance, history or staging. The action remains
available for a candidate from an earlier document at the same path: it
saves raw pixels and does not imply that the candidate can be accepted into
the current document. An existing destination is not overwritten; the user
must choose another name. See the
[export boundary](../../../engineering/phase-2b-candidate-image-export.md).

## Production Raster acceptance checkpoint

The desktop Results tray now keeps preview focus separate from checkbox
selection and offers `Add N as Layers` for completed candidates. Main accepts
only verified candidates from the open document, attaches the typed immutable
provenance, inserts adjacent Raster Layers at each frozen bbox, and chooses one
visible anchor. If unchecked results would be lost, Add first shows their
count and requires confirmation; a changed staging snapshot is rejected and
must be reviewed again. A single document edit creates one in-memory history step. The
recovery shadow must confirm the exact accepted revision before the captured
staging sessions are tombstoned; `.igs` changes only after explicit Save.
Candidates from another document at the same path remain previewable and
exportable but cannot be added. See the
[Raster acceptance evidence](../../../engineering/phase-2b-raster-acceptance-research.md).

At that earlier checkpoint, Add rejected unfinished jobs and crash recovery
could remove only sessions containing already accepted candidates. Unchecked
sessions were preserved because their membership in the interrupted Add was
only known in memory. The journal checkpoint below closes this cleanup gap;
the conservative rule still applies to older operations without a journal.

## Production acceptance journal checkpoint

Before Add mutates the document, main durably records its operation identity,
local Project key/path and `documentId`, expected accepted layer assets and
immutable provenance, and the exact captured staging session set. The intent
alone never authorizes deleting a candidate. Recovery first proves every
recorded accepted layer in a synced shadow or the exact saved `.igs`.

After proof, one SQLite transaction tombstones the captured selected and
unchecked sessions and removes the journal entry; image cleanup follows and
can resume after restart. Newer sessions and a different document at the same
path remain intact. If Add never happened or was fully undone, the intent is
abandoned and all candidate pixels remain. Partial or changed immutable
lineage preserves pixels and reports recovery required. Ordinary layer
name, visibility or placement edits preserve accepted lineage.
See [journal evidence](../../../engineering/phase-2b-acceptance-journal-research.md).

At the journal checkpoint, Add still rejected unfinished Project jobs. The
following checkpoint adds confirmed early acceptance for shared-session input.
Smart Patch variants, derived global history and storage quota policy remain open. Project-local Undo/Redo is connected, but
ordinary Generate and the complete release inference pipeline are still absent.

## Production confirmed early Raster acceptance checkpoint

The Results snapshot exposes unfinished sibling job IDs from the open document
and sessions represented by its eligible completed candidates. Add confirms
both the candidate set and the job set, including a jobs-only confirmation when
all completed candidates are selected. Cancel leaves jobs, pixels and document
unchanged; a changed count or identity requires another review.

Main fences admission, preflights selected pixels and projected document bounds,
cancels only confirmed siblings, and waits for worker exit before the existing
journal/shadow handoff. A candidate that completes during cancellation remains
recoverable and forces renewed confirmation before any adoption or discard.
An uncertain exit retains the fence and pixels until explicit retry/recovery;
success clears the acceptance fence without marking the open Project as closed.
Other sessions, Projects and historical documents at the same path are preserved.
Accepted assets still reach the main `.igs` only on explicit Save.

See [early Add evidence](../../../engineering/phase-2b-early-raster-acceptance.md).
Tests and native smoke inject shared-session queue preconditions, use actual
SQLite/processor/IPC/Project storage, and replace the external inference transport.
Production `enqueueOne` assigns a fresh session to each job. At this historical
early Add checkpoint, ordinary batch Generate still needed shared group/session
creation; that slice did not implement scheduling, renderer Generate, GPU
inference or runtime install.

## Production qualified batch grouping checkpoint

The [internal `enqueueBatch`](../../../engineering/phase-2b-batch-grouping-research.md)
now creates real shared membership for already qualified concrete Illustrious
jobs from one frozen snapshot. One fresh batch/session, required recovery-capacity
preflight and atomic SQLite publication follow synced per-job inputs. Metadata,
item order and target pixels are copied before asynchronous admission. Replaced
document identity cancels exactly the newly admitted group; unconfirmed cleanup
keeps its Project fence. Unknown commit outcomes retain inputs until successful
startup recovery.

Integration coverage creates the group through the production orchestrator,
completes one job through the real processor/staging boundary, observes its
unfinished siblings in Results, accepts it with exact sibling cancellation,
preserves an independent batch and saves portable assets/provenance in `.igs`.
The external inference transport is substituted. Completed pixels still need
explicit Add; accepted document changes still need explicit Save.

The existing 64-candidate, 128 KiB payload and 8 MiB manifest ceilings are checked
before admission, including JSON escaping and maximum completion metadata.
At this historical grouping checkpoint they did not qualify a public capacity
limit; planning was still caller-owned.

The subsequent [prepared-batch checkpoint](../../../engineering/phase-2b-batch-planning-research.md)
adds bounded concrete expansion and seed scheduling from one prepared base,
checks every varied request envelope and stores selected seed behavior in new
frozen contexts and immutable accepted provenance. Its integration test goes
from authored templates through the planner to actual grouped admission,
completion, early Add and portable Save; the live source templates stay in the
Project draft, while provenance contains concrete prompts. Legacy records keep
seed behavior unspecified. Persistent-storage capacity is measured separately
from GPU throughput. [Persisted dynamic options and preview](../../../engineering/phase-2b-dynamic-preview-research.md)
now expose one-iteration concrete pairs and cap32 errors without starting jobs
or creating candidates. At that historical checkpoint Renderer Generate was
still open; [production Generate](../../../engineering/phase-2b-generate-actions-research.md)
now connects frozen batch admission and serial dispatch. Full GPU/release runtime
and Smart Patch remain open.

## Production bounded result thumbnail checkpoint

[Worker-made candidate cache](../../../engineering/phase-2b-result-thumbnails-research.md)
creates a best-effort sRGB WEBP alongside the full PNG in the same inference child.
Exact worker0.4.0 requires both `denoising-progress` and `candidate-thumbnails`;
qualified older peers remain supported without thumbnails. Main verifies the
fixed sidecar path, actual dimensions (maximum side 256px, no upscale), maximum
256 KiB, pinned ICC and SHA before publishing a separate per-session cache.
Candidate manifest/receipt and required full PNG remain authoritative and unchanged.

Results cards use optional signed `thumbnailUrl` with source-PNG and cache hashes.
Every GET requires the still-open Project, current verified candidate and cache;
wrong identities, changed source PNG, discard and close revoke access. Missing,
invalid or failed cache shows a placeholder in the same selectable card. It does
not cause a full-PNG thumbnail fallback; focusing the card still shows the verified
full PNG on Canvas and export still uses that PNG. Refresh can retry a repaired
cache, but no automatic cache rebuild operation is implemented in this slice.

Queue pruning/restart preserve valid candidate cache; session discard/teardown
revokes access and includes cache in existing best-effort cleanup. A filesystem
failure can defer physical removal after the durable tombstone. Cache changes do
not change cursor, provenance, document, Undo, dirty,
Save or `.igs`. Results still aggregate sessions, and previous/next focus and
cross-session reviewed Add retain their existing scope. Queue Manager previews
and output/session navigation remain separate work.

The research checkpoint records full application/Python suites, native cached and
placeholder screenshots, recovery/export/Add checks and semantic mutations. Native
inference uses a controlled peer; CUDA/release readiness and browser/main-storage
performance are not proved by those screenshots or small fixture images.

The subsequent [Queue result navigation checkpoint](../../../engineering/phase-2b-queue-result-preview-research.md)
adds preview and `View result` for an exact available queue job/session. Its fresh
one-use request changes only Canvas focus/show/fit and expands the tray. The flat
multi-session list and reviewed Add scope remain unchanged; same-active-Project
checkboxes are preserved. Home/other-tab mounting keeps its existing default
selection. At that checkpoint, session filtering and accepted history navigation
were not included.

## Production result sessions and Open/recovery continuation

[Result sessions](../../../engineering/phase-2b-result-sessions-research.md)
adds `All results` / `Session N` to the existing compact toolbar when more than
one verified session exists. Session membership and stable order come from
recovered candidates, independently of prunable Queue rows. The filter changes
only the thumbnail strip and previous/next preview. It chooses a visible focus
when needed and falls back to All if the chosen session disappears. Loading alone
does not reset filter or checkbox selection. The filter is transient Canvas UI,
not saved Project state or a recovery preference.

Checkbox selection remains global. `Add N` includes checked results in other
sessions; the tray explicitly shows their count and explains that they are
included. Select all/Clear selection menus name their all-session scope. The
existing Add confirmation still includes every eligible unchecked candidate and
unfinished sibling job across the Project; main acceptance/journal/cleanup are
unchanged. Hiding a candidate never approves its discard or changes selection.

Queue focus reveals the exact target session and keeps selection independent.
For a closed completed Queue item, `Open Project` captures a one-use job/session/
source-document intent. Ordinary Open and explicit Recover remain
the user's decisions. After the chosen document opens, a fresh verified Results
read finds exactly that candidate and applies the same show/fit/expand request.
Discard Recovery deletes this Project's document shadow and all temporary
generations before opening saved state, and cancels result navigation.
Cancel/dismiss, failed open/read, manual navigation, close/reload, superseding
requests and disposal revoke continuation. Missing/ambiguous/replaced output
gives feedback; no neighboring result is substituted. Old-document candidates
remain preview/export-only under the existing Add restriction.

Filter/focus/continuation do not change the document, bbox, actual seed, dirty,
Undo, queue/staging, immutable provenance or `.igs`. Explicit Discard Recovery
uses durable staging tombstones before deleting shadow; Recover retains results.
The saved file and its accepted assets, queue history, seed and other Projects
are preserved. Unsaved document changes, including previously accepted layers
present only in recovery, are discarded. Validation, confirmed cancellation or
tombstone failure refuses before shadow deletion; deferred physical cleanup is
reported and retried on restart. Prototype still models one session;
production multi-session/recovery evidence is recorded separately. The subsequent
[staging-only recovery checkpoint](../../../engineering/phase-2b-staging-only-recovery-research.md)
requires an explicit Recover/Discard/Cancel decision before opening a closed ready
Project with verified completed candidates and no dirty shadow. Recover opens
saved state clean and restores Results for review; Queue continuation proceeds
only after Recover, using its existing fresh exact-candidate checks. Unavailable
storage with absent/clean document shadow produces a Home diagnostic and an
Open/Import warning while preserving ordinary saved-document operations and
unknown files; pending document-shadow decisions retain precedence. Pending-only sessions,
accepted history and full pipeline/release runtime remain open.

## Production Project-local accepted-result history

[Project-local accepted-result history](../../../engineering/phase-2b-project-accepted-results-research.md)
shows one entry for each current generated Raster Layer after Add, grouped
Undo/Redo, shadow Recover and portable Save/reopen. The Layers toolbar action
`Accepted results` opens the bounded list; selecting a result selects and reveals
the owning layer row, including hidden layers, without accepting anything else
or changing visibility/settings. Actual seed, copied exact checkpoint metadata
and original output size come from immutable provenance. Previews use the same
current signed layer resource as the stack; preview failure yields a placeholder.

Imported raster images without provenance and temporary candidates are excluded.
The list reflects current document ownership, independently of Queue rows and
the Undo stack. The saved global SQLite index and cross-project browser are connected separately
below. Smart Patch acceptance and full pipeline/release runtime remain open.

## App-level saved accepted-result history

The app chrome `Saved generations` action opens one separate modal from both Home
and Project. It lists saved generated Raster results across ready, non-trashed
indexed Projects, newest first, with per-result preview, layer and Project names,
copied model/version, actual seed and original generated size. Copies at different
local paths remain separate even when document and layer IDs are shared.

This global list reflects explicit Save. Accepting a result before Save updates
only the current Project list and recovery shadow. Imported/manual images without
provenance and temporary candidates are excluded. Refresh rescans saved Projects
and starts the first page. Newer/Older pages contain at most 50 results; there is
no retention cap and no search/filter in this first slice. Missing or oversized
preview displays `Preview unavailable` without removing the row or blocking Open.

Selecting a row verifies its exact saved source and uses ordinary Project Open,
focusing an existing tab or requesting Recover/Discard/Cancel when required.
After Open or Recover it selects and reveals the owning layer, including hidden
layers, without changing visibility, camera, bbox, settings, seed, dirty state or
Undo. Discard and Cancel cancel the pending selection. An already-open dirty tab
keeps its changes: if its accepted layer is absent or its pixels differ, a visible
notice explains that the saved result is unavailable in the current Project.
The app never overwrites unsaved work to satisfy history navigation. A stale saved
source is refused with a Refresh message; closing the modal or changing context
cancels a pending request.

The [production browser evidence](../../../engineering/phase-2b-accepted-history-browser-research.md)
separates real `.igs`/SQLite/Electron from the shared-component mock scenario
`?prototype=accepted-results`. Comparison, result-derived presets, Smart Patch
history and worker-produced per-result thumbnail optimization remain open.

## Installed Anima image cap32 acceptance evidence

[Anima image cap32/prefix](../../../engineering/phase-2c-anima-image-batch-cap-research.md) verifies32/6 temporary candidates before explicit Add. Two confirmed33 refusals retain32 candidates and the imported source without new queue/receipt/seed/Project effects. Explicit multi-Add and Save/reopen preserve76 accepted layers across four packages with source-plus-accepted stacks33/7 and immutable provenance/owning comparisons. Two OUT previews preserve111104 source pixels. Interrupted32/11/21 remains a separate recovery observation. Smart Patch/masks/regions, quality/fullMVP/release and PP-008 public readiness remain open.

## Vue Prototype Coverage

The `staging` scenario contains three completed candidates, one running job and two selected completed candidates. Focus and acceptance selection are separate. The floating strip supports focus, checkbox selection, Select all completed/Clear selection in a menu, previous/next, preview visibility, Discard All and context-specific multi-accept labels. Preview navigation scrolls the thumbnail strip to keep the focused candidate in view; it does not change acceptance selection.

Normal acceptance creates one independent Raster Layer per selected candidate. Smart Patch acceptance creates variants owned by the selected Smart Patch. The focused selected candidate, or otherwise the first selected candidate in stable order, becomes the accepted anchor. If unfinished sibling jobs exist, acceptance uses a confirmation before canceling them and discarding unselected candidates. One acceptance produces one Project history entry and undo does not recreate staging.

Repeated Generate requires an explicit keep/discard decision while staging exists.
Canceled mock jobs ignore delayed completion callbacks; sibling jobs can still finish.

Candidate imagery, progress and temporary assets are deterministic CSS/in-memory mocks. The prototype does not write recovery manifests/assets, `.igs` assets, global result-history rows or production provenance records.
Missing-target recovery, orphaned-candidate Raster conversion and `Save
Candidate Image` are also not modeled in the current prototype.

[project.spec.ts](../../../prototype-app/tests/project.spec.ts) contains the
interactive acceptance checks. PP-008 still requires production coverage of
worker completion, frozen source inputs, crash recovery, late events after
cancellation/close, asset handoff and cleanup. These boundaries must preserve explicit acceptance;
mock completion alone does not prove them. Undo is limited to Project session
history and never reconstructs discarded staging candidates.

## Acceptance Criteria

- Completed worker outputs remain temporary candidates until explicit acceptance.
- Valid completed candidates survive unexpected shutdown in app-managed
  recovery storage, including when Save succeeded before the crash; they are
  never silently added to the main `.igs`.
- User can focus one candidate and independently select one or more candidates.
- Normal acceptance creates one Raster Layer per selected candidate.
- Smart Patch acceptance creates one variant per selected candidate.
- Recovery keeps a valid candidate with a missing Smart Patch target visible
  as orphaned; only explicit, geometry-valid `Add as Raster Layer` or Discard
  can resolve its staging status, never implicit retargeting. `Save Candidate
Image` remains available for a valid asset even when conversion is blocked.
- The focused selected result, or otherwise the first selected result, becomes the visible/active accepted anchor; accepted alternatives remain hidden/inactive.
- Accepting before a batch finishes explicitly cancels unfinished sibling jobs and discards unselected candidates.
- Existing project content is never overwritten implicitly.
- One multi-accept action creates one grouped undo step.
- Candidate navigation, selection and discard do not create undo steps.
- Confirmed graceful Project close cancels its unfinished jobs and discards
  staging; startup cancels unfinished jobs from the previous lifetime but
  preserves valid completed candidates for recovery.
- Only accepted results receive generation provenance and global history entries.
- Queue Manager and `GenerationResults` remain distinct surfaces with distinct ownership.
