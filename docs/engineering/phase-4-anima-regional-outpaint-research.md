# Anima regional mixed-alpha outpaint

Base: clean `53dbc211b64f3c12dd205896cae9f4101e1db897`. Risk is high for
source protection, frozen resource/alpha ownership, queue migration, contribution
publication and accepted project state. This extends the bounded original-Anima
Current Canvas owner; it is not a new sampling/composition policy or quality gate.

## Current Invoke and reused owners

Current local InvokeAI is `b0ac163b139c432aff4c51078c31c074bf292f72`.
Consulted `app/invocations/anima/anima_denoise.py`,
`app/invocations/vae/anima_image_to_latents.py`, `backend/anima/scheduler_driver.py`,
`backend/anima/regional_prompting.py`,
`backend/rectified_flow/rectified_flow_inpaint_extension.py`,
`app/invocations/{infill.py,sd/create_gradient_mask.py}` and
`frontend/webv2/src/features/generation/core/canvas/{compileCanvasGraph,addRegionalGuidance}.ts`.
The Canvas compiler grafts source infill/encode/denoise mask first, then independent
regional conditioning. Keep protection is not intersected with regional text masks.

Reuse Studio's ordinary `prepare_worker_outpaint`, `generate_anima_outpaint`,
`create_outpaint_contribution` and unchanged shared executor. The only numerical
seam is an optional trusted `prediction_factory` forwarded to the executor beside
the existing latent transform. The default ordinary helper retains its meaning.
Worker preparation occurs once before loading family models, passing an owned
private tuple as in the existing Illustrious regional worker. Direct private
callers use the same preparer; the private tuple is not a public override or
authentication boundary against arbitrary Python code.

## Finite invariants

- Source is actual single-frame pinned-sRGB mixed-alpha RGBA, hash/size/dimensions
  and raw-alpha identity bound to the ordinary OUT command. Transparent/opaque
  OUT commands refuse; TXT and opaque IMG remain separate exact command classes.
- Keep the existing fixed policy: Gaussian weighted-max, edge16, fade16,
  minimumDenoise0, contribution output and exact205,669,692-byte LaMa.
- Original Anima, Auto embedded VAE, one static item,64–512 sides divisible8,
  steps1–200, CFG1–30, strength0–1 and zero rescale. Six existing methods use their
  frozen selected arrays/RNG. No batch/resources/references/spatial-negative/Smart
  extension, explicit painted inpaint mask or optional inpaint adapter.
- Keep255 protects source;0 generates. The ordinary owner derives latent keep
  through bilinear/8 and coherence. `G=1-keep.float()/255` precedes model-dtype cast.
- Restore only after completed user steps: linear time `t=s/(3-2s)`, threshold
  `G>=t+1e-4`, protected trajectory `noise*s+(1-s)*original`, then ordinary merge
  operation ordering. Heun20/.5 has19 native evaluations but10 completed steps;
  predictor halves do not restore. Terminal zero restores before VAE decode.
- Strength0 still infills/encodes/samples posterior/decodes and applies output
  alpha, with no conditioning/native step/noise/progress. Strength1 OUT still
  protects source; it is not equivalent to TXT.
- Publish generated RGB with `alpha=255-output_keep_mask` as an RGBA contribution,
  never paste source into that contribution. Main's existing independent validator
  and immutable ordinary `anima-outpaint` provenance remain authoritative.

## Public ownership

Add `anima-regional-outpaint-v1`, requiring existing regional IMG and ordinary OUT
prerequisites; non-Euler independently requires the sampling capability. Preserve
the same transport/schema/composition and previous capabilities' meanings.
Use a distinct `anima-regional-outpaint` queue/frozen kind and additive migration26.
Reuse the ordinary OUT parser/preparer/reverifier and operational infill identity;
do not cast OUT through IMG batch preparation. Capture exact target/raw alpha,
policy, infill resource, sampling/strength, seed and regional sidecars. NEW follows
actual composed pixels. Retry/dispatch follow frozen input after current draft
and target edits, including repeated resource verification after async boundaries.
Preserve all25 old migration hashes, old rows/frozen bytes, receipts and FKs.

## Acceptance and failure plan

Native CPU/CUDA fixtures exercise all six methods and interior/zero/full strength,
with independent source posterior/noise/selected-schedule and current Invoke mask
oracles. Observe actual regional contexts independently from keep-mask restoration,
completed-step semantics and reopened RGBA. Empty-region OUT must equal ordinary
OUT; unchanged TXT and opaque IMG provide adjacent controls. Tiny fixtures may
replace only the neural LaMa, explicitly excluding trained infill qualification.
Target/raw-alpha/infill/policy/class/geometry mismatches refuse before relevant
loading. Failures during setup/encoding/corrector/progress/decode/publication
preserve state/RNG/ownership and allow a fresh successful call.

