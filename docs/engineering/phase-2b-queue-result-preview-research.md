# Phase 2B: Queue Manager result previews and navigation

Date: 2026-10-01. Base: `019a401`. Risk: medium presentation/navigation behavior,
with a full promise/evidence pass for async document identity. Existing high-risk
candidate publication, signed resources, acceptance and persistence are unchanged.
Supports PP-007/008; neither public status nor Phase 2B completion is raised.

## Research and scope

Confirmed: Queue Manager lists bounded SQLite metadata independently of model,
runtime and PNG availability. Its rows have no result/session projection, and its
Open Project action was exposed only in failed/canceled retry context. Project
Results already reads verified staging candidates for every open Project, with
opaque full-image and optional thumbnail URLs and guards before/after reads.

Confirmed: a receipt/manifest candidate identifies its original queue job and
session even after queue pruning. While the queue row exists, verification requires
the same Project, source document, session and frozen input. No filesystem scan is
needed inside the queue's metadata-only page. The existing candidate resource is
available only while its Project is open; missing cache cannot reject a valid PNG.

Confirmed: PP-008 permits old-document recovery candidates to be previewed/exported
at the same local Project path, while `sourceDocumentMismatch` blocks their Add.
Retry has a stricter original-document gate and must not supply preview policy.
Accepted/discarded candidates disappear from staging; Queue Manager must not seek
a replacement in accepted layers or history.

Confirmed: Results aggregates sessions, and reviewed Add can include multiple
sessions. Navigation must focus one exact candidate in that unchanged list rather
than filter a session and change acceptance scope. Canvas already has independent
preview focus, checkbox selection, frozen-bbox camera fitting and tray collapse.
App currently unmounts ProjectView on Home/another tab; this slice preserves that
behavior. Same-active-Project navigation preserves existing checkbox selection;
ordinary mounting from Home keeps its existing default selection rules.

## Implementation boundary and alternatives

Add required `stagingSessionId` to the queue wire DTO from the existing SQLite row.
Preload checks its UUID; no DB/schema migration or image field is added to queue
storage. Pass App's verified Results snapshots/loading/errors to Queue Manager.
The actual renderer helper joins only completed, non-reserved jobs to candidates
by local Project, exact queue job/session and consistency of source-document
mismatch. It does not infer an output from timestamps, status alone or list order.

Rows/details load only the existing bounded thumbnail URL; missing/failed cache
gets a placeholder. `View result` remains possible with a valid full PNG. Closed
Projects show a reason and the ordinary Open Project action for every status;
no closed-Project/global signed URLs are introduced. A missing completed candidate
is explained as unavailable, without implying it was permanently lost.

`View result` captures Project, displayed document, source document, job, session
and candidate IDs. App uses the actual async navigator to reread Results, then
rechecks current document, command revision and candidate identity before changing
tabs/focus. A newer background snapshot can also refuse the captured candidate.
Errors stay visible in Queue Manager; dialog close/replacement/superseded reads
cannot trigger late focus or a stale failure warning.

Canvas consumes a one-use revision through ProjectView, calls its existing
focus/show/fit path and acknowledges that exact revision. Explicit navigation also
expands the tray, including repeated viewing of the same candidate. It does not
change checkbox selection, Project bbox, layers, dirty/Undo, provenance, seed or
`.igs`. The original full PNG remains the Canvas source. Mismatched source
documents remain previewable with their existing Add restriction.

Rejected alternatives: filesystem enrichment of every queue page (changes metadata
availability/cost), automatic opening/recovery decisions for unavailable Projects
(changes existing explicit flow), session filtering (changes reviewed Add scope),
and navigation to accepted history (a different product surface/ownership).

## Parameters, failures and checks

- Existing page size 50, staging capacity and candidate/thumbnail byte limits are
  unchanged. New queue metadata is one UUID per row; no image bytes or private
  filesystem paths cross this wire.
