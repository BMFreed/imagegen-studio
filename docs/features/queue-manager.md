# Queue Manager

## Feature

Queue Manager lets the user enqueue generation operations, monitor their status, cancel/retry failed work and inspect outputs/errors. Upscale jobs may reuse the same queue later, but Upscale UI is outside the current Project pass.

The queue is a first-class app runtime feature. ImageGen Studio should follow InvokeAI's proven queue model, adapted to a single-user desktop application and `.igs` project files.

## Reference

Primary reference: InvokeAI session queue.

Useful Invoke source areas:

- `invokeai/app/services/session_queue/session_queue_common.py` — batch model, queue item statuses, queue item metadata and result models;
- `invokeai/app/services/session_queue/session_queue_sqlite.py` — SQLite-backed queue, enqueue, dequeue, priority/prepend, startup cleanup and pruning;
- `invokeai/app/services/session_processor/session_processor_default.py` — processor loop, pause/resume/cancel, progress/error completion lifecycle;
- `invokeai/app/api/routers/session_queue.py` — queue API surface;
- `invokeai/frontend/web/src/services/api/endpoints/queue.ts` — frontend queue endpoints and cache invalidation;
- `invokeai/frontend/web/src/features/queue` — queue UI, actions, list, details and status;
- `invokeai/frontend/web/src/features/queue/hooks/useEnqueueGenerate.ts` and `useEnqueueCanvas.ts` — freezing current generation state into a queued batch.

## ImageGen Studio Decision

Take the Invoke queue architecture, but adapt the payload and UI.

ImageGen Studio is not graph-centric in MVP. Queue items should not expose Invoke-style graph/session internals as the main user-facing model. They should represent project operations:

- Generate candidates for Project Canvas;
- Generate candidates for a Smart Patch Layer;
- later, Upscale an immutable flattened composite input.

The Queue Manager is in MVP scope as an architectural baseline. Even if the first UI is compact, the worker protocol and main process should be designed around a persistent job queue rather than a single ad-hoc active job.

## Current Anima boundary

The [durable Anima checkpoint](../engineering/phase-2c-anima-durable-jobs-research.md)
adds internal complete-batch admission, exact frozen Retry/dispatch and verified
local candidates/recovery for txt2img and opaque img2img. Failed/canceled Anima
rows use the same reviewed action controller and Project identity/close gates.
Their details show native method, seed, requested Steps, CFG and contextual strength;
SD sampler/scheduler/prediction fields are absent. Runtime progress uses the native
plan's actual total (including Heun/clipping/zero work), not requested Steps.
Public Project Generate and portable Anima Add are subsequent work.

## Scope

MVP:

- enqueue one or more jobs from one user action;
- persistent SQLite-backed queue in Electron main process;
- one active worker job at a time by default;
- statuses: `pending`, `running`, `completed`, `failed`, `canceled`;
- current job status visible from the main UI;
- Queue Manager surface available as app-level overlay/dialog/panel;
- list queue items;
- show current/next jobs;
- show progress, status, created/started/completed timestamps;
- cancel pending/running job;
- retry failed/canceled job;
- delete terminal job from queue history;
- clear/prune terminal queue history;
- preserve enough job payload to reproduce what was enqueued;
- completed canvas outputs are durably handed to the Project staging recovery
  store as temporary candidates;
- app startup marks previous-lifetime `pending` and `running` jobs as `canceled`;
- queue events are delivered to renderer as typed app events.

Post-MVP:

- priority/prepend controls if needed;
- batch-level cancel/retry UI;
- pause/resume processor UI;
- queue filters and search;
- named job presets;
- multiple workers / parallelism if the model/runtime architecture supports it safely;
- queue history retention settings.

Rejected:

- multi-user/admin queue permissions;
- exposing raw graph/session internals as the primary queue UI;
- remote server queue semantics;
- queue as a top-level permanent tab equal to `Home` or `Project`;
- making queue status part of undo/redo.

## Queue Item Model

Suggested baseline:

