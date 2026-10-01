# Phase 2B: Result sessions and continuation after Open/recovery

Risk: **high**, because hiding candidates must not change reviewed destructive
Add scope or deliver a late result into a different document; explicit recovery
discard changes durable resource lifecycle before deleting document shadow. Base:
`75531a780cd3284652be1d0f7fb7b26a4ce5b9dd`, clean `master`.
Contracts: [GenerationResults](../features/project/generate-mode/generation-results.md),
[Queue Manager](../features/queue-manager.md),
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю) and
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).

## Confirmed boundaries and implementation choice

Main already verifies every recovered candidate and exposes its exact Project,
job/session, completion order, signed resource and source-document mismatch.
Queue rows can be pruned independently. Sessions can therefore be grouped from
verified candidates without adding storage, worker commands or IPC fields.
The current prototype models one staging session; a production filter is an
extension of its approved compact toolbar, not evidence that prototype recovery
is real. Keep the existing palette, thumbnail strip and action hierarchy.

Canvas owns focus and checkbox selection. Add currently captures **all eligible
sessions**, unchecked candidates and unfinished sibling jobs, using a durable
acceptance journal. Narrowing its input to a visible filter would silently change
that contract. The filter is presentation-only: All results by default; one
session limits thumbnails and previous/next, while selection/Add/Select all/Clear
remain global. Show hidden selected count and explicit all-session menu copy.
Filtering/focusing never accepts, saves, cancels or discards a candidate.

Closed Queue Projects cannot expose a verified candidate ID yet. Clicking their
completed `Open Project` action captures a one-use intent from queue metadata:
Project key, source document ID, job ID and session ID. Ordinary Open and its
existing explicit recovery decision remain mandatory. Recover can continue after
the selected document opens; Cancel/dismiss does not.
The user explicitly confirmed that Discard Recovery removes both document shadow
and all unaccepted temporary generations for that Project. It cancels continuation
and opens the saved document only after durable staging discard.
After ordinary Open/Recover, read fresh Results and match exactly one candidate, then reuse the
existing monotonic focus request/show/fit/expand path. Never choose a neighbor.

## Invariants, failures and races

- Every visible session comes from the authoritative verified candidate list,
  not queue rows. First stable completion order determines option order; no
  pending-only session is invented.
- Focus changes independently of checkbox selection. Filtering out focus chooses
  a deterministic visible candidate. Queue navigation reveals the exact target
  session. Repeated focus remains a new revision. Removed session falls back to
  All; a temporary loading snapshot does not revoke the existing filter/mask.
- Add count includes hidden selected results. Its confirmation still reviews all
  eligible unchecked candidates and unfinished jobs. Main acceptance, journal,
  cleanup, provenance, Undo and Save remain unchanged.
- Opening captures metadata, never a stale resource/candidate ID. Fresh read
  pins the actual open document before and after await and checks Project/job/
  session/source mismatch. Ambiguous, missing, malformed or unavailable recovery
  refuses with feedback; a replaced document cannot receive late navigation.
- Queue dialog closing intentionally preserves an Open intent, while revoking
  direct View reads. Manual navigation/open, recovery Cancel, close/reload,
  failed open/read, superseding intent and renderer disposal revoke continuation.
  Old-document candidates remain preview/export-only under the existing Add gate.
- No schema or worker protocol changes are introduced. Discard Recovery now uses
  the existing durable staging tombstones before document shadow discard/Open;
  Project operation gating, admission fencing and scoped confirmed cancellation
  preserve other Projects and accepted `.igs`. A crash loses transient
  filter/navigation state; existing completed local
  recovery and unfinished-job cancellation rules remain authoritative. No auto
  Recover, Retry, Add or regeneration is introduced.

## Confirmed recovery discard decision

Independent review found a concrete existing gap: the lifecycle contract said
Discard Recovery deletes document shadow **and** staging, but the old main IPC
called only `ProjectService.resolveRecovery()` and removed shadow. On 01.10.2026
the user explicitly chose to remove both, rather than change the promise to keep
results. The new generation-recovery owner must run inside the shared Project
operation gate, validate pending closed-document recovery, fence admissions,
cancel only this Project's unfinished jobs with confirmed exit, and commit
`GenerationStagingRepository.discardProject()` tombstones before deleting shadow
or reporting Open success. Recover keeps existing valid candidates.

