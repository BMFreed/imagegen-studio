# Private positive pooled-source comparison

## Question and scope

Base: clean `33c5619caf474879eb77e56a535db4824d9ef087`. The preceding
[global token-support comparison](./phase-4-regional-guidance-global-support-research.md)
changed placement for one seed but did not qualify the full scene. It left the
global positive pooled vector unchanged. This experiment isolates the existing
positive pooled-source selection; no production mechanism or product default
is introduced.

Keep both global token coverages `Everywhere` and negative pooled source
`current-canvas`. Vary only `positive_pooled_source_id`: global, left mask owner,
or right mask owner. Each regional choice is a whole-image vector derived from
one regional text stream. It is not spatially local, neutral or a removal of all
global conditioning. Global text tokens remain eligible in the regions.

## Fixed input and parameter registry

Reuse genuine Main handoffs and targets from the original
[natural-text experiment](./phase-4-regional-guidance-visual-research.md), SHA-256
`f0af0349fe67b259772b5375da970d2b75c9b02d3ae65b888072af9863d62375`.
They remain historical saved/reopened/captured inputs, not a newly executed Main
producer. Keep exact official Illustrious v0.1 epsilon weights, runtime/config,
loading journal, CUDA manual-FP16 VAE, 1024×1024 bbox at (-13,5), seeds 123/124,
30 Euler steps, CFG 5 and Main false-ZTSNR/leading policy. No TI, LoRA, reference
images, adapters or dynamic prompts.

The global prompt describes the same red apple and blue ceramic mug scene.
Assigned/swapped variants change the same regional text associations as before;
no prompt, seed or mask is tuned after viewing. The left/right source names refer
to actual saved mask-owner IDs, so swapping the regional texts also changes which
text contributes each owner's pooled vector.

K stays 231; contexts, permissions, text inputs, time IDs and sampling remain
fixed within each source contrast. Largest expanded mask remains 18,923,520
elements under the existing 33,554,432 ceiling. Selection adds no conditioning
rows or encoder forwards. A bounded observer retains at most thirty [2,1280]
FP16 pool snapshots (153,600 bytes) per case, with hash-only output records.
This is observation scratch, not a model/table preservation copy.

Preregister fourteen native calls maximum:

- Eight targets: two seeds × assigned/swapped × left/right pooled owner.
- One fresh seed-123 assignment with the original global pooled source.
- One exact seed-123 left-pool assignment repeat.
- Two controlled ignored-pool fault/control calls and two restored calls.

The initial ten calls contain nine distinct numerical configurations and a
repeat. Other global-pool predecessors are reused pinned evidence, not fresh
completions. Serial units retain 12 GiB host / zero unit swap / 600 seconds and
CUDA allocator fraction 0.75. Initial inventory: artifact root about 14 GiB,
65 GiB disk free, host available about 23.31 GB, RTX 4080 16,376 MiB with
1,036 MiB used. Reuse one compatible runtime/catalog; no model/environment copy
or download. New compact evidence targets 192 MiB; existing protected proof
remains an explicit aggregate compact-budget exception.

## Independent expected value and native consumption

Reuse complete legacy Main/source validators, production loader, native loop,
output/publisher, preservation scopes and literal conditioning oracles. Pin the
new harness independently outside the legacy test filename census. The inherited
visual experiment contract is copied byte-exact and identified separately from
the new pooled-source contract.

Derive intended index 0/1/2 from the fixed case, independently of actual forwarded
arguments. Compute every signed stream with original CLIP/Compel. Expected
selected rows are global negative plus the intended positive stream's pool.
Require distinct global/left/right values so the choice is discriminating.
Check both signs at actual original UNet consumption on all thirty calls,
including failure reports, not only selected-source metadata.

The fresh global-pool control must match historical native observations and RGB
exactly. Regional choices preserve exact contexts, every per-stream value and
unselected pool, negative selected pool, permissions, time IDs, encoding counts,
schedule and initial latent. Only the assembled positive pooled row changes.
It may affect UNet queries immediately; first-query or prediction equality is
not required. Continue all 70 original processor/SDPA observations on each step.

A valid test-only forwarding fault passes `current-canvas` for an intended
left-owner case. The independent pool assertion must fail after genuine PNG
publication, global control remain GREEN, and exact restoration recover both.
This is sensitivity of a boundary oracle, not a discovered production bug or
source-mutation qualification. Mechanical PASS keeps visual status pending.

## Visual and evidence gates

