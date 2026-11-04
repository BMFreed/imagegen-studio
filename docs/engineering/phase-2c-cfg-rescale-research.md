# Illustrious CFG Rescale: frozen inputs and actual inference

Research base: `d488fbc8d90102222f1fdbe33bc9cbc85e133d33`, clean `master`,
2026-10-02. This is a high-risk extension of the existing Illustrious txt2img
path: worker admission, durable queue/staging records and immutable provenance
must agree on the value used. PP-005 and PP-008 remain **not release-ready**.

## Contract and observed gap

[Generation Settings](../features/project/generate-mode/generation-settings.md)
already assigns CFG Rescale to `Generation > Advanced Options`, freezes it with
the job and includes it in comparison/presets. The `.igs` draft already accepts
an optional `cfgRescale`; the prototype exposes 0–0.99. At the research base,
production has no control or draft IPC action, Prepare rejects any presence
(including zero), the worker never passes `guidance_rescale`, and comparison
correctly labels historical absence `Unavailable`.

Reference behavior was checked in local InvokeAI
`~/Work/sources/InvokeAI/invokeai/backend/stable_diffusion/extensions/rescale_cfg.py`
and `invokeai/app/invocations/denoise_latents.py`: default zero, nonnegative
multiplier below one, noise-standard-deviation rescaling after combining CFG
predictions. The existing pinned Diffusers SDXL pipeline is the ML adapter;
this change does not add a backend or support base SDXL as a product family.

## Owners and invariants

1. Project draft IPC validates a finite 0–0.99 value; unset removes the optional
   field and zero is preserved. Changes follow document shadow, explicit Save
   and reopen. The existing approved compact controls and color tokens apply.
2. Main freezes `draft.cfgRescale ?? 0` before asynchronous verification. Later
   draft edits and Retry cannot rewrite this value. Durable context/transport
   disagreement is rejected before dispatch or acceptance.
3. Inference worker 0.5.0 advertises `illustrious-cfg-rescale` together with its
   existing capabilities. Older qualified workers can still execute neutral
   zero through their existing protocol; nonzero requires the new capability
   before queue publication. Unknown/newly incomplete handshakes fail closed.
4. Python strictly validates the optional transport field (legacy absence means
   neutral zero), and the production helper passes it to the actual pinned
   Diffusers pipeline. No setting is read from mutable Project state in worker.
5. New accepted records include the frozen effective value. Legacy records with
   no value remain unspecified, including after load/recovery/Save. Comparison
   can compare recorded zero with current default zero but must never invent a
   historical zero from missing provenance. No paths or Regional Guidance enter
   the portable record.

Parameter register: 0–0.99 is the already approved prototype range, not a new
measured hardware limit; zero disables the rescaling operation. No target-size,
batch, transport, VRAM or timeout ceilings are expanded. Illustrious only;
Anima, VAE precision, external VAE, clip skip, LoRA and other generation modes
remain outside this slice. Release runtime install/repair is still separate.

Compatibility refinement from executed review: older v1 drafts accepted CFG
Rescale `1`. Their loader/preload range remains 0–1; only edit/admission limits
are 0–0.99. A hydrated `1` displays an operational diagnostic and blocks
Generate, while unrelated edits remain saveable. Invalid raw input that was
never acknowledged by Main is a separate error and blocks Save/Generate until
corrected. Reset removes the optional field without touching result provenance.

## Planned evidence and controls

- Real ProjectService draft/shadow/Save/reopen and strict IPC validation.
- Frozen request/queue/recovery/Retry, incompatible worker refusal and portable
  acceptance/provenance including legacy absence and explicit zero.
- Native built Electron control → IPC → main → SQLite/worker request; its
  controlled inference peer proves wiring, not CUDA or checkpoint loadability.
- Actual pinned Diffusers tensor execution plus a local NVIDIA/checkpoint smoke:
  same seed and inputs, default versus explicit zero identical, nonzero changes
  output. The local development environment is not a released runtime installer.
- Isolated semantic mutations remove freeze, capability gating, worker argument,
  portable recording or legacy-unknown handling; restore and rerun the baseline.
- Inspect real native screenshots at the normal and smaller supported window;
  code checks alone do not verify appearance. This is implementation self-review,
  not a blind independent audit.

## Executed evidence

Artifacts:
`~/.codex/artifacts/imagegen-studio/cfg-rescale-2026-10-02/`.
Tests and screenshots below inspect this implementation working tree; the
delivery manifest records its final file hashes and commit. This is self-review
with separate agents reviewing the implementation, not a blind experiment.

