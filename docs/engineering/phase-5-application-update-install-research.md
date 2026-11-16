# Public application Install through normal close

Base: `afcf4cab46fd9b1969d12e3b9f1966a853a77d00`, clean master at entry.
High risk: explicit executable replacement, document/IPC authority and irreversible
Project/SQLite shutdown. PP-002 and [Application Updates](../features/application-updates.md)
remain the supporting contract. No promise readiness upgrade is intended.

## Fresh source and finite ownership

Clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` was read again:
`api_app.py:lifespan` → `api/dependencies.py:shutdown` → `services/invoker.py:stop`
→ `session_processor/session_processor_default.py:stop`, plus model installer/
download stop callers. The session processor stops admission/cancels/joins before
dependent services and database disposal; stopped Invoker requires a new instance.
Clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` updater.ts and its
main-process-manager.ts callers separate consent/download/restart, but have no
Studio Project close/recovery mechanism. This absence was disclosed before
implementation. Reuse Studio's existing adapted shutdown, workspace path lock,
signed native artifact, same-owner staging and pinned Electron relaunch adapter;
do not add another close machine, queue, installer or subprocess helper.

Entry: existing Updates dialog → exact-version preload/IPC → current-document
review → read-only artifact preflight → existing window.close → renderer
draft/preset flush → catalog admission drain → Project/generation/resource guards
and Save/Discard/Cancel → actual worker/model/queue drain → tab close → sealed
finalize → exact captured artifact activation/handoff → normal physical exit.
The preview remains advisory: close reinspects live state and renderer drafts.

## Invariants and source-discovered hazards

- Only explicit Install after a current eligible Review can request close. Check,
  Download, Review, Refresh and Install later do not install or close. No stage
  writes precede ordinary close consent. Cancel or failed Save retires the intent;
  a later ordinary close cannot inherit it.
- Preflight needs the captured supported scheduler/path presence and exact signed
  downloaded capability. Current filesystem/header/identity admission remains in the
  existing stage owner after consent, so availability is not a promise that
  filesystem permissions or free space will remain suitable. Revalidate document and close admission after awaits,
  immediately before close. Post-await reply rejection cannot undo a stale close.
- Preserve exact artifact identity through the close sequence; the same version
  downloaded again is a different authority. Competing update actions and
  duplicate Install cannot revoke an accepted preflight accidentally.
- Existing catalog operations can attach tabs after awaiting I/O. Reuse the
  existing dataRoot path lock to drain admitted work and reject queued/new
  catalog work after close begins. Keep required draft flush/history sealing.
- Main's former post-finalize catch could send tabsChanged/windowCloseReleased
  after SQLite disposal. Seal the same close owner before irreversible finalize;
  no error may release editing there. Skip installation if finalize fails, retain
  ordinary recovery, disclose fixed failure and normally exit. Worker/model/queue
  preparation has already completed at this boundary.
- Keep native close prevented during post-close hashing/handoff. Only allow the
  final normal close after settlement, so Alt+F4 cannot exit before handoff.
  Never retry/rollback on uncertain native result. Close-requested is not startup
  or engine readiness acknowledgement; no paths/native errors enter renderer DTOs.
- The Updates modal yields its focus trap to ordinary close guards. Pending
  preflight cannot be silently dismissed and later close an unrelated UI state.

The finite public preview adds boolean installationAvailable. This describes
the captured platform mechanism, not crash recovery or release acceptance. The
request result is exactly version + close-requested; no capability crosses IPC.
Default publisher remains unavailable. There are no new feed/key credentials.

## Required checks and remaining gates

Meaningful shared/IPC/signed-native service tests cover authority/refusals,
stale-document side effects, pending actions, exact-artifact identity and no
pre-close staging. Actual App/modal browser cases cover eligible/unavailable,
explicit one-shot action, preflight errors, close/cancel lifetime and focus/footer
at1280×800/900×620. Mocks do not qualify native persistence/close/restart.
Full typecheck, app build, scoped lint and prototype tests with `--workers=2`.
Qualify production Main/preload/renderer through real Project close and retain
semantic GREEN/RED/GREEN at the true consumer. Distinguish source review, authored
tests, Root executions and independent retained-byte audit.

