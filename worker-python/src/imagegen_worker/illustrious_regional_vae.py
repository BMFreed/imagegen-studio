"""Selected VAE preparation and Invoke decode for public Regional Guidance.

Adapted from InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
app/invocations/model.py (VAELoaderInvocation), generation/core/graph.ts and
app/invocations/vae/latents_to_image.py. Existing ordinary loading owns the exact
external snapshot and selected precision configuration. This owner prepares only
the fresh job-owned VAE before borrowing. The native denoising loop returns its
original latent result; Invoke's dtype-before-scaling decode runs inside the same
regional reservation, without changing borrowed tensor storage or configuration.
The private prepared-image seam also adapts vae/image_to_latents.py and Canvas
compileCanvasGraph.ts::graftImageToImage: native encode/sample, scale in VAE
compute dtype, then cast for the denoiser. Its replayable posterior is the
existing Studio image adaptation, not Invoke's unseeded sampling.

Auto retains the native force_upcast decision; it is not a new fixed default.
No VAE copy, offload, tiling, fallback or second diffusion loop is introduced.
"""

from __future__ import annotations

import importlib
import math
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, cast

from .derivatives import DerivativeError, canonical_absolute_path
from .inference_external_vae import MAX_VAE_HEADER_BYTES, read_vae_snapshot
from .protocol import (
    _SHA256_PATTERN,  # pyright: ignore[reportPrivateUsage]
    GenerationVae,
    IllustriousInferenceParameters,
)

__all__ = (
    "MAX_REGIONAL_VAE_PAYLOAD_BYTES",
    "validate_regional_vae_parameters",
    "verify_regional_vae_resource",
    "prepare_owned_regional_vae",
    "regional_vae_dtype",
    "validate_prepared_regional_vae",
    "decode_regional_latents",
    "scoped_prepared_img2img_latents",
    "validate_regional_vae_output",
)

# Existing pinned complete SDXL VAE:83,653,863 elements at widest accepted F32.
MAX_REGIONAL_VAE_PAYLOAD_BYTES = 334_615_452
_MAX_FINITE_ELEMENTS = 8_388_608


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise DerivativeError("GENERATION_VAE_UNSUPPORTED", message)


def _descriptor(vae: GenerationVae | None) -> None:
    if vae is None:
        return
    _require(
        type(vae) is GenerationVae and vars(vae).keys() == {"path", "sha256", "byte_size"},
        "Regional VAE requires the exact existing descriptor.",
    )
    canonical_absolute_path(vae.path, label="Regional VAE")
    _require(
        type(vae.byte_size) is int
        and 1 <= vae.byte_size <= 8 + MAX_VAE_HEADER_BYTES + MAX_REGIONAL_VAE_PAYLOAD_BYTES
        and type(vae.sha256) is str
        and _SHA256_PATTERN.fullmatch(vae.sha256) is not None,
        "Regional VAE identity or pinned architecture byte bound is invalid.",
    )


def validate_regional_vae_parameters(parameters: IllustriousInferenceParameters) -> None:
    _require(
        type(parameters.vae_precision) is str
        and parameters.vae_precision in ("Auto", "FP16", "FP32"),
        "Regional VAE precision must be exactly Auto, FP16 or FP32.",
    )
    _descriptor(parameters.vae)


def verify_regional_vae_resource(vae: GenerationVae | None, root: Path, checkpoint: Path) -> None:
    """Verify the existing bounded exact snapshot before any native model load."""
    _descriptor(vae)
    if vae is None:
        return
    _require(
        vae.path != checkpoint and vae.path != root and root not in vae.path.parents,
        "Regional VAE must be outside staging and distinct from checkpoint.",
    )
    snapshot = read_vae_snapshot(vae, max_payload_bytes=MAX_REGIONAL_VAE_PAYLOAD_BYTES)
    del snapshot


def regional_vae_dtype(
    pipeline: Any, parameters: IllustriousInferenceParameters, torch: Any
) -> Any:
    """Derive compute dtype from the logical policy and actual loaded config."""
    validate_regional_vae_parameters(parameters)
    upcast = pipeline.vae.config.force_upcast
    _require(type(upcast) is bool, "Regional VAE requires a native Boolean upcast policy.")
    if parameters.vae_precision != "Auto":
        _require(
            upcast is (parameters.vae_precision == "FP32"),
            "Loaded VAE upcast policy disagrees with the selected manual precision.",
        )
    return torch.float32 if upcast else torch.float16


