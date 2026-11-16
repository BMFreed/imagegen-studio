# Public startup recovery information

## Finite scope and fresh source basis

Research base is clean `ef8c84dcb1bf365ff8084e08b8787ab6ae343f3e`.
PP-002: project availability and explicit update intent. The existing signed
retained inspector and Install veto remain unchanged. Their result currently
reaches only Main console; the Updates dialog offers Review before showing a
generic recovery refusal. Expose that already captured result without new IO or
recovery authority. Risk is medium for the read-only projection; use the full
behavior/evidence pass because it describes a sensitive recovery boundary.

Fresh clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/services/model_install/install_staging_ledger.py:discard`,
  `recoverable_installs`, `is_protected` preserve recovery-marked/unknown data;
  `model_install_default.py:start/_restore_incomplete_installs/restart_failed`
  callers do not interpret explicit retry/cancel as permission to discard it.
- `invokeai/app/services/orphaned_models/orphaned_models_service.py`,
  `find_orphaned_models`/`delete_orphaned_models`, and admin GET/DELETE callers in
  `api/routers/model_manager.py` separate observation from guarded mutation.
  Frontend `features/models/ui/library/OrphanedModelsDialog.tsx` loads inspection
  independently of explicit delete. Protected recovery is not an orphan-delete
  candidate.
- `frontend/webv2/src/workbench/queue-integration/queueRecovery.ts` and
  `useQueueRecoveryProjectIds.ts` preserve unavailable versus empty results and
  request-owner checks across awaits. Adapt this distinction and the existing
  Studio dialog epoch/current-frame guards.

Fresh clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`:
`updater.ts`, `main-process-manager.ts` and `install-manager.ts` callers. Its Python
venv Repair does not provide safe running-AppImage retirement. Invoke also does
not authorize protected recovery deletion just because a user confirms it.
No independent deletion/archive/repair mechanism is substituted in this slice.

## Contract and consumers

Add a separate exact enum-only startup snapshot:

```ts
type ApplicationUpdateRecoverySnapshot =
  | { status: 'not-checked' }
  | { status: 'clear' }
  | {
      status: 'required'
      target: 'unverified' | 'verified'
      runtime: 'unverified' | 'verified-publisher-declaration'
    }
```

The finite valid set has five variants: not-checked, clear, required/unverified,
required/verified-target-only and required/verified-target+runtime. Runtime match
requires verified target. No paths, manifests, keys, journal, PID, backup trust or
mutable capabilities travel to renderer. Ordinary update snapshot stays unchanged.

Main initially uses explicit raw `not-checked`, rather than its former synthetic
`none` when inspection was not attempted. Only the inspector's actual safe
no-stage result becomes clear. The service copies/freezes this projection once
at construction and returns detached copies from `getRecoveryStatus`. Its sticky
retained-at-startup veto is unchanged. No getter performs filesystem reads, hashes,
network requests, admission acquisition or operation scheduling.

IPC/preload use existing trusted-window/current-document and exact data guards.
This getter is read-only like status: it does not revoke a reviewed version or
grant another Install attempt. Invalid payloads and exceptions return fixed
diagnostics; stale replies are discarded. No selector/path argument is accepted.

Updates reads the getter once per open, independently of publisher configuration.
Its response is guarded by the presentation epoch across dismissal, reopen and
unmount. It is never called by download/status polling. There is no Refresh,
Recover, Retry installation, open-folder or cleanup action in this slice.

Required recovery appears after versions, independently of feed/transfer state,
with an explicit **At app startup** label. Target/runtime facts are not a healthy
startup or engine claim. Review/Install offers and their App handlers are blocked
for required or unreadable/pending recovery information; Check/Download remain
unchanged. Clear renders no success card. Valid not-checked renders a neutral
explanation, without asserting safe absence. A failed getter is a separate error,
not an invented not-checked or clear response.

This is an immutable startup observation. A later stage can still appear and is
refused by the existing fresh Main preflight; clear is not continuing installation
authority. Removing files externally never turns this startup required snapshot
into successful recovery. Projects remain available. All eight public promise
statuses remain unchanged; recovery/reinstall, ownership, retirement and shipping
acceptance remain open.

## Verification and limits

Strict validator tests cover every valid enum tuple, invalid combinations, unknown
fields and accessors without reading them. Service tests cover detached copies,
input mutation, absent publisher, not-attempted inspection and zero getter side
effects with retained veto intact. IPC tests cover current frame, stale async
replies, payload normalization and unchanged reviewed-version authority.

Browser checks use the existing Vue/Naive prototype, not a new design. Cover the
five states, unavailable publisher, getter errors, pending/error admission guards,
stale close/reopen responses and preserved Check/Download. Full typecheck and
`pnpm run prototype:test --workers=2` are required. Inspect actual screenshots and
resize/scroll states before claiming visual correctness.

