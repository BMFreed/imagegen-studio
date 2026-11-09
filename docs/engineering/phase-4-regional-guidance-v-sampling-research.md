# V-prediction Regional Guidance — existing native sampling methods

Base `91c84e93f8b39d1d502775d483d68c3ca11e5e3d`. This high-risk slice joins
V-prediction with the existing Euler a/Normal and deterministic DPM++2M
Normal/Karras owners in TXT, IMG and OUT. It introduces no prediction formula,
solver/loop, source algorithm, worker command/version, wire field, queue kind,
migration or persistence format.

## Current Invoke implementation

Clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`app/invocations/sd/denoise_latents.py::get_scheduler` forwards the UNet objective
to the selected scheduler. `init_scheduler` owns the training-time window and
independent `seed ^ 0xFFFFFFFF` step generator. `backend/stable_diffusion/
schedulers/schedulers.py` selects native EulerAncestralDiscreteScheduler and
order-two DPMSolverMultistepScheduler, with the Karras flag selecting its grid.
`diffusion_backend.py` initializes through the scheduler's own `add_noise` and
keeps the original sampling/history owner. These backend mechanisms are unchanged
from the previously consulted b0ac163b revision.

Current `frontend/webv2/src/features/generation/core/graph.ts` and
`canvas/compileCanvasGraph.ts` / `canvas/addRegionalGuidance.ts` retain ordinary
model/sampler/source ownership before regional conditioning. Their new graph
accessors do not require another Studio numerical path. Studio reuses its existing
native selector, explicit TXT initializer, independent step RNG, DPM history,
image posterior/window, prepared VAE, LaMa/keep protection and output publisher.

Current Invoke also contains independent masked Anima negative conditioning in
`app/invocations/anima/anima_denoise.py`; the older research's absence claim applies
to its historical revision. Anima spatial negatives are a separate possible next
owner, not a prerequisite or part of this change.

## Contract and compatibility

An additive `illustrious-regional-v-prediction-sampling-v1` capability requires
the prior V capability. Existing method, image, OUT and VAE prerequisites remain
independent. Old V capability grants Euler TXT; old V-image capability grants
Euler images. Their meanings, old EPS/private profiles and worker0.14 remain.
New explicit V sampler profiles select the existing native implementation.

TXT Euler a/DPM++2M require the existing frozen
`invoke-cpu-f32-add-noise-v1` initializer. Euler TXT and every image mode require
no TXT initialization override. Prediction objective and explicit Main noise
policy remain separate. The actual exact-file resolver controls admission in both
stale-label directions, before queue publication, and the actual client repeats
the combination gate. Frozen Retry retains its original method/grid, initializer,
source/strength, objective, policy and resources after current draft edits.

Existing steps1–200, CFG, geometry, text, resource, row, mask, strength and VAE
bounds remain. SDE/other samplers, Smart/references, Anima scope and quality are
not broadened. Completion remains temporary until explicit Add; ordinary-only
provenance and Regional Guidance exclusions remain. PP-001/005/007/008 keep
«Пока не обещать».

## Finite acceptance and parameters

Reuse the exact original Cyberfalafel V v1.2 derivative,
SHA-256 `edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d`,
6,938,040,794 bytes, Civitai model1147756/version2679856/file2566634,
creator Knightus_Ai. No download or model/environment copy is needed. The user's
official Illustrious v0.1 visual target is unchanged by this mechanics fixture.

The installed matrix fixes512²/N30/CFG5/seed123/EmbeddedFP32/no TI or LoRA:
TXT Euler a/Normal, IMG DPM++2M/Normal and OUT DPM++2M/Karras. Images use
strength0.5. Each has an independent healthy control, progress-observed Cancel,
saved method/text/mask/model/seed/source/strength edits as applicable, restart and
selected frozen Retry, then Add/history/Save/reopen. Nine requests/six PNGs are
planned. Small original-native tests observe actual method/grid/objective and
initializer values; a separate N30 native probe pins the complete grids. Installed
acceptance observes the real wire, guarded configuration/initializer contract and
native progress totals, without a per-trained-step timestep/tensor trace claim.
No guessed Karras timeline or visual-quality inference is acceptable.

Reuse the single installed runtime/catalog; each installed unit retains the
12 GiB aggregate host, zero-swap,600-second guard. Small native suites use separate
bounded units. These are operational guards, not capacity claims. Qualify method/
mode breadth with small original-native tests; use isolated post-resolution
capability and post-admission wrong-objective mutations with unaffected controls
and exact restoration. Failures must preserve borrowed state/RNG and allow fresh
calls. Raw failure/setup attempts remain distinct from semantic RED.

## Evidence

