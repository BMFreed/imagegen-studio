# Retry during image worker transitions

The [packaged NoobAI check](./phase-5-packaged-noobai-components-research.md#packaged-frozen-retry-with-all-three-components)
observed a canceled row with an enabled Retry control while Main returned
`GENERATION_RUNTIME_UNAVAILABLE`. The same saved input passed after the
controller and runtime settled. Runtime status can remain Ready during
normal closing or previously qualified startup. It serves an advisory
status surface. Metadata admission requires either settled idle ownership
or a running, qualified worker that can lend readiness.

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/queue/ui/RetryQueueItemButton.tsx`
calls the queue command through `httpRealtimeQueueBackend.ts` and
`serverApi.ts`. The router
`invokeai/app/api/routers/session_queue.py::retry_items_by_id`
delegates to `invokeai/app/services/session_queue/session_queue_default.py::retry_items_by_id`.
It validates the saved graph and enqueues a fresh execution.
`invokeai/app/services/session_processor/session_processor_default.py`
signals cancellation and releases cached VRAM at the session boundary.
InvokeAI uses long-lived workers, so Studio's per-attempt subprocess
transition needs a local readiness projection.

RuntimeManager shares its active admission test with the Project state
reader. A qualifying, closing or unready held worker and an owned
preparation worker surface a transition. Settled idle and a healthy
running worker allow the existing admission path. The projection is
app-wide because a running worker can belong to another Project.
Queue Manager uses the existing runtime and generation refresh events
to show when Retry is available. Main still validates the exact source
review and worker at click time.

The [Queue Manager contract](../features/queue-manager.md#production-busy-retry-checkpoint)
records the enabled and waiting states.

## Verification

On the original renderer, the actual Retry button stayed enabled with
the controlled transition state. The new browser case failed on
`toBeDisabled`. With the fix it verified the waiting reason, no
Retry call while blocked, and exactly one reviewed request during
healthy processing with no running job in the selected Project.
The idle case also passed. All 88 tests in the renderer wiring file passed.

The runtime tests held the actual controlled JSONL child through
qualification, healthy busy admission, physical close with a retained
lease, and preparation ownership. They check that close can still
report Ready while metadata admission refuses and that release restores
eligibility. Existing launch and exit counts also passed. The action
state test covers the exact optional boolean and rejects a string.
The focused Node run passed 220 tests, and typecheck, app build and
changed-file lint passed.

The full two-worker browser run passed all 363 listed tests, including
the 88 wiring cases, in 398.082 seconds with zero swap. The exact
coverage, RED and GREEN receipts and 42 desktop build hashes are in
`runs/retry-runtime-transition/20261120`. After process and reader
checks, temporary scratch and browser outputs accounted for 27,852,800
allocated bytes released. The updated packaged AppImage check remains
in the [MVP backlog](./mvp-acceptance-backlog.md).
