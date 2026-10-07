# Ordinary Euler for the Illustrious/NoobAI pipeline

## Scope, sources and risk

Base `4081d562cef2cc472b85855352f35bb805ce223c`, clean `master`.
Supporting promises PP-004/005/007/008 remain open. This is the first executable
part of the [NoobAI plan](../specs/01-implementation-roadmap.md#noobai-полная-поддержка-в-рамках-mvp):
ordinary Euler authoring, frozen execution and accepted settings, distinct from
Euler a and Anima's native Euler. Noise-profile policy is a subsequent boundary;
this change does not automatically enable ZTSNR or change timestep spacing.

Risk: high for queue/protocol and immutable provenance readers, despite additive
sampler enums. Preserve prior payloads/defaults, exact resource checks, source
pixels, temporary completion, explicit acceptance and independent Save/readback.
No SQLite or `.igs` format migration is intended.

User decisions on 07.10.2026: noise-profile controls will be separate ZTSNR and
timestep-spacing parameters in Model Manager. Unknown profile defaults remain
explicitly labeled assumptions with manual overrides; no mandatory first-run
profile choice. Prediction ownership remains exact-file Model Manager policy.

Confirmed source: [NoobAI V-Pred instructions](https://huggingface.co/Laxhar/noobai-XL-Vpred-1.0#how-to-use-the-model)
use EulerDiscreteScheduler and an explicit zero-SNR override. At the base revision public
Illustrious pairs contain only Euler a and DPM++ variants. Pinned Invoke checkout
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` distinguishes ordinary/ancestral Euler.
The author's exported scheduler config conflicts with its V-Pred recipe; source
metadata is not sufficient grounds for automatic profile selection. Pinned
NoobAI epsilon `70dee4d903b83cc6d1e8d12e65051cfdbcf54ab3` and V-Pred
`66aa55e3469c27c29a89813cd35dd95fb7485fa1` export identical scheduler JSON
(SHA-256 `227b78f3ce3ed1c49b526e274289b3273a4be8b0c19583ae30bd077105bb8e8e`):
Euler, epsilon, no rescale, leading. V-Pred's README explicitly overrides
prediction and zero-SNR; it does not require trailing. Therefore full profile
support cannot be inferred from merely adding Euler.

Future backend constraint: pinned DPM++ SDE has no native zero-SNR rescale
parameter, unlike Euler/Euler a/DPM++ 2M. Its config can retain an ignored unknown
flag. The profile slice must validate actual alphas/sigmas and refuse unsupported
pairs before enqueue, or qualify an explicit adapter; a config-property assertion
is insufficient. No extra beta schedule editor or backend is introduced here.

## Owners and invariants

The shared pair catalog owns `Euler` + `Normal` → `euler`. Renderer authoring,
Main draft validation, frozen queue readers, worker request/parser and accepted
configuration must agree. Production options derive that catalog; prototype
Project/preset controls have separate arrays to keep consistent.

Python dispatch must construct the real pinned EulerDiscreteScheduler using
the frozen prediction objective. Euler a retains EulerAncestralDiscreteScheduler.
Anima method `euler` is unrelated and must retain its flow semantics.

An explicit capability and qualified new worker version admit ordinary Euler.
Older versions or missing capability must refuse before queue publication,
replacement, request transport or generation-request scratch allocation.
The gate covers txt2img, img2img and existing normal outpaint, including direct transport. Updating version
helpers must retain their existing feature requirements for other operations.
The existing atomic Project capture may lease/copy source images before its
callback observes readiness; this is not a claim of zero capture scratch. The
legacy internal orchestrator convenience API still checks at materialization,
after preparation, but before durable publication; public Generate uses the
earlier controller gates.

Cancel/Retry retain the original sampler/target/seed despite live draft edits.
Add/Undo/Redo/Save/readback/reopen preserve `Euler`, `Normal`, `euler`; comparison
distinguishes Euler a. Old JSON and default selections remain unchanged.

## Planned checks and resource ownership

Use actual draft/storage/queue/request/accepted readers with controlled external
timing/failure peers, plus real Python scheduler numerics. Reject wrong aliases,
Euler/Karras, missing capability and spoofed capability on old versions. Compare
neighboring Euler a and Anima behavior. An isolated Euler-to-ancestral semantic
mutation must kill a meaningful routing/numerical assertion after healthy setup.
Native installed evidence, if executed, uses declared exact weights and explicit
Generate/Add/Save/reopen; fixture preparation and network installation are separate.

Artifact inventory: one shared worker-0.12.0/catalog, approximately 12.22 GiB;
64 GiB disk free, 21 GiB available RAM. Reuse dependencies where compatible;
do not claim the old installed worker qualifies the new capability. Root alone
runs heavy checks serially with cgroup memory/swap limits and deadlines. Native
Electron uses the existing actual-scope guard; physical child exit, mutation
restoration and compact evidence precede disposal. Follow
[artifact lifecycle](./artifact-lifecycle.md); original weights/global caches
and ordinary app data remain untouched.

## Results

Implemented shared Euler/Normal → `euler`, additive queue/accepted readers,
public Generate/Retry/materialization/outpaint/JSONL gates, and real Python
Euler dispatch. Worker `0.13.0` retains prior features and advertises
`illustrious-euler`. Project/preset prototype options distinguish both methods.
Old defaults, objective ownership and legacy serialized values are unchanged.

Evidence at `~/.codex/artifacts/imagegen-studio/runs/euler/20261007-checks/`:

- **2259/2259 application/provisioner/qualification/guard checks passed**, zero
  skipped, same manifest as `app:test` with `--test-concurrency=1`. Real controller
  admission refuses before composition/worker reservation and preserves seed
  cursor/queue/staging/package; later sampler edits do not rewrite a captured
  request. Real SQLite restart and terminal Retry retain the original pair/seed/
  target; corrupt labels/keys refuse before publication/readback.
- **279/279 focused Python checks passed**, zero skipped: the actual pinned
  scheduler step matches an independent ODE equation for both epsilon/v-prediction,
  multi-step replay differs from the ancestral neighbor, and tiny real UNet/VAE
  img2img plus masked outpaint exercise the expanded six-method matrix. Native
  startup-class checks and JSONL routing are separate controlled-collaborator
  checks, not proof of installed CUDA startup or trained output quality.
- **174/174 prototype checks passed**, including Project/manager Euler editing,
  Save Current, preset Apply and Undo. These are mock UI flows, not production
  preset persistence.
- Three executed isolated semantic mutations were killed: ordinary constructor
  → ancestral fails the independent finite-step assertion for both objectives;
  bypassing either qualified version or Euler capability fails the peer matrix.
  Originals were unchanged; subprocesses physically exited before copied payload
  disposal. Two TS copies reclaimed 81,920 allocated bytes. Numerical-copy
  disposal is recorded separately; it did not touch installed runtime or weights.
- Real draft Undo/Redo, shadow, `.igs` Save/readback/reopen keep Euler and the
  DPM/ancestral controls. An imported accepted Euler fixture survives Raster edits,
  shadow and Save with immutable provenance/pixels. Actual comparison reports
  Euler → Euler a as Changed without modifying either input. This is not a new
  Euler-specific Generate → explicit Add → trained Save/reopen system run.

Source review was not a blind runtime audit. It caught the canonical nested
`generationDraft.sampling.sampler` admission path, which was corrected before
GREEN. Initial Python launch lacked NVM in PATH; its real TS compiler peers
failed before Anima setup. The corrected bounded launch passed. Initial full
app failures were six obsolete qualification-diagnostic assertions, corrected
with the exact 0.12/0.13 gate. Initial lint found only sortable imports/properties
and numeric literal formatting; semantic values were unchanged.

Heavy checks ran serially with zero cgroup swap: focused Python peak 951.8 MiB
under 6 GiB; serial full app peak 616.8 MiB under 2 GiB; one-browser prototype
peak about 3 GiB under 4 GiB. Native numerical mutation peak 552.6 MiB under
4 GiB. Final compiler/lint/build use a separate 4500 MiB group, bounded deadlines
and Node heap 3072 MiB. Raw commands/outcomes are retained with the compact
reports, source pins and mutation recipes. Final check receipt follows in
`final-checks.json`; failed preliminary receipts are retained separately.

The reusable installed pool remains worker **0.12.0** and was not modified or
claimed as Euler-capable. No extra ML environment/model copy was created. Keep
one pool for the next exact-file profile/compiled execution qualification; update
its owned worker via verified install before claiming genuine 0.13 readiness.
Compact raw NoobAI source configs/README include exact URL/revision/hash manifest.

No full NoobAI, ZTSNR/spacing controls, trained author recipe, image-quality,
live CivitAI installation, Euler-specific native acceptance or release claim
follows from this slice. Next: exact-file noise policy/storage/UI with separate
controls and explicitly assumed unknown defaults, then frozen execution and
trained author-profile qualification before dynamic multi-job batches.
