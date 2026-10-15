# Smart Patch: private model-source and LaMa preparation

## Prospective boundary

Base `706d70c4043c3413c91f9e15373b6d3b394c66a0`, clean master. This note precedes
implementation. PP-007/008 and the existing Smart Patch/compositing contracts
require frozen source inputs and explicit acceptance. This finite high-risk
worker/file/lease slice prepares model RGB only; it enables no Generate, jobs,
VAE/denoising, candidates, variants, provenance/schema, preset/Compare fields or
UI. Existing public promise statuses remain unchanged.

Confirmed local reference: Invoke `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`.
`generation/addImageToImage.ts`, `addInpaint.ts`, `addOutpaint.ts` route resized
source to i2l; only OUT routes source RGBA through infill first. Its
`backend/image_util/infill_methods/lama.py:25-44` builds RGB and binary holes
solely from source alpha<255 and returns the full model RGB, without pasting
opaque source pixels back. Authored/coherence masks remain separate. Upstream
`app/invocations/infill.py:43-59` skips only non-RGBA images, not uniform alpha.
The existing vendor NOTICE/license preserves the adapted wrapper's attribution;
this slice does not resolve the separately recorded release attribution of weights.

## Owned operation and complete mode table

Add private `capture.prepareModelSource(worker, infillResolver?)` to the existing
leased Main capture. A fresh operation root recomposes/prepares/conditions from
the closed-over frozen context, not caller-returned mutable snapshots. It returns
the existing six verified conditioning planes plus `modelSource` RGB or null.

| Frozen world mode | Model source                              | Resource behavior                                                                    |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| TXT               | null                                      | No resolver, model load or RGB output.                                               |
| IMG               | Exact processing RGBA converted to RGB    | No resolver or LaMa.                                                                 |
| INP               | Exact processing RGBA converted to RGB    | Authored/coherence masks remain separate; no resolver or LaMa.                       |
| OUT               | Full LaMa RGB from processing source RGBA | Resolve exact existing Main-owned pinned LaMa lazily; source alpha alone sets holes. |

Processing RGBA already uses BICUBIC resize before this operation. Keep world OUT
when resize yields uniformly0/255 alpha: run LaMa with respectively all-one/all-zero
holes. Do not replace source alpha with authored/effective/keep/coherence planes,
premultiply RGB, reclassify mode, merge source pixels back or approximate missing
LaMa. No specialized nine-channel checkpoint support is added.

The existing normal OUT `LocalLamaModel.infill` retains its mixed-alpha refusal.
Add a separate bounded RGBA/sRGB processing entrypoint sharing the actual forward
body, allowing uniform alpha. Source topology remains /8 grid, side<=2048 and
pixels<=4,000,000, PNG<=32MiB: existing private conditioning limits, not measured
ML capacity or new portable document limits. Actual LaMa can still refuse an
unsupported tensor shape; no implicit resizing fallback is introduced.

Main owns routing/resource resolution and frozen identity. New private worker
operation `prepare-smart-patch-model-source` / result `smart-patch-model-source-prepared`
accepts mode, hash-bound source or null, pinned infill resource or null and nominated
staging/output paths. Non-OUT modes must not accept an infill resource. TXT requires
null source/output/resource. OUT requires exactly the existing manifest role,
205669692 bytes and SHA256
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
No downloader, discovery, registration, alternate model or global model cache.
The internal protocol capability does not imply installed ML/runtime readiness.

## Verification and refusal boundaries

Freeze request values before the first await. Resolve LaMa only inside admitted
OUT operations; snapshot its returned identity immediately. Recheck local file
identity in Main and descriptor-backed worker loading. Forbid resource aliasing
source/output or disposable staging. All output paths remain canonical, beneath
their capture root, new and distinct. Publish one bounded RGB8 PNG tagged exact
sRGB; validate size, hash, byte count, ICC, actual IHDR RGB8 topology and contents
again when Main consumes bytes, including transport adapters outside WorkerClient.
The existing RGBA target classifier is unsuitable for this RGB consumer.