def _model_state(pipeline: Any, torch: Any, modules: tuple[Any, ...], dtype: Any | None) -> None:
    expected_device = next(pipeline.unet.parameters()).device
    _require(
        expected_device.type == "cpu" or expected_device == torch.device("cuda:0"),
        "Regional VAE requires the qualified compute device.",
    )
    tensors = [
        tensor
        for module in modules
        for tensor in (*module.parameters(recurse=False), *module.buffers(recurse=False))
    ]
    _require(
        all(type(tensor) in (torch.Tensor, torch.nn.Parameter) for tensor in tensors),
        "Regional VAE state requires exact native tensors and Parameters.",
    )
    _require(
        sum(tensor.numel() * max(4, tensor.element_size()) for tensor in tensors)
        <= MAX_REGIONAL_VAE_PAYLOAD_BYTES,
        "Regional VAE exceeds the pinned complete architecture payload.",
    )
    for tensor in tensors:
        supported_dtype = not tensor.is_floating_point() or (
            tensor.dtype == dtype
            if dtype is not None
            else tensor.dtype in (torch.float16, torch.float32)
        )
        _require(
            tensor.device == expected_device
            and tensor.layout == torch.strided
            and tensor.is_contiguous()
            and not tensor.is_complex()
            and supported_dtype,
            "Regional VAE state requires native placement, contiguous storage and compute dtype.",
        )
        if tensor.is_floating_point():
            values = tensor.view(-1)
            for start in range(0, values.numel(), _MAX_FINITE_ELEMENTS):
                _require(
                    bool(torch.isfinite(values[start : start + _MAX_FINITE_ELEMENTS]).all().item()),
                    "Regional VAE contains non-finite state.",
                )


def _native_modules(pipeline: Any, modules: tuple[Any, ...]) -> None:
    diffusers = cast(Any, importlib.import_module("diffusers"))
    native = cast(Any, importlib.import_module("torch.nn"))
    allowed_torch = (
        native.Conv2d,
        native.Linear,
        native.GroupNorm,
        native.LayerNorm,
        native.SiLU,
        native.Dropout,
        native.ModuleList,
        native.ModuleDict,
        native.Sequential,
        native.Identity,
    )
    stateful_torch = (
        native.BatchNorm1d,
        native.BatchNorm2d,
        native.BatchNorm3d,
        native.InstanceNorm1d,
        native.InstanceNorm2d,
        native.InstanceNorm3d,
        native.EmbeddingBag,
    )
    _require(
        type(pipeline.vae) is diffusers.AutoencoderKL, "Regional VAE must be native AutoencoderKL."
    )
    for module in modules:
        cls = cast(Any, type(module))
        _require(
            not isinstance(module, stateful_torch),
            "Stateful BatchNorm, InstanceNorm and EmbeddingBag are unsupported in regional VAE.",
        )
        _require(
            (cls in allowed_torch or cls.__module__.startswith("diffusers.models."))
            and getattr(importlib.import_module(cls.__module__), cls.__name__, None) is cls
            and not any(callable(getattr(cls, key, None)) for key in module.__dict__)
            and getattr(module, "_compiled_call_impl", None) is None
            and not hasattr(module, "_orig_mod")
            and not hasattr(module, "_hf_hook")
            and not getattr(module, "_hf_peft_config_loaded", False)
            and not getattr(module, "peft_config", None)
            and getattr(module, "lora_layer", None) is None
            and not any(hasattr(module, key) for key in ("lora_A", "lora_B", "lora_embedding_A")),
            "Regional VAE requires standard unshadowed, non-offloaded native modules.",
        )


def prepare_owned_regional_vae(
    pipeline: Any, parameters: IllustriousInferenceParameters, torch: Any
) -> None:
    """Choose dtype on this fresh owned VAE, before its preservation baseline."""
    dtype = regional_vae_dtype(pipeline, parameters, torch)
    modules = tuple(pipeline.vae.modules())
    _native_modules(pipeline, modules)
    _model_state(pipeline, torch, modules, None)
    pipeline.vae.to(dtype=dtype)
    _model_state(pipeline, torch, modules, dtype)


def validate_prepared_regional_vae(
    pipeline: Any,
    parameters: IllustriousInferenceParameters,
    torch: Any,
    modules: tuple[Any, ...],
) -> None:
    """Validate all used VAE state without repairing or recasting borrowed data."""
    dtype = regional_vae_dtype(pipeline, parameters, torch)
    _native_modules(pipeline, modules)
    _require(
        all(module.training is False for module in modules), "Regional VAE must be in eval mode."
    )
    _require(
        getattr(pipeline.vae.config, "latents_mean", None) is None
        and getattr(pipeline.vae.config, "latents_std", None) is None,
        "Invoke regional VAE decode requires absent latent mean/std normalization.",
    )
    _model_state(pipeline, torch, modules, dtype)


