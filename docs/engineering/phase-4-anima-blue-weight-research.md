# Anima single-scalar blue-weight control

## Scope and source

Base: `fabc84496a996fa544d031df548139896fcd7580`. This is the last fixed
visual diagnostic following the [global-support experiment](./phase-4-anima-global-support-research.md).
That experiment restores two cats in all four scenes and benches in three, but
placement still passes only at seed 123. Global support alone is insufficient.

Current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` provides the
existing weight mechanism, with its callers re-read before this experiment:

- `app/invocations/text_encoder/anima_text_encoder.py` parses authored attention
  and tokenizes cleaned text.
- `backend/anima/prompt_weighting.py` maps character ranges to actual T5 offsets,
  averaging tokens that cross a range boundary; special/zero-width rows remain
  neutral.
- `app/invocations/anima/anima_denoise.py` forwards each context's token weights.
- `backend/anima/anima_transformer.py` multiplies the unweighted adapter output
  by those token weights, before padding.

Studio's existing conditioning owner follows the same per-token mechanism.
The unequal authored weights are a plausible contributor, not a source-proven
cause or a demonstrated inference defect. No parser, model, worker, sampler,
composition default or production capability is changed.

## Frozen experiment

Change only the blue scalar, preserving the red value:

```text
old: (blue scarf)0.75, one white cat
new: (blue scarf)1.5, one white cat
red: (red scarf)1.5, one white cat
```

Global `(two white cats)1.25 on one bench` and `(blur)0.75, noise`, words,
regions/owners/alpha-128 overlap, exact trained bundle, CUDA BF16, 512² at
(-13,5), 20 Euler steps and CFG 4 remain fixed. The same byte-pinned, artifact-only
Krea-2 fallback from the preceding run is held constant. It is not current
Invoke Anima policy or a new production default.

Four fresh requests cover seeds 123/124 × assigned/swapped. The four preceding
fallback cases are exact controls. Their inputs and original PNGs are retained;
their previous viewing is disclosed. A random eight-image order and rubric are
frozen before new generation/viewing. No new prompt, seed, weight, model, mask,
policy, resolution or sampling search follows this attempt, regardless of result.

The existing Main test fixture authors the literal pair **before** real Save/
reopen/capture/planning. Complete handoffs remain unmodified afterward. The
artifact wrapper reuses native loading, conditioning, original processors/SDPA,
Euler/Wan, exclusive PNG publication and preservation helpers. Production code
and schemas remain unchanged. Serial host cap remains 12 GiB, zero swap,
600 seconds and .75 CUDA allocator fraction; the previous cap-reaching run does
not establish headroom. No model/runtime copies or provisioning.

## Discriminating evidence

Require exact cleaned text, actual Qwen/T5 IDs, attention masks, T5 offsets and
special-token metadata. Derive the old/new weights independently from actual
offsets and compiled spans. Record changed token rows rather than assuming the
entire blue context doubles: boundary-overlapping tokens can have averaged
weights, and special, neutral and padded rows stay unchanged.

Use the same held unweighted native adapter output to witness original-dtype
multiplication. Actual Qwen hidden states and unweighted output must remain
exact. Do not use a blanket two-times comparison of already-rounded weighted
contexts as the oracle. Require finite/representable results, exact red/global/
negative contexts, and changes only at the owning blue weighted rows.

All native mask arguments, regional support and the held fallback stay exact.
Initial latents and first negative prediction remain exact controls. Original
consumer association, decode-to-reopened-PNG equality, model/tokenizer/RNG and
scope restoration still apply. Semantic comparisons follow actual publication;
prediction/RGB changes do not imply visual PASS. The previous fresh exact
original-policy restoration remains retained; this study does not introduce a
new policy implementation.

A fresh no-history reader describes eight anonymous originals; ROOT records
visible facts before reading the map. Assess count, actual neck scarves/sides,
bench presence, one continuous shared bench, coat fidelity and visible fusion/
leakage/seams separately. All four must meet the same frozen full-scene gate for
finite qualification; ambiguous observations are INCONCLUSIVE. Human acceptance
and general quality remain separate. Historical results are never overwritten.

## Evidence status and stopping point

Run: `runs/anima-weight-balance/20261108-blue15`. Frozen contract SHA:
`936cb2bdf9a821f9a4e3d7bf8f5505af6274705644492c4cdb11f32f9ebc341f`.
ROOT runs **three small row-weight cases** in 0.13 seconds and **four native
cases** in 181.51 seconds: seven distinct PASS, zero failures/errors/skips. Each
selection deliberately deselects the other subset; those are not skips. The
artifact wrapper passes AST and scoped Ruff check/format. No production/TS/UI
source changes, application typecheck or browser qualification are claimed.

The native unit finishes successfully after 182.956 seconds with zero swap and
no remaining physical PIDs. `MemoryPeak` reaches **12,884,901,888 bytes**, the
configured 12 GiB cap. The peak sampled observation includes 8,572,776,448 anonymous
and 4,180,733,952 file-cache bytes. Completion within this cap is measured; no
memory headroom or general capacity claim follows.

All four whole genuine Main inputs change only the blue literal scalar and its
compiled weighted span, apart from operational identities. Actual Qwen/T5 IDs,
attention/special metadata and offsets, Qwen hidden state and the unweighted
native adapter output remain exact. In every case the affected T5/output rows
are **0 and 1**: weights become `[1.5,1.5,1,1,1,1,1,1]` from
`[0.75,0.75,1,1,1,1,1,1]`. Native BF16 multiplication from the same held unweighted
output matches both actual weighted outputs exactly. All neutral/special/padded
rows, global/red/negative contexts and mask records remain exact.

The original four image requests consume **160 signed predictions, 80 Euler
transitions and four VAE decodes**, with 8,960 observations in each processor/
dispatch/SDPA collection. Each core run records four actual prompt encodes;
supplemental old/new blue probes and old/new context oracles perform additional
encoder calls outside those core counters. They add no denoising/image requests
and have their own borrowed-state/RNG preservation scope. Both supplemental
and native preservation checks pass; ROOT observations are not an independent
runtime rerun.

Initial latents and first negative predictions remain exact; all four first
positive predictions change. Independently reopened RGB changes **348,924 /
389,693 / 401,082 / 433,852 channels**, in seed-123 assigned/swapped then seed-124
assigned/swapped order. Reused fallback preparation observations are exact,
with no source/policy modification. No new request follows viewing. Whole
control bytes, original external weights, the compatible runtime and prior
source/policy evidence remain protected.

## Anonymous assessment and diagnostic closure

A fresh no-history reader describes all eight original anonymous images without
intent or mapping. ROOT records visible facts before opening the map. The
observations agree; historical control exposure remains explicit. No independent
human acceptance is claimed.

| Balanced case | Visible result | Placement | Bench / shared bench | Full scene |
| --- | --- | --- | --- | --- |
| Seed 123 assigned | Two cream-white cats on pale ground, left red/right blue scarves | PASS | FAIL / FAIL | FAIL |
| Seed 123 swapped | Two white cats on one continuous bench, left blue/right red scarves | PASS | PASS / PASS | PASS |
| Seed 124 assigned | Two white cats on one continuous bench over snow, left red/right blue scarves | PASS | PASS / PASS | PASS |
| Seed 124 swapped | White left/light-gray or shaded right cats on one bench over snow, left blue/right red scarves | PASS | PASS / PASS | PASS |

Both conditions have two cats in 4/4. Placement improves from **2/4 to 4/4**;
bench/shared-bench presence remains **3/4**, while full scene improves from
**1/4 to 3/4**. The finite balanced-input placement gate passes. The frozen
all-four full-scene gate remains **NOT_QUALIFIED**, because seed-123 assigned
still omits the bench. Coat/lighting deviations are recorded separately rather
than described as exact literal white-cat compliance.

The one blue scalar is a measured contributor to scarf assignment in this fixed
scene. Equal authored coefficients do not make attention probabilities equal or
guarantee arbitrary subject/attribute binding. This is an authored-input control,
not an inference repair, automatic weight normalization or a new accepted default.
Earlier unequal-weight results remain unchanged.

**The present diagnostic branch is now closed.** No further prompts, seeds,
weights, resolution or sampling sweeps follow. The next owner is the explicit
Anima composition/acceptance boundary and integration with normal Generate,
frozen jobs and Results. This result does not itself choose a production policy,
activate Anima regional generation or waive the remaining full-scene limitation.

## Retained reproduction boundary

Four new originals, four exact fallback control PNGs and eight anonymous copies,
all raw/compiled handoffs, token-row/held-product evidence, native/loading records,
commands, source pins and the unchanged parent policy helper remain retained.
Twelve current Invoke primary source files retain revision and credit.
`retained-payloads.tar.gz` verifies **428 entries**: 396 regular files and
32 directories, no links, including four fresh Main SQLite/IGS sets and four
historical whole-input controls. Archive SHA:
`b0b29767d272ebd028e0228fd7938efcdd33301f9db454d16e83b1dfbc5f6f44`.
Replay restores `payloads/` under this run and `short-tmp/` to its recorded owned
TMPDIR. Historical report paths are not current live-file assertions.
Original external weights, the current reusable runtime and parent evidence
remain protected; native, visual, independent retained-byte and ROOT release
evidence remain distinct.

This attempt closes the present diagnostic branch. An unsuccessful visual result
requires an explicit acceptance/scope discussion before further calibration;
it does not silently start another experiment or change Anima defaults.
Public Anima regional jobs, spatial negatives/references, Smart/durable regional
publication, provenance exclusions and PP-001/005/007/008 **«Пока не обещать»**
remain unchanged.

## Final review, source revision and ROOT release

Independent frozen source/document/retained-evidence review is **CLEAN**: three
document paths, the full artifact and held policy helpers, 18 source pins,
12 Invoke primary files, all 428 archived entries, four SQLite/IGS sets with
23 migration hashes, eight mask projections and 16 PNG associations reconcile.
The reviewer independently reconstructs token weights and checks raw records/
pixels. Runtime held tensor products, model/RNG preservation and physical exit
remain ROOT observations; they are not independently re-executed.

During closing review the adjacent Invoke checkout advances from consulted
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` to
`ae06c1bd36218100f89a48ff5b8855751d06a898`, changing three prompt-editor/test
files. All 12 consulted mechanism files remain byte-exact to their frozen pins.
The experiment qualifies the retained consulted snapshot; no new unrelated
editor behavior is qualified here.

ROOT then confirms both owned units inactive, all four task-owned readers ended,
source pins exact and no incoming candidate dependencies. Six non-owned desktop/
security services deny FD inspection; their public identities/cgroups and absence
of candidate command-line references are recorded without bypass or termination.
This remains a finite ownership check, not a system-wide no-FD assertion.

After exact archive/inventory re-verification, ROOT removes only this run's
`payloads/` and owned `t-awb-20261108` scratch, reclaiming **73,785,344 bytes** in
the measured deletion-only interval. Lifecycle is `retained`, with no live
payloads. Compact inputs/images/source and protected dependencies remain. This
closing appendix is ROOT self-verification after the frozen independent review.
