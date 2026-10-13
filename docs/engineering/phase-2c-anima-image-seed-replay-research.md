# Installed Anima image Random to Fixed replay

Entry: `0646574eeadc36d50ae82d0d66a91b3bc9505677`, clean `master`, after the
[image per-prompt checkpoint](./phase-2c-anima-image-per-prompt-research.md).
Contracts: PP-004/005/007/008, [dynamic prompting](../features/project/generate-mode/dynamic-prompting.md),
[immutable provenance](../features/project/generate-mode/generation-provenance.md)
and [explicit acceptance](../features/project/generate-mode/generation-results.md).
Execution, independent raw readback and guarded cleanup passed; public statuses remain «Пока не обещать».

## Boundary and source findings

High risk: actual prepared image capture, Random admission, durable queue/staging/
cursors, immutable accepted configuration/source context, explicit `.igs` Save/reopen.
Root owns bounded serial execution, faults/restoration, freezes, process closure,
artifact cleanup, documentation and commit/push. Delegated authors/reviews are
source-informed self-review, not blind audits.

`generation-action-controller.ts` prepares the actual Project/source before
calling Anima preparation. `prepareAnimaGenerationInternal` resolves Random once
with `randomUint32?.() ?? randomBytes(4).readUInt32LE(0)`, captures policy/base and
clones the draft before resource awaits. IMG uses real `prepareAnimaGenerationBatch`;
OUT expands the same captured base inside `enqueuePreparedOutpaintBatch`.
Per-prompt offsets come from the shared batch planner's emitted-item count.
The public controller reads the operational cursor for all policies; Random does
not use it. This gate does not assert absence of that cursor read.

Existing seed-boundary hooks transparently observe Main's original crypto call,
return its original Buffer unchanged and restore its function identity after admission,
before completion verification. Queue dispatch can already start on publication;
this observation does not prove restoration preceded the first worker ML operation.
The stack filter already includes `prepareAnimaGenerationInternal` in the current
built Main. Observing only the first frozen seed cannot prove a real entropy pick;
the raw oracle must independently bind the one captured original call to that row.
No reachable production defect/product choice was identified during this pass.

## Finite native plan

Four serial stages: `native-random-img2img`, `native-replay-img2img`,
`native-random-outpaint`, `native-replay-outpaint`. Each stage has four weighted
positive×negative pairs × two iterations, maxPrompts4, per-prompt, no truncation.
Exactly32 healthy admissions/completions/accepted layers,0 canceled,4 projects/
Save-reopen packages,16 own completeRGBA replays. Every package is source1+8=9
layers. Optional same-pair adjacent seed hook has16 contrasts total; no cross-pair
prompt or weight causality. No new installed-worker mutation/crash job is planned.

Random stages capture two genuine original Main picks, one per mode. Their bases
may coincide or differ and may be0; no entropy output may be substituted, retried
or discarded. Expected item seeds are independently `(B+[0,1,2,3,4,5,6,7]) % 2^32`.
Fixed replay authors exactly that mode's observed baseB through the actual seed UI,
not its final cursor. Four cursor/Save snapshots equal `(B+7)%2^32`, never max(seed).
Incidental wrap is accepted and recorded, not deliberate native wrap coverage.

Positive template: `a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph`.
Negative: `{(blurry:0.7)|(noisy:0.7)}, low quality`.
Pair order: red/blurry, red/noisy, blue/blurry, blue/noisy; iterations are inner.
Independent expected strings/spans and arithmetic never call the producer planner
or compiler. Full native Euler image grid remains beginIndex/startStep1,
initialSigma0.8571428571428571, sigmas `[0.8571428571428571,0.6,0]`,
timesteps `[857.1428571428571,600]`, steps3/actual updates2, strength0.5/CFG4.
stepSeed equals actual seed; posteriorSeed is its unsigned XOR with2654435769.
Arbitrary uint32 values must not be projected into the previous0…7 table.

