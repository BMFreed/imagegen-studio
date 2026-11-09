"""Private Smart Patch execution with prepared RGB and independent latent KEEP.

Loaded native models, conditioning, sampling policy and resource verification
remain caller-owned. These adapters neither classify source alpha nor repeat
LaMa/coherence, publish files, add jobs, or produce accepted variants.
"""

from __future__ import annotations

import importlib
import math
from dataclasses import dataclass
from typing import Any, cast

from PIL import Image

from imagegen_worker.anima_euler import AnimaEulerResult, AnimaPredictionFactory
from imagegen_worker.anima_flow_sampling import (
    PLAN_VERSION as ANIMA_PLAN_VERSION,
)
from imagegen_worker.anima_flow_sampling import (
    generate_anima_flow_sampling,
    validate_anima_flow_sampling_plan,
)
from imagegen_worker.anima_outpaint import generate_anima_outpaint
from imagegen_worker.anima_tokenizers import AnimaTokenizers
from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import DenoisingProgressSink, SdxlConditioning, run_sdxl_pipeline
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.inference_lora import finite_unet_outputs
from imagegen_worker.inference_vae import finite_vae_outputs
from imagegen_worker.outpaint_conditioning import LATENT_SCALE
from imagegen_worker.protocol import (
    MAX_GENERATION_CFG_RESCALE,
    MAX_GENERATION_CFG_SCALE,
    MAX_GENERATION_STEPS,
    GenerationLora,
)
from imagegen_worker.sdxl_outpaint import run_sdxl_outpaint_pipeline
from imagegen_worker.smart_patch_fade import SmartPatchFadeMode


@dataclass(frozen=True)
class SmartPatchDenoisingInput:
    """Decoded private preparation, with frozen world mode and KEEP polarity."""

    mode: SmartPatchFadeMode
    width: int
    height: int
    model_source: Image.Image | None
    latent_keep_mask: Image.Image


def _invalid(message: str) -> DerivativeError:
    return DerivativeError("INVALID_REQUEST", message)


def _capture_keep_mask(keep: object, width: int, height: int) -> Image.Image:
    if (
        not isinstance(keep, Image.Image)
        or keep.mode != "L"
        or keep.size != (width // LATENT_SCALE, height // LATENT_SCALE)
    ):
        raise _invalid("Smart Patch latent KEEP must be an exact-size numeric L image.")
    return keep.copy()


def _capture_inputs(inputs: object) -> SmartPatchDenoisingInput:
    if not isinstance(inputs, SmartPatchDenoisingInput) or inputs.mode not in (
        "txt2img",
        "img2img",
        "inpaint",
        "outpaint",
    ):
        raise _invalid("Smart Patch requires a valid frozen world mode.")
    width, height = inputs.width, inputs.height
    if (
        type(width) is not int
        or type(height) is not int
        or not LATENT_SCALE <= width <= MAX_TARGET_SIDE
        or not LATENT_SCALE <= height <= MAX_TARGET_SIDE
        or width % LATENT_SCALE
        or height % LATENT_SCALE
        or width * height > MAX_TARGET_PIXELS
    ):
        raise _invalid("Smart Patch processing dimensions exceed the bounded latent grid.")
    source = inputs.model_source
    keep = _capture_keep_mask(inputs.latent_keep_mask, width, height)
    if inputs.mode in ("txt2img", "img2img") and keep.getextrema() != (0, 0):
        raise _invalid("Ordinary Smart Patch modes cannot discard a nonzero latent KEEP mask.")
    if inputs.mode == "txt2img":
        if source is not None:
            raise _invalid("Smart Patch TXT must not contain a model source.")
    elif (
        not isinstance(source, Image.Image)
        or source.mode != "RGB"
        or source.size != (width, height)
        or source.info.get("icc_profile") not in (None, SRGB_ICC_PROFILE)
    ):
        raise _invalid("Smart Patch image modes require exact-size prepared sRGB RGB pixels.")
    # Frozen dataclasses do not freeze PIL buffers; own both before native callbacks.
    return SmartPatchDenoisingInput(
        mode=inputs.mode,
        width=width,
        height=height,
        model_source=source.copy() if source is not None else None,
        latent_keep_mask=keep,
    )


def _bounded_number(value: object, minimum: float, maximum: float) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        number = float(cast(int | float, value))
    except (ValueError, OverflowError):
        return False
    return math.isfinite(number) and minimum <= number <= maximum


def _check_result(image: object, inputs: SmartPatchDenoisingInput) -> None:
    if (
        not isinstance(image, Image.Image)
        or image.mode != "RGB"
        or image.size != (inputs.width, inputs.height)
        or image.info.get("icc_profile") not in (None, SRGB_ICC_PROFILE)
    ):
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Smart Patch native output is not exact-size sRGB RGB."
        )


