# Illustrious/NoobAI dynamic IMG/OUT qualification

## Boundary and frozen plan

Entry is `7377c88cb77195e5104ffc528880a4462dc77914`, following the
[multiple-LoRA image gate](./phase-2c-noobai-lora-stack-image-research.md).
PP-004/005/007/008 and [dynamic prompting](../features/project/generate-mode/dynamic-prompting.md)
require concrete prompt/seed ownership, immutable recorded settings, portable
Save and explicit acceptance. Public statuses remain «Пока не обещать».
This plan was written before execution; measured outcomes belong in the separate
final sections below.

High risk: persistent batch admission/cursors, installed worker mutation,
provisional recovery, explicit Add/Save and completion-verification caching.
Root owns frozen fixtures, bounded sequential tests/inference, mutation journals,
restoration, independent readback, cleanup and commit/push. Delegated research
and review are source-informed, not blind. No new model family, public installer,
default inference behavior or approval workflow is introduced.

## Confirmed path and missing evidence

Renderer Generate captures one project/draft/bbox and composed target. Actual
IMG and OUT Main preparation resolve a base seed and freeze target bytes before
asynchronous batch admission. `generation-batch-plan.ts` expands positive outer,
negative inner, then pair outer/iteration inner. Main varies concrete prompts and
uint32 seeds while retaining the captured common target and resource policy.
OUT admission assigns sorted opaque IDs to preserve that supplied order through
the queue's `created_at,id` dispatch order. These are source observations; raw
execution must independently establish the actual tuples and ownership.

The installed worker executes one concrete request at a time. `seedBehavior`
belongs to Main/provenance; it is not an ML batch API. `_generate_illustrious`
creates a new CPU `torch.Generator` from the command seed. IMG uses a copy for
VAE posterior sampling, retaining the original for initial noise. OUT uses the
parent's empty-timestep image preparation and then draws source noise once.
The returned seed metadata is separate from the generator's actual state.

Previous dynamic qualification explicitly requires TXT; the latest image gates
use one concrete prompt. Neither proves ordered dynamic image batches. Repeating
only the pure grammar tests would miss actual image-noise consumption.

An actual current-source reproduction also identified a harness defect:
`observeCompleted` caches a raw completion before numerical verification.
`expect.poll` can retry, receive that cached result and bypass the earlier RED.
The repair must cache the complete verification promise: once captured,
successful results remain reusable and rejected verification remains rejected.
Raw completion evidence is retained once even on failure. This changes the test
driver, not production receipt acceptance. Historical independent raw pixel
evidence is retained without rewriting its executed driver hashes.

## Finite installed matrix

Current corrected R2 campaign plan SHA:
`70be85bca21724cc61d24946317738533573d303bfd6961decec35b6add7a2ee`.
The original pre-correction plan remains separate in the excluded-attempt section.

Positive source: `a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph`.
Negative source: `{(blurry:0.7)|(noisy:0.7)}, low quality`.
Literal pairs are red/blurry, red/noisy, blue/blurry, blue/noisy; no embedding
sidecars are used. Main's authored templates must remain recorded alongside each
result's concrete weighted pair.

| Stage              | EPS/V × IMG/OUT per scope                                             | Total jobs | Accepted |
| ------------------ | --------------------------------------------------------------------- | ---------: | -------: |
| Healthy            | Four pairs × two iterations; Fixed 0/per iteration, `0,1,0,1,0,1,0,1` |         32 |       32 |
| Protected mutation | Same full source, first pair × two iterations, `0,1`                  |          8 |        0 |
| Fresh restored     | Same first pair × two iterations, `0,1`                               |          8 |        8 |

Exactly 12 fresh stage projects, 48 admissions/completions, 40 unique accepted
layers and eight saved/reopened packages are expected. Each healthy package
contains its source plus eight generated layers; each restored package contains
its source plus two generated layers. Four two-result control projects remain
provisional. No crash cut, implicit retry, extra job or automatic matrix expansion
is planned. Choosing one selected pair in controls is explicit `maxPrompts:1`
prefix selection from the unchanged full source.

Every request uses 256×256, Normal, three authored steps, CFG 5/rescale 0,
strength 0.5, Digital Art LoRA -0.5 and the pinned native external VAE/FP32.
EPS is Euler a/non-ZTSNR/leading; V is Euler/ZTSNR/leading. The prior measured
full grid `[667,334,1]` retains `[334,1]` at this strength; two real updates must
be observed anew. Current seed 37, both prompts, LoRA weight and dynamic settings
are edited after admission; frozen inputs and accepted settings must stay intact,
while saved/reopened drafts retain the actual later edits.

