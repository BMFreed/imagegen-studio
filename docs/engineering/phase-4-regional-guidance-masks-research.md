# Regional Guidance owned-mask authoring

## Scope and evidence status

This is the next finite owner after the completed
[regional prompt-authoring checkpoint](./phase-4-regional-guidance-prompts-research.md).
Research starts from dirty `master@10115df581d9e07049478dee3866a280886794fd`,
including all earlier tracked and untracked work. The preserved baseline has
1,325 source members. Earlier checkpoint results do not qualify this change.

Expected result: edit the selected Regional Guidance owner's mask on Canvas,
retain one owned identity and immutable PNG versions, and preserve that state
through ordinary Undo, explicit Save/reopen and dirty recovery. The
[feature contract](../features/project/generate-mode/regional-guidance.md)
requires an inseparable region-owned mask, excludes standalone/shared masks and
excludes region state from accepted provenance, Compare and result presets.

The selected boundary reuses Brush, Eraser, Lasso, Polygon Lasso, Transform
Region and Clear. Regional commands strictly exclude Fit; no regional bbox or
new rasterization algorithm is introduced. Disabled regions remain editable;
locked regions refuse. Only the selected authoring overlay is displayed, using
its stored overlay opacity even when disabled. At research start no new
execution result was claimed; current root-reported results are recorded below.
Enabled regions must continue refusing NEW
ordinary and Smart generation. Regional conditioning, inference and reference
images remain separate work. PP-001/007/008 remain **Пока не обещать**.

## Risk and current data flow

Risk is **high** because owned asset validation, staged document publication,
portable `.igs` packages and dirty recovery are affected. A visually correct
overlay cannot establish durable pixels or atomic failure behavior.

Confirmed pre-implementation baseline, preserved in `baseline-source.tar.gz`:

- `ProjectCanvas` captures one immutable Smart mask owner per gesture and emits
  commands after pointer completion. `project-mask-gesture.ts` converts client
  coordinates through the current camera and rejects changed owners.
- `ProjectService.editSmartPatchMask` reads and validates the current immutable
  PNG, renders CPU mask edits, detects pixel no-ops, and publishes through the
  autosave coordinator with expected document revision and epoch.
- `project-mask.ts` supplies bounded brush/polygon/transform/clear operations;
  the renderer sends geometry, never encoded PNG bytes or member paths.
- `SmartPatchMaskSchema` already represents null masks at any revision and
  nonempty alpha PNGs with tight integer world bounds. The regional foundation
  accepted only null asset/revision zero at that baseline.
- `projectAssetReferences`, `projectMaskAssets`, package asset checks and the
  signed `igs-mask` resource resolver enumerated Smart masks only at that baseline.
  Regional mask publication therefore requires tracing every persistence and
  resource consumer, rather than adding only a Canvas overlay.
- Regional duplicate allocated a fresh empty mask. With nonempty
  masks it must retain independent ownership and copied exact coverage/bytes.

## Preserved invariants and failure checks

The dedicated command is `editRegionalGuidanceMask(tabId, regionId, request)`;
the strict request contains exactly `documentId`, `documentRevision`, `maskId`,
`maskRevision` and `edit`. It accepts no pixels/member paths, bbox, history group
or renderer epoch. `igs-mask://regional/...` is a separate signed owner namespace;
existing Smart `igs-mask://asset/...` capabilities never resolve regional masks.
Runtime-only regional `maskImageUrl` is stripped before strict stored validation
and is never persisted. Duplicate starts a fresh mask owner at revision 1 when
painted, or 0 when empty, with copied verified bytes under its own member path.

Keep the complete Project/Smart drafts, primary bbox, Smart geometry/masks,
variants, accepted pixels and immutable provenance exact. Regional masks must
not enter raster composition, preview thumbnails or generation planning.
Prompt blocks/inheritance, source preset catalog, operational seed cursor,
frozen jobs/Retry, receipts and model policy keep their separate owners.

