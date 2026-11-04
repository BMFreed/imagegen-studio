# Count-tag regional assignment and reversal

## Frozen question

Base: clean `9befdf893b382d9bdc880b9b6bd29613acc8559b`. The
[ordinary count-tag control](./phase-4-illustrious-ordinary-count-tag-research.md)
shows two separate figures at seeds 123/124, with exact owned-input/RGB repeat.
Its full adult-age/visual acceptance remains inconclusive. This continuation
asks the narrower visible question: do red/blue hair assignments exchange sides
when the two regional texts exchange their fixed mask owners?

Global positive stays exactly:

> 2girls, anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight

Regional positives stay `one woman with long red hair` and
`one woman with long blue hair`. Negatives are local-empty; no TI, LoRA or
reference resources. These are experimental inputs, not an author-endorsed
successful recipe. No prompt, seed, model or sampler search follows a failure.

Private profile `regional-two-character-tags-v1` pins contract SHA-256
`a016a617f39362568aa122ab06aab5a25c1a3adad7341bc875b8be78c4fa990e`.
Run: `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-tagged-visual/20261105-red-blue`.
Exactly four fresh Save/reopen/capture requests, in this order:

1. Seed123 assignment: red left, blue right.
2. Seed123 swapped: blue left, red right.
3. Seed124 assignment: red left, blue right.
4. Seed124 swapped: blue left, red right.

The two retained ordinary count-tag PNGs are controls; no new baseline or repeat
request belongs to this run. Previous repeat evidence remains historical.
Keep the exact official epsilon checkpoint SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², bbox `(-13,5)`, Euler/Normal 30, CFG 5, rescale zero,
Main-resolved scaled-linear/false-ZTSNR/leading policy and embedded explicit
FP16 VAE. Left/right binary full-height masks split at local x512; their
owners, order and revisions stay fixed. Both global coverages are Everywhere,
both selected pools are `current-canvas`, with negative-first CFG and existing
`invoke-canvas-v1` composition.

## InvokeAI and existing owners

