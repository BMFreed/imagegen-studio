# App-owned runtime and trained generation qualification

## Expected result and scope

This high-risk checkpoint plans an opt-in development qualification of the
existing normal-generation path on actual Linux/NVIDIA hardware. It follows
[public Anima integration](./phase-2c-anima-public-generation-research.md) and
serves [PP-004](../product-promises.md#pp-004-управляемая-библиотека-моделей-вместо-ручной-работы-с-файлами),
[PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации),
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю) and
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
Those public promises remain open.

The intended outcome is an observed Project UI → Main admission → frozen queue
→ installed Python worker → trained CUDA inference → verified local staging
→ explicit Add → Save/reopen path for Illustrious and original Anima Base 1.0,
in both `txt2img` and opaque `img2img`. The checkpoint uses existing trained
files and verified offline architecture configuration. It does not download
models, introduce another inference backend or implement runtime Install/Repair.
Development provisioning permits online installation of the locked dependencies;
the worker's later execution and model loading remain offline.

The app-owned qualification environment is provisioned explicitly into a fresh,
isolated app-data directory. Copy the managed CPython **3.12.13** distribution
into that directory's `runtime/python/` tree, then use `uv sync --locked` with
the inference extra and `--no-editable` to build and install the current worker
and locked inference dependency graph at
the environment's final absolute path. Record every provisioned identity before
publishing a development `current-runtime.json` pointer. No existing user runtime,
model installation, Project or source environment may be replaced.

This is development provisioning and qualification, not release installation.
It does not supply signed release artifacts, establish release trust, prove
offline wheelhouse delivery on a clean machine, test repair/rollback, or define
a supported driver/VRAM fleet. A locally assembled environment with successful
inference must not be reported as a ready release installer.

## Read-only starting evidence

Research inspected clean commit
`dba59a52b14f4dadbc0393e1a34976595116a746`, not a packaged release.

| Observation                     | Status and boundary                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal app-data root            | **Confirmed:** `resolveAppPaths()` resolves this session to `/home/user/.local/share/imagegen-studio`. Its `runtime/` directory exists; `current-runtime.json` is absent and `runtime/environments/` has no entries. This does not prove absence in an independently chosen test app-data root.                                                                                         |
| Current runtime install/repair  | **Confirmed:** `RuntimeManager.install()` and `repair()` return `RUNTIME_INSTALL_UNAVAILABLE`. Renderer/preload/IPC expose the actions, but do not implement their lifecycle.                                                                                                                                                                                                             |
| Development interpreter         | **Confirmed by filesystem inspection:** `worker-python/.python-version` is `3.12.13`; development `.venv/bin/python` resolves into the user's uv-managed Python tree, outside ImageGen Studio app data. `pyvenv.cfg` excludes system site packages and records uv `0.11.11`. This environment is not an app-owned installed runtime.                                                      |
| Dependency graph                | **Confirmed:** `pyproject.toml` and `uv.lock` pin an optional inference extra. The lock records the project itself as editable; a release or this qualification must explicitly build/install a non-editable wheel. The distribution version is `0.1.0`, distinct from inference protocol worker version `0.11.0`; record both instead of inferring wheel identity from the handshake.    |
| Installed runtime qualification | **Confirmed:** Main checks a canonical app-owned pointer, interpreter location and offline SDXL config; launches a real qualified inference child and waits for confirmed exit. Its fingerprint covers interpreter stat identity and config contents, not a signed manifest or the complete installed package bytes.                                                                      |
| Worker startup                  | **Confirmed:** the current worker checks Python 3.12/Linux, finite pinned ML distribution versions, required native imports, complete content-pinned SDXL configuration and bundled Anima tokenizer/license bytes, then performs a small CUDA allocation/synchronization. Anima capabilities additionally require native CUDA BF16. Startup is not a trained generation or capacity test. |
| Previous trained evidence       | **Confirmed in prior recorded evidence:** [worker entrypoint qualification](./phase-2c-anima-worker-entrypoint-research.md) exercised actual trained NVIDIA pixels at 256×256 through JSONL and checked wheel contents. It did not provision or activate an ImageGen Studio runtime or traverse the actual Project Generate UI.                                                           |
| Current Save derivatives wiring | **Confirmed:** `src/main/index.ts` chooses `developmentImageWorkerLocation` for preview/import derivatives. Without that development worker, Save preserves the Project using the documented placeholder fallback. The installed inference runtime is not presently the general preview/import worker owner.                                                                              |

