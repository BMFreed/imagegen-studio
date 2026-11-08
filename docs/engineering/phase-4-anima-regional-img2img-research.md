# Anima regional opaque img2img

## Source and scope

Starts at clean `30036d7a14b89deb55629c291f889b7c3a99e3e9`. Current local Invoke
is `b0ac163b139c432aff4c51078c31c074bf292f72`. Consulted
`app/invocations/vae/anima_image_to_latents.py`,
`app/invocations/anima/anima_denoise.py`, `backend/anima/scheduler_driver.py`,
`backend/anima/regional_prompting.py` and the Canvas graph/compiler callers.
Its graph first attaches source-image VAE latents, then independent regional
contexts to the same denoiser. Opaque img2img needs no inpaint keep mask or new loop.

Adapt the existing ordinary Anima image owner: one verified opaque RGB source,
Wan posterior sampling, `(latent−mean)/std`, captured clipped schedule and
`initialSigma*noise + (1−initialSigma)*source`. Keep the accepted ordinary
selected-native initialSigma/LCM-grid corrections documented in the
[flow contract](./phase-2c-anima-flow-sampling-research.md); Invoke itself records
its preblend/native-sigma mismatch. Preserve the frozen independent CPU posterior
stream `seed ^ 0x9E3779B9`. This introduces no numerical policy or VAE replacement.

## Finite contract and owners

Add opaque Current Canvas IMG to the existing public regional Anima owner, with
the separate `anima-regional-img2img-v1` capability. Non-Euler additionally requires
the existing regional sampling capability. Keep TXT/default meanings exact.
The existing transport envelope/operation is reusable; the ordinary request
already distinguishes exact TXT/IMG commands. Outpaint subclasses refuse.

The durable queue needs a distinct `anima-regional-img2img` operation/kind and
additive CHECK migration0025. Reuse the existing files-first transaction, ordinary
image frozen parser, source PNG, regional sidecars, receipt, cancellation, Retry
and ordinary provenance projection. Never relabel an old TXT payload or infer mode
from the later draft. Migration preserves every prior row, frozen byte string,
receipt and FK relationship.

Keep all existing limits: one static item; original Anima; Auto embedded VAE;
64–512 sides divisible by eight; translated bbox agreement; steps1–200, CFG1–30,
zero rescale; three regions and existing text/token/mask bounds; target32MiB,
frozen JSON128KiB and regional metadata1MiB. No active TI/LoRA, references,
spatial negative, batch, mixed-alpha, inpaint or OUT extension. Output remains RGB.

Strength is the ordinary strict finite range0–1, captured rather than defaulted.
Zero performs VAE encode/posterior/decode with no native conditioning, transformer,
solver, initial-noise draw or progress event; it is not source-pixel identity.
Strength1 still verifies/encodes source, while sigma1 removes its denoise influence.
Heun20/.5 has start10, begin20 and 19 native evaluations. Keep those native counts,
including both corrector halves, rather than substituting authored20.

## Risks and acceptance

Material risks: dropped source or wrong blend/posterior; bypassed regional predictor;
mode/class/alpha confusion; stale source/schedule during Retry; queue operation or
receipt misclassification; source Raster mutation; partial publication or migration.

Lower native tests cover all six methods, zero/full/interior strength, odd/translated
geometry, independent source posterior/normalization/noise/native solver witnesses,
zero-region ordinary equivalence, strength1 TXT control and restoration/recovery.
Invalid mode, source hash/size/alpha/bbox and missing capabilities must refuse before
the relevant work. Existing TXT/Euler/frozen bytes remain controls.

Installed acceptance reuses the canonical runtime/catalog and preceding owned PNG,
with no model/environment copy: healthy Heun20/.5 Generate, progress-observed Cancel,
saved/restarted frozen Retry after strength1/Euler/seed/model/text/mask edits and
hiding the source Raster. Retry must consume the old opaque PNG and complete input,
producing exact healthy-control RGB despite the now-transparent current target.
Real Results Add1→2/Undo1/Redo2/Save/reopen preserves the source Raster and accepted
ordinary Anima-img2img provenance. This does not qualify the separate Import UI.

Use serial600-second units, zero swap and the existing aggregate12GiB envelope
(installed launcher2GiB plus native10GiB); no capacity/headroom claim or CUDA
allocator-fraction inference. Native source-init and frozen/mode ownership mutations
need targeted semantic RED, unaffected control GREEN and exact restoration.
Source review, retained evidence and fresh ROOT physical exit/dependency/readers
gates precede disposable cleanup and commit/push.

## Evidence

ROOT executed **1,550 Main, 413 Python and 200 browser PASS**. The 50 new Main
cases include actual public admission/frozen Retry and migration; Python is
73 new small-native CPU/CUDA plus 340 neighbors, with 138 warnings. Browser is
199 unchanged passing cases plus the corrected focused case from the initial
full 200 run. Final `pnpm run typecheck`, configured Python strict typing,
production build, scoped ESLint/Ruff and diff checks pass. Type-only Python
corrections retain the normalized semantic AST; the current bytes also run in
mutation qualification. A new test file alone was not counted as execution.

