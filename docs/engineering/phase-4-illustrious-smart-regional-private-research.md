# Private Illustrious Smart Regional consumer

Base `c976e57f2d729d6095f88cbab54bdd6f00bddbb8`. High risk: complete-input
identity, native borrowed state, source/KEEP separation and exclusive output.
This slice implements a private material consumer before public admission,
descriptor/capability delivery and installed-app qualification. PP-001/005/007/008
remain **«Пока не обещать»**. See the current remaining-work checkpoint in the
[roadmap](../specs/01-implementation-roadmap.md).

## Source and design

Freshly read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
(mode graft before regional collector), `addRegionalGuidance.ts` (separate signed
conditioning), `invokeai/app/invocations/sd/denoise_latents.py`
(`_preprocess_regional_prompt_mask`, `_concat_regional_text_embeddings`, callers
in `get_conditioning_data`), and
`invokeai/backend/stable_diffusion/diffusion/regional_prompt_data.py`
(NEAREST latent geometry followed by max-pool attention levels). Global signed
conditioning remains available image-wide; inverse-mask auto-negative is excluded
by Studio's accepted contract.

Reuse the existing coherent Smart/Regional capture, original Smart execution
request/parser, Illustrious recipe/geometry/conditioning/attention/denoising,
resource loader and processing-output publisher. No new classifier, queue,
numerical loop, acceptance wrapper, `.igs` field or provenance field. Selected
Smart settings own all global and inherited negative prompts; Current Canvas
settings are only compared as part of coherent lease acquisition.

The existing Canvas geometry assumes world size equals processing size. Smart
does not: a negative-origin, non-multiple-of-eight WORLD bbox is valid. Adapt
Invoke's direct world-to-latent NEAREST sampling in the existing geometry owner.
Do not resize through an intermediate processing image, multiply by KEEP, use
display opacity or silently treat an all-zero sampled region as unrestricted.
Preserve explicit Smart recipe kind/source identity in the existing native owner.

## Finite acceptance

Four explicit private profiles bind the original TXT/IMG/INP/OUT commands.
TXT requires no source, null effective strength and zero KEEP; IMG uses prepared
RGB/numeric strength/zero KEEP; INP/OUT use prepared RGB and the independent
latent KEEP mask. Mode remains the pre-existing WORLD classifier's responsibility.
The recipe cannot reclassify raw source/mask pixels or authenticate Main lineage.

Initial consumer: Illustrious-family epsilon checkpoint, Euler/Normal with exact
existing scaled-linear/leading/no-zero-SNR noise profile, embedded Auto VAE,
CFG greater than1 through30, 1–200 steps, one static item. Processing64–512,
divisible by8; WORLD sides1–2048 and area≤4,000,000; at most3 regions/8 signed
streams,16KiB per consumed prompt/128KiB total; retain existing token/attention
ceilings. No enabled LoRA, active TI, references, batch/dynamic prompts, selected
VAE, v-prediction or other samplers are admitted by this slice. Those initial
limits are not a reduction of the final MVP contract.

Validate/detach metadata and all regional planes before model/resource/image
callbacks. Bind checkpoint SHA, mode, size, concrete prompts, seed, steps, CFG,
strength and exact noise policy to the one original execution request. Refuse
mixed revisions, owner collisions, malformed coverage, policy drift, unsupported
resources and changed files; no ordinary fallback or output publication on refusal.
Borrowed model/scheduler/hook state must restore after success or late failure.

Lower checks must include genuine Main capture/producer, static-policy negatives,
all four native tiny-model CPU modes, literal geometry/attention oracles,
regional-vs-KEEP controls and failure/restoration. A meaningful semantic mutation
must reach the native consumer and fail its output/permission oracle with a
neighboring GREEN and exact restoration. Tiny-model native execution does not
establish trained visual utility or installed delivery.

## Operations and evidence

Initial artifact inventory: approximately25GiB total (14GiB shared/11GiB runs),
61GiB filesystem free, GPU14,661MiB free of16,376MiB. Existing repository
`worker-python/.venv` is available for lower tests. Reuse it; do not duplicate
runtime/models, alter the protected installed worker or terminate other processes.
Serial lower native tests use bounded CPU/thread resources. Record actual checks,
mutations and retained files below after execution. Public guards remain closed.

## Implemented boundary

