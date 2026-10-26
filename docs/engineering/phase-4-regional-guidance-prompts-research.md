# Regional Guidance — authored prompts

## Research boundary

2026-10-24, dirty `master@10115df581d9e07049478dee3866a280886794fd`.
User continuation follows the completed
[empty-entity foundation](./phase-4-regional-guidance-foundation-research.md).
Its complete final source was verified against all 1,320 retained members before
this owner; a fresh independent baseline archive preserves tracked and untracked
work. No previous implementation is reset or committed.

The next finite owner is optional inline regional positive and negative prompt
authoring, with an explicit global-negative inheritance choice. The
[feature contract](../features/project/generate-mode/regional-guidance.md) and
[component contract](./ui-component-contracts.md) require visible inline blocks
and the shared prompt-editor behavior. Existing enabled-region NEW Generate
refusal remains authoritative. This owner does not introduce regional mask
pixels/transforms, reference images, queue conditioning, inference, inverse-mask
auto-negative, or accepted-result provenance/preset changes.

Risk is high because new authored data crosses strict Project parsing, IPC,
history, autosave recovery and portable `.igs` persistence. Production paths are
renderer row → captured regional owner → preload/Main validation → ProjectService
→ coordinator/session → shadow → explicit Save/verified package readback.
Independent core, UI and qualification research runs before implementation.

## Confirmed existing boundaries

- The optional regional collection is separate from compositing layers. Its
  legacy absence has no parser default; its empty mask remains owned metadata.
- The existing generic regional action flushes Project drafts and sets global
  busy state, so it cannot serve as a per-keystroke editor transport unchanged.
- Production `PlainPromptEditor` emits authored text and explicit ID-only
  embedding selections. Main owns exact embedding reconciliation; renderer
  cannot manufacture portable resource metadata.
- Production Project prompt history groups incremental updates into a focus
  session. Blur seals the group; the CodeMirror editor has no competing local
  Undo stack. Regional editing must preserve that ownership.
- Regional settings must not modify Canvas/Smart drafts, geometry, variants,
  provenance, accepted history, operational seed or Model Manager policy.

## Authoring decisions

`prompts?` is a strict optional regional object with `positive` and `negative`
nullable ordinary `GenerationPrompt` values and required
`useGlobalNegativePrompt`. No parsing defaults are introduced. Absent wrapper
means no inline blocks and implicit inheritance; an existing empty prompt is a
persisted block. Both-null wrappers refuse; a null negative requires inheritance.
The last Remove omits the wrapper. Add Negative creates an empty custom block;
turning inheritance on preserves dormant local text/refs, and Remove Negative
clears that local block and restores inheritance. No inherited effective text is
stored. This owner displays Current Canvas as the global-negative/model context;
future Smart-job freeze semantics are not implemented here.

Dedicated `updateRegionalGuidancePrompt(tabId, owner, change)` preserves the
existing metadata API. Strict changes are `block` (polarity/present), `text`
(polarity/authored text/optional exact ID-only embedding selection and history
group), and `negative-source` (inheritance boolean). Prompt groups include exact
region/polarity and a focus UUID; only text accepts a group. Existing history
sealing is ordered after queued regional writes. Main enforces roles, lock,
current containment, revision and epoch through resolution and publication.

One regional stream per document owns optimistic copies and its own ACK chain.
It cannot advance across unrelated revisions or an observed edit/Undo roundtrip.
Plain typing coalesces only adjacent updates in the same owner/polarity/group;
embedding choices, block/source changes and seals are barriers. Failed text stays
visible for correction/retry or explicit discard of unpublished edits. Canvas/
Smart input waits while regional updates are pending; regional input waits for
ordinary draft synchronization. Metadata and history/navigation operations use
the shared drain. This avoids cyclic adapter flushing and revision retargeting.

The full candidate must fit the existing 16 MiB serialized UTF-8 document ceiling
before regional publication, including Add/Duplicate. Individual prompt text
keeps the existing 1 MiB ceiling. These are defensive format limits, not measured
capacity. Local size refusals retain the pending editor text for correction.

## Verification plan

Use strict shared/schema and actual bundled-preload tests, real service/SQLite/
shadow/package tests, and renderer synchronization tests with held replies.
Cover missing/locked/foreign/stale owners, Undo ABA and final publication guards,
optional absence versus an explicit empty block, exact authored templates and
embedding refs, independent duplicate copies, inheritance switching and one
focus-session Undo. Test ordinary Canvas/Smart prompt neighbors and unchanged
enabled-region admission refusal. A material semantic mutation must fail at the
real owning boundary with an unchanged passing control and exact restoration.

A separate native script will exercise actual inline editors, keyboard/focus,
normal and 900×620 layout, Undo, explicit Save/readback/reopen and dirty recovery.
Native evidence must retain complete before/after/final SQL, package/PNG/shadow
bytes, source/build bytes and process identities. Controlled fault/hold probes
must be explicitly identified; they cannot establish inference or Main failure
atomicity outside their real boundary.

