# Private Anima Smart Patch regional INP

Base `fb3e5c093b31310d630d9abc881924c10d782da1`. Risk is high: coherent historical
asset capture, model/source association and native ownership meet an existing
Smart world-output pipeline. Public admission, queue/durable input schemas,
capability headers, dispatcher, `.igs` schema and variant acceptance stay unchanged.
This first private consumer must reach actual native processing RGB and the
existing world contribution; a DTO-only checkpoint is insufficient.

## Product decision and source

The user explicitly selected **the chosen Smart Patch's generation settings** as
the source for `Use global negative prompt` during Smart generation. That is the
job-global negative, not the Current Canvas negative displayed as authoring context.
Local regional negatives remain local. Current Canvas cannot override the selected
Smart model, prompts, sampling, seed, size or source. Regional Guidance remains
excluded from accepted provenance, Compare and result-derived presets.

Consulted clean local InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
The paths below are relative to its `invokeai/` directory:

- `frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
  grafts image/INP/OUT first, then joins Regional Guidance to the same job denoiser.
- `frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`
  copies that job's encoder edges and retains distinct signed collectors.
- `frontend/webv2/src/workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts`
  owns the regional mask input associations.
- `backend/anima/regional_prompting.py` normalizes/binarizes and NEAREST-resizes
  masks directly to the actual image-token grid, with separate global support.
- `backend/anima/anima_transformer_patch.py` applies masks on even blocks and
  retains original unmasked attention on odd blocks.
- `app/invocations/anima/anima_denoise.py` keeps signed contexts/masks separate
  while using existing source-conditioned sampling.
- `backend/rectified_flow/rectified_flow_inpaint_extension.py` and
  `backend/util/mask.py` remain the basis for the existing independent KEEP owner.

Studio already has real regional TI consumption for Illustrious. It is not a new
missing mechanism. Regional references additionally need adapter/CLIP-Vision
resource/settings ownership; Anima regional references remain unsupported.
Neither prerequisite is needed for this private original-Anima consumer.

## Existing owners and missing seam

Smart capture owns selected `patch.generationDraft`, bbox/internal resolution,
its mask and below-only Raster composition. Existing CPU preparation owns source
classification, BICUBIC processing source/Smart mask, coherence, KEEP and model
source. Existing `run_smart_patch_anima` already routes INP through
`generate_anima_outpaint`, whose prediction-factory seam composes with KEEP.
The missing consumer is a derived regional predictor at that same native call.
`composeExecutedSmartPatchOutput` owns processing RGB back to world contribution;
ordinary Raster publication must not substitute for it.

The new coherent private capture must bind Smart and regional assets to one
coordinator/document/revision/epoch and package version before use. Pending assets
are owned before awaits. Save/replacement/edits during acquisition refuse; after
the callback begins, the existing historical lease survives later authoring and
close. Existing lease cleanup and pending-operation settlement remain authoritative.
This read-only capture grants no public generation permission.

A new explicit Smart recipe retains true layer/document identity, world bbox,
internal resolution, Smart mask identity/revision, model SHA, sampling, concrete
item, Smart globals and ordered regional owners. It does not fake a Current Canvas
snapshot or mutate a later Canvas recipe. Global compiled source ID is the Smart
layer UUID. Inherited negative source is `smart-patch`. Repeated/inherited strings
retain separate records and encodings. One bound private input includes the
unchanged original `SmartPatchExecutionRequest`; it is the only source/KEEP/
resource/sampling authority. The native frontend validates the complete association
before resource loading or encoding.

## Geometry and finite limits

Regional geometry:

```text
owned region alpha8 clipped to translated Smart world bbox
  → alpha / 255 > 0.5
  → tensor NEAREST directly to processing image-token grid
