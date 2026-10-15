# Private durable Smart Patch execution

## Prospective scope and risk

Base `d05645392b99125a24cc10d80fa35bcdbd01d9ff`, clean master before this note.
High risk: common SQL running-slot/cancel/recovery, native protocol, filesystem
publication, shared receipt and actual-seed cursor. Supporting PP-007/008 and
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[results](../features/project/generate-mode/generation-results.md),
[queue](../features/queue-manager.md) and [storage](../specs/03-data-storage.md).
The previous [admission checkpoint](./phase-4-smart-patch-queue-admission-research.md)
creates durable jobs but intentionally excludes them from normal dispatch.

This slice adds a private dedicated executor for those actual queued inputs,
worker-confirmed seed, CPU world composition and independently durable typed
Smart Patch candidates. Public Generate/Retry/Results and variant acceptance,
portable provenance and release/GPU qualification remain closed. Normal request,
payload, staging discovery and Raster acceptance must remain normal-only.

Confirmed source path: private Python execution seeds Illustrious from parsed
policy.seed and Anima from immutable policy.sampling.seed; completion currently
returns RGB only. Existing world compositor needs generated RGB and final world
alpha, but its Main wrapper requires transient full Prepared planes. Common
processor cancellation owns only inference, so it cannot own a new CPU stage.
Normal staging embeds normal frozen payload and minimum8 geometry. Shared
receipt SQL is operation-neutral and already provides publication fences and
ordered actual seed; a separate typed candidate root can reuse those invariants
without leaking Patch into normal Raster acceptance.

## Chosen owners and invariants

- Add private seed-confirmation capability and correlated uint32 actualSeed from
  the exact parsed policy used by successful worker execution. Refuse old workers
  before ML and validate again outside concrete transports.
- Dedicated typed claim checks both Patch operations and the same global running
  slot CAS. Normal claim/advisory stay fenced to ordinary kinds. Reload verifies
  exact row/DTO/bundle and resource policy; no current draft may replace inputs.
- A separate private executor owns exclusive0700 scratch/0600 files, concrete
  inference request, CPU startup/request/readback and cancellation. Materialize
  fixed durable roles into scratch rather than sending durable file paths.
- Cancel/stop must drain both child owners and every admitted operation before
  acknowledging canceled or deleting scratch. Unconfirmed exit retains running
  slot, local owner and scratch. Late completion cannot publish after cancel.
- Extract a narrow RGB+final-world-alpha compositor. It preserves independent
  world/internal geometry, uses final alpha unchanged and rechecks actual RGBA
  bytes outside adapters. No fake Prepared object or rebuilt latent mask.
- Separate typed candidate/root under recovery/smart-patch-staging keeps frozen
  queue payload, actual seed, world RGBA and an independent exact final mask.
  Reserve shared receipt before files; fsync exclusive manifest before the single
  queue/receipt/cursor completion transaction. Lost acknowledgement/uncertain
  publication retains recovery ownership, never a failed/pruned running slot.
- Fresh candidate reload does not require queue rows or input bundle. Startup
  runs queue cancellation before both staging recoveries. Only exact APP_RESTART
  reservations may complete; USER_CANCELED cannot resurrect. Shared tombstones
  hide discarded sessions in both roots; normal discovery/acceptance never
  receives Smart Patch candidates.
- Private callers explicitly own this executor lifecycle; public controller and
  runtime drain are not enabled for Smart Patch in this slice. Hidden/locked
  admission policy from the previous checkpoint remains enforced.

Alternative rejected: adding Patch to normal payload/candidate union without a
separate target contract would silently route independent world geometry and
variants through Raster acceptance. Completing SQL before durable publication
would lose recoverable outputs. Closing only inference would release the slot
while a CPU child still uses scratch.

## Parameters and verification plan

Reuse existing bounds: concrete batch1..32, uint32 seeds including0/MAX,
internal /8 dimensions and existing4M-pixel ceilings, world sides1..2048,
PNG32MiB, frozen payload128KiB and staging64-candidate/8MiB ceilings. No new GPU
capacity claim or trained model download. Existing CPU/runtime and LaMa are
reused only when compatible and their cross-run dependency is recorded.

Use real SQLite/FS publication and fresh reload/restart, both families, tiny
non-grid world geometry, exact final alpha, bundle pruning independence,
receipt/cursor correlation, cancel during inference and CPU startup/request,
late completion, unconfirmed exit/retry and fault-injected publication windows.
At least one actual ProjectService capture/admission -> private executor -> CPU
world output -> durable candidate scenario must preserve document/.igs/history.
Declare literal inference collaborators; separately run native CPU mechanical
worker controls. Test meaningful semantic mutations with exactly causal RED and
neighbor GREEN, physical exit and source restoration. All heavy checks serial,
bounded memory/deadline, swap0; inventory before heavy use and compact handoff.
Update PP bodies/matrix and roadmap together without raising public readiness.

