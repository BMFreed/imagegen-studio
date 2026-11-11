# Locate a missing workspace folder atomically

Base `167c66403aa45a0b70ef0815875cdf7cc7f8ef95`, clean master/origin at start.
PP-001 Home unavailable-workspace contract and PP-007 identity/recovery ownership.
High risk: catalog and multiple authoritative Project locations must commit
together. This action changes SQLite metadata; it never moves/writes `.igs`,
imports, Adds, opens a tab or Saves a Project implicitly.

## Fresh source and finite adaptation

Clean Invoke revision `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/services/image_moves/image_moves_default.py`: mutation lock,
  `move_all_images`, `startup_recovery`, destination reconciliation and
  `commit_database_updates` with all-or-nothing invalid-item validation.
- `invokeai/app/services/shared/database/queries/image_moves.py` repoint queries;
  callers `invokeai/app/api/routers/image_moves.py` start/recover routes and the
  background service chain.

No registered `.igs` folder-Locate mechanism exists there. This and the adaptation
were reported before implementation. Invoke supplies guarded batch transaction
semantics; Studio reuses its existing narrow relocation repoint and operational
checks. Per-file `relinkMissingProject` cannot be called in a loop: its readable
original parent requirement fails for a missing folder, and separate commits
could publish only part of a workspace. No fake Move journal/physical witnesses
or parallel queue/recovery/identity owner is added.

## Production path and invariant

Unavailable non-default workspace warning/menu → Locate Folder → ID-only preload
→ exact Main arity/workspace ID and catalog lock → Service captures registration
and cached Projects → sorted composition of existing Project operation gates and
generation maintenance fences → trusted directory-only OS picker → ordered folder/
Project path locks → verified file set and recovery → one SQLite transaction for
all Project repoints and the registration → registry publish → ordinary Refresh.
Cancel returns false; errors stay visible in Home. Selection and Home query
controls retain their session state. Workspace ID/name/color and Project local
keys/lastOpened remain stable. Only canonical location columns change in terminal
queue/receipt records; frozen JSON and document/provenance bytes remain intact.

Old directory must freshly fail `lstat` with ENOENT. Present/inaccessible/symlink/
ENOTDIR conditions refuse. A witness for the nearest existing canonical readable
ancestor covers a missing parent chain; it is revalidated with old-path absence.
The chosen folder must itself be canonical, nonsymlink and readable/searchable.
Read-only is allowed. Source/target cannot overlap another registration, and the
application data root is refused before directory locks could re-enter the catalog
key. `Uncategorized` keeps its fixed app-managed location; migration is another
owner, not this action.

This finite slice requires the exact direct `.igs` filename set of the cached
active Projects, each with a known saved document ID/revision and fully validated
matching candidate package. Non-`.igs` files and nested folders are ignored as in
the existing scanner. Empty registrations can reconnect only to an empty `.igs`
set. Missing/extra/different/corrupt/symlink packages refuse the entire operation.
The current package SHA/fingerprint protects the selected file through commit;
the old index has no historical whole-ZIP SHA. Retained recovery additionally
requires its exact saved document base/committing hash. Stale/invalid/unreadable
recovery and an independent destination recovery owner refuse without discard.

Raw index completeness is checked inside SQL; `listProjects()` alone excludes
Trash and pending owners. Any associated Trash/acceptance/pending Move/Rename
authority refuses. Binding/index/queue/receipt paths under old or new directories,
or owned by the cached keys, must belong to the exact verified mapping. Orphan or
foreign owners are refused rather than silently stranded. SQL prefix predicates
use bound substr/length expressions, not LIKE wildcards or one parameter per
Project. Existing destination ownership/retired/seed/discard guards still apply.
An unknown pathless seed/discard key with no index, binding or path-bearing owner
cannot be attributed to a workspace. Such records are kept; this coverage claim
is about the cached keys and old/new path-bearing authority, not global recovery
discovery from otherwise unidentified keys.

Shared operational checks accept a narrowly verified workspace-directory mapping
while the catalog still points at the old location; their normal single-file
behavior is unchanged. Every binding/index/terminal path and the directory row
updates in one transaction. A later mismatch, SQLite abort, source reappearance,
changed candidate/parent or final coverage failure rolls everything back. No
registry draft is published: existing precommit compatibility is checked once for
the complete mapping, then the registry refreshes after commit. A postcommit
projection/Refresh failure is fail-closed and must not be called SQL rollback.
Ordinary scan reconstructs the accepted-result cache after a successful binding.

## Refusals, remaining scope and parameters

Open tabs are checked by key and by original/selected folder prefix even if their
index row vanished. Main holds every cached Project maintenance fence together;
new work cannot enter one key while another is repointed. Original and destination
generation recovery are protected by existing guards. Valid dirty document shadow
remains at its stable-key directory and is resolved by later explicit Open/Recover/
Save. External processes are outside app locks: a replacement after final checks
can still race metadata commit; normal loader/Save checks remain authoritative.
No physical file is deleted or overwritten by Locate.

Exact-set admission excludes an already-missing cached file, external additions,
unsupported/corrupt cache identity and unresolved/orphan lifecycle combinations.
The user must restore the original path or repair the file/ownership first; file
Remove from Home also requires its workspace to be available. These finite
refusals are not automatically new MVP promises. Full workspace/recovery/version
compatibility and capacity remain acceptance work. Inspector/full preview/grid/
zoom/pan/resize, remaining Models/export/runtime/release/update/visual gates are
separate. PP-001/005/007/008 stay **Пока не обещать**.

