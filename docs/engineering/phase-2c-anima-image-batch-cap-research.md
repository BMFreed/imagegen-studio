# Installed Anima image cap32 and selected prefix

Entry: `edffbabb6ed5177e5e9ffbdf110dfa015fe01a5a`, clean `master`, after
[Anima image MAX→0](./phase-2c-anima-image-seed-wrap-research.md).
R0 was interrupted by a verified system reboot. Its results are excluded from
qualification. Recovery, the resumed prospective preflight and all four fresh
R2 native stages passed. Independent raw readback passed85373 checks; guarded
cleanup and post-cleanup pool verification passed. PP-004/005/007/008 remain
«Пока не обещать».

## Contract, owners and risk

The [dynamic prompt contract](../features/project/generate-mode/dynamic-prompting.md)
separates selected `maxPrompts` from the public 32-job admission bound. The
selected pairs multiply by iterations. An oversized batch is refused completely;
confirmed Discard + Generate must preserve existing temporary results on refusal.
The [results contract](../features/project/generate-mode/generation-results.md)
keeps temporary completion separate from explicit Add and Save.

High-risk verification path: renderer → actual Main preparation/expansion → durable
queue and private inputs → installed worker → receipt/cursor/temporary results →
Add → immutable provenance → explicit `.igs` Save/reopen. Root owns all execution,
mutations/restoration, resource observation, cleanup, commit and push. Delegated
authors see source; their work is source-informed self-review, not a blind audit.

Confirmed source owners: `generation-batch-policy.ts` sets 32; the shared planner
checks selected pair count against `floor(maxJobs/iterations)` before producing
items. Anima IMG preparation and normal OUT orchestration reach this policy
before durable publication. Queue validates the captured immutable batch again.
The 64-candidate recovery ceiling and byte limits are separate from public cap32.
No product limit change or reachable product defect is assumed by this gate.

## Frozen finite plan

Two scopes: common-source IMG and normal mixed-alpha OUT. Each runs these stages
serially, with its own current boundary report as the prefix control:

| Stage                       | Selected pairs × iterations | Requested seed behavior | Outputs                      |
| --------------------------- | --------------------------- | ----------------------- | ---------------------------- |
| Boundary                    | 4 × 8                       | Fixed0 / per iteration  | 32, no truncation            |
| Prefix                      | First 3 × 2                 | Fixed0 / per prompt     | 6, explicit truncation       |
| Refusal before boundary Add | 1 × 33                      | Fixed0                  | No new jobs; BATCH_TOO_LARGE |

Handwritten pair order: red/blurry, red/noisy, blue/blurry, blue/noisy, with
positive weight1.3 and negative weight0.7. Boundary seeds0…7 repeat per pair;
prefix seeds0…5 match own boundary slots0,1,10,11,20,21. Match full executed DTOs
and whole RGBA before Add, excluding only three ownership fields and the
independently asserted requested seed behavior. No prompt/resource/source/
conditioning/sampling field is dropped to obtain equality.

Totals: four native stages, 76 admissions/completions/accepted layers, four final
Save/reopen packages, 12 own prefix pixel matches, two confirmed33 refusals,
four scoped cursor/snapshot pairs and zero cancellations. Final layers are
source1 + accepted32/6, cursor/snapshot7/5. Source-only initial/pre-refusal Saves
and paired capture copies are preconditions/evidence, not additional accepted
packages. Two OUT final previews check111104 original protected source pixels.

Refusal occurs with32 actual completed candidates before Add. Author and Save
the refusal draft before capture; confirm actual Discard + Generate, observe its
correlated typed state error and compare candidate IDs/PNGs/receipts/cursor,
private/frozen inputs, session, imported source, raw Project/saved/shadow data and
visible Undo/Redo availability. No private Undo-stack claim. Restore the
legitimately authored working draft before Add/Save. Later edits stay separate
from the frozen accepted inputs. Portable provenance keeps raw weighted text,
actual seed and resource/source context; compiled/step/posterior are worker DTO
checks, not portable fields.

## Parameters, resources and evidence

Historical evidence/source copy:
`~/.codex/artifacts/imagegen-studio/runs/anima-image-batch-cap/20261013-checks` (R0).
Resumed native evidence:
`~/.codex/artifacts/imagegen-studio/runs/anima-image-batch-cap/20261013-checks-v2` (R2).
One compatible worker0.14/catalog at
`~/.codex/artifacts/imagegen-studio/shared/illustrious-vpred-worker-012-20261007`.
Use exact installed Anima/Qwen/VAE/Myth−0.5, the existing47531-byte common source
PNG and exact LaMa for OUT. Euler256²/N3/two updates/CFG4/rescale0/strength0.5,
Auto VAE and OUT bbox x64/y0 remain the prior verified settings. No runtime,
weights, original image copy or download is needed.