Installed image per-prompt/Random/Reuse/wrap/cap32/crash and embedding subsets
are outside this finite claim. Real Main tests additionally cover both seed
behaviors with two iterations and late caller edits; that is not installed
inference evidence for the excluded image combinations.

## Sources, targets and resources

Evidence root is
`~/.codex/artifacts/imagegen-studio/runs/illustrious-dynamic-image/20261011-checks-v2/`.
The superseded first attempt is retained at `20261011-checks/`.
Reuse the sole compatible worker 0.14 pool
`shared/illustrious-vpred-worker-012-20261007`; its historical name is not the
installed worker version. Preserve all nine resources/14 versions/14 local files,
prediction/noise overrides, managed weights and 43 original worker identities.
No model/runtime installation, download or weight copy is planned.

Exact checkpoint/VAE/LoRA/LaMa hashes and source credits are retained in the
predecessor's source-bound records and independently checked current manifests.
The two tiny common-source PNG copies equal the predecessor's opaque accepted
TXT images byte-for-byte. Historical origin descriptors keep their historical
paths; `source-copy-lineage.json` separately binds the new copies. Changing a
descriptor path is not needed to prove identical bytes.

Import the source at `(0,0)`. IMG bbox is `(0,0,256,256)`; OUT is
`(64,0,256,256)`, with 192 opaque and 64 transparent source columns. The declared
contribution alpha is zero through local column 152, intermediate at 153..167
and 255 from 168. Full OUT preview is 320×256 over the opaque source. Independent
Pillow readback must compose every visible contribution in saved z-order,
including the soft edge; a single-result preview helper cannot prove a batch
preview. Browser un/premultiplication is a separate observation boundary.

First-attempt entry inventory measured root 28,353,680,826 bytes, compact evidence 503,551,982,
pool 27,850,128,844 and free disk 49,520,459,776. Approximately 22 GiB host RAM
was available; GPU used 1,222 of 16,376 MiB. System swap was already occupied.
Operational decisions are serial execution, launcher 2 GiB/native 12 GiB,
combined watchdog 14 GiB including charged file cache, zero task-group swap and
1,800 seconds per installed stage. Static/CPU suites use smaller bounded groups.
These ceilings are safeguards, not measured model capacity or free-memory claims.
R2 entry measured root 28,379,219,357 bytes, pool 27,853,522,233, free disk
49,456,066,560 and MemAvailable 23,190,240 kB; this includes the excluded first
eight outputs. It reuses that same sole pool.

## Numerical controls and test boundaries

One protected installed mutation changes only
`torch.Generator(device="cpu").manual_seed(command.seed)` to `manual_seed(0)` in
`inference.py`. Original SHA is
`c5d6bbe89ad51e8b60233ee6915bad143bee55f481b4c9fdd559501bacc6cd32`;
mutant SHA is
`b79f36d6c7beca74bcc0d68f5bd5e1ab3b63654c4e882f23865c3d0826bb7620`.
Each two-job control must complete: neighbor seed 0 retains whole RGBA; seed 1
differs from healthy seed 1 and equals healthy seed 0 for the same first pair.
OUT additionally preserves all alpha, changes visible RGB and changes the full
independent composite; hidden-only RGB does not qualify. Controls stay before
Add. Fresh post-restoration seed 0/1 must reproduce healthy whole RGBA with new
queue identities in all four objective/mode scopes.

For a baseline scope, the qualifier compares all six prompt-pair combinations
separately for each seed, plus the four same-prompt seed contrasts: 16 checks
across eight images. Its report field `pairwiseDistinct` denotes these declared
axes, not all 28 possible image pairs. Cross-seed/different-prompt collisions
are outside that assertion. The independent reader also checks the same-seed
diagonals; it must not infer global eight-image uniqueness from the field name.

Native CPU tests enter actual public worker image generation, rather than
creating their own generator around a runner. Tiny native CLIP/UNet/VAE and
actual conditioning/denoising/decode provide a mechanical oracle. External
checkpoint construction, CUDA placement and the trained LaMa model are fixture
substitutions. Independent literal native Compel strings and independent
seed/noise draws must detect generator/prompt-association errors. These tests
do not claim trained tensor or model-quality equivalence. No repeated trained
986-target LoRA algebra campaign is needed for this seed/prompt boundary.

## Raw readback and cleanup criteria

