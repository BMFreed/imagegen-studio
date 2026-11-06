"""Private ordinary Canvas, native regional txt2img and opaque img2img execution.

The caller must supply the actual ordinary target for the selected mode. The acknowledged
recipe cannot authenticate that mode, job membership or checkpoint identity;
these remain trusted Main caller preconditions, without another DTO or admission
API. Exact-TI encoding uses the shared private text-copy owner. This module does
not publish an image or generation.

Exclusively own all borrowed components throughout the call. No concurrent direct
forwards, in-place owned-tensor/container mutation, model/registry mutation,
compilation or serialization is supported. The recipe reservation registry also
owns the complete used VAE tree through decode. Plain-profile local CLIP hooks retain
their guarded equal-value policy; TI permits only pinned native capture hooks.
All pre-existing local UNet/VAE forward hooks
and all global forward hooks refuse before encoding or owned model mutation.

One native pipeline call owns the whole bounded scheduler loop. Historical
profiles retain its decode. Explicit public VAE profiles return native latents,
then run Invoke's dtype-before-scaling VAE decode under the same reservation;
the job-owned VAE has already received its compute dtype before borrowing. The regional
adapter remains installed throughout, including equal-length conditioning and
every repeated spatial consumption. Borrowed scheduler/call state is untouched;
only the existing adapter, finite-output hooks and private late value guards
temporarily change shared modules, with reverse restoration on every exit.
"""

from __future__ import annotations

import importlib
import inspect
import math
from collections.abc import Callable, Generator
from contextlib import contextmanager, nullcontext
from dataclasses import replace
from functools import wraps
from typing import Any, Literal, TypedDict, cast

from PIL import Image

from .illustrious_regional_attention import Alpha8, AttentionPlan, Everywhere
from .illustrious_regional_attention_adapter import (
    TransformerBinding,
    _module_tree,  # pyright: ignore[reportPrivateUsage]
    _tensor_policy,  # pyright: ignore[reportPrivateUsage]
    _TensorProfile,  # pyright: ignore[reportPrivateUsage]
    scoped_illustrious_regional_attention,
)
from .illustrious_regional_conditioning import (
    _assemble_owned_conditioning,  # pyright: ignore[reportPrivateUsage]
    _owned_value,  # pyright: ignore[reportPrivateUsage]
    _pool_source,  # pyright: ignore[reportPrivateUsage]
)
from .illustrious_regional_embeddings import bounded_ti_module_tree
from .illustrious_regional_recipe import (
    _INVOKE_PROFILES,  # pyright: ignore[reportPrivateUsage]
    _TI_PROFILES,  # pyright: ignore[reportPrivateUsage]
    _encode_recipe_bindings,  # pyright: ignore[reportPrivateUsage]
    _encoding_embedding_strategy,  # pyright: ignore[reportPrivateUsage]
    _encoding_tensor_profile,  # pyright: ignore[reportPrivateUsage]
    _module_profile,  # pyright: ignore[reportPrivateUsage]
    _native_runtime,  # pyright: ignore[reportPrivateUsage]
    _pipeline_parts,  # pyright: ignore[reportPrivateUsage]
    _Profile,  # pyright: ignore[reportPrivateUsage]
    _recipe_adapter_preflight,  # pyright: ignore[reportPrivateUsage]
    _recipe_inputs,  # pyright: ignore[reportPrivateUsage]
    _recipe_model_preflight,  # pyright: ignore[reportPrivateUsage]
    _reject_global_forward_hooks,  # pyright: ignore[reportPrivateUsage]
    _reservation,  # pyright: ignore[reportPrivateUsage]
    _unet_profile,  # pyright: ignore[reportPrivateUsage]
)
from .illustrious_regional_vae import (
    decode_regional_latents,
    validate_prepared_regional_vae,
    validate_regional_vae_output,
    validate_regional_vae_parameters,
)
from .inference import (
    _SDXL_MICRO_CONDITIONING_SIZE,  # pyright: ignore[reportPrivateUsage]
    DenoisingProgressSink,
    MLRuntime,
    SdxlConditioning,
    img2img_pipeline_class,
    run_sdxl_pipeline,
    select_inference_scheduler,
)
from .inference_lora import finite_unet_outputs
from .inference_vae import finite_vae_outputs
from .protocol import (
    MAX_GENERATION_CFG_RESCALE,
    MAX_GENERATION_STEPS,
    IllustriousInferenceParameters,
    IllustriousNoiseProfile,
)

__all__ = ("IllustriousRegionalDenoisingError", "run_current_canvas_regional_denoising")

_Code = Literal["INPUT_INVALID", "PROFILE_INVALID", "UNSUPPORTED", "LIMIT", "SCOPE_CONFLICT"]
_DenoisingProfile = Literal[
    "ordinary-canvas-euler-txt2img-cpu-v1",
    "ordinary-canvas-euler-txt2img-cuda-fp16-v1",
    "ordinary-canvas-euler-txt2img-cpu-v2",
    "ordinary-canvas-euler-txt2img-cuda-fp16-v2",
    "ordinary-canvas-euler-ancestral-txt2img-cpu-v1",
    "ordinary-canvas-euler-ancestral-txt2img-cuda-fp16-v1",
    "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cpu-v1",
    "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1",
    "ordinary-canvas-euler-txt2img-cuda-vae-v1",
    "ordinary-canvas-euler-ancestral-txt2img-cuda-vae-v1",
    "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-vae-v1",
    "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cpu-v1",
    "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-fp16-v1",
    "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1",
    "ordinary-canvas-euler-img2img-cpu-v1",
    "ordinary-canvas-euler-img2img-cuda-fp16-v1",
]
_Layout = Literal["cfg-negative-first", "positive-only"]
_MAX_FINITE_ELEMENTS = 8_388_608


class _ProgressOptions(TypedDict, total=False):
    on_progress: DenoisingProgressSink


class _ImageOptions(TypedDict, total=False):
    image: Image.Image
    denoising_strength: float


class IllustriousRegionalDenoisingError(ValueError):
    """Local execution refusal; existing recipe/geometry/adapter/native errors pass through."""

    code: _Code

    def __init__(self, code: _Code, message: str) -> None:
        super().__init__(message)
        self.code = code


def _require(condition: bool, code: _Code, message: str) -> None:
    if not condition:
        raise IllustriousRegionalDenoisingError(code, message)


