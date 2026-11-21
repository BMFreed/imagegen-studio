# CUDA generation across a signed AppImage update

This qualification connects [signed recovery and native relaunch](./phase-5-signed-appimage-installed-runtime-research.md)
with a real NoobAI EPS job using the retained signed Linux/NVIDIA runtime.
The three AppImages use the same production sources at `a27f8c99`, versioned
as A 0.1.0, B 0.2.0 and C 0.3.0, with the existing observation bootstrap,
qualification-only Ed25519 signing and a loopback feed. This isolates the
app replacement and relaunch while holding the engine and model constant.

## Source and fixture

The clean InvokeAI checkout was `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api_app.py::lifespan` enters `api/dependencies.py::initialize`,
which refuses abandoned GPU work before database initialization and creates
the Invoker. `services/invoker.py::_start` and `stop` order the queue and
processor lifecycle. `services/session_processor/session_processor_default.py`
owns the execution and abandonment boundary. `services/model_install/model_install_default.py::register_path`
protects the original source and delegates to `_register`. Its
`install_staging_ledger.py` publishes the claim and durably replaces the marker.
`invokeai/frontend/webv2/src/features/generation/core/graph.ts::buildSDGraph`
assembles the ordinary generation inputs for
`invokeai/app/invocations/sd/denoise_latents.py::DenoiseLatentsInvocation.invoke`.
The clean Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` calls
`src/main/updater.ts` from `main-process-manager.ts` and uses `quitAndInstall`.
Studio qualification uses its existing application-update, Project, catalog,
queue and installed worker owners.

The outer qualifier temporarily displaces the original test AppData and
registers the exact borrowed NoobAI EPS checkpoint through the existing
fixture. It leaves the runtime, interpreter and model file at their original
paths. The original 48×32 Raster Project still supplies the CPU preview and
save-on-update check. The independent 256×256 Project starts blank with seed 0
and is saved before the first Generate. Both jobs use identical stored prompts,
sampler, steps, CFG, model and target.

B runs Generate through the public Project UI, observes the enrolled Python
worker on CUDA and retains the output before explicitly discarding its
candidate on Project close. B's historical Raster Project remains the only
dirty Project at Install and restart. The harness checks B's normal Main exit
and retains its closed SQLite before releasing C's native startup gate.

C opens the same saved EPS Project and repeats Generate with a fresh job,
staging session and physically distinct installed worker. Target PNG, result
PNG and the frozen execution inputs must match B. The distinct Generate calls
each contribute their own origin request UUID to the retained frozen payload.
The result also matches the known uninterrupted EPS control. C explicitly Adds, Saves and reopens the
Project to read its stored Raster and provenance. The final closed SQLite
and both portable EPS packages are retained.

The trained route uses a single private X11 cgroup bounded to 12 GiB and zero
swap. The launcher and all applications and workers share that limit. The
CPU-only route retains its 4 GiB bound. The installed worker exits after each
job, with its PID and start identity enrolled in Main's recorded cohort.

## Executed checks

The final run passed with three normal AppImage exits. Each Generate
completed three denoising steps on a separate CUDA worker PID. The largest
sampled worker allocations were 7,886 MiB in B and 7,434 MiB in C. The largest
recorded shared cgroup memory peak was 9,734,168,576 bytes. Both execution
inputs and PNGs matched as specified above. The C Raster's PNG, decoded pixels
and ICC matched its saved preview and the uninterrupted EPS control. The
successor opened the accepted revision cleanly after explicitly closing it.

The independent audit verified the two closed SQLite stores. B had one
completed claim and no accepted result. C retained B's claim, completed one
new claim, and indexed the accepted Raster from that second claim. Both
databases retained the historical Project, 30 migrations and seed 0 for
the EPS Project. The audit verified 27 observed process identities had
exited and the original 112 AppData entries and 77 engine pins matched after
restoration. The final package signatures cover the post-fuse executables.
The producer's manifest executable digest comes from its pre-fuse hook.

The successful reports, closed stores, two PNG/queue-input sets and staged
release metadata are retained under
`runs/packaged-recovery-action/20261121-runtime-r2` and
`runs/packaged-installed-engine/20261118/trained-noobai-eps-r10`. Earlier
attempts retain their diagnostics and available closed snapshots. Cleanup
released ten idle paths and reclaimed 3,841,634,304 allocated bytes. The result
covers one EPS profile and one installed runtime on RTX 4080. Production
publisher identity, changed application sources and the shipping host matrix
remain separate qualification gates.

### Earlier attempts and focused checks

The focused application-update, queue, staging, worker, Project and packaging
tests passed 971 cases with one inapplicable platform skip. The desktop build
and three qualification package builds passed, with 42 compiled files verified
per image. The first run refused the new fixture field before any AppImage
launch. The qualifier restored the original 112 AppData entries. The replay
uses an exact schema for the installed model fixture and the same signed
package bodies.

That replay completed B's control and reached C through the native update.
C reopened with the live tab's default of four images per click. The
one-job assertion stopped the run, and normal close canceled those four
jobs. The retained SQLite contains those four cancellations and B's
completed control. The next run completed B, then reached the five-second
qualification timeout while the installation review still showed its loading
state. Both launched apps closed normally and the profile was restored.
The final replay explicitly sets and verifies one image per click in C and
allows up to 90 seconds for the trained installation review. Images per click
belongs to the tab rather than the saved draft.

A later replay reached both CUDA completions and saved C's accepted Raster.
It timed out at the Home reopen step. The retained close snapshot has two
completed queue rows and one accepted index entry, with matching B/C PNGs.
The runner now waits for the ordinary tab close action to release its Home
list refresh before navigating back to Home, then verifies the selected tab.

## Replay

Build with `pnpm run app:build`, then use
`node --import tsx scripts/prepare-packaged-recovery-action.mjs <build-run>`.
Launch the existing private X11 wrapper with
`node --import tsx scripts/qualify-packaged-installed-upgrade.mjs` and pass
`--recovery-run <build-run> --family illustrious --profile noobai-eps`,
`--engine-report <installed-engine.json>`,
`--model-inputs <trained-input-noobai-eps.json>` and
`--artifacts <engine-run>/trained-noobai-eps-rN`. Use a short owned scratch
path and a 600-second outer service deadline.
