# Phase 2B: Project Results recovery view

Checkout before this change: `d2c8c83` (29.09.2026). This is a **high-risk**
read boundary because temporary result pixels and frozen job context live in
app-managed recovery storage, outside the portable `.igs`. The expected behavior
comes from [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[Generation Results](../features/project/generate-mode/generation-results.md)
and [document lifecycle](../features/project/document-lifecycle.md).

## Scope and data path

Electron already recovers one queue/staging pair at startup. The staging
repository verifies candidate manifests, completed receipts, queue state when
the row still exists, and sRGB PNG bytes. Project close has a separate fence
and durable staging discard. The missing link is a Project view of a verified
candidate after recovery.

This checkpoint connects `Project → typed IPC → recovered staging → bounded
public candidate view` and a private image protocol. The renderer receives a
candidate ID, frozen bbox, seed, completion order and an opaque image URL. It
does not receive an asset path or frozen job JSON. A request for pixels must
recheck the currently open tab and the verified candidate before serving data;
closing/discarding a Project revokes a fresh request. Focused preview is drawn
at the candidate's **frozen** bbox in a separate canvas layer; it never adds a
Raster Layer or marks `.igs` dirty. Focus is preview-only; acceptance selection
is deferred until Add is implemented.

The present inference worker does not support every visible Project input, and
the release runtime installer is unfinished. This checkpoint does not enable
Generate or Add. It must not silently omit LoRA, embeddings or other inputs or
present a read-only preview as an accepted result. Save leaves the staging
candidate intact. A confirmed Project close still discards it; Cancel does not.

## Failure analysis and checks

| Trigger | Required result |
| --- | --- |
| Recovery storage unavailable | Project remains usable; Results reports the unavailable state without claiming there are zero candidates. |
| Invalid manifest, receipt or PNG | Candidate is not exposed as previewable. |
| Candidate file replaced or symlinked between list and image fetch | Image request fails rather than serving changed bytes. |
| URL reused after Project close or staging tombstone | A new image request is denied. |
| Project Save while a candidate is staged | `.igs` remains free of the unaccepted image; result remains locally recoverable. |
| Crash/restart | Only verified completed candidates return; unfinished jobs do not become results. |

Verification must include real SQLite/filesystem repository tests and an
Electron renderer→IPC→image-protocol scenario. The Electron fixture may supply
the inference pixels, but queue insertion, publication, restart recovery,
Project Save and close must use their real owners. Test assertions must check
both the visible preview and absence of an accepted `.igs` layer. A semantic
mutation of candidate validation or close revocation should make a focused
test fail before claiming coverage.

## Review and evidence (29.09.2026)

This is a self-review of the dirty working tree based on `d2c8c83`, not a
review of a published commit. The actual renderer and Electron main are in the
system test. Its fixture supplies only deterministic PNG pixels at the inference
seam; real Project Save/loading, queue and staging repositories, crash/restart,
typed IPC, image protocol and close path remain active.

| Boundary | Evidence and neighboring control |
| --- | --- |
| Recovered image, visible preview | `app:smoke:results` creates a valid candidate, restarts Electron, reads its typed DTO and signed PNG through the renderer, decodes the image and samples blue pixels from the actual Konva canvas. Invalid/tampered URLs and closed tabs return no image in the resource test. |
| Frozen geometry versus current bbox | The smoke moves the active bbox with the keyboard after recovery. The result's blue-pixel bounds remain at the frozen position, while the Project bbox changes and Save persists the new bbox. |
| Explicit acceptance boundary | The same Save is reloaded from `.igs`: no Raster Layer appears. The local candidate remains listable after Save; Cancel preserves it, confirmed close removes it and a subsequent image request returns 404. |
| Path reuse and damaged resources | A ProjectService test replaces `.igs` at the same path and observes a changed `documentId`; the UI marks an older candidate as from a different document. Repository tests reject replaced/symlinked/corrupt PNG bytes, and the Results API reports unavailable recovery separately from an empty list. |

`pnpm run app:test`: 407 passed, 0 failed, 0 skipped. `pnpm run
typecheck`, `pnpm run lint`, `git diff --check` and the complete `pnpm run
app:smoke` passed on the working tree. A 1380×900 Electron screenshot was inspected:
the result image appears on canvas, the tray fits inside the canvas and leaves
12 px at the bottom. A semantic mutation in an isolated copy removed the
open-tab check from image reads: the focused resource suite went from 2/2 green
to 1/2 red because a closed Project still received PNG bytes. The mutation was
deleted from that copy; this working tree retained the guard.

The first image smoke failed before application behavior could be assessed:
the new scheme lacked Electron's `supportFetchAPI` privilege and a CSP source.
Those transport settings and CORS headers are now explicit. A second test
failure came from reading `.igs` before asynchronous Save finished; the smoke
now waits for the actual package contents, not a transient UI label. The test
also waits for Konva redraw after Zoom before comparing frozen pixel bounds.

If recovery storage is unavailable, the Project remains usable and shows an
explicit warning with Retry; the candidate stays in local recovery storage for
a later attempt. There is no production Generate button or acceptance path in
this checkpoint. Full ML inference, resource installation, immutable accepted
provenance, history and storage cleanup remain unverified by this test.
