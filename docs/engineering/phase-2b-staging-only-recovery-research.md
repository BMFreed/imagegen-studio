# Phase 2B: Explicit recovery of temporary results without document edits

Risk: **high**, because a new recovery decision authorizes durable deletion of
all Project temporary generations and must preserve saved content, neighboring
Projects and one-use Queue navigation. Base: `285c31f5c97b9cb9c4a13422bad2e494d487912e`,
clean `master` tracking `origin/master`.

Contracts: [Project lifecycle](../features/project/document-lifecycle.md#autosave-and-recovery),
[Home](../features/home-screen.md),
[GenerationResults](../features/project/generate-mode/generation-results.md),
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю) and
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
The preceding [Results checkpoint](./phase-2b-result-sessions-research.md)
explicitly records this remaining gap. The user has authorized roadmap
continuation and already chose Discard to remove both document recovery and
every temporary generation belonging to this Project.

## Confirmed gap and chosen owners

`ProjectService.toSummary`, `openOne` and `resolveRecovery` inspect only document
shadow. A closed saved Project with completed staging and absent/clean shadow
therefore gets no Home badge, opens without a decision, and cannot resolve
recovery. Dirty-shadow recovery and all-session Discard already have real
storage/IPC evidence and remain the neighboring controls.

The existing `GenerationStagingRepository.listVerifiedCandidates` validates
manifest/receipt/PNG identity, completion and tombstones independently of pruned
Queue rows. It is the authoritative presence check; directory existence, a
completed Queue row, cached thumbnail or seed cursor cannot substitute for it.
Inspection must neither accept nor reconcile pending acceptance intent. A
completed acceptance handoff has atomic session tombstones; pending handoff is
resolved by the existing post-open document-lineage reconciliation.

Inject a typed main-only temporary-recovery inspection into `ProjectService`.
That service keeps ownership of saved-file health, closed/open document state,
shadow precedence and every ordinary Open path, including managed-file import.
Main binds the reader to the already recovered staging owner before exposing
IPC, using the existing late-binding pattern for the seed reader. The
`ProjectGenerationRecovery` owner keeps its shared Project operation gate,
admission fence, confirmed cancellation and awaited all-session tombstones.
No new SQLite schema, worker operation, portable field or durable UI state is
needed. The existing `recovery-required`/`recoverable` Open result represents
valid staging-only recovery.

Consumer review identified that both import paths call `ProjectService.open`
directly. With absent/clean shadow, an import could overtake a held Discard after
its tombstones made staging empty and acquire the saved document's lease before
Discard finishes opening it. Route only the internal import Open calls through
a main-only injected callback bound to `ProjectGenerationRecovery.open` and its
existing gate; document-only consumers retain their local fallback. The owner
calls ordinary document Open, so this introduces no recursion. Resolve also
rechecks open-tab ownership after awaited inspection before deletion. File
transfer/move boundaries and the existing post-open reconciliation stay intact.

## Observable behavior and state completeness

- Closed ready Project with valid completed results and absent/clean shadow:
  Home says Recovery available; ordinary Open requires the existing decision
  before creating a tab or exposing signed image resources.
- Recover opens the saved `.igs` as clean, with no new Undo step or accepted
  layer. Completed results remain temporary; their restore does not write `.igs`.
  Queue continuation occurs only after explicit Recover and a fresh exact read.
- Discard awaits durable tombstones for all owned source-document sessions,
  then opens saved state. Saved accepted layers/assets, seed and retained Queue
  rows stay independent; unfinished owned jobs require confirmed cancellation.
  Other Projects are unchanged. Deferred physical cleanup warns and cannot
  resurrect results.
- Cancel/Escape leave the Project closed, preserve saved/shadow/staging bytes,
  and revoke Queue continuation. Later ordinary Open requires a fresh decision.
- Already open Projects keep their current tab and do not advertise normal
  staging/autosave as crash recovery. Inspection rechecks this after awaits.
- Fresh Resolve refuses if the Project is already open or the only valid
  recovery disappeared. A stale dialog/count never authorizes deletion.
- Dirty valid shadow retains existing dirty Recover semantics. Invalid/stale
  shadow keeps its existing precedence even with valid staging; silently opening
  saved state while discarding or quarantining that shadow is outside this slice.
- Missing/corrupt/unsupported saved files retain their current health gate;
  recovery inspection never claims a successful open or deletes their results.
- Old-document valid candidates still count as recovery, with existing
  preview/export-only and source-mismatch Add gates. Tombstoned, incomplete,
  pending-only or corrupt candidates do not become recoverable. A broken optional
  thumbnail does not invalidate a verified PNG.

