# Locate a missing Project without replacing its local identity

Base `0433ab839e172cd4e1ad666978fd0ab97c813cce`, clean master/origin at start.
PP-001 Home missing-file contract and PP-007 document/recovery ownership. High
risk: authoritative location binding, SQLite operational paths and recovery reads.
No `.igs` write, move, Add, Save or automatic Open belongs to Locate.

## Fresh sources and adaptation

Invoke checkout clean, `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/frontend/webv2/src/workbench/projects/projectFile.ts:283`, caller
  `useProjectFileActions.ts:60`: import allocates a new ID and remaps state.
- `workbench/projects/library.ts:229`, `projectLifecycleLocks.ts`, callers
  `useProjectActions.ts` / `launchpad/projects/useProjectCardActions.ts`:
  guarded mutation, queue refusal and caller error handling.
- `invokeai/app/services/image_moves/image_moves_default.py`: mutation lock,
  `_complete_partial_filesystem_move`, `_reconcile_destination_subfolder`,
  `commit_database_updates`; `shared/database/queries/image_moves.py`:
  `repoint_image` / `repoint_moved_images`, and their route/service callers.

Frontend short paths share `invokeai/frontend/webv2/src/`; query paths share
`invokeai/app/services/`. Import cannot preserve this local identity, and Move
requires an existing source plus physical journal/witness. No direct `.igs`
Locate mechanism was found; this and the reason were reported before editing.
Adapt the guarded stable-name repoint through existing Studio relocation owner.
Its shared operational validation/repoint now accepts a narrow descriptor; no
fabricated source witness or journal authority is introduced for a missing file.

## Finite production path

Missing closed Home row → Locate Project → ID-only preload → exact Main sender/
arity/ID validation → catalog lock and existing Project/generation maintenance
fence → Service validates cached saved identity → trusted OS picker callback →
candidate/workspace checks → ordered source/target path locks → fresh package/
hash/witness and source absence → transactional index/binding/terminal-path
repoint → registry refresh → Home/workspace Refresh. Cancel returns false and
leaves the row; error remains visible in Home. Selection never supplies a path
through renderer IPC. No file operation follows a canceled picker.

Original workspace must be available/canonical/readable, original file freshly
ENOENT, and cached document ID/revision known. Candidate is a direct canonical
regular nonsymlink `.igs` in a registered readable workspace. Same-workspace
rename and another registered workspace are allowed; neither folder needs write
permission because only SQLite changes. Unregistered external files require
explicit Add Workspace or Import first. Workspace-folder Locate remains open.

Candidate fully validates through the existing package loader and matches saved
document ID/revision exactly. Stat fingerprint and whole-file SHA guard the read
through commit. The old index has no historical whole-file SHA: the candidate's
current hash does not prove equality to an unavailable historical ZIP. This is
explicit user selection of the same saved identity, not arbitrary version merge.
With retained recovery, its exact saved document base/committing hash provides
additional authority; stale/invalid/unreadable recovery refuses without discard.

Home scan commonly already indexed the externally renamed file. Only its unused
natural path-derived cache row may be adopted: ready/exact package fingerprint,
same saved identity, never opened, no binding/retired key, queue/receipt/acceptance,
lifecycle/relocation, seed cursor/discarded-session or recovery owner. Any actual
independent owner refuses. The cache row and derived accepted index are removed
inside the same transaction before repointing the original stable key. This
never establishes a historical owner for the discarded natural key; no tombstone
is needed for it. The original binding, terminal queue/receipt location columns
and saved metadata use existing repoint; frozen payloads remain unchanged.

The old shadow stays in its original stable-key directory. `inspectByLocalKey`
extracts the existing locked reader so it can verify the base before the old path
exists again; ordinary `inspect(path)` retains canonical-path validation and
delegates to that reader. Candidate recovery/staging and original unresolved
generation recovery are fenced. Valid dirty document recovery is retained and
later resolved by normal explicit Open/Recover/Save.

## Failure, recovery and blast radius

