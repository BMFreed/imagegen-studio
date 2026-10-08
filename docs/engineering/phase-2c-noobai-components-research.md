# NoobAI component source admission and preparation

## Entry, scope and risk

Authorized roadmap continuation from clean `master`
`c8b99c00a06cf5e992bcb2a027301e3221b13e6f`. The preceding installed outpaint
checkpoint qualifies two NoobAI objectives with an ordinary compatible LoRA and
Embedded FP32 VAE. It does not qualify dual-CLIP embeddings or external VAE on
those objectives. PP-004/005/007/008 remain open.

This slice closes the type-aware source/install/Prepare boundary and misleading
component-refusal diagnostics before extending trained installed qualification.
High risk for resource ownership, exact managed identities and preserving
admission; message-only edits do not change refusal timing or worker numerics.
Supporting contracts: managed-model library, generation settings/actions,
NoobAI roadmap and existing external-VAE/embedding inference notes.

## Confirmed data flow and gaps

`CivitaiClient.previewImport` parses resource type and retains raw source label,
then maps applicable generation components into the existing two families.
Main owns selected-file download/hash/size, private staging/publication, SQLite
catalog and exact repair. Source applicability alone is not structural or
numerical compatibility. `ModelService.resolveVerifiedGeneration*ForPlan`
rehashes exact managed bytes and independently runs the ordinary LoRA target,
paired dual-CLIP embedding or standalone LDM/native VAE preflight. Frozen TS
jobs and the Python worker retain copied identities, not mutable library Default.
The worker additionally checks complete native state and finite tensor values.

Confirmed source defect: `civitai-client.ts` maps exact `NoobAI` checkpoint,
LoRA and embedding labels to `illustrious`, but its standalone-VAE branch
refuses that label before any structural check. Existing contract/test encode
this as a deliberate earlier limitation. The authorized full-NoobAI roadmap
explicitly requires revisiting this type-aware boundary; a NoobAI label is not
reason to bypass format or architecture checks.

Confirmed diagnostic defect: actual Generate/Retry projects all `MODEL_*`
errors to "The selected checkpoint could not be verified for generation."
This incorrectly names a checkpoint when Main refused
`MODEL_LORA_INCOMPATIBLE`, `MODEL_EMBEDDING_INCOMPATIBLE` or
`MODEL_VAE_INCOMPATIBLE`. Keep the code and fixed safe component-specific
messages; do not expose arbitrary resolver/worker paths or messages.

## Type-aware policy and completeness

The finite resource universe is `ModelResourceType` in `src/shared/api.ts`:
checkpoint, LoRA, embedding, VAE and upscaler. The existing family universe stays
`illustrious | anima`. Planned exact-label policy:

| Resource       | Applicable Illustrious labels    | Boundary                                                                 |
| -------------- | -------------------------------- | ------------------------------------------------------------------------ |
| Checkpoint     | Illustrious, NoobAI              | No SDXL/Pony admission; prediction/noise policy is separate              |
| LoRA           | Illustrious, NoobAI              | Ordinary target profile and actual worker loading still required         |
| Embedding      | Illustrious, NoobAI              | Paired clip_l/clip_g widths/counts required; no Anima conditioning claim |
| Standalone VAE | Illustrious, NoobAI, SDXL 1.0    | Component applicability, not lineage or a third checkpoint family        |
| Upscaler       | Existing generic upscaler policy | No generation model family; unchanged                                    |

Exact spelling remains required. Unknown labels, aliases, case/whitespace
normalization, unsupported types and pickle formats retain explicit refusals.
Anima checkpoint/LoRA and pinned VAE dependency policy are unchanged. Source
metadata remains source-owned; applicable VAE has predictionType null.

## Invariants, controls and verification plan

Before changing production, run a NoobAI VAE source/import regression that fails
at the intended unsupported-family boundary. After the change verify real
parser → selected file → controlled HTTP bytes → downloader/staging → SQLite
publication → reopen/repair/default/exact resource resolution for NoobAI LoRA,
embedding and VAE. Controlled API/bytes are installation evidence, not published
trained components. Ordinary Illustrious/SDXL VAE and Anima/upscaler refusal
neighbors retain their existing behavior.

Main structural tests must use its actual qualifier and managed file, with
healthy paired/target/anchor fixtures and one invalid structural axis. Admission
and exact identity stay separate: copied source metadata, hash/size, IDs and
prediction null survive library Default/version edits. Header-compatible test
fixtures are explicitly not complete ML models.

