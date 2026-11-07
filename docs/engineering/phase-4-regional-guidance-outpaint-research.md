# Regional Guidance on mixed-alpha Current Canvas

Base: `e8a109b21a4503a75d8d5392c4e9a80561a87e98`.
Risk: high — frozen queue inputs, resource identity, worker transport, RGBA
candidate publication, cancellation and accepted source preservation.

## Expected result and source

Generate with enabled Illustrious regions can consume a Current Canvas target
containing both existing and transparent pixels. The existing outpaint policy
owns infill, denoising protection and the RGBA contribution. Regional text remains
owned by the complete captured recipe. Frozen Retry consumes the original source,
alpha, settings and exact resources after later authoring changes.

Current local InvokeAI: `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`.
Consulted `frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
(`graftOutpaint`, `graftMaskTail`, then `addRegionalGuidance`),
`app/invocations/sd/create_gradient_mask.py`,
`app/invocations/sd/denoise_latents.py` (`prep_inpaint_mask`, default `_old_invoke` and opt-in modular `InpaintExt`),
`backend/stable_diffusion/extensions/inpaint.py`, and the existing VAE
image-to-latents/latents-to-image callers. They combine image latents and an
alpha-derived denoise mask with ordinary regional conditioning.

Studio adapts that mechanism through its existing `outpaint_conditioning.py`,
`outpaint_worker_assets.py`, `sdxl_outpaint.py`, contribution validation and
frozen-resource owners. A fresh wrapper composes the existing masked native loop
with existing regional attention. Prepared VAE encoding must preserve the masked
wrapper's original-latent/noise capture. The current default `AddsMaskGuidance` source is retained separately and exercised by ordinary native controls; modular denoising is opt-in in Invoke. No independent sampler loop is needed.
This is source-backed reuse; native compatibility remains to be executed.

## Ownership and finite scope

The proposed explicit capability is `illustrious-regional-outpaint-v1`, requiring
the existing regional image and ordinary outpaint prerequisites. Mode is derived
from actual composed pixels before resource preparation, transport and SQL.
Missing combination support refuses without changing existing work.

The actual command remains `generate-illustrious-outpaint`, with existing strict
conditioning and exact pinned LaMa identity. No TXT initialization is accepted.
The additive queue operation is `illustrious-regional-outpaint`; migration preserves
all old attempts and receipts. Frozen source PNG, raw alpha identity, regional
files, infill path/digest/size, concrete prompt/seed and model resources survive
reload. Dispatch re-verifies them. Accepted settings project to existing ordinary
outpaint provenance; regional operational fields remain excluded.

Existing Euler/Normal, Euler a/Normal and DPM++ 2M/Normal/Karras image owners,
CFG Rescale and prepared VAE precision keep their independent prerequisites.
Existing ceilings remain: 1–200 requested steps, CFG greater than1 and at most30,
rescale0–0.99, strength0–1, at most3 regions, 308 rows/sign, text/resource/alias
limits, dimensions at most2048 and4M pixels, 32MiB target, 64KiB wire,
1MiB regional metadata and64MiB aggregate alpha. Ordinary outpaint admission
retains its minimum dimensions and exact infill resource. These are logical
bounds, not measured capacity guarantees.

## Verification plan

- Main: genuine mixed-alpha capture/admission, old-peer and missing/changed infill
  refusal before files/SQL, atomic batch ownership, migration preservation,
  frozen Retry and independent source/contribution validation.
- Native: actual masked loop with independent mask direction/noise/selected-window
  observations; regional context consumption; RGBA contribution and protected
  source reconstruction; prepared VAE ordering and state/RNG restoration.
- Faults: partial setup, encoding, later denoising, decode and publication failures;
  no successful partial result, exact restoration and a fresh successful call.
- Installed: real renderer/default RuntimeManager, Generate/Cancel/frozen Retry
  after saved edits, Results/Add/Undo/Redo/Save/reopen and exact healthy control.
- Mutation: capability omission and a mask/association intervention must turn the
  intended assertions RED while adjacent ordinary/healthy controls stay GREEN;
  restore exact source before qualification finishes.

Serial lower units use3GiB host/zero swap/600seconds. Native work reuses one
canonical runtime/catalog and existing original weights; aggregate host envelope
is12GiB with zero swap and600seconds per unit. Inventory and actual physical exit,
source restoration, dependency/readers and retained-byte closure precede cleanup.
Evidence root: artifact-relative
`runs/regional-guidance-public-outpaint/20261107-alpha-frozen`.

Visual usefulness, Anima
regional execution, explicit inpaint/Smart Patch integration and release readiness
remain separate. PP-001/005/007/008 stay **«Пока не обещать»**.

## Executed qualification

ROOT records **1175 Main PASS** in58 files, **302 Python PASS /193 dependency
warnings**, and **198 distinct browser cases qualified**. Python comprises58
new outpaint cases and244 ordinary outpaint/image/worker neighbors. The new
native partition is8 CPU +8 CUDA +12 prepared-VAE +30 remaining cases; the last
partition includes25 wire/refusal cases and5 native/control/recovery cases.
Tiny native cases explicitly substitute only neural LaMa. Actual snapshot,
coherence, CLIP/attention, native solver/VAE and PNG publication remain real.
The separate installed run uses the genuine pinned LaMa.

The full browser run has197 PASS and one new-test strict-locator error; the
corrected two-case targeted run passes. The union is198 cases, not199 and not
an independently repeated all-green full run. Production UI bytes are unchanged
by that locator correction. TypeScript/Vue and strict Python pass; Python has
zero errors/warnings. Build, scoped checks and source reviews are recorded
separately from native execution.

Excluded diagnostics remain retained: an unconfigured initial Python typecheck;
then54/3 typing diagnostics corrected with casts/annotations; a stale Ready
expected-list missing the additive capability; CPU fixture precision wrongly
forced toFP16; a24x16 fixture wholly inside16px coherence/fade, then a missing
padded coverage update; new Main tests calling `retry` instead of `retryJob`;
and new browser locators with an incorrect accessible name/duplicate message.
No guard is relaxed to accept those fixtures.

Independent source review finds no material production defect. Its two test
findings are corrected: outpaint Canvas alpha follows the independent reference
instead of a blanket255, and non-LaMa refusals use an explicit infill collaborator
so an unrelated invalid file cannot produce false GREEN. LaMa-specific cases
retain real missing/invalid-resource refusals. Final scoped lint changes only
comparison-object property ordering and test formatting/braces. A TypeScript
AST proof verifies equivalent normalized syntax;29 focused Main and20 shared
cases plus final typecheck pass afterward. Native execution/mutations are pinned
to R4; R5/pre-release retain the disclosed lint delta. No native rerun is
attributed to those later source snapshots.

## Installed Generate, cancellation and frozen Retry

The canonical52-module noneditable0.14 worker is refreshed in place and physically
qualified; no environment or checkpoint is copied. One necessary205669692-byte
managed LaMa is installed through the existing fixed Main installer, using the
already verified local original only as download transport. Its digest remains
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
This does not qualify public-network delivery or release Install/Repair.

Installed native-r2 passes **16 checks in344.445s bounded**. It uses official
Illustrious v0.1 epsilon, EmbeddedFP16,512x512 at(-13,5),30 requested Euler/Normal
steps, Main false-ZTSNR/leading, strength.5, CFG5 and rescale.7. Imported pixels
contain alpha0/127/255. Three real numerical requests are a healthy control,
Generate/Cancel and original frozen Retry, with two healthy PNG completions.
Original source, alpha-derived conditioning and exact LaMa reach the worker.
Both healthy requests consume16 selected steps and produce identical raw RGBA.

Saved later authoring changes source opacity/text, strength.8, seed124, steps2,
rescale.2 and disables regions. Retry retains the original source/region recipe,
seed123, strength.5 and rescale.7; progress restarts at1 and reaches16. Results,
preview, explicit Raster Add, Undo/Redo, four Saves and independent ZIP/reopen
retain the contribution and ordinary outpaint source/provenance. Regional fields
remain excluded. The separate healthy control is discarded explicitly through
normal UI. Previous SQL, packages, history and candidates remain preserved.

The initial installed r1 is excluded: it compared imported RGBA directly with
identity-affine bicubic compositor pixels. Pillow12.2 passes soft alpha through
RGBa premultiplication. An independent integer oracle exactly accounts for12288
changed RGB channels, each by at most1, with identical alpha. The corrected
oracle compares every channel exactly; no tolerance or production compositor
change is introduced. A fresh independent source-only addendum is CLEAN.
R1's17 owned process identities/scope are confirmed ended; the existing Main
startup recovery cancels its interrupted attempt with APP_RESTART, preserving
all other rows/receipts/cursors. The first recovery-helper read used a nonexistent
receipt `id` column and failed before recovery; the corrected read uses the
existing completion-order key. There is no manual SQL repair or reset.

ROOT opens four full installed screenshots under ui-audit. No new material local
layout finding is observed in Generate/Queue/Results/reopen. Keyboard/resize,
accessibility, popup legibility and generated-image quality remain unqualified.
The output is a numerical colored-source fixture with distorted forms, not a
visual regional-quality PASS.

## Semantic mutations and retained evidence

Two isolated mutations complete **12 selections:10 GREEN/two semantic RED**.
Wrong mask direction fails the original native mask-consumption oracle while
opaque IMG stays GREEN. Omitting the combination capability admits an unqualified
peer and fails real Main admission assertions while healthy outpaint stays GREEN.
Both exact restorations return GREEN; all1523 copied and live source files match
R4 before/after the mutation experiment. No live or installed source is mutated.
This proves mask/admission sensitivity, not a new trained regional-text or visual
causality claim.

Independent retained-byte/dependency audit is CLEAN within its read-only scope.
All4434 entries (3524 regular files,855 directories,55 literal symlinks) remain in
the verified20142943-byte archive, SHA-256
`fe9f77851cdffe3680d418529f98ffb6488df5e717b7babe97bc309b0a0b209d`.
It retains complete source/mutation restoration, original native reports/PNGs,
owned IGS/autosave inputs and the consistent final SQLite backup. Audit evidence
does not independently rerun native loading, live-state/RNG preservation or UI.

ROOT separately confirms fresh physical unit/cgroup/PID exit, source restoration,
all-reader and global incoming-dependency gates before releasing only this run's
archived `payloads` tree. The deletion-only root measurement reclaims
**73,498,624 allocated bytes**. Canonical runtime/catalog, current companion,
checkpoint, VAE/TI/LoRA/LaMa resources and durable application data remain
protected. Retained evidence exceeds the initial compact soft budget with its
existing protected-dependency exception; no shared resource or app data is swept.
The first release preflight stops before deletion on protected `/proc` entries.
The final gate records six exact pre-existing system/desktop service identities
as explicit exclusions (PID/start/parent/name/cgroup); unknown denied processes
still refuse.52 owned units,57 native identities and54 recorded cgroups are
confirmed ended/empty. This does not certify unreadable foreign service FDs.
One missing reciprocal prior-run lifecycle link is corrected and independently
rechecked, without source or payload changes.
Final source/document bookkeeping review remains distinct from runtime reruns
and cleanup authority. PP-001/005/007/008 remain **«Пока не обещать»**.
