# Phase 2A: `.igs` storage research and first implementation slice

Scope: [PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю),
[storage](../specs/03-data-storage.md) and
[document lifecycle](../features/project/document-lifecycle.md). This is a
high-risk data boundary. The first slice defines an executable v1 format and
tests Save→reopen and standalone autosave/recovery through real files; it does
not complete the production Project UI, generation staging recovery, compositor
or Linux/NVIDIA Python runtime.

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
original ICC verification. The renderer file picker, pending-asset ownership,
autosave handoff, visual parity and export remain unverified.

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
