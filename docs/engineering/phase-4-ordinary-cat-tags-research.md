# Prose and tag prompts on Illustrious XL v0.1

The [processing-resolution experiment](./phase-4-ordinary-resolution-research.md)
left both 1024px cat controls ambiguous. The
[common-runtime conditioning comparison](./phase-4-ordinary-invoke-conditioning-research.md)
matched Invoke's CLIP outputs for the prose prompt. This experiment changes
only the authored positive text within each same-seed pair. The model card
describes Danbooru training, and earlier count-tag work motivates trying a
tag-style phrase for this particular cat scene.
[Pinned author card](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/blob/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/README.md),
[two-character count diagnostic](./phase-4-illustrious-ordinary-count-tag-research.md).
The retained author-card copy has SHA-256
`0205e7c1d93c5c4fd6a2045ebf9ae3cd333684074385130d5b9e5aef3e051b45`.

## Source and preregistration

ImageGen Studio base `c2ed83aa89bb2e0e30ad390568c7257f54294290`.
Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/generation/core/graph.ts::buildSDGraph`
sends the literal text to SDXL prompt and style. Under `invokeai/app/invocations`,
`text_encoder/compel.py::SDXLCompelPromptInvocation.invoke` encodes both fields
and constructs size conditioning. `noise.py::NoiseInvocation.invoke` calls
`latent_noise.py::generate_noise_tensor` using the authored processing shape
and seed. `sd/denoise_latents.py::DenoiseLatentsInvocation.invoke` consumes the
noise and positive/negative conditioning. The probe reuses Studio's ordinary
saved-Canvas preparation and installed worker request without a new sampling
or conditioning mechanism.

The experiment freezes four calls in order. Each of seeds 123 and 124 gets the
old prose and the new tag-style prompt. All four use the official epsilon
checkpoint SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
the same transparent 1024×1024 target at world origin `(-13,5)`, Euler/Normal
30, CFG 5, Rescale 0, leading with false zero-terminal-SNR, embedded FP16 VAE
and empty negative. All four saved packages author `regionalGuidance: []`.
LoRA, embeddings and reference images are absent. The two prompt bodies are
frozen in the exact run contract.

Score one recognizable domestic cat head seen primarily from the front, with
two distinct eyes and two pointed ears against a simple light background.
An extra or fused face, visibly wrong subject, extreme crop or missing eye or
ear fails. An ambiguous species, anatomy or division of head and background
is inconclusive. Both tagged cases must pass the bounded gate. An independent
observer describes all four randomly numbered full PNGs before key reveal.
The final assessment distinguishes automated observation and human acceptance.

The runner borrows the signed installed engine whose interpreter, worker and
configuration were previously qualified. Its model catalog and saved `.igs`
files live under the new run. One serial user service has a 12 GiB RAM limit,
zero swap and a 600-second deadline. VRAM readings use the exact worker PID.

The first preflight refused the FUSE service that exposes test bootstrap
archives on the second SSD. It submitted zero native requests. The runner
now classifies the exact named storage service using its live PID and start
time, executable, cgroup, arguments and kernel mount entry. Only its
mountpoint operand is removed from the idle scan. The existing executable,
working-directory and environment checks still apply to that process and
every other process.

## Executed checks and visual result

The bounded native run passed. Four distinct installed CUDA workers each
completed 30 steps and physically exited. The requests in each same-seed pair
differed only in the positive prompt after removing request identities and
temporary paths. The two fresh prose PNGs reproduced the earlier 1024px
controls byte for byte. Both tagged PNGs changed in decoded RGB. The peak
sampled worker VRAM was 11,908 MiB. The shared service peaked at
9,267,945,472 bytes with zero swap and exited in 149.864 seconds.

| Seed | Prose                                                                                        | Tags                                                                            |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 123  | INCONCLUSIVE. A fantasy head with a forehead shape that could be a third eye or an ornament. | FAIL. Two eyes visible in an extreme close-up with the ears and muzzle cropped. |
| 124  | INCONCLUSIVE. A clothed animal-like figure in three-quarter view with ambiguous ear shapes.  | FAIL. One eye and one ear visible in a tightly cropped stylized face.           |

The tagged formulation failed both preregistered cases. Its wording includes
`close-up`, whose separate contribution to framing was unmeasured. The result
applies to these two matched pairs. Human acceptance and regional utility
require separate evidence. A source-anchored ordinary IMG control with explicit
red and blue wording would test whether the unchanged neutral Raster can be
recolored by text before assigning a role to reference images.

The independent audit verified four saved packages and output PNG/ICC bindings,
24 tables and 30 migrations in the private closed SQLite, one ready checkpoint,
and zero generation or accepted-result records. It rehashed all nine Studio and
six Invoke files, the 77 runtime pins, 17 configuration files and the complete
official checkpoint. Typecheck, app build, scoped ESLint and 172 focused tests
passed. The build emitted the existing chunk warning.

The four originals, saved packages, closed database, blind descriptions and
assessment stay under `runs/ordinary-cat-tags/20261121-r1`. Its exact cleanup
receipt records five idle payload paths and 9,297,920 allocated bytes reclaimed.

## Replay

Use the frozen application base with the two delivered qualification files and
the exact `experiment-contract.json` from the run. Create a fresh owned
`runs/ordinary-cat-tags/<date>-rN` with `payloads/`. Invoke
`node --import tsx scripts/qualify-installed-ordinary-cat-tags.ts --run <run>`
in one 12 GiB zero-swap user service with a 600-second deadline and a short owned
temporary directory. The borrowed checkpoint and signed engine install retain
their canonical paths and remain pinned dependencies.