Heavy checks remain serial and bounded. No ML provisioning is planned. The run
root is `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-prompts/20261024-authoring`.
The initial inventory is 4,121,841,664 allocated artifact bytes with
90,455,085,056 bytes free. Compact evidence and disposable fixtures are separate;
root alone releases payloads after physical exit, restoration, complete retained
dependencies and finished readers. Public PP-001/007/008 remain **Пока не обещать**.

## Evidence status

**The finite offline authoring checkpoint passes.** Root executes the checks;
independent reviews are source-only unless explicitly stated otherwise. This is
not regional conditioning, inference, installed-resource or full promise release.
Public PP-001/007/008 remain **Пока не обещать**.

- **795 affected/neighbor Node tests in 41 files, zero failures/skips.** This
  replay includes schema/preload, real Main/SQLite/history/shadow/package, owned
  synchronization and existing ordinary/Smart generation, Retry, comparison and
  preset controls. It precedes only the final one-attribute ARIA addition.
- **182 full prototype browser tests** pass as shared-consumer controls; no
  prototype implementation is changed by this owner. Prototype regional textareas
  and mock masks/references remain separate gaps.
- Final typecheck **r7**, fresh desktop build **r4**, full lint **r2** and later
  scoped lint for the final ARIA/harness changes pass. Earlier 48/791/793 results
  precede their corrections and are not substituted for the final replay.
- The isolated Main inheritance mutation goes **2 GREEN → one semantic RED with
  one unchanged GREEN control → 2 restored GREEN**. All 1,325 isolated members and
  the shared service subject are restored byte-exactly.

### Correctness findings and causal regressions

Production review R1 finds a nonreactive standalone ordinary blur seal and a
refused-text head blocking correction after blur. Root retains causal unit RED
and GREEN runs for both. Publishing the unchanged ordinary draft on seal makes
the pending guard reactive. Error repair retains ordered seals and unrelated
owners while permitting correction/removal of unpublished input.

R2 finds that dropping refused exact choice A releases dependent text B unbound
before replacement C. The real Main/history/package regression reproduces RED at
Undo C. Repairing A's exact choice in its original unpublished position preserves
B's binding and C's focus session. R3 finds a queued Remove/re-Add can bypass that
repair and resurrect old unpublished B. A second real history/package regression
reproduces RED at the third Undo. The earliest matching Remove now cancels only
same-field unpublished text through its position before repair. Both real
history/package regressions pass together (2/2). Their resource resolver is a
declared controlled seam; installed-resource verification is not qualified.

Complete production review **R4 is clean** for all prior findings, including the
strict regional history-group allowance only at the shared seal endpoint.
Ordinary generation-draft target/change/group validation remains unchanged.
Native-r4 then exposes the locked Naive Switch's missing accessible disabled
state. One explicit `aria-disabled` binding uses the existing edit guard; narrow
production review **R5 is clean**, and the unchanged native role assertion plus
real locked Main refusal pass in native-r8.

### Native execution and appearance

Final **native-r8**, script `ff502357…`, passes **12/12 checks in 97.714 seconds**
with launcher peak **1,097,486,336 bytes**, zero swap and final code 0. The launcher
and each owned scope have a 2 GiB limit, with an explicit aggregate ceiling of
4 GiB. One 300-second overall deadline spans both Electron lifetimes; stop timeout
is 30 seconds. No memory allowance was increased after the resource failure.

The real UI covers literal empty blocks, multiline Unicode/whitespace/templates,
local/global/local inheritance, Current Canvas versus selected Smart context,
held ordinary-seal handoff, held regional typing and keyboard Save, one grouped
Undo/Redo, net-zero/empty-focus Redo preservation, independent unselected editors,
attention/syntax, duplicate/Remove/lock and original Main refusal. Enabled authored
regions still refuse new ordinary/Smart Generate; all-disabled controls reach the
existing offline refusal without queue/cursor/policy/input changes. This is not
successful generation or native active-work/Retry evidence.

Actual Save/loader/reopen, dirty-shadow physical crash, Home Recover and another
explicit Save/reopen preserve complete documents and neighbors. The first lifetime
ends in a declared dirty SIGKILL (nine PID/start identities); the second closes
healthy with code 0 (nine identities). Both observer sets restore original handler
references with `inFlight=0`; all 675 + 46 observed original handlers execute once.
No page errors occur. Independent final SQL follows confirmed physical exit.

Root opens and inspects all **seven actual screenshots**: positive/negative and
scrolled neighbors at 1440×900 and 900×620, plus recovered inline prompts. Native
geometry/hit/keyboard/scroll assertions pass; no material layout defect is observed
in those states. The narrow negative heading wraps within its card; panel scrolling
keeps controls reachable. Focused Browse tooltips remain within the viewport. This
is a bounded root self-review using the UI-audit checklist, not a blind independent
visual review, exhaustive accessibility/contrast audit or capacity measurement.
The record is `visual-review.json` in the run evidence.

