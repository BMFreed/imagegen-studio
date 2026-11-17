# Packaged AppImage with an installed engine

Qualification for the first local Linux/NVIDIA row of the
[MVP acceptance backlog](./mvp-acceptance-backlog.md). The existing offline engine
runner can now stop after one complete installation, with its final data root in
the normal packaged XDG layout. The existing AppImage smoke can use that exact
slot. These are harness changes. Product installation, worker protocols and
Project behavior use the existing owners.
[Runtime contract](../specs/07-python-runtime-management.md),
[offline engine](./phase-5-native-engine-qualification-research.md),
[standalone AppImage](./phase-5-linux-app-package-research.md).

## Source and scope

Re-read InvokeAI at `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/services/model_install/install_staging_ledger.py` and its callers
in `model_install_default.py` supply conservative staging ownership and restart
restoration. `invokeai/app/run_app.py` calls `app/util/startup_utils.py` for host
checks. `tests/family_e2e/test_gpu_memory.py` uses an isolated CUDA subprocess.
`invokeai/backend/image_util/infill_methods/lama.py` and its invocation caller
`invokeai/app/invocations/infill.py` supply actual installed LaMa execution.
The existing Studio runtime and test owners adapt these mechanisms. Packaging
uses the existing launcher-derived `electron-builder.config.cjs` and
`scripts/smoke-linux-package.mjs` normal-close checks.

The protected shared 0.14.0 slot is a distinct historical peer. Its latest
runtime pointer report matches its 72 payload members, but two common source
files differ from current source and it lacks the current dependency-policy
module and CPU export capability. The retained qualification transport instead
contains the current 73-file worker package byte for byte. Its Ed25519
qualification envelopes, 67-wheel lock closure and pinned LaMa resource are
reused. The original shared runtime and model catalog retain their prior state.

`full-engine-install` takes the same exact signed inputs as `full-engine` and
keeps the native install, fresh status, CUDA/refusal, LaMa and exit checks. It
creates one slot at its final absolute path. The packaged probe binds the report,
pointer, provenance and worker files, then expects both normal AppImage lifetimes
to return Ready for that runtime ID with available outpaint infill. An existing
application database at that location refuses this fresh-fixture profile.

The offline release selector is explicitly `qualification-0.1.0`. The built
desktop is `0.1.0-dev.1` and consumes an already active slot via its ordinary
runtime resolver. Setup under that desktop's app-version selector, packaged CPU
derivative execution, historical state upgrade, trained generation and visual
acceptance remain separate. Production publisher inputs are still unavailable.

## Executed evidence

- Actual host metadata preflight passed four checks on glibc 2.43, RTX 4080
  `sm_89`, NVIDIA driver `615.71.09`. The check qualifies this host against the
  fixture declaration and exercises refusal for unsupported driver/ABI floors.
- The signed engine run passed **11 checks**. It adopted the exact retained
  transport and built one managed CPython 3.12.13 slot with 67 distributions.
  Three CPU self-tests physically exited and advertised `export-composition`.
  The native checks exercised inference qualification, actual CUDA kernel
  work, the hidden-CUDA refusal and pinned LaMa infill. The installer consumed
  explicit local source, with the existing assembly, activation and pointer
  owners. The 8 GiB unit took 184.8 seconds with zero swap and recorded no OOM.
- The freshly built fused AppImage passed both normal lifetimes. Actual packaged
  Main/preload IPC reached Ready for the exact slot and LaMa, created and
  reopened an empty Project, loaded its stored thumbnail, and closed normally.
  Its two `.igs` bodies match byte for byte. The 76 input hashes (report, pointer,
  provenance and 73 installed worker files) match before and after both lifetimes.
  The probe records normal physical AppImage close and leaves short-lived
  readiness-worker termination details at the level exposed by Main.
- The same AppImage also passed two normal lifetimes on a separate empty data
  root without the engine. The default provider still reports unavailable Setup
  in that configuration. Both installed-engine SQLite snapshots passed an
  independent read-only `quick_check` and contain one Project and zero jobs.
- The runtime CLI and Linux package checks passed **69 tests**, and the changed
  qualification scripts passed lint.
- The packaged build reused local Electron and the native SQLite prebuild and
  disabled dependency rebuild for this isolated worktree. The earlier packaging
  attempt stopped at pnpm's linked-dependency check. The passing retry called
  the same Vite, Main build and electron-builder owners directly. The executed
  harness printed the old unavailable-Setup success label after emitting the
  correct installed-engine report; delivery selects the label by profile.

Artifacts and exact command/exit receipts are under
`~/.codex/artifacts/imagegen-studio/runs/packaged-installed-engine/20261118`.
An independent read-only audit recomputed the package, reports, input hashes,
Project and database checks, and reconciled process identities after close.
After its reader finished, exact owned extraction, package/build caches, source
worktree and short TMPDIR were disposed, reclaiming 3,792,633,856 allocated bytes.
The installed slot is reserved for the subsequent historical/real-model packaged
qualification at the same canonical path. It and the AppImage are the recorded
temporary budget exception. The local AppImage has qualification
scope. The eventual shipped app and runtime need production trust, delivery and
the supported hardware matrix. All eight promise statuses remain **«Пока не
обещать»**.