View unchanged full PNGs. Compare recognizable objects, requested colors/count,
side exchange, leakage, physical coherence and repeated/malformed forms against
the fixed requirements. Obtain anonymous descriptions without intended labels
before joining the map. Neither changed RGB nor a correctly selected pool proves
useful placement. Report partial findings and inconclusive results explicitly;
agent assessment is not human acceptance or general trained quality.

## Executed numerical result

ROOT completed the fixed **ten initial cases: 10 PASS / 20 warnings**, including
the exact historical global-pool control and exact regional-pool repeat. All
eight targets consume their independently derived positive pooled vector, while
the negative vector remains exact. The three literal positive pools are distinct;
all thirty original UNet inputs match both expected sign values. Contexts, masks,
per-stream values, time IDs, encoding counts, schedule and initial latent remain
exact against the corresponding historical inputs.

The test-only ignored-pool target returns to the historical global-pool prediction
and RGB, publishes a genuine PNG, then fails specifically at the independent
owned-assembly pool assertion. All thirty positive values are the actual global
pool rather than the intended left-owner pool; all negative values remain correct.
The adjacent global-pool control stays exact GREEN. Both restored calls match
their own healthy records exactly. This adds **3 GREEN / 1 intentional post-PNG
RED / 8 warnings**, with no source mutation or production-bug claim.

Total: **14 actual native calls / 13 GREEN / 1 intentional RED / 28 warnings**;
420 original UNet calls, 420 Euler transitions, 14 VAE decodes, 14 published PNGs,
29,400 original processor/SDPA observations and 420 captured two-sign pool rows.
Completed qualified selections have no errors/skips. ROOT's native/state/RNG
observations remain separate from independent source and retained-data reviews.
Frozen source review is CLEAN; final documentation was outside its scope.

All eight source contrasts change predictions and RGB. Independently reopened
RGB8 differences against the corresponding historical global-pool image are:

| Seed / variant | Positive pool | Changed RGB channels | Mean absolute channel delta (0–255) |
| --- | --- | ---: | ---: |
| 123 assignment | left | 2,606,520 | 4.0684 |
| 123 assignment | right | 2,634,859 | 3.7703 |
| 123 swapped | left | 2,860,898 | 6.0526 |
| 123 swapped | right | 2,615,282 | 3.1887 |
| 124 assignment | left | 2,197,064 | 1.2040 |
| 124 assignment | right | 2,455,570 | 1.7864 |
| 124 swapped | left | 1,869,371 | 0.9546 |
| 124 swapped | right | 2,171,367 | 1.1350 |

These counts and deltas describe numerical influence, not perceptual quality or
correct placement. Strict Python typing and scoped Ruff check/format passed.
Four initial typing diagnostics required annotations/casts only; normalized
runtime AST and assertions are unchanged. No TypeScript or production source
changed and no new Main producer or ordinary counterpart is counted.

## Visual result: pooled choice alone is insufficient here

ROOT viewed all eight new full originals. A separate reader described all twelve
global/left/right comparison PNGs anonymously before seed/source labels were
revealed. Its retained report is explicitly a ROOT summary, not a verbatim
transcript or an independent prompt-compliance verdict.

| Cases, for both left/right pools | Observed result | Full visual gate |
| --- | --- | --- |
| Seed 123 assignment (2) | Several blue-white cups span both halves, two apples remain leftward, and a sideways cup has extra handle-like loops. | 2 FAIL |
| Seed 123 swapped (2) | Apple remains cropped at the left, cups remain across both sides; no required side exchange. The left-owner pool removes the old malformed utensil clusters. | 2 FAIL |
| Seed 124 assignment (2) | Red apple left and blue-white mug right, but apple remains suspended with an abnormal flattened underside. | 2 INCONCLUSIVE |
| Seed 124 swapped (2) | Apple remains upper-left, mug lower-right; the requested mug-left/apple-right exchange is absent. | 2 FAIL |

The full gate is **NOT_QUALIFIED: 0 PASS / 6 FAIL / 2 INCONCLUSIVE**. The narrower
identity-placement component is 2 PASS / 6 FAIL. Neither owner choice yields
side exchange for either seed. Pooled choice changes decoration, geometry and
some unwanted objects, so the result is not “no effect”; it does not fix the
main assignment failure under these conditions.

Global text-token support remained Everywhere. Regional pools with zero global
token support were not tested, and no interaction conclusion is established.
Ordinary baseline count/physics defects remain distinct. No prompt, seed, model
or mask tuning followed viewing. These bounded agent observations establish
neither human acceptance nor general Illustrious quality or a product default.