A tombstone/publication failure refuses with the dirty shadow intact. A crash
following durable tombstones keeps candidates logically discarded; restart
reconciliation resumes cleanup and the remaining document recovery still requires
an explicit decision. Physical cleanup can be deferred with an actionable bounded
warning; it must never resurrect images. Failed Open is not reported as success.
Queue history and last actual seed are operational metadata, not temporary PNGs;
the saved `.igs` and its accepted layers/assets and other Projects stay unchanged.
Unsaved document changes, including accepted layers present only in recovery,
are discarded. Discard revokes
the queued result-navigation intent before any async operation; no preview target
can survive this explicit deletion. This is a production lifecycle fix, not a
prototype contract rewrite.

Retained pre-existing gap: Home/open currently detects document shadow only;
staging-only crash recovery without dirty shadow is restored by ordinary Open,
but does not expose the promised RecoveryAvailable decision. `resolveRecovery`
still rejects absent/clean shadow before invoking discard. This checkpoint fixes
the existing Discard button; it does not claim the full recovery UX is complete.

## Bounds, alternatives and verification plan

Existing 64-candidate recovery ceiling bounds session options to at most 64;
normal prepared batches still cap at 32. One pending navigation intent and one
active fresh read per navigator owner; no polling or durable UI preferences.
Existing signed resource verification, queue page size and worker limits remain.
The complete navigation outcomes are focused/unavailable/superseded; Queue
statuses remain the five shared schema values. Full Smart Patch, pending/running
staging entries and accepted-history navigation remain separate work.

Rejected alternatives: persist filter in `.igs` (not document state), trust
prunable queue as session truth, auto-accept/recover on Open, or change Add to a
session-scoped destructive operation. None is required for this navigation slice.

Verify the actual renderer helpers, then actual built Electron → preload/main →
SQLite/staging/resource/Canvas. Use three sessions and independent checkbox mask,
hidden selected count, session removal and exact/repeated Queue focus. Exercise
closed Open, explicit Recover, Cancel, missing candidate and late reads. Discard
Recovery must clear all owned temporary sessions before opening saved state;
failed tombstones preserve shadow, committed tombstones prevent resurrection
across crash/deferred physical cleanup, other Projects/saved accepted assets/queue
history/actual seed stay independent.
Measure document/dirty/Undo/seed/`.igs`/queue/staging invariants after acknowledged
operations. Inspect 900×620 and 1440×900 screenshots. Execute isolated semantic
mutations against exact matching/revocation/filter preservation with neighboring
controls; record command, counts, source/bundle hashes and actual substitutions.
Run required typecheck, app tests, lint, build and sequential native regressions.

## Observed evidence

Implemented owners: `generation-result-sessions.ts` is consumed by Canvas/tray;
`QueueResultNavigator` and App own revocable exact Open continuation;
`ProjectGenerationRecovery` serializes ordinary Open and recovery decisions in
the existing Project gate. `ProjectService.resolveRecovery` validates the closed
Project/recovery before invoking its internal pre-discard callback. Main IPC uses
these owners; no public IPC schema, migration or worker command was added.

`pnpm run app:test`: **752/752 pass**, zero failed/skipped. New focused coverage is
14 production navigator tests, four production session-projection tests and nine
actual recovery-owner integration tests. The latter use real SQLite, Project
service/autosave/shadow, queue/orchestrator/processor, staging and `.igs` files,
including accepted pixels and another Project. They exercise all source-document
sessions, seed `0`, queued sibling cancellation, unavailable/unsafe storage,
confirmed-exit refusal, shared Open gate, post-tombstone crash across database
reopen, and deferred physical cleanup. They do not claim CUDA inference.

`pnpm run typecheck`, `pnpm run lint` and `pnpm run app:build` passed. Build retains
the existing renderer chunk-size warning. Prototype sources were not changed;
production screenshots/IPC checks are the evidence for this slice.

An independent read-only review reproduced a real failure before the final fix:
a failed Discard left an unsafe fence; Recover then opened the dirty document
but reconciliation threw outside its error handler, falsely reporting Open
failure. The actual main-used reconciliation helper now returns a bounded,
visible `storageWarning` and preserves the unsafe generation fence. App surfaces
that warning on Open/Recover. The old reproduction was red (8 pass, one fail);
the fixed production helper is green (9 pass). This was not a blind audit: the
reviewer read current code. The retained staging-only Home decision gap above is
recorded separately from this corrected behavior.

Artifacts are under
`/home/user/.codex/artifacts/imagegen-studio/result-sessions-2026-10-01/`:
final command logs, `tested-source-sha256.json`, isolated mutations and independent
`recovery-discard-review/` red/green reproductions. Executed mutation and native
results are recorded below.

Executed semantic mutations used isolated source mirrors and the real production
test modules; live source hashes were unchanged:

| Mutation                                                  | Baseline | Mutant           | Restored |
| --------------------------------------------------------- | -------- | ---------------- | -------- |
| Remove exact session match from Open continuation         | 14 pass  | 13 pass / 1 fail | 14 pass  |
| Keep a canceled recovery navigation intent                | 14 pass  | 11 pass / 3 fail | 14 pass  |
| Narrow Add selected total to the visible session          | 4 pass   | 3 pass / 1 fail  | 4 pass   |
| Skip durable Project staging discard                      | 8 pass   | 3 pass / 5 fail  | 8 pass   |
| Move unsafe fence reopen outside recovery warning handler | 9 pass   | 8 pass / 1 fail  | 9 pass   |

The staging-discard mutation runs eight real recovery tests: the ninth
shared-gate test waits for the deleted tombstone hook and is deliberately outside
that mutation subset. The unchanged full suite separately runs all nine. Green
neighbor controls include Recover, absent/already-open recovery and
unconfirmed-exit refusal. These mutations prove sensitivity to the named
invariants; they do not prove completeness of test coverage.

Native verification also exposed a bootstrap WAL-visibility defect. It is
reproduced and fixed in the separate [SQLite lock-safety checkpoint](./sqlite-lock-safety-research.md),
while retaining the original secondary close/reopen and exact unfinished-sibling
Add assertions. It is not a result-filtering or acceptance-scope change.

Final native Results execution passed with **nine navigation/session/recovery
checks, 13 screenshots and zero page errors**, together with the existing image
export, Save, Cancel/discard, early Add, grouped Undo/Redo, shadow recovery and
portable Save/reopen assertions. Evidence is in
`native-results-after-sqlite-fix/attempt-4-visible-input-guard/`, including
`native-results-navigation-report.json`, `early-add-precondition.json` and
`fixture-wal-lifetime.json`. Main and the secondary connection now agree on all
five pending jobs; the reviewed Add scope contains exactly two, then three owned
unfinished siblings. Their cancellation preserves the neighboring Project.
Original secondary close/reopen stays in the fixture; WAL/SHM inodes remain
stable and mapped deleted descriptors are absent.

Discard verification deletes all three original owned temporary sessions and
their PNGs, records durable tombstones, opens the saved clean document with no
Results, and preserves the saved package bytes, seed cursor, terminal queue rows
and neighboring candidate/package. Subsequent filter/Add checks publish three
fresh candidates with new identities; they do not resurrect discarded results.
Root visually inspected actual 900×620 and 1440×900 filter screenshots and the
post-Discard empty Canvas. The session selector, global Add action and hidden
selected count remain visible without overlapping controls at both sizes.

Native execution uses the actual built Electron renderer, preload/main IPC,
SQLite, `.igs`, shadow, staging and signed resource paths. Controlled fixture PNG
publication replaces inference, and file pickers are controlled; this is not
CUDA or release-runtime evidence. A failing attempt captured trusted physical
Space on the autofocus Close Queue Manager button, which the test did not send.
The shared test-only `native-smoke-window.mjs` now prevents OS keyboard input via
`before-input-event`; scripted Playwright/CDP keyboard input bypasses that callback
on the tested Electron 44.4.5/Wayland runtime and exercises the actual DOM handlers.
The native window remains visible for real compositor screenshots. A successful
input probe and the full final keyboard assertions verify this substitution;
there are no mocked DOM keyboard events. Hidden-window captures were tried and
rejected after actual screenshot timeout/UnknownVizError. Earlier failed and
superseded runs remain as diagnostic artifacts.

The final Results report records exact script/helper and built main/preload/
renderer SHA-256 identities; they match the checked-out files. Source identity is
also recorded in `tested-source-sha256.json`. Public promise statuses remain
unchanged: pending-only staging, staging-only Home recovery decisions, accepted
history, full inference pipeline and release runtime are still separate gaps.

Sequential native regressions also passed: `pnpm exec tsx
scripts/smoke-desktop.mjs` exercises Project/image import, Raster controls,
Canvas pixels, document editing/Undo, resource linking, Save/reopen, close gates
and damaged/unavailable runtime/recovery handling; `pnpm exec tsx
scripts/smoke-generation-actions.mjs` passed **29 checks, 31 screenshots and zero
page errors**, including Generate, target/seed freezing, progress, replacement,
Queue Cancel/Retry/history and busy Generate admission. Logs are
`native-desktop-final.log` and `native-actions-final.log`; the latter's exact
build/script/helper identities and observed boundaries are in
`native-actions/native-report.json`. Both use the shared physical-input guard.
Actual viewport screenshots were inspected; controlled inference/runtime pixels
remain explicit substitutions rather than release/GPU proof.
