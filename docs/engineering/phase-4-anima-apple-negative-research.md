# Anima local negative on a red apple

The [two-scarf trial](./phase-4-anima-negative-spatial-utility-research.md)
left both red scarves visible in Studio and in the direct InvokeAI
comparison. This follow-up moves from an accessory to a whole object.
It also uses a different source, denoising strength and prompt weight,
so it cannot isolate the reason for the earlier result.

## Source and controls

Studio base `14624fa8a1be7d4a41a32bc874eba4afb9b47421`.
The clean local InvokeAI checkout was
`4875d96531ca6712b288f6e660fcbb34143408c1`. The relevant current paths are:

- `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
  calls `addRegionalGuidance.ts`, which adds each regional negative to
  the negative conditioning collector with the owner's alpha mask.
- `invokeai/app/invocations/text_encoder/anima_text_encoder.py::_encode_prompt`
  encodes the cleaned prompt and weights. The denoiser
  `invokeai/app/invocations/anima/anima_denoise.py` passes distinct positive
  and negative banks to `invokeai/backend/anima/regional_prompting.py`.
  Global negative is available across the image.
- `invokeai/backend/anima/anima_transformer_patch.py` applies the regional
  masks to alternating transformer blocks.
  `invokeai/backend/anima/scheduler_driver.py` maps Heun logical
  start 7 to physical index 14, giving 25 evaluations from 39 timesteps.

The input is the exact opaque 512×512 PNG from the
[tabletop placement run](./phase-4-anima-countertop-scene-research.md),
seed 124 with apple assigned left. It has a red apple on the left,
a blue mug on the right and a continuous tabletop against a plain wall.
Its SHA-256 is
`db013bc05f95c01b6a4cc5442560fe1d31b37876d834cc4061d33580fbb26af7`.
The follow-up uses the existing signed worker and Cyberfalafel Anima
model bundle. The IMG seed is 123, with Heun 20, CFG 4, strength 0.65 and
Auto VAE. Two disjoint mask owners cover the full left and right halves.

- Global positive `anime still life illustration, a continuous pale wooden tabletop against a plain light blue wall, front view, even lighting`
- Regional positive for each owner `a pale wooden tabletop against a plain light blue wall, even lighting`
- Global negative `(blur)0.75, noise`
- Local negative `(red apple)2.0`

All three requests carry the same source, sampling and positive and
global negative conditioning. The baseline leaves both local negatives
empty. The treatment adds the weighted negative to the left mask over
the apple. A spatial control adds the same negative to the right mask
over the mug. Both controls must preserve a recognizable red apple and
blue mug in the original halves. For a pass, the treated apple must be
absent or substantially less recognizable than in both controls, with
the mug and scene preserved. Color shifts and pixel differences alone
are insufficient. A fixed apple ROI records red pixels as a secondary
measurement. Two readers inspect shuffled original PNGs before reveal.
The design tests suppression of one apple on one source at one seed.

The qualifier reuses the existing path from frozen Project and queue
preparation to installed-worker admission. It retains the previous
two-scarf recipe as a separate profile.

## Import control

Run `20261123-r1` stopped before all worker submissions. Its fixture
sent the held RGB PNG to the classifier for composed RGBA targets.
The revised fixture sends the same source bytes through regular Raster
Import and checks IMG on the normalized target. The corresponding
Invoke graph callers are
`invokeai/frontend/webv1/src/features/nodes/util/graph/generation/buildAnimaGraph.ts`
and `addImageToImage.ts`. The VAE consumes the composite image in
`invokeai/app/invocations/vae/anima_image_to_latents.py`.
Run `20261123-r2` records the replacement path and retains the original
prompts, masks, seed, sampling and rubric. Its control contract SHA-256
is `4ef8180b22f2e686fabbecf7ffcb593403b1c2ffbf17b0fa2fb4ed35e12ad9b4`.

## CPU preparation

Run `20261123-r90` completed all three cases through Main and the
installed CPU Project worker. It imported the source, saved and reopened
each authored Project, composed the capture and prepared the same IMG
target for each case. The canonical RGBA PNG has SHA-256
`c5ca320f02b1d2ec433246b5ab60cbc73ea18be68cedf7ba30541d0bd483e3de`.
Decoded RGBA pixels and the sRGB ICC profile match the original RGB PNG
exactly.

An independent read-only audit passed 269 assertions on the three saved
packages, the closed SQLite, the captured targets, both full-half alpha
planes and the compiled prompt owners. The normalized documents differ
only in the local negative assignment. The weighted span is `[0, 9)`
at weight 2. All three prepared plans have seed 123, CFG 4, strength 0.65,
logical start 7 and physical begin 14, with 25 progress steps planned.
The closed SQLite passed integrity and foreign-key checks. The CPU scope
closed with zero denoising requests after 30.118 seconds.

The final focused app subset passed 238 tests with zero failures or skips.
Typecheck, scoped ESLint and the application build passed.

## Installed CUDA and visual verdict

R2 deferred CUDA at preflight. R3 rebound the same source and contract
to Studio `8bcba3bdba1af783973e4ab798a984771421904e`.
The three cases completed on the installed worker in 165.401 seconds,
with 25 evaluations each. Peak sampled VRAM was 6,946 MiB. The
zero-swap scope reached its 12 GiB limit with zero OOM events. All three
workers and their controller exited. The independent audit passed 969
assertions, including exact source pixels, saved Projects, 77 installed
pins, 17 signed configuration pins and all three model bodies.

Both blind readers identified a dark wooden box in the center of all
three outputs. The pale wood surface and blue wall remained. Both the
baseline and the right-mask control lost the apple and mug. The left
treatment also showed neither object. The preregistered visual result
is **INCONCLUSIVE** because the controls lost the objects that the
experiment meant to track.

The original apple ROI contained 9,906 red pixels. It contained 1,913
after baseline, 24 after the left treatment and 74 after the right
treatment. The readers identified no apple in any of those regions.
The run measures this source, seed and recipe. Visual suppression and
the product promise remain open. A matched baseline that retains the
subjects is the remaining prerequisite for another spatial test.

The run retains the original PNGs, blind observations, condition map,
comparison, exact captured inputs and three saved Projects. The verified
8-entry archive preserves the closed payload, including SQLite. Scratch
and blind copies released 5,996,544 allocated bytes.

## Baseline with named subjects

Studio base `419aef9bc1f65424eb50b96fda0bbf94d0550e88` and clean
InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`. The current
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
calls `addRegionalGuidance.ts` to construct the positive conditioning in
each region. The denoiser in
`invokeai/app/invocations/anima/anima_denoise.py` calls
`invokeai/backend/anima/regional_prompting.py`. In masked blocks the
global positive covers the complement of the positive regional masks.
Here the two masks cover the whole target, so each mask receives its
own subject description.

