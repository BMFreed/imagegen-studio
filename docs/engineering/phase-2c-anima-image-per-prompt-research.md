# Installed Anima image per-prompt qualification

Entry: `358ba404bff9e989d3967b177c7418662462e8ff`, clean `master`, after the
[Anima dynamic image foundation](./phase-2c-anima-dynamic-image-research.md).
Contracts: PP-004/005/007/008, [dynamic prompting](../features/project/generate-mode/dynamic-prompting.md),
[immutable provenance](../features/project/generate-mode/generation-provenance.md)
and [explicit acceptance](../features/project/generate-mode/generation-results.md).
Execution, independent raw readback and guarded cleanup below passed. Public statuses remain «Пока не обещать».

## Source-informed boundary and finite plan

High risk: actual prepared image capture, batch scheduling, durable queue/staging/
cursors, immutable accepted settings/source context and explicit `.igs` Save/reopen.
Root owns serial bounded execution, source fault/restoration, freezes, physical
closure, cleanup and commit/push. Delegated source-informed authors and reviews
are self-review; this is not a blind product audit.

The real `generation-batch-plan.ts` computes per-iteration offset from iteration
and per-prompt offset from the emitted item count. IMG uses actual
`prepareAnimaGenerationBatch`; OUT expands inside `enqueuePreparedOutpaintBatch`.
Both compile each concrete sign and its full flow plan after expansion. The
production path already exists; no reachable production defect or product choice
was identified during this source pass.

The current driver performs one public Generate per stage and binds one genuine
baseline report. Four literal controls with manually authored seeds0/2/4/6 would
need additional multi-report/session orchestration. A synthetic passed-report
union would obscure genuine ownership. The chosen four-stage matrix keeps the
current driver unchanged and compares every per-prompt output with a genuine
same-input numeric result from its own fresh mode's baseline.

| Mode                   | Numeric control                                              | Per-prompt subject                                      | Own control indices   | Saved layers           |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------- | --------------------- | ---------------------- |
| IMG                    | four weighted pairs × eight iterations, Fixed0/per-iteration | four weighted pairs × two iterations, Fixed0/per-prompt | 0,1,10,11,20,21,30,31 | source1+32 / source1+8 |
| Normal mixed-alpha OUT | same32 numeric controls                                      | same8 subjects                                          | same8 indices         | source1+32 / source1+8 |

Finite80 admissions/completions/accepted layers,4 Save/reopen packages,16 wholeRGBA
own-control matches,4 operational cursor/Save snapshots7,0 cancellations. Control
seed sequence is0…7 repeated for each pair; subject sequence is0…7 across four
pairs. Both have maxPrompts4/no truncation. The32-job control hits the current
admission cap but does not prove33-job refusal or the whole cap contract.

Positive source:
`a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph`.
Negative source: `{(blurry:0.7)|(noisy:0.7)}, low quality`.
Pair order is red/blurry, red/noisy, blue/blurry, blue/noisy; iterations are inner.
Handwritten raw/compiled DTOs remain separate from the production compiler and
planner. Native plans preserve exact actual seeds0…7, stepSeed0…7 and posterior
seeds `[2654435769,2654435768,2654435771,2654435770,2654435773,2654435772,2654435775,2654435774]`.
No seed2…7→0/1 projection is permitted in the oracle.

Euler256²,N3/CFG4/rescale0/Auto VAE,strength0.5,Myth Portrait−0.5.
Literal beginIndex/startStep1, initialSigma0.8571428571428571, sigmas
`[0.8571428571428571,0.6,0]`, timesteps `[857.1428571428571,600]`, totalSteps2.
Both native numerical modes are img2img; OUT queue/provenance stays distinct.
OUT bbox `(64,0,256,256)`, normal policy and exact existing LaMa remain unchanged.
Reuse the original opaque256² common PNG from `anima-heun-image/20261010-checks`:
47,531B, SHA `09c8ed1b33eab4cc4c888c913d3493567f4effee704912ddbb3660833a8a9f93`,
RGBA SHA `5f00528166a030db5c8f33de22d1bf9707def9e3edadb079aa426dd3232b4100`.
Real import/source normalization and keyboard bbox movement remain actual;
only the OS chooser path is supplied.