```ts
type QueueItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled'

type ProjectJobOperation = 'generate' | 'smart-patch-generate' | 'upscale' // reserved follow-up

type ProjectQueueItem = {
  id: string
  batchId: string
  status: QueueItemStatus
  statusSequence: number
  operation: ProjectJobOperation

  projectId: string
  projectPath: string
  projectDisplayName: string

  targetLayerId?: string
  targetLayerName?: string
  stagingTarget:
    | { kind: 'project-canvas'; sessionId: string }
    | { kind: 'smart-patch'; layerId: string; sessionId: string }
    | { kind: 'upscale'; sessionId: string }

  jobPayload: WorkerJob

  progress?: {
    value: number
    step?: number
    totalSteps?: number
    message?: string
    previewAssetId?: string
  }

  resultAssetIds: string[]
  error?: {
    code: string
    message: string
    details?: unknown
  }

  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
}
```

The queue item stores a frozen job payload. It must not read mutable renderer/project state at execution time. Worker completion creates a temporary candidate for `stagingTarget`; it does not commit a project layer. A completed candidate's separate recovery manifest retains the frozen context needed for later acceptance, so pruning a queue item cannot make that candidate unusable.

## Batch Model

One user action may enqueue several queue items.

Examples:

- output count `4` creates four `generate` queue items in one batch;
- dynamic prompting expansion creates one queue item per concrete prompt/seed combination;
- Smart Patch regeneration with output count `N` creates `N` smart patch queue items in one batch;
- future Upscale may create one queue item.

Batch metadata:

```ts
type QueueBatch = {
  id: string
  origin: 'generate' | 'smart-patch' | 'upscale'
  destination: 'project-staging' | 'smart-patch-staging' | 'upscale-staging'
  projectId: string
  itemIds: string[]
  createdAt: string
}
```

The batch is mostly for grouping UI actions and status summaries. Individual queue items remain independently cancelable/retryable.

## Frozen Job Rule

Queueing freezes the operation.

When the user presses `Generate`, ImageGen Studio must create:

- a worker job payload;
- queue item metadata;
- a staging destination;
- immutable refs/hashes for the target-area composite, mask and generation settings used by the job.

The queued job uses this frozen data. If the user edits prompt, model settings, layers, masks or bbox afterward, already queued jobs do not change.

For Smart Patch jobs, the frozen payload includes the relevant source composite, mask, bbox, internal resolution and layer-owned generation draft at enqueue time.

For Upscale jobs, the queue item should reference an immutable flattened composite input asset, not the live layer stack.

## Candidate Handoff Rules

Completed canvas outputs are temporary candidates.

On completion:

- main process validates and atomically publishes the output asset and candidate
  recovery manifest with frozen job/result context before changing the item to
  `completed` or exposing a preview;
- `generate` exposes the durable candidate in the target Project `GenerationResults` staging session;
- `smart-patch-generate` exposes it as a candidate for the target Smart Patch Layer;
- queue completion alone does not write a Raster Layer, Smart Patch variant, generation provenance or result-history row;
- `Add N as Layers` / `Add N as Variants` is a separate Project command that commits selected candidates to the open document/recovery shadow; only explicit Save updates the main `.igs`;
- each accepted candidate receives immutable generation provenance and an
  immediate Project history projection entry; the durable derived global index
  syncs from saved `.igs` on explicit Save;
- one multi-accept command creates one grouped undoable project mutation.

Acceptance may happen before every sibling job finishes. In that case the UI explicitly warns that the staging session will end, requests cancellation for unfinished jobs targeting that session and discards every unselected candidate. Only completed selected candidates are committed.

On confirmed graceful Project close, cancel only that Project's pending/running
items and discard its staging session, including completed candidates. Closing
requires a warning before that loss; Save alone does not discard staging.
Completion arriving after close/cancel is ignored for staging and its partial
output is cleaned, not attached to a closed `.igs`. If the application crashes,
valid completed candidates committed before the crash remain recoverable even
though previous-lifetime pending/running jobs are canceled at startup.

## Processor Model

MVP processor behavior:

- one active job at a time;
- queue is stored in SQLite;
- processor loop pulls the next `pending` item;
- item becomes `running`;
- main process sends worker job;
- worker emits progress;
- worker emits done or error;
- main process durably stores/validates a candidate asset and recovery manifest
  or records failure;
