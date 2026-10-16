# Smart Patch durable acceptance

## Prospective scope

Base `358de94`, authorized phase4, high-risk persistence/lifecycle boundary.
This is implementation with self-review, not a blind audit. Supporting contracts:
PP-007/008, Smart Patch layer, GenerationResults, document lifecycle and Undo/Redo.

This finite slice adds the private Main Add owner and recovery dispatch. Public
Smart Patch Generate/Results/IPC controls, variant management, history navigation,
Compare/Preset and installed inference qualification remain separate owners.

## Invariants and alternatives

Use the existing single project/document SQL acceptance-intent slot with a new
strict Smart payload. A second table would admit independent competing normal
and Smart intents; sharing the slot preserves mutual exclusion. The legacy
Raster parser stays strict. A bounded kind dispatcher chooses the recovery
owner; corrupt/foreign records fail closed rather than disappear.

One shared Project operation gate protects normal Add, Smart Add and Close.
The generation fence closes admission/claim before preflight. Actual selected
PNG/mask bytes, exact reviewed candidates/jobs, current document revision and
visible/unlocked exact target are checked before mutation. Changed existing
inputs retain frozen outputs/provenance; missing targets cannot retarget.

Cancel only reviewed siblings in captured target-owned sessions, through the
actual Smart processor. Drain claim startup, inference, CPU output and publication
before tombstones. Unknown owner/physical exit keeps the fence and files. Check
completed candidates again after cancellation: a late result requires review.
Shared session tombstones must never erase another target/document or ordinary
Raster-generation results.

Record exact immutable variant intent, append old+new variants with one active
anchor and one Undo step, confirm synced shadow, then atomically publish session
tombstones and remove the intent. Only afterward may filesystem staging cleanup
run. Add never performs explicit Save or rewrites seed cursor/receipts. Retry
cannot duplicate variants or reactivate a former selection. Complete lineage
reconciles; full absence abandons without consuming candidates; partial/changed
lineage retains intent, pixels and fence. Names/active choice/current authored
geometry do not rewrite immutable lineage.

## Verification plan and resources

Use real SQLite migrations, Project service/coordinator, package writer/loader,
shadow, staged candidates and queue. Controlled failures/time/worker transport
are declared; fixture adoption is not public Add evidence. At least one actual
private entry must reach durable shadow, staging cleanup, Undo/Redo and explicit
Save/reopen. Test post-intent/pre-apply, post-shadow/pre-tombstone and lost-ack
windows, exact ownership/selection and locked/hidden/orphaned controls. Mutate
critical invariants in isolated copies, require causal RED plus neighboring
GREEN, prove original restoration and physical exit.

Keep inherited1..64 accepted variants,10,000 archive entries,16MiB project JSON,
32MiB encoded world PNG,2048 world dimension and400-session SQL batching. These
are existing safety decisions, not measured capacity. Run checks sequentially
under at most4GiB aggregate cgroups, zero swap and finite deadlines. Reuse the
existing source CPU environment and pinned LaMa only if a relevant regression
requires it; no runtime/model copy or new downloads. Initial artifact inventory
is about28GiB total (27GiB shared +1.3GiB runs),42GiB free; preserve existing pins.
Separate compact evidence and clean owned idle fixtures at handoff.

## Implemented boundary

`ProjectSmartPatchAcceptance.accept` is the private Main entry. It snapshots the
request before admission, revalidates owner/revision/epoch, prepares actual
candidate bytes/current source, preflights the projected package, drains reviewed
siblings, then rechecks the available set. Only selected verified Main paths reach
`ProjectService.appendSmartPatchVariants`. That service stages and revalidates
images through the actual coordinator, preserving authoring and prior variants.

`SmartPatchAcceptanceJournalRepository` shares migration0010's existing SQL slot
with the strict Raster journal; no migration or portable format version changes.
The intent records immutable variants plus exact candidate/session/hash witnesses.
This is necessary because pruned receipts lack document/target/payload metadata.
Completion publishes all captured tombstones and removes the exact intent in one
transaction. Missing-intent retry requires every tombstone already present.

