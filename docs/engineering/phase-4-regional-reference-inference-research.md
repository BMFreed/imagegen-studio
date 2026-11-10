# Illustrious regional reference-image inference

Base `18d15c2aacc22a57958a2629c33f499d298b2cb9`. High risk: exact auxiliary
resources, captured images, durable queue/Retry and native attention lifecycle.
Continue the existing Current Canvas conditioning/attention/denoising/output
owners. Authoring/storage already exist and are not this implementation slice.
PP-001/005/007/008 remain **«Пока не обещать»**.

## Fresh Invoke source

Clean local InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`, implementation
and actual callers reread before design:

- frontend `workbench/widgets/layers/layerOps.ts`,
  `workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts`, generation
  `core/canvas/compileCanvasGraph.ts` and `addRegionalGuidance.ts`;
- `app/invocations/sd/ip_adapter.py`, `sd/denoise_latents.py`;
- `backend/stable_diffusion/extensions/ip_adapter.py`,
  `diffusion/custom_atttention.py`, `regional_ip_data.py`, `conditioning_data.py`;
- `backend/ip_adapter/ip_adapter.py`, `ip_attention_weights.py`, `resampler.py`;
- `app/services/shared/invocation_context.py`, model-load default callers,
  `backend/model_manager/load/model_loaders/ip_adapter.py`, `clip_vision.py`,
  configs and starter `sdxl.py`/`common.py`.
- `app/services/session_queue/session_queue_default.py::_enqueue_batch` and
  `retry_items_by_id`, their `app/api/routers/session_queue.py` callers;
- model acquisition in `app/services/model_load/model_load_default.py` and
  `app/services/shared/invocation_context.py::load` with its denoise callers.

Each authored reference has its own image-attention term and owning mask.
Invoke adds `SDPA(Q,K_ip,V_ip)` to native text attention before the shared output
projection; it does not add image tokens to the text bank. CFG uses projected
unconditional/conditional image tokens independently of empty negative text.
Basic IPAdapter projects CLIP `image_embeds` into four tokens; unconditional
conditioning projects zero vision embeddings and is generally not zero.

Studio keeps original native text processor delegation. The finite native profile
already excludes Q/K, spatial and group normalization. Scoped Q-output capture
and an output-linear prehook can insert Invoke's image residual at exactly the
same seam, preserving native output bias/dropout/residual/rescale. Guards require
one exact active attention call, one Q/output, original thread/frame and complete
finally/setup-failure restoration. No global SDPA patch, new sampler, parallel
attention owner or `pipeline.load_ip_adapter()` is introduced.

Invoke indexes adapter K/V by the complete native attention registry, retaining
self-attention indices while skipping their application. Validate the exact full
mapping against the real UNet, rather than renumbering cross sites. Each reference
remains a distinct ordered addition, including identical-content images.

Reference masks follow Invoke graph semantics: alpha>0, nearest-to-latent then
ceil-mode2x2 max pooling. They derive from their own Regional Guidance layer's
raw alpha. Existing Invoke-composition text masks already use alpha>0 before the
shared >=128 planner, while legacy private text masks retain raw alpha>=128.
Neither text policy nor Smart KEEP/contribution changes in this slice.
Masking applies at image attention; subsequent UNet computation can change final
pixels outside the region. No hard final-RGB preservation promise is inferred.

## Exact internal resources

The mechanism exists upstream and is adaptable. Studio currently has no adapter
or CLIP Vision consumer. Reuse its trusted auxiliary planner/stager/SHA publisher,
adding explicit roles and bounds without widening LaMa's existing limits or
adding generic Model Manager/portable resource kinds.

Invoke lazily finds/installs an encoder during invocation. Adapt that mechanism
to Main's exact resource resolution before enqueue; worker loading stays offline.
The starter's SDXL-labelled dependency points to bigG while the actual checkpoint
caller defaults to ViT-H. Use the caller's compatible Standard SDXL ViT-H pair,
checking projection dimensions rather than its display name. Plus/Resampler,
FaceID, Noob custom adapters and arbitrary routing are separate profiles.

Verified publisher metadata (HF API; no model downloaded yet):

| Artifact | Pinned revision | Bytes | SHA256 |
| --- | --- | ---: | --- |
| InvokeAI/ip_adapter_sdxl_vit_h, ip-adapter_sdxl_vit-h.safetensors | cf41dfaaed08cb09ba165374aa0890ab08544351 | 698391064 | ebf05d918348aec7abb02a5e9ecef77e0aaea6914a5c4ea13f50d45eb1681831 |
| InvokeAI/ip_adapter_sd_image_encoder, model.safetensors | bb91c1a4950fe88fe3504f46e6a21b872c5c7f6b | 2528373448 | 6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030 |
| Same vision config.json | bb91c1a4950fe88fe3504f46e6a21b872c5c7f6b | 560 | 625d37b31afbf2f0792a87846b3654ee23f20568409e35b78a1f795b04e1a7a1 |

[Adapter source](https://huggingface.co/InvokeAI/ip_adapter_sdxl_vit_h),
[Vision source](https://huggingface.co/InvokeAI/ip_adapter_sd_image_encoder).
Config binds projection1024/hidden1280/image224/patch14/layers32/heads16.
The standard adapter must bind cross-attention2048 and four tokens. Original
canonical PNG goes through RGB conversion and `CLIPImageProcessor()` defaults,
never the128px thumbnail. Encode with a separately owned vision/projection
prepass before loading/acquiring UNet, following Invoke's resource lifetime.

## Finite first public consumer

Current Canvas Illustrious epsilon TXT, Euler/Normal, default false/leading
noise, CFG(1,30], steps1–200, one static item, embedded FP16 VAE and processing
64–512 divisible8. One or more references, at most three total per job, with at
most three regions and existing text/context/attention bounds. Fixed internal
`full`, weight1, begin0/end1 follows Invoke defaults; no new authoring controls.
The three-image count is a finite qualification decision, not measured capacity
or an authoring limit. All enabled references are counted; refuse excess before
SQL rather than silently dropping later images.

Separate per-reference32MiB PNG / aggregate96MiB file budgets; original import's
16384 side/64000000 decoded-pixel bounds remain. Existing512MiB capture,64MiB
alpha,32MiB target and1MiB JSON limits keep their own meanings. Reference files
use numbered fixed roles, not inline JSON/base64. These bounds are work guards,
not peak RAM/VRAM measurements. Old empty-reference flows retain their policies.

Additive capability `illustrious-regional-reference-txt2img-v1` and frozen
`invoke-illustrious-regional-reference-txt2img-v1` profile bind this combination.
The trusted auxiliary owner checks the complete three-file group. Frozen Retry
and final generation capacity preflight use that same descriptor-version fence
before SQL. Worker verification retains serial hashes and offline loading.
Invoke's model-manager acquisition scope cannot be reused literally in an offline
worker without the server model manager. The existing Studio descriptor snapshot
convention (including ctime and canonical pathname/version checks) adapts that
resource identity boundary around the prepass; no new model/storage owner or
weight copy is introduced.

Base public regional support alone cannot authorize it. Operational references
freeze each image's region/reference ID, original PNG hash/dimensions/order and
one exact adapter/vision resource pair per job. Existing coherent capture,
fixed-role queue serializer/loader and descriptor materializer own these bytes.
Image-only regions work; zero/outside masks remain validated exact-zero controls.
Disabled regions stay authored and integrity-leased, but are not consumed.

No active LoRA/TI, other methods/objectives, IMG/OUT, batches/dynamic prompts,
selected VAE, Smart references or Anima references in this first consumer. These
refusals are explicit; compatible promised combinations remain later consumers.
No inverse auto-negative, generic IPAdapter/ControlNet UI, per-region routing,
new queue wrapper or portable `.igs` field. Generate/Retry do not Add/Save;
Regional Guidance/reference state stays outside accepted provenance/Compare/presets.

## Verification and operations

Test real original PNG forwarding, ownership/order/mask/resource swaps, missing
and changed resources before SQL/Retry/dispatch, image-only/empty-negative CFG,
exact capabilities and frozen replay after saved edits/removal. Native causal
oracles must observe the pre-output masked image residual and actual prediction/
PNG, with zero/no-reference controls and exact source restoration. Final outside
RGB equality is not a regional mask oracle. Authored checks, executed tests,
source review, installed inference and visual usefulness remain separate.

Fresh inventory: about26GiB root,67GiB disk free, GPU16376MiB total/14115MiB free.
The exact new pair and560-byte config add3226765072 artifact bytes in total; account for
staging/publication copies before download. Reuse one protected runtime/catalog
and original checkpoints; do not copy them. Root owns serial heavy execution,
launcher<=2GiB/native<=10GiB/aggregate<=12GiB, zero swap and600s per phase. No
allocator fraction is enforced or claimed. Retain/audit own payloads before exact
cleanup; active SHARED, models/Projects/rows/report companions remain protected.
Evidence root: `runs/regional-reference-inference/20261110-public`.

## Executed checkpoint

The implementation and one complete installed cohort pass. ROOT independently
executed the following; earlier stage results and authored peer checks are not
counted as new runtime execution:

| Evidence | Actual result | Boundary |
| --- | --- | --- |
| Main/shared/Retry |1981 PASS;81 post-fix PASS with overlap | Existing public controller/capture/SQLite/frozen/dispatch owners; exact new grant on actual client, pre-SQL resource faults, original ordered PNG roles |
| Workspace Python |713 PASS,0 skips,14 isolated groups | Changed consumer/native attention and selected neighbors; one exact-TI native control, not a rerun of the unchanged full TI matrix |
| Browser |272 PASS, full suite with workers2 | Production Vue wiring exercised with prototype seams; this alone is not installed persistence/inference |
| Native CPU semantic mutation |20 selections=14 GREEN+six post-PNG RED;33 actual RGB PNG witnesses | Disable image residual, ignore mask, swap CFG image banks; independent numerical oracle, causal/zero controls and original no-reference neighbor; exact1637-file restoration |
| Final built app |13 checks,four requests,three PNGs,one native-step1 Cancel,one exact restarted Retry,three normal physical lifetimes | Official Illustrious XLv0.1;one reference;512/EulerNormal/embeddedFP16/N6;actual Add/Undo/Redo/Save/reopen and real SQLite result preset |

Final app report is `t-rri-1110/app-reference-r4/report.json`, fixture
`fixture-reference-r5.json`, active noneditable worker report `worker-refresh-r2.json`.
Its72 installed source files and exact three-artifact group are verified without
copying an environment or checkpoint. Same-Project A/B changes only the original
reference (authored calibration cards differ only by body color):754789 changed
visible RGB channels. Both repeat controls exactly match the earlier attempt's
PNGs. After Cancel, saved live B/settings survive reopen while frozen Retry A
reproduces the original A byte-for-byte. The accepted Raster, Undo/Redo, saved ZIP/
reopen and real result-derived preset retain ordinary-only provenance; live B
remains in the Project. No current Canvas/Smart mask or production default changes.
The admitted maximum3 images is not a maximum-capacity installed qualification.

Retained failed attempts are explicit: app-r1 stops at the launcher's wrong12GiB
argument before UI; app-r2 stops at the old128-receipt preservation inventory
while the reused protected pool has176 receipts; app-r3 reaches all four native
requests and Add/Undo/Redo/Save plus ZIP readback, then an expected fixture
display-name assertion stops acceptance/provenance validation before the final
reopen/preset qualification. The frozen/accepted actual label was correct. The final fixture binds
that actual label. No old managed rows or Projects were deleted to fit the run.
Only the new reference profile's receipt-inventory bound increases to256; queue
and inference capacity guards are unchanged. Earlier attempt outcomes remain failed.

One combined workspace Python process and the unchanged full TI module separately
hit4GiB OOM; neither is semantic RED. The final scoped selection uses serial
processes at the same4GiB/zero-swap ceiling. An old settled-signature test was
updated for optional captured image conditioning. Initial mutation-runner JUnit
classification refused a genuine post-PNG causal assertion because pytest included
an `AssertionError:` prefix; exact source restoration passed, the refused report is
retained, and a fresh namespace with the corrected exact-site classifier yields
the20-case result above. Setup/timeout/OOM do not count as semantic mutation RED.

A separate agent-executed resource regression on the pre-fence verifier loaded a
changed tiny safetensors tensor, restored bytes+mtime, executed two native UNet
calls and published a PNG. That intended refusal test failed after publication.
ROOT retains its exact old installed source, log/command, testcase and RGB witness;
this is labeled agent-executed, not an independent ROOT rerun. The final32-case
reference suite in ROOT's713 selected checks includes both restored-resource
refusal controls. Source-only peer reviews checked Python and the non-authored
Main/resource/queue/client owners. Reported pre-SQL/group-fence/CFG-rescale gaps
were fixed and rechecked separately from runtime qualification.

Final full TypeScript/Vue typecheck and production build pass. Full ESLint passes
with only the two unchanged parser exclusions (`qualify-installed-regional-init.mts`
and `qualify-regional-character-visual.mts`). Its three formatting-only queue
findings were fixed after installed qualification. Four final app members match
qualified bytes; Main's printed JavaScript changes with formatting. ROOT rebuilt
its exact qualified Main hash from the verified original queue source without
editing the repository, and the JavaScript parser proves the final Main AST equal.
Both Main artifacts and source origins are retained separately. This is not an
execution claim for the final formatting-only Main bytes. A diagnostic token
scanner lacked parser-context rescans and is not used for the semantic conclusion.
Python checks and source/document/retained-byte audit are recorded in the final
closure below.
No visual-usefulness, trained-reference quality, capacity, release or MVP
acceptance follows from pixel inequality, exact replay or source review.



## Reconciled remaining MVP boundaries

Checked current guards and owners, rather than the historical Phase4 introduction:

1. Compatible Regional combinations still need a finite contract/evidence matrix.
   Illustrious EPS/V Smart Regional and both families' global LoRA consumers are
   already implemented; do not reimplement them. Smart's static-single-item,
   resource/method/precision/processing guards remain in
   `smart-patch-regional-guidance.ts`. This first Current Canvas reference slice
   does not yet cover compatible IMG/OUT/V/Smart/resource/batch combinations.
   A temporary guard is not automatically a separate product promise. Anima
   references/TI, inverse auto-negative and generic adapters remain exclusions.
2. Official Illustrious XLv0.1 visual usefulness, region/reference compatibility
   and capacity acceptance remain open. The character-visual checkpoint remains
   NOT_QUALIFIED. Prior Smart LoRA installed selection is EPS TXT/INP +V IMG/OUT,
   not the full installed EPS/V-by-mode cross. Causal pixel differences and exact
   replay do not establish quality or useful reference conditioning.
3. `ProjectService.list()` still scans only Uncategorized; `project-index.ts`
   supplies default workspace/index foundation. `HomeView.vue` and Project IPC
   lack the remaining workspace operations, browsing/inspection and Project Trash
   lifecycle despite the existing `trashed_at` storage field. Their files/SQLite/
   restart consumers remain necessary; existing create/import/open/index work stays.
4. Models still lack the safe hard Remove Local Resource owner and remaining
   accepted-result/Preset Manager/New Project contexts. Project checkpoint/LoRA/
   VAE/embedding navigation, diagnostic return and installed artwork already exist.
   Removal must follow `model-manager.md`'s running/pending/reference/shared-file
   contract; a catalog delete or direct unlink is not sufficient.
5. `project-candidate-image-export.ts` exports a verified candidate PNG. It does
   not implement visible-composite Export As or Export Generation BBox. Reuse the
   composition/sRGB owners with active variants, negative coordinates, empty
   refusal and unchanged .igs; custom rectangles remain later scope.
6. `src/main/runtime/index.ts::install/repair` still return
   RUNTIME_INSTALL_UNAVAILABLE. The pure install planner and exact auxiliary
   publisher are foundations, not complete release runtime installation/repair.
   A trusted full release manifest, staged self-test/activation/rollback and UI
   remain open. `build-electron.mjs` builds app members; the verified Linux/NVIDIA
   distributable and manual Electron Check for Updates/Install Update are absent.
7. Existing migration/recovery/protocol owners need joint packaged acceptance:
   clean install, upgrade, interruption/rollback, old .igs/SQLite/queue/provenance,
   missing/incompatible runtime and exact resources, NoobAI release matrix and
   actual delivery/MVP user flow on a concrete Linux/NVIDIA artifact/device/driver.
   Do not recreate existing queue, migration or recovery foundations.

PP-001/005/007/008 remain **«Пока не обещать»**. No readiness/matrix promotion
follows from this implementation or the verification plan above.


## Retention and final checks

Final full Python typing is clean (0 errors/warnings), Ruff passes, and full
TypeScript/Vue typecheck, lint and production build pass. Source-only peer
findings on resource admission/group fences, finite CFG Rescale and retained
package/source-witness bindings were fixed; review is separate from execution.
The final reference closure passes exact source/build bindings, private WAL
replay with logical schema/table equality and separately recorded schema cookie,
original PNG roles, accepted/preset exclusion and owned SQL/package association.

Qualified scope is3 managed Projects (2 active),4 queue rows/bundles,3 completed
rows/receipts/retained PNGs,1 canceled row and3 normal lifetimes. Actual retained
scope additionally includes the partial native attempt:6 managed Projects,
8 queue rows/bundles,6 receipts/PNGs,3 failed attempt reports and6 reported
lifetimes. Setup failures own no Projects/rows. Original qualified source/build
bytes and current formatting-only source/Main deltas remain distinct; changed
current bytes are never relabeled as executed. Reconstruction/source archives
and exact model/runtime/config/report dependencies remain protected.

Payload archive verification, lower-byte audit, cleanup and Git delivery are
recorded in `release-result.json`, `final-audit.json`, `artifact-lifecycle.json`
and `commit-proof.json` at this run's compact evidence root. These are execution
records, not new product readiness. Reconstruction must first validate the
archive inventory and exact external dependencies; never resume a disposed raw
staging path or overwrite current managed Projects/SQLite/runtime. Extract only
bounded regular members/explicit literal links into an owned empty namespace,
without following links; restore original payload paths only after exact guards
confirm them free. Retained .igs/frozen/SQLite copies are read-only evidence,
not an instruction to replace the active protected data root.
