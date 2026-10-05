# Phase 2C: Model Manager presentation read ordering

## Expected result and risk

After reopening Model Manager or starting a newer read, an older read must not
replace the current catalog, storage/token status, install-job rows, error or
loading indicator. An observed job update during a pending full-list read must
remain visible without losing untouched rows in Main's list. Current errors and
successful reads must still be visible; these rules never cancel Main commands.

Authority: [PP-004](../product-promises.md),
[managed model library](../contracts/managed-model-library.md) and the remaining
async follow-up in [resource handoff](./phase-2c-resource-handoff-research.md).
Risk is **medium**: shared renderer presentation state, without changing resource
installation, filesystem mutation, IPC schemas, queue or portable persistence.

## Baseline and confirmed failures

Baseline: `0c69e7001d43e99c7eb97ed57630b5997811122e`, branch `master`.
The native harness ran against that existing built renderer before rebuilding.
`ModelManager.vue` used an unguarded shared `runApi`, replaced the whole jobs
list on completion, and unconditionally cleared `loading` in `loadAll.finally`.
Closing/reopening the modal did not revoke pending callbacks.

The final RED report records **11 checks: eight failures and three passing
neighboring controls**, ten held real replies and zero page errors:

- An old catalog snapshot removes the Default badge set by a later actual UI
  command; the persisted Default itself remains Main-owned.
- An old error from each of catalog, jobs, storage and token reads appears in a
  newer healthy opening. The current-error control remains visible.
- An old storage snapshot replaces the newer actual managed-file byte count.
- An old `loadAll.finally` hides the newer pending-load indicator; the current
  successful read still clears its own indicator and permits interaction.
- An old jobs snapshot changes an already observed failed row back to waiting.
  The untouched neighboring waiting row is also required to remain visible.
- The Project control preserves draft, Undo/Redo, dirty state, bbox, operational
  seed cursor, active tab, focus return and saved package bytes.

This is direct reproduction of missing request ownership, rather than an
inference from source or an assertion against a test-local manager model.

## Owners, finite read registry and data path

The production `MODEL_MANAGER_READ_KINDS` registry defines five presentation
owners; it is the source of the bounded unit-test enumeration.

| Owner   | Producer and response consumer                                          | Currentness rule                                                          |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Catalog | `loadCatalog` → existing Main catalog → rows, selection and exact focus | Latest catalog read in the current modal opening                          |
| Jobs    | `loadJobs` → existing Main list → install rows                          | Latest list, merged with row updates observed during that read            |
| Storage | `loadStorageSummary` → existing Main summary → byte count               | Latest storage read in the current opening                                |
| Token   | `loadTokenStatus` → existing Main token status → status pill            | Latest status read; successful Save/Remove invalidates older status reads |
| Refresh | `loadAll` and its opening continuation → loading and exact-row scroll   | Latest refresh in the current opening; check again after `nextTick`       |

```text
Open / refresh / existing install event
→ ModelManager read owner and opening epoch
→ existing renderer API → preload → original Main handler → real SQLite/files
→ ApiResult
→ owner still current and modal visible?
→ apply success/error, merge job observations, finish current loading/scroll
```

[ModelManagerReadGuard](../../src/renderer/components/model-manager-read-guard.ts)
combines visibility, opening epoch, per-kind request identity and disposal.
[ModelManager](../../src/renderer/components/ModelManager.vue) checks it before
applying either successful or failed read responses, including thrown failures.
Closing invalidates all pending reads and clears the closed modal's indicator;
unmount disposes the guard before unsubscribing. Main requests are not cancelled.
Existing command callbacks retain their original completion behavior. App's
separate Project-return catalog owner remains unchanged.

[Job snapshot merge](../../src/renderer/components/model-manager-job-snapshot.ts)
overlays rows from existing event/command `upsertJob` calls only while that exact
list read is pending. Untouched rows still come from Main; newly observed jobs
remain present. A newer list owns a fresh buffer, and an older read's `finally`
cannot clear it. Neither snapshot nor event DTOs are mutated.

Source review rejected a first approach that invalidated the whole list on one
job event: during initial loading, it could retain changed job A while losing
untouched job B. That finding was caught before a new bundle was built. The
per-read overlay fixes both the original rollback and this neighboring hole.
Job DTOs have no revision or timestamp; this rule preserves updates **observed
during the overlapping read**, not a universal ordering of arbitrarily delayed
events or commands.

In particular, `ModelRepository.listInstallJobs` awaits its job-row query before
a separate artifact query, and coordinator events obtain their DTO through the
same read. An event captured before a newer list snapshot could be delivered
later. The native case here proves older snapshot → later observed event; the
inverse capture/delivery ordering remains unqualified. A future global ordering
contract needs an authoritative per-job revision or separately justified
transition rule, rather than claiming observation time proves database freshness.
The normal coordinator serializes progress writes and their emits, waits for
progress before verification, and awaits each ordinary status emit. Failure/
cancellation paths can still overlap pending progress; the baseline event
upsert already accepted those DTOs without a revision. Source review found no
demonstrated new permanent regression here. Global event ordering remains a
separate qualification boundary.

## Native collaborator and test quality

[Native helper](../../scripts/desktop-model-catalog-race-checks.mjs) uses the real
built Electron renderer, preload, original IPC handlers, SQLite ModelRepository
and saved `.igs`. Its declared timing collaborator wraps existing private
test-only `ipcMain._invokeHandlers`: await the original Main result, hold that
unchanged result, then release it after a later real UI action/read. No new
production test endpoint or replacement DTO is introduced.

