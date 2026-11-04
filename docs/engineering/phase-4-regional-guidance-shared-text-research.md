# Private Regional shared-readonly text components

Status: private native qualification and ROOT release complete on dirty
`master@10115df581d9e07049478dee3866a280886794fd`, after the completed
[provisional output owner](./phase-4-regional-guidance-output-research.md).
Risk is high: this changes the ownership of model state used during exact TI.
Public admission and PP-001/007/008 remain **Пока не обещать**.

## Finite owner

Add two explicit private encoding profiles:

- `ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cpu-v1`
- `ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1`

Existing plain and fully independent exact-TI profiles retain their behavior,
defaults and copy arithmetic. High-level function signatures do not change.
The selected encoding profile determines the private copying strategy; callers
cannot independently supply a tensor bank, aliases, managers or strategy flag.
The existing reservation, resource snapshots, alias planning, real Compel
preflight, geometry, attention, Euler/VAE and PNG owners remain responsible for
their current transitions. No new public command, runner or loop is introduced.

The shared lane copies native modules, configs, mutable containers, registries
and tokenizer/backend state. Qualified non-token registered tensors are borrowed
as exact read-only objects. Both token Parameters and their storage are private.
The cooperative contract excludes in-place source/registry mutation and direct
concurrent forwards; reservations coordinate participating regional operations.
Sharing does not sandbox arbitrary Python callbacks.

## Final tables and original native loader

Complete resource/alias/real-length/geometry/support/consumer preflight before
allocating final token tables. Allocate each private Parameter directly at its
final planned vocabulary size, copy the source prefix exactly and zero the suffix.
Deepcopy the qualified graph with role-specific memo entries: approved non-token
tensors map to the originals; source token weights map directly to final private
Parameters. No intermediate old-sized token table or full backbone copy is needed.

Verify precise graph ownership before fixing any copied metadata. Modules,
configs, registries, tokenizer backends and other mutable containers must be
disjoint; only the planned non-token tensor/storage identities may intersect.
Then fix copied embedding row counts and copied vocabulary metadata. Execution
tokenizers still have the original vocabulary when loading begins.

The unchanged native TI loader expands names, requests base vocabulary plus all
alias rows, then registers names and writes vectors. Its original equal-row
resize returns the same final Embedding/Parameter/storage. This avoids native
replacement and mean-initialization tables. Verify that identity, the unchanged
base prefix and every loaded alias row before encoding. Encoding continues
through the unchanged producer and existing owned-conditioning/native consumers.

The new lane must refuse ZeRO-3, output embeddings, effective/cached tied-weight
maps, quantization, offloading and unsupported native call paths. Native
`EmbeddingBag` consumers also refuse: their max-norm forward can renormalize
shared position weights in place. This applies with and without active TI.
The shared lane admits exactly the qualified native CLIP text classes, Linear,
LayerNorm, Embedding, ModuleList and the two named native activations. Native
namespace membership alone does not establish readonly behavior: InstanceNorm
with retained running-stat buffers can update those buffers even in eval.
Unqualified consumers refuse before both private TI work and empty-ref forwards. Input embeddings
must be standard leaves with only their weight Parameter: recursive gradient
updates during native resize could otherwise mutate an auxiliary shared tensor.
All embedding consumers require `max_norm=None`; native renormalization can write
shared position weights even in eval/no-grad. Preserve exact capture/decoder
qualification and all duplicate-registration/storage-alias/custom-state refusals.

Scan every registered floating source tensor, including unused parameters and
nonpersistent buffers, for NaN/Inf in bounded views. Contiguity and exact storage
must precede flattening. Structural and source-byte limits precede finite scratch
and private table allocation. Shared identity cannot replace finite validation.

## Parameter register

| Parameter | New shared lane | Meaning |
| --- | --- | --- |
| Source registered CLIP payload | ≤4 GiB | Includes original token tables as well as the read-only shared subset |
| Final table admission charge | Final token table bytes +104 MiB ≤512 MiB | Logical engineering budget, not RSS/VRAM |
| Fixed metadata charge | Two 32 MiB graph ceilings +four 8 MiB tokenizer ceilings +8 MiB plan allowance | Keep individual graph/tokenizer/text/plan bounds; not a physical Python-heap guarantee |
| Finite validation scratch | At most existing 8 Mi elements per view | No whole-tensor flattening copy |
| Vocabulary/aliases/resources | Existing 65,536 /4,096 candidate /16 descriptor /600 total vector limits | No stream deduplication or fallback |
| Text, rows, geometry, masks | Existing separate limits | Both signs validated even for positive-only |
| Small native qualification | 3 GiB, zero swap, 600 seconds, serial | Reuse the current runtime |
| Full CLIP qualification | 6 GiB, zero swap, 600 seconds, serial | Explicit test-envelope decision based on source payload arithmetic |

Snapshots, normalized/converted TI vectors, model activations, native workspaces,
source residency and allocator reservations have separate lifetimes. At 49,408
base rows and 600 alias rows the final CPU tables occupy 409,665,536 bytes; FP16
halves that. The 104 MiB admission charge leaves this case below 512 MiB.
No allocator flush, model cache, extra environment or disk weight copy is planned.

