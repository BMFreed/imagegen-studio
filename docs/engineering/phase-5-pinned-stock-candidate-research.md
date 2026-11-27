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
refusal on one local candidate build. These cases reused the installed
slot.

## Candidate Setup and Repair on ext4

Re-read clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
`docs/src/content/docs/start-here/installation.mdx` points desktop users
to the launcher. `invokeai/app/run_app.py` calls the CUDA and cuDNN
checks in `invokeai/app/util/startup_utils.py`. In clean Invoke Launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce`, the explicit Install and
Repair actions in `src/renderer/features/InstallFlow/state.ts` call the
install IPC in `src/main/install-manager.ts`. Repair recreates the
managed virtual environment before syncing. The existing Studio
transaction prepares and verifies a separate slot before publishing it.

The [existing Setup qualifier](../../scripts/prepare-packaged-runtime-setup.mjs)
rebuilt from `f1279f9da1207715c3b496c970b6c4ea71a41618`. Its AppImage
SHA-256 is `3d6e20431ff55952663a99481a02720758f5b07034cf79579eb69bedece22a12`.
The 42 production dist members match the stock candidate. The
qualification entrypoint uses the private loopback publisher and the
original pinned signed envelopes, runtime ZIP and LaMa body.

| Explicit action | Received bytes | Free bytes at consent | Free bytes after publication |
| --------------- | -------------: | --------------------: | ---------------------------: |
| Setup           |  3,424,284,558 |        55,891,980,288 |               34,040,832,000 |
| Repair          |    205,669,692 |        34,040,393,728 |               15,593,050,112 |

Setup verified all 4,607 signed archive members, activated the new
slot and reached Ready again on cold launch. The fixture then parked
the installed LaMa file. The ready runtime reported Outpainting
needs repair. Explicit Repair reused the cached ZIP, fetched LaMa
again and verified all 4,607 members. The completed journal committed
a new runtime ID and preserved the previous pointer bytes. The
previous slot's two directory identities and four selected file
receipts matched after Repair. The reopened app selected the new
ready slot with the restored LaMa resource.

The four AppImage lifetimes closed normally in 329.084 s on the local
RTX 4080 with driver `615.71.09`. Their launcher and application
groups had an aggregate 8 GiB ceiling, zero swap and zero OOM events. Full typecheck,
the desktop build and packaging passed. The exact package and
operation receipts are under
`runs/packaged-runtime-setup/20261125-r1`.

An independent readback matched the native SQLite and wallet assets
across the two AppImages, verified both Ed25519 envelopes, rehashed
146 worker member bodies and checked the journal and slot receipts.
It verified the closed SQLite and all 30 migrations, and confirmed
37 process identities had exited. The AppImage, closed database,
pointer, final journal, both slot provenance records and logs
are retained. Removing the isolated installed slots, caches and
unpacked build released 40,888,991,744 allocated bytes.

The measurement qualifies Setup and Repair on this ext4 host with
the qualification publisher. Installed-worker generation is covered
by the stock runs above and this Setup run covers readiness and
reopen. Setup and Repair through the stock package require the
production publisher in the [MVP checklist](./mvp-acceptance-backlog.md).

## Exact model relink on the stock candidate

Re-read clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
The metadata caller in
`invokeai/frontend/webv1/src/features/metadata/parsing.tsx` resolves
model identity by key and hash using
`invokeai/frontend/webv1/src/services/api/endpoints/models.ts`. The
hash endpoint in `invokeai/app/api/routers/model_manager.py` calls
`invokeai/app/services/model_records/model_records_sql.py` and the
query in `invokeai/app/services/shared/database/queries/models.py`.
Studio's existing portable resolver checks the exact provider tuple,
family and digest. It changes the local identifiers in the draft when
the user links the installed model.

The candidate mode stages a pinned closed DB30 copy and redirects its
default workspace to the run's isolated AppData. The AppImage verifies
the original three installed checkpoint bodies in place. The stock
package proof pins all 43 build members. The harness rechecks the
AppImage before each of the four launches and after the final close.

The Model Manager set Cyberfalafel v1.1 as Default and kept the old
selection in the already saved Project. The portable Project resolved
v1.2 `1147756/2679856/2566634` with its user-set V-prediction
override. Link changed only the two draft local IDs and marked the
Project dirty. Its on-disk archive still matched the input until
explicit Save. The saved Project kept the accepted Raster and its
frozen provenance. Both exact selection and Default reopened as
expected. The model bodies and historical input archive kept their
observed identities.

All four lifetimes closed normally in 62.459 s. The final reports
are under `runs/packaged-noobai-install/20261125-r3`. R1 stopped
before launch when an old fixture required a separate AppData tree.
R2 passed on the exact AppImage. R3 adds the per-launch and final
package assertions. An independent readback matched the accepted
layer, the linked identities and the closed catalog. It confirmed
exit for all 40 recorded process identities. The 114 focused model
and Project package tests passed with no failures or skips. The
scenario qualifies linking, persistence and reopen on the previously
generated Project.

### Exact model relink replay on 8a8af921

The InvokeAI checkout was clean at
`64ff2c600f04d220e470fdaeec570bd402af42a7`. The replay reread
the key and hash lookups in
`invokeai/frontend/webv1/src/features/metadata/parsing.tsx` and their
caller in `invokeai/frontend/webv1/src/services/api/endpoints/models.ts`.
The `get_model_records_by_hash` route in
`invokeai/app/api/routers/model_manager.py` uses `search_by_hash` in
`invokeai/app/services/model_records/model_records_sql.py`, backed by
`with_hash` in `invokeai/app/services/shared/database/queries/models.py`.
The existing Studio exact provider and digest resolver was exercised
without a behavior change.

The unmodified `8a8af9214f377a70226b8bac583426056aa3c1fb` AppImage
repeated the Default v1.1 and exact Link v1.2 flow in private software X11.
The stock proof matched the embedded ASAR and all 43 checked build files.
The harness checked the original three installed files in place. Across
four normal launches, Link changed the two local draft IDs, explicit Save
preserved the accepted Raster and V-prediction provenance, and both the
project and Default opened with the expected selections on cold restart.
Save wrote the same unavailable-preview derivatives as the previous X11
run. This result covers linking and preservation of the accepted layer.

Independent readback matched the archive, frozen provenance, closed catalog,
source pins and AppImage. It verified physical exit for all 40 recorded
process identities. The report, original input and exact two output archives
and SQLite are in `runs/packaged-noobai-install/20261127-r1`. To repeat on a
fresh build, provide its live package proof and explicitly pin its SHA-256
with `IMAGEGEN_LINUX_PACKAGE_NOOBAI_MATRIX_PROOF_SHA256`. The historical
proof remains the default pin.

### Historical refusal on the rebuilt stock AppImage

The stock AppImage from `4d0cdae60ce30f06bd07974ce4b578d999f1eb6b`
has SHA-256
`e0e45842ef0ec5d13372b56f2cd9161b68ea2ec41cdfdf4fc3a9c5b919493425`.
The historical case restored the retained DB29 and its nonempty Project
into private writable AppData. The installed worker and runtime were
borrowed in a private mount namespace. One isolated Python module announced
protocol 2, and the real incompatible worker ran its CUDA startup probe.
The host module, runtime pointer and installation journal matched their
original pinned bytes afterward.

Main wrote the pre-migration DB29 backup before migration 30. Both
lifetimes refused Generate and the historical Retry with
`GENERATION_RUNTIME_UNAVAILABLE` and offered Repair. Explicit Save and
cold reopen kept the saved prompt, historical Raster and frozen queue
inputs. Both processes closed normally. The wrapper passed in 61.091 s
with a 1.1 GiB reported service peak and zero swap. Evidence is under
`runs/packaged-installed-engine/20261118/current-stock-historical-20261127-r1`.

Independent readback matched the AppImage and embedded ASAR, the original
DB29, online backup and both closed DB30 snapshots. It verified the exact
frozen input bodies, historical Raster and ICC, saved archive and physical
exit of 20 recorded identities. The audit used the natively recorded
refusal and the pinned isolated module. No raw worker hello was retained.

### NoobAI V on the rebuilt stock AppImage

The same rebuilt AppImage ran the compatible installed worker on the RTX
4080. The rerun used the exact Cyberfalafel file `1147756/2679856/2566634`
and the same 256×256 three-step Euler V scenario. Fresh InvokeAI source
`64ff2c600f04d220e470fdaeec570bd402af42a7` was checked at
`invokeai/app/services/model_install/model_install_default.py::register_path`,
`invokeai/frontend/webv2/src/features/generation/core/graph.ts` and
`invokeai/app/invocations/sd/denoise_latents.py`. Those paths cover registration,
seed wiring and the declared UNet prediction type.

The candidate PNG matched the earlier pinned V run byte for byte. Explicit
Add, Undo, Redo, Save and reopen passed with frozen V-prediction provenance.
Both AppImage lifetimes closed normally, and the wrapper restored all 112
original AppData entries with exact identities and bytes. The service ran
for 123.364 s and reported zero swap. The peak across 18 samples from the
matched CUDA worker was 7,374 MiB. Reports and closed bodies are under
`runs/packaged-installed-engine/20261118/trained-noobai-v-r5`. The local
repeat covers this specific trained recipe and persistence.
