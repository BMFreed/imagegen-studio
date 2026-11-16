# Installation impact preview before close

Base: `ee2bf0b5282ac4ddd17d6a225cd80d575c1b851f`, clean master at entry.
Risk: medium/high boundary review: new public IPC exposes operational counts but
must grant no close, filesystem transaction or restart authority. PP-002 and
[Application Updates](../features/application-updates.md) require a preview before
ordinary close consent. Follow research/review and artifact-lifecycle protocols.

## Fresh donors and consumers

InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`invokeai/app/services/shared/database/queries/session_queue.py:_status_counts/status_counts`
→ `session_queue/session_queue_default.py:get_queue_status` →
`app/api/routers/session_queue.py:get_queue_status`: operational metadata counts
without input/session graph hydration. `session_processor_default.py:stop` and
`services/invoker.py:stop` order actual cancellation and service disposal; preview
must not call them. Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`
`src/main/updater.ts:checkForUpdates` and `main-process-manager.ts` window-close /
`getCloseConfirmationDetail` callers separate confirmation from actual shutdown.
Reuse these already adapted Studio getters and request/document guards rather than
adding another queue, shutdown manager, stage or installer.

Existing Main native close flushes renderer drafts, drains/fences generation, then
reads global queue and per-tab staging before consent. Calling this close flow for
preview would mutate state. Instead compose `queue.getAppCloseImpact`,
`ProjectGenerationClose.getCloseImpact`, and `ModelInstallCoordinator.getCloseImpact`
without entering close. Capture Project tab IDs/dirty flags and reject changes
while reading. Queue is read before staging; it covers closed/private jobs and is
not summed again with per-tab unfinished counts. Candidate count covers open tabs
whose close can discard results, including private regional and Smart owners;
closed-Project recovery is preserved. This is advisory, not a cross-owner database
transaction or a coherent flush of unacknowledged editor drafts.

Staging inspection is not universally byte-for-byte filesystem read-only: its
existing owners may initialize/validate/harden recovery directories. Reuse that
existing mechanism unchanged. The invariant is **no Save, draft flush, fence,
cancellation, discard, Project close, update staging/backup/activation or restart**.
Do not claim a new check-only filesystem implementation or duplicate storage logic.

## Finite public projection and invalidation

The nine-field plain DTO contains displayed version, open/unsaved Project counts,
global unfinished jobs, open-tab unaccepted results, generation-storage availability,
active/preparing model installs and active resource removal. Counts are nonnegative
safe integers; unsaved cannot exceed open. When generation storage is unavailable,
both generation counts are null, never a fabricated0. Model/project identities,
paths, prompts, release declarations and native capabilities remain Main-private.

Review accepts only one strict SemVer and the current downloaded **signed** release.
The existing native artifact gate checks before and after collection; Check/Download
or changed cache/selection retires the response. Missing collector, tab changes,
failed inspection or malformed data refuse with fixed public errors. Existing
current-frame/document epoch guards apply to this fourth IPC action; preload checks
exact DTO and requested version. Main also refuses if native close is running.
No install availability or reusable authorization token is returned.

Existing Updates modal gains explicit `Review installation`, pending/error/retry,
snapshot counts and `Install later`. A fresh request refreshes counts; close/reopen,
Check or Download invalidates previous replies. Review never starts automatically
on Download/status. Existing fonts, Naive surfaces/tokens and dialog layering stay.
No actionable Install is exposed: same-owner private filesystem transaction is not
mounted-AppImage/relaunch/crash-recovery acceptance. The UI says current Project
state is checked again when closing, including editor drafts not yet known to Main.

## Verification plan

Shared/IPC/service refusal and adjacent valid controls, actual native signature/cache
integration with controlled transfer/collector ports, real SQLite queue/staging
inspection, no destructive calls, closed/private queue coverage, changed tabs and
selection, unknown storage and literal count projection. Browser checks use actual
App/modal with controlled preload/Main ports; they do not qualify Electron IPC,
network or installation. Inspect screenshots/resize and late dismissal/reopen.
A precise protocol mutation must reach the requested-version binding and give
semantic RED with original/restored GREEN. Full typecheck, app build, scoped lint
and prototype tests with exactly `--workers=2` follow. No MLruntime/model copying.

## Executed evidence and retained limits

Root executed **294 targeted Main/shared tests PASS**, including actual migrated
SQLite queue/staging/ProjectClose integration and native provider/signature/cache
service tests with controlled HTTP/transfer/collector ports. The latter do not
pretend to qualify the real collector; the separate integration uses actual owned
open/closed private regional candidates and normal queue rows, preserving rows,
receipts, candidate bytes and healthy SQLite+WAL bytes with no destructive calls.
Smart absence, model activity and tab metadata remain controlled in that test.

Full browser run: **333 cases =332 PASS+1 failure**. The pending Refresh button's
Naive loading icon changed its accessible name; a fixed aria-label corrected it.
Root inspected 900×620/1280×800 screenshots: footer controls stay visible; at compact
size the unavailable-Install notice was below fold, so it moved above counts with
an explicit in-viewport check. After these two local fixes, **34 affected Updates
cases PASS** (10 new preview+24 existing). The unchanged full333 matrix was not
repeated; no single all333 final PASS is claimed. Initial failure trace/context,
both browser reports and before/after screenshots are retained.

Final full `pnpm run typecheck`, `pnpm run app:build`, scoped ESLint of all15
changed TS/Vue files and final two-file UI lint PASS. The actual App/modal browser
is rendered with controlled preload/Main API ports; it is not an installed Electron,
network, close/restart or persistence acceptance. No AppImage or ML payload is used.
Serial checks use4GiB/zero swap/600s; full browser peak3.5GiB, final affected
browser peak2.3GiB. Build reports its existing large renderer-chunk advisory.

The separately compiled **actual Main IPC owner** passed neighboring correct-version
controls. Removing only its requested-version binding gives a **semantic RED**:
a valid DTO for0.3.0 is accepted for a0.2.0 request. The exact assertion fails with
exit1; original and exact restored modules refuse with exit0. The matrix is0/1/0,
not setup/OOM/timeout. Service ports are controlled; this is neither Electron IPC
transport nor an end-to-end preload bypass test. Workspace source is never mutated.

Independent finite production source review is **CLEAN**; review of the reviewer's
own authored tests is explicitly self-review. Actual checks above were executed by
Root, not that source reviewer. Root's local UI check is not full accessibility
qualification. Existing staging inspection's initialization/permission-hardening
caveat and unacknowledged editor-draft limits remain unchanged.

Evidence: `runs/application-update-install-preview/20261116`. All4,766 payload
entries were retained in a19,701,025-byte archive before exact idle cleanup;
49,418,240 allocated bytes were reclaimed. Both own payload/temp trees are gone,
lifecycle retained with no borrowed dependencies. Protected shared models/runtime,
host application files and other payloads were not cleaned. Existing40GiB artifact
root remains a documented protected-data soft-budget exception; no ML copies added.
Independent retained-byte audit is **CLEAN**: every member/type/mode/full hash,
all15 live code hashes, exact isolated guard omission,0/1/0 reports and the distinct
294 /332+1 /34 browser evidence levels match. Two audit-reader assertions (wrong
button label and unanchored search matching a passing test title) were corrected
and retained separately; neither was a product failure or semantic RED. Audit
does not reexecute tests, modules or the app. Delivery proof is retained separately.

Raw payload/temp paths no longer exist. For reproduction use the recorded commit,
source/module archive and inventory in a new owned run; reconstruct only required
payload members without following links, rebind script paths/unit names to that
run and validate every hash. Do not resume the disposed run or borrow shared ML
environments: this inspection requires none.

Shipping publisher remains unavailable; public Install/relaunch, retained-stage adoption/discard, crash
recovery and release migration/runtime acceptance remain open. PP statuses unchanged.
