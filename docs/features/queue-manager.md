# Queue Manager

## Feature

Queue Manager lets the user enqueue multiple generation/upscale operations, monitor their status, cancel/retry failed work and inspect results/errors.

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

- Generate into project bbox;
- Generate Smart Patch variants;
- Upscale an immutable flattened composite input.

The Queue Manager is in MVP scope as an architectural baseline. Even if the first UI is compact, the worker protocol and main process should be designed around a persistent job queue rather than a single ad-hoc active job.

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
- completed results commit into `.igs` and appear in `GenerationResults`;
- app startup marks interrupted `running` jobs as `canceled`;
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
type QueueItemStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'

type ProjectJobOperation =
  | 'generate'
  | 'smart-patch-generate'
  | 'upscale'

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
  targetResultPolicy:
    | 'new-raster-layer'
    | 'smart-patch-variant'
    | 'upscale-result'

  generationSnapshotId: string
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

The queue item stores a frozen job payload. It must not read mutable project state at execution time except for validating that the target project/result can still be committed safely.

## Batch Model

One user action may enqueue several queue items.

Examples:

- output count `4` creates four `generate` queue items in one batch;
- dynamic prompting expansion creates one queue item per concrete prompt/seed combination;
- Smart Patch regeneration with output count `N` creates `N` smart patch queue items in one batch;
- Upscale currently creates one queue item.

Batch metadata:

```ts
type QueueBatch = {
  id: string
  origin: 'generate' | 'smart-patch' | 'upscale'
  destination: 'project' | 'smart-patch-layer' | 'upscale'
  projectId: string
  itemIds: string[]
  createdAt: string
}
```

The batch is mostly for grouping UI actions and status summaries. Individual queue items remain independently cancelable/retryable.

## Frozen Snapshot Rule

Queueing freezes the operation.

When the user presses `Generate`, ImageGen Studio must create:

- a worker job payload;
- a project-local generation snapshot;
- queue item metadata;
- result commit policy.

The queued job uses this frozen data. If the user edits prompt, model settings, layers, masks or bbox afterward, already queued jobs do not change.

For Smart Patch jobs, the snapshot should include the relevant mask, bbox, internal resolution and generation settings at enqueue time.

For Upscale jobs, the queue item should reference an immutable flattened composite input asset, not the live layer stack.

## Result Commit Rules

Completed results are not temporary candidates.

On completion:

- `generate` commits each output as a new Raster Layer in the target project;
- `smart-patch-generate` commits each output as a persistent Smart Patch raster variant;
- `upscale` commits as an Upscale result asset and may be added as a new Raster Layer or exported;
- every committed result is visible in `GenerationResults`;
- every committed result references its generation snapshot;
- committing a result creates an undoable project mutation.

If the target project is closed when a job completes:

- main process should update the `.igs` project package if safe and possible; or
- mark the queue item as `needs_project_open` / `commit_pending` if direct commit is unsafe.

MVP can require that jobs commit only to currently open projects if that reduces risk, but the queue item model should not make closed-project support impossible.

## Processor Model

MVP processor behavior:

- one active job at a time;
- queue is stored in SQLite;
- processor loop pulls the next `pending` item;
- item becomes `running`;
- main process sends worker job;
- worker emits progress;
- worker emits done or error;
- main process commits result or records failure;
- item becomes `completed`, `failed` or `canceled`;
- processor continues to next pending item.

Cancellation:

- pending job can be marked `canceled` immediately;
- running job sends cancel signal to worker;
- worker should check cancellation at safe boundaries, especially denoising steps;
- if worker cannot stop instantly, UI shows cancel requested / canceling state if needed.

Startup recovery:

- any `running` item from previous process lifetime becomes `canceled`;
- terminal queue history may be pruned by retention policy;
- pending items remain pending unless the user/app clears them.

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
   ├─ full settings snapshot summary
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
- `Show Result` when committed result exists.

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
  | { type: 'queue:item-status-changed'; itemId: string; status: QueueItemStatus; statusSequence: number }
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
- target layer/result policy;
- generation snapshot id;
- serialized worker job payload;
- result asset ids;
- error payload;
- timestamps.

The `.igs` file remains source of truth for project state and committed results. SQLite queue rows are runtime/history records and can be pruned.

## Relation To GenerationResults

Queue Manager shows jobs.

`GenerationResults` shows committed project results.

They are linked but not the same:

- while a job is pending/running, Queue Manager is the primary place to inspect status;
- when a job completes, its outputs are committed into `.igs`;
- `GenerationResults` displays those committed outputs for review, activation and cleanup;
- deleting a queue item does not delete committed project results;
- deleting a result from `GenerationResults` is a project mutation and participates in undo/redo.

## Acceptance Criteria

- User can enqueue several generation jobs from one action.
- User can continue editing the app while queued jobs run.
- Queue Manager shows pending/running/completed/failed/canceled jobs.
- User can cancel a pending/running job.
- User can retry failed/canceled jobs.
- Queue jobs execute from frozen snapshots, not mutable live UI state.
- Completed normal generation results become Raster Layers.
- Completed Smart Patch results become Smart Patch variants.
- Completed results appear in `GenerationResults`.
- App restart does not leave stale `running` jobs.
- Queue storage is SQLite-backed and prunable.
- Queue status changes are not part of undo/redo.
