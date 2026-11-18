# Reviewed runtime Setup through a qualification AppImage

Base `3a57b54c85d62afab4b338a91ca6ee086c9d055f`. The
[runtime contract](../specs/07-python-runtime-management.md) and
[metadata-first owner](./phase-5-runtime-metadata-provider-research.md) require
signed source selection and explicit consent before transfer. This change
adds a qualification path for the real packaged renderer, preload, Main and
runtime owners. Production Setup remains unavailable without a configured
publisher.

## Current donor and callers

InvokeAI was clean at `4875d96531ca6712b288f6e660fcbb34143408c1`.
In `invokeai/app/services/model_install/model_install_default.py:1549–1655`, the
remote-file resolver captures HF sources pinned to a commit, and cache acquisition
checks the exact source again after the lock. In
`invokeai/app/services/download/download_default.py:241–321`, construction of
the multicomponent job can defer acquisition until a separate submit.
`invokeai/app/invocations/infill.py:130–143` gets the LaMa resource via
`invokeai/app/services/shared/invocation_context.py:800–824`. Its installation
docs defer desktop installation to the launcher.

The clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` calls
`src/main/install-manager.ts:298` from its install IPC at lines 1034–1077
and `src/renderer/features/InstallFlow/state.ts:184`. Its Repair deletes
`.venv` at lines 598–605 before sync and uses `--inexact` at lines 744–766.
Studio's contract preserves the old slot through candidate qualification and
rollback. The donor has no equivalent of the signed Studio metadata provider,
fresh-slot pointer transaction or packaged qualification injection. The
existing Studio verifier, cache, extraction, LaMa and installer owners are reused.

## Build and controls

The [qualification package builder](../../scripts/prepare-packaged-runtime-setup.mjs)
supplies one Main-side collaborator at the existing RuntimeManager constructor
in an isolated esbuild input. It emits a separately named AppImage using the
existing package configuration and Electron fuses. It checks the original
built Main, preload, renderer and migrations against the packaged archive.
The production checkout and standard build have no qualification trust input.
The original signed envelopes have the exact release selector
`qualification-0.1.0`. The local app package version remains `0.1.0-dev.1`.

Each control starts from independent empty XDG paths. The existing downloader
seam routes only the two fixed logical origins to a private loopback HTTP
server. No public publisher, DNS path or live HTTPS trust is claimed. The
downloader's actual streaming,
size/hash, cancellation and cache logic still run. Its successful stream goes
through the actual signed ZIP extractor and the pinned LaMa installer. The
host control substitutes only the probe executable/arguments to supply an
old driver. The same preflight command owner, parser, admission and reporting
then handle it. The qualification collaborator logs raw download, host and assembly
failures before they are sanitized for the renderer.

The host is Ubuntu 26.04.1, kernel `7.0.0-43-generic`, RTX 4080 with driver
`615.71.09`. The signed artifact targets Linux x64, glibc 2.28 or later,
CUDA 12.6, SM 8.9 and driver 560.0 or later. The exact signed minimum is
21,474,836,480 B at assembly. The 3,218,614,866 B cached transport,
3,317,985,242 B expanded source and 205,669,692 B LaMa publication are already
materialized by this point. The artifact volume started at about 25.5 GB
available. Two full runtime slots require more room again. Other available
mounted filesystem types are NTFS. Keep the protected installed runtime
and signed inputs in place. The signed floor is left intact.

## Executed results

The qualification AppImage is 147,841,045 B, SHA-256
`d1d1d7fc9f645c4c113a0b08754606c9099483dc65caa24e7250d27f7bdbde2a`.
Four independent XDG fixtures reached the actual Setup dialog. Each showed
3.2 GiB for the 3,424,284,558 B total download and a 20 GiB runtime minimum.
The total installed size and peak requirement were shown as unknown. Opening, dismissing
and reopening review issued zero requests and created no cache entry,
installation journal or active pointer.

| Explicit Install confirmation | Observed result |
| --- | --- |
| Controlled NVIDIA driver 1.0 report with SM 8.9 | Real host preflight returned `RUNTIME_HOST_DRIVER_UNSUPPORTED` before either payload request. |
| Held transfer and UI Cancel | Progress showed 196,437 received bytes of the exact archive total. Cancel settled the same operation, stopped the connection and left the owned incomplete marker without a partial archive or runtime slot. |
| One flipped byte in an otherwise complete archive stream | All 3,218,614,866 B arrived. Actual downloader returned `DOWNLOAD_HASH_MISMATCH`. There was no extraction, LaMa publication or installed slot. |
| Exact verified archive and LaMa | The cache, all 4,607 signed extracted members and the pinned LaMa file matched. The unmodified assembler returned `RUNTIME_ASSEMBLY_DISK_SPACE` with 17,224,314,880 B available against 21,474,836,480 B required. The failed journal recorded no prepared, previous or candidate pointer. No Python or environment slot was created. |

The disk case took 73.407 s including AppImage launch, acquisition, extraction,
and readback. The launcher and packaged Main ran within an aggregate 8 GiB
configured ceiling across the two observed cgroups, with zero swap. The
individual recorded peaks were 3.30 GiB and 4.00 GiB, respectively, with file
cache included and zero OOM events. Neither activation nor a CUDA worker start
was reached. The four qualification lifetimes had normal process and scope
exit. The existing ordinary AppImage also showed unavailable Setup and completed
its normal Home/Project create/restart smoke in two fresh lifetimes with the
earlier harness snapshot.

Setup's public error remains generic for the incompatible host, digest and disk
failures. The packaged evidence distinguishes these failures via exact leaf
codes and independent wire, filesystem and process assertions. Clean activation,
reopen with the newly installed worker, Repair and failed post-activation startup
with previous-slot preservation remain open. The application needs a Linux
volume that still has 20 GiB available at assembly while retaining its verified
inputs and any previous slot. All public promise statuses remain
**«Пока не обещать»**.

The first build invocation failed before typecheck because the user service
did not inherit pnpm's PATH. The first packaged attempt after that reached
Main and refused a fixture pin with an extra field before the Setup review.
Both attempts are retained as harness failures. The final build and controls
used the corrected fixture projection and bounded service environment.

## Verification and retention

Full typecheck and production app build passed. ESLint and Prettier passed for
all five changed qualification sources. The nine focused files first ran with
stock fixture opt-ins absent. The full rerun with the exact extracted config,
pinned LaMa and actual host check completed with **477 PASS, zero fail,
zero skip**. The preliminary and final counts overlap.

Independent read-only verification compared the executable and ASAR streamed
from the AppImage with the unpacked build, all six fuses, 42 production dist
pins and the live qualification sources. It checked all 4,607 signed extracted
members and 207 parent directories, the cached ZIP and envelope bodies, LaMa,
the cancellation prefix and corrupt digest, the exact leaf diagnostics,
and physical exit. This was a separate audit of the recorded run.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/packaged-runtime-setup/20261118-r1`.
The exact private AppImage is retained for replay. Case reports, source and
package manifests, wire and process receipts, the audit, failed journal and
small failure-marker bodies are retained. The 39 exact disposed transfer,
extraction, build and XDG scratch paths in `retention.json` occupied
7,728,308,224 allocated bytes. The signed shared source and previously
installed runtime are preserved.