Original inventory: root27.2175GiB, pool26.1641GiB, compact evidence1.0534GiB,
free44.2337GiB. Resumed entry: root27.2586GiB, pool26.1711GiB,
compact1.0875GiB, free44.2476GiB. Compact evidence exceeds the1GiB soft budget with pinned prior
controls/recovery/helper proofs. Recorded exception allows96MiB additional
source-copy/raw/PNG/ZIP evidence; remove the restored code copy after independent
PASS and fresh physical/dependency/FD/maps guards, then remeasure. Root30GiB is
a soft review budget, not a GPU or model capacity measurement.

One ML stage at a time: native12GiB + launcher2GiB, combined14GiB watchdog,
task swap0. Boundary2700s and prefix1800s use the existing stage-deadline DI;
completion poll1600s. The previous Illustrious cap run demonstrated that1800s
could end during32-result comparison readback, so its successful2700s allowance
is reused without changing memory or comparison coverage. CPU groups use2GiB
and300s; lint uses its established6GiB ceiling. Every started actor requires a
real PID/start/group/invocation ACK before command exec and physical closure.

Before native work, freeze all consumed sources/five unchanged app bundles,
full code/test membership, literal plans/templates, eleven entry tables,43
original worker identities, controllers and independent reader. Only future
prefix `baseline.reportSha256` may be materialized after its own boundary
passes and physically exits. Stop at a failed stage, preserve original reports
and actual counts; no automatic retry or historical result relabeling.

## Planned tests, sensitivity and independent readback

Actual Main cases for both modes: boundary32, prefix6, concrete31/concrete1
neighbors and refused33. Resources/source pixels/output PNGs and capacity
preconditions are disclosed collaborators; actual preparation, planner, queue,
SQLite, private inputs, requests, receipts/cursor and provenance stay real.
CPU refusal checks no durable admission effects, not retention of32 ML results.
The installed UI supplies the latter evidence.

Four isolated actual-source faults: public cap32→33 (two refusal RED), silent
truncation (two prefix RED), wrong per-prompt offset (two prefix RED), strict
overflow `>`→`>=` (boundary32 and concrete31: four RED). Baseline/restored10
GREEN each and40 fault executions give60 executions,10 semantic RED/50 GREEN
if all expected outcomes occur. Restore the whole source copy in bytes and
physical identities; original production and installed worker stay unmutated.
Import/collection/OOM/controller failure is not semantic RED.

Independent stdlib/Pillow raw readback may use SHA-bound mechanical helpers,
but no production planner, qualification oracle, ML code or prior successful
aggregate as an expectation. Check all76 inputs/configurations/owning comparisons,
four complete ZIP/assets/previews/cursor snapshots,12 own prefix controls and
both refusal captures. Preserve every old row across eleven tables, six catalog
tables, all43 worker files/identities and all consumed source/bundle bindings.
R2 entry queue/receipt/cursor/index/journal1247/1147/441/1060/0; expected deltas
76/76/4/76/0 and final1323/1223/445/1136/0. These include the interrupted
R0 additions32/11/1/0/0 and its later21 APP_RESTART transitions; those do not
qualify any cap stage or final accepted package.

## Interruption, actual recovery and prospective checks

R0 admitted32 jobs before the machine changed kernel epochs. Raw SQLite had11
completed jobs/receipts, one running and20 pending; no accepted result or final
accepted Save/reopen package existed. Its original report remains `running`
with no completed generation records because the all-completions barrier was
not reached. Original launcher journal, boot IDs, PID/start/cgroup/timer absence
and raw rows are retained; this interruption is not a semantic mutation or
evidence of OOM. The initial source-only `.igs` is a precondition, not a qualified
accepted package.

Actual Main startup canceled exactly21 unfinished jobs with `APP_RESTART`,
incremented their status sequence, and preserved every other queue field, all
other table rows,11 temporary PNG/RGBA results, their manifest/receipts, scoped
cursor2 and source-only Save snapshot null. A separate read-only stdlib/Pillow
reader passed1587 checks. It did not launch Electron, repeat recovery, generate,
accept or Save; it makes no claim about Home UI or the public11-result DTO.

Three diagnostic failures remain failed and proof-bound: an undeclared `sharp`
import before startup; expecting `documentId` in the Home summary after actual
startup; and a prospective reader counting only top-level TAP outcomes as all
tests. The historical logs contain58 =55 top-level +3 nested and91 =83 +8,
with unique all-GREEN footers. One refused wrapper command never started an
actor or application. None of these failures is a product or mutation RED.

The unchanged original code was checked by149 focused test executions (58 Main,
91 qualification, zero skips), lint, build and four literal-plan checks. Actual
isolated Main source sensitivity ran60 tests:10 semantic RED/50 GREEN, including
both baseline/restored10 GREEN; all593 copied members were restored in bytes
and physical identities. R2 reuses these historical results explicitly, with
no new test or source-mutation claim. A corrected, prospectively frozen reader
passed18690 checks of current metadata, historical TAP/restoration, original32
complete worker DTOs/targets and11 retained PNGs/source-only `.igs` before ML.
Repository594 code/test members,30 consumed sources, five app bundles and the
single restored historical source copy were unchanged.

