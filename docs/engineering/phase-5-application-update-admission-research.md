# Cross-dataRoot admission for application installation

## Scope and fresh basis

High risk, PP-002. Base is clean `33906e71f96351e21b9f0a40d44931ffe7059a9d`.
The current preflight is read-only; the existing exclusive stage claim is created
only after irreversible close. Two Main processes using different dataRoots but
one AppImage can both pass preflight and close Projects before one encounters the
other stage. Serialize participating **update operations before close**, using
the existing explicit Install intent. This does not establish global ownership of
all executing runtimes or grant recovery/retirement authority.

Fresh clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/services/working_memory_calibration/working_memory_calibration_store.py`,
  `_os_lock`, `creation_lock`, `_creation_file`: nonblocking POSIX flock on stable
  files, released by closing the owner's handle. Never unlink the file: old and
  newly created inodes could otherwise be locked independently. Actual callers
  `working_memory_calibration_default.py:_creation_lock/_attempt_lock/_file_lock`
  and store `change` hold the same operation gate through its material consumer.
- `invokeai/app/services/model_install/install_staging_ledger.py:_claim_scan_lock`, called
  by `sweep_stale_claims` and `model_install_default.py:start`; source claim before
  transfer in `install_path`/`before_transfer`. Unknown or legacy process claims
  are preserved, not treated as absence of other owners.

Fresh clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`:
`index.ts:requestSingleInstanceLock`, `updater.ts` and `main-process-manager.ts`.
Neither supplies a per-AppImage OS-lock adapter for Node. The missing adapter was
disclosed before implementation. Existing Studio held-FD/anchored-path guards and
Main's close intent remain the owners; no new queue, installer or recovery journal.

Pinned Electron44.4.5 has one process-singleton namespace, already used for the
dataRoot; requesting it again does not create a second global lock. Builder's
development-only `proper-lockfile` uses mtime-based stale deletion and is not a
kernel-lifetime lock. External Python would make app updates depend on an ML
runtime. None is an appropriate substitute for Invoke's OS-lock mechanism.

## Adapter and consumer

