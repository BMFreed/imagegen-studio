"""Private ordinary transparent Canvas, native Euler txt2img execution.

The caller must supply an actual ordinary transparent target. The acknowledged
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

One native pipeline call owns the whole bounded Euler loop and decode. The regional
adapter remains installed throughout, including equal-length conditioning and
every repeated spatial consumption. Borrowed scheduler/call state is untouched;
only the existing adapter, finite-output hooks and private late value guards
temporarily change shared modules, with reverse restoration on every exit.
"""

from __future__ import annotations

import importlib
import inspect
import math
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import replace
from typing import Any, Literal, cast

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
from .inference import (
    _SDXL_MICRO_CONDITIONING_SIZE,  # pyright: ignore[reportPrivateUsage]
    MLRuntime,
    SdxlConditioning,
    run_sdxl_pipeline,
    select_inference_scheduler,
)
from .inference_lora import finite_unet_outputs
from .inference_vae import finite_vae_outputs
from .protocol import (
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
]
_Layout = Literal["cfg-negative-first", "positive-only"]
_MAX_FINITE_ELEMENTS = 8_388_608


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
    }
    _require(
        type(denoising_profile) is str and denoising_profile in profiles,
        "PROFILE_INVALID",
        "Unsupported private denoising profile.",
    )
    tensor_profile = _encoding_tensor_profile(profile)
    expected, resolved_noise = profiles[denoising_profile]
    _require(
        tensor_profile == expected,
        "PROFILE_INVALID",
        "Encoding and denoising profiles must select the same CPU/CUDA lane.",
    )
    return tensor_profile, resolved_noise


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
) -> IllustriousNoiseProfile | None:
    _require(
        type(parameters) is IllustriousInferenceParameters,
        "INPUT_INVALID",
        "The exact base IllustriousInferenceParameters record is required.",
    )
    _require(
        type(parameters.steps) is int
        and (
            1 <= parameters.steps <= MAX_GENERATION_STEPS
            if resolved_noise
            else parameters.steps in (1, 2)
        ),
        "INPUT_INVALID",
        f"V2 requires an exact integer Euler step count in [1,{MAX_GENERATION_STEPS}]."
        if resolved_noise
        else "This private native loop requires exactly one or two Euler steps.",
    )
    noise_profile = _validated_noise_profile(parameters.noise_profile) if resolved_noise else None
    _require(
        _finite_number(parameters.cfg_scale) and 1 <= parameters.cfg_scale <= 30,
        "INPUT_INVALID",
        "CFG must be finite in [1,30], excluding bool.",
    )
    _require(
        _finite_number(parameters.cfg_rescale) and parameters.cfg_rescale == 0,
        "UNSUPPORTED",
        "This first denoising profile requires CFG rescale zero.",
    )
    _require(
        type(parameters.scheduler) is str
        and parameters.scheduler == "euler"
        and type(parameters.prediction_type) is str
        and parameters.prediction_type == "epsilon"
        and (resolved_noise or parameters.noise_profile is None),
        "UNSUPPORTED",
        "Only Euler/epsilon is supported."
        if resolved_noise
        else "Only Euler/epsilon with no noise profile is supported.",
    )
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
) -> None:
    _reject_local_forward_hooks((*unet_modules, *vae_modules))
    _reject_method_shadows((pipeline, *parts, *clip_modules, *unet_modules, *vae_modules))
    _module_profile(torch, (*unet_modules, *vae_modules), tensor_profile)
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
        and (tensor_profile != "cuda-float16-v1" or config.force_upcast is False),
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
    _require(
        type(scheduler) is diffusers.EulerDiscreteScheduler
        and scheduler is not pipeline.scheduler
        and scheduler.config.prediction_type == "epsilon",
        "PROFILE_INVALID",
        "Scheduler selection must create a fresh native epsilon Euler instance.",
    )
    fresh = diffusers.StableDiffusionXLPipeline(
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
) -> None:
    policy = _tensor_policy(torch, tensor_profile)
    _require(
        type(value) is torch.Tensor
        and value.device == policy.device
        and value.layout == torch.strided
        and value.dtype == (torch.float32 if timestep else policy.dtype)
        and value.requires_grad is False
        and tuple(value.shape) == shape,
        "INPUT_INVALID",
        f"Each native {name} must retain its selected shape/profile (timestep is float32).",
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

    def native_forward(*args: Any, **kwargs: Any) -> Any:
        nonlocal active, completed
        _require(active is None, "SCOPE_CONFLICT", "Reentrant denoising forward is unsupported.")
        _require(
            completed < steps, "INPUT_INVALID", "Native loop exceeded its declared step count."
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
            torch, values.get("timestep"), (), "timestep", tensor_profile, timestep=True
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
            completed == steps, "INPUT_INVALID", "Native loop did not complete its declared steps."
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
) -> Any:
    """Return the original native pipeline output after all owned state restores.

    All kwargs are required. An actual ordinary transparent target is a trusted
    Main precondition; the recipe cannot authenticate mode. No sample, timestep,
    time IDs, generator, callbacks, plan, text override or arbitrary kwargs enter.
    V1 profiles require one/two steps and no caller noise profile, selecting
    scaled-linear-v1 betas with zero-SNR false and linspace spacing. V2 profiles
    require 1..MAX_GENERATION_STEPS and an exact explicit four-field noise
    policy. Both use detached request policies; borrowed scheduler policy is unused.

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
    tensor_profile, resolved_noise = _execution_profile(denoising_profile, profile)
    if resolved_noise:
        noise_profile = _denoising_parameters(parameters, tensor_profile, resolved_noise=True)
        parameters = replace(parameters, noise_profile=noise_profile)
    else:
        _denoising_parameters(parameters, tensor_profile)
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
        )
        _recipe_model_preflight(
            pipeline,
            torch,
            diffusers,
            parts,
            clip_modules,
            tensor_profile,
            shared_readonly=embedding_strategy == "shared-readonly",
        )
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
            scoped_illustrious_regional_attention(
                parts[4], bindings=bindings, plan=plan, tensor_profile=tensor_profile
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
            ),
        ):
            result = run_sdxl_pipeline(
                fresh,
                conditioning,
                width=bbox.width,
                height=bbox.height,
                steps=parameters.steps,
                cfg_scale=parameters.cfg_scale,
                generator=generator,
                torch=torch,
                cfg_rescale=0.0,
                output_type="pt",
            )
            _native_output(
                result,
                torch=torch,
                width=bbox.width,
                height=bbox.height,
                tensor_profile=tensor_profile,
            )
    return result
