# Clean-open Project Move and closed Rename

Working-tree base: `b43352c2fdb10a3e5d69824ebf6459862ddf7764` (`master`).
Supporting contracts: PP-007, `features/home-screen.md`, Project document lifecycle,
Undo/Redo and the existing workspace Move checkpoint. High risk: portable package
publication, durable identity, physical path leases and restart recovery.

## Fresh source basis and adaptation

Invoke checkout re-read during this change: clean
`4875d96531ca6712b288f6e660fcbb34143408c1`.

- `invokeai/app/api/routers/image_moves.py`: start/recover callers.
- `invokeai/app/services/image_moves/image_moves_default.py`: mutation admission,
  source/destination preflight, journaled filesystem move, database repoint and
  startup recovery.
- `invokeai/app/api/routers/projects.py:update_project` and
  `invokeai/app/services/project_records/project_records_default.py:update`:
  expected-revision name/document update and board-name transaction.
- Board rename caller/service/record/query owners were also re-read.

Invoke has no portable `.igs` transaction or live Studio coordinator/Undo/lease
rebind. This absence and the adaptation were reported before implementation.
The implementation extends existing Studio journal, package writer, coordinator
edit gate, process physical-path leases and stable location registry. It adds no
parallel queue, save, recovery or acceptance owner.

## Finite behavior

Move now admits an open **clean** Project. It retains the same coordinator,
document epoch, tab id, historical source maps, Undo and Redo. Before physical
Move it reserves the destination lease and holds the edit gate. After metadata
repoint it verifies/reloads the exact saved package at its new physical path,
then finalizes the journal and releases the old lease/gate. Lazy package readers
must point to the destination. Location is not a document edit or implicit Save.

A post-intent failure holds both leases and fences ordinary edits/Save/generation.
Retry keeps the original destination. Explicit tab/app Close abandons the live
coordinator without an old-path shadow write, Save or uncertain scratch cleanup;
the positive journal remains for startup recovery. Main broadcasts authoritative
tab pending/workspace state. Dirty Projects, uncertain document recovery and
retained generation staging still refuse Move without deleting data.

Rename first admits a **closed saved** Project with clean/absent recovery. It
changes both document title and `.igs` filename in the same workspace. Name
validation is shared by UI/Main/core; the trimmed filename component must fit
255 UTF-8 bytes including `.igs`, with existing package title ceiling and no
filename separators/control/unsupported characters. These are finite validation
bounds, not filesystem capacity claims. A no-op requires both names to match.
Same-path title mismatch still performs an exact metadata Rename.

The existing relocation journal gains operation kind and a durable exact target
document/member/preview descriptor. Recovery recognizes original source,
original package at destination, or the exact rewritten package. Rename uses the
existing IGS writer with original assets/previews/status/rect, not Session Save's
fallback preview path. Queue/receipt mutable paths follow location; frozen input
JSON, seed, original document revisions and accepted provenance stay immutable.
Unknown replacements, collisions, both paths present and unavailable parents
stay pending. No filesystem side effect occurs in a retryable SQL transaction.

Open/dirty Rename remains a visible refusal: title lives in whole-document Undo
snapshots and needs a separately completed history policy/consumer. Cross-device
Move, arbitrary hostile external filesystem scheduling, release migration and
full PP-007 readiness are outside this checkpoint. PP-001/005/007/008 stay
`Пока не обещать`.

## Verification plan and evidence levels

Real SQLite/filesystem/package tests cover live identity/history/readers/leases,
pending edits and explicit close, original-target Retry, metadata publication
crash, same-path Rename, exact assets/preview/frozen data and foreign collisions.
The existing built Electron Home harness covers actual renderer/preload/Main,
authoritative tab markers and normal close/restart. OS folder selection is
controlled; no inference or user model/runtime is required.

Semantic mutations must reach the real rebind/metadata consumer with adjacent
GREEN and byte-exact source restoration. Setup/selector/permission setup errors
are diagnostic only. Source review, authored tests, executed tests, native UI,
screenshot inspection and retained-byte audit are reported separately below.

Current RUN: `runs/open-project-relocation/20261111` under the artifact root.
Initial inventory: root29 GiB (shared17/runs12),63 GiB free; GPU15,057 MiB free.
No ML allocations or runtime copies. Serial controller:4 GiB, zero swap,600s;
native launcher2 GiB + application2 GiB aggregate4 GiB. Fresh lifetimes and
source/bundle hashes must match before final qualification.

## Executed checks and review

ROOT final affected selection: **655 PASS, zero failures/skips**,628 top-level
cases including nested cases. It includes all existing database/bootstrap migrations
and the affected identity/index/service/workspace/Trash/shadow/session/autosave,
queue/staging/acceptance/recovery and public generation-action consumers. Real
packages and SQLite remain in these tests; controlled tiny worker transport does
not establish trained inference. Initial focused165 and59 selections passed.
The first broad run had653PASS and one authored-test setup TypeError (wrong staging
method); the existing verified-candidate API fixed it, the targeted frozen Retry
case passed, then the complete final selection passed. No behavior assertion was
weakened. Unchanged inference/prototype/Python matrices were not repeated.

