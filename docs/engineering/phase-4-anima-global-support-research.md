# Anima global-support mechanism experiment

## Question and current source

Base: `bcddfd538ab21467a0f5a563a0fe7a33201f5440`. The preceding
[local scene-cue experiment](./phase-4-anima-local-scene-context-research.md)
restores benches in 4/4 images but passes placement in only 1/4. It does not
identify a missing Anima implementation or reliable subject binding.

Re-read clean current InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `frontend/webv2/src/workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts`
  and `frontend/webv2/src/features/generation/core/canvas/{compileCanvasGraph,addRegionalGuidance}.ts`
  preserve literal regional texts and separate encoders.
- `app/invocations/anima/anima_denoise.py` independently adapts each context.
- `backend/anima/regional_prompting.py` assigns the uncovered background to
  global context on even blocks. Odd blocks remain unrestricted. Studio's
  existing private Anima preparation matches this mechanism.
- `backend/krea2/regional_prompting.py` already uses
  `background_mask | ~background_mask.any()` for unmasked conditioning: if
  regions cover the whole image, global text retains image-wide support.
  `tests/backend/krea2/test_regional_prompting.py` explicitly tests that case;
  `app/invocations/krea2/krea2_denoise.py` consumes that extension.

Anima has no corresponding toggle. This is an explicitly disclosed **cross-family
experimental adaptation**, not a missed-port repair or current Anima parity.
Only the Krea-2 image-query to global-text predicate can be adapted: its joint
text/image, text/text and image/image attention policy cannot be transplanted
unchanged into Anima's separate cross-attention architecture. The user was
informed before authoring the intervention. Production behavior is unchanged.

An authored background gap would remove regional eligibility while adding global
eligibility at the same queries. It cannot isolate global support by itself.
This experiment instead keeps every regional permission unchanged.

## Frozen comparison and bounds

Return to the original regional texts **without** the local bench tail:

```text
(red scarf)1.5, one white cat
(blue scarf)0.75, one white cat
```

Keep global positive `(two white cats)1.25 on one bench`, negative
`(blur)0.75, noise`, both seed values 123/124, 512² at (-13,5), 20 Euler steps,
CFG 4, CUDA BF16, exact trained bundle, compiler, all masks/owners and weights.
Four experimental assigned/swapped cases are followed by one original-policy
seed-123 assigned call after leaving the experimental scope. That fresh control
must reproduce its retained original RGB and stable native observations exactly.
Five fresh requests are the complete budget; no after-view tuning follows.

The masks cover all 1,024 sampled queries but are **not strictly complementary**:
left has 544, right 512, with a 32-query overlap caused by the authored alpha-128
boundary. This overlap is retained exactly. Background has zero queries. Only
524,288 entries in the global `[0,512)` columns become eligible; both regional
512-row ranges remain byte-exact. Odd, self and negative mask arguments retain
the original behavior. All encoded contexts remain exact controls.

The Boolean preparation has 1,572,864 elements; the 16-head expanded arithmetic
is 25,165,824, below the existing 33,554,432 ceiling. Existing geometry/text/model
bounds and the serial 12 GiB host/zero-swap/600-second/.75 CUDA allocator envelope
remain. Arithmetic and prior runs do not establish a new capacity guarantee.

## Entry points and acceptance

An artifact-only wrapper calls original Anima mask preparation first, preserving
its refusals and `None` path, then applies the existing Krea-2 fallback only to
the global range. Scoped preparation/oracle replacements restore on every exit.
No production profile, Main fixture, worker wire, sampler, queue, storage or UI
change is introduced. Current original processors, native SDPA, Euler, Wan decode
and exclusive PNG publication remain the consumption owners.

All five requests enter through freshly saved/reopened Main fixtures, actual
capture/planning/verification and complete unchanged handoffs. Prior four no-tail
regional and two ordinary controls are reused with exact descriptors and source
bridges. Their historical viewing is disclosed. Small checks cover full cover,
overlap, partial background, no effective regions, original refusal and scoped
restoration; the current original Krea-2 method supplies an independent subblock
oracle without claiming a whole installed Invoke application run.

Before visual assessment require exact authored/compiled inputs and all contexts,
initial latents and first negative prediction. Observe the adapted mask at all
280 positive-even cross sites per experimental request; every regional column
and all other mask arguments must remain exact. Each request still consumes
40 signed predictions, 20 Euler transitions, one decode and 2,240 observations
per processor/dispatch/SDPA collection. Subsequent hidden states and predictions
may change. Reopened RGB must match its own original native output; pixel
influence never creates an automatic visual PASS.

Freeze the prior separate placement, bench-presence and shared-continuous-bench
criteria. All four new scenes must pass the full-scene gate for finite visual
qualification. Count, scarf color/side, coat fidelity, fusion/leakage and seams
are recorded explicitly; narrow rubric PASS is not literal white-cat compliance.
A fresh no-history reader describes eight randomized original regional images
without specification/mapping. ROOT records anonymous facts before opening the
map. Previously viewed controls are not retrospectively called unviewed. Human
acceptance and general quality remain separate. All historical verdicts remain.

## Evidence status

Run: `runs/anima-global-fallback/20261108-krea2`. Frozen contract SHA:
`db4cc4c8873625e92c8964ad5ddc04b9f54102f4e957cc06178b32c520422c42`.
ROOT executes four small CPU source-oracle/refusal/restoration cases: **4 PASS**
in 1.34 seconds, with five native selections deselected. Five subsequent native
cases pass in 147.09 seconds, with the four small cases deselected. These are
**nine distinct executed cases**, no failures, errors or skips. The artifact
wrapper passes AST and scoped Ruff checks; no TypeScript, UI or production
source changed, so this checkpoint does not claim a new application typecheck
or browser run.

