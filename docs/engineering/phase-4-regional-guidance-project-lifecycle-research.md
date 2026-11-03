# Private Regional Guidance Project submission and lifecycle

## Boundary and source basis

High-risk Main admission/queue/filesystem ownership change, based on clean
`45f533787fc1dce028c8cf8dbcd0c57f4c9ee304`. This slice connects a genuine open
Project to the existing private regional queue and includes its execution and
results in Project close/recovery teardown. It accepts no caller-built recipe,
preparation, target pathname, model choice or seed override.

Current local InvokeAI is clean at `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`.
Consulted sources and callers:

- `invokeai/frontend/webv2/src/workbench/invocationSubmit.ts` and
  `workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts`: capture the originating
  Project/account lifetime, prepare asynchronously and reject stale submission.
- `workbench/canvas-operations/generationComposite.ts`,
  `features/generation/core/canvas/compileCanvasGraph.ts` and
  `features/generation/core/canvas/addRegionalGuidance.ts`: one captured Canvas
  supplies ordinary pixels, regional planes, settings and compiled conditioning.
- `workbench/workbenchState.ts` and `features/queue/data/httpRealtimeQueueBackend.ts`:
  submit the compiled snapshot and correlate owner-bound queue actions.
- `invokeai/app/services/session_queue/session_queue_default.py` and
  `invokeai/app/api/routers/session_queue.py`: prepare before transactional
  admission, recheck the Project under admission, retry saved execution and cancel
  exact owners. `session_processor/session_processor_default.py` owns worker stop.
- `services/shared/invocation_context.py`, `images/images_default.py`,
  `image_files/image_files_disk.py` and `project_records/project_records_default.py`:
  queue-derived output identity, durable deletion intent and media ownership.

Invoke's graph/account services and workspace deletion cannot be copied literally
into Studio's Node/Python and `.igs` contracts. The adaptation was disclosed before
implementation: one captured owner, existing admission barrier and queue, exact
registered executor, then existing receipt/tombstone recovery. No alternative
queue, sampler, graph executor or media deletion protocol is introduced.

## Data and lifecycle owners

`ProjectService.withCapturedCurrentCanvasRegionalGenerationInput` captures the
coordinator/document/revision/epoch and pending raster/regional sources before
filesystem awaits. Both existing lower file leases use that same snapshot; they
never recapture a later Service document. Acquisition checks epoch identity before
yielding. Target composition owns its worker method/arguments, serializes the
existing single target filename and drains started operations before cleanup.
Historical regional capture keeps its previous read-only contract.

The new Main-only `ProjectRegionalGenerationCoordinator` requires explicit private
opt-in and the reviewed document ID/revision. It uses the shared Project operation
gate, existing ordinary preparation, operational seed cursor, one concrete planner
item, exact recipe resolver and request lease. `enqueuePreparedRegional` consumes
these while both leases live, under the existing orchestrator admission barrier.
It verifies current checkpoint policy/index identity, preflights existing staging
capacity, checks the originating epoch at SQL admission and checks again after
commit while dispatch remains held. A late refusal cancels exactly the new row;
uncertainty retains the fence and durable inputs.

Registered regional execution shares the existing queue slot and participates in
Project cancellation, scoped quiescence and application dispatch shutdown. Private
Retry uses frozen settings/resources/masks independently of current prompt or
regional edits, while verifying the same open Project owner and canonical path.
Application restart keeps existing cancellation/manifest recovery behavior.

Close reads all owned candidate kinds, fences admissions/claims, drains the exact
Project's claim/publication/worker ownership, then uses existing staging tombstones
before closing/discarding the document. Unconfirmed executor exit/publication prevents
teardown. Recovery Discard follows the same owner; sibling Projects remain separate.
Renderer tab switches/reloads do not cancel Main-owned jobs.

`listOwnedCandidates` is operational lifecycle enumeration. Existing public/Home
candidate enumeration remains unchanged: private recovered candidates require the
private coordinator for inspection/disposal. Public Results/provenance readers and
automatic dispatch still exclude the operation. The public close warning may count
private candidates so confirmation cannot silently erase hidden results.

## Finite private admission

- One static Current Canvas item; explicit composition/coverage/pool/layout inputs.
  Brace text refuses before target composition, rather than selecting one dynamic
  branch. At most three enabled regions, no regional reference descriptors.
- Actual Illustrious epsilon checkpoint and explicit resolved four-field noise
  policy, Euler, one image, steps 1–200, CFG 1–30, rescale zero, authored FP16 and
  Embedded VAE; no enabled LoRA. Values are checked, never silently forced.
- Existing transparent target bound: sides 8–2048 divisible by eight, area at most
  4,000,000 pixels, PNG at most 32 MiB. Explicit global alpha planes use the latent
  grid (`bbox/8`); world regional planes retain existing recipe projection.
- Effective global TI refuses before composition. Ordinary preparation retains
  truthful authored sidecars and verified pools; it is not rewritten into a fake
  empty preparation. Dormant refs may still be verified by ordinary preparation.
  Active local regional TI uses the existing exact recipe resource owner.
- Existing descriptor/vector/text/row/mask, 128 KiB frozen SQL, 1 MiB regional
  metadata, 64 MiB transported alpha and file-capture limits remain their owners.
  These are admission bounds, not measured RAM/VRAM/disk capacity.

