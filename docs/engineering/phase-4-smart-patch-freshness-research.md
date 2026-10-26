# Selected Smart Patch freshness

## Current result

The final CPU/native profile passed nine checks in `native-current-r3.json` after
the focus correction: automatic matching row/browser, missing-model independence,
actual lower-source change and one Undo, unchanged upper contribution, explicit
Refresh/focus/Escape, real Save/close/reopen and the production/no-runtime
`Unverified` control. All document/history/package/provenance read-only assertions
passed, with no page errors and two normal physical native exits. It used the
existing source-checkout Pillow CPU adapter explicitly; installed inference and
installer recovery are not qualified by this slice.

Visual inspection at 1440×900 and 1000×640 confirmed ready/outdated/unverified
states and readable browser diagnostics. It also found the long row-ready label
clipped in the narrow window. The row is now compact `Inputs match` (browser:
`Matches current inputs`) with singular `1 variant`; a final native repeat checks
actual summary scroll width against its client width at 1000×640. The final row has `clientWidth = scrollWidth = 125` CSS px. The repeat passed
in 10.983 seconds, with zero swap and a physically empty launcher group. Both
native launches exited with code 0; 49 observed native/CPU identities plus two
fixture/preflight Python identities physically exited. All 71 source-file and
final bundle hashes match. The earlier `native-current-r2.json` already passed
the complete behavior matrix before this compact-label correction.

## Scope and expected behavior

Continuation over clean `10115df` on 2026-10-21. Automatically inspect the selected
stored Patch and show whether its active variant matches current inputs after
Open, editing and runtime changes. The variants browser uses the same inspection
owner. Matching pixels remain independent of resource availability and Generate
readiness. Preserve PP-007/008 status and the existing negative scope in
[Smart Patch Layer](../features/project/generate-mode/smart-patch-layer.md).

## Research

Confirmed: `ProjectService.toTab` deliberately projects only authored freshness;
it never composes current source pixels. The row's `unverified` is therefore an
honest default, not evidence that healthy worker shutdown broke inspection.
`getSmartPatchVariants` already captures actual below-target source through a
CPU worker, checks document identity/revision around awaits and returns explicit
unknown diagnostics on ordinary failure. An uncertain worker exit is a refusal.
The browser alone called this endpoint and kept its result locally. No result
could update the layer row, and selection/reopen did not request one.

Medium-risk renderer behavior change: add a transient serialized latest-owner
reader shared by automatic selected-Patch inspection and the browser. Keep Main,
CPU lifecycle, resource lifecycle, storage, provenance and document DTO unchanged.
The reader belongs to App, above keyed ProjectView mounts, so one active read
plus the newest waiting owner bounds rapid edits and tab navigation; late success or
failure cannot cross tab/document/revision/layer ownership. Pending drafts,
reload-required state and busy actions suspend automatic reads and clear stale
results. A matching unavailable model must not make verified stored pixels stale.
Only the current selected/browser owner receives a transient verified row label;
other rows retain authored freshness. No background scan of every Patch, polling,
persisted freshness or inferred ready state is introduced.

Generation lifecycle ordering is confirmed: `GenerationActionController.startDrain`
emits after awaited `dispatch.runNext()` (which includes Runtime close), and in
the drain finalizer. These events invalidate the reader without depending on a
runtime status change. CPU inspection itself emits neither generation nor runtime
status changes, so it cannot recursively invalidate itself. Explicit runtime
actions also invalidate on settlement even if the advisory status is unchanged.
Catalog settlement refreshes resource diagnostics separately from source matching.

## Verification plan

- Barrier-based reader regressions: newest queue, ABA/revision/owner changes,
  foreign replies/member sets, stale errors, refresh, suspension and disposal.
- Actual Electron Open/select/row/browser, Save/reopen, changed lower source,
  unchanged upper/own contribution, missing model versus unavailable CPU source;
  verify read-only document/provenance and visible states. Existing stored pixels
  are a declared fixture, not newly trained inference.
- Focused renderer/Main source-freshness neighbors, typecheck, lint and fresh
  desktop build. No prototype changes, ML weights or inference qualification.
