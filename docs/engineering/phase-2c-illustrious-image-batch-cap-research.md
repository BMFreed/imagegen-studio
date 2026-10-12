# Installed Illustrious/NoobAI image cap32 and selected prefix

Entry revision: `7d5b1c6f9beb6942d3112f0d663bc121b298c4b0`, after the
[image uint32 wrap gate](./phase-2c-illustrious-image-seed-wrap-research.md).
This qualifies existing behavior. It does not raise production limits or change
PP-004/005/007/008 from «Пока не обещать».

## Contract and production boundary

The [dynamic prompt contract](../features/project/generate-mode/dynamic-prompting.md)
distinguishes an ordered `maxPrompts` prefix from the 32-job public admission
limit. Selected pairs multiply by iterations. Generate refuses an oversized
batch as a whole; a confirmed Discard + Generate refusal must preserve existing
temporary results. Preview represents one iteration and announces truncation;
successful prefix admission also announces actual truncation.

This is a high-risk qualification of actual renderer → Main preparation/planner
→ durable queue → installed worker → temporary results → Add → immutable
configuration/source context → explicit Save/reopen. Existing source layers,
old queue/history/catalog rows and seed cursors must remain unchanged. Later
draft edits must remain separate from frozen and accepted inputs. Qualification
hooks observe these owners, and do not replace the actual admission, inference,
receipt, acceptance or save implementation.

The public policy is `GENERATION_BATCH_JOB_LIMIT = 32`, applied before both
normal and OUT admission barriers. Internal staging/session limit 64 and byte
limits are distinct. A refused Illustrious request may perform transient model
reads/composition; this gate promises no durable admission effects and preserved
temporary results, rather than absence of all transient work.

## Frozen finite matrix

Four scopes: epsilon/v-prediction × common-source img2img/normal mixed-alpha
outpaint. Each has these sequential stages:

| Stage                       | Selected pairs × iterations | Seed behavior           | Expected jobs               |
| --------------------------- | --------------------------- | ----------------------- | --------------------------- |
| Boundary                    | 4 × 8                       | Fixed 0 / per iteration | 32, no truncation           |
| Prefix                      | 3 × 2                       | Fixed 0 / per prompt    | 6, explicit truncation      |
| Refusal before boundary Add | 1 × 33                      | Fixed 0                 | 0 new jobs; BATCH_TOO_LARGE |

The handwritten pair order is red/blurry, red/noisy, blue/blurry, blue/noisy.
Boundary uses seeds 0…7 for each pair; prefix uses seeds 0…5 for its first three
pairs. Its six outputs must match whole normalized RGBA and complete executed
inputs at own boundary indices `0,1,10,11,20,21` before Add. Only portable
document identity/revision and explicitly asserted requested seed behavior may
differ in that control comparison. No model, prompt, source, conditioning or
worker sampling field may be omitted to obtain equality.

Frozen totals: **8 stages, 152 admissions/completions/accepted layers, 8 final
accepted Save/reopen packages, 24 same-input prefix controls, 4 genuine confirmed
33-job UI refusals, 8 new project cursors, zero cancellations**. Each final
package retains one unchanged imported source layer plus 32 or 6 accepted
layers. Source-only pre-refusal Saves and before/after proof copies are separate
artifacts and do not inflate accepted-result package counts.

After boundary completion, author and Save the refusal draft before taking the
preservation snapshot. Confirm actual Discard + Generate through the UI, observe
its correlated typed generation-state `BATCH_TOO_LARGE`, and verify all 32
candidate IDs, PNGs, receipts, cursor, frozen/private inputs, session, source
layer, Project DTO, saved/shadow package and visible Undo/Redo availability.
Typed state observation is not a captured Generate response; no private Undo
stack is claimed. Restore the legitimately edited current draft before Add/Save.

## Parameters and resources

Existing exact resources/settings: 256×256, Normal N3/two actual updates,
CFG5/rescale0, strength0.5, Digital Art LoRA−0.5 and external native VAE FP32.
EPS uses Euler a/non-ZTSNR/leading, V uses Euler/ZTSNR/leading. OUT x64 retains
the existing mixed-alpha geometry and exact LaMa policy/resource. This finite
matrix does not qualify arbitrary long inputs, samplers, geometry or formats.

The production authoring range allows 1…100 iterations and maxPrompts; the
existing public job limit is 32. Internal item/batch byte ceilings are separate.
Neither the public cap nor the test safeguards measure GPU capacity.

