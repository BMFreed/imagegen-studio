# Managed NoobAI EPS installation in the stock AppImage

This checkpoint exercises the existing Model Manager against live CivitAI.
It uses the exact NoobAI-XL Epsilon-pred 1.0 checkpoint identified in the
[packaged Preview checkpoint](./phase-5-packaged-noobai-preview-research.md)
and the retained stock AppImage from that run. The application payload
matches all 42 current build members. The active scope is PP-004. All eight
promise statuses remain **«Пока не обещать»**.
[Model Manager contract](../features/model-manager.md),
[managed model library](../contracts/managed-model-library.md).

## Source basis

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/routers/model_manager.py::install_model` calls
`invokeai/app/services/model_install/model_install_default.py::heuristic_import`,
which enters `_import_from_url`, `_import_remote_model` and
`_enqueue_remote_download`. `invokeai/app/services/download/download_default.py::_download_next_item`
runs `_do_download`, which sends the selected token, validates redirects and
renames a verified-length partial. The completion callback enters
`_install_next_item` and `_register_or_install`. Studio's existing CivitAI
downloader and Model Install Coordinator are the production owners for this
check. Qualification drives the same Preview and exact-file Install actions.

For worker validation, re-read `model_install_default.py::register_path`,
`_probe` and `_register` and their install/probe callers,
`invokeai/backend/model_manager/configs/main.py::Main_SD_Checkpoint_Config_Base`,
and `invokeai/app/invocations/sd/denoise_latents.py::get_scheduler` and its
two callers. Invoke supports in-place model registration and uses an
Epsilon default for SDXL single-file weights. Its UNet objective reaches
the scheduler. The existing Studio trained fixture can register an exact
original path in a temporary catalog to exercise the real worker without
copying weights.

## Exact input and limits

Public CivitAI metadata reports model 833294, version 1022833 and file
928571, raw label NoobAI, 6,938,040,416 B and SHA-256
`ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1`.
The install tests use an isolated profile with the supplied CivitAI
credential. The harness captures only safe route identity and bounded
status/byte samples. The CivitAI estimate and downloaded byte count have
independent checks. Temporary staging and final content-addressed
publication share the ext4 filesystem. The launcher and native app have
a combined 8 GiB ceiling and zero swap. The 780 s transfer allowance
admits the full body on connections averaging about 8.9 MB/s.
The installed application is reopened from the same isolated catalog
after removing the token. [CivitAI model version](https://civitai.com/models/833294?modelVersionId=1022833)

## Live install result

The public confirmation admitted one install. Actual CivitAI progress
advanced from zero to 6,938,040,416 B and reported complete after
237.628 seconds. The wrapper exited zero in 252.993 seconds, and both
packaged application lifetimes closed normally. The published content
has SHA-256 matching the pinned provider file, mode 0600 and one link.
The staging directory is empty. The completed job and ready primary
artifact match the single Illustrious resource, version, default and
local file. No dependent artifact was admitted.

The second AppImage lifetime showed the same installed version and
assumed Epsilon with the same completed job. The token file was absent
on close and reopen. Network remained enabled for this catalog check.
The wrapper's original footer used the word offline. The harness now
describes the observed credential-free reopen.

An independent read-only audit rehashed the stable published inode and
verified SQLite integrity and foreign keys. It matched the complete
installation, artifact and catalog rows and the two reopen/exit receipts.
Twenty tracked PID identities were absent and both native scopes and
timers had settled. A separate evidence scan found no credential or
signed transport URL in the retained run reports and logs.

## Generation from the installed file

A separate signed-engine fixture registers the exact managed EPS file by its
existing canonical path. It reads the same inode and bytes and restores the
original engine slot after use. The stock AppImage selects that resource
through the public Project picker. The setting resolves to Epsilon by
default. The native queue item and portable accepted result both preserve
the exact CivitAI source identity, SHA-256 and `epsilon`. The checkpoint
override table stays empty. The request uses 256×256 TXT, Euler/Normal,
three steps, CFG 4 and fixed seed 0, with the default scaled-linear and
leading noise policy.

One actual CUDA request was admitted and completed. The test explicitly
adds the result, saves and reopens the identical Project with its exact PNG,
candidate receipt and immutable settings. The worker reached 7,374 MiB
sampled VRAM. Both native lifetimes exited normally with a 14 GiB aggregate
memory ceiling and zero swap. The wrapper exited zero after 110.477 seconds.
Restoration matched the identity and bytes of 111 original slot entries.
The installed model also retains its original identity after the worker
and both application lifetimes settled.

The independent generation audit matched both six-member Project archives,
their exact PNG and ICC, the frozen request, both SQLite copies and 17
device observations of the exact worker. It matched 111 restored filesystem
entries and 64 file-body hashes. Two Chromium files were verified by
metadata only. Both owned scopes settled and both deadlines were inactive.

All 550 scoped model, download, install and packaging tests passed with
zero skips or failures. Scoped lint and formatting passed. Visual quality,
managed V installation, side-by-side Default and exact portable relink
remain in the acceptance backlog.

Compact reports and checks are retained under
`runs/packaged-noobai-install/20261119` and
`runs/packaged-installed-engine/20261118/trained-noobai-eps-r1`.
Disposal of the owned extraction scratch and staged post-generation
profile freed 14,163,968 allocated bytes. The original installed managed
file and its isolated catalog are pinned for the side-by-side matrix.
