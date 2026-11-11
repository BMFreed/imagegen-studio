# Clean-open Project Rename

Base `25481a1757200039a76fde2340732e81ea892a4f`, clean master/origin at start.
High-risk extension of PP-007/Home/document lifecycle and existing relocation;
no queue, package schema, inference, release or new public promise owner.

Fresh Invoke checkout: clean `4875d96531ca6712b288f6e660fcbb34143408c1`.
Read Project router `update_project` → `project_records_default.update` and its
revision/name/document/board-name transaction, image-move router/service
mutation/journal/repoint/startup recovery, plus current frontend callers:

- `workbench/projects/library.ts:renameLibraryProject`;
- `workbench/projects/openProjectBroker.ts:createOpenProjectBroker`;
- `workbench/workbenchState.ts`: `renameProject`, `RECORDED_LAYOUT_ACTIONS`,
  `createUndoSnapshot`;
- `canvas-engine/history/history.ts` for independent canvas history ownership.

Invoke stores Project name outside canvas/layout Undo snapshots and routes open
Rename through the real open-project owner. Its open Rename flushes the entire
live document. That dirty-document persistence behavior cannot satisfy Studio's
no-implicit-Save rule; the missing `.igs`/live-history adaptation was reported to
the user before implementation. This slice admits only settled **clean-open**
Projects. Dirty/pending renderer drafts require explicit Save/close.

The existing physical-path reservation and journal remain the sole relocation
owners. Destination lease/edit gate are reserved before intent. Same-path metadata
Rename retains its original lease instead of acquiring it twice. At the existing
post-SQL/pre-finalization callback, Session validates the exact journal-planned
new document and unchanged non-project members/preview. Saved metadata/readers
rebind to destination; operational seed metadata remains current. Coordinator
rebases only title over past/future/focus baseline and increments document epoch
once. Rename creates no Undo step: future canvas Undo/Redo keeps the new lifecycle
name. The exact target must differ from saved content only by title/new revision;
immutable accepted provenance and frozen queue data stay unchanged.

Pending Rename fences identity admission, prepared edits, Save, Undo/Redo and
Generate/frozen Retry through the existing owners. Rebind Retry is idempotent and
requires the same descriptor. Gate/leases remain held until journal finalization.
Explicit Close abandons only the live owner without a Save/old-path shadow write;
normal startup owns durable Rename recovery. Main broadcasts full authoritative
tabs, including title/revision/pending, and Renderer keeps settled draft caches.

Finite failure axes: dirty/unsynced drafts; unavailable workspace/recovery/staging;
foreign/case collision; same-path title mismatch; pre-intent failure; metadata
commit before rebind; rebind before finalization; different-name Retry; exact
same-name no-op; exact same-descriptor Retry; explicit tab/native Close/restart;
prepared stale edit; retained raster history/readers; independent neighbor.
Name bounds and generation/recovery guards are unchanged from closed Rename.

Checks will use real SQLite/IGS/leases/session/history and actual built Electron
Home through the existing harness. OS picker and causal owned FS fault injection
are controlled, app/persistence results are real. No ML/runtime/weights copy.
Source review, authored tests, ROOT execution, semantic RED/GREEN/restoration and
retained-byte audit remain distinct. PP-001/005/007/008 stay `Пока не обещать`.

RUN `runs/open-project-rename/20261111` under artifact root; initial root29GiB
(shared17/runs12),63GiB free disk, GPU14,553MiB free. Checks4GiB/600s/zero swap;
native launcher2GiB+app2GiB,600s controller/300s lifetime. Short owned TMPDIR
`t-opn-1111` avoids tsx Unix socket path limits. No SHARED dependency.

## Executed verification

ROOT focused selection:89 PASS. The first focused run had88PASS and one invalid
authored fixture: it changed an empty Project's preview status to `unavailable`,
which the real package writer correctly rejected. The fixture now writes a valid
foreign transparent PNG member; exact rebind rejects that changed member and
accepts the restored package. This setup failure is not semantic RED.

