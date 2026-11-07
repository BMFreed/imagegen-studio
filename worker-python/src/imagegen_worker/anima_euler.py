"""Original Anima's internal default Euler path; no wire/admission capability.

TS owns the immutable schedule policy. Python validates it and executes native
Qwen3/conditioner/Cosmos/Wan components, preserving Invoke's F32 Euler arithmetic
and cast-back policy. No model discovery, filesystem publication or GPU fallback.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import math
from collections.abc import Callable, Generator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Literal, cast

from PIL import Image

from imagegen_worker.anima_conditioning import (
    COMPILED_PROMPT_VERSION,
    AnimaConditioningPair,
    encode_anima_conditioning_pair,
    validate_compiled_anima_prompt,
)
from imagegen_worker.anima_lora import capture_anima_loras, scoped_anima_generation_loras
from imagegen_worker.anima_tokenizers import AnimaTokenizers
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels
from imagegen_worker.protocol import GenerationLora

PLAN_VERSION = "anima-euler-denoising-v1"
_FIELDS = {
    "version",
    "scheduler",
    "mode",
    "width",
    "height",
    "steps",
    "seed",
    "guidanceScale",
    "strength",
    "posteriorSeed",
    "startStep",
    "totalSteps",
    "sigmas",
}


@dataclass(frozen=True)
class AnimaEulerPlan:
    mode: str
    width: int
    height: int
    steps: int
    seed: int
    guidance_scale: float
    strength: float | None
    posterior_seed: int | None
    start_step: int
    total_steps: int
    sigmas: tuple[float, ...]


@dataclass(frozen=True)
class AnimaEulerResult:
    image: Image.Image
    latents: Any
    total_steps: int


AnimaLatentTransform = Callable[[Any, float, bool], Any]
AnimaLatentTransformFactory = Callable[[Any, Any, Any], AnimaLatentTransform]


AnimaDenoiser = Callable[
    [Any, Any, AnimaConditioningPair, Any, Callable[[int, int], None] | None], Any
]
AnimaMaskedDenoiser = Callable[
    [
        Any,
        Any,
        AnimaConditioningPair,
        Any,
        Callable[[int, int], None] | None,
        AnimaLatentTransform,
    ],
    Any,
]
AnimaDenoiserFactory = Callable[[Any, Any], AnimaDenoiser | AnimaMaskedDenoiser]

# Trusted private prediction ownership; ordinary callers keep the original path.
AnimaPredictor = Callable[[Literal["positive", "negative"], Any, float], Any]
AnimaPredictionFactory = Callable[[AnimaConditioningPair, Any, Any, Any], AnimaPredictor]


def _invalid(message: str) -> DerivativeError:
    return DerivativeError("INVALID_REQUEST", message)


def _integer(value: object, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise _invalid("Anima Euler plan has an invalid integer.")
    return value


def validate_anima_number(value: object, minimum: float, maximum: float) -> float:
    if type(value) not in (int, float):
        raise _invalid("Anima Euler plan has an invalid finite number.")
    try:
        number = float(cast(int | float, value))
    except (ValueError, OverflowError) as error:
        raise _invalid("Anima Euler plan has an invalid finite number.") from error
    if not math.isfinite(number) or not minimum <= number <= maximum:
        raise _invalid("Anima Euler plan has an invalid finite number.")
    return number


def validate_anima_euler_plan(value: object) -> AnimaEulerPlan:
    """Capture canonical TS interpretation before any optional imports/model work."""
    if not isinstance(value, dict):
        raise _invalid("Anima requires a versioned Euler plan.")
    data = cast(dict[str, object], value)
    if set(data) != _FIELDS or data["version"] != PLAN_VERSION or data["scheduler"] != "euler":
        raise _invalid("Anima Euler plan fields, scheduler or version are unsupported.")
    mode = data["mode"]
    if mode not in ("txt2img", "img2img"):
        raise _invalid("Anima Euler mode is unsupported.")
    width, height = _integer(data["width"], 64, 2048), _integer(data["height"], 64, 2048)
    if width % 8 or height % 8 or width * height > 4_000_000:
        raise _invalid("Anima Euler dimensions exceed the existing generation envelope.")
    steps, seed = _integer(data["steps"], 1, 200), _integer(data["seed"], 0, 0xFFFFFFFF)
    guidance = validate_anima_number(data["guidanceScale"], 1, 30)
    strength = None if data["strength"] is None else validate_anima_number(data["strength"], 0, 1)
    posterior = data["posteriorSeed"]
    if (mode == "txt2img" and (strength is not None or posterior is not None)) or (
        mode == "img2img"
        and (strength is None or type(posterior) is not int or posterior != seed ^ 0x9E3779B9)
    ):
        raise _invalid("Anima Euler mode, strength and posterior seed are inconsistent.")
    start = 0 if strength is None else math.floor((1 - strength) * steps)
    if data["startStep"] != start or type(data["startStep"]) is not int:
        raise _invalid("Anima Euler start step is inconsistent.")
    if data["totalSteps"] != steps - start or type(data["totalSteps"]) is not int:
        raise _invalid("Anima Euler evaluation count is inconsistent.")
    raw = data["sigmas"]
    if not isinstance(raw, list) or len(cast(list[object], raw)) != steps - start + 1:
        raise _invalid("Anima Euler sigma count is inconsistent.")
    sigmas = tuple(validate_anima_number(item, 0, 1) for item in cast(list[object], raw))
    canonical: list[float] = []
    for index, sigma in enumerate(sigmas, start):
        t = 1 - index / steps
        expected = 3 * t / (1 + 2 * t)
        if not math.isclose(sigma, expected, rel_tol=0, abs_tol=1e-12):
            raise _invalid("Anima Euler requires the canonical once-shifted sigma schedule.")
        # Comparison tolerates transport-level rounding; execution must still
        # retain exact canonical endpoints and never consume perturbed caller values.
        canonical.append(expected)
    return AnimaEulerPlan(
        cast(str, mode),
        width,
        height,
        steps,
        seed,
        guidance,
        strength,
        cast(int | None, posterior),
        start,
        steps - start,
        tuple(canonical),
    )


def _capture_prompt(value: object) -> dict[str, Any]:
    prompt = validate_compiled_anima_prompt(value)
    return {
        "version": COMPILED_PROMPT_VERSION,
        "cleanedText": prompt.cleaned_text,
        "spans": [
            {"start": span.start, "end": span.end, "weight": span.weight} for span in prompt.spans
        ],
    }


def _source_image(source: Image.Image | None, plan: AnimaEulerPlan) -> Image.Image | None:
    if plan.mode == "txt2img":
        if source is not None:
            raise _invalid("Anima txt2img must not contain a source image.")
        return None
    if not isinstance(source, Image.Image) or source.size != (plan.width, plan.height):
        raise _invalid("Anima img2img needs an exact-size source image.")
    if source.mode not in ("RGB", "RGBA"):
        raise _invalid("Anima source pixels must be RGB or opaque RGBA.")
    if source.info.get("icc_profile") not in (None, SRGB_ICC_PROFILE):
        raise _invalid("Anima source pixels must already be normalized to sRGB.")
    captured = source.copy()
    if captured.mode == "RGBA" and captured.getchannel("A").getextrema() != (255, 255):
        raise _invalid("Anima Euler img2img does not accept partially transparent targets.")
    return captured.convert("RGB")


def require_finite_anima_tensor(tensor: Any, torch: Any, label: str) -> None:
    if not torch.is_tensor(tensor) or not bool(torch.isfinite(tensor).all().item()):
        raise DerivativeError("GENERATION_WORKER_FAILED", f"Anima {label} is non-finite.")


@contextmanager
def _vae_guard(vae: Any, torch: Any) -> Generator[None]:
    # Wan clamps inside decode; observe raw native outputs before Inf becomes +/-1.
    def check(_module: Any, _args: Any, output: Any) -> None:
        require_finite_anima_tensor(output, torch, "raw VAE output")

    handles: list[Any] = []
    tiled = vae.use_tiling
    try:
        vae.disable_tiling()
        for module in (vae.encoder, vae.quant_conv, vae.post_quant_conv, vae.decoder):
            if module is not None:
                handles.append(module.register_forward_hook(check))
        yield
    finally:
        for handle in handles:
            handle.remove()
        if tiled:
            vae.enable_tiling()


def _normalization(vae: Any, torch: Any, device: Any, dtype: Any) -> tuple[Any, Any]:
    means, stds = vae.config.latents_mean, vae.config.latents_std
    if (
        len(means) != 16
        or len(stds) != 16
        or any(not math.isfinite(value) for value in (*means, *stds))
        or any(value <= 0 for value in stds)
    ):
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Anima Wan normalization is invalid.")
    mean = torch.tensor(means, device=device, dtype=dtype).view(1, 16, 1, 1, 1)
    std = torch.tensor(stds, device=device, dtype=dtype).view(1, 16, 1, 1, 1)
    require_finite_anima_tensor(mean, torch, "VAE normalization mean")
    require_finite_anima_tensor(std, torch, "VAE normalization std")
    if bool((std <= 0).any().item()):
        raise DerivativeError("INFERENCE_UNAVAILABLE", "Anima Wan std underflowed.")
    return mean, std


def predict_anima_flow(
    transformer: Any, latents: Any, embeddings: Any, sigma: float, torch: Any
) -> Any:
    height, width = latents.shape[-2:]
    padded = torch.nn.functional.pad(latents, (0, width % 2, 0, height % 2))
    mask = torch.zeros((1, 1, *padded.shape[-2:]), device=latents.device, dtype=latents.dtype)
    timestep = torch.tensor([sigma], device=latents.device, dtype=latents.dtype)
    prediction = transformer(
        hidden_states=padded, timestep=timestep, encoder_hidden_states=embeddings, padding_mask=mask
    ).sample
    if tuple(prediction.shape) != tuple(padded.shape):
        raise DerivativeError("GENERATION_WORKER_FAILED", "Anima flow shape is invalid.")
    require_finite_anima_tensor(prediction, torch, "flow prediction")
    return prediction[..., :height, :width].float()


def generate_anima_euler(
    plan: object,
    positive: object,
    negative: object,
    models: LoadedAnimaModels,
    *,
    source_image: Image.Image | None = None,
    loras: tuple[GenerationLora, ...] = (),
    tokenizers: AnimaTokenizers | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> AnimaEulerResult:
    """Return exact-size sRGB pixels; no command, output path or candidate publication."""
    captured = validate_anima_euler_plan(plan)
    return execute_captured_anima_plan(
        captured,
        positive,
        negative,
        models,
        source_image=source_image,
        loras=loras,
        tokenizers=tokenizers,
        progress=progress,
    )


def execute_captured_anima_plan(
    captured: AnimaEulerPlan,
    positive: object,
    negative: object,
    models: LoadedAnimaModels,
    *,
    source_image: Image.Image | None = None,
    loras: tuple[GenerationLora, ...] = (),
    tokenizers: AnimaTokenizers | None = None,
    progress: Callable[[int, int], None] | None = None,
    denoiser_factory: AnimaDenoiserFactory | None = None,
    initial_sigma: float | None = None,
    latent_transform_factory: AnimaLatentTransformFactory | None = None,
    prediction_factory: AnimaPredictionFactory | None = None,
) -> AnimaEulerResult:
    """Shared internal image boundary; collaborators come only from trusted Python code."""
    positive_input, negative_input = _capture_prompt(positive), _capture_prompt(negative)
    source = _source_image(source_image, captured)
    captured_loras = capture_anima_loras(loras)
    if prediction_factory is not None and denoiser_factory is not None:
        raise _invalid("Anima prediction ownership cannot replace a native sampling driver.")
    try:
        if importlib.metadata.version("torchvision").split("+", maxsplit=1)[0] != "0.22.1":
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE", "Pinned Anima torchvision is unavailable."
            )
        torch = cast(Any, importlib.import_module("torch"))
        transformer, vae = models.transformer, models.vae
        parameter, vae_parameter = next(transformer.parameters()), next(vae.parameters())
        device, dtype = parameter.device, parameter.dtype
        if (
            dtype not in (torch.float16, torch.bfloat16, torch.float32)
            or (
                vae_parameter.device != device
                or vae_parameter.dtype not in (torch.float16, torch.bfloat16, torch.float32)
            )
            or any(model.training for model in (transformer, vae))
        ):
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE", "Anima models require valid eval placement."
            )
        if (
            transformer.config.in_channels != 16
            or transformer.config.out_channels != 16
            or tuple(transformer.config.patch_size) != (1, 2, 2)
            or not transformer.config.concat_padding_mask
            or vae.config.z_dim != 16
            or vae.spatial_compression_ratio != 8
        ):
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE", "Anima requires the original latent topology."
            )
        denoise = (
            denoiser_factory(torch, device)
            if captured.total_steps and denoiser_factory is not None
            else None
        )
        with scoped_anima_generation_loras(models, captured_loras, torch):
            mean, std = _normalization(vae, torch, device, vae_parameter.dtype)
            shape = (1, 16, 1, captured.height // 8, captured.width // 8)
            noise_generator = torch.Generator(device="cpu").manual_seed(captured.seed)
            conditioning = None
            predictor = None
            if captured.total_steps:
                conditioning = encode_anima_conditioning_pair(
                    positive_input, negative_input, models, tokenizers=tokenizers
                )
                if any(
                    item.embeddings.device != device or item.embeddings.dtype != dtype
                    for item in (conditioning.positive, conditioning.negative)
                ):
                    raise DerivativeError(
                        "INFERENCE_UNAVAILABLE", "Anima conditioning placement differs."
                    )
                if prediction_factory is not None:
                    predictor = prediction_factory(conditioning, torch, device, dtype)
            with torch.inference_mode(), _vae_guard(vae, torch):
                if source is not None:
                    pixels = torch.frombuffer(bytearray(source.tobytes()), dtype=torch.uint8)
                    pixels = pixels.reshape(captured.height, captured.width, 3).permute(2, 0, 1)
                    pixels = pixels.to(dtype=torch.float32).unsqueeze(0).unsqueeze(2)
                    pixels = (pixels / 127.5 - 1).to(device=device, dtype=vae_parameter.dtype)
                    posterior = vae.encode(pixels).latent_dist
                    generator = torch.Generator(device="cpu").manual_seed(captured.posterior_seed)
                    encoded = posterior.sample(generator=generator)
                    require_finite_anima_tensor(encoded, torch, "sampled VAE latent")
                    if tuple(encoded.shape) != shape:
                        raise DerivativeError(
                            "GENERATION_WORKER_FAILED", "Anima encoded shape differs."
                        )
                    latents = ((encoded - mean) / std).to(dtype=dtype)
                    require_finite_anima_tensor(latents, torch, "normalized latent")
                else:
                    latents = None
                if captured.total_steps:
                    noise = torch.randn(
                        shape, device="cpu", dtype=torch.float32, generator=noise_generator
                    ).to(device=device, dtype=dtype)
                    latent_transform = None
                    if latent_transform_factory is not None:
                        if latents is None:
                            raise _invalid("Anima latent masking requires source latents.")
                        latent_transform = latent_transform_factory(torch, latents, noise)
                    sigma = captured.sigmas[0] if initial_sigma is None else initial_sigma
                    latents = noise if latents is None else sigma * noise + (1 - sigma) * latents
                    require_finite_anima_tensor(latents, torch, "initial latent")
                    assert conditioning is not None
                    iterations = (
                        zip(captured.sigmas[:-1], captured.sigmas[1:], strict=True)
                        if denoise is None
                        else ()
                    )
                    for index, (current, following) in enumerate(iterations, 1):
                        conditional = (
                            predict_anima_flow(
                                transformer,
                                latents,
                                conditioning.positive.embeddings,
                                current,
                                torch,
                            )
                            if predictor is None
                            else predictor("positive", latents, current)
                        )
                        if not math.isclose(captured.guidance_scale, 1.0):
                            unconditional = (
                                predict_anima_flow(
                                    transformer,
                                    latents,
                                    conditioning.negative.embeddings,
                                    current,
                                    torch,
                                )
                                if predictor is None
                                else predictor("negative", latents, current)
                            )
                            flow = unconditional + captured.guidance_scale * (
                                conditional - unconditional
                            )
                        else:
                            flow = conditional
                        require_finite_anima_tensor(flow, torch, "guided flow")
                        latents = (latents.float() + (following - current) * flow).to(dtype=dtype)
                        require_finite_anima_tensor(latents, torch, "Euler latent")
                        if latent_transform is not None:
                            latents = latent_transform(latents, following, True)
                        if progress is not None:
                            progress(index, captured.total_steps)
                    if denoise is not None:
                        latents = (
                            cast(AnimaDenoiser, denoise)(
                                transformer, latents, conditioning, dtype, progress
                            )
                            if latent_transform is None
                            else cast(AnimaMaskedDenoiser, denoise)(
                                transformer,
                                latents,
                                conditioning,
                                dtype,
                                progress,
                                latent_transform,
                            )
                        )
                assert latents is not None
                raw_latents = latents.to(dtype=vae_parameter.dtype) * std + mean
                require_finite_anima_tensor(raw_latents, torch, "denormalized latent")
                decoded = vae.decode(raw_latents).sample
                require_finite_anima_tensor(decoded, torch, "decoded image")
                if tuple(decoded.shape) != (1, 3, 1, captured.height, captured.width):
                    raise DerivativeError(
                        "GENERATION_WORKER_FAILED", "Anima decoded shape differs."
                    )
                # Invoke quantizes in the native decode dtype, without widening.
                pixels = (127.5 * (decoded[0, :, 0].clamp(-1, 1) + 1)).to(torch.uint8)
                image = Image.frombytes(
                    "RGB",
                    (captured.width, captured.height),
                    pixels.permute(1, 2, 0).contiguous().cpu().numpy().tobytes(),
                )
                image.info["icc_profile"] = SRGB_ICC_PROFILE
            return AnimaEulerResult(image, latents.detach().clone(), captured.total_steps)
    except DerivativeError:
        raise
    except Exception as error:
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Anima native Euler execution failed."
        ) from error
