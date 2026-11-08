# Global Anima LoRA with Regional Guidance

Base: `1fc5e16e6423598a573764debed59b6628b8faaa`. High risk: exact resource ownership,
shared native adapter state, RNG, frozen replay and accepted provenance. Extend
existing Current Canvas TXT/opaque IMG/mixed-alpha OUT; no new numerical loop,
model resolver, worker command, wire/queue schema or migration.

## Invoke source and reused owners

Consulted clean InvokeAI `b0ac163b139c432aff4c51078c31c074bf292f72`:
`frontend/webv2/src/features/generation/core/graph.ts`,
`.../canvas/addRegionalGuidance.ts`,
`app/invocations/anima/anima_lora_loader.py`,
`app/invocations/text_encoder/anima_text_encoder.py`,
`app/invocations/anima/anima_denoise.py` and
`backend/patches/layer_patcher.py`.
Its graph routes the same global LoRA stack into global/regional encoding and
transformer denoising; native patches precede those consumers and unwind in finally.
Reuse Studio's already qualified ordinary Anima exact resolver/frozen fields and
`scoped_anima_generation_loras`, preserving the native PEFT owner. No independent
LoRA applier, merged-weight implementation or secondary inference loop is added.

## Finite contract

The additive `anima-regional-lora-v1` capability on worker 0.14 is required for every
enabled global stack, including weight 0. Ordinary `anima-lora` or historical
regional support alone grants no combination permission. Empty/disabled-only
stacks retain old peers. Main/advisory/selected frozen Retry/actual dispatch share
that check; queue details retain existing requiresRegionalLora metadata.

Reuse exact ordered ordinary Linear LoRA resources, finite signed weights,
resource re-verification and complete configured stack provenance. Enabled zero
still verifies files/tensors; disabled missing refs stay inert and recorded.
Current draft edits and library Default cannot substitute frozen resources.
LoRA paths must remain outside staging and distinct from target/output/base models
and OUT infill. Existing resource/file/target budgets remain; no new RSS/VRAM fit
claim or arbitrary 512 MiB copy ceiling is introduced.

All existing three-region, 64–512/8, 1–200-step, CFG 1–30, six-method and 32-job/data-dependent
bounds remain. Exact-empty effective regional negatives, Auto VAE and zero-rescale
restrictions remain. No regional LoRA selector, TI/Anima references/spatial negatives,
Smart or quality/public-readiness extension follows.

The explicit `invoke-anima-global-lora-v1` profile preserves default private no-LoRA
refusals. Original unadapted native graph/profile/model reservation precede patches.
A private attention installation seam uses only those internally captured attentions;
standalone/public scope still refuses preloaded adapters and unsupported hooks/classes.
Ordinary execution applies the stack to global positive/negative, regional extras,
conditioner and transformer before original native prediction/sampling/VAE/publication.
Participating regional LoRA calls share one marker in the existing reservation,
including disjoint model sets and enabled zero, to prevent overlapping fork_rng
save/restores. Unrelated ordinary/external global RNG writers remain outside this
finite cooperative profile. No-LoRA callers retain their original behavior.

## Observed defects and corrections

Real new native tests first exposed inherited ordinary cleanup leaving an instance
_hf_peft_config_loaded and Qwen _weight_conversions after unloading. Restore exact
attribute presence and original objects for those and peft_config; an originally
empty adapter map is returned empty under the same identity. Preserve native unload,
parameters/storage/gradient flags and caller RNG. Retained Transformers PEFT/core
loading sources explain the observed assignments. No speculative model prewarming
or borrowed-state repair hides the defect; strict pre-operation preservation tests
remain, with added absent/present metadata cases.

Source review identified disjoint participating calls overlapping native RNG forks;
the existing reservation marker and actual held-loader/refusal/fresh-call regression
close that boundary. R2 source-only review is CLEAN within its cooperative scope,
separate from ROOT execution and release. R3 changes only the old exact-ready test's
expected capability tail 10→11 and includes the explicit new capability; assertions
are retained.

