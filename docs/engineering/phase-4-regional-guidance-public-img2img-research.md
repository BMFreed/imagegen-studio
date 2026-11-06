# Public opaque Regional Guidance img2img

Base: `455549da1e42c850cfe426884c3dc4be5331c0d8`. High risk: alpha-derived
admission, frozen source/strength association, queue migration/Retry, owned-file
worker transport and ordinary accepted provenance. This extends the previously
qualified private image consumer; it adds no image encoder or diffusion loop.

## Current InvokeAI and adaptation

Clean local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:
`frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
grafts image-to-latents into the same denoiser before `addRegionalGuidance.ts`.
SDXL strength maps to denoising_start=1-strength. The existing Studio ordinary
`img2img_pipeline_class` adapts `sd/denoise_latents.py::init_scheduler` training
cutoff and native VAE posterior sampling. Its separate frozen CPU posterior
generator and compute-dtype image-noise draw remain the documented Studio
adaptation, not a new claim of default Invoke numerical parity.

Invoke's `session_queue_default.py::retry_items_by_id` clones the saved root graph
into fresh execution state after validation. Studio adapts that ownership through
its existing detached context, hash-bound target/alpha files, SQLite CAS and
receipt owners. Retry uses the frozen attempt rather than the current Project.
No independent queue, worker command envelope, scheduler or persistence framework
is introduced.

## Finite public mode and bounds

Actual composite alpha selects the mode. Public opaque image work requires the
separate `illustrious-regional-img2img-v1` capability on the qualified0.14 worker;
ordinary image support alone is insufficient. The supported subset is Illustrious
epsilon, Euler/Normal, Embedded/manualFP16 VAE with force_upcastFalse and CFG
Rescale0. Explicit finite strength0..1 is required; no fallback/default is added.
The new image mode forbids TXT initialization. Existing public TXT sampler,
VAE/precision, CFG Rescale, dynamics and resource behavior stay unchanged.

Keep the existing steps1..200, CFG>1..30, one image per item,32-job aggregate,
three regions/four pairs/eight signs, sides8..2048 divisible8 and area<=4M limits.
Source PNG stays<=32MiB, bundle metadata<=1MiB, aggregate alpha<=64MiB and wire
line<=64KiB. Existing text/TI/LoRA/resource/308-row-sign/attention mask budgets
remain unchanged. Bounds are admission limits, not measured capacity or quality.
Partial-alpha modes, selected-VAE encoder, ancestral/DPM image sampling, v-prediction,
Anima and regional references remain outside this slice.

One existing combined capture supplies the exact Raster source and authored
regional inputs. Public preparation uses the general normal-mode owner while
legacy private preparation remains TXT-only. Generate gates IMG after actual
alpha classification and before model verification/queue publication. Frozen
Retry gates before creating a new SQL attempt. Dispatch may claim the existing
attempt before refusing an unsupported peer; it refuses before resource reverify,
numerical transport and new worker scratch. Client checks the capability again
before creating the owned request lease.

Migration0022 adds `illustrious-regional-img2img` to the existing queue operation
constraint through the established transactional table rebuild. No historical
migration is edited. Public IMG and TXT share FIFO/running-slot CAS without
promoting legacy private jobs. The inner ordinary IMG request carries strength;
outer wire and bundle remain schema1. Frozen context, worker request, operation,
actual PNG alpha, seed, bbox and all exact bindings must agree on reload/Retry.

The worker derives mode only from the exact ordinary command discriminator,
loads the same standard borrowed pipeline and calls the previously qualified
private IMG output owner. IMG never enters TXT initialization or prepared-VAE
encoding. Actual selected timesteps determine bounded stable progress; strength0
emits no denoising callbacks and still performs seeded VAE encode/decode. It does
not promise source-pixel identity. TXT still requires its full declared schedule.

Accepted results project to the existing ordinary img2img mode/strength provenance.
Regional operational data remains excluded from provenance, Compare and
result-derived presets. `.igs` schema and visible controls do not change. Existing
explicit Add, Save, Undo, cancellation and publication recovery owners persist.

## Qualification and remaining evidence

Source authors ran static checks only. ROOT owns execution: actual Service
save/reopen/capture, queue/files/migration, controllers, dispatch and receipts
with explicitly controlled catalog/compositor/numerics in lower tests; real
OS-child framing/correlation/progress; private CPU/CUDA numerical neighbors; and
a separate installed official-checkpoint Main-to-worker probe. The native probe
must use real ModelService and real source import/composition; lower substitutes
are not relabelled as native evidence.

The installed probe plans three native requests/four admissions: a healthy IMG,
a matching second pending attempt canceled before dispatch, frozen Retry of that
canceled attempt after saved source/text/strength/region edits, and a separate
strength0 control. Completed receipts are never retried. Native calls must retain
source/strength/wire association, exact original/retry RGB and no fabricated zero
progress. This qualifies a backend Main API path, not a UI interaction or quality
cohort. Installed worker refresh reuses the one canonical runtime/catalog; no
models or environment are copied.

Source review, executed tests, causal mutations, installed runtime evidence and
retained-byte/physical release gates are distinct. Historical visual3 narrow
PASS/1 INCONCLUSIVE remains NOT_QUALIFIED. Human/general quality, release
Install/Repair and PP-001/005/007/008 readiness remain unchanged.

Artifact-relative RUN: `runs/regional-guidance-public-img2img/20261106-opaque-frozen`.
Serial lower units use3GiB/zero swap/600s; native uses aggregate<=12GiB/zero swap/
600s. These are operational envelopes, not universal fit claims. Actual results
and excluded diagnostics are recorded after execution.

## Executed results

ROOT:810 Main PASS in the serial affected matrix, including35 new entry cases,
17 storage cases, one migration preservation case and18 transport/real-child
cases. Separate earlier136/142 passes and diagnostic attempts are not added to
the unique total. Python:200 PASS (115 worker/boundary, including24 new cases,
and85 native CPU/CUDA image neighbors);68 native warnings. Full TypeScript
and strict scoped Python typing, scoped ESLint/Prettier/Ruff and application
build PASS. The existing bundle-size warning remains. No prototype UI changes.

Two isolated source mutations execute15 selected cases:12 GREEN/three semantic
RED. Replacing the specific Generate IMG capability gate with generic worker
qualification permits an invalid admission and fails its preserving-refusal
oracle. Sending IMG dispatch to the TXT owner fails both image cases while the
TXT delegation control stays GREEN. Exact source restoration returns both groups
GREEN and preserves the live workspace. These are admission/owner-routing
mutations, not renewed native pixel-causality experiments. The previously
qualified source/cutoff numerical owner is reused unchanged.

The one canonical worker is refreshed in place with the new explicit capability;
all52 Python modules and65 worker files are verified. Dependencies, configuration
and model files are reused, without an extra environment or model copy. Existing
runtime-manager and release Install/Repair mechanisms are not qualified anew.

The installed backend probe completes in225.359seconds (225.730second bounded
unit). It uses real Project Raster import/normalization and composition, a real
ModelRepository/ModelService with the exact official Illustrious v0.1 file,
public coordinator/actions, queue/dispatch/staging and installed numerical
workers. Runtime availability is a controlled collaborator around those real
workers; this is not runtime-manager lease or UI interaction qualification.

There are four admissions: original A, a matching pending attempt explicitly
canceled before numerical dispatch, its frozen Retry after saved source/text/
region/strength0.8 edits, and a fresh strength0 control. Three actual original
wires produce three completed receipts and PNGs. A/Retry retain the original
source/hash, concrete recipe, seed123,30 requested steps and strength0.5; both
report exactly1..16 and decode to identical RGB. Current saved edits remain
unchanged by Retry. Strength0 uses the original source and settings, has no
fabricated progress and differs from A by11,755 RGB channels. That is strength
sensitivity, not a source-only contrast or source-pixel-identity promise.
All three requests use64x64; no capacity or quality conclusion follows.

No Add/accepted-layer or browser cycle is claimed by this native probe. Lower
real Main/storage cases separately check the ordinary IMG accepted-base/provenance
projection. Earlier visual results, human acceptance, broader image samplers,
selected-VAE encoder, partial alpha, Anima and public promise readiness remain
open. Both independent source reviews and the separate917-line probe source
review are CLEAN within scope, without adopting ROOT execution as independent
runtime certification.

Excluded diagnostics: initial TypeScript union narrowing/one test annotation,
old ready-capability array, migration test46vs51 row-count constant and public
pool fixture mismatch were corrected. The first tsx CLI launch exceeded Unix
socket pathname limits with the long owned TMPDIR; Node's existing `--import tsx`
loader runs the same tests without creating that CLI socket. Source fixture
corrections preserve the intended assertions; no setup failure is semantic RED.

The independent source/document/retained-byte audit is CLEAN within scope. It
verifies all1502 baseline/1508 qualification files,3476 retained entries, own
SQLite/22 migration hashes, three packages, wires, receipts and independently
decoded PNG comparisons. It does not rerun ROOT numerics or certify physical
release, UI, runtime-manager behavior or quality.

Before scratch disposal, ROOT rechecks all21 recorded units for physical exit
and empty observed cgroups, all seven readers for READFINISHED, exact restored
source and global lifecycle references. The verified no-follow archive retains
the full source, own SQLite/package/source/output bytes and causal diagnostics:
`retained-payloads.tar.gz`,12,334,449 bytes, with its complete manifest. Two
legitimate internal hardlink fixture pairs are retained and released with
observed2→1→0 link counts; external symlink targets are never followed.

Only this run's idle `payloads` and `native-payloads` roots are removed. The
deletion-only interval reclaims53,264,384 allocated bytes; root allocation falls
from23,418,724,352 to23,365,459,968 bytes before writing cleanup reports. The
canonical runtime/catalog, configuration, official source file and current
qualification companions remain protected. Lifecycle is `retained` with empty
disposable payloads. These are ROOT release observations, separate from the
read-only audit and without a broader readiness claim.
