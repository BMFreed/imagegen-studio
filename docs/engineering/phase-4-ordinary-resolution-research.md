# Fixed ordinary Illustrious processing-resolution diagnostic

Base `88acee7d0e84c390b5697add124f18fb5f9a343a`. The preceding
[reference utility experiment](./phase-4-regional-reference-utility-research.md)
failed both ordinary512 scene controls. This experiment tests processing size
before attributing the failure to Regional Guidance. It does not introduce a new
sampler, queue, acceptance owner or production default. PP readiness is unchanged.

## Source and preregistration

Fresh clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`prepareCanvasInvocation.ts` → `core/canvas/compileCanvasGraph.ts` →
`core/graph.ts::buildSDGraph`; `app/invocations/text_encoder/compel.py`;
`noise.py::NoiseInvocation` → `latent_noise.py::generate_noise_tensor` and
`sd/denoise_latents.py` consumers. Invoke sizes noise from processing dimensions
and leaves SDXL positive/negative original/target size fields at1024²/crop0.
Studio `protocol.py`, `inference_main.py` → `inference.py::run_sdxl_pipeline`
already preserves that conditioning. Keep it unchanged. Equal seeds at different
sizes do not give an equal spatial noise field: the latent shape changes from
`(1,4,64,64)` to `(1,4,128,128)`. This is a processing-resolution intervention,
not a pixel-matched noise ablation or direct Invoke-versus-Studio comparison.

Medium risk: additive engineering-profile changes in the existing private
Main producer/installed-worker runner, with real Save/reopen/capture. Preserve
the previous reference profile, its exact contract and refusal guards. No
production worker, resource, persistence schema, queue or UI behavior changes.
Private catalog/Project data stay inside the new RUN; SHARED DB is not opened.

Fixed before native output inspection:

- Official Illustrious XLv0.1 SHA256
  `3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`.
- Exactly four requests, in order: seed123/512, seed123/1024, seed124/512,
  seed124/1024. Genuinely authored `regionalGuidance: []`; no references,
  LoRA/TI or source image. Transparent bbox/target and native output dimensions
  change together, at fixed world origin(-13,5); no output resize.
- Euler/Normal30, CFG5, Rescale0, embedded FP16, false-ZTSNR/leading, empty
  global negative. Positive prompt is exactly the previous fixed text:

  > a simple illustration of one cat head, front view, two pointed ears, two eyes, plain light background

- All four originals retained. No prompt/seed/method/precision tuning or extra
  attractive-example retry after viewing. Setup failures remain distinct from
  native failures; neither is a semantic mutation RED.
- Both newly generated512 PNGs must reproduce the previous ordinary PNG bytes.
  A mismatch fails the replay control and prevents a resolution conclusion.
  Previous compact originals are dependencies, not old disposed raw/resume paths.
- Same scene rubric: one recognizable coherent cat head with two ears and two
  eyes, without fragmented/duplicated collage. Blind neutral descriptions precede
  key reveal and ROOT rubric application. Ambiguous images are INCONCLUSIVE.
  A useful1024 outcome requires both seeds to pass, with both512 replay controls
  exact. One favorable image cannot close the gate. Failure at both sizes leaves
  resolution insufficient as the explanation. Agent inspection is not human or
  general model-quality acceptance; no regional/spatial/capacity gate is closed.

RUN: `runs/ordinary-resolution/20261111-fixed-cat`. Reuse the protected installed
worker0.14.0/config/model, no environment/weight copies or downloads. Serial GPU,
one inherited cgroup≤12GiB, zero swap,600s for the four-request phase; checks≤4GiB.
Record host peak separately from VRAM; no unmeasured GPU peak or allocator-fraction
claim. Inventory, progress, source/worker/config fences, physical exits and every
failure remain evidence. Retain/archive/audit before exact idle own-payload cleanup.

## Results

ROOT executes the four fixed requests once: four original PNGs,30 actual native
progress steps each, four normal/physical worker exits, source/installed/config
fences intact. Both512 whole-PNG results exactly reproduce the previous ordinary
controls. No failed setup/native attempt or additional generation is used.

The bounded phase completes in133.035s under600s, peak aggregate host cgroup
memory2911948800 bytes (about2.71GiB), swap0. This is host memory for these four
ordinary cases, not peak VRAM, a general capacity limit or regional capacity.
No allocator fraction is enforced/claimed; the preflight has14177MiB free VRAM.
One existing noneditable0.14.0 worker/config/model is reused without refresh.

