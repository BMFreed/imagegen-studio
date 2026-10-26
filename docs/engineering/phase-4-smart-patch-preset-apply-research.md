# Smart Patch preset Apply — selected draft owner

## Boundary and current evidence

2026-10-22, dirty `master@10115df581d9e07049478dee3866a280886794fd`.
PP-006 and [Presets](../features/presets.md) permit an explicit detached Apply to
Project Canvas or the selected Smart Patch generation draft. The approved mock
already excludes Smart Size. Research traced ProjectView → App → ApplyPresetModal
→ preload/Main → ModelService → ProjectService → autosave coordinator. Two
independent source investigations preceded implementation. The finite authoring
checkpoint is qualified below; public readiness is unchanged.

Executed: 363 focused/neighbor tests pass (including the 33 shared/renderer
and 18 real-owner Main subset), with no skips. Post-lint typecheck, complete lint
and fresh app build pass. Initial compiler error-class and fixture-type failures
remain in raw logs. Independent integration R2/R3 reviews found no further material
production issues; native-source R2 closed three harness-boundary findings.

The staged review guard has an executed isolated sensitivity check: two GREEN,
then omission of the exact review callback produces one semantic RED while the
selected-resource refusal control remains GREEN, followed by two restored GREEN.
All 1,309 archived source members were restored; shared source was not mutated.
The first isolated `pnpm exec` attempt aborted dependency setup before tests and
is excluded; direct use of the existing tsx CLI supplies the actual executions.

Native R1/R2 remain failed attempts after checks 01/02. R1's immediate keyboard
focus assertion was enriched with per-key immediate/settled diagnostics. R2's 56
normal-window Tab steps all stay inside the dialog; it then establishes a real
900×620 chooser defect: flipped popup above the viewport and compressed rich rows.
The local ProjectPresetCard correction bounds the whole picker to
`min(356px, 50vh - 48px)` (356 = former 320px results + 28px search + 8px gap),
keeps search fixed and results scrollable, and prevents row shrink. Placement and
focus behavior remain unchanged. R3/R4 confirm the corrected chooser at 900×620.
App header clipping was not reproduced in the normal screenshot: a Close tooltip
covered text on the failure screenshot. No speculative header correction was made.
R3 passes checks 01–07, then fails an incorrect harness assumption that Naive's
visible unlock message has a tooltip role. R4 changes only that locator to exact
visible text and passes all **12 native checks**, with healthy code 0, restored
observers and confirmed physical exit. Independent native-source R4 review is
clean. All failed attempts and their final SQLite/payload witnesses remain retained
as historical failures.

R4 exercises the actual selected-Patch chooser and detached modal, reset/Cancel,
Models/Edit-original return, selected-resource Main refusal and same-token retry,
Illustrious and hidden Anima Apply, one Undo/Redo, locked review refusal, context
invalidation, stale token/revision refusals, explicit Save and actual loader/reopen.
Forged selected Size and unknown envelopes are refused by preload before Main;
shared/service suites separately cover authoritative request validation. Unselected
malformed Size is projected away before Main's no-op control. Async races and a
lock acquired after review are qualified by real-owner tests, not the native run.

The root inspected final screenshots at 1440×900 and the real 900×620 minimum:
chooser search/refresh and rich rows, expanded modal top/bottom, target header,
warnings and reachable footer. Native glyph/hit/scroll assertions and 56 keyboard
focus steps per viewport supplement that inspection. This is not a full
accessibility audit. R4 retains 54 snapshots, 11 screenshots and standalone SQLite
checkpoints through the final UI action and physical close. Literal accepted
fixtures declare portable input state; they do not qualify inference or acceptance.

## Execution records

| Record                                                           | Actual result                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `focused-ui-r1`, `focused-core-r1`                               | 33 + 18 PASS, included in the neighbor count                                           |
| `neighbors-r2`                                                   | 363 PASS, zero skips                                                                   |
| `typecheck-r6`, `lint-r2` / `lint-r4`, `build-r2`                | PASS; post-picker typecheck/build and final scoped lint                                |
| `mutation-green-r2` → `mutation-red-r1` → `mutation-restored-r1` | 2 GREEN → semantic RED / control GREEN → 2 restored GREEN                              |
| `native-r1`, `native-r2`, `native-r3`                            | Historical failures after 02, 02 and 07; physical exit and final SQL retained          |
| `native-r4`                                                      | 12/12 PASS, healthy exit code 0, final SQL after the last UI action and physical close |

Integration R3, picker review and final native-source R4 reviews are clean at their
declared source boundaries. Two independent retention audits found no missing
owned bytes or final database state across the mutation and all four native runs.
Those reviews do not substitute for the executed tests or root's visual checks.

## Chosen implementation

Separate `getSmartPatchPresetApplicationReview` and `applySmartPatchPreset` APIs
preserve the ordinary Project command. Review request identifies document UUID,
reviewed revision and current layer UUID. Main returns a cloned Patch draft and
an ephemeral UUID token, bound to the exact coordinator, monotonic document epoch,
revision and Patch. At most one current review per tab is retained; issuing a new
review invalidates its predecessor. Success consumes it; a verification refusal
without a document edit permits retry. Tokens are neither persisted nor provenance.
They close the preview-to-submit Edit/Undo and close/reopen ABA boundary that a
restored revision alone cannot establish.

