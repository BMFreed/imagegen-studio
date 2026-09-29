# Phase 2B: production Project Undo/Redo

Checkout before this slice: `7ff9481` (30.09.2026), clean worktree. This is a
PP-008/PP-007 medium-risk Project history change with a high-risk edge at
accepted Raster assets, shadow recovery and concurrent Add/Save/close. Expected
behavior is defined by [Project Undo/Redo](../features/project/undo-redo.md),
[Generation Results](../features/project/generate-mode/generation-results.md)
and [Document Lifecycle](../features/project/document-lifecycle.md).

## Observed path and decision

`ProjectAutosaveCoordinator` already owns per-tab 64-state past/future stacks,
verifies assets before restoration and keeps history outside `.igs`. Production
`ProjectTab`, IPC and renderer do not expose Undo/Redo. `ProjectDraftSync` sends
prompt text incrementally for live Project edits and crash recovery, while
`PlainPromptEditor` still installs CodeMirror-local history. Exposing shortcuts
now would undo characters locally or create a Project step per incremental IPC.

Keep incremental document/shadow writes. Main owns a transient prompt history
group keyed by one focus session; ordinary commands, blur, Save, tab switch and
window close seal it after pending draft IPC. Only the final difference from its
baseline creates one history step. Project Undo/Redo uses a typed IPC and the
same Project generation operation gate as Add/Save/close, with pending handoff
blocked. The production editor relinquishes local CodeMirror Undo so its
shortcuts address Project history; other app dialogs and native text inputs
retain their own editing behavior.

## Invariants and failure matrix

| Trigger | Required observable result |
| --- | --- |
| Type several characters in one prompt focus session | Current text reaches autosave; one Project Undo restores the pre-focus text. |
| Move from positive to negative prompt | Two independently undoable focus sessions, with no cross-field overlap. |
| Type and return to original text before blur | No history step and any prior Redo branch stays available. |
| Switch tab/Home, Save or close during typing | Pending IPC settles and the group seals before the Project operation proceeds. |
| Project edit, Save, Add or Undo races with prompt IPC | A complete operation wins or fails with a visible conflict; no stale prompt silently overwrites the newer document. |
| Undo multi-result Add | One step removes accepted layers/provenance from current Project; staging is not resurrected. Redo restores verified raster assets. |
| Save, restart or recovery | `.igs`/shadow contain the latest document state, but session history does not survive restart. |
| History reaches 64 steps or Redo branch is invalidated | Unreachable historical asset copies are reclaimed without deleting current, saved or reachable Undo/Redo assets. |

The current service and coordinator tests prove part of the history foundation,
not renderer/IPC behavior. Validation needs service-level controls, an Electron
flow through real keyboard/buttons and Save/reopen, crash recovery checks, and
an isolated semantic mutation of the grouped-baseline or retained-asset guard.

## Limits and failure behavior

The 64-snapshot cap follows the existing Project history limit; each snapshot
retains a document object, while Raster pixels stay in separately verified
sources. The schema bounds `project.json` to 16 MiB, but actual long-session
memory and disk use have not been benchmarked. Scratch free space and external
deletion/corruption of a retained source remain outside the app's control.
Undo/Redo verifies a reintroduced source before changing the document. If the
source is unavailable, the action reports an error and retains the current
document and history position; recovery still uses the last committed shadow
or explicit `.igs` Save. Cleanup of unreachable historical scratch copies is
best effort and reports failures as process warnings, without rolling back an
already committed document edit.

An accepted Raster result remains an immutable Project asset through Save and
Redo, while its temporary staging session stays discarded. Clear History only
forgets transient snapshots; it does not change the current document, saved
package or recovery shadow. Closing a Project releases its session history.

## Review evidence

Reviewed the uncommitted worktree against `7ff9481`. An independent integration
pass found that pending draft changes were coalesced across an intervening
setting change, changing their order in Project history. DraftSync now coalesces
only the contiguous queue tail; a regression holds the first IPC open and
checks the later prompt/seed send order. The pass also found that failed tab
activation moved keyboard focus to an unselected tab; focus now follows only a
successful flush and switch.

`pnpm run app:test` passed **457/457**, including real Project service,
autosave/shadow, raster source retention, and serialized draft tests.
`pnpm run typecheck`, `pnpm run lint` and `git diff --check` passed. Full
`IMAGEGEN_SMOKE_UNDO_SCREENSHOT=/tmp/igs-undo.png pnpm run app:smoke` passed
against the rebuilt Electron app. The desktop path checked multi-keystroke
CodeMirror Undo/Redo through keyboard, toolbar and Edit menu; the Results path
checked two-layer acceptance as one step, no staging resurrection, Redo's
decoded 64×64 image and expected pixel, Clear History without document or
`.igs` changes, crash recovery and subsequent Save/reopen. Screenshots were
inspected at 1380×900 and 900×620: the compact history controls remained
visible in the bottom bar.

In isolated copies, removing the grouped baseline push made the prompt Undo
test fail, and disabling historical-source pruning made both Clear History and
64-snapshot overflow asset tests fail. The mutations were removed before the
passing run. The first full smoke attempt saw a transient Recovery dialog
detachment during restart; the unchanged scenario and later complete run
passed. This checkpoint proves the implemented production Project paths, not
Smart Patch/Regional Guidance gestures, ordinary Generate, release runtime or
persisted Undo history.
