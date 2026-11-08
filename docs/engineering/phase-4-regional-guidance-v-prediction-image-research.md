# NoobAI V-prediction — source-conditioned Regional Guidance

Base `3d585d47937a95bc41d2bd9b29952a96c00dac24`. This high-risk slice connects the
existing V objective to opaque IMG and mixed-alpha OUT with Euler/Normal. The
source PNG, raw alpha, strength, selected VAE, exact checkpoint/policy and regional
sidecars remain owned by the existing frozen job. There is no new prediction
formula, sampler, source encoder, diffusion loop, command/version, queue kind,
wire field, migration or persistence format.

## Current Invoke source and adaptation

Clean InvokeAI `b0ac163b139c432aff4c51078c31c074bf292f72`:

- `invokeai/app/invocations/sd/denoise_latents.py::get_scheduler` passes the UNet's
  objective to the selected native scheduler; `init_scheduler` owns image cutoff.
- `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
  grafts selected-VAE image encoding for IMG and infill/mask/compositing for OUT,
  before `addRegionalGuidance.ts` connects masked conditioning to that denoiser.
- `invokeai/app/invocations/vae/image_to_latents.py` owns image encode/scaling;
  `invokeai/backend/stable_diffusion/diffusion_backend.py` and
  `extensions/inpaint.py` own source noising and keep-mask protection.

Studio already adapts those mechanisms for epsilon IMG/OUT. This extension reuses
the native scheduler selector, source posterior/timestep window, prepared VAE,
LaMa/keep-mask restoration, regional attention and existing RGB/RGBA publisher.
Existing documented numerical adaptations remain; this is not a new claim of
complete Invoke pixel parity.

## Admission and compatibility

The additive `illustrious-regional-v-prediction-image-v1` capability requires the
prior V capability and existing image prerequisites; OUT and selected VAE retain
their separate prerequisites. The old V capability continues to grant TXT Euler
only. Explicit V IMG/OUT CPU, CUDA FP16 and prepared-VAE profiles preserve old
epsilon/private/TXT profile meanings. Worker version remains 0.14.0.

Main's actual exact-file objective and explicit noise policy are authoritative,
including both stale saved-label directions. Renderer hints remain advisory.
The new combination is checked after ordinary preparation and again before the
actual worker handoff; frozen Retry follows its saved operation/objective/source
and strength rather than current authoring. Refusal must publish no new queue
files, candidates, receipts or seed effects.

Only Euler/Normal is admitted. V ancestral/DPM, independent TXT initialization,
Smart and regional references remain outside this slice. Existing resource,
geometry, row, mask, strength and VAE limits remain. Completion remains temporary
until explicit Add; ordinary accepted provenance continues to exclude regional
guidance from Compare and result-derived presets.

## Finite parameters and acceptance

The installed fixture reuses the original Cyberfalafel V v1.2 derivative:
SHA-256 `edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d`,
6,938,040,794 bytes, Civitai model1147756/version2679856/file2566634,
creator Knightus_Ai. Its actual exact-file library setting is V; objective and
noise policy remain independent. The original file is not copied or downloaded.
This mechanics fixture does not replace the user's official Illustrious v0.1
visual-acceptance target.

Fixed installed selections: 512², Euler30/Normal, CFG5, seed123, strength0.5,
Embedded FP32, no TI/LoRA or initializer. Each mode has an independent healthy
control, a progress-observed Cancel followed by saved source/strength/model/text/
mask/seed edits, and a restarted selected frozen Retry. Require exact own RGB
replay for IMG and RGBA contribution replay for OUT, then explicit Add/history/
Save/reopen. Preserve the source Raster; independently check OUT alpha and visible
source-over composition. These selections are qualification inputs, not defaults.

Reuse the single compatible runtime/catalog. Native units retain the existing
12 GiB aggregate host, zero-swap, 600-second envelope and CUDA allocation policy.
Small tests use separate bounded units. These are operational guards, not capacity
or quality claims; no offload, model/environment copy or ceiling increase is implicit.

Lower native checks must observe original V scheduler consumption and source
encode/posterior/window, ordinary controls, strengths0/1, explicit policies,
prepared-FP32 ordering, refusal and failure restoration/fresh calls. Isolated
mutations remove the post-resolution image capability guard or substitute EPS
only after valid fresh V scheduler admission; neighboring V TXT/EPS image controls
and exact source restoration are required.

## Execution and evidence

ROOT lower qualification: 1,694 distinct Main cases, 419 distinct Python cases
(367 warnings) and 216 browser cases. Full TS/Vue and strict Python typing,
scoped ESLint, Ruff/format, unchanged high-level signatures and app build pass;
the existing Vite large-chunk notice remains. The new native module contributes
81 cases; actual original V/EPS transitions are checked after PNG publication.
Six-policy breadth is CPU IMG/OUT; CUDA separately covers objective, endpoints,
ordinary controls and prepared FP16/FP32 VAE. Tiny LaMa is a labelled collaborator;
this alone does not qualify trained outpaint.

The broad Main run first has 1,692 PASS/two new oracle failures. Both incorrectly
require the client's private staged target path to equal the frozen source path.
The corrected containing file has 70 PASS and verifies owned staging identity,
all target metadata, exact transferred bytes and cleanup. Its two corrected cases
complete the 1,694-case distinct union; the other 68 are not counted twice.
The first native run has 36 PASS/one fixture-helper filework tripwire failure;
the corrected test enters the real frontend directly, with preservation checks
outside the tripwire, and all 81 cases pass. A single optional-type diagnostic is
fixed with an `Any` annotation whose erased AST matches the author source. These
failed diagnostics remain retained and excluded from successful-run claims.

Two isolated mutations produce 33 selections: 27 GREEN/six semantic RED. Removing
only the post-resolution image-combination guard fails both Main image-refusal
cases while V TXT remains GREEN. Substituting EPS after valid fresh V image
scheduler admission fails four CPU/CUDA IMG/OUT native-transition assertions after
publication, while all four EPS-image controls remain GREEN. Exact restoration
returns GREEN and all 1,581 qualification source files match; the live source is
unchanged. These are small native/Main mutations, not installed-worker mutations.

Independent core R2 and installed-harness source-only reviews are CLEAN. They do
not independently rerun ROOT results. All 20 reviewed core/test pins remain exact.
The harness then receives one schema-oracle correction: compare the complete
actual/frozen checkpoint descriptor rather than a nonexistent wire `byteSize`.
The original checkpoint file's actual size and full SHA checks remain. The first
installed IMG attempt completes one real V request, one PNG and 16 native steps
before that assertion fails. Its failed report, owned emergency SIGKILL/physical
closure and fresh idle proof remain excluded; no failed operation is relabelled
PASS. Its healthy PNG exactly matches the subsequent healthy control. The final
harness assertion is separately checked against the real frozen/wire schema.

## Installed acceptance and retained boundary

Both complete installed modes pass: six qualified V requests/four PNGs, six
normal native closures and 26 harness checks. The IMG unit takes 396.694 seconds;
OUT takes 414.099 seconds, each within its unchanged 600-second envelope. There is
one additional excluded IMG setup attempt/request/PNG, described above. Thus raw
execution totals are seven requests/five PNGs, not six/four with the failed attempt
silently omitted.

Each mode observes native progress 16/9/16 with two completion frames. Main/UI
observations at5/16 and6/16 precede Cancel; this is not cancellation exactly on
step5. The selected Main-leading window is496,463,…,1 (16 evaluations for the
fixed30-step/strength0.5 input). Canceled requests return no completion. After
source hiding, strength0.8, model clear, text/mask/seed edits and restart, the
selected frozen Retry preserves the original source, strength0.5, V objective,
explicit false-ZTSNR/leading policy and EmbeddedFP32. Its PNG is byte- and
independently decoded-RGBA-exact with its own healthy control.

Actual Results preview, explicit Add/Undo/Redo/Save/reopen retain the original
hidden Raster and accepted result. IMG publishes RGB; OUT publishes an RGBA
contribution without pasting the source. Independent OUT readback verifies107,008
protected pixels,65,536 authored protected-interior pixels,147,456 generated and
7,680 soft pixels, plus exact protected-source/reference-composite checks. Visible
Canvas validation samples a3×3 grid: alpha is exact and RGB differs by at most
one channel level; full Canvas byte equality is not established. Ordinary V image/
outpaint provenance retains Regional Guidance exclusions. Prior SQL rows,
packages, history/candidate bytes, original model identity/full SHA and the
installed worker/config/current report are preserved.

ROOT views actual1440×900 Project/Queue/Results/reopen screenshots using ui-audit;
no material local clipping/action finding is observed. Actual UI interaction is
qualified by the installed harness, separately from screenshot inspection. This
is not visual-quality, general UI/accessibility or all-viewport certification.

Frozen source, lower and mutation reports, full installed reports/PNGs, nine final
IGS copies, closed before/after SQLite and raw owned payload bytes are retained in
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-v-prediction-image/20261109-euler-source`.
The first failed report keeps its failure/SIGKILL history. The canonical reusable
runtime/catalog/projects, original external files, frozen inputs and current
worker-refresh report plus ancestry remain protected. Verified retention precedes
release of the exact idle owned payloads; actual physical-exit/dependency/release
measurements belong to that run's lifecycle and release records. Independent
source/retained-data review does not rerun ROOT native outcomes or certify physical
release, capacity, quality or public readiness.
PP-001/005/007/008 remain «Пока не обещать»; visual quality, other V methods,
Anima/Smart/reference scope and general release readiness remain separate.
