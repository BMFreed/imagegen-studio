# Internal verified offline runtime installation

Base: clean master `9d61384bf90f5a7bc1259b190752b8b23d739a09`.
High risk: executable artifact trust, subprocess ownership, runtime filesystem,
atomic activation and crash recovery. Supporting contracts:
[Python runtime management](../specs/07-python-runtime-management.md),
[packaging delivery choice](./phase-2a-runtime-packaging-spike.md), PP-001/004/007/008.
Public promise statuses remain **«Пока не обещать»**.

This checkpoint implements the internal Main consumer of an already obtained,
trusted offline payload. It does not connect public Set up/Install/Repair. The
default `RuntimeManager` still returns `RUNTIME_INSTALL_UNAVAILABLE`: this build
does not ship a release selection, trusted release keyring, qualified host
inspector or complete engine download preview. The new Python-slot review is
explicitly scoped `python-runtime-slot`; it is not the total engine preview,
which must include the separately owned mandatory LaMa resource.

## Fresh upstream source and adaptation

InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` was reread with callers:

- `invokeai/app/services/model_install/install_staging_ledger.py`: complete
  temporary marker, file sync, atomic replacement and directory sync; live
  PID/start/boot identity, exclusive claims and serialized stale-claim sweep.
- `invokeai/app/services/model_install/model_install_default.py`:
  `_write_install_marker`, `_discard_cancelled_staging` and incomplete-install
  restoration. Cleanup requires stopped callbacks and respected ownership;
  recovery data is retained.
- `invokeai/app/services/download/download_default.py`: staged download,
  cancellation/resume and transfer completion. It does not provide the signed
  executable runtime inventory required here.

The explicitly permitted launcher reference
`c267bdb439519216b277a7a8c6ad408b9d79efce` was also reread:

- `download_uv.ts` and `package.json`: pinned uv artifact/checksum before use.
- `src/main/install-manager.ts`: bootstrap release files, managed Python,
  venv creation, sync and completion; callers `src/main/index.ts` and
  `src/renderer/features/InstallFlow/state.ts`.
- `src/shared/pins.ts`: release-tag lookup of pins/pyproject/lock, without a
  signed binding of the full executable payload.
- `src/lib/command-runner.ts` and `src/lib/pty-utils.ts`: cancellation can finish
  after a five-second timeout without proving physical exit.
- `src/main/gpu-detection.ts`: advisory hardware detection, not qualification of
  the selected driver's CUDA/ABI/GPU compatibility.

The user was informed before implementation: neither checkout supplies a
compatible signed runtime envelope/inventory or versioned activation/rollback
mechanism. Launcher Repair deletes the existing `.venv`; its `--inexact` sync
preserves undeclared packages. Those behaviors violate Studio's accepted
runtime contract. Adapt Invoke's durable staging/ownership primitives and the
existing Studio runtime/client owners, adding the disclosed contract-specific
signature, exact offline assembly and pointer transaction. No parallel worker,
inference engine, queue, sampler or project recovery implementation is added.

Both references are Apache-2.0; Invoke's NOTICE reads
`Copyright 2022-2026 InvokeAI Contributors`. This is a mechanism adaptation, not
a verbatim copied source file. Keep source provenance and applicable notices
when packaging redistributed components; this note does not qualify a complete
release license inventory.

## Owners and material consumer

`RuntimeManager.previewInstallation(mode)` receives release paths, envelope and
trusted public keys only from its internal Main backend. Renderer IPC accepts
none of them. `runtime-release.ts` verifies the Ed25519 signature before parsing
the signed payload or traversing its directory. Canonical sorted-key JSON binds
the exact manifest bytes; malformed/noncanonical metadata, unknown keys,
duplicate/lossy values and unsupported identities refuse. The complete signed
filesystem inventory then verifies regular-file sizes/hashes and safe internal
relative Python links, with no undeclared files or empty directories. A detached
frozen snapshot also records inode/metadata identity, so equal-byte replacement
requires a fresh review.

The path-free review captures the pointer SHA-256, mode and one-use token.
`install(token)` or `repair(token)` consumes that exact review and serializes
through the existing runtime admission owner. The signed payload is checked
again; mandatory `ensureHostCompatible` and `ensureAuxiliaryReady` collaborators
must succeed before assembly. These are integration prerequisites, not optional
fallbacks to advisory GPU detection or automatic auxiliary downloads.

`assembleOfflineRuntime` creates a unique Python slot and environment slot at
their final absolute paths. Both receive incomplete markers before any binary
executes. Only verified inventory is copied, including the exact 17-file SDXL
configuration under `resources/sdxl-config`. Absolute verified uv and CPython
run with a restricted offline environment; inherited UV/PIP/Python settings do
not select packages or interpreters. Venv creation preserves only this freshly
claimed slot's bootstrap state, without renaming a completed venv. Installation
uses local hashed requirements with `uv --no-config --offline pip sync`,
`--no-index --no-build --require-hashes --link-mode copy`, followed by `pip check`.
There is no network resolution, editable package or source-build fallback.

Assembly verifies exact installed distribution/version membership, interpreter
version and prefix/base-prefix, absence of editable/direct-url installations,
and installed worker files against the signed worker wheel. It rechecks source
and copied immutable inputs and writes installation provenance. Assembly never
publishes an active pointer or modifies an existing slot.

`RuntimeInstallationController` owns the durable attempt journal and
PID/start/boot claim. CPU and inference qualification both run before activation
and again after pointer publication. The CPU worker must pass self-test and the
exact required derivative/import/preview/target/export capabilities. The
inference worker must pass the existing qualified Linux/NVIDIA handshake and
exact worker version. Each phase returns only after its clients confirm exit;
CPU startup masks CUDA, whereas inference receives the selected device.

The three version identities remain distinct: installed `imagegen-worker`
distribution `0.1.0`, CPU worker `0.1.0`, inference worker `0.14.0`, protocol `1`.
A derivative-only worker cannot satisfy the Linux/NVIDIA inference gate.

After prequalification, only the new slot's exact markers are removed. The
controller syncs a temporary pointer and checks the captured predecessor again
at publication. Post-activation failure restores the exact previous raw pointer
bytes, including a malformed predecessor being repaired. First installation
removes only its own newly published pointer on failure. An external concurrent
pointer change is preserved and requires recovery; rollback cannot overwrite it.
Old slots and failed new slots are retained; this implementation collects none.

## Failure, recovery and adjacent work

| Trigger | Observable result and retained state |
| --- | --- |
| Invalid signature, config, inventory or changed payload | Domain error before executable use; no activated slot |
| Unsupported/missing host or auxiliary prerequisite | Refusal before slot assembly; no opportunistic download |
| Wrong/stale/reused token or changed reviewed pointer | Fresh review required; no silent retargeting |
| Low disk, uv failure, wrong Python/package set or worker bytes | New incomplete paths retained; predecessor unchanged |
| CPU self-test/capability or inference startup failure before publication | No new active pointer; incomplete slots and journal retained |
| Post-activation failure or cancellation | Exact predecessor restored when the current pointer is still this attempt's candidate |
| Unconfirmed command/worker exit | Claim and data retained; no timeout-as-exit or new competing runtime work |
| Corrupt journal/claim, replaced roots or interrupted recovery guard | Fail closed with recovery diagnostic; no age-based deletion |

RuntimeManager performs pending-install recovery before status probes, CPU
resolution and generation/preparation admission. Fresh resolution is blocked
during installation. Existing CPU locations remain safe because their old slots
are never removed. Generation/preparation leases exclude installation, shutdown
aborts its operation, and status does not start a competing probe. The existing
inference transport has a bounded120s startup without an AbortSignal API; Cancel
waits for that startup to settle and for physical close. Immediate interruption
of CUDA startup is not claimed. An established inference close failure retains
the client in the existing shutdown retry owner; offline command exit retries
also participate before shutdown can report confirmed exit.

Dead-owner recovery can repair `prepared`, `activating` and `activated` phases
whose workers had already exited. It cannot infer orphan exit from a dead Main
PID while `preparing`, `qualifying`, `post-qualifying` or recovery-required work
may have owned a child. Such uncertainty blocks new work and preserves bytes;
it is not a claim that the old runtime can always remain usable immediately.
Legacy installations without this journal/claim retain their existing resolver
path. Models, Projects, presets, workspaces and auxiliary-resource storage are
outside slot assembly/rollback and are never removed by it.

## Finite parameter registry and completeness limits

| Parameter | Source / current bound | Meaning on excess |
| --- | --- | --- |
| Envelope / canonical signed manifest | verifier 1 MiB each | reject before payload traversal |
| Manifest depth / inventory | depth64 /100,000 entries | explicit metadata refusal; 1 MiB also bounds practical entry count |
| Signed regular file / total | 32 GiB /64 GiB | refuse oversized payload; not measured release capacity |
| Pointer / journal-claim metadata | 16 KiB /64 KiB | bounded no-follow reads, corrupt/oversized state refuses |
| Required free bytes | signed positive safe integer, at least inventory bytes | statfs refusal before new slots; signer must budget full peak plus retained predecessors |
| Command deadline | 300s per command | terminate owned group; never assume exit from elapsed time |
| Termination / confirmation | SIGTERM grace5s, then SIGKILL; confirmation10s | retain/fence if actual leader close and group absence are unconfirmed |
| Log / captured stdout | 8 MiB /2 MiB | terminate bounded command and refuse |
| Worker wheel payload | 16 MiB per file /64 MiB total | refuse over-budget installed-payload comparison |
| Root qualification checks | 4 GiB aggregate, zero swap,600s | bounded test execution, not runtime capacity qualification |

The schema and explicit phase union define the finite metadata/lifecycle domain;
tests cover changed bytes/identity, symlinks, package membership, cancellation,
pointer races, incomplete markers, both qualification phases, recovery and leases.
These ceilings are engineering refusal bounds, not empirical shipping limits.
`requiredFreeBytes` is a signed producer requirement, not a locally derived proof
of full engine peak; the future release/preview pipeline must supply and qualify
that budget, including caches, auxiliary publication and old slots.

Valid signature and complete filesystem inventory prove identity of the chosen
payload, not completeness of its ML dependency graph. `lockSha256` binds the
declared source lock identity; client validation does not reconstruct the lock's
full Linux/NVIDIA wheel selection. CI selection from `uv.lock`, trusted key
publication, all inference extras, host/driver/ABI qualification and real worker
self-tests remain required before public installation can be enabled.

## Results and evidence limits

ROOT `runtime-final-r3`:374 PASS across12 explicit runtime/worker/shutdown files,
zero failures/skips. The 17-file config fixture was supplied explicitly. These
checks use actual crypto, inventory, files, controller journal/pointer and
RuntimeManager entry points; assembly and qualification transports in the
manager success/rollback tests remain controlled ports. Small real subprocesses
cover default command exit/cancellation and active lease owners. No whole
unchanged Main/inference/browser matrix is counted as a new run.

`typecheck-r4`, `build-r2`, full four-part `lint-full-r1` and later scoped
qualifier/release lint (`lint-final-scoped-r2`) pass. The sole full-lint parser exclusion is unchanged
`scripts/qualify-installed-regional-init.mts`; base/live SHA equality is retained.
`package.json` includes the new runtime TS tests in the normal app test command.
No UI/prototype source changed, so no new browser/visual qualification is claimed.

ROOT `actual-offline-r3`:8 checks PASS in the real internal
`RuntimeManager.previewInstallation` → `install` consumer,21.184s bounded run.
The signed copied fixture includes4,542 entries: managed CPython3.12.13,
local uv0.11.11, built noneditable worker wheel, exact config and Pillow12.2.0.
Six actual assembly/inspection commands succeed offline; two real diagnostic
commands establish absent Torch and inference exit78 without a ready line.
Exact installed membership is only worker0.1.0 and Pillow12.2.0; installed worker
files match its wheel. The real CPU client passes self-test and export capability,
then closes by the existing managed SIGTERM, null exitCode, no SIGKILL escalation
and confirmed physical exit. This is not a healthy-code0 shutdown claim.
Real GenerationWorkerClient startup also refuses; its failed-start exit fence
clears. Both incomplete slots remain, no active pointer exists, the consumed
review token refuses, and status remains not-installed. Input/source freezes and
owned models/workspaces/presets sentinels are unchanged. All command, CPU and
startup exit fences clear; the enclosing cgroup has no remaining processes.

The fixture's host and auxiliary ports are explicitly controlled prerequisites,
its signing key is ephemeral/in-memory, and host metadata is unqualified. This
proves real offline assembly/CPU operation and mandatory refusal of an incomplete
inference environment. It does not prove a successful Linux/NVIDIA install,
known-good native rollback, driver/ABI/GPU compatibility, LaMa installation or
full ML wheel selection. Launcher pins uv0.11.28; local0.11.11 execution does not
qualify that other release binary. Public Setup remains unavailable.

Source review found two shutdown holes: failed established inference close lost
its client, and offline command exits were absent from shutdown retry. Root fixed
both through existing owners. The retained-client regression passes and its
semantic mutation catches premature successful shutdown. Default command
close/cancellation tests use real processes; a pathological unkillable process
was not manufactured. Independent source review then found no additional blocker;
it did not execute the runtime.

Actual attempt1 correctly refused uv build's extra `.gitignore` before commands;
the own idle marker was preserved outside the closed two-wheel directory.
Attempt2 exposed an incorrect case-folded inventory guard: CPython contains
case-distinct Linux terminfo names. Fresh Invoke Path/ledger callers were reread;
the Linux-only verifier now preserves exact names and still refuses exact duplicate
paths. A real-filesystem regression and actual attempt3 pass. Earlier attempts
remain retained and are not semantic RED or added to successful counts.

Three isolated semantic mutations reach copied actual consumers: disable Ed25519
verification, restore candidate instead of predecessor on rollback, and drop the
retained inference client. Final relevant selections:21 =18 GREEN +3 intended
semantic RED, with neighboring controls and exact restored GREEN. Signature was
refreshed after the Linux filename fix; the superseded first signature selection
and one preliminary pnpm setup refusal remain separately retained. The final
signature check also includes the Linux filename control. Copied import witnesses,
final target hashes, physical-exit and reader-release records are retained.

Source/qualifier/Linux-delta reviews, ROOT execution, mutation execution and
independent retained-byte audit are separate evidence. Full release signing and
key publication, CI wheel selection from uv.lock, host qualification, complete
engine preview/download and public Install/Repair wiring remain next consumers.
Distributable clean install/upgrade/rollback, Electron updates and final
compatibility/NoobAI/MVP acceptance remain open. Promise statuses are unchanged.

## Artifact lifecycle

Run: `~/.codex/artifacts/imagegen-studio/runs/runtime-offline-install/20261113`.
Initial recorded root29 GiB, disk61 GiB free; no GPU work planned. Root captured
its own exact config snapshot from the protected reusable environment without
mutating that environment. Small copied CPython/offline-wheel inputs have a
concrete assembly-test purpose; no model weights or full ML runtime are copied.
The run has no live SHARED dependency after snapshot verification.

Exact source/bundle snapshots and no-follow payload archives preserve all own
attempts, copied CPython/uv/wheels, markers, journals, command logs and mutation
controls. Compact receipts, inventory/hash mapping, independent audit, physical
exit, reader release and exact disposal are recorded in the RUN; lifecycle owns
the final dependency/payload state. Only the run-owned payload root and exact
`t-roi-1113` temporary root are disposal candidates. No protected SHARED, model,
active Project or foreign process may be removed or stopped.

Raw paths in reports are not a resume contract. After disposal, reconstruct
inputs from the retained archive without following its external node_modules
link, verify manifest hashes, restore the source snapshot and use a fresh owned
bounded run. The signed-payload Python/uv, retained config and two original wheels
supply reproduction inputs; no original global Python path or private signing
key is required. Invoke/launcher source revisions remain pinned. Do not relocate
an installed venv and treat it as qualified; reassemble it at a fresh final path.
The qualification script requires explicit absolute `--python-root`, `--uv`,
`--config`, `--wheels` and new `--report-file` arguments and performs no cleanup.