The previous private A/FUSE→B/extract-and-run fixture is historical evidence,
not a new public runtime run. A successful handoff leaves a retained exclusive
claim; startup finalization/adoption, interrupted-update recovery/reinstall and
subsequent updates still need a separate verified consumer. Unsigned journals
cannot authorize recovery. Shipping feed/trust, Studio copied-state migrations,
protocol/runtime readiness and final acceptance remain release gates.

Evidence owner: `runs/application-update-install/20261116`. Initial root41GiB,
free44GiB,VRAM14550MiB; no ML work/copies. Serial4GiB/zeroSwap/600s checks;
native launcher/Main/watchdogs aggregate<=4GiB. Retain exact outcomes and
failure controls before idle payload cleanup.

## Executed checks and explicit limits

Root ran **353 Main/shared/close/path-lock cases:352PASS,one platformSKIP,0FAIL**.
The nine actual-Main-source cases use controlled participants plus the real
GenerationAppShutdown/path lock; they are not Electron or persistence tests.
Final full `pnpm run typecheck`, `pnpm run app:build` and scoped ESLint pass.
No Python/ML owner changed, so their unchanged matrices were not repeated.

The full browser run completed **341=337PASS+4FAIL**. All four failures exposed
the loading icon changing Install's accessible name. Explicit aria-label fixes it;
Review also has a unique sibling key. A first affected rerun had41PASS+one
observer geometry failure during Naive's entering transform; the test now waits
for the actual settled transform instead of measuring its animation. The final
two affected suites have **42PASS/0FAIL**. No all341 final PASS is claimed. Root
opened the final1280×800/900×620 preview and signed-available screenshots and all
four final native screenshots; no material local layout/label issue was found.
This is bounded UI self-review, not full accessibility or compositor acceptance.

The isolated Main mutation emits windowCloseReleased after irreversible finalize.
It reaches the actual extracted Main close consumer and fails the precise
event-count assertion, with an adjacent canceled-Install ordinary-close GREEN.
Original→mutant→original is **0→1→0**. Workspace source is never mutated and the
restored Main source is exact; module paths differ between isolated runs. This
is not a native-process mutation or a setup/timeout/OOM RED.

## Native production-consumer qualification

Root's **native-public-r4 PASS,28.239s** uses actual production dist Main/preload/
renderer and dependencies inside two real AppImages. The qualification bootstrap
adds CDP/x11, original-call observers, controlled native decision/error ports and
a posthandoff-only final-close timing hold. Production dist bytes are unchanged;
both embedded versions/42 packaged dist entries/native SQLite and the unchanged
source Electron/SQLite binaries are checked by the producer. The ephemeral signing
key exists only in producer memory; public trust/declaration and full bodies remain.

Real UI Check→native HTTP Download/verification→Review→Install triggers the actual
Main close. Choices are **Cancel,ordinary-native-Close Cancel,new Install Save**
(`[2,2,0]`), not three fabricated close outcomes. Before both cancellations,
target/cache/Project bytes stay intact, Project remains dirty, no update stage or
DB disposal/handoff occurs, and editing is released. The third explicit Install
saves through the actual Project writer and disposes actual better-sqlite3 before
same-owner staging/backup/activation/original native app.relaunch.

A0.1.0 Main157720 runs on real FUSE/NoNewPrivs0. Original relaunch returns literal
true once; B0.2.0 Main158140 starts in the runtime's actual extracted AppDir with
NoNewPrivs1 after old Main exits. It obtains the same userData/lock, reopens the
actual saved `.igs` via production UI/API and reads the exact saved positive
prompt with dirty=false. Both app/process exits are0. Target is exact signed B,
backup exact A in an independent inode, cache unchanged, terminal journal is
relaunching intent. Actual SQL integrity/index and all30 applied migration
name/hashes match. This uses the same migration inventory on both bodies; it is
not a changed-migration upgrade/rollback qualification or image-engine acceptance.