Reject malformed requests, missing/wrong/locked owners, stale document or mask
revisions, oversized geometry and changed coordinator/epoch before publication.
Check delayed resource reads and staged commit, including edit/Undo ABA and
close/reopen. A refused gesture must leave document/history/shadow/package and
neighbor bytes unchanged. Escape, pointer cancellation and owner changes must
cancel only the unpublished local gesture, without retargeting it.

Save and recovery must retain every currently referenced regional PNG, validate
its exact dimensions/hash/content and refuse missing/corrupt/wrong-owner assets.
Legacy documents without regional state must remain absent through clean Save.
Duplicate/Delete/Undo must retain the required historical owned bytes until the
coordinator no longer needs them; no eager filesystem deletion is introduced.

## Parameter inventory

Reuse existing CPU authoring limits unless source evidence requires a change:
4,096 pixels per dimension, 4,000,000 stored samples, 8,192 gesture points,
32,000,000 edit pixel visits, 32 MiB PNG input, 1–512 pixel brush diameter,
bounded integer world coordinates and existing transform scale guards. These
are engineering safety ceilings, not measured product capacity or inference
limits. The serialized document retains its existing 16 MiB ceiling.

Offline qualification needs no model/runtime provisioning. Native execution
will use an overall physical deadline across recovery restart, explicit memory
and zero-swap limits for every actual process group, full byte/SQL witnesses,
linear retained IPC journals, and physical-exit proof. Final numbers and
outcomes belong below only after execution.

## Validation plan

Use actual service/coordinator/SQLite/shadow/package boundaries for mask
publication, exact alpha/bounds, no-op/Undo/Redo, lock/stale/ABA refusal,
duplicate independence, Save/reopen and dirty recovery. Retain an ordinary Smart
mask control and generation/Retry exclusion controls. Validate actual preload
snapshot/refusal behavior and signed resource owner/revision capabilities.

Run required typecheck, affected tests, lint and fresh build after integration.
Use an isolated semantic mutation to demonstrate that the key ownership or
asset-retention test detects a plausible regression, then restore exact bytes.
Native qualification must enter through real Canvas tools, inspect both normal
and minimum-window screenshots and prove actual Save/loader/reopen/recovery.
Source reviews, authored checks, retained reports and independently executed
behavior remain distinct evidence boundaries.