No partial model-source result may escape after invalid topology/hash/ICC/path,
decode/load/forward/publication failure. Existing normal OUT refusal and callers
stay intact. Inputs, six masks, document/history, saved package, shadow, seed and
queue/receipts remain unchanged. No-op release of a private capability is not Save.
The entire preparation→conditioning→resolver→source chain stays inside one admitted
lease; callback failure waits for already-started operations and closed reuse refuses.

Planned evidence:

- Real ProjectService/SQLite/writer fixture invokes the new capture entrypoint,
  verifies literal TXT/IMG/INP pixels, frozen profiles/context and unchanged storage.
- Actual protocol/transport rejects malformed fields, wrong resource, source/PNG
  hash/ICC/topology/dimensions, path aliases and existing outputs before publication.
  Inject controlled late output corruption with updated claimed hash to test the
  actual consumer rather than only metadata equality.
- OUT real TorchScript boundary fixture tests binary alpha0/128/254 vs255, uniform
  processing extremes and source-only holes distinct from authored/coherence input.
  Its deterministic model is a tensor-contract oracle, not trained LaMa quality.
- Reuse the sole compatible local Python environment and exact existing trained
  LaMa; compare finite actual CPU outputs with SHA-pinned upstream wrapper on mixed,
  soft and uniform processing alpha. Keep output/source bytes and provenance hashes.
  No diffusion, GPU, model/environment copies or downloads.
- Barrier-controlled callback failure/sibling operation demonstrates complete drain
  before cleanup; malformed/failed operations leave no published partial RGB.
- Execute isolated semantic faults with causal RED/neighbor GREEN: soft-alpha hole
  threshold, incorrect mode/source routing or RGB topology acceptance, and early lease
  cleanup. Retain exact restoration and physical-exit evidence.
- Root alone executes heavy checks serially: focused/affected TS and Python,
  typecheck/lint/build; no UI changes or redundant prototype run. Use whole-process
  memory limits, swap0 and finite deadlines. Check budgets before trained CPU runs.

## Artifact and remaining scope

Initial inventory: artifact root~~28GiB, shared~~27GiB, free~44GiB. Reuse checkout
Python for CPU-only helpers and one existing compatible shared Python/LaMa for
trained runs after actual import/config verification. Installed worker0.14 is
historical; current source runs via explicit PYTHONPATH and is not claimed as an
upgraded installed payload. Record dependencies in both lifecycle records. Separate
compact evidence from disposable payloads; confirm physical exit and original hashes
before cleanup. Keep the existing pinned historical-evidence budget exception.

`latentMaskHasCoverage:false` remains a separate future inference-admission decision.
This source operation reports existing masks/mode and does not silently choose a
denoising fallback. Family VAE/diffusion execution, durable jobs, candidate/variant acceptance,
staleness/provenance and public readiness remain later owners.

## Executed evidence

Confirmed on base `706d70c` plus this slice,15.10.2026. Compact evidence is retained
in `~/.codex/artifacts/imagegen-studio/runs/smart-patch-model-source/20261015-source/`.
The prospective sections above were written before source edits; the evidence
below records actual execution. Current source and trained-resource hashes are
recorded before/after the qualified operations and checked again at handoff.

