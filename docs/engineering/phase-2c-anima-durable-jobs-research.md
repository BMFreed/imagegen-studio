# Phase 2c: Anima durable jobs, Retry and operational results

## Scope and baseline

Continue the authorized roadmap on clean `master` `36ebf37`, 2026-10-05,
after [captured Main preparation](./phase-2c-anima-main-preparation-research.md).
The next boundary stores concrete Anima jobs, restores and retries their exact
inputs, dispatches them through the qualified existing worker transport, and
publishes verified local temporary candidates. Public Project Generate and
portable accepted Anima provenance stay closed until their subsequent integration.
There is no Python, numerical solver, wire-version or runtime-installer change.

Sources: [PP-004/005/007](../product-promises.md),
[frozen queue jobs](../features/queue-manager.md#frozen-job-rule),
[temporary results](../features/project/generate-mode/generation-results.md),
[provenance](../features/project/generate-mode/generation-provenance.md),
[roadmap](../specs/01-implementation-roadmap.md),
[research](./research-protocol.md) and [review](./review-protocol.md).

Risk is high: migration, frozen job serialization, atomic admission, candidate
receipt/manifest recovery, seed ownership, cancellation and disposable filesystem
cleanup all cross persistent boundaries. Baseline `pnpm run app:test` passed
1401/1401 tests with zero failures/cancellations/skips (`baseline-app-test.log`).

## Confirmed paths and selected design

- Main preparation already owns the exact Project/raster/seed/bundle capture.
  Admission consumes its complete compiled batch during the private request lease;
  it does not reread a mutable Project or Library Default.
- SQL migration 0013, queue schemas, queue-manager projection and staging parser
  independently admit only Illustrious. Add explicit Anima operation/context
  variants and a preserving migration. Existing Illustrious payloads and APIs
  remain valid; do not rename old durable kinds or widen Normal preparation.
- Per-item durable context contains captured IDs/revision/bbox/target, concrete
  raw prompt text, exact linked bundle, ordered verified enabled LoRAs, complete
  configured LoRA rows and authored seed policy/resolved seed/seed behavior/native
  sampling scalars. It retains explicit neutral `cfgRescale=0` and `Auto` policy
  when present. It omits the full draft, raw dynamic templates, inactive SD pair
  and disposable request/output paths. Compiled signs and the full versioned
  native plan are stored once in the worker job.
- Strict parsing after reload recompiles both concrete signs and the native plan
  using the actual existing compilers and compares every interpretation/resource
  projection. Retry copies the original payload JSON and target bytes; no new
  Random draw, Reuse cursor read or current-draft substitution occurs.
- The transport has four explicit request tags. Anima wire contains cleaned text
  and weighted Unicode spans, not raw authored weighting syntax. Client validation
  must validate the compiled representation directly; compiling cleaned text would
  lose the weights. Family capability checks require worker 0.11 and all five
  Anima strings in addition to the existing base qualification.
- Dispatch requalifies the captured exact bundle and adapters. Native progress
  must match the frozen plan's actual total, including clipped img2img, Heun and
  zero-strength execution. Keep request/event identity, monotonic progress,
  cancellation and confirmed process-exit ownership.
- Operational dispatch owns `anima-request-*/result.png`. The current ephemeral
  preparation has indexed outputs and is not itself a durable dispatch stage.
  Staging selects the exact permitted prefix from the parsed operation, verifies
  the PNG and completion receipt, then atomically completes SQL and the scoped
  actual-seed cursor. Temporary results remain local and independent of `.igs`.
- Queue Manager must describe native Anima methods without inventing SD sampler,
  scheduler or prediction type. A family-specific metadata branch can preserve
  the approved detail layout. Accepted provenance must explicitly refuse Anima
  before any handoff, document mutation, sibling cancellation or staging discard.

Read-only source maps and source hashes are in `design/`, `dispatch/` and
`staging/` under the artifact root. They are source-aware, not blind audits.
No new product question was found for this internal boundary.

## Capacity evidence and alternatives

Before implementation, `design/sizes.json` measured actual preparation,
weighting/native compilers and the actual 64 KiB request builder, using tiny
controlled resource identities. Durable and manifest shapes in that probe are
proposed serializers, not evidence that a production serializer has run.

At 200 Heun steps with a concrete 16 KiB backslash-heavy prompt in each sign,
the accepted worker line is 49,509 bytes. Duplicating the full preparation draft
and worker job produces a 185,691-byte proposed payload, above 128 KiB. The
compact proposed context produces 119,322 bytes. Quote-heavy and Unicode controls
exercise different escaping costs. Keeping the full draft is therefore rejected.

Thirty-two compact payloads from that control produce a proposed escaped session
manifest of 7,014,972 bytes; 64 produce 14,029,756 bytes, above 8 MiB. Cap32 alone
is not a capacity proof: long configured disabled-resource names can overflow an
individual payload or aggregate manifest even when the worker line fits.
Actual production serialization and whole-batch preflight must verify both
ceilings before any files/rows become visible. No limit increase is planned.

| Parameter            | Existing owner                         | Behavior and evidence                                                                                   |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Concrete jobs        | `generation-batch-policy.ts`           | At most 32; overflow refuses, never truncates jobs                                                      |
| Worker request       | `anima-worker-request.ts`              | 65,536 UTF-8 bytes including newline and real disposable paths                                          |
| Durable payload      | `generation-queue.ts`                  | 131,072 UTF-8 JSON bytes per item; strict reload validation                                             |
| Input manifest       | `generation-queue.ts`                  | 4,096 bytes; target size/hash and payload hash                                                          |
| Target PNG           | Existing queue/request/PNG policy      | At most 32 MiB; exact sRGB/profile/hash/size/alpha                                                      |
| Session candidates   | `generation-staging-limits.ts`         | At most 64 retained candidates; not a guarantee that every maximum payload fits                         |
| Session manifest     | Same owner and staging serializer      | 8 MiB, including escaped nested payload JSON and wrapper metadata                                       |
| Native plan          | Existing flow compiler                 | Six methods, 1–200 authored steps, actual evaluations up to 399 for Heun; clipped img2img can have zero |
| Seed                 | Existing queue/receipt/cursor owners   | Uint32 including 0; only committed completion advances the document-scoped cursor                       |
| Managed files / peer | Existing ModelService / ready contract | Captured exact original bundle and signed ordinary adapters; qualified 0.11 Anima                       |

These are inherited data/compatibility limits. No minimum VRAM, GPU throughput,
trained quality, release-runtime support or free-disk guarantee is inferred.
Filesystem failures remain explicit; owned incomplete publication is removed or
kept behind existing uncertainty/recovery fences instead of guessed successful.

## Invariants, failures and verification

The finite operation set is existing Illustrious txt2img/img2img plus Anima
txt2img/opaque img2img. Native method completeness comes from the existing
six-method enum/compiler. Existing five queue statuses and receipt transitions
remain unchanged; unknown operations and malformed interpretations refuse.

| Trigger                                                   | Required observable result                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Invalid later item / payload or manifest overflow         | Whole batch refuses before visible rows/files; no truncated valid prefix                                  |
| Concurrent caller/draft/ready edits after capture         | Stored concrete text, seed, resources, method and target remain captured inputs                           |
| Missing/changed bundle or adapter at Retry/dispatch       | Explicit refusal; no substitute model, new seed or partial result                                         |
| Invalid compiled spans/native grid after reload           | Parser rejects before worker handoff or candidate exposure                                                |
| Interrupted directory/SQL publication                     | Existing uncertainty fence/reconciliation preserves whole batch or removes only unregistered owned files  |
| Cancellation/close/late done/progress                     | Confirmed exit and status/receipt CAS prevent late publication or cursor advance                          |
| Crash after candidate manifest before completion          | Existing receipt recovery completes exactly once or keeps invalid output hidden                           |
| Queue pruning/restart                                     | Valid independent candidates and document-scoped cursor survive; old-lifetime unfinished work is canceled |
| Foreign scratch prefix, symlink, changed PNG/profile/hash | No publication, cleanup only owned disposable files                                                       |
| Anima or mixed Anima/Illustrious Add                      | Explicit unsupported-family refusal before journal/document/sibling/staging side effects                  |

Use actual SQLite migrations/queue/staging/recovery and filesystem paths, actual
TS compilers and JSONL client lifecycle. At least one test enters real admission
and observes reload/Retry/dispatch/candidate completion. Controlled inference
response/pixels and tiny trusted checkpoint/companion profiles are permitted
collaborators but must be named; they do not prove trained inference or CUDA.
Use real PNG/profile validation and actual receipt-backed seed checks.

For meaningful tests state production boundary, observable invariant, neighboring
control and semantic mutation. Execute mutations in isolated copies with pinned
imported-source hashes, green baseline/restored controls and actual assertion
failures. Fixture/collection errors and interrupted waits do not count. Await
operation IDs or controlled barriers, not fixed sleeps.

Run focused tests, full application tests, typecheck/lint, changed-file formatting
and documentation links, fresh production build and relevant Electron smoke.
If the Queue Manager native branch changes, inspect its actual render and relevant
interaction state while preserving approved styles. No prototype UI is planned.
Update PP matrix/body and supporting contracts together without promoting public
Anima Generate, accepted storage or release readiness.

Artifacts:
`~/.codex/artifacts/imagegen-studio/anima-durable-jobs-2026-10-05/`.

## Outcome

Implemented the internal concrete Anima queue union, migration 0014 preserving
legacy attempts/receipts/indexes, atomic complete-batch publication, frozen Retry,
exact-family dispatch/JSONL progress and receipt-owned local staging/recovery.
Queue Manager projects the actual native method. The accepted factory returns
`PROVENANCE_MODEL_UNSUPPORTED` before mixed/Anima Add can mutate any owner.

Retry captures payload/bytes/ready before awaits, validates decoded mode and
required sRGB ICC, requalifies captured bundle/ordered effective adapters before
and after private target writing, then verifies the bounded stable target again.
The shared compiled-wire validator preserves weighted Unicode spans and
recompiles the native plan. Its real disposable envelope still passes 64 KiB.
The transport keeps legacy Illustrious capability adaptations separate.

The actual production serializer/preflight measured a 78,463-byte valid durable
payload: 64 raw strings total 5,021,632 bytes, below 8 MiB, but the **actual
JSON-escaped session manifest** correctly refuses 64 entries. The same 32-entry
control is admitted. Payload and session caps were not widened. This executed
case supplements the proposed-serializer design probe above; neither measures
GPU capacity or production quality.

Fresh baseline was **1401/1401**. Final full `pnpm run app:test` is **1491/1491**,
zero failed/skipped/canceled. `pnpm run typecheck`, `pnpm run lint`, and production
build passed. The prototype compiler newly reaches native compiler dependencies;
minimal record/index proofs satisfy its stricter options without changing solver
math. No prototype UI implementation was changed.

Four isolated mutation campaigns caught **40/40** semantic changes by behavioral
assertions: queue/payload/migration/DTO 16, dispatch/client 8, staging/acceptance
10, Retry/action owner 6. Each has a green baseline/restored run and byte/hash
guards. The first configured-cardinality mutant survived because the test lacked
a last-disabled-LoRA neighbor; that test was added and the final 16/16 campaign
passed. A mutation-driver anchor mismatch is retained separately and is not a
behavioral kill. Root Retry harness corrections used actual queue target paths
and the actual frozen requalification error; no production guard was weakened.

Tests own real SQLite/migrations, `.igs` package creation/readback, compilers,
queue/input publication, receipts, validated PNG/WebP, restart and tombstones.
Exact tiny-file resolver fixtures, controlled inference peers, controlled
admission/tab identity and failure hooks are named substitutions. They do not
qualify trained model headers, CUDA, public Generate or accepted Anima storage.
The mixed Add test uses the actual autosave coordinator/journal and genuinely
published both-family candidates, including reviewed unfinished siblings and an
unrelated session; refusal keeps every owner intact, then the consented
Illustrious control works.

Native Queue Manager checks use built Electron/preload/IPC and actual frozen
SQLite rows. All six labels and the absence of SD fields are checked, with two
viewport screenshots. T3 preview initialization returned `available:false`;
the existing native Electron harness exercises production IPC. Initial smoke
selector and dynamic-matrix fixture assumptions were corrected, rather than
changing product behavior. The script is included in `app:smoke` and available
as `app:smoke:anima-queue`.

Full `pnpm run app:smoke` passed all nine native scripts, including legacy
Illustrious Generate/Cancel/Retry/Add/Save/reopen/comparison, recovery/history,
external VAE/embeddings, Anima authoring refusal and the new queue detail path.
The 1380 × 900 and 900 × 620 screenshots were inspected; the smaller view scrolls
the detail pane to the native method and asserts it is in the viewport. Page
errors are absent. No additional inference child or public Anima admission was
introduced. Final evidence/source and build hashes live in `final-evidence.json`
under the artifact root, alongside the four mutation reports and full logs.
This is source-aware review/self-review; it is not a blind audit.
No product decision was needed. Next: immutable accepted Anima configuration,
family-specific comparison/public Generate, then installed Linux/NVIDIA runtime
and real-model/release qualification. Public readiness is not promoted.