The new profile prepares one baseline with the same 512×512 IMG source,
Heun 20, strength 0.65, CFG 4, seed 123, Auto VAE, mask geometry and
global prompts. Both local negatives are empty. The only intended
changes are the two local positives.

- Left `a red apple with a small green leaf on a pale wooden tabletop against a plain light blue wall, even lighting`
- Right `a blue ceramic mug with a loop handle on a pale wooden tabletop against a plain light blue wall, even lighting`

The acceptance control requires a recognizable red apple on the left,
a recognizable blue mug with a loop handle on the right, and a coherent
tabletop and wall. The single baseline can establish whether that scene
survives. A later matched side comparison would measure the local negative.

CPU run `20261123-r90` saved and reopened the Project and prepared the
exact R3 target PNG. The independent audit passed 129 assertions and
confirmed the two intended positive changes and the full frozen Heun
window with 25 evaluations planned. It issued zero denoising requests.
The CPU manifest retained a descriptive sentence about identical positives
from the earlier recipe. The correction is recorded separately, with both
literal prompts and the actual mask assignment verified.

The 238 focused tests, typecheck, scoped lint and build passed for CPU preparation.

### Installed one-request baseline

Studio `31054adae45ac22325ab4a21b8005b6031ef45f0`. Run `20261123-r1`
stopped before worker startup. The runtime idleness check received
`EACCES` reading the executable link of the KDE System Monitor network
helper. The helper exited, and R2 repeated the same checks with only the
source path rebound. R1 and R2 kept the existing idleness guard.

R2 issued one installed CUDA IMG request with the two named positives
and zero local negatives. The result is a 512×512 PNG with SHA-256
`efe2730e725093db6caac70fd807adff200c0d5378911db6fe4fd12e335155e2`.
Both readers, given the source and an anonymous output, recognized a red
apple on the left and a separate blue ceramic mug with a visible loop
handle on the right. Both saw a continuous pale tabletop and light blue
wall. This passes the control criterion for the fixed source and seed.

The worker completed all 25 Heun evaluations. Peak group memory was
9,652,989,952 bytes, maximum sampled worker VRAM was 6,556 MiB, and the
unit finished in 47.418 seconds. The independent check passed 467
assertions over the current runtime, resolved model identities, frozen
Project, masks, compiled prompts, 25 progress receipts, output PNG and
physical exit. The native controller uses Main's captured inputs and the
installed worker directly. Its SQLite queue and accepted-result index
remain empty. The PNG, closed Project and SQLite archive, and exact
requests and reports are retained. Cleanup of the two attempts reclaimed
43,376,640 allocated bytes. Human acceptance remains open.

## Named-subject spatial comparison