| Boundary              | Actual execution                                                                                                                           | Result and limit                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main/CPU preparation  | `pnpm exec tsx --test --test-reporter=tap --test-concurrency=1 src/main/projects/project-smart-patch-mask-preparation.test.ts`             | 65 PASS,0fail/skip;10 new source cases plus existing55. Actual Service/SQLite/preparation/conditioning/source protocol, literal RGB/null, no-LaMa modes, frozen aliases/live edits, resolver refusal, late RGB/ICC/hash/dimension faults, unchanged storage and lease drain. |
| Remaining affected TS | Same serial runner over146 other Main/projects,shared/projects and renderer/components files in `affected-ts-files.json`                   | 1872 PASS,0fail/skip;1937 distinct TS tests total.                                                                                                                                                                                                                           |
| New source/LaMa tests | `worker-python/.venv/bin/python -m pytest worker-python/tests/test_smart_patch_model_source.py worker-python/tests/test_lama_infill.py -q` | 68 PASS,0skip. Real protocol/PNG/file publication and actual tiny TorchScript tensor execution;the mapped tiny model is an explicit precondition,not trained LaMa evidence.                                                                                                  |
| Python neighbors      | Serial pytest over12 files enumerated in `python-regression.json`                                                                          | 459 PASS,0skip;527 distinct Python tests total. Includes normal OUT/SDXL-family/Anima neighbors and existing CPU algorithms.221 NumPy/Diffusers/TorchSDE warnings are retained in the log;no solver change is made here.                                                     |
| Required checks       | `pnpm run typecheck`,`pnpm run lint`,`pnpm run app:build`;worker `ruff check` and `basedpyright`                                           | PASS. No UI/prototype change,so no new browser/native-Electron or prototype pass is claimed.                                                                                                                                                                                 |

The only post-focused test edit makes admitted operation completion explicit with
`assert.doesNotReject`;both affected cases were rerun GREEN in `drain-final-green`.
Final typecheck/lint followed it. Production source did not change after trained
qualification;this was a diagnostic assertion,not a behavior fix.

### Genuine Main and trained resource

`pnpm exec tsx scripts/smoke-smart-patch-model-source.mjs --python <checkout-python>
--lama <existing-shared-big-lama.pt> --output <new-owned-dir>` passed two128×128
cases in `trained-main/report.json`:

- OUT has an authored mask on the opaque side,source alpha0/128/254 holes elsewhere,
  and a red Raster above the target. Actual ProjectService capture excludes that
  upper Raster,prepares six independent masks,resolves exact shared LaMa once,and
  invokes the actual typed transport/current protocol on `processing-source.png`.
  Source RGBA remains byte-identical;the result is full RGB8+sRGB at the frozen
  size. No authored/coherence plane is supplied to infill.
- IMG is the ordinary opaque32/64/96 neighbor. It returns exact processing RGB
  through the same Main consumer with zero resolver calls and no LaMa load.

All eight Python subprocesses recorded PID/start/close/physical exit. The fixture
uses real writer/loader,SQLite/import and captured-operation entrypoints;only
input assets are declared literal preconditions. Saved `.igs`,raw document,shadow,
history,seed,queue/receipts and original source bytes are unchanged. Returned
buffers remain valid after staging removal. Retained PNGs include world and
processing source,model RGB and all six masks;input project payload was disposed
after assertions and closed DB/processes. This is a private Main integration
qualification,not an Electron workflow or accepted result.

### Independent trained Invoke comparison

`worker-python/.venv/bin/python -B scripts/smoke-smart-patch-model-source.py --lama
<existing-shared-big-lama.pt> --invoke-source /home/user/Work/sources/InvokeAI
--output <new-owned-dir>` passed four cases in `trained-invoke-r2/report.json`.
The external source argument is the checkout directory. The script verifies
Invoke HEAD `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` and the exact upstream
`lama.py` SHA before extracting its unchanged wrapper/norm function.

All four actual protocol outputs match the independent upstream wrapper's whole
raw RGB bytes:hard mixed alpha,soft0/128/254/255,world-OUT-like BICUBIC512→128
that yields all0 alpha,and the corresponding all255 processing alpha. Both
extremes still dispatch OUT/LaMa and preserve frozen mode. Input/output/oracle
PNGs and raw/file hashes are retained. There is no source-pixel pasteback. The
exact205669692-byte resource and worker sources match before/after execution.

Both trained runs used the existing checkout Python3.12.13/Torch2.7.1+cu126 with
CPU threads/inter-op1,CUDA hidden and offline environment. The checkout environment
already contained Torch;the shared Python was inspected only as metadata. Only
the existing pinned shared LaMa was reused. No model/environment copy,download,
diffusion,VAE,GPU,public Generate or installed-worker upgrade occurred. These
finite128×128 whole-RGB matches do not establish all-resolution capacity,visual
quality,full scaled conditioning/compositing parity or release readiness.