A new browser fixture initially tried structuredClone on a reactive catalog proxy.
Unwrap via Vue toRaw before cloning; production and assertions stay unchanged.
The broad Python neighbor run reached 418 passing cases before the old exact-ready
capability-tail assertion failed. It is updated explicitly; successful prefixes and
supplemental reruns must be counted without duplicates, never relabel the old run.

## Installed acceptance plan

Reuse the canonical runtime/catalog and original files; refresh only the noneditable
worker source under existing idle/backup/self-test/physical-exit guards. Register the
existing exact trained Anima LoRA after streamed SHA/header checks through the real
ModelRepository as a fixture precondition. No network install/download/model copy is
qualified. Pinned source/control input and attribution remain retained.

Three serial 512²/Heun20/CFG4/seed123 units compare enabled −0.5 with enabled 0 using
identical effective prompts/masks/native arrays and original target/source bytes.
IMG/OUT strength 0.5. Both stack states retain the same disabled missing control.
The numerical contrast must affect visible RGB, not only hidden OUT channels;
OUT alpha/source protections and independent composite remain exact.

Existing temporary Results require replacement confirmation. Therefore TXT/IMG
accept healthyA, Undo/Redo/Save/reopen, hide only acceptedA, produce zeroB on exact
original target, explicitly discardB, showA/Save/reopen without altering A provenance.
OUT retains A bytes, explicitly Discard-and-Generate for zeroB, discardsB before a
second two-item batch, cancels pending sibling before a native request and running123
on actual progress. After saved current stack/model/text/mask/source edits/restart,
selected frozen Retry reproduces its own healthyA RGBA and differs from zeroB;
explicit Add/history/Save/reopen preserves source and ordinary per-item LoRA provenance.
Plan: eight native requests/seven PNGs, no seed/prompt/weight tuning or unchecked modal bypass.
Each unit keeps 600 seconds, zero swap, 2 GiB launcher + 10 GiB native with observed physical
owners. This is a test envelope, not a capacity/performance promise.

## Executed evidence

ROOT executed the frozen change against the base above; independent source/retained
reviews remain separate from those runtime observations. Commands, exact selectors,
JUnit/TAP, source manifests, native source pins, diagnostics and resources live in
`~/.codex/artifacts/imagegen-studio/runs/anima-regional-lora/20261108-owned-stack/`.

| Boundary | Actual result |
| --- | --- |
| Focused Main/shared/Retry | 160 PASS, included in the broad Main count below |
| Main/shared/renderer/database neighbors | 1,653 PASS; no failed/skipped cases |
| Python native/worker neighbors | 652 distinct passing cases after deduplication |
| New native global-LoRA/regional cases | 40 PASS within that Python union: 39 full-lane cases plus the held-loader concurrency case |
| Full prototype browser suite | 210 PASS; focused corrected suite 23 PASS is a subset |
| Type/build/static checks | Full TS/Vue typecheck, strict Python types, app build, scoped ESLint and Ruff check/format PASS |
| Isolated Main/native mutations | 12 selections: ten GREEN/two semantic RED, then exact restoration of all 1,576 frozen source files |

The Python union preserves the failed broad run as failed: 418 cases passed before
an old ready-capability assertion failed. The corrected capability test plus remaining
worker/sampling/flow/OUT files give 216 PASS; overlap is deduplicated by JUnit identity.
Warnings are retained library notices, not skipped native coverage. The two initial
adapter-metadata failures, initial browser proxy-clone failure and first strict-typing
diagnostics stay excluded. Initial scoped ESLint hit Node's default approximately
1 GiB heap limit, below its 2 GiB cgroup; the explicit 3 GiB heap/4 GiB bounded rerun
is recorded separately. No inference envelope was raised to pass a numerical run.
Whole-repository lint is not claimed; unchanged historical project-service lint
findings are outside this delta.

### Real installed application

