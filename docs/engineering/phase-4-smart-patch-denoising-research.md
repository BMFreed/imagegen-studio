# Smart Patch private family VAE and denoising

## Prospective scope and risk

Base: `bc10b97139dacd84aab1e242b3fc1672ac3d1015`, clean `master`.
Supporting promises: [PP-007/008](../product-promises.md),
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[compositing](../features/project/generate-mode/smart-patch-compositing.md).
Previous boundary: [model-source/LaMa](./phase-4-smart-patch-model-source-research.md).

This slice adds private numerical family adapters for already-prepared RGB and
numeric latent KEEP images. It executes real VAE/native denoising with caller-owned
loaded models. It does not add an IPC command, capability, resource loader,
download, public Generate, queue, publication, world compositing or acceptance.
No `.igs`, history, recovery, provenance, preset, Compare or UI schema changes.

Risk is high at the inference-input boundary: an inverted/substituted mask or
ordinary-generation fallback would regenerate protected material. Finite errors,
callback cancellation and request-local hook cleanup must remain observable.
There is no storage mutation or deployed runtime update in this slice.

## Confirmed data flow and decisions before implementation

The previous Main capture supplies `modelSource` and six separate numeric planes
under one drained lease. This slice consumes detached decoded images; it does not
claim that public Main/queue can already invoke it. File identity verification and
resource/model loading remain their existing owners and the future worker bridge.

| Frozen world mode | Source               | Native route        | Latent KEEP                  |
| ----------------- | -------------------- | ------------------- | ---------------------------- |
| TXT               | None                 | ordinary TXT        | zero, unused by native TXT   |
| IMG               | prepared RGB         | ordinary IMG        | zero, unused by native IMG   |
| INP               | prepared RGB         | existing masked IMG | exact prepared numeric plane |
| OUT               | already-infilled RGB | existing masked IMG | exact prepared numeric plane |

No reclassification from RGB, repeated coherence, LaMa pass, masked-image VAE,
new solver or pixel pasteback is needed. Existing helpers are
`inference.run_sdxl_pipeline`, `sdxl_outpaint.run_sdxl_outpaint_pipeline`,
`anima_flow_sampling.generate_anima_flow_sampling` and
`anima_outpaint.generate_anima_outpaint`. Reusing high-level ordinary generation
commands would incorrectly rerun source classification, fixed normal-OUT masks
and LaMa, so that alternative is rejected.

User decision on 15.10.2026: if reduction erases latent edit coverage (KEEP all255),
**still execute VAE and denoising as Invoke does**, retain the frozen INP/OUT mode,
and never fabricate mask coverage or fall back to TXT/IMG. Fully protected latents
produce a VAE reconstruction; this is not a promise that a vanished tiny edit
receives new denoised detail. Final world contribution remains a separate owner.

Local Invoke HEAD: `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`.
`addInpaint.ts:281-298` and `addOutpaint.ts:270-319` pass source VAE and separate
mask into denoising. `create_gradient_mask.py:179-198` creates masked-image latents
only for specialized inpaint architectures, outside the supported ordinary
four-channel Illustrious/Anima models. Default SDXL uses old AddsMaskGuidance
unless `USE_MODULAR_DENOISE` is enabled (`denoise_latents.py:861-865`): threshold
`>t/N`, final `>0` and original protected latents
(`diffusers_pipeline.py:43-62,425-429`). Anima compares generation coverage with
linear time plus1e-4 while mixing protected source with shifted sigma
(`anima_denoise.py:153-172`, `rectified_flow_inpaint_extension.py:30-39`).
Our current masked helpers already implement these algorithms.

## Parameters, invariants and refusal plan

- Existing processing ceiling: each side8..2048, both /8, at most4,000,000 pixels.
  These are existing CPU/latent admission limits, not trained model capacity.
  Anima's existing captured plan additionally requires each side at least64;
  its plan validator remains authoritative before any native evaluation.
- RGB is internal size; numeric L KEEP is exactly internal size/8, white=keep.
  Source and masks are copied before callbacks can mutate caller objects.
- TXT source is None and strength is None. Image modes require RGB and a finite
  strength0..1. TXT/IMG must not consume nonzero KEEP as an ordinary fallback.
