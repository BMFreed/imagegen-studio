# Phase 2C: independent native NoobAI multiple-LoRA qualification

## Scope, risk and expected behavior

Continue from clean `master` at `917011d3178357e8971ae5e4e5fc2307384b4df6`.
[PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации),
PP-008 and the [LoRA contract](../features/project/generate-mode/lora-selector.md)
require exact ordered enabled resources and resource-specific signed weights.
This checkpoint changes qualification tools and evidence, not production behavior.
Its evidence affects a high-risk worker/resource promise; installed mutations
require physical exit and byte-exact restoration before handoff.

The immediate scope is the installed worker's native ordinary LoRA loader on
the existing trained NoobAI epsilon and v-prediction checkpoints. Two distinct
trained adapters must preserve resource-to-adapter-to-weight binding and agree
with independently derived low-rank forward updates. No images, UI jobs,
catalog adoption, model downloads or additional runtime are required here.
Actual multiple-LoRA UI → queue → Add/Save/readback/reopen/comparison is the next
separate gate. Neither this probe nor earlier one-LoRA UI runs prove that gate.

## Confirmed research and boundary map

- `load_generation_loras` reads each exact file, qualifies native targets,
  loads `igs_lora_<index>` and activates ordered signed weights. Existing
  checks verify every native tensor, alpha, rank and effective scale.
- Ordinary PEFT LoRA forwards add each adapter's low-rank update to the base
  output. Permuting complete resource/weight pairs is not expected to create
  a different image. Floating-point accumulation can introduce rounding;
  ordered portable settings still distinguish A/B from B/A.
- Existing actual tiny CPU generation uses two files with identical synthetic
  tensors. It tests addition/replay/zero/unload, but identical source tensors
  cannot distinguish a resource-specific weight swap. Existing service tests
  cover two-row persistence, preparation freezes an enabled subset with a
  disabled missing neighbor, and comparison treats order changes as Changed.
- Project has Add/Enable/Weight/Remove/Link controls and no dedicated reorder
  control. A future genuine UI permutation can use remove/re-add and restore
  the weight; it must not be reported as a drag/reorder feature.
- The canonical worker reports `0.14.0`; its 43 source files, pinned ML runtime
  and physical idle state are checked before execution. Historical directory
  name `worker-012` is not the installed worker version.

Path under test: exact immutable file descriptors → installed
`inference_lora.load_generation_loras` → real pinned Diffusers/PEFT modules →
independent per-target numerical observations → unload/restoration. This is
a native loader entry point, not the application admission/dispatch boundary.

## Source preconditions

Digital Art is the retained ordinary Illustrious adapter:
SHA `c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9`,
114,437,420 bytes, rank16/alpha8, weight−0.5.