Same-input matching clones the full frozen DTO and omits exactly originRequestId,
context.documentId/context.documentRevision and independently validated
context.sampling.requestedSeedPolicy. Both original roles are checked; per-prompt
behavior, actual/domain seeds, outer schemaVersion, compiled spans, source bytes,
all resources and OUT conditioning remain equal. Portable configs retain original
Random/Fixed policies and concrete raw weighted prompts; templates/maxPrompts/
compiled arrays remain outside result configuration. Anima embedding refs stay empty.

Late drafts: Fixed37, Heun, green-bowl/grainy prompts, Myth Portrait−0.25,
maxPrompts3/per-iteration. A captured seed may equal37; its comparison must then
show Same for actual seed, without forcing entropy replacement. All32 owning
comparisons and saved drafts retain their original roles. OUT uses bbox64,0,256,256,
normal policy/exact LaMa, full nine-layer source-over composition and111104 protected
source pixels across its two packages. Import and keyboard movement remain real;
only the OS chooser path is supplied.

## CPU boundary, sensitivity and resources

Executed actual Main cases per mode: Random8, independently authored Fixed-B8,
Fixed0/plain PI1 neighbor. Six cases/34 supplied candidate pixels. Controlled CPU
draw B2147483664 verifies high-bit preservation; its eight posterior literals are
506952105/104/107/106/109/108/111/110. Real preparation, batch orchestration,
SQLite/private inputs/wire DTO, staging/receipts/cursor and accepted projection
stay real; resource/LaMa resolution, Project/index ownership, source composition
and candidate pixels are supplied. CPU cases do not prove native crypto/ML/Add/Save.

Fault: replace the entire actual preparation Random branch, including injected
draw and crypto fallback, with0. Both Random cases must be semantic RED and four
Fixed neighbors GREEN: baseline6/fault6/restored6,18 executions/2 RED/16 GREEN.
Use one owned isolated whole-source copy; restore byte/dev/inode/mode/size/mtime
and original repository subject, confirm physical exit, then release through guard.

Evidence: `~/.codex/artifacts/imagegen-studio/runs/anima-image-seed-replay/20261012-checks`.
Reuse only the current worker0.14/catalog at `shared/illustrious-vpred-worker-012-20261007`.
No environment/weights/original common-source PNG copies/downloads. The original
opaque256² PNG from `anima-heun-image/20261010-checks` stays pinned, with actual
import/normalization and source preservation independently checked.

Entry root29111885824B,pool28082589696B,compact1029296128B,free disk47751577600B;
MemAvailable23031832kB/global SwapFree4008kB are observations, not capacity proofs.
Planned additional compact peak48MiB yields temporary projected soft-budget
excess5885952B. Required prior evidence/helpers and the new restored source copy
remain protected until readback; after guarded disposal, remeasure and resolve
the exception. Soft budgets trigger inspection, not a hard assertion or blind sweep.

Native12GiB/launcher2GiB/combined14GiB,task swap0,one ML stage at a time;
all8-job stage deadlines1800s,completion polling1600s. These are retained bounded
operational allowances from actual prior eight-job stages, not throughput/VRAM
guarantees. Root freezes sources/bundles/fixtures/reader and actual registrations
before ML. Native8+8 per mode and future readback deltas are distinct from historical
80/4/16 evidence. Recovery/Reuse,uint32 deliberate wrap/cap32, broader methods/
inputs/formats/geometry/Advanced, quality/Invoke parity/fullMVP/release remain separate.

## Actual preexecution evidence

Main/default/per-prompt focused18 plus current/neighbor oracle/profile/CLI/driver/
resource-limit/planner143:161 tests PASS,0 failures/skip. Lint/typecheck/app build
passed. The source copy contains574 actual app/script/fixture members; all original
bytes/dev/inode/mode/size/mtime restored and repository subject unchanged. Whole
Random expression→0 gives exactly the two Random8 semantic RED, four Fixed-B/plain
neighbors GREEN; baseline6/fault6/restored6 are18 executions/2 RED/16 GREEN.

Fresh pre-native inventory: root29134540800B,pool28082589696B,compact1051951104B,
free disk47703572480B,MemAvailable23107152kB/globalSwapFree4136kB. Required
remaining48MiB allowance projects compact soft excess28540928B; lifecycle records
this second inspection separately from entry. Restored rollback copy and prior
dependencies stay protected until independent readback and held-FD disposal.

