# Regional Guidance — empty-entity foundation

## Research boundary

2026-10-23, dirty `master@10115df581d9e07049478dee3866a280886794fd`, including
all prior Smart Patch/preset work. The independent baseline source archive has
1,313 regular members and matches the current checkout before this owner.
User continuation follows the next [Phase 4](../specs/01-implementation-roadmap.md)
Regional Guidance item after selected Smart Save Current.

The [Regional Guidance contract](../features/project/generate-mode/regional-guidance.md)
and [layer stack](../features/project/generate-mode/layer-stack.md) establish a
separate noncompositing entity group with inseparably owned masks. This finite
foundation introduces empty durable entities and lifecycle only. It does not
claim prompts, inheritance, reference images, painting/transforms or conditioning.
Public PP-001/007/008 readiness stays **Пока не обещать**.

Risk is high because this extends portable Project JSON, current-owner identities,
Undo/recovery and new-generation admission. Research traces schema → strict
preload/Main commands → ProjectService → coordinator/session → shadow → explicit
Save/verified `.igs` loader and index, plus both Generate owners and prepared
queue publication. Independent core/UI research supports the bounded route.

## Decisions and invariants

`regionalGuidance?` is an optional homogeneous document collection, separate from
`layers`, with no parser default. Each entity stores `id`, nonblank `name`,
`enabled`, `locked`, `overlayOpacity` and `mask: { id, revision: 0, asset: null }`.
No kind, bbox, prompt, reference, resource or persisted compatibility field is
accepted. Unknown fields and nonempty/future masks refuse instead of stripping.
Legacy absence remains absent through Open/no-op Save and Undo. Deleting the last
region removes the property. The pre-release schema remains version 1: the new
reader accepts old files, while older strict binaries cannot read the new field.

Defaults are Regional Guidance / enabled / unlocked / display opacity 0.5. The
prototype's 50 percent is display opacity, not inference strength. UUID/name
limits reuse existing rules: valid UUID, at most 1,024 UTF-8 name bytes, opacity
0..1, 16 MiB Project JSON. The 10,000 regional array ceiling borrows the defensive
archive-entry ceiling; it is not measured regional/runtime capacity.

Main allocates entity and mask identities; all current-owned Raster/Smart/mask/
variant/regional identities share uniqueness. Historical lineage and queue/model
IDs are separate roles. Duplicate creates two new IDs adjacent after its source,
with ` copy` appended when it fits the name-byte budget; otherwise the source
name remains. Lock permits selection, enable/disable and unlocking; it blocks
rename, opacity, duplicate and delete. Changed metadata owns one Undo mutation;
equal values own none. Delete is directly undoable without a new confirmation
workflow. Renderer selection remains transient, with an explicit tagged resolver
across the two entity groups.

A selected region uses the explicitly labelled Current Canvas draft, as in the
prototype, and never becomes a Smart draft target. Regional controls stay outside
compositing drag order and blend settings. No regional bbox or Fit action exists.
Current mask/transform gestures cancel on the context change; unsupported region
mask tools and inline block actions show reasons. Empty masks have no overlay
pixels, so opacity is persisted without fabricating a preview.

Any enabled region blocks every new ordinary/Smart Generate, including empty,
locked, unselected or zero-opacity owners. The literal actionable refusal is
`GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED`: disable or delete enabled regions.
This is validation, not a recovery/Repair fence. Checks precede planning, seed,
runtime, queue publication and replacement cancellation, and the final admission
check covers asynchronous staging. Disabled regions are inert. Dispatch, frozen
Retry, existing work, source inspection, Compare, preset extraction, acceptance
and shared capture/composition are not guarded. Source pixels/signatures,
accepted provenance/history and presets exclude regional state.

## Proposed verification

Use real service/SQLite/shadow/package lifecycle for legacy absence, metadata
no-ops, independent duplicate IDs, lock/stale-owner refusal, staged edit/Undo ABA,
Save failure, explicit Save/loader/reopen and dirty recovery. Assert full neighbor
Project/Smart drafts, bbox, variants, exact PNG/provenance, seed and model-policy
preservation. Exercise every current-owner category for collision and adoption
classification. All region mutation IPC uses the shared generation/close gate.

New-generation tests count preparation/seed/enqueue/cancel collaborators before
refusal, cover late enable before SQL admission, preserve existing impact and
verify successful disabled-region controls. Frozen ordinary/Smart Retry stays
independent of current regional edits. A semantic mutation must bypass a material
regional guard or identity reservation and fail with a passing neighbor, then
restore exact bytes in an isolated workspace.