## Artifact lifecycle

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-masks/20261024-authoring`.
Initial artifact-root allocation is 5,019,684,864 bytes with 88,073,334,784 bytes
free. Existing protected historical compact evidence exceeds the 1 GiB soft
budget; it remains necessary promise/review evidence and is not swept. This
owner targets a compact set below 300 MiB and provisions no ML environment.
The baseline source archive and all 1,325 member hashes are verified before
implementation. Payloads remain pinned until independent dependency audit,
restoration, physical exit and reader checks. Root alone owns final disposal.

## Executed evidence — finite authoring and retention/release complete

Root's `preload-r1` executes the actual bundled preload with a declared IPC
transport substitute: **9 tests PASS, zero failures/skips**, including captured
gesture immutability, strict Fit/private-field refusal before IPC, crossed reply
rejection, display-URL association and legacy/cleared masks. It does not execute
Main or native Canvas. At that checkpoint, other implementation, typecheck and
native checks remained pending; these results alone do not qualify the feature.

Root's `focused-r2` passes **89 tests across 11 files, zero failures/skips**:
regional Service/resource/schema/preload, captured gesture/transform helpers and
existing Smart CPU/resource/mask controls. Actual Service tests use SQLite,
coordinator, shadow and portable package IO, including staged owner changes and
Save A/edit B. They do not establish native interaction or inference.
Required `typecheck-r2` passes both prototype and app projects.

Historical `typecheck-r1` fails on a stale row type annotation after the view-type
extension; the corrected annotation changes no runtime behavior.
`focused-r1` executes 88 PASS/1 fixture failure because ordinary Raster DTOs may
omit `kind`. Its lookup now uses the established non-Smart branch; production
behavior is unchanged, and the same complete focused suite passes afterward.
These failed attempts remain retained.

The broader `neighbors-r1` replay passes **869 tests in 50 files, zero
failures/skips**, in 76.978 seconds; the focused checks above are subsets, not
additional counts. It includes regional foundation/prompts, both generation
owners and frozen Retry, package/shadow/autosave, acceptance, preset/Compare and
existing Smart mask controls.

The isolated duplicate-loss mutation suppresses copying a nonempty source mask,
reproducing the former empty-duplicate behavior with valid unchanged input.
The real Service test goes **2 GREEN → 1 semantic RED + 1 neighbor GREEN →
2 restored GREEN**. RED is the missing copied asset assertion, not a setup/import
failure. All **1,331** isolated archive members are restored exactly with no
extra regular source files. The shared checkout was never mutated; its subject
matched at restoration verification before later intentional lint formatting.

Production source review R1 reports only the two known type/fixture findings,
with no additional material behavior finding. Their corrections and the
subsequent source lint delta pass fresh **R2 source-only review**. Full `lint-r1` records
24 autofixable style errors; scoped source correction passes, and full `lint-r2`
passes all four repository partitions. Exact pre-lint bytes are retained.
Post-lint `typecheck-r3` and `focused-r3` (89 tests, zero failures/skips) pass.
Source integration includes regional collectors, painted duplication, signed
resources and the actual Canvas route; those are implemented source boundaries,
distinct from final native qualification. Fresh `build-r1` passes against final
production bytes; final native results follow below.

Contract review R1 finds ambiguous present tense in the baseline description
and opening status. Those paragraphs now identify the preserved pre-implementation
state and distinguish implemented source from pending native qualification.

Historical `prototype-r1` uses Playwright's default eight workers and is stopped
by the 3 GiB group limit after partial checks. It is a setup OOM, not a feature
RED or suite PASS. The complete 182-test rerun uses one worker at the same limit;
its Vite server is verified inside the owned bounded group. `prototype-r2`
passes all **182 tests** in 348.041 seconds. No prototype source changed.

### Native attempts and evidence format

Native1/2 stop before check 01 on the inherited two-rAF/2,000 ms settlement
barrier. Native3 adds independent failure diagnostics without changing that
barrier: native/renderer visibility and focus are present, timers progress, and
the first rAF fires while the second does not. The cause remains unestablished.
Native3 cannot restore observers because its old cleanup also waits on that
barrier; its raw restoration result remains false. Its nine owned process
identities are physically terminated, and final SQL/bytes are retained.
Physical termination is separate from successful handler restoration.

Native4 uses the existing Smart-mask X11 compositor launch profile and asserts
the actual switches. It passes legacy check 01, then stops because the harness
asks for a spinbutton while the approved brush-size input is a textbox. The
locator correction changes no production accessibility semantics. Default
desktop compositor scheduling is not qualified by this profile.

Native5 passes checks 01–07, including real tools, exact alpha/bounds, history
and terminal cancellation. The next refusal passes its complete state oracle
but a repeated V8 prefix hash differs. A 2,000-repeat readback microtest does not
reproduce that specific mismatch. Node's [serialization contract](https://nodejs.org/docs/latest-v24.x/api/v8.html#serialization-api)
does not promise identical bytes for equal values; this supports replacing V8
as an integrity format, without establishing native5's particular cause.

The final prefix format hashes strict tagged JSON over the entire ordered
metadata prefix, retaining key presence/order, undefined, numeric edge cases,
all calls/seals/arguments/states and journal references. Exact prefix equality,
original-once and raw contiguous-journal verification remain. V8 hashes are
diagnostic only. Startup clone/difference/rejection controls execute successfully
in native6; eleven canonical-equal/V8-different observations are retained there.
Restoration drains original IPC independently of rAF and verifies actual zero
in-flight calls plus exact original handler identities. UI settlement still
requires the unchanged frame barrier. Source review R4 is CLEAN for this delta.

Native6 passes checks 01–08, then stops on another harness label mismatch:
`Duplicate` versus the visible `Duplicate region`. Both Duplicate/Delete menu
labels are corrected to their exact production names for native7; all mutation,
history, PNG and persistence assertions remain. Native1/2/4/5/6 record 95 restored
handlers with zero in-flight calls and confirmed physical exit; none is a full
native PASS. The two-label correction passes independent source-only R5 review.

### Final native7 and visual self-review

Root executes `native-r7` with script
`26215dbae471ea7fabfbfb17739dc9cd689212f02897610960abcf91300401c4`:
**all 12 checks PASS in 157.061 seconds**, launcher exit code 0, peak
1,471,905,792 bytes, zero swap. The original 300-second deadline spans both
lifetimes; launcher and each owned actor group retain 2 GiB limits with an
explicit 4 GiB aggregate ceiling. No runtime/catalog is installed or fabricated.

Actual pointer gestures establish independent literal alpha/bounds for Brush,
Eraser, both lassos and transforms, full-array pixel mapping, one-entry history,
Clear/no-ops and cancellation through terminal input. Locked/stale/foreign and
wrong-kind requests reach original Main exactly once; malformed/Fit requests
stop at preload with zero Main calls. Valid current regional/Smart capabilities
resolve while stale/tampered/cross-owner namespaces refuse. Painted duplicate
has fresh entity/mask IDs and its own member path; editing/deleting it leaves
the source exact, and Undo retains its bytes.

Real Save/loader/reopen and unsaved PNG-shadow recovery preserve complete
documents, current assets, authored prompts, Smart/Raster neighbors, variants,
provenance, seed cursor and protected SQL. The intentional dirty-crash lifetime
confirms nine PID/start identities physically exited; the final healthy lifetime
confirms another nine and code 0. Both restore 95 original handlers with zero
in-flight calls. All **826 + 52 original calls** execute once and their
**2,478 + 156 portable journal events** remain retained. Page errors are zero.
Thirteen canonical-equal/V8-different diagnostics do not establish the cause of
native5's historical mismatch.

Root actually opens all six screenshots: quarter-turn preview, disabled overlay
and Transform at 1440×900 and 900×620, and recovered masks. No material local
layout defect is observed; settings/tool controls and Apply/Cancel remain
reachable, regional rows scroll independently, and minimum-width name ellipsis
is intentional. `visual-self-review.json` records hashes and boundaries. This
is bounded self-review, not an independent accessibility or entire-app audit.

Native qualification covers offline CPU authoring under the declared X11
compositor profile. It does not qualify regional conditioning/inference,
reference images, successful generation admission, installed-resource behavior,
active queue work/frozen Retry, or Main async ABA/failure atomicity. The latter
ownership cases have separate lower-level tests. PP-001/007/008 remain
**Пока не обещать**.

Mutation audit R1 is CLEAN/READ-FINISHED. Native1–4 retention audit R2 is CLEAN
for retained bytes with native3's explicit restoration-evidence gap. Native5/6
retention audit R3 and final-native7 audit R4 are CLEAN/READ-FINISHED. Final
contract R2 is CLEAN, source-only, resolving R1 wording. Final harness-scoped
`lint-harness-r2` passes without source edits. Root verifies all 24 delegated
tasks finished, all 72 native PID/start identities gone, all 15 owned groups
empty, eight deadline timers inactive, exact original handler restoration where
recorded, final production hashes and all 1,331 isolated mutation members.
Native3's historical false restoration remains unchanged; its ephemeral
instrumentation ended only through confirmed owned-process teardown. No
accessible same-user candidate cwd/fd/maps readers remain; seven unrelated
permission-denied processes are recorded, not claimed inspected.

Root removes only the 15 audited exact idle candidates without following links.
`cleanup-report.json` records **113,537,024 allocated bytes (108.28 MiB) actually
reclaimed**, artifact-root allocation 5,595,488,256 → 5,481,951,232 bytes at
disposal, and preserved external `node_modules`/worker `.venv` target identities.
Reports, failed attempts, full source/build bytes, version maps, SQLite, raw
journals, historical package/shadow/PNG objects and audit records remain retained.
The lifecycle is retained with no payload pins. Final archives/mappings and the
delivery manifest record the final source and evidence boundaries. Compact evidence has exceeded the initial 300 MiB aim because failed
attempt sources, raw journals and historical package/shadow bytes remain
protected; `budget-review-r2.json` records the exception. No ML copy is created.