def _finite_number(value: Any) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _execution_profile(
    denoising_profile: _DenoisingProfile, profile: _Profile
) -> tuple[_TensorProfile, bool]:
    """Validate the shared finite lane/version pairs before any native work."""
    profiles: dict[_DenoisingProfile, tuple[_TensorProfile, bool]] = {
        "ordinary-canvas-euler-txt2img-cpu-v1": ("cpu-float32-v1", False),
        "ordinary-canvas-euler-txt2img-cuda-fp16-v1": ("cuda-float16-v1", False),
        "ordinary-canvas-euler-txt2img-cpu-v2": ("cpu-float32-v1", True),
        "ordinary-canvas-euler-txt2img-cuda-fp16-v2": ("cuda-float16-v1", True),
        "ordinary-canvas-euler-ancestral-txt2img-cpu-v1": ("cpu-float32-v1", True),
        "ordinary-canvas-euler-ancestral-txt2img-cuda-fp16-v1": ("cuda-float16-v1", True),
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cpu-v1": ("cpu-float32-v1", True),
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1": (
            "cuda-float16-v1",
            True,
        ),
        "ordinary-canvas-euler-txt2img-cuda-vae-v1": ("cuda-float16-v1", True),
        "ordinary-canvas-euler-ancestral-txt2img-cuda-vae-v1": ("cuda-float16-v1", True),
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-vae-v1": (
            "cuda-float16-v1",
            True,
        ),
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cpu-v1": ("cpu-float32-v1", True),
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-fp16-v1": (
            "cuda-float16-v1",
            True,
        ),
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1": (
            "cuda-float16-v1",
            True,
        ),
        "ordinary-canvas-euler-img2img-cpu-v1": ("cpu-float32-v1", True),
        "ordinary-canvas-euler-img2img-cuda-fp16-v1": ("cuda-float16-v1", True),
    }
    _require(
        type(denoising_profile) is str and denoising_profile in profiles,
        "PROFILE_INVALID",
        "Unsupported private denoising profile.",
    )
    tensor_profile = _encoding_tensor_profile(profile)
    expected, resolved_noise = profiles[denoising_profile]
    _require(
        profile not in _INVOKE_PROFILES or resolved_noise,
        "PROFILE_INVALID",
        "Invoke Canvas composition requires the explicit V2 Euler noise policy.",
    )
    _require(
        tensor_profile == expected,
        "PROFILE_INVALID",
        "Encoding and denoising profiles must select the same CPU/CUDA lane.",
    )
    _require(
        not _vae_profile(denoising_profile) or profile in _INVOKE_PROFILES,
        "PROFILE_INVALID",
        "Prepared VAE decode requires the public Invoke Canvas encoding profile.",
    )
    _require(
        not _dpmpp_2m_profile(denoising_profile) or profile in _INVOKE_PROFILES,
        "PROFILE_INVALID",
        "DPM++ 2M requires the explicit Invoke Canvas encoding profile.",
    )
    return tensor_profile, resolved_noise


def _img2img_profile(denoising_profile: _DenoisingProfile) -> bool:
    return denoising_profile in (
        "ordinary-canvas-euler-img2img-cpu-v1",
        "ordinary-canvas-euler-img2img-cuda-fp16-v1",
    )


def _img2img_strength(value: object) -> float:
    _require(
        _finite_number(value) and 0 <= cast(float, value) <= 1,
        "INPUT_INVALID",
        "Img2img strength must be finite in [0,1], excluding bool.",
    )
    return cast(float, value)


def _vae_profile(denoising_profile: _DenoisingProfile) -> bool:
    return denoising_profile in (
        "ordinary-canvas-euler-txt2img-cuda-vae-v1",
        "ordinary-canvas-euler-ancestral-txt2img-cuda-vae-v1",
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-vae-v1",
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1",
    )


def _ancestral_profile(denoising_profile: _DenoisingProfile) -> bool:
    return denoising_profile in (
        "ordinary-canvas-euler-ancestral-txt2img-cpu-v1",
        "ordinary-canvas-euler-ancestral-txt2img-cuda-fp16-v1",
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cpu-v1",
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1",
        "ordinary-canvas-euler-ancestral-txt2img-cuda-vae-v1",
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-vae-v1",
    )


def _invoke_initialization_profile(denoising_profile: _DenoisingProfile) -> bool:
    return denoising_profile in (
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cpu-v1",
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1",
        "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-vae-v1",
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cpu-v1",
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-fp16-v1",
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1",
    )


def _dpmpp_2m_profile(denoising_profile: _DenoisingProfile) -> bool:
    return denoising_profile in (
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cpu-v1",
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-fp16-v1",
        "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1",
    )


def _validated_noise_profile(value: object) -> IllustriousNoiseProfile:
    """Require and detach exactly the four existing versioned policy fields."""
    _require(
        type(value) is IllustriousNoiseProfile,
        "INPUT_INVALID",
        "V2 requires an exact explicit IllustriousNoiseProfile record.",
    )
    policy = cast(IllustriousNoiseProfile, value)
    _require(
        vars(policy).keys()
        == {"schema_version", "base_schedule", "rescale_betas_zero_snr", "timestep_spacing"},
        "INPUT_INVALID",
        "The noise policy must contain exactly its four complete fields.",
    )
    _require(
        type(policy.schema_version) is int
        and policy.schema_version == 1
        and type(policy.base_schedule) is str
        and policy.base_schedule == "sdxl-scaled-linear-v1"
        and type(policy.rescale_betas_zero_snr) is bool
        and type(policy.timestep_spacing) is str
        and policy.timestep_spacing in ("leading", "linspace", "trailing"),
        "INPUT_INVALID",
        "The noise policy requires exact version 1, scaled-linear-v1, bool and spacing fields.",
    )
    return IllustriousNoiseProfile(
        schema_version=policy.schema_version,
        base_schedule=policy.base_schedule,
        rescale_betas_zero_snr=policy.rescale_betas_zero_snr,
        timestep_spacing=policy.timestep_spacing,
    )


