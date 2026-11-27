# Illustrious XL v0.1 ordinary Smart Inpaint on a tabletop

One installed Studio request preserved every pixel outside its frozen
contribution. The generated image contained no recognizable apple. This
qualification measures useful insertion and exact protected-pixel preservation
as separate criteria on a single frozen ordinary Smart Patch.

## Inputs and source

The Studio run used `f1b50c4b0898a9f570eee010bb7c284acb8eebff` and the existing
signed `release-c12dcb5f-8741-4d0d-8df0-ff9a67a072a9` CUDA runtime. The fixture
pins the official Illustrious XL v0.1 epsilon checkpoint, its embedded Auto VAE,
and the original empty pale tabletop PNG. The source and processing canvases
are both 512×512. The raw edit rectangle is `[64,448) × [256,464)` with Gaussian
coherence radius zero and an 8-pixel compositing fade. The ordinary run has no
Regional Guidance Layers or external conditioning resources. It uses seed 123,
Euler ancestral on the Normal schedule, 25 nominal steps, strength 0.8 and CFG 5.
The positive requests one red apple with a green leaf and a visible contact
shadow. The preregistered contract SHA-256 is
`e614ed40c6c04df147e8b0e55cee0963b3f85f0d343d346b39f63f20c699246e`.

Reviewed clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
uses `graftInpaint` and `graftMaskTail` to connect the encoded source, the gradient
KEEP mask, denoiser, expanded feathered mask and composite. The current nodes
are `invokeai/app/invocations/sd/{create_gradient_mask,denoise_latents}.py`,
`invokeai/app/invocations/image.py::ExpandMaskWithFadeInvocation` and
`invokeai/app/invocations/composition-nodes.py::InvokeImageBlendInvocation`.
By default `DenoiseLatentsInvocation` uses `_old_invoke` and the
`AddsMaskGuidance` gradient-mask path in
`invokeai/backend/stable_diffusion/diffusers_pipeline.py`. The installed
comparison verified the default denoiser selection at startup.
Studio uses the existing [capture and compose](../../src/main/projects/project-smart-patch-generation-input.ts)
and [masked scheduler path](../../worker-python/src/imagegen_worker/sdxl_outpaint.py).

## Installed Studio result

Main saved and reopened an owned `.igs`, captured its Smart Patch and sent one
request to the installed CUDA worker. The request completed 20 actual steps on
the RTX 4080. CPU preparation and GPU generation workers and their controller
exited. Peak sampled GPU usage was 8,424 MiB, the scope reached 8.52 GiB and swap
and OOM counts were zero. The package bytes stayed exact and the three checked
queue, candidate and acceptance tables stayed empty.

The source, processing source and worker model source decode to identical RGB.
An independent read-only check rehashed 77 installed runtime and 17 configuration
pins and reconstructed the opaque sRGB composite. All 163,636 pixels at zero
contribution and all 162,304 pixels in the literal protected rectangles stayed
exact. One connected nonzero alpha component covers 98,508 pixels. Of these,
8,908 contain partial alpha. The expanded fade may extend past the authored hard
rectangle. A copied-output mutation changed both the frozen contribution and
matching world RGBA at one protected pixel. With the modified artifact hash
recorded in the isolated test witness, the actual pixel oracle refused at the
literal-protected-rectangle assertion. The original artifact remains valid.

Both blind reviewers saw no recognizable red apple or contact shadow. They saw
a tinted patch with a visible right boundary across the table-to-wall join.
The processed RGB shows the same omission before composition. The visual gate
failed for this recipe. Human acceptance and the overall MVP visual step remain
open.

## Matched installed InvokeAI comparison

The first Invoke 6.14.3 request reached the native queue and stopped at the
image encoder because the isolated offline cache lacked the SDXL Diffusers
configuration. It produced no denoised image. The second run kept the same
12-node graph and authored KEEP mask. It populated a fresh temporary cache
with the 17 verified configuration files from the signed Studio runtime. The
installed `snapshot_download` located this configuration offline before the
run. The cache contained configuration and tokenizer data only.

The installed app accepted the single request, ran 20 Euler ancestral steps,
and returned separate gradient, fade, decoded processing and final composite
results through the queue's prepared-node mapping. The probe used the original
installed nodes with an isolated localhost app root. It ended after 33.945
seconds with zero swap and OOM, and its process exited. The pinned source PNG
and checkpoint stayed exact. The returned opaque PNG had no ICC tag, and the
preservation comparison uses exact decoded RGB channels.

After inversion from KEEP to contribution polarity, the installed Invoke
final fade is byte-identical to Studio's `af8a8588013d1098d8d0bc868ab9bbe7349631ca0b461f149e33e3697bbc337f`
alpha plane. Invoke also changed zero of the same 163,636 protected pixels.
Both independent visual reviewers described two ambiguous reddish forms and
an interrupted table-to-wall join. They found no recognizable single apple
with a contact shadow. Both paths fail the same visual criterion with different
rendered content. The comparison matches the authored inputs and compositing
mask. Each engine uses its own latent and scheduler execution. The result is
bounded to this one seed, source, edit and checkpoint.

The Studio evidence is under `runs/illustrious-smart-tabletop/20261127-prepared`.
Invoke results are under `runs/illustrious-smart-tabletop-invoke/20261127-r2`.
The preceding `20261127-prepared` Invoke directory retains the offline loading
failure. Both original media paths, a five-image comparison sheet, visual
observations, the protected-pixel counterexample and verified app and Project
payload archives were kept. Cleanup reclaimed 22,614,016 allocated bytes of
raw owned payloads and scratch after physical process exit.
