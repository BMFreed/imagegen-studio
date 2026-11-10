# Fixed Illustrious reference utility experiment

Base `a39bff4fa5c45154175fa412f77f147afa7683d8`. This is an additive experiment
in the existing visual producer/runner, not a new sampler, queue or acceptance
owner. Previous installed TXT/IMG/OUT proves transport/influence/replay; it does
not prove useful image conditioning. PP-001/005/007/008 stay **«Пока не обещать»**.

## Source and scope fixed before native execution

Clean local InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` reread:
`prepareCanvasInvocation.ts::resolveRegionalReferenceImages`,
`compileCanvasGraph.ts` and `addRegionalGuidance.ts`; actual
`sd/denoise_latents.py::prep_ip_adapter_image_prompts`/`prep_ip_adapter_data`
callers, `backend/ip_adapter/ip_adapter.py::get_image_embeds` and
`backend/stable_diffusion/extensions/ip_adapter.py`.
Use the existing original-PNG capture, offline vision/projection prepass and
masked native image attention unchanged. Basic unconditional image tokens are
projected zero vision embeddings, not zero tokens.

The existing character visual profiles hard-pin their own revision,1024 frame,
two text regions and no references. Do not overwrite those constants or resume
their disposed payloads. Add a separate finite profile within those same
producer/runner owners. Real Main Project Save/reopen/coherent capture and the
installed ordinary/reference clients remain the consumers. This direct backend
probe does not qualify UI, durable queue, Add/Retry or packaged delivery again.

Exact model: already selected official Illustrious XLv0.1, SHA256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`.
512², bbox(-13,5), Euler/Normal30, CFG5, Rescale0, embedded FP16,
false-ZTSNR/leading, fixed seeds123/124, no LoRA/TI. Existing Standard ViT-H
pair and exact original red/blue cat-head cards are reused. No model/runtime
copy, new resource download or production default change.

Global positive, fixed before viewing new output:

> a simple illustration of one cat head, front view, two pointed ears, two eyes, plain light background

Empty global negative; the image-only owner has no local positive/negative text.
One enabled full-canvas Regional owner consumes exactly one original image.
Ordinary baselines are genuinely authored with `regionalGuidance: []`, not made
by stripping a captured regional recipe. Zero controls retain the enabled owner,
original image and image consumer, with its nonempty owned mask wholly outside
the target. A non-null all-zero mask asset with nonempty tight bounds is invalid
Project authoring and is not used.

Eight-request cumulative ceiling and fixed order:

1. seed123 ordinary;
2. seed123 referenceA;
3. seed123 referenceB;
4. seed124 ordinary;
5. seed124 referenceA;
6. seed124 referenceB;
7. seed123 outside-mask referenceA;
8. seed123 outside-mask referenceB.

Retain every original PNG, including failures. No prompt/seed/sampler/precision
search or attractive-example retry after inspection. Setup and native failures
remain failed observations, not semantic mutation RED.

## Rubric and controls

Describe originals in shuffled, unlabeled order before revealing the mapping.
Each image must contain one recognizable coherent cat head with two ears and
two eyes, without fragmented/duplicated collage. Ordinary baselines must both
satisfy this scene criterion before interpreting reference utility. All four
full-mask reference cases must satisfy it and show predominantly red head/body
forA and blue forB at both seeds. Background hue alone cannot pass. Ambiguous
shape/color is INCONCLUSIVE. The whole gate requires both baselines and all four
reference cases; no favorable subset substitutes for the declared set.

Outside-mask A/B must produce exact identical decoded pixels. Record ordinary
versus outside-mask equality separately: different ordinary/regional transport
can confound that comparison, so a difference is not automatically an adapter
mask leak. Image-only regions avoid an added regional text-bank confound.
Pixel differences alone do not pass the visual rubric. Agent inspection is not
independent human acceptance, general model quality, spatial regional association
or maximum three-reference capacity qualification.

Initial inventory: root about29GiB, filesystem64GiB free, RTX4080
16376MiB total/14185MiB free. Reuse the one protected installed worker/catalog.
ROOT serializes GPU execution in one inherited cgroup≤12GiB, zero swap and600s
per phase; no Electron/KDE scope is involved and no allocator fraction is claimed.
Checks≤4GiB. Evidence root: `runs/regional-reference-utility/20261111-fixed-cat`.
Retain source/inputs/results and verify physical exit/dependencies before exact
own-payload cleanup. No current SHARED/model/managed-row deletion.

## Executed result

ROOT executed the eight fixed requests once, with all eight original PNGs and
30 genuine native progress steps per case. Every inference child closes and its
physical exit is confirmed. Source/config/installed-worker fences pass; private
Main queue/receipt/seed-cursor tables remain empty. No shared app DB is opened.
Outside-mask A/B are byte-identical, including decoded RGB; both also equal the
authored seed123 ordinary output. Thus this experiment does not show an image
mask leak. It does not establish a healthy ordinary image.

