# Regional reference placement on two display plinths

The [ordinary IMG scope decision](../specs/00-product-scope.md#продуктовые-нецели-mvp)
moves regional acceptance to a separate spatial task. This comparison
asks whether an Illustrious user can move two recognizable reference
subjects between fixed canvas regions. A rubber duck and a film camera
have distinct silhouettes. The display geometry has anchors outside the
two masks.

## Fixed experiment

Studio base `1fe659d357445ee5bf6d99d0bd721475fbd96059`. Re-read clean
InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/features/generation/core/canvas`,
`compileCanvasGraph.ts::graftImageToImage` connects the opaque source
encoder and selects the Img2Img denoising range. In
`addRegionalGuidance.ts::addRegionalGuidance`, the original image and
owning mask feed the same IP-Adapter invocation. The donor
`invokeai/app/invocations/sd/ip_adapter.py` and
`sd/denoise_latents.py::prep_ip_adapter_image_prompts/prep_ip_adapter_data`
resolve the image encoder, adapter, projected image embeddings and
owning masks. `invokeai/backend/stable_diffusion/diffusion/regional_ip_data.py`
supplies the nearest/pooled mask pyramid and
`shared_invokeai_diffusion.py` supplies the per-step reference inputs
to UNet attention.

The fixture uses Studio's Project import, Save/reopen, current canvas
capture, reference capture and installed worker. The ordinary saved
case authors an empty Regional Guidance list. The two treatments each
have two stable owning layers with one original reference apiece.
The left and right masks are half-open rectangles
`[0,192) × [64,384)` and `[320,512) × [64,384)`. The boundaries
fall on the 64-pixel grid used by the coarsest reference attention
level. The assignment changes from duck/camera to camera/duck while
the two owners and their projected alpha bytes stay fixed. The target,
base job and sampling are fixed. Both owners carry image guidance only.

The source and two square references were generated as original
illustration assets and normalized to opaque sRGB RGBA at 512×512.
The source has two empty plinths, a center divider, a teal upper trim
and a wood ledge. The global prompt describes a gallery display
with two collectible objects and leaves both identities and their
location to the comparison.

All three jobs use the exact official Illustrious XL v0.1 epsilon
checkpoint, seed 123, 30 nominal Euler/Normal steps, leading spacing,
ZTSNR off, strength 0.6, CFG 5, rescale 0, and the embedded FP16 VAE.
The worker's reference profile uses its existing full method,
weight 1.0 and full step range. The maximum is three native jobs with
19 progress events each.

The preregistered visual gate calls for one identifiable duck and
one camera on their assigned sides in both treatments, with the
ordering reversed by the swap. The central divider, upper trim and
plinth bases must remain recognizable and sensibly positioned in
the control and both treatments. The rubric judges identity from
shape and attributes, including a bill and a round camera lens.
Blind observations of the three full originals precede the key
reveal. Human acceptance is recorded separately.

## Results

Native **PASS**. All three saved Projects reopened through the real
loader, used the same 512×512 target and submitted matching base
requests. The two treatments captured the same two region and mask
identities, revisions and projected Alpha8 hashes. The worker inputs
contained the original A/B then B/A PNGs in the owning order.
Three dedicated workers completed 19 events each and exited normally.
The controller finished in 129.552 seconds. It used 7,881,179,136
bytes of peak group memory with zero swap, and the maximum sampled
worker VRAM was 8,460 MiB on the RTX 4080.

Visual **NOT_QUALIFIED**. Both blind readers saw two display locations
and a recognizable center divider. The ordinary output retained the
clearest plinths and trim. The treated outputs added rounded and dark
forms around the plinths, with artifacting in the surroundings.
Neither treatment showed a recognizable duck and camera pair. The
swapped case had a camera-like ring on the left without a coherent
camera body, while the right side lacked a readable duck. The
recognizable swap and preservation gate remains open for human
acceptance.

The independent audit verified the two masks in both treatments,
the actual captured reference PNGs, the common base request and exact
opaque target, 33 saved package members and 30 migrations in the
closed private database. It also verified three distinct decoded
outputs, physical exit of the controller and workers, the checkpoint
and all three regional resource digests, 77 installed and 17 config
pins, and current Studio and Invoke sources.

Typecheck, scoped lint, the application build and 170 focused checks
passed. The initial typecheck found missing local annotations in the
fixture. The final annotation-only delta has identical parsed emitted
JavaScript to the executed fixture.

## Retention

`runs/regional-reference-placement/20261121-r1` retains the source and
reference PNGs, prompts, preregistration, native artifacts, saved Projects,
closed database, both blind reports, comparison and independent audit.
A compressed archive retains the two audited large wire receipts. Their
uncompressed member lengths and hashes verified before removal. Cleanup
reclaimed 62,681,088 allocated bytes across seven exact idle paths.
All 78 sealed files verified after cleanup. The shared checkpoint,
adapter, ViT-H and installed runtime remain dependencies.

Replay uses
[`qualify-installed-reference-img-utility.mts`](../../scripts/qualify-installed-reference-img-utility.mts)
with the placement profile and exact copied source and reference pins.
The launcher bounds the native run to 12 GiB, zero swap and 600 seconds.