Relevant implementation owners are `src/main/runtime/index.ts`,
`src/main/projects/generation-worker-client.ts`,
`src/main/projects/worker-client.ts`,
`src/main/projects/project-target-inspection-owner.ts`,
`src/main/projects/generation-action-controller.ts`,
`src/main/projects/generation-dispatch-coordinator.ts`,
`src/main/projects/generation-queue.ts`,
`src/main/projects/generation-orchestrator.ts`,
`src/main/models/model-service.ts`, `src/main/projects/generation-staging.ts`,
`src/main/projects/project-generation-acceptance.ts` and
`src/main/projects/igs-package.ts`. Worker ownership starts at
`worker-python/src/imagegen_worker/inference_main.py`.

## Provisioning and proof boundaries

The [runtime contract](../specs/07-python-runtime-management.md) and
[packaging spike](./phase-2a-runtime-packaging-spike.md) require app-managed
CPython, exact dependency installation, verification before execution, staged
activation and preservation of the previous known-good environment. The
planned harness exercises a narrower development environment and must say so.

1. Use a fresh opt-in root, distinct from normal user app data. Allocate the
   environment at its final versioned path. Do not build a normal venv under
   one prefix and rename it afterward.
2. Copy the trusted existing managed CPython distribution, preserving an
   app-owned final executable. Verify its resolved executable, `sys.base_prefix`,
   stdlib and venv paths; a pointer or wrapper that still runs the external
   development interpreter is insufficient.
3. Build the worker from the recorded checkout. Verify installed worker source/assets
   against that checkout, including tokenizer compressed/decoded identities,
   ICC profile and vendor licenses/notices. Record captured source-file,
   `pyproject.toml` and lock SHA-256 values and compare the installed worker payload
   byte for byte. The internally built wheel ZIP is not independently hashed by
   this provisioner; do not claim a release artifact identity from those checks.
4. Install the pinned inference graph and non-editable worker into that final
   environment. Record installed distributions and paths. Neither ambient
   `PYTHONPATH`, a source checkout import, user site packages nor an editable
   worker may substitute for installed worker bytes. Missing cached dependencies
   may be downloaded by this explicit development provisioner. Failed resolution
   or installation must not fall back to the source venv. This does not prove
   delivery from an offline release wheelhouse.
5. Provide the existing complete verified offline SDXL config under
   `resources/sdxl-config/`. It is a runtime resource, not checkpoint weights.
   Anima's Qwen3 encoder and VAE remain model-library dependencies.
6. Publish only the isolated development pointer after these preconditions.
   Exercise `RuntimeManager` and actual worker startup. Record exact interpreter,
   distribution, worker protocol, capabilities, CUDA build, GPU/driver and resource
   identities. Enforce offline execution and inspect unexpected network use.
7. Seed only declared test preconditions in the isolated managed model catalog:
   exact trained checkpoint bytes, compatible trained LoRA where selected,
   correct model families and prediction metadata, and actual pinned Anima
   companion links. Real ModelService qualification must run. Catalog setup is
   not evidence for a CivitAI download or Model Manager installation flow.
8. Enter through actual Project UI and retain request/queue/candidate/document
   correlation. Do not replace Main qualification, request construction,
   transport, generated pixels, staging publication, acceptance or package
   writer with a peer that manufactures their result.

The installed inference child must have a process/module identity inside the
qualification environment. A successful command run with `worker-python/.venv`
is checkout evidence, even if it produces trained pixels. A built wheel inspected
as a ZIP is package-content evidence, even if its assets match. A manually
provisioned app-owned environment with real startup and inference is installed
development-runtime evidence. None of these proves the signed release lifecycle.

For Save/reopen, verify accepted pixels and native provenance through the real
package loader. Record preview status separately: a rendered preview from the
development derivatives worker does not establish installed-preview ownership,
and a valid `unavailable` placeholder is not a rendered-preview success. The
placeholder fallback must preserve layers and provenance and must remain usable
when inference is unavailable.

## Necessary installed CPU worker routing

**Confirmed source defect in the starting checkout:** outside explicit
development/test opt-in, Main selects no image worker for
`ProjectTargetInspectionOwner`. A healthy installed inference runtime therefore
cannot inspect an opaque target for the ordinary Project UI; the UI cannot expose
the corresponding image-to-image denoising control. Preview/import ownership has
the same development-only selection. Qualifying the trained image-to-image UI
path by enabling that checkout worker would conceal this production gap.

The authorized fix is high risk because it changes executable/path selection,
worker startup ownership and a dependency of Save/target inspection. The
`RuntimeManager.resolveInstalledProjectWorker(scratch)` provider supplies only
an installed `ProjectWorkerLocation` plus a fresh offline CPU environment. It
reads the bounded, non-symlink active pointer and validates a canonical app-owned
interpreter, runtime, cache and scratch directory. It never looks up Python in
`PATH`, uses the development venv as an installed runtime, probes CUDA or requires
an intact SDXL inference configuration. CPU work sets `CUDA_VISIBLE_DEVICES` to
the empty string and omits ambient process variables. Save/import/target
composition therefore depend on the derivatives worker's own finite handshake,
not on a successful GPU readiness probe.

