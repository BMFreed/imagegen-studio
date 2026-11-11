# Remove a missing Project from Home

Base `d38ef8fc383f1a94a8fa051fb4a356569ac422d5`, clean master/origin at start.
PP-001 Home and PP-007 ownership contracts: a genuinely missing file can be
forgotten from the derived Home index without deleting its file or recovery.
Risk: high at the IPC/SQLite lifecycle boundary, bounded to derived metadata.

## Fresh source and adaptation

Invoke checkout clean, `4875d96531ca6712b288f6e660fcbb34143408c1`.
Fresh implementation/callers:

- `invokeai/frontend/webv2/src/workbench/projects/library.ts:229` guarded deletion;
  `projectLifecycleLocks.ts`; `useProjectActions.ts:238` and
  `launchpad/projects/useProjectCardActions.ts:61` callers.
- `workbench/projects/api.ts:357` → `invokeai/app/api/routers/projects.py:425` →
  `invokeai/app/services/project_records/project_records_default.py:451` transaction.
- `workbench/projects/projectFile.ts:283` and `useProjectFileActions.ts`: import
  creates a new identity, so it cannot implement identity-preserving relink.

The frontend paths above share `invokeai/frontend/webv2/src/`. Invoke's full
DELETE removes the authoritative Project and prunes operational/session records.
That mechanism cannot be copied whole into cache-only forgetting. The missing
mechanism and reason were reported before implementation. Adapt its lock,
transaction and refusal pattern through existing Studio `removeWorkspace`,
`withProjectPathLock`, catalog channel lock and generation maintenance fence.
Locate/Relink remains a separate consumer of existing relocation identity owners.

## Complete finite path and invariants

Home missing row menu → captured confirmation → opaque ID/explicit true preload
request → exact Main arity/ID/confirmation validation → catalog lock → existing
Project/generation maintenance fence → Service closed-operation guard → indexed
path lock → SQLite transaction → fresh filesystem absence → exact row deletion
→ final absence/parent/closed guard → committed success → local removal/Refresh.
Errors retain the confirmation and row. Cancel sends no removal request.

Only non-Trash, non-pending, closed `missing` rows in an available registered
workspace expose the action. Read-only but readable workspaces are eligible;
this action writes SQLite only. Renderer checks are advisory. Main rejects open
tabs, unfinished generation/results/handoff through existing fences. Service and
repository independently reject absent index rows, pending lifecycle and stale
health. The direct canonical workspace must be a readable/searchable directory;
missing/inaccessible/symlink/unsafe parents refuse. Fresh `lstat` must fail with
exactly ENOENT; existing packages, corrupt files, directories and dangling
symlinks refuse. Parent access is checked before and after absence, then again
after deletion so failures roll back the transaction.

Only `project_index` is deleted; its derived accepted-result index cascades.
Location bindings/retired keys, queue/receipts/frozen input, shadow/recovery,
workspace registration and all filesystem bytes survive. No suppression table,
schema, document/provenance or protocol-version change. A restored file is
rediscovered by ordinary scan with its retained stable key and recovery. Cached
file fingerprints can change with filesystem ctime even for identical bytes.

App-owned scan/Open/Create/Import/lifecycle operations serialize through existing
catalog/path gates. External restoration after the final check can transiently
race cache deletion; no file or authoritative identity is removed and the next
scan rediscovers the file. This is not an atomic lock against external programs.
No arbitrary path is accepted from IPC. Raw permission errors are not treated as
missing. A failed transaction leaves the original index/derived rows intact.

## Verification plan and bounds

Real SQLite/IGS tests cover missing success and rediscovery, nonempty retained
identity/retired/terminal queue controls, real verified recovery shadow, stale
missing with any present entry, unavailable/symlink parent, readonly success,
open refusal and post-delete guard/reappearance rollback. Existing neighbors
cover relocation/Trash/index/recovery. A semantic mutation of fresh `lstat` must
fail the real stale-missing consumer with neighboring missing success GREEN.

Native `--forget-only` uses Main-created packages, preparation while physically
closed, actual UI confirmation/Cancel/error, restarted absence and exact restored
same-ID rediscovery/recovery. OS picker is controlled; Main/IPC/storage are real.
Recovery preparation is not crash qualification. No ML/installed worker evidence.
UI follows current Vue/Naive prototype/actions and existing modal conventions;
skills provide bounded visual self-review, not a redesign.

No new numeric product limits. Existing ID/filename/schema/SQLite and filesystem
rules apply. Operational test envelopes: checks4GiB/600s/zero swap serial; native
launcher2GiB+owned app2GiB, controller600s/lifetime300s. Initial artifact root29GiB
(shared17/runs12),63GiB free disk; GPU9,066MiB used/6,953MiB free. No GPU users
are stopped. RUN `runs/home-missing-remove/20261111`, short TMPDIR `t-hmr-1111`.
No runtime/model copy or SHARED dependency. Exact own fixtures are archived and
audited before disposal; final lifecycle records actual cleanup/dependencies.

