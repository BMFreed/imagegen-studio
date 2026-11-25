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

## Matched installed InvokeAI control

Studio base `8dde2807839a1bb96a224f8688c8f9681131a4b7`. The local
InvokeAI checkout was clean at `64ff2c600f04d220e470fdaeec570bd402af42a7`.
Re-read `frontend/webv2/src/features/generation/core/graph.ts`,
`canvas/compileCanvasGraph.ts` and `canvas/addRegionalGuidance.ts`;
the canvas consumes a separate alpha tensor and IP-Adapter invocation
per owning region. The installed comparison executed the unmodified
InvokeAI 6.14.3 backend. The recorded AST comparisons match the current
checkout for `AlphaMaskToTensorInvocation.invoke`,
`IPAdapterInvocation.invoke`, both denoiser adapter preparation methods,
the denoiser's regional-mask preprocessing and `IPAdapter.get_image_embeds`.
The current checkout has additional encoder registration and denoiser
behavior. The executed version keeps its own source-latent, noise,
attention, scheduler and output policies.

Three actual Invoke queue items reused the exact opaque scene, original
duck and camera PNGs, checkpoint, adapter and ViT-H encoder. The
Invoke mask uploads reproduce both full Alpha8 planes from the saved
Studio handoff. PNG upload roundtrips preserved the decoded source,
references and mask alpha. Ordinary authored zero references. Assigned
and swapped kept both masks and the full weight-1 step range and changed
only the image-to-mask assignment. Seed 123, 512×512, Euler 30, denoise
0.6, CFG 5 and untiled FP16 VAE matched the prior job settings.
The real graph and adapter outputs confirmed the submitted associations.

The three Invoke jobs completed. In two independent blind reviews of
all six outputs, the ordinary images had two recognizable empty plinths.
Both engines' reference treatments distorted the shapes and introduced
similar bright edge spill and floating fragments. The swapped images
had the most convincing camera-like circle in the left region, with a
deformed body. Neither engine showed the required recognizable duck
and camera pair in both placements. Visual verdict **NOT_QUALIFIED**
in both engines on this recipe. This comparison supplies a shared
limitation and no observed divergence on the visual gate. Keep the
existing backend behavior for this case. Human acceptance and other
scenarios remain open.

The isolated service finished in 66.96 s. Sampled server VRAM reached
6,758 MiB. The cgroup reached 12 GiB with 8,389 memory `max` events,
zero swap and zero OOM. The server and controller exited after a normal
SIGINT shutdown. No new Studio models or images were generated.

The independent audit joined all three queue records to the submitted,
accepted and PNG-embedded graphs. It verified both executed
reference-to-mask associations, five decoded uploads, 26 source pins,
17 offline config files and the closed SQLite state. It replayed 237
checksum-valid WAL frames across 23 commits. The closed snapshot has
three completed queue items, eight images and three registered resources.
It passes integrity and foreign-key checks.

The [comparison controller](../../scripts/qualify-invoke-reference-placement.py)
uses the existing isolated Invoke driver. The run under
`runs/invoke-regional-reference-placement/20261125-r1` retains the
original outputs, masks, pinned inputs, graphs, blind observations and
SQLite evidence. Cleanup released 22,470,656 allocated bytes after
checking the 73 retained files.