def _denoising_parameters(
    parameters: IllustriousInferenceParameters,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    *,
    resolved_noise: bool = False,
    ancestral: bool = False,
    prepared_vae: bool = False,
    dpmpp_2m: bool = False,
    invoke_cfg_rescale: bool = False,
) -> IllustriousNoiseProfile | None:
    _require(
        type(parameters) is IllustriousInferenceParameters,
        "INPUT_INVALID",
        "The exact base IllustriousInferenceParameters record is required.",
    )
    _require(
        not ancestral or resolved_noise,
        "PROFILE_INVALID",
        "Euler ancestral requires an explicit resolved noise policy.",
    )
    _require(
        not dpmpp_2m or (resolved_noise and not ancestral),
        "PROFILE_INVALID",
        "DPM++ 2M requires its own explicit resolved noise policy.",
    )
    _require(
        type(parameters.steps) is int
        and (
            1 <= parameters.steps <= MAX_GENERATION_STEPS
            if resolved_noise
            else parameters.steps in (1, 2)
        ),
        "INPUT_INVALID",
        f"DPM++ 2M requires an exact integer step count in [1,{MAX_GENERATION_STEPS}]."
        if dpmpp_2m
        else (
            f"V2 requires an exact integer Euler step count in [1,{MAX_GENERATION_STEPS}]."
            if resolved_noise
            else "This private native loop requires exactly one or two Euler steps."
        ),
    )
    noise_profile = _validated_noise_profile(parameters.noise_profile) if resolved_noise else None
    _require(
        _finite_number(parameters.cfg_scale) and 1 <= parameters.cfg_scale <= 30,
        "INPUT_INVALID",
        "CFG must be finite in [1,30], excluding bool.",
    )
    if invoke_cfg_rescale:
        # InvokeAI a61ac4fb: RescaleCFGExt runs its std-ratio/blend after CFG.
        # The existing run_sdxl_pipeline/native SDXL owner performs that same operation.
        _require(
            _finite_number(parameters.cfg_rescale)
            and 0 <= parameters.cfg_rescale <= MAX_GENERATION_CFG_RESCALE,
            "INPUT_INVALID",
            "Invoke Canvas requires finite CFG rescale in [0,0.99], excluding bool.",
        )
    else:
        _require(
            _finite_number(parameters.cfg_rescale) and parameters.cfg_rescale == 0,
            "UNSUPPORTED",
            "This first denoising profile requires CFG rescale zero.",
        )
    _require(
        type(parameters.scheduler) is str
        and (
            parameters.scheduler in ("dpmpp_2m", "dpmpp_2m_k")
            if dpmpp_2m
            else parameters.scheduler == ("euler_a" if ancestral else "euler")
        )
        and type(parameters.prediction_type) is str
        and parameters.prediction_type == "epsilon"
        and (resolved_noise or parameters.noise_profile is None),
        "UNSUPPORTED",
        "Only deterministic DPM++ 2M/epsilon is supported."
        if dpmpp_2m
        else (
            "Only Euler ancestral/epsilon is supported."
            if ancestral
            else (
                "Only Euler/epsilon is supported."
                if resolved_noise
                else "Only Euler/epsilon with no noise profile is supported."
            )
        ),
    )
    if prepared_vae:
        _require(
            tensor_profile == "cuda-float16-v1",
            "PROFILE_INVALID",
            "Prepared VAE decode requires CUDA FP16 denoising.",
        )
        validate_regional_vae_parameters(parameters)
    else:
        _require(
            parameters.vae is None
            and type(parameters.vae_precision) is str
            and (
                parameters.vae_precision == "FP16"
                if tensor_profile == "cuda-float16-v1"
                else parameters.vae_precision in ("Auto", "FP32")
            ),
            "UNSUPPORTED",
            "External VAE requests are unsupported; CPU requires Auto/FP32 and CUDA requires FP16.",
        )
    return noise_profile


def _reject_method_shadows(objects: tuple[Any, ...]) -> None:
    for obj in objects:
        cls = cast(Any, type(obj))
        _require(
            not any(callable(getattr(cls, key, None)) for key in obj.__dict__),
            "PROFILE_INVALID",
            "Used native objects must have no instance method shadows.",
        )


def _reject_local_forward_hooks(modules: tuple[Any, ...]) -> None:
    _require(
        all(not module._forward_pre_hooks and not module._forward_hooks for module in modules),
        "PROFILE_INVALID",
        "All pre-existing local UNet/VAE forward pre/post hooks are unsupported.",
    )


def _img2img_vae_preflight(torch: Any, modules: tuple[Any, ...]) -> None:
    """Admit the finite native VAE graph whose forward preserves borrowed state.

    Invoke owns its loaded VAE; this private consumer instead borrows it. An
    arbitrary native eval module is insufficient: InstanceNorm can still update
    existing running buffers. Keep this restriction local to the new image lane.
    """
    native_types = (
        ("diffusers.models.autoencoders.autoencoder_kl", "AutoencoderKL"),
        ("diffusers.models.autoencoders.vae", "Encoder"),
        ("diffusers.models.autoencoders.vae", "Decoder"),
        ("diffusers.models.unets.unet_2d_blocks", "DownEncoderBlock2D"),
        ("diffusers.models.unets.unet_2d_blocks", "UpDecoderBlock2D"),
        ("diffusers.models.unets.unet_2d_blocks", "UNetMidBlock2D"),
        ("diffusers.models.resnet", "ResnetBlock2D"),
        ("diffusers.models.downsampling", "Downsample2D"),
        ("diffusers.models.upsampling", "Upsample2D"),
        ("diffusers.models.attention_processor", "Attention"),
    )
    allowed = {getattr(importlib.import_module(module), name) for module, name in native_types} | {
        torch.nn.Conv2d,
        torch.nn.ModuleList,
        torch.nn.GroupNorm,
        torch.nn.Dropout,
        torch.nn.SiLU,
        torch.nn.Linear,
    }
    _require(
        all(type(module) in allowed for module in modules),
        "PROFILE_INVALID",
        "Img2img requires the qualified native VAE module classes without stateful substitutes.",
    )


def _denoising_model_preflight(
    pipeline: Any,
    *,
    torch: Any,
    diffusers: Any,
    parts: tuple[Any, ...],
    clip_modules: tuple[Any, ...],
    unet_modules: tuple[Any, ...],
    vae_modules: tuple[Any, ...],
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    vae_parameters: IllustriousInferenceParameters | None = None,
) -> None:
    _reject_local_forward_hooks((*unet_modules, *vae_modules))
    _reject_method_shadows((pipeline, *parts, *clip_modules, *unet_modules, *vae_modules))
    if vae_parameters is None:
        _module_profile(torch, (*unet_modules, *vae_modules), tensor_profile)
    else:
        _module_profile(torch, unet_modules, tensor_profile)
        validate_prepared_regional_vae(pipeline, vae_parameters, torch, vae_modules)
    _unet_profile(pipeline.unet)
    _require(
        pipeline.watermark is None
        and getattr(pipeline, "image_encoder", None) is None
        and getattr(pipeline, "feature_extractor", None) is None,
        "UNSUPPORTED",
        "Watermark and image-conditioning resources are outside this profile.",
    )
    vae = pipeline.vae
    _require(
        type(vae) is diffusers.AutoencoderKL
        and vae.use_slicing is False
        and vae.use_tiling is False
        and not getattr(vae.encoder, "gradient_checkpointing", False)
        and not getattr(vae.decoder, "gradient_checkpointing", False),
        "PROFILE_INVALID",
        "VAE decode requires native unsliced, untiled, non-checkpointed AutoencoderKL.",
    )
    config = vae.config
    _require(
        _finite_number(config.scaling_factor)
        and config.scaling_factor > 0
        and type(config.force_upcast) is bool
        and (
            vae_parameters is not None
            or tensor_profile != "cuda-float16-v1"
            or config.force_upcast is False
        ),
        "PROFILE_INVALID",
        "VAE scaling must be finite and positive; CUDA requires force_upcast exactly False.",
    )
    shift = getattr(config, "shift_factor", None)
    _require(
        shift is None or _finite_number(shift),
        "PROFILE_INVALID",
        "VAE shift must be absent or finite.",
    )
    mean, std = getattr(config, "latents_mean", None), getattr(config, "latents_std", None)
    _require(
        (mean is None and std is None)
        or (
            type(mean) in (tuple, list)
            and type(std) in (tuple, list)
            and len(cast(tuple[Any, ...] | list[Any], mean))
            == len(cast(tuple[Any, ...] | list[Any], std))
            == 4
            and all(_finite_number(value) for value in cast(tuple[Any, ...] | list[Any], mean))
            and all(
                _finite_number(value) and value > 0
                for value in cast(tuple[Any, ...] | list[Any], std)
            )
        ),
        "PROFILE_INVALID",
        "Native VAE latent normalization must be absent or four finite means/positive scales.",
    )
    processors = cast(Any, importlib.import_module("diffusers.models.attention_processor"))
    _require(
        all(
            type(module.processor) is processors.AttnProcessor2_0
            for module in vae_modules
            if isinstance(module, processors.Attention)
        ),
        "PROFILE_INVALID",
        "VAE attention requires the original standard native processors.",
    )