Temporary inspection has three finite outcomes: verified present, verified
absent and unavailable. Unavailable is not evidence of absence. Preserve the
existing degraded saved-document editing/Save path: with absent/clean document
shadow, Home explicitly reports Recovery unavailable with a diagnostic, ordinary saved Open includes the bounded
temporary-store reason in its warning, and no unknown files are deleted. Add `unavailable` to the
Home summary output status; it is not an actionable recovery-only dialog.
Valid dirty document recovery still opens for review when temporary storage is
unavailable; destructive Discard continues to refuse without its actual staging
owner. Clean saved preview rebuild remains available in degraded mode, while
known pending recovery must first be resolved.

The public summary status set becomes none/recoverable/invalid/stale/unavailable;
Open outcomes and recovery actions remain their existing typed unions. The
existing modal copy must cover both unsaved edits and temporary results without
promising that staging-only restore creates document edits.

## Bounds, races and alternatives

Reuse existing staging verification and serialization, including the 64-candidate
ceiling, 8 MiB manifest and 128 KiB frozen-context ceilings in
`generation-staging-limits.ts`; preserve the 32 MiB PNG ceiling from
`IGS_GENERATION_PNG_MAX_BYTES` and the existing safe file/resource checks. Do not
add polling or an unverified recovery index.
Home's existing Project list remains the scope of inspection, and the shared
staging owner serializes file verification. New temporary-store inspection
reasons and combined Home reasons are capped at 512 characters. Existing
post-open reconciliation separately caps its error detail at 512 characters
before adding its prefix; combined tab warnings are not a new globally capped
format. The list badge is advisory; Open and
Resolve inspect current files/candidates again through their real owners.

Rejected alternatives: first open then ask (already grants a tab/lease and image
access), trust prunable Queue history, mark all staged Projects dirty, silently
Recover, store candidates in portable `.igs`, or label unknown storage absent.
A separate salvage policy for invalid shadow is not required to implement the
already specified valid staging-only path.

## Verification plan

Write real boundary regression tests before implementation and observe the
existing missing decision. Use actual Project service/autosave/SQLite/queue/
processor/staging and `.igs` files; fixture inference pixels are a named
substitution. Cover clean/absent shadow, Save-before-crash, queue prune,
old-document candidate, thumbnail/PNG corruption, tombstones, open-tab suppression,
managed import, unavailable storage, invalid/stale shadow precedence and fresh
decision refusal. Preserve existing all-session Discard, seed-zero, neighboring
Project, failure/retry and confirmed-exit tests. Include pending acceptance
handoff as a control for existing post-open reconciliation.

Native Electron coverage uses actual built renderer/preload/main IPC and storage:
stage-only Home badge; Open before any tab; Cancel and later ordinary Open;
Recover as clean with temporary candidates; exact Queue continuation only after
Recover; all-session Discard preserving saved bytes/seed/history/neighbor.
Retain the previous dirty recovery and full acceptance/Undo/Save assertions.
Use the established native physical-keyboard guard and actual compositor
screenshots; inspect normal and compact windows with the UI audit checklist.
The prototype currently models dirty-shadow mock recovery only and is not proof
of staging persistence.

Execute isolated semantic mutations against bypassed stage-only decision,
stage-only Recover dirtying the document and omitted durable Discard; preserve
live source hashes. Run typecheck, full app tests, lint, build and sequential
native Results/Desktop/Generate checks. Record actual counts, revision/source/
bundle identity, substitutions and remaining gaps. Update supporting contracts,
roadmap, PP-007/008 matrix and bodies together without promoting public readiness.

## Evidence

Implementation uses `project-temporary-recovery.ts` to inspect the authoritative
staging owner and distinguish verified presence/absence from unavailable storage.
Project service uses this dependency for Home, fresh Open/Resolve and closed
preview rebuild. Main routes both managed and external-copy Import Open through
the existing generation-recovery owner/gate; post-open reconciliation preserves
existing warnings. The renderer and runtime preload validator accept the new
summary status. Both Import UI consumers display the returned warning instead
of losing it when the Home badge is suppressed for an open tab.

Before implementation, the actual recovery fixture suite ran **12 tests: nine
passed and three failed** on staging-only Home/Open, Recover and Discard. These
are behavioral failures against real `.igs`/shadow/SQLite/staging owners, not
missing harness files. Native Desktop against the earlier verified `285c31f`
bundle likewise failed the new unavailable-storage assertion with `none`
instead of `unavailable`; preceding retained scenarios passed.

After implementation, the focused recovery suite passed **23/23, zero skipped**.
It covers absent/clean shadow, Save-before-crash, queue prune, corrupt PNG and
optional thumbnail, tombstones, old-document orphan restrictions, pending
acceptance reconciliation without duplication, invalid/stale shadow precedence,
unavailable storage, vanished candidates, open-during-inspection, managed Import
gating, external-copy Open, confirmed worker exit and filesystem failure/retry.
Actual saved assets, seed `0`, terminal history and neighboring recovery remain
independent controls. Full `pnpm run app:test` passed **766/766**; `pnpm run
typecheck`, `pnpm run lint` and `pnpm run app:build` passed. The build retains its
existing large-chunk advisory. Prototype source was unchanged; its mocked
recovery flow is not substituted for the production evidence.

