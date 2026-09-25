# InvokeAI Reference: Staging, Queue, And Unbounded Canvas

Checked against local InvokeAI `upstream/main` at
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` (2026-09-23). The checkout
was fast-forwarded from `685cb033eb3a2ff2cfa5f8ff9150c98d475cdc16`.
This is source evidence for ImageGen Studio's product contracts, not proof that
its production storage or worker exists.

| Boundary | Confirmed InvokeAI behavior | ImageGen Studio decision |
| --- | --- | --- |
| Completed outputs | Image assets are stored under Invoke's output storage, and queue results remain in SQLite. Staging restores candidates by the persisted canvas session identity and queue/image records. [staging persistence](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/store/canvasStagingAreaSlice.ts#L61-L82), [staging queue subscription](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/components/StagingArea/context.tsx#L107-L121) | Persist valid completed, unaccepted candidates in a local recovery store, separate from `.igs` and document shadow; never depend only on a prunable queue row. |
| Project export | `.invk` save collects canvas state and referenced images into a ZIP on explicit action; staging and queue records are absent. [project save](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/hooks/useCanvasProjectSave.ts#L40-L96) | Main `.igs` document content changes only through explicit Save. An explicit `Rebuild Preview` may replace preview/manifest of a clean Project without changing document revision. Add promotes a candidate into the open document and its recovery shadow. |
| Browser close and startup | Browser unload waits for client-state persistence but does not cancel every queued job. At startup, Invoke cancels interrupted `in_progress`/`waiting` chains; unrelated `pending` rows remain eligible unless `clear_queue_on_startup` is set. [client-state unload](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/app/store/enhancers/reduxRemember/driver.ts#L223-L233), [queue startup](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/app/services/session_queue/session_queue_sqlite.py#L133-L190) | Deliberately differ: confirmed Project close cancels its unfinished jobs and discards its staging; after crash, startup cancels old unfinished jobs but offers valid completed candidates for recovery. Tab switching does neither. |
| Accept and discard | Accept makes a Raster Layer at the generation bbox and resets that staging session; Discard/Discard All reset references and cancel jobs. [staging actions](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/components/StagingArea/context.tsx#L60-L98) | Multi-accept remains one undoable Project mutation. Asset handoff must be durable before cleanup; explicit retention, quota and garbage collection avoid orphaned files. |
| Canvas and export | Canvas state stores a movable generation bbox, not a fixed document rectangle. Copy Canvas uses visible raster extent, while Copy Bbox uses bbox; PSD export also derives a visible raster extent. [canvas state](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/store/types.ts#L1099-L1129), [copy regions](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/hooks/copyHooks.ts#L57-L78), [PSD export](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/hooks/useExportCanvasToPSD.ts#L18-L57) | Use unbounded Project Canvas and an independent default generation bbox. Default image export uses visible composited raster extent; explicit bbox export is separate. `.igs` Save needs no finite export rect. |

Invoke's queue request is a serialized graph/batch with model-specific branches
and frozen image references, not a single flat parameters object. The worker
protocol contract therefore specifies typed operation inputs, immutable asset
references and capability validation, while leaving exact graph compilation to
the chosen backend. [batch type](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/app/services/session_queue/session_queue_common.py#L54-L92), [canvas enqueue](https://github.com/invoke-ai/InvokeAI/blob/9e1540962bcca7f8fa668d7d8e02cf79d75fda3b/invokeai/frontend/web/src/features/controlLayers/hooks/useEnqueueCanvas.ts#L55-L127)

`Regional Guidance` remains an operational generation input when enabled. By
product decision it is absent from accepted-result provenance, settings
comparison and presets; a saved result cannot reconstruct its regional
conditioning. This is an explicit limitation of PP-005, independent of how
InvokeAI represents regional inputs.