Adapt Invoke's stable-file flock using the fixed system `/usr/bin/flock`, with a
held descriptor passed as child fd3. There is no shell, command payload, PATH
search, persistent helper or custom native addon. Primary util-linux2.41.3 sources:
[flock.c](https://raw.githubusercontent.com/util-linux/util-linux/v2.41.3/sys-utils/flock.c),
[flock manual](https://raw.githubusercontent.com/util-linux/util-linux/v2.41.3/sys-utils/flock.1.adoc).
Its descriptor-only form calls flock on the inherited open file description; the
parent's descriptor keeps that lock after the short utility exits. Use exclusive,
nonblocking mode: no automatic delayed installation. Missing/unsafe tool, unsafe
filesystem or unsupported locking refuses Install without closing Projects.

The fixed sibling name uses the existing stage's basename hash plus `.lock`.
It contains zero bytes, is user-owned0600, regular/single-link, and lives in the
same canonical non-group/world-writable parent as the mutable AppImage. Create
only if absent; never truncate, replace, unlink, or chmod an existing lock. The
file persists after Cancel/crash as infrastructure, not durable install intent.
Held file/parent and visible/anchored identities are checked before and after
acquisition and at each assertion. Failed or released capabilities cannot rebase.
The fixed root-owned executable is checked independently; no renderer path enters.

Explicit Install first completes existing read-only artifact/source preflight,
then acquires admission and repeats retained-stage/artifact preflight under that
gate before publishing its close intent. A competing operation
gets a typed refusal before native close or Save. Final current-document/source
and admission assertions precede `window.close` with no await. The exact capability
belongs to that close attempt. Cancel, failed Save or stale preseal intent releases
only owned descriptors; candidate bytes and the stable lock inode remain intact.
Before irreversible finalization Main retains the capability, and its existing
finalized-close callback asserts it before staging/activation/relaunch consumers.

**Do not release sealed admission on Electron's process `exit` event**, app `quit`,
window close or native handshake. Pinned [Electron browser init](https://raw.githubusercontent.com/electron/electron/v44.4.5/lib/browser/init.ts) synthesizes process
`exit` from app `quit`, before physical Main death. Keep the raw owned descriptor
strongly retained after seal; only actual kernel process teardown releases it.
Unrelated child processes must not inherit it. No lease is transferred to B; the
existing retained-stage veto still prevents another installation there.

Fixed IPC/preload diagnostics expose busy versus unavailable without native paths.
The downloaded candidate remains healthy. Check/Download/Review/status and normal
startup never acquire admission. An ordinary close following canceled Install
never inherits that intent. Legacy/unleased runtime processes remain unknown;
successful admission is only serialization of participating updater writers.

## Bounds, failures and evidence plan

Finite inventory: one stable file per canonical target basename/parent, two owned
FDs per active admission, one fixed descriptor-only helper command. The utility has a configured two-second defensive timeout; synchronous completion
still depends on host process teardown. This is not a strict bound under an
unresponsive host/kernel. Normal contention is nonblocking; no retry policy is added. Zero
file payload and no file scan, PID registry, stale cleanup or new persisted schema.
Unsupported/network filesystem locking remains an unavailable outcome; it is not
silently replaced with timestamp locks. No lifetime-shared→exclusive conversion.

Real multi-process tests must show contention after the helper exits, independent
targets, explicit release/reacquisition on the same inode, automatic release after
physical holder exit, CLOEXEC and hostile file/parent replacement refusal. Main
consumer tests must cover busy before close, Cancel/Save error/document drift,
sealed success/failure and synthetic exit without premature release. IPC tests
must normalize typed diagnostics and reject code impersonation.

A semantic mutation must skip actual kernel acquisition in an isolated compiled
owner, producing a contention RED with a neighboring independent-target GREEN and
exact restoration. A packaged production flow must demonstrate public refusal
while another real process holds admission, normal Cancel releasing it, then the
existing Save→A/FUSE→B/extract/reopen/normal-exit path. Prototype mocks do not prove
kernel ownership. Source review, execution and retained-byte audit stay separate.

No global runtime exclusivity, unregistered-process absence, healthy startup,
backup trust, rollback, claim adoption, retirement or shipping readiness is added.
All eight public promise statuses remain unchanged. Publisher URL/key remain
unconfigured; no user secret is required for this implementation.

## Results

Root execution on frozen production code:

- **616 Main/publisher cases: 615 PASS, one existing platform SKIP**. This includes
  the 15 real multi-process admission cases and 32 publisher cases; earlier individual
  runs are not added again. Full typecheck, app build and scoped ESLint pass. No
  Vue/UI edits; the unchanged mock/browser matrix was not repeated.
- Actual kernel-adapter mutation: **2 GREEN → one semantic RED plus one GREEN →
  restored 2 GREEN**. An isolated compiled owner skipped only the real flock call;
  independent descriptors for the same target then both succeeded. The unrelated
  sibling-change neighbor stayed green. Original source was untouched and the
  restored bundle bytes equal the original bundle.
- Accepted packaged R2 passes real public BUSY before native close/Save/stage,
  healthy downloaded candidate preservation, dirty Cancel and same-inode
  reacquisition, then Save→A/FUSE→B/extract/offline startup/saved Project reopen.
  **Two normal app lifetimes and six normal Node helper lifetimes**, two explicit
  HTTP requests, one real `.igs` and SQLite store with 30 exact applied migrations.
  Producer verifies 42 production dist entries per package and unchanged original
  Node/Electron/SQLite/flock bytes. Host util-linux is 2.41.3.
- After DB close/stage/handoff, the harness explicitly emits synthetic JS exit and
  quit while A is held alive. Separate real kernel probes remain BUSY after those
  listeners and after both emits complete. The same zero-byte0600 inode can be
  acquired after **actual A physical death**. Synthetic events are labelled and
  are not physical-exit/native-quit acknowledgements. This demonstrates operation
  FD lifetime, not exclusive use by every runtime.

Two failures are preserved separately. Initial Main had 614 PASS/one oracle FAIL/
one platform SKIP: a host Error constructor did not accept the correct error
created in a VM context. The test now checks the exact fixed message; production
behavior was unchanged. Native R1 reached all controls and actual B close, then
its late oracle expected one synthetic exit. Explicit exit plus Electron's quit
forwarding correctly produces two. Only the driver count and fresh case selector
changed; R2 reused the identical packages/bootstrap/production source. R1 stays
FAIL, with separate known-identity physical settlement (including an already
collected timer diagnostic). Overall raw execution observed four actual native
lifetimes and 12 Node helper lifetimes; accepted R2 accounts for two/six.

Independent source review of the new adapter/IPC/preload and bounded Main deltas is
CLEAN; Main-author portions are identified as self-review. Reviews did not execute
product checks. Root fixed the pre-acquire current-frame guard before any lock-file
write, revalidated retained state under the held gate, and used neutral diagnostics
after already-confirmed Project Close. No failure claims that closed Projects
remain open. Missing-system-tool refusal remains source-reviewed, not a host-tool
removal experiment.

The nonshipping native ports are CDP/X11/dialog decisions and explicit startup/
posthandoff/synthetic-event timing observers. Launcher 1 GiB + A/B each 1 GiB + at most
three 128 MiB watchdogs gives admitted ceiling 3.375 GiB, zero swap and 600s phase limits.
Native promotion overhead before admission remains unqualified. Helper processes
share admitted launcher/Main scopes, not extra independent budgets. Unchanged
migrations/same production source in two versions do not establish changed-upgrade,
engine readiness or clean-machine release acceptance.

Evidence RUN is
`~/.codex/artifacts/imagegen-studio/runs/application-update-admission/20261116`:
`qualification-summary.json`, original/final Main logs, mutation triples,
`native-package-manifest-r1.json`, both native result reports, preserved driver and
`physical-exit-r1.json`/`physical-exit-recheck.json`. Protected shared ML resources
are not used or copied. Complete retention preserves **5,088 entries**, including
106 verified internal aliases of identical regular bytes/modes, with zero omissions.
Archive 625,791,110 bytes, SHA256
`76e8a55e7fd2ad3d7a1accb3a6385b752970204c4337452673acf7835eed44ba`.
Root verified every raw/archive full file hash, kind and mode before any deletion.
Reconstruct aliases as independent files, never filesystem hardlinks between
current/cache/backup. Final source/tar pins 13 source/document entries; qualification
pins 23 code/tool/original inputs plus the preserved R1 driver/source manifest.
General same-UID reference scanning had 165 inaccessible references: no global
absence claim. Known identities/scopes/helper lifetimes are settled separately.
Independent pre-disposal/final retained audits and actual raw disposition are
recorded in `final-audit-live.json`, `final-audit.json`, `retention.json` and lifecycle.
Pre-disposal audit is CLEAN. Only RUN/payloads and artifact-root/t-aua-1116 were
removed afterward, reclaiming **1,722,134,528 allocated bytes**. Lifecycle is
`retained`, `payloads: []`, no pins/dependencies. The complete archive and inventory
remain; do not resume disposed raw paths. The final retained audit checks those
bytes after deletion and does not reexecute the product.
