# Installed Illustrious embedding qualification

## Scope and starting evidence

Base `b3a5e55066283066019daeaeea04126be210dba3`, clean `master`. Risk: high
because the qualification observes exact managed identities, frozen queue/Retry,
accepted provenance and `.igs` Save/readback. Supporting promises: PP-004/005/008
in [Product Promises](../product-promises.md); supporting behavior:
[embedding literals](../features/project/generate-mode/embeddings-selector.md),
[authoring](./phase-2c-embedding-authoring-research.md) and
[dual-CLIP inference](./phase-2c-embedding-inference-research.md).

Confirmed by current source review: the bounded Illustrious embedding pipeline
is already implemented. Earlier native CUDA probes used trained checkpoint
weights with synthetic embedding tensors. The next roadmap gap is a publicly
sourced trained dual-CLIP embedding through built Electron and the installed
worker, with explicit Add/Save/reopen. No production defect is assumed.

## Owners and observable boundaries

The real prompt editor supplies text and ID-only completion choices. Main
reconciles exact literal sidecars and verifies managed source/hash/size/header.
Preparation captures a detached resource pool; materialization keeps each
concrete prompt's effective positive/negative subset. SQLite owns durable jobs;
Retry and dispatch reverify frozen active files. Installed Python snapshots both
`clip_l` and `clip_g`, assigns private polarity-specific aliases and loads every
vector into the native encoders before Compel conditioning. Private aliases
must never enter Project text or portable provenance.

Completion is temporary staging until explicit Add. Accepted configuration
keeps concrete prompts and exact portable refs; Save and independent loader
readback preserve them despite later draft/library Default changes. Model paths
and operational byte sizes remain outside accepted records. Cancellation must
publish no completion/receipt and must not advance the actual-seed cursor.

## Planned matrix, controls and limits