- Row preview 48px; detail preview 96px. Both use the existing max-256px worker
  derivative, contain their aspect ratio and reserve space for a placeholder.
  Sizes are local presentation choices, not performance measurements.
- A missing/corrupt thumbnail affects only the preview image. A discarded,
  accepted, unverified or recovery-unavailable candidate refuses navigation.
  Close/document replacement during a read refuses late navigation; no disk or
  Project mutation needs recovery from the refusal.
- Significant tests call the real shared DTO guard, real SQLite manager projection,
  production renderer projection/navigator and native Electron UI→IPC→verified
  staging→Canvas path. Controlled inference replaces CUDA/pixel generation;
  prepared fixtures are not the navigation implementation.
- Neighboring controls vary job/session/Project/document, cache availability,
  source mismatch, live vs superseded read and independent checkbox selection.
  A semantic mutation removes the post-read document identity check in an isolated
  source copy; a delayed valid old-document snapshot must then incorrectly focus
  and make the guard test fail, while unchanged-document navigation stays green.

## Evidence and remaining work

Verified against the final production sources/build:

- Full app suite: **677 passed, zero failed/skipped**. Focused real queue/DTO tests:
  **53 passed**. Actual renderer projection/navigator tests: **8 passed**, including
  held async reads, close/document replacement, wrong job/session/Project, source
  mismatch, repeated targets, supersession and observable read failures.
- `pnpm run typecheck`, full ESLint, production build, changed-file Prettier and
  diff checks pass. Prototype code and Python/worker behavior are unchanged; no
  prototype UI or Python suite rerun is claimed for this slice.
- Native Generate/Queue Manager: **21 passed checks, zero page errors**. Cached
  and corrupt-cache row/detail states use bounded signed WEBP/placeholder. Full
  PNG navigation remains possible; restoring the actual WEBP and clicking Queue
  Refresh once reloads the same resource. A discarded result has no View action.
  Native 900×620 screenshots were opened and visually checked.
- Native Results: **5 new navigation checks** plus both existing recovery/export
  and acceptance smoke groups pass, with zero page errors. Three actual distinct
  staging sessions retain their flat list; View focuses the exact second/first/
  second candidate while a separately selected third candidate stays selected in
  the active Canvas. Repeated hidden/collapsed preview opens correctly. Ordinary
  Home mounting/default selection and closed-Project Open Project are checked
  separately. Full DTOs/queue rows, seed, bbox/layers, Undo/Redo availability and
  saved package bytes are unchanged. All **9 native desktop flows** also pass.
- Isolated semantic mutation removes the post-read document guard in the actual
  navigator: baseline **2/2** → red **1 failure + 1 passing control** → restored
  **2/2**, zero skips. The failed outcome incorrectly focused valid old-document
  pixels after the open document changed. Source-load probe, source/test hashes
  and logs identify the isolated copy; restored/live hashes match.
- Independent renderer review found the user Refresh missing Results reread;
  the dedicated user-only bridge fixed it without an epoch feedback loop and the
  native restored-cache case verifies the result. It also surfaced the existing
  Home/tab unmount selection limit; the stated same-active-Canvas scope preserves
  that behavior. A transient selection owner across mounts is separate future work.

One initial native bounds assertion measured a finite Naive entrance animation.
Its failed log/screenshot is retained separately; the harness now awaits animation
settlement before measuring. The unchanged production build passes the final check;
this infrastructure failure is not counted as a product finding or mutation.

Retained final commands, logs, source/build hashes, native screenshots and mutation
evidence:
`/home/user/.codex/artifacts/imagegen-studio/queue-result-preview-2026-10-01/`.

Full session filtering, automatically completing navigation after Open Project or
recovery decisions, accepted-result/history navigation, automatic cache rebuild,
busy-engine admission, full inference/Anima and release runtime remain separate.
This is navigation to an available session's exact candidate, not a new acceptance
mode. No CUDA release or browser/storage speed/memory claim follows from the checks.