def _fresh_pipeline(
    pipeline: Any,
    parameters: IllustriousInferenceParameters,
    runtime: MLRuntime,
    *,
    resolved_noise: bool = False,
    ancestral: bool = False,
    dpmpp_2m: bool = False,
    img2img: bool = False,
) -> Any:
    diffusers = cast(Any, runtime.diffusers)
    # V1 retains its fixed policy and three-argument seam. V2 uses only the
    # validated explicit four-field policy, detached again for the selector.
    # Neither path inherits trained_betas/sigma/spacing policy or registers
    # config on the borrowed scheduler/parameters.
    scheduler_parameters = replace(
        parameters,
        noise_profile=_validated_noise_profile(parameters.noise_profile)
        if resolved_noise
        else IllustriousNoiseProfile(rescale_betas_zero_snr=False, timestep_spacing="linspace"),
    )
    scheduler = select_inference_scheduler(scheduler_parameters, pipeline, runtime)
    if dpmpp_2m:
        _require(
            resolved_noise
            and not ancestral
            and type(scheduler) is diffusers.DPMSolverMultistepScheduler
            and scheduler is not pipeline.scheduler
            and scheduler.config.prediction_type == "epsilon"
            and scheduler.config.algorithm_type == "dpmsolver++"
            and type(scheduler.config.solver_order) is int
            and scheduler.config.solver_order == 2
            and scheduler.order == 1
            and scheduler.config.solver_type == "midpoint"
            and scheduler.config.use_karras_sigmas is (parameters.scheduler == "dpmpp_2m_k")
            and scheduler.config.thresholding is False
            and scheduler.config.lower_order_final is True
            and scheduler.config.euler_at_final is False
            and scheduler.config.final_sigmas_type == "zero"
            and scheduler.config.use_exponential_sigmas is False
            and scheduler.config.use_beta_sigmas is False
            and scheduler.config.use_lu_lambdas is False
            and scheduler.config.use_flow_sigmas is False,
            "PROFILE_INVALID",
            "Scheduler selection must create the exact fresh native epsilon DPM++ 2M policy.",
        )
    else:
        _require(
            type(scheduler)
            is (
                diffusers.EulerAncestralDiscreteScheduler
                if ancestral
                else diffusers.EulerDiscreteScheduler
            )
            and scheduler is not pipeline.scheduler
            and scheduler.config.prediction_type == "epsilon",
            "PROFILE_INVALID",
            "Scheduler selection must create a fresh native epsilon Euler ancestral instance."
            if ancestral
            else "Scheduler selection must create a fresh native epsilon Euler instance.",
        )
    # InvokeAI a61ac4fb grafts image-to-latents onto the same denoising graph.
    # Reuse the ordinary worker's training-cutoff/replayable-posterior adaptation
    # and the original native loop; only this fresh wrapper changes class.
    pipeline_class = (
        img2img_pipeline_class(diffusers, runtime.torch)
        if img2img
        else diffusers.StableDiffusionXLPipeline
    )
    fresh = pipeline_class(
        vae=pipeline.vae,
        text_encoder=pipeline.text_encoder,
        text_encoder_2=pipeline.text_encoder_2,
        tokenizer=pipeline.tokenizer,
        tokenizer_2=pipeline.tokenizer_2,
        unet=pipeline.unet,
        scheduler=scheduler,
        image_encoder=None,
        feature_extractor=None,
        add_watermarker=False,
        force_zeros_for_empty_prompt=True,
    )
    fresh.set_progress_bar_config(disable=True)
    return fresh


@contextmanager
def _scoped_ancestral_generator(
    fresh: Any, torch: Any, seed: int, tensor_profile: _TensorProfile
) -> Generator[None]:
    """Adapt Invoke's independent step RNG through the original native kwargs owner.

    InvokeAI a61ac4fb, app/invocations/sd/denoise_latents.py: init_scheduler
    creates a compute-device generator with all seed bits flipped; the original
    diffusion backend forwards it to scheduler.step. Only this fresh wrapper's
    kwargs method is scoped here. Initial-noise generation and the native loop
    remain unchanged, and no borrowed object receives a method shadow.
    """
    original = fresh.prepare_extra_step_kwargs
    _require(
        callable(original) and "generator" in inspect.signature(fresh.scheduler.step).parameters,
        "PROFILE_INVALID",
        "Native Euler ancestral must accept the independent step generator.",
    )
    policy = _tensor_policy(torch, tensor_profile)
    step_generator = torch.Generator(device=policy.device).manual_seed(seed ^ 0xFFFFFFFF)
    missing = object()
    previous = fresh.__dict__.get("prepare_extra_step_kwargs", missing)

    @wraps(original)
    def prepare_extra_step_kwargs(generator: Any, eta: Any) -> dict[str, Any]:
        options = original(generator, eta)
        _require(
            type(options) is dict and "generator" in options and options["generator"] is generator,
            "PROFILE_INVALID",
            "Native step kwargs must preserve the supplied generator before adaptation.",
        )
        return {**cast(dict[str, Any], options), "generator": step_generator}

    try:
        fresh.prepare_extra_step_kwargs = prepare_extra_step_kwargs
        yield
    finally:
        if previous is missing:
            fresh.__dict__.pop("prepare_extra_step_kwargs", None)
        else:
            fresh.prepare_extra_step_kwargs = previous


