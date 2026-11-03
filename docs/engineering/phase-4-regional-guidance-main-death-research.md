# Inference child ownership after Main death

## Boundary and source

High-risk process/filesystem ownership change on `master@688a3b4b3cc06d34015ea3bc783780ecdf0e1856`.
The preceding [installed recovery checkpoint](./phase-4-regional-guidance-installed-recovery-research.md)
killed the complete owned Electron scope. It did not prove that killing Main alone
would stop its native Python child or recover disposable transport directories.
This checkpoint targets that distinction, with the same installed runtime,
original checkpoint, frozen Retry and Results owners.

Consulted current clean InvokeAI
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/app/services/session_processor/session_processor_default.py` and its
  invoker callers: inference runs on daemon threads inside the server process.
- `invokeai/app/util/process_tree.py` and `video_thumbnails.py`/`video_audio.py`
  callers: stop known live child trees; do not rediscover descendants after the
  original parent exited and its PID could be reused.
- `invokeai/app/services/model_install/install_staging_ledger.py` and
  `model_install_default.py`: Linux boot/start identities, conservative ownership
  claims, inode revalidation and serialized startup recovery.
- `invokeai/app/services/working_memory_calibration/working_memory_calibration_store.py`:
  stable OS flock files, released by process death rather than unlinking locks.
- `invokeai/app/util/no_replace.py`: Linux atomic no-replace rename.
- `invokeai/app/services/fonts/fonts_default.py`: bounded owned-subprocess
  shutdown, used only by developer-tool historical rollback qualification.

Invoke has no equivalent separate inference-child parent-death guard. This
absence and the necessary Linux adaptation were disclosed before implementation.
Studio uses [Linux PR_SET_PDEATHSIG](https://man7.org/linux/man-pages/man2/PR_SET_PDEATHSIG.2const.html)
with SIGKILL, checked parent identity before and after registration and signal
readback. The creating parent thread owns this relationship; fork descendants
and credential changes are outside it. There is no copied inference loop,
general orphan PID scanner or stored-PID kill operation.

## Operational owner

Linux Main starts `imagegen_worker.owned_inference` with its actual PID and
canonical private scratch path. Before inference/native imports, the wrapper
establishes the kernel guard, acquires a child-held exclusive flock and performs
bounded recognized-lease recovery. Only this entry advertises
`linux-owned-inference-v1`; Main requires it and verifies the actual child
boot/PID/start identity. Historical bare `inference_main` remains an unguarded
entry, and is never a Linux Main fallback. Non-Linux startup remains unchanged.
Engine 0.14.0 and dependency locks remain unchanged: this is a versioned
operational capability, not a claim inferred from the engine version.

Main writes and syncs `.owner-v1.json` before regional transport payloads. Its
strict schema binds boot identity, Main/worker PID/start ticks and directory
device/inode; no caller-selected cleanup path is stored. Normal request disposal
retains its existing owner. Startup cleanup requires both recorded owners dead,
the exclusive scratch lock, private owned directory, matching inode and a flat
allowlisted bounded payload. It atomically claims a no-replace quarantine,
revalidates files and removes the marker last, so partial deletion can resume.
Unmarked historical directories are retained. Malformed, live or unverifiable
marked ownership refuses startup and preserves the data.

Only the publisher's exact internal two-name hardlink window is admitted. An
external link, linked marker/input, unexpected file, symlink or nested directory
refuses cleanup. Targets, Queue/staging assets, packages and original weights
are not cleanup candidates.

| Parameter | Bound and basis |
| --- | --- |
| Owner marker | 4,096 bytes, strict versioned keys |
| One recognized lease | At most 32 flat files / 192 MiB payload arithmetic |
| Recovery diagnostics | At most ten retained messages |
| Linux lock | Stable mode0600 file under canonical UID-owned mode0700 scratch; nonblocking exclusive flock |
| Qualification | Existing 12 GiB aggregate host / zero swap / finite owned units; actual peaks recorded separately |
| Installed update | Explicit developer-only same-engine payload refresh; worker backup at most 32 MiB, unchanged environment/dependencies/pointer |

These are admission bounds, not capacity or allocator-reclamation guarantees.
Install/Repair delivery is a separate owner.

## Reproduction and caller correction

ROOT reproduced the old boundary with the frozen production Main backend client
from `688a3b4` and the real installed old0.14 worker: one original regional wire,
Main-only SIGKILL, Python still alive after two seconds with 240 MiB recorded GPU
usage. The test supervisor then killed/reaped that orphan; this fallback is
explicitly excluded from protection evidence. This baseline is a Node backend
parent, not an Electron/Queue admission qualification.

The new CPU-only lifetime suite passes 33 cases, including an adopted orphan's
actual SIGKILL exit, registration race, import ordering, idle lock ownership,
malformed/live/dead markers, publisher links and partial quarantine resume.
The initial eight-file independent source review is CLEAN within its stated
scope. A same-engine worker-only refresh then qualified the actual installed
owned entry/capability and physical exit in 6.395 seconds, without changing its
dependencies, environment location, interpreter or active pointer.

Installed `native-r1` stopped before any regional wire or Queue admission:
RuntimeManager status qualification still passed `cache/runtime-downloads` as
scratch. That directory was not private, so the new guard correctly refused both
startup attempts with exit78. Electron exited normally; all eleven observed
identities were confirmed gone, with no fallback signal. Its three authored
setup packages and controls remain historical excluded inputs.

The two advisory/status qualification callers now use the same application
scratch as real inference. AppPaths remains the production private-directory
owner; RuntimeManager does not chmod or silently substitute another directory.
Three regressions check the actual child argv/private root, refusal before spawn
when that root is missing, and revocation of previously cached advisory readiness
when scratch disappears while downloads remains intact.

The final lower matrix is **407 PASS = 84 Python + 241 Main/client/runtime +
82 resource/updater selections**, zero failures/errors/skips. Required typecheck,
production build, strict scoped Python typing and scoped lint/format checks pass.
Guard removal yields one semantic RED with normal-close GREEN; owner-liveness
bypass yields two semantic RED with dead-owner cleanup GREEN. Reverting only the
advisory caller to downloads yields a fourth semantic RED while healthy status
qualification stays GREEN. Exact restoration returns GREEN: **21 accepted mutation
executions, 17 GREEN and four intentional RED**. Node name-pattern deselections
are excluded from these execution totals. The first mutation-driver log-parser
failure, advisory fixture package-manager preflight refusal, and earlier
fixture/typing diagnostics are excluded rather than counted as passes.

## Installed Main-only result

ROOT `native-r3` completes **13 checks PASS in three actual built Electron
lifetimes**, 183.912 seconds externally / 182.872 seconds internally. It consumes
two original regional wires, one interrupted attempt and one healthy frozen
30-step/seed123 completion at 1024². It observes **23 workers (8/8/7) and 50
PID/start identities (17/17/16)**; all three lifetimes physically exit.

1. The first original request is running with no receipt/cursor. A pidfd sends
   SIGKILL only to Main. Python and all observed processes disappear without a
   test signal to a child or scope. The original worker's GPU record changes
   from 240 MiB to absent; global free VRAM is not an acceptance claim.
2. Startup cancels the interrupted Queue attempt as APP_RESTART. Before the next
   actual guarded worker Ready, observers confirm the old transport pathname
   and directory inode are gone, including any recovery quarantine. Unmarked and
   unrelated controls retain their bytes/inodes. After current authoring is
   saved as two steps/seed124/disabled regions, explicit Queue Retry consumes the
   original frozen30/123 input and produces a completed unaccepted candidate.
   A second Main-only fault follows confirmed execution-child exit.
3. Real Home Recover restores the same PNG, receipt, cursor and saved authoring;
   no automatic resume, acceptance or Save occurs. Signed Results, browser
   pixels, Canvas delivery, Raster Add/Undo/Redo and explicit Save/reopen pass.
   The last Electron exits normally with code0. **Fallback child/scope signals:0**.

The PNG is 1,379,326 bytes, SHA256
`942f59c35b92c3bab04328d92d3714cca48a24106b0c4a8e818559af17e913a1`;
whole RGBA SHA256
`7bc3695217b9f44285c97d7b19a9d2c3478b0441da019b30897c51f5ce126829`.
These match the earlier healthy control; process ownership changed no sampling
algorithm. Seven screenshots support interaction evidence, not visual quality.

`native-r2` already passed both Main-only cuts and healthy Retry, but is excluded
as a complete matrix: its third-lifetime observer incorrectly required the
already-verified reclaimed lease to exist again. The corrected harness consumes
that prerequisite only after the actual Ready/path/inode proof and retains its
report. No production cleanup check was relaxed. The successful repeat starts
from all **15 packages / six terminal jobs / three receipts / three cursors**,
including both earlier accepted jobs and R2's unaccepted candidate. It preserves
that baseline and ends with 18 packages and eight/four/four operational rows.
ROOT separately verifies R2's PNG, session/context/autosave/input bytes, receipt
and cursor rows in **11 postchecks** against the pre-R3 archive; SQLite integrity
is ok and foreign-key violations are zero. This preservation is separate from
the harness's baseline SQL/package assertions.

Native scope readback is 10 GiB, launcher at most2 GiB, swap0, with the original
absolute deadline and independently owned scope timers. Recorded native cgroup
peaks are 1,064,763,392 / 1,838,370,816 / 649,469,952 bytes; launcher peak is
1,271,607,296 bytes. These observations are not capacity guarantees or a CUDA
allocator ceiling. The cut follows the original wire, without a numerical-step
or in-kernel timing claim.

Compact evidence and baseline payloads are under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-main-death/20261104-owned/`.
The shared runtime, original checkpoint and previous recovery evidence are
protected dependencies. Failures and excluded diagnostic attempts remain
separate from accepted runs.