## Evidence and acceptance

ROOT verified all 1,377 preceding source files. Two independent native mechanism
cases pass on CPU and CUDA: final-table memo replacement, precise sharing,
private token state, unchanged source/RNG, original loader/resize identities and
distinct real Compel contexts from the same text with different exact vectors.
These small random fixtures do not establish full architecture qualification.

The retained pinned offline config supplies CLIP-L 12 layers, width 768, MLP 3072,
12 heads and QuickGELU; CLIP-G 32 layers, width 1280, MLP 5120, 20 heads and native
GELU. Both use 49,408 vocabulary rows and 77 positions. CLIP parameter counts
123,060,480 and 694,659,840 imply 3,270,881,280 FP32 bytes. The new lane narrowly qualifies the exact native GELU state without widening
old profiles.
Seventeen exact config files are retained; no trained weights are loaded.

Required executable acceptance includes precise state/storage roles, no-op
original loading, legacy equivalence, source/owned budget refusals, embedding
leaf/max-norm/tie/ZeRO guards, finite-state refusals, partial failures, recovery
and unchanged source/RNG. A source-token memo mutation must fail at the ownership
boundary before writes, with an unaffected full-copy control. A wrong later
regional alias row must cause semantic RED at actual native consumption, with
an unaffected single-resource control and exact restoration.

Full architecture evidence must use actual full-size random native encoders,
streaming source hashes and bounded selected-row observers. Existing preservation
helpers that clone all source tensors or every token table are unsuitable.
Fresh complete Main recipes and verified transparent targets must reach real
CLIP/Compel, original regional attention, Euler/VAE and independently reopened
RGB PNGs. This qualifies full CLIP architecture mechanics with small UNet/VAE
consumers; trained weights/quality and full production SDXL capacity remain open.

