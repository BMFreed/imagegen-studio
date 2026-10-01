# Phase 2B: bounded worker result thumbnails

Date: 2026-10-01. Base: `04b8ab8`. Risk: high, because staging resources,
filesystem publication and async worker completions cross the change. This is
an optional presentation cache; it does not change candidate acceptance scope.

## Research and intended boundary

Confirmed: `ProjectGenerationResultsTray` already has 72px cards, previous/next
focus, independent checkbox selection and collapse. Its image URL points at the
full authoritative PNG, as does Canvas. Candidate images may be up to 32 MiB.
A small CSS box limits layout, not image transfer/decode size.

Confirmed: full staging resources use signed process-lifetime URLs, require an
open Project, and reverify staged data through the repository's serialized
read/discard boundary. Candidate PNG/manifest/receipt are authoritative and
independent of prunable queue history. Save and export have separate boundaries.

Confirmed: the qualified inference child already owns the completed Pillow
image and its private provisional output directory. It can produce a thumbnail
without launching another worker. Existing Pillow/ICC and main WEBP verification
can be reused. Cache failure must not turn a valid completed PNG into a failed job.

Confirmed: the existing Project view aggregates completed sessions. Add captures
all eligible sessions for its exact confirmation and grouped mutation. Filtering
this view to one session would change destructive acceptance scope. This slice
preserves the flat view, focus/selection and cross-session confirmation/cleanup.
Session navigation remains separate work, with its scope stated explicitly.

## Compatibility and cache design

Extend the finite inference matrix, not a loose semver range:

| Worker | Required capabilities beyond inference   | Thumbnail behavior                                     |
| ------ | ---------------------------------------- | ------------------------------------------------------ |
| 0.2.0  | None                                     | Legacy terminal-only inference; thumbnail placeholder. |
| 0.3.0  | denoising-progress                       | Existing real steps; thumbnail placeholder.            |
| 0.4.0  | denoising-progress, candidate-thumbnails | Best-effort worker WEBP sidecar.                       |

Protocol 1, Linux/NVIDIA and existing inference request DTO remain unchanged.
Unknown versions/missing capabilities refuse startup before queue claim.
Generation completion may nominate an optional thumbnail descriptor
`{outputPath,sha256,byteSize,width,height}`. Main accepts it only from a qualified
thumbnail-capable peer and only at the fixed path `<full PNG output>.thumb.webp`.
It never reads arbitrary renderer/worker-nominated filesystem paths.

Python resizes a copy of the same sRGB image used for the full PNG, writes WEBP
in the same owned child, and returns metadata after its bounded durable write.
It preserves the original image/full PNG. An encoding/publication error affects
only the cache; pre-existing/symlink destinations are not replaced or deleted.

Main verifies bounded stable no-follow reads, SHA, WEBP structure, pinned sRGB ICC
and actual dimensions. The cache is stored inside the candidate's staging session
under thumbnail-cache, separately from its authoritative version 1 manifest and
publication receipt. Missing/malformed/corrupt thumbnails do not invalidate the
candidate or prevent recovery, Canvas, export or Add. Session discard/teardown
revokes access and includes cache in the existing best-effort session cleanup;
a filesystem failure can defer physical removal after the durable tombstone.
No new candidate schema migration is needed.
This slice creates cache only during new worker completion; automatic rebuild of
missing, corrupt or legacy cache is not implemented. Those candidates show a
placeholder and remain usable through their verified full PNG.

Renderer gets optional signed `igs-staging://thumbnail/...webp` with source PNG
and thumbnail hash identities. The resource handler supplies image/webp, no-store
and nosniff, validates signature/shape and checks the still-open Project, verified
candidate and cache on every request. A cache hit cannot survive candidate removal
or bypass an open-Project/source-identity check.

The tray uses only this small URL; absent/failed cache shows an explanatory
placeholder with the same focus/select actions. It does not silently download the
full PNG as a thumbnail fallback. Canvas and Save Candidate Image continue to use
the authoritative full image. Cache updates do not change Project/Undo/history,
seed cursor, frozen provenance, dirty state or explicit `.igs` Save behavior.

## Parameters and verification plan