The exact trained file is **IllustriousPhoto Embedding**, by
**CautionMergeAhead**, version **WAI v15 1152steps**. The author's
[model API](https://civitai.com/api/v1/models/2360940) reports training on 384 SFW
DIV2K photographs with tags/short captions for WAI/StableYogi Illustrious. This
is the author's training claim, not independently reconstructed training
lineage. The [version API](https://civitai.com/api/v1/model-versions/2655289)
declares `Illustrious` and exact file ID 2542976. Published permissions require
credit; author/source credit is retained here and in the local evidence. No
embedding weights are added to the repository or release.

The [exact download](https://civitai.com/api/download/models/2655289?fileId=2542976)
is `illustriousphoto.safetensors`, **49,736 bytes**, SHA-256
`91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36`.
Full bytes match the official API hash, not merely the HTTP range/header.
Actual F16 tensors are `clip_l [12,768]` and `clip_g [12,1280]`; all 24,576
values are finite and nonzero. A locally derived **artificial zero control**
keeps the entire header/layout unchanged and sets both tensor payloads to zero.
Its SHA-256 is
`e4ff5ef4fbd6f88cb44f7ea26ce4523e66a3dde63b342ba7647a46dd08cac106`.
Both sources have the same basename in separate owned directories, preserving
the canonical literal `<illustriousphoto>`; matched comparisons change tensor
identity only. The zero control is not another trained or published model.
These are qualification preconditions, not claims about live product installation,
arbitrary format support or model quality.

Bounded planned geometry is 256×256, three requested steps, fixed seed `0`,
Embedded VAE with explicit FP32, and the previously qualified signed ordinary
LoRA. Eight planned finite cases: plain txt2img; matched positive trained/control;
matched negative trained/control; trained weighted/repeated literals in both
polarities; matched trained/control opaque img2img with those same weighted
prompts. Positive repetition is three literal occurrences (one at weight 1.3),
negative repetition is two (one at 0.7), with one deduplicated ref per polarity.
The common img2img source is this run's genuine plain txt2img PNG, imported
through actual UI/Main/installed CPU worker. Strength is **0.5**, requiring
observable nonzero denoising; strength 0 would not prove conditioning use.
Include
actual Cancel/public frozen Retry after draft and library Default changes,
real Add, Save, reopen and read-only comparison. Positive and negative causal
comparisons must keep other normalized inputs equal.

Reuse only the owned development runtime/catalog. Retain the original six
resources and declared three external VAE versions; append only declared small
embedding files (99,472 bytes total). Final declared catalog: eight resources,
eleven ready versions/files. Reject unknown catalog identities and invalid profile/source
descriptors before any worker/copy. Existing profiles keep their strict guards.
No additional checkpoint/runtime copies. At entry: RTX 4080 16 GiB VRAM,
approximately 20 GiB available RAM and 8.7 GiB free disk; these are observations,
not capacity promises.

Root alone runs heavy work serially with finite deadlines and bounded Node heap.
Native launcher ceiling: `MemoryMax=12G`, `MemorySwapMax=0`, deadline 1800
seconds, Node heap 512 MiB. KDE later proved to move Electron and its workers
into a separate application scope; the launcher limit and its peak therefore
do not describe the complete process tree. See the correction below.
Small tensor probes and checks receive smaller independent ceilings. Binary and
image comparisons use byte equality or short hashes, never large assertion diffs.

## Sensitivity and review

CLI refusal tests execute the actual runner with tiny preflight-only fixtures;
assert unchanged sources/runtime marker and no worker/model copy. A positive
installed run must show actual finite PNG/thumbnail/receipt and matched trained
versus control pixel differences. Execute a semantic mutation in an owned
installed-worker payload that ignores embeddings while retaining ordinary
text conditioning: matched tensor comparisons must turn red after a healthy
plain neighbor. Restore byte-exact payload and confirm genuine worker startup.
Refusal mutations must fail assertions rather than import/startup/fixture setup.

Self-review plus delegated source/evidence review is not a blind audit. Inspect
actual report, SQLite jobs/receipts, saved archives and native screenshots.
Run focused CLI and app regressions, typecheck/lint/build and formatting. Update
supporting docs and promise matrix/body together only after actual evidence.

The slice does not establish Anima embeddings, new authoring/preset behavior,
live CivitAI download/repair, arbitrary embedding layouts, release installer,
all-GPU/maximum geometry, image quality, dynamic multi-job scheduling, complete
conditioning-budget capacity or full MVP readiness. PP-004/005/008 remain open.

## Reachable authoring defect found during qualification

The first native matrix stopped after five finite txt2img completions. An
artifact-only authoring replay reproduced the sixth-case failure without any
Generate or queue changes. After positive weighted/repeated text, focus moved
to negative while the positive editor's pending completion query subsequently
opened another tooltip. Four options were visible (two pairs); the qualification's
global option locator selected the positive editor's entry. Actual original
Main IPC recorded `positive-prompt` selection and successful acknowledgment;
negative received only plain text and stayed unbound. There was no Main error
or later overwrite. This is not evidence of lost Main embedding identities.

CodeMirror's default blur handler closes an existing tooltip, but does not
cancel a pending query when no tooltip exists yet. The previous app blur handler only
emitted history/focus events. The local fix explicitly closes active/pending
completion on editor blur. Preserve text, refs, native selection and history;
both Project polarities and LoRA completion use this shared editor. The native
two-polarity regression failed on the original bundle and passed after the fix, retaining ordinary
same-editor completion and existing Undo/Save/relink neighbors. Qualification
also scopes options to the focused editor's `aria-controls` list and waits
for actual text acknowledgment before explicit browsing. No synthetic selection
IPC or silent retry is permitted.

The first authoring diagnostic used an overly short global timeout and stopped
during exact checkpoint admission before any embedding action; it proves no
embedding defect. The second retains the ordinary admission deadline and a
short selection-only observation deadline, and supplies the DOM/IPC reproduction.

## Execution evidence

The full installed ML matrix and all three semantic sensitivity checks passed;
executed evidence and restoration are recorded below. Artifacts are owned exclusively by this slice at
`~/.codex/artifacts/imagegen-studio/installed-embeddings-2026-10-07/`.
All 43 current installed/source payload hashes match before any experiment.

The native authoring regression was RED on the original bundle: two Ambiguity A
options survived in the two editors during negative selection. The minimal blur
fix is GREEN: **11 native smoke checks**, including actual negative selection
IPC, unchanged positive prompt, Undo/Redo, Save/reopen, Copy/relink and the normal
Generate refusal against the explicitly old controlled worker peer. This smoke
uses catalog-only bytes and a JSONL peer, not trained inference.

After the editor/helper changes, **2,194/2,194** app/CLI regression tests passed
serially with zero failures/skips (175,412 ms; cgroup peak 620.9M, zero swap).
Both prototype/app typechecks and built Electron compilation passed. Full lint
passed at peak 3.2G and zero swap; the earlier constrained 1.5-GiB Node heap
refused locally without a host OOM. The successful retry used a 3-GiB heap and
`MemoryMax=4500M`, not an unbounded run. No prototype UI changed.

The fresh `native-v2/report.json` is **passed**: 19 checkpoints, eight finite
completions from nine admissions and one canceled original; renderer page errors
and ML failures are both zero. Runtime was 12min 21.681s, launcher cgroup peak 1G and
zero launcher swap; parent Electron exited 0. All eight cases used VAE **Embedded/FP32**,
256×256, three requested steps, seed `0` and ordinary LoRA `-0.5`.
Both opaque img2img cases used the exact same saved plain PNG at strength `0.5`
and observed **two** actual denoising evaluations each. This is nonzero
conditioning execution, not a strength-zero reconstruction.

Independent delegated read-only review checked all eight saved archives against
actual SQLite rows/receipts, recomputed PNG byte hashes and decoded RGBA hashes,
and checked captured refs versus the empty current draft. All matched. The
three matched pairs retain identical normalized prompts/numeric inputs and
exact target pixels; only concrete embedding tensor identity differs. Their
output pixels differ. Plain-versus-literal comparisons are explicitly combined
text/binding ablations, not weight-only claims.

Cancel left no receipt/candidate and no seed advancement before Retry. The
actual owned inference child physically exited. After genuine UI Default change
to zero control and removal of both live literals/refs, public Retry preserved
byte-identical frozen context/target and the trained refs. Explicit Add,
independent Save readback/reopen and read-only comparison retained the original
concrete prompts and refs without operational paths/bytes or private aliases.
The original seven resources, nine versions and two dependencies are unchanged;
the final catalog is eight resources and eleven ready files/versions. Actual
source bytes/stat properties and the common imported PNG remain unchanged.

These controls switch both CLIP tensors together; they do not isolate `clip_l`
from `clip_g`, or attention-weight effects from repeat/literal effects. Dynamic
multi-job batches, complete token-budget capacity, cross-polarity different files
for the same token, portable relink into another catalog, mixed-alpha/outpaint
embedding composition, Anima/Preset integration, arbitrary trained formats,
quality and signed release remain unqualified in this slice.

| Matched pair                            | Common normalized input SHA-256                                    | Trained RGBA SHA-256                                               | Zero RGBA SHA-256                                                  |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| positive-txt2img                        | `7fb3e191c71326dc747db61f3433af46b91c9fb66c8ae57b9086dd74ffcfc1c8` | `97edce306e616a0ed3b83706a43fe8d5a3649801fb421fe4800584fdb565b61e` | `de9f2a5f2924b7299ec42212576466d6276f345b43590da057ec1e5346c8fe62` |
| negative-txt2img                        | `48256538952fe9a77a3d2501d0569cc6fa9d567ecb8512c1eff407b93736080e` | `20175969e86501b96f043e2df968e29abcfd050f64509906dc5d5d94837e6e78` | `1bd458598f6ca9cc47172665de17afb3a2c051cb5c96cea94743a4625ac4e37e` |
| weighted-repeated-dual-polarity-img2img | `0cc06445fbe5167239773d9e5407810225764a30555ca88312f54a5ab84199a9` | `502cb50eea9825eb74736203afeba96d473e11c04b60bd441d1abac9610d7e83` | `191e291bd52902208c1fb4f2ccd4c6a3970323e48285b50d91055fda2bc4fbdd` |

## Rejected mutation setup and memory-metric correction

The first installed-loader mutation returned the raw prompt with angle-bracket
literals while skipping tensor loading. The healthy plain case completed, but
`normalize_compel_prompt()` then correctly rejected the unmasked literal before
conditioning. That attempt is an invalid causal mutation setup, **not** a killed
weight-use mutation. Its failed report is retained separately. A tiny genuine
installed syntax probe confirmed raw `<illustriousphoto>` refusal and valid
ordinary `igs_embedding` text; the initial probe's wrong error-module import is
also setup failure, not behavior evidence. The corrected mutation uses existing
`masked_embedding_prompts(command)` with `(None, None)` managers: known literals
become valid ordinary text, both polarities/weights remain syntactically valid,
and selected tensors are ignored. The unchanged native runner must reach the
matched pixel assertion after three finite completions.

During that corrected run, `/proc` showed the actual Electron/worker in KDE's
`app-imagegen\x2dstudio-431713.scope`, outside the launcher service. That scope's
memory/swap limits were initially unlimited. Root applied and read back
`MemoryMax=12G`, `MemorySwapMax=0` on the actual scope after the plain case and
before trained/control completion. The record is
`native-scope-memory-correction.json`. Prior native reports' memory peaks and
zero-swap values are **launcher-only**; the full native-tree peak and effective
full-tree ceiling were not established. The functional matrix remains valid,
but this slice establishes no host/RAM capacity promise. Future heavy native
runs must verify each Main and worker cgroup, bound the actual application scope
before admitting work, and observe both scope and launcher instead of assuming
child inheritance.

## Executed sensitivity and restoration

`mutant-ignore-embeddings-v2/report.json` is the intended causal RED: the actual
installed loader's early return uses valid masked ordinary prompts and no
embedding managers. The unchanged native runner completed **three** finite
plain/trained/control cases, with zero ML failures and zero renderer errors,
then failed its trained/control pixel-difference assertion. Matched normalized
input SHA-256 remains
`7fb3e191c71326dc747db61f3433af46b91c9fb66c8ae57b9086dd74ffcfc1c8` and exact targets
are equal. Both mutant outputs have decoded RGBA SHA-256
`f32ac2d27288010e43591fdd39ff12bf714877475a3412494367834c1b16e98f`.
The qualification CLI returned 1 after 4min 21.921s; Electron exited 0.
Launcher peak 885.6M and zero
launcher swap do not measure the separate KDE application scope.

The outer restoration `finally` restored **all 43** original installed/source
payload hashes and cleared only the owned loader's bytecode cache. A separate
genuine installed Linux/NVIDIA startup then exited 0 and advertised worker
0.12.0 with txt2img/img2img, embeddings, ordinary LoRA and VAE precision
capabilities (`restored-handshake.json`). No full eight-case ML rerun is claimed
after restoration: the baseline was run with byte-identical original payload,
and the restoration evidence is exact hashes plus genuine startup.

In a separate owned CLI workspace, **23/23** actual preflight tests passed with
zero skips. Omitting `validateEmbeddingFixture()` then caused assertion failures
in malformed descriptor/source tests; omitting the mandatory `--resume` boundary
caused the required early-refusal diagnostic assertion to fail. The first
mutation produced 22 failed/1 passed tests; the second 1 failed/22 passed.
Neither mutation was killed by imports,
syntax, OOM or collection. Both return nonzero, and the driver's `finally`
restores the copied runner to its tested original hash
(`cli-mutations-v2.json`). An earlier missing multiline anchor in that artifact
driver is retained as setup failure and not counted as sensitivity evidence.

Final source/evidence review was root self-review plus delegated read-only
review, not a blind audit. Native reports, the saved archives/SQLite rows,
causal RED/restoration, strict refusals and historical/current doc boundaries
were reviewed separately. PP-004/005/008 retain their open status in both the
matrix and supporting bodies. The next roadmap slice is installed
`predictionType=v_prediction`, not additional embedding format/quality promises.
