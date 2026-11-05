# Global LoRA stack with Regional Guidance

Base: `7662a335e8366dfaf8280214a94b7e136b42bbd7`. High risk: exact model
resources, native preparation, queue/Retry and portable accepted settings.
Public scope is the existing Illustrious epsilon Current Canvas route, static
1..32 jobs, Euler/Euler a Normal and exact global/regional TI. Global LoRA rows
apply to all conditioning and the UNet. Regional-per-owner LoRA is not introduced.
PP-001/005/007/008 and existing visual/human/Anima/release limits stay unchanged.

## Current Invoke mechanism and adaptation

Current local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` was read directly:
`frontend/webv2/src/features/generation/core/graph.ts`,
`core/canvas/addRegionalGuidance.ts`, `app/invocations/model.py`,
`app/invocations/text_encoder/compel.py`, `app/invocations/sd/denoise_latents.py`,
`backend/patches/layer_patcher.py`, `patches/layers/lora_layer.py`,
`lora_layer_base.py` and `backend/util/original_weights_storage.py`.
The graph sends one ordered collection into CLIP1/CLIP2/UNet; regional nodes
inherit those encoder edges. CLIP LoRA precedes TI and Compel; UNet LoRA spans
the native denoising loop.

Invoke direct patching computes `up @ down` in FP32, multiplies by
`weight * (alpha / rank)`, reshapes, casts to model dtype and applies each stack
entry with an out-of-place addition. Its standard scope restores through a new
copy, changing storage identity; its sidecars need Invoke custom module classes.
Neither can be used verbatim inside Studio's borrowed native-class/identity
contract. Ordinary Studio PEFT application likewise changes module classes.

The chosen adaptation applies that exact Invoke numerical core **once to the
fresh worker-owned pipeline before regional borrowing**. Loading receives a
separate blank-prompt, LoRA-empty parameter copy. Existing ordinary exact-byte
snapshots and complete Kohya/native-target qualification are reused, but ordinary
PEFT application remains unchanged. All files/targets qualify before any weight
update. Enabled zero is qualified and recorded, then numerically skipped, as in
Invoke. Nonfinite scales, FP32 residuals, dtype casts or updated weights refuse.
The pipeline's native modules/Parameter objects remain; preparation changes
owned weight storage. The borrowed baseline starts after preparation. Failure
discards this job-owned pipeline; no atomic rollback or generic borrowed-LoRA
runner API is claimed.

Only after successful preparation does a detached execution command lose its
LoRA list. The logical command, context and frozen worker payload retain it.
Original recipe/text reach the existing TI/Compel/native attention/Euler/VAE
owners. No LoRA field is added to the regional recipe, no denoising loop is copied,
and no private/ordinary profile is silently promoted.

## Main ownership and capability

Reuse `loraStack` for the full configured stack, including disabled unavailable
rows; `loras` for the verified enabled subset; and `workerJob.loras` for ordered
thin path/SHA/byte-size/weight descriptors. Existing `frozenLoraFieldsAgree` checks
full reference identity, order, exact signed weights and path/size agreement.
Default and current draft edits do not select replacements. Zero is enabled;
disabled missing/unknown-family entries are portable authoring data, not loads.

The additive `illustrious-regional-lora-v1` capability requires qualified current
worker0.14 and the public regional owner. Existing ordinary LoRA support alone
does not grant it. `regionalLoraSupported` is an optional fail-closed action-state
field. Generate/capture gates run before composition, Retry uses the original
frozen stack, and dispatch/client gates precede transport. Queue details derive
the Retry requirement from frozen worker LoRAs, not the edited Project.

Reverify exact saved LoRAs before regional staging/files/SQL admission, before
Retry SQL and at dispatch. Preserve atomic replacement and independent per-item
Retry. Public request parsing admits the existing descriptor format; private
nonempty stacks remain refused. Native bundle LoRAs remain logical until the
worker-owned preparation succeeds; global-TI native projection stays separate.
Accepted base provenance retains the full original configured LoRA stack and
consumed global TI, excluding regional and operational state.

## Parameter register and acceptance

Existing bounds remain: 1 MiB native bundle, 64 MiB raw alpha, 32 jobs, three
regions, 16 signed TI descriptors, 64 MiB unique TI resources, 300 TI vectors per
sign/600 total, 308 emitted rows per sign, 512 MiB owned-text arithmetic and
4 GiB source-CLIP payload. No LoRA weight range is synthesized: finite signed
weights, including zero/tiny values, keep their meaning.

New separate defensive **LoRA** admission decisions:

| Parameter                     | Value and basis                                                                                                                                 | Refusal                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Unique serialized LoRA inputs | 512 MiB aggregate including headers; adopts the prior ordinary-stack probe's per-snapshot safety size as a bounded aggregate for this new route | Before model loading/publication where declared sizes suffice |
| Largest target work payload   | 512 MiB; conservative `4*(up.numel+down.numel) + max(8*N, (4+2*model_element_size)*N)` for FP32 pair/residual plus multiply/cast/add scratch    | Before patch allocation/write                                 |
| Configured/source count       | Existing 10,000 defensive document ceiling, also constrained by existing JSON/transport limits                                                  | No claim that 10,000 inference LoRAs fit                      |
| Execution envelope            | Serial aggregate12GiB host, zero swap,600s unit, existing CUDA allocator policy                                                                 | Operational safety, not capacity qualification                |

These are payload/work bounds, not measured peak RSS/VRAM. Whole-stack low-rank
state is retained for qualification; snapshots are read sequentially and released.
Patch work is one target at a time on the already-owned model, so original plus
all dense patched-model copies are not retained. No model/environment copy,
offload fallback, global seeding or public default change is planned.

Acceptance uses real Main capture/planner/queue/receipt/provenance and a separate
small native suite with actual CLIP/UNet consumers and independent Invoke
arithmetic oracles. Cover LoRA+TI, signed/order/zero semantics, disabled missing
rows, wrong identity even for shared bytes, later-stack failure, old-worker refusal,
frozen Retry after saved edits, source isolation after preparation and recovery.
Semantic mutations remove actual CLIP2/UNet application or pre-SQL Retry/resource
capability checks, with empty-stack controls and exact source restoration.

The installed fixture reuses the canonical runtime/catalog/official Illustrious
v0.1. Four tiny authored Kohya files target native UNet convolution and both CLIP
attention projections; distinct rows/columns avoid constant-vector oracles.
Saved `[A:+0.7, B:-0.5, Z:0, missing:disabled]` retains order, while alternate A2
is Default. One UI batch123/124 completes123, cancels124 after real steps5/6,
saves changed stack/TI/sampling/regions, and explicitly retries frozen124. Exactly
three wires/two PNGs then Results/Add1/Discard1/two-session tombstones/Undo/Save
ZIP/reopen. Distinct-seed PNGs prove association, not LoRA sensitivity; native
causal tests are a separate evidence boundary.

Evidence directory: artifact-relative
`runs/regional-guidance-global-lora/20261106-owned-prepare`.

## Executed evidence and limits

ROOT executed **460 distinct Main PASS**:147 focused neighbors,24 new exact-stack
cases and289 affected queue/controller/worker/staging/Retry cases. Genuine Main
Service/capture/planner/SQLite/files/receipt/provenance are exercised; the lower
Main suite explicitly substitutes model verification/composition/native output.
Python: **247 distinct PASS**:57 new small native CPU/CUDA cases and190 ordinary
LoRA/protocol/regional-worker neighbors (seven neighbor warnings). The native
tests use actual dual CLIP, Compel, native attention and UNet predictions, including
LoRA+TI and preservation after owned preparation. Full TypeScript typecheck,
scoped strict Python typing, ESLint/Prettier/Ruff and fresh app build pass.

Four isolated mutations run36 selections: **30GREEN/6semanticRED**, then exact
restoration of all1,488 copied source files and unchanged live source. Removing
CLIP2 application fails at actual native attention context; removing UNet
application fails at native prediction, separately on CPU/CUDA. Capability and
pre-SQL frozen-resource checks fail their Main targets; neighboring controls
remain GREEN. Independent source reviews and completed retained-evidence audit
are CLEAN; they read source/records and do not independently rerun ROOT execution.

Installed **native-r1:16 grouped PASS /277.961s**. The default RuntimeManager uses
the canonical noneditable worker0.14, refreshed in place with51 Python modules
and the additive capability. Original official Illustrious v0.1, configuration,
runtime and existing catalog are reused. Exactly three regional wires produce
two completed receipts/PNGs and one canceled attempt, with66 original scalar
progress events. Batch123/124 completes123, Cancel124 observes steps5/6, saved
LoRA/TI/sampling/seed/region edits remain separate, and explicit Retry consumes
the original frozen124. Both independent PNG readbacks, Results, reviewed
cross-session Add1/Discard1, tombstones, Undo/Redo and two Save ZIP/reopens pass.
Accepted provenance retains the original configured LoRA stack, including the
disabled missing row, and consumed global TI; the edited current draft remains
saved separately. Prior SQL/business records, packages and candidate bytes remain
preserved; normal Home index timestamps and two receipt-counter increments are
explicit. Different seeds do not establish installed LoRA numerical causality.

Excluded diagnostics remain retained: the obsolete blanket-LoRA expectation,
one optional assertion-message typing error, a Ready-list literal missing the
new capability, and native observer assumptions that incorrectly required TI
copies in the no-TI branch or missed decorated builder aliases. These required
test/oracle corrections, not production repairs. The57-case native run predates
the final type-only annotations and prediction-assertion ordering; later mutation
baselines/restorations exercise the corrected causal selectors. No claim of a
new full57-case rerun follows. An idle-check invocation from the wrong working
directory refused before retention; the correct post-run check passed.

No trained-LoRA quality, visual/human acceptance, Anima, arbitrary adapter formats,
capacity or release qualification follows. Owned preparation can partially write
before a numeric refusal; the fresh pipeline is discarded rather than repaired.
The borrowed execution contract begins only after successful preparation.
PP-001/005/007/008 statuses and provenance exclusions remain unchanged.

## Retention and delivery

The source freeze, mutation originals/patches/RED/control/restoration, native
reports and original PNGs are retained. Both own payloads and external reproduction
inputs are archived and verified without following symlinks. Inputs include a
consistent SQLite backup, final packages, own frozen queue inputs and all four
authored LoRAs/four TI files. The single current runtime/catalog/checkpoint,
managed fixtures and worker-refresh companion remain protected for future work.
Independent retained-byte/input audit is CLEAN:1,569 own entries plus30 external
input entries verify; SQLite integrity/FK and all21 migration hashes match source.
Both original PNGs and all three packages independently reopen; the accepted
Raster matches its own seed123 output. The audit reads records/bytes, not runtime.
After fresh physical exit,29 completed-unit checks, full source restoration,
243-lifecycle incoming checks and all-reader completion, ROOT removes exactly
`native-r1` and `mutation-source`: **43,130,880 allocated bytes** reclaimed during
the deletion-only interval. Archives retain their complete original bytes;
historical raw paths are reconstruction links. Lifecycle is `retained`, with no
remaining disposable payloads. Shared fixtures/runtime/companions remain pinned.