def _dpmpp_2m_initial_state(scheduler: Any, torch: Any, tensor_profile: _TensorProfile) -> None:
    """Admit native 2M state without manufacturing Euler-specific attributes."""
    policy = _tensor_policy(torch, tensor_profile)
    count = scheduler.num_inference_steps
    _require(
        type(count) is int
        and 1 <= count <= MAX_GENERATION_STEPS
        and scheduler.step_index is None
        and scheduler.begin_index is None
        and type(scheduler.lower_order_nums) is int
        and scheduler.lower_order_nums == 0
        and type(scheduler.model_outputs) is list
        and len(scheduler.model_outputs) == 2
        and all(value is None for value in scheduler.model_outputs)
        and type(scheduler.timesteps) is torch.Tensor
        and scheduler.timesteps.layout == torch.strided
        and scheduler.timesteps.dtype == torch.int64
        and scheduler.timesteps.device == policy.device
        and scheduler.timesteps.requires_grad is False
        and tuple(scheduler.timesteps.shape) == (count,)
        and type(scheduler.sigmas) is torch.Tensor
        and scheduler.sigmas.layout == torch.strided
        and scheduler.sigmas.dtype == torch.float32
        and scheduler.sigmas.device == torch.device("cpu")
        and scheduler.sigmas.requires_grad is False
        and tuple(scheduler.sigmas.shape) == (count + 1,),
        "PROFILE_INVALID",
        "DPM++ 2M requires its bounded unconsumed native schedule and empty history.",
    )
    _require(
        bool(((scheduler.timesteps >= 0) & (scheduler.timesteps < 1000)).all().item())
        and bool(torch.isfinite(scheduler.sigmas).all().item())
        and bool((scheduler.sigmas >= 0).all().item()),
        "PROFILE_INVALID",
        "DPM++ 2M requires finite nonnegative native sigmas and training timesteps.",
    )


