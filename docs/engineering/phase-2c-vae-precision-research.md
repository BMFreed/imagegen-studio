# Phase 2C: Illustrious VAE precision

## Scope, revision and risk

Continue clean `master` at `1d62491b09b636c63d568c16acbc61551ccaffc7`.
[PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации),
PP-008 and [Generation settings](../features/project/generate-mode/generation-settings.md)
require reproducible Advanced Options. This high-risk slice adds `Auto`, `FP16`
and `FP32` for the embedded Illustrious VAE in txt2img and opaque img2img.
External VAE selection, CLIP Skip, Anima and other pipeline work remain open.

## Confirmed research

- The `.igs` draft already accepts these three precision values. Production
  Advanced Options exposes only CFG Rescale; Prepare refuses any VAE precision.
  Queue/provenance do not record it; comparison correctly shows legacy Unknown.
- The current worker loads the pipeline as FP16. That does not prove VAE
  execution precision. Pinned Diffusers 0.40.0 with pinned `force_upcast=true`
  upcasts the whole VAE for img2img encoding and final decoding, then restores
  its dtype; UNet/CLIP remain independent.
- Invoke source at `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` uses the same explicit
  FP16/FP32 choice for image-to-latents and latents-to-image. Its current default
  is FP32. No custom Invoke ML implementation is copied.
- Eleven executed tiny pinned CPU probes establish actual input/parameter
  dtypes: native Auto and explicit FP32 are equal under the pinned upcast policy;
  explicit FP16 changes both VAE phases and output pixels. Auto with a native
  false upcast policy stays FP16. Public `register_to_config(force_upcast=...)`
  controls both phases without changing UNet/conditioning or copying a loop.
- The counterproposal of casting VAE permanently to FP32 and disabling upcast
  fails because native image/latent inputs remain FP16. A decoder NaN without
  LoRA silently becomes a black PNG in native image processing. Always-on scoped
  VAE finiteness checks are necessary before publishing a successful result.

The probe script, log and JSON are retained at
`/home/user/.codex/artifacts/imagegen-studio/vae-precision-2026-10-04/research/`.
These probes establish component semantics, not release installation or quality.

## Owned path and invariants

Project Advanced Options -> typed draft IPC -> Undo/shadow/explicit Save ->
frozen preparation and request -> durable queue/admission/Retry/dispatch ->
qualified worker 0.8.0 -> actual VAE encode/decode -> finite candidate -> Add ->
portable provenance -> Save/reopen -> read-only comparison.

All new contexts and requests freeze `draft.vaePrecision ?? 'Auto'`. Their
optional top-level precision must agree exactly, including legacy absence.
Changing a live Project after enqueue cannot change the queued value. Only the
transport's disposable request copy may strip Auto for an older qualified peer;
manual precision requires `illustrious-vae-precision` on worker 0.8.0 at every
admission/Retry/dispatch boundary. Unknown versions cannot inherit capability.
Historical metadata stays absent, rather than acquiring an invented default.
Portable metadata records the selected precision policy. Auto preserves the
native checkpoint policy; it is not renamed to an assumed actual dtype.

Authoring remains available independently of runtime installation; unsupported
family and manual-runtime restrictions are explained. Viewing default Auto
does not dirty a document. External VAE and CLIP Skip remain explicit refusals.
Precision must not cast UNet/CLIP or rewrite authored LoRA/prompt settings.

## Parameters, failures and verification plan

The existing document, queue/request byte ceilings, GPU target bounds and
timeouts remain unchanged. FP32 uses more VAE memory; no new VRAM capacity or
maximum resolution is asserted. FP16 can overflow a real checkpoint; it must
fail visibly without a successful black candidate or silent FP32 fallback.
Failure/cancel retains existing queue/recovery rules and leaves `.igs` unchanged
until explicit Add/Save. Scoped dtype checks/hooks must be removed on failure.

Verify all three enum values, absent fields, unsupported strings/families and
old peers through real draft/storage/queue and worker parsing. Neighboring cases
are txt2img/img2img, Auto with native upcast true/false, manual equal/different
policies, late draft edits and unchanged frozen Retry. Verify actual tiny native
CPU and local NVIDIA calls separately from controlled built Electron wiring.
The native scenario must select a precision, Cancel/Retry after a late edit,
Add and Save/reopen/comparison; inspect normal/compact screenshots.

Execute isolated semantic mutations for frozen/wire agreement, capability
refusal, discarded precision, one-phase-only application, finiteness and legacy
comparison. Restore green baselines. Run TS/Vue checks, lint, applicable full
tests and Python static checks. Record commands/counts/hashes and any limits.
This is a verification plan; completed evidence will be added after execution.

## Executed evidence

Artifacts are retained at
`/home/user/.codex/artifacts/imagegen-studio/vae-precision-2026-10-04/`.
This is implementation self-review by the implementation team, not a blind audit.
Final source, report and built-file hashes are recorded in `delivery-evidence.json`.