For component diagnostics enter the actual public controller and durable
owners, check the fixed message/code and retain queue/receipt/candidate/seed/
private inputs/staging/Project/saved bytes on refusal. The neighboring healthy
case must still execute. Injecting a resolver refusal controls the failure
source, not the diagnostic or preservation subject. Semantic mutations should
restore the old NoobAI VAE refusal and old generic-checkpoint projection; each
must fail its causal assertion after healthy setup, then restore exact source.

## Resource and evidence plan

Inventory before work: artifact root20,508,925,952 bytes (about19.1GiB), disk
free56GiB, available RAM20GiB, RTX4080 total16GiB/about1.3GiB used. Existing
global swap use is not this run's cgroup swap. Heavy checks are root-owned,
serial, finite and swap-free. Preserve the one worker 0.14 canonical runtime at
its original path and the three-resource catalog; no duplicate environment or
multi-GB checkpoint copy. Verify physical idleness and exact43 worker-source
hashes before reuse.

At entry the local pool had no standalone SDXL VAE or trained embedding. Historical
external-VAE/embedding artifacts were cleaned; old successful reports do not
prove current fixture availability. The official epsilon checkpoint contains
complete standalone-compatible VAE tensors, but bounded header inspection alone
does not prove native loading. Any extraction is an explicitly derived local
fixture; any new trained embedding download keeps exact author/source credit.
Record native loading separately from source admission, trained inference and
future combined component matrix. Root owns writes/cleanup under artifact policy.