## Resource envelope and operational diagnostics

All native units retained 12 GiB MemoryMax, zero unit swap, 600-second deadlines
and CUDA allocator fraction 0.75. Maximum recorded host MemoryPeak was
8,058,798,080 bytes, including file cache. Timings include native observers,
state hashes and gold-record comparisons; they are not ordinary application
latency or maximum-capacity measurements.

The first six-case batch was too large for those measured timings. ROOT sent
SIGINT only to the verified owned main PID after three reported PASS, before the
fourth case reached a pipeline call. The unit exited 2 and is **not reported as
whole-unit GREEN**. Three completed per-case assertions, preservation witnesses
and PNGs remain accepted. The fourth raw record is KeyboardInterrupt during
pre-call preservation hashing: zero pipeline/UNet/Euler/decode calls and no PNG.
Its legacy `nativeCalls: 1` header is a planned value; actual observations are
authoritative. JUnit also contains one unnamed zero-time placeholder, excluded
from executed case counts. Raw records are not rewritten.

Remaining calls ran in fresh units with at most two requests each. No completed
native request was rerun and the fourteen-call ceiling stayed unchanged. The
initial unit finished in 520.204 seconds; subsequent unit times were 321.524,
367.153, 361.205, 350.522, 522.011 and 365.712 seconds. None exceeded its envelope.

During the fault phase the external orchestration/controller process ended with
SIGTERM/143. The existing systemd native unit continued under unchanged limits.
ROOT adopted that exact owned unit, retained its cumulative MemoryPeak, observed
normal completion (one intentional failure and one PASS), then confirmed physical
exit before launching restoration. There was no native restart. The recovered
anon/file sample covers only the adoption window; it is not a complete earlier
peak breakdown. These operational events are separate from the semantic RED and
from completed qualified-case error/skip counts.

## Retention and reproducibility

Evidence resides under `runs/regional-guidance-pools/20261031-signed-source/`:
the new `pool-contract.json`, inherited visual contract/input pins, baseline /
qualification / final source archives, loading journals, commands, complete
observations and JUnit/log/resource records, rebatching/adoption diagnostics,
all healthy/fault/control/restored phases, blind descriptions/mapping and the
separate visual assessment. Pool-contract SHA-256 is
`c6e16ce75ce48cfa613bf3af88f2195a8d9878ec6fe48cd05facf7bbe976bc6e`.
The exact checkpoint was rehashed before loading; runtime/config/catalog were
reused without weight/environment copies or downloads.

`retained-payloads-r1.tar.gz` preserves **74 entries / 43 regular files /
31 directories**, including fourteen PNG/target/thumbnail triples and the extra
target-only file from the interrupted pre-call attempt. Archive size is
18,539,405 bytes; SHA-256 is
`eeecc6912a08ea6922996e30b3b0032527f0773346e62895abf320d0d8bd1441`.
Full content/metadata and live inventory were verified before disposal, without
following links; no symlinks, FIFOs or hardlinks were present. Twelve original
comparison PNGs also remain directly available in `retained-png/` and the blind
pack. Historical output paths now resolve through the archive/inventory, not a
live disposable payload tree.

ROOT's fresh gate checked all twelve recorded unit attempts, actual physical
cgroup/process exit, unchanged 1,392-file qualified source, candidate handles,
incoming artifact dependencies and the completed four-reader source/image gate.
Pre-existing nondumpable desktop-service exclusions remain explicit; this is
not complete OS handle certification. A later fifth reader audits protected
retained data outside the retired payload tree. The deletion-only interval after
archival reclaimed **18,812,928 allocated bytes** at both run/root levels. This
is gross disposal, not checkpoint net storage. Source/runtime/config, predecessor
Main inputs and comparative PNGs remain pinned; lifecycle is retained with no
live disposable payloads. Audit scope remains distinct from ROOT execution and
physical-release observations.

## Next boundary

Investigate how global scene text and regional object banks are composed, while
retaining ordinary-scene calibration and these counterexamples. Changing the
existing positive pooled source alone, with global tokens still eligible, is
insufficient for this fixed scene. This result does not select a global support,
overlap, weighting or pooling default.

Public enabled-region NEW refusal, Smart target-only permissions, frozen Retry
independence, Regional provenance/Compare/preset exclusions, Main candidate
durability/Add/Save and Anima remain separate. PP-001/007/008 remain
**«Пока не обещать»**.