The provider is advisory, not a lifecycle lease. The existing Main image-worker
clients and `ProjectTargetInspectionOwner` own startup cancellation, request
settlement and confirmed physical exit. They must recheck their own closing state
and pass an abort signal before starting a returned location; runtime shutdown
can begin after the provider returns. The `ProjectWorkerClient` also validates
the executable and canonical directories again at its actual spawn boundary.
No new long-lived worker or GPU transport owner is introduced.

Resolution fails before publication if shutdown has started, the pointer changes
while its paths are inspected, a qualification/preparation lease is still
starting, or a previous worker/startup exit remains unconfirmed. A running
same-runtime inference lease may coexist with an independently owned CPU
derivatives client; the CPU location does not borrow its transport or readiness.
Broken/missing ML configuration must not prevent this CPU path. A missing or
unsafe installed interpreter returns no location; existing placeholder Save
behavior remains the fallback when derivatives are unavailable.

Focused evidence must cross the real resolver/filesystem boundary: app-owned
pointer success without any inference start, absent runtime, external Python and
pointer symlink refusal, scratch/cache/runtime aliases, malformed/missing paths,
shutdown interleaving, live inference coexistence and failed-start/unconfirmed-exit
refusal. Controlled JSONL peers may induce finite lifecycle failures; they do not
prove trained inference or an installed Pillow implementation. Isolated semantic
mutations must exercise these path, CPU environment and late-resolution fences.

## Planned behavior checks

At minimum, execute one trained UI job in each family/mode, retaining exact
checkpoint and effective adapter identities, source target hashes, concrete
prompts, requested policy and actual seed. Use declared finite image sizes and
step counts, then report them; do not infer all sizes from a small-image success.

Additional representative controls should address the live seams that mocks
could not prove: selected trained LoRA influences pixels and subsequent neutral
generation restores the baseline; Anima weight `1` matches plain text at the
same seed and non-neutral weighting changes conditioning/output; opaque source
pixels reach img2img; native method and actual progress count agree; a current
draft edit does not alter an admitted frozen job; completed actual seed survives
reopen and `Reuse` resolves it for the same local Project/document.

Before explicit Add, worker completion must leave the `.igs` unchanged. After
Add, retain grouped Undo/Redo and verify exact accepted configuration after
explicit Save/reopen. A read-only comparison uses the recorded family and exact
resource identities. Legacy Illustrious absence remains unknown, rather than
being filled from current defaults. Regional provenance, Presets/result-to-preset,
inpaint/outpaint and full regional inference remain outside this checkpoint.

Actual first-use loading, inference and cancellation times are **Unknown** until
measured. A trained job may reveal throughput, memory or qualification defects
that reduced CPU fixtures and small prior GPU probes could not expose. Preserve
that outcome as evidence instead of raising limits or weakening qualification
to make the run pass.

## Parameter registry

These are current defensive/contract values, not measured hardware capacity.
The checkpoint does not change them.

| Parameter and source                               | Value                                                                                                                                  | Required observation/refusal                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `.python-version`                                  | 3.12.13                                                                                                                                | Verify copied and executing interpreter; wrong/external interpreter fails the qualification precondition.                            |
| Inference worker version and family advertisements | 0.11.0; Anima requires all five native capabilities plus BF16                                                                          | Record real ready; do not infer Anima support from generic runtime Ready.                                                            |
| CUDA/dependency versions                           | Pinned graph from `uv.lock`; worker finite dependency gate                                                                             | Record installed graph/CUDA build and native imports. This is not release manifest trust or exact arbitrary-extra-package rejection. |
| Runtime status qualification cache                 | 60,000 ms                                                                                                                              | Record pointer and qualification fingerprint. Cached status must not substitute for the dispatch live checks.                        |
| Runtime config fingerprint                         | At most 32 files / 8 MiB                                                                                                               | Complete pinned config verification remains required; a changed file or unsafe tree refuses startup.                                 |
| Runtime pointer read                               | 16 KiB, strict app-owned executable path                                                                                               | Missing/invalid pointer yields unavailable/not installed; no source/System Python fallback.                                          |
| Worker startup/request deadlines                   | 120,000 ms / 30 minutes                                                                                                                | Record elapsed stages and timeout outcome; keep output unpublished on failure.                                                       |
| Worker shutdown escalation wait                    | 2 seconds per bounded wait                                                                                                             | Main must confirm exit before another generation child owns CUDA; unconfirmed exit retains its fence.                                |
| JSONL command/message                              | 64 KiB per line                                                                                                                        | Exact serialized request must pass before enqueue/send; oversize refuses before inference.                                           |
| Single admitted batch                              | 32 jobs                                                                                                                                | Complete dynamic expansion and seed allocation remain frozen and atomic; a larger click is not a runtime capacity benchmark.         |
| Native sampling                                    | Six finite methods; authored Steps ≤200, Heun evaluations ≤399                                                                         | Compare actual progress to the frozen native plan, not authored Steps alone.                                                         |
| Generation geometry                                | Sides ≤2048, ≤4,000,000 pixels; native minimum 64 and dimensions divisible by 8                                                        | Record actual tested sizes. Bounds do not establish that this GPU runs their maximum.                                                |
| Captured target/output PNG                         | 32 MiB ceiling                                                                                                                         | Verify actual bytes/hash/ICC; no candidate on changed/oversize/non-finite output.                                                    |
| Frozen queue/staging payload                       | 128 KiB per item                                                                                                                       | Verify production serialized strings and resource identity; no unchecked opaque payload.                                             |
| Staging session                                    | 64 candidates / 8 MiB JSON manifest                                                                                                    | Retain existing capacity preflight and recovery; measured per-item sizes are separate from GPU performance.                          |
| `.igs` metadata                                    | 16 MiB `project.json`, 4 MiB manifest, existing archive ceilings                                                                       | Real Save/loader and projected Add preflight retain ceilings and source files on refusal.                                            |
| Available disk/host RAM/VRAM, GPU/driver/ABI floor | **Observed:** RTX 4080, 16,376 MiB VRAM, driver 610.57.04; 31.18 GiB host RAM, 512 MiB swap; 49.78 GiB free artifact disk at 20:56 UTC | Capture before execution and report peak/sampling method. No universal minimum or release fleet claim from this host.                |

