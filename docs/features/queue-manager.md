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
- completed canvas outputs are handed to the Project staging session as temporary candidates;
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
type QueueItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

type ProjectJobOperation = 'generate' | 'smart-patch-generate' | 'upscale'; // reserved follow-up

type ProjectQueueItem = {
  id: string;
  batchId: string;
  status: QueueItemStatus;
  statusSequence: number;
  operation: ProjectJobOperation;

  projectId: string;
  projectPath: string;
  projectDisplayName: string;

  targetLayerId?: string;
  targetLayerName?: string;
  stagingTarget:
    | { kind: 'project-canvas'; sessionId: string }
    | { kind: 'smart-patch'; layerId: string; sessionId: string }
    | { kind: 'upscale'; sessionId: string };

  jobPayload: WorkerJob;

  progress?: {
    value: number;
    step?: number;
    totalSteps?: number;
    message?: string;
    previewAssetId?: string;
  };

  resultAssetIds: string[];
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};
```

The queue item stores a frozen job payload. It must not read mutable renderer/project state at execution time. Worker completion creates a temporary candidate for `stagingTarget`; it does not commit a project layer.

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
  id: string;
  origin: 'generate' | 'smart-patch' | 'upscale';
  destination: 'project-staging' | 'smart-patch-staging' | 'upscale-staging';
  projectId: string;
  itemIds: string[];
  createdAt: string;
};
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

- `generate` exposes each output in the target Project `GenerationResults` staging session;
- `smart-patch-generate` exposes each output as a candidate for the target Smart Patch Layer;
- queue completion alone does not write a Raster Layer, Smart Patch variant, generation provenance or result-history row;
- `Add N as Layers` / `Add N as Variants` is a separate Project command that commits selected candidates;
- each accepted candidate receives immutable generation provenance derived from the frozen job plus actual result metadata;
- one multi-accept command creates one grouped undoable project mutation.

Acceptance may happen before every sibling job finishes. In that case the UI explicitly warns that the staging session will end, requests cancellation for unfinished jobs targeting that session and discards every unselected candidate. Only completed selected candidates are committed.

If the target project is closed when a job completes:

- do not mutate the closed `.igs` directly;
- retain or discard the temporary output according to staging-session cleanup/recovery policy;
- surface the completed job in Queue Manager without presenting it as accepted project history.

The current Project scope may require an open target project for canvas staging. Closed-project staging recovery can be designed separately.

## Processor Model

MVP processor behavior:

- one active job at a time;
- queue is stored in SQLite;
- processor loop pulls the next `pending` item;
- item becomes `running`;
- main process sends worker job;
- worker emits progress;
- worker emits done or error;
- main process stores a temporary candidate output or records failure;
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
      type: 'queue:item-status-changed';
      itemId: string;
      status: QueueItemStatus;
      statusSequence: number;
    }
  | { type: 'queue:item-progress'; itemId: string; progress: ProjectQueueItem['progress'] }
  | { type: 'queue:item-completed'; itemId: string; resultAssetIds: string[] }
  | { type: 'queue:item-failed'; itemId: string; error: ProjectQueueItem['error'] };
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

The `.igs` file remains source of truth for accepted project state. SQLite queue rows and temporary candidate assets are operational data and can be pruned independently from accepted project results.

## Relation To GenerationResults

Queue Manager shows jobs across projects.

`GenerationResults` shows the current Project's temporary staging candidates.

They are linked but not the same:

- while a job is pending/running, both the app-level queue and its target staging session may show contextual progress;
- when a job completes, `GenerationResults` displays a temporary candidate;
- focusing, selecting or discarding candidates is not a project mutation;
- accepting candidates is the explicit boundary that creates persistent layers/variants, provenance, history rows and an undo step;
- deleting a queue row never deletes an already accepted project result.

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
- App restart does not leave stale `running` jobs.
- Queue storage is SQLite-backed and prunable.
- Queue status changes are not part of undo/redo.
