# Home selected-Project session continuity

Base `67be16f82487708399df75b9f2a2a94db9a3f135`, clean master at entry.
Medium UI-state change in App/HomeView only. PP-001 and Home acceptance retain
the selected visible Project across Home remount within the App session. Public
promise statuses stay **«Пока не обещать»**. No Main, preload, shared filter/API,
storage, queue, worker or Project provenance behavior changes; no new non-UI
application mechanism or fresh Invoke review is claimed.

## Source and finite gap

Home contract: browser scope changes clear selection; filtered-out Projects are
not silently replaced; closing/reopening Home preserves the selected Project
when still visible. Default startup has no selected Project. The approved
prototype retains its local selection because App uses `v-show` for HomePrototype.
Production App uses `v-if` and destroys HomeView on every Project navigation;
HomeView's local selectedProjectId therefore loses its Inspector owner. Browse
filters, view and panel preferences already belong to App session.

Current sources read: production App Home refs, scope setters/refresh, HomeView
binding and Current/New/Create/Import consumers; HomeView selection/filter/scope
watchers and Inspector; prototype App/HomePrototype; Home contract browser and
acceptance sections. Existing saved-preview source validation/camera reset is a
separate unchanged owner. Model/layer mock fields are not automatically new API
requirements. Real filename in compact rows remains a separate metadata consumer
requiring its own non-UI source check; title plus `.igs` is not a trusted filename.

## Implementation and preserved boundaries

App owns the selected ID, initialized null, beside its existing browser state.
HomeView binds it with required `defineModel`, retaining its existing click,
filter and scope-clearing consumers. App also clears the ID when its actual scope
refs change, including while Home is unmounted. No new persistence setting is
introduced. The existing shared `selectHomeProjects` pipeline is reused unchanged.

Visible-row validation runs immediately when Home mounts, then on subsequent
list/filter/status/sort changes. This prevents a retained but currently hidden ID
from selecting itself later when a filter is cleared. A real reachable example:
Status Open → select already-open B → activate B → Close B → Home remounts with
B excluded → All shows B again, still unselected. Merely observing the empty
Inspector before All would not detect a latent retained ID.
The native sensitivity control must hold the actual close-triggered catalog
responses until All is chosen: refresh also requests workspaces/Trash in parallel,
and a later workspace-array update can mask a missing immediate watcher. A plain
settled Close or a single held Project list is not sufficient sensitivity proof.

Ordinary refresh retains cached rows, so loading alone does not clear a valid
selection. A still-visible ID survives sorting, view/collapse changes, Project-tab
navigation and Home Close/reopen. A scope change or row disappearance clears it
without selecting another row. Context menus remain ephemeral; Current/New and
Create/Import presentation, unique tabs and explicit recovery are unchanged.

Selection is independent of Open and Save. It must not update lastOpened, package
bytes, document revision or generation state. Preview remains the existing saved
source viewer; zoom/pan/camera, row focus/scroll and cross-launch settings are not
new persistence claims. Full Home/Models/export/runtime/release/visual MVP acceptance
and the actual filename consumer remain separate.

## Validation and artifacts

Focused built-app checks cover initial null, selection-only byte/SQLite controls,
select A → open B in New → Home, Project navigation and Close/reopen, view/sort/
collapse/refresh preservation, filter/scope invalidation and the critical Open
filter remount sequence. A held actual list refresh may control timing through
the original Main handler, restoring exact callback identity without fake replies.
A second normal lifetime confirms session reset. No replay of the preceding
Create/Import/gesture/recovery or destructive lifecycle matrices is needed.

Meaningful unchanged filter/navigation controls, typecheck/build and all lint
scopes accompany the native consumer. Lint uses the previously documented exact
four-scope test adapter with3072MiB child heap under4GiB group limit; original
2048MiB repository launcher is unchanged, and its old OOM is not replayed or called
a new execution. Same config/scopes and sole parser exclusion
`scripts/qualify-installed-regional-init.mts` remain. No prototype source changes
or prototype/Python/ML/release qualification are claimed. Medium UI scope requires
no domain mutation; authored/source checks and actual runtime stay distinct.