Matching omits only originRequestId/documentId/documentRevision and
context.sampling.seedBehavior. Both original behaviors must first be verified.
Actual seed/domain seeds, full compiled/raw prompts, source bytes, model/Qwen3/
VAE/LoRA, numeric algorithm and OUT conditioning must remain equal. Control
index10 has iteration2 while subject index2 has iteration0: ephemeral tuples
need not equal when the complete executed inputs do. Portable configurations
retain their own per-iteration/per-prompt label; compiled arrays/templates/
maxPrompts are not portable result settings. All Anima embedding refs stay empty.

Later current-draft edits are green bowl/grainy, Heun, Fixed37,LoRA−0.25,
maxPrompts3 and the opposite behavior for each stage. All80 owning comparisons
and saved drafts must retain that distinction. Actual anchor-only Add remains;
the qualifier explicitly shows every accepted variant before Save. Full33/9
layer stacks use actual saved top-first order for independent affine/BICUBIC
source-over composition. Two OUT packages protect111,104 source pixels total.

Exactly64 within-pair adjacent-seed contrasts:56 control edges (seven×four×two
modes) and8 subject edges (four×two). No cross-pair prompt, isolated weight,
encoder/tensor direction or quality causal conclusion follows these observations.

## Source sensitivity and resource registry

Six real Main cases: control32,per-prompt8,plain PI1 per mode;82 supplied candidate
pixels. Preparation/planning/SQLite/private inputs/request reconstruction/
staging/receipts/cursors/accepted projection stay real. Resource/LaMa resolution,
Project/index ownership and supplied outputs are controlled preconditions; these
CPU tests do not prove ML or public Add/Save.

Executed source fault: actual shared planner per-prompt offset `items.length` →
`iteration`. Two per-prompt cases must be semantic RED and four per-iteration/
plain neighbors GREEN. Baseline6/fault6/restored6:18 executions/2 RED/16 GREEN.
Use one isolated source copy, restore every original byte/dev/inode/mode/size/
mtime, confirm actual actor exit and preserve rollback until restoration proves.
No installed worker mutation/crash or additional native fault job is planned.

Evidence: `~/.codex/artifacts/imagegen-studio/runs/anima-image-per-prompt/20261012-checks`.
Reuse only `shared/illustrious-vpred-worker-012-20261007`, installed worker0.14;
fresh actual43-source/physical idle capture and all11 raw entry tables precede ML.
Entry allocated bytes: root29,071,491,072,pool28,071,571,456,compact999,919,616;
free disk47,785,893,888, MemAvailable26,790,984kB. Global SwapFree244kB is an entry
observation, not a task-swap or global safety claim. Planned additional compact
peak66MiB; budgets trigger inspection, never deletion of active/pinned evidence.
No new environment/weights/common-source PNG copies/downloads.

Native12GiB,launcher2GiB,combined14GiB watchdog, task-group swap0,one ML stage at
a time. Numeric-control32 deadline2700s;per-prompt8 deadline1800s. Prior actual
Anima8/2 stage times make a linear32 estimate approach1800s;2700 is a declared
operational allowance, not a measured throughput/capacity guarantee. Existing
stage-aware driver/resource guard supports it; no silent post-failure increase.
Smaller CPU checks remain bounded and serial. Current startup preserves PID
across exec only after actual manager PID/start/group/invocation/command ACK.
Root validates current namespace ownership and pins unchanged hardened mechanics.

## Evidence status and remaining scope

Completed: code/CLI/default checks, actual planner sensitivity, four native stages,
independent raw readback and guarded cleanup. Counts below belong only to this run. Random→Fixed, recovered Reuse,
uint32 wrap/overflow refusal, arbitrary inputs/methods/formats/masks/Advanced,
Regional Guidance/Smart Patch, quality/Invoke pixel parity/fullMVP/release remain
separate. Counts exclude historical evidence and setup/observer/OOM failures.

## Actual executions and readback

- Main/default focused12 plus latest oracle/profile/CLI/shared driver/cap/planner86:
  98 tests PASS,0 failures/skip. Lint/typecheck/app build passed. Original86 before
  normalization repair are not counted again. Fresh actual-Main baseline6 and
  restored6 also exercise the final normalizer boundary.
- Source review found the inherited normalizer rebuilt the outer DTO and dropped
  schemaVersion. The new profile now clones the entire frozen DTO and deletes
  exactly the three owner identifiers and independently validated seedBehavior.
  Actual-Main probes change schemaVersion and add an outer field; both changes
  must remain visible. Initial86 were GREEN without these probes: this omission
  was found by source review, not claimed as an existing test detection.