Database/operational collisions, source reappearance, candidate replacement,
parent changes and final guard failures roll back the metadata transaction. No
physical file journal is necessary because no filesystem mutation occurs.
Existing registry owner validates the uncommitted projected binding before commit
and publishes only after commit. A postcommit registry failure remains fail-closed;
it cannot be described as rollback of already committed SQL. Restart reads the
durable binding. UI/accepted derived-index refresh may fail after successful
binding; ordinary explicit Refresh/scan reconstructs it without another import.

App-owned Open/Create/Import/scan/lifecycle serialize via catalog/path gates;
generation maintenance fences hold the original Project. A candidate with no
prior owner cannot admit generation without Open; any established candidate is
refused. External programs remain outside these locks. Replacement after final
stat can race commit; normal loader/Save fingerprint checks remain authoritative.
Locate does not delete either a reappearing old file or a changed candidate.

Shared registry, shadow reader, Move/Rename, index and saved-result consumers are
the blast radius. Focused checks use real SQLite/IGS, a scanned disposable row,
nonempty binding and terminal queue, preserved frozen payload, real recovery base,
wrong ID/revision/base, Cancel, owner refusal and source-reappearance rollback.
Neighbors include ordinary shadow/autosave/session/identity and relocation tests.
Semantic mutations must bypass actual source absence/recovery-base admission and
reach the corresponding consumer with adjacent GREEN and exact restoration.

Native uses actual Main-created files/SQLite/IPC/renderer, controlled OS picker,
closed preparation and three normal lifetimes. Recovery preparation is not crash
qualification. Hash equality is asserted through Locate before separate explicit
Recover/Save changes the file. Source review, ROOT execution, UI self-review and
retained-byte audit are distinct evidence levels. No prototype source or inference
worker change; no model/runtime/SHARED copy.

No new product numeric limits. Existing package/schema/file and ID ceilings apply.
Test envelopes: checks4GiB/600s/zero swap serial, native launcher2GiB+app2GiB,
controller600s and lifetime300s. Initial root29GiB(shared17/runs12),63GiB free disk,
GPU1,395MiB used/14,625MiB free; foreign processes are not stopped. RUN
`runs/home-project-locate/20261111`, short TMPDIR `t-hpl-1111`. Exact own fixtures
are retained/audited before cleanup, with dependencies recorded in lifecycle.

Current finite exclusions: other saved versions, established candidate owners and
pending generation recovery combinations. These refusals are not automatically
new MVP promises. Confirmed remaining consumers: unavailable-workspace folder
Locate, selected Inspector/full preview/grid/zoom/pan/resize and the remaining
Models/export/runtime/release/visual/capacity/full MVP acceptance.
PP-001/005/007/008 stay **Пока не обещать**.

## Executed results

ROOT: **338 distinct Main/shared cases PASS**, zero fail/skip. This is
337 affected cases (`affected-r1`,18 files) plus one new cross-profile collision
case in the final33-case focused run (`focused-r2`);32 overlap and are not counted
twice. The late case uses another real active DB with a binding to the candidate:
Locate refuses and rolls back both index rows and binding while each profile's
registry projection stays correct. Original focused run32 PASS preceded that
addition. Final TypeScript/Vue (`typecheck-r2`), all four full lint partitions
(`lint-r1`) plus final scoped test/harness lint, syntax and app build (`build-r1`)
passed. Full lint has one unchanged parser exclusion:
`scripts/qualify-installed-regional-init.mts`. Existing renderer chunk advisory
remains. No prototype source changed; no Python/inference or unchanged full
release matrix was run. Production source stayed unchanged after the main checks;
later changes were harness diagnostics and one additional test.

`native-r3.json`: **10 checks, three normal physical lifetimes, six screenshots,
zero page errors**,9.209s. Main creates real packages; a real verified shadow and
external rename are prepared while physically closed. Actual UI/picker Cancel,
wrong-file rejection, invalid ID/extra arity and present-source refusal leave
bytes/owners intact. Successful Locate collapses only the unused scanned row,
retains the original key and leaves the package/shadow exact. A new lifetime
resolves that binding, reaches normal recovery, explicitly Recovers dirty bbox
x8, then explicitly Saves, normally closes and reopens the same Project. Only
that Save changes `.igs`; neighbors stay exact. Picker callbacks restore exactly.
Native operational tables are empty controls; nonempty terminal queue/frozen
payload and binding controls are separate real SQLite integration evidence.