## Actual qualified results

All four fresh native stages passed, with genuine registered launcher ACKs and
physical native/launcher/timer exits: IMG boundary32, IMG prefix6, OUT boundary32
and OUT prefix6. Final independent readback passed85373 checks:76 admissions,
76 completions,76 accepted saved layers, four Save-reopened packages,12 own
wholeRGBA prefix matches and two confirmed33 refusals preserving all32 temporary
candidates/source1 without new admissions or receipts. All four operational
cursor/Save snapshots ended at7/5; two OUT previews preserved111104 source pixels.
Final queue/receipt/cursor/index/journal counts are1323/1223/445/1136/0, with all
eleven old tables preserved and43 worker bytes/identities unchanged.

Across both attempts raw additions are108 admissions,87 completions,21 canceled
APP_RESTART jobs,76 accepted results and five cursors. These are distinct from
the qualified R2 totals76/76/0cancel/76accepted/four cursors. R0 remains excluded
with no qualified accepted package; its11 retained temporary results were not
accepted or regenerated by recovery.

Measured combined owned peaks were14907650048,14877134848,14409052160 and
11835650048 bytes, each within14GiB, with task swap0 and no resource/watchdog
stop. Large-file cache contributed to those peaks; they are not a model VRAM
requirement. Native deadlines remained2700/1800s. Final reusable-pool check
passed, and the raw reader itself physically exited with code0 under2GiB/300s.

The next concrete gate is NoobAI V / DPM++ 2M Karras wrong-EPS observable failure
and diagnostics. An invalid recipe may fail before a candidate; pixel RED is not
mandatory. Fresh evidence cannot retroactively recover the lost original trace.

## Cleanup and handoff

The first bounded cleanup preparation stopped before publishing metadata or
deleting anything because it rejected every `Z` process in fresh topology. Its
original process identity was not retained and remains unknown. The failed
actor/log/ACK/closure, unchanged593 source bytes/identities, code/bundles, native
nine-controller freeze and final raw rows are retained in a separate repair proof.
That failure is not a product or mutation RED.

An independent current observation identified exactly one ended packaged speech
child10047/start10964, parent10035/start10963, in the active unmodified
`speech-dispatcher.service`. The current-boot literal observer is a byte-exact
mechanical predecessor with only boot/PID/start/parent literals changed. Actual
kernel FDSize0, zero virtual/resident address space, absent Vm status fields and
empty observable FD/maps were required; unavailable links/maps were recorded as
unavailable, never invented as empty. Parent executable/argv, unit and root-owned
non-writable ELF/unit files were independently bound. Other/unknown zombies remain
a veto. The original preparation failure is not attributed to this later process.
No service was signaled or modified.

Separate cleanup helpers preserved the native nine-controller freeze. Their
bounded preparation completed, then a direct metadata finalizer required its
actual ACK/exit0/physical closure before pinning its own completed files and
refreshing current topology. Only nine observed module literals were filled;
the finalizer changed two metadata hashes. The existing held-FD remover AST was
unchanged except member-count metadata/messages. Both read-only and execute guards
passed fresh source/link/mount/dependency/FD/maps/raw-row/43-worker checks.

Only the restored593-member source copy was removed:616 owned members including
directories,11341824 allocated bytes reclaimed. External symlink targets were
not traversed, original images/models and the reusable runtime were retained,
and no rollback payload remains. Post-cleanup pool verification passed with43
original worker bytes/identities and physical idle state preserved.

Final inventory: root27.35600GiB, reusable pool26.17713GiB, compact evidence
1.17887GiB, free44.10738GiB. The compact increment over resumed entry stayed within
the planned96MiB; its above1GiB soft-budget exception remains explicit because
cross-run mechanical/control/recovery/native proofs are still referenced. Both
run lifecycle records are retained with empty payloads and their complete
dependency graph. One compatible pool is pinned for the next NoobAI diagnostic
gate; inspect references before pruning its companions or compact evidence.

Validation: original149 focused test executions/zero skips, actual source60
executions/10 semantic RED/50 GREEN, lint, build, formatting and literal plans;
current recovery1587, prospective18690 and final independent85373 checks; four
native stages, final and post-cleanup pool checks; guarded593 cleanup. Historical
checks were reused only after whole594-code/30-source/five-bundle verification.
No TypeScript/Vue/worker implementation changed, and no new typecheck, prototype
suite, CI, inference-quality or release claim is made by this task.

This finite plan does not qualify arbitrary prompt grammars, other samplers or
geometries, new installed mutations, quality, Invoke trained-pixel parity,
fullMVP or packaged Linux/NVIDIA release.