```

For processing dimensions W,H the query grid is
`ceil((H//8)/2) × ceil((W//8)/2)`. KEEP is independently `H//8 × W//8`.
A world bbox need not be divisible by8. Using `W//16`, world dimensions, absolute
coordinate snapping, Smart BICUBIC/fade/coherence or intersecting regional masks
with KEEP changes the mechanism. None is introduced. Anima has no SDXL max-pool
pyramid. Positive sampled-zero refusal and negative-zero even/odd semantics stay;
zero negative support is not global inertness or final-pixel locality.

First private scope: original Anima, opaque-source Smart **INP**, one static
concrete item, existing Euler or Heun. No enabled LoRA, TI or regional references.
Processing sides64–512, divisible by8; world sides1–2048 and area≤4,000,000;
origins within±2,147,483,647. Existing steps1–200, CFG1–30 and strength0–1 remain.
The explicit private profile uses current native Anima positive-background support
and negative-global Everywhere. Historical Current Canvas/Krea2 profiles stay exact;
this does not select new public composition defaults.

Retain at most3 regions/eight signed sources,16KiB per effective text and128KiB
aggregate including repeated inheritance;512 context rows/source; existing Qwen/
T5/token/fragment/weight checks. Each sign still obeys
`heads × queries × keys ≤33,554,432`. At512 processing, Q=1024 and K≤2048/sign,
so the original16-head maximum reaches that existing ceiling. A materialized
broadcast Boolean mask is at most2MiB/sign before workspace/expansion. Three
4,000,000-byte world alpha planes total at most12,000,000 input bytes; these are
payload arithmetic, not peak host/VRAM capacity. The complete private wrapper is
not inserted into the existing64KiB wire or128KiB durable manifest.

The existing CFG `isclose(...,1)` rule still validates/preflights signed input,
then skips additional negative consumption. Existing native solver/source posterior/
window, KEEP merges, finite checks, exclusive processing-RGB publication and world
output remain unchanged. All255 KEEP retains native execution, not a mode fallback.
One original-model reservation, qualified tokenizer copies, prompt preflight and
VAE-cache scope unwind on every exit. No borrowed-state repair or allocator-release
promise follows. Full loading reuses the original CUDA owner; small borrowed-native
qualification has explicit CPU float32 and CUDA BF16 lanes, without CPU fallback.

## Acceptance boundary

Genuine Main Save/reopen/coherent capture/ModelService/preparation must produce the
whole private input. Use different Current Canvas and Smart models, prompts,
negatives, seed and sizes; only Smart job settings may reach execution. A bright
above-Patch layer controls below-only composition. Translate a nonsymmetric world
bbox and choose different processing dimensions, including a /8-but-not-/16 side.
Independent raw-alpha oracles include127/128, overlap, absent/empty/local/inherited
streams, positive sampled-zero and negative-zero behavior.

Small original CPU/CUDA tests observe actual signed contexts, even masks, odd
unmasked native SDPA and independent KEEP merges through Euler and Heun. Zero-region
output equals ordinary Smart at the same frozen settings. CFG1 must skip extra
negative encoders without discarding validation. Refuse malformed owner/model/seed/
plan/size/compiled/unsupported-resource input before the applicable work. Late
encoding/native/decode/publication/world failures preserve borrowed state/RNG and
source, return no false success, release ownership and permit a fresh call.

Execute isolated signed-inheritance consumption and valid-shape geometry mutations with
unaffected controls, semantic RED and exact full-source restoration. Native oracles
must observe real processing PNG publication before rejecting wrong permissions or
contexts; import/setup/OOM failures do not count. Then run one fixed trained INP,
a legitimate regional negative neighbor and exact repeat through the real world
output owner. Independently reopen processing/world PNG, verify dimensions/ICC,
world origin, contribution alpha and source protection. No prompt or seed tuning
follows viewing; visual usefulness remains separate.

## Operations and evidence

ROOT owns execution and lifecycle under
`runs/anima-smart-regional/20261109-inpaint-private`. Initial artifact root is
26,217,025,536 bytes; free disk45,536,022,528 bytes; GPU14,241MiB free of16,376MiB
at inventory. Reuse one current compatible library runtime/catalog/models, with
no downloads or environment/model copies. Small serial units use≤4GiB, zero swap,
600seconds. Trained units retain12GiB/zero swap/600seconds serially. Own payload
soft budget256MiB; protected historical evidence remains a separate exception.

Repository-source private execution may reuse that runtime's libraries; it is not
an installed-worker/release qualification. The preceding canonical worker payload
and its successful refresh report remain protected until an explicit refresh.
Source review, retained-byte audit, ROOT execution and physical release remain
separate evidence levels. Implementation and the finite ROOT qualification below are complete.
No public Smart+regional queue admission, frozen Retry, Add-as-Variant, release
or quality claim is made; PP-001/005/007/008 remain **«Пока не обещать»**.

## Executed result

ROOT ran **224 distinct affected Main cases**, including all68 new focused cases,
and **157 Python cases** (52 new original CPU/CUDA native cases plus105 selected
neighbors), with20 dependency deprecation warnings and no failures/errors/skips
in those accepted runs. Complete TypeScript/Vue typecheck, strict Python typing,
scoped ESLint/Ruff/format checks and app build pass. No UI source changed; no new
browser or installed-renderer qualification is claimed. Frozen source review R1
is independently **CLEAN**, within its source-only cooperative scope.

The isolated native mutations execute24 selections:20 GREEN and four intentional
semantic RED. A valid-shaped spatial permission shift fails both CPU/CUDA mapping
oracles after real processing PNG publication; identity-resolution controls stay
GREEN. Substituting a valid Current Canvas negative into the inherited regional
encoding fails the independently replayed native prediction oracle after PNG;
identical-negative controls stay GREEN. Each restored pair passes and all1590
isolated source files restore exactly. These mutations challenge consumption
rather than pretending a parser rejection proves native sensitivity.

Three genuine saved/reopened Main cases pass through real ModelService checks,
coherent capture/prepare/bind, actual CPU source/KEEP preparation, the unchanged
original Anima CUDA loader, private signed attention, native Heun/Wan, exclusive
processing RGB and the existing Main Smart world-output owner. Cases are fixed
base, one legitimate local-negative neighbor and exact repeat. Current Canvas
uses a deliberately different uninstalled Illustrious checkpoint, prompts, seed
and size; a magenta above-Patch Raster is excluded from the actual below-only
source. The world bbox is(-13,5,107,73), processing264×128, token grid17×8 and
KEEP33×16. Every complete recipe reaches Python unchanged apart from lossless
Uint8Array→JSON-array representation.

With20 configured Heun steps and strength0.5 the frozen plan owns19 native evaluations:
38 signed predictions/case, all28 original blocks and2128 original SDPA calls/case.
All six signed encodings, masks at their actual consumers, source/KEEP bytes,
borrowed registered state/metadata, reservations and CPU/CUDA RNG checks pass.
That preservation baseline begins after loading, around the borrowed adapter;
it does not claim that full model construction preserves global RNG.
Processing PNG is exact RGB from the original native image; world alpha is exactly
the existing final contribution and source/package/document/history/SQL/seed state
remain unchanged. Independent reopening finds47,959 changed processing RGB channels
and8,674 changed fully visible world RGB channels for the negative-only neighbor.
Only its local-negative encoding changes; the first positive prediction remains
exact and the first negative prediction changes. Repeat processing and world RGBA
are exact. This is causal file/output evidence, **not visual placement acceptance**.

Successful trained units take63.041–63.840seconds and peak at most9,254,584,320
host bytes within their12GiB/zero-swap/600second units. Recorded CUDA allocator
peaks are6,142,427,136 allocated and6,318,718,976 reserved bytes. They are measured
for this exact tested configuration; neither allocator fraction nor payload
arithmetic is a global capacity guarantee. The installed worker remains the
previous qualified payload. These calls reuse its libraries with explicit current
repository Python source, not a refreshed installed regional-Smart release.

### Attempts kept separate

The first small zero-region comparison failed because its ordinary control left
native Wan cache attributes behind. Adding the existing cache scope around that
control preserves every regional preservation assertion and exact pixel comparison.
Typing attempts before two casts and a private-usage annotation are excluded.
The first inheritance mutant used noncanonical empty spans; its four setup
refusals do not count as semantic RED. The corrected mutant uses a valid span.

A broad12-file native neighbor batch was stopped for bounded partitioning after
245 completed cases/48 warnings; its interrupted result is excluded from the
qualified counts. The separate105-case neighbor run completes cleanly. First
Main preflight incorrectly required an exact zero in soft latent KEEP; the
existing BICUBIC/BILINEAR preparation legitimately yields minimum7, maximum255.
The corrected oracle requires mixed editable/protected support, without changing
input pixels or numerical code. The next attempt's observer assumed positional
SDPA arguments, while current Diffusers supplies keywords; only that observer
changed. That one failed native attempt publishes no PNG and preserves borrowed
state. Only the following three successful trained cases enter acceptance.

Compact conclusions, source archives, pinned Invoke source, commands, original
harnesses/corrections, JUnit/log/resource records and verdicts are retained in the
run. No new model/runtime copy or download was made. Exact payload retention,
fresh exit/dependency checks and disposal are recorded separately below.

## Retention and release

Independent final source/document/retained-byte audit is **CLEAN**. It checks
1585 baseline/1590 qualification files,13 deltas/five additions,17 protected pins,
eight Invoke pins, the unchanged eight implementation/test files and the disclosed
native-mutation wording correction. It independently decodes66 Main PNGs and
confirms both RGB contrasts, repeat/source/KEEP/alpha controls, three IGS/SQLite
fixtures and26 migration hashes per database. It reads retained assertions and
results; it does not independently rerun models or certify physical release.

All6140 payload entries (4559 regular files,1457 directories,124 literal symlinks)
are preserved in verified `retained-payloads.tar.gz` with `payload-inventory.json`.
The complete isolated mutation source is R1-exact. Original commands, harness
beforeimages/corrections, input/leased-file mappings, packages/databases, output
PNG bytes and raw records remain reconstructible from that archive. Historical
payload paths in reports are no longer live. Restore only the recorded paths
under this run's `payloads` and the named short TMP root; restore model-source/
KEEP mappings before replaying a historical complete input, leaving its output
path free for exclusive publication. Existing shared model/runtime dependencies
and the previous successful installed refresh report stay protected.

ROOT separately confirms ended owned units, runtime idle, restored source and
completed readers, and no declared incoming candidate dependencies. The finite
same-user process scan finds no candidate cwd/exe/FD users; five sandbox PIDs have
permission-restricted FD inspection, reported explicitly rather than claimed as
fully inspected. Owned cgroups and native/CPU close receipts are independently
checked by ROOT. After these gates ROOT deletes only its exact `payloads` and
`t-asr-20261109` candidates. The deletion-only root interval is26,751,709,184 →
26,322,223,104 allocated bytes: **429,486,080 bytes actually reclaimed**, matching
the listed allocation. Compact evidence writes occur outside that interval.

The own256MiB payload soft budget was exceeded by retained test/rollback fixtures;
the lifecycle records that temporary exception and its now-closed disposal point.
No original model, shared runtime/catalog, ordinary application data or global
cache was removed. Lifecycle state is `retained`, with no remaining disposable
payloads and explicit dependencies for the next integration checkpoint.
