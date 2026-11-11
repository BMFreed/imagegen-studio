# Home project search, sort and status controls

Base `4e5f291ba96e76a4c29a54a135be0995a8812413`, clean master/origin at start.
Scope: PP-001/Home browse contract with read-only PP-007 metadata. Medium risk:
nullable IPC projection and shared Home state; no package/lifecycle/schema write
or model/worker/queue/recovery mutation is introduced.

## Fresh sources and finite contract

Clean Invoke checkout re-read: `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/workbench/launchpad/projects/projectLibraryView.ts` owns pure name filtering,
copied-array sorting and finite parsed dates; `ProjectsBrowser.tsx` calls that
pipeline with library summaries/search/sort/open IDs. Studio adapts this owner,
without pins, grouping/date buckets or virtualizer changes. Natural case-insensitive
numeric name sort follows Invoke; Studio status predicates and Last opened/Modified
fields follow its accepted Home contract/prototype. Exact Studio recovery/attention
flags are absent from Invoke; this adaptation was reported before implementation.

Current Vue/Naive sources: `HomePrototype.vue`, `HomeBrowserToolbar.vue`,
`home.utils.ts`, `home.types.ts`; Home component/design/audit guidance was read.
`Needs attention` means unhealthy file OR absent/unavailable workspace. A ready
Project with recovery, stale/invalid recovery or missing/unavailable preview is
not automatically attention. `Open` uses real runtime tab IDs; `Recovery available`
uses actual Main `recoverable` status. Search matches display name only, trim and
case-insensitive. Reset clears search/status and retains sort. Controls live in App
for the current app lifetime, so Home remount/Project/workspace/Projects/Trash
navigation retains them; they are not new persisted global settings.

## Owners and metadata boundary

`HomeView` invokes a pure shared view adapter over authoritative Main summaries and
workspace/tab projections. Input arrays/records remain unchanged. Three finite
sorts: Last opened descending (default), Name ascending, filesystem Modified
descending. Unknown/legacy timestamps sort last, including relative to pre-epoch
known times. Equal timestamps use natural name then opaque ID, making ties stable.
This is an explicit deterministic adaptation of Invoke's nullable date comparator.

Main adds optional `lastOpenedAt`/`modifiedAt` to ProjectSummary (and inherited
Trash). New producers emit canonical ISO or null; preload accepts omitted legacy
fields, validates canonical finite strings/null when supplied. New batch index
projection selects key/mtime once without per-row N+1 or an ID-IN parameter bound.
`ProjectIndexRecord`, schema, durable Move/Rename/Trash JSON and immutable provenance
stay unchanged. Active metadata comes from existing saved/cached index state;
pending and Trash use their frozen Project/witness data. No current Canvas or
unsaved draft is a timestamp source. Advisory Home reads can overlap ordinary
Save; the later action owners retain their authoritative checks.

Bounds are validation rules, not capacity claims: legacy date input128 characters,
signed decimal nanoseconds up to22 digits, JS Date range±8,640,000,000,000,000ms;
ns truncate toward zero to millisecond presentation as JS Date does. Malformed,
out-of-range or absent data stays null, never fabricated `now`. IPC canonical
ISO is at most32 characters. Existing 255-byte filename and lifecycle guards are
untouched. Layout uses the approved toolbar vocabulary with responsive columns;
no fake grid toggle, Inspector or full-preview consumer is added.

## Gaps reconciled before implementation

Existing production Create/Import/workspace metadata/reveal/Trash/Move/clean-open
Rename and ordinary preview rebuild are already connected. Remaining material Home
gaps include proved-missing cache-only Remove from Home, identity-preserving
Locate/Relink, selected-project Inspector/full saved preview, zoom/pan/grid and
bounded resize/selection interactions. Current preview protocol only serves the
thumbnail; stretching it would not qualify a full saved preview consumer.

Fresh Invoke library-delete/project-lifecycle sources were also inspected for the
missing-entry lane: authoritative server DELETE cannot be copied as cache-only
`.igs` forget, and file import allocates fresh identity rather than relinking.
That separate filesystem lane was not implemented here. Dirty Rename still requires
explicit Save/close. Models hard removal/contexts, exports, release Install/Repair/
updates/rollback, compatibility/NoobAI, visual/capacity and MVP gates remain open.
PP-001/005/007/008 stay `Пока не обещать`.

## Verification and artifact scope

Tests use real SQLite/IGS/index for timestamp projection, actual Service pending/
Trash summaries and preload; shared view tests cover orthogonal statuses, stable
nullable sorts and immutable inputs. Existing Electron harness exercises actual
Main timestamps, Home controls/remount, no-match Reset and recovery/attention
fixtures. Controlled disk mtimes/recovery setup are preparation, not a crash test.
No ML/runtime/weights copy or SHARED dependency. Source review, authored tests,
ROOT execution, semantic mutation/restoration and retained-byte audit are distinct.

