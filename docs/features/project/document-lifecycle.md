# Project Document Lifecycle

Supporting contract for [PP-007: Проект принадлежит пользователю](../../product-promises.md#pp-007-проект-принадлежит-пользователю).
The promise registry owns the concise commitment and public readiness; this
document owns Save, dirty state, close and recovery rules.

Related contracts: [Home](../home-screen.md) owns workspaces, import/relink and
app-managed Trash; [Data Storage](../../specs/03-data-storage.md) owns the `.igs`
package and derived indexes; [Undo/Redo](./undo-redo.md) owns session history.

## Feature

An opened `.igs` Project has an explicit saved revision, in-memory document state,
a document recovery shadow and optional generation staging sessions with their
own app-managed recovery records and assets.

## ImageGen Studio Decision

Shadow autosave protects work from crashes but does not silently redefine the user's saved `.igs` revision.

```text
main .igs = explicit saved revision
open Project state = current editable document
autosave shadow = crash recovery
staging recovery = completed unaccepted candidates, not document state or main .igs
```

The portable `.igs` package owns saved canvas/layer assets, settings, accepted
results and their provenance. Project indexes and preview caches can be rebuilt;
they are not required as the sole copy of the saved project. Model weights stay
in the reusable library: moving a project may require installing its exact
resources, and missing resources must remain understandable from copied metadata.
For a saved checkpoint or LoRA whose local registry IDs came from another machine,
Project may explicitly link the same installed CivitAI model/version/file,
SHA-256 and base family after main verifies its bytes and required dependencies. This updates
only the document's local IDs through the ordinary dirty/shadow/Save lifecycle.
LoRA weight, enabled state, row order and copied metadata remain unchanged.
A LoRA with unknown family can retain that state if all other exact identity
fields and file bytes match; this does not prove model compatibility.
Opening a copied `.igs` never performs the relink silently.

## Dirty State

Project becomes dirty after persistent document mutations such as:

- generation/preset settings changes stored in Project;
- layer add/delete/reorder/visibility/opacity changes;
- Smart Patch or Regional Guidance edits;
- project-owned primary generation bbox move/resize, or explicit destructive
  Raster Layer crop if such a command is implemented;
- `Add N as Layers` / `Add N as Variants`;
- undo/redo that moves away from the saved revision.

Queue progress, completed candidates, staging focus/selection and discarded candidates do not mark Project dirty.

If undo returns exactly to the saved revision, dirty may clear using a revision id/hash comparison.
Saved **document** revision/hash covers project state and accepted assets,
not preview files, cache metadata or whole ZIP bytes. Explicit `Rebuild Preview`
can change the package fingerprint/mtime while leaving the document revision,
dirty state and undo history unchanged; main must recognize its own maintenance
replacement rather than report an external file conflict.

## Save

`Save`:

- validates current Project state;
- assembles and validates a temporary `.igs` package;
- atomically replaces the managed project file;
- updates the saved revision marker, preview and Home index metadata;
- clears dirty state only after successful replacement;
- marks/removes the corresponding document recovery shadow as clean.

An unavailable or crashed ML Worker cannot block Save. If current raster
previews cannot be produced, Save includes the bundled static preview
placeholders and records `preview.status=unavailable` in the `.igs` manifest
when visible raster pixels exist; Project assets, settings and accepted
results are saved normally. An empty Project instead records `empty`. Home
shows that a nonempty Project's preview is unavailable rather than presenting
it as empty. Without the worker, a visible layer is conservatively treated as
potentially nonempty even if its pixels might all be transparent, so the safe
fallback is `unavailable`. The working compositor determines actual
composited-pixel bounds when it becomes available.

A later explicit Save with a working worker can rebuild previews; for an
otherwise clean Project, Home's explicit `Rebuild Preview` performs the
same atomic package replacement without changing the saved document revision,
dirty/undo or staging. It serializes with Save and rechecks project identity and
dirty state just before replacement; failure keeps the saved placeholder.
On a dirty open Project, `Rebuild Preview` routes to Project Save instead.
Neither worker completion nor background cache refresh rewrites the main `.igs`.

Save neither accepts nor discards unaccepted staging candidates. Their separate
recovery manifest and assets survive a successful Save. Save failure keeps the
Project open and dirty with an actionable error; it must not discard either the
document shadow or valid staging recovery.

`Save As` is not required for the current Project prototype. Project renaming/moving remains managed through Home/workspace flows until a separate Save As/export decision is made.

## Closing A Dirty Project

Closing a dirty Project tab opens a Project close dialog with:

- `Save`;
- `Discard Changes`;
- `Cancel`.

Rules:

- `Save` closes only after successful persistence and any required staging-close confirmation;
- `Discard Changes` restores the last saved `.igs` revision and removes the dirty document recovery shadow;
- `Cancel` returns to Project unchanged;
- `Esc` maps to `Cancel`;
- failed Save leaves the close dialog/Project available for recovery.

Before a native window close decides whether any Project is dirty, the renderer
must flush pending prompt/Seed draft edits through Project IPC. A failed or
missing acknowledgement cancels that close and keeps the window available; the
user must not lose text that has not yet reached main's document state. A normal
Project-tab close and Save likewise wait for pending draft edits before reading
dirty state or writing `.igs`.

Closing a Project with pending/running jobs or completed unaccepted candidates
requires an explicit warning, whether the document is dirty or clean. Confirmed
graceful close cancels that Project's pending/running jobs and discards its
staging session, including completed candidates; other projects' jobs are
unaffected. The Save action by itself does not discard staging. If Save and
close are combined, the user sees the staging consequence before the close is
committed. Cancel leaves the document, jobs and staging intact. Late worker
events from a closed/canceled session cannot recreate candidates or mutate the
closed `.igs`. Staging candidates are never converted into layers automatically.

## Autosave And Recovery

Autosave writes debounced dirty document state/assets into an app-managed shadow
directory. Completed unaccepted candidates use a separate app-managed staging
recovery manifest and immutable assets written at completion. Neither path
clears the dirty marker or silently overwrites the main `.igs`; a clean Project
with staging is still recoverable after a crash.

After an unexpected shutdown:

- any valid unclean document shadow or completed staging recovery becomes
  `Recovery available` on Home;
- `Recover` opens the document shadow as dirty when one exists, otherwise the
  saved `.igs`, and restores valid completed candidates into staging without
  accepting them;
- `Discard Recovery and Open Saved` deletes the document recovery state and
  staging recovery for that Project, then opens main `.igs`;
- `Cancel` changes neither state.

Pending/running jobs from the previous application lifetime become canceled
on startup; they do not resume. Their incomplete outputs are not recovered.
Valid completed candidates remain recoverable independently of queue-history
retention and even if the document was successfully saved before the crash.
The staging manifest keeps the frozen generation context required for later
acceptance. Invalid or partial candidate files are excluded with diagnostics;
they must not appear as usable results.
If a valid recovered Smart Patch candidate's target layer is absent, Recover
keeps it visible as an orphaned result with a missing-target explanation. Its
original `Add as Variant` is disabled. The user can explicitly add it as a new
Raster Layer at its frozen bbox when the saved asset/geometry/compositing
snapshot is valid, or Discard it; no automatic retargeting or conversion occurs.
`Save Candidate Image` exports valid generated pixels even when layer conversion
is unavailable, without changing the Project or accepting the candidate.

Recovery is best effort from validated shadow/staging state and does not
guarantee zero lost edits since the latest document debounce. It is not a
backup against disk corruption, external deletion or every crash. Recover opens
document edits for review; restoring staging alone does not mark Project dirty.
Only explicit Save replaces the main `.igs`. Undo history does not survive restart.

## Vue Prototype Coverage

The interactive source of truth is `?prototype=project` and Project tabs opened from Home.

The prototype keeps one app-owned `ProjectSession` per project id for the lifetime of the browser session. Switching tabs preserves the document, saved baseline, history, queue/staging state and Project UI state. Closing and reopening a mock project preserves the retained session, but a confirmed close explicitly discards staging; `Discard Changes` also restores the saved baseline and clears history before closing. This is an in-memory prototype convenience, not persisted undo history or a recovery implementation.

Implemented lifecycle behavior:

- dirty is computed by comparing `document` with `savedDocument`;
- persistent settings/layer/canvas/acceptance mutations can make the tab dirty, while queue progress and staging selection do not;
- mock `Save` updates the saved baseline and clears dirty;
- the `errors` scenario keeps the project open and dirty after a simulated Save failure;
- closing a dirty project offers `Save`, `Discard Changes` and `Cancel`;
- closing a clean project with staging warns that temporary candidates will be discarded;
- Project metadata can be reflected back into the in-memory Home catalog.

Not implemented by the Vue prototype:

- filesystem `.igs` package assembly or atomic replacement;
- autosave shadow writes and crash-startup recovery of Project document state;
- durable staging manifests/assets and recovery of completed candidates;
- real file validation, asset cleanup or Home index persistence.

Home's `Recovery available` scenario is a separate mock of the intended recovery decision flow. It must not be read as evidence that the Project prototype writes or restores recovery shadows.

[Project tests](../../prototype-app/tests/project.spec.ts) and
[Home tests](../../prototype-app/tests/home.spec.ts) are prototype evidence sources,
not evidence of completed production I/O. The Phase 2A main-process package
tests now exercise filesystem Save/reopen, interrupted replacement, portable
copy and worker-unavailable placeholders. The main-process autosave coordinator
tests exercise debounced document recovery, new asset ownership, dirty close,
and edits crossing an atomic Save, including recovery on either side of its
commit. A main-process coordinator holds the canonical Project path until the
tab closes or hands its lease to a replacement after Discard Changes; a second
tab cannot overwrite the first tab's document shadow. The production
Home/Project UI uses typed IPC for Save, recovery and normal Project edits,
including positive/negative plain prompt text, Seed policy/value, an explicit
Illustrious sampler/scheduler pair, Steps and CFG in the document's generation
draft. These draft edits participate in dirty state,
shadow recovery and explicit Save/reopen; changing the requested policy does
not advance the separate last-actual-seed cursor. A native window close uses a
request-scoped main→renderer acknowledgement to flush in-flight draft IPC
before main reads dirty state. Main accepts the acknowledgement only from that
window; failure or a bounded timeout keeps the window open with an error.
The exact installed checkpoint/version selector, portable checkpoint/LoRA
relink and LoRA stack edits also use this document path. VAE/embedding
selectors, denoising and advanced controls are not connected yet. A separate
main-process repository can publish and recover a verified temporary candidate
and its actual seed, but production Generate, worker inference and user-facing
staging preview/recovery/acceptance are not connected to Project UI.
Electron smoke exercises immediate prompt editing followed by native
`app.quit()` and the Save choice, then reads the latest prompt from the real
`.igs` package. The timeout/error branch is an implementation guard, not yet an
end-to-end smoke result.
PP-007 therefore stays publicly unavailable.
The pending process pilot is tracked in [Engineering workflow](../../engineering/README.md#пилоты-и-дальнейшая-автоматизация).

## Acceptance Criteria

- Dirty state represents divergence from the explicit saved `.igs` revision.
- Shadow autosave protects dirty work without masquerading as Save.
- Dirty close offers `Save`, `Discard Changes` and `Cancel`.
- Failed Save never closes the Project or deletes recovery state.
- Staging-only state does not mark Project dirty and is never auto-accepted on close.
- Confirmed graceful close cancels only that Project's unfinished jobs and
  discards its staging; Cancel preserves both.
- Valid completed candidates survive crash/restart and successful Save in
  app-managed recovery until accepted or explicitly discarded, without
  changing the main `.igs`.
- Startup cancels unfinished jobs from the previous lifetime; invalid or
  partial outputs never appear as recoverable candidates.
- A valid Smart Patch candidate whose target is missing remains visible as
  orphaned; only a valid explicit Raster Layer conversion or Discard resolves
  it, and no other layer is silently changed. Its valid raster asset can also
  be exported independently of layer conversion.
- Undo/redo can clear dirty when it returns to the saved revision.
- A saved supported `.igs` can be reopened after transfer/import without relying on the original installation's project index or preview cache; unavailable model weights produce diagnostics.
- Save succeeds with a valid placeholder preview when ML Worker is unavailable;
  it preserves the full document and marks a nonempty Project's preview
  unavailable. A clean Project can explicitly `Rebuild Preview` with the
  restored worker, without fabricating a document edit; a dirty Project must
  Save its current state.
- Save success is verified by reopening through the real loader; a write/validation/replacement failure keeps the previous saved package readable and the document dirty.
- Valid recovery opens for review without replacing the saved package until explicit Save; failed Save does not delete the recoverable shadow.

Portable LoRA links now use this same document lifecycle. Two-library filesystem
checks cover recovery and Save/reopen; Electron covers explicit row action,
corrupt-file refusal and a just-edited weight before linking. See
[LoRA relink validation](../../engineering/phase-2a-project-storage-research.md#portable-lora-relinking-validation).