`native-r3` completes in356.060s under600s. Peak aggregate inherited-cgroup host
memory2926919680 bytes (about2.73GiB), swap0. This is observed host memory for
one reference/one region at512, not peak VRAM or maximum-three capacity. No
allocator fraction was enforced or claimed. The installed0.14.0 payload and
dependencies are reused without refresh because production worker code did not
change.

Two setup attempts precede it, both at attempted0/submitted0: the first supplies
an unused mask source to the no-region baseline and is correctly rejected by
Project ownership validation; the fixture now supplies `{}` for ordinary. The
second refuses an existing scratch directory left by the first setup. Exact
partial directories/reports are retained separately, not overwritten/resumed.
Neither is inference failure, semantic mutation RED or a new set of image trials.

Model-free fixture guards pass6 cases. Full TS/Vue typing passes after explicit
image-only positive=null and ordinary-response validation; a later guard-test
literal-type issue is corrected without changing fixture values. Full lint
passes with only the unchanged `qualify-installed-regional-init.mts` exclusion.
The modified visual `.mts` is now explicitly included in both TS projects and
actually linted, rather than treated as an unchanged parser baseline. Prototype
UI and production inference logic do not change; their large unchanged matrices
are not rerun as evidence for this experiment.

## Visual result: NOT_QUALIFIED

A new observer with no inherited target/conditions/key views all eight originals
under shuffled neutral filenames and describes them before the mapping is
revealed. ROOT then views every original and applies the preregistered rubric.
These are bounded agent assessments, not human acceptance.

| Case | Observation | Verdict |
| --- | --- | --- |
| seed123 ordinary | Repeated fragmented black/white faces and saturated patches; a collage rather than one coherent head. | FAIL |
| seed124 ordinary | Cropped human-like eye/face, not a cat head. | FAIL |
| seed123 referenceA | Two duplicated purple/salmon heads rather than one predominantly red head. | FAIL |
| seed123 referenceB | Pale incomplete outline without readable eyes/ears. | FAIL |
| seed124 referenceA | One coherent pink cat-like silhouette with two closed-eye marks; predominantly red is uncertain. | INCONCLUSIVE |
| seed124 referenceB | One coherent blue/periwinkle cat-like head with readable ears/eyes. Dark streaked background remains a prompt/quality limitation. | PASS, narrow shape/color gate |

Both ordinary baselines fail. Four reference cases give1 narrow PASS/two FAIL/
one INCONCLUSIVE. Whole utility gate is **NOT_QUALIFIED**, irrespective of that
single favorable case. Outside-mask controls reproduce the failed ordinary123
image exactly; they pass the mechanical mask gate, not the scene rubric.
Reference influence is real, but usefulness/spatial association/capacity and
release/MVP acceptance remain open. No defaults or prompts were tuned after
inspection; no PP status is promoted.

This narrows the next diagnosis: ordinary512 already fails before Regional
Guidance. A separate preregistered same-prompt/seeds ordinary512-versus1024
comparison can test processing resolution without relaxing the current
reference512 guard. That diagnostic has **not** been executed here. Current
evidence does not isolate a Studio-only adapter defect, prove resolution is the
cause, or establish general model quality.

## Retention and closure

ROOT retains132 archive entries, including both private Main databases/Projects,
all eight original PNGs and input/transport/source bindings. Independent byte
audit is **CLEAN**:132 archive/raw entries,1641 current source files,94 executed
source bindings, four external resource pins,72 installed-worker files,
17 config files and three runtime companions match. Both private databases have
empty generation/accepted-index boundary tables; all eight Project packages and
64 ZIP members match. These are retained-byte/source checks, not another native
run or a new visual acceptance result.

After all readers close, ROOT separately checks fresh runtime idle, physical
process exits,294 lifecycle records, no incoming raw-payload dependencies and
the exact archive/inventory. Only this RUN's `payloads` and its neutral observer
alias directory are removed:3919872 allocated bytes (the measured artifact-root
delta is also3919872 bytes). The archive-only post-cleanup verification passes
all132 entries. Lifecycle is `retained`, `payloads: []`; compact originals,
SHARED/runtime/models/managed Projects/rows and active worker-report companions
remain protected. Removed raw paths cannot be reused with an old `--resume`;
reconstruction requires the recorded fresh-namespace/dependency instructions.

Evidence includes `reference-utility-report.json`, `visual-assessment.json`,
`retention-summary.json`, `final-audit-r1.json` and `cleanup-result.json` in the
dated RUN. The final source snapshot records current delivery bytes separately
from the actual executed-source bindings. The visual gate remains
**NOT_QUALIFIED** and PP readiness is unchanged.
