# Phase 2A: `.igs` storage and Project application boundary

Scope: [PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю),
[storage](../specs/03-data-storage.md) and
[document lifecycle](../features/project/document-lifecycle.md). This is a
high-risk data boundary. The storage slice defines an executable v1 format and
tests Save→reopen and standalone autosave/recovery through real files. The
production Home/Project bridge uses typed IPC. Generation staging recovery,
worker-generated previews and the Linux/NVIDIA Python runtime remain separate
Phase 2A work.

## Baseline before implementation and evidence

- **Confirmed at entry:** `src/main` had no Project repository, `.igs` loader/writer or
  worker image-derivative path. The Vue Project prototype keeps its document,
  Save and recovery scenarios in browser memory. Its finite `canvas.width` and
  `canvas.height`, `tone` and `mockCoverage` are mock rendering data, not a
  production format.
- **Confirmed:** PP-007 requires an explicit saved `.igs`, a separate local
  document shadow and a separate temporary-generation recovery store. The ZIP
  owns mandatory `mimetype`, `manifest.json`, `project.json` and two embedded
  previews. The SQLite Home index and preview cache are derived.
- **Confirmed contract correction:** a copied portable document may retain its
  embedded document ID, while its local recovery key must be distinct. A
  missing cache thumbnail can be rebuilt from `.igs`; a missing embedded
  preview means the package is invalid.
