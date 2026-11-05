# Installed InvokeAI tagged regional comparison

## Frozen reference

Base: clean `75a071b140482d3398cf624110894c6d2abcd30f`. The
[tagged Studio experiment](./phase-4-regional-guidance-tagged-visual-research.md)
retains two figures in all four outputs, with a conservative color gate of
1 PASS / 3 INCONCLUSIVE. This comparison submits the same four complete Main
inputs to the existing installed InvokeAI, before considering mechanism changes.
No fresh Studio generation, prompt/seed search or sampling sweep is included.

Contract `installed-invoke-tagged-regional-v1`, SHA-256
`f0aea133db94efb32a7b1087aa2173f378f4be33557ee44edbbf28d20b087bbc`,
permits exactly four native requests: assignment/swapped for seeds123/124.
Evidence owner:
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-invoke-tagged/20261105-red-blue`.
The complete retained Main handoffs and Studio PNGs are individually pinned.
They are reused unchanged; no fresh Main capture is claimed.

Global text remains:

> 2girls, anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight

Regional text remains `one woman with long red hair` and
`one woman with long blue hair`, exchanged between fixed left/right mask owners.
Empty global/local negatives, 1024², Euler/30, CFG5, zero rescale, embedded
untiled FP16 VAE and no TI/LoRA/references remain fixed. Register the original
official epsilon checkpoint in place, SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
6,938,040,760 bytes. Binary masks retain the complete bbox-local 1024² planes,
split at x512; a cropped 512-pixel upload is not equivalent.

## Source, application and isolation

Read current local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`,
including `features/generation/core/canvas/addRegionalGuidance.ts` and its
`compileCanvasGraph.ts` caller. Regional SDXL text is mirrored into prompt/style,
with original encoder connections and each conditioning's own mask.

The actual application is the user's existing **InvokeAI 6.14.3** environment,
whose source differs from that checkout. All 25 installed source pins still
match the [earlier actual regional reference](./phase-4-regional-guidance-invoke-assignment-research.md).
Read the effective installed Compel, alpha-mask, noise, denoise, image, model/API
and queue owners before using them. Their files are retained, not patched.
The earlier real API/queue driver and original-delegating observers are reused
with only new run/case/seed/interpreter plumbing.

Each case has its own agent-owned root, database, queue and outputs. The user's
Invoke catalog, history and configuration are unused. One isolated offline
cache copies only the 17 pinned configuration/tokenizer files; there is no
weight/environment copy, provisioning or download. The original model is
registered through the real model API with `inplace=true`.

The graph has 12 native nodes: the ordinary eight-node SDXL graph plus two
`alpha_mask_to_tensor` and two masked `sdxl_compel_prompt` nodes. Upload full
RGBA masks with `crop_visible=false`; original alpha conversion uses
`invert=false`, active at alpha>0. The binary masks are the common lane with
Studio's threshold policy. Global positive stays unmasked; empty local
negatives are omitted, with no auto-negative/inverted-mask branch.

One enqueue attempt per case; no automatic generation retry. Serial units have
12 GiB host limit, zero swap and 600-second deadlines. The existing reference
launcher selects CUDA allocator fraction0.75 and 8 GiB RAM/VRAM cache budgets.
These are operating guards, not capacity qualifications. Physical application
exit and remaining group PIDs are recorded independently of queue completion.

## Comparison and validation limits

This is a complete installed-application visual reference. Torch CUDA builds
differ; installed legacy `add_noise` initialization differs from Studio's native
`init_noise_sigma` path. Fresh tagged Studio noise/latent tensors were not
captured, so matching seeds establish neither noise equality nor inequality.
Actual Invoke scheduler configuration and timesteps are retained. Collector
ordering may permute complete context banks. No pixel/numerical parity or
single-factor cause follows from a cross-application image contrast.

The old apple/mug validator needs a historical independent Studio Compel oracle
that does not exist for these new tagged cases. It is not reused as a tagged
oracle. Model-free validation follows the new inputs through actual Invoke
mask/Compel/concat/native attention consumption and original decode-to-PNG
quantization, with that cross-Studio numerical claim explicitly excluded.
Transparent observers call original functions and return original results;
they add no replacement loop, tensor writes or extra native forwards.

Before the first application/native request, source review caught three unused
historical fields inherited while preparing the contract (`mainJson`, its hash
and `noiseComparison`). The initial draft is retained; those fields are removed,
noise comparison limits and inherited cohort/provenance clauses corrected,
with helper pins updated before execution.
This preparation correction causes zero native requests.

## Preregistered visual assessment

Reuse the preceding narrow count/color/association rubric. Each output needs
two recognizable separate figures, one in each half, with identifiable
red-left/blue-right for assignment and the reverse for swapped. Missing,
extra/fused figures or clear wrong association fail; ambiguous red/pink,
blue/lavender/gray or figure count is inconclusive. Keep unfinished drawing,
anatomy and seams visible in the report. No exact adult-age, complete prompt
compliance or general quality acceptance is inferred.