No new product numeric cap. Existing per-package/schema/filename/ID limits apply;
Project count and total bytes are data-dependent. Hash/loader processing is serial,
with only compact mapping/witness/digest retained per file. Whole-transaction locks
and repeated directory checks do not establish a large-workspace capacity claim.
Finite checks use2–3 Projects. Test envelopes: checks4GiB/600s/zero swap serial,
native launcher2GiB+app2GiB/controller600s/lifetime300s. Initial artifact root29GiB
(shared17/runs12),63GiB free; GPU1,513MiB used/14,507MiB free. No GPU/foreign process
is stopped. RUN `runs/home-workspace-locate/20261111`, TMPDIR `t-hwl-1111`; no
runtime/model/SHARED dependency or copy.

## Verification plan

Real SQLite/IGS cases cover two accepted Projects, a nonempty stable binding and
terminal queue/frozen JSON, exact recovery, read-only/Unicode target, empty
registration, default/overlap/application-root refusal, Cancel, source reappearance,
last saved revision mismatch, orphan authority and Trash. A real SQLite trigger
on a later Project write must roll back earlier repoints. Semantic mutations must
reach actual later-file/transaction or recovery consumers with adjacent GREEN and
exact restoration. Shared single-file Locate/Move/Rename/index/shadow/autosave/
identity and preload neighbors are included where their owners changed.

Native uses Main-created packages and a real whole-folder rename/verified shadow
prepared while physically closed. OS picker replies are controlled; actual Main/
IPC/SQLite/renderer and normal recovery/Save are real. The native operational table
control is separate from nonempty integration fixtures. Before explicit Recover/
Save, original package/shadow bytes are retained separately from the later saved
revision. Failed-own-draft cleanup precedes normal close. Source review, ROOT
execution, bounded UI self-review and retained-byte audit are separate evidence.
The approved Vue/Naive prototype supplies warning/menu vocabulary; no new design,
prototype source or inference consumer is introduced.

## Executed checkpoint

ROOT execution, all on the first attempt for this stage:

- Focused SQLite/Service/preload suite: **41 PASS**, no failures or skips.
- Affected Main/shared suites: **349 PASS across 19 files**, no failures or skips;
  includes the focused cases and existing file Locate/Move/Rename/recovery owners.
- Full `pnpm run typecheck`, four ESLint partitions and `pnpm run app:build` PASS.
  The sole unchanged parser exclusion is
  `scripts/qualify-installed-regional-init.mts`; the existing renderer chunk-size
  advisory remains. No prototype source changed, so no prototype browser rerun.
- Built Electron app: **10 checks, three normally closed physical lifetimes,
  six screenshots, zero page errors**, 8.955 seconds. Cancel and an incomplete
  selected folder leave all owners/bytes intact. Successful reconnect preserves
  workspace identity and all three Project keys, then a cold lifetime reaches
  the original recovery decision. Only explicit Recover/Save publishes x=8.
  OS picker replies are controlled; the Main/IPC/SQLite/renderer are real.
- Two causal semantic mutations: **12 selected executions = 10 GREEN + two
  intended semantic RED**, each with adjacent GREEN and byte-exact restoration.
  Replacing the transaction with a reserved connection leaves an earlier
  Project path changed after the real later-write SQLite abort; the rollback
  assertion detects it. Admitting stale recovery accepts the mismatched saved
  document and produces `Missing expected rejection`. Neither RED is a setup,
  OOM or timeout failure. The successful consumer control stays GREEN in each
  mutated run.

Independent scoped non-UI source review is **CLEAN / READ_FINISHED**, freshly
checked against the cited Invoke implementation/callers. It excludes the
reviewer's own UI/API/Main/preload edits and is not another runtime execution.
ROOT visually inspected all six actual screenshots at 900×620 and 1440×900:
missing/error warnings, reconnected list, recovery decision, dirty recovered tab
and saved reopened tab. No material new layout defect was observed in that
bounded self-review; this is not whole-Home or visual generation acceptance.
The native queue/receipt tables are empty controls; the nonempty terminal queue,
binding and unchanged frozen JSON are separate real integration evidence.

## Retention and reproduction

RUN is under the artifact root at `runs/home-workspace-locate/20261111`.
`qualification-summary.json`, per-check logs/resource reports, `native-r1.json`,
six screenshots, `mutations.json` and causal source snapshots describe ROOT
execution. `source-reviews.json` records the narrower independent review.
`final-source.json`/`.tar.gz`, `delivery.patch`, `qualified-bundles.json`/`.tar.gz`
and `payload-inventory.json`/`retained-payloads.tar.gz` bind exact retained bytes
to the staged tree. The later `final-retained-audit.json`, physical-exit recheck,
lifecycle, release gates and commit proof record the separate retention/delivery
conclusion; their presence and content are required, not inferred from this note.

Reconstruction must verify archive SHA and every inventory entry first, using an
isolated destination. Restore the source and compatible existing Node/Electron
dependencies, then the built bundles if inspecting this exact native run. Raw
native report paths may be removed after retention; do not resume them blindly.
The native app catalog remains coherently bound to the found folder inside the
retained fixture. The original saved package and dirty shadow have separate
backups before Recover, because explicit Save changes the package and may prune
the clean shadow. Recover intentionally creates a fresh live revision, so compare
the dirty content and saved ID rather than requiring its old snapshot revision.
No runtime/model copy or SHARED dependency is needed. A fresh replay should make
new owned fixtures with `scripts/smoke-home-workspaces.mjs --workspace-locate-only`
under the recorded bounded controller and retain/audit them before cleanup.