One canonical worker0.14 runtime/catalog was refreshed in place through existing
idle/backup/self-test/activation guards. The actual ready frame advertises
`anima-regional-lora-v1`; this is not a mocked runtime permission. The refresh status
is `activated-qualified`, with confirmed worker exit. The original Anima/Qwen/VAE
and LoRA files were reused without copies, downloads or modified weights. The
138,663,759-byte fixture LoRA has SHA-256
`cd9639b03d4458323e696e3792ff7535ae03f9f70368d6d0dc17fe86fa4f354f`,
Civitai model599757/version3084665/file2964030, creator VelvetS. Exact local catalog
registration is a fixture precondition, not installation/download attestation.

| Mode | Native requests / PNGs | Weight −0.5 versus enabled 0 |
| --- | --- | --- |
| TXT | 2 / 2 | 573,112 changed RGB channels |
| Opaque IMG | 2 / 2 | 543,665 changed RGB channels |
| Mixed-alpha OUT | 4 / 3 | 308,750 changed RGB channels, including 260,554 visible channels; alpha exact |

All contrasts hold the original seed123, text, masks, sampling, compiled arrays and
source target exact. `alphaExact:false` in the RGB-only report branch means not
applicable; alpha equality is explicitly required only for OUT. TXT/IMG accept A,
Undo/Redo/Save/reopen, hide only A for B's original target, discard B, show A and
Save/reopen with A's original complete configured LoRA stack. They do not claim a
same-batch Add1/Discard1 experiment.

OUT explicitly replaces the temporary healthy result before B. Its pending sibling
cancels without a worker request; the running123 job cancels on real progress and
produces no successful completion. After saved draft/resource/model/text/mask/source
edits and process restart, selected frozen Retry reproduces healthy A's exact RGBA,
remains different from B and retains its own stack. Add/Undo/Redo/Save/reopen preserves
the original source and contribution; the independent 640² source-over comparison
remains exact. Total: eight actual requests/seven PNGs, without tuning prompt/seed/
weight. Each installed unit finishes inside the declared envelope; actual process
identities/cgroups, zero swap, memory peaks and physical exits are recorded.

ROOT opened actual renderer screenshots for TXT/IMG accepted-reopened states and
OUT frozen Retry/reopened contribution. No material local clipping/action defect
was observed. This finite screenshot inspection and the executed interaction harness
do not constitute a full accessibility or generated-image quality assessment.

### Discriminating mutations

The Main mutant removes the Anima frozen `requiresRegionalLora` flag after valid
resource capture. The OUT association test fails after real queue publication;
an unchanged concrete-item control stays GREEN. The native mutant omits only the
OUT forwarding of `command.loras`; it completes the real small-native PNG path and
fails exact adapted context/prediction association, while the no-LoRA control stays
GREEN. Restoration returns both selectors GREEN. Raw originals/mutants, logs,
JUnit, bounded resource records and all-source restoration checks are retained.
These mutations do not alter the installed worker or pretend to qualify another
trained checkpoint.

## Retention and limits

Final source/archive manifests, closed before/after catalog backups, three final
IGS packages, mode reports, source credits, original descriptors and the important
RED/control/restoration observations remain retained. Required raw payload bytes
are archived before their owned scratch paths are released. The active canonical
runtime, current refresh report and its ancestry, original files, existing projects
and frozen queue inputs remain protected for the next authorized check. The final
release result records measured bytes, physical exit, reader and incoming-dependency
gates; a retained-data review is not deletion authorization or runtime certification.

The installed evidence covers one exact trained global LoRA and Heun at 512²;
small-native/Main tests cover other admitted methods, signed/zero resources and
failure recovery. It is not an all-LoRA/all-method visual matrix, throughput claim,
quantized/offloaded-model qualification or human visual acceptance. Previous
NOT_QUALIFIED full-scene evidence remains. Regional material stays excluded from
accepted provenance, Compare and result-derived presets; ordinary configured
LoRA provenance remains included. Anima references/TI/spatial negatives, per-region
LoRA, Smart and unsupported input geometry remain refused. PP-001/005/007/008
remain **«Пока не обещать»**.
