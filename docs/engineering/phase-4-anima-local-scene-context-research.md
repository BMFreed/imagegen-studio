# Anima authored local scene-context experiment

## Source and question

Base: `ea3b44c88448c3eabd97ea8e9c5009e4223d58bf`. The
[fixed visual retest](./phase-4-anima-visual-retest-research.md) still produces
two correctly placed scarfed cats at seed 123, one red-scarfed kitten at seed 124
and no bench in any regional image. Both ordinary controls retain two cats on
a bench. This result does not identify a missed port mechanism or one cause.

Re-read current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `frontend/webv2/src/workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts`
  reads the authored regional positive literally.
- `frontend/webv2/src/features/generation/core/canvas/{compileCanvasGraph,addRegionalGuidance}.ts`
  passes that text to its own encoder and copies encoder connections. It does
  not append the global text; the special enhancer is for another architecture.
- `app/invocations/anima/anima_denoise.py` independently prepares each adapter
  output, then concatenates contexts rather than prompt strings.
- `backend/anima/{regional_prompting,anima_transformer_patch,conditioning_data}.py`
  retains background-only global support in masked even blocks and unrestricted
  odd blocks. These half-canvas masks cover the image.

There is no omitted automatic global/local concatenation or Anima Everywhere
switch to copy. This checkpoint changes **authored test data only**, through the
existing regional text mechanism. It is not an Invoke prompt recommendation or
a new application inheritance/default policy. No mask, attention, worker,
sampler, protocol, queue, persistence or public capability changes.

## Frozen one-axis experiment

Append exactly ` on one bench` to both existing regional texts:

```text
(red scarf)1.5, one white cat on one bench
(blue scarf)0.75, one white cat on one bench
```

Keep global positive `(two white cats)1.25 on one bench`, global negative
`(blur)0.75, noise`, local one-cat wording, color weights, mask owners/revisions/
bounds/alpha, current compiler, exact trained bundle and CUDA BF16 pipeline.
Geometry remains 512² at (-13,5), 20 Euler steps/CFG 4, seeds 123/124. Swap exchanges
the whole authored strings. Copying the full global prompt would also add
`two white cats` and its weight to each region, confounding this first test.

Four fresh cases cover both seeds and both assignments. Retain the preceding
four regional images and two ordinary controls with exact source/input bridges.
The old controls were viewed in the previous assessment; the new hypothesis is
based on that known result. The new text, matrix, anonymous order and stop rule
are frozen before any new generation/viewing. A fresh no-history reader receives
eight anonymous regional originals; ordinary controls remain separate historical
evidence. This is not a retrospectively preregistered hypothesis for the old study.

Report placement, visible bench and full shared-scene coherence separately:
two distinct cats with correctly placed real neck scarves must share **one
continuous bench** with plausible contact/perspective for full-scene PASS.
Two separate benches, a panel collage, missing cat/scarf or serious fusion fail
that complete-scene axis. Missing bench does not retroactively change old
placement PASS. Ambiguity is INCONCLUSIVE; human acceptance remains separate.
Require all four new targets for finite full-scene qualification, while reporting
every partial outcome. Stop after four requests regardless of outcome; no new
prompt, seed, weight, model, step or composition search follows viewing.

## Genuine Main and causal ownership

The test fixture gains an opt-in pair of literal regional texts. It detaches and
validates them synchronously through the existing compiler before filesystem/
SQL work. Missing override preserves the existing texts, branch semantics and
handoff shape. Selected values enter actual authoring **before** Save/reopen,
capture, planning and compilation. No captured recipe is edited afterward.

The artifact wrapper reuses the unchanged trained native owners with explicit
seed/variant keys. Global and negative contexts, mask permissions, initial noise
and the first negative prediction remain exact controls. Regional context
changes are observed through the original consumers. Later negative predictions
may change along the new trajectory; outside-mask final pixels need not match.
The original PNG is written before intervention/association comparisons.

This tests the effect of one concrete authored addition. It does not establish
the sole cause of prior scene loss, isolate word meaning from token changes or
qualify general image quality. The prior NOT_QUALIFIED record stays unchanged.

## Evidence and limits

Run: `runs/anima-scene-context/20261108-bench`. Contract SHA:
`cba3feedc6820b5fd0d0f06271efbb1133496e838cdff6e9976b61a821825b0b`.
The pre-generation addendum explicitly records previously viewed controls.
Use the same reusable worker runtime and original external model files with the
serial 12 GiB/zero-swap/600-second envelope and CUDA allocator fraction 0.75.
No model/runtime copies, downloads or extra capacity claim. Static/source,
ROOT native measurements, blind descriptions and retained-byte verification
remain separate.

### Executed mechanics

ROOT ran **60 Main cases**, including 17 appended cases, with no failures or
skips. Scoped ESLint and full `pnpm run typecheck` pass. The first typecheck
identified 11 optional-field diagnostics in the new assertions; type-only
non-null assertions resolve them. Canonical emitted JavaScript and the original
17,890-byte test prefix remain exact. The diagnostic attempt stays retained.

