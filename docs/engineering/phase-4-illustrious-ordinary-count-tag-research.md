# Ordinary Illustrious count-tag control

## Question and frozen input

Base: clean `474aa1bc17a2637a85b94e9749f9e798af36a3fc`, after the
[repository privacy rewrite](./repository-privacy.md). The preceding
[character experiment](./phase-4-regional-guidance-character-visual-research.md)
produced one figure in both ordinary controls. That prevents a useful
regional-only diagnosis. This experiment tests one ordinary prompt intervention,
without changing generation mechanics or claiming regional semantics.

Add only the literal prefix `2girls, ` to the previous global positive:

> 2girls, anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight

This is an experimental count-tag candidate, not a known successful author
recipe. The [exact official model card](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/blob/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/README.md)
describes Danbooru training and uses tagged single-character examples. It gives
no exact successful two-woman prompt or count guarantee. Its retained 16,918
bytes have SHA-256
`0205e7c1d93c5c4fd6a2045ebf9ae3cd333684074385130d5b9e5aef3e051b45`.
The separate Euler-a/20–28 sampling recommendation is not adopted here: keep
Euler/Normal 30 and CFG 5 to isolate the prompt change.

Frozen private contract: `ordinary-two-character-tags-v1`, SHA-256
`12512a2ca955cce7326471cdc66001a74781eb2d511a4858ceb5c50a327e41a9`.
Run: `~/.codex/artifacts/imagegen-studio/runs/illustrious-ordinary-character/20261105-count-tag`.
Two fresh Main states at seeds 123/124, then the exact owned seed123 input
repeated, permit at most three native requests. No automatic retry, seed search,
prompt tuning, model substitution or sampler sweep belongs to this attempt.

Keep the official epsilon checkpoint SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², bbox `(-13,5)`, empty negative, Main-resolved scaled-linear,
false-ZTSNR/leading policy, rescale zero and embedded explicit FP16 VAE.
No TI, LoRA or reference resources. Existing dormant regional owners remain
disabled in saved documents; every consumed recipe has `regions == []`.

## Source and owners

