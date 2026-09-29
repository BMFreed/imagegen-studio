# Phase 2B: explicit Raster result acceptance

Checkout before this change: `3de19eb` (29.09.2026), clean worktree. This is a
high-risk PP-008/PP-005/PP-007 boundary: verified local candidates cross into
the Project document, recovery shadow, and eventually the portable `.igs`.
The expected behavior is defined by [Generation Results](../features/project/generate-mode/generation-results.md),
[Undo/Redo](../features/project/undo-redo.md), and
[provenance](../features/project/generate-mode/generation-provenance.md).

## Observed path and scope

The current desktop Results view can preview and export verified candidates,
but has no Add command. `GenerationStagingRepository` validates manifests,
receipts, and PNG bytes; `ProjectAutosaveCoordinator.applyDocument()` owns the
editable document and asset handoff, while `flush()` writes its recovery shadow.
Each queued job currently receives its own staging session ID, so a grouped
acceptance may span several sessions. Project close can cancel jobs and discard
staging independently of a document edit. Production Project Undo/Redo is not
yet exposed.

This checkpoint adds a Project-local document history foundation and an
explicit Raster acceptance path for **completed** candidates. The first slice
rejects acceptance while that Project has unfinished jobs; the contract's
early-accept confirmation/cancellation flow remains open. It does not enable
ordinary-user Generate, Smart Patch variants, the derived global history
index, or the full inference pipeline.

## Invariants and failure matrix

| Trigger | Required observable result |
| --- | --- |
| Candidate belongs to another document/path or fails verified read | No layer, no shadow commit, no staging discard. |
| Several selected candidates from one Project | One document mutation and Undo step; deterministic adjacent top layers, one visible anchor, frozen bbox positions and immutable provenance. |
| Document/asset/shadow write fails | Candidate remains recoverable; retry cannot duplicate an accepted layer. |
| Shadow commit succeeds but staging cleanup fails | Accepted layer is already recoverable; retry only cleans sessions belonging to that acceptance, not newer results. |
| Project close races Add | One operation wins; neither may detach the document between validation and durable handoff. |
| Old candidate at same path belongs to a replaced document | Add current-document result preserves that orphan for preview/export; it cannot be accepted into the new document. |
| Another Project command fails before adoption | The shared open document remains unchanged; no uncommitted nested array/object mutation leaks into Add or Undo. |
| Save/restart after accepted result | `.igs` is unchanged before explicit Save, then contains accepted pixels/provenance after Save; Undo history is session-local. |
| Undo and Redo after Save | Reversible document states preserve their referenced raster assets without restoring staging. |

The image ceiling is 32 MiB per candidate and `project.json` is bounded to
16 MiB. Selected count is bounded by the available verified candidates, but a
large multi-selection can consume significant transient memory; this is an
unmeasured operational limit, not a claimed benchmark. Free disk space and
process interruption timing remain external unknowns. A failure after a
durable shadow commit may surface as an error even though the Project already
contains the accepted layers; the UI must refresh document and Results state
and explain the retained recovery state rather than assume rollback.

Before Add, the renderer refreshes Results and explains the exact number of
unchecked results that will be discarded. Main requires the complete
same-document candidate ID set from that view to match its verified staging
snapshot; a stale confirmation cannot delete a newly appeared result.

The process-local acceptance set can discard unselected candidates after a
successful handoff. After a crash in the shadow-to-tombstone window, no durable
journal currently distinguishes those older unselected sessions from later new
results. Recovery therefore removes only sessions whose candidate IDs appear
in accepted provenance and leaves other temporary candidates for explicit
review. This is a bounded cleanup gap, not permission to delete possibly new
work.

## Verification plan

Use real staging SQLite/filesystem, Project shadow, `.igs` Save/reopen, and
production entry points. Test neighboring nonmatching documents and manual
Raster layers. Include controlled failures before and after shadow commit,
retry after an edit, undo/redo across Save, close/Add serialization, and a
restart. Execute a semantic mutation in an isolated copy against the key
flush-before-discard or duplicate-guard test. Run focused tests, then
`pnpm run app:test`, `pnpm run typecheck`, `pnpm run lint`, and Electron smoke
for the renderer/IPC path. Record the actual evidence and remaining gaps below
after implementation.

## Review evidence

Reviewed the uncommitted worktree against `3de19eb`. An independent contract
pass found two reachable defects: Add initially discarded unchecked candidates
without explaining the loss, and a concurrent Project edit could change the
revision between Add and shadow proof. Both were corrected. Add now confirms
the loss from a refreshed Results snapshot, and `applyDocument` returns the
revision it actually committed; acceptance proves that exact revision before
discarding staging. A changed candidate set makes Main reject the operation.

The integration test in `generation-staging.test.ts` publishes through real
queue/SQLite/filesystem staging, interrupts acceptance after the synced shadow,
reopens the SQLite database and Project recovery with new owners, reconciles
the tombstone, and verifies the accepted layer through `.igs` Save/reopen.
Acceptance tests use real autosave/shadow/`.igs` with a controlled staging
adapter for interleavings and failure injection; the integration test and
Electron smoke cover the real staging boundary. The renderer smoke also found
and corrected a Vue reactive-array IPC cloning error.

Executed checks: `pnpm run app:test` (447 passed, 0 failed),
`pnpm run typecheck`, `pnpm run lint`, `git diff --check`, and full
`pnpm run app:smoke`. The Electron Results smoke covered Add cancellation,
confirmed discard, crash recovery and Save/reopen; the dialog was visually
checked at 900×620. The final UI-only confirmation branch was typechecked,
built and included in the full smoke after the 447-test run. In isolated
copies, removing flush-before-discard, broadening cleanup
to an orphan session, ignoring the candidate snapshot, and proving a later
Project revision each made a corresponding regression test fail. The native
window-close fence-release test also failed when its pending-handoff guard was
removed. No mutation was left in the worktree.

This evidence establishes this Raster Add slice, not full PP-008 readiness:
ordinary Generate, early Add with unfinished jobs, Smart Patch acceptance,
user-facing Undo/Redo, derived history and durable tracking of unchecked
sessions across the narrow crash window remain open.
