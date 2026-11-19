# Packaged runtime rollback after candidate activation

This qualification extends the private [Setup and Repair run](./phase-5-packaged-runtime-setup-repair-research.md)
with an actual worker startup refusal after the Repair pointer has been
published. It follows the [runtime Repair contract](../specs/07-python-runtime-management.md#repair-semantics)
and the [native engine rollback control](./phase-5-native-engine-qualification-research.md).

## Source basis

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`
and launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`.
`src/renderer/features/InstallFlow/state.ts` calls
`src/main/install-manager.ts` via the install IPC. Repair deletes the
existing `.venv` and synchronizes packages with `--inexact`.
`src/renderer/features/LaunchFlow/state.ts` calls
`src/main/invoke-manager.ts` to observe the service startup.
`invokeai/app/run_app.py` calls `invokeai/app/util/startup_utils.py`
for Torch, cuDNN and device diagnostics. The launcher has no equivalent
of Studio's prior-pointer transaction. The packaged control extends
Studio's existing direct CUDA refusal in `scripts/qualify-runtime-offline.mjs`.

The builder still uses the ordinary preload, renderer, migrations and
runtime owners. A private opt-in replaces the qualification startup
callback in the separate Main entry. Real assembly captures the exact
Repair candidate. Its unmasked before-activation worker must reach
Ready and close while the old pointer is active. The same candidate can
receive an empty `CUDA_VISIBLE_DEVICES` only while the on-disk journal is
`post-qualifying` and the active pointer matches its exact candidate
bytes. The production client still owns the child and its exit fence.
The emitted receipt requires a real `WORKER_EXITED` with that fence clear.
The package builder checks that the standard Main lacks the test marker.

The fresh test profile first installs the signed runtime. A normal exit
and reopen verifies readiness. The driver then parks the pinned LaMa
resource inside that fixture, exposing the real Repair notice while the
first worker remains ready. Repair reuses the verified runtime transport,
fetches LaMa and builds a distinct candidate. The rollback oracle requires
the public failure, the original pointer bytes, a terminal `rolled-back`
journal, the old slot receipts, no claims and readiness after a normal
AppImage restart. Rollback restores the runtime pointer. LaMa publication
remains a separately verified operation.

## Executed results

The private AppImage was built at
`939f52bb35ea8b074902504472d8ec8bde777422`. It is 147,853,213 B with SHA-256
`7289d3a9db5e25ca6556641723a9341c50ae608301e47a3f61de7884471c7cde`.
The package proof covers 42 production dist members and the separate
qualification entry. An earlier package was superseded after formatting
the collaborator. Its AppImage was never executed.

Setup activated one slot and reopened ready. Repair's distinct candidate
reached Ready with CUDA visible before activation. The recorded active
pointer at the controlled refusal matched its candidate bytes. The
CUDA-masked native startup reported `WORKER_EXITED` with the failed-start
exit fence clear. The same candidate separately reproduced exit 78 and
`Inference startup failed: A CUDA GPU is unavailable.` with the same CUDA
mask under its installed Python. This diagnostic is separate from the
original worker receipt.

The controller recorded `rolled-back` and restored the Setup pointer
byte for byte. That pointer stayed restored across restart. The AppImage
reported the original runtime and LaMa ready, and all four lifetimes
closed normally with physical exit confirmed. Both slot directory
identities and four selected files per slot matched their receipts.
The controller retained the rejected candidate directory for inspection.

Setup downloaded the signed ZIP and LaMa. Repair reverified the cached ZIP
and downloaded only the 205,669,692 B LaMa resource. Each operation
verified 4,607 extracted members. Available ext4 bytes were
64,812,249,088 at Setup consent and 43,480,408,064 after publication.
Repair consent had 43,495,952,384 B available, with 24,855,928,832 B after
rollback. The host was Ubuntu 26.04.1 LTS, kernel `7.0.0-43-generic`,
glibc 2.43 and RTX 4080 with driver `615.71.09` and 14,287 MiB free GPU
memory at preflight. The AppImage run took 311.243 s within the combined
8 GiB scope limit with zero swap or OOM.

The same qualification package also passed the existing incompatible-host
control without opting into the Repair fault, with no payload request.
Typecheck, app build, packaging, scoped ESLint and Prettier passed.
All 477 focused tests passed with zero failures or skips.

An independent live audit checked the exact pointer chain, fault receipt,
wire receipts, 37 exited process identities, 42 production dist members
and the qualification entry. It left large body hashing to the executed
builder and harness. After diagnostic and physical exit, cleanup retained
the executed AppImage, exact pointer and journal, both slot provenance
records and the logs. It released 40,889,790,464 allocated bytes from
the executed run, plus 543,354,880 bytes from superseded packaging.

This qualifies restoration after a known worker startup failure on one
host. Application process death, shipping trust and supported-driver
coverage are separate. All eight public promise statuses remain
**«Пока не обещать»**.