@contextmanager
def _scoped_invoke_initialization(
    fresh: Any,
    torch: Any,
    seed: int,
    tensor_profile: _TensorProfile,
    *,
    dpmpp_2m: bool = False,
) -> Generator[None]:
    """Adapt InvokeAI a61ac4fb's txt2img initialization on one owned wrapper.

    latent_noise.generate_noise_tensor draws FP32 on CPU then casts on CPU;
    denoise_latents transfers noise and uses zero txt2img latents, followed by
    diffusion_backend's original scheduler.add_noise. The existing native
    pipeline owns schedule creation, begin-index setup, the loop and decoding.
    No borrowed module or global random function receives a shadow.
    """
    policy = _tensor_policy(torch, tensor_profile)
    _require(type(seed) is int and 0 <= seed <= 0xFFFFFFFF, "INPUT_INVALID", "Invalid seed.")
    _require(
        "prepare_latents" not in vars(fresh),
        "SCOPE_CONFLICT",
        "The owned initialization slot is already in use.",
    )
    original = fresh.prepare_latents
    _require(
        callable(original) and getattr(original, "__self__", None) is fresh,
        "PROFILE_INVALID",
        "Initialization requires the owned native bound preparation method.",
    )
    started = completed = False

    @wraps(original)
    def prepare_latents(*args: Any, **kwargs: Any) -> Any:
        nonlocal started, completed
        _require(not started, "SCOPE_CONFLICT", "Initial preparation cannot repeat or reenter.")
        started = True
        values = inspect.signature(original).bind(*args, **kwargs)
        values.apply_defaults()
        call = values.arguments
        height, width = call["height"], call["width"]
        _require(
            type(call["batch_size"]) is int
            and call["batch_size"] == 1
            and type(call["num_channels_latents"]) is int
            and call["num_channels_latents"] == 4
            and type(height) is int
            and type(width) is int
            and 8 <= height <= 2048
            and 8 <= width <= 2048
            and height % 8 == width % 8 == 0
            and height * width <= 4_000_000
            and type(fresh.vae_scale_factor) is int
            and fresh.vae_scale_factor == 8,
            "INPUT_INVALID",
            "Initialization requires one bounded native four-channel latent.",
        )
        _require(
            call["latents"] is None
            and call["dtype"] == policy.dtype
            and torch.device(call["device"]) == policy.device,
            "INPUT_INVALID",
            "Initialization requires native noise and the selected dtype/device.",
        )
        generator = call["generator"]
        _require(
            type(generator) is torch.Generator
            and str(generator.device) == "cpu"
            and generator.initial_seed() == seed,
            "INPUT_INVALID",
            "Initialization requires the seeded CPU generator.",
        )
        expected = torch.Generator(device="cpu").manual_seed(seed)
        _require(
            torch.equal(generator.get_state(), expected.get_state()),
            "INPUT_INVALID",
            "The initial CPU generator must be unconsumed.",
        )
        scheduler = fresh.scheduler
        schedule = sigmas = history = schedule_values = sigma_values = None
        if dpmpp_2m:
            _dpmpp_2m_initial_state(scheduler, torch, tensor_profile)
            # At most 200 int64 timesteps and 201 FP32 sigmas. These bounded
            # witnesses are released before the first native UNet forward.
            schedule, sigmas, history = (
                scheduler.timesteps,
                scheduler.sigmas,
                scheduler.model_outputs,
            )
            schedule_values, sigma_values = schedule.clone(), sigmas.clone()
        else:
            _require(
                scheduler.step_index is None
                and scheduler.begin_index is None
                and scheduler.is_scale_input_called is False
                and scheduler.timesteps.ndim == 1
                and scheduler.timesteps.numel() > 0,
                "PROFILE_INVALID",
                "Native schedule creation must precede unconsumed initialization.",
            )
        shape = (1, 4, height // 8, width // 8)
        # Keep Invoke's cast-before-transfer order, including the FP32 CPU lane.
        noise = torch.randn(*shape, device="cpu", dtype=torch.float32, generator=generator)
        noise = noise.to(device="cpu", dtype=policy.dtype).to(device=policy.device)
        latent = scheduler.add_noise(
            torch.zeros_like(noise), noise, scheduler.timesteps[:1].expand(shape[0])
        )
        _require(
            tuple(latent.shape) == shape
            and latent.dtype == policy.dtype
            and latent.device == policy.device
            and bool(torch.isfinite(latent).all())
            and scheduler.step_index is None
            and scheduler.begin_index is None
            and (dpmpp_2m or scheduler.is_scale_input_called is False),
            "PROFILE_INVALID",
            "Native initialization must return finite latents without advancing the scheduler.",
        )
        if dpmpp_2m:
            _dpmpp_2m_initial_state(scheduler, torch, tensor_profile)
            _require(
                scheduler.timesteps is schedule
                and scheduler.sigmas is sigmas
                and scheduler.model_outputs is history
                and torch.equal(schedule, schedule_values)
                and torch.equal(sigmas, sigma_values),
                "PROFILE_INVALID",
                "DPM++ 2M initialization must preserve its native schedule and history.",
            )
        completed = True
        return latent

    try:
        fresh.prepare_latents = prepare_latents
        yield
        _require(
            completed, "PROFILE_INVALID", "The native pipeline did not prepare initial latents."
        )
    finally:
        fresh.__dict__.pop("prepare_latents", None)


def _effective_padding_mask(
    torch: Any,
    conditioning: SdxlConditioning,
    layout: _Layout,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> Any:
    """Mirror only the existing helper's mask predicate/values, never install padding."""
    keys = conditioning.positive.shape[1]
    negative_length, positive_length = conditioning.negative_length, conditioning.positive_length
    if negative_length == positive_length or (
        layout == "positive-only" and positive_length == keys
    ):
        return None
    lengths = (
        (negative_length, positive_length) if layout == "cfg-negative-first" else (positive_length,)
    )
    policy = _tensor_policy(torch, tensor_profile)
    mask = torch.zeros((len(lengths), keys), dtype=policy.dtype, device=policy.device)
    for row, length in enumerate(lengths):
        mask[row, :length] = 1
    return mask


def _dynamic_tensor(
    torch: Any,
    value: Any,
    shape: tuple[int, ...],
    name: str,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    *,
    timestep: bool = False,
    dpmpp_2m: bool = False,
) -> None:
    policy = _tensor_policy(torch, tensor_profile)
    _require(
        type(value) is torch.Tensor
        and value.device == policy.device
        and value.layout == torch.strided
        and value.dtype
        == ((torch.int64 if dpmpp_2m else torch.float32) if timestep else policy.dtype)
        and value.requires_grad is False
        and tuple(value.shape) == shape,
        "INPUT_INVALID",
        f"Each native {name} must retain its selected shape/profile (timestep is int64)."
        if dpmpp_2m
        else f"Each native {name} must retain its selected shape/profile (timestep is float32).",
    )
    _require(
        value.numel() <= _MAX_FINITE_ELEMENTS, "LIMIT", f"{name} exceeds its finite-check bound."
    )
    _require(bool(torch.isfinite(value).all().item()), "INPUT_INVALID", f"{name} must be finite.")


@contextmanager
def _scoped_denoising_value_guards(
    root: Any,
    *,
    torch: Any,
    bindings: tuple[TransformerBinding, ...],
    plan: AttentionPlan,
    context: Any,
    pools: Any,
    mask: Any,
    steps: int,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    dpmpp_2m: bool = False,
    expected_steps: Callable[[], object] | None = None,
) -> Generator[None]:
    """Observe final native arguments after the helper's later-installed padding hook.

    The owned root forward slot runs after *all* native prehooks. attn2 guards
    are appended after adapter hooks; pre-existing hooks were already refused.
    The adapter's outer call-entry wrappers retain failure latching, thread and
    reentry enforcement. Setup and all native forwards share this journal.
    """
    batch = len(plan.batch_signs)
    height, width = plan.latent_shape.height, plan.latent_shape.width
    policy = _tensor_policy(torch, tensor_profile)
    # These are guard expectations for the unchanged helper's fixed policy.
    # Only the native pipeline derives actual time IDs; bbox world x/y never enter.
    time_ids = torch.tensor(
        [(*_SDXL_MICRO_CONDITIONING_SIZE, 0, 0, *_SDXL_MICRO_CONDITIONING_SIZE)] * batch,
        dtype=policy.dtype,
        device=policy.device,
    )
    attention_mask = None if mask is None else ((1 - mask) * -10000.0).unsqueeze(1)
    sites = tuple(
        block.attn2 for binding in bindings for block in binding.transformer.transformer_blocks
    )
    expected_sites = {id(site) for site in sites}
    signature = inspect.signature(cast(Any, type(root)).forward)
    original_forward = root.forward
    present, previous = "forward" in root.__dict__, root.__dict__.get("forward")
    handles: list[Any] = []
    completed = 0
    active: set[int] | None = None
    actual_steps: int | None = None

    def step_limit() -> int:
        nonlocal actual_steps
        if expected_steps is None:
            return steps
        current = expected_steps()
        _require(
            type(current) is int and 0 <= current <= steps,
            "INPUT_INVALID",
            "Native img2img schedule must contain an exact bounded step count.",
        )
        count = cast(int, current)
        _require(
            actual_steps is None or actual_steps == count,
            "INPUT_INVALID",
            "Native img2img step count changed during execution.",
        )
        actual_steps = count
        return count

    def native_forward(*args: Any, **kwargs: Any) -> Any:
        nonlocal active, completed
        _require(active is None, "SCOPE_CONFLICT", "Reentrant denoising forward is unsupported.")
        _require(
            completed < step_limit(),
            "INPUT_INVALID",
            "Native loop exceeded its declared step count.",
        )
        try:
            bound = signature.bind(root, *args, **kwargs)
        except TypeError as error:
            raise IllustriousRegionalDenoisingError("INPUT_INVALID", str(error)) from error
        bound.apply_defaults()
        values = bound.arguments
        _dynamic_tensor(
            torch, values.get("sample"), (batch, 4, height, width), "sample", tensor_profile
        )
        _dynamic_tensor(
            torch,
            values.get("timestep"),
            (),
            "timestep",
            tensor_profile,
            timestep=True,
            **({"dpmpp_2m": True} if dpmpp_2m else {}),
        )
        _owned_value(torch, values.get("encoder_hidden_states"), context, "encoder_hidden_states")
        _owned_value(torch, values.get("encoder_attention_mask"), mask, "encoder_attention_mask")
        added = values.get("added_cond_kwargs")
        _require(
            type(added) is dict and added.keys() == {"text_embeds", "time_ids"},
            "INPUT_INVALID",
            "Every step requires exactly the owned selected pools and fixed native time IDs.",
        )
        conditions = cast(dict[str, Any], added)
        _owned_value(torch, conditions["text_embeds"], pools, "text_embeds")
        _owned_value(torch, conditions["time_ids"], time_ids, "time_ids")
        active = set()
        try:
            result = original_forward(*args, **kwargs)
            _require(
                active == expected_sites,
                "INPUT_INVALID",
                "Every native forward must consume every declared regional cross-attention site.",
            )
            completed += 1
            return result
        finally:
            active = None

    def install(site: Any) -> None:
        site_signature = inspect.signature(cast(Any, type(site)).forward)

        def before(current: Any, args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
            _require(
                active is not None,
                "SCOPE_CONFLICT",
                "Cross attention requires its active native step.",
            )
            try:
                bound = site_signature.bind(current, *args, **kwargs)
            except TypeError as error:
                raise IllustriousRegionalDenoisingError("INPUT_INVALID", str(error)) from error
            bound.apply_defaults()
            _owned_value(
                torch,
                bound.arguments.get("encoder_hidden_states"),
                context,
                "encoder_hidden_states",
            )
            _owned_value(
                torch, bound.arguments.get("attention_mask"), attention_mask, "attention_mask"
            )
            cast(set[int], active).add(id(current))

        handles.append(site.register_forward_pre_hook(before, with_kwargs=True, prepend=False))

    try:
        root.__dict__["forward"] = native_forward
        for site in sites:
            install(site)
        yield
        _require(
            completed == step_limit(),
            "INPUT_INVALID",
            "Native loop did not complete its declared steps.",
        )
    finally:
        for handle in reversed(handles):
            handle.remove()
        if present:
            root.__dict__["forward"] = previous
        else:
            root.__dict__.pop("forward", None)


def _native_output(
    result: Any,
    *,
    torch: Any,
    width: int,
    height: int,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> None:
    policy = _tensor_policy(torch, tensor_profile)
    output_type = cast(
        Any, importlib.import_module("diffusers.pipelines.stable_diffusion_xl.pipeline_output")
    ).StableDiffusionXLPipelineOutput
    _require(
        type(result) is output_type, "PROFILE_INVALID", "Expected the original native SDXL output."
    )
    image = result.images
    _require(
        type(image) is torch.Tensor
        and image.device == policy.device
        and image.layout == torch.strided
        and image.dtype == policy.dtype
        and image.requires_grad is False
        and tuple(image.shape) == (1, 3, height, width),
        "INPUT_INVALID",
        "Native pt output must retain selected device/dtype and shape [1,3,H,W].",
    )
    # At most 12,000,000 image values: check bounded row slices without flattening
    # or cloning the returned image (which may be a non-contiguous native view).
    rows = max(1, _MAX_FINITE_ELEMENTS // (3 * width))
    for start in range(0, height, rows):
        _require(
            bool(torch.isfinite(image[:, :, start : start + rows, :]).all().item()),
            "INPUT_INVALID",
            "Native image output must be finite.",
        )


def run_current_canvas_regional_denoising(
    recipe: object,
    *,
    pipeline: Any,
    runtime: MLRuntime,
    parameters: IllustriousInferenceParameters,
    profile: _Profile,
    denoising_profile: _DenoisingProfile,
    global_negative_coverage: Everywhere | Alpha8,
    global_positive_coverage: Everywhere | Alpha8,
    negative_pooled_source_id: str,
    positive_pooled_source_id: str,
    bindings: tuple[TransformerBinding, ...],
    layout: _Layout,
    on_progress: DenoisingProgressSink | None = None,
    image: Image.Image | None = None,
    denoising_strength: float | None = None,
) -> Any:
    """Return the original native pipeline output after all owned state restores.

    Semantic kwargs are required. The actual ordinary target mode is a trusted
    Main precondition; the recipe cannot authenticate it. Only explicit img2img
    profiles accept the paired owned RGB image and finite strength in [0,1].
    They reuse the ordinary native factory, including its replayable posterior
    and compute-dtype initial noise; no txt2img initializer is applied. Strength
    zero performs native VAE encode/decode with zero denoising steps.
    No sample, timestep,
    time IDs, generator, native callbacks, plan, text override or arbitrary kwargs enter.
    The optional trusted scalar sink observes completed native denoising steps only;
    it must preserve the cooperative borrowed-state and RNG contract.
    V1 profiles require one/two steps and no caller noise profile, selecting
    scaled-linear-v1 betas with zero-SNR false and linspace spacing. V2 profiles
    require 1..MAX_GENERATION_STEPS and an exact explicit four-field noise
    policy. The separately selected Euler-ancestral V1 profiles require the same
    explicit bounded policy with euler_a/epsilon and Invoke's independent,
    compute-device xor-seeded step generator. Initial-noise generation is unchanged.
    Additive DPM++ 2M profiles require Invoke composition/initialization, the same
    explicit policy, native int64 timesteps and independent xor step kwargs.
    The original deterministic multistep scheduler retains its own history.
    All use detached request policies; borrowed scheduler policy is unused.
    Invoke Canvas profiles admit the existing bounded CFG Rescale value. The
    unchanged native pipeline applies Invoke's standard-deviation ratio/blend
    after CFG and before the scheduler step; historical private profiles require zero.

    Payload arithmetic (not RSS): A=W*H <= 4,000,000; latent [1,4,H/8,W/8]
    float32 uses A/4 <= 1,000,000 bytes; CFG's doubled sample uses A/2 <=
    2,000,000. Final pt [1,3,H,W] uses 12*A <= 48,000,000 bytes. Two sign
    contexts/pools use <= 5,056,512 bytes before native concatenation.
    CUDA FP16 halves those payloads: terminal latent <= 500,000 bytes, CFG
    sample <= 1,000,000, original pt output <= 24,000,000, contexts/pools <=
    2,528,256. Euler timesteps remain selected-device float32 scalars. Encoded
    streams, scheduler/native workspaces, finite-check scratch, VAE intermediates
    and the adapter's <=32 MiB expanded Boolean mask remain separate lifetimes.
    Neither step count nor these payloads bound total RSS/VRAM.
    """
    _require(
        on_progress is None or callable(on_progress),
        "INPUT_INVALID",
        "Regional progress requires a callable sink.",
    )
    tensor_profile, resolved_noise = _execution_profile(denoising_profile, profile)
    img2img = _img2img_profile(denoising_profile)
    ancestral = _ancestral_profile(denoising_profile)
    dpmpp_2m = _dpmpp_2m_profile(denoising_profile)
    prepared_vae = _vae_profile(denoising_profile)
    invoke_cfg_rescale = profile in _INVOKE_PROFILES and not img2img
    if dpmpp_2m:
        noise_profile = _denoising_parameters(
            parameters,
            tensor_profile,
            resolved_noise=True,
            prepared_vae=prepared_vae,
            dpmpp_2m=True,
            invoke_cfg_rescale=invoke_cfg_rescale,
        )
        parameters = replace(parameters, noise_profile=noise_profile)
    elif resolved_noise:
        noise_profile = (
            _denoising_parameters(
                parameters,
                tensor_profile,
                resolved_noise=True,
                ancestral=True,
                prepared_vae=prepared_vae,
                invoke_cfg_rescale=invoke_cfg_rescale,
            )
            if ancestral
            else _denoising_parameters(
                parameters,
                tensor_profile,
                resolved_noise=True,
                prepared_vae=prepared_vae,
                invoke_cfg_rescale=invoke_cfg_rescale,
            )
        )
        parameters = replace(parameters, noise_profile=noise_profile)
    else:
        _denoising_parameters(parameters, tensor_profile, invoke_cfg_rescale=invoke_cfg_rescale)
    if img2img:
        _img2img_strength(denoising_strength)
        _require(
            type(image) is Image.Image and image.mode == "RGB",
            "INPUT_INVALID",
            "Img2img requires one owned RGB PIL image.",
        )
    else:
        _require(
            image is None and denoising_strength is None,
            "INPUT_INVALID",
            "Txt2img profiles do not accept image or strength inputs.",
        )
    bbox, pairs, parameters, shape, global_negative, global_positive = _recipe_inputs(
        recipe,
        parameters,
        profile,
        layout,
        global_negative_coverage,
        global_positive_coverage,
        negative_pooled_source_id,
        positive_pooled_source_id,
    )
    if img2img:
        _require(
            cast(Image.Image, image).size == (bbox.width, bbox.height),
            "INPUT_INVALID",
            "Img2img source dimensions must exactly match the complete recipe.",
        )
    torch, diffusers, compel, transformers = _native_runtime(runtime, tensor_profile)
    _reject_global_forward_hooks()
    parts = _pipeline_parts(pipeline, diffusers, transformers)
    _require(
        type(pipeline.vae) is diffusers.AutoencoderKL,
        "PROFILE_INVALID",
        "A standard native AutoencoderKL is required for decode.",
    )
    embedding_strategy = _encoding_embedding_strategy(profile)
    tree = bounded_ti_module_tree if profile in _TI_PROFILES else _module_tree
    clip_modules = tree(parts[2]) + tree(parts[3])
    unet_modules, vae_modules = _module_tree(parts[4]), _module_tree(pipeline.vae)
    tokenizer_backends = tuple(
        backend
        for tokenizer in parts[:2]
        if (backend := getattr(tokenizer, "backend_tokenizer", None)) is not None
    )
    with _reservation(
        (pipeline, *parts, *tokenizer_backends, *clip_modules, *unet_modules, *vae_modules)
    ):
        _recipe_adapter_preflight(unet_modules)
        _denoising_model_preflight(
            pipeline,
            torch=torch,
            diffusers=diffusers,
            parts=parts,
            clip_modules=clip_modules,
            unet_modules=unet_modules,
            vae_modules=vae_modules,
            tensor_profile=tensor_profile,
            **({"vae_parameters": parameters} if prepared_vae else {}),
        )
        if img2img:
            _require(
                pipeline.vae.config.force_upcast is False,
                "PROFILE_INVALID",
                "Img2img requires force_upcast exactly False before borrowing the VAE.",
            )
            _img2img_vae_preflight(torch, vae_modules)
        _recipe_model_preflight(
            pipeline,
            torch,
            diffusers,
            parts,
            clip_modules,
            tensor_profile,
            shared_readonly=embedding_strategy == "shared-readonly",
        )
        if img2img:
            fresh = _fresh_pipeline(
                pipeline, parameters, runtime, resolved_noise=True, img2img=True
            )
        elif dpmpp_2m:
            fresh = _fresh_pipeline(
                pipeline, parameters, runtime, resolved_noise=True, dpmpp_2m=True
            )
        elif ancestral:
            fresh = _fresh_pipeline(
                pipeline, parameters, runtime, resolved_noise=True, ancestral=True
            )
        else:
            fresh = (
                _fresh_pipeline(pipeline, parameters, runtime, resolved_noise=True)
                if resolved_noise
                else _fresh_pipeline(pipeline, parameters, runtime)
            )
        plan, negative, positive = _encode_recipe_bindings(
            bbox=bbox,
            pairs=pairs,
            parameters=parameters,
            shape=shape,
            global_negative=global_negative,
            global_positive=global_positive,
            pipeline=pipeline,
            runtime=runtime,
            torch=torch,
            compel=compel,
            parts=parts,
            clip_modules=clip_modules,
            unet_modules=unet_modules,
            bindings=bindings,
            layout=layout,
            tensor_profile=tensor_profile,
            embedding_strategy=embedding_strategy,
            invoke_canvas=profile in _INVOKE_PROFILES,
        )
        context, pools = _assemble_owned_conditioning(
            torch,
            negative=negative,
            positive=positive,
            signs=("negative", "positive"),
            keys=plan.key_length,
            selected=(
                _pool_source(negative, negative_pooled_source_id),
                _pool_source(positive, positive_pooled_source_id),
            ),
            tensor_profile=tensor_profile,
        )
        conditioning = SdxlConditioning(
            positive=context[1:2],
            negative=context[0:1],
            positive_pooled=pools[1:2],
            negative_pooled=pools[0:1],
            positive_length=plan.positive.length,
            negative_length=plan.negative.length,
        )
        generator = torch.Generator(device="cpu").manual_seed(parameters.seed)
        with (
            _scoped_invoke_initialization(
                fresh,
                torch,
                parameters.seed,
                tensor_profile,
                **({"dpmpp_2m": True} if dpmpp_2m else {}),
            )
            if _invoke_initialization_profile(denoising_profile)
            else nullcontext(),
            _scoped_ancestral_generator(fresh, torch, parameters.seed, tensor_profile)
            if ancestral or dpmpp_2m
            else nullcontext(),
            scoped_illustrious_regional_attention(
                parts[4],
                bindings=bindings,
                plan=plan,
                tensor_profile=tensor_profile,
                **(
                    {
                        "_allow_empty": lambda: (
                            type(fresh.num_timesteps) is int and fresh.num_timesteps == 0
                        )
                    }
                    if img2img
                    else {}
                ),
            ),
            finite_unet_outputs(fresh, torch),
            finite_vae_outputs(fresh, torch),
            _scoped_denoising_value_guards(
                parts[4],
                torch=torch,
                bindings=bindings,
                plan=plan,
                context=context if layout == "cfg-negative-first" else context[1:2],
                pools=pools if layout == "cfg-negative-first" else pools[1:2],
                mask=_effective_padding_mask(torch, conditioning, layout, tensor_profile),
                steps=parameters.steps,
                tensor_profile=tensor_profile,
                **({"dpmpp_2m": True} if dpmpp_2m else {}),
                **cast(Any, {"expected_steps": lambda: fresh.num_timesteps} if img2img else {}),
            ),
        ):
            progress_options: _ProgressOptions = (
                {"on_progress": on_progress} if on_progress is not None else {}
            )
            image_options: _ImageOptions = (
                {
                    "image": cast(Image.Image, image),
                    "denoising_strength": cast(float, denoising_strength),
                }
                if img2img
                else {}
            )
            result = run_sdxl_pipeline(
                fresh,
                conditioning,
                width=bbox.width,
                height=bbox.height,
                steps=parameters.steps,
                cfg_scale=parameters.cfg_scale,
                generator=generator,
                torch=torch,
                cfg_rescale=parameters.cfg_rescale,
                output_type="latent" if prepared_vae else "pt",
                **progress_options,
                **image_options,
            )
            if prepared_vae:
                result = decode_regional_latents(
                    result,
                    pipeline=fresh,
                    parameters=parameters,
                    torch=torch,
                    width=bbox.width,
                    height=bbox.height,
                )
                validate_regional_vae_output(
                    result,
                    pipeline=fresh,
                    parameters=parameters,
                    torch=torch,
                    width=bbox.width,
                    height=bbox.height,
                )
            else:
                _native_output(
                    result,
                    torch=torch,
                    width=bbox.width,
                    height=bbox.height,
                    tensor_profile=tensor_profile,
                )
    return result