All15 model-free guards pass (nine new/eight refusals plus six previous reference
fixture guards), full TS/Vue typing and full lint pass. The only parser exclusion
is the unchanged `qualify-installed-regional-init.mts`; the modified visual `.mts`
is included. Initial lint finds18 style issues across two partitions; scoped
fixes change braces/import/type ordering/numeric separators/remove a redundant
cast, not experiment settings or assertions. Final typing/guards/lint pass on the
fixed source. These are authored fixture guard refusals, not native semantic RED.
Previous reference execution is not rerun: preserving that branch is source
review plus its six model-free guards, not a new runtime reference qualification.
No prototype UI/production worker changes; unchanged browser/Python matrices are
not repeated as evidence for this diagnostic.

## Visual result: NOT_QUALIFIED

A fresh observer, without prompt/key/inherited history, views all four original
PNGs under neutral filenames outside the descriptive RUN path. It describes
subjects/coherence before the key is revealed. ROOT then views every original
and applies the preregistered rubric. These are agent assessments, not human
acceptance.

| Case | Observation | Verdict |
| --- | --- | --- |
| seed123/512 | Repeated fragmented black/white animal-face collage. | FAIL |
| seed124/512 | Extreme crop of a human-like illustrated eye/face. | FAIL |
| seed123/1024 | One angular fantastical head with faint overlapping contours; species and forehead eye-or-jewel feature are uncertain. | INCONCLUSIVE |
| seed124/1024 | Coherent furry creature portrait with two eyes, but uncertain species and unusual rounded-plus-pointed ear shapes. | INCONCLUSIVE |

The512 replay controls pass; neither1024 case unambiguously passes the declared
single-cat-head scene. Whole gate remains **NOT_QUALIFIED**. Resolution changes
the failure mode toward individual heads/coherent portrait, but1024 alone does
not satisfy this fixed scene. No claim of resolution as the sole cause, a
Studio-only defect, general quality or healthy regional reference baseline follows.
All four originals, including failures and ambiguities, are retained. No prompt,
seed, precision, method or production default is tuned after viewing; reference
admission remains64–512 and PP-001/005/007/008 remain **«Пока не обещать»**.

A finite ordinary Invoke parity investigation of noise/conditioning/scheduler is
the next diagnosis. It has **not** been executed here; configurable Invoke noise
dtype/current Studio precision must be distinguished before any proposed change.
There is no permission-by-inference to alter defaults or add a second pipeline.

## Retention and delivery closure

ROOT retention verifies71 archive entries and one private database. Independent
byte audit is **CLEAN**: all71 archive/raw entries,1643 current source files,
94 executed-source bindings, three external pins,72 installed-worker source
files,17 config files and three runtime companions match. Four original Project
packages contain20 ZIP members; all PNG/target/transport bindings, eight metadata
digests, four neutral aliases and both historical512 whole-PNG replays match.
The private database has20 tables with all six generation/accepted-index boundary
tables empty. Native execution remains ROOT evidence, not an independent rerun.

The initial retention reader incorrectly assumes matching JSON key order for
Main transport and runner metadata. They preserve insertion order and use JS
`localeCompare`, respectively; Python ordering differs for `loras`/`loraStack`.
The corrected reader recomputes the exact existing runner serialization/digest,
retaining strict SHA checks. Original data/settings are unchanged, no partial
archive/source outputs are overwritten, and the failed reader diagnostic remains.

After all readers close, ROOT separately confirms fresh runtime idle,12 bounded
unit exits,295 lifecycle records, no incoming raw dependencies and archive/origin
equality. Only this RUN's `payloads` and the neutral alias directory are removed:
3497984 allocated bytes, also the measured artifact-root delta. Archive-only
verification then passes all71 entries. Lifecycle is `retained`, `payloads: []`;
compact originals, source, shared runtime/model/managed data and active worker
report companions remain protected. Removed raw paths are not old `--resume`
inputs; reconstruction requires the recorded fresh-namespace/dependency rules.

The dated RUN retains `ordinary-resolution-report.json`, `blind-observation.json`,
`visual-assessment.json`, `retention-summary.json`, `final-audit-r1.json`,
`cleanup-result.json` and a compact comparison page using the original PNGs.
Current delivery source snapshots are separate from executed-source bindings.
Visual/general/regional/release readiness remains unchanged.