The native script will enter via real grouped UI, strict preload/Main and literal
portable Raster/Smart neighbors without models/runtime. It will cover actual
1440×900 and 900×620 interactions, lifecycle/Undo, explicit Save/loader/reopen,
durable dirty-shadow crash/recovery and complete before/after/final SQLite and
asset retention. Offline controls establish removal of the regional refusal,
not successful inference. Screenshots require actual visual inspection.

Heavy runs stay serial: tests/typecheck/lint have finite 3 GiB/zero-swap service
limits; native launcher and any separate owned scope have 2 GiB each, zero swap
and a 300-second physical deadline (explicit unique-group ceiling 4 GiB).
No ML provisioning is planned. Compact proof and disposable fixtures are separate
under `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-foundation/20261023-empty`.
Root alone releases exact payloads after restoration, physical exit, byte/SQL
dependency verification and finished readers.

## Execution and corrections

Initial root typecheck r4 passes both Vue compilers. The final affected/neighbor run r2
passes **711 tests, zero failures/skips**, including the regional lifecycle/schema,
actual bundled-preload checks, normal/Smart generation guards and frozen Retry
controls. Earlier focused 54, preload 3 and guard 11 runs are subsets, not extra
coverage to add to 711. Full prototype shared-consumer regression passes **182 browser tests**;
no prototype source is changed by this owner.

The isolated final pre-SQL guard mutation is discriminating: baseline 2 GREEN →
semantic RED (8 durable queue rows versus 4) with the disabled-region neighbor
GREEN → restored 2 GREEN. All 1,320 isolated source members and the shared queue
subject match the original bytes. Independent production reviews R1 and R2 are
clean at source level; executed checks belong to root.

Historical failures remain retained: required shared-stack props initially broke
the focused prototype consumer; optional validated owner handling corrected it.
A UUID fixture annotation corrected two test-only typing errors. An existing
post-publication close test now holds after actual SQL commit, rather than after
file publication; an obsolete Smart converted-Raster refusal assertion now uses
the previously introduced typed comparison/preset capabilities. Neither correction
relaxes the regional refusal or frozen-work contract. Scoped lint changes retain
exact before/after bytes and receive clean R2 source review.

The native harness first source review found four evidence gaps: post-exit protected
state comparison, navigation mutation accounting, retained build bytes and clean
legacy Save coverage. R2 confirms those corrections, then finds a too-strict saved
accepted-index revision oracle; R3 verifies its narrowly bound correction. Native
R1 passes checks 01–04 before an incorrect dirty-state assertion on deleting the
final region. R4 source review confirms Session semantic equality and strict clean
saved-document equality. Native R2 stops before check 01 on lazy Home thumbnail
cache creation; R5 verifies actual card-image/cache readiness before baselines.
Historical attempts remain failed and independently retain final SQL and bytes.

Native R3 passes checks 01–08, then supplies a genuine keyboard RED: Escape from
Rename region leaves BODY focused instead of its surviving menu trigger. The
initial afterLeave correction passes typecheck r5, full lint r3 and build r2.
With the exact same harness, native R4 passes all **12 checks** in 262.67 seconds,
including actual 1440×900/900×620 interactions, full Save/loader/reopen, dirty-shadow
physical crash/Recover and final healthy code 0. Both native lifetimes physically
exit; post-close SQL and package/source pixels are compared, not merely hashed.
Root opens normal, minimum and recovered screenshots and finds no material layout
defect in the inspected scope.

Production source review R3 finds an adjacent P2: that initial focus intent is
consumed before a slow success or unchanged-owner failure settles. At that intermediate checkpoint, a pending-intent
candidate and separate focused delay/transport-fault regression were still pending. This focus-only fault probe may deliberately throw
once before the original Main handler, through real Electron/preload/App error
handling, without manufacturing a DTO. It is not evidence of a Main storage refusal.
The full twelve-check foundation campaign keeps original Main pass-through behavior.

Retention audits R1/R2 find no candidate-dependent gaps in mutation/native R1–R3,
including all archive members, standalone SQLite and checksum-valid in-memory WAL
reconstruction, owned PNG/packages, historical shadows and script overlays. Native
R4 retention also verifies all 812 listed files and 16 SQLite checkpoints. Final
source/docs/version mapping and root disposal are recorded below.

## Final finite qualification