ROOT affected selection: **668 PASS, zero failures/skips**,641 top-level cases
plus nested cases. It includes existing migrations/identity/index/session/autosave,
Move/Rename/workspace/Trash/shadow/queue/staging/recovery and public action consumers.
The real ordinary frozen Queue Retry test runs for both Move and Rename after
SQL repoint: held identity refuses before runtime publication and leaves retained
rows/input/target bytes exact; finalization admits the same reviewed source.
Controlled tiny worker transport is not installed trained inference evidence.
Full TS/Vue typing, partitioned lint with the single unchanged
`qualify-installed-regional-init.mts` parser exclusion, build and final scoped
harness lint PASS. Build's prior chunk advisory remains. Python/prototype source
was unchanged, so their full matrices were not repeated.

Source-only reviews of ROOT Service/Main/Close/queue coupling and the independent
Session/autosave adaptation are CLEAN/READ_FINISHED. Reviewers ran no tests,
build or native checks; their results are separate from ROOT execution.

One isolated source mutation intentionally retains old title in lifecycle snapshot
rebasing. Nine selected executions = **seven GREEN/two semantic RED**. Real canvas
Undo returns `Saved` instead of `Renamed`, and sealing a returned-clean focus
baseline creates a phantom Rename Undo step. The ordinary Move neighbor remains
GREEN. All three pass before mutation and after byte-exact restoration; restored
isolated source matches current ROOT source. No setup/OOM/timeout substitutes RED.

Final built Electron `native-r2`: **11 checks, three normal physically confirmed
lifetimes, six screenshots, zero page errors**,25.044s. Actual UI width edits,
Undo and Save prepare both history directions. Rename changes saved title/filename,
keeps the tab/key/document, and subsequent Undo/Redo/original-future Save retains
the new title/path. Three causal EACCES cases reach `Session.rebindLocation` after
metadata publication and SQL repoint: same-live frozen Retry, explicit pending tab
Close, and a live pending tab through normal app Close/cold recovery. Strict
captured file witness stays exact; all function identities and directory modes
are restored before close. Startup completes only the durable original targets.
OS picker replies are controlled; no inference/runtime/models are provisioned.

Native-r1 correctly refused Retry after its fault adapter chmodded the **target
file**, thereby changing the already-captured strict ctime witness. This is an
excluded fault-setup diagnostic, not a product defect or semantic mutation. Its
app lifetimes closed normally with function/mode restoration. Final injection
chmods only the exact owned **parent directory**, delegates the original callback
open for real EACCES, restores that directory, and explicitly compares the full
captured target witness before Retry. No witness policy was weakened.

ROOT opened all six final screenshots at900×620/1440×900. Dirty Save/close guidance,
clean confirmation, updated live title, frozen pending name/Retry/Close and
recovered Home are legible without a material local layout finding. Pending fault
snapshot retains the unavailable-workspace cache from the permission denial until
refresh; successful Retry updates it. Existing bounded geometry checks plus
Playwright `animations: disabled` replace the harness's unbounded animation-finish
wait. This is bounded UI self-review, not full accessibility/latency/release or
visual model acceptance.

## Retention and remaining scope

Compact evidence retains reports/commands/resource logs, failed diagnostics, six
final PNGs, mutation plan/applied/restored source and full input/source/bundle
archives/manifests. Raw test Projects/SQLite and isolated source are held until
independent byte audit READ_FINISHED, exact process/cgroup exit/restoration and
dependency closure. Lifecycle records actual disposal/reclaimed bytes. Reconstruct
raw historical paths from retained archives; do not run raw `--resume` after cleanup.

Reproduce from the final commit with compatible existing workspace dependencies:
affected Main tests, `pnpm run typecheck`, lint with the recorded baseline parser
exclusion, `pnpm run app:build`, then the existing harness:
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT --open-rename-only`.
Use fresh owned XDG/TMP paths under artifact lifecycle and the same bounded limits.
No SHARED/ML dependency exists; do not copy runtime/weights for this filesystem lane.

Dirty Rename still requires explicit Save/close. Cross-device/deferred-recovery
relocation, remaining unhealthy Home operations, safe Models Remove/contexts,
exports, release runtime/install/update/rollback, compatibility/NoobAI and visual/
MVP acceptance remain later owners. Public promise statuses stay unchanged.