### Executed semantic probes and neighboring controls

`mutation-probe.py --run` creates isolated TS or Python-source copies,never edits
originals,and verifies full TAP/JUnit counts,source identities and physical exit
before deleting copies. `source-mutation-0cdaca8478-summary.json` is complete:

| Fault                        | Causal RED                                                                                           | Same-boundary GREEN                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| LaMa alpha<255→alpha==0      | Soft-alpha protocol/tensor fixture returns opaque-control colors rather than literal135/143/151.     | Uniform255 processing still performs the same real tensor forward with zero holes. |
| Remove RGB color-type2 guard | Actual late RGBA PNG with valid updated hash/ICC is wrongly accepted by Main;expected refusal fails. | Valid IMG RGB still passes the same strict consumer.                               |
| Remove operation drain       | An admitted model-source chain loses staging/its output before it completes after callback failure.  | Ordinary awaited IMG source succeeds.                                              |

Each case has exactly1 RED+1 GREEN,0skip,with no import/OOM/timeout failure. The
initial probe run's first two pairs succeeded;its drain case failed causally as
`OUTPUT_MISMATCH` before the harness's required assertion form. The explicit
completion assertion now reports that invariant as `ERR_ASSERTION`;the complete
three-pair rerun above is retained alongside the initial report. Every original
SHA is unchanged and all temporary copies were removed after physical exit.

### Refusal,review and interruption boundaries

Malformed/mismatched source,resource or mode refuses before model execution or
publication. Missing Torch is `INFERENCE_UNAVAILABLE`;changed local model/source
identity,invalid output topology/nonfinite values and unavailable output paths
remain explicit errors. Main reports `OUTPUT_MISMATCH` for invalid late RGB/ICC/
hash/dimensions. Rejected operations return no partial model input and the whole
leased chain drains before cleanup. Existing normal OUT still rejects uniform
world targets. No migration,portable member or rollback of Project state exists
for this read-only operation;failure leaves the Project/Save baseline unchanged.

Informed source review compared actual TS/Python payloads,ownership,resource
resolution,strict RGB reconsumption and drain;no reachable implementation defect
was found. It was not a blind or runtime audit. Initial check failures were
format/style diagnostics and one test-only `unknown[]` fixture inference,corrected
without changing production semantics. The first trained-Invoke launch passed a
file where a checkout directory was required;its early failed report/physical
exit remain retained. It did not load/qualify the resource and is excluded from
the four successful comparisons.

### Resources and cleanup

Heavy runs were sequential and whole-process bounded:TS/Python tests2GiB,lint4GiB,
typecheck/build2GiB;trained source and the tiny Torch mutation4GiB,all swap0 with
finite180/300s deadlines. Actual trained Main peak1,499,652,096 bytes and external
comparison peak1,441,890,304 bytes stayed below the chosen cap;global lint peak
3,799,371,776 bytes. No resource limit was raised after a test failure.

`cleanup-final.json` confirms eight closed/exited Main subprocesses,no running
owned heavy unit,no retained mutation copies,and unchanged source/resource
identities. Main fixture disposal reclaimed688128 allocated bytes;the initial and
final mutation source copies disposed1081326 and1081588 logical bytes respectively
(not claimed as an allocated-disk measurement). Compact evidence is under2MiB;
artifact root remains ~28GiB with ~44GiB free. Protected shared runtime/catalog and
historically pinned evidence remain intact;the historical1GiB evidence exception
is retained. Both lifecycle records identify the exact reused LaMa dependency.

PP-007/008 body/matrix,feature/storage contracts and roadmap record this finite
private source/LaMa boundary. Next are family VAE/diffusion admission/execution and
immutable variant acceptance. The latent-coverage-loss admission policy remains
an explicit later decision;no fallback or acceptance behavior is invented here.