- Native pipeline class and Anima captured plan mode/size must match the route;
  invalid input refuses before VAE/model evaluation. Existing scheduler/seed/
  posterior/LoRA/conditioning and finite-output checks remain authoritative.
- Returned result has RGB at internal size. It is not a candidate or portable
  asset. Exceptions/cancellation return no published image and leave no scoped
  native hooks or mask capture state behind.

## Verification plan

Run serially with swap0 and whole-process deadlines. Existing checkout Python,
Torch/Diffusers/Transformers and small native model fixtures are sufficient;
no weights, runtime copy or GPU/download is planned. Native mechanical checks
use a4GiB cap; style/type checks use bounded appropriate smaller caps.

1. Actual production adapter with real small native family models: TXT/IMG match
   ordinary route; black masked matches IMG; white masked matches strength0 VAE
   reconstruction while nonzero denoising still executes; soft/mixed keeps protect
   source latents and exact replay. Cover all six supported solvers per family
   and Illustrious EPS/V at the existing numerical boundary where proportionate.
2. At least one case per family takes actual CPU protocol preparation/conditioning/
   model-source outputs into the adapter. No execution under test is mocked.
3. Validate malformed mode/geometry/profile/strength/pipeline/Anima plan, detached
   callbacks, cancellation and finite output refusal. Underlying external Invoke
   oracle suites remain regression evidence, not trained full-pixel parity.
4. Isolated executed semantic faults: bypass masked route; invert KEEP polarity;
   ignore prepared model source. Each has a causal RED and one changed-condition
   neighboring GREEN. Preserve exact original hashes; dispose copies after exit.
5. Full worker Ruff/basedpyright and relevant Python regressions. No TypeScript/
   Vue change is planned; no new UI/prototype/native Electron claim is made.

## Executed evidence

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-denoising/20261015-native/`.
`qualification-source.json` records52 actual worker/test source SHA values;
all remain unchanged after execution. `environment.json` records checkout
Python3.12.13, Torch2.7.1, Diffusers0.40.0, Transformers5.5.4 and Pillow12.2.0.
These runs used the existing checkout environment, not the retained installed
worker/catalog. No downloaded/trained weights, environment copy or GPU were used.

| Actual boundary                                                                                  | Result                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pytest tests/test_smart_patch_denoising.py tests/test_smart_patch_denoising_preparation.py -q`  | **72 passed,0 failed/errors/skips**:65 native matrix cases and seven CPU-protocol-to-native cases. `focused.json`/JUnit retain exact command and results.                                              |
| Sixteen affected worker test files, including the same72 new cases                               | **658 distinct tests passed,0 failed/errors/skips**,63.86s pytest time. `regression-command.json` and `python-regression.json`/JUnit retain the exact list and command. This is not730 distinct tests. |
| Full worker `ruff check worker-python` and `basedpyright --project worker-python/pyproject.toml` | PASS; basedpyright0 errors/warnings. Three owned Python files formatted with Ruff before the final checks.                                                                                             |
| Isolated semantic probes                                                                         | Four completed causal RED/neighbor GREEN pairs,one executed test per run,0 errors/skips; original source hashes unchanged and source copies removed after physical exit.                               |

The native matrix exercises all six existing solvers of each family,Illustrious
EPS/V, genuine TXT and ordinary IMG, black/full-generate and white/full-protect
neighbors, mixed/soft INP/OUT, exact replay and protected final latent columns.
White KEEP still invokes actual VAE and UNet/transformer work and reports nonzero
denoising progress; its output equals the same source's strength0 VAE replay.
The scalar/geometry/pipeline/plan refusal cases observe no model evaluation.

The seven integration cases run actual `prepare-smart-patch` →
`condition-smart-patch` → `prepare-smart-patch-model-source` protocol operations.
They then decode those produced PNGs into the private adapter's image inputs.
This is an explicitly test-owned decoded handoff, not a new production transport.
World128→internal64 RGB matches an independent BICUBIC expectation. Soft INP
replay differs from ordinary IMG while all-black KEEP matches it. Alpha1 at one
world pixel disappears from the actual latent mask (all255 KEEP),yet its world
contribution core remains255;both families still encode,denoise and decode without
changing INP mode. Returned RGB/Anima latents equal the strength0 reconstruction,
and differ from a full-generate neighbor. Numerical work uses random small native
models on CPU at64×64/Euler;the wider matrix above remains separate.