## Retention and review

The 1,444-member baseline and complete 1,450-file qualification archive retain
all 23 code/test/research deltas. Independent source reviews cover the ownership
core, updater and its corrected historical0.12 neighbor, Main-only harness,
RuntimeManager callers and the two corrected test oracles. Runtime outcomes
remain ROOT execution evidence.

Before disposal, a no-follow archive retains eight exact disposable candidates,
1,973 entries and 39,956,480 allocated bytes, including old unmarked baseline
transport, source-only mutation fixtures and the three attempts' retention
controls. No environment or model is copied. The complete live agent app state
remains protected for subsequent work; its final compact archive has 92 entries.
Independent retained-byte/dependency audit is CLEAN and READFINISHED within its
scope. ROOT then refreshes 101 observed birth identities across all three
attempts, seven empty/absent owned scopes, runtime idleness, exact installed
source and global incoming dependencies. After all ten pre-release authors and
readers end, ROOT removes only the eight archived candidates and measures
**39,956,480 allocated bytes reclaimed** during the deletion-only interval.
Live app data, all18 packages, candidate/context bytes, original model, runtime,
stable lock and compact archives remain protected. Run and runtime lifecycle
states are retained, with no remaining run payloads. Audits grant no deletion
authority. Production's preservation of unmarked legacy data is distinct from
ROOT's cleanup of known test controls; the later final review reads retained
evidence without reopening disposed paths.

## Preserved limits

This owner does not authenticate arbitrary Python code or protect forked native
descendants. It does not recover unmarked historical scratch by prefix or age.
It does not add Queue schema, auto-resume, automatic Retry, Raster acceptance or
Save behavior. CPU image workers remain a separate process owner. Anima regional
execution, image quality, numerical progress, capacity, release delivery and full
Invoke parity remain unqualified. PP-001/007/008 remain **«Пока не обещать»**.
