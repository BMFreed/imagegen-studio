# App-managed Project Trash and permanent deletion

## Scope, risks and fresh source

High risk: persistent lifecycle authority, source-file deletion/recovery, authenticated
IPC and Home scopes. Baseline clean master `e11a592c84b9c8d7a88a5a174e9f41a26402c74a`.
[Home Trash](../features/home-screen.md#app-managed-trash) and PP-007 define the
accepted behavior. This slice implements Trash/Restore/Delete Permanently, not
Project filename rename/move, full Home presentation or final MVP acceptance.

Fresh Invoke checkout clean at `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `app/api/routers/images.py:delete_image` →
  `app/services/images/images_default.py:delete/_image_mutation_lock` →
  `app/services/image_files/image_files_disk.py:begin_delete/commit_delete/abandon_delete`
  and `start/__recover_pending_deletes/__commit_pending_delete`.
- Authoritative `image_records.delete` is the commit oracle in that flow.
  Intent precedes database deletion, file purge follows commit, parent fsync
  precedes journal removal, and failed purge retains the journal for startup.
- `api/routers/boards.py:list_boards/update_board` → `boards_default` →
  `board_records_default.update` → `queries/boards.py` archive update/list exclusion
  supplies reversible metadata behavior. Image soft delete is explicitly unused
  in `image_records_base.py`/`schema/images.py`.
- `api/routers/images.py:get_image_thumbnail` → `images_default.py:get_path` →
  `image_files_disk.py:get_path` reads the authoritative record before serving pixels.
  Invoke reads have no stronger same-lock freshness guarantee. Studio reuses its
  existing per-file lock and repeats the authoritative lookup there, so a queued
  thumbnail cannot publish after a positive delete commit. No new lock owner.
- Studio existing `project-path-lock.ts`, `project-identity.ts`, index fingerprints,
  synchronous final-validation primitives in regional input ownership and existing
  generation gate/fence/recovery callers were read before adapting their use.

Two source gaps were reported to the user BEFORE implementation: Invoke has no
Project soft Trash, and its pathname purge has no frozen inode/version guard for
user-controlled `.igs` folders. Its absent-record oracle is unsafe for Studio's
rebuildable project_index. We adapt board archive state plus durable v2 deletion
control flow, mapping the journal into authoritative SQLite lifecycle rows
(WAL+synchronous=FULL). This is a storage-mapping adaptation, not a claim to copy
Invoke filesystem journaling verbatim. No parallel queue or acceptance owner.

## Authority and complete path

Home → frozen ID/trash-ID intent → preload/Main validation → catalog path lock →
Project operation gate → existing generation fence/owned queue+staging inspection →
service → authoritative lifecycle record and derived Home projection → UI.

Trash is metadata-only: source `.igs` stays at its canonical path. Lifecycle state
is separate from the disposable Home index and survives workspace unregister,
index eviction and re-Add. Scanner, active Open/list/history and preview access
consult the authority; neither a missing cached row nor a filesystem rescan can
silently restore a Project. Trash uses its own browse scope, never a fake workspace
ID or implicit Create/Import destination. Actual basename comes from Main.

Restore requires the exact original canonical workspace directory currently
registered. It does not silently register a folder or move to Uncat. A missing
registration/file, unavailable source or changed foreign document gives a visible
refusal. Pending permanent deletion cannot be restored. A fresh trash operation
has a new UUID so stale confirmations cannot target a later lifecycle instance.

Permanent deletion has a POSITIVE durable commit: freeze the trash-time source
and parent witnesses; atomically commit deletion state and evict derived index;
purge only that committed operation; fsync parent; then finalize lifecycle record.
Before the first positive commit, a nondestructive preflight uses the same frozen
source checks as purge. Initially changed or unknown sources remain restorable Trash;
write-permission failures during actual purge retain the committed pending journal.
No filesystem effects run in a retryable metadata transaction. Recovery runs before
initial scanner/Open and uses the same authority/witness checks. Absence of the
index, lifecycle or app DB never authorizes an unlink.

Immediately before unlink, synchronous canonical-parent/file type, dev/ino/version
and link-count checks precede the syscall without an await/callback/logging gap.
Symlinks, aliases, changed/replaced files, changed parents and unknown I/O retain a
pending diagnostic; a frozen missing witness never licenses deleting a later
occupant. File absence is distinguished from permission/unknown-folder errors.
The committed row survives purge/fsync/finalization failure and is retried safely.
No hostile cross-process filesystem scheduling guarantee is claimed.

## Preserved owners and failure boundaries

Any open/opening/saving/rebuilding Project is refused. Main reserves generation
admission before inspection and holds the existing perproject gate. Unknown
recovery, unfinished jobs, owned unaccepted candidates or pending acceptance
handoff block Trash/delete. No automatic Save/Add/cancel/discard occurs. The scoped
maintenance fence releases only a fence it acquired and preserves an older close
or cancellation fence. Queue, receipts, seeds, acceptance and shadow owners are
retained and remain responsible for their own lifecycle.

Failure before deletion commit leaves the source and Trash state intact. Crash
after commit retains positive authority until guarded purge/recovery succeeds.
Failure after unlink still retains the journal until parent durability/finalization
is confirmed. Corrupt authority fails closed. Index-only rebuild and workspace
unregister are tested separately from losing all authoritative application data;
SQLite data loss is not promised recoverable from `.igs` lifecycle metadata.

Before migration 0027, supported production had no non-null writer of the dormant
`project_index.trashed_at` field; only private/manual/test fixtures used it. Such
legacy cache flags are not backfilled into authoritative Trash or delete grants.
Their old unregister/re-Add loss remains an unsupported private-DB boundary.
Present corrupt/unsupported files with no trusted index fingerprint are refused
at Trash publication; this slice does not manufacture file authority from a later
occupant or claim that all unhealthy rows can be trashed.

Bounds remain existing Project/file fingerprint limits; new lifecycle UUIDs and
strict known states are finite; source metadata snapshots are validated. Operational
checks use bounded owned processes and isolated temporary data. Models/runtimes and
foreign processes are outside this slice. No inference or visual-quality claim.

## Planned verification

Real SQLite/filesystem migration and lifecycle cases; ordinary scanner/history/
Open/recovery regressions; no-op refused transitions and stale identities; unregister/
re-Add retention; DB rollback and all delete crash windows; exact foreign replacement,
symlink/hardlink/permission and final-gap guards with neighboring controls. Semantic
mutation must reach actual unlink/publication consumer, then exact restoration.
Built Electron actual Trash→restart→Restore and Delete confirmation/error/retry,
original file bytes, scope counters/default destinations, real Main open/race/
operational refusal, normal physical exit and bounded UI screenshot self-review.
Prototype mocks and authored tests do not qualify those boundaries.

## Executed evidence

ROOT executed the final affected Main selection: **216 PASS, zero skipped**.
The separate real maintenance-fence fixture adds **one PASS**; these are 217 unique
selected cases, not a rerun of the complete inference matrix. Core/service overlap
and intermediate runs are not added to that total. Checks cover strict migration
bootstrap/reopen, lifecycle rollback, index eviction/re-Add, stale UUIDs, authority
corruption, final-gap replacement, symlink/hardlink/parent changes, unknown sources,
after-unlink/finalize faults and positive startup recovery, plus existing adjacent
Home/index/history/recovery behavior. A retained terminal opaque queue row and
separately owned recovery/non-project bytes survive actual source deletion.

Two defects were reproduced before fixing their assertions unchanged:

- Cached missing/null fingerprint could previously freeze a later occupant under
  stale metadata. `stale-missing-red.log` records the missing expected rejection;
  the final guard refuses before lifecycle publication and the final test passes.
- A thumbnail queued before positive delete commit could serve its warmed cache
  after commit. `thumbnail-race-red.log` records actual 200 versus expected 404,
  with an ordinary thumbnail GREEN. The same real SQLite/file consumer now reads
  authority under its existing lock and returns 404; final tests pass.

Isolated semantic mutation: **six selections = five GREEN + one intended RED**.
Omitting only the final frozen-file version comparison preserved the adjacent
ordinary delete GREEN, but the replacement-at-final-check case reached actual
unlink/finalization and returned `deleted` instead of `pending`. Baseline and
byte-exact restoration each pass both selections. There is no setup/OOM/timeout
RED counted here. Workspace Core bytes equal the original/restored copy.

`pnpm run typecheck`, full partitioned lint and `pnpm run app:build` pass. Lint has
only the unchanged `scripts/qualify-installed-regional-init.mts` parser exclusion;
the later preview/test/harness changes also pass scoped lint. The existing README
has a pre-existing Prettier difference, independently confirmed against HEAD;
no broad documentation reformat was performed. Build retains its existing large
renderer-chunk advisory. Python/prototype sources are unchanged, so their large
matrices were not repeated and no new Python/inference evidence is claimed.

Final built Electron **`native-final-r2.json`: nine checks, four normal physical
lifetimes, four screenshots, zero page errors**. The Trash-only fixture uses real
Add Workspace and three Main-created closed packages. Actual UI/IPC verifies open
Project refusal/Switch to Project; active counts and no implicit Create; frozen
source bytes; unregister/normal restart/re-Add/Restore; stale confirmation, Cancel
and false confirmation; confirmed deletion of only its file; real readonly-parent
unlink failure retaining a pending row/source across normal restart; then guarded
startup completion after permission repair before scanning. The final neighboring
package and non-project file remain exact. Qualified source/bundle hashes match
current bytes. No ML or worker mocking is involved. OS picker replies are controlled;
the broader diagnostic catalog race wraps IPC entry, delegates unchanged to its
original handler and restores identity. OS dialog UX is outside this evidence.

The first broad native diagnostic has 23 completed checks, but a Trash/workspace
name selector ambiguity and launcher deadline prevented full qualification. Its
Main bundle was rebuilt between lifetimes, so it is explicitly a mixed-build
diagnostic. A second attempt failed a fixture Refresh locator before new consumer
checks. Neither failure counts as semantic RED or a normal full run. The final
bounded cohort corrects both selectors and uses one frozen build. All 66 observed
native identities across attempts were independently rechecked physically gone;
launcher exit alone is not used as proof. Each final lifetime has its own normal
close and physical-exit record.

Independent finite source review of Core, authority/migration/consumers and Main
admission glue is CLEAN after the thumbnail fix. UI source/screenshot review opened
all four final PNGs (900×620 populated/pending/empty, 1440×900 confirmation): no
blocking clipping or hidden actions found. That reviewer did not independently
execute lifecycle, hover/Tab or native checks. Native operational admission covers
open Project refusal; the full live queue/candidate/acceptance injection matrix was
not executed. Its predicate was source-reviewed and the actual existing fence lease
was exercised separately. No arbitrary external-process filesystem race guarantee,
complete Home acceptance, visual quality or PP-001/005/007/008 promotion follows.

## Retention and reproduction

Evidence root: `~/.codex/artifacts/imagegen-studio/runs/project-trash/20261111-lifecycle`.
`qualification-summary.json`, bounded logs/resource reports, source hashes, final
native PNGs, regression REDs, mutation plan/applied/restoration witnesses and physical
exit recheck distinguish execution, source review and diagnostics. Checks use
4GiB/600s ceilings; final native launcher and owned scope each have2GiB/zero swap,
600s overall/300s per native lifetime. No new weights/environment or dependency on
SHARED was introduced; its models, Projects and report companions are protected.

`retained-payloads.tar.gz`/`payload-inventory.json` preserve all four exact raw
payload paths (isolated mutation source plus three owned native fixtures), without
following the node_modules symlink. `final-source.tar.gz`/`final-source.json` and
`delivery.patch` retain the final source/staged tree; `qualified-bundles.tar.gz`
retains the five tested renderer/preload/Main files with their exact hashes.
Independent retained-byte audit, cleanup counts and final commit/remote proof are
recorded beside those archives, not inferred from an authored test or source review.
The mutable lifecycle records whether raw payloads have been removed after audit.
Old raw paths must not be resumed as if they still exist.

Reproduce from the final commit with current compatible workspace dependencies:
run the selected tests and build, then the existing
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT --trash-only`
inside a fresh lifecycle-owned artifact run and bounded controller. This builds
fresh `.igs` fixtures through actual Main commands and requires no ML runtime.
For retained historical bytes, extract the archive without dereferencing links;
rebind only the mutation copy's dependency link to a verified compatible existing
workspace node_modules. Rebuild source rather than transplanting native SQLite
binaries across Node/Electron ABIs. Do not reuse deleted raw XDG directories or
reinterpret diagnostic selectors as production failures.

Next finite Home owners remain Project rename/move (canonical identity and recovery
migration), unhealthy-file lifecycle, folder locate/reveal/tab markers and remaining
presentation. Models contexts/hard Remove, composited exports, runtime release/
Install-Repair/update and clean-install/upgrade/rollback/compatibility/NoobAI/MVP
acceptance remain separate accepted continuations. Current promise statuses stay
unchanged.