| Boundary                | Executed result                                                                                                                                                                                          | Practical limit                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Full application        | `pnpm run app:test`: 914 passed, zero failed/skipped                                                                                                                                                     | Actual SQLite/files/CPU composition and transport; controlled ML in TS tests                            |
| Full prototype          | `pnpm run prototype:test`: 167 passed                                                                                                                                                                    | Regression of prototype surfaces, not production persistence                                            |
| Draft authoring/storage | 69 focused tests passed; precision service edits use actual shadow/recovery, Undo, writer/loader and optimistic serialization                                                                            | Real Project service; no full ML dependency                                                             |
| Backend frozen handoff  | 251 focused tests passed; eight legacy/policy/mode controls use queue/restart/Retry/dispatch/staging/Add/Save/reopen; old peers refuse manual policy                                                     | Real SQLite/files and subprocess transport; inference response controlled                               |
| Full pinned Python      | 288 passed, zero failed/skipped; 61 new VAE cases plus 227 prior                                                                                                                                         | Isolated development interpreter and tiny CPU models, not release installation                          |
| Native CPU ML           | Actual encode/decode input/parameter dtype, native Auto true/false, untouched UNet/CLIP, signed LoRA and structured publication/refusal                                                                  | Tiny native VAE/UNet/CLIP/Compel; checkpoint loading and CUDA transfer redirected for CPU tests         |
| Numerical failure       | Eight stage NaN/Inf controls plus actual finite half weights at IEEE FP16 max 65504 overflow in both modes; FP32 succeeds with the same weights                                                          | Actual CPU kernel failure through worker publication; no GPU overflow claim                             |
| Actual NVIDIA ML        | Nine production parser-to-PNG calls on RTX 4080: legacy/Auto/FP32/FP16/replay and img2img Auto/FP32/FP16/replay; seven pixel controls pass; observed VAE phases use requested dtype, UNet/CLIP stay FP16 | One actual checkpoint, 128×128, four steps, seed 42, epsilon; no general quality or VRAM capacity claim |
| Native built Electron   | 34 checks, 49 PNGs, 13 viewport checks, zero page errors: FP32 -> Generate -> late FP16 -> confirmed Cancel/exit -> frozen FP32 Retry -> Add/Save/reopen/comparison                                      | Controlled inference peer; actual GPU evidence is separate                                              |
| Read-only comparison    | 20 tests passed, including legacy Unknown, family-scoped current Auto, manual Same/Changed and unchanged source data                                                                                     | Pure typed projection plus actual native IPC/UI scenario                                                |

Typecheck, full ESLint, app build, full Python Ruff/format/Basedpyright and GPU
script static checks passed. The final native bundle hashes are checked against
the build manifest before delivery. `ui/native-delivery/` repeats the full native
scenario after the final Main build; renderer/preload/script are unchanged from
the inspected run. All four new Advanced Options/comparison
PNGs were opened at 1380×900 and 900×620 under `ui-audit`. The selector, Reset,
feedback and two comparison values are readable; the compact comparison scrolls
inside its bounded body with reachable close/footer. No new scoped layout defect
was observed. This is not a full UI or accessibility audit.

### Executed semantic mutations

All **31 isolated semantic mutants** were killed and restored baselines passed:

- 13 backend: frozen/default policy, capability refusal, exact durable/context
  agreement, dispatch/Retry and legacy/portable provenance. Baseline/restored
  24/24, source hashes unchanged (`backend/mutation-report.json`).
- Seven Python: lost manual policy, changed Auto, missing finite guard/context,
  dropped command transfer, invalid BF16 accepted and decode-only application.
  Assertion failures were inspected; final restored full suite 288/288 and live
  source hashes unchanged (`worker/mutations.json`, `worker/execution.json`).
- Six comparison: current replacing frozen, legacy default invented, current
  default lost, absent model given Auto, FP16 collapsed and frozen replacing
  current. Baseline/restored 20/20 (`ui/mutations/summary.json`).
- Five draft/control: policy rewritten to Auto, Reset retaining manual policy,
  lost optimistic overlay, unsupported manual generation allowed and offline
  authoring disabled. Real service and UI-control tests red, restored green;
  live sources unchanged (`root-mutations/report.json`).

### Findings and retained intermediate failures

The initial permanent-FP32-VAE proposal was disproved by actual native dtype
failures. Public config now controls both native phases. Actual decoder NaN
conversion and finite-half-weight overflow justified the always-on refusal guard;
no successful black PNG or silent precision fallback is used for recovery.

Retained harness/setup failures did not weaken production assertions:

- A tiny CPU fixture used the wrong UNet up-block name; corrected to the actual
  architecture. An in-process-only import setup failed worker `-I` children;
  an isolated persistent `.pth` venv solved it without changing existing envs.
- An old ready-message expectation still used 0.7.0; the qualified additive
  0.8.0 capability row replaced it.
- One initial backend mutant survived because its name filter selected no test.
  The scenario was named explicitly and the corrected run killed all 13.
- The first native harness expected provenance on `ProjectRasterLayerView`,
  whose public DTO intentionally omits it. Saved `.igs` FP32 already passed;
  the check now uses guarded real `getRasterGenerationData` IPC. The fresh full
  native run passed (`ui/native-final/`); the failed attempt remains in `ui/native/`.
- Initial TypeScript test casting and root GPU script formatting were corrected;
  final typecheck/static checks passed. No model/precision assertions were relaxed.

### Remaining scope and refusal signal

VAE precision does not install a release runtime or external VAE, qualify Anima,
finish CLIP Skip/embeddings, add inpaint/outpaint, Smart Patch or result-to-preset.
Phases 2B/2C and public PP-005/PP-008 readiness remain open. Auto records its policy,
not a guessed effective dtype; absent historical metadata stays Unknown.

FP16 can fail on a checkpoint or input that overflows half precision. The visible
worker error is `GENERATION_WORKER_FAILED` with a non-finite VAE explanation;
no output is published. Existing queue failure/Retry retains frozen settings.
Choosing FP32 in the current Project creates a new authored job; Retry of an old
FP16 job cannot silently replace its precision. Save remains explicit and the
existing worker-unavailable preview-placeholder path remains unchanged.