An independent reader imports no production, planner, qualifier, oracle or ML
helper. It checks raw tuple order, complete captured input ownership, exact
PNG/ZIP/manifest bytes, all portable configurations/drafts/comparisons, both
same-seed prompt polarity changes and numerical controls/restoration. Expected
R2 SQLite deltas are queue 635→683, receipts 572→620, cursor 361→373 and accepted
index 506→546. Its entry preserves the excluded first eight rows; original
first-attempt entry was 627/564/360/498 respectively. There is one cursor row per fresh stage project, not per job;
all 12 cursors end at actual seed 1. Forty-eight completion/cursor observations
must respect those grouped owners. Every old row in 11 tables remains unchanged
and the acceptance journal remains empty.

Mutation refusal/import/NaN/OOM/deadline failures are not numerical REDs.
Root maintains a protected rename rollback, original bytes and physical
dev/inode/mode/size/mtime, and confirms real native PID/start exit before restore
or disposal. ctime preservation is not claimed. Cleanup removes only confirmed
idle owned disposable payloads after dependency review; retain the compatible
pool and common-source/report/package dependencies. Record actual reclaimed
allocation and final inventory.

## Superseded first installed attempt and explicit visibility preparation

The original immutable plan and evidence remain under
`runs/illustrious-dynamic-image/20261011-checks` with plan SHA
`d36f8fe46aaacc5c77db62bdb0ecfe5a15aaac84a8c92d36c7d4e5c10e4492ff`.
Its first EPS IMG batch produced all eight outputs and accepted/saved eight
layers, but the new profile's all-visible assertion failed. Actual Save retained
one visible generated anchor, seven hidden alternatives and the visible source.
`project-generation-acceptance.ts` deliberately initializes visibility from
`candidate.candidateId === anchorId`; this is established product behavior,
not a worker/Save failure or a semantic mutation RED. The original failed report,
PNG files, portable package, original source/bundle freeze and physical closure
are retained. No installed-source mutation had started.

The qualifier now observes that default anchor-only state, explicitly clicks
`Show <layer name>` for every hidden generated layer, and waits for the public
Project view after each click. Before Save, it verifies complete view order and
all fields against the original views with only generated visibility changed;
the source is unchanged. Saved immutable provenance is checked separately against
each owning queue/receipt. This prepares the chosen full-stack preview test
without changing Add's application behavior.

The corrected finite matrix is newly frozen under
`runs/illustrious-dynamic-image/20261011-checks-v2` with plan SHA
`70be85bca21724cc61d24946317738533573d303bfd6961decec35b6add7a2ee`.
Its twelve projects retain the same 48-job semantic matrix. Entry includes the
previous attempt's eight queue/receipt/accepted rows and one cursor, all of which
must remain unchanged. The first eight image jobs will be repeated; if the new
matrix completes, qualified counts will be 48 completions/40 accepted layers,
while combined raw counts will be 56/48 including the separately excluded first
attempt. `previous-attempt.json` binds the exact earlier report and saved package.
The exclusion is not silently rewritten into a successful run.

The first CPU baseline also exposed an input-fixture error: a keep mask intended
for a direct runner was treated as raw alpha and processed a second time. A
24px protected strip could not survive the actual 16px edge/fade policy at 64px.
The corrected raw target has 48px opaque, 8px soft and 8px transparent; the check now
requires protected, soft and fully generated output pixels. Original failure
and source bytes are retained separately from successful CPU mutation evidence.
An isolated CPU setup missing packaged ICC failed before test collection and is
also excluded from semantic RED; the actual subject copy now includes all 43
packaged files. No production outpaint policy was changed.

## Resume source identity boundary

Before any R2 installed job, resumed startup rejected historical device number
66306 (259:2) against current 66310 (259:6). All 43 bytes/SHA, inode, mode,
size and mtime fields remained identical. Root and an actual host systemd control
shared the same mount namespace/device; current `/dev/nvme0n1p1` is ext4 UUID
`f7b684bc-0f8c-4fc7-aad9-8b4233b9345c`. The device-number change is an explicit
startup continuity observation, not a mutation restoration result or numerical RED.

The pre-resume entry files and reader are retained unchanged. A separate
`resume-source-continuity.json` records every full before/after tuple and their
source hashes before refreshing R2 physical entry. Current R2 execution,
protected rollback and final restoration still require the complete exact new
entry tuple including device; only the cross-run historical comparison permits
the single documented device-number transition. Existing reports and their
executed physical identities are never rewritten.

## Cgroup teardown observation and finite continuation

