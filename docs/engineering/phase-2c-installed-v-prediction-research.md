# Installed Illustrious v-prediction qualification

## Scope and starting evidence

Base `be8927da9d660b94c8da5c99f22b12d9314a1adc`, clean `master`.
Risk: high: managed-model admission, exact prediction overrides, frozen queue/Retry,
immutable accepted provenance and portable Save/readback. Supporting promises:
PP-004/005/008 in [Product Promises](../product-promises.md); contracts:
[managed models](../contracts/managed-model-library.md),
[generation settings](../features/project/generate-mode/generation-settings.md),
[provenance](../features/project/generate-mode/generation-provenance.md).

Confirmed by source: all five Illustrious scheduler branches pass frozen
`prediction_type`; Model Manager owns the exact-file override; Project has no
editable prediction selector. Public Retry preflights current resources before
publishing a new row. Installed trained v-prediction evidence remains a roadmap
gap. No inference defect is assumed.

User decision on 07.10.2026: include CivitAI `NoobAI` derivatives in the supported
Illustrious family. Preserve raw source labels; do not admit arbitrary SDXL/Pony
checkpoints or infer the training objective from architecture/markers. The
ordinary labeled epsilon assumption remains until a user changes the exact-file
type in Model Manager. Add a source-boundary regression and semantic mutation
for the new exact label mapping.

## Owners and observable invariants

CivitAI metadata admission maps the supported source label to our family. Main
verifies file hash/size/structural compatibility and persists the prediction
override by exact file identity. UI selection changes library policy only.
Preparation captures that policy; materialization/dispatch reverify resources;
installed Python uses the frozen policy. Staging does not change the Project,
history or saved package until explicit Add. Accepted configuration preserves
actual policy through Save/readback/reopen even after later library changes.

