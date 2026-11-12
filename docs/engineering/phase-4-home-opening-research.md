# Home opening targets, gestures and recovery presentation

Base `83179d52b187d3c8a4566d892109a115edb8d94d`, clean master/origin at entry.
PP-001 Home browser/navigation composition, with PP-007/008 explicit document and
recovery decisions preserved. Medium UI-navigation change adjacent to existing
Open/recovery owners: no Main/preload/shared API/storage/queue/worker/provenance
mechanism change. Target changes presentation only, never the Project ID or
Recover/Discard command. No new Invoke application logic is introduced.

## Current sources and finite contract

Home opening rules in `home-screen.md` and `04-ui-ux-navigation.md`:
plain click selects; double click/Enter/current Open replaces Home after success;
middle/Ctrl/Cmd click and Open in New Tab retain Home, insert the new tab beside it;
already-open Project always focuses its existing tab without duplication/reorder.
Right click selects and offers the same guarded actions as overflow. Grid and List
share the same article/controller; nested controls retain their own commands.

Approved UI sources: prototype App `openHomeProject`, HomePrototype pending open
intent through recovery, Card/ListRow modifier/context handlers and Inspector.
Existing Vue/Naive design and component APIs remain authoritative. Invoke workbench
UI is not substituted for this accepted document-tab model. Since only presentation
changes, no prior Invoke non-UI review is relabeled as fresh research for this step.

Production path: Home gesture → explicit `(projectId,target)` event → Home-specific
App wrapper → existing `openProject(projectId,preserveResultOpen,isCurrent,homeIntent)`
→ unchanged ID-only Main Open → actual opened/recovery-required result → existing
focus/unique-tab projection plus Home-only placement. Current and New both put a
new tab at index0 of Project tabs (Home itself is rendered first); Current closes
Home only after success. Existing tabs use the original early focus branch and
keep order/Home. Import/New Project/Queue/accepted-history entry points retain
prior presentation; this finite slice does not claim their universal Current/New
parity. In particular the shared function's second positional boolean remains a
boolean for Queue/History; no target string is wired into that slot.

Main `index.ts` Rename/Move finally sends actual `tabsChanged` snapshots in service
insertion order. `reconcileProjectTabs` updates known IDs in their Renderer order,
keeps removal/document-change cleanup and appends genuinely new IDs in incoming
order. This is UI projection only. An actual same-name closed Project Rename is a
no-op maintenance control that emits the real snapshot without rewriting a package;
it does not qualify the broader Rename UI/lifecycle matrix.

## Context and recovery ownership

Home requests capture Project ID, target and a presentation epoch. Close Home or
reopening a closed Home advances the epoch. Existing `isCurrent` stale-result lane
retains a Main-owned returned tab without stealing a newer focus or closing a newly
reopened Home. Tab activation during pending ordinary Open keeps its existing busy
guard. No inference/worker cancellation or hidden Save accompanies these UI changes.

Recovery-required stores its Home intent with the exact recovery Project/epoch.
Recover/Discard success applies that intent; Cancel clears it and keeps Home;
retry errors keep the captured intent. Generic Open and non-Home Import recovery
assignments cannot inherit that Home target. An invalidated Home recovery result
retains the Main-owned tab without focus. Actual pending recovery ID and the
explicit decision still go unchanged to the existing resolver. Shadow and saved
package effects belong to that preexisting owner, not the presentation helper.

Success is bound to the immediate Open/Recover return, not `homeError`: Refresh
can produce an advisory error after a successful Main Open. No tab is closed or
replaced before Main succeeds, and Current replacement removes only Home rather
than another Project or its unsaved state. App-owned browse/layout preferences
remain available when Home is reopened; transient row selection may reset as before.

## Guards and UI consumers

Closed unhealthy, unavailable-workspace, pending or Trash Projects preserve their
existing opening restrictions. A supplied already-open ID has a narrow focus-only
exception even if its file/workspace later disappears or relocation is pending;
App focuses its existing tab without another Main Open. This is not looser Main
admission, Save, relocation or lifecycle validation. Busy and Trash remain guarded.
PendingMove/Rename exact focus intersections have source coverage unless explicitly
listed in native evidence; do not fabricate operational records as UI proof.

Modifier double click cannot fall through into a later Current open. Manual context
menu closes when its row disappears, scope/view/busy changes, outside click or
Escape. Inspector adds Open in New Tab using the same canOpen guard. Selection,
preview and file actions retain the current owners and palette; no design reset.