Main now detaches both leases with the existing shared coherence check, builds a
strict private Illustrious recipe and binds it to the original prepared Smart
command. No Anima prompt compiler or fabricated Current Canvas settings enter.
The Python complete-input capture owns metadata and raw alpha before callbacks;
the same original Smart file/resource verifier and exclusive RGB publisher remain
in use. Native shared owners accept an explicit private Smart source identity,
with historical Canvas defaults unchanged. The derived processing plane retains
Smart kind/source and exact direct world-to-latent NEAREST samples; existing
nearest8 and max-pool attention owners then operate unchanged.

Fresh source review additionally consulted Invoke's
`invokeai/app/invocations/vae/image_to_latents.py` and `latents_to_image.py`, with
Canvas graft callers: VAE dtype precedes scale/divide and denoiser conversion.
Studio's existing seeded posterior remains an adaptation; no new posterior/noise
algorithm or defaults were introduced.

## Executed checks and limits

ROOT ran **210 distinct Main PASS**:41 new private producer/binding cases plus169
existing Anima regional capture/frozen-input/public-guard neighbors. A real
ProjectService Save/reopen obtains the coherent lease; later live edits/Save do
not replace historical inputs. Unsupported selected resources/settings and mixed
revisions refuse before regional pixel callbacks. Original execution mismatches
for mode/model/noise/sampling/text/resources refuse without fallback.

ROOT ran **749 Python PASS, zero skips**:49 new private cases and700 existing
regional recipe/geometry/denoising and Smart execution/denoising neighbors.
Native tiny CPU models use original CLIP/Compel, attention processors, scheduler
and VAE in all four modes; literal signed context/permission oracles and exact
replay pass. Independent rectangular up/downsample geometry matches original
Torch NEAREST. Coverage/local-negative changes affect actual predictions/RGB;
local empty, inherited/dormant and zero-region controls retain their meanings.
Late VAE decode failure preserves exception identity and borrowed state; a fresh
call reproduces original RGB. The complete execution test uses real exact input
files and exclusive PNG publisher while explicitly substituting tiny-model
loading and CPU placement. It is not an installed or trained-model test.

TypeScript/Vue full typecheck, Python full basedpyright, full Ruff lint, scoped
changed-file Ruff format, app build and lint pass. Lint retains only the two
unchanged baseline script-parser exclusions (`qualify-installed-regional-init.mts`
and `qualify-regional-character-visual.mts`). Full Python format-check separately
reports the unchanged `test_illustrious_dpm_sampling.py`; its bytes match HEAD and
it was not edited. Initial TS source/fixture typing and lint diagnostics were
corrected; test counts above count each case once. Final fixture type-only repair
preserves callable fields in its Mutable utility; all41 cases were rerun green.
No prototype UI changes, browser tests, installed worker refresh or GPU jobs.
Build's existing chunk-size advisory and library deprecation warnings remain.

An isolated package/test copy changes only regional geometry samples to constant
255. Five original selections pass baseline; mutation gives **four post-native
permission RED plus one zero-region GREEN**; restored source gives five GREEN.
Each failing case has completed original native execution/decode/RGB conversion
before the exact consumed-permission assertion. No setup/OOM/timeout/error/skip
qualifies. All57 Python source identities restore in the isolated copy and stay
unchanged in the live checkout. Raw logs, JUnit and source manifest remain retained.

Independent bounded source-only review is **CLEAN** for changed/new source,
tests and direct shared consumers. It did not execute tests or read artifacts;
ROOT execution, independent source review, trained quality and public readiness
remain separate. Self-review also checked mode/source policies and file ownership.

## Retention and next consumer

Owned run: `runs/illustrious-smart-regional-private/20261110`. The verified archive
retains222 payload entries: isolated sources/tests, fixtures, native controls and
mutation outputs. Only that run's archived `payloads` tree was removed after
synchronous child exits, exact source restoration and no active path users.
Allocated file blocks reclaimed: **7,704,576 bytes**; observed filesystem free
increase8,019,968 bytes (directory allocation/concurrent accounting is separate).
Pytest's contained `current` symlinks caused the first conservative preflight to
stop; the second verified their archive link metadata and unlinked them without
following targets. No protected SHARED/model/runtime/Project/queue data changed.
Lifecycle is `retained`, `payloads: []`; no additional ML environment was created.

Next consumer is public Illustrious Smart Regional admission/frozen attachment/
mode-specific capabilities/descriptor/Retry, followed by installed qualification
using the original Smart world-output and explicit acceptance owners. This private
consumer alone does not complete those paths or the accepted MVP. Regional
reference-image inference, the contract-bound remaining combinations, visual
acceptance/capacity and release/Home/Model Manager/export gaps remain in the
updated roadmap. Promise and matrix statuses remain unchanged.