The eighth R2 stage completed both v-pred OUT control jobs and retained the
intended seed-1 pixel failure plus seed-0 equality. During cleanup, a read of
the disappearing native `cgroup.events` returned `ENODEV`; consequently the
driver retained one cleanup error and could not assign `nativePhysicalExit`.
The controller stopped rather than treating that missing field as a pass.
Its `finally` restored all 43 installed worker files exactly.

The original failed report, original seven-stage progress and original frozen
controller remain unchanged. A separate closure supplement binds the exact
report and bounds hashes, all nine captured native PID/start identities plus
the actual launcher, and both absent groups. The independent bounded observer
had already confirmed physical exit with no resource/observer failure. Root
then independently rechecked every identity and group, revalidated the captured
PID/start-bound deadline timer and stopped only that timer; its manager evidence
is retained separately. This is a cleanup-observation defect, not an extra
numerical failure or a reason to replay the completed jobs.

A separately frozen continuation uses the original stage implementation and
unchanged 19 source files/five bundles to execute only the four previously
unexecuted restored stages. Raw readback and cleanup must accommodate only this
literal report with exact supplementary hash bindings and retain its original
cleanup error. They still require all numerical invariants and fresh actual
process/group/timer closure; there is no general errno or missing-field fallback.
The helper repair was verified separately after the original-source campaign and
its guarded cleanup; the executed boundary is recorded below.

## Executed outcomes

The latest focused Node run passed 85 tests. Actual native CPU public-worker
baseline passed eight tests. In isolated complete 43-file worker copies, constant
noise seed and collapsed negative prompt each produced four intended subject
failures, four neighboring passes and eight fresh restored passes. The isolated
copies were restored before independent readback. External checkpoint loading,
CUDA placement and trained LaMa remain explicit CPU fixture boundaries.

The whole shared-driver module was also copied and import paths rebound to
unchanged real helpers. Evicting a rejected verification produced two subject
failures/one neighboring pass; swallowing numerical rejection produced one
subject failure/two neighboring passes. Each restoration passed all three
driver tests. These are actual semantic failures, not setup or timeout failures.

Typecheck, lint, worker Ruff/basedpyright and a fresh application build passed.
The bounded observer had a separate healthy exit control and an injected
observer-error control: both physically closed their own processes, while the
error case exited 1 and retained explicit observer-failure evidence. That control
is not classified as an inference mutation failure.

The original-source campaign and its four-stage continuation completed all
twelve R2 stage projects. Qualified counts are 48 admissions/completions:
32 healthy jobs, eight provisional controls and eight fresh restored jobs;
40 accepted layers were saved and reopened in eight packages. No provisional
mutant was accepted. The numerical mutation produced four intended seed-1 pixel
RED, four seed-0 wholeRGBA neighbor GREEN and eight fresh restored wholeRGBA
matches. All 48 same-seed prompt contrasts passed: 32 Cartesian edges and
16 diagonal comparisons. Four healthy scopes also retained seed-0/seed-1
sensitivity. These finite checks do not establish arbitrary image uniqueness.

The independent raw reader passed 10833 checks with source SHA256
`696c58d6ff28d74fa75e93ea51c6c76f19d0009e45de252bce3b102d06fb41f1`.
It verified literal plan/source/target/resource bindings, immutable accepted
settings and retained late draft edits, SQLite receipts/cursors/index rows,
portable ZIP assets/provenance and complete saved source-over previews.
The four OUT previews preserved soft alpha and 222208 protected-source pixels.
All 43 installed source bytes and physical identities were restored, with only
the previously documented historical device transition allowed for the
cross-run comparison. The 19 consumed sources, five bundles and six original
controller helpers remained unchanged. The aggregate confirmed physical exit
of 88 recorded native identities; the one original ENODEV cleanup error and its
separate exact closure/deadline supplements remain retained as described above.
That observation defect contributes no additional numerical RED.

Actual Add remained anchor-only. Eight explicit before-Save UI preparations
showed 32 initially hidden generated layers without changing their scoped
layer/asset identity. The failed, excluded first attempt still contributes
eight jobs/eight accepted layers and one separate saved package to raw counts,
not to qualification: combined totals are 56 jobs, 48 accepted layers and
13 stage projects, while qualified totals remain 48/40/12 and eight packages.
Its failed report and exact anchor-only preview remain evidence; it is not a
semantic mutation RED or a ninth qualified package.