The error collaborator supplies an invalid extra argument to the original Main
validator. Its actual `IPC_INVALID_CALLER` failure qualifies late-error
presentation, not a storage outage. Each held reply has acquired/released/
returned acknowledgements. A subsequent actual renderer/preload/Main read plus
two animation frames settles presentation before assertions; fixed sleeps are
not used to establish absence of a stale result.

The storage control temporarily removes and restores one exact managed fixture
file, reading the actual byte-count result. The jobs control prepares two real
repository rows, obtains the changed row through the genuine Main/preload API,
then re-delivers that exact DTO on the existing install-event channel. It
qualifies presentation ordering and retention of a neighboring row, not a real
download, install coordinator run or worker outcome.

Thirteen focused tests import the actual production guard and merge helper:
nine ownership/lifecycle checks and four snapshot/update checks. Their fixtures
are input DTOs, not another implementation of the tested entity. The native RED
provides sensitivity evidence for the real missing guards/list merge; neighboring
controls reject globally suppressing errors, losing list rows or never ending
loading. Review read implementation and harness: it is source review and
self-review, not a blind independent product audit.

## Evidence and remaining boundary

Artifacts are retained under
`/home/user/.codex/artifacts/imagegen-studio/model-catalog-races-2026-10-06/`.
`red-final/report.json` records the final eleven-check baseline, genuine response
gates, screenshots and source/bundle SHA-256. Earlier three-failure and expanded
seven-failure captures are retained separately; only matching assertions/helper
revisions establish before/after evidence.
All five shared built-file hashes in the final RED report match the previous
handoff's `full-final/handoff/report.json`. The RED harness/source fingerprint
records the worktree used to drive that old bundle, not a claim that its new
production source was already built.

Fresh build plus the targeted native run now records **11/11 passed**, zero
page errors and ten held real replies in `green/report.json`. The same eleven
checks also pass after the existing 24 handoff checks inside the isolated
invocation of the full suite, recorded in `full/catalog/report.json`. Root
inspected actual RED/GREEN Default screenshots and the GREEN failed-job/
untouched-neighbor screenshot; the approved layout remains unchanged.

Isolated helper mutation evidence lives in `mutations/`: the unchanged originals
pass **13/13**, and all **six mutations are killed by behavioral assertions**:

| Mutation                                                | Passed / failed tests |
| ------------------------------------------------------- | --------------------- |
| Ignore the opening epoch                                | 12 / 1                |
| Ignore same-kind request supersession                   | 6 / 7                 |
| Ignore disposal                                         | 12 / 1                |
| Replace jobs with the plain old snapshot                | 10 / 3                |
| Retain only observed rows, dropping untouched neighbors | 10 / 3                |
| Mutate the original snapshot objects                    | 12 / 1                |

Each isolated copy executes all thirteen real tests with zero skipped/cancelled;
failures are `ERR_ASSERTION`, not import/compilation failures. Neighboring tests
remain green, source files are unchanged, and runner/patches/logs/source hashes
are retained. This qualifies helper-test sensitivity, separate from native UI
and installation/inference evidence.

Completed root checks: `pnpm run app:test` **1608/1608 passed**, zero failed/
cancelled/skipped; `pnpm run typecheck` passed for prototype and production;
`pnpm run lint` passed. Their actual logs are retained at the artifact root.
The targeted GREEN command was `pnpm run app:build` followed by
`env IMAGEGEN_SMOKE_MODEL_CATALOG_ONLY=1 IMAGEGEN_MODEL_CATALOG_ARTIFACTS=…/green pnpm exec tsx scripts/smoke-desktop.mjs`.
This is the fresh-build equivalent of the new `app:smoke:catalog` entry, not a
claim that that package command itself ran. The standard `app:smoke` chain keeps
eleven native invocations; its isolated handoff invocation runs 24 handoff checks
then these eleven read checks, avoiding another duplicate desktop fixture.
No prototype component changed, so native production evidence does not claim a
new prototype test run or new trained-generation qualification.

The exact `pnpm run app:smoke` completed **exit 0**, including its fresh build
and all eleven native invocations: desktop; isolated handoff + read ordering;
generation results; Generate/queue actions; accepted history; Illustrious and
Anima comparison; VAE; embeddings; Anima authoring; Anima queue. The full-run
handoff/read reports pass **24/24 and 11/11**, with zero page errors; their source
and built-file fingerprints match the final worktree/build. Targeted GREEN's
fingerprints also match that final build. Full logs, per-invocation summary and
identity checks are retained alongside the reports. Changed files pass Prettier
and `git diff --check`.

This checkpoint does not qualify actual token Save/Remove with secret storage,
arbitrary command completion races, CivitAI downloads/repair, installed resource
thumbnails, missing local version IDs, Preset handoff or trained inference.
Token mutation invalidation has direct production-unit/source evidence; its
native coverage here is the status-read failure boundary. The no-generation
Project fixture checks an unchanged null operational seed cursor, not completed
seed Reuse across crash/restart. PP-004 remains **Пока не обещать**; Phase 2C is
not complete.

The next bounded qualification is installed Illustrious CFG Rescale through
actual Advanced Options → Generate → worker pixels → Add → Save/reopen:
same-seed unset/zero/nonzero txt2img and nonzero opaque img2img, with frozen
queue/accepted values and isolated semantic mutations. Existing direct GPU
evidence alone does not qualify that installed UI path.