- item becomes `completed`, `failed` or `canceled`;
- processor continues to next pending item.

Cancellation:

- pending job can be marked `canceled` immediately;
- running job sends cancel signal to worker;
- worker should check cancellation at safe boundaries, especially denoising steps;
- if worker cannot stop instantly, UI shows cancel requested / canceling state if needed.

Startup recovery:

- every `pending` or `running` item from the previous process lifetime becomes
  `canceled` before processing resumes; there is no automatic job resume;
- completed candidate recovery is rebuilt from validated app-managed staging
  manifests/assets, not from queue rows alone; partial/invalid outputs are
  diagnosed and excluded;
- terminal queue history may be pruned by retention policy;
- queue-history pruning must not remove valid completed candidate recovery.

## Historical boundary: Phase 2B private processor checkpoint

Main now stores one frozen Illustrious `txt2img` input and a SQLite `pending`
item. The queue repository verifies that input before claiming the one
`running` database slot; a corrupt input becomes `failed` without blocking the
next pending item. Failure and cancellation use a status sequence so a late
worker result cannot silently overwrite a newer decision. A running cancel is
recorded as a request while the item still holds that slot; only an explicit
acknowledgement after observed worker exit may release it. On restart, former
`pending`/`running` items become `canceled`.

A separate app-owned staging repository validates a provisional sRGB PNG,
publishes an asset and manifest before a SQLite completion transaction, and
reconciles that crash window on startup. The completed candidate and actual
seed remain outside `.igs` and independent of queue-row retention. A private
processor now gates dispatch on successful queue and staging restart recovery,
rechecks exact model/target inputs, and publishes a correlated worker completion
through that repository. Its cancellation path retains the only running slot
and scratch lease until the worker exit is observed; an unconfirmed exit keeps
the owner available for an explicit retry. Missing or invalid output without
a publication receipt becomes `failed` after confirmed worker exit, while an
uncertain receipt is left for restart reconciliation.

The private queue repository also provides explicit retry of a failed/canceled
item from its verified frozen input. A retry creates a new pending item and
staging session; a status-sequence compare-and-swap prevents the same stale
action from queuing twice. Terminal-row deletion and bulk pruning remove queue
history and its owned input files, while completed staging candidates and the
actual-seed cursor remain independent. Rows with an unresolved `reserved`
candidate receipt are retained for startup reconciliation. Queue files left
between a committed row deletion and filesystem cleanup are reclaimed at the
next startup. These operations do not silently discard staging candidates.

The internal qualified batch entry point now groups an ordered list of concrete
Illustrious jobs from one frozen snapshot with one fresh batch/session identity.
Required staging preflight checks recovery capacity and identity reuse before
publication. Independent per-job input directories are synced before one SQLite
transaction exposes all rows. Supplied order is preserved within the batch;
independent batches can interleave. Exact matching rows reconcile a lost commit
acknowledgement; an unknown outcome retains inputs and blocks Project admission,
dispatch and fence release until successful startup recovery. See
[qualified batch evidence](../engineering/phase-2b-batch-grouping-research.md).

The subsequent [prepared-batch planner](../engineering/phase-2b-batch-planning-research.md)
turns one frozen preparation/resolved base seed and explicit options into that
qualified group. It validates all syntax, enumerates only a bounded prefix,
preserves prompt-pair/iteration ordering and uint32 seed behavior, and refuses
count/transport overflow before publication. Each concrete request fits the
wire envelope; selected seed behavior remains frozen main metadata and enters
accepted provenance. Legacy records need no synthesized behavior.
The initial prepared-job cap is 32 from persistent-storage measurements;
the existing 64-candidate recovery ceiling and byte preflight remain mandatory.