After all four Invoke requests, randomized unlabeled full originals from both
applications are described independently before the key is revealed. All four
new Invoke views must pass to accept the finite reversal gate. Human acceptance
remains pending. Do not change prompts, seeds, model or settings after viewing.

## Execution and retention

All four real queue items complete, with one enqueue each and zero extra
generation attempts. Recorded native totals are **120 UNet / 120 Euler /
four VAE / four original PNGs**, **8,400 original cross-attention calls** and
8,400 linked original SDPA calls. Observer error counts are zero. Actual
Euler/epsilon/scaled-linear/false-ZTSNR/leading configuration and grid
`958,925,...,1` pass post-publication checks.

Model-free validation passes: graph/queue/model/input association, actual
mask conversion, produced prompt/style/mask conditioning, concat selection,
all site counts and representative final native permission planes. There are
240 permission samples: the first successful cross-SDPA per step/grid, with
head equality. Later same-grid sites are counted, not independent mask samples.
Every reopened RGB byte matches independent quantization of its original FP16
decode. Pool/time-ID evidence ends at native concat; actual UNet added kwargs
were not observed. Invoke PNGs have native graph metadata and no ICC profile;
Studio originals retain their pinned sRGB ICC. No silent metadata normalization
or new cross-Studio numerical oracle is used.

Within each seed, raw noise, initial scheduler sample, timeline, global
conditioning/selected pools and fixed masks agree between assignment/swapped.
Both pairs change all 30 prediction steps. Seed123 changes 2,600,120 RGB
channels; seed124 changes 3,084,603. Collector order also changes in both pairs,
so these contrasts are not attributed uniquely to authored assignment. Changed
pixels and correct mask eligibility do not establish visual success.

The independent observer described eight randomized complete originals before
key reveal. ROOT applied the same conservative rubric as in Studio:

| Case               | Invoke blind ID | Visible hair left / right                       | Narrow verdict |
| ------------------ | --------------- | ----------------------------------------------- | -------------- |
| Seed123 assignment | 02              | Coral/salmon pink-red / pale blue-lavender-gray | INCONCLUSIVE   |
| Seed123 swapped    | 05              | Strong blue / rose-pink-red                     | INCONCLUSIVE   |
| Seed124 assignment | 06              | Crimson red / navy-slate blue                   | PASS           |
| Seed124 swapped    | 04              | Pale lavender-gray/pink-beige / vivid red       | INCONCLUSIVE   |

All four retain two separate head/body associations. Both applications have
**1 PASS / 0 FAIL / 3 INCONCLUSIVE**, reversal **NOT_QUALIFIED**. Studio's
paired blind IDs are07/01/08/03 in the same case order. The observer reports
similar compositions and ambiguous shades across corresponding applications,
with different contours, clothing and texture. Inconclusive shades are not
silently treated as primary red/blue. This is bounded conservative AI assessment;
human acceptance remains pending, and ROOT's self-review is not an independent
blind evaluation because ROOT had already seen the Studio originals.

The comparison supplies no evidence of a Studio-only mask-routing defect and
no reason for an attention rewrite. It does not prove all implementations
defect-free or identify the checkpoint/prompt as a unique cause. Further
visual acceptance needs a separately declared scene/checkpoint decision rather
than another mechanical repair or an undeclared adaptive search.

Units finish in 44.239 / 41.451 / 40.425 / 39.629 seconds. Their memory charge
peaks are 3,889,807,360 / 3,262,861,312 / 2,975,842,304 / 2,721,853,440 bytes;
swap peaks zero. Shared file-backed page accounting is not complete process
RSS or a capacity guarantee. Each application driver exits0, while all four
controllers retain **exit90** for an owned residual PID after server exit.
Stopping only the owned group leaves no physical PIDs. These operational flags
are retained separately from successful native completion; there are no retries.
Preparation, model-free validation and retention units exit0.

Actual helper AST and source preflight pass; this docs-only repository change
adds no TypeScript/Vue behavior and does not claim a fresh app test suite run.
All source/config pins, Main handoffs, submitted/accepted graphs, queue/model
records, native observations, original PNGs and blind descriptions are retained.
After fresh group/server/port/source/incoming checks and reader completion,
275 payload entries are archived and byte-verified before disposal:
**61,153,280 allocated bytes removed** in the deletion-only interval. This is
ROOT lifecycle evidence. The original checkpoint, installed environment, global
cache, previous evidence and privacy backups remain protected.

No Studio production implementation, public permissions, queue/durability,
UI or Anima behavior changes. Frozen-work independence, Smart permissions and
Regional provenance/Compare/preset exclusions stay intact. PP-001/007/008
remain **«Пока не обещать»**.
