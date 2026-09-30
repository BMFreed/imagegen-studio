# Phase 2B: production Queue Manager actions

Risk: **high**. Base: `6b65c889` on `master`, clean before this slice.
Expected behavior: [Queue Manager](../features/queue-manager.md),
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
This implements an app-level history surface and explicit job actions; it does
not claim the full Phase 2B GPU/release pipeline is ready.

## Boundary and decisions

Renderer → typed preload → trusted main-frame IPC → the existing app-owned
`ProjectGenerationActionController` → recovered SQLite queue / staging and
serial dispatch. No second queue owner, GPU worker or database is introduced.
Queue history access depends on recovered storage, not a working ML runtime.
The controller retains the same per-Project operation gate used by Generate,
Add and close. Shutdown waits retry admission before dispatch exit and DB close.

The five statuses come from migration 0005. Retry accepts only failed/canceled;
Delete/Clear accept only terminal states. A reviewed row carries ID and status
sequence, including sequence zero. A pending Cancel that loses to a claim is
stale; it must not silently cancel the newly running operation. Running Cancel
requests cancellation and waits the existing processor's confirmed worker exit.

Retry uses the verified old frozen input, never the current draft. Admission
requires the original local project key plus portable document ID to be open,
a free engine, qualified worker and current exact checkpoint verification.
The same gate covers retry publication and Project close. Staging capacity is
checked for the newly generated job/session before source-sequence CAS and
new-row publication; identities and shutdown are checked again after awaits.
A retry preserves all previous candidate sessions. Known refusal leaves the
source revision unchanged. An ambiguous commit must preserve durable input and
fence further admission/dispatch; exact committed-row reconciliation resolves a
lost acknowledgement without a false failure or duplicate implicit retry.

Delete and Clear act on queue history and its private input copies. Published
candidate PNG/manifest, receipt, last-actual-seed cursor, accepted document,
`.igs`, dirty and Undo remain separate. Reserved publication receipts protect
history rows needed by recovery. Clear is an explicit execution-time sweep of
the selected terminal statuses, including rows becoming terminal before its
transaction; its confirmation says this, returns the removed count, and keeps
protected rows visible. There is no automatic retention or eviction policy.

A metadata-only global page must not hash PNG/model files. A corrupt payload
keeps row/status/actions visible with unavailable frozen details. Public errors
use owned messages rather than raw worker/storage errors containing paths.
Project display name comes from the index only when key, document and canonical
path match; the filename is a fallback when indexed metadata is unavailable.
This is a navigation label, not an assertion that the job froze today's title.

## Parameters and controls

- Page size 50: a presentation decision, not queue capacity or retention. Newest
  `(created_at,id)` keyset order provides deterministic ties; Load older uses
  the last included row. SQLite counts cover all rows, not just the page.
- Existing payload ceiling 128 KiB bounds each decoded frozen record; 50 records
  bound one page's source payload to 6.25 MiB. Exact metadata wire size is measured
  below; no performance benchmark is claimed.
- Existing target 32 MiB, prompt 16 KiB, worker wire 64 KiB and staging manifest /
  candidate ceilings remain enforced by the existing qualification/preflight.
  Free disk, CUDA/VRAM and model loadability remain external/unproved here.
- Initial busy-time Generate/Retry refusal remains explicit. No invented percent
  progress is displayed: this protocol currently has no normalized step events.

## Verification plan

Use actual SQLite/files, controller entry points and an Electron
renderer→preload→main smoke with a controlled qualified worker. Cover frozen
Retry versus edited draft, same-path changed document, stale/concurrent review,
preflight/qualification refusal, close/shutdown during admission, pending claim
race, terminal cleanup with candidate/seed independence, reserved receipt,
corrupt metadata, paging/ties and runtime-independent history. One semantic
mutation must remove the current-document guard and be killed by its regression
case. Inspect settled Queue Manager screenshots at normal and compact sizes;
run app tests, typecheck, lint, build/native checks. Prototype source stays out of
this slice, so prototype UI tests are not evidence for these production actions.

## Observed evidence

Observed on 01.10.2026 against the completed working tree based on `6b65c889`:

- `pnpm run app:test`: **645 passed, 0 failed/skipped** against production TS
  rules, actual SQLite/files and the existing controlled runtime fixtures.
- Queue repository focused checks: **48/48**; final controller checks: **21/21**;
  new exact-shape wire checks: **3/3**. These are included in the full app count,
  not extra independent coverage claims.
- `pnpm run typecheck`, full ESLint, build and changed-file formatting passed.
  The build retains the existing large-renderer-chunk warning.
- Built Electron Generate/Queue Manager smoke: **14/14** named scenarios,
  no page errors; all original Generate scenarios retained. Actual preload/main
  actions prove frozen Retry versus edited prompt/seed/bbox, pending/running
  cancellation, stale-review refusal and confirmed Delete/Clear preserving
  candidate/resource bytes, seed cursor, current draft and `.igs`.
- Existing native desktop scenarios passed, including degraded runtime/recovery
  and native close; Results/early Add/Undo/shadow/portable Save smoke passed.
- Final native screenshots inspected at **900×620, 1440×900, 1920×1080**; modal
  remains inside the viewport, with separate full-height scroll areas and no
  horizontal overflow. The production-renderer mock fixture additionally
  exercised 50→100 rows with the actual cursor; it proves UI pagination wiring,
  not native persistence or GPU behavior. T3 preview host disconnected after
  that inspection; no alternate browser was launched.
- The observed six-row, all-five-status `ApiResult` response is **5,240 UTF-8
  bytes**. This is sample measurement, not a worst-case performance claim.
- Isolated mutation omitting repository retry preflight: baseline **1/1**,
  mutation **1 expected failure**. Isolated mutation removing Retry document
  identity checks: baseline **2/2**, mutation **1 failure + 1 neighboring pass**,
  restored **2/2**. Temporary worktrees removed; live source hashes unchanged.

A full behavior/evidence review identified and corrected three issues before
final validation: unbounded target-path reopening now consumes retained verified
bytes; unconfirmed worker exit keeps Retry cancel available; native screenshots
exposed generated filenames instead of Project titles, now resolved from the
matching real index. Follow-up controller cases verify real Project close sharing
the Retry gate, checkpoint corruption refusal and confirmed cancellation retry.
The initial shutdown test expected controller CLOSED, but the synchronous
repository Project fence correctly refuses earlier with QUEUE_PROJECT_CLOSING;
the assertion was corrected while preserving the no-publication/source-revision
invariants.

Evidence retained under
`/home/user/.codex/artifacts/imagegen-studio/queue-manager-2026-10-01/`, including
command logs, native reports/screenshots and final source hashes. The native
report identifies the exact built main/preload/renderer JS/CSS/script hashes and
rechecks them after execution. No CI or packaged-release result is claimed.
The controlled peer substitutes inference/qualification and pixels; the real
Electron UI, IPC, RuntimeManager ownership, queue/staging filesystem and SQLite
remain exercised. No CUDA/model-loadability or release installer claim follows.

## Remaining scope

Normalized progress/preview events, queue result thumbnails/session navigation,
retry admission while busy, full Invoke conditioning/Anima/other raster modes and
release installation remain open. Reserved invalid receipts intentionally stay
protected; a restart does not promise to resolve a persistently invalid record.
There is no retention policy or automatic eviction. Phase 2B and the public
PP-007/008 flows remain incomplete.