def run_smart_patch_illustrious(
    pipeline: Any,
    conditioning: SdxlConditioning,
    inputs: SmartPatchDenoisingInput,
    *,
    steps: int,
    cfg_scale: float,
    generator: Any,
    torch: Any,
    denoising_strength: float | None,
    cfg_rescale: float = 0.0,
    on_progress: DenoisingProgressSink | None = None,
) -> Any:
    """Execute prepared Smart Patch inputs through the existing native SDXL loop.

    INP/OUT use the masked path even when reduction produced all255 KEEP. The
    native VAE and requested denoising still run; no mode fallback is introduced.
    """
    captured = _capture_inputs(inputs)
    if (
        type(steps) is not int
        or not 1 <= steps <= MAX_GENERATION_STEPS
        or not _bounded_number(cfg_scale, 1, MAX_GENERATION_CFG_SCALE)
        or not _bounded_number(cfg_rescale, 0, MAX_GENERATION_CFG_RESCALE)
        or (
            denoising_strength is not None
            if captured.mode == "txt2img"
            else not _bounded_number(denoising_strength, 0, 1)
        )
    ):
        raise _invalid("Smart Patch Illustrious sampling parameters differ from its mode.")
    # Do not import optional ML dependencies for malformed decoded/scalar input.
    diffusers = cast(Any, importlib.import_module("diffusers"))
    image_mode = captured.mode != "txt2img"
    expected = (
        diffusers.StableDiffusionXLImg2ImgPipeline
        if image_mode
        else diffusers.StableDiffusionXLPipeline
    )
    if (
        not isinstance(pipeline, expected)
        or (not image_mode and isinstance(pipeline, diffusers.StableDiffusionXLImg2ImgPipeline))
        or getattr(pipeline, "vae_scale_factor", None) != LATENT_SCALE
        or getattr(getattr(getattr(pipeline, "unet", None), "config", None), "in_channels", None)
        != 4
        or (
            captured.mode in ("inpaint", "outpaint")
            and getattr(pipeline, "_igs_supports_outpaint", None) is not True
        )
        or not isinstance(generator, torch.Generator)
        or generator.device.type != "cpu"
    ):
        raise _invalid(
            "Smart Patch Illustrious requires the matching native pipeline and CPU seed."
        )
    arguments: dict[str, Any] = {
        "width": captured.width,
        "height": captured.height,
        "steps": steps,
        "cfg_scale": cfg_scale,
        "generator": generator,
        "torch": torch,
        "denoising_strength": denoising_strength,
        "cfg_rescale": cfg_rescale,
        "on_progress": on_progress,
        "image": captured.model_source,
    }
    with finite_vae_outputs(pipeline, torch), finite_unet_outputs(pipeline, torch):
        if captured.mode in ("inpaint", "outpaint"):
            result = run_sdxl_outpaint_pipeline(
                pipeline, conditioning, keep_mask=captured.latent_keep_mask, **arguments
            )
        else:
            result = run_sdxl_pipeline(pipeline, conditioning, **arguments)
    images = getattr(result, "images", None)
    if not isinstance(images, list) or len(cast(list[object], images)) != 1:
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Smart Patch native output must contain exactly one image."
        )
    _check_result(cast(list[object], images)[0], captured)
    return result


def run_smart_patch_anima(
    plan: object,
    positive: object,
    negative: object,
    models: LoadedAnimaModels,
    inputs: SmartPatchDenoisingInput,
    *,
    loras: tuple[GenerationLora, ...] = (),
    tokenizers: AnimaTokenizers | None = None,
    progress: DenoisingProgressSink | None = None,
    prediction_factory: AnimaPredictionFactory | None = None,
) -> AnimaEulerResult:
    """Execute prepared Smart Patch inputs through original Anima native models.

    The private regional owner may supply its derived signed predictor for each
    frozen mode. Source preparation and latent KEEP remain independent owners.
    """
    captured = _capture_inputs(inputs)
    sampling = validate_anima_flow_sampling_plan(plan)
    if sampling.mode != ("txt2img" if captured.mode == "txt2img" else "img2img") or (
        sampling.width,
        sampling.height,
    ) != (captured.width, captured.height):
        raise _invalid("Smart Patch Anima sampling plan differs from its frozen mode or size.")
    # Reconstruct the exact canonical envelope from parsed immutable values. No
    # mutable caller plan/list becomes authority after conditioning callbacks run.
    owned_plan: dict[str, object] = {
        "version": ANIMA_PLAN_VERSION,
        "scheduler": sampling.scheduler,
        "mode": sampling.mode,
        "width": sampling.width,
        "height": sampling.height,
        "steps": sampling.steps,
        "seed": sampling.seed,
        "stepSeed": sampling.step_seed,
        "guidanceScale": sampling.guidance_scale,
        "strength": sampling.strength,
        "posteriorSeed": sampling.posterior_seed,
        "startStep": sampling.start_step,
        "totalSteps": sampling.total_steps,
        "sigmas": list(sampling.sigmas),
        "beginIndex": sampling.begin_index,
        "timesteps": list(sampling.timesteps),
        "initialSigma": sampling.initial_sigma,
    }
    arguments: dict[str, Any] = {
        "source_image": captured.model_source,
        "loras": loras,
        "tokenizers": tokenizers,
        "progress": progress,
    }
    if prediction_factory is not None:
        if not callable(prediction_factory):
            raise _invalid("The private Smart regional predictor requires a callable factory.")
        arguments["prediction_factory"] = prediction_factory
    if captured.mode in ("inpaint", "outpaint"):
        result = generate_anima_outpaint(
            owned_plan,
            positive,
            negative,
            models,
            keep_mask=captured.latent_keep_mask,
            **arguments,
        )
    else:
        result = generate_anima_flow_sampling(owned_plan, positive, negative, models, **arguments)
    _check_result(result.image, captured)
    return result
