# Installed Anima dynamic batches and crash Reuse

## Scope and entry revision

Base: `e85616e6c159da1e79be85a460cba539984c913b`, `master`. This opt-in
qualification follows [worker0.14 Anima regression](./phase-2c-anima-worker-014-regression-research.md).
The current gap is installed-system evidence, not an identified production bug.
Three read-only source audits found no reachable batch/seed/recovery defect.
PP-004/005/007/008, [dynamic prompting](../features/project/generate-mode/dynamic-prompting.md),
[settings](../features/project/generate-mode/generation-settings.md),
[provenance](../features/project/generate-mode/generation-provenance.md) and
[frozen jobs](../features/queue-manager.md#frozen-job-rule) remain the contracts.

This is a high-risk qualification: it exercises durable queue, crash recovery,
explicit `.igs` Save and immutable accepted provenance, and temporarily mutates
one installed worker source. Production behavior and its batch cap32 remain
unchanged. The new runner is separate from the historical qualification runner;
earlier source-bound reports must not be rewritten to fit this gate.

## Boundaries and literal acceptance plan

Actual renderer Generate → flush/capture Main project → positive×negative
expansion → pair/iteration seed planning → atomic frozen queue admission →
installed worker0.14/BF16 → validated receipt/candidate and transactional local
seed cursor → explicit Add → portable immutable configuration → worker previews
and explicit `.igs` Save → raw ZIP readback → public reopen/comparison.
Startup cancels unfinished jobs with APP_RESTART rather than resuming inference.
The local cursor is scoped by project key/documentId; seed0 is a valid completed
value, and explicit Save snapshots it separately from content history.

The independent oracle uses handwritten concrete raw prompts, compiled sign
spans and tuple orders; it does not call the production expansion/seed planner.
All inference is Euler,256×256,3 steps,CFG4,Anima BF16,Myth Portrait−0.5.
Positive template varies weighted red/blue1.3; negative varies blurry/noisy0.7.

1. Fixed0/per-iteration: four pairs×two images produce ordered seeds
   `0,1,0,1,0,1,0,1`. Change the actual current prompts/method/seed37/LoRA−0.25
   after admission; all eight frozen/native/portable settings retain their inputs.
   Add8/Save/readback/reopen; saved cursor1.
2. A different project explicitly saves before Generate, with portable cursor
   snapshot null. Admit literal red/blurry Fixed0/per-prompt seeds0,1,2. Verify
   first receipt/candidate0, second installed native execution and third pending,
   then kill the freshly verified owned native scope. Prove physical exit;
   no Add or Save follows the completion. The saved package remains unchanged.
3. Restart/recover the same local document. Candidate0 survives exactly; the two
   unfinished jobs become APP_RESTART without receipts. Add that candidate and
   hide its layer through the actual UI to retain a transparent TXT target.
   Reuse must select local0, not authored37, absent portable snapshot or neighbor
   project cursor1. Four pairs×two images/per-prompt produce seeds0 through7.
   Add8/Save/readback/reopen gives nine layers and snapshot7.

Confirmed normal total:17 finite completions/19 admissions,
two APP_RESTART cancellations,one actual crash,two packages/17 accepted layers.
This does not test every possible cross-project cursor mutation: an incorrect
global-latest lookup could coincidentally find this same completed0.

## Mutation, recovery and execution constraints

Use same-input healthy pixel baselines. Temporarily replace only the installed
Anima generator seed with constant0. Seed0 is the neighboring control; seed1
must cause numerical RED before Add, despite correct frozen metadata. Import,
setup, OOM or cleanup failure is not a semantic kill. Record finite provisional
outputs before evaluating the pixel baseline. Restore all43 originals, including
the mutated file's original inode/mode/mtime/bytes and absent backup, only after
independent physical exit. Fresh literal red/blurry0,1 must reproduce healthy
pixels through Add/Save/reopen. Fresh acceptance is two additional layers/one
package, confirmed below.

Root is the sole heavy executor/mutator/cleanup owner; agents write isolated
qualification files and do not run tests or ML. Reuse the existing qualified pool
`shared/illustrious-vpred-worker-012-20261007` (actual worker0.14),9 resources/
14 versions. Preserve all180 entry queue rows and earlier resource identities;
no adoption, download, new weights or environment copies. Original model sources
outside the owned artifact root are read-only. Launcher and KDE native scopes
have separate12GiB/swap0 bounds and finite deadlines; this is not an aggregate
12GiB or host-wide limit. Low-level checks are bounded separately.

Evidence: `~/.codex/artifacts/imagegen-studio/runs/anima-dynamic-batch/20261009-checks/`.
Entry allocation27,988,361,216 bytes,compact147,578,880,free51,473,235,968;
entry manifests confirm pool idleness and43 originals. Preserve compact failed
setup/RED/GREEN/source/bundle/SQLite/ZIP proof. Retain one pool for the named next
qualification, with lifecycle state and final disk/process inventory.

## Open scope

Random, uint32 wrap,max32 native inference, installed truncation, the full
Fixed/per-prompt pair matrix, Illustrious dynamic counterpart,replacement
document identity,broad formats/quality,Invoke recipe/public installer/release
and full MVP remain unqualified. Promise statuses remain «Пока не обещать».

## Harness preparation findings

Initial preflight refusals are separate from ML qualification. The historical
fixture omits all14 local installed identities; these are bound by exact source
SHA from the retained real catalog before the unchanged strict catalog guard.
The43-file worker payload includes30 Python files and13 assets, vendor notices,
tokenizers and ICC; verifying only `.py` would omit required payloads.

One excluded UI setup admitted eight rows but incorrectly read an absent
`ProjectTab.documentRevision`. No finite output or Add followed. Its original
failed report incorrectly records zero admissions because the assertion preceded
recording; raw SQL and the following healthy entry independently retain all8.
The runner now records every admission before evaluating it and reads the pre-
Generate revision from the durable saved document/dirty shadow. Startup rejects
these8 with APP_RESTART, unchanged frozen input, incremented status sequence and
no receipt. Earlier180 rows are preserved exactly.

The first crash/recovery attempt produced one finite candidate, recovered local0,
canceled two unfinished rows and genuinely added/hid that candidate. A redundant
model/version selection then raced its async response before choosing Euler.
This failed attempt has zero new Reuse admissions and one accepted unsaved shadow
layer; its original portable package remains empty with null seed snapshot.
It is not counted as a completed Reuse/Add/Save/reopen cycle. The UI driver now
skips an already selected exact model/version, and a fresh crash/recovery project
is used. Its extra3 admissions/1 completion/2 restart cancellations and unsaved
acceptance must be accounted for separately by the raw aggregate.

Healthy iteration evidence predates that UI-driver correction. Its report and
hashes are unchanged; `native-iteration/qualification-driver.mjs` preserves the
exact executed earlier client source. Numeric baselines may use this recorded
client revision while requiring identical numerical-oracle/dependency hashes,
application bundles, exact installed sources and whole same-execution inputs.
New reports record retained/current driver bindings explicitly. A different
application bundle or numerical dependency is refused. This is a client setup
revision difference, not evidence from a different inference producer.

## Execution through the installed system

These runs use the built production renderer/preload/Main and actual retained
installed worker0.14/native BF16. They do not replace the compositor, inference,
queue, receipts, recovery, writer or package loader. Source/catalog preparation
remains a local developer precondition rather than public installation proof.

| Stage              | Completions | Admissions | Accepted saved layers | Saved packages | Result                                                                                                          |
| ------------------ | ----------: | ---------: | --------------------: | -------------: | --------------------------------------------------------------------------------------------------------------- |
| `native-iteration` |           8 |          8 |                     8 |              1 | Fixed0/per-iteration, exact four pairs and all eight finite outputs                                             |
| `native-crash-2`   |           1 |          3 |                     0 |              0 | Actual SIGKILL, completed/running/pending cut, physical exit, unchanged portable null snapshot                  |
| `native-reuse-2`   |           8 |          8 |                     9 |              1 | Actual Recover/local0, two APP_RESTART cancellations, recovered Add1/Hide, Reuse per-prompt0…7, saved snapshot7 |
| Normal total       |          17 |         19 |                    17 |              2 | Both packages independently reread by the native runner and reopened/comparison checked                         |

Normal stages take6m25.375s,3m4.517s and6m26.831s. Launcher peaks reported by
systemd logs are10.7GiB,12GiB and11.6GiB,each swap0. Native scopes have their
own separately retained12GiB/swap0 limits; these are not aggregate/host budgets.
All three native process/scope exits are confirmed. No new managed files or
runtime/model copies are created; original9/14 identities/defaults remain.

Healthy red/blurry seeds0 and1 differ. Recovered0 and Reuse0/1 reproduce the
corresponding healthy RGBA exactly while retaining their declared different
policy/behavior. Later source prompt/method/seed37/weight−0.25 edits leave all
frozen payloads, output receipts and portable concrete configurations unchanged.
The Reuse package has one hidden recovered layer plus eight new accepted layers,
unique queue/candidate provenance and snapshot7; current authored seed37 is saved
separately. The old partial attempt described above is excluded from these totals.

## Semantic mutation and restored control

Only installed `anima_euler.py` was changed: the CPU noise generator used constant
seed0 while the frozen job and output metadata continued to declare the actual
seed. The mutant admitted eight jobs and completed two finite provisional
outputs. Seed0 reproduced healthy0; seed1 also reproduced healthy0, differing
from healthy1. The existing same-input pixel assertion stopped the run at that
second output, before any Add: zero accepted mutant layers and no saved cycle.
This is a numerical semantic RED, not a setup/import/OOM failure.

Owned native PID/start identities and exact scope exit were independently
confirmed before restoring the original file. The rollback journal proves all43
original source/asset hashes, the file's original inode/mode/size/mtime/bytes and
absent backup. Two fresh literal red/blurry Fixed0/per-iteration outputs0,1 then
matched the respective healthy RGBA through actual Add2/Save/raw readback/reopen/
comparison. Startup canceled the mutant's six unfinished jobs with APP_RESTART,
unchanged frozen inputs, incremented status sequence and no receipt. Mutant and
fresh logs report2m33.624s/10.3GiB and3m3.834s/12GiB respectively, each swap0.

## Independent aggregate, counts and review

`aggregate.py` uses SQLite, ZIP, hashes and Pillow without importing the
production planner, package loader, worker or qualification oracle. Its retained
`aggregate.log` and `final-evidence.json` record PASS with5916 assertions:

- Five qualified stages:29 admissions,21 finite completions,8 startup
  cancellations. The21 outputs are17 normal,2 provisional mutant and2 fresh.
- Three genuinely saved/reopened packages contain19 unique accepted layers
  (8+9+2), with portable seed snapshots1,7,1. None contain mutant outputs.
- All raw task attempts:40 new admissions,22 finite completions,18 startup
  cancellations. These include the excluded8-admission setup and first partial
  crash/recovery's3 admissions/1 completion/2 cancellations.
- That first partial attempt has one additional accepted unsaved hidden shadow
  layer; its portable package remains empty with a null snapshot. Thus actual
  accepted candidates including that shadow are20, not19 saved layers or22
  completions. Old reports and earlier180 queue rows are preserved.
- Raw saved PNG bytes/asset hashes/RGBA/ICC, receipts, source templates, concrete
  weighted signs, seeds, exact resource/LoRA IDs and portable provenance agree.
  Recovered0 and Reuse0/1 match healthy controls; mutant1 aliases0; fresh0/1 match
  healthy0/1. Queue/candidate provenance is unique across packages and the shadow.
- Original9 resources/14 versions/defaults and managed/source identities remain;
  no unresolved acceptance journal exists. All43 installed source/assets are
  restored, backup absent, native scopes and runtime/XDG users physically idle.

The aggregate does not redundantly rehash large weights: their strict source
SHA/catalog binding, original filesystem identities and unchanged managed files
are separate retained preconditions. Literal/helper checks are not native proof.
The root execution is self-review; a separate agent's final diff review found
no blocker and is read-only, not a blind user-flow review. Historical worker
manifest equality is independently checked by the aggregate; runner PASS alone
is not the complete source-bound replay proof.

Focused real batch/public-generation/accepted-persistence/recovery tests passed
142/142. The real executable's malformed-CLI preflight tests passed11/11. A fresh
build passed; only the existing large-chunk warning remains. Final helper/CLI,
lint/format and documentation checks are recorded at handoff below.

## Delivery checks and artifact handoff

The final combined helper/executable preflight rerun passed21/21 with no skipped
or canceled tests (3GiB/swap0,5.931s,319.2MiB). Targeted ESLint on all four new
scripts passed (6GiB/swap0,1.901s,544.3MiB). No production TypeScript/Vue or
prototype UI changed, so their typecheck/prototype suites were not repeated.
Source and bundle bindings refer to the executed working tree, not only base HEAD.

Final formatting passed for package/scripts and this new research note after a
Markdown-only formatting correction; executed inference sources are unchanged.
Local Markdown targets and all four unchanged promise statuses were checked,
and `git diff --check` passed. Final code review found no blocker; documentation
review corrected “two full cycles” to two fresh outputs through one saved cycle.

Final artifact allocation is approximately27.998GB (shared27.843GB, runs0.155GB;
this run7.1MB), below30GiB/1GiB soft budgets. Cleanup reclaimed0 bytes: compact
setup/RED/GREEN/aggregate evidence and the one exact runtime/catalog remain named
cross-run dependencies. Protected mutation backup is absent; the restored journal
is retained as compact evidence. Keep this one idle worker0.14/catalog9/14 pool
for the next Illustrious/NoobAI dynamic gate; release it only after that gate or a
verified replacement. No additional runtime or private weight copies were made.
