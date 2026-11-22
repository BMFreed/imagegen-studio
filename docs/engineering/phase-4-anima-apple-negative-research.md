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

## CUDA and visual verdict

A separate host GPU workload reduced available GPU memory and system
memory below the preflight for the bounded CUDA run. This checkpoint
ends at CPU preparation. Run the same three cases with fresh bounds
and current source pins, then score the original PNGs blind. The prior
visual gate and product promise statuses stay open.