Original evidence root:
`~/.codex/artifacts/imagegen-studio/runs/illustrious-image-batch-cap/20261012-checks`.
Corrected R2 evidence root:
`~/.codex/artifacts/imagegen-studio/runs/illustrious-image-batch-cap/20261012-checks-v2`.
Reuse the sole compatible worker0.14/catalog at
`~/.codex/artifacts/imagegen-studio/shared/illustrious-vpred-worker-012-20261007`.
Entry inventory: 28,772,290,560 allocated root bytes, 757,968,896 compact evidence
bytes, 28,014,321,664 pool bytes and 48,147,238,912 free disk bytes. Both 30 GiB
root and 1 GiB evidence soft budgets permit this finite plan. Original external
models/images remain untouched; no runtime/model copy or download is planned.

One native stage at a time: 12 GiB native, 2 GiB launcher, 14 GiB combined
watchdog, zero task swap and 1,600-second completion poll. The original
1,800-second stage deadline stopped the first boundary during comparison
readback. The corrected R2 plan uses 2,700 seconds for each 32-result boundary
and the original 1,800 seconds for each six-result prefix. Neither memory
bounds nor comparison coverage change. CPU tests, mutations, lint and readback
use separate bounded groups/deadlines. NVML mismatch remains outside this scope;
no VRAM/cold-run performance claim is made.

Before first native admission, freeze literal fixtures/counts, all consumed
sources, unchanged app bundles, original 43 worker files/physical identities,
11 entry tables, controller/reader bindings and budgets. Materialize only each
future prefix `baseline.reportSha256` after its own exact successful boundary
report and physical exit. Refuse existing reports/fixtures and stop on a failed
stage; do not automatically rerun admitted work or rewrite historical evidence.

## Tests, sensitivity and readback

Actual Main tests exercise preparation, orchestration, SQLite and provenance for
32 jobs, selected-prefix6/truncation, rejected33 and concrete31/1 neighbors in
each scope. Resource verification/candidate-readiness and staging preflight
are explicit doubles; these tests cannot themselves prove ML or retention of
32 real temporary results. The installed UI refusal supplies that evidence.

Root executes isolated actual-source faults: public policy32→33, planner overflow
`>`→`>=`, and silent truncation. Public-limit and silent-truncation faults must
each fail four relevant cases while preserving 16 neighboring tests. The strict
overflow fault must fail eight cases and preserve 12: it also rejects the valid
31-job control because one pair equals `floor(32/31)`. Baseline and fresh restored
20 must pass with zero skips. All copied source bytes and physical identities
must be restored.
No installed-worker mutation is planned; prior source/numerical sensitivity
remains historical evidence. Setup/import/OOM failures are not semantic RED.

An independent stdlib/Pillow reader uses explicitly SHA-bound mechanical helpers
only, never production planners, app imports, qualification oracles or old
successful aggregates to supply expected values. It reads raw SQLite/ZIP/PNG,
literal pair/seed order, all 152 configurations and sibling source contexts,
owning comparisons, 8 cursor/Save snapshots, full source-over preview composition,
24 prefix controls and all four refusal snapshots. All 11 original table rows,
six catalog/resource tables, source/bundle bindings and 43 worker identities
must survive; every recorded native/CPU actor must physically exit. Delegated
authors/reviewers see source and provide source-informed self-review, not blind
review.

Root owns execution, process signals, freezes, mutation restoration, cleanup,
commit and push. After fresh restoration/closure/dependency/mount/FD/maps
checks, remove only the two owned disposable source copies and the later tiny guard copy. Retain compact raw evidence
and the sole compatible pool for the next concrete gate with lifecycle records.

## Excluded deadline attempt and corrected plan

The original plan SHA-256 remains
`fd43e3be1f1c79fb47d3774131444a16f9a7c25a4efda72bc5c4ab22be44d7bd`.
Its first EPS IMG boundary actually admitted/completed 32 jobs, preserved all
32 candidates at the confirmed 33-job refusal and added/saved all 32 with the
source layer. The actual `.igs` has 33 visible layers, 32 provenance records and
Save seed snapshot 7. Only five owning-comparison screenshots completed before
the 1,800-second timeout. The original persisted report stays `running`, with
no successful summary/complete Save-reopen proof; it is not rewritten as PASS.
The separate `excluded-deadline.json` preserves raw SQLite/package evidence and
independent original PID/start/cgroup/timer exit observations. Its 32 real
accepted outputs and one actual package count as **zero qualified packages**.
No OOM/watchdog/observer error occurred; task swap was zero and the observed
combined peak was 10,684,932,096 bytes, below 14 GiB.