@contextmanager
def scoped_prepared_img2img_latents(
    pipeline: Any,
    parameters: IllustriousInferenceParameters,
    torch: Any,
    *,
    width: int,
    height: int,
) -> Generator[None]:
    """Adapt Invoke encode on the fresh image wrapper, preserving borrowed VAE state.

    The caller validates and reserves the prepared native components first. Only
    this execution wrapper's method slot changes. In particular, do not call the
    ordinary Diffusers prepare_latents here: force_upcast would call .to() on the
    borrowed VAE and restore it to the denoiser dtype after encoding.
    """
    _require(
        type(width) is int
        and type(height) is int
        and 8 <= width <= 2048
        and 8 <= height <= 2048
        and width % 8 == height % 8 == 0
        and width * height <= 4_000_000,
        "Prepared image dimensions exceed the existing Canvas bounds.",
    )
    vae_dtype = regional_vae_dtype(pipeline, parameters, torch)
    unet_parameter = next(pipeline.unet.parameters())
    device, denoiser_dtype = unet_parameter.device, unet_parameter.dtype
    distribution_type = cast(
        Any, importlib.import_module("diffusers.models.autoencoders.vae")
    ).DiagonalGaussianDistribution
    encoded_type = cast(
        Any, importlib.import_module("diffusers.models.modeling_outputs")
    ).AutoencoderKLOutput
    present, previous = (
        "prepare_latents" in pipeline.__dict__,
        pipeline.__dict__.get("prepare_latents"),
    )

    def checked_tensor(value: Any, shape: tuple[int, ...], dtype: Any, label: str) -> None:
        _require(
            type(value) is torch.Tensor
            and value.device == device
            and value.layout == torch.strided
            and value.dtype == dtype
            and value.requires_grad is False
            and tuple(value.shape) == shape,
            f"Prepared image {label} has the wrong device, dtype or shape.",
        )
        # Dimensions are bounded first; never flatten an unsupported tensor or
        # allocate an image-sized cast merely to inspect finite values.
        rows = max(1, _MAX_FINITE_ELEMENTS // (shape[1] * shape[3]))
        for start in range(0, shape[2], rows):
            _require(
                bool(torch.isfinite(value[:, :, start : start + rows, :]).all().item()),
                f"Prepared image {label} must be finite.",
            )

    def prepare_latents(
        image: Any,
        timestep: Any,
        batch_size: int,
        num_images_per_prompt: int,
        dtype: Any,
        device: Any,
        generator: Any = None,
        add_noise: bool = True,
    ) -> Any:
        expected_device = unet_parameter.device
        _require(
            type(batch_size) is int
            and batch_size == 1
            and type(num_images_per_prompt) is int
            and num_images_per_prompt == 1
            and dtype == denoiser_dtype
            and type(device) is torch.device
            and device == expected_device
            and type(generator) is torch.Generator
            and generator.device == torch.device("cpu")
            and type(add_noise) is bool,
            "Prepared image encoding requires one image and its frozen CPU generator.",
        )
        _require(
            type(image) is torch.Tensor
            and image.device in (torch.device("cpu"), expected_device)
            and image.layout == torch.strided
            and image.dtype == torch.float32
            and image.requires_grad is False
            and tuple(image.shape) == (1, 3, height, width),
            "Prepared image encoding requires the original preprocessed FP32 RGB tensor.",
        )
        _require(
            type(timestep) is torch.Tensor
            and timestep.device == expected_device
            and timestep.layout == torch.strided
            and timestep.dtype in (torch.float32, torch.int64)
            and timestep.requires_grad is False
            and tuple(timestep.shape) in ((0,), (1,))
            and bool(torch.isfinite(timestep).all().item()),
            "Prepared image encoding requires the native selected first timestep or empty window.",
        )
        _require(
            len(timestep) == 0 or add_noise,
            "Prepared img2img requires initial noise for a nonempty window.",
        )
        pixels = image.to(device=expected_device, dtype=vae_dtype)
        checked_tensor(pixels, (1, 3, height, width), vae_dtype, "pixels")
        posterior_generator = torch.Generator(device="cpu")
        posterior_generator.set_state(generator.get_state())
        encoded = pipeline.vae.encode(pixels)
        _require(
            type(encoded) is encoded_type and type(encoded.latent_dist) is distribution_type,
            "Prepared image encoding requires the original native posterior distribution.",
        )
        sampled = encoded.latent_dist.sample(generator=posterior_generator)
        latent_shape = (1, 4, height // 8, width // 8)
        checked_tensor(sampled, latent_shape, vae_dtype, "posterior")
        # Invoke multiplies before the final dtype conversion. Casting the
        # posterior to FP16 first introduces a different rounding boundary.
        encoded_latents = (pipeline.vae.config.scaling_factor * sampled).to(dtype=denoiser_dtype)
        checked_tensor(encoded_latents, latent_shape, denoiser_dtype, "scaled source")
        if len(timestep) == 0:
            return encoded_latents
        noise = torch.randn(
            encoded_latents.shape, generator=generator, device="cpu", dtype=denoiser_dtype
        ).to(expected_device)
        result = pipeline.scheduler.add_noise(encoded_latents, noise, timestep)
        checked_tensor(result, latent_shape, denoiser_dtype, "noised source")
        return result

    try:
        pipeline.prepare_latents = prepare_latents
        yield
    finally:
        if present:
            pipeline.prepare_latents = previous
        else:
            del pipeline.prepare_latents


def _output_tensor(
    result: Any,
    *,
    pipeline: Any,
    torch: Any,
    width: int,
    height: int,
    channels: int,
    dtype: Any,
) -> Any:
    _require(
        type(width) is int
        and type(height) is int
        and 1 <= width <= 2048
        and 1 <= height <= 2048
        and width * height <= 4_000_000,
        "Regional VAE output dimensions exceed the existing Canvas bounds.",
    )
    output_type = cast(
        Any, importlib.import_module("diffusers.pipelines.stable_diffusion_xl.pipeline_output")
    ).StableDiffusionXLPipelineOutput
    _require(type(result) is output_type, "Regional VAE requires the native SDXL output record.")
    image = result.images
    _require(
        type(image) is torch.Tensor
        and image.device == next(pipeline.unet.parameters()).device
        and image.layout == torch.strided
        and image.dtype == dtype
        and image.requires_grad is False
        and tuple(image.shape) == (1, channels, height, width),
        "Regional VAE output has the wrong device, dtype or shape.",
    )
    rows = max(1, _MAX_FINITE_ELEMENTS // (channels * width))
    for start in range(0, height, rows):
        _require(
            bool(torch.isfinite(image[:, :, start : start + rows, :]).all().item()),
            "Regional VAE output must be finite before normalization or publication.",
        )
    return image


def validate_regional_vae_output(
    result: Any,
    *,
    pipeline: Any,
    parameters: IllustriousInferenceParameters,
    torch: Any,
    width: int,
    height: int,
) -> None:
    _output_tensor(
        result,
        pipeline=pipeline,
        torch=torch,
        width=width,
        height=height,
        channels=3,
        dtype=regional_vae_dtype(pipeline, parameters, torch),
    )


def decode_regional_latents(
    result: Any,
    *,
    pipeline: Any,
    parameters: IllustriousInferenceParameters,
    torch: Any,
    width: int,
    height: int,
) -> Any:
    """Run Invoke's dtype-before-scaling/native decode exactly once, without .to on VAE."""
    _require(
        type(width) is int
        and type(height) is int
        and width >= 8
        and height >= 8
        and width % 8 == height % 8 == 0,
        "Regional VAE dimensions must be positive and divisible by eight.",
    )
    latents = _output_tensor(
        result,
        pipeline=pipeline,
        torch=torch,
        width=width // 8,
        height=height // 8,
        channels=4,
        dtype=next(pipeline.unet.parameters()).dtype,
    )
    scale = pipeline.vae.config.scaling_factor
    _require(
        type(scale) in (int, float) and math.isfinite(scale) and scale > 0,
        "Regional VAE scaling must be finite and positive.",
    )
    latents = latents.to(dtype=regional_vae_dtype(pipeline, parameters, torch))
    latents = latents / scale
    image = pipeline.vae.decode(latents, return_dict=False)[0]
    # The enclosing existing finite-VAE hooks reject NaN/Inf before clamp.
    decoded = type(result)(images=image)
    validate_regional_vae_output(
        decoded, pipeline=pipeline, parameters=parameters, torch=torch, width=width, height=height
    )
    image = (image / 2 + 0.5).clamp(0, 1)
    return type(result)(images=image)
