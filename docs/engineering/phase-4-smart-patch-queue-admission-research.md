# Smart Patch durable queue admission

## Prospective scope and risk

Base `112c08124a10201e014523178c244cc62d2c3500`, clean master.
Supporting promises PP-007/008 and the
[Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[results](../features/project/generate-mode/generation-results.md),
[queue](../features/queue-manager.md) and
[storage](../specs/03-data-storage.md) contracts apply. The previous
[durable input owner](./phase-4-smart-patch-durable-input-research.md) prepares
one shared frozen pixel bundle for1..32 concrete items.

This high-risk slice adds actual private pending Smart Patch jobs to the common
SQL queue, atomic batch admission, exact reload and bundle ownership through
cancel/restart/terminal pruning. It deliberately keeps execution closed: existing
normal dispatch must skip both new operation kinds before runtime acquisition,
verification and claim CAS, including when an ordinary neighbor can run.
Normal payload unions and target.png readers remain normal-only. Ordinary Retry
and candidate publication explicitly refuse the new kinds.

The alternative of routing Patch through ordinary IMG/OUT is rejected: those
schemas couple world bbox/output to /8 processing dimensions and lose independent
latent KEEP/world GENERATE/source ownership. Adding a pending kind without
dispatch filters would also turn a valid private job into a failed ordinary one.

## Ownership and invariants

- Migration expands operation CHECK to Illustrious/Anima Smart Patch while
  preserving existing rows, receipts, cursor, indexes and normal constraints.
- Strict separate queued DTO binds queue-owned bundle ID, exact manifest hash,
  item index, frozen context and one concrete family item. Reload compares the
  row, DTO and actual bundle bytes, never current authoring or current defaults.
- Admission makes one independent queue-owned copy per batch in a separate
  namespace; caller-owned prepared bundles can be discarded independently.
  Jobs share that copy. Atomic SQL insertion never admits a prefix.
- Requalify exact resource/prediction/noise metadata before admission and before
  commit without repeating CPU preparation or reading a checkpoint per item.
- Current Project/document/target and unlocked+visible permissions are checked
  synchronously at admission boundaries. Later authored edits never replace a
  frozen job. Public Generate remains unavailable until execution/variants ship.
- Lost commit acknowledgement is resolved by exact row-set readback. Unknown or
  partial commit retains bundle ownership and fences the Project.
- Cancel/shutdown/restart preserve the common state machine. Startup cancels
  old unfinished jobs, never replays them. Receipt/cursor/candidate are untouched.
- Delete/prune may reclaim only an exact queue-owned bundle with no remaining
  SQL reference. Failed/uncertain cleanup retains data. Unknown/incomplete or
  corrupt reservations are not swept as though ownership had been proven.

Metadata-only queue/action readers understand the new kinds without reading
pixels. Existing candidate/staging/acceptance/provenance remain normal-only;
no Smart Patch is represented as an ordinary Raster candidate. Native dispatch,
CPU-child cancel ownership, worker-confirmed actualSeed, durable world candidates
and immutable variant acceptance remain subsequent owners. No `.igs`/document/
history/shadow or public readiness change is included.

## Verification plan

Use real migrated SQLite and filesystem/bundle repositories. Verify migration
preservation, both families and independent world/internal dimensions, one shared
queue-owned copy, reload after caller discard/new repository/process, exact
metadata/PNG refusals, batch rollback/lost acknowledgement, resource drift,
cancel/restart/prune sibling ownership, deferred cleanup and ordinary neighbor
dispatch. Include a real ProjectService/captured CPU preparation into the new
orchestrator admission; late hidden/locked/missing/changed document must refuse.

Sensitivity probes target atomic admission, normal-dispatch exclusion and
last-reference cleanup or frozen binding, with causal RED and neighboring GREEN.
Run appropriate affected regressions, full typecheck/lint/build and review at
high-risk tier. Heavy runs remain serial and bounded in memory/time with swap0;
do not download/copy trained models or environments. Artifact inventory and
cleanup evidence will be recorded before/after execution. Public statuses and
matrix rows must describe the same private boundary.

## Executed behavior and evidence

Implementation self-review covers the dirty tree based on112c081 above. Separate
read-only cross-reviews checked the orchestrator/current-target permissions,
resource requalification, SQL/filesystem ownership and documentation. This was
not a blind audit or an installed GPU qualification.

The15 new queue cases pass with actual migrated SQLite and independent on-disk
bundles: both families, exact reload after caller discard, ordinary neighboring
claim, rollback, lost acknowledgement, unreadable committed/rolled-back outcome
fencing, shared sibling lifetime, corrupt retention, same-SHA resource-policy
refusal, late owner refusal, startup GC and caller/method snapshot isolation.
Queue fixtures declare literal real PNGs and tiny exact-file catalog collaborators;
the production DTO/resource comparison, SQL and filesystem owners are the
subjects, not trained-model installation or image quality.
The migration test preserves30 existing ordinary rows across all six operations
and five statuses, candidate receipts, seed cursors0/MAX, exact UTF-8 payload
bytes, indexes and prior migration identities across reopen. Older migration
tests now select only migrations before their historical target, so future
CHECK expansions cannot accidentally change their baseline.

Five new integration cases start with real ProjectService and captured CPU
preparation. Both family batches reach private orchestrator SQL admission and
fresh repository reload while saved `.igs`, live document, shadow/history,
receipt and cursor remain unchanged. Hidden/locked changes after bundle
publication refuse the entire batch and reclaim its own unused copy. A target
hidden immediately after commit causes exact new-batch cancellation; a later
permitted neighboring batch remains independent. Current wrong document or
non-Patch target is refused synchronously. These cases do not run diffusion;
existing native execution/world-output tests are regression controls.

The153-file affected run completed2422 tests:2421 passed and one newly added
controller test failed because it assumed the shared fixture admitted one row
instead of two. It was corrected to compare every existing row and a frozen
source Retry; the entire controller file then passed80/80. Thus all affected
cases are covered by the full run plus that file rerun, with no remaining
failure, skip or cancellation. The earlier focused118-case run also retained
two late-permission test setup failures (the hook ran before publication) and
two deliberately unavailable LaMa controls. The final affected run supplies the
existing shared LaMa path and passes those controls, all five new integrations
and the corrected late-refusal timing. These earlier setup/fixture failures are
retained evidence, never semantic mutation REDs. Initial typechecks found only
readonly fixture assignments; whole-object replacements resolve them. After
mechanical lint fixes, the full core selection passes168/168 and all five Main
integrations pass again with no skips. All four mutation pairs are repeated
successfully against the final formatted source, with the earlier proof retained.

Four isolated semantic probes each produce exactly one causal assertion RED and
one neighboring GREEN; no import, setup, resource, cancellation or skip failure
is counted. Original source hashes remain unchanged, physical cgroup exit is
confirmed before hidden copies are removed:

| Mutation                             | Causal RED                                                            | Neighbor GREEN                             |
| ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------ |
| Remove SQL transaction               | Final refusal no longer rejects/rolls back the batch                  | Complete lost-ack readback                 |
| Remove normal claim operation filter | Valid Smart Patch is changed from pending to failed by normal parsing | Complete lost-ack readback                 |
| Ignore remaining bundle references   | First sibling deletion removes shared input                           | Corrupt unverified bundle remains retained |
| Remove exact DTO/bundle equality     | Crossed manifest hash/item is accepted                                | Complete lost-ack readback                 |

Commands, full TAP, resource reports, affected file list and mutation graph/
source/restoration proofs live under
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-queue-admission/20261015-queue/`.
The mutation report is `queue-mutation-3b98f81112-summary.json` with
`complete=true`, `originalsUnchanged=true` and all four pairs confirmed.

## Operational limits and next owners

- The common normal payload union, target PNG readers and candidate/acceptance
  schemas remain normal-only. New queue metadata exposes no model/input paths;
  public Retry refuses both Patch kinds before frozen-file/runtime access.
- The public Smart Patch Generate path remains unavailable. This slice is real
  local durable admission/reload/cancel, not a runnable public ML feature,
  accepted variant or Invoke-quality/parity claim.
- Active bundle pins are process-local. Safety also relies on fresh UUID bundle
  creation and no adoption of existing bundles by Smart Patch Retry. Electron
  Main remains the sole writer; future cross-process writers or bundle-adopting
  Retry require shared ownership coordination.
- Unknown/partial/corrupt bundles are retained rather than speculatively removed.
  This deliberately does not provide automatic crash-window repair or a sweep
  of caller-owned prepared bundles.
- Typed Smart Patch dispatch must add worker-confirmed actualSeed rather than
  treating the scheduled seed as confirmation. A single cancellation owner must
  drain inference and CPU child startup/request/readback/physical exit before
  acknowledging cancellation or releasing scratch.
- Durable world candidates must own copied final contribution/context after
  terminal queue input pruning. Existing normal candidate geometry cannot be
  widened to pretend independent Patch world and processing sizes are equal.
  Future acceptance must add immutable variants, outdated-target tracking and
  the same current unlocked+visible checks; ordinary Raster acceptance is not a
  substitute. Queue UI operation labels also need a target-aware consumer before
  public Patch admission is enabled.

## Final checks and artifact handoff

Full `pnpm run typecheck` (both Vue projects), `pnpm run lint` and
`pnpm run app:build` pass after the mechanical ordering/braces/assertion fixes.
No Vue layout or Python source changed; browser/prototype interaction and a
standalone Python suite were not rerun. Renderer Retry advisory behavior is
covered by its actual production helper and the Main controller regression.
Build retains the existing chunk-size advisory; it is not a failed check.

| Check                             | Memory/deadline | Elapsed seconds | Sampled peak bytes | Result                                                        |
| --------------------------------- | --------------- | --------------- | ------------------ | ------------------------------------------------------------- |
| Affected153-file run              | 4GiB/300s       | 254.156         | 1373745152         | 2421/2422; fixture failure resolved by controller rerun below |
| Full controller rerun             | 4GiB/180s       | 8.627           | 498274304          | 80 PASS                                                       |
| Final core after lint fixes       | 4GiB/180s       | 13.636          | 496504832          | 168 PASS                                                      |
| Final Project/CPU/SQL integration | 4GiB/180s       | 9.639           | 762167296          | 5 PASS                                                        |
| Full typecheck                    | 2GiB/180s       | 20.645          | 1812254720         | PASS                                                          |
| Full lint                         | 4GiB/180s       | 42.277          | 3865563136         | PASS                                                          |
| Electron build                    | 2GiB/180s       | 1.615           | 1184419840         | PASS                                                          |

All heavy checks ran serially, with swap0, CUDA hidden and CPU math threads1.
No OOM or watchdog termination occurred. Final semantic pairs ran against the
same source used by the final core/Main/static checks. Independent handoff
queries confirm22 owned bounded units have MainPID0 and empty cgroups; mutation
source hashes match and all hidden source copies are absent.

Artifact inventory before work: root28GiB/shared27GiB/runs1.3GiB, free44GiB.
The new run retains about1MiB of compact reports, commands, source hashes and
logs; it downloaded/copied no model/environment and created no bulky payload.
After process/restoration proof, its disposable helper cache was removed,
reclaiming36864 bytes. Existing historical GPU/fixture evidence in runs was
inspected (largest directories recorded in `cleanup.json`) and retained because
cross-run ownership has not been released. The artifact root remains below its
30GiB soft budget; the historical evidence excess is not expanded by a new bulky
copy. Shared runtime/catalog/LaMa dependencies remain protected for the next
Smart Patch dispatch gate, with the new use recorded in both lifecycle records.
`cleanup.json`, `verified-source.json` and `delivery.json` record the final
handoff; source/build/static evidence does not upgrade public PP readiness.
