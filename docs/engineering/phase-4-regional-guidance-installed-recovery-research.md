# Installed Regional interruption and recovery

## Boundary and status

This continues the
[installed public qualification](./phase-4-regional-guidance-installed-research.md)
from clean Studio `e8e3ac622bcf69243c02291cf29d316a2688e1b9`. Scope is an additive
`installed-regional-invoke-recovery-v1` profile in the existing qualification
runner, a focused public recovery test and documentation. No production recovery
mechanism, registry, queue, sampler or runtime replacement is introduced.

**Installed native-r2 finite PASS; retained-data audit and lifecycle closure complete.**
ROOT records **13 checks**, **172.414 s** controller / **171.311 s** internal,
three lifetimes with two intentional whole-owned-scope SIGKILL interruptions and
healthy final exit **0**. Native-r1 remains an excluded harness failure.
Facts below are ROOT-reported, not this author's independent runtime/artifact
inspection. PP-001/007/008 remain **«Пока не обещать»**.

Final runner SHA-256:
`c2f74fec975c53889d2dc6ba4fb6ca243f99a5c03e8dfbb7acf07d996470c605`.

RUN:
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-installed-recovery/20261103-public`.
Reuse the single noneditable worker **0.14.0** pool at
`~/.codex/artifacts/imagegen-studio/shared/regional-public-worker-014-20261103`.
Prior provision-report SHA-256:
`f17ee319fd03db98c2b35fb4fc708d81d44419e053a378d0f5fa96af459e11d8`.
Original checkpoint SHA-256 remains
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`.
No environment or weight copy/download is part of this stage. Catalog setup
continues through the actual repository; installation UI remains unqualified.

## Current InvokeAI and Studio owners

