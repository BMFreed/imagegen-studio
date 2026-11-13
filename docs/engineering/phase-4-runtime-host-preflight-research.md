# Runtime host preflight before offline assembly

Base: clean master `ec2bc68d5ba564592c7ac8fe3d502c72b7c8078a`.
High risk: executable host probe, physical process ownership and runtime install
admission. Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[offline installation](./phase-4-runtime-offline-install-research.md), PP-001/004/007/008.
Public promise statuses remain unchanged.

The finite consumer is the existing internal Main installation backend. A real
host preflight replaces the missing default `ensureHostCompatible` implementation
before auxiliary readiness and slot assembly. It does not supply a release,
publish a trust key or enable public Setup. This build still needs complete
trusted artifacts, full engine preview/download and installed release acceptance.

## Fresh source and adaptation

InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` reread with callers:

- `invokeai/app/util/startup_utils.py`: `nvidia_driver_cuda_version` asks the
  installed driver API; `check_cuda_build_compatibility` distinguishes an old
  driver from a GPU outside the Torch build's architecture support. It checks
  every enumerated CUDA device and logs diagnostics rather than enforcing this
  Studio install contract.
- `invokeai/app/run_app.py`: calls that check after Torch startup and allocator
  setup, alongside cuDNN/build diagnostics.
- `invokeai/backend/util/devices.py`: `TorchDevice.choose_torch_device`, explicit
  configured/session device selection and automatic backend selection.
- `invokeai/app/services/model_manager/model_manager_default.py`: constructs
  caches for the effective device and generation devices through `TorchDevice`.

Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` reread:
`src/main/gpu-detection.ts` `runProbe`, `hasNvidiaGpu` and `detectGpu`, plus
`src/main/index.ts` `util:detect-gpu` IPC caller. Its three-second per-probe and
ten-second overall deadlines bound an advisory, manually overridable backend
guess. PCI/device-file fallback can identify a card without a usable driver;
that is insufficient to admit a signed Linux/NVIDIA runtime installation.

The user was informed before implementation: these sources do not provide a
strict pre-install gate for Studio's signed glibc/driver/SM requirements. Invoke's
Torch-based checks cannot run before the new runtime exists. Adapt their
driver/device compatibility distinctions and all-device inspection to Main;
read OS/architecture and glibc from Node, query NVIDIA metadata without importing
Torch, and keep the existing installed-worker self-tests as the execution gate.
No system Python, alternate inference engine or new command executor is added.
Both source references are Apache-2.0; this is mechanism adaptation, not a copied
source file or complete release license qualification.

## Consumer and invariants

Verified signed release and frozen review → existing RuntimeManager operation
lock/AbortSignal → real host preflight → existing auxiliary prerequisite → fresh
offline assembly → existing CPU/inference qualification and pointer lifecycle.
The backend host collaborator becomes an optional explicit override for controlled
integration checks; its absence selects the real gate. The default application
factory still has no trusted release provider and remains install-unavailable.

The gate compares Linux/x64 and Node's actual glibc version with the manifest.
Unknown glibc is not treated as compatible. NVIDIA inspection uses the fixed
absolute `/usr/bin/nvidia-smi`, fixed `driver_version,compute_cap` CSV query and
restricted environment; renderer input cannot choose the command or arguments.
Numeric version comparison must preserve component order and equality rather
than comparing version strings lexically. Malformed, missing, empty or ambiguous
probe metadata refuses before auxiliary work or slot creation.

Each reported compute capability maps to an exact manifest SM allowlist entry;
a numerically newer GPU is not automatically supported by the selected build.
There is no selected-GPU UUID binding in this installation contract. The policy
therefore conservatively checks every enumerated GPU, adapting Invoke's all-device
check. One unsupported device refuses; it does not silently pick another or add
a device picker. This is not heterogeneous multi-GPU acceptance.

`cudaVersion` remains the producer's declaration of the selected release build.
An nvidia-smi banner's CUDA value is driver capability, not proof of the installed
Torch build. The gate compares the signed numeric driver floor and device list;
actual CUDA/native-library/tensor compatibility still requires the later real
worker self-test. This checkpoint chooses no new supported driver, GPU or glibc
floor. Qualification fixture requirements are test inputs, not release promises.

## Bounds, cancellation and failure

| Parameter | Source / bound | Consequence |
| --- | --- | --- |
| Host profile | existing signed manifest Linux/x64 | refuse other platforms before probe |
| ABI/driver/SM requirements | verified manifest values | exact comparisons; unknown facts refuse |
| Probe command | absolute nvidia-smi and fixed metadata query | no shell, PATH selection or renderer arguments |
| Probe deadline | launcher per-probe3s adapted via AbortSignal | request termination; elapsed time never proves exit |
| Termination/confirmation | existing command runner SIGTERM grace5s, then SIGKILL; confirmation10s | retain global exit fence if leader/group exit unconfirmed |
| Host parsed metadata / GPU rows | 64KiB /64, checked after command completion | explicit refusal; producer/inference capacity not inferred |
| Command stdout/log | existing runner2MiB/8MiB ceilings | bounded refusal; not measured probe capacity |
| Qualification groups | Root4GiB, zero swap,600s | test envelope, not GPU/runtime capacity |

`runOfflineRuntimeCommand` already owns the isolated process group, output bounds,
close observation and unconfirmed-exit registry. Reuse it with the probe's abort
deadline; do not copy launcher's timeout race as successful physical completion.
Install Cancel and application shutdown use the same existing operation signal.
Probe failure, deadline or cancellation must settle physical exit before a clean
failure is returned. Unconfirmed exit remains fenced through the existing runtime
shutdown retry; no replacement probe or assembly may compete with it.