Executed isolated semantic mutations:

| Mutation                              | Baseline | Mutant           | Restored |
| ------------------------------------- | -------- | ---------------- | -------- |
| Bypass staging-only Open decision     | 23 pass  | 17 pass / 6 fail | 23 pass  |
| Mark staging-only Recover dirty       | 23 pass  | 18 pass / 5 fail | 23 pass  |
| Omit durable `staging.discardProject` | 5 pass   | 3 pass / 2 fail  | 5 pass   |

The final mutation targets the two destructive scenarios and three neighboring
controls; held-hook tests that deliberately wait for the omitted call are
excluded from that targeted run. All valid mutation runs have zero skips or
cancellations. Live production/test source hashes and restored mirror hashes
match before/after. An initial mirror preparation lacked the ICC fixture and
failed with ENOENT before mutations; its separate harness log is retained and
the corrected green baseline precedes every mutation.

Read-only independent source review and a separate execution of the 23-test
fixture suite found and verified fixes for Import gate/warning seams and
post-await tab revalidation. The reviewer read current source; this was not a
blind audit.

Final native Results passed **12 navigation/session/recovery checks, 21 actual
screenshots and zero page errors**, together with its retained preview/export,
exact early Add/sibling cancellation, grouped Undo/Redo, dirty shadow and
portable Save/reopen assertions. Stage-only Cancel leaves the tab closed and
revokes Queue intent; later Home Recover opens clean with default All. Queue
Recover finds the exact session only after the decision. Discard removes all
owned temporary sessions while preserving `.igs`, seed rows, Queue rows and
neighboring candidate hashes. No source-document fallback or automatic Add is
used.

Normal and compact actual modal screenshots were inspected with the UI audit
checklist: all text/actions remain visible, Recover is the single filled primary
action, and the stage-only Discard view has saved Canvas with no Results. The
first new native attempt changed the window from its original 1380×900 to a
hard-coded 1440×900 after compact screenshots, breaking a retained exact frozen
preview geometry assertion by one pixel. The fixture now captures and restores
actual original bounds/content size, asserts equality and records a restored
screenshot; the original Canvas assertion is unchanged and passes. Failed
attempt artifacts are retained; no production layout change was required.

Sequential `pnpm exec tsx scripts/smoke-desktop.mjs` passed its retained
Project/model/prompt/Canvas/Undo/Save/import/native-close scenarios and the new
degraded-store checks. The real preload accepts `unavailable`, Home shows its
diagnostic, ordinary Open creates no recovery-only modal, and edited saved `.igs`
can still be explicitly saved. Managed Import and copied external Import each
show a fresh warning after the previous actual NAlert was dismissed; saved source
bytes and the unknown symlink target remain unchanged. Tab and zero-tab native
window close still require the existing explicit Keep Recovery decision.
Actual unavailable Home and Import screenshots were inspected for readable
warnings and usable controls. The first attempt used an incorrect new Save
locator; it was corrected to the existing `Save Project` accessible name. A
second attempt failed one unchanged legacy LoRA tooltip hover; its next unchanged
run passed completely. Both failure logs are retained; no tooltip implementation
or assertion was weakened.

Sequential `pnpm exec tsx scripts/smoke-generation-actions.mjs` passed **29
checks, 31 screenshots and zero page errors**, retaining Generate/frozen inputs,
progress, replacement, Queue Cancel/Retry/prune and busy admission boundaries.
All native scripts use the same unchanged physical-keyboard isolation helper;
the native windows and compositor screenshots remain visible rather than hidden
browser substitutes.

Artifacts are under
`~/.codex/artifacts/imagegen-studio/staging-only-recovery-2026-10-01/`:
backend baselines/final logs and `backend/mutations.json`; old-bundle native red
log/identity; full application checks; and
`native-results-attempt-2/native-results-navigation-report.json` with actual
source/bundle/script/helper identities and raw storage controls. Desktop's final
log is `native-desktop-final.log`; Generate's final log and report are
`native-actions-final.log` and `native-actions/native-report.json`. Final tested
source and native bundle identities are recorded in `tested-source-sha256.json`
and `native-verified-bundle.json`. Deterministic
published inference PNGs and controlled development derivatives are named
substitutions; these checks do not prove real CUDA generation, installed release
runtime or the full Illustrious/Anima pipeline. PP-007/008 matrix and body status
remain unchanged. Pending-only sessions, accepted history, Smart Patch acceptance,
full inference pipeline and release runtime remain separate roadmap work.