Consulted clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`
  mirrors SDXL regional text into prompt/style, copies global CLIP connections
  and attaches each owner's own mask and conditioning collector entry.
- Its `compileCanvasGraph.ts` caller adds the already validated regions.
- `invokeai/app/invocations/sd/denoise_latents.py` consumes each conditioning
  and its mask; an unmasked global conditioning supplies all-ones support.
  The existing nearest resize and subsequent Studio adaptation stay unchanged.

Only extend the fixed private profiles of the existing
[Main producer](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts)
and [runner](../../scripts/qualify-regional-character-visual.mts). Legacy seven
and ordinary three-case semantics remain intact. Saved/reopened Main state,
actual capture/target composition/ModelService/planner and complete detached
recipe feed `withIllustriousTxt2ImgRequest` and the existing
`executeCurrentCanvasRegional` client. Its verified file-backed lease and
existing result reader own publication and disposal. No new production owner,
sampler, attention algorithm, schema or composition default.

Record exact input/source hashes, complete handoffs, response identity,
30 scalar progress events per request, verified PNG dimensions/ICC/RGB and
physical child exits. No new loading journal, numerical timestep witness,
70-site observation or independent native PT-to-RGB lineage is claimed.

## Preregistered narrow visual gate

An independent observer first describes six randomized unlabeled full
originals: four new regional images and two retained ordinary controls. ROOT
then reveals the key and applies the fixed criteria:

- Exactly two recognizable separate figures with distinct head/body
  associations, one centered in each mask half.
- Assignment shows predominantly identifiable red hair on the left and blue
  hair on the right; swapped reverses them. Both seeds must exchange sides.
- Missing/extra/materially fused figures or clear wrong-side/color fail.
  Ambiguous count/position and pink-only, teal-only, purple or indistinct hair
  are inconclusive, not automatic passes. Ordinary controls have no hair-color
  requirement.
- Record conspicuous seams, coherence problems, anatomy and unfinished drawing
  separately. Minor finger details do not redefine the count/color criterion.
  No outside-mask final-pixel equality is required.
- All four must pass for this bounded count/color/association gate. It does not
  establish exact adult ages, full prompt compliance, aesthetic quality,
  general regional reliability or human acceptance. The prior complete
  ordinary gate remains inconclusive and is not reclassified.

The rubric and four-request ceiling precede any new output inspection. No
automatic retry or extra ML request belongs to the attempt.

## Execution and evidence

ROOT completed exactly four fresh regional requests in **216.200 seconds**,
without failed/extra native attempts. Each original 1024² sRGB PNG is retained,
with matching response identity and 30 scalar progress events: **120 total**.
All recorded workers exit; the final owned cgroup has no remaining PIDs. No
ordinary or repeat request was added. Input comparison with the two retained
ordinary jobs matches global prompts, checkpoint, bbox, target-byte identity,
sampling, resources and VAE policy; operational lease paths/IDs differ.

The serial envelope was aggregate host memory at most 12 GiB, zero swap,
1,800-second unit and 600 seconds per request. Systemd memory peak was
2,129,125,376 bytes; swap peak zero. The installed worker 0.14.0, compatible
runtime/configuration and original weights were reused without provisioning
or copies. No allocator-fraction or GPU-capacity claim follows.

The independent blind observer and ROOT identify two separate head/body
associations in all six originals. After descriptions were retained, key reveal
gave these narrow regional outcomes:

| Case               | Blind ID | Image-left hair                                         | Image-right hair                              | Narrow result                                  |
| ------------------ | -------- | ------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Seed123 assignment | 01       | Coral/salmon, red–pink ambiguity                        | Pale periwinkle, blue–lavender/gray ambiguity | INCONCLUSIVE                                   |
| Seed123 swapped    | 02       | Saturated blue                                          | Rose-red/pink                                 | INCONCLUSIVE: conservative red/pink confidence |
| Seed124 assignment | 03       | Strong red                                              | Dark slate/navy blue                          | PASS                                           |
| Seed124 swapped    | 06       | Pale pink/lavender-gray, no confidently identified blue | Vivid red                                     | INCONCLUSIVE                                   |

Thus count/separation passes **4/4**, while the fixed count/color/association
gate gives **1 PASS / 0 FAIL / 3 INCONCLUSIVE**, overall **NOT_QUALIFIED**.
This is ROOT's conservative rubric application to blind AI descriptions, not
human ground truth. The rose-red/pink case has the expected broad direction,
but is not promoted to unequivocal red. The pale colors are not silently
relabelled blue/red. Neither seed establishes a fully confirmed reversal pair.
The two ordinary controls, blind04/05, retain their earlier count observation
and have no regional hair-color requirement.

Seed123 outputs remain particularly unfinished: faint faces/body outlines,
crowded inner arms and overlapping footwear. Seed124 assignment has clearer
separate faces/bodies; swapped has very thin legs and oversized shoes. No
conspicuous hard compositing seam or substantial extra/fused torso is reported.
None of this promotes aesthetics, exact ages or full prompt compliance.
Human acceptance remains pending; the earlier complete ordinary gate remains
inconclusive.

Actual checks: `pnpm run typecheck`, explicit `.mts` typing, separate scoped
ESLint for both helper files, Prettier and diff checks PASS. The previous 62
Main recipe tests are historical evidence; they were not repeated as fresh
tests of this profile. No new semantic mutation or numerical attention witness
is attributed to this four-request visual experiment.

All four Main packages/targets, complete handoffs, four original output PNGs,
two comparator descriptors, current source snapshots, reports and six unchanged
blind copies/descriptions are retained. After fresh physical-identity and
incoming-dependency checks, all 11 entries of the exact owned Main/scratch
payloads were archived and byte-verified before disposal: **344,064 allocated
bytes removed** in the deletion-only interval. Source authors and image readers
had ended. This is ROOT lifecycle evidence, separate from independent retained
data/source review. Shared runtime, original weights, prior controls, historical
evidence and privacy backups remain protected.

The next useful diagnostic is a separately declared same-input installed
InvokeAI comparison for the unresolved regional color cases, before changing
Studio's mechanism. This run performs no such reference requests and establishes
no Studio-only attention defect. A different prompt or sampling sweep would
change the question and is not silently added.

Current public permissions, frozen-work independence and Regional
provenance/Compare/preset exclusions remain unchanged. No UI, queue durability,
Add/Save, Anima regional, release or capacity qualification follows.
PP-001/007/008 remain **«Пока не обещать»**.