Measured last completion followed preconditions by 1,372 seconds. The five
comparison screenshots have a mean interval of about 15 seconds; this predicts
roughly eight minutes for all 32 comparisons. Earlier eight-output image runs
had comparison intervals around 1.4 seconds, so a constant browser-call cost or
a Python start per comparison is not established. The immediate remedy is a
bounded allowance through DI, preserving every comparison assertion. No UI or
product inference behavior changes.

The corrected R2 plan SHA-256 is
`6048c4648fa768231894df27fa6ff904f59ca294d1e71a6f26fb031b4c148dc1`.
It explicitly repeats the complete fresh 152-job finite matrix after the
stopped attempt. Qualified counts exclude the original 32; combined raw new
admissions/completions/accepted outputs are 184 after R2 fully passed.
R2 entry queue/receipt/cursor/index/journal counts are 874/801/403/726/0;
expected final counts are 1026/953/411/878/0, with all old rows and the six
catalog tables unchanged. New inventory records 28,839,137,280 allocated root
bytes, 811,786,240 compact bytes, 28,027,351,040 pool bytes and 48,087,515,136
free disk bytes, within both soft budgets. No weights/runtime are copied.

The profile resolves one deadline before launch and passes it to actual
inherited-launcher validation and every native-scope timer. Ordinary profiles
and image prefixes retain 1,800 seconds. Options reject invalid, noninteger or
larger-than-2,700 values before process/unit changes; a recorded PID/start
cannot acquire a different duration; a reobserved owned KDE scope cannot
change its recorded path. Arbitrary migration to another finite cgroup is not
claimed as rejected by this guard. Physical closure still precedes
stopping its timer.

R2 preexecution focused checks: 261 PASS, zero failures/skips; lint and formatting PASS.
Historical original Main sensitivity remains explicitly bound to unchanged
producer bytes: 100 executed tests, 16 semantic RED/84 GREEN, exact restoration
of 536 copied source bytes/physical identities. It was not rerun as part of R2.
New deadline sensitivity executes 375 tests: baseline/restored 75 GREEN each;
ignored launcher forwarding gives 1 RED/74 GREEN, ignored native forwarding
1 RED/74 GREEN, and a hardcoded 1,800-second timer 2 RED/73 GREEN. Separate
ordinary/prefix 1,800-second controls remain GREEN; all 536 copied files are
restored byte/dev/inode/mode/mtime exactly. These use actual profile/driver/guard
code with declared proc/kernel/systemd transport doubles, and launch no ML.

Before new native work, R2 freezes 32 entry pins, 537 test/source files, 34
consumed sources, five unchanged app bundles, six controllers, eight templates
and the independent reader. Its final reader SHA-256 is
`9f721f6a652eebe8bc9ab8ac0364f9bd2c0403cc58d004ba9284623c90c93ab5`.
Only future prefix report hashes may be materialized. The historical 32-output
attempt and raw package are retained, with no automatic rerun or retagging.

## Evidence status

**PASS** for this finite installed matrix: 152 admissions, finite completions and
accepted layers; eight accepted-result Save/reopen packages; 24 whole-RGBA
same-input prefix matches; four genuine confirmed33 refusals preserving all32
candidates and their sole source; eight cursor/snapshot pairs; zero cancellations.
The final queue/receipt/cursor/index/journal counts are 1026/953/411/878/0.
All eleven old raw table rows and six resource/catalog tables are preserved.
Four independently composed OUT previews verify 222,208 protected source pixels.
All152 owning readonly comparisons and complete portable input/source contexts
pass. The observed maximum combined owned allocation is 9,597,665,280 bytes,
below14GiB; every owned swap limit/current observation is zero. This is not a
claim about global system swap, GPU capacity, performance or image quality.

The independent reader passes **104,613 checks**. The original frozen
reader9f721… failed before readback because it incorrectly required a R2 baseline
path, while every immutable fixture pins the original R0 baseline descriptor
`083d0358aef115b821c84edcb38179ff7a2037036ca05c2a9a15dfa6d8bac571`.
Its source/freeze, failed bounds/log and physical exit remain unchanged in
`reader-binding-correction.json`. A separately frozen
`independent-aggregate-corrected.py`, SHA
`d2e55eef90ac5e67cddb4a31d55a6e77c0ec503683f4277eb74454ff74d5f771`,
changes only that exact expected descriptor. Original43 equality with the fresh
R2 entry and every numerical/persistence assertion remain required. The separate
corrected reader supplies the passed aggregate; downstream proofs bind this
explicit correction lineage, without relabeling the original failed reader.
No new inference or admission follows either reader attempt.