- Isolated actual shared planner `items.length`→`iteration` gave exactly the two
  per-prompt semantic failures; four PI/plain neighbors stayed GREEN. Baseline6,
  fault6 and restored6:18 executions/2 RED/16 GREEN. All565 original copied bytes
  and dev/inode/mode/size/mtime restored; repository subject unchanged.
- All four serial installed stages PASS: IMG32+8,normal mixed-alpha OUT32+8.
  Exactly80 admissions/completions/accepted layers,0 canceled,4 actual projects/
  saved-reopened packages.32-job controls contain source1+32; subjects source1+8.
  All80 owning settings comparisons retain later drafts separately.
- 16 per-prompt results match their own fresh mode's control slots
  0,1,10,11,20,21,30,31 in full decodedRGBA. Frozen DTOs retain outer schemaVersion;
  only stated owner IDs/validated behavior differ. There is no tuple-index equality
  requirement between control iteration2 and subject iteration0.
- Independent stdlib SQLite/ZIP/Pillow reader PASS23682 checks. All11 old table
  rows are preserved; deltas are queue+80,receipts+80,cursors+4,index+80,all others0.
  Final counts1150/1077/427/1002 respectively; acceptance journal remains0 and
  all six catalog tables unchanged. Four operational cursors and Save snapshots7
  match each project's last actual seed. Full stack composition protects111104
  source pixels across the two OUT packages.64 within-pair adjacent seed contrasts
  passed; no isolated prompt/weight/tensor or quality causal claim.
- Actual installed worker0.14/dependency metadata,26 consumed sources,five
  unchanged application bundles and whole566-member code/test/package freeze
  are bound. All43 original worker files retain bytes and physical identities.
  Reader checked22 registered completed actors; post-reader cleanup captured23,
  including the actual reader's exit. No historical rapid-PID/version exception.
- Native12GiB/launcher2GiB,combined14GiB/task swap0 remained enforced. Combined
  peaksGiB: IMG control12.643,IMG subject12.515,OUT control11.474,OUT subject13.616.
  Stage deadlines2700/1800s and completion polling1600s were unchanged. This is
  finite execution evidence, not global swap/RAM/VRAM/capacity/throughput proof.

## Artifact release and handoff

The initial inventory control incorrectly asserted the1GiB soft evidence budget
as a hard limit: exit1,0 ML admissions, actual physical exit retained. Inspected
projected excess17125376B was documented as a temporary required-evidence
exception. A separate reviewed inventory passed without overwriting the original
control/source/log/ACK. This setup failure is not semantic RED or a product fault.

After raw readback, the current guard rechecked all80 results, all11 tables,
restoration, actual actors, nine current packaged system-process descriptors,
82 same-user processes, mounts,418 retained dependency files, original source
members and the external dependency link. No unknown unreadable process was
exempted or presumed empty. It removed only this run's owned source copy through
held original directory FDs;565 source members plus package stub/link/directories,
10985472 allocated B reclaimed. No signals; external node_modules target untouched.
Fresh post-cleanup pool verification confirms physical idle and unchanged43 files.

Final inventory: root29111824384B,pool28082589696B,compact1029234688B,
free disk47722778624B. Both30GiB/1GiB soft budgets are satisfied; temporary
exception release condition is resolved. Reports/logs/fixtures, four `.igs`,
candidate PNG evidence and the sole compatible worker/catalog remain retained
for the then-next finite Anima image Random→Fixed replay, subsequently qualified below. No environment/weights/
common-source fixture copies or downloads. Source copy is disposed; its restoration
and removal manifests remain evidence, not a claim that it can still be read.

Subsequent [Anima Random → Fixed checkpoint](phase-2c-anima-image-seed-replay-research.md):32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA replays and2 unmodified original Main crypto returns. These counts remain separate from this historical80/4/16 gate. The subsequent [recovered Anima image Reuse gate](./phase-2c-anima-image-reuse-crash-research.md) is qualified separately. Next: Anima image cap32/prefix refusal. uint32 wrap/refusal/cap32 and remaining
method/input/format/geometry/Advanced/quality/public delivery/release combinations
remain open; masks/Regional Guidance/Smart Patch remain phase4.

The subsequent [Anima image MAX→0 gate](./phase-2c-anima-image-seed-wrap-research.md) qualified its own8 outputs/6 packages/4 wholeRGBA controls; these counts remain separate from this historical checkpoint. Next: Anima image cap32/prefix refusal.