| Parameter           | Value / source                     | Behavior                                                                            |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| Thumbnail box       | Existing tray 72px                 | Approved layout remains unchanged.                                                  |
| Thumbnail max side  | 256px, explicit cache policy       | Covers dense cards at high DPI; no upscale. Both TS/Python validate the limit.      |
| Thumbnail max bytes | 256 KiB, explicit cache ceiling    | Oversize cache omitted/refused without rejecting valid full PNG.                    |
| WEBP quality        | 80, cache-only encoding choice     | Lossy presentation cache; full PNG/export pixels unchanged.                         |
| ICC                 | Existing pinned sRGB               | Original ICC behavior and authoritative pixels remain unchanged.                    |
| Full PNG            | Existing 32 MiB and raster limits  | Thumbnail ceilings do not change generation capability.                             |
| Wire                | Existing 64 KiB JSONL              | Descriptor is bounded metadata, no inline image/base64.                             |
| Cache lifetime      | Staging session                    | Queue pruning does not delete a live candidate; discard/close owns session cleanup. |
| Runtime count       | Existing app-owned inference child | No additional worker for thumbnail generation.                                      |

Meaningful tests must exercise the actual Python writer, main cache publication
and resource read guards, not create a fake thumbnail implementation inside tests.
Precomputed image fixtures and controlled inference peers only replace pixel
inference. Cover large/non-square sources, no upscale, alpha/ICC, corrupt/missing
cache, wrong hash/metadata/path/symlink, post-discard/post-close reads, source
replacement, queue pruning and unchanged full-image/export/acceptance outcomes.

Native checks should witness a distinct thumbnail URI in the actual tray and the
original full PNG on Canvas/export, preserve missing-thumbnail candidates and
show their placeholder. Open screenshots and inspect the approved card geometry.
Isolated semantic mutations remove the cache/source hash binding and propagate an
optional cache error. The corresponding tests must fail while neighboring valid
behavior remains green.

## Evidence and remaining scope

Implemented in the production worker/main/renderer boundary. Verified:

- Full application suite: 667 passed, zero failures/skips. Focused storage,
  processor, resource and wire tests: 63 passed; finite worker/runtime qualification:
  41 passed. Typecheck, full ESLint and production build passed.
- Python dev suite: 155 passed, one missing-Compel skip. The existing pinned ML
  packages in an isolated test environment: 156 passed, zero skips; actual source
  paths and package versions were probed. Ruff/format and basedpyright passed.
  Actual Pillow cases verify large/non-square sources, bounded dimensions/bytes,
  no upscale, ICC, alpha and best-effort failure after the full PNG exists.
- Native Electron Generate/Queue Manager: 17 passed checks, zero page errors.
  The tray requests the signed WEBP resource; focused Canvas uses the full PNG.
  Damaged cache returns 404 and shows a selectable placeholder without changing
  the candidate, cursor or `.igs`. Cache restoration is retryable on Refresh.
  Screenshots of both states were opened and visually checked. The controlled
  peer replaces pixel inference; its tiny images do not measure transfer savings.
- Native Results recovery and early-Add smoke groups passed with zero page errors,
  including legacy no-cache placeholder, full-image preview/export, Save/Cancel,
  acceptance and Undo/Redo. All nine native desktop flow checks passed.
- Real SQLite/filesystem tests preserve full PNG bytes/export when cache is
  absent, malformed, oversized, symlinked or corrupt. Fresh thumbnail reads refuse
  wrong source/cache identities, changed valid source PNG, discarded candidates
  and closed Projects. Queue pruning/restart do not remove a live candidate/cache.
- Isolated TS mutation removes source-hash binding: baseline 2/2 → red one failure
  plus one passing control → restored 2/2. Isolated Python mutation propagates
  cache errors: baseline 6/6 → red five failures plus one passing control → restored
  6/6. Production source hashes match restored sources. The later test-only valid
  source-PNG replacement assertion was also included in the final full suite.

Retained logs, commands, source hashes, mutation evidence and native screenshots:
`/home/user/.codex/artifacts/imagegen-studio/result-thumbnails-2026-10-01/`.
The full PNG remains subject to existing fresh candidate verification. Each
thumbnail GET currently rereads/verifies the Project's staged candidates, including
full PNG hashes; this slice does not measure or claim faster main/storage reads,
browser memory/latency or end-to-end performance. Cache transfer/decode bounds are
verified independently of that cost.

Queue Manager result previews and output/session navigation remain separate work.
Existing Results previous/next navigation and cross-session Add are preserved;
no session-scoped acceptance change follows from this cache. Full CUDA/checkpoint
loading, release runtime installation and other generation operations are not
claimed. PP-007/008 and Phase 2B remain incomplete.
