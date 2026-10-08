# Installed Illustrious/NoobAI dynamic batches and crash Reuse

## Scope, revision and outcome

Base `10338b2f5b95b031510beb0d218f38f909ebeb57`, initially clean `master`.
Qualification ran against the delivered working-tree scripts and fresh app build,
whose exact source/bundle manifests are retained. This follows
[bounded Anima dynamic qualification](./phase-2c-anima-dynamic-batch-research.md).
PP-004/005/007/008 and [dynamic prompting](../features/project/generate-mode/dynamic-prompting.md)
remain the contracts. No reachable production defect was identified: this closes
an installed-system evidence gap, with an execution-harness selector correction.
Production pipeline and admission cap are unchanged.

High risk: durable queue/cursor, crash recovery, explicit `.igs` Save, immutable
provenance and temporary installed worker mutation. Three agents prepared the
independent literal oracle, common driver and read-only boundary/aggregate review;
root alone ran tests, inference, mutations and cleanup. Running user-flow checks
are self-review, not a blind audit.

Eight ordinary/crash/Reuse/restored stages passed. Both installed generation-RNG
mutants failed on the intended pixel assertion before Add, with GREEN seed0
controls. Independent raw SQLite/ZIP/Pillow aggregate passed **10,230 assertions**:
**58 admissions, 42 finite completions, 16 APP_RESTART cancellations, six saved
and reopened packages, 38 accepted layers**. Completions are34 normal,4 provisional
mutant and4 restored fresh. One excluded selector setup admitted0 jobs; raw and
qualified new-job totals therefore coincide. This does not qualify the full MVP.

## Actual path and preserving invariants

Renderer Generate flushes/captures Main project and draft. The planner expands
positive outer/negative inner, then pair outer/iteration inner, assigning uint32
seeds before atomic frozen admission. Installed worker0.14 executes the exact
checkpoint, prediction/noise profile, external VAE and signed LoRA. Receipt
validation commits candidate and document-scoped cursor transactionally. Explicit
Add creates accepted Raster provenance; explicit Save snapshots the local actual
seed after preview work. Startup cancels unfinished jobs with APP_RESTART.

Read-only anchors: `generation-batch-plan.ts`75–94, orchestrator457–468 and
1194–1218, preparation410–495, staging631–671/cursor380–391, queue1980–2003,
provenance233–267, service2087–2110. Worker `inference.py`350–387 resolves
scheduler/objective/noise,894–918 loads VAE/signed LoRA,936 creates the CPU RNG,
986 returns the command seed as metadata. These observations were checked against
actual frozen SQL, completed receipts, native progress, PNG and portable packages.

Ordinary Illustrious requests contain raw weighted signs, not fabricated Anima
compiled spans. Worker Compel conditioning is distinct from Main expansion.
Current edits after admission must not change queued jobs, receipts or portable
accepted configuration. Original220 queue rows,9 resources/14 versions, defaults,
14 managed files, four selected original model sources and43 installed
source/assets remained intact. No unresolved acceptance journal or duplicated
accepted provenance remains.

## Finite configurations and execution

Linux/NVIDIA RTX4080 16GiB; one non-editable installed worker0.14, Python3.12.13,
Torch2.7.1+cu126, Diffusers0.40, Transformers5.5.4, PEFT0.21. Both exact trained
objectives use256×256/three steps/CFG5, leading spacing, native external VAE FP32
and Digital Art LoRA−0.5. EPS uses Euler a/non-ZTSNR; V uses Euler/ZTSNR.

| Source              | Exact SHA256                                                       |      Bytes | Origin                                         |
| ------------------- | ------------------------------------------------------------------ | ---------: | ---------------------------------------------- |
| Official NoobAI EPS | `ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1` | 6938040416 | CivitAI833294/1022833/928571                   |
| Cyberfalafel V      | `edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d` | 6938040794 | CivitAI1147756/2679856/2566634                 |
| Digital Art         | `c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9` |  114437420 | Retained controlled origin700060/700061/700062 |
| Native external VAE | `f09b42f799d82812ef38461205c4764ecb3e10384bb6ee198321124dbc59e9b7` |  167335542 | Retained controlled origin700070/700081/700082 |

These are retained local source/catalog identities, not evidence of a new live
CivitAI download. No installation, adoption, runtime or weight copies occurred.
The retained Anima sampling fixture supplies the strict shared9/14 closure;
Illustrious adapters bind actual catalog owners by exact file SHA.

Positive template: `a {(red:1.3)|(blue:1.3)} ceramic cup on a wooden table, studio photograph`.
Negative template: `{(blurry:0.7)|(noisy:0.7)}, low quality`.
Literal pairs: red/blurry, red/noisy, blue/blurry, blue/noisy. No embedding sidecars.

For each objective:

1. Four pairs×two images use Fixed0/per-iteration seeds `0,1,0,1,0,1,0,1`.
   Current prompts become green/grainy, sampler changes to the opposite valid
   choice, seed becomes37, LoRA−0.25, maxPrompts3/opposite behavior/count1.
   All eight frozen/native/portable tuples remain unchanged through
   Add8/Save/raw readback/reopen/comparison. Snapshot is1.
2. A separate explicitly saved empty project admits red/blurry Fixed0/per-prompt
   seeds0,1,2. After completed0/running native child/pending, SIGKILL targets only
   the revalidated owned scope. Physical exit is confirmed. Saved package stays
   byte-identical and empty, without a portable seed snapshot. This cut does not
   claim that the second job reached a denoising step.
3. Home Recover restores candidate0 bytes and local cursor0; unfinished jobs
   become APP_RESTART without receipts. Actual Add1/Hide preserves empty target
   inputs. Reuse reads local0 despite authored37/null portable snapshot and emits
   four pairs×two images with seeds0…7. Recovered0 and Reuse0/1 reproduce healthy
   same-execution RGBA. Add8/Save/readback/reopen gives nine layers/snapshot7.
4. Installed generation RNG is temporarily constant0, while metadata still
   declares the actual command seed. Neighbor0 remains GREEN; seed1 equals0
   instead of healthy1 and fails before Add. Physical exit precedes protected
   restoration; fresh0/1 each reproduce healthy RGBA through one
   Add2/Save/readback/reopen/comparison cycle. Snapshot is1.

| Objective/stage                   | Admissions | Finite outputs | Saved layers | Actual runtime |
| --------------------------------- | ---------: | -------------: | -----------: | -------------- |
| EPS iteration (`eps-iteration-2`) |          8 |              8 |            8 | 7m25.848s      |
| EPS crash                         |          3 |              1 |            0 | 2m23.101s      |
| EPS Reuse                         |          8 |              8 |            9 | 7m24.838s      |
| EPS mutant, intended RED          |          8 |              2 |            0 | 2m48.118s      |
| EPS restored, GREEN               |          2 |              2 |            2 | 3m23.664s      |
| V iteration                       |          8 |              8 |            8 | 7m35.896s      |
| V crash                           |          3 |              1 |            0 | 2m36.763s      |
| V Reuse                           |          8 |              8 |            9 | 7m21.654s      |
| V mutant, intended RED            |          8 |              2 |            0 | 2m40.204s      |
| V restored, GREEN                 |          2 |              2 |            2 | 3m15.030s      |

Recovered crash outputs are counted once as completions and later as one layer
in each Reuse package. Six saved packages have8/9/2 layers and snapshots1/7/1
per objective. Same-seed single-sign positive and negative changes affect pixels
in both objectives. This is content sensitivity, not an image-quality claim.

## Mutation, controls and restoration

Only installed `inference.py` changes:
`torch.Generator(device="cpu").manual_seed(command.seed)` becomes
`torch.Generator(device="cpu").manual_seed(0)`. This RNG owns initial noise and
Euler a step noise. Original SHA is
`c5d6bbe89ad51e8b60233ee6915bad143bee55f481b4c9fdd559501bacc6cd32`;
mutated SHA is
`b79f36d6c7beca74bcc0d68f5bd5e1ab3b63654c4e882f23865c3d0826bb7620`.
Both failure messages are exactly
`Installed dynamic-batch pixels differ from retained healthy same-input reference.`

Correct seed metadata is insufficient: independent decoding shows mutant1 equals
mutant0/healthy0 and differs from healthy1. Raw shadow/package checks establish
zero accepted mutant layers; a failed report's acceptance counter alone is not
a general proof that Add never occurred. Each of six unfinished mutant jobs is
subsequently canceled on startup without a receipt. Four fresh outputs restore
healthy same-input pixels. Both journals confirm physical exit, all43 original
files, original inode/dev/mode/size/mtime/bytes and absent rollback payloads.

## Harness change and excluded attempt

One shared driver receives Anima/Illustrious adapters; family-specific expectations
remain independent literal oracles. Ten lightweight new oracle tests use
hand-authored DTOs to test the oracle itself, not production inference. Actual CLI
guard tests exercise executable refusal boundaries with filesystem/process
instrumentation. Focused production planner/orchestrator/acceptance/recovery tests
remain separate from installed-system evidence.

First `eps-iteration` timed out selecting Euler a before admission:0 jobs,
outputs or Add. Its report/log/source snapshot remain unchanged. Naive blocks
clicks with inner `.n-base-selection--disabled`; div `toBeEnabled()` and old
`.n-select--disabled` do not check it. The corrected selector waits on the actual
inner trigger and verifies one visible menu/exact option, retaining DOM and
failure screenshots. Fresh `eps-iteration-2` succeeds. Its initial control is
not disabled, so the first failure's exact cause is not uniquely established.
A later actual mutant run records disabled-before-ready and enabled-after-wait;
this independently confirms the corrected wait observes a real state.