ROOT opened all six final screenshots at900×620/1440×900: missing/found, visible
wrong-file refusal, relinked recovery row, recovery decision, recovered dirty
Project and saved reopened Project. Bounded self-review found no material new
layout defect. This is not independent/full accessibility or all Home acceptance.
Independent scoped non-UI source review is CLEAN/READ_FINISHED; it excludes the
reviewer's authored UI/Main/API/preload and executed no runtime/tests.

Two isolated semantic mutations reached their actual consumers: admitting stale
recovery base, and skipping source-absence validation after source reappearance.
Both produce `Missing expected rejection`, while the adjacent valid reconnect/
adoption control stays GREEN. **12 selections =10 GREEN +two intended semantic
RED**, each exit0/1/0; root/isolated source restores exactly. Setup/timeouts and
the failed native attempts below are not semantic RED.

## Failed native diagnostics and closure boundary

Native-r1 remains FAILED after8 checks. A Home-only screenshot width assertion
ran on the recovered Project surface. Its dirty fixture then entered the
synchronous OS close dialog, blocking harness/Node/CDP; physical input attempts
did not establish normal closure. The declared300s owned deadline issued SIGKILL
(retained journal output), so that third lifetime is **not** a normal close.
Only its earlier two normal closures count in that diagnostic. Exact owned PID/
start identities and cgroups were independently checked absent before retry;
`native-r1-failure-closure.json` records this separately. No foreign process was
stopped. Harness now explicitly discards its own recovered draft through the real
API on an assertion failure before normal app close, and Project screenshots
skip the unrelated Home-only width assertion.

Native-r2 remains FAILED after9 checks, with three normally closed lifetimes.
Its final report builder assumed the clean shadow directory survived explicit
Save; normal pruning had already removed it. The report now accepts absent clean
shadow. Both failures are harness diagnostics, not successful qualification or
evidence of a production regression. Production code/build bytes did not change
between attempts; final native-r3 qualifies the final harness/source mapping.

## Retention and fresh reproduction

RUN retains bounded commands/logs/resources, reports/screenshots, causal mutation
sources/controls/restoration, source review and commit/remote proof. Before
explicit Recover/Save, native preserves the original package and dirty shadow
inside its owned payload. Final retained audit compares those original bytes and
base/snapshot hashes separately from the explicitly saved revision/bbox/package.
The successful located path intentionally remains bound; moving it back would
make the fixture incoherent. Any failed preparation move is restored only if SQL
never bound the new location.

`final-source.json`/tar and `delivery.patch` preserve the staged source; qualified
bundle manifest/tar preserve actual checked bytes. Payload inventory/tar record
all raw fixtures, SQLite companions, retained pre-recovery inputs and isolated
mutation source by exact type/path/size/SHA/symlink target without following it.
`physical-exit-recheck.json` includes every observed native process/group, even
the failed deadline lifetime with no completed normal-close record.
`final-retained-audit.json` records independent bytes/source/report/current-exit
inspection, not another runtime. `artifact-lifecycle.json` records actual cleanup,
dependencies and allocation; read those outcomes rather than inferring disposal
from a plan. SHARED/models remain protected and unreferenced by this run.

For a fresh run, build the recorded source, re-inventory disk/processes, then use
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT --locate-only`
under the bounded controller and a new short owned TMPDIR. Do not resume old raw
paths or overwrite old reports. Reconstruct archives only into a new owned path;
mutation node_modules is a workspace dependency symlink, not a runtime copy.

One failed-deadline fixture left a filesystem Unix socket under the exact owned
TMPDIR. It had no `/proc/net/unix` server entry, all native processes/groups had
exited, and it allocated0 bytes. Its inode/type/mode/path/exit proof are retained
in `stale-ipc-socket-cleanup.json`; the inert socket node was unlinked before
tar retention (it has no portable persistent payload). All regular package,
SQLite, shadow, source and diagnostic files follow the ordinary full byte audit.
