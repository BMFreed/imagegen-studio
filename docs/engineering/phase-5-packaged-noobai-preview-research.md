# NoobAI Preview in the packaged app

This checkpoint covers PP-004 through the existing Model Manager. Its public
path starts with **Add from CivitAI URL**, continues through **Fetch preview**
and file selection, and ends at **Cancel** before install. The source label
remains NoobAI and the application family is Illustrious. The AppImage uses
the normal renderer, preload, Main, Model Service and SQLite owners. All
eight promise statuses remain **«Пока не обещать»**.
[Model Manager contract](../features/model-manager.md),
[managed model library](../contracts/managed-model-library.md).

## InvokeAI source basis

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
Its `invokeai/frontend/webv2/src/features/models/ui/add-models/AddModelsView.tsx`
calls `useInstallActions.ts`. `invokeai/frontend/webv2/src/features/models/data/apiKeys.ts`
and `api.ts` attach the source-scoped token to the explicit install request.
`invokeai/app/api/routers/model_manager.py::install_model` calls
`invokeai/app/services/model_install/model_install_default.py::heuristic_import`.
The latter maps an unsupported metadata-fetcher URL to a direct file source.
`get_fetcher_from_url` has Hugging Face metadata support. Invoke lacks Studio's
separate CivitAI model/version/file review, so the controlled test uses
Studio's existing CivitAI transport seam. The stock package uses the
production entrypoint and collaborator configuration.

## Preview results

Both cases use pinned public model-page URLs and independent Model/version
API readback. All four metadata GETs returned 200 and the anonymous account
endpoint returned 401. Each selected file's provider size estimate and
SHA-256 matched the existing qualification pin.

| Checkpoint | CivitAI model / version / file | Estimated bytes |
| --- | --- | ---: |
| NoobAI-XL Epsilon-pred 1.0 | 833294 / 1022833 / 928571 | 6,938,040,416 |
| Cyberfalafel v-pred v1.2 | 1147756 / 2679856 / 2566634 | 6,938,040,794 |

- The stock AppImage validates the supplied credential through CivitAI and
  saves it using actual encrypted storage in the isolated profile. Its
  ordinary Model Manager reviews both live versions, selects each exact file
  and cancels. It verifies the exact typed Preview result, empty catalog and
  install queue, and all five model/install SQL row counts at zero before
  and after Cancel and after close. The fixture removes the stored credential
  and confirms its file is absent before normal physical exit.
- A separate qualification AppImage uses the same 42 built files and native
  SQLite binding. It injects only the CivitAI metadata response and a body
  transport that records and refuses attempts. Both versions start on the
  primary 1 MiB decoy. The actual chooser selects the pinned non-primary
  file and shows its size and verification copy before Cancel. The ledger
  records nine metadata calls and zero body calls. SQLite and the IPC
  catalog and install queue remain empty. The credential entry and removal
  use actual encrypted storage with an authored synthetic token.
- The Live report originally reused the generic package-smoke scope caption.
  The final live and controlled reruns record the Preview scope and the
  single normal lifetime directly. Their wrapper receipts are zero.

The native AppImages used the existing X11/extract-and-run qualification
driver with localhost Chromium CDP and no Main Node inspector. The launcher
and owned native scopes were capped at 8 GiB aggregate with zero swap.
This verifies the Preview and explicit-install boundary. Live checkpoint
body transfer and managed installation remain separate work.

## Installed worker preflight

The earlier worker with the same 0.14.0 label has 72 files now and differs
from the current source. The separate signed installed slot is the checked
runtime for this turn. Its 73 worker files and 17 SDXL configuration files
matched their exact pins before and after the test. The live Python worker
reported Linux NVIDIA Ready, protocol 1, all 12 required NoobAI capabilities
and Linux worker ownership. The 4 GiB zero-swap unit peaked at 1,311,039,488 B.
Client close physically exited without an escalation. The worker self-test
exercised CUDA without opening checkpoint bytes or running any generation.

## Packaged Cyberfalafel V generation

For this slice, re-read the same Invoke revision's
`invokeai/app/services/model_install/model_install_default.py::register_path`
and `_probe`, `invokeai/backend/model_manager/configs/main.py::Main_SD_Checkpoint_Config_Base`,
and `invokeai/app/invocations/sd/denoise_latents.py::get_scheduler` and both
callers. Invoke registers original model paths, delegates checkpoint objective
to model configuration and feeds the UNet objective into the scheduler. The
fixture reuses Studio's existing exact, read-only source adoption and bootable
engine test. It places the independently hashed original Cyberfalafel V file
in a temporary catalog with no override and no weight copy.

The same verified stock AppImage starts with the assumed Epsilon label.
Selecting V-prediction in Model Manager saves one override keyed to the exact
SHA-256 and 6,938,040,794 B size. The original Project draft retains its saved
Epsilon descriptor. Generate resolves the library policy, records V-prediction
in the frozen worker request, and retains V in immutable accepted provenance
after Save and reopen. Its resolved noise settings are SDXL scaled linear,
leading spacing and zero-terminal-SNR rescaling disabled. This is one bounded
TXT request at 256×256, Euler/Normal, 3 steps, CFG 4 and fixed seed 0.

One admitted request completes on the signed installed worker. The result is
explicitly added and saved after an independent draft edit. The second AppImage
lifetime reopens the same clean Project with the accepted Raster, candidate
receipt, exact PNG bytes and frozen configuration. The driver matches the
CUDA worker by PID, start ticks and cgroup. Maximum sampled worker VRAM is
7,886 MiB. The two application lifetimes exit normally under a 14 GiB combined
launcher/scope limit with zero swap and zero OOM events. The wrapper returns
zero after 124.918 seconds. Restoration re-attests 111 entries in the
original owned engine app-data and rechecks the stock package, worker and
original model identity.

The first V observer timed out during the full checkpoint verification
before a prediction override or queue admission. It closed and restored the
slot. The passing rerun waits for the verified UI state and checks the exact
database row. Visual quality, installer/repair behavior and the wider
checkpoint and worker matrix remain open.

The focused model, token, inference and package tests passed 170 cases
with zero skips or failures. Typecheck, app build, scoped ESLint and
formatting passed.

Independent read-only audits checked both final Preview runs and the V
generation. They verified the Preview AppImages and 42 packaged members per
case, the isolated databases, exact controlled transport and normal physical
exits. The V audit also matched both six-member Project archives, exact PNG
and ICC bytes, the candidate receipt and one persisted prediction override.
It confirmed 111 restored entries and 66 body hashes in the original slot.

Compact evidence lives under `runs/packaged-noobai-preview/20261119-r2` and
`runs/packaged-installed-engine/20261118/trained-noobai-v-r2` in the local
artifact store. After physical exit and release of the audit readers,
disposal freed 1,524,944,896 allocated bytes. The verified stock AppImage
remains pinned for the next managed-download check. The protected installed
runtime and original model files remain available.