`GenerationOrchestrator.cancelSmartPatchAcceptanceJobs` uses registered private
Smart processors, including claim startup and SQL-completed/still-publishing work.
Unknown owners or uncertain physical exit retain protection. Qualification-only
witness extension after a late completion/prune never expands the reviewed result
set: the subsequent available-set check still refuses and preserves both images.

Main constructs the acceptor from the actual recovered Smart staging instance.
`ProjectGenerationAcceptanceRecovery` classifies one owner; null-intent Smart
accepted/staged overlap gets a read-only probe and stays fenced. Close, native
shutdown and document-edit guards use the composite pending marker. Ordinary
Raster Add retains its own pending-selection policy. `withRasterAdd` keeps an
admission marker across narrow classification, actual gate admission and Add;
concurrent full recovery waits and classifies afterward. No nested gate is used.

`proveAcceptedSavedPackage` is shared with ordinary acceptance. A clean document
alone is insufficient: all saved members, exact JSON, canonical non-symlink
ownership, stable file identity, file sync and parent-directory sync are required.
Absence-based intent abandonment rechecks the document after SQL acknowledgement;
a concurrent Redo restores the intent instead of creating an unknown overlap.
Historical hierarchy copies retain provenance and do not invalidate an exact
original handoff or unrelated new Add; competing canonical creation claims for
the nominated candidates still conflict.

## Parameter and state registry

| Axis / parameter                             | Source and finite boundary                                                     | Refusal / neighboring control                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Selected variants                            | Existing planner/schema operation bound1..64                                   | Empty/duplicate/invalid IDs refuse;64 valid journal variants vs65 refuse                             |
| Sessions, witnesses, inspected rows/receipts | Existing archiveEntries10,000 safety ceiling                                   | Bound input and total result count; actual10,000-session transaction/retry test                      |
| SQL reads / writes                           | Existing400-session bindings/tombstone batches; new100-row queue pages         | Page bounded128KiB frozen payloads; cross-chunk receipt/retained-row mismatch refuses                |
| Document/package                             | Shared16MiB project JSON and existing ZIP/manifest/uncompressed ceilings       | Metadata-only preflight refuses before cancellation/adoption; neighboring valid proposal             |
| World image                                  | Existing32MiB encoded PNG,2048 per dimension, canonical sRGB RGBA8/alpha proof | Actual selected file, frozen hash/seed/context and contribution alpha checked, never Renderer path   |
| Ownership                                    | Exact project key/path/document/target; current revision and epoch             | Hidden/locked/orphaned refuse before cancellation; changed eligible target retains frozen output     |
| Lifecycle                                    | Reviewed pending/running IDs, actual registered owner and physical exit        | Unknown owner retains slot/fence; claim startup and completed-but-publishing remain owned            |
| Recovery lineage                             | Full, absent, partial/changed, unknown overlap                                 | Full cleans after durable proof; absence preserves candidates; uncertainty keeps intent/pixels/fence |
| Resource ceilings                            | Serial source checks≤4GiB aggregate, zero swap, finite deadlines               | Per-run cgroups; native KDE scopes separately bounded, no environment/model copies                   |

These are safety bounds, not a measured capacity or latency claim. Scope is all
verified completed candidates for the exact target and captured sessions, not
unrelated target batches that have not produced an available candidate. Other
same-target sessions arriving later remain outside the recorded cleanup set.