The actual native repeated-Right-click control exposed a Naive dismissal edge:
installed evtd0.2.4 `lib/traps.js` records mousedown outside a retained menu, then
calls clickoutside on mouseup after the row's contextmenu has reopened it. Naive
PopoverBody forwards that callback. Home ignores only that right-button mouseup
on the same passive row owning the current context; nested controls and other
outside targets still close it. Native event trace, repeated-row reopening and
ordinary outside-click dismissal are separate controls, not a timing delay.

Legacy Inspector/Grid qualification scenarios now explicitly choose Open in New
Tab where they test returning to existing Home, and workspace lifecycle helper
reopens Home through the actual Open Home button when absent. These source changes
do not claim replaying all old native matrices or retain old default semantics.

## Evidence plan and limits

Actual built native checks: ordinary Current/New order with existing tabs; Grid/
List modifier/middle/Enter/double/context/Inspector actions; no duplicate existing
dirty recovered tab; Cancel/error target clearing; Recover-new and Discard-current;
existing-open Missing focus without a Main Open call; causal held real Open while
Home closes/reopens. Main handler wrapping may control timing and observe calls,
but must delegate to the original, restore exact identity and never fake replies.
Real package/shadow inputs are prepared while physically closed, with backups before
explicit recovery decisions. Dirty recovered fixtures must resolve through explicit
Discard/close before normal app shutdown. This is not crash recovery qualification.

Unchanged Queue/result and accepted-history navigation tests are adjacent controls,
not proof of new Home UI. Typecheck/full lint/build, actual gesture/IPC/SQLite/tab
results, bounded screenshot self-review, independent source review and retained-byte
audit remain separate evidence. No prototype source change, inference/release matrix,
ML/runtime/model copy or SHARED dependency. Cross-launch preferences, richer Home
metadata, complete Home/Models/export/runtime/release/update and MVP acceptance
remain separate. PP-001/005/007/008 remain **Пока не обещать**.

RUN: artifact-root `runs/home-opening/20261112`; temp `t-ho-1112`. Initial root29GiB
(shared17/runs12), disk63GiB free, GPU1318MiB used/14702MiB free. No GPU/foreign
process changes. Serial checks4GiB/600s/zero swap; native launcher2GiB plus owned
app2GiB/controller600s/lifetime300s initially (final test-only budget480s). Retain exact source/bundles/fixtures and compact
evidence before precise idle payload cleanup after readers/restoration/physical exit.

## Executed qualification

ROOT final `native-r9`: **19 PASS**, two normal physically closed app lifetimes,
six screenshots at1440×900/900×620, zero page errors or Vue warnings. Actual
Current/New/unique-existing targets, modifiers/middle/Enter/double/context/Inspector,
both Cancel directions, Recover-new and Discard-current pass. The recovered shadow
matches the entire prepared document with the existing owner's fresh revision;
it is dirty, bbox x8, while saved Discard is clean bbox x0. All eight saved packages
and identity/location/revision fields remain exact. Only explicitly opened keys
change lastOpened. Original packages and both pre-decision shadow inputs are
retained separately; explicit Recover/Discard and dirty Close legitimately change
or remove live shadows, so final live-shadow equality is not claimed.

The actual maintenance snapshot arrives in Main Anchor/New order while Renderer
keeps Home/New/Anchor. Its observer unsubscribes. Dirty Missing existing focus has
zero Main Open calls; the closed Missing attempt really delegates Main and receives
PROJECT_NOT_READY. Held real Open survives Home Close/reopen with Anchor focus,
Home present and the opened tab inactive. All three pass-through Open wrappers and
the controlled OS fixture picker restore exact original identity. Trash performs
actual Move/Restore with no Open targets. No permanent Delete is executed. The
recovered dirty tab uses explicit Discard Changes before normal shutdown. Exact
owned Missing filename is restored after physical close.

ROOT independently viewed all six final screenshots and two natural failure
controls. R9's narrow context PNG misses the transient menu; its actual menu actions
pass, and the retained r7 narrow context image supplies the visual bound with the
same HomeView/CSS bytes and unchanged Home-present Chrome rendering. It is not
relabeled as a final-r9 menu screenshot. Current/new/recovery controls fit their bounded surfaces; no
remaining material local defect was observed. These are synthetic empty Projects,
not trained image quality, broad visual acceptance or release/capacity evidence.
The final screenshot pass also caught existing Chrome copy saying `No document`
while a Project is active after Current removes Home. Its existing context span
now stays hidden in that state; Home and truly empty context retain their previous
labels. Native Open assertions cover Home-present and Project-only presentation.