## Implementation and observed evidence

Verified dirty working tree over the base above on 15 October 2026. This is
self-review with delegated owner reviews, not a blind audit. New Main owners are
[SmartPatchGenerationProcessor](../../src/main/projects/smart-patch-generation-processor.ts)
and [SmartPatchGenerationStagingRepository](../../src/main/projects/smart-patch-generation-staging.ts).
[GenerationOrchestrator.createSmartPatchExecution](../../src/main/projects/generation-orchestrator.ts)
composes the actual queue/model/scratch owners into one private handle. It captures
worker methods/ready before awaiting admission, waits the enqueue barrier and
checks recovered repositories before dispatch. The private caller owns the
inference lease and must await run/stop before Project/runtime close. Existing
public controller/drain does not invoke this handle.

The executor requalifies only the selected concrete item's frozen resource and
prompt policy; sibling jobs remain pending. It materializes independent scratch
inputs, invokes native RGB execution and CPU world composition, then publishes
the exact world image and an independent final numeric mask. Successful CPU
child exit precedes publication. Shared SQL receipt reservation precedes files;
durable manifest precedes the single queue/receipt/cursor transaction. Typed
candidate reload needs neither the terminal row nor its pruned input bundle.
The candidate is structurally incompatible with normal Raster staging; no
normal result/provenance union or portable schema was widened.

| Boundary                     | Executed evidence and limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real Main entry point        | Two actual ProjectService capture → orchestrator admission/private dispatch → tiny native RGB → actual CPU JSONL world output → durable candidate → terminal prune/fresh reload cases, one per family. Document, `.igs`, shadow and accepted history stay unchanged; receipt and actual-seed cursor advance exactly once. Native random tiny CPU models are mechanical evidence, not trained-model quality or installed/GPU parity.                                                                   |
| Processor ownership          | Both families use real SQLite/FS and an actual source CPU child; the RGB collaborator is explicitly literal. Cancel during inference, CPU startup and admitted composition/readback cannot release the SQL slot or scratch early. Held work is independently released after the assertions; physical child exit alone is insufficient. Unconfirmed physical exit, including synchronous startup failure, retains ownership until explicit retry. Replaced scratch directory retains foreign contents. |
| Shared running slot          | Two repositories synchronize ordinary and Smart claims after their preliminary reads; only one final SQL CAS may acquire the global running slot. Normal dispatcher/advisory/readers remain normal-only.                                                                                                                                                                                                                                                                                              |
| Durable publication/recovery | Actual bytes and final alpha are rechecked before reservation and after fresh reload. Cases include uint32 zero/MAX, wrong legal seed, wrong truthful PNG alpha, stale/canceled owner, external nominated root, hardlink/symlink/mode rejection, partial publication, manifest-first APP_RESTART, lost acknowledgement, transaction rollback, USER_CANCELED refusal, 64-candidate ceiling and readiness gate. Normal discard tombstones hide both stores; corrupt/foreign members remain retained.    |
| Narrow world composer        | Six actual CPU JSONL cases include independent world7×5/internal64×64 and world1×1 geometry, zero-alpha RGB, pre-await aliases, truthful wrong alpha, internal-size and staged-mask mismatch. The wrapper needs only RGB and the final mask, not a fabricated Prepared object.                                                                                                                                                                                                                        |
| Worker protocol              | Both families confirm seed0/MAX; wrong/missing/invalid seed and old private capability are refused. Seed comes from the exact parsed execution policy, not a renderer echo. Separate adapter-independent checks also reject a wrong seed.                                                                                                                                                                                                                                                             |

Final focused command covers staging, processor, world composition, private
worker client, bootstrap, queue and existing orchestrator tests: **106 PASS,
0 failed/skipped**. The actual Main/native pair through the final composition
adds a separate **2 PASS, 0 skipped** run. These overlap the earlier regression;
their counts must not be summed as distinct tests.

Broader affected TS regression: **2480 PASS, 0 failed/skipped**, 156 files,
275.985 seconds. The native Main pair, both typed owners and ordinary generation
regressions are included. This run preceded the final private orchestrator
factory; the final106+2 and typecheck verify that narrow composition change.
Python execution/protocol/target-composition regression: **97 PASS**, including
tiny native family execution and seed boundary cases; 14 existing Diffusers /
NumPy deprecation warnings, no failures. No new trained weights or ML environment
were downloaded/copied. Existing compatible source CPU runtime and the shared
LaMa dependency were reused; this is not installed-runtime qualification.

## Semantic sensitivity and review corrections

