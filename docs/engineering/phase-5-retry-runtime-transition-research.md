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
allocated bytes released.

## Current stock AppImage

The packaged follow-up used production build `4f08d1cd` and AppImage SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
Independent readback matched all 42 packaged dist files against the build
manifest. Three fresh public Model Manager runs installed the exact DigitalArt
LoRA, IllustriousPhoto embedding and Euge_'s VAE and reopened their catalogs
without credentials. The trained fixture copies the 15 exact component
catalog rows and borrows the verified checkpoint and component files.

The first repeat (`trained-noobai-eps-stack-retry-r4`) published no queue row
within the fixture's 90-second initial Generate deadline. The closed database
has the authored Project and zero queue rows, receipts and accepted results.
The AppImage closed normally and independent readback matched all 112 original
slot entries by identity and content. The launcher receipt was interrupted.
The systemd journal records the qualification child exiting with status 1.
The next attempt also records any Project action error shown by the renderer.

In `trained-noobai-eps-stack-retry-r5`, an observer attached before Cancel
recorded four UI states on the same canceled row. Retry initially waited
for the queue and generation refresh. At 0.725 seconds after observation
began, the disabled button showed the worker transition reason. The refresh
reason returned at 10.999 seconds and Retry became available at 17.870 seconds.
The fixture uses the public controls and exact installed worker throughout.
The transition samples are retained in
`native/canceled-retry-runtime-transition.json`.

The same lifetime then edited the draft to seed 23 and cleared the
three components. Once Project state was idle, Retry created a fresh job
and candidate with the original seed 0 and all three frozen bindings.
The canceled and retried job payloads and target bytes match exactly.
The candidate matches the 65,536 RGBA pixels and the encoded PNG from
the earlier combined Generate. The retried worker was identified by
PID, start time and cgroup, with 55 CUDA samples and a peak of 7,536 MiB.
Explicit Add and Save persisted the accepted Raster and its resource
references. The edited draft remained separate after reopening.

Both Electron lifetimes exited normally with 20 tracked process identities
confirmed gone. The original installed slot returned with all 112 entries.
The wrapper exited 0 in 258.159 seconds with zero swap. The scoped
queue, processor, action, renderer Retry and resource-limit suites passed
302 tests with zero failures and zero skips. The existing controlled
browser evidence covers Retry during healthy inference in a different
Project. The native case covers this installed engine on one Linux host.
Shipping-package compatibility and the joint release matrix remain in
the [MVP backlog](./mvp-acceptance-backlog.md).

The retained native records are in
`runs/packaged-installed-engine/20261118/trained-noobai-eps-stack-retry-r5`.
Independent readback matched the copied catalog rows in both closed stores,
the two queue rows, the single completed Retry receipt and the accepted
Raster in the byte-identical saved Project. After all readers and processes
exited, temporary profiles, republished bodies and build intermediates
accounted for 896,827,392 allocated bytes released. The exact AppImage
and its proof remain in `runs/packaged-noobai-preview/20261120`.