A semantic mutation should downgrade actual required projection to valid clear,
produce the appropriate consumer RED, preserve a neighboring clear GREEN and
restore exact source/bundle bytes. A real packaged A→B flow must show required
startup recovery in B's actual Updates dialog with B's feed configuration absent,
saved Project access, unchanged stage/current/backup and normal process exits.
Prototype mocks cannot prove persistence, native startup or signing authority.

No new file-size/count/time/resource limits: five enum variants, existing IPC
projection and dialog lifetime boundaries. The snapshot carries no user-controlled
strings. Native qualification reuses the admitted desktop scope budgets, with
pre-admission promotion overhead explicitly unqualified. No ML copies/inference.

## Results

Root executed this dirty implementation against the base above. Evidence RUN:
`~/.codex/artifacts/imagegen-studio/runs/application-update-recovery-status/20261116`.

- **636 Main PASS / one existing platform SKIP**, 637 cases total. This includes
  the actual preload contract, updater, current-frame IPC, staging/admission,
  publisher CLI and ordinary Project close/path-lock controls. No Python/ML path
  changed or was qualified here.
- **358 browser PASS**, no skips/retries/failures, before the local warning-text
  contrast correction. The original wrapper receipt was lost across a tool
  interruption: complete Playwright JSON/footer and the unit resource journal
  are retained; original command exit code and wrapper duration are unavailable.
  `check-browser.json` explicitly records null for those values.
- **Five final focused browser PASS** after that CSS correction. Actual screenshots
  of all five states were inspected at 900×620; modal bounds and footer visibility
  are asserted. Required paragraphs inherit Naive Alert text/color (13px), instead
  of the generic muted 12px detail style. Sampled warning body contrast improved
  from 3.27:1 to 6.71:1. This is a local visual check, not whole-app accessibility
  certification. Full and focused results/source snapshots remain separate.
- Final `pnpm run typecheck`, changed-file ESLint and `pnpm run app:build` PASS.
  The first contrast-only lint attempt required a Prettier line wrap; the corrected
  rerun passed. Full-repository lint was not repeated. Existing build chunk-size
  warning remains.
- Actual projection mutation: valid required → valid clear. Original two GREEN,
  mutated neighboring clear GREEN + retained tuple semantic RED, restored two
  GREEN. Original source stayed untouched; original/restored bundles match exactly.
  This is a service consumer mutation, not a native mutation.
- One actual packaged **A0.1 → B0.2**, 70.237 seconds, **two normal app exits**.
  A has the controlled loopback publisher; B has public trust and no publisher
  config. Both contain the exact same final 42 production dist members plus the
  declared nonshipping observation/timing bootstrap. B shows unavailable updates
  beside required startup recovery with verified target and publisher runtime
  tuple. Original current-frame request/reply pairs include A recovery×2 and
  B recovery×5/status×6/check×3. Three direct reads, explicit Check again and modal
  reopen preserve stage/current/backup/admission lock, saved Project and candidate
  cache bytes/identities; B makes zero HTTP requests. The saved prompt reopens
  through the real Project loader and all 30 existing database migrations match.

Native screenshots capture the visible consumer during modal animation; settled
layout/contrast evidence comes from the focused prototype screenshots. Native
qualification uses original handlers, real admission `flock`, Save/Close and
relaunch. The bootstrap controls startup admission and final close timing, native
Save decisions and observation. It does not replace production Main/preload/Vue.
Known 23 PID/start identities, two owned scopes and deadline timers were rechecked;
physical exit is not inferred merely from launcher completion. Node, Electron,
SQLite and flock originals are pinned; shared runtime/models and host integration
are untouched.

Compact receipts include `qualification-summary.json`, `mutation-recovery.json`,
`visual-review.json`, `native-recovery-r1-result.json`, source reviews and final
source snapshots. `payload-inventory.json`, `retained-payloads.tar.gz`,
`retention.json`, `final-audit-live.json` and `final-audit.json` record full-byte
retention and its actual audit/disposal outcome. Exact raw `RUN/payloads` and
`t-aurs-1116` may be disposed only after the independent live audit and confirmed
idle identities; never resume their historical paths after disposal. Reconstruct
independent regular files from internal content aliases, never hardlink mutable
current/cache/backup files. No external dependency or ML payload is introduced.

Independent source-only reviews and retained-byte audits remain separate from
Root's actual execution and visual review. The unused signed mismatch capsule is
retained as a producer control; no mismatch native run is claimed here. Signed
runtime tuples establish publisher-declared file matches, not automatic AppImage
container readback, loaded V8 memory, complete dependency integrity, engine
readiness, healthy-startup acknowledgement or shipping acceptance.

The next unresolved recovery boundary is an authorized recover/reinstall or
retirement consumer with precise ownership and legacy/unleased-process handling.
This slice supplies observation only and does not settle that product/safety
contract. Shipping publisher setup, global lifetime ownership, recovery/rollback,
release matrix and final MVP acceptance remain open. All eight promise statuses
are unchanged.