The trained candidate is local Cyberfalafel v-pred v1.2 by Knightus_Ai:
[model API](https://civitai.com/api/v1/models/1147756), version 2679856, file
2566634, 6,938,040,794 bytes, declared SHA-256
`edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d`.
Full local SHA verification is required before use. Its header contains both
`v_pred` and `ztsnr` markers. These are supporting source facts, not an automatic
scheduler policy. Author lineage/training claims are not reconstructed training
proof. Retain source credit; do not commit or redistribute weights.

## Planned experiment and refusal controls

One fresh isolated catalog: exact checkpoint plus ordinary Illustrious LoRA.
Catalog preparation is a declared local precondition, not live download proof.
Use actual Model Manager UI to author v-prediction from initial assumed epsilon.
Four finite cases at 256×256, three steps, seed 0, Euler A, Embedded FP32,
LoRA −0.5: matched v/epsilon txt2img and matched v/epsilon opaque img2img
strength 0.5 with the same imported genuine PNG. Epsilon on v-trained weights
is explicitly a causal control, not a second trained objective.

For v img2img: actual Cancel; UI change to epsilon; public Retry must refuse
without a new row/candidate/receipt/seed/source-sequence mutation. Restore v in
the UI; Retry must complete with byte-exact original frozen JSON/target. Change
live policy after completion for recorded/current comparison, then explicit
Add, Save, independent readback and reopen. Every pair differs only in recorded
prediction policy. Preserve all existing profile guards; reject unknown catalog
rows/descriptors before copy/worker startup.

Semantic mutation: change the owned installed scheduler selector to force
epsilon, keeping frozen v inputs intact. Both txt cases must finish healthily,
then identical decoded pixels must turn the causal assertion red. Restore exact
installed bytes and verify genuine startup. Refusal tests must fail assertions,
not import or fixture setup. Delegate code/evidence review; root alone executes
heavy runs serially.

## Resource and artifact lifecycle

Previous artifact root was deleted by the user; no reusable runtime remains.
At entry: 77 GiB free disk, 25 GiB available RAM, RTX 4080 with 16 GiB VRAM.
Provision one final-path shared runtime and retain its external report. Copy only
the 17 pinned small SDXL config files from global symlinked cache into owned
regular files. Original models and global caches remain untouched. Separate
compact run evidence from reusable payload; record lifecycle dependencies and
pins before provisioning. Remove owned copy-mode download caches after physical
exit and readiness verification. If transient dependencies exceed 30 GiB,
record an exception and immediate cache disposal checkpoint.

Qualification operational ceiling: 12 GiB RAM, zero swap, 1800-second deadline,
512 MiB Node heap; not a model capacity claim. KDE may move Electron/worker out
of the launcher service. Before Generate/Retry, verify finite limits on the
actual owned native application cgroup and fail closed if they cannot be set.
Record actual scopes, not launcher-only peaks. Lightweight checks use smaller
separate ceilings. Large binary comparisons use equality/hash without diffs.

## Boundaries that remain open

This slice qualifies frozen prediction interpretation and exact-file admission,
not ZTSNR/trailing schedule correctness, the author's full recipe, image quality,
Invoke pixel parity, other installed sampler branches, v-prediction outpaint,
dynamic batches, live model download/repair, arbitrary checkpoints, Anima or
signed release lifecycle. Prediction type and noise schedule are distinct;
existing pinned schedule is unchanged. PP-004/005/008 remain open.

## Results

### Production admission and diagnostic

Exact `NoobAI` now maps to `illustrious` for checkpoint/LoRA/embedding; raw
source metadata remains intact. Standalone VAE retains its separate applicability
whitelist; upscalers remain family-independent. SDXL/Pony, case/substring variants,
unsupported resource types and pickle files remain refused. The
[official NoobAI card](https://huggingface.co/Laxhar/noobai-XL-1.0/raw/main/README.md)
identifies Illustrious as its fine-tuning source. Prediction policy is still a
user-owned exact-file setting, not inferred from that lineage or marker tensors.

Actual `CivitaiClient` and ModelService/coordinator/SQLite/filesystem tests pass
with controlled external API/download responses. NoobAI installation, missing-file
repair and DB reopen preserve source IDs/raw label/default/hash/size and a
v-prediction override. Removing only exact NoobAI admission in an isolated source
copy kills positive preview/repair assertions; ordinary Illustrious and negative
type/family/VAE/upscaler controls remain green. These are source-boundary tests,
not live CivitAI delivery proof.

Qualification exposed a misleading diagnostic: prediction changes said the
checkpoint **path** changed. It now says "The exact checkpoint or its prediction
type changed after preparation." A separate built-Electron preload IPC replay
on the genuine canceled job confirms `GENERATION_INPUT_CHANGED` with that text,
without changes to queue/results/Project/history/package; no new inference
completion. This small copy fix followed the full native GREEN below, and its
updated native boundary was checked separately rather than rerunning all GPU cases.

### Installed trained GREEN and causal RED

Full local checkpoint and LoRA SHA-256/byte sizes match the declared sources.
The ordinary LoRA, used at weight −0.5, is Digital Art Illustrious-XL v0.1, 114,437,420 bytes,
SHA-256 `c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9`.
Its local source identity/compatibility is a declared precondition; this run
does not establish its publication lineage. Only these two managed resources
exist; native catalog preparation uses the real repository directly, not UI
import/network installation. The UI independently authors the actual checkpoint
prediction override and verifies its library acknowledgement.

07.10.2026 GREEN: **four finite completions, five admissions, one canceled
original and one refused Retry**, all with explicit Add/Save/independent
readback/reopen/comparison. Both matched pairs preserve complete normalized
inputs and byte-identical targets while decoded output pixels differ. Common-source
img2img observes two denoising evaluations at strength 0.5. UI library edits and
read-only comparison leave Project/history/package unchanged; accepted policy
remains opposite to the later current library policy. Actual Cancel confirms
inference child exit; refusal leaves rows/source sequence/receipts/seed cursor/
inputs/staging/package unchanged. Successful Retry retains original frozen JSON
and target and consumes its source sequence once. Original sources and exact
two-resource catalog closure are verified at the end.

RED: three installed constructor call sites covering all five scheduler keys
are changed to force epsilon. Both txt2img jobs still finish finite and pass
Add/Save/reopen/comparison with their original v/epsilon records. Normalized
inputs/targets remain identical; decoded pixels become identical, and the
specific causal assertion fails after **two healthy completions**, with zero ML
failures/page errors. This is an assertion kill, not a startup/fixture failure.
Native Electron exits normally; the qualification CLI returns 1 as intended.
All **43 installed worker source files** then match their original hashes;
fresh production `GenerationWorkerClient` startup reports worker 0.12.0 and
confirmed physical child exit. No source weights or repository worker code were
mutated.

### Resource guard, checks and retained evidence

The qualification launcher requires finite ≤12 GiB RAM and zero swap. KDE moves
Main/inference into an application scope while some early native children remain
in the launcher. The guard observes actual `/proc` ancestry/cgroups, validates
the exact user unit's `ControlGroup`, bounds only the owned application scope,
and rechecks kernel limits/launch identity before each admission and during the
running Cancel child. Separate group ceilings are **not** an aggregate 12 GiB
tree ceiling. GREEN observed peaks: native application scope 3,444,662,272 bytes;
launcher group 7,675,879,424 bytes. These are per-group peaks at different times.

Review rejected `RuntimeMaxSec` through `set-property`: it is immutable on an
already active scope ([systemd 259.5 source](https://github.com/systemd/systemd/blob/v259.5/src/core/dbus-scope.c#L192)).
The final guard sets mutable RAM/swap properties and creates a separate 1800s
systemd timer. Its stop action revalidates PID/starttime/cgroup/unit ownership;
physical exit requires observed identities gone and the owned scope empty or
absent, then stops that timer. A real built-Electron probe confirms actual caps,
timer creation, a **manually invoked** owner-aware deadline action and physical
exit of six observed processes; it does not wait out all 1800 seconds. If Main
identity disappears but an orphan survives, the action refuses to guess ownership;
physical-exit failure retains dependencies for manual recovery/disposal review.

Four isolated guard mutants (omitted kernel cap, omitted unit ownership check,
ignored live worker, ignored deadline PID reuse) fail behavioral assertions.
The first live-worker mutant exposed an unmocked timer-stop transport in a test;
that setup failure was discarded, the transport corrected and the genuine
assertion kill verified. Provision launch/path/count mistakes and one navigation
race in the diagnostic replay were also discarded setup failures, not product
or mutation evidence.

Checks: **2073 app/provision regressions + 155 qualification CLI tests + 16
resource-guard tests = 2244 passed**, zero failed/skipped. Final typecheck, lint
and desktop build pass. Changed-file formatting and local documentation links
are checked separately; the evidence manifest records commands/logs and hashes.
No prototype UI changed. Self-review and delegated source/raw-evidence review
are not a blind audit. PP-004/005/008 and phase 2C remain open.

Local evidence root:
`~/.codex/artifacts/imagegen-studio/runs/v-prediction/`:

- `20261007-green/report.json`: four trained cases, numerical pairs, genuine
  Retry, UI authoring/comparison screenshots and process/cgroup closure;
- `20261007-green/retry-diagnostic-proof.json`, `resource-proof.json`: narrow
  corrected IPC diagnostic and actual kernel/deadline action probes;
- `20261007-green/family-mutation/`, `guard-mutations-release/`: controlled
  transport boundaries and meaningful isolated assertion kills;
- `20261007-forced-epsilon/report.json`, `mutation-journal.json`,
  `restored-startup.json`: two finite RED cases, source restoration and fresh
  native worker startup/exit;
- fixture descriptors, compact logs and preserved portable package copies with
  hash manifests are kept separately from the one shared runtime/catalog.

Final runtime/catalog:
`shared/illustrious-vpred-worker-012-20261007/`, provisioned at its final path
with pinned regular-file config inputs and an external `provision-report.json`.
Physical provision exit was confirmed before deleting its owned copy-mode uv
cache: **5,838,942,208 bytes reclaimed**. Original models and global caches were
untouched. Final lifecycle inventory/cleanup is recorded in the run manifests;
the one shared bundle is retained for the next dynamic-batch/actual-seed slice.
Superseded guard mutation copies and idle restoration scratch were pruned after
rechecking physical exit and all 43 source hashes: another 151,552 bytes
reclaimed. Post-pruning inventory records 13,122,084,864 allocated bytes (12.22 GiB), including
5,566,464 bytes (5.31 MiB) of compact evidence. Six saved packages and their
targets have independent byte-verified evidence copies; original raw reports
retain their historical paths. The tiny rollback source/hash manifest is now
compact reproduction evidence, with its mutation hold explicitly released.
Weights and local raw evidence are not committed. The next roadmap slice and
remaining noise-schedule/sampler/outpaint/release limits are distinct.