The current freeze binds30 consumed source keys,five unchanged app bundles,575
app/test/package members,eight current controller sources and20 expected actual
registered bounded actors before independent readback. The reader's reviewed
operational AST is unchanged: ROOT filled only16 named observation assignments
with real entry tables/source-sensitivity/manifests/controller/template hashes.
Its own helper hash is pinned separately, without a self-hash cycle. Source-informed
peer review found no blocker in profile/oracle and current raw-reader/cleanup-guard
logic. Native outcomes/readback/disposal below passed.

## Actual native outcomes, readback and handoff

All four serial stages PASS: IMG Random8+Fixed8 and normal mixed-alpha OUT
Random8+Fixed8. Exactly32 admissions/completions/accepted layers,0 cancellations,
4 actual saved/reopened nine-layer packages and32 owning comparisons. Genuine
original Main base picks: IMG1035159436 and OUT1420902496; both original crypto
function identities restored after admission, with original return bytes unchanged.
No claim that identity restoration preceded the first worker ML operation.

All16 own Random→numeric Fixed results match complete decodedRGBA. Only three
owner identifiers and the independently checked requested policy differ in matching;
full schemaVersion/raw/compiled strings and spans/source/resources/native seed,
stepSeed/posteriorSeed/grid/OUT conditioning and per-prompt metadata remain.
16 adjacent-seed same-pair visible-RGB contrasts; no cross-pair/weight/tensor or
quality causality. Neither native base happened to wrap; controlled CPU zero/MAX
cases do not become native wrap/distribution/unpredictability coverage.

Independent raw reader PASS19737 checks: exact11-table deltas32/32/4/32,
all old rows and empty acceptance journal,32 immutable portable configurations/
indexes and owning comparisons,four actual source-over archive previews,
111104 protected source pixels across two OUT packages,43 original worker files.
All four operational cursor/Save snapshots equal their chronological last actual
seed: IMG1035159443 twice,OUT1420902503 twice. They remain separate from saved
later Fixed37/Heun/green-bowl/grainy/LoRA−.25/per-iteration authoring.

All20 pre-reader registered actors physically closed; the current cleanup guard
rechecks21 including the independent reader. Original43 byte/physical identities
remain. The current guard removes only the fully restored574-source copy through
held original directory FDs; external node_modules is restated and never traversed.
Fresh FD/maps/mount/dependency/system proof covers96 same-user processes and425
retained dependency files, with0 unknown-unreadable exemptions/0 signals.
Reclaimed11087872 allocated B; no global free-space exclusive-attribution claim.
Post-cleanup current reusable worker0.14/43-file physical idle verification PASS.

Observed combined peaks GiB by stage: native-random-img2img=11.108, native-replay-img2img=11.091, native-random-outpaint=11.419, native-replay-outpaint=11.102. These are bounded observations, not capacity/VRAM/throughput guarantees.

Final allocated root29138731008B,pool28087476224B,compact1051254784B; both soft budgets satisfied after guarded disposal. The pre-native projected exception is resolved; one reusable environment/catalog and compact proofs remain.

That next Reuse gate is now independently qualified in [image crash/recovery](./phase-2c-anima-image-reuse-crash-research.md); this historical32-output checkpoint keeps its original counts. Next finite gate: Anima image cap32/prefix refusal. Deliberate uint32 wrap/cap32, broader methods/inputs/formats/geometry/Advanced, masks/Regional Guidance/Smart Patch Phase4, quality/Invoke parity/fullMVP and Linux/NVIDIA release remain separate. PP-004/005/007/008 stay «Пока не обещать»; their matrix and bodies are updated together. Final source/links/diff verification precedes commit/push.

The subsequent [Anima image MAX→0 gate](./phase-2c-anima-image-seed-wrap-research.md) qualified its own8 outputs/6 packages/4 wholeRGBA controls; these counts remain separate from this historical checkpoint. Next: Anima image cap32/prefix refusal.