Input images and actual prepared PNGs remain unchanged. Callback edits cannot
retarget captured source/mask buffers. A declared progress-callback exception
leaves no request-local native mask state/hooks and a fresh call replays baseline.
Illustrious propagates that RuntimeError;the existing Anima executor wraps it as
`GENERATION_WORKER_FAILED` while preserving its cause. An injected NaN from the
real VAE encoder is rejected before postprocessing,and fresh execution succeeds
after removal of that controlled fault.

### Executed mutations and informed review

`mutation-probe.py` copies the worker source/assets and two new test files into
one disposable mirror at a time. Each process asserts that it imports that mirror,
not the editable original. `mutations-3d3292b1f9.json` records exact changed text,
source SHA,commands,complete JUnit counts and cgroup exits:

| Fault                           | Causal RED                                                                         | GREEN neighbor                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Bypass the masked route         | Fully protected execution becomes ordinary IMG and fails the VAE-replay invariant. | Genuine ordinary TXT remains exact.                                            |
| Invert supplied KEEP            | Black/full-generate no longer equals ordinary IMG.                                 | Genuine ordinary TXT remains exact.                                            |
| Replace prepared RGB with black | Adapter IMG differs from the existing native IMG using the actual supplied source. | Source-free ordinary TXT remains exact.                                        |
| Refuse all255 KEEP              | Actual lost-coverage protocol fixture fails instead of executing native INP.       | Same source/size/profile with surviving soft authored coverage still executes. |

The first three neighboring controls exercise a different valid world-mode route
(TXT,with its required absent source),rather than claiming that only a mask byte
changed. The fourth changes authored coverage while retaining the same source,
INP mode,processing size and profile. No import failure,OOM,collection error or
timeout is counted as semantic RED.

Informed implementation review found no concrete defect in mode routing,mask
polarity,native class/plan admission,buffer ownership,all255 handling or output
topology. Reviewers had implementation context;this was not a blind audit.
The affected existing suites also execute their pinned external Invoke numerical
oracles;no new trained image or full scaled Invoke pixel-parity claim follows.

Initial checks exposed only fixture/static issues:pytest fixture imports needed
explicit aliases;two runtime `isinstance` guards needed object-typed capture
helpers for strict basedpyright;the first integration request mistakenly forwarded
output-only `colorSpace` into a strict source DTO. The next integration run's
single failure expected an unwrapped Anima callback RuntimeError,contrary to its
existing error contract. Those fixtures/assertions were corrected without
altering the existing family executors. The failed reports remain retained.
The final affected run also passed all72 new tests on the final source identities.

### Resource,cleanup and readiness boundary

Native runs and probes were serial,whole-process limited to4GiB/swap0 with180/300s
deadlines and CPU/BLAS threads1. The focused captured group peak was675233792
bytes;the affected run captured970649600 bytes. These are observed cgroup samples,
not family capacity measurements. No ceiling was raised after failure. The609
NumPy/Diffusers/TorchSDE warnings in the affected run remain in its log;no solver
or dependency was changed to hide them.

`cleanup-final.json` confirms physical exit of all recorded groups, no running
owned heavy unit and unchanged original sources. Four pytest payload directories
were removed, reclaiming 9,592,832 allocated bytes; the four mutation mirrors
disposed 14,325,679 logical source-copy bytes (not an allocated-space claim).
Two representative actual CPU input PNG sets remain in `input-samples/` with
hashes. The compact run occupies about 656 KiB; the artifact root remains about
28 GiB with 44 GiB free. The protected historical installed runtime/catalog and
pinned evidence stay intact. No generated model or environment copy is retained.
Final delivery/source metadata is recorded alongside these checks.

PP-007/008 bodies and matrix rows,supporting contracts and roadmap record this
private numerical boundary and the settled all255 decision. Public status remains
unchanged. Next owners are the worker/Main execution bridge with actual resource
admission,world-space output composition and immutable Smart Patch variants.
No public Generate,queue/candidate/acceptance/provenance or release readiness is
claimed by these private CPU checks.