- Separate compact evidence from disposable CPU runtime; physical exit and exact
  owned-path cleanup before handoff.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-freshness/20261021-selected/`.
Executed results and any unavailable boundary will be recorded after checking.

## Review and execution notes

Read-only renderer research confirmed the intentional Main summary and missing
browser invalidation, without diagnosing an installed worker defect. Integration
review caught a cross-mount queue gap: per-ProjectView readers would submit
independent requests during rapid tab switches. The reader was moved to App;
ProjectView only submits/suspends its captured owner. Main ownership is unchanged.

The first typecheck found a generation-comparison prototype consumer of the shared
LayerStack. Its new display prop is optional, preserving Raster-only consumers.
The first full prototype run used eight workers and exhausted the unchanged 3 GiB
cgroup after 10 reported successes. It is an infrastructure interruption, not
semantic RED. Its receipt confirms zero swap and an empty process group; the same
180-test suite passed with one worker under the same memory allocation in
374.138 seconds (peak 2,526,302,208 bytes, zero swap, physically empty group).

Follow-up static review found the App-owned reader correction clean. It does not
replace native execution. The affected suite passed 393 tests with no failures,
cancellations or skips; the new reader contributes 36 of these. Final App-owned
Vue integration is checked separately after that move.

The unchanged baseline bundle (exact R5 bundle hashes, source base `10115df`)
reproduced the feature gap: actual IPC reports `ready`/`sourceVerified: true`,
while the visible row stays `unverified`. `native-baseline-r2.json` retains the
failing row assertion plus matching-source control and normal physical exit.
The first baseline attempt found a harness-only close bookkeeping error after
physical exit; the raw report is retained with an independent PID/start/cgroup
exit proof. Capturing the child before Playwright close fixed that harness error
without changing any scenario assertions.

The first new-build native attempt reached matching automatic row/browser,
missing-model independence and lower-source change/Undo, then found a real
keyboard issue: disabling the focused Refresh button lost focus, so Escape no
longer reached the nonmodal panel. The same Escape assertion is retained; Refresh
now restores only its own lost body focus once enabled and does not override a
user focus move. The native check additionally requires the refreshed button to
regain focus. `native-current.json` is partial (four checks), with normal exit;
it is not a full qualified baseline. Before correction, the component source
was saved as `focus-red-SmartPatchVariantsBrowser.vue`.

## Verification boundaries

Runtime/catalog/post-dispatch invalidation wiring was traced and reviewed; the
reader covers same-owner refresh and late replies. Open/revision/manual refresh,
CPU availability, source contrasts and Save/reopen run through actual native IPC.
No installed trained generation, installer recovery or actual post-trained-CUDA
shutdown re-verification was rerun here. The prior R5 inference evidence remains
separate. Neither resource availability nor the compact freshness label qualifies
Generate. Retry, orphan conversion, accepted-history navigation, Compare/Preset,
arbitrary options, quality and release remain open; PP-007/008 are unchanged.

## Final checks

- Affected TS suite: **393 passed, 0 failed/cancelled/skipped**, including the 36
  barrier-driven reader cases. Main source/resource/lifecycle controls remain real
  at their declared test boundary; controlled compositor output is labelled in
  the existing service freshness tests.
- Full prototype suite: **180 passed**, one worker, 374.138 seconds, zero swap,
  confirmed group exit. The prototype comparison consumer retains the optional
  LayerStack display prop; prototype mocks do not prove production persistence.
- Final `pnpm run typecheck`, `pnpm run app:build`, global lint and final touched
  Vue/script lint passed. The build's existing large-chunk notice is nonfatal.
- Native R3: **9 checks**, two isolated launches, 8 screenshots, no page errors,
  exact PNG/IGS/provenance/history controls. Actual viewing included baseline,
  ready browser, lower-source outdated, narrow matching row and no-runtime
  diagnostics. Screenshot review caught the clipped long row label that pure
  behavior checks had not caught.

The tested tree is dirty over `10115df`; there is no commit or publication.
`delivery-manifest.json` binds reports, source snapshot, checks, cleanup and
final inventory. Original reports remain immutable; cleanup has a separate proof.

## Artifact handoff

`fixture-cleanup.json` confirms all five exact owned native fixture roots idle,
all recorded PID/start identities exited, cgroups empty, deadline units stopped
and no live references before deletion. The first baseline's raw close-bookkeeping
failure is bound to its independent exit proof; all later runs confirm their own
normal native exits. No original report was rewritten.

Removed **72,089,600 allocated bytes** of disposable isolated app/cache/scratch
payload. Seven small original portable `.igs` snapshots, captured CPU source PNGs,
final and significant RED screenshots, logs, source/bundle identities and the
read-back-verified `qualified-source-bundles.tar.gz` remain outside payload roots.
Lifecycle records release the read-only repository worker borrow. The repository
venv, global caches/Python, ordinary user app data and original model/image files
were not disposed. No ML weights or runtime copies were created in this phase.

The artifact root is about **2.69 GiB** after cleanup; this phase's compact
retained evidence is about **9.9 MiB**. Historical evidence/pins remain outside
this phase's disposal boundary, including the existing compact-evidence budget
exception. Final exact allocation and source/document hashes are in the manifest.