The follow-up fixes the passing baseline's source, seed, installed
engine, model, mask owners, sampling and all positive prompts. It saves
and reopens the same Project for each case and retains each snapshot.
The cases are an empty-local-negative replay, `(red apple)2.0` on the apple
mask, and the identical negative on the mug mask. The previous baseline
provides a pinned decoded-pixel replay control.
Both spatial controls must preserve the apple, mug and scene. Both
condition-blind readers must see the treated apple disappear or become
substantially less recognizable, with the mug and scene preserved. An
equally weakened right-mask control leaves the spatial effect unresolved.

The fresh local InvokeAI check at
`4875d96531ca6712b288f6e660fcbb34143408c1` traced the caller
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
through `addRegionalGuidance.ts`. It routes the local negative and its
owner's alpha mask to the negative collector. The denoiser in
`invokeai/app/invocations/anima/anima_denoise.py` calls
`invokeai/backend/anima/regional_prompting.py` with image-wide global
negative permissions and separately scoped local masks. Studio's
qualification adds a separate finite three-case profile to the existing
probe, with no change in worker behavior.

The 242 focused tests passed without failures or skips. Typecheck, scoped
ESLint and formatting checks, and the app build passed.

### Installed spatial result

Run `anima-apple-negative-anchored-spatial/20261123-r1` used Studio
`64c3dc3d7200f7970ccbc3fdf233a525a7eaef9e`. Three requests completed, 25
Heun evaluations each. The new baseline matched the earlier PNG byte
for byte. Both anonymous orders produced the same observations. The
baseline and mug-mask control kept both subjects and the scene. The
apple-mask treatment also kept a recognizable red apple with stem and
leaf, a blue loop-handle mug, and the continuous tabletop and wall.
There were differences in the apple's highlights, while its shape and
recognizability persisted. The visual result is **NOT_QUALIFIED** for
this source, seed and weight.

The fixed 13,572-pixel ROI contained 9,906 red pixels in the input,
10,219 in the matched baseline, 10,370 with the negative on the apple
mask, and 10,053 with it on the mug mask. The visual criterion uses
recognizable subjects. This color count is a secondary measurement.

The read-only audit passed 539 assertions. It checked exact replay,
both negative owners and weighted prompt spans, the retained Project
snapshots and closed SQLite, 77 installed files, 17 signed configuration
files and physical exit of the controller and three workers. Peak group
memory was 9,157,402,624 bytes. Maximum sampled VRAM by case was
6,944 / 6,558 / 6,558 MiB. The unit finished in 129.579 seconds with
zero OOM events. This exercised the installed Studio worker. The
[prior Invoke scarf case](./phase-4-anima-negative-invoke-control-research.md)
used different source and subject prompts.

The three PNGs, source, blind observations, frozen requests and Project
snapshots remain available. The verified 8-entry archive retains the
closed payload. Cleanup released 6,045,696 allocated bytes of scratch
and blind copies. Human review and broader visual utility remain open.

## Current original Invoke denoiser on the matched apple scene