Fresh RUN `runs/home-selection/20261112`, temp `t-hs-1112`, under artifact root.
Initial root29GiB/shared17GiB/runs12GiB, disk62GiB free; GPU4969MiB used/11051MiB
free. No GPU work or foreign-process intervention. Checks serial4GiB/600s/zeroSwap;
native launcher2GiB plus own app2GiB, controller600s/lifetime480s. No runtime/model
copy or SHARED dependency. These are test envelopes, not product capacity.

Retain source/bundles/payload bytes, manifests, reports/screenshots and independent
audit before exact idle cleanup after readers, restoration and physical PID/start/
cgroup exit. Historical raw profiles were removed and are never resumed. Final
release/commit proof binds executed bundles and frozen source to live master.

## Executed qualification

ROOT final `native-r2`: **8 PASS**, two normal physically closed app lifetimes,
three screenshots at1440×900/900×620, zero page errors or Vue warnings. Alpha
selection is read-only; explicit Ctrl-Open of Beta, return from its Project tab,
Home Close/reopen, List/Name sort and Inspector collapse/expand retain Alpha.
Held real list refresh preserves cached selection during loading and after the
original response. Name/Status filtering and Projects/workspace/Trash switches
clear selection; matching rows returning do not auto-select either Project.

The critical Open-filter case holds all three actual catalog handlers. Home
remounts after Beta closes, with every catalog response still unfinished. Actual
Status All shows Beta unselected before release and after the original replies.
Two handler controls restore exact identity: list-only ordinary refresh and
list/workspaces/Trash close refresh. The Add Workspace OS picker callback is also
restored. Only timing/input selection is controlled; no Project/catalog replies
are fabricated. A fresh app lifetime starts with no selection despite selecting
Alpha immediately before the first normal exit.

Both saved `.igs` and original backups remain exact. Final SQLite has two Project
rows/two workspaces; all catalog fields except derived indexed_at and the one
explicit Beta lastOpened remain stable. Alpha is never opened by selection, no
Save occurs, and no dirty-close confirmation is needed. This does not qualify
saved-image rendering/camera, crash recovery or cross-launch preferences.

Typecheck/build and **24 unchanged filter/navigation tests** PASS, zero fail/skip.
All four lint scopes PASS through the documented3072MiB test adapter using the
same config/sole baseline exclusion; final changed harness has scoped lint/syntax
checks. Standard2048MiB launcher and its prior OOM are not rerun or relabeled as
current success. The existing build chunk-size advisory remains. No prototype
source, shared algorithm or non-UI owner changes; their large matrices are not
repeated. No domain mutation is required/performed for this medium UI state slice;
the causal native transition is not an executed semantic-mutation RED claim.

Independent two-owner source review is CLEAN/READ_FINISHED. ROOT read the final
harness and viewed all three final screenshots plus the setup-failure control;
selected-row/Inspector and unselected states fit their normal/narrow surfaces.
Transient hovered tooltips are ordinary UI, not evidence of persistent clipping.
No material local defect was observed; this is bounded self-review, not full
Home visual/MVP acceptance. Inactive-scope clearing is source-reviewed; fake
inaccessible UI actions are not used to claim its native coverage.

Excluded `native-r1` fails before its first check because direct Main fixture
Create does not refresh an already-selected Renderer workspace. The harness now
uses the actual header Refresh after setup and stores its descriptors before UI
assertions. Its exact old harness, raw profile and screenshot remain retained;
its one app lifetime closed normally. This setup error is not semantic RED or
additional qualified checks. Production source and bundle did not change.

## Retention and reproduction

RUN retains reports/screenshots/logs, resource/physical-exit proofs, source review,
exact failed harness, lint adapter/config hash, full source and qualified bundle
archives, all payloads/inventory, independent retained-byte audit and release/
commit proof. Exact idle profiles/temp paths are removed only after archive/live
verification, READ_FINISHED, handler restoration and final physical recheck.
Lifecycle records actual reclaimed bytes and removed paths. SHARED and ordinary
app data remain protected. Historical raw paths are not resumable after cleanup.

Reproduce with a fresh owned evidence directory/TMPDIR after lifecycle inventory,
`pnpm run app:build`, then `pnpm exec tsx scripts/smoke-home-selection.mjs
--report-file <fresh-dir>/native.json` within the recorded envelopes. It creates
its own neutral fixtures and never consumes old raw profiles or ML environments.
Archives are checked against manifests without following symlinks. Source/runtime,
visual and retention results remain distinct; public statuses are unchanged.