RUN `runs/home-project-browse/20261111`; initial root29GiB(shared17/runs12),63GiB
free disk, GPU9,946MiB used/6,074MiB free. Existing GPU users were not stopped.
Checks4GiB/600s/zero swap, native launcher2GiB+app2GiB/600s controller/300s lifetime.
Short owned TMPDIR `t-hbr-1111`; only exact generated idle paths may be disposed
after retained-byte/physical-exit/restoration/dependency proof.

## Executed results and limits

ROOT executed the affected Main/shared set: **206 PASS, zero fail/skip**
(`affected-r2.log`), covering index, metadata, workspace Service, Move/Rename,
Trash, preview resources and preload. Focused first pass:41 PASS. The first
affected pass had205 PASS/one old assertion that summaries were identical before
and after Open. It now explicitly verifies the genuine changed `lastOpenedAt`,
all other fields unchanged, then exact cold-reopen equality; this was not a
semantic mutation result. Final TypeScript/Vue check (`typecheck-r2`), all four
lint partitions (`lint-r1`), scoped HomeView lint after the input fix and app build
(`build-r2`) passed. The single unchanged full-lint parser exclusion is
`scripts/qualify-installed-regional-init.mts`; the build retains its existing
renderer chunk-size advisory. No prototype files changed; no new Python/inference
or unchanged release/migration matrix was run for this read-only consumer.

Built-app `native-r2.json`: **11 checks, two normally closed physical lifetimes,
six screenshots, zero page errors**. Actual Main Open/Close establishes Last
opened; controlled owned saved-file mtimes establish Modified independently.
Name-only search, all three sort orders, no-match Reset retaining sort, actual
Open tabs and controls surviving Home remount/workspace/Projects/Trash navigation
are verified. Package bytes remain exact during browsing. After physical closure,
real `ProjectShadowStore.write` creates the recovery-only fixture and real
`saveIgsPackage` creates a preview-unavailable control. These prepare verified
conditions; they do not qualify a crash/recovery flow. Temporarily moved owned
file/workspace fixtures exercise genuine missing/access states. The exact
directory/file and package/shadow bytes are restored before normal closure.
Main/IPC replies are real; OS picker replies are controlled. No inference runs.

The first native pass found an actual accessible-name regression: the new visible
`Name` label overrode the search name. Passing `Search projects` to Naive NInput's
real input through `inputProps` fixed it. Final typing/build/native passed on the
fixed source. `native-r1.json` retains the diagnostic and its normal physical
closure; it is not counted as a passing qualification.

ROOT visually inspected all six final screenshots at900×620 and1440×900: toolbar,
filtered rows, recovery, independent preview/missing conditions, unavailable
workspace and restoration. No material new layout defect was observed in this
bounded self-review. This is not a full accessibility/performance or broader Home
design acceptance; smaller-window responsive behavior is source-reviewed only.
Two source-only cross-reviews report CLEAN/READ_FINISHED, each excluding its own
implementation. They are not independent runtime executions.

One isolated shared-view mutation adds recovery-only Projects to attention.
The real selector test fails on the unexpected `recovery` row, with neighboring
sort/search controls GREEN: **nine selected executions = eight GREEN and one
intended semantic RED**, stages exit0/1/0. Root/isolated source SHA agrees after
exact restoration. No setup/OOM/timeout failure is counted as semantic evidence.

## Retention and reproduction

Compact authoritative reports are `qualification-summary.json`,
`source-reviews.json`, `mutations.json`, native reports/screenshots and bounded
resource logs. `final-source.json`/tar preserve the complete staged tracked source;
`delivery.patch` preserves the staged delta. `qualified-bundles.json`/tar preserve
the exact checked app bundle bytes. `payload-inventory.json`/tar preserve every
owned fixture, SQLite sidecar, package and isolated mutation source by type, path
and SHA without following symlinks. `physical-exit-recheck.json` verifies exact
PID/start identities and observed cgroups. `final-retained-audit.json` records the
separate retained/live-byte review; `artifact-lifecycle.json` records actual
disposal, dependencies and reclaimed allocation. Audit and cleanup outcomes must
be read from those final records, not inferred from this procedure.

For a fresh execution, build the qualified source and use
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT --browse-only`
under the recorded bounded controller/short owned TMPDIR. Re-inventory disk and
processes first. Do not reuse an old native report or resume removed raw paths.
For retrospective inspection, reconstruct only into a new owned artifact path
from the manifests/archives; the mutation clone's node_modules symlink points to
the workspace dependency tree and is not a retained ML/runtime dependency.
Preserve evidence levels and PP statuses when reporting this checkpoint.