Fresh source reviews were source-only. Session/autosave and production rebind
coupling were CLEAN; independent Core review found a reachable case-only Rename
self-collision. ROOT reproduced `Scene.igs → scene.igs` as semantic RED, then
fixed the final guard to exclude only its own exact source. The same test and a
foreign case-insensitive collision control pass. Consumer review also closed:

- pending tabs could not reach explicit Close because App unconditionally sealed
  prompt history; clean fenced tabs now skip that write, while unexpected pending
  drafts still refuse closure;
- ordinary frozen Retry bypassed `requireTab` after terminal-row repoint;
  authoritative generation/acceptance identity getters now return unavailable
  during a held Move, and Queue UI shows the pending diagnostic;
- an exact-saved dirty shadow could become stale after Rename. The existing
  `markClean` verifies the real committed package and publishes a durable clean
  marker before Rename intent. Unknown/stale recovery remains refused.

The actual generation-action test reaches a valid already-repointed destination
and refuses frozen Retry **before** runtime admission/publication, preserving queue,
package, target and frozen input bytes. Completing the same Move permits Retry of
the same reviewed job; the tiny controlled worker is explicitly separate from
installed inference.

Two isolated semantic mutations,12 selected executions total, yield10 GREEN and
two intended consumer RED. Omitting saved-package reader refresh makes subsequent
real Save try to extract assets from the now-absent old path; its mismatched-document
neighbor stays GREEN. Omitting only expected target-member comparison makes real
post-metadata Rename return `moved` for a foreign preview instead of `pending`;
ordinary Rename stays GREEN. Both pairs pass after exact source restoration; the
restored isolated files match current production sources. This is neither setup,
timeout nor OOM evidence.

Final built Electron `native-r5`: **13 checks, three normal physically confirmed
lifetimes, eight screenshots, zero page errors**. It verifies dirty Move/open Rename
blockers; clean-open Move with both history directions and later destination-only
Save; closed title+filename Rename, invalid/collision/no-op cases; two real EACCES
faults in the destination package read during live rebind after SQL repoint; and a
real EACCES after Rename metadata publication. Exact syscall identities/modes are
restored before close. One pending Move tab closes explicitly, another remains
pending through normal app Close, and cold startup recovers both plus Rename.
Stable keys, package/member bytes, original-source absence and later Save/reopen
are checked through actual Main/IPC/SQLite/package owners. OS picker replies are
controlled. The preceding identical13-check run `native-r4` passed in27.558s;
final screenshot-expanded r5 took281.703s within the600s controller/300s lifetime
bounds. These timings include harness/screenshot waits and do not qualify latency.

ROOT opened all eight r5 screenshots at900×620/1440×900: the Rename field error,
Move confirmation, pending badges/disabled Open, target tab marker and recovered
counts are visible without a material local layout finding. This is bounded UI
self-review with the existing ui-audit/frontend guidance; full accessibility,
file-manager UX, visual model usefulness and release readiness remain unqualified.

Native-r1 used a display title as a collision filename even though Main creates
UUID filenames; r2 assumed the wrong Naive disabled class; r3 expected the Service
error code from the generation identity admission boundary. All are excluded
harness diagnostics, with normal exits and restored owned permissions/functions,
not semantic RED. The final r5 uses exact indexed paths, the installed Naive
selection class and separate expected service/generation refusal codes.

Final TypeScript/Vue, partitioned lint and app build results are recorded in RUN.
One unchanged parser baseline exclusion remains
`scripts/qualify-installed-regional-init.mts`; it was not modified. The first lint
found only two formatting errors in the new case-only test, then fixed. A second
lint was explicitly stopped to avoid overlap with native; its controller status0
is **not** treated as PASS because its log is incomplete. The isolated final lint
is the authority. The existing build chunk-size advisory is unchanged.

## Retention and continuation

RUN retains command/resource logs, diagnostics, final screenshots, causal mutation
source copies/restoration proof, payload/source inventories, staged patch/tree and
tested bundle archives. `retained-payloads.tar.gz` preserves generated Projects,
SQLite and mutation source without following its dependency symlink. The independent
byte audit, current source/bundle equality, physical PID/start/cgroup exit, syscall
restoration, dependency closure, exact cleanup and commit/remote proof are separate
records. `artifact-lifecycle.json` records actual disposal/reclaimed space; historical
raw report paths must not be resumed after disposal.

Reproduce from the final commit and compatible workspace dependencies: run affected
Main tests, `pnpm run typecheck`, lint with the single recorded baseline exclusion,
`pnpm run app:build`, then existing
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT --relocation-only`
under the same bounded lifecycle. Use a short lifecycle-owned TMPDIR for tsx Unix
sockets. Initial long TMPDIR failed before tests and is excluded setup evidence.
Reconstruct retained sources/packages without dereferencing symlinks; use compatible
native SQLite ABI. No ML runtime/model/SHARED copy or raw historical resume is needed.

Next boundaries remain open/dirty Rename and its title/history policy, cross-device
Move and relocation with unresolved recovery/candidates, remaining unhealthy-file
Home operations, Models hard Remove/contexts, export/runtime/release/update,
compatibility/NoobAI matrix and visual/MVP acceptance. Prior finished Regional
Guidance consumers are not re-added to this backlog. No public promise is promoted.
