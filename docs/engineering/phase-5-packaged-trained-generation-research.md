# Trained generation in the packaged installed slot

Base `d79cc0c7a16718d0f91be0b151e8485f59addd20`. This checkpoint exercises actual
inference starting from the retained [AppImage and installed engine](./phase-5-packaged-installed-engine-research.md).
It reuses the exact binary and canonical engine slot from the
[historical upgrade](./phase-5-packaged-installed-historical-upgrade-research.md).
The production application, Python source, package configuration and lockfile
match the recorded source used to build that binary.

## Source basis and scope

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/api/routers/model_manager.py::install_model` passes `inplace`
  to `model_install_default.py::heuristic_import`. `register_path` protects the
  original source and invokes `_register`. `model_load_default.py::load_model`
  consumes the exact registered model configuration. Studio's existing local
  qualification catalog uses `ModelRepository.publishVerifiedInstallation`.
  The fixture adopts that owner, verifying SHA, size and file identity and
  borrowing canonical source paths only for this temporary catalog.
- `invokeai/app/invocations/sd/denoise_latents.py::DenoiseLatentsInvocation.invoke`
  and `invokeai/app/invocations/anima/anima_denoise.py::AnimaDenoiseInvocation._run_diffusion`
  consume their qualified model and conditioning owners. Anima's caller
  `text_encoder/anima_text_encoder.py::_encode_prompt` applies prompt attention
  and produces Qwen/T5 conditioning for the denoiser. This qualification uses
  Studio's existing loaders, schedulers, frozen requests and packaged worker.

The exact Illustrious source is the user-selected **Illustrious XL v0.1**,
official OnomaAIResearch weights with SHA `3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`.
The Anima case uses **Cyberfalafel anima v1.0**, CivitAI `1147756/3120487/3000817`,
SHA `0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941`, and the
exact `anima-manifest.ts` Qwen3 and Wan VAE companions. Installation identity is
an isolated catalog precondition. The original model bytes, installed runtime,
existing Project and other slot files are protected through source rechecks and
the prior qualification's claim, physical-exit and exact restoration owners.
Model Manager install, repair and removal are outside the exercised flow.

Each serial family uses one 256×256 TXT request, 3 steps, CFG 4 and fixed seed 0,
with Euler/Normal for Illustrious and native Euler for Anima. The Anima prompt
has literal raw and compiled weighting expectations. Check the actual durable
queue item, frozen recipe, staged PNG and receipt before Add. The normal
renderer flow edits current authoring separately, adds the result explicitly,
saves and reopens its portable source asset and immutable configuration.
The PNG and `.igs` assertions cover mechanics and persistence. Human quality
and capacity qualification remain separate acceptance work.

Use the owned existing runtime in serial attempts, with a 2 GiB launcher and
a 12 GiB native scope, both zero-swap. A warmed application is not required.
The native limit is set on the actual KDE-promoted Main before Generate. The
wrapper has a 600 s limit and the native deadline is 420 s. Aggregate memory
bounds count each distinct scope once. The CUDA witness matches the worker's
PID, `/proc` start ticks and cgroup after the real queue item reaches `running`.
Main finishes the preliminary runtime qualification worker before it enters
the dispatch callback that claims the queue item. Retain sampled VRAM and
kernel `memory.peak`, `memory.events` and anon/file accounting as distinct data.

## Execution

The harness launches the retained AppImage executable directly using X11,
isolated XDG settings and localhost-only DevTools. Each successful final case
drives the existing renderer controls for the exact
version, Generate, Add as Layer, Save, Quit and Project reopen. The test matches
one actual admission and one completion, progress for all three steps, the
frozen request and exact staged receipt. It changes the draft after admission
and checks that the candidate still carries its frozen settings. It separately
checks that Add leaves the Project dirty until explicit Save. Both lifetimes
close normally and physically. The after-close and after-reopen SQLite and
portable Project copies remain available for byte checks, including the Raster
asset, exact candidate/target RGBA and ICC, and rendered lossless WebP preview.

Both final cases passed on Linux with a GeForce RTX 4080 (16,376 MiB), NVIDIA
driver `615.71.09` and the same AppImage SHA-256
`b92cd007299479a6d8c582a5bf8ca06808d5353833026e61b3435c8e8f1f89ed`.

| Final case     | Wrapper duration | Matched CUDA samples / highest reading | Native host memory peak |
| -------------- | ---------------: | -------------------------------------: | ----------------------: |
| Illustrious R4 |        116.289 s |                         18 / 7,886 MiB |     7,295,610,880 bytes |
| Anima R1       |        128.548 s |                         25 / 5,780 MiB |    12,884,901,888 bytes |

Both jobs had zero cgroup OOM events and zero allowed swap. Anima reached the
12 GiB native limit. The memory total includes file cache, and the sampled
CUDA readings have one-second granularity. These single-item measurements
cover the tested host and workload.

Three Illustrious attempts remain in the record. R1 stopped before Generate
because the cgroup check counted a shared scope twice. R2 timed out before
Generate while waiting for the model selection to commit. The disposable DB
had the exact `defaultVersionId`. The final harness waits for the actual
version control, explicitly picks the exact version and allows time for the
Main-side file verification. R3 completed Generate, Add, Save and reopen. Its
recorder selected a preliminary readiness worker, so it does not establish
the CUDA ownership witness. The final recorder requires the `running` row and
exactly matching GPU identity. None of these changes touch production code.

Tracked qualification changes are JavaScript and research documentation. The
focused Node suite finished with 120 PASS, zero failures and zero skips. The
fresh AppImage control with no engine confirmed Setup unavailable and two
normal physical closes. Scoped ESLint, formatting, syntax and diff checks pass.

## Independent readback and recovery

A read-only reviewer checked the closed SQLite and Project snapshots for
Illustrious R3/R4 and Anima R1. The final pairs have 25 tables and all 30
migrations, pass SQLite integrity and foreign-key checks and preserve the
exact durable queue, receipt, seed and accepted Raster. The saved and reopened
archives match byte for byte, including all six ZIP members and their hashes.
All 65,536 RGBA pixels and the exact ICC profile agree across the accepted
asset, merged PNG and thumbnail WebP. Illustrious R4's candidate PNG also
matches R3 byte for byte. The readback verified the actual final worker PID
identities and physical exits, rehashed 77 installed engine inputs and checked
111 original AppData entries after restoration. The reviewer used retained
bytes and process receipts. The execution harness rehashed the model sources
and checked their size and file identity after every attempt.

Retain the final native reports, closed DBs and Projects under
`runs/packaged-installed-engine/20261118/trained-illustrious-r4` and
`trained-anima-r1`, plus the earlier attempts and their restoration receipts.
The five disposable payload trees are compacted into
`trained-retained-payloads.tar.gz` with 538 verified members and SHA-256
`19a1639f5beb7b5a25cbf80867a2a7c0349a29ffe5594d9798311f401bfa6565`.
Checking process/scope exit and recorded dependencies preceded disposal.
Removing those raw trees and six short test scratch directories released
about 44 MiB of allocated space after the archive and inventory. The canonical
engine, AppImage and original models remain available for follow-up.

The verified scope is compatible trained TXT generation, explicit acceptance
and portable Project persistence on one installed host. Visual judgment,
regional placement, larger workloads, clean Setup, incompatible-worker refusal,
updater recovery and production delivery trust remain in the
[acceptance backlog](./mvp-acceptance-backlog.md). All eight public statuses
remain **«Пока не обещать»**.