Apply copies only selected reusable settings from the detached preview. It verifies
against the captured Patch model family and selected exact resource references,
then commits one document edit with expected revision **and epoch**. No-op creates
no history entry. Main rechecks the reviewed owner after gate admission and all
asynchronous verification/publication boundaries. The renderer captures ownership
before asynchronous preset loading and invalidates obsolete successes and errors.
Pending Project or sibling-Patch draft writes prevent opening/submitting Smart
Apply. Smart Apply does not flush/seal unrelated prompt histories.

Size is excluded from Smart preview and Select all. Forged selected Size refuses;
unselected source fields follow the existing selected-only parser and are not
applied, including unselected malformed Size. Size-only sources explain that no
sections apply. Seed starts deselected; explicit Seed copies policy/value without
resolving or moving the operational cursor. All preset workflows are eligible;
workflow metadata neither changes generation mode nor adds omitted sections.
Hidden drafts remain editable, consistent with existing authoring. Locked targets
refuse with the existing unlock explanation. Running inference is not an authoring
lock: frozen jobs and their inputs remain untouched.

## Invariants, failures and consumers

The only permitted document difference is the exact requested Patch's generation
draft. Preserve Project draft/primary bbox, other Patch drafts, Raster neighbors,
Smart bbox/internal resolution/mask/coherence/compositing, variants/active member,
accepted PNG/provenance bytes, queue and seed cursor, source preset row and Model
Manager policies. Derived freshness may reflect authored changes. No implicit Save,
worker, catalog readiness or persistent preset linkage is introduced. Missing
selected resources block visibly; deselection permits a valid remaining selection.
Optional absence, null, empty LoRAs, zero, prompt sidecars and family-specific
sampling keep the ordinary selected-section semantics.

Failure before publication retains the document and detached preview. File/resource
verification errors can be corrected by deselection or Models navigation. Stale
review, lock/delete/replacement, edit→Undo, close/reopen and queued admission refuse
without retargeting. Coordinator staging must recheck expected epoch/revision before
commit. Actual Save/loader/reopen and shadow recovery remain coordinator owners.
A synchronous coordinator `beforeCommit` permission hook requires a captured epoch
and rechecks the exact review after staging, so issuing a replacement review at
the same revision also refuses the older commit. Existing callers omit this hook.
A failed Apply response is not evidence of a missing commit; late results are
correlated before tab replacement and cannot append a closed tab.

## Finite validation scope

The source of section completeness is `PRESET_SECTION_KEYS` (12), with Size
explicitly refused for Smart. Family axes: Illustrious and Anima; the existing
ModelService selected-resource policy remains authoritative, including disabled
selected LoRAs. Test exact request/reply envelopes, selected-only projection,
model-family diagnostics, wrong/missing/Raster/locked owner, hidden owner, no-op,
one Undo/Redo, package persistence, source immutability and resource refusal/retry.
Use real SQLite/Project/session/package boundaries for persistence. Pause verification
and coordinator staging to test epoch/identity races. Isolated semantic mutation
must fail the relevant race while a neighboring refusal control still passes.

Native qualification uses portable literal accepted fixtures and real renderer →
preload → Main → document → explicit Save/reopen, without ML provisioning. Inspect
actual screenshots at 1440×900 and the real 900×620 minimum: target context, Current
Patch values, omitted Size, default Seed, selected warnings, Models/Edit-original,
keyboard, glyph clipping, footer and focus. Retain compact source/build/script
versions, PNG/.igs/autosave bytes and standalone consistent SQLite backups through
the final close. A prepared harness is not an executed pass.

All heavy checks run serially in finite systemd scopes: tests/build <=3 GiB,
native launcher and app <=2 GiB, swap 0, RuntimeMaxSec <=600 (native deadline <=360),
TimeoutStopSec <=90, KillMode=control-group. These are local test containment limits,
not product capacity claims. Exceeding a scope aborts qualification. Root must prove
physical exit, mutation restoration, retained dependency independence and no active
readers before removing exact disposable payloads.

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-preset-apply/20261022-target`.
Baseline source archive: 1,302 verified members. Complete 1,309-member source and
33-member build archives plus exact per-attempt scripts preserve the dirty and
untracked implementation; the final version map records their correspondence.
No new runtime/model copies.
Smart Compare, accepted result preset creation/history and ordinary Apply remain
neighbor controls. Full PP-006 release/inference guarantees remain outside this
checkpoint; public status stays **Пока не обещать**.

## Artifact retirement

Root independently rehashed 171 retained files and compared 20 immutable SQLite
checkpoints, verified all archive members and the 1,309-member mutation restoration,
and confirmed all 36 recorded native PID/start identities gone, 29 groups empty or
absent and four deadline timers inactive. Delegated readers finished; accessible
processes had no candidate references. Seven unrelated desktop/session processes
deny descriptor inspection; their readable commands/groups contain no candidate
and predate the native actors. This limitation is recorded separately.

Only the exact nine lifecycle entries were removed: the isolated mutation tree,
four native fixtures and their four owned TMP directories. Symlinks were not
followed; repository `node_modules` and `worker-python/.venv` are intact. Actual
reclaimed allocation is **76,361,728 bytes (72.82 MiB)**; at that checkpoint the
artifact root changed from 3,572,027,392 to 3,495,665,664 bytes. `cleanup.json`
records those measurements independently of later compact archive additions.
Reports, failed attempts, screenshots, SQLite/packages/shadows, source/build
archives, script overlays and RED/GREEN/restoration evidence remain available.
The final source archive and `source-version-map.json` complete the handoff.