Supporting full global TI requires a regional preparation-to-recipe agreement
through serialization, reload, Retry and staging. This remains a separate owner.

## Executed evidence and remaining scope

Focused authors exercised real ProjectService Save/reopen, SQLite, files, queue,
receipts and lifecycle with explicit small composition/model/inference substitutes.
ROOT’s final affected suite passes **695 distinct Main tests**, zero failures,
cancellations or skips. Common typecheck passes; final scoped ESLint/Prettier and
diff checks pass. Repeated/focused author runs overlap that total and are not added
to it. Controlled resolvers/compositors prove the Main ownership boundaries, not
native numerical behavior.

Enabled-region public NEW refusal, target-only Smart permissions, frozen-work
independence and Regional provenance/Compare/result-derived-preset exclusions
remain. PP-001/007/008 stay **«Пока не обещать»**. Public composition policy,
Generate/Results/Retry UI, Add/Save, prepared-global-TI, Anima regional execution,
capacity and useful visual semantics are not qualified by this private owner.

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-project/20261103-owned-submission/`.

## Genuine native continuation and review

A fresh producer used real Save/reopen/capture/planner/ModelService/composition to
prepare six complete Main fixtures, with zero network attempts and no model copy.
The new coordinator then authored, saved/reopened and submitted the fixed seed123
assignment through an **actual Project compositor and actual inference-ready child**.
No caller-authored preparation, recipe or worker command entered this submission.

The private job retained its original texts and both 1024² masks after later
Project edits were saved. All children closed before database/owner restart.
Startup canceled the pending attempt; coordinator Retry used its frozen inputs,
and pruning the source row did not change them. The real private executor produced
one PNG through the unchanged production loader/native regional output. This is
one native request: exact official Illustrious v0.1 epsilon `3e15ba…45aa9`,
1024²/bbox `(-13,5)`, two Euler steps, CFG5, explicit Main false-ZTSNR/leading,
FP16 Embedded VAE, no TI.

The **2,045,268-byte** output is byte-exact to the prior transport/durable control:
`e5b160371d02f7385eb9113bd3061a40e03136c40a966470b132194d5faddcec`.
Independent Pillow reopening verifies RGB/1024²/pinned ICC and decoded RGB SHA
`b18347c52c136101394dda692f03a93902c0db9ef28639f6ac0aa5611738b905`.
This is numerical replay/ownership evidence, without a new visual-quality claim.

Actual close impact counted one private candidate while public/Home lists stayed
empty. Close without impact confirmation refused; confirmed close tombstoned/disposed the private
result and closed the Project. A further database reopen did not resurrect it.
Generation and close left the last explicitly saved package unchanged. Network
attempts were zero; all three spawned children exited, and scratch was empty.
The complete unit took **42.902 s**, host peak **2,212,421,632 bytes**, within
12 GiB/zero-swap/600 s. GPU free memory was inspected before execution; allocator
fraction/peak VRAM were not independently constrained or measured.

An isolated close-impact mutation omits private candidates after publication:
**2 GREEN → one semantic assertion RED + one pending-close control GREEN →
2 restored GREEN**. All 608 copied source files restore exactly; the live checkout
never changed. This tests lifecycle warning/ownership sensitivity, not another
native or visual intervention.

The independent full source review found one P2: a compositor could reject with
`WORKER_EXIT_UNCONFIRMED` while its child retained inputs, yet the combined lease
would remove raster staging and allow queued work to overwrite its target path.
ROOT reproduced two RED cases with a confirmed-exit GREEN control, then adapted
existing Smart capture retention. That error permanently retains raster files
for the lease and refuses both queued and new composition before any write,
including when the callback catches it. The exact three cases then pass; a fresh
bounded correction review is CLEAN. Production bytes are R2-exact; the final test
change adds only four lint-required braces with unchanged assertions.

Excluded diagnostics remain retained separately: author typechecks overlapped
unfinished modules; first mutation setup lacked the ICC fixture; a long TMPDIR
exceeded the tsx CLI socket path; the initial native attempt correctly refused a
0775 scratch before any wire/native request. The successful continuation creates
an explicit 0700 private scratch and restores the declared scene through genuine
Project edit/Save. No refusal guard or production bound was relaxed.

## Retention

The six producer handoffs remain historical JSON; the final package/database
correspond to the later explicitly saved native-test edits. Its earlier producer
ZIP hash is historical, rather than a pin of that later package. Original mask
assets and complete authored documents/recipes remain available.

Raw final Main package/database, exact source, original PNG, complete handoffs, command
logs, failed setup diagnostics, regression RED/control/GREEN and mutation
original/patch/restoration are retained under the evidence root. Lifecycle records
separate archived payloads from the protected reusable runtime, offline configs
and single original checkpoint. Historical absolute payload paths refer to the
retained archive after disposal; cleanup records preserve actual bytes reclaimed.

Final no-follow retention verifies **784 entries** (742 regular files, 41 directories,
one literal `node_modules` symlink). After all readers ended, source restoration,
fresh owned-process/incoming-dependency checks and archive verification, only the
owned live `payloads` directory was removed: **19,058,688 allocated bytes** reclaimed
during that deletion-only interval. Original PNG and compact evidence remain
outside that archive as well; no runtime, offline config or checkpoint was removed.