## Failure and recovery matrix

| Trigger/mechanism                                                            | Observable refusal or recovery invariant                                                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing cached interpreter/package/config before provisioning                | Stop before pointer publication; normal user app data and source environment remain unchanged.                                                                                      |
| Copied Python or installed worker resolves outside the isolated runtime      | Fail identity precondition; do not report installed-runtime evidence.                                                                                                               |
| Editable import, changed wheel/asset/config, incompatible package versions   | Stop before trained job. Preserve artifact identities and diagnostics; never use the source checkout as a silent replacement.                                                       |
| No CUDA, incompatible driver or unsupported BF16                             | Runtime fails startup, or withholds Anima while qualified Illustrious remains distinct. No CPU/FP16 Anima fallback.                                                                 |
| Wrong checkpoint family/type or missing/changed pinned companion/active LoRA | Real Main qualification refuses before queue publication; no replacement Default/model bytes are selected.                                                                          |
| Target composition changes before admission                                  | Captured target/document identity checks refuse; current Project and `.igs` remain intact.                                                                                          |
| GPU OOM, non-finite tensors, model-load or inference error                   | Correlated failed job; no successful receipt/candidate/accepted provenance and no automatic Project mutation. Record real resource conditions.                                      |
| Cancel during load or denoising, timeout, late worker output                 | Main owns termination and waits for confirmed exit; canceled job cannot become a candidate. Preserve earlier completed results and actual seed.                                     |
| Child exit cannot be confirmed                                               | Keep runtime lease/fence and block another CUDA child; explicit exit confirmation is required for recovery.                                                                         |
| Failure after private PNG creation but before staging validation/publication | Own scratch cleanup follows existing processor rules; no unverified result enters local recovery or `.igs`.                                                                         |
| Crash around durable completion                                              | Existing receipt/staging reconciliation restores only verified completed candidates and document-scoped actual seed; pending/running do not silently resume.                        |
| Interrupted Add or corrupt second selected candidate                         | All selected preflight/journal/shadow rules remain; no partial Add or premature sibling/session cleanup. Restart reconciles the recorded handoff exactly once.                      |
| Preview worker unavailable, Save failure or index failure                    | Placeholder Save retains content when allowed; failed package replacement preserves the previous file. Derived index status must not be presented as proof that the file was saved. |

## Evidence and review plan

Follow [Research protocol](./research-protocol.md) and
[Review protocol](./review-protocol.md). The qualification report must name the
checked revision/dirty files, build identities, exact interpreter/import paths,
runtime pointer/root, installed graph, GPU/driver/CUDA, model hashes/sizes,
actual sizes/steps/methods, observed elapsed times and all controlled seams.

Keep actual UI actions, Main/worker logs and request→queue→candidate→accepted
layer correlation. Check pixels/PNG/ICC, actual seed/native plan and portable
metadata after reopen. Report run/error/skip counts and current artifacts;
previous small GPU evidence must not stand in for a missing current run.
Unexpected network activity, an external interpreter import or a mocked
qualification invalidates the corresponding claim even if the UI finishes.

The harness itself needs meaningful control/failure checks and isolated executed
semantic mutations where it introduces validation. Existing production checks
still apply after any implementation changes. No additional product approval
gate is required between research and the already authorized implementation.