ROOT evidence is under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-shared-text/20261026-final-table`.
Final ROOT runtime qualification and R3 source review are complete. Scoped
retained-byte closure and ROOT idle payload release are also complete. Public NEW refusal, target-only Smart permission,
published/frozen Retry independence and provenance/Compare/preset exclusions
remain unchanged.


## Executed qualification and corrections

ROOT's final qualified union is **282 PASS: 79 new cases + 201 unchanged exact-TI/
output neighbors + two whole-Main native cases**, with zero failures, errors or
skips and 168 warnings. The 77 small cases execute in fresh four-case shards;
the two full-architecture cases execute separately with explicit opt-in. Main's
fresh producer remains the real Service capture, coordinator/package, exact
ModelService resolution and target composer/classifier. All four complete
produced recipes are transported unchanged and consumed across both layouts and
devices. Strict Python typing r6 and scoped Ruff/format checks pass.

The 201 legacy cases ran before the two shared-only admission corrections.
Their profiles and independent-copy helpers remain byte-exact; final legacy
controls also execute after the corrections. This is a qualified union of
bounded runs, not a single 282-case process or a rerun of all historical suites.
The historical 1,399-case exact-TI and 77-case output checkpoints remain separate.

The full architecture uses 123,060,480 CLIP-L and 694,659,840 CLIP-G parameters,
3,270,881,280 FP32 parameter bytes, actual pinned 12/32-layer and 49,408-row
configurations, and the real pinned BPE tokenizers. Main has three enabled regions,
308 negative rows, 231 positive rows plus terminal padding, distinct same-literal
A/C resources, inherited B negatives, local D negative, absent/empty positives,
translated 40×24 geometry and literal soft-alpha permissions. Its independent
Compel oracle uses fresh tokenizer metadata and only ten saved/replaced/restored
suffix rows of the already-private execution tables; it creates no extra full
encoder or preservation clone.

Final Main evidence records **16 native requests, 240 actual CLIP forwards,
64 paired builds, 32 original loader/no-op resizes, 32 UNet/Euler transitions,
16 VAE decodes and 16 independently reopened RGB PNGs**. Each request has five
nonempty signs; native CLIP-G's pooled path adds a second forward, so 15 actual
CLIP forwards differs from ten sign/encoder combinations. Both Euler steps
consume the expected contexts, masks, pools and fixed time IDs. PNG RGB, dimensions,
ICC and completion correlation agree with independent conversion of the original
native output. Source graph/storage/config/tokenizer/RNG preservation is streamed.
R3/R4 native observations agree exactly despite the additional admission guards.

The two authored full-architecture cases add six requests/PNGs, including a valid
same-resource neighbor and one-step positive-only controls. Thus the full-size
CLIP matrix contains **22 PNG / 42 UNet / 42 Euler / 22 VAE**. These counts exclude
small-fixture forwards. Main's separate same-query A/C native attention contrast
establishes resource influence; its blur/noise branches also change the item seed.
No resource-only Main whole-image causality is claimed. The authored same-resource
neighbor and isolated vector mutation establish that separate causal boundary.

R1 independent source review found an admitted native positional `EmbeddingBag`
with max-norm writes. ROOT reproduced 59,136 changed borrowed values with active
and empty TI. The same regression produced two semantic RED and one standard
GREEN, then three GREEN after the shared-only refusal. R2 review found admitted
`InstanceNorm1d` retaining running buffers after `track_running_stats=False`;
ROOT reproduced both borrowed-buffer writes, with an independent-copy control
GREEN. R3 restricts shared consumers to the exact fourteen qualified CLIP/native
classes and refuses InstanceNorm before private allocation or any empty-ref
forward. The same three-case regression then passes; the legacy copy control
executes the original normalization against private buffers. R3 independent
source-only correction review is **CLEAN**, with no independent runtime rerun.

Initial setup/fixture failures remain retained and excluded: pinned config creates
FP16 parameters even on CPU, requiring explicit fixture placement before borrowing;
the first full-CPU opt-in environment was not forwarded by the systemd launcher;
new positive and negative GELU fixtures needed `.eval()`; the first added one-shot
fixture cloned source tensors inside the no-copy observer and was replaced by a
direct frontend call with equivalent explicit inputs. The Main probe's initial
forward-count and manager-view errors were corrected without weakening its literal,
vector, attention, lifecycle or pixel oracles. Early pre-execution wrapper/decode
identity assertions were aligned with the existing native ownership contract.
These are not product passes or semantic RED evidence.

## Isolated mutation and restoration

The final source archive contains 1,379 members. Two isolated mutations use that
exact restored checkout and leave production source untouched:

- Token memo: substitute the source token Parameter for the final private
  Parameter. For CPU/CUDA, ownership refuses before metadata writes or loading;
  legacy independent-copy controls remain exact.
- Regional vectors: after complete normal loaded-row validation, copy global A
  vectors into only the later regional B alias. Actual CLIP/attention contexts
  change only in that positive stream. First queries, masks and selected global
  pools stay exact; blocked-query and opposite-sign first-attention outputs remain
  exact, while permitted attention, native prediction, image and RGB change.
  The mutant PNG equals the legitimate same-resource neighbor. RGB differences
  are **308 CPU / 590 CUDA channel bytes**; single-resource controls remain exact.

Each mutation records **4 GREEN → 2 semantic RED + two controls GREEN → 4 restored
GREEN**. All raw control/restoration observations match; all 1,379 source members
restore byte-exact. The initial wrong-root collector error remains a distinct
excluded setup attempt; its source checkout was verified before reuse.

No trained weights, production-size UNet/VAE, public dispatch, durable candidate,
acceptance, Save, provenance or release-readiness qualification follows. Existing
CPU/CUDA, one/two-step Euler, geometry, text, resource, row and mask limits remain.
There is no new fallback, cache, resource resolver, capture/planner, protocol,
composition default, queue behavior or denoising loop.

## Retention and handoff

The immutable-input audit verifies 17 pinned config/tokenizer files, 20 retained
native sources, twelve Main fixtures (eight synthetic TI, two IGS, two immutable
SQLite databases), all nineteen migrations, four complete recipes and six target/
control PNGs. Config, source, generators, resource bytes and native/runtime pointers
remain protected. Final candidate inventory contains **108 paths / 3,080 lstat
entries / 58,130,432 allocated bytes**. Its 814 non-checkout files map to **96 CAS
blobs / 6,855,279 content bytes**; mutation source is retained in verified archives.
The final candidate retained-byte/dependency audit is **CLEAN** within that exact
scope; it does not independently rerun native behavior or authorize deletion.

ROOT then checked all 41 recorded bounded units as inactive with no remaining
PID/cgroup users, scanned current processes/CWDs/candidate file descriptors,
rechecked all 3,080 inventory entries and source restoration, and checked global
incoming lifecycle/runtime/provision/delivery metadata (209 files, zero external
candidate dependencies). All seventeen then-existing delegated tasks/readers were
terminal with no pending child work. Source/doc/protected gates also passed.

ROOT removed exactly **108 candidate paths**, all now absent. Measured artifact-root
allocation changed **6,876,139,520 → 6,818,009,088 bytes**; run allocation changed
**128,638,976 → 70,508,544 bytes**. Both cleanup-interval reductions are exactly
**58,130,432 bytes**. Subsequent final source archives/metadata add retained bytes;
this is not a net-space claim for the whole task. Lifecycle is `retained`, live
payloads are empty, and archives/CAS/Main PNGs/configs/native sources plus the
existing external runtime and reciprocal baseline dependencies stay protected.
The local 100 MiB aim was exceeded temporarily for source/mutation evidence;
post-release compact retention returns below it. No model/environment copy,
original application data or global cache was removed.

Raw failed setup attempts, both reproduced readonly findings, their unchanged
controls, fixes, semantic mutation phases and exact restoration remain retained.
Finalization changes only these three documentation additions; all four Python
module/test delta files remain R3-exact and prior document bodies/protected
product promises remain unchanged.