The four native cases pass in 131.81 seconds of pytest execution. The bounded
unit exits successfully after 133.157 seconds, with no remaining physical PIDs,
8,926,568,448-byte host memory peak and zero swap. This is one measured run,
not a capacity promise. The original loading witness covers all 1,189 persistent
destinations. Across the four cases, original consumers execute 160 signed
predictions, 80 Euler transitions and four VAE decodes. Each of the processor,
dispatch and native SDPA collections contains 8,960 self/cross-attention records.

All four whole Main handoffs differ from their controls only in the declared
authored tail and operational identities. Global positive and negative contexts,
permission records, initial latents and first negative prediction are exact;
regional contexts and first positive predictions change. Reopened RGB changes
480,465 / 484,359 / 764,149 / 772,204 channels for seed-123 assigned/swapped and
seed-124 assigned/swapped respectively. Pixel changes establish influence, not
visual success. No extra generation or intervention follows viewing.

Fresh independent source review is **CLEAN** for the two TS files, 17 appended
cases, artifact wrapper and direct Invoke callers. That review performs no
runtime or image inspection; it does not independently certify ROOT's run.

### Anonymous visual assessment — NOT_QUALIFIED

A fresh no-history reader describes all eight numbered original regional PNGs
without intended prompts, assignments or mapping. ROOT then records visible
facts before opening the frozen map. The observations agree. Historical control
exposure is disclosed in the pre-generation addendum; only the four new images
were previously ungenerated and unviewed. Human acceptance remains separate.

| New case | Visible result | Placement | One shared bench scene | Frozen full-scene gate |
| --- | --- | --- | --- | --- |
| Seed 123 assigned | White red-scarfed cat near center-right, smaller orange/white sleeping cat left; no blue scarf | FAIL | PASS | FAIL |
| Seed 123 swapped | White red-scarfed cat near center-right, smaller orange/white cat left; no blue scarf | FAIL | PASS | FAIL |
| Seed 124 assigned | One white red-scarfed cat reclining on a bench | FAIL | FAIL: second cat absent | FAIL |
| Seed 124 swapped | White blue-scarfed cat left, orange tabby red-scarfed cat right on one continuous bench | PASS | PASS | PASS |

The last image meets the frozen count/scarf/side/shared-bench rubric, but its
orange coat contradicts the authored white-cat description. That deviation is
reported separately rather than adding a new post-view criterion. It is not
complete literal prompt compliance.

Bench presence rises from **0/4 to 4/4**, shared-bench support is **3/4**, while
placement falls from **2/4 to 1/4** and the frozen complete-scene gate passes
**1/4**. All-four acceptance therefore remains **NOT_QUALIFIED**. The two prior
ordinary controls remain visual PASS without new requests. The previous study
and its verdict are unchanged.

Adding this specific local cue restores recognizable furniture in this finite
comparison, but does not reliably preserve subjects or assignments. It neither
isolates a sole cause of prior bench loss nor justifies automatic global/local
concatenation, a new default or general Anima visual readiness. The next separate
mechanism investigation should distinguish global support/composition from
subject binding using current Invoke sources; further prompt tuning is not part
of this completed experiment.

### Retention and replay

Original four new PNGs, six historical control PNGs, eight unchanged anonymous
copies, descriptions, frozen mapping/rubric, full Main handoffs, loading/native/
isolation reports, diagnostics, source pins and commands remain retained under
the run above. `retained-payloads.tar.gz` preserves all **537 scratch entries**
(505 regular files, 32 directories, no links), including four fresh Main
SQLite/package sets and historical whole inputs. Archive SHA:
`e2a0185698195076e8db98bd71393000cec5db16411cd008be49e8067c16eb45`.
To replay the artifact wrapper, restore its `payloads/` members under the
original run and `short-tmp/` at its recorded owned TMPDIR; historical report
paths are not live-file claims. External original weights, the reusable worker
runtime and both parent evidence sets remain protected. Final source/retention
review and physical-release bookkeeping are separate from native and visual
acceptance.

Public Anima Regional Guidance, spatial negatives/references, Smart regional,
durable regional candidates, provenance/Compare/result-derived-preset exclusions
and PP-001/005/007/008 **«Пока не обещать»** remain unchanged.

### Final review and ROOT release

Independent final source/document/retained-evidence review is **CLEAN**: five
before/after files, source/Invoke pins, all 537 archived entries, four complete
Main SQLite/IGS sets, all 23 migration hashes, 18 PNG associations and visual
counts reconcile. It does not rerun generation or certify physical release.

ROOT subsequently confirms all four owned units inactive, all seven task-owned
readers ended, source pins exact and no incoming candidate dependencies. Six
non-owned desktop/security services deny FD inspection; their public names,
cgroups and absence of candidate command-line references are recorded, and the
services remain untouched. This is finite cooperative ownership verification,
not a system-wide no-FD assertion.

After exact archive/inventory re-verification, ROOT removes only this run's
`payloads/` and owned `t-asc-20261108` scratch. The measured deletion-only
reduction is **76,898,304 bytes**. Lifecycle becomes `retained`, with no live
payloads; compact images/inputs/source and archive remain. This final release
paragraph is ROOT self-verification after the frozen independent review.
