# Saved accepted-result SQLite index

Base: clean `master` at `195ecff`. Risk: high because a rebuildable SQLite
projection crosses the explicit `.igs` Save and verified-source indexing
boundary. Authorized roadmap continuation follows the Project-local list.
Contracts: [saved provenance/history](../specs/03-data-storage.md#generation-provenance),
[history ownership](../features/project/generate-mode/generation-provenance.md#history-boundary),
PP-005/007/008. This checkpoint implements metadata storage/rebuild and an
internal Project-scoped repository query. App-level browse/navigation, new IPC,
Smart Patch and full inference/runtime delivery are separate.

## Confirmed owners and choice

`ProjectIndexRepository.indexSaved` already locks a canonical workspace path,
reads a verified `.igs` and checks before/after fingerprint. Create, Import,
Save, preview rebuild and workspace scan use that owner. `ProjectService.saveOne`
commits `.igs` first and reports a subsequent index failure as an index warning;
the user's source must remain saved. No accepted-history table exists yet.

Add an empty derived table by migration; do not synthesize history from Queue,
staging or dirty tabs. Within the existing path lock and one SQLite transaction,
upsert Home metadata, delete that path's previous result rows and insert the
current saved Raster Layers with provenance. Identity is `(local_project_key,
layer_id)`: Copy preserves portable document IDs and duplicated layer provenance
can retain candidate IDs. Frozen generation values supply actual seed (including
0), copied checkpoint/version/SHA, original output size and acceptedAt; current
layer name and asset path/hash/bytes/size are separate display/source values.
Do not persist signed URLs, pixel copies or model/worker/staging paths.

Keep unhealthy metadata recoverable but exclude non-ready/trashed parent Projects
from the internal query. External rename/copy gains a different path identity;
scan marks the missing original unavailable. A repaired/recreated file follows
the existing recheck and next-scan rules. Transient file replacement is not
corruption. Index rows have no user delete/soft-delete lifecycle and can always
be rebuilt from valid saved sources. Removing rows never deletes source files.

## Bounds, failures and invariants

Reuse `.igs` ceilings: 16 MiB project JSON, 10,000 archive entries and existing
strict provenance/PNG checks. The new internal query requires one Project key;
its result is bounded by that verified document. No all-workspace unbounded
renderer payload, new capacity, cache or generation worker is introduced.
Schema constraints cover identity/finite integer metadata and FK ownership.
Keep last-opened/Trash metadata unchanged during replacement.

If a result insert/delete or Home upsert fails, the entire SQLite update rolls
back to the previous consistent snapshot. A completed Save still owns its new
`.igs`; return the existing committed result with an index warning, and repair
via workspace Refresh/rescan. A failed Save cannot publish the unsaved document
into the index. Unsaved Add, editing, Undo/Redo, recovery shadows, queue pruning
and completed/discarded staging do not independently update durable rows.

## Verification plan

Obtain a failing regression through actual ProjectService Save/index before
implementation. Use real SQLite migrations, `.igs` writer/loader and current
acceptance/recovery owners where asserted. Cover multi-result Save, imported
exclusion, exact seed/metadata, original versus current size, repeated Save,
unsaved edits/Undo, path-copy identities, restart/lost-index rebuild, missing/
corrupt/repair, and SQLite trigger failure with atomic rollback and rescan repair.
Run a native Electron acceptance/Save path against the new build and query its
actual SQLite file; deterministic generation fixtures are not GPU evidence.

Execute isolated semantic mutations for omitted replacement, partial transaction,
wrong original metadata or unhealthy-source exposure, each with restored green.
Run focused/full app tests, typecheck/lint/build and appropriate retained native
regressions sequentially. Update matrix rows and bodies together without raising
public readiness. Record source/bundle identity and executed outcomes below.

## Evidence

Artifacts: `/home/user/.codex/artifacts/imagegen-studio/saved-accepted-index-2026-10-02/`.

Behavior RED preceded the implementation: real ProjectService Import/edit/Save
completed but the saved-history owner was absent (`backend/red-service-save.log`).
A stronger native RED exercised actual Electron Add → dirty Recover → Save against
all five recorded bundle hashes of the previous `8f7d501` implementation (current
base `195ecff` changed only docs). The `.igs` contained two accepted layers, while
the new SQLite assertion received zero rows instead of two: exit 1, 14 earlier
checks, 25 screenshots and no page errors (`native-red/`). Fixture migrations use
`dist/main/migrations`, the same schema history as the tested main process; an
initial source/bundle migration mismatch stopped at restart and was not counted
as feature RED (`native-baseline/`). Fixtures still use source Queue/staging owners
and controlled generation pixels; the tested Add/recovery/Save stays in built main.

Migration `0011` is empty derived storage; DB types were regenerated by
`pnpm run app:db-types`. Backend focused tests executed 81/81 with zero failures
or skips. Real `.igs`/SQLite checks cover imported exclusion, actual seed 0 and
uint32 maximum, copied checkpoint/acceptedAt ordering, original versus current
asset dimensions, repeated saved replacement, unsaved edits/Undo, Copy/rename,
repeated candidate provenance, unhealthy/Trash/foreign lineage, restart and full
DB-loss rebuild. An actual SQLite trigger aborts insertion of result 101 after
one successful batch of 100: parent and all history changes roll back. Real
ProjectService Save remains committed with its index warning; Home Refresh
repairs parent/fingerprint/result lineage before another Save is attempted.

Five isolated source mutations were executed (`backend/mutation-summary.json`):

| Mutation                                               | Executed tests | Failed |
| ------------------------------------------------------ | -------------- | ------ |
| Omit saved-result replacement delete                   | 18             | 4      |
| Remove the indexing SQLite transaction                 | 18             | 1      |
| Use current asset width as original output width       | 18             | 1      |
| Expose retained unhealthy/fingerprint-less source rows | 18             | 2      |
| Expose trashed source rows                             | 18             | 1      |

Every mutant exited 1 for a behavioral failure. Baseline and every restored run
passed 18/18 without skips; production source was never mutated. Index source
SHA-256 remained `bf894f580d5df5440420f89d9038cfa320ca35297344a56facab405297074523`.

Full app tests passed 777/777, no failed/cancelled/skipped cases. The first full
run caught a neighboring ModelRepository test's old migration count (10 instead
of 11); after updating that explicit version assertion the full run passed.
Typecheck, lint and app build passed. The new native Results run passed 19 checks,
29 screenshots and zero page errors, including actual main-process Save/index,
unsaved/canceled Add and shadow Recover exclusion, persistence across reopen,
and workspace Refresh rebuilding 32 generated results (original 64px output,
current 16px assets, seed 0) without affecting the neighboring Project.

Neighboring native Desktop smoke passed (real main/preload/filesystem/SQLite).
Generate/Queue Manager smoke passed 29 checks, 31 screenshots and no page errors;
both ran sequentially after Results against the same final bundle. Typecheck and
lint were rerun after the neighboring migration-count test update and passed.
Source, all shipped migration and bundle hashes plus actual run outcomes are in
`delivery-identity.json` in the artifact directory above.

Source-aware review was performed by another agent; it found no
concrete code defect and identified stale current-status documentation, now
corrected. This was not a blind review. No renderer/prototype UI changed, so no
new visual design or prototype run is claimed. The Project-local list and
backend metadata index are delivered; global browsing/navigation/public IPC,
Smart Patch, full GPU pipeline and release runtime are not proved by this slice.
Public PP-005/007/008 readiness is unchanged.