Studio base `a80b77de9138449759b03ffb56c607bded52db3f`, clean InvokeAI
`4875d96531ca6712b288f6e660fcbb34143408c1`. Run
`anima-apple-negative-invoke-control/20261123-r1` reuses the
[scarf source-control harness](./phase-4-anima-negative-invoke-control-research.md#original-denoiser-visual-control)
with the apple scene's exact saved Studio handoffs and the same three
mask assignments. The original denoiser, transformer, prompt parser,
weighted T5 tokenization, regional masks and Heun driver execute from
the pinned Invoke source. The current checkout has no app environment.
The control uses the signed Studio runtime with its held VAE posterior,
Qwen encoder, and RGB decode, plus the same pinned Einops package as the
scarf control. The app registry, frontend and Invoke VAE's ambient
posterior draw are outside this comparison.

The fresh source trace follows `compileCanvasGraph.ts` into
`addRegionalGuidance.ts`, `app/invocations/text_encoder/anima_text_encoder.py`
into `backend/anima/prompt_weighting.py`, and the main denoising path in
`app/invocations/anima/anima_denoise.py` into `backend/anima/regional_prompting.py`,
`anima_transformer_patch.py`, `scheduler_driver.py` and
`backend/flux/schedulers.py`. These paths are relative to `invokeai/`.
The application ports bind the original bodies of 16 denoiser methods.

The five raw prompts match Studio in cleaned text, spans, Qwen IDs,
attention mask and states, and T5 IDs and weights. Both native Heun
arrays match Studio exactly, starting at physical index 14 with 25
evaluations and 13 logical progress updates. Invoke's initial source
preblend uses sigma `0.8478260869565218`. Studio blends at the first
native Heun sigma `0.8378547430038452`. The Invoke even-block mask leaves
global positive support closed over the two full half masks. Its global
negative remains image-wide and the weighted local negative appears
only on the selected half. All three calls retain the original patch
and restoration checks on the 28-block transformer.

The original denoiser completed all three CUDA cases in 46.042 seconds,
with 25 positive and 25 negative calls per case. Peak group memory was
8,938,569,728 bytes and peak reserved Torch CUDA memory was 6,949,961,728
bytes. Swap and OOM events were zero. Both blind readers recognized the
apple on the left and the blue loop-handle mug on the right against the
continuous tabletop and wall in every case. Both controls pass and both
readers fail the apple-mask treatment criterion. Selective suppression
is **NOT_QUALIFIED** in both engines for this exact recipe.

| Engine | Baseline | Negative on the apple | Negative on the mug |
| --- | ---: | ---: | ---: |
| Studio | 10,219 | 10,370 | 10,053 |
| Current Invoke source control | 10,333 | 10,322 | 10,043 |

Counts are red pixels in the same 13,572-pixel source-defined ROI. The
visible apple remains fully recognizable. More than 261,000 pixels differ
in each matched Studio/Invoke pair. The comparison closes the exact-scene
donor question: the original Invoke path exhibits the same failed effect.
It provides no verified fix to port for this recipe. Other sources,
settings and human acceptance remain open.

The independent byte audit passed 946 assertions, rehashed 51 source
and 124 input pins, reconciled 685 loaded tensors and three RoPE buffers,
and verified the PNGs and physical exit. A separate source audit checked
the unchanged method binding. This read-only audit used the retained run
and made no additional CUDA calls. The run keeps the three PNGs, exact
adapters and preregistration, owner and scheduler receipts, anonymous
observations and verdict. Cleanup released 5,386,240 allocated bytes
from two temporary paths. All 31 sealed files matched after cleanup.

## Image-wide negative on the same apple

Studio base `9cac30bac0736492d030076db793469e1e4c0a7c`. In clean InvokeAI
`64ff2c600f04d220e470fdaeec570bd402af42a7`,
`invokeai/frontend/webv2/src/features/generation/core/graph.ts::buildAnimaGraph`
connects the unmasked global negative to the CFG collector. The canvas
`compileCanvasGraph.ts` calls `addRegionalGuidance.ts` to attach local text
and its owner mask. `invokeai/app/invocations/text_encoder/anima_text_encoder.py`
uses `invokeai/backend/anima/prompt_weighting.py` to parse and weight the text.
`invokeai/app/invocations/anima/anima_denoise.py` passes the negative bank
to `invokeai/backend/anima/regional_prompting.py` with global coverage.
The new Studio profile uses the existing saved Project, capture and
installed-worker paths.

The visual question was whether the same weighted phrase suppresses the
apple when it has image-wide coverage. The single new IMG request kept
seed 123, 512×512, Heun/20 steps, strength 0.65, CFG 4, the exact target,
both regional positive texts and both mask owners. Both local negatives
were explicitly empty. The global negative became
`(blur)0.75, noise, (red apple)2.0`. The resulting text
`blur , noise, red apple` has spans `[0,4)` at 0.75, `[4,14)` at 1 and
`[14,23)` at 2. The separate literal oracle matches the current Invoke
parser on this input. This control changes the global encoder input and
the span scope together. It measures responsiveness to the phrase in
this recipe.

The exact earlier baseline and both local-negative outputs were
compared with the new PNG. Two readers who had no condition labels saw
a recognizable red apple with stem and leaf, a blue handled mug and a
continuous table edge in all four images. The global output changed
the stem, leaf and highlights, and retained the object. The fixed
13,572-pixel ROI contained 10,353 red pixels with the global negative,
compared with 10,219 in the baseline, 10,370 for the apple mask and
10,053 for the mug mask. Visual verdict **NOT_QUALIFIED**. This recipe
also lacks useful suppression when the phrase is image-wide. Human
acceptance and the separate regional placement tests remain open.

The installed worker completed one submission and 25 ordered Heun
evaluations in a scope lasting 53.741 s. Worker VRAM reached 6,556 MiB.
Peak cgroup memory reached its 12 GiB limit with 1,651 `max` events,
zero swap and zero OOM. The controller and worker exited. An independent
audit checked the actual requests against all three pinned controls,
the resulting PNG, saved Project and closed SQLite with 30 migrations.
It matched 77 runtime and 17 config files, the live identities of all
three model files and both source snapshots. The runner streamed the
model file digests.

`runs/anima-apple-negative-global/20261125-r1` keeps the exact contract,
PNG, two blind reports, request, saved Project, closed SQLite and
audit. Cleanup removed six owned temporary paths and reclaimed
6,139,904 allocated bytes after checking all 30 retained files.