Five isolated mutations each produced exactly one causal assertion RED and one
neighbor GREEN, no skipped/collection/import/timeout/OOM failure:

| Mutation                                          | RED observation                                                                 | GREEN control                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Accept another valid uint32 seed                  | Correlated valid RGB with the wrong seed no longer rejects.                     | Exact MAX completion still succeeds.                                      |
| Remove typed claim's final global-slot CAS        | Synchronized ordinary/Smart claims acquire two slots.                           | Lost batch acknowledgement still returns the exact committed rows.        |
| Omit drain of admitted CPU work before cancel ACK | Cancel releases the SQL slot while the held composition/readback is still live. | Successful world publication and independent reload still complete.       |
| Remove final completion transaction               | Fault before commit no longer rolls back queue/receipt/cursor together.         | Lost completion acknowledgement still returns its single exact candidate. |
| Omit actual RGBA/frozen-alpha equality            | A valid PNG with a truthful new hash but wrong actual alpha is accepted.        | The original candidate survives input pruning.                            |

Each probe used hidden isolated source copies with verified import routing.
Original source hashes remained identical before/after every case; all copy
readers had independently confirmed physical exit before copy disposal. The
final unmutated focused106+2 above supplies GREEN controls for the same source
hashes. Probes do not claim coverage of every possible publication fault.

Review tightened preclaim baseline/Anima capability gates, independent seed
checks during publication/reload, parent directory fsync and synchronous CPU
startup ownership. Scratch base may be owned canonical0775 under the established
contract; world-writable bases refuse. Every operation remains0700 with0600
files. Captured dev/inode/path ownership is checked before consumption and
recursive cleanup; an exchanged directory is retained, never swept.

Initial checks found test-fixture problems: widened ICC literal/readonly request
assignment, then using the authored-mask encoder for an intentionally empty
numeric contribution. These were corrected without weakening production checks;
they are not counted as semantic RED. Later typecheck, focused and regression
runs above are the accepted evidence. Final Ruff format-check also found two
format-only test spans; formatting was applied, then format, global Ruff,
basedpyright and the same97 Python checks passed again. The initial refusal is
retained as static-check evidence, not a production failure or semantic RED.

Required checks: `pnpm run typecheck`, `pnpm run lint`, `pnpm run app:build`
all PASS. Global worker Ruff and basedpyright PASS (0 type errors/warnings),
changed Python format-check PASS. The built Main bundle contains the private
orchestrator handle, dedicated processor and seed-confirmation gate. No
prototype/Vue/layout files changed, so prototype visual tests were not run;
this slice does not claim a new public UI or installed-GPU scenario.

## Remaining scope and local artifacts

Next finite owner is immutable Smart Patch variant acceptance, including Add
permission recheck, changed-input outdated status and missing-target orphan
handling. Public Generate/Retry/Results, lifecycle drain/UI wiring, portable
variant provenance and installed/GPU release qualification remain open.
Queue-owned bundle pins remain process-local; fresh publication UUIDs prevent
cross-operation replacement, not arbitrary multi-process writer support.
PP-007/008 bodies and matrix retain «Пока не обещать».

Raw commands, TAP/Python logs, bounded process reports and mutation/restoration
summary are retained at
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-queued-execution/20261015-execution/`.
Limits: serial4GiB for TS/native regression and mutations,2GiB typecheck/build,
swap0, finite180/300-second deadlines. No concurrent ML runs or model copies.
Final required static/build checks and cleanup are recorded below after exit.

Final cleanup independently confirmed all bounded child groups empty and
MainPID0, mutation source hashes unchanged and hidden copies absent. Removed
only this run's `pytest-tmp`, `pytest-final` and controller `__pycache__` after
that proof: **54,693,888 allocated bytes reclaimed** (about52MiB;50,709,793
logical bytes). Retained compact run evidence is about1.02MiB. Artifact root is
about27.5GiB, shared pool26.2GiB, runs1.29GiB, with42.5GiB free. The runs total
exceeds the1GiB evidence soft budget: the largest existing cap qualification
sets184/129MiB remain contract-linked raw evidence and were not presumed idle
disposable payloads. The lifecycle records this exception and release condition
(consolidation when their owning qualification/reproduction no longer needs raw
data). No broad sweep was performed.

Preserved existing source `.venv`, the one shared runtime/catalog and its exact
LaMa file/companions for later installed/GPU gates; reuse is recorded on both
sides of the dependency. Raw payload disposal is explicit in `cleanup.json`;
logs, fixture descriptors, commands, physical-exit/restoration and final source
hashes remain compact. No user project, original model, ordinary app data or
global cache was touched. Final delivery revision is recorded after commit/push
in the run's `delivery.json`, not implied by these local checks.