ROOT executed the affected union of **1,736 Main, 540 distinct Python and
220 browser cases**, all GREEN after the disclosed diagnostic corrections. The
Main broad run initially had two failures; the final80-case correction run closes
both while preserving the remaining broad results. This is an affected union,
not a final whole-app rerun. Python consists of102 new cases and438 neighboring
cases, with963 warnings; a final nine ordinary-loop cases were repeated separately
after a typing-only parent alias. TypeScript/Vue and strict Python typing pass;
scoped ESLint, Ruff/format and the desktop build pass. The build retains its
existing bundle-size warning.

The new strict optional capability Boolean test exposed a missing parser check;
the production guard was repaired with the original null/string assertions kept.
The old DPM V-refusal fixture was updated to verify actual-resolution legacy-peer
refusal; its controlled resolver is installed before constructor detachment.
The initial ordinary OUT comparison bypassed its existing schedule-capture hook;
the reference now delegates that owner and independently checks the selected
window. Initial runs and typing diagnostics remain excluded. The first installed IMG
attempt completed its healthy request but timed out toggling the Sampler picker
in its second lifetime. Both normal closures are retained. Its one request/PNG
is excluded; the new-profile-only helper now uses native focus/Escape/ArrowDown
to open the menu deterministically. IMG/OUT qualify that correction; TXT retains
its earlier unchanged successful helper source pin. No product repair was needed. Scoped ESLint first
hit the automatic ~1.5GiB Node heap; the interrupted detached controller was
reconciled from its terminal unit. A serial6GiB unit/4GiB heap retry passes with
2,973,753,344-byte measured cgroup peak. This tooling retry changes no ML budget.

## Installed consumption

All three installed profiles pass: **nine requests, six published PNGs and nine
normal native lifetime closures**, with39 retained checks (13, 13, 13). Each
profile has a healthy control, numeric-progress Cancel without completion, saved
draft edits, restart and frozen Retry, followed by explicit Add/Undo/Redo/Save/
reopen. Own healthy/Retry PNG bytes and decoded RGBA are exact. TXT uses Euler a/
Normal with its frozen initializer; IMG uses DPM++2M/Normal; OUT uses DPM++2M/
Karras. Actual completed progress totals are30,15,16 respectively. The actual
window metadata comes from the independent original-native N30 probe; installed
records do not claim every trained timestep/tensor was observed.

The real0.14 worker advertises the additive capability. Actual wire objective,
resolved policy, method/grid, TXT-only initializer and image source/strength stay
associated through Retry despite current saved Euler/Normal/model/text/mask/seed/
source/strength edits as applicable. Original file identity/full SHA, installed
worker/config/report pointer, prior terminal queue/packages/candidates and source
images remain preserved. OUT keeps its independent raw-alpha and source-over
checks; sampled browser-canvas rounding evidence is not whole-canvas equality.
Independent reopening verifies all six output PNGs and their control/Retry
association. Ordinary provenance retains V/objective/policy/method/source/VAE;
Regional Guidance remains excluded from provenance, Compare and result presets.

## Discrimination and review

Isolated Main capability removal gives three semantic REDs with the old Euler V
control GREEN. A post-admission native V-to-EPS substitution gives three semantic
REDs after real PNG publication, with three EPS controls GREEN. All restored cases
return GREEN: **30 selections,24 GREEN/six intentional RED**, with all1,583
isolated source files restored and the live checkout unchanged. No installed
worker or original model was mutated. Native early refusals, late failures,
borrowed storage/metadata/RNG restoration and fresh-call recovery remain covered
by the new/neighbor suites.

Core source review and the narrow R3 test-helper recheck are CLEAN/source-only;
their readers performed no runtime qualification. Retained-byte audit and ROOT
execution remain separate evidence. This finite method/mode qualification does
not establish quality, broad model support, SDE/Smart/references, Anima or complete
release readiness. Current Invoke's masked Anima negatives are a separate later
owner. PP-001/005/007/008 remain «Пока не обещать».

## Reproduction and lifecycle

Compact evidence lives outside Git at
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-v-sampling/20261109-native-methods`.
It retains complete baseline/qualification/final source snapshots, current Invoke
pins, commands/resource records, original/mutated source and JUnit, installed
reports, exact own payload archive, final projects and a closed catalog backup.
The original V file and canonical shared runtime/catalog/managed inputs are
protected external dependencies; this source commit is not a self-contained ML
bundle. No additional environment/model copy or download was made.

ROOT verified all5044 retained entries against the archive, then
rechecked actual process/cgroup exit, source restoration, all-reader closure and
global incoming references before removing only the two exact own disposable
roots. Their recorded allocation was104,357,888 bytes; measured
deletion-only artifact-root reduction was104,357,888
bytes. Lifecycle is `retained`, `payloads: []`; shared runtime/catalog/projects,
originals and refresh-report ancestry remain protected. Independent final review
can inspect retained bytes but does not certify ROOT runtime or physical release.
