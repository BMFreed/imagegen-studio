"""Run the installed Studio IMG path with the fixed mug trajectory inputs.

Invoke 4875d96531ca6712b288f6e660fcbb34143408c1 connects source latents
to denoising in generation/core/canvas/compileCanvasGraph.ts, selects the
strength window in app/invocations/sd/denoise_latents.py, and delegates
initialization and transitions in backend/stable_diffusion/diffusers_pipeline.py.
This fixture calls Studio's existing adaptation and its original Diffusers loop.
"""

from collections.abc import Mapping
from contextlib import ExitStack
from typing import Any

from imagegen_worker.inference import (
    MLRuntime,
    SdxlConditioning,
    run_sdxl_pipeline,
)
from imagegen_worker.inference_lora import finite_unet_outputs
from imagegen_worker.inference_vae import finite_vae_outputs


def run_studio_lane(
    runtime: MLRuntime, pipeline: Any, held: Mapping[str, Any]
) -> tuple[Any, list[tuple[int, int]]]:
    """Return the genuine final latent and its ordered denoising progress."""
    torch = runtime.torch
    source = held["source"]
    context = held["context"]
    pool = held["text_embeds"]
    for tensor, shape in (
        (source, (1, 4, 64, 64)),
        (context, (2, 77, 2048)),
        (pool, (2, 1280)),
    ):
        if (
            tuple(tensor.shape) != shape
            or tensor.dtype != torch.float16
            or not tensor.is_cuda
            or tensor.device != source.device
        ):
            raise ValueError("Unexpected held Studio IMG tensor.")

    conditioning = SdxlConditioning(
        positive=context[1:2],
        negative=context[:1],
        positive_pooled=pool[1:2],
        negative_pooled=pool[:1],
        positive_length=77,
        negative_length=77,
    )
    progress = []

    def refuse_held_component(module, _args):
        raise RuntimeError(f"Held-input Studio lane evaluated {type(module).__name__}.")

    # Diffusers accepts a four-channel source latent in place of an RGB image.
    # The supplied CLIP embeddings and latent must bypass encoding, and returning a
    # latent excludes decoding. Refuse any accidental use of those components.
    with ExitStack() as stack:
        for module in (
            pipeline.text_encoder,
            pipeline.text_encoder_2,
            pipeline.vae.encoder,
            pipeline.vae.quant_conv,
            pipeline.vae.post_quant_conv,
            pipeline.vae.decoder,
        ):
            if module is not None:
                stack.callback(
                    module.register_forward_pre_hook(refuse_held_component).remove
                )
        stack.enter_context(finite_vae_outputs(pipeline, torch))
        stack.enter_context(finite_unet_outputs(pipeline, torch))
        result = run_sdxl_pipeline(
            pipeline,
            conditioning,
            width=512,
            height=512,
            steps=30,
            cfg_scale=5.0,
            cfg_rescale=0.0,
            generator=torch.Generator(device="cpu").manual_seed(123),
            torch=torch,
            on_progress=lambda done, total: progress.append((done, total)),
            image=source,
            denoising_strength=0.6,
            output_type="latent",
        )
    if progress != [(step, 19) for step in range(1, 20)]:
        raise RuntimeError("Studio did not complete the fixed 19-step Euler window.")
    return result.images, progress