Actual installed acceptance reuses the canonical environment/catalog/models and
verified local LaMa. An exact preceding accepted512 RGB PNG becomes a Raster at
bbox+(128,128), scale1, without pixel editing/resampling. Main's own compositor
produces transparent top/left borders; both fixed regional halves intersect them.
Healthy Heun20/.5, immediate progress-driven Cancel, saved/restarted frozen Retry
must yield19/partial/19 evaluations, no canceled completion, and exact replay RGBA.
Real Add1→2/Undo1/Redo2/Save/reopen preserves source member/state and the accepted
contribution plus ordinary-only provenance. This does not qualify Import UI.

Mutation removes only the regional route's latent restoration; the independent
protected-history assertion must turn RED after genuine RGBA publication, with
ordinary OUT or opaque IMG GREEN. Output-alpha and frozen-mode/LaMa controls must
be discriminating. Restore exact owned source before subsequent qualification.

Use serial600-second units, zero swap, aggregate12GiB host (installed launcher2
plus native10). No model/environment copies, silent policy change, fallback,
capacity/VRAM/quality promise. Read source and inspect retained evidence separately
from execution; physical-exit/restoration/dependency/readers gates and byte-complete
retention precede disposable cleanup and authorized commit/push.

## Executed evidence and limits

ROOT qualified this dirty change against `53dbc211` using the actual entry points.
The evidence set is
`~/.codex/artifacts/imagegen-studio/runs/anima-regional-outpaint/20261108-mixed-alpha-flow`.
Authored source, independent source review, ROOT execution, retained-data review
and physical release remain distinct evidence levels.

### Lower checks

- **641 distinct Python PASS /225 warnings**:75 new native OUT cases,413 regional
  neighbors and153 ordinary OUT/PIL/worker neighbors. CPU/CUDA fixtures cover the
  six methods, source protection, no-resource/zero-strength/default controls,
  contribution alpha, refusals and recoverable failures. Tiny tests replace only
  neural LaMa with a named deterministic collaborator; trained LaMa is exercised
  separately by installed acceptance.
- **1,580 distinct Main PASS**: full R6 set1,579, then eight shared queue wire cases
  after the R7 correction, seven overlapping. No final whole-suite rerun is claimed.
  Frozen OUT Retry and six-method native-plan ownership are tested through actual
  Main preparation, staging and parsers.
- **200 distinct browser PASS**:199 unchanged full-run cases plus the corrected
  ordinary-OUT prerequisite fixture. The intermediate missing prerequisite and
  ambiguous diagnostic locator remain excluded failures.
- Final `pnpm run typecheck`, configured full Python typing, fresh application
  build, changed-file ESLint and Ruff check/format pass. Whole-repository lint was
  not rerun: the preceding checkpoint records two unchanged `.mts` files outside
  ESLint's project service. Those files and the recorded lint/TS config pins match
  current bytes; this is not a whole-lint PASS.

Source-only typing casts preserve runtime expressions/assertions. The new native
publication oracle records actual PNG and alpha observations before asserting
its independent expected alpha; all assertion ASTs remain intact. Two ordinary
Python oracle files update only obsolete Invoke paths/hashes to current source.
The final R7→R8 delta moves one test-object property for lint; deleting that exact
line yields identical complete files. Production and assertions remain exact.

### Actual installed Current Canvas

The canonical installed worker0.14, catalog, original Anima/Qwen/Wan files and
exact verified local LaMa are reused without model/environment copies or ML
substitution. `installed-r4` passes in334.839 seconds, including two Electron
lifetimes and exactly **three real requests**. Frames are **19/2/19** native
progress evaluations: healthy completion, Cancel observed at step1 with one
additional in-flight frame and no completion, then frozen Queue Retry completion.
Two completed RGBA outputs are exact, including alpha. Their historical Euler
source is contextual only, not an expected Heun output.

The real UI edits and saves strength1/Euler/seed999, texts, masks, model selection
and source visibility, then restarts. Explicit Queue Retry still consumes the
original mixed-alpha source/raw alpha, fixed infill policy/resource, Heun20/.5,
seed123 and regional sidecars. NEW readiness follows the changed draft separately.

ROOT shows the original source again through the real UI before Add. Results
Add1→2, Undo2→1, Redo1→2 and explicit Save/reopen preserve both Rasters, original
source member/transform and exact accepted RGBA. Accepted provenance is ordinary
`anima-outpaint`, excluding operational regional/infill fields. No implicit Save,
source replacement, retargeting or Import UI qualification follows.

An independent source-over oracle checks the **640×640 union**, not just the512
contribution:233,713 protected,114,688 source-only,132,544 generated,10,575 soft and
32,768 transparent pixels are accounted for. These categories include overlapping
protected/source-only counts; they are not a disjoint total. Alpha, protected
source, source-only/generated RGB and final RGBA are exact. Observed soft-RGB error
is0 under the existing1-unit rounding bound. Source-over protection does not mean
the VAE independently reproduces every original source RGB value.