Remaining Home consumers: identity-preserving Locate/Relink, selection/Inspector,
full saved preview/grid/zoom/pan/resize. Models removal/contexts, exports,
release/runtime/update/compatibility, visual/capacity and full MVP gates remain.
PP-001/005/007/008 stay **Пока не обещать**.

## Executed evidence

ROOT executed **211 affected Main/shared PASS, zero fail/skip** (`affected-r1`),
including final focused25 PASS (`focused-r6`), index/Service, workspace lifecycle,
Move/Rename, Trash, preview and preload neighbors. TypeScript/Vue (`typecheck-r1`),
four full lint partitions (`lint-r1`) and app build (`build-r1`) passed. Full lint
keeps the single unchanged parser exclusion
`scripts/qualify-installed-regional-init.mts`; build keeps the existing renderer
chunk-size advisory. No prototype files changed. Python/inference and unchanged
large release/migration matrices were not run.

The integration preservation control uses real closed Rename for a nonempty
binding, a separate real managed permanent-delete fixture for a nonempty retired
key, a nonempty terminal queue row (storage-only opaque payload), actual saved
accepted provenance and verified `ProjectShadowStore.write`. Exact snapshots
survive removal; saved bytes and recovery survive rediscovery. The accepted
derived catalog rebuilds with current file fingerprint after external rename
changes ctime. This is not executable queue/inference evidence.

`native-r2.json`: **11 checks, three normal physical lifetimes, six screenshots,
zero page errors**,10.796s under the finite resource envelope. Genuine Main-created
packages, public row menu/confirmation Cancel, confirmation=false/path injection/
extra-arity refusal, unavailable workspace, actually open missing Project and
file reappearance during confirmation are exercised. Refusal retains the dialog,
index, exact package/shadow and observed operational tables. Explicit retry removes
the row; a new lifetime and Refresh keep it absent; exact file restoration and
Refresh rediscover the same key with `Recovery available`. Native observed queue
tables are empty controls; nonempty operational preservation is the integration
test above. Recovery is prepared while physically closed, not a crash experiment.

ROOT opened all six final screenshots at900×620 and1440×900: missing row, readable
confirmation, unavailable workspace, visible real refusal, removed and rediscovered
rows. Bounded UI self-review found no material new layout defect; no full WCAG,
performance, relink or complete Home acceptance is claimed. Independent source
review is CLEAN/READ_FINISHED; it did not execute runtime/tests.

One isolated mutation replaces fresh `lstat` with simulated ENOENT. The restored
existing-package case reaches the actual removal consumer and fails with
`Missing expected rejection`; the neighboring genuine-missing preservation case
stays GREEN. **Six selected executions = five GREEN and one intended semantic RED**,
exit0/1/0. Root/isolated source restores byte-for-byte. Setup/OOM/timeout failures
are not semantic evidence.

Diagnostics retained separately: focused-r1/r2 had an invalid authored shadow
document (strict schema rejected `generationBbox`; corrected to `primaryBbox`);
r3 assumed ctime-based fingerprint equality across a real rename; r4 expected a
retired key from Rename rather than permanent deletion; r5 captured accepted cache
before explicit Refresh after Rename. Final tests use actual owner semantics and
nonempty controls. These are test-preparation/assertion corrections, not product
failures. Native-r1 used plain node for a harness importing typed source and failed
module resolution before app launch; actual native-r2 uses `pnpm exec tsx`.
The previous browse reproduction command is corrected to that same loader.

## Retention and reconstruction

RUN retains `qualification-summary.json`, bounded logs/resource reports, native
screenshots, `mutations.json`, `source-reviews.json` and final delivery proof.
`final-source.json`/tar plus `delivery.patch` identify exact staged source;
`qualified-bundles.json`/tar preserve actual checked bundle bytes. All owned raw
fixtures and isolated mutation source are inventoried and archived in
`payload-inventory.json` / `retained-payloads.tar.gz`, recording types, paths, sizes,
SHA and symlink targets without following them. `physical-exit-recheck.json`
checks exact PID/start identities and groups; `final-retained-audit.json` records
the independent bytes/reports/current-exit review, not repeated runtime.
`artifact-lifecycle.json` records actual disposal, dependencies and reclaimed
allocation; read those final outcomes rather than assuming cleanup from a plan.

Fresh reproduction: build the recorded source, re-inventory resources, then run
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT --forget-only`
under the bounded controller and a new short owned TMPDIR. Historical raw paths
may have been disposed. For inspection, reconstruct archives into a new owned
artifact path; do not resume an old report. Mutation node_modules is a workspace
dependency symlink, not an ML/runtime copy. All SHARED/models and foreign data
remain outside this run's disposal set.