Second source is the existing local Lineless AI Painting Style adapter:
SHA `90f9f879ff2e27fcaec5723a2c3e5db53ec5ffbdd4c7df49159c0ccbfe63b1ca`,
171,540,060 bytes, rank24/alpha12, weight+0.75. Its full local SHA and size
match [official CivitAI version metadata](https://civitai.com/api/v1/model-versions/2031703)
(model1795307/version2031703/file1934353, family Illustrious, no trigger words).
Creator: Underdorks; the published model requires attribution.
Header metadata does not itself prove tensor qualification or source identity.
This read-only source use does not qualify CivitAI installation/public delivery.

## Independent oracle and controls

Expected targets must come from ordinary safetensors keys and unambiguous
aliases of real native modules, never from the production qualifier's target
list or conversion output. Expected updates use the exact source up/down,
alpha/rank and declared weight with native linear/conv operations. Check
distinct single-adapter controls, signed A/B and B/A stacks, enabled zero
weights, source ownership and unload restoration.
Enumerate every independently resolved target of both files, including shared
and source-specific targets. Check each source → adapter name → declared weight
mapping; a sample of convenient layers must not be reported as whole-file coverage.

Actual native tensors are checked in their inference dtype. Numerical probes
temporarily promote one module at a time to FP32 and restore its dtype in
`finally`, preserving each parameter's original dtype separately; they do not
promote or duplicate the full pipeline. Inputs and tolerance are fixed before
observation. Capture clean pre-load FP32 outputs and compare after unload;
temporary adapters, scales and hooks must not leak. FP32 layer
algebra does not establish full FP16 denoising, conditioning or image quality.

Semantic mutation plan: silently exchange resource-specific active weights in
the installed loader after its existing validation. The independent numerical
assertion must fail after healthy imports/load; then restore original
inode/mode/mtime/bytes and obtain a fresh GREEN. Mechanical controls also
exercise omitted adapters and wrong identity/order. Import/OOM/setup failures
do not count as causal RED.

## Resource and restoration plan

Reuse one canonical runtime/catalog. Initial allocated artifact root is
21,986,181,120 bytes, shared pool21,893,079,040 bytes and compact evidence
93,097,984 bytes. No managed model or environment copies are planned.
Root owns all heavy execution and cleanup; executions are serial. Native
process groups have MemoryMax12GiB, MemorySwapMax0 and a finite deadline.
These are operational safety limits, not a measured supported model capacity.
CLI refuses unbounded memory/swap before loading ML or checkpoint data.
Mechanical/static checks use separate smaller bounded groups, also serial.
The standalone fixture has a256KiB JSON ceiling and a512MiB ceiling per ordinary
LoRA snapshot. These are probe safety limits, not application adapter limits.

Retain mutation journal/backup until physical process exit and exact restoration.
Record source manifests, commands, actual counts/limits, causal RED/fresh GREEN,
and final inventory. Preserve original model files and the reusable runtime.
No user application data or global caches are cleanup candidates.

## Execution evidence

Evidence directory:
`~/.codex/artifacts/imagegen-studio/runs/noobai-lora-stack-native/20261008-checks/`.
The shared runtime remains
`shared/illustrious-vpred-worker-012-20261007`; sources remain on their existing
managed/original paths. This is implementation self-review with a separate
read-only oracle/contract review, not a blind audit or release qualification.

The [standalone oracle](../../scripts/noobai-lora-stack-oracle.py) accepts JSON on
stdin with `schemaVersion`, `workerRootPath`, a43-entry `workerSourceFiles`
manifest (`byteSize`/SHA), `configDir`, a checkpoint descriptor and two ordered
LoRA descriptors with signed weights. Run it with the installed interpreter
and `-I` inside the bounded serial launcher. `input-eps.json`/`input-v.json`,
`run-bounded.py`, `run-native.py` and their logs record exact reproduction inputs
and commands. CLI refuses unbounded launch before model/ML reads; that refusal
was executed separately. Deadline belongs to the launcher, not the oracle.

`native-eps.json` and `native-v.json` each confirm six actual loader variants:
A-only, B-only, AB, BA, A-zero and B-zero. Both exact sources independently
resolve986 targets (UNet722, CLIP1 72, CLIP2 192), and the union is986. Every
variant checks all986 finite outputs against the independent formula, each
source tensor/rank/alpha/order/weight mapping, and unload graph/base-digest/
pre-load-output/RNG restoration. Thus normal evidence is12 variants/11,832
configured-variant forward checks, rather than12 images or jobs. Additional
clean pre-load/unload baseline calls are not counted as stack variants. AB/BA match within
the declared FP32 probe tolerance (`rtol1e-5`, `atol1e-6`); enabled-zero controls
match the opposite single adapter. Single/omitted/exchanged-weight neighbors
are numerically distinguishable.

Installed EPS mutation `swapped-resource-weights` preserves exact files and
native loading, then exchanges the active weights after the existing worker
validation. Two complete single-adapter variants/1,972 forward observations
passed before AB failed with the literal
`Installed LoRA forward differs from independent low-rank algebra.`
This is a causal numerical RED, not an import, file-guard, deadline or OOM
failure. The child physically exited; the original loader inode/mode/mtime/
bytes and all43 source files were restored, and backup absence was confirmed.
The fresh restored EPS run passed six variants/5,916 configured-variant forward
checks, with the same clean base-state digest as the original EPS run.
`final-evidence.json` independently binds all three successful reports and the
mutant stage log to exact source identities/order/weights, current oracle SHA,
physical exits and restoration. Counts remain12 normal +2 healthy single
variants before causal RED +6 fresh, not20 generated jobs.

Three adjacent TS suites passed128 tests. New oracle mechanical tests and the
existing native LoRA suite passed35 tests (nine new, zero failed/skipped).
They use small random real Diffusers/PEFT modules, not trained sources. The
oracle mutations exercise source omission, source substitution, order and
post-validation weight exchange. A separate real Conv buffer test reproduced
RED when `module.float()` replaced a registered buffer: the probe now restores
original buffer registrations/object aliases as well as parameter dtypes;
the same regression and all35 tests passed GREEN.

An initial mechanical failure was a fixture assumption that the pinned Conv
loader retained FP32 adapters; it actually retained F16. The mixed-dtype control
now explicitly constructs that valid native state. An initial launcher attempt
used an absent `/usr/bin/python`; the corrected launcher uses `/usr/bin/python3`.
Neither setup failure is counted as a semantic mutation. Raw diagnostics remain
separate from successful runs.

Native process groups enforce12GiB RAM, swap0 and1200s deadline; completed normal
logs report rounded12G peaks and zero task swap. A live v-pred sample recorded
about9.39GB anonymous/3.32GB file memory, cgroup reclaim at the cap, and zero
`oom`/`oom_kill` events. Host swap was already in use by other processes; no
claim of zero host swap is made. These observations do not set a supported
inference-memory capacity. Actual native computation here is CPU FP32 module
algebra on half-loaded full checkpoints; the installed NVIDIA runtime is
qualified, but there are no GPU denoising, prompt/CFG/scheduler/embedding calls.

Final SQLite row digests and managed-file listing are unchanged: five resources,
nine versions,153 historical queue rows and zero new managed files or admissions.
All four native execution records bind oracle SHA
`3833035faea59d8ad58c399ba79e9dd3518a3d117ff57a5330bb598a69c1e4b4`;
final source proof confirms idle Main/runtime users and43 byte-exact original
files, with restored inode/mode/mtime and no rollback backup.

Final checks:128 adjacent TS tests;35 Python tests (nine new), zero failed/
skipped; `ruff check`/format; strict `basedpyright --project
worker-python/pyproject.toml` with zero errors; `pnpm run lint`; Prettier for
the four changed docs;677 local file links and four unchanged promise matrix
statuses. Production TS/Vue and the installed payload are unchanged; this
checkpoint does not claim an app build, UI run or full Python/application suite.

Cleanup snapshot: root21,986,623,488 allocated bytes, shared21,893,079,040 and
compact93,540,352; run462,848 bytes. No bulky artifact payload was created or
pruned (artifact reclaimed0 bytes). The known generated repo helper bytecode
was removed separately (48,086 bytes). Keep compact baseline/RED/fresh evidence
and the single reusable runtime/catalog for the next gate; all mutation
protection is released only after the recorded restoration/physical exit.

The next gate remains actual multiple-LoRA UI → frozen queue →
Add/Save/readback/reopen/comparison, then trained Anima worker0.14 and dynamic
batches. PP-004/005/007/008 remain «Пока не обещать». This checkpoint does not
qualify arbitrary adapter formats/targets, full FP16 inference, model quality,
Invoke parity, public installation or release.