## Current outcome

**Confirmed installed development runtime and all four trained public UI paths.**
The opt-in provisioner completed on 2026-10-05 from `19:45:15.457Z` to
`19:52:37.089Z`; its
[provision report](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/provision-report.json)
records `activated-qualified` and confirmed worker exit for
`qualified-linux-nvidia-20261005` in the isolated artifact app-data root.
CPython `3.12.13`, its base prefix, the environment prefix and non-editable
`imagegen_worker` package all reside under that root. The actual ready message
has protocol `1`, worker `0.11.0` and the qualified Illustrious/Anima capabilities.
That report establishes installed development-runtime startup. The separate
final native run below establishes trained model inference and its UI/persistence
path; neither report establishes a release installer.

That provisioning run used the captured inputs before removal of the temporary
development `HOME` redirect in the command environment. Its report records the
same copied Python input and built/installed worker payload; final CLI regression
checks and semantic mutations qualify the final source separately. Signed
artifacts, release readiness and completed public promises are not claimed.

### Final trained native run

The normal final command was
`pnpm exec tsx scripts/qualify-installed-generation.mjs --fixture /home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/fixture-qualified-v5.json --resume`.
Its fresh
[native report](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/native-qualified-v5/report.json)
is **passed**, with **9 checks, 4 trained generations, zero renderer page errors**
and actual Electron exit **0** at `2026-10-05T21:40:40.876Z`.
`--resume` reuses only the exact isolated model catalog; it does not reuse an
earlier report or turn a partial run into success. The built production Main
SHA-256 is `7c155e8ce7fcd6f6550490e802358255ef5c5defee43e9bb3aae67cd77193708`;
the final harness SHA-256 is
`65b7136fca01d67511cb9e16f9c22384a178a974e9826c1926325ed165eb4a45`.

| Family / mode          | Executed sampling                                                         | Full case elapsed | Encoded output bytes | Outcome                                                        |
| ---------------------- | ------------------------------------------------------------------------- | ----------------- | -------------------- | -------------------------------------------------------------- |
| Illustrious txt2img    | 1024×1024, 3 authored steps, Euler a / Normal, CFG 4, fixed seed 0        | 83.182 s          | 1,543,062            | UI Generate → staging → explicit Add → rendered Save/reopen    |
| Illustrious img2img    | Same size/settings, strength 0.5, Reuse → actual seed 0; 2 progress steps | 88.271 s          | 1,432,256            | Opaque accepted source reaches inference; rendered Save/reopen |
| Original Anima txt2img | 1024×1024, native Euler, 3 steps, CFG 4, fixed seed 0                     | 77.402 s          | 576,119              | Exact Qwen3/VAE bundle; rendered Save/reopen                   |
| Original Anima img2img | Same size/method, strength 0.5, Reuse → actual seed 0; exact native plan  | 86.597 s          | 691,560              | Opaque accepted source reaches inference; rendered Save/reopen |

Elapsed time starts before waiting for the Generate button to be ready and ends
after acceptance, Save, reopen and the screenshot. It is a full qualification-case
observation, **not denoising throughput or isolated model-load latency**. There
is one actual job per click. Both families use their declared trained LoRA at
signed weight `-0.5`; Anima uses `(red:1.3)` in the positive prompt and
`(blurry:0.7)` in the negative prompt. Raw signs, configured resources, actual
seed and family-specific sampling survive in immutable portable provenance.

The actual built renderer/preload/Main, model qualification, frozen SQLite queue,
installed non-editable worker, trained CUDA models, candidate receipts, PNG
staging, explicit UI Add and `.igs` loader/writer remain in the path. The
checkpoint copies declared existing weights into a managed catalog as test
preconditions. It does not prove CivitAI installation or infer Illustrious
prediction type: the fixture explicitly declares epsilon. Exact file sizes/hashes,
local model/version IDs, queue/candidate correlation, output/target/ICC identities,
full RGBA hashes, native plans and progress are recorded in the report.

For every job, a positive-prompt edit **after admission** leaves the frozen job
and accepted configuration intact. Completed staging does not change the saved
`.igs` before explicit Add/Save. Healthy installed CPU composition produces
rendered merged previews whose decoded pixels equal the accepted output. Existing
ordered layer properties, encoded assets and pixel hashes remain exact after
adding another result. Img2img's opaque target has the previous accepted output's
full decoded hash. Reuse replaces a deliberately different manual seed `123` with
the document's actual seed `0`, which remains in the saved snapshot and after
reopen.

The same final command also passed three neighboring production controls:

- With the active-runtime pointer temporarily absent, actual UI Save preserves
  edited Project data and every accepted asset/provenance record, and writes the
  exact bundled placeholder with unavailable preview status. The pointer is
  restored afterward.