## Executed verification

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-durable-acceptance/20261016-add/`.
This is a self-review with cross-component agent review, not a blind independent
audit. Default-workspace discovery, literal model output and controlled failure
boundaries are explicitly declared where injected; Service/coordinator/SQLite,
package/shadow, actual PNG reads and source CPU composition remain real.

- `affected.log`:170 TS files,2647 PASS,0 FAIL,2 explicit pre-existing pinned-LaMa
  OUT skips;272s,1.13GB observed cgroup peak,0 swap. `pinned-lama.log` executes both
  excluded family OUT cases with the existing verified pinned weights:2 PASS,
  0 skip,23.7s,1.36GB peak. No download, runtime or model copy.
- Actual private Add runs for both families through Project capture, real SQL
  admission/claim, native reduced family architectures, CPU world composition,
  receipt-backed staging after queue pruning, durable Add, one Undo/Redo and
  explicit Save/reopen. These are CPU source/checkpoint topology fixtures, not
  installed trained-model or image-quality/Invoke-parity qualification.
- Actual Service tests cover lost intent acknowledgement before apply,
  post-shadow restart through a fresh lease registry, missing/unsynced shadow,
  exact saved-package recovery, lost completion acknowledgement after atomic
  tombstones and queue pruning, late completion/prune requiring renewed review,
  current authoring/outdated frozen inputs, permissions/orphaning, caller aliases,
  precommit race, partial lineage, unknown overlap and Redo during abandonment.
  Simulated in-process restart is explicitly distinguished from physical kill.
- `publication-baseline.log`:10 lifecycle tests PASS after strengthening the
  publication barrier assertion. The initial no-op quiescence mutant survived
  because the test checked `settled` before the completion continuation ran.
  The revised observer is registered before waking the caller and checks actual
  return ordering against the held writer; no timing sleep supplies the oracle.
- Eleven isolated semantic mutations each produce exactly one causal assertion
  RED and one neighboring GREEN: intent-before-adoption, directory sync, late
  completion review, immutable proof, transactional tombstones, pruned receipt
  witness, publication drain, inactive variant UUID collision, saved-document
  identity, single recovery owner and abandonment/Redo protection. Copies are
  imported through verified subject graphs, then removed only after physical
  exit and unchanged-original proof. Earlier whitelist maintenance and the
  surviving weak-test attempt remain separate evidence, not successful scores.
- `native-raster-report.json`:actual built Electron/preload/Main IPC concurrently
  accepts a verified ordinary candidate and opens the Project, preserves the
  explicit Save boundary, supports public Undo/Redo/Save, then reopens the saved
  image after a real Electron restart. Three checks PASS, no page errors; three
  native groups and descendants physically exit. Literal fixture inference is
  declared. Launcher1GiB + active native scope2GiB (plus128MiB deadline action),
  zero swap and independently confirmed90s native deadlines remain below4GiB.
  Initial harness-only optional Raster DTO and inherited-cgroup assumptions were
  corrected; neither failed attempt is product-defect or qualification evidence.
  A final lint/focused scheduling overlap had an observed combined-peak upper
  bound3.31GB/zero swap; the focused delivery rerun is serial, and the per-run
  controller now holds a file lock to prevent overlapping heavy checks.
- `focused-delivery.log`:92 focused checks PASS,0 skip after all code/style changes.
  Final TypeScript/Vue typecheck, global partitioned ESLint and production build
  PASS and are recorded separately. No Vue/prototype surface changed, so prototype interaction
  tests were not rerun. This slice makes no screenshot or new visible-UI claim.

## Remaining owners

Public Smart Generate/Results/IPC, production runtime admission/drain, variant
selection/rename/delete and freshness/resource diagnostics, accepted-history
navigation and Compare/Preset remain separate. Public Close/Recovery impact
confirmation for Smart temporary jobs/candidates belongs to that integration;
a private execution caller still owns stopping/draining its handle. Installed
trained-model qualification, complete Smart Patch feature readiness, full MVP
and release readiness are not claimed. PP-007/008 stay «Пока не обещать».

Cleanup confirms59 idle bounded units, mutation-copy restoration and all native
process/scope exits before removing7,282,688 allocated bytes of owned disposable
payload/bytecode. Compact evidence is about1.7MiB, including one verified saved
package. The prior shared runtime/catalog and inherited campaign pins remain
protected. Final check reports and delivered revision are recorded in the compact
evidence lifecycle/delivery reports.
