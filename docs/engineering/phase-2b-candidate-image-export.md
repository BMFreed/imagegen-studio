# Phase 2B: Save Candidate Image

Checkout before this change: `b71619e` (29.09.2026), clean worktree. This is a
high-risk filesystem and IPC boundary: the app writes verified recovery pixels
to a user-chosen path. [Generation Results](../features/project/generate-mode/generation-results.md)
requires a secondary `Save Candidate Image` action even for a valid orphaned
candidate that cannot become a layer. The [roadmap](../specs/01-implementation-roadmap.md)
places this separate from later composite and bbox export.

## Boundary and invariants

The renderer may send only an open Project ID and candidate ID. Main owns the
native Save dialog and destination path; the renderer never receives a private
staging path or chooses a filesystem path over IPC. After the dialog returns,
main must recheck that the Project remains open and copy the candidate's
currently verified sRGB PNG bytes through staging's serialized read. A result
from an earlier document at the same path remains exportable as raw pixels,
with its existing mismatch warning. Export cannot accept a candidate, create a
Raster Layer, mark `.igs` dirty, add provenance/history or discard recovery.

The output is the candidate PNG itself, not a new composition of the Project
Canvas. On failure, an existing destination must retain its prior bytes and no
partial PNG may be presented as complete. Saved and failed outcomes need
explicit feedback; cancel simply closes the native dialog without claiming
that an image was saved.

The existing staging ceiling is 32 MiB per PNG
(`generation-staging.ts:MAX_IMAGE_BYTES`); export reuses its verified read and
does not introduce a larger limit. Available disk space, target filesystem
semantics and path length are external/unknown until the native write; a write
error must leave recovery and the `.igs` untouched. A 32 MiB copy is buffered
by the current staging API, so this does not establish a streaming export path.

## Failure analysis and test plan

| Trigger | Required result |
| --- | --- |
| Dialog canceled | No destination or document/staging change. |
| Candidate removed, corrupted or Project closed while dialog is open | No destination write; report failure without reviving staging. |
| Destination already exists or becomes unsafe/unwritable | Do not truncate existing bytes or leave a partial final PNG. |
| Source document differs at the same Project path | Preserve warning, but allow saving the exact verified image; do not claim it can be accepted. |
| Successful export | Exact PNG bytes at chosen path; candidate still recoverable, `.igs` unchanged and Project clean. |

The production test must use the real staging repository and filesystem writer.
The Electron smoke should enter through the candidate menu and typed IPC, with
the native dialog response controlled as a nondeterministic test input. It must
read the exported file, Project package and staging after the operation. A
semantic mutation of the post-dialog candidate check or atomic destination
write should turn a focused test red.

## Review evidence (29.09.2026)

This is a self-review of the dirty working tree based on `b71619e`, not a
published commit. The typed IPC accepts only the Project and candidate IDs.
The destination callback is the native Electron Save dialog in production;
filesystem tests inject its result. The main service lists verified candidates
before and after the dialog, checks open document identity again, reads the PNG
through staging's serialized SHA/size verification, then publishes a new file
with a same-directory synced temporary file and a create-only hard link.
Existing destinations return `CANDIDATE_EXPORT_EXISTS` and retain their bytes.
A Linux dialog basename without an extension gains `.png`; another extension
is rejected.

Focused exporter tests: 5 passed, 0 failed, 0 skipped. They cover successful
exact-byte export from a mismatched-document candidate, cancellation, close or
candidate change during the dialog, invalid destination, failed verification,
existing-target conflict, temporary cleanup and missing-extension normalization.
An isolated mutation replaced the create-only link with an overwriting rename:
the same suite became 3 passed / 2 failed on existing-destination invariants.
The temporary mutation copy was removed; the working tree retained the safe
publication path. The full app suite has 412 passed, 0 failed, 0 skipped;
typecheck and lint passed on the current implementation.

`pnpm run app:smoke:results` passed through the visible candidate menu,
preload IPC and production main path. It controls only the native dialog
response; the renderer, staging, filesystem writer and Project session remain
real. The exported PNG matches the recovered candidate byte-for-byte. Dialog
cancel and existing-destination failure leave the `.igs`, staging manifest,
candidate PNG and Project layer/dirty state unchanged. The test also checks
visible success/error feedback and stable Konva canvas bounds for all three
outcomes. This checkpoint does not establish a general composite export or a
working Generate/acceptance path.

The complete `pnpm run app:smoke` suite passed on the final inspector-anchored
feedback layout. Visual review checked the opened candidate menu at 1380×900
and 900×620, and the final saved notice at 900×620. The notice stays outside
the canvas tools and candidate preview at the smaller size. The success notice
dismisses itself after six seconds; failure stays visible until dismissed or
another attempt.