Final production row `c4fe3498…` retains the return-focus intent through modal leave
and the terminal busy state. Matching Rename acknowledgement or an unchanged-owner
failure resumes restoration; revision/owner/selection changes, reopen, unmount,
ineligible targets and subsequent user focus invalidate it. Independent production
R4 reviews this pending-intent correction cleanly; R5 verifies only union/key-order
lint changes. Final native-source R6 is clean. All are source reviews, not reruns.

The same focused native script supplies a meaningful causal pair. On the prior
`10248ce…` build, delayed original Main and controlled IPC transport failure both
lose focus while all document/history/SQL/package assertions pass; ordinary
successful Rename returns focus as its GREEN neighbor. After the correction,
**all three focus and state cases pass**, with healthy exit code 0. Both original
success calls execute exactly once; the one declared transport exception executes
zero original handler calls. No fabricated ApiResult or document is supplied.
This focused mode emits no PASS12 and establishes no Main-service failure atomicity.

Final **native-r5 passes all 12 foundation checks** in **266.205 seconds**, using
original Main pass-through without that focused fault injection. It includes real
1440×900 and 900×620 interactions, legacy absence through clean Save/read/reopen,
region lifecycle and one-step Undo, disabled-region offline controls, meaningful
Save through the actual loader, dirty-shadow physical crash/Recover, explicit Save
and reopen. The same overall 300-second deadline spans both native lifetimes.
The intentional crash and final healthy close physically exit; final protected SQL,
last saved package, exact ordinary/Smart assets/provenance and every retained build
member are compared after the last UI action and physical exit.

Final checks are **711 affected/neighbor tests**, **182 prototype browser controls**,
**3 focused Rename cases**, the **12-check native campaign**, typecheck r7, full lint
r4 and fresh build r3, all PASS. The earlier 54/3/11 runs are subsets of 711; repeated
campaigns are not additional coverage counts. The last row change concerns focus
only; 711 core/neighbor and 182 prototype controls precede it, while final typecheck,
full lint, focused native and the full native replay cover the resulting bytes.
Root actually opens final normal/minimum screenshots and the focused error state:
no material clipping/layout issue is found in the scoped group, dialog and actions.
This is not a complete accessibility, inference, model-quality or release audit.

Frozen Retry and disabled-region successful admission are covered by controlled
real Main/SQLite tests, not by the offline native fixture. Enabled regions always
refuse new admission. No installed-model conditioning, prompt/reference authoring,
mask painting/transforms, nonempty regional assets or full product readiness is
claimed. PP-001/007/008 remain **Пока не обещать**.

## Retention, restoration and disposal

All four independent retention audits finish clean. Across the final focused and
native reports they verify archive/source/build/script mappings, owned package/PNG/
shadow/thumbnail dependencies and final standalone SQLite against raw databases;
WAL reconstruction is read-only and in memory where required. Final R4 inspects
28 SQLite checkpoints and every schema object/table, including internal state.
Historical synthetic provenance mask references remain metadata, without a replay
claim. Root additionally rehashes **5,309 unique report-listed retained snapshot
files** independently of every disposable payload.

Immediately before disposal, root verifies **82 recorded PID/start identities
absent**, all recorded owned groups empty/absent, deadline units inactive/absent,
and all **1,320** isolated mutation archive members restored without extra regular
files. The shared Queue subject matches its original SHA. Delegated readers finish;
accessible cwd/fd/maps/argument references to candidates are absent. Inaccessible
entries belong to seven classified desktop/session services, not recorded actors;
none is stopped or treated as candidate ownership.

Root deletes exactly the **15** pinned agent-created payload/TMP trees from the
lifecycle ledger, using symlink-safe removal. Measured artifact-root allocation
decreases from **4,221,947,904** to **4,112,199,680 bytes**:
**109,748,224 bytes (104.66 MiB)** reclaimed. Filesystem free space separately
increases by **109,699,072 bytes** during the operation. Both measurements and the
small report-allocation difference are retained in `cleanup-report.json`.
No source/build archives, compact SQL/assets/screenshots/logs, external
`node_modules` or `worker-python/.venv` targets are removed. Historical native
reports retain their original outcomes; parent `artifact-lifecycle.json` records
the later root disposal. All candidate paths are absent.

The run directory retains complete baseline, mutation, qualified source/build and
final source/docs archives with per-member verification, exact script overlays,
`source-build-version-map.json`, resource/closure records, `root-visual-review.json`,
all raw reports and failure/control/restoration evidence. Final source bytes remain
independent of the removed checkout. No commit or publication is performed.