The native unit exits successfully after 148.269 seconds; observed cgroups have
no remaining physical PIDs. Host `MemoryPeak` reaches **12,884,901,888 bytes**,
the configured 12 GiB ceiling, with zero swap. The peak sampled observation
includes 8,477,102,080 anonymous and 3,972,284,416 file-cache bytes. Completion
within the cap is measured; available headroom and broader capacity are not.
No larger envelope, offload, model copy or environment provisioning is used.

All four interventions preserve whole authored/compiled inputs and contexts,
regional mask columns, overlap, initial latents and first negative prediction.
Each changes exactly 524,288 global eligibility bits and 280 positive-even cross
mask observations per collection. Other mask arguments remain exact. Original
consumers produce 200 signed predictions, 100 Euler transitions and five decodes,
with **11,200 records in each** processor/dispatch/SDPA collection across all five
requests. ROOT's original borrowed-state/tokenizer/RNG preservation assertions
pass; they are not independently rerun evidence.

The four first positive predictions change. Reopened RGB changes respectively
**385,806 / 419,960 / 490,441 / 479,925 channels** for seed-123 assigned/swapped
and seed-124 assigned/swapped. The fifth original-policy request exactly matches
its old stable native traces, terminal/decoded tensors and RGB/PNG bytes; zero
channels change. Thus the global-support intervention has a causal numeric
consumer, and its scoped restoration has a fresh original-policy control.
Visual usefulness is assessed separately below. Original external weights,
reusable runtime and parent evidence remain protected.

## Anonymous visual result — NOT_QUALIFIED

A fresh no-history reader describes all eight numbered originals without prompts,
assignment or mapping. ROOT separately records visible facts before reading the
frozen map. The descriptions agree; old-control exposure is disclosed. This is
bounded agent assessment, with human acceptance still separate.

| Experimental case | Visible result | Placement | Bench / shared-bench scene | Full scene |
| --- | --- | --- | --- | --- |
| Seed 123 assigned | Two cream/tan-marked cats, left red/right blue scarves, pale ground | PASS | FAIL / FAIL | FAIL |
| Seed 123 swapped | Two white cats, left blue/right red scarves, one continuous bench | PASS | PASS / PASS | PASS |
| Seed 124 assigned | Two white cats on one bench; left red scarf, right no visible scarf | FAIL | PASS / PASS | FAIL |
| Seed 124 swapped | White left/gray right cats on one bench, both red scarves | FAIL | PASS / PASS | FAIL |

There are now two cats in **4/4**, versus 2/4 before. Benches and shared-bench
support appear in **3/4**, versus 0/4. Placement remains **2/4**, and the complete
scene passes **1/4**; the all-four gate therefore stays **NOT_QUALIFIED**. Coat
deviations are explicitly recorded rather than called literal white-cat compliance.
The two earlier ordinary controls retain their prior PASS without new requests.

This isolated global-support intervention improves count/environment in this
finite scene and preserves the successful seed-123 scarf reversal. It does not
repair seed-124 attribute binding. Global availability is therefore a measured
contributor here, not a demonstrated sole cause or sufficient solution. The
cross-family predicate remains artifact-only; no production Anima default is
adopted and neither historical study is replaced. No further tuning or requests
follow viewing.

## Retained reproduction boundary

Five new original PNGs, six historical controls, eight anonymous byte-identical
copies, descriptions/map/rubric, loading/native/isolation records, commands and
source pins remain in the run above. The current nine Invoke primary files are
retained with revision/credit. `retained-payloads.tar.gz` verifies all **445 entries**
(406 regular files, 39 directories, no links), including five complete fresh
Main SQLite/IGS sets and all six historical input JSONs. Archive SHA:
`73469b4d5b4e984603d7d42b8b2470c79bea9b025c6e9f63929fd6b347e1675a`.

Two historical ordinary input paths are already retired in the parent run; the
new `ordinary-control-retention.json` explicitly bridges their exact bytes into
this archive. To replay, restore `payloads/` under this run and `short-tmp/` to
the recorded owned TMPDIR. Historical report paths are not current-live-file
claims. Independent final review and ROOT physical-release gates remain separate
from execution and visual assessment.

Public Anima Regional Guidance, spatial negatives/references, Smart/durable
regional publication, provenance/Compare/preset exclusions and PP-001/005/007/008
**«Пока не обещать»** remain unchanged regardless of experiment outcome.

## Final review and ROOT release

Independent frozen source/document/retained-evidence review is **CLEAN**: three
document paths, the complete artifact wrapper and original consumers, source/
Invoke pins, all 445 archived entries, five SQLite/IGS sets with 23 migrations,
ten mask projections and 19 PNG associations reconcile. Independent raw-byte
mask reconstruction confirms the exact global-only intervention; visual counts
and the resource-cap limitation agree with the reports. This review does not
rerun native execution or certify physical release.

ROOT then confirms both owned units inactive, all five task-owned readers ended,
source pins exact and no incoming candidate dependencies. Six non-owned desktop/
security services deny FD inspection; public process/cgroup identities and no
candidate command-line references are recorded, without bypassing or stopping
those services. This is a finite ownership gate, not a system-wide no-FD claim.

After exact archive/inventory re-verification, ROOT removes only this run's
`payloads/` and owned `t-agf-20261108` scratch, reclaiming **82,771,968 bytes** in
the measured deletion-only interval. Lifecycle becomes `retained`, with no live
payloads. Compact inputs/images/source/archive and protected dependencies remain.
This release appendix is ROOT self-verification after the frozen independent
review; the visual/default/public conclusions remain unchanged.
