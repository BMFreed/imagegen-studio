# GenerationResults And Staging

Supporting contract for [PP-008: Генерация меняет проект только по явному решению](../../../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
The promise registry owns the concise commitment and public readiness. This
document owns selection, preview, acceptance and staging cleanup.
Related contracts: [frozen queue jobs](../../queue-manager.md#frozen-job-rule),
[Project Undo/Redo](../undo-redo.md), [document lifecycle](../document-lifecycle.md)
and [accepted-result provenance](./generation-provenance.md).

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
that projection. Explicit Save persists those results in `.igs` and updates the
durable derived SQLite history index. Discarded candidates receive neither.

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
They do not qualify a public capacity limit. Renderer Generate, expansion/seed
planning, full GPU/release runtime and Smart Patch remain open.

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
