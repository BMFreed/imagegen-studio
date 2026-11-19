# Clean runtime Setup and fresh-slot Repair in AppImage

This qualification uses the private [reviewed Setup package](./phase-5-packaged-runtime-setup-research.md)
and the existing runtime owners. It exercises the [Repair contract](../specs/07-python-runtime-management.md#repair-semantics)
with the signed qualification release. The production feature still requires a publisher.

## Source basis

Re-read the clean InvokeAI checkout at `4875d96531ca6712b288f6e660fcbb34143408c1`.
`docs/src/content/docs/start-here/installation.mdx` delegates desktop
installation to its launcher. `invokeai/app/run_app.py` calls
`invokeai/app/util/startup_utils.py` for Torch, cuDNN and device diagnostics.
The clean launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` sends explicit
Install and Repair from `src/renderer/features/InstallFlow/state.ts` to
`src/main/install-manager.ts`. The Main owner selects managed Python,
publishes status, runs `uv sync` and handles cancellation. Its Repair
deletes the current `.venv` and syncs with `--inexact`. Studio retains
the previous slot and qualifies the candidate around pointer publication.
The qualification reuses the Studio transaction and adds no separate installer.

## Package and scenario

Base `01fdc87e8ebbed1736ee9fb84dc7a33a6f95631d`. The freshly built
qualification AppImage is 147,849,076 B with SHA-256
`7ba91498fb48a88b62d95426ce882dd9ba08c7deb68364a2ffc13fdef10ff5e5`.
The build checks 42 production dist members inside the ASAR and the
qualification-only Main entry. The two signed envelopes and both resource
bodies use the earlier pinned inputs. Transport runs on a private loopback
server through the real runtime downloader.

The clean profile checks Setup review, dismissal and reopening before
confirmation. It then checks transfer, signed extraction, candidate readiness
before and after activation, completed progress and the durable pointer.
Repair uses the same profile. After the normal Setup reopen and close,
the driver parks the exact installed LaMa file as a witness. This causes
the real Outpainting needs repair notice for the ready engine. Explicit
Repair then verifies the cached archive and installs LaMa with a fresh
slot. The old pointer and the prior slot's directory identities and four
selected files are observed across the switch.

## Executed results

| Operation | Input received | Free bytes at consent | Free bytes after publication |
| --- | ---: | ---: | ---: |
| Clean Setup | 3,424,284,558 B | 65,035,808,768 | 43,170,234,368 |
| Repair | 205,669,692 B | 43,722,489,856 | 25,077,096,448 |

Both operations reverified the 4,607 signed extracted members and reached
the before- and after-activation worker checks. The UI reached the
successful terminal state in both cases. Four separate AppImage lifetimes
closed normally with confirmed process and scope exit. Reopen confirmed
the selected runtime and LaMa ready after each operation.

Repair reused the cached signed ZIP and only fetched the pinned LaMa
body. It published a different runtime ID. Its completed journal contains
the exact previous pointer bytes and the exact newly active pointer bytes.
The selected old-slot receipts matched across Repair. A separate actual
startup of the previous slot with the production worker client returned
CUDA worker 0.14.0 and protocol 1 while the installed pointer still
selected the repaired slot. The client closed through its managed SIGTERM
path and the recorded worker identity exited.

The host was Ubuntu 26.04.1, kernel `7.0.0-43-generic`, glibc 2.43,
RTX 4080 with driver `615.71.09` and 14,580 MiB of available GPU memory at
preflight. The combined launcher and native scope ceiling was 8 GiB with
zero swap. Both installation lifetimes reached the 4 GiB individual
memory peaks with file cache included and zero OOM events. The four
AppImage lifetimes took 308.691 s within the bounded service.

Typecheck, app build, packaging and scoped ESLint and Prettier passed.
The focused matrix with the exact config, LaMa and live host opt-ins
passed 477 tests with zero failures or skips.

The packaged Cancel control also passed on the same build. The renderer
observed 196,437 received bytes, canceled the held transfer and left no
active pointer or prepared slot. The first Cancel attempt stopped during
a dialog dismissal before any payload request and closed normally. The
same source passed on a fresh profile. Both receipts are retained.

An independent live audit checked the exact pointer chain, selected slot
identity receipts, wire receipts, four physical exits and the current
package metadata. It left body rehashing to the executed harness and builder.

The run retained the AppImage, operation and worker receipts, final SQLite,
pointer, journals and both slot provenance records. After all readers and
worker scopes exited, it released the two test environments, their
acquisition scratch, both Cancel profiles and the unpacked build.
Cleanup freed 40,904,527,872 allocated bytes. The signed inputs and the
previously retained reusable engine remain available.

This covers clean activation, replacement, preserved previous-worker
startup and reopen on one host. The later
[packaged rollback control](./phase-5-packaged-runtime-rollback-research.md)
covers post-activation worker refusal. Shipping trust, post-upgrade
compatibility and the supported hardware matrix remain open. The
product-promise statuses remain **«Пока не обещать»**.