ROOT opened all eight final screenshots under `ui-audit`, including actual Queue
Manager, cancellation, edited draft, frozen Retry, contribution preview and
reopened accepted state. No material local clipping or covered action was found.
This bounded self-review is not a full keyboard/viewport/a11y or visual-quality
acceptance.

The actual DB crosses25→26. Immutable closed pre/post snapshots have clean
integrity/FKs; all25 old migration hashes,88 old queue rows and old frozen strings
survive. Only Home's existing `project_index.indexed_at` refresh timestamp is
excluded. New operational rows belong solely to the three authored native
projects, including the two failed diagnostic attempts.

Serial installed bounds are2GiB launcher plus10GiB native, zero swap and600 seconds
for the whole run. Measured launcher peak is1,224,986,624 B and highest observed
native-group peak9,734,848,512 B. These are separate cgroup observations, not a
simultaneous peak, capacity/headroom, CUDA allocator-fraction or VRAM guarantee.
All six methods have lower native/Main evidence; this trained installed acceptance
uses **Heun only**, one geometry and strength0.5.

### Discovered consumer defects and excluded attempts

The first launcher attempt lacked ROOT's scratch parent and refused before app,
SQL or ML startup. The next actual native request completed19 evaluations, but the
shared result reader still expected RGB for Anima OUT; queue completion failed
without an accepted candidate. Two exact existing-reader conditions now admit
Anima OUT through the existing RGBA/contribution validator. Anima RED versus
Illustrious GREEN, then both GREEN and wrong-alpha refusal are retained.

The following installed attempt admitted healthy RGBA, but Queue Manager could not
read history: its shared operation/strength cross-check omitted regional Anima
OUT. The second request completed without a delivered Cancel. One operation clause
fixes the actual strict wire guard. A valid frozen-strength regression is RED
before the fix, then all eight wire tests pass; TXT/wrong-family/missing-strength
refusals remain. This was a production consumer defect, not a Cancel timing race.
Both failed attempts remain diagnostics, excluded from installed acceptance.

R1 source review was CLEAN within its scope before these actual consumer failures.
Narrow R6 result-reader and R7 queue correction reviews are separately CLEAN and
READFINISHED. None independently reruns or certifies ROOT's native observations.
Early type/TDZ/internal-profile/fixture/oracle-pin failures and their exact fixes
remain in `excluded-attempts.json`; successful reruns do not erase them.

### Semantic mutations and retained closure

Nine bounded isolated phases execute **18 selections:15 GREEN /three semantic
RED**, with12 actual small-native PNGs. Removing only regional latent restoration
breaks the independent protected-history oracle and changes target RGB, preserving
its alpha and opaque IMG control. Replacing contribution alpha with full opacity
breaks alpha while native predictions/RGB remain exact. Projecting frozen OUT as
IMG reaches the precise typed Retry parser refusal; neighboring IMG stays GREEN.
Every source is restored byte-for-byte and controls/restored outputs are exact.
Setup/import/OOM/timeout failures do not count as semantic RED. An initial driver
freeze-name mismatch refused before mutations; only two pinned filename literals
were corrected, with original driver and hash bridge retained.

All source archives, current Invoke pins, raw worker observations, failed attempts,
original PNGs/screenshots, closed SQLite snapshots, final IGS and mutation
witnesses are retained. The exact disposable archive has **9,369 entries**:
7,729 regular files,1,514 directories,125 symlinks and one unopened FIFO refusal
fixture, with no symlink traversal. ROOT
verifies all bytes and restores the complete1,569-file mutation source. Current
reusable runtime continues to depend on this refresh report and prior ancestry.

Before disposal ROOT confirms55 registered units, all actual native lifetimes,
byte restoration, six ended authors/reviewers and274 lifecycle incoming checks.
One dead zero-byte Chromium socket is separately inventoried and unlinked only
after endpoint/physical-exit proof. Exactly three owned disposable trees are then
removed; **measured deletion-only root reduction is365,821,952 allocated bytes**.
Candidate inode allocations sum365,826,048 B: the one4KiB difference is recorded,
not attributed or rounded into false equality. ROOT's overstrict post-measurement
assertion failed after successful disposal; no repeat deletion or fabricated
measurement occurs. Canonical runtime/catalog/projects, original external models,
retained dependencies and source remain protected. Historical raw payload paths
are reconstructed using the retained archive mapping. Final retained-data review
is separate from ROOT physical release and executed checks.

Full-scene/human acceptance and PP-001/005/007/008 **«Пока не обещать»** remain.
This does not add Smart/batch, active resources/references, spatial negatives,
painted inpaint or new composition/sampling defaults. Old frozen TXT/IMG and
ordinary OUT jobs retain their meanings.