- After restored runtime and settled renderer Save, actual Home Rebuild Preview
  renders the expected pixels while preserving `project.json` byte for byte and
  all accepted assets/provenance. It changes only derivative members.
- Actual UI Raster import uses the installed CPU worker, normalizes the declared
  PNG, adds it at the bbox origin on top of the stack and renders its Save.
  Older layers, provenance and the seed cursor survive. Only the OS file chooser
  is controlled to return the declared real PNG; composition/IPC/import/Save are
  production code.

The native window is hidden to avoid competing with the user's desktop focus;
the real Electron renderer, compositor and IPC still execute. T3 preview is
available for HTTP inspection, but cannot supply this native Electron/child-process
boundary. The helper's Main `net.fetch` and renderer Image/canvas observations
respect the existing protocol/CSP rules described in the retained attempts below.

[Native framework facts](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/native-framework-facts.json)
record owned Python `3.12.13`, Torch `2.7.1+cu126` and CUDA build `12.6`.
[Observed child/resource summary](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/native-qualified-v5-resource-summary.json)
filters approximately one-second process/GPU samples to the observed app-owned
worker PIDs: maximum sampled single-child VRAM is **12,780 MiB**, GPU-worker RSS
**8,722,580 KiB**, and CPU-worker RSS **47,628 KiB**. Observed executables/import
prefixes are app-owned, execution uses `-I`, HF offline flags are set, ambient
Python paths are absent, and observed CPU children hide CUDA. These are sampled
observations on this RTX 4080, not exact allocator peaks, a complete process census,
a universal VRAM minimum or a release fleet qualification. This final run has no
exhaustive network syscall trace; it does not claim zero network activity.

The planned neutral-LoRA restoration and weight-1/plain-text numerical ablations
are **not executed at 1024×1024 in this run**. Prior worker-entrypoint numerical
evidence remains separately scoped to its recorded size. This run also does not
test cancellation latency, crash recovery, all native methods/options, inpainting,
outpainting, regional inference, image quality, maximum geometry, signed release
delivery, Install/Repair or upgrade/rollback. Controlled owner tests and native
smokes establish their stated boundaries separately; four trained cases do not
close those remaining Phase 2C/3 items or PP-004/005/007/008.

### Installed CPU provider self-review

The current dirty checkout implements the provider in `src/main/runtime/index.ts`.
The focused command
`pnpm exec tsx --test --test-name-pattern='installed project worker' src/main/runtime/index.test.mjs`
passed **17/17** cases with no failed/skipped cases. The actual pointer/filesystem
boundary and controlled JSONL failed-start/runtime-lease peers remain real; no
trained GPU job or installed derivatives invocation is claimed by these tests.
Whole `pnpm run typecheck` and owned-file ESLint passed.

[CPU routing mutation report](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/cpu-routing/final-source/mutation-report.json)
records **9/9** semantic mutants killed by behavioral `AssertionError`, with
17/17 baseline and restored runs and unchanged live runtime source hash. The
mutants cover accidental ML-config dependence, external interpreter containment,
scratch escape/aliases, missing CUDA hiding, publication after shutdown, globally
unconfirmed CPU startup, following a pointer symlink, cache aliases and changed
active-runtime identity. They execute only in a copied source workspace. The
retained pilot report identifies an initial wrong mutation anchor that changed
config-file opening instead of active-pointer opening; it is not counted as a
successful pointer-fence test. Main routing and actual installed UI evidence are
separate qualification boundaries.

### Established image-worker exit fence

Source-aware review reproduced a second ownership defect: an established CPU
child whose `close()` could not confirm physical exit was retained only by the
Main image owner. Runtime readiness and a subsequent CPU/CUDA spawn did not
observe that fence. The original runtime regression returned an installed CPU
location despite the live unconfirmed child; the original GPU-spawn regression
recorded one forbidden child instead of zero.

`ProjectWorkerClient` now retains failed starts and established failed closes in
one physical-exit registry. Runtime resolution/admission/readiness and the actual
CPU/GPU spawn boundaries check it after asynchronous path inspection. Observed
OS exit or explicit successful retry clears the registry. A completed Save/import
result remains successful; another placeholder Save stays within the Main owner
lease and launches no child. Shutdown retries the retained child before storage
closes. Legacy failed-start query/retry names are aliases to the complete fence.

[Global exit review and evidence](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/global-image-exit/research-and-review.md)
records 121 focused passing cases and five executed behavioral mutation kills,
with restored controls and unchanged production hashes. Controlled protocol
peers induce close/path races; they do not prove trained inference. Peer review
read the source and those actual failure logs; it is not a blind review.

### Empty queue must not acquire CUDA

