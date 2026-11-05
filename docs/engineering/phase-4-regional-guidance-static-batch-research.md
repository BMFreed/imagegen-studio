# Static Regional Generate batches

Base: `e0ab9b3376180eb734a73eeae12c2817f16eab70`. Risk: high — public admission,
replacement, frozen queue inputs and candidate ownership. At base the action bar
accepts Images per click 1..100, but Regional Guidance rejects every count except 1.
This slice uses the existing prepared-batch policy of at most 32 jobs, with
data-dependent staging preflight. It does not increase that policy or qualify
GPU throughput. Static prompts, all existing regional execution limits, Euler
and explicitly initialized Euler a remain; dynamics/global TI/LoRA/references
and Anima regional execution stay outside this change.

## Current Invoke source and adaptation

Current local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` was read directly:

- `frontend/webv2/src/features/queue/core/promptBatch.ts` constructs concrete
  prompt/seed batches; `queue/data/submissionApi.ts` submits the shared graph in
  one enqueue operation.
- `frontend/webv2/src/features/generation/core/graph.ts` and
  `core/canvas/addRegionalGuidance.ts` preserve selected sampling and attach
  regional conditioning to that same graph.
- `app/services/session_queue/session_queue_default.py::_enqueue_batch` prepares
  values before admission and rechecks capacity under its admission lock;
  `session_queue_common.py::prepare_values_to_insert` serializes concrete items.

Invoke's backend provides `all_or_none`; its current frontend does not select it
by default. Studio already promises all-or-none prepared admission and preserves
old work until the entire replacement qualifies. Adapt the available Invoke
mechanism through Studio's existing planner, files-first batch publication,
single SQLite transaction and uncertainty/fencing owner. Do not add a parallel
transaction algorithm or call single-item enqueue repeatedly.

## Owner path and invariants

One genuine Main capture and target composition → existing concrete planner
with the captured base seed and requested static count → one verified static
recipe template, detached copies bound to each exact planner item → all recipes,
requests and exact resources qualified → aggregate staging preflight → one
shared batch/session, ordered opaque IDs and atomic SQL admission → existing
sequential worker/receipt/Results owners → independent explicit Add/Save.

Reuse existing per-iteration uint32 seed progression, including wrap. Resolve
Random/Reuse once through existing preparation; do not read later draft edits
between items. Each frozen recipe/request/context must agree on its own seed.
Target/masks/model/authoring remain common snapshots. Worker still consumes one
existing concrete command at a time; no new Python protocol or diffusion loop.

Replacement review excludes all newly admitted IDs, not only the first. Old
jobs/results are affected only after every new item durably admits. Later owner
failure cancels the entire new set or follows the existing uncertain/fence path;
partial successful return is forbidden. This concerns admission/capture failure;
later worker outcomes remain independent per job, with explicit per-item Retry.
Single-item and private histories remain
compatible. Existing frozen Retry retains one selected item's original inputs.
Accepted-result regional/operational exclusions remain exact.

## Finite parameters and acceptance

| Parameter                 | Source/bound                               | Refusal/meaning                                                       |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Prepared jobs             | Existing `GENERATION_BATCH_JOB_LIMIT = 32` | Count 33 refuses before composition/publication; no silent truncation |
| Session candidates        | Existing 64                                | Aggregate preflight includes retained work; not a new batch bound     |
| Frozen payload / manifest | Existing 128 KiB / 8 MiB                   | All entries checked before files/SQL publication                      |
| Target / alpha / metadata | Existing per-job regional limits           | Shared target snapshot; independently owned durable files per job     |
| Active inference          | Existing one job                           | Multiple queue items do not establish VRAM capacity                   |
| Native qualification      | Exactly two jobs                           | One UI batch, official v0.1, 1024², Euler a/30, CFG 5, seeds 123/124  |

Lower checks enter real Generate and SQLite/files: counts 1/2/32 and refusal 33,
Euler/Euler-a pairing, seed wrap, later-item preparation/capacity failure,
Project-change/close, commit uncertainty and preservation of prior work. Frozen
recovery/Retry selects one item independently of current authoring. Mutations
must catch a missing later row and repeating the first plan item, with healthy
single-item controls and exact restoration.

One actual installed UI batch must reach two original wires and receipts/Results
in planned order, while current draft edits cannot alter either input. Seed 123
uses the existing retained same-policy output as a control; no new baseline or
search run. Verify both Results before Add and retain both output PNGs as evidence.
Explicit Add/Undo/Redo/Save of one output retains the existing session rule:
unselected candidates are discarded/tombstoned, while receipts/history survive.
Reuse the current installed runtime/catalog, original checkpoint and
owned cgroup guards: aggregate 12 GiB, zero swap, 600-second deadline. Record actual
scopes/physical exit; these bounds are an experiment envelope, not capacity proof.

Evidence lives at artifact-relative
`runs/regional-guidance-static-batch/20261105-images-per-click`.

## Executed qualification

ROOT records **351 distinct lower PASS**: 89 regional/advisory regressions,
246 ordinary batch/queue/staging/Results neighbors and 16 new static-batch cases.
The new suite exercises real capture/coordinator/planner/SQLite/files and receipt
owners with controlled model/inference providers. It verifies one atomic group,
the 32-job endpoint, refusal at 33, uint32 seed wrap, all-ID replacement exclusion,
second-file and second-INSERT refusal, lost commit acknowledgement, aggregate
preflight refusal, capture/runtime release failure, document ABA and independent
frozen Retry/bootstrap recovery. Final runs have zero failures/skips.

The initial 32-job case hit its 10-second fixture deadline. ROOT changed only
the polling observer from N serialized Queue-manager reads to one independent
SQL snapshot per poll; the deadline and completion assertions remain unchanged.
The original 15 PASS/1 timeout remains retained and excluded. Corrected suites
pass all 16 cases; repeated phases do not increase the distinct count.

`pnpm run typecheck`, fresh `pnpm run app:build`, scoped ESLint/Prettier and diff
checks pass. The build retains its standard chunk-size warning. No prototype
layout, Python worker, protocol/schema migration or runtime upgrade is added.

Two isolated semantic mutations give **4 GREEN → 2 semantic RED + 2 single-item
controls GREEN → 4 restored GREEN**, 12 executions of four existing selections.
Omitting only the last SQL row produces an actual 2-versus-3 row failure;
repeating the first planner item produces three equal seeds instead of the
expected uint32 sequence. No import/setup failure counts as RED. An earlier
driver anchor refusal ran zero tests/mutations and remains excluded. All 1,482
isolated and live qualification files are byte-exact after restoration.

## Actual installed two-image result

`native-r1` passes **13 grouped checks** in 198.359 seconds. One original UI
Generate with count 2 creates two ordered rows in one batch/session, two original
regional worker wires and two completed receipts. Both execute Euler a/30,
CFG 5, resolved false-ZTSNR/leading, the frozen Invoke initialization identity
and the same captured masks/prompts/target. Seeds are 123 then 124; 60 original
scalar progress events are recorded. Saved edits to Euler/2, seed 999 and
disabled regions alter neither queued input. No extra Generate, Cancel, Retry,
baseline or search call occurs.

Both Results are independently decoded and correlated to their own request,
receipt, dimensions and ICC. Seed 123 matches every PNG/RGBA byte of the
same-policy control selected and verified before Generate. Seed 124 has distinct
PNG/RGBA bytes. Actual preview, Add-one/Discard-one confirmation, Raster placement,
Undo/Redo, explicit Save, independent ZIP read and reopen pass. The selected
seed-123 output is saved; the unselected seed-124 candidate is tombstoned under
the existing session rule. Both completed receipts/history remain. The completed
seed cursor/saved snapshot stays 124, rather than being rewritten by selection.
Accepted provenance retains base sampling including per-iteration seed behavior;
regional/composition/initialization operational data remain excluded.

Previous queue/receipt/cursor and other business records, 36 packages and 92
input/candidate file pins remain unchanged. Expected metadata updates are
explicitly separate: Home refreshes `project_index.indexed_at` on the 36 prior
index rows, and the receipt `sqlite_sequence` counter increases by two for the
new completions. The existing installed runtime/config/provision/pointer and original
checkpoint remain protected and exact. ROOT separately reopens both retained
PNGs, verifies their hashes/ICC, the 128 prior byte pins and selected ZIP member,
and retains three final Project packages plus both complete queue-input sets.
No new numerical/loading census or visual/human quality acceptance is claimed.

The source-only independent review is CLEAN; ROOT's actual native run and
retained-byte checks are distinct evidence. After recorded exit of 24 native
process identities and empty/absent 16 observed groups, source restoration,
runtime-idle verification and reader completion, both own payload directories
are archived without following links. All **1,578 entries** remain byte-retained;
**46,342,144 allocated bytes** of idle own scratch are reclaimed. Lifecycle is
`retained`, `payloads: []`; shared runtime/model and durable Project/SQL/accepted
data remain protected. Final source/document/retained-bookkeeping review is
recorded separately.

Public defaults, visual NOT_QUALIFIED, human acceptance, Anima and release/
capacity qualification remain open. PP-001/007/008 stay **«Пока не обещать»**.