`pnpm run typecheck` final-r6, full four-partition lint-r1 (sole unchanged parser
exclusion `scripts/qualify-installed-regional-init.mts`), final scoped UI/Chrome/harness
lint/syntax and `pnpm run app:build` final-r4 PASS. Build retains its existing
renderer chunk advisory. Two unchanged Queue/result and accepted-history navigation
files give **20 PASS**, zero fail/skip; they are neighbor controls. Prototype files
and Main/preload/shared/Python are unchanged; their large matrices are not repeated.
Independent UI/App/reconcile/context source reviews are CLEAN/READ_FINISHED and
remain separate from ROOT runtime and screenshot checks. No domain mutation was
required/performed for this medium UI-only slice; the genuine context failure and
corrected real gesture control are retained without calling setup errors semantic RED.

Diagnostic runs are excluded from the final19: r1 passes3 then the fixture's UUID
filename makes unchanged-title Rename a real relocation; named Current is now
prepared before baseline capture. r2 passes11 then an incorrect old-revision oracle
fails against existing recovery's fresh revision. r3/r4 pass15 then expose the real
right-mouseup context defect (r4 records exact events). r5 passes16 then the primary
loading button is named `loading Open Project`; the selector now inspects its actual
disabled button. r6 passes8 then attempts Home navigation between Close tab removal
and its refresh/finally; harness now waits for a real remaining Close command to
become enabled. Each r1–r6 diagnostic has two normal physically closed lifetimes and
its exact harness sidecar. The lost typecheck-r2 controller result is diagnostic
only; later bounded terminal checks supersede it. No production guard was loosened
for these harness corrections. The first successful r7 (19 checks/two normal
lifetimes) predates that final Chrome-copy fix; its complete source/bundles/payload
manifests and independent audit remain under `before-chrome-*`, without adding its
checks to final-r9.

R8, after the Chrome fix, passes17 checks but the initial300s test-app deadline
interrupts the explicit dirty Close. Its second lifetime is a forced deadline exit,
not normal closure or semantic RED; only the fixture lifetime is normal. All
observed identities/scopes are subsequently gone. ROOT restores its exact held
Missing package after physical exit, with byte equality for all eight saved files,
and retains `native-r8-restoration.json`. Original shadow backups survive; live
recovery rollback is not claimed. Final-r9 uses a480s test-app deadline within the
unchanged600s controller and unchanged2GiB/zero-swap limits; no production/default
change, foreign-process intervention or capacity claim accompanies it.

## Retention and reproduction

RUN holds `qualification-summary.json`, all nine native reports/screenshots/logs,
exact failed harness sidecars and pre-fix HomeView, source reviews, resource reports,
`final-source.json`/archive, final qualified bundles, payload inventory/archive,
independent `final-retained-audit.json`, physical-exit recheck, lifecycle/release gates
and commit proof. The qualified bundle archive is final-only; diagnostic renderer
versions reconstruct from full retained source plus the exact old HomeView/harness
sidecars. They are not relabeled as retained original failed bundle bytes.

Raw owned payloads/temp profiles are removed only after exact archive/live-byte
audit, all readers finish, wrapper/file restoration, physical PID/start/scope exit
and dependency closure. The lifecycle records actual reclaimed bytes and removed
paths. SHARED/runtime/models and ordinary app data have no dependency here and stay
untouched. Historical raw paths in reports must not be resumed after cleanup.

Reproduction uses a fresh owned evidence directory and fresh TMPDIR under the
artifact root after reading the lifecycle rules, then `pnpm run app:build` and
`pnpm exec tsx scripts/smoke-home-opening.mjs --report-file <fresh-dir>/native.json`.
The harness requires a new absolute report, creates its own profile and real eight
fixtures, prepares closed backups, and never consumes a historical profile or ML
runtime. Apply the same launcher/app/deadline limits. Audit reconstruction reads the
archives against manifests without following symlinks; no stale `--resume` exists.
Release gates bind staged source, executed bundle hashes, retained audit and cleanup
before commit/push; commit proof binds that tree to live origin/master.