Reference inspection used local `/home/user/Work/sources/InvokeAI/` at
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`: ordinary LoRA shape handling in
`invokeai/backend/model_manager/configs/lora.py`, paired textual inversion in
`configs/textual_inversion.py` and `backend/textual_inversion.py`, and VAE
classification in `configs/vae.py`. Invoke itself acknowledges that SD1/SDXL VAE
shapes may coincide; source labels or shape anchors are not training-lineage
proof. Our exact-label applicability policy and complete worker loading remain
separate, without importing broader adapter formats or checkpoint families.

## Remaining gates at the source/Prepare checkpoint

Trained component execution, matched pixel controls and combined modes had not
executed at this source/Prepare checkpoint. The subsequent
[installed component checkpoint](./phase-2c-noobai-component-inference-research.md)
completed 36 finite EPS/V txt/img/normal-outpaint cases in 36 admissions at
256×256/three requested steps, plus two restored Retry completions in four
lifecycle admissions with two actual Cancel and six preserving missing-component
refusals after real current seed37/Default/component/prompt edits. Frozen seed0,
exact refs/target and portable Add/Save/readback/reopen/comparison are checked
separately from this earlier source admission and CPU loading evidence.
Four subsequent installed EPS-txt2img component mutations each completed six
finite Generate/Add/Save/readback/reopen cases before the intended causal pixel
RED. Source was restored between runs; fresh restored EPS-txt2img normal passed
six finite cycles with native physical exit. Final evidence confirms all 43
worker source files byte-exact, idle Main/worker and all five mutation journals
restored without backups, preserving original inode/mode/mtime. The earlier
post-load `disable_lora()` attempt is excluded as
noncausal; the exact source of its pixel difference remains unproven.
The subsequent [bounded encoder checkpoint](./phase-2c-noobai-vae-encoder-research.md)
passed eight EPS/V txt2img/strength0.5 img2img full finite UI cycles: TXT equal/IMG
different with an encoder-only bias control and unchanged decoder/config.
Catalog5/9 preserves the original eight versions, exact frozen0 provenance and
actual current draft37 through Add/Save/readback/reopen/comparison. One installed
EPS-img2img encode-zero mutant completed two finite cycles before causal pixel
RED, with physical exit/restored43/original inode/mode/mtime confirmed; fresh
restored pair passed two finite GREEN cycles with native physical exit. This is separate from this source/Prepare evidence.
Outpaint encoder, all-layer/formats compatibility, quality/Invoke parity,
polarity swap, multiple-adapter order,
trained Anima regression on worker0.14, dynamic batches and release remain open.
No UI redesign, new worker/protocol field, NoobAI family, standalone SDXL
support, public network delivery, engine Install/Repair or image-quality claim
is introduced. This checkpoint's execution, mutations and cleanup follow below.

## Implemented and executed boundary (08.10.2026)

`baseModelFamily` now admits the exact `NoobAI` standalone-VAE label alongside
`Illustrious` and `SDXL 1.0`; the source label survives unchanged. Prediction
remains null for the component. Generic SDXL checkpoints/LoRAs/embeddings,
unknown labels, case/whitespace aliases, pickle and standalone Anima VAE retain
their refusals. The Model Manager remains the checkpoint prediction/noise owner.
No worker/schema/capability or third family was added.

Public Generate/Retry now give fixed LoRA, embedding and external-VAE messages
for the three incompatibility codes. The shared safe projection also serves
Main IPC. Raw private messages remain hidden; the ordinary checkpoint fallback
was unchanged at this checkpoint. Missing/corrupt component files retained
their pre-existing generic fallback; this source/Prepare slice fixed only the
three incompatibility codes. The subsequent
[installed component checkpoint](./phase-2c-noobai-component-inference-research.md)
also fixes `MODEL_FILE_MISSING/CORRUPT` to a neutral resource message. Six causal
public-controller RED cases use actual missing/same-size-corrupt managed files,
with preserved owners and healthy restored frozen Retry; they are separate
from the installed missing-only lifecycle and the subsequent four installed
EPS-txt2img numerical mutation REDs.

### Real controlled-source and public-controller tests

`civitai-client.test.ts` enters actual preview parsing and verifies the exact
type-aware source universe, raw metadata and negative neighbors.
`model-service.test.ts` installs all three NoobAI component types through the
actual coordinator/downloader, controlled HTTP bytes, private managed publication
and SQLite. The actual Main qualifier checks the selected file. A second
source version installs but fails Prepare on its unsupported structural axis;
Default changes never substitute it for the saved exact identity. Each test
checks catalog cardinality one, versions one → two → two, selected IDs/hash/size,
copied source metadata, missing-file repair and a new database connection/service.
This is a real fresh-connection read, not physical application restart.

The fixtures are small ordinary LoRA/paired-CLIP/standalone-VAE anchor containers,
not complete trained ML models. Negative controls retain valid payload coverage:
LoRA changes only the pinned target; paired embedding counts differ at unchanged
768/1280 widths; VAE renames the required `quant_conv.weight` anchor while keeping
the same descriptor/payload. Cross-review caught and removed the earlier
descriptor-deletion range gap, which could have masked semantic regressions.

Three public controller tests each establish a healthy completed/failed two-job
batch before controlling the resolver's incompatibility. Generate and frozen
Retry refusals preserve complete SQL queue/receipt/seed/tombstone rows, candidates,
private input/staging/scratch trees (including extra entries and permissions),
autosave tree, Project/tabs and saved `.igs`. After draft component removal,
seed/bbox edits and resolver restoration, successful Retry retains original
context, resources, target bytes and seed43 rather than current99. Completion
does not change Project/shadow/saved package. ML output and the refusal source
are controlled; inference and live renderer IPC are not claimed by this test.

Root-owned bounded commands and compact logs are retained under
`~/.codex/artifacts/imagegen-studio/runs/noobai-components/20261008-checks/`:

| Evidence                                                     | Actual result                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `source-red.log/json`, before implementation                 | Seven tests: five healthy neighbors, two intended `CIVITAI_UNSUPPORTED_FAMILY` failures at preview/real NoobAI VAE installation |
| `diagnostic-red2.log/json`, before implementation            | Three intended final message failures after healthy setup, preserving refusals and restored Retry                               |
| `source-green.log/json`                                      | All 88 client/service tests passed                                                                                              |
| `generation-green.log/json`                                  | All 222 controller/preparation/queue/Anima queue/component-qualifier tests passed                                               |
| `final-green.log/json`, after structural/shadow improvements | Same nine complete files, all 310 tests passed, concurrency one                                                                 |
| `semantic-mutations-report.json` and paired logs             | Four isolated semantic REDs, byte-exact restoration, final seven-test GREEN                                                     |

The final complete command is `pnpm exec tsx --test --test-concurrency=1` with
`src/main/models/{civitai-client,model-service,illustrious-vae-qualification,illustrious-embedding-qualification,illustrious-lora-qualification}.test.ts`
and `src/main/projects/{generation-action-controller,project-generation-preparation,generation-queue,generation-queue-anima}.test.ts`.
Each command has a 3GiB/swap0/300s systemd limit; final log reports 352.6MiB peak,
15.440s runtime. Initial diagnostic fixture lacked mandatory worker 0.14 outpaint
capability and failed before the subject; `diagnostic-red.log` is retained as a
discarded setup failure. Corrected setup uses the existing full `noiseReady`.

### Semantic mutations and independent controls

One isolated `src` copy with a package-dependency symlink contains all mutations;
no installed worker/model or root implementation is changed. Baseline seven
tests pass. Restoring the old NoobAI VAE source refusal fails exactly two tests
while five neighbors pass. Removing the three safe diagnostic branches fails
exactly their three literal assertions while four source tests pass. Disabling
only paired-vector count equality fails the embedding test's expected refusal;
removing only the required VAE anchor fails its expected refusal. Each latter
mutation leaves six neighbors green. All four source files are byte-exact
restored, followed by seven passing tests.

The first isolation baseline encountered pnpm's noninteractive dependency-guard
setup refusal; it is not a semantic RED. The guard refused before dependency purge; the root modules remain usable. The corrected runner invokes existing Node/tsx directly. Its failed
log is retained separately. The isolated test implementation resolves relative
imports in the copy; unchanged migration/placeholder/ICC fixtures use the repo.

### Credited local sources and unchanged native CPU loading

The existing DigitalArt ordinary LoRA by `obuyb404` remains the only LoRA fixture
in the canonical managed catalog. Current primary CivitAI by-hash source resolves
model 1121001/version 1260279/file 1165414, raw `Illustrious`, exact
SHA `c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9`,
114,437,420 bytes. Its prior trained NoobAI runs are separate from this preflight.

[IllustriousPhoto Embedding](https://civitai.com/api/v1/model-versions/2655289)
by CautionMergeAhead, WAI v15 1152 steps, is downloaded directly from source
model 2360940/version 2655289/file 2542976. Actual 49,736 bytes and
SHA `91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36`
match source; this published label is `Illustrious`, not invented NoobAI metadata.
`embedding-source.json` records author/API/download and paired 12×768/1280 tensors.
The root-owned curl run has 256MiB/swap0/75s limits and a 60,000-byte download cap.
This direct download does not prove public app installation.

The verified official NoobAI epsilon 1.0 checkpoint by Laxhar contains 248 finite
F16 VAE tensors. Its full 6,938,040,416-byte SHA
`ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1`
is checked before extraction, and parent inode/size/timestamps remain unchanged.
Two standalone fixtures are derived from those exact tensors, with extraction
credit/parent hash retained; they are not separately published CivitAI VAEs:

| Layout           | Bytes       | SHA-256                                                            |
| ---------------- | ----------- | ------------------------------------------------------------------ |
| Standalone LDM   | 167,333,366 | `642ca8780b893744a5a66f9dc762768186bb3c4d7a4b17fde2de3845377b7481` |
| Native Diffusers | 167,335,542 | `f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7` |

`main-component-preflight-report.json` confirms full hashes and actual Main
LoRA/embedding/two-format VAE structural preflight on these complete sources.
The actual installed non-editable worker 0.14 Python is invoked with `-I`, offline
flags, CUDA hidden and one CPU thread. `native-component-load-report.json`
confirms both complete VAE layouts load into native Diffusers `AutoencoderKL`:
all 248 loaded tensors equal an independently called checkpoint conversion;
pinned offline config retains four latent channels and scaling 0.13025. Actual
worker embedding snapshot/qualifier confirms finite nonzero paired 12-vector
state and rejects missing-pair/non-finite controlled states. It does not load
trained CLIP encoders or prove prompt activation, selected-component pixel effect,
GPU denoising or the objective × component × mode matrix.

The native CPU service succeeds in 12.111s under 4GiB/swap0/240s; systemd reports
4GiB peak including charged file cache from parent hashing, not process RSS.
Successful-unit exact byte metrics are unavailable after systemd collects the
unit; retained service logs supply rounded peaks. There is no second environment,
GPU process or checkpoint copy. Entry and handoff manifests confirm all 43 installed
worker source files unchanged and physical runtime idleness. The catalog stays
two checkpoints plus the existing LoRA; derived sources are pinned outside it for
the next trained qualification. Catalog qualification IDs are local fixture identities;
they are distinct from the published source API IDs recorded above. Remaining gates
above remain open.

### Checks and artifact handoff

`pnpm run typecheck` and `pnpm run app:build` passed under finite swap-free
systemd limits. The build retains the pre-existing renderer chunk-size warning.
Initial full lint found four sorting errors in the new controller tests; local
automatic fixes changed import/type/case ordering only. Final `pnpm run lint` and `pnpm run typecheck` passed. After sorting fixes the same
nine complete test files passed all 310 cases again (`post-lint-green.log/json`).
Prettier/diff checks and 686 local documentation targets passed; only file
existence is checked for pre-existing links, not their legacy fragments. Delivery
is recorded in the compact handoff manifest. Prototype UI is unchanged; no prototype visual
test or new screenshot is claimed.

After every mutation service physically exited (empty cgroup) and source
bytes/modes were restored, both explicitly owned isolated source copies were
removed without following their dependency symlinks. `cleanup-report.json`
records actual 14,761,984 allocated bytes reclaimed. At that checkpoint the root
is 20,844,015,616 bytes, compact runs 26,103,808 bytes, shared pool 20,817,907,712 bytes,
below both soft budgets. The canonical worker/catalog/LaMa and 319MiB component
sources remain pinned for the next trained matrix. Compact logs/reports/scripts,
credits, source descriptors and restoration proof remain; isolated mutation
payloads are removed. No original external image/model or global cache is deleted.