Consulted clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/frontend/webv2/src/features/generation/core/graph.ts` connects the
  same original positive to SDXL prompt and style.
- `invokeai/app/invocations/text_encoder/compel.py` consumes those texts through
  native dual-CLIP Compel, without a special two-person rewrite.
- `invokeai/backend/stable_diffusion/schedulers/schedulers.py` distinguishes
  Euler and Euler a; this experiment keeps the former.

Adapt the existing private
[Main producer](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts)
and [runner](../../scripts/qualify-regional-character-visual.mts) with one fixed
additive profile. Their legacy seven-case profile stays intact. Save/reopen,
capture, target composition, real ModelService resolution, concrete batch item
and complete detached recipe remain the existing owners. All three requests
use `withIllustriousTxt2ImgRequest`, the ordinary
`GenerationWorkerClient.generate` and the existing verified PNG reader inside
its output lease. No production implementation changes.

Observe input/source hashes, response identity, 30 scalar progress events per
request, original PNG dimensions/ICC/RGB, exact repeat and physical child exit.
Do not attribute a new loading journal, per-step numerical comparison,
70-site attention observation or independent native PT-to-RGB witness to this
smaller count gate. Historical private outputs are comparators, not execution
of the current privacy-rewritten source.

## Preregistered visual gate

Before revealing labels, an independent agent describes randomized full
originals from both fresh primaries and the two retained ordinary controls.
ROOT then applies this frozen rubric:

- Each primary must independently contain exactly two recognizable separate
  adult figures with two unambiguous head/body associations. Extra heads or
  figures, missing figures and material fusion fail. Ambiguous count is
  inconclusive. Waist-up lower framing is allowed.
- Record small finger defects separately; do not turn them into a new count
  criterion after seeing outputs. Count success alone does not prove complete
  anatomy, aesthetics, spatial assignment or visual quality.
- Both primaries must pass for this bounded AI count gate. Any failure or
  inconclusive result leaves it not qualified. Human acceptance remains pending.
- The repeat must reproduce every decoded RGB byte, but is not a third
  independent visual success.

## Execution and outcome

ROOT completed exactly three native requests in 119.452 seconds, without a
failed or extra native attempt. All three retain correlated original 1024²
sRGB PNGs and 30 scalar progress events each: 90 in total. Two fresh saved and
reopened Main states feed complete recipes; the third request reuses the exact
owned seed123 prepared input and recipe. Their hashes and every decoded RGB
byte agree on repeat. Physical worker exits and an empty final owned cgroup
are recorded. This is direct backend evidence, not a fresh UI or durable-queue
qualification.

The serial envelope was aggregate host memory at most 12 GiB, zero swap,
1,800 seconds for the unit and 600 seconds per request. Observed systemd
memory peak was 4,090,097,664 bytes; swap peak zero. The ordinary worker API supplies no
allocator-fraction control; this experiment makes no such claim. Reuse the
existing installed worker 0.14.0, compatible runtime/configuration and original
checkpoint completed without copies or provisioning.

The independent blind observer and ROOT agree on visible figure count and
separate head/body associations. The key was revealed only after descriptions:

| Original               | Blind ID | Visible people | Count and separation       |
| ---------------------- | -------- | -------------- | -------------------------- |
| Retained prior seed123 | 03       | 1              | FAIL                       |
| Retained prior seed124 | 02       | 1              | FAIL                       |
| New seed123            | 04       | 2              | PASS for these subcriteria |
| New seed124            | 01       | 2              | PASS for these subcriteria |

Seed123 is a very faint, unfinished monochrome drawing: two distinct heads and
torsos are readable, while hands, wrists and clothing boundaries remain
ambiguous. Seed124 clearly separates the two bodies, with simplified angular
fingers. Neither shows a substantial third or fused figure. This is useful
evidence for the count-tag candidate on these two seeds, not general visual
quality. The preregistered rubric also used the adjective **adult**; exact ages
are not established from these stylized images. Accordingly the complete
preregistered visual gate remains **INCONCLUSIVE**, despite passing the count
and separation subcriteria 2/2. Human acceptance is pending. Do not silently
drop that criterion or promote the result to complete prompt compliance.

Retained historical request jobs independently match both current jobs in
checkpoint, geometry, target-byte identity, sampling, empty negative, resources
and VAE policy. Their only positive-text difference is the declared prefix;
operational IDs/output and target lease paths legitimately differ. Historical
comparators remain prior execution, rather than a rerun of old source.

Actual checks: `pnpm run typecheck` PASS, explicit `.mts` typing PASS, scoped
ESLint/Prettier and diff checks PASS, 62 existing Main recipe tests PASS, and
independent frozen source review CLEAN. The initial artifact-only typing
configuration could not resolve external Node/Vite types; scoped lint setup
also initially missed the `.mts` project override. Those tooling setup failures
are retained separately and caused no native requests or source changes.

The next material experiment can reuse this fixed text and the retained
ordinary controls for regional assignment/swapped, retaining the same
Invoke-based mechanism. This run does not perform those requests or qualify
red/blue association. It supplies no reason for a regional algorithm rewrite.

The contract, current source, two Main packages/targets, three handoffs, reports,
all three output originals, blind observations and dependency records are
retained. Four byte-identical blind copies include the two old comparators.
Fresh exit checks match every recorded worker/main identity, find no active
shared interpreter, and find no incoming payload dependency. Source and image
readers have ended. All 11 entries in the exact owned Main/scratch payloads are
archived and byte-verified before removal: 344,064 allocated bytes removed in
that deletion-only interval. This is ROOT lifecycle evidence, separate from
independent source or retained-data review. Privacy backups, shared runtime,
original weights and historical evidence remain protected.

No public, queue/durable-candidate, Add/Save, Anima regional, capacity, release
or general quality qualification follows. Existing permissions, frozen-work
independence and Regional provenance/Compare/preset exclusions remain intact.
PP-001/007/008 remain **«Пока не обещать»**.