Two defects in verification were separated from the production fix. The first
Main run had six image-Retry failures: ordinary reverification still projected
`anima-txt2img`. It now projects the matching frozen kind; focused40 and full1550
pass. Two database assertions needed migration count24→25. The initial browser
run had one obsolete TXT-only expectation; its replacement checks required IMG
strength/capability and mixed-alpha refusal. Initial strict typing39 diagnostics
are excluded and corrected with annotations/casts, without changing assertions.

### Real installed owner

The canonical worker0.14 environment/catalog is refreshed and advertises the
separate image capability. No environment or model copy/download is used.
The complete installed `installed-r2` run passes in **390.39 seconds**, with three
real requests: healthy Heun20/.5, progress-observed Cancel, saved/restarted explicit
frozen Retry. Raw progress lengths are **19 / 1 / 19**, successful completions
**1 / 0 / 1**. Retry consumes the old opaque target, exact strength/posterior/native
arrays and regional input after saved strength1/Euler/seed999/model-null/text/mask
edits and source hiding. Its independently decoded RGB equals the healthy control
exactly. Both outputs are RGB with the pinned ICC.

Real Add/Undo/Redo gives Raster counts **1→2→1→2**; explicit Save/reopen retains two
Rasters. The original source member/asset/transform and edited visibility remain
exact; the new Raster contains the actual accepted output. Provenance is ordinary
`anima-img2img`, retaining strength/method/resources while excluding regional
material from Compare and result-derived presets. Source setup uses ProjectSession,
not the Import UI. ROOT opened actual Queue/Results/edited/reopened screenshots;
no blocking clipping or covered actions were found in those states. This is no
full keyboard/viewport audit or new trained visual-quality acceptance.

The first installed attempt is retained as **failed**, not promoted. Its first
request published; the second naturally completed while the harness captured
progress and inspected wire before clicking Cancel. R5 clicks the real UI Cancel
immediately after numerical progress and performs expensive capture/checks later.
All cancellation, no-completion, Retry and PNG assertions remain. The failed
attempt's delayed close required owned SIGKILL with confirmed physical exit;
fresh idle proof precedes the successful retry. Its two requests are diagnostic,
separate from the accepted three-request run.

The real migration crosses24→25. Immutable pre/post SQLite snapshots have clean
integrity/FKs; all24 old migration hashes and old rows/frozen strings survive.
Only the existing Home `project_index.indexed_at` refresh field is excluded.
New operational rows belong only to the two authored native projects.

The installed envelope is serial2GiB launcher plus10GiB native, zero swap,
600 seconds for the whole run. Measured launcher peak is970,055,680 B; highest
native-group peak is9,540,489,216 B. These separate cgroup observations establish
neither simultaneous peak nor capacity/headroom, VRAM peak or an allocator fraction.
All six methods have small-native/Main evidence here; trained installed acceptance
uses **Heun only**. Failure tests cover early encode entry, corrector, progress,
decode and publication/recovery; no partial-inside-encode fault is claimed.

### Mutation, source review and retained closure

Nine isolated bounded phases execute18 selected tests: **15 GREEN / three semantic
RED**, then exact source restoration. Two Python mutations change only source blend
sigma or posterior seed; the independent clipped-history oracle fails after genuine
native PNG publication, while full-strength IMG/TXT controls stay exact. The Main
mutation projects frozen IMG as TXT and reaches the precise typed Retry parser
failure; the neighboring TXT control stays GREEN. All18 small-native publications
and raw oracles are retained. No setup/OOM/timeout is accepted as semantic RED.

Independent source review is CLEAN for R3; a narrow CLEAN R5 recheck covers only
the corrected browser test and immediate UI Cancel. Source-only review does not
certify ROOT runtime results. Exact source archives, Main/worker protocol,
original PNGs/screenshots, SQLite snapshots, final IGS, invocation pins and every
mutation/control/restoration witness are retained under
`runs/anima-regional-img2img/20261108-opaque-flow` in the artifact root.

ROOT verifies **8,044 retained payload entries**:6,873 regular files,1,081 directories,
90 symlinks without following them. After fresh physical exit for30 registered
units and both native lifetimes, byte restoration, six ended readers and273
lifecycle checks, exactly three disposable owners are removed. The deletion-only
interval reclaims **322,498,560 allocated bytes**. One dead zero-byte Chromium
socket is separately inventoried and removed only after endpoint/physical-exit
proof. Canonical runtime/catalog, both native projects, preceding dependencies,
external original models and repository source remain protected. Retired source
copies are available through the archive mapping; historical raw paths stay
historical. Current runtime continues to depend on this refresh report and its
predecessor ancestry. Final retained-data review is separate from ROOT physical
release and executed checks.

Full-scene/human acceptance and PP-001/005/007/008 **«Пока не обещать»** remain.
No mixed-alpha/OUT, Smart/batch, resources, spatial-negative or new-default
qualification follows; old frozen TXT/ordinary jobs retain their meanings.
