# Full offline Python runtime installation qualification

Base: clean master `c5608ba75ac2cf62db72d7ba62fb37c83ca56de3`.
High risk: executable artifact assembly, installed package identity, native
qualification and publication of an active runtime pointer. Supporting contracts:
[runtime delivery](../specs/07-python-runtime-management.md#release-artifacts),
[internal offline backend](./phase-4-runtime-offline-install-research.md),
[wheelhouse verification](./phase-4-runtime-wheelhouse-verification-research.md),
PP-001/004/007/008. Public promise statuses remain unchanged.

This finite checkpoint extends the existing offline qualification harness with
an explicit full-inference profile. It exercises the existing Main installer
and worker consumers with the complete selected Python wheel set. It does not
ship a publisher key, expose public Setup, qualify LaMa or generate an image.
The review scope remains `python-runtime-slot`, not a complete engine preview.

## Fresh Invoke source and existing owners

InvokeAI was reread at `4875d96531ca6712b288f6e660fcbb34143408c1` with callers:

- `invokeai/app/services/model_install/install_staging_ledger.py:114,189,452,611`
  supplies complete no-replace claims, synced atomic markers, source/revision
  bound reuse and recovery retention. `model_install_default.py:293,2138`
  calls these owners. These are model-resource staging mechanisms, not a signed
  managed-Python environment installer. The fresh private-staging check also
  follows `create_staging:611` through its `tempfile.mkdtemp` creation and
  `_import_remote_model:2138` assigning that owned staging path. This supplies
  the isolation principle for the already adapted private scratch owner.
- `.github/workflows/python-tests.yml:212,357` installs through
  `uv sync --locked`; the developer setup guide uses sync with `--frozen`.
  `pyproject.toml:346–383` supplies platform/backend resolution and the global
  Notebook exclusion. Invoke's current package versions do not replace Studio's
  exact lock or introduce another backend family.
- `invokeai/app/util/startup_utils.py:28,44,60,75`, called from
  `invokeai/app/run_app.py:146–173`, names the actual Torch build, cuDNN,
  driver CUDA support and GPU/compiled architecture compatibility. These
  functions log diagnostics; their return is not a fail-closed installation
  acceptance verdict.
- `startup_utils.py:116,177` and callers in
  `session_processor_default.py:1256,1523` probe SDPA eligibility on a selected
  generation device. This allocates a tensor and asks `can_use_*`; it does not
  execute an attention kernel. Invoke deliberately keeps it off the idle boot
  path because the CUDA context lasts until process exit.
- `tests/family_e2e/test_gpu_memory.py:174–189` supplies an isolated CUDA child
  using `zeros`, synchronization and `fill_` before synchronization. The
  qualification's small operation-backed probe adapts that sequence without
  its large memory allocation. The optional FP8 loader probe in
  `backend/model_manager/load/load_default.py:125` separately demonstrates
  checking actual CPU cast/device copy/device cast operations on the chosen
  device; its caller only runs when a suitable model requests FP8.

No compatible signed offline managed-Python assembler or install-qualified
worker protocol was found in those Invoke owners. That missing mechanism and
the adaptation were disclosed in the existing offline-backend checkpoint.
This change reuses the already adapted Studio owners rather than introducing
another installer, runtime manager, worker, queue or sampler. Invoke's
Apache-2.0 source attribution remains applicable; complete release licensing
is a separate gate.

## Input contract and material path

`scripts/qualify-runtime-offline.mjs` preserves the default two-wheel CPU
qualification/inference-refusal route. The optional
`--profile full-inference` requires `--wheelhouse-report` alongside the existing
managed Python, uv, exact config, wheel directory and report paths. The plan
beside the report is read as an exact byte-bound companion. Unknown profiles,
missing/extra profile arguments and proof/input drift refuse.

The full route checks all 67 selected wheel identities against the verification
report, its bound plan, current lock/project and live source files. It preserves
the fixed `invoke-inference-v1` Notebook policy and the worker's current
noneditable package bytes. Locked versions and actual files are not replaced
by a new resolver, undeclared package, editable source or diagnostic filter.
Streaming hashing/copying keeps large binary inputs out of whole-file buffers.

The signed test payload contains managed CPython, uv, the selected wheels,
requirements and the exact 17-file configuration. Its signing key is generated
for this isolated qualification; it is not a distributed publisher trust root.
The new slot is created at its final absolute location, with existing incomplete
markers. No completed venv is moved or used to replace the working runtime.

The intended material route is:

```text
verified wheelhouse/current source
→ complete signed fixture and Main preview
→ install review token
→ actual default host preflight
→ existing offline assembler and installed dependency policy
→ existing CPU + inference prequalification
→ pointer publication and postqualification
→ completed journal/removed owned markers
→ reopened manager, worker resolution and CPU self-test
```

Full mode retains the actual default Linux/NVIDIA host check. The auxiliary
port is explicitly a no-op: this tests the Python slot and does not install or
qualify the separately managed mandatory LaMa resource. Successful Python-slot
activation must not be described as complete application engine installation.

`RuntimeManager`, `assembleOfflineRuntime`, `RuntimeInstallationController`,
`ProjectWorkerClient` and `GenerationWorkerClient` remain the production owners.
Exact distribution membership, installed worker payload bytes and interpreter
prefixes remain assembly checks. The signed policy's installed metadata receipt
is preserved. CPU image-codec self-tests and exact required capabilities run
before and after activation, together with the existing inference ready gate.
Every owned client must confirm normal physical exit before its phase settles.

The identities remain distribution `imagegen-worker 0.1.0`, CPU worker `0.1.0`,
inference worker `0.14.0` and protocol `1`. Worker source, capability contracts,
generation defaults and model-library contents are not changed by this profile.

## Private scratch alignment and the first actual refusal

Root's first full-profile execution, r1, installed all 67 selected distributions
and passed the CPU worker check, then failed during inference startup. This
exposed a production owner/path mismatch: `RuntimeManager.qualifyInstallation`
passed `roots.downloadsDir` as `scratchBasePath`, while normal status and
operational qualification use `appDataDir/scratch`. The download cache in that
fixture had mode 0775. The inference lifetime owner correctly requires an
ordinary, canonical, current-user-owned scratch directory with exact mode 0700.
Its refusal was not evidence that the installed ML packages were broken.

The existing `ensureAppPaths` in `src/main/app-paths.ts` already establishes
`appDataDir/scratch` through descriptor, identity, ownership and private-mode
checks. Root's correction reuses that owner: installation qualification must
pass the same private scratch as operational consumers, and the harness must
call `ensureAppPaths` before installation. The CUDA-hidden refusal and healthy
neighbor must use that same scratch. This does not require making the download
cache private, changing `createRuntimeRoots`, weakening the Python guard or
adding another scratch/storage mechanism.

This diagnosis distinguishes the production path-selection defect from an
incomplete harness setup. The relevant current Invoke source and caller were
reread before selecting the existing-owner adaptation. Root reported unchanged
source/input hashes and confirmed physical exit for all r1-owned processes.
The outer 8 GiB group showed file-cache pressure; r1 was a startup refusal, not
an OOM result. Those are Root-reported execution/resource observations, not an
independent run or resource audit by this document's author. The later r2
execution established success after the existing-owner correction; that success
is recorded separately below, not inferred from source review.

## Native probe and refusal boundaries

The installed inference worker already validates pinned imports/classes,
bundled Anima tokenizers and CUDA availability before advertising ready. Its
existing one-element `empty` plus synchronization proves allocation/context;
it does not by itself demonstrate arithmetic or an attention kernel.

The harness adds a small installed-interpreter CUDA probe through the existing
command owner: allocate a zero tensor and synchronize, allocate 16 elements,
`fill_(1)`, synchronize, then check the sum equals 16. This explicitly exercises
native device operations without loading a checkpoint. It does not qualify
matmul, SDPA backend selection, inference, visual usefulness or capacity.

After installation, a fresh manager must observe the owned active pointer,
resolve its installed CPU worker and pass the normal self-test. A separate
inference startup with CUDA hidden must refuse while preserving the exact owned
pointer and respecting process-exit fences; an ordinary unmasked neighbor must
still start and close. No second install, Repair or rollback is inferred from
that control. Earlier rollback tests remain their separate evidence level.

Missing, changed or unbound source proof, incompatible host/native imports,
dependency mismatch, failed probe, invalid ready response or unconfirmed exit
cannot become success. Failed new slots remain incomplete under their existing
owners; previous data/pointers are not overwritten. The harness must retain
diagnostics and leave cleanup to Root after physical exit and retention audit.

## Finite parameters and verification plan

These are engineering/test bounds, not measured release support capacity.

| Parameter / owner | Intended bound | Meaning and refusal |
| --- | --- | --- |
| Full profile aggregate cgroup | 8 GiB, zero swap, 600s | CLI and serial owned children share the same outer budget |
| Default CPU profile cgroup | 4 GiB, zero swap, 600s | existing lower-envelope route remains unchanged |
| Signed fixture required free space | 20 GiB | explicit full-test planning value, not a shipping engine preview |
| Stream hashing/copy buffer | 1 MiB | binary input is not read wholesale |
| One streamed input file | 32 GiB | finite input refusal |
| Small metadata reader | 128 MiB | preserve its explicit metadata bound |
| Wheelhouse verification report / plan | 2 MiB / 8 MiB | proof refusals precede installation |
| Existing command stdout / log | 2 MiB / 8 MiB | bounded output; failure retains incomplete state |
| Command deadline / TERM grace / exit confirmation | 300s / 5s / 10s | timeout is not physical-exit proof |
| CPU / inference startup defaults | 15s / 120s | existing clients; CPU request timeout is 120s |
| Installed CUDA operation probe | 16 filled elements, sum 16 | tiny native-operation check, not load/capacity evidence |

The finite checks cover default-profile preservation, exact full-profile proof
and selected artifacts, real default host admission, offline installation,
installed policy/package/worker identity, native imports and operations,
pre/post qualification, pointer/journal completion, reopened-manager status,
masked-CUDA refusal and unmasked neighboring success. Root must record which
boundaries were actually executed. Source authoring and helper tests do not
establish successful installation or safe cleanup.

## Results

Root's **actual full r2 PASS** records **10 checks** in
`RUN/actual-full-r2.json`; the bounded command in
`actual-full-r2.resource.json` completed in **125.599s** with exit 0,
zero swap and no remaining owned PIDs. All67 distributions were installed
offline, and all 73 worker package files matched their verified wheel bytes.
The installed policy receipt checks 120 requirements and records exactly the
Compel Notebook exemption. Source and read-only input hashes remained unchanged.

The actual installation used the default host preflight and existing Main
preview/install/assembly/activation consumers. Pre/post activation qualification
completed with two CPU and two inference clients. A fresh manager then observed
ready status at the installed final path, resolved the CPU worker and performed
another CPU self-test and native ready check. Across the full run there were
**three CPU clients and five inference startup attempts: four ready clients and
one expected CUDA-hidden refusal**. The refusal preserved pointer bytes, cleared
its startup-exit fence and retained a healthy unmasked neighboring start.
Normal owned clients confirmed physical exit; no forced exit counted as success.
The owned journal completed, its markers were removed and its one-use review
token could not be reused.

Seven actual command receipts include the installed-interpreter native probe.
On this host it reported Torch 2.7.1, torchvision 0.22.1, CUDA 12.6,
cuDNN 90501 and RTX 4080 compute capability 8.9. The 16-element CUDA fill/sum
operation returned 16 with confirmed exit. This proves that tiny operation on
this installed Python slot and host; it does not qualify matmul, attention,
model inference, image quality or a release support matrix.

The full unit's memory peak reached the exact **8 GiB** group limit. Its peak
sample included **7,613,288,448 file-cache bytes**. The run passed with zero
swap, but that is not evidence of spare memory headroom or a maximum capacity
guarantee. The measured native envelope and file-cache contribution must remain
visible rather than being replaced by an inferred process-only footprint.

The current default CPU route separately passed **eight actual checks** in
`actual-cpu-r1.json`, under its unchanged 4 GiB/zero-swap/600s envelope.
Its resource report records 29.868s and 982,802,432 peak bytes, with no remaining
owned PIDs. It installed only the worker/Pillow pair, retained strict uv checks,
passed CPU self-test, and correctly refused missing Torch with entrypoint
code 78. No active pointer was published and its failed new slots remained
incomplete. This is preservation of the deliberate refusal route, not another
successful full runtime installation.

The first actual full r1 remains a retained FAIL after 67-package assembly and
CPU success, with the scratch-owner mechanism described above.
`scratch-counterexample.json` separately confirms a mode 0775 scratch refusal
with code 78 and physical exit. Its PASS means that expected refusal was
observed; it does not relabel full r1 as success. Neither r1 nor the counterexample
is counted as semantic-mutation RED.

`mutations-final.json` records a separate executor's **12 selections = 10 GREEN
+ 2 intended semantic RED**, with exact restoration and reader release.
Bypassing exact plan-byte binding accepted a borrowed plan; bypassing streamed
expected-hash checking accepted wrong bytes despite matching size/initial
identity. Neighbor controls and both restored selections passed. These are
copied real helper/parser unit consumers under 4 GiB/zero-swap/600s; the mutations
do not claim a repeated native full installation.

The source follow-up by `/root/full_runtime_review` returned CLEAN. That review
executed no runtime or retained-byte audit. The document author read the compact
Root/executor reports and source contracts; the author did not independently
run the full installation, GPU work or mutations. Actual source review, Root
runtime execution, helper sensitivity and final retention audit are distinct
evidence levels.

Separate actual validation passed `pnpm run typecheck`, scoped ESLint and
`pnpm run app:build`. The focused runtime/installation/harness suite passed
161 tests with one explicit opt-in host-test skip; actual default host preflight
was exercised by full r2 above. The earlier isolated harness suite passed all
39 selections. The four validation services used 4 GiB, zero swap and 600s
bounds, with a maximum measured peak of 2,431,791,104 bytes and confirmed exit.
No prototype/browser check was required because this change does not alter UI.
The separate independent retained-byte audit passed in 108.048s, within
4 GiB/zero-swap/600s bounds, with physical exit and closed readers. It checked
all live entries, all 67 protected wheels and 22,433 source-index rows, every
compact archive member, all 104,035 omission mappings and 4,410 generated
bytecode recipes, the 95-file source snapshot, three producer reports and final
mutation restoration. Its earlier two FAIL reports remain retained: the audit's
rules initially mistook generated worker bytecode and nested/bundled metadata
for mandatory retained installed payload. Those audit predicates were corrected
to the existing retention contract; product and payload bytes did not change.
Cleanup and Git delivery remain separately recorded below and in RUN receipts.
Previous wheelhouse byte/metadata results are inputs, not new installed-runtime
execution here. No trained generation, visual acceptance, full engine/LaMa
installation, release hardware matrix, distributable, clean upgrade/rollback,
publisher-key delivery, Electron updates, public Setup or MVP acceptance is
established by this finite Python-slot result.

## Artifact lifecycle

RUN: `~/.codex/artifacts/imagegen-studio/runs/runtime-offline-full/20261114`.
Exact temporary root: `~/.codex/artifacts/imagegen-studio/t-rof-1114`.
The existing protected wheelhouse remains
`shared/runtime-wheelhouse-cp312-5526e7408e31-r1`. Its reciprocal dependency
includes this RUN and preserves the preceding consumer. All original wheel
identities and bytes remain unchanged.

Initial Root inventory: 34,676,768,768 allocated root bytes
(shared 21,306,175,488; runs 13,370,589,184), 61,595,189,248 available disk bytes,
GPU 999 MiB used / 15,021 MiB free, driver 615.71.09. These are preparation
observations, not a reservation of future memory or permission to stop another
process. The native run requires a fresh admission check and serial GPU use.

One temporary complete installer fixture has a concrete purpose distinct from
the current reusable runtime. Expected additional raw usage is roughly 18–20 GB:
signed-source wheels, final-slot bootstrap wheels, installed site packages,
unpacked uv cache and managed Python/uv/config/bytecode. The resulting source,
slot and cache must all be released after retained evidence and independent
physical/dependency audit; this stage does not retain or relocate a new venv.
The 30 GiB artifact-root soft budget therefore requires an explicit temporary
exception and disposal checkpoint, not deletion of protected historical data.

The temporary own-raw budget was increased to 42 GiB while the failed full r1,
fresh successful full r2 and default CPU control fixtures remained for audit.
This is a budget, not a measured total artifact-root footprint. The actual full
inventory accounts for 137,707 entries, 36,879,753,481 regular bytes and
37,225,734,144 allocated bytes in the two owned roots. These are a temporary counterexample/retry/control set,
not a retained fleet of three reusable runtimes. All newly constructed raw
source, slots and caches still require the explicit disposal checkpoint after
audit; the existing working runtime and protected wheelhouse remain untouched.

Only the 17 public pinned config files are reconstructed from their retained
archive. Managed CPython is a read-only preparation source; only the fixture
and slot copies required by the existing signed assembly path are created.
No model/checkpoint/encoder/VAE weights or existing working runtime are copied
or changed, and no wheel is redownloaded.

`payload-inventory.json` records every live entry, including omitted bytes.
The separate compact manifest and construction-source index bind 33,672 retained
entries and 556,500,797 regular bytes to the 210,082,337-byte archive
`retained-construction-and-metadata.tar.gz`. SHA-256:
`07d30d60cbbb5eb12a3977aa200d2298a0160a4ecc08b9046d75a4d98d9d67eb`.
Every excluded regular file is either byte-exact to a protected wheel/member or
retained construction input, or has an explicitly checked CPython312 bytecode
recipe. Recipes do not promise byte-identical or relocatable installed venvs.

The first inventory stopped at its 64 MiB JSON limit. Keeping the failed and
fresh successful slots required a 108,453,606-byte full manifest; the run-only
metadata bound was increased to 128 MiB, with actual encoded sizes recorded.
No product limit changed. The successful inventory, archive self-check and
independent audit are separate receipts; the failed helper runs remain retained.

Reconstruction requires the compact inputs, source snapshots and exact retained
SHARED wheels, followed by fresh final-path assembly and qualification. Do not
resume disposed raw paths, relocate an old venv or automatically extract stored
links. Publisher trust, LaMa and release acceptance remain separate gates.

After all independent readers closed, Root rechecked the compact archive and
the complete live inventory immediately before deletion, confirmed settled
owned scopes and removed only `RUN/payloads` and `t-rof-1114` without following
symlinks. Actual reclaimed allocation: **37,225,734,144 bytes**. The cleanup
service exited normally with no remaining PIDs. Lifecycle is `retained`,
`payloads: []`; the reciprocal SHARED dependency remains protected.
`cleanup.json`, `release-gates.json` and `commit-proof.json` retain closure and
delivery identities. `delivery-source.json` binds the final documentation;
its behavior files match the independently audited `final-source.json` and
the actual native/CPU/mutation/validation source hashes.
