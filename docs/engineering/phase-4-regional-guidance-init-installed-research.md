# Installed worker initialization and frozen Retry

## Scope and current source

Base: `e3904569acc81240205607a52e26dfb9f1533cfe`, following the
[frozen initialization identity](./phase-4-regional-guidance-init-transport-research.md).
High risk: developer-only installed worker update and operational queue/recovery
qualification. No production UI, protocol, sampler or recovery implementation
change is planned.

The private initialization profile has no public UI/IPC selection. This check
enters genuine Main services below the public coordinator: ProjectService,
ModelService, existing preparation/capture, generation context, frozen queue,
Retry, processor/staging and default RuntimeManager. It is not a built Electron
renderer/IPC, packaged release or public Euler-a qualification.

Current InvokeAI remains clean at
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`. The following actual sources and
callers were reread:

- `invokeai/app/services/session_queue/session_queue_common.py`: concrete graph
  serialization; `session_queue_default.py`: validate stored root graph and
  construct fresh execution state for Retry.
- `invokeai/app/api/routers/session_queue.py`: enqueue/Retry callers;
  `session_processor/session_processor_default.py`: invocation ownership.
- `invokeai/app/invocations/noise.py`, `latent_noise.py`,
  `sd/denoise_latents.py`, `invokeai/backend/util/devices.py` and
  `stable_diffusion/diffusion_backend.py`: CPU noise, dtype, device and native
  initialization/denoising consumption.

Reuse is the existing snapshot, fresh Retry state and owned model/device scope.
Studio's explicit frozen initialization identity is the previously disclosed
adaptation: Invoke reads the SDXL draw dtype from runtime-global configuration.
This qualification introduces no alternative numerical mechanism.

## Finite acceptance

Reuse the one canonical qualification runtime and original official Illustrious
XL v0.1 file, SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
6,938,040,760 bytes. Refresh only the installed worker payload through the
existing guarded updater; retain dependency versions, configuration, Python
location and model bytes. No environment/model copy or model download.

The fixed request uses seed 123, 1024×1024, translated origin `(-13,5)`, 28 Euler-a
steps, CFG 5, Main's resolved scaled-linear/false-ZTSNR/leading schedule and
embedded manual-FP16 VAE. No TI, LoRA or reference images. Two fixed red/blue
regional prompts and their masks originate from saved/reopened Main state.
Global support is Everywhere and pooled sources are current-canvas. These are
private experiment values, not product defaults.

The private queue operation has no `compositionProfile` and explicitly carries
`initializationProfile: "invoke-cpu-f32-add-noise-v1"`. Older four-image FP32
references use Invoke composition and are therefore not exact PNG oracles for
this different private encoding lane.

The finite healthy ceiling is two native generation calls:

1. Create and verify genuine Main input, enqueue and claim without dispatch.
   Recreate the existing generation context over the same database and let
   original startup recovery mark the old attempt APP_RESTART. Explicit Retry
   preserves the frozen recipe, target and initialization identity despite
   later authoring changes. Dispatch that Retry through default RuntimeManager
   and installed worker; verify durable candidate/receipt association.
2. Execute the exact same frozen private input directly through the same
   installed worker owner, changing only request/output identities. Reopen both
   PNGs independently and require every RGB byte to match, including dimensions,
   ICC, seed, response correlation and exact step progress.

No native pipeline or sampler collaborator is replaced. A claim/restart before
dispatch is distinct from a crash during denoising. Two requests through the
same installed selector establish integration and reproducibility, not an
independent numerical initializer oracle. The earlier CPU/CUDA profile and
dispatch mutation evidence remains separately applicable.

## Operational parameters and refusal

| Parameter                 | Fixed boundary and evidence level                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Native host limit         | 12 GiB aggregate owned cgroup, zero swap, 600-second deadline                                                |
| Updater/lower checks      | 3 GiB, zero swap, 600 seconds                                                                                |
| GPU headroom              | Preflight observation: 14,240 MiB free of 16,376 MiB; not a capacity guarantee                               |
| GPU allocator fraction    | Default installed RuntimeManager has no qualified switch; no allocator patch or 0.75 claim                   |
| Runtime scratch           | New owned 0700 descendant of canonical installed appData; separate from experiment database                  |
| Public admission          | Remains Euler-only and rejects private initialization identity                                               |
| Existing wire/data limits | Unchanged 64 KiB wire, 1 MiB bundle, 128 KiB frozen payload and existing alpha/target/geometry/mask ceilings |

RuntimeManager must use its default host/client factory, original active pointer
and live qualification. Source and installed payload hashes must agree. Missing
capability, changed pointer/resource, malformed identity or failed native output
must not become a successful candidate. All borrowed worker leases must close
physically before cleanup. Startup recovery and Retry use the existing owners;
no direct SQL repair, synthetic receipt or background auto-resume is permitted.

## Evidence

Compact records live under artifact-relative
`runs/regional-guidance-init-installed/20261105-runtime`.

ROOT has completed the guarded developer worker-only payload refresh: installed
0.14.0 advertises `illustrious-regional-invoke-init-v1`, all 63 worker files match
current source, dependency versions remain exact and physical exit is confirmed.
The updater unit completed in 12.272 seconds, zero swap; this is not release
Install/Repair. The existing updater/resource helper suite passed 82 cases.

The fresh Main/default installed RuntimeManager harness completed **native-r3
PASS: four grouped checks, two trained generation requests**, both with progress
`1..28`. Claim → existing context/bootstrap recovery recorded APP_RESTART before
dispatch; explicit Retry kept the original payload, recipe, target and
initialization despite saved authoring changes. It published one private durable
candidate/receipt. The direct identical-input control created no extra queue row.
Both complete PNGs match byte-for-byte, including every one of **3,145,728 RGB
channel bytes**. ROOT separately reopened retry, control and candidate PNGs with
Pillow and matched their RGB, ICC, size and hashes. No visual judgment is made.

The qualified native unit completed in **116.193 seconds**, host MemoryPeak
**2,311,544,832 bytes**, zero swap and no remaining owned PIDs. Forty external
GPU samples observed aggregate device usage up to **9,843 MiB**, including other
device consumers; this is neither an allocator limit nor a peak-capacity proof.

Main's default RuntimeManager admission preflight also passed with the new live
capability and confirmed physical exit, with zero generation requests. Full
configured `pnpm run typecheck`, targeted inclusion of the `.mts` harness,
scoped ESLint (existing `.mts` project-service override), Prettier and diff checks
pass. No project tsconfig or inference implementation was changed.

Diagnostic attempts remain separate, with zero native generations:

- **native-r1:** ROOT's earlier advisory preflight had created the legitimate
  persistent lifetime lock in the supplied scratch directory. The harness's
  fresh-empty guard refused it. A new owned sibling scratch was used; no lock
  was removed to bypass ownership.
- **native-r2:** a test fingerprint compared JSON insertion order after schema
  hydration. Object keys are now canonicalized recursively; array order, exact
  text/identity and mask bytes remain significant. Two focused regressions pass
  and are registered in `app:test`. Isolated sort-removal mutation gives
  **2 GREEN → 1 semantic RED + 1 control GREEN → 2 restored GREEN**, with no
  inference. This is six executions of two already counted cases.

The earlier independent source review is CLEAN for the original harness, without
runtime certification. Native-r3 uses the corrected fingerprint. A subsequent
lint-only function-declaration move preserves every function body and all other
statements; the retained TypeScript AST/printer proof maps the executed source
to the final harness. Independent FinalR2 source/document/retained-data review
is CLEAN: all 1,478 source files, the canonicalization correction, regression
controls, 70 payload-archive members, PNGs, coverage, closed SQLite/IGS, 21
migration hashes and reported results reconcile. It supplies no native rerun or
independent physical-exit certification.

Retained source, previous/current worker manifests, reports, commands, failed
diagnostics, closed SQLite/IGS inputs, masks, targets and all output PNG bytes
remain available. Worker-only installation reuses the same runtime and original
weights. After 15 recorded empty-group exit proofs, final runtime-idle check,
source restoration, incoming-dependency and all-reader closure, six owned
temporary roots were removed. The deletion-only artifact-root reduction is
**12,034,048 bytes**; all candidate paths are absent. Literal dependency links
were not followed. Archives and one deduplicated fresh PNG remain accessible;
the shared installed runtime and original model remain protected for the next
concrete integration step.

## Preserved limits

No visual reassessment, seed/prompt search, public sampler/default switch, Anima
regional support, generic SDXL family, installed Electron UI or release readiness
is inferred. Historical visual 3 PASS / 1 INCONCLUSIVE remains NOT_QUALIFIED.
Smart target-only permissions, frozen-work independence and Regional
provenance/Compare/result-derived-preset exclusions remain intact.
PP-001/007/008 remain **«Пока не обещать»**.