Launcher and each Main group are bounded at1GiB; three128MiB watchdogs give the
maximum recorded aggregate3.375GiB, zero swap,600s outer deadline. Both actual
Main scopes, helper/runtime descendants, deadline timers, old FUSE mount and
automatic extraction directory removal are independently confirmed after normal
exit. The final native event stream has no windowCloseReleased after DB disposal.
Startup made no feed request; the one metadata request follows explicit Check.
Native decisions are controlled ports; OS dialog-button clicking is not claimed.
Final close timing is instrumented only after actual DB close and native handshake.

### Failed attempts and harness corrections

- R1 failed before UI/update work: Main correctly sets userData=dataRoot, while the
  harness expected its earlier bootstrap profile. It was not resource-admitted.
  Original FAIL/pin remains; Root's separate current-kernel/no-handoff/no-stage
  exit proof resolves that own pin. App/process exit0 is recorded; wrapper exit
  code was not captured and is not inferred.
- R2 passed the first actual Install Cancel, then the harness used renderer
  window.close for its ordinary-close control. The trace shows DB close/exit
  without a second normal guard, consistent with the quit fallback rather than
  the intended native-close entry. The control timed out. This is a failed native attempt,
  not semantic RED or ordinary-close acceptance. Captured scopes/wrapper exit0
  are confirmed. The corrected control uses native window-manager close.
- R3 could not find its own X11 window under the implicit backend. Normal abort
  closed its own app; an ENOENT proc/exe observation race conservatively kept its
  pin. Separate Root confirmation through the existing resource helper proves
  the exact tree exited and stops only its captured deadline timer. Original
  FAIL and pin history remain.
- R4 explicitly selects X11 for both lifetimes (including inherited environment
  for B) and sends EWMH `_NET_CLOSE_WINDOW` to an exact PID/start-checked native
  XID. The test-only adapter follows upstream
  [xdo_quit_window](https://github.com/jordansissel/xdotool/blob/master/xdo.c).
  Installed xdotool has no windowquit command; its windowclose uses XDestroyWindow
  and is never invoked. No global keyboard input, force-close/kill or foreign
  window is used. This qualifies the explicit X11 surface, not native Wayland.

Before execution, independent harness source review found missing discovery of a
Main moved into KDE before ready/CDP admission. Root added live PID/start/exe/
ASAR/group verification/rebinding, late-entry rereads and conservative unresolved
pins; the finite recheck is CLEAN. Profile/backend/WM control corrections above
are Root harness self-review. Independent production source review and narrow
ARIA/key/current-contract recheck are CLEAN; no reviewer ran the app. Retained
byte verification is a separate result recorded below and in final-audit.json.

Next finite owner is verified startup/retained-stage authority and recovery,
including subsequent-update claim finalization. Existing unsigned journal data
alone cannot authorize adoption, cleanup or rollback. Public source wiring and
the executed fixture do not promote shipping or MVP promise readiness.

## Retention and delivery

Root verified and retained **5708 entries,0 omissions** before removing only
this run's confirmed-idle `payloads` and `t-aui-1116`. Actual raw allocation
released: **1984802816 bytes**. The646460255-byte archive (under1GiB compact
target) has SHA256 `bbab625744295bcb7df30847d12b12b9691390ac9eaef4a1505e164be5620b49`.
Archive-internal dedup preserves256 logical copies with exact modes; no external
link is followed. Reconstruction of current/cache/backup requires fresh independent
files, never filesystem hardlink extraction or old inode/PID authority.

Lifecycle is retained with empty payloads/dependencies/pins. R1/R3 original pin
records and separate resolution proofs remain alongside all four native attempts,
browser failures/controls, source/build/package descriptors, public signing
material and actual Project/SQLite bytes. No shared runtime/model, ordinary app
data, external host integration or global package cache was cleaned. Source
Electron/SQLite remain unchanged. Independent final source/retained-byte audit,
separate from Root executions and retention verification, is in final-audit.json;
delivery and exact committed-byte/remote proof are recorded in commit-proof.json.