- **Inferred:** streaming ZIP input/output is needed because raster assets can
  exceed practical process memory. [`yauzl`](https://github.com/thejoshwolfe/yauzl/blob/master/README.md)
  supports lazy entry iteration, strict filenames and size validation;
  [`yazl`](https://github.com/thejoshwolfe/yazl/blob/master/README.md) streams output. App-level
  limits, duplicate detection, content hashes and shape validation remain our
  responsibility. These libraries are implementation tools, not format owners.

## First executable boundary

The main process accepts a typed document and immutable asset sources. It
creates the archive in the target directory under a unique temporary name,
validates that archive using the same loader as Open, flushes the file, then
atomically replaces the target. A successful replacement is the Save commit
point; derived SQLite indexing may be retried from `.igs` after a crash. The
renderer may clear dirty state only after main reports that commit. Worker
previews are an injected producer: empty projects use bundled static
placeholders; nonempty projects with an unavailable worker save both static
placeholders with `preview.status=unavailable` and retain all document assets.
No queue candidate is added by Save.

The loader validates the MIME marker, supported schema version, exact required
members, unique normalized member paths, manifest/project references, content
hashes, preview signatures and dimension limits before exposing a document. A
newer version returns a distinct unsupported-schema diagnostic. `documentRevision`
tracks document content and accepted assets, not ZIP bytes, preview derivatives
or mtime, so `Rebuild Preview` can replace the package without inventing a
document edit. Local recovery uses a key derived from canonical managed path,
not the portable document ID.

The user has chosen sRGB as the first-release working/export color space.
Imported pixels with ICC are converted to sRGB by the worker; the original ICC
bytes remain a referenced, deduplicated `.igs` metadata asset. The ZIP layer
preserves that member and never performs color conversion. Incorrect ICC input
must produce a diagnostic rather than silently tagging unconverted pixels as
sRGB. Worker output embeds a fixed, hash-pinned sRGB ICC, and both main's
worker client and `.igs` loader reject contradictory ICC/PNG color signals.
Profileless RGB assets are interpreted as sRGB; the byte stream alone cannot
prove their actual source colors. The worker's PNG/JPEG/WebP tests use a real
AdobeRGB profile and assert changed sRGB pixels, preserved original bytes and invalid-profile
rejection. PNG iCCP, JPEG ICC APP2 sequences and WebP ICCP/VP8X signaling are
checked independently because an image decoder can silently discard a damaged
embedded profile. Import applies EXIF Orientation before color conversion so
the normalized layer geometry matches displayed pixels. PNG files without ICC
must either have no explicit color signal or only sRGB-compatible
`gAMA`/`cHRM`/`cICP`/`sRGB` chunks; other color declarations are rejected
instead of silently relabelling unchanged pixels.
The main process validates PNG structure/compressed pixels and WebP container
structure before it accepts worker output, using the same validators as `.igs`
Save. A main-process
import-service test also runs the real development
worker through dirty Project state, explicit Save, `.igs` reopen and exact
original ICC verification. The Electron smoke below now covers the file picker,
pending-asset display on Konva and autosave handoff for a profileless PNG. Full visual
parity and export remain unverified.

The first raster-only session computes a **conservative** world-space rect from
transformed, visible layer rectangles. This enables worker-unavailable Save for
very distant layers and prevents the primary bbox from hiding content, but it
does not inspect alpha or occlusion. A wholly transparent yet visible layer may
therefore get `unavailable` rather than `empty`; a pixel-tight worker rect is
not accepted until a real compositor can prove the frozen geometry. These are
Phase 2A integration gaps, not a change to the final visible-pixels contract.

## Parameter inventory

| Parameter                                                             | First-slice treatment                                                                                                                   | Evidence and next qualification                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ZIP entries, JSON bytes, single-entry bytes, aggregate unpacked bytes | Explicit reader/writer safety ceilings, centralized and injectable for small boundary tests                                             | **Unknown** real workload distribution; measure representative large Projects before calling these product capacities |
| Raster dimensions and pixel count                                     | Parse image headers and reject values beyond a centralized safety ceiling before worker/compositor use; worker also caps decoded pixels | **Unknown** real release capacity; GPU/worker tests and file corpus needed                                            |
| Bbox origin and size                                                  | Finite safe integers; size positive; generous technical ceiling independent of mock 64–4096                                             | **Unknown** inference-supported target range; determined in worker capability tests                                   |
| Preview world rect                                                    | Separate ceiling of ±2.2 billion world coordinates and 4.4 billion extent; encoded PNG/WebP limits remain independent                   | Derived from bounded layer transform space, not measured canvas capacity; reject out-of-range package metadata        |
| Free disk space and write latency                                     | Save error preserves previous readable file and dirty/shadow state                                                                      | External conditions; verify injected full-disk/rename failures and later release hardware                             |

Limits prevent unsafe ingestion; they are not published model, canvas or file-size
promises. Tests override the same limit interface with small values to exercise
the rejection path without manufacturing multi-gigabyte fixtures.

## Failure checks for this slice

1. Save an empty Project, copy the `.igs` into a fresh location without any
   SQLite index/cache, and reopen with the real loader. Edit bbox/draft, Save
   again and verify the exact document after reopen.
2. Add a real raster asset, Save with worker unavailable, reopen with both
   placeholders and `preview.status=unavailable`, and verify the asset bytes and
   hash remain intact. An empty Project remains `empty` without worker.
3. Fail temporary write, ZIP validation and pre-rename replacement: the old
   `.igs` stays readable. Fail indexing after rename: reopening from `.igs`
   recovers the committed document rather than reporting a false failed Save.
4. Reject duplicate, traversal/backslash/absolute, symlink-like and encrypted
   entries, missing referenced files, wrong digest, wrong preview signature,
   unsupported schema, and exceeded entry/unpacked/pixel limits.
5. One copied `.igs` in two managed locations must have independent local
   shadow/staging keys. Rebuild of a clean Project must preserve the document
   revision; it must serialize with Save and never accept staging candidates.

The full PP-007 acceptance still requires the production Project tab and IPC,
real compositor/worker preview generation, UI-connected autosave/recovery,
generation staging recovery, clean Rebuild Preview and release runtime. These
gaps remain visible in the promise matrix until exercised.

The autosave coordinator acquires one process-local lease per canonical Project
path before inspecting or changing its shadow. This prevents two tabs in the
same application instance from overwriting each other's recovery state;
graceful close releases the lease and Discard Changes transfers it to the
replacement session. A fresh process gets a new registry for crash recovery.

The first session serializes Saves and Home-index health writes for one
canonical path within the Electron main process and detects a changed file
fingerprint before replacement. The
application already enforces a single instance, but this is not a cross-process
compare-and-swap against an unrelated writer that ignores our in-process lock.
The remaining interval between fingerprint check and rename requires a managed
workspace/file-lock policy or a stronger Linux-specific publication primitive
before concurrent third-party writers can be treated as supported.

## Production Home/Project bridge

The renderer receives only Project summaries and tab snapshots. It cannot send
an arbitrary document, asset path or `.igs` path to main. Home lists indexed
Projects; `create` chooses a new file inside the default `Uncategorized`
workspace, and `open` resolves a validated local project key against that
workspace's index. Main checks canonical path and workspace ownership before
opening. The primary bbox remains an independent world-space rectangle, and
the only document edit exposed by this bridge is its typed rectangle. This is
an intentionally narrow Project UI slice, not the final Canvas or layer stack.

Main owns the open-tab registry and one autosave coordinator per canonical
file. Normal Open first inspects document recovery. A recoverable shadow must
be explicitly recovered or discarded; stale/invalid shadow state offers only
Discard Recovery and Open Saved. Save reports the `.igs` commit separately
from derived Home-index and shadow-cleanup warnings. A failed pre-commit Save
keeps the tab dirty and the shadow available. Closing a dirty tab or native
window requires Save, Discard Changes or Cancel. An indexing failure after
New Project cannot roll back the committed `.igs`; the error names that state,
and a later workspace scan can rediscover the file.

Independent review reproduced an indexed-path swap between lookup and Open:
without a second canonical-path check, Save could commit into a different
valid `.igs`. The session now checks the expected canonical path before
reading or leasing it, including Recover/Discard Recovery; real-file tests
swap the indexed path during recovery inspection and verify that the external
file is unchanged. New Project also checks its expected workspace directory
before writing. Native Save All keeps tabs attached until every Save succeeds
and pushes fresh tab snapshots to renderer if a later close step fails.
`create` passes through a warning when the writer cannot confirm directory
sync after committing the new filename.

The integration checks use real `.igs`, SQLite and shadow paths for
create→edit→Save→reopen, explicit recovery without changing the saved package,
invalid Project IDs and bbox values, failed Save with preserved recovery, and
post-create index failure. The desktop smoke enters through Home and typed IPC,
verifies an actual `.igs` ZIP, saves/reopens a bbox edit, waits for a published
shadow snapshot with the next edit, then restarts Electron after `SIGKILL`.
It confirms that recovery is offered before opening the saved revision and
that explicit Save commits the recovered edit. On this working tree,
`pnpm run app:smoke` passed; this is production IPC/filesystem evidence, not a
claim that the final Canvas or staging flow works.

## External import and raster display

`Import Project` opens Electron's `.igs` picker. Main validates the selected
package and keeps its canonical path behind a one-use selection token. A file
already in the managed workspace opens through the normal index/recovery path.
For an external file, Home asks whether to Move (default) or Copy into
`Uncategorized`; Cancel drops the token without touching the source or index.
The destination copy is streamed into a private staging file, validated as an
`.igs`, fsynced and published without replacing an existing filename. Indexing
and opening follow publication. Move removes the source only after a valid
destination opens and the destination directory sync succeeds. If source
removal, indexing or opening fails, the committed destination remains available
for Home rediscovery and the source is kept. Copy preserves the portable
document ID but gets a distinct path-derived local recovery key.

The production Project now receives raster layer metadata with no filesystem
paths. Main issues a process-lifetime `igs-layer:` capability for each open
tab/layer/revision; the image handler checks the current open document and
streams the saved member only after `.igs` validation. The Konva viewport uses
world coordinates independent of the primary bbox; pan, zoom and Fit View are
camera-only, while applying bbox fields or a bbox drag commits a document edit.
The Raster Layer stack in the current working tree now routes visibility, lock,
opacity, blend mode and top-first reorder through typed renderer/preload/IPC
commands to `ProjectService` and the document autosave coordinator. A locked
layer cannot change opacity/blend or move until unlocked; an unchanged command
does not dirty the document. This does not add raster painting or transforms.

The raster importer now prepares a candidate and verified asset sources without
mutating the Project. The autosave coordinator checks the expected revision,
stages the sources, then publishes the document edit. A stale candidate or
failed source adoption leaves the current document unchanged. The image handler
serves both saved `.igs` members and currently referenced coordinator-owned
pending assets through the same revision-scoped capability, reverifying the
pending bytes before response. The production file-picker and IPC are wired;
the runnable worker is currently the local development `derivatives-only`
environment, not an installable release runtime.

The import slice connects the Project layer-stack add action to a native
PNG/JPEG/WebP picker owned by Electron main. The renderer sends neither an
arbitrary source path nor normalized asset bytes. On successful normalization,
the new Raster Layer is inserted at index 0 with its top-left at the current
primary bbox origin, at its normalized pixel size; the bbox itself is unchanged.
Main publishes the prepared document and verified asset sources through the
existing revision-guarded autosave coordinator, then refreshes the Project tab
so the pending layer can render before explicit Save. Cancel, worker failure,
source change, stale revision and failed asset adoption leave the document
and existing `.igs` untouched. The Electron smoke verifies cancel and malformed
source through the UI, including cancel from an empty Project; service tests cover concurrent edits, unsafe sources
and worker failure. The renderer never supplies a filesystem path.

The existing real-worker import tests run the local development
`derivatives-only` Python worker. They validate image normalization and some
filesystem boundaries, but do not establish an installable Linux/NVIDIA
runtime, startup from app-managed Python or a release inference pipeline. The
Electron smoke uses this development worker as a bounded integration fixture;
it is reported separately from production runtime qualification. Local manual
import testing uses `pnpm run app:dev` with the checkout's Python venv;
`pnpm run app:start` has no development opt-in. A packaged build returns an
explicit `PROJECT_WORKER_UNAVAILABLE` until the app-managed runtime installer
and worker activation are wired. The Project remains open and Save remains
available with placeholder previews.

Focused real-file service tests cover Copy/Move/Cancel, rename collision,
source changes, symlinks, post-commit failures and independent recovery keys.
The layer-resource test streams exact PNG/WebP and staged bytes and rejects a
forged or stale capability. The prepared-import test runs a real Python image worker and checks
Save/reopen with original ICC metadata; a semantic mutation of its revision
guard makes the stale-candidate test fail. These are bounded checks, not the
full PP-007 exit test.

The Raster Layer service tests seed a real `.igs` through the package writer and
public Copy import, then call the typed service commands. They verify layer
properties and order in the durable document shadow, explicit Save and reopen;
invalid, missing and locked commands; clean no-ops; and exact raster asset
bytes when all layers become hidden or zero-opacity. Without a worker, the saved
preview is `empty` when no layer is visible with opacity above zero, and
`unavailable` when one remains. The focused command
`pnpm exec tsx --test src/main/projects/project-service.test.ts` passed 22/22
on the current working tree. The current `pnpm run app:smoke` also passed through
the Electron UI: hide/show changed Canvas pixels, 40% opacity changed the pixel,
the selected-layer blend control set `multiply`, lock/unlock changed the editor
state, menu move and pointer drag changed layer order, and Save/reopen preserved
the final layer properties, including blend mode.

The desktop smoke uses the real package writer to seed a raster `.igs`, then
enters through Home's native picker, cancels once, copies on the next attempt,
and verifies the external source, indexed destination, open tab layer DTO and
browser image decode through `igs-layer:`. The resulting Konva canvas was
visually inspected from the smoke screenshot; the 2×2 blue test image appears
at its world-space transform, with the independent bbox outline visible. The
smoke also reads a blue center pixel from the Konva scene; a cross-origin
taint discovered during review was resolved by CORS-enabled custom scheme and
anonymous image loading. The current Electron smoke then chooses a PNG through
the layer-stack action, confirms the new top layer at the edited bbox origin,
loads its `igs-layer:` image and samples an opaque Canvas pixel outside the old
visible layer before Save. It checks the normalized asset in the
saved `.igs` and reopens it; cancel and malformed-PNG cases leave the tab clean.
The worker launched from the checkout is a development fixture, while only the
picker, renderer, IPC and Project document path are production code.
The earlier raster-display slice was committed
as `ac7e913`; its recorded checks were `pnpm run app:test` 182/182,
`pnpm run typecheck`, `pnpm run lint` and `pnpm run app:smoke`. The focused 19/19
test run verifies those Raster controls. The current working tree passed
`pnpm run app:test` 189/189, `pnpm run typecheck`, `pnpm run lint` and
`pnpm run app:smoke`; none of these checks is release runtime evidence.

Remaining Phase 2A gaps include finite frozen compositor input for generation,
worker-generated previews, generation staging recovery, clean `Rebuild Preview`,
the installable Linux/NVIDIA runtime needed for PNG/JPEG/WebP import in a
packaged application.
Layer add/delete/rename, undo and production raster editing also remain open;
the current Raster controls do not complete the wider layer-stack contract.
The final `lstat`/`unlink` pair for Move cannot atomically exclude a concurrent
external process replacing the selected source path; that concurrency boundary
needs a separate policy before it can be claimed as supported. PP-007 remains
an MVP promise with public readiness pending these boundaries.