Current local InvokeAI revision, read directly:
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`. Implementations and callers:

- `invokeai/app/services/session_queue/session_queue_default.py`: startup
  cancellation, scoped cancel and saved-graph Retry.
- `invokeai/app/services/shared/database/queries/session_queue.py`: exact
  interrupted in-progress/waiting workflow-chain cancellation.
- `invokeai/app/services/invoker.py`: starts queue/services before processor;
  stops processor before dependent services.
- `invokeai/app/services/session_processor/session_processor_default.py`:
  exact-item cancellation events, failure persistence and bounded worker stop.
- `invokeai/app/api/routers/session_queue.py`: public Retry/cancel callers.
- `invokeai/app/api/dependencies.py`: constructs the actual queue and processor.

Invoke may retain standalone pending work. Studio's accepted
[Queue contract](../features/queue-manager.md) cancels **both pending and running**
work at startup, without automatic resume. This existing adaptation remains.

Studio `generation-bootstrap.ts` recovers the queue, then normal/Smart staging,
before exposing the same instances to dispatch. `generation-queue.ts` changes
unfinished rows to `canceled / APP_RESTART`, incrementing status sequence once
and retaining registered frozen input; an existing user-cancel request keeps
its own diagnostic. `generation-staging.ts` verifies manifest/PNG/receipt identity.
Only the exact reserved-manifest APP_RESTART window can reconcile to completed;
ordinary completed receipts retain their candidate independently of Queue history.

`generation-action-controller.ts`, `generation-orchestrator.ts` and the queue's
public regional Retry copy the frozen operation/input into independent attempt
identities. They check current document ownership and runtime/resources without
recomposing from later authoring. Retry additionally consumes a source status
revision; it does not rewrite the original frozen JSON.

`project-service.ts`, `project-autosave.ts`, `project-generation-recovery.ts` and
`project-temporary-recovery.ts` own Open/Recover. A clean Open/attach does not
create a dirty document shadow; directories alone do not imply pending recovery.
A valid unaccepted candidate forces `recovery-required / recoverable` even with
an absent/clean shadow. `App.vue` presents dialog **Recovery available**, with
button **Recover**. This opens saved state cleanly for staging-only recovery,
retains the candidate and changes neither `.igs` nor Undo history.

**Discard Recovery and Open Saved** tombstones temporary results before removing
the shadow. A confirmed graceful Project/app close also cancels unfinished work
and discards unaccepted staging. Those actions cannot stand in for the executed
crashes. Existing acceptance journal/shadow, signed Results and explicit Save
remain governed by [Generation Results](../features/project/generate-mode/generation-results.md).

## Native-r2 three-lifetime result

Actual built renderer/IPC/default RuntimeManager and original installed worker;
no ready/startClient injection, lease adapter or copied generation loop. Current
Canvas **1024²**, bbox **(-13,5)**, **CFG5**, **Euler/Normal**, Main **leading**
policy, **FP16 Embedded VAE**. Exactly **two regional wires**, one interrupted
and one healthy completion. **20 recorded workers = 7 / 7 / 6** by lifetime;
worker spawns include preparation/qualification, not 20 inference requests.

| Lifetime      | Actual ROOT result                                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L1            | Clean saved document/active regions, UI Generate seed123/30 steps. Actual regional wire, durable running row, no new receipt/candidate/seed cursor. Entire owned Electron scope SIGKILL; fresh physical exit before relaunch                                                               |
| L2 startup    | Original job canceled APP_RESTART, sequence advanced once, frozen JSON/target/recipe/alpha unchanged. No automatic resume/new wire. Ordinary UI Open needed no Recovery dialog                                                                                                             |
| L2 Retry      | UI two steps/seed124/both regions disabled and explicit Save. Queue Retry consumed frozen30/123 composition/masks/policies; unaccepted PNG, completed receipt/cursor and native-worker exit verified. Saved package/draft preserved; whole-scope SIGKILL and fresh physical exit before L3 |
| L3 Recover    | Actual Recovery available DOM/IPC, then Recover. Exact candidate/session/frozen SHA/PNG returned; clean saved authoring and `.igs` unchanged, no auto-acceptance                                                                                                                           |
| L3 acceptance | Original Add IPC finished/OK; exact Raster placement/pixels/base-only provenance, grouped Undo/Redo and explicit Save/independent ZIP/reopen preserved accepted output and current disabled-region authoring. Healthy final close/physical exit                                            |

L1's fault anchor is the actual JSONL write/running/no-job-receipt boundary. Numeric
regional progress is absent; no mid-step or particular UNet step is observed or
claimed. This is interruption of an active request at the transport boundary.

All **six prior packages** and original **two jobs / one receipt / one cursor**
remained unchanged. Final global SQL: **four queue rows / two receipts / two
cursors**. Source review found and corrected a vacuous baseline guard before the
first native attempt: the runner requires those actual old records and an
accepted ZIP, rather than accepting an empty baseline. Candidate identity/bytes
persist; URL/focus/checkbox reinitialization is not persistence evidence. No new
Generate followed the recovered candidate.

Output RGB PNG: **1,379,326 bytes**, SHA-256
`942f59c35b92c3bab04328d92d3714cca48a24106b0c4a8e818559af17e913a1`;
RGBA SHA-256
`7bc3695217b9f44285c97d7b19a9d2c3478b0441da019b30897c51f5ce126829`.
Independent PNG/browser whole-RGBA, Canvas delivery samples, signed Results,
Raster, saved ZIP and reopen agree. These equal the previous UI-stage output;
this is no broad parity/quality proof. New accepted package SHA-256:
`c186e2e09328e673033fc84ee2648f7e5969e10b5d14acb9bdc2658954984767`.

ROOT actually viewed seven final screenshots: two refusals, edited authoring,
survivor before crash, after Recover, preview and reopen. The Recovery NModal
was exercised through actual DOM/IPC but was **not visually captured**; no dialog
layout PASS or full UI-audit claim. Optional-thumbnail placeholder observed;
thumbnail production and historical negative quality findings are unchanged.

Bounds reuse the existing **12 GiB** aggregate envelope: launcher **2 GiB** plus
native **10 GiB**, swap **0**, **1,800 s overall**; later native watchdogs use
the remaining budget. Native MemoryPeak by lifetime: **1,464,209,408 /
1,836,515,328 / 659,300,352 bytes**; launcher **1,269,149,696 bytes**. Peaks and
sampled maxima are separate, not a capacity claim. Physical identities:
**16 / 16 / 15** per life; fresh ROOT proof confirms **47 distinct PID/start
identities across three scopes**, all exited. Final source/bundle/worker/config/
pointer/provision/model inode+SHA/catalog/baseline checks PASS; pageErrors empty.

## Excluded native-r1

Native-r1 failed in **56.701 s** on a premature harness status assertion, not a
product failure. Postmortem: new row **pending, sequence 0**, frozen job not yet
claimed, **zero regional wires**. Fallback owned SIGKILL and **15-identity**
physical exit confirmed. Failed app state was retained before exact restoration
of **119 members** from the old qualified baseline (identity prefix `a386…`);
runtime was unchanged. Final runner changes only the pending-allowed polling
assumption after the earlier precondition fix. R1 is not restart-recovery PASS.

## Completed lower evidence and sensitivity

| ROOT-executed evidence | Actual result                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lower checkpoint       | **109 PASS / eight files** plus **102 PASS / four disjoint public/queue/staging files = 211 distinct cases**; includes one new public regional restart case in `regional-public-results.test.ts`                                          |
| TypeScript/Vue         | Final typecheck-r2 PASS, **27.354 s**                                                                                                                                                                                                     |
| Final mutation-r3      | Exact final test in a **619 regular-file** copied source fixture; only public APP_RESTART changed to USER_CANCELED, ordinary control unchanged: **baseline two GREEN → one APP diagnostic RED + one ordinary GREEN → restored two GREEN** |
| Restoration            | All **619 files** restored exactly; production tree never mutated. Only the required small ICC/source fixture was copied; no environment/weights                                                                                          |

`mutation-r1` failed baseline fixture setup because the required ICC was missing.
It is **not semantic RED**. The corrected copied fixture produced the recorded
baseline/mutant/restored sequence. Lower evidence proves diagnostic sensitivity,
not installed crash recovery or image quality. The fixture uses a direct queue
producer and an identity-only Project file; actual saved authoring/renderer behavior
is established separately by native-r2. Final mutation-r3 repeats the sensitivity
with the stronger verbatim Retry SQL assertion; earlier r2 is separate history.

ROOT's final new-test source SHA-256:
`9ccaa0cbcd6251d27e437468bdc30598b9d696d449f6970adf9fc6dd00db9153`.

## Limits, failure and retention

Unfinished startup work must not resume. Invalid/partial outputs cannot become
Results; only verified manifest/receipt identity authorizes recovery. Failed
recovery keeps dispatch unavailable; uncertain exit retains the existing fence.
Whole-scope interruption and confirmed exit are essential: Python reads stdin
between synchronous requests, so Main-only death does not prove child exit.
This case claims neither worker-only failure nor immediate restart with an
orphan Python child, and introduces no automatic orphan reaper.

One L1 transport lease, `scratch/regional-request-n2pw4c`, remains after abrupt
scope death: bundle, target and two alpha files. It equals the captured wire's
stagingRoot; no actors remain after the three scope exits. This is an existing
automatic transport-scratch cleanup gap, not qualified automatic cleanup or a
new production reaper/fix. Empty shared `layer-responses` was left untouched.

ROOT created the final-app-state archive: **142 entries**, **27,377,664 allocated
payload bytes**, **7,794,471 gzip bytes**, SHA-256
`7e8fe53371c98f68c960a10105e647f4a3cc0837b1350d0d549d4a458729221f`.
Independent closed-data audit is CLEAN: member bytes/metadata, standard PNG decoding,
ZIP assets/provenance, SQLite integrity/FKs/21 migration hashes, final records and
exact mutation restoration agree. This was retained-data verification, not an
independent native rerun or physical-exit/deletion certification.

After all readers ended and fresh PID/start/scope checks, ROOT removed only that
archived idle transport lease: **2,117,632 allocated bytes**. The failed-attempt
reset reclaimed **20,942,848 bytes** before restoring the exact old baseline.
Two verified source-fixture disposals reclaimed **12,398,592 bytes each**; literal
`node_modules` links were not followed. Total across deletion-only intervals:
**47,857,664 bytes**, not a net change since setup/restoration/archive creation.
The original model, runtime and ordinary app data were not removed or copied.
The final archive describes the pre-cleanup state; release records explicitly
account for the one removed transport directory. Empty `layer-responses` remains.

RUN/SHARED [lifecycle](./artifact-lifecycle.md) records are retained. Keep the one
compatible runtime/catalog and original/config/provision companions for the next
Main-only/orphan-worker and transport-lease lifetime investigation. Before final
source archives, artifact root is about19.87GiB and this run about24MiB, below its
soft budgets; older cross-run graphs remain protected. Exact root/run measurements,
commands, failed inputs, source pins, reviews and deletion intervals are in
`RUN/qualification-summary.json` and release records. Failed attempts stay excluded.

PP-001/007/008 stay unchanged. Visual quality/useful assignment, Anima regional
inference, numeric regional progress, full Invoke parity, release Install/Repair,
general capacity and orphan-child immediate restart remain unqualified.
