# Phase 2B: capacity measurement and concrete batch planning

Base: `3aba5f8`, clean `master` aligned with `origin/master`. Risk: high —
frozen queued inputs, seed scheduling and immutable accepted provenance.
Contracts: [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[dynamic prompting](../features/project/generate-mode/dynamic-prompting.md),
[queue freeze](../features/queue-manager.md#frozen-job-rule) and
[existing grouped admission](./phase-2b-batch-grouping-research.md).

## Confirmed baseline and scope

The real grouped entry point already admits concrete qualified jobs atomically.
Its integration fixture supplies prompts/seeds manually. Production has neither
a concrete dynamic planner nor dynamic seed behavior in frozen/accepted metadata.
Prototype behavior is left-to-right Cartesian groups, positive outer/negative
inner, prompt-pair outer/iteration inner, `maxPrompts` prefix truncation with a
warning, and uint32 seed wrap. Fixed/Random/Reuse base resolution is already
owned by Project preparation and its document-scoped completed cursor.

This slice adds a bounded pure planner, an internal prepared-Project → planned
batch → qualification → grouped admission entry point, optional seed-behavior
metadata for new frozen/accepted results, and a reproducible storage-capacity
harness. Renderer Generate, preview/settings UI, persisted dynamic draft options,
GPU pipeline and installed release runtime remain later boundaries. No new
inference engine, wildcard expansion, model family or schema migration is added.
Legacy frozen payloads/provenance remain readable without seed behavior; absence
is unavailable historical information, never silently synthesized.

The adopted current non-nested brace grammar is retained for this internal
checkpoint. Malformed/nested/empty/single-alternative groups are rejected before
queueing. Backslash-escaped braces/pipes are lexically literal and retained; the current
Python worker rejects even escaped braces, so admission explicitly refuses any
remaining brace text before qualification. Pure lexical preservation does not
prove conditioning support. Escaped pipes/backslashes remain subject to existing
worker conditioning constraints; duplicates and dollar replacement text are preserved. This fixes unsafe
prototype-helper behavior without importing that helper into production. The
prototype itself is unchanged; its 100-job mock ceiling does not define policy.

## Owners and invariants

Caller obtains one frozen Project preparation (including resolved base seed) →
entry point copies context/target/options synchronously → pure planner validates
all syntax before bounded prefix generation and count checks → main admission
barrier → one shared qualified request lease → each concrete worker envelope is
checked → actual grouped orchestrator/queue/staging preflight → durable batch →
existing processor, Results, explicit Add/shadow/Save.

The planner receives an explicit job bound and does not create storage, choose
randomness or resolve reusable seeds. The production entry point uses the shared
32-job policy selected below. One Random base is chosen by existing Prepare;
Reuse remains completed cursor/saved snapshot with no random fallback. Seeds
advance by iteration or flattened job index as accepted; arithmetic wraps uint32.
All jobs share frozen document/revision/bbox/model/target/sampling except concrete
prompts/seeds. Later caller mutation cannot change the plan or queued payload.
Returned truncation is required information for the future preview/Generate UI.

New seed behavior is main-owned frozen metadata and accepted provenance, not a
new Python denoising parameter. Worker request DTO remains unchanged. Optional
metadata is excluded from group differences only where appropriate; two jobs
with different behavior cannot silently become one homogeneous group.

## Capacity parameters and measurement boundary

| Parameter                   | Current value/source                                     | Consequence                                                                   |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Recovery session candidates | 64, shared staging limit                                 | Upper bound on one current session; not a measured public guarantee.          |
| Frozen JSON                 | 128 KiB per candidate                                    | Aggregate escaping still checked by real staging preflight.                   |
| Session manifest            | 8 MiB serialized UTF-8                                   | Completion metadata and JSON escaping are included before admission.          |
| Prompt                      | 16 KiB UTF-8 per positive/negative, current worker/queue | Validate source/concrete strings and each 64 KiB worker transport envelope.   |
| Target/output               | 32 MiB, side ≤2048, ≤4M pixels                           | Per-job input copies and candidate PNGs dominate disk.                        |
| Active inference            | One job                                                  | Queue length does not establish model VRAM compatibility.                     |
| Initial prepared-job limit  | 32, selected from measured cases below                   | Independent byte preflight remains mandatory; future UI consumes this policy. |

Measure counts 1/8/16/32/64 and refusal at 65 on an explicit private persistent
filesystem directory. `/tmp` on this computer is tmpfs, so its timings cannot
establish durable disk capacity. Run common 1024² and maximum 2000² workloads
with one qualified common target and transport-valid long prompts; separately label exact
32 MiB ancillary-padded valid PNG stress. It is an accepted storage envelope,
not normal compositor output. Record admission, publication, Results/restart,
logical/allocated disk and fresh-process RSS with host/filesystem information.
Source/model/inference adapters and warm-cache/local-host limitations are stated.
Counts/time observations do not establish fleet support or GPU inference speed.

The shared production policy is selected from these cases; lower
free disk, real model size, GPU/driver and accumulated sessions remain external
constraints. Existing valid candidates cannot be silently evicted for a quota.
All bulky harness-owned temporary data is removed after a case; logs/metrics
remain outside the checkout. No user project, model library or runtime is used.

## Failure cases and verification plan

Invalid syntax/settings/uint32 or requested count overflow refuses before
qualification/queue mutation. `maxPrompts` caps the explicit expansion prefix;
it is not a second silent truncation to the job bound. Full syntax is inspected
even when only a short prefix would be generated. Huge combinatorial products
are never eagerly allocated. Positive/negative empty strings are valid literals,
but empty group alternatives are not. Each varied concrete request must fit the
existing transport; checking only the first is insufficient.

Exact model, current document, close fence, capacity refusal and uncertain
commit/cancellation continue through the grouped entry point. New provenance
must retain concrete prompts, actual completed seed, requested policy and selected
behavior across Add/Save/reopen; legacy neighbors remain readable. The common
qualified scratch lease survives until durable admission settles and is cleaned
on success/refusal. Existing `.igs` and live Project draft remain unchanged until
explicit acceptance/Save.

Capture meaningful missing-entry-point/schema red tests, focused green and
isolated semantic mutations for seed ordering and metadata propagation. At least
one integration case must call the planner entry point rather than inject
already planned jobs; use real preparation/model checks, SQLite, filesystem,
processor/staging/Results and portable writer/reader, replacing only external
inference. Run typecheck, lint, app tests and native smoke, then update PP matrix,
contracts and roadmap without claiming renderer/GPU completion.

## Executed persistent-storage measurements

The completed matrix used Linux x64, kernel `7.0.0-34-generic`, Node `24.16.0`,
pnpm `11.9.0`, i9-11900KF, 32 GB RAM and ext4 on `/dev/nvme0n1p1`. SQLite used
WAL/FULL and the real filesystem publication/fsync paths. Each case ran in a
fresh child process and newly owned directory. Output pixels and the exact-model
adapter were controlled fixtures: no real model inference, renderer Generate
or GPU qualification was performed.

The first run exercised 1/8/16/32/64 jobs for each of `normal1024`,
`maximum2000` and `escaped1024`, with three repetitions; exact 32 MiB padded PNGs
at 64 jobs once; and a count-65 refusal. All 47 cases finished: 43 completed,
4 expected refusals, zero errors. Escaped 64-job payloads refused the 8 MiB
manifest preflight in all three repetitions before queue/files publication;
65 jobs also refused without partial state. All owned bulk data was removed.

A subsequent targeted run measured 32 jobs with exact 32 MiB target/output
PNGs in three fresh processes, plus the count-65 control. All four cases
finished: three completed and one expected refusal, zero errors. Across both
runs: **51 cases, 46 completed, 5 expected refusals, zero errors**. Successful
cases verified Results after database close/reopen/recovery, candidate order,
seed cursor and unchanged portable Project bytes. This capacity path calls the
real queue/staging/Results repositories; the separate integration tests below
cover the new Project/planner/orchestrator/Add/Save path.

Times below are medians in milliseconds; RSS is the highest fresh-process OS
high-water mark, including setup. Retained storage is after scratch lease
cleanup, including input copies, candidate files and database/WAL.

| Profile/count      | Admission | All publications | Results | Restart/recovery | OS RSS MiB | Retained logical storage |
| ------------------ | --------- | ---------------- | ------- | ---------------- | ---------- | ------------------------ |
| Normal 1024² / 32  | 241       | 1,494            | 278     | 279              | —          | —                        |
| Maximum 2000² / 32 | 271       | 2,823            | 888     | 934              | 241        | about 375 MiB            |
| Escaped 1024² / 32 | 270       | 1,867            | 282     | 285              | —          | —                        |
| Maximum 2000² / 64 | 489       | 6,224            | 1,778   | 1,783            | 300        | about 747 MiB            |
| Padded 32 MiB / 32 | 3,015     | 8,705            | 2,252   | 2,349            | 389        | 2,156,420,741 bytes      |
| Padded 32 MiB / 64 | 5,658     | 17,385           | 4,423   | 4,564            | 431        | 4,309,184,965 bytes      |

For padded 32 MiB / 32, retained allocated storage was 2,156,720,128 bytes
(about 2.009 GiB); queue input alone was 1,073,751,200 logical bytes. The
largest observed event-loop stall in that run was 663 ms in the inclusive
qualified-lease phase; it includes instrumentation/disk snapshots and cannot
be attributed to a single production operation. Completion observed 135 ms;
other individual admission/Results/restart phases observed about 38–45 ms.
At padded 64 jobs the inclusive phase reached 1,206 ms. Nested timings cannot
be added, 10 ms sampling can miss short peaks, and disk snapshots are not exact
transient peaks. No cache eviction was performed. Measurements are local,
often warm-cache observations, not fleet or responsiveness guarantees.

**Decision:** start prepared admission at **32 jobs** in
`src/shared/projects/generation-batch-policy.ts`. It is the largest measured
count admitted in all three ordinary profiles in every repetition, and also
has a three-repeat witness at the maximum accepted PNG byte envelope. A
16-job cap gives additional latency margin but is not required by the observed
storage boundary; 64 rejects one ordinary transport-valid profile and doubles
max-image Results latency/disk footprint. The existing recovery ceiling of
64 is retained to read and manage valid older/qualified groups. Count is not
a substitute for escaped-byte preflight or available disk; a 32-job group can
still refuse when those constraints fail. The prototype's mock ceiling of 100
does not change this decision.

Reproduce on a new absolute directory on persistent storage:

```sh
pnpm exec tsx scripts/measure-generation-batch-capacity.ts --artifact-dir /absolute/new/matrix
pnpm exec tsx scripts/measure-generation-batch-capacity.ts --artifact-dir /absolute/new/stress32 --profiles storage32MiB --counts 32 --repetitions 3
```

Existing directories and tmpfs are refused. The script creates only private
fixture data and removes its own bulky paths; evidence is retained. Per-case
JSON/logs, system information, source SHA-256 manifests, commands and summaries
are in `/home/user/.codex/artifacts/imagegen-studio/batch-capacity-matrix-2026-09-30/`
and `/home/user/.codex/artifacts/imagegen-studio/batch-capacity-stress32-2026-09-30/`.
Both runs used the dirty slice over `3aba5f8`, with stable core hashes during
each run and provisional policy 64. The harness exercises the existing storage
ceiling directly; policy changed to 32 only after measurements finished. The
first harness source was archived with its matching hash before explicit stress
count/repetition options were added for the second run.

## Implementation verification and review

Tests enter through real Project preparation, model-file verification,
`enqueuePreparedBatch`, SQLite queue, processor/staging/Results, acceptance
journal, recovery shadow and portable Save/read. External inference is replaced
with controlled completion. Observed invariants include concrete pair/seed order,
uint32 wrap, one Random base, completed Reuse seed zero without RNG, caller
snapshot before qualification awaits, explicit truncation, unchanged authored
draft and `.igs` until acceptance/Save, and optional behavior across strict
payload/provenance consumers. The exact policy control refuses 33 jobs before
model qualification or queue mutation, ignores caller-supplied extra `maxJobs`,
and admits 32 under the same preparation as one group.

Six missing-entry/schema tests first failed, then passed after implementation.
A separate escaped-brace admission regression first reached qualification and
failed, then passed with explicit refusal before that boundary. Planner public
entry scaffold failed 12 tests before its implementation. Isolated semantic
mutations detected wrong per-iteration seed indexing (2 failed/11 controls
passed) and dropped accepted seed behavior (2 failed/1 legacy control passed);
restored runs passed 13/13 and 3/3 respectively, with zero skips.

The first full run had 582 passes and one incorrect new-test assertion:
qualification defensively resolves the model twice, while the test demanded
exactly one resolver call. The observable contract is zero calls on refusal
and qualification on valid admission; the test was corrected without weakening
the queue/count/atomicity checks. Final verification over this dirty slice:

- `pnpm run app:test`: 583 executed, 583 passed, zero failed/skipped.
- `pnpm run typecheck`: prototype and app typechecks passed.
- `pnpm run lint`: passed after formatting the policy comment.
- `pnpm run app:smoke`: build and both native smoke suites passed, including
  Project Save/reopen, recovery and Results/Add/cancellation. These native
  scenarios still use controlled inference, not the new renderer Generate.

The build emitted the existing large-chunk warning and Electron emitted
Wayland/Vulkan diagnostics; both smoke processes exited successfully. No
prototype UI or Python implementation changed, so prototype UI tests and real
inference throughput are not evidence claimed for this slice. Implementation
review is source-aware, not blind; the author inspected the planner boundaries,
all strict serializers, every-request transport checks, group close/document
fences, scratch cleanup and accepted metadata ownership. Renderer Generate,
persisted dynamic options, full conditioning, Smart Patch and installed
Linux/NVIDIA release qualification remain gaps.

A second source-aware agent review found no concrete blocker in prepared
admission or strict metadata propagation. It confirmed that all varied envelope
checks precede durable queue writes; the common temporary scratch lease can
already exist at that point and is removed on rejection. No claim of a blind
or renderer-level review is made.

The capacity harness's own semantic mutation changed reported seed `index` to
`index + 1`: the actual Results seed assertion failed (expected 0, observed 1),
child and parent exited 1, and owned bulky data was removed. Restoring it gave
two passing outcomes: one completed case and the count-65 refusal control.
Its commands, patch and structured failure/restored results are in
`/home/user/.codex/artifacts/imagegen-studio/batch-capacity-harness-mutation-2026-09-30/`.
Production test logs and planner/provenance red/green/mutation artifacts are
collected in `/home/user/.codex/artifacts/imagegen-studio/phase-2b-batch-planning-2026-09-30/`.
