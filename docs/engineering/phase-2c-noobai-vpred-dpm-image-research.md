# NoobAI v-prediction DPM++ 2M common-source IMG/OUT qualification

## Scope, owners and entry

Entry: clean `master`, `5efd8b19e7b1276fe2819221c015ded42e5bc767`.
This follows the [finite V TXT gate](./phase-2c-noobai-vpred-dpm-research.md)
and its explicit common-source image gap. PP-004/005/007/008 stay «Пока не
обещать». The [managed library contract](../contracts/managed-model-library.md)
owns exact-file prediction/noise policy; Project and accepted provenance never
edit it. Native execution already exists; this change qualifies a finite path,
not another model family/backend or a new inference implementation.

Risk is high for the test operations: installed-source mutation, persistent
queue/receipts/cursors, explicit acceptance and portable Save/reopen. Root owns
all bounded execution, durable rollback and cleanup. Delegated reference/test
work and reviews are source-informed, not blind. No model download, policy edit,
runtime/environment copy or ordinary app-data operation is planned.

## Research finding and frozen finite plan

Confirmed by a fresh actual installed-worker CPU capture against separately
constructed native Diffusers schedulers: V/true-ZTSNR/leading N4 Normal grid is
`[801,601,401,201]`; Karras is `[999,994,892,0]`. The production image cutoff
excludes training timesteps `>= round(1000*strength)`. Copying EPS strengths
`.75/.5` to V Karras retains only `[0]`; a GREEN test would not exercise the
second-order history. Separate explicit V image recipes preserve old EPS and
V TXT envelopes instead of changing their historical assumptions.

| Schedule | History IMG/OUT strength and suffix | Opaque IMG neighbor strength and suffix |
| -------- | ----------------------------------- | --------------------------------------- |
| Normal   | .75; `[601,401,201]`, three updates | .5; `[401,201]`, two updates            |
| Karras   | .995; `[994,892,0]`, three updates  | .9; `[892,0]`, two updates              |

The strengths are finite qualification choices, not universal author recipes.
Production uses a plain decimal input without a two-decimal precision cap.
The pre-execution grid capture does not establish image outcomes or numerical
sensitivity; the installed matrix below measures them separately.

Freeze **16 installed jobs**, sequential: for each schedule three healthy
baselines (IMG neighbor, IMG history, OUT history), the same three provisional
controls, then two fresh restored history jobs. Expected admissions/completions
are 16/16; ten healthy/restored results use explicit Add/Save/readback/reopen and
owning comparison. All six controls must stay temporary, including unchanged
neighbors. Unexpected failures remain actual failures, never pixel REDs.

The sole installed mutation resets DPM++ 2M's `lower_order_nums` after each
callback in `inference.py`. It preserves configured order2, objective, noise
profile, grid, image/conditioning/LoRA/VAE and RNG. Three-update histories must
change RGB; two-update first-order neighbors must preserve every RGBA pixel.
For OUT, RED requires changed RGB where contribution alpha is nonzero and
identical complete alpha. Fresh restored histories must reproduce full healthy
RGBA exactly. The original bytes/inode/stat are durably journaled before the
replacement and restored in `finally`; import/OOM/timeouts are diagnostics.

Original module SHA `c5d6bbe89ad51e8b60233ee6915bad143bee55f481b4c9fdd559501bacc6cd32`;
the single callback mutation SHA is
`ae49db80e477f0c6f81511caf111ca9b764aaba91267fd86077cf7bda51ac3ab`.
Independent CPU native-loop references construct fresh schedulers without the
production selector, compare timestep/sigma/alpha state, UNet inputs, decoder
latents, pixels, callbacks and source/mask preservation. Actual isolated mutation
execution must kill sensitive cases and retain neighboring controls.

## Input and data boundaries

Every group uses one unmodified healthy accepted V TXT output from the previous
gate, 256×256/all65536 pixels opaque, 73,935 bytes,
PNG SHA `8c6722bfb52b664d7b902c60077af5505b2ff1b29ca2becefc05d3235f68c6b6`,
decoded RGBA SHA `d01722b60187eea82a039dc51473f1bacfe2d172cb34192bf6bddc4bf5fab9db`.
Its previous report/queue identity and PNG are retained; the tiny owned common
PNG copy is checked byte-for-byte. IMG bbox is `(0,0,256,256)`; OUT bbox is
`(64,0,256,256)` with the existing literal mixed-alpha/fade policy. Source import,
bbox keyboard movement, Save, Prepare, native worker and explicit Add are real.

Same exact Cyberfalafel V v1.2 checkpoint, SHA `edca0d65…`, 6,938,040,794 bytes;
effective exact-file override V/true-ZTSNR/leading. Leading remains an export
assumption, not a consequence of prediction type. Weighted raw positive/negative
prompts, Digital Art LoRA−.5 and exact external native VAE/FP32 stay fixed.
LaMa stays the existing 205,669,692-byte `344c77bb…` auxiliary file.