The real installed GPU path revealed a third production defect. After publishing
the last candidate, the action controller called dispatch again to observe idle.
Dispatch first qualified and started a fresh GPU worker, then queried the queue.
The diagnostic native run recorded `generationLease.phase === 'qualifying'`,
refusal of the installed CPU provider and `previewWorker === undefined` in Save.
The resulting `.igs` was valid but had an unavailable placeholder even though a
later installed-worker Home rebuild rendered the same accepted pixels.

This explains the observed fallback; late prompt edits, missing Pillow and a
failed compositor were not evidenced. The queue metadata preflight must happen
before GPU reservation. It is advisory: the real frozen-input verification and
SQLite claim CAS remain authoritative, including cancellation between the
preflight and claim. Fenced Projects and an already running row must not appear
as dispatchable work. The existing enqueue barrier, drain wake/detach race and
shutdown barriers survive. The combined focused run passed **321/321** cases.
The [queue mutation report](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/empty-drain-preflight/queue/mutation-report.json)
and [dispatch mutation report](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/empty-dispatch/mutation-report.json)
record **5 + 5** behavioral kills and green restored controls. The actual old
RuntimeManager regression launched two physical protocol peers for an empty
queue; the corrected production path launches zero. Source-aware peer review
found no remaining blocker in enqueue ordering, the claim/CAS boundary, idle
wake/detach or shutdown checks. The trained rerun is a separate boundary below.

### Qualification harness safety

The provisioner and native qualification harness are explicit development tools,
not renderer actions or release installers. Their writes still need observable
containment and evidence preservation. Actual CLI regressions reproduced report
overwrite through a symlink/existing destination, publication after a model
alias, and directory creation outside an artifact root through an aliased
parent. Canonical directory checks now run before directory creation; the report
is exclusively reserved and every checkpoint writes through that owned file
descriptor. Existing evidence is never silently reused as a new result.

[Provisioner final-source mutations](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/provision-mutations/final-format/report.json)
record **4/4** behavioral kills, with six green baseline/restored controls.
[Native CLI path/evidence mutations](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/harness-path-safety/final-source-v5/report.json)
record **4/4** filesystem kills and six green controls. These tests stop before
model copying, Electron or CUDA; they qualify the declared setup/refusal
boundary, not trained inference. Earlier error-text-only pilots and the wrong
pointer mutation anchor are retained but excluded from the successful count.

The Main CPU owner additionally has
[4/4 executed ownership mutations](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/image-owner-mutations/report.json),
with eight green baseline/restored cases. Together with CPU resolution (9),
global confirmed-exit fencing (5), and queue/dispatch (5 + 5), this checkpoint
has **36** executed semantic mutations detected by observable behavior. The
current full `pnpm run app:test` passed **1595/1595**, no failures or skips;
whole typecheck and lint passed. Source identity and final commands are retained
in the artifact evidence manifest after the native run completes.

### Retained native attempts and harness correction

Failed attempts remain separate evidence directories; none is counted as a
successful four-case qualification. The initial CSP/data-fetch and tainted
custom-protocol canvas probes failed in observation code. Later runs surfaced
the production idle-CUDA/placeholder defect described above. Two native page
closure probes did not identify a crash initiator and do not establish OOM;
the retained system observations showed no kernel/cgroup OOM event. Per-click
image count now explicitly sets one for each click because closing/reopening a
tab resets that transient UI value to four.

The first clean `native-qualified` attempt passed Illustrious txt2img through
rendered Save/reopen and completed trained img2img, then correctly stopped at a
bad harness assertion: it compared revision-bound `imageUrl` strings after the
intentional prompt edit. Main reissues these capability URLs for the new document
revision; old URLs intentionally become invalid. The recorded failure showed
unchanged ordered layer IDs, semantic properties and the encoded asset SHA.
The corrected harness captures actual BEFORE bytes/pixels before editing, then
fetches current AFTER capabilities and compares encoded/pixel SHA, status,
dimensions and every non-URL layer property. Import uses the same preservation
check; immutable package assets/provenance are still compared in full.

[Source-aware capability review](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/harness-path-safety/final-source-v3/layer-capability-source-review.md)
confirms the correction changes the observation of temporary URLs, not the
production contract or layer/pixel assertions. All four setup/evidence mutants
were rerun on this final harness SHA and killed again; repeated campaigns are
counted once. The final native proof has a fresh evidence directory and report.

The subsequent `native-qualified-v2` stopped before a second Generate because
its observer attempted renderer Fetch for `igs-layer`, which the unchanged CSP
and protocol privileges intentionally forbid. This was another harness defect,
not evidence that the layer image was broken. The
[read-only real Electron probe](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/layer-access-probe/report.json)
then opened that same saved Project and verified Main `net.fetch` through the
registered handler returned exact package PNG bytes, while renderer anonymous
Image/canvas decoding returned the exact recorded full RGBA hash. No Generate,
Save, import, edit, protocol privilege or CSP change occurred; package SHA stayed
unchanged. The final helper uses these two actual paths and cross-checks their
pixels, leaving the production exposure boundary intact.