### Historical attempts and evidence representation

All earlier failures remain historical failures:

- Native-r1 reproduces Main's `IPC_INVALID_CALLER` on a namespaced regional blur
  after checks 01/02. Strict namespace admission is then fixed at the seal endpoint.
- Native-r2 passes 01–06, then its absolute row-top oracle rejects the preexisting
  selected-region opacity help above the group. Section-relative measurements
  retain raw toolbar/help/scroll evidence and exact editor identity/layout.
- Native-r3 passes 01–06, then strict camera comparison catches late Fit View
  settlement. A separately witnessed real Zoom in establishes manual viewport
  before ownership controls; strict selection camera assertions stay intact.
- Native-r4 passes 01–07, then catches the accessible Switch state described above.
- Native-r5 passes 01–08 before launcher OOM at 2 GiB after 142.585 seconds. Its raw
  partial report remains `running` and unchanged, with a separate aborted-OOM
  supplement. Root confirms actor groups/identities gone, stops its deadline timer
  and retains final product bytes and standalone SQL. Observer restoration is not
  claimed after launcher death. Retention audit R3 independently verifies rescue.
- Native-r6 and r7 abort before checks: unsupported evaluated dynamic import,
  then incompatible Electron/launcher V8 wire format. Their final failure SQL and
  physical-exit proof remain retained. `getBuiltinModule` and the portable tagged
  DTO codec close these setup issues in the final harness.

The final report uses a complete append-only `ipc/launch-*.jsonl` journal per
lifetime. Main writes immutable started/invoked/finished events synchronously,
retaining original arguments/results once, including present `undefined` and void
replies. Exact witness prefixes reference indexed call metadata with hashes. Final
verification checks every byte range, call identity, event, argument, terminal
state, count and journal digest. Keep these journals with the report. V8 is used
only for launcher-local prefix hashing, not inter-runtime payloads. Native-source
reviews R3/R4 close geometry/viewport changes; R5/R6 retain the two setup findings;
final **R7 is clean** for the portable codec and unchanged qualification gates.

Setup-only pnpm dependency-status abort, default-heap ESLint OOM, a zero-test name
filter and an absent `build` script invocation are also retained. They are not
feature RED or PASS. Successful reruns use the actual tsx entry point, explicit
Node heap, nonempty TAP footer and `pnpm run app:build`.

### Retention and release

Run root: `~/.codex/artifacts/imagegen-studio/runs/regional-guidance-prompts/20261024-authoring`.
Baseline/source/build archives and exact attempt overlays retain actual bytes,
configs, locks, helpers, versions, source PNGs, packages, shadows and standalone
SQLite. Each attempt's 1,084 source entries resolve to archived members plus exact
overlays and 55 ignored bytecode witnesses; those `.pyc` files are not evidence of
an installed or executed ML runtime. All 33 reported build hashes resolve.

Retention audit R1 is clean for mutation/native-r1; R2 is clean for native-r2–r4;
R3 is clean for the OOM native-r5 rescue. Root additionally materializes seven
historical files from R1's exact reconstruction recipe, verifies their original
hashes and readback, and labels them reconstructed rather than independent
captures. All original raw reports remain unchanged.

Final retention audit **R4 is clean and READ-FINISHED** for native-r6–r8: 3,468
snapshot entries, 14 standalone SQLite checkpoints, all 16 package copies and
complete current/base asset dependencies verify. Native-r8's 721 original calls
and 2,163 journal events have contiguous exact byte/hash references; tagged
values, including 1,435 present `undefined` values, decode consistently. Two
transient Save ZIP hashes lack exact ZIP copies: their documents/base dependencies
are retained, and neither missing historical ZIP exists in a disposal candidate.
This limit is preserved; it is not a claim of every intermediate ZIP's raw retention.
Contract review R2 is clean for the seven document deltas and their bounded claims.

Root's fresh release checks confirm all 21 delegated tasks finished, all 79 recorded
PID/start identities gone, 17 process groups empty, and nine deadline timers
inactive. All 1,325 mutation-checkout members and the shared service subject match
original bytes. No accessible same-user candidate cwd/fd reader is found; seven
unrelated same-user processes deny descriptor inspection and are explicitly
recorded, not claimed inspected. All known actor and declared audit-reader gates
are satisfied before deletion.

Root removes only the **18 exact idle payload paths** in `cleanup-report.json`.
All are absent afterward. Measured artifact allocation falls by **116,359,168
bytes (110.97 MiB)**, exactly the preflight candidate allocation. Both external
repository `node_modules` and worker `.venv` target directory identities survive;
cleanup never traverses their links. Raw reports, historical failures, journals,
SQL/package/shadow/source/configuration/build bytes and visual evidence remain
protected. The lifecycle is retained with no payload pins. Final source/docs
archive and version mapping preserve these final bytes. No ML runtime/catalog is
provisioned by this owner.