Four failed independent-reader attempts are retained separately from inference
controls. The first three failed observer assumptions: omitted unset terminal
`ExecStart`, actual terminal `systemctl show` return code 0, and the standard
invocation-ID suffix in a successful CPU systemd log. The fourth used the
protected pool Python, so its own argv correctly violated the runtime-idle scan.
The fifth used `/usr/bin/python3` with the unchanged final reader and exited 0;
its own captured PID/start/unit physically exited, with no resource stop or
observer error. The earlier failed logs, bounds and reader-source snapshots are
retained; none is counted as an inference semantic RED or silently rewritten.

Across the twelve installed stages, maximum observed `combinedOwnedMemoryPeakBytes`
was 11082338304 bytes (10.321 GiB), recorded by
`native-epsilon-baseline-img2img.bounds.json`, below the 14 GiB combined limit.
All twelve bounded reports recorded no resource stop or observer error and
confirmed their captured physical exits. The separate native cleanup ENODEV
remains in its original report rather than being reclassified as a resource
failure. The independent aggregate explicitly does not authorize deletion.

## Final restoration, resources and handoff

Finite installed execution, independent readback, restoration and guarded
cleanup are confirmed. The fresh system proof made 820 checks after every
captured original native exit. Before deletion, the guard first refused pytest's
two exact `current` link names and then the known speech-dispatcher zombie
PID25529/start154115 on its preexistence cutoff. The reviewed corrections allow
only unlinking those same-parent owned pytest links without traversal, and only
that literal ended child with freshly checked Z/empty argv/FDSize0/zero address
space and exact packaged parent/unit. Other unknown or later live unreadable
processes remain refused. Original guard sources and observations are retained.

A separate component control placed an actual protected source path only in the
environment of an owned 128 MiB/zero-swap/20-second native process. The actual
guard refused exactly that PID. Replacing the whole guard's final environment/cwd
predicate with False made the same assertion fail; after reverified own-unit
stop and physical exit, a fresh original guard passed. This proves that path
inspection remains effective; it is not numerical inference evidence.

The superseded attempt's nine disposable payloads reclaimed 9117696 allocated
bytes; the current run's seven reclaimed 7651328. Both cleanup proofs preserve
the sole compatible runtime, original image/model files, all raw reports/PNG
and `.igs` packages. The failed first-attempt compact evidence stayed byte-exact.
No dependency or protected mutation rollback remained in the deleted copies.

After the original-source reader and cleanup passed, only the qualification
helper and its tests received the ENODEV repair. Unavailable cgroup observation
remains a blocker in the existing bounded retry loop until an actual later
empty/absent observation, with captured process identities also exited.
Persistent ENODEV, live workers, untracked group population and unrelated
proc/cgroup errors still refuse confirmation and timer stops. Success tests
assert the exact recorded timer names and stop arguments; signaling authority
is unchanged.

The whole actual two-file copied boundary passed 30 baseline tests. Removing
the ENODEV blocker produced exactly four semantic failures and 26 neighboring
passes; byte/physical-identity restoration then passed all 30 fresh tests.
The copied subject retained its exact inode/mode/size/mtime, and the disposable
two-file copy reclaimed another 36864 bytes after fresh physical/dependency
checks. Retained source snapshots and JUnit/bounds bind the executed cases.
These kernel/proc/systemd transports are controlled doubles; no live ML race
injection or new trained inference is claimed.

The original executed helper SHA is
`4f58e5cc5e1c5d87f1989b9afc4aaa51c3d6e36d9f334ec56a2d35e16ec36ff6`;
its retained plaintext is `cgroup-enodev-helper-original.mjs`. The separately
tested repaired subject SHA is
`46bd66b1eb6cd9d1861225cdacc7829605745952118388011cf32a7e393cb582`.
Original campaign hashes/reports were not rewritten and its raw reader was not
replayed against the repaired helper. The final repository focused run passed
115 tests with zero failed/skipped; targeted ESLint passed. The earlier
typecheck/full lint/worker checks/build remain applicable to unchanged sources.
Final pool verification confirmed physical idle and all 43 exact original
worker bytes/identities. Git publication is reported separately from local
evidence.

The next finite installed plan remains Fixed0/per-prompt on the same four
EPS/V × IMG/OUT common-source scopes, four weighted pairs × two iterations,
literal seeds `0,1,2,3,4,5,6,7` in each scope: 32 healthy jobs and four packages.
It requires its own frozen plan and budgets before execution;
additional mutation/crash cases are outside that healthy scope. Image
Random/Reuse/wrap/cap32/crash, broader geometry/formats/quality, Invoke trained-pixel
parity, full MVP and public delivery/release remain unqualified. PP-004/005/007/008
retain «Пока не обещать».