Unsupported host, unknown ABI, missing/broken NVIDIA command, bad CSV, insufficient
driver or unmatched SM returns a domain diagnostic before auxiliary verification,
downloads, Python/environment slots or pointer changes. Logs may be retained;
models, Projects, presets and previous runtime files remain outside this gate.
A successful metadata check does not publish Ready or activate a runtime.

## Verification plan and evidence limits

Focused cases cover numeric floor equality/order, malformed/unknown facts, no
GPU, exact SM membership, mixed supported/unsupported devices, command failure,
Cancel/deadline, physical-exit errors and no work after refusal. Manager checks
must enter the actual signed review/install consumer and observe no auxiliary or
assembly call on failure; a neighboring compatible-host case reaches them.
Controlled command responses establish parsing/admission behavior, not real
driver or GPU compatibility. Tests for default command cancellation use real
small processes without touching unrelated workloads.

Root plans an actual metadata-only nvidia-smi/Node probe through the production
owner, then signed RuntimeManager refusal before assembly. Semantic mutation
must reach that consumer, produce the intended RED with neighboring GREEN, and
restore exact source bytes. Source review, authored tests, Root execution and
independent retained-byte audit remain separate results. No prior runtime result
is counted again. Full release install, GPU inference and supported-host matrix
acceptance remain open.

## Results

ROOT `tests-final-r3`:228 PASS across6 explicit runtime/preflight/shutdown/target
files, zero failures/skips. The pinned17 config snapshot and actual-host opt-in
were supplied. The signed Main consumer refuses glibc999 before auxiliary/assembly;
actual default host inspection reaches the neighboring controlled assembly
refusal without Python or inference startup. Other manager success/rollback
transports stay controlled ports. The owned Node cancellation test observes
readiness, forwards Abort to the production executor and confirms PID absence;
it does not infer physical exit from a timeout.

`typecheck-final-r3`, `build-final-r3`, full four-part `lint-full-r1` and later
`format-final-r1` scoped lint pass. The sole parser exclusion remains unchanged
`qualify-installed-regional-init.mts`, with base/live hash proof. No Python/UI
source changed; no prior inference or browser matrix is counted as a fresh run.

ROOT `actual-host-r3`:4 actual metadata checks PASS through production defaults,
no host facts/command/executable override. Observed Linux/x64, glibc2.43,
NVIDIA driver615.71.09 and one sm_89 device meet the authored fixture requirements.
A second real query refuses driver floor99999; Node glibc999 and already-canceled
controls refuse before command/log creation. Both CSV logs, source freezes and
bounded process receipts are retained. The final command fence is empty and the
unit physically exits. These values describe this host and test fixture;
no release support floor, CUDA build compatibility or capacity is accepted.

Independent source review found mutable log-parent resolution. ROOT reproduced
an actual outside-file append before the late rejection (`log-parent-red`), then
held the directory FD for create and runner reopen, with cwd `/`. Narrow review
found the adjacent created-leaf hardlink substitution. ROOT reproduced its
outside-file append (`log-leaf-red`) and added optional created-log identity to
the existing command owner. The runner snapshots the pin and checks the opened
file's dev/ino and nlink1 before any child spawn or append; failed identity closes
the descriptor. Later name changes cannot retarget an open descriptor. Existing
assembly callers without that optional pin keep their original behavior.
Both actual-runner regressions and neighboring controls pass after fixes;
final narrow source review is CLEAN, source-only, without reviewer execution.

Two isolated semantic mutations bypass default Main preflight and ignore later
GPU rows. Final18 top-level selections =16 GREEN +2 intended semantic RED, with
neighboring controls and exact restored GREEN. Nested TAP39 records35 PASS/4FAIL
because child failures also fail their parent; this is two mutations, not four.
The final SM phases include both actual log-race regressions as GREEN controls.
Earlier SM evidence before log fixes remains explicitly superseded. Copied import
witnesses, final source/runner hashes, physical exit and reader release are retained.

Controlled deadline/error tests do not qualify a wedged NVIDIA driver; an
unkillable process was not manufactured. Main-death/orphan recovery during this
preflight was not exercised; live process cancellation does not establish crash
reaping. Full Torch/CUDA tensor/ABI execution remains with installed qualification.
Complete wheelhouse production, publisher trust, qualified host matrix, transport,
full engine preview/public Setup and distributable/update/MVP acceptance remain
open. Promise statuses are unchanged. Source review, ROOT execution, mutation
execution and independent retained-byte audit are separate evidence.

## Artifact lifecycle

Run: `~/.codex/artifacts/imagegen-studio/runs/runtime-host-preflight/20261113`.
Root's initial inventory records root30GiB (shared17/runs13), disk60GiB free,
GPU1388MiB used/14631MiB free. No Torch/CUDA allocation or heavy ML/runtime/model
copy is planned. The own3MiB snapshot contains all17 exact config files copied
and verified from protected SHARED without mutation; it is not a live dependency.

Exact source/bundle and no-follow payload archives retain probe logs, own config,
all mutation controls/backups and execution attempts. Independent audit, reader
release, fresh physical/dependency gates and exact disposal receipts live in the
RUN. Only its `payloads` and exact `t-rhp-1113` root are disposal candidates;
SHARED, models, ordinary app data and foreign processes remain protected.
Lifecycle records the final payload/dependency state. Raw paths are not a resume
contract after disposal: reconstruct selected inputs from the verified archive
without following its external node_modules link. Restore the source snapshot,
verify hashes and run in a new owned bounded unit. No runtime/weights/private
signing key are needed for this metadata qualification. The actual script accepts
one explicit new absolute `--report-file` within the owned feature run root.