Original shared engine SHA `cb4ab76a1326102e71626134003e1314541bf48d962f65ca8e73e4212c87c931`
is retained with the excluded attempt. All ten qualified stages use unchanged
engine `668383f2daf99c894364f62153bb11f485e3169fd7be1273de8c8cbe24fb7a11`,
source and app-bundle manifests. Historical Anima reports are immutable: exact
executed old drivers were retained before extraction. Pre-extraction baselines
are explicitly refused by the new driver. Read-only comparison confirms all ten
old non-entry dependencies, original oracle and Anima flow/adaptation semantics;
**no new installed Anima ML run** was performed here. Production/installed
inference source is restored and unchanged. No reachable new harness blocker
was found; the running pass remains root self-review.

## Checks and retained evidence

- Fresh `pnpm run app:build` passed; existing chunk-size advisory remains.
- Targeted ESLint passed for all11 changed/new script files; selector correction
  passed its focused lint. No production TypeScript/Vue or prototype changed.
- Focused9-file `pnpm exec tsx --test` command is retained in
  `focused-selector.bounds.json`: **141 passed,0 failed/skipped/canceled**.
  Initial and post-selector reruns both pass; this is141 distinct tests, not282.
- Final script/package/note Prettier, diff whitespace and730 relative document
  links passed. Promise status/matrix shape and all13 delivered source/five bundle
  manifests match actual qualified bytes.
- Independent read-only aggregate uses only SQLite/ZIP/Pillow/stdlib, importing
  neither planner, worker nor qualification oracle. It validates raw frozen rows,
  receipt/progress/source bindings, decoded PNG/ICC/RGBA, local cursor and startup
  cancellation, portable configuration/assets/merged preview, unique provenance,
  original rows/catalog/files and physical exit/restoration. Passed10,230 checks.

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/illustrious-dynamic-batch/20261009-checks/`.
`final-evidence.json` SHA:
`6ad41da7c94db4231dcd2e73e9a4970d197730f9afae9caa068d8ed63fe34019`.
Fixtures and baseline/crash reports are SHA-bound; normal, RED, fresh and excluded
reports are retained separately. `entry-sources.json`, `final-sources.json`,
`mutation-journals.json`, original SQL rows, bounded logs and rollback journals
remain available. The excluded report SHA is
`712b9ff6d210e5f3de1b5d433afd1170406e3c6d444e8273a522dc18a56ac84f`.

Commands: opt-in `pnpm run app:qualify:illustrious-dynamic --fixture ABS`
(each descriptor declares exact objective and finite stage); root's sequential
`run-native-stages.py` records bounded invocations and controlled mutation/restore.
Aggregate command, bounds and actual exit are in `aggregate.bounds.json/log`.
This requires the existing qualified local catalog/runtime; it is not a public
installer or an unguarded general benchmark.

## Resource lifecycle, limits and next gate

One compatible pool: `shared/illustrious-vpred-worker-012-20261007`.
Entry root allocation27,997,974,528 bytes, shared27,843,313,664 and compact
154,656,768; below30GiB/1GiB soft budgets. GPU entry free14,510MiB, host
MemAvailable about20GB. Runs are serial. Launcher/native groups each have12GiB,
swap0 and finite1200/1800-second deadlines; separate ceilings are not an
aggregate12GiB limit. Root additionally polls summed owned-group use at0.25s,
with14GiB stop threshold and exact process/cgroup revalidation. Actual largest
combined sample is11,574,951,936 bytes (10.78GiB); no resource stop occurred.

Handoff inventory allocation is28,024,012,800 bytes (about26.10GiB): shared
27,851,304,960 and compact172,707,840 bytes, including this run17,797,120 bytes.
No redundant heavy payload was created; reclaimed space is0 bytes. All mutation
payloads are physically restored; compact normal/RED/fresh/failed evidence and
one idle pool remain necessary. Lifecycle handoff records final inventory and
pins that pool specifically for the next dynamic embedding gate, with release
review after that gate or verified replacement. Original models outside the
artifact root remain read-only. Final delivery/source/link/format checks and
commit/push identity are recorded in the handoff.

Next one finite gate: **installed dynamic embedding activation/subsets for EPS/V**
(ordinary, positive-only, negative-only, both; exact per-concrete captured/effective
refs; conditional negative-TI-zero mutation with ordinary GREEN, numerical RED
before Add, then restoration/fresh GREEN).

Random, uint32 wrap, max32 native inference, installed truncation/full
Fixed-per-prompt matrix, dynamic embedding sidecars, replacement-document identity,
arbitrary formats/geometry/quality, full Invoke recipes/public installer/release
and full MVP remain unqualified. This installed sequence alone does not rule out
every global-latest cursor mutant; identity guards additionally have source and
integration evidence. PP-004/005/007/008 remain «Пока не обещать»; matrix and bodies
are updated together without expanding historical counts.