`native-qualified-v3` passed both complete Illustrious paths and generated,
accepted and saved Anima txt2img. Its later metadata assertion failed because
the harness had retained the installed encoder/VAE IDs in local setup variables,
but had not attached them to the fixture records read by that assertion.
Both IDs now reference the actual `publishVerifiedInstallation()` result.
Two source-aware passes checked the remaining Anima, portable metadata,
placeholder Save, Home Rebuild and import assertions against actual APIs and
schemas; no further source-level defect was found. This partial run is retained,
not promoted to complete four-case proof. No production assertion or ML behavior
was changed to work around these harness errors.

`native-qualified-v4` completed all four full trained generation/Add/rendered
Save/reopen cases and the missing-runtime placeholder Save. The next Home Rebuild
assertion timed out while the snapshot still showed the Project. Main's dirty
flag had already cleared after durable Save, but renderer `saveProject()` still
awaited Results/Home refresh; `activateDocument()` correctly refused switching
while `pendingProjectAction` was active. The corrected observation waits for the
Save button to become enabled again, then verifies Home `aria-selected=true`
before asking for the Rebuild control. Increasing its timeout or bypassing the
renderer busy guard would not test the intended interaction. This harness-only
correction was first verified on the existing real accepted Project in a
[derived tail-only probe](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/tail-probe-v4/evidence/report.json).
That probe did not generate new trained results; normal final v5 then repeated
the complete four-case command and all derivative controls successfully.

### Final checks and review boundary

| Executed check                             | Actual result                                                     | Evidence boundary                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                       | Exit 0, both prototype and app TypeScript checks                  | Compile/type evidence; no prototype UI change                                                                              |
| `pnpm run lint`                            | Exit 0                                                            | Whole repository lint                                                                                                      |
| `pnpm run app:test`                        | 1595/1595 passed; 0 failed/canceled/skipped                       | Real production classes/files/SQLite and controlled subprocess failure collaborators; no trained ML claim from these tests |
| `pnpm run app:smoke`                       | Exit 0; build and all 10 sequential native invocations passed     | Actual built Electron/IPC/renderer; controlled inference peers are separate from final trained v5                          |
| Final native installed qualification       | Passed: 9 checks / 4 trained jobs; Electron exit 0, 0 page errors | Actual app-owned non-editable runtime, exact local trained weights and CUDA on this host                                   |
| Seven executed semantic-mutation campaigns | 36 unique observable behavioral kills, restored controls green    | Copies only; repeated campaign versions counted once; final CLI source SHA matches v5                                      |

The smoke chain includes desktop, generation results/actions, accepted history,
both Illustrious and Anima comparison invocations, Project VAE, embeddings,
Anima authoring and Anima queue. Its
[actual log](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/final-app-smoke-all.log)
contains all ten completed commands; the successful sequential `&&` chain is
not inferred merely from the presence of script files. The rebuilt Main,
preload, renderer HTML/JS/CSS hashes still equal the five native-v5 bundle hashes.
Final source identities, command logs and mutation reports are indexed in the
[evidence manifest](/home/user/.codex/artifacts/imagegen-studio/installed-runtime-2026-10-05/final-evidence.json).

Source-aware peer review inspected the actual final diff, schemas, native report,
mutation failures/restored controls and build identities. It found no remaining
blocker in canonical resolution, late spawn/exit fences, image-owner shutdown,
placeholder Save, enqueue ordering, metadata preflight, frozen claim/CAS or idle
wake. It was **not a blind audit**. Final CLI/spec review also found no blocker.
The older global-exit campaign's runtime test hash predates additive empty-queue
tests; its production hash is unchanged and the later dispatch campaign covers
the current test source. That historical difference is not hidden as one frozen
test revision.

Two deliberate limits remain: cancellation after the advisory pending check may
still incur runtime qualification before the authoritative claim refuses it;
and a Main image owner's retained failed-close child stays fail-closed until
confirmed shutdown retry/restart, even if observed physical exit already clears
the global registry. Neither permits unconfirmed concurrent workers or discards
a successfully saved document. Release lifecycle and the untested pipeline
areas listed above remain subsequent work.

## Follow-up: installed CFG Rescale (06.10.2026)

[Installed CFG qualification](./phase-2c-installed-cfg-rescale-research.md)
separately connects actual Advanced Options, a noneditable installed trained
worker, matched unset/zero/nonzero txt2img decoded pixels and nonzero opaque
img2img wiring to Add/Save/reopen/comparison. The execution counts and limits
above remain historical evidence from this checkpoint; they are not retroactively
attributed to the new profile. Remaining options and release gates stay open.
