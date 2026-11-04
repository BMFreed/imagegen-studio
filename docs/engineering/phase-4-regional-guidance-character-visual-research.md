# Fixed two-character regional visual experiment

## Question and source

Base: `cf0171be3e8261d5b1f17252cc47d770142b6a07`. The operational
[worker-failure checkpoint](./phase-4-regional-guidance-worker-fault-research.md)
does not establish useful visual assignment. The previous apple/mug scene failed
in both Studio and the actual installed InvokeAI reference, including reversal.
Those [ordinary](./phase-4-illustrious-invoke-application-research.md) and
[regional](./phase-4-regional-guidance-invoke-assignment-research.md) comparisons
do not identify a Studio-only mask defect or justify another attention rewrite.

This is one newly declared illustration-scene qualification, not another search
over the old prompt, seed or sampler. The exact model-card evidence describes an
untuned illustration base. Neither it nor Invoke prescribes this new prompt or
guarantees successful character rendering. The texts are experimental inputs.

Consulted clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`
  and its `compileCanvasGraph.ts` caller: separate prompt/style conditioning,
  copied global encoder connections and each region's own mask/collector entry.
- `invokeai/app/invocations/mask.py`: native alpha activation uses `alpha > 0`.
- `invokeai/app/invocations/text_encoder/compel.py` and
  `invokeai/app/invocations/sd/denoise_latents.py`: original conditioning and
  regional concatenation, with unmasked global conditioning supplying pools.

Studio's existing `invoke-canvas-v1` is the qualified adaptation. No production
sampler, attention, composition, precision or global-support default changes.
The model-card's separate Euler-a/28 ordinary experiment does not widen the
current Euler-only regional profile.

## Preregistered inputs and rubric

The original contract declares seven native calls: seeds 123/124 × ordinary,
assignment and swapped, followed by one exact seed123-assignment repeat. The
manual harness-only requalification described below raises the cumulative
ceiling to nine, before any visual inspection; the seven-case scene is unchanged. Fixed official
Illustrious epsilon SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², bbox `(-13,5)`, Euler/Normal 30, CFG 5, rescale zero, Main-resolved
false-ZTSNR/leading and explicit embedded FP16 VAE. No TI, LoRA or references.
Both fixed binary half masks retain their saved owners/revisions; global
conditioning remains Everywhere and both selected pools remain `current-canvas`.

Global text:

> anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight

Regional texts:

> one woman with long red hair

> one woman with long blue hair

Global text contains no identifying hair colors or left/right instructions.
Assignment maps red to the left owner and blue to the right; swapped changes
only that mapping. Ordinary states genuinely disable both owners and produce
`recipe.regions == []`; no assigned recipe is stripped. They use the existing
ordinary client entry. Regional cases use the existing private file-backed
client with the public-compatible `invoke-canvas-v1` math. The seventh call
reuses the exact owned assignment input, without claiming a fresh Main capture.

Baselines must contain exactly two separate recognizable figures in a coherent
scene; their hair colors are unrestricted. All four assigned/swapped images
must show red/blue hair on the intended figures and a side exchange at both
seeds, with subject centers inside their corresponding halves. Missing,
duplicated or fused figures, material wrong-color association or conspicuous
seams fail. Unidentifiable or ambiguous colors/positions are inconclusive;
colored image halves or changed RGB alone cannot pass. The repeat must reproduce
decoded pixels exactly.

Randomized unlabeled originals are described before assignment labels are
revealed. ROOT/agent observations are bounded AI assessments; human acceptance
remains pending. Every image and its verdict survives, including failures.
There is no adaptive prompt/seed/settings search, automatic model retry, model
replacement or new Invoke request in this attempt.

## Ownership and qualification boundary

The additive producer reuses real ProjectService Save/reopen, the combined
Canvas capture, real ModelService verification, ordinary preparation, concrete
planner item and complete `prepareCurrentCanvasRegionalRecipe` output. It
retains all six actual saved packages, targets and complete handoffs before
generation. Standard request leases and the actual installed worker consume
them; existing readers own PNG verification before lease cleanup. No inference
loop or publisher is copied.

This direct Main/backend experiment qualifies visual consumption, not another
public Queue/UI/durable-candidate or Add/Save checkpoint. Their preceding
operational evidence stays separate. The unchanged installed runtime/catalog,
original checkpoint and offline configuration are reused. One serial bounded
unit owns Node and its children: host ≤12 GiB, zero swap, overall ≤1,800 seconds
and each request ≤600 seconds. No new allocator-fraction mechanism exists in
the production client; none is injected or claimed. Host limits and device
observations do not establish a general RAM/VRAM capacity bound.

## Evidence

Contract frozen before native execution at
`runs/regional-guidance-character-visual/20261104-red-blue/experiment-contract.json`,
SHA-256 `aaa2c64d59e6e1ab5f90e4e739d3a556a9ff346efb1d0b3f6aafd6e3a625d733`.
Authorship, ROOT execution, independent source/retained-data review and visual
assessment remain separate. ROOT's final `native-r3` completes all seven qualified
requests in **325.336 seconds**, with **210 scalar progress events**, seven
confirmed worker exits and no remaining cgroup PIDs. Host `MemoryPeak` is
2,098,130,944 bytes, swap zero under the declared 12 GiB ceiling. This is one
measured run, not a general memory-capacity promise. Six real saved/reopened
Main inputs and one owned replay feed two ordinary and five regional client
calls. Recipe/prepared inputs remain exact around calls, isolated SQL/package/
history/shadow state remains unchanged, and no queue/candidate is created.

All seven retained PNGs independently decode as 1024² RGB with the pinned ICC
and recorded digests. The assignment repeat has identical prepared/recipe hashes
and every decoded RGB byte. Assignment-versus-swapped changes 2,859,116 channel
bytes at seed123 and 3,139,303 at seed124; these differences do not prove visual
semantics. No new per-case CLIP/site/PT lineage instrumentation was added.

### Visual result: NOT_QUALIFIED

A separate image-only agent described six randomized original PNGs without
prompts, assignments, seeds or the mapping. ROOT then inspected all six and
applied the frozen rubric. These are bounded AI assessments; human acceptance
remains **pending**.

| Case               | AI rubric result                | Visible result                                                                                                                   |
| ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| seed123 baseline   | FAIL                            | One centered silver-white-haired figure; second woman missing.                                                                   |
| seed123 assignment | FAIL                            | One centered lavender-blue-haired figure; no separate red/blue pair.                                                             |
| seed123 swapped    | FAIL                            | One blue-haired figure with a red tuft; no swapped pair.                                                                         |
| seed124 baseline   | FAIL                            | One gray-haired figure; second woman missing.                                                                                    |
| seed124 assignment | PASS, narrow regional criterion | Two separate figures, red left/light blue right. Short blue hair and large text-like graphics remain prompt/quality limitations. |
| seed124 swapped    | INCONCLUSIVE                    | Two figures and red right; left hair is pale blue/silver, so predominantly blue is uncertain.                                    |

Thus the six primary images give **1 PASS / 4 FAIL / 1 INCONCLUSIVE**; regional
images alone give **1 PASS / 2 FAIL / 1 INCONCLUSIVE**. Both ordinary baselines
fail the two-women gate. The narrow spatial PASS is not complete prompt
compliance, a scene PASS or general quality qualification. The unchanged
seed124-assignment PNG fails the counterfactual swapped requirement without
another native call. The exact repeat passes mechanically.

The ordinary failure prevents this attempt from isolating a regional-only
cause. It does not prove a Studio defect, a model-only cause, or fresh Invoke
numerical/visual parity for this scene. No further prompt/seed/sampler sweep or
attention rewrite occurs in this checkpoint. A later visual attempt first needs
a separately declared ordinary scene/calibration that satisfies its own subject
count; it must retain these negative images.

### Excluded setup and harness attempts

- `native-r1`: the new runner omitted `IGS_SDXL_CONFIG_DIR`; startup refuses
  before any generation request. A bounded diagnostic records the exact missing
  offline-config error. The correction reuses RuntimeCoordinator's existing
  environment field, with the unchanged pinned installed files.
- `native-r2`: two native requests complete their 30 steps. The ordinary PNG is
  retained. The regional result is verified by its existing lease owner, then
  the harness incorrectly compares that owner's path against the outer ordinary
  lease. This assertion fails before retaining its owned bytes; normal cleanup
  disposes that transient PNG. It is **not** claimed as retained or a visual RED.
- Before image inspection, `manual-requalification-r3.json` declares a manual
  full-matrix rerun, cumulative ceiling **nine**. The harness now respects the
  existing regional lease path and original correlated reader. No production
  behavior, settings or scene changes; no automatic retry.

Accounting is **nine actual native requests**, seven qualified requests and
eight retained original output PNGs (seven final plus one excluded baseline).
The startup diagnostic adds no request. Earlier TypeScript/ESLint configuration
setup failures are retained separately; final full `pnpm run typecheck`, explicit
`.mts` typing, scoped ESLint, formatting and diff checks pass.

### Retained source and reproduction

The additive [Main producer](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts)
and [installed-client runner](../../scripts/qualify-regional-character-visual.mts)
are ROOT-only, import-safe qualification sources. Production sources and the
installed worker are unchanged. Run with `node --import tsx` and the retained
`fixture.json` inside the declared bounded controller; the fixed producer refuses
reusing its output directories. Original and corrected source snapshots,
contract, manual amendment, six saved packages/targets, complete handoffs,
seven requests/results, originals, blind key/descriptions and machine-readable
`visual-verdict.json`/`mechanical-summary.json` remain under the run above.

The original checkpoint, installed runtime/configuration and predecessor
lifecycle companions remain protected. The independent retained-byte audit is CLEAN: all five source archives,
82 executed-source pins, complete inputs/PNG closure, three archived SQLite
integrity/FK checks and 21 migration hashes reconcile. It does not rerun native
inference or certify visual quality. ROOT separately proves fresh physical idle,
18 completed owned units, global incoming references and the five-reader gate.
Four exact candidate roots / 67 entries are archived and removed, reclaiming
**11,296,768 allocated bytes** during the deletion-only interval. All originals,
packages, targets, handoffs and excluded-attempt bytes remain available directly
or in `retained-payloads.tar.gz`. Lifecycle is `retained`, live payload list empty.
The subsequent final source/document review is a later sixth reader, not part of
the historical deletion gate. No audit alone grants deletion or runtime
certification.

Existing Smart permissions, frozen-work independence and Regional Guidance
provenance/Compare/result-derived-preset exclusions remain unchanged. No Anima
regional, generic SDXL family, quality, capacity or release Install/Repair
promotion follows; PP-001/007/008 stay **«Пока не обещать»**.