This is still an internal boundary tested with a substitute inference transport.
There is no renderer Generate/Queue Manager action or qualified full release GPU
pipeline. [Persisted dynamic options and preview](../engineering/phase-2b-dynamic-preview-research.md)
now use the ordinary Project draft and one-iteration pure planner with cap32;
opening preview creates no queue rows and does not choose actual seeds.
Generate, progress and user-facing retry/pruning remain unconnected. Candidate acceptance has a separate production Raster path,
including [confirmed early Add](./project/generate-mode/generation-results.md#production-confirmed-early-raster-acceptance-checkpoint)
while sibling jobs run. Smart Patch acceptance remains open.

## Queue Manager UI

Queue Manager is an app-level surface, not a permanent Project sidebar.

Recommended entry points:

- top app status bar queue indicator;
- app menu action;
- command palette action;
- optional compact queue button near Generate/Upscale actions.

Minimum Queue Manager layout:

```text
Queue Manager
├─ summary/status bar
│  ├─ running count
│  ├─ pending count
│  ├─ failed count
│  └─ current worker status
├─ queue list
│  ├─ status
│  ├─ project
│  ├─ operation
│  ├─ target layer/result
│  ├─ prompt/model summary
│  ├─ progress
│  ├─ timestamps
│  └─ actions
└─ selected item details
   ├─ frozen job settings summary
   ├─ result assets
   ├─ error details
   └─ retry/cancel/delete actions
```

Queue rows should show user-meaningful data:

- project thumbnail/name;
- operation type;
- target layer name where applicable;
- model name;
- seed;
- prompt excerpt;
- status badge;
- progress;
- result thumbnail when available.

Do not center the UI around internal job IDs. IDs can be available in details/debug copy actions.

## Actions

MVP actions:

- `Cancel` pending/running item;
- `Retry` failed/canceled item;
- `Delete` terminal item from queue history;
- `Clear Completed`;
- `Clear Failed/Canceled`;
- `Clear All Terminal`;
- `Open Project`;
- `Open Staging Session` when the target Project session is still available.

Optional MVP actions if cheap:

- `Cancel All Pending`;
- `Cancel All Except Current`;
- `Copy Error Details`.

Post-MVP actions:

- `Move to Front`;
- `Move to Back`;
- `Pause Queue`;
- `Resume Queue`;
- `Retry Batch`;
- `Cancel Batch`.

## Progress / Events

Renderer should not poll worker stdout directly.

Main process normalizes worker messages and publishes typed renderer events:

```ts
type QueueEvent =
  | { type: 'queue:item-created'; item: ProjectQueueItem }
  | {
      type: 'queue:item-status-changed'
      itemId: string
      status: QueueItemStatus
      statusSequence: number
    }
  | { type: 'queue:item-progress'; itemId: string; progress: ProjectQueueItem['progress'] }
  | { type: 'queue:item-completed'; itemId: string; resultAssetIds: string[] }
  | { type: 'queue:item-failed'; itemId: string; error: ProjectQueueItem['error'] }
```

Use a monotonically increasing `statusSequence` or revision number to avoid stale progress/status events overriding newer terminal states.

## Storage

Queue source of truth is SQLite.

Suggested tables:

- `queue_items`;
- `queue_batches`;
- optional `queue_item_events` for debug/history if needed later.

Queue items should store:

- status;
- operation;
- project identity/path;
- staging target/session;
- serialized worker job payload;
- temporary output asset ids;
- error payload;
- timestamps.

The saved `.igs` remains source of truth for saved accepted project state.
SQLite queue rows are prunable operational history; unaccepted candidate
manifests/assets are a separate recovery store retained until Add, explicit
discard/confirmed graceful close or validated cleanup. Queue deletion never
implies candidate deletion. Candidate GC/quota follows
[Data Storage](../specs/03-data-storage.md#temporary-generation-staging).

## Relation To GenerationResults

Queue Manager shows jobs across projects.

`GenerationResults` shows the current Project's temporary staging candidates.

They are linked but not the same:

- while a job is pending/running, both the app-level queue and its target staging session may show contextual progress;
- when a job completes, `GenerationResults` displays a durable but still
  unaccepted candidate;
- focusing, selecting or discarding candidates is not a project mutation;
- accepting candidates is the explicit boundary that creates persistent layers/variants, provenance, history rows and an undo step;
- deleting a queue row never deletes an already accepted result or valid
  unaccepted candidate recovery.

## Production Generate checkpoint

[Generate actions](../engineering/phase-2b-generate-actions-research.md) now admit
frozen Illustrious txt2img batches from Project and automatically drain SQLite
serially with a fresh qualified lease per concrete job. The compact Project queue
shows all of its current-document pending/running rows and supports current-job
Cancel with an exact reviewed ID. Global engine busy status disables another
Generate while existing jobs run; editing, Save and early Add remain available.
Queue/status/count do not mutate the document. A real completion refreshes staging
without accepting it; graceful app close waits admission/drain before pending
cancellation and database close.

At this Generate checkpoint the UI was Project-local; the subsequent Queue
Manager checkpoint below adds global terminal history and user actions. Progress
and admission while GPU is busy remain separate work. Earlier repository-only retry/cleanup evidence does
not prove those user actions exist. Runtime qualification is required; the release
installer and full model/conditioning paths remain unfinished.

## Production Queue Manager checkpoint

[Queue Manager actions](../engineering/phase-2b-queue-manager-research.md) expose
an app-level dialog from Home or Project with all five SQLite statuses, global
counts, 50-row newest pages, frozen prompt/model/sampling details, safe errors
and real timestamps. Indexed Project names are navigation labels, not frozen
provenance. Missing/corrupt frozen details do not hide terminal cleanup.

Pending Cancel uses the reviewed status sequence and refuses a concurrent claim;
running Cancel waits confirmed worker exit, with Retry cancel available when that
exit remains unconfirmed. At this historical checkpoint, Retry required the original Project/document to be
open and the engine idle. It requalified the exact checkpoint and worker, copied
bounded verified frozen target bytes, runs staging preflight before publication,
and creates a separate fresh attempt/session without discarding older results.
Project close uses the same admission gate. Lost commit acknowledgement resolves
only from an exact committed row; unknown outcomes retain input and block dispatch.

Delete and the three confirmed Clear actions remove terminal operational history
and private input copies; they preserve published candidate PNGs, receipt,
actual-seed cursor, accepted layers, dirty/Undo and `.igs`. Clear sweeps the chosen
statuses at execution time, including newly terminal rows, and skips reserved
publication receipts. Its UI states this and reports the removed count.
History and terminal cleanup remain available when runtime installation is absent.

At this historical Queue Manager action checkpoint, preview thumbnails and
output navigation were still open. Navigation for unavailable sessions,
busy-engine admission, full conditioning/Anima and the release installer remain
open. The native action checks use a controlled qualified peer; they do not prove
CUDA model loading or a packaged release.

[Bounded candidate thumbnails](../engineering/phase-2b-result-thumbnails-research.md)
now serve the Project Results tray from optional verified worker-made cache.
They do not yet add a preview column or session navigation to Queue Manager.

## Production result preview/navigation checkpoint

[Exact candidate navigation](../engineering/phase-2b-queue-result-preview-research.md)
now adds bounded result thumbnails to completed Queue Manager rows/details and
`View result` for an available candidate. Queue metadata carries its exact
`stagingSessionId` from SQLite; it still does not read PNG/checkpoint files.
The renderer joins the job to verified open-Project Results by Project, job,
session and source-document mismatch. Signed resources keep their existing
current-candidate/open-Project guards. No preview is inferred from completion
alone, and accepted/discarded outputs are not replaced with history/layer images.

Missing/corrupt cache shows a placeholder while `View result` remains possible
for a valid full PNG. Closed Projects show `Open Project` for every status; this
uses the ordinary explicit open/recovery flow. User Refresh rereads queue pages
and open Results, including failed cache/read retries, without a lifecycle loop.

Navigation freshly checks the candidate and displayed document before activating
the Project. Canvas consumes one exact focus revision, shows its full PNG, fits
its frozen bbox and expands the strip. Same-active-Project checkboxes stay
independent of focus, including repeated viewing of the same target. From Home
or another tab, established Project mounting/default selection remains unchanged.
Results still shows all sessions, and reviewed cross-session Add retains its
scope. Old-document recovery candidates remain previewable with their existing
Add restriction and explanatory copy.

Unavailable/replaced/closed/superseded targets refuse navigation with feedback;
no queue/candidate, document/bbox, seed, provenance, Undo, dirty or `.igs` mutation
follows from viewing. Native three-session, cached/placeholder/Refresh, minimum
window and ordinary queue/recovery checks are recorded in the research note.
At this checkpoint, session filtering and continuation after Open/recovery were
still separate. The subsequent
[Result sessions checkpoint](../engineering/phase-2b-result-sessions-research.md)
preserves the completed item's exact metadata across ordinary `Open Project` and
explicit Recover. Discard Recovery instead removes document shadow and every
temporary generation of that Project before opening saved state, and cancels
the navigation intent. It freshly verifies the resulting recovered document
and candidate before focusing its session. Recovery Cancel, context/close changes,
failure and superseding requests revoke the one-use intent. Missing output gives
feedback without choosing a neighbor. Noncompleted or unpublished items still use
ordinary Open only. Presentation filtering leaves global Add/cleanup and selection
scope unchanged. Accepted history remains separate work.

## Production busy Retry checkpoint

[Frozen Retry during inference](../engineering/phase-2b-busy-retry-research.md)
permits Retry while another job is processing or pending. The original
Project/document, failed/canceled source revision, frozen verified PNG, current
exact checkpoint/prediction type and staging capacity still qualify before
atomic source CAS/new-row publication. Current draft edits do not change Retry.

Admission reads a copied qualified ready message from the live worker without
sending it commands, reserving a second worker or altering its progress/exit
owner. If idle, it uses the existing fresh qualified lease. Qualifying,
unconfirmed exit, closed child, shutdown, recovery blocks and concurrent admission
refuse safely. The queued retry receives its own freshly qualified worker at
dispatch, after the previous worker's confirmed exit. Successful publication
wakes the serial drain even when it just observed an empty queue.

Retry preserves existing candidate sessions, actual seed, accepted Project,
dirty/Undo and `.igs`. The UI keeps Retry available during processing and shows
an actionable refusal if admission cannot qualify. Subsequent
[busy Generate](../engineering/phase-2b-busy-generate-research.md) adds separate
CPU target preparation while preserving the same serial inference dispatch.
Native evidence uses controlled inference, not production CUDA/release readiness.

## Acceptance Criteria

- User can enqueue several generation jobs from one action.
- User can continue editing the app while queued jobs run.
- Queue Manager shows pending/running/completed/failed/canceled jobs.
- User can cancel a pending/running job.
- User can retry failed/canceled jobs.
- Queue jobs execute from frozen payloads, not mutable live UI state.
- Completed canvas outputs become temporary `GenerationResults` candidates.
- Only explicitly accepted normal candidates become Raster Layers.
- Only explicitly accepted Smart Patch candidates become variants.
- Queue Manager is not result history and queue completion is not undoable.
- App restart cancels previous-lifetime `pending` and `running` jobs while
  preserving valid completed candidates for local recovery.
- Confirmed graceful Project close cancels that Project's unfinished jobs and
  discards staging without affecting other projects.
- Queue storage is SQLite-backed and prunable.
- Queue status changes are not part of undo/redo.

## Production denoising progress checkpoint

[Actual progress boundary](../engineering/phase-2b-generation-progress-research.md)
connects the pinned pipeline's step-end callback to the qualified worker0.3.0,
strict request-scoped JSONL transport and a separate typed renderer notification.
Legacy worker0.2.0 remains usable with a Running status and no invented step count.
Project footer/queue and global Queue Manager rows/details show the same transient
`Denoising step X of Y`; the denominator is actual scheduler evaluations, which
can exceed requested sampling Steps for DPM++ SDE. Completion still requires the
existing validated PNG publication.

Current transport event is exactly
`{type:'generation-progress', protocolVersion:'1', requestId, step, totalSteps}`.
Main attaches its own jobId, projectKey, documentId and claimed statusSequence.
A separate app-lifetime revision fences getter/event races; it does not advance
durable statusSequence. UI overlays require all those identities, a running row
and no cancellation. Main invalidates before waiting for worker exit and before
result publication. Progress updates neither perform DB/manifest writes nor trigger
the lifecycle notification that rereads staging and queue pages.

The general `QueueEvent` example above describes product intent, not an additional
implemented event bus. Durable statuses continue through the existing invalidation;
`projects:generation-progress` carries only the validated transient snapshot.
Progress is discarded on restart, while job/candidate recovery follows its durable
contract. Preview images, ETA, other generation operations and release GPU/runtime
qualification remain separate work.