| Boundary                          | Executed result                                                                                                                                                                                                    | Practical limit                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full app suite                    | `pnpm run app:test`: 829 passed, zero failed/skipped (`app-tests-verified.log`)                                                                                                                                    | SQLite/filesystem and subprocess transport are real; unit/integration ML responses remain controlled                                                                                                     |
| Python pinned ML suite            | 168 passed, zero skipped (`python/full-pinned.log`); lightweight locked dev env: 166 passed, two explicit ML dependency skips                                                                                      | Temporary test environment references the existing pinned local ML packages; no release installation                                                                                                     |
| Actual Diffusers tensor execution | Tiny CPU SDXL through production `run_sdxl_pipeline`: absent/zero equal, nonneutral noise/output changes, factors 0.3/0.7 interpolate, CFG=1 neutral                                                               | Tiny randomly initialized components establish adapter semantics, not image quality or model coverage                                                                                                    |
| NVIDIA checkpoint execution       | Production parser/qualification/loader/conditioning/PNG publication; same seed42, 128×128, two steps; absent and explicit zero pixel-identical; 0.7 changes pixels (`gpu/report.json`)                             | One local bismuthIllustrious_v80 checkpoint, epsilon, RTX4080; source lineage, other checkpoints, larger targets, all schedulers/v-pred quality and runtime distribution are not qualified by this smoke |
| Production native flow            | Built Electron → control/IPC → frozen queue/Retry → controlled inference peer → Add → Save/reopen/comparison; legacy1 opens, saves an unrelated edit, refuses Generate and resets; raw invalid text blocks actions | Main/model integrity/SQLite/filesystem/acceptance are real; peer replaces actual CUDA and output pixels                                                                                                  |
| Final built comparison regression | Seven native checks, zero page errors (`native-comparison-final/native-comparison-report.json`)                                                                                                                    | Includes existing signed assets and read-only/stale-response contracts; no inference                                                                                                                     |
| Prototype regression              | `pnpm run prototype:test`: 167 passed (`prototype-tests-final.log`)                                                                                                                                                | Existing mocks do not prove production persistence                                                                                                                                                       |
| Static/build checks               | Full typecheck, lint, app build; Python Ruff format/check and BasedPyright, including the explicit GPU script                                                                                                      | Successful checks are scoped to the changed tree and pinned development dependencies                                                                                                                     |

The full native Generate run has 31 checks, 35 screenshots and 11 viewport
checks. Actual screenshots at 1380×900 and 900×620 were opened: the numeric
control/Reset/diagnostic fit the approved compact panel; recorded0.7/current0.2
are readable in comparison; legacy1's warning and Reset remain reachable.
These visual checks do not claim a full accessibility certification.

### Sensitivity and failures retained

**21 isolated semantic mutations were detected**: nine backend (freeze,
queue/staging agreement, old-worker admission/Retry/wire compatibility,
portable zero/unknown, failed-runtime capability reuse), six Python (parser,
range and generation/helper forwarding, real tensor factor behavior), six
UI/draft/comparison (zero/unset sync and storage, legacy unknown, hydrated
Save versus operational Generate, old-worker nonneutral reason). Each owner
restored the original copy and reran the relevant green baseline. Reports:
`backend/mutation-report.json`, `python/mutations.json`, and
`ui/mutations/{results,legacy-save-results,capability-gate-results}.json`.

Interim failures are retained, rather than counted as successful evidence:
initial parser/actual-adapter RED before implementation; reused scratch-base
and legacy wire fixture mistakes in new TS tests; a stale build's unavailable
control; wrong native close/provenance/asset-fixture API usage in the extended
harness. Review caught and corrected portable/preload legacy1 rejection and
hydration blocking Save. Parallel whole-suite runs also encountered the
unchanged Anima install wait timeout and a preset disclosure locator timeout;
their focused controls and subsequent complete app/prototype runs passed.
No timeout was enlarged or assertion removed to obtain green.

Release runtime install/repair, img2img, LoRA, Anima and the remaining Advanced
Options are still open. No PP readiness status or Phase2B/2C exit criterion is
raised by this single parameter.

## Follow-up: installed CFG Rescale (06.10.2026)

[Installed CFG qualification](./phase-2c-installed-cfg-rescale-research.md)
separately connects actual Advanced Options, a noneditable installed trained
worker, matched unset/zero/nonzero txt2img decoded pixels and nonzero opaque
img2img wiring to Add/Save/reopen/comparison. The execution counts and limits
above remain historical evidence from this checkpoint; they are not retroactively
attributed to the new profile. Remaining options and release gates stay open.