Model Manager must show the exact current version/policies; raw catalog/overrides
must remain unchanged. New Prepare freezes the real DTO before later caller
edits. IMG saved preview is the opaque generated layer; OUT retains its source
layer, contribution alpha, protected pixels and opaque320×256 merged preview.
Saved configuration/provenance/paths and owning comparison are independently
read from actual SQLite, PNG and ZIP bytes, not inferred from a passing harness.

## Parameters, resources and evidence

| Owner/parameter    | Frozen choice and source                               | Required observation                                                   |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Root/jobs          | 16 planned admissions, 10 accepted; finite table above | Actual UUID/count/completion/acceptance, no automatic replay           |
| Geometry/grid      | 256×256, authored N4, CFG4, Fixed0/per-iteration       | UI draft/frozen payload, actual three/two callbacks and decoded output |
| Launcher/systemd   | 2 GiB, zero swap, 1800s/job                            | Owned process start/cgroup, real outcome and exit                      |
| Native owned scope | 12 GiB, zero swap                                      | Actual Electron/worker ownership and physical exit                     |
| Combined watchdog  | 14 GiB including file cache                            | Sampled anon/file/total; fail closed for changed live ownership        |
| CPU/static         | 2–6 GiB, zero swap, bounded and serial                 | Actual command/outcome/counts; no concurrent ML suites                 |
| Disk               | Entry26.379 GiB; evidence .383 GiB; about47 GiB free   | ≤64 MiB forecast evidence; no new weights/runtime copies               |

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/noobai-vpred-dpm-image/20261010-checks`.
Reuse the sole existing `shared/illustrious-vpred-worker-012-20261007` in place
(actual worker0.14.0). Fresh entry source proof confirms all43 packaged files
and physical identities match the previous final handoff and all runtime users
are idle. Bidirectional lifecycle dependencies protect the pool and previous
TXT source evidence. Disposable isolated CPU source copies can be removed only
after restoration, fresh physical-exit proof and preservation of compact RED/
GREEN evidence. Root30GiB/evidence1GiB soft budgets trigger inspection, not
deletion of protected data.

## Executed local checks

The actual tiny64×64 CPU native-pipeline baseline passed30 tests:20 retained EPS cases,
two retained V TXT cases and eight new V IMG/OUT history/neighbor cases. The
isolated actual callback-history reset executed eight tests:four history cases
failed native decoded-latent equality, while all four first-order neighbors
passed. No collection/import/resource-stop failures or skips occurred. The
same isolated43-file source copy was restored exactly; its fresh eight-case
execution passed. CPU native OUT tests cover mixed latent keep masks; published
contribution alpha and full saved-preview composition belong to installed tests.

Focused Node/TS verification passed112 unique tests, including82 retained EPS/
V TXT tests and30 new image tests. Six new cases enter real Main Prepare,
orchestrator, migrated SQLite, worker-request and portable-provenance producers.
Verification/readiness/transport and generated tensors are controlled there;
profile/label doubles are mechanical wiring checks. These tests do not replace
the installed boundary. The initial run had six test-only failures because a
deliberately unsupported Euler clone was incorrectly expected to normalize;
the existing oracle correctly refused it. Explicit refusal checks fixed the
test, preserving all supported-input sensitivity assertions and production code.

Typecheck, lint, ruff, Python type checks, formatting and a fresh app build passed
under serial bounded groups. No full-app or prototype suite result is claimed.
The18 consumed source files and five freshly built bundle members were pinned
before any installed job; the frozen16-job plan is never silently rewritten.

Source-informed review identified an inherited limitation of the shared saved-
pixel helper:RGB at OUT soft-edge global columns217–231 is not checked there.
The independent raw reader was required to verify all RGBA in the ZIP's Pillow-composed
preview, including those3840 pixels. Canvas un/premultiplication can change soft-
edge/hidden RGB; native OUT PNG RGBA must not be confused with a browser-decoded
pixel hash. Neither the numerical mutation nor a healthy screenshot proves the
complete merged-preview boundary alone.

## Installed outcomes and independent readback

The original frozen plan SHA
`576aa3f60e837d22229ced38b442739b11b1ee1d51d180b743b97c611c2b1d71`
remained unchanged. All16 planned application admissions completed; ten healthy/
fresh-restored results passed explicit Add, Save, readback, reopen and owning
comparison. All six mutation controls stayed provisional. Four history controls
failed the actual pre-Add pixel-equality assertion after successful inference;
both two-update IMG neighbors preserved full RGBA. No native replay, unexpected
generation failure or resource stop changed the declared matrix.

The independent raw SQLite/ZIP/Pillow reader passed7025 checks. Its result binds
the corrected reader SHA `78eec84244b325550d3df0d767a94cfbe5080e12e5d0197b4a715cd65f5e6c7a`.
Complete alpha is identical between each healthy/control pair; RED is based on
changed RGB where alpha is nonzero and on the independently composed image,
not hidden RGB or a failed import.

| Schedule / history mode | Changed visible generated RGB pixels | Changed final composite pixels |
| ----------------------- | ------------------------------------ | ------------------------------ |
| Normal IMG              | 62,966                               | 62,966                         |
| Normal OUT              | 26,326                               | 25,740                         |
| Karras IMG              | 65,536                               | 65,536                         |
| Karras OUT              | 26,368                               | 26,118                         |

All four fresh restored histories reproduced complete healthy RGBA, including
hidden pixels. All four accepted OUT packages passed the independent full
affine/source-over preview comparison, covering the inherited helper's3840
soft-edge pixels in each preview. Protected source checks cover222208 pixels
across those four packages; ordinary imported source metadata/assets are exact.
Canvas-decoded hashes were not substituted for native soft-edge PNG bytes.

Raw deltas are exactly16 queue rows,16 completed candidate receipts,16 document-
scoped operational seed cursors and10 accepted-result indexes. The acceptance
journal is empty. All previous eleven-table rows, catalog9/14 and exact-file
prediction/noise overrides remain unchanged. Full frozen/native DTOs, portable
configurations, immutable provenance, source-only provisional packages and
later independent authoring/readonly comparisons were checked. Operational seed0
is verified from SQLite for every completion; accepted explicit-Save snapshots
remain0 even though later authoring uses seed37.

The first independent-reader run had a schema-only `KeyError`: four intended
history failures stop before the later GUI `lastActualSeed` observation. The
corrected reader still checks actual raw cursor/receipt seed0 for all16 cases,
and requires the later GUI observation in healthy/neighbor reports. Original
reader bytes, its failed log/bounds and the diagnostic are retained as
`independent-aggregate-before-report-seed-fix.py`, `independent-aggregate.*` and
`reader-seed-observation-diagnostic.json`; the fresh passing execution is
`independent-aggregate-v2.*`. This correction changed no app output, fixture,
plan, numerical assertion or acceptance boundary.

## Final resources, cleanup and handoff

All16 native bounds retain actual zero-swap terminal outcomes and sampled
combined memory observations. Maximum sampled combined memory was7,256,563,712
bytes, about6.758GiB; every resource-stop field is null. The raw reader ran in a
separate2GiB/zero-swap/900-second CPU group after native exit, finishing in about
31seconds. Its sampled anonymous peak was73,248,768 bytes; file-cache usage
reached the2GiB cgroup cap. It imported no application/ML/scheduler code and
streamed protected model files instead of loading their weights.

The sole installed mutation journal is restored, with its protected backup
absent and all43 original bytes/inode/mode/mtime verified. All103 recorded native
PID/start identities are physically gone. A fresh203-check same-boot system
proof reverified the known trusted preexisting services before cleanup; their
unreadable environments were not claimed empty and unknown same-user processes
remain fail-closed.

Guarded cleanup removed only the restored isolated CPU source copy and generated
bytecode, reclaiming exactly4,087,808 allocated bytes. It preserved all compact
evidence, provisional recovery, prior TXT/five-sampler/Anima-DPM proofs and the
sole shared worker0.14/catalog/model pool. Post-cleanup inventory was
28,360,941,568 root bytes,438,976,512 compact-run bytes and49,738,022,912 free
bytes; both30GiB root and1GiB compact soft budgets passed. This run used about
27MiB evidence, below its64MiB forecast. Lifecycle pointers record retained
dependencies separately from prior historical outcomes.

Roadmap, the four affected promise rows and matching sections, engineering index
and the historical TXT successor link are synchronized. Their public status
remains «Пока не обещать». Final post-commit/push source, remote and physical-idle
verification belongs to `final-handoff.json` in the evidence root.

## Limits

This finite history-loss image control does not close the previous Karras TXT
forced-epsilon pixel-RED criterion or recover that original failure's precise
exception. No universal checkpoint/policy/strength/geometry coverage, image
quality, exact trained-pixel parity with Invoke, Cancel/Retry/embedding matrix,
V DPM++ SDE plus ZTSNR, full NoobAI/MVP or release qualification is claimed.

The subsequent signed-embedding image gate is recorded separately in
[NoobAI signed embedding IMG/OUT directional qualification](./phase-2c-noobai-embedding-image-polarity-research.md).
The following next-step description is historical at this V image checkpoint;
its original counts and unclosed Karras TXT wrong-EPS pixel criterion remain unchanged.

At this checkpoint the next step was a separately frozen finite signed-embedding directional IMG/normal OUT
qualification. Prior one-literal TXT direction and ordinary embedding-use image
results do not prove that image positive/negative branches receive the intended
exact versions. No new product decision is required for that research step.