R2's first boundary comparison intervals average about1.58 seconds, compared
with about15.08 seconds in the stopped R0 attempt. This observed variance does
not establish a performance optimization, constant browser cost or cache cause.
The original timeout and reader-binding error are setup failures, separate from
semantic mutations and native behavior.

## Raw imported-source guard supplement

Source-informed review found that the shared qualifier checked absence of
`generationProvenance` on `ProjectRasterLayerView`. Production omits that field
from both ordinary and generated native views, so that assertion was vacuous.
The original independent ZIP/raw-layer reader already proves the actual source
entity in the native matrix. After that matrix, full readback and two-copy
cleanup, the shared qualifier now reads the raw saved Project layer and checks
kind, import-owned ID, sole membership, absent provenance and full equality with
the captured import entity. Paired full raw snapshots continue to detect later
source changes. TXT's zero-source path stays unchanged.

Nine tests call the real exported guard using metadata captured from the actual
R0 saved package and passed through the production Project schema. The fixture
contains metadata only, no PNG/model weights, and explicitly makes no inference
or qualified-R0 claim. Generated raw data with a provenance-free native view,
missing/wrong/changed/hidden source and a second layer are meaningful negative
cases; an extra shared-profile case changes raw source data while presentation
stays unchanged. Final focused checks: **271 PASS, zero failures/skips**, with
one intact TAP footer. Final lint and formatting pass in bounded groups.

Actual source-only sensitivity uses one tiny copy of two MJS files, captured
JSON and a module package stub. Replacing both raw provenance reads with the
old native-view predicate yields exactly the generated-layer rejection RED and
eight neighboring GREENs. Baseline/restored9 GREEN each give **27 executions,
1 semantic RED/26 GREEN**, with all four copied byte/dev/inode/mode/mtime values
restored. Earlier reporter selection and controller/child sharing the same log
file caused separate evidence-collection setup failures. Their original logs,
bounds and restoration proofs remain; they do not count as qualified semantic
sensitivity. The final runner forces TAP, keeps controller stdout in a separate
`.wrapper.log`, and requires one complete child footer and the exact RED reason.

A separately frozen source-only reader validates the new guard against all
**eight actual before/after captures**. It confirms the original152/8/24/4 proof,
all380 production source files, five original app bundles and all43 installed
worker bytes/physical identities. The native-qualified shared qualifier bytes
are retained as `qualified-generation-batch-cap-profile.mjs`; the only consumed
source delta is that qualifier from9e713… to328092…. The original native reports
and source freezes are not rewritten to claim the later qualifier ran during
inference. No additional UI action, ML execution, model rehash or admission is
part of this supplement. Raw details live in `source-readback.json`.

## Cleanup and handoff

After independent PASS, separately frozen guards make ten real calls over the
two536-file source copies: six fresh GREENs and four causal FD/maps refusals.
Derived-target child processes release through stdin nonce and physically exit;
no foreign signals, model reads, source faults or deletion occur in that probe.
Both complete source trees restore bytes and physical identities exactly.
Immediately before each sequential deletion, fresh UID/path/mount/dependency,
process/cgroup/timer and FD/maps guards recheck both copies and original43 files.
The second deletion pins the actual first removal proof. Both copies are
physically absent, external node_modules targets untouched, and the reciprocal
R0/R2 compact evidence dependency is retained. Actual first cleanup reclaims
**21,073,920 allocated bytes**. The restored tiny four-file
copy is also removed after new CPU physical closures, dependencies and fresh
FD/maps checks, reclaiming **40,960 bytes**.
No active payload or protected rollback remains in either run lifecycle.

Final inventory: 29,009,944,576 allocated root bytes,
950,407,168 compact bytes outside the sole pool and
28,059,537,408 pool bytes, within30GiB/1GiB soft budgets;
47,881,068,544 free disk bytes. All43 original worker files/identities and
fresh physical idle are rechecked at handoff. Retain the compatible worker0.14,
managed catalog and compact dependent artifacts for **image dynamic embedding
subsets: Illustrious-family EPS/V × IMG/normal mixed-alpha OUT**. No extra
runtime/model copy or download was created.

Anima image batches, broad formats/geometry, trained quality, Invoke pixel
parity, full MVP and public delivery/release remain separate gaps.
PP-004/005/007/008 and their matrix statuses remain «Пока не обещать».
