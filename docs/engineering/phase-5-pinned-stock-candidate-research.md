# Pinned stock AppImage on the installed CUDA runtime

The local candidate uses Studio source `09e860a737bd3aa93f28862ea72c9729250a6f72`.
The stock AppImage SHA-256 is
`26093ba6ad8cc30356641ad204f579faf475be831cbb4d602887e9858aba301a`.
The independent audit extracted the ASAR and native resources from the
raw SquashFS. It matched 43 build assets, the Linux SQLite addon, the
stock entrypoint and the configured Electron fuses. The AppImage and
ASAR contain the same application payload used for the former 256-project
Home check. The new build has its own package identity.

The original signed runtime report is pinned. The installed worker source
matches the candidate's Python worker sources. The existing qualification
fences the canonical slot with an exclusive claim, verifies its 77
inputs, and checks readiness and actual worker identity in the packaged
application. It also verifies the exact checkpoint and restores the
original non-runtime AppData inventory after physical exit. A separate
private mount namespace gives the historical case its own writable
AppData and read-only borrowed runtime. Its protocol-2 declaration is
bound over one module within that namespace.

Re-read clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
The `invokeai/app/services/model_install/model_install_default.py`
path registers existing model files in place. SDXL graph assembly in
`invokeai/frontend/webv2/src/features/generation/core/graph.ts` sends model
and seed through the original noise and denoising owners. In
`invokeai/app/invocations/sd/denoise_latents.py`, the scheduler uses the
declared UNet prediction type. The queue API in
`invokeai/app/api/routers/session_queue.py` calls
`invokeai/app/services/session_queue/session_queue_default.py`, which
cancels interrupted work at startup and clones the frozen graph for
explicit Retry. The SQLite startup starts in
`invokeai/app/api/dependencies.py`, and the migrator records a backup
through `invokeai/app/services/shared/database/database.py` before running
pending migrations. The existing Studio consumers implement these roles
for its local Projects and installed-workers contract.

## NoobAI V-prediction on CUDA

The clean profile registered the exact Cyberfalafel V file
`1147756/2679856/2566634` with the V-prediction override. Generate
used the matching installed CUDA worker. The one 256×256, three-step
Euler generation reproduced the earlier V qualification's candidate
PNG byte for byte. Add, one Undo, one Redo and explicit Save produced
an accepted Raster with frozen settings. The same saved Project
reopened byte for byte. Both AppImage lifetimes closed normally, with
the original 112 AppData entries restored by identity and bytes.

The run finished in 138.621 s on RTX 4080 driver `615.71.09`.
Peak sampled worker VRAM was 7,322 MiB across 26 matching samples.
The native application scope peaked at 9,340,989,440 bytes. The
2 GiB launcher hit its limit during the verification, and both
groups reported zero swap and zero OOM. The package and native
proofs are retained under `runs/packaged-noobai-preview/20261125-r7`
and `runs/packaged-installed-engine/20261118/trained-noobai-v-r4`.

## NoobAI EPS after interruption

The exact EPS file `833294/1022833/928571` ran in a new clean profile
on the same AppImage bytes. The crash harness uses its required proof
layout with a byte-identical temporary copy of the package. It
confirmed the running queue row and its live CUDA worker before
signaling only the owned Main process. The recorded physical exit
distinguishes this deliberate crash from the two later normal closes.

Startup canceled one row with `APP_RESTART` once. Public Retry admitted
one new job using the frozen model, prompts, seed and target despite
current draft edits. The original row advanced from running sequence 1
to canceled sequence 2 at startup. Explicit Retry advanced its
sequence to 3 while preserving its cancellation and frozen payload.
The resulting PNG matches the previous EPS control byte for byte.
There were two admissions, one cancellation and one completion.
Explicit Add and Save persisted the accepted Raster and its frozen
configuration. The exact saved archive reopened, and the wrapper
restored all 112 prior AppData entries.

The wrapper finished in 161.882 s. The successful worker peaked at
7,320 MiB across 27 matched VRAM samples. The native application scope
peaked at 8,951,513,088 bytes on the recovered lifetime. The separately
bounded launcher reported memory-limit activity. The wrapper and native
groups completed with zero swap and zero OOM. The first lifetime's
crash intent and SQLite main/WAL/SHM are retained with the later closed
datasets under `runs/packaged-installed-engine/20261118/trained-noobai-eps-r11`.

## Historical DB29 and incompatible worker refusal

The third profile used the same stock AppImage and restored five exact
regular members from the retained DB29 checkpoint. Startup left one
private online backup. Its schema and rows match DB29. Both new closed
databases have migration 30 and passed integrity and foreign-key checks.
Startup kept the original canceled generation row and its frozen files.

The protocol-2 declaration produced `GENERATION_RUNTIME_UNAVAILABLE`
for Generate and historical Retry through their normal entry points in
both lifetimes. The renderer disabled the corresponding actions and
offered Repair. Explicit Save and reopen preserved the historical Raster
and ICC and the new prompt. Both previews carried the expected unavailable
state. The seven-member saved package reopened byte for byte. Both
lifetimes closed normally. The original worker declaration, runtime
pointer and installation journal matched their prelaunch pins.

The historical service ran for 54.893 s. The launcher and application
groups reached 1,404,944,384 and 724,066,304 bytes respectively, with
zero swap and zero OOM. The closed reports and bodies are under
`runs/packaged-installed-engine/20261118/candidate-historical-20261125-r1/upgrade-r1`.

The application build and stock AppImage packaging passed. The
focused database, queue, resource-use and packaging checks passed
116 tests including subtests, with zero failures or skips. The local
candidate's six normal closes all returned zero. The additional EPS
crash was intentional and reached its owned Main.

The independent readback verified 71 exited process identities across
the seven lifetimes, the exact saved Raster archives and both DB30
snapshots for each profile. It replayed 33 checksum-valid EPS WAL
frames across nine commits and found the exact running queue item.
The closed EPS databases preserved the frozen input after Retry. The
separate DB29 backup matched the historical schema and rows.

Cleanup rechecked 200 retained files and released 726,081,536 allocated
bytes. The original model files, installed runtime and one exact tested
AppImage remain. The temporary proof-layout duplicate and superseded
Home AppImage were released. Frozen input bodies, the crash database
triplet, closed archives and audit reports are retained.

This checkpoint covers real EPS and V execution, crash recovery,
explicit saves, DB29 backup and migration, and incompatible worker
refusal on one local candidate build. The installed slot was reused.
Setup, actual Repair and model relink still have separate candidate
qualification work in the [MVP checklist](./mvp-acceptance-backlog.md).
