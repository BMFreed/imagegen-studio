"""Private ordinary Canvas denoising to provisional RGB PNG publication.

The caller exclusively owns the recipe, command, borrowed native resources and
staging paths throughout this cooperative call. Concurrent caller mutation or
filesystem parent replacement is unsupported, as with the existing publisher.
Main origin, job membership and live checkpoint identity remain caller
preconditions; checkpoint metadata is checked without opening its file.

The existing runner owns native execution and restoration; the existing publisher
owns PNG storage and its optional thumbnail cache. Its unchanged receipt does
not certify a Main candidate. In particular, the publisher has no explicit
encoded-output byte cap. No admission, transaction or cleanup owner is added.
"""

from __future__ import annotations

import importlib
from dataclasses import fields, replace
from pathlib import PosixPath
from typing import Any, Literal, cast

from PIL import Image

from .derivatives import PINNED_SRGB_ICC_SHA256
from .generation_artifacts import publish_generation_image, validate_generation_target
from .illustrious_regional_attention import Alpha8, Everywhere
from .illustrious_regional_attention_adapter import (
    TransformerBinding,
    _TensorProfile,  # pyright: ignore[reportPrivateUsage]
)
from .illustrious_regional_denoising import (
    _MAX_FINITE_ELEMENTS,  # pyright: ignore[reportPrivateUsage]
    IllustriousRegionalDenoisingError,
    _ancestral_profile,  # pyright: ignore[reportPrivateUsage]
    _denoising_parameters,  # pyright: ignore[reportPrivateUsage]
    _DenoisingProfile,  # pyright: ignore[reportPrivateUsage]
    _dpmpp_2m_profile,  # pyright: ignore[reportPrivateUsage]
    _execution_profile,  # pyright: ignore[reportPrivateUsage]
    _img2img_profile,  # pyright: ignore[reportPrivateUsage]
    _img2img_strength,  # pyright: ignore[reportPrivateUsage]
    _Layout,  # pyright: ignore[reportPrivateUsage]
    _native_output,  # pyright: ignore[reportPrivateUsage]
    _outpaint_profile,  # pyright: ignore[reportPrivateUsage]
    _vae_profile,  # pyright: ignore[reportPrivateUsage]
    run_current_canvas_regional_denoising,
)
from .illustrious_regional_recipe import (
    _INVOKE_PROFILES,  # pyright: ignore[reportPrivateUsage]
    _bbox,  # pyright: ignore[reportPrivateUsage]
    _encoding_tensor_profile,  # pyright: ignore[reportPrivateUsage]
    _Profile,  # pyright: ignore[reportPrivateUsage]
    _recipe_inputs,  # pyright: ignore[reportPrivateUsage]
)
from .illustrious_regional_vae import validate_regional_vae_output
from .inference import DenoisingProgressSink, MLRuntime
from .lama_infill import OUTPAINT_INFILL_BYTE_SIZE, OUTPAINT_INFILL_SHA256
from .outpaint_conditioning import OutpaintConditioning, create_outpaint_contribution
from .outpaint_worker_assets import prepare_worker_outpaint
from .protocol import (
    _REQUEST_ID_PATTERN,  # pyright: ignore[reportPrivateUsage]
    _SHA256_PATTERN,  # pyright: ignore[reportPrivateUsage]
    MAX_GENERATION_TARGET_BYTES,
    AlphaOutpaintConditioning,
    GenerateIllustriousImg2ImgCommand,
    GenerateIllustriousOutpaintCommand,
    GenerateIllustriousTxt2ImgCommand,
    IllustriousInferenceParameters,
    OutpaintInfillResource,
)

__all__ = (
    "IllustriousRegionalOutputError",
    "generate_current_canvas_regional_txt2img",
    "generate_current_canvas_regional_img2img",
    "generate_current_canvas_regional_outpaint",
)

_Code = Literal["INPUT_INVALID", "PROFILE_INVALID", "LIMIT", "UNSUPPORTED"]


class IllustriousRegionalOutputError(ValueError):
    """Local output refusal; errors and causes from existing owners pass through."""

    code: _Code

    def __init__(self, code: _Code, message: str) -> None:
        super().__init__(message)
        self.code = code


def _require(condition: bool, code: _Code, message: str) -> None:
    if not condition:
        raise IllustriousRegionalOutputError(code, message)


def _safe_path(value: object, label: str) -> PosixPath:
    _require(type(value) is PosixPath, "INPUT_INVALID", f"{label} requires an exact PosixPath.")
    path = cast(PosixPath, value)
    _require(
        1 <= len(str(path)) <= 4096
        and "\x00" not in str(path)
        and path.is_absolute()
        and ".." not in path.parts,
        "INPUT_INVALID",
        f"{label} requires a safe absolute path without traversal.",
    )
    return path


def _command_parameters(
    command: GenerateIllustriousTxt2ImgCommand,
    *,
    img2img: bool = False,
    outpaint: bool = False,
) -> IllustriousInferenceParameters:
    command_class = (
        GenerateIllustriousOutpaintCommand
        if outpaint
        else GenerateIllustriousImg2ImgCommand
        if img2img
        else GenerateIllustriousTxt2ImgCommand
    )
    _require(
        type(command) is command_class,
        "INPUT_INVALID",
        "Only the exact ordinary outpaint command record is supported."
        if outpaint
        else "Only the exact ordinary img2img command record is supported."
        if img2img
        else "Only the exact ordinary txt2img command record is supported.",
    )
    values = vars(command)
    _require(
        values.keys() == {field.name for field in fields(command_class)},
        "INPUT_INVALID",
        "The command must contain exactly its complete dataclass fields.",
    )
    parameters = IllustriousInferenceParameters(
        **{field.name: values[field.name] for field in fields(IllustriousInferenceParameters)}
    )
    if img2img or outpaint:
        _img2img_strength(cast(GenerateIllustriousImg2ImgCommand, command).denoising_strength)
    _require(
        type(command.request_id) is str
        and _REQUEST_ID_PATTERN.fullmatch(command.request_id) is not None,
        "INPUT_INVALID",
        "Request identity must use the existing 128-character ASCII syntax.",
    )
    for digest in (command.target_sha256, parameters.checkpoint_sha256):
        _require(
            type(digest) is str and _SHA256_PATTERN.fullmatch(digest) is not None,
            "INPUT_INVALID",
            "Target and checkpoint metadata require lowercase 64-character SHA-256 digests.",
        )
    _require(
        type(command.target_icc_sha256) is str
        and command.target_icc_sha256 == PINNED_SRGB_ICC_SHA256,
        "INPUT_INVALID",
        "The target ICC must be the exact pinned sRGB digest.",
    )
    _require(
        type(command.target_byte_size) is int and command.target_byte_size >= 1,
        "INPUT_INVALID",
        "Target byte size must be an exact positive integer, excluding bool.",
    )
    _require(
        command.target_byte_size <= MAX_GENERATION_TARGET_BYTES,
        "LIMIT",
        "Target byte size exceeds the existing 32 MiB bound.",
    )
    _require(
        type(command.width) is int and type(command.height) is int,
        "INPUT_INVALID",
        "Command dimensions must be exact integers, excluding bool.",
    )
    root = _safe_path(command.staging_root, "Staging root")
    target = _safe_path(command.target_path, "Target")
    output = _safe_path(command.output_path, "Output")
    _safe_path(parameters.checkpoint_path, "Checkpoint metadata")
    _require(
        target.parent == root
        and output.parent == root
        and target.suffix == output.suffix == ".png"
        and target != output,
        "INPUT_INVALID",
        "Target and output must be distinct direct .png staging children.",
    )
    if outpaint:
        _outpaint_command(cast(GenerateIllustriousOutpaintCommand, command))
    return parameters


def _outpaint_command(command: GenerateIllustriousOutpaintCommand) -> None:
    """Recheck manually constructed records against the existing frozen OUT policy."""
    policy, resource = command.conditioning, command.infill_resource
    _require(
        type(policy) is AlphaOutpaintConditioning
        and vars(policy).keys() == {field.name for field in fields(AlphaOutpaintConditioning)}
        and _bbox(policy.bbox) == _bbox(command.bbox)
        and policy.source_sha256 == command.target_sha256
        and policy.source_byte_size == command.target_byte_size
        and (policy.width, policy.height) == (command.width, command.height)
        and type(policy.keep_mask_byte_size) is int
        and policy.keep_mask_byte_size == command.width * command.height
        and type(policy.keep_mask_sha256) is str
        and _SHA256_PATTERN.fullmatch(policy.keep_mask_sha256) is not None
        and type(policy.edge_radius) is int
        and policy.edge_radius == 16
        and type(policy.fade_distance) is int
        and policy.fade_distance == 16
        and type(policy.minimum_denoise) in (int, float)
        and policy.minimum_denoise == 0,
        "INPUT_INVALID",
        "Outpaint requires the complete existing alpha identity and frozen coherence policy.",
    )
    _require(
        type(resource) is OutpaintInfillResource
        and vars(resource).keys() == {field.name for field in fields(OutpaintInfillResource)}
        and resource.role == "outpaint-infill"
        and type(resource.byte_size) is int
        and resource.byte_size == OUTPAINT_INFILL_BYTE_SIZE
        and resource.sha256 == OUTPAINT_INFILL_SHA256,
        "INPUT_INVALID",
        "Outpaint requires the exact pinned LaMa resource.",
    )
    path = _safe_path(resource.path, "Outpaint infill")
    model_paths = {command.checkpoint_path, *(entry.path for entry in command.loras)}
    if command.vae is not None:
        model_paths.add(command.vae.path)
    _require(
        path not in model_paths | {command.target_path, command.output_path}
        and path != command.staging_root
        and command.staging_root not in path.parents,
        "INPUT_INVALID",
        "Outpaint infill must be distinct from all model and staging inputs.",
    )


def _rgb_image(
    result: Any,
    *,
    torch: Any,
    width: int,
    height: int,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
    vae_context: tuple[Any, IllustriousInferenceParameters] | None = None,
) -> Image.Image:
    """Convert the original, already denormalized native pt image exactly once."""
    if vae_context is None:
        _native_output(
            result, torch=torch, width=width, height=height, tensor_profile=tensor_profile
        )
    else:
        pipeline, parameters = vae_context
        validate_regional_vae_output(
            result,
            pipeline=pipeline,
            parameters=parameters,
            torch=torch,
            width=width,
            height=height,
        )
    image = result.images
    # Keep each range-check temporary within the existing finite-check bound,
    # including non-contiguous native views, without flattening or cloning.
    rows = max(1, _MAX_FINITE_ELEMENTS // (3 * width))
    for start in range(0, height, rows):
        chunk = image[:, :, start : start + rows, :]
        _require(
            bool((chunk >= 0).all().item()) and bool((chunk <= 1).all().item()),
            "INPUT_INVALID",
            "Native image values must lie in [0,1] before RGB conversion.",
        )
    processor = cast(Any, importlib.import_module("diffusers.image_processor")).VaeImageProcessor
    images = processor.numpy_to_pil(processor.pt_to_numpy(image))
    _require(
        type(images) is list and len(cast(list[Any], images)) == 1,
        "INPUT_INVALID",
        "Static native conversion must produce exactly one PIL image.",
    )
    rgb = images[0]
    _require(
        type(rgb) is Image.Image and rgb.mode == "RGB" and rgb.size == (width, height),
        "INPUT_INVALID",
        "Static native conversion must retain exact RGB dimensions.",
    )
    return cast(Image.Image, rgb)


def _generate_current_canvas_regional(
    recipe: object,
    *,
    command: GenerateIllustriousTxt2ImgCommand,
    pipeline: Any,
    runtime: MLRuntime,
    profile: _Profile,
    denoising_profile: _DenoisingProfile,
    global_negative_coverage: Everywhere | Alpha8,
    global_positive_coverage: Everywhere | Alpha8,
    negative_pooled_source_id: str,
    positive_pooled_source_id: str,
    bindings: tuple[TransformerBinding, ...],
    layout: _Layout,
    on_progress: DenoisingProgressSink | None = None,
    img2img: bool = False,
    outpaint: bool = False,
    _prepared_outpaint: tuple[OutpaintConditioning, Image.Image] | None = None,
) -> dict[str, object]:
    """Validate one frozen target, run once, and return the original publisher receipt.

    Semantic keywords are required; the optional trusted scalar sink reports only
    completed native denoising steps. Metadata agreement precedes filesystem/native
    work; snapshot verification precedes encoding. V1 retains one/two steps and
    no caller noise policy; V2 requires bounded steps and an exact detached
    four-field policy. Separate Euler-ancestral profiles use the same explicit
    policy bounds and the runner's independent Invoke step generator.
    Separately selected invoke-init profiles also use Invoke's CPU FP32 draw,
    CPU compute-dtype cast and original scheduler.add_noise initialization.
    DPM++ 2M profiles require Invoke composition and select the existing
    deterministic Normal/Karras native scheduler with int64 timesteps. Their
    txt2img profiles require that initializer; image profiles retain the source
    posterior and selected strength window.
    Existing profiles retain their native initial preparation. Exact-TI
    copy and existing native preflights remain unchanged.
    Invoke Canvas profiles consume bounded CFG Rescale through the original
    native pipeline; historical private profiles retain the zero-only contract.
    Native, conversion and publication errors retain their identity and cause.
    """
    _require(
        on_progress is None or callable(on_progress),
        "INPUT_INVALID",
        "Regional progress requires a callable sink.",
    )
    parameters = (
        _command_parameters(command, outpaint=True)
        if outpaint
        else _command_parameters(command, img2img=True)
        if img2img
        else _command_parameters(command)
    )
    # Preserve output's encoding-first refusal order and local execution-profile
    # error identity while sharing the runner's complete lane/version validator.
    _encoding_tensor_profile(profile)
    try:
        tensor_profile, resolved_noise = _execution_profile(denoising_profile, profile)
    except IllustriousRegionalDenoisingError as error:
        raise IllustriousRegionalOutputError("PROFILE_INVALID", str(error)) from error
    _require(
        _img2img_profile(denoising_profile) is img2img
        and _outpaint_profile(denoising_profile) is outpaint,
        "PROFILE_INVALID",
        "The output mode must match its explicit txt2img or img2img execution profile.",
    )
    prepared_vae = _vae_profile(denoising_profile)
    invoke_cfg_rescale = profile in _INVOKE_PROFILES
    if _dpmpp_2m_profile(denoising_profile):
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
            if _ancestral_profile(denoising_profile)
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
    bbox, _, parameters, _, _, _ = _recipe_inputs(
        recipe,
        parameters,
        profile,
        layout,
        global_negative_coverage,
        global_positive_coverage,
        negative_pooled_source_id,
        positive_pooled_source_id,
    )
    _require(
        _bbox(command.bbox) == bbox
        and (command.width, command.height) == (bbox.width, bbox.height),
        "INPUT_INVALID",
        "Command bbox position and dimensions must exactly match the complete recipe.",
    )
    alpha_conditioning = None
    if outpaint:
        # The worker supplies this private captured pair before loading models;
        # direct frontend callers prepare through the same authoritative owner.
        alpha_conditioning, source = (
            _prepared_outpaint
            if _prepared_outpaint is not None
            else prepare_worker_outpaint(cast(GenerateIllustriousOutpaintCommand, command))
        )
    else:
        _require(_prepared_outpaint is None, "INPUT_INVALID", "Unexpected outpaint preparation.")
        source = validate_generation_target(
            staging_root=command.staging_root,
            target_path=command.target_path,
            output_path=command.output_path,
            target_sha256=command.target_sha256,
            target_byte_size=command.target_byte_size,
            width=command.width,
            height=command.height,
            img2img=img2img,
        )
    result = run_current_canvas_regional_denoising(
        recipe,
        pipeline=pipeline,
        runtime=runtime,
        parameters=parameters,
        profile=profile,
        denoising_profile=denoising_profile,
        global_negative_coverage=global_negative_coverage,
        global_positive_coverage=global_positive_coverage,
        negative_pooled_source_id=negative_pooled_source_id,
        positive_pooled_source_id=positive_pooled_source_id,
        bindings=bindings,
        layout=layout,
        **({"on_progress": on_progress} if on_progress is not None else {}),
        **(
            {"keep_mask": alpha_conditioning.latent_keep_mask}
            if alpha_conditioning is not None
            else {}
        ),
        **cast(
            Any,
            {
                "image": source,
                "denoising_strength": cast(
                    GenerateIllustriousImg2ImgCommand, command
                ).denoising_strength,
            }
            if img2img
            else {},
        ),
    )
    image = _rgb_image(
        result,
        torch=runtime.torch,
        width=command.width,
        height=command.height,
        tensor_profile=tensor_profile,
        **({"vae_context": (pipeline, parameters)} if prepared_vae else {}),
    )
    if alpha_conditioning is not None:
        image = create_outpaint_contribution(image, alpha_conditioning)
    return publish_generation_image(
        image,
        staging_root=command.staging_root,
        output_path=command.output_path,
        width=command.width,
        height=command.height,
        request_id=command.request_id,
        seed=parameters.seed,
        output_mode="RGBA" if alpha_conditioning is not None else "RGB",
    )


def generate_current_canvas_regional_txt2img(
    recipe: object,
    *,
    command: GenerateIllustriousTxt2ImgCommand,
    pipeline: Any,
    runtime: MLRuntime,
    profile: _Profile,
    denoising_profile: _DenoisingProfile,
    global_negative_coverage: Everywhere | Alpha8,
    global_positive_coverage: Everywhere | Alpha8,
    negative_pooled_source_id: str,
    positive_pooled_source_id: str,
    bindings: tuple[TransformerBinding, ...],
    layout: _Layout,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Verify a transparent target, run once, and return the original PNG receipt."""
    return _generate_current_canvas_regional(
        recipe,
        command=command,
        pipeline=pipeline,
        runtime=runtime,
        profile=profile,
        denoising_profile=denoising_profile,
        global_negative_coverage=global_negative_coverage,
        global_positive_coverage=global_positive_coverage,
        negative_pooled_source_id=negative_pooled_source_id,
        positive_pooled_source_id=positive_pooled_source_id,
        bindings=bindings,
        layout=layout,
        on_progress=on_progress,
    )


def generate_current_canvas_regional_img2img(
    recipe: object,
    *,
    command: GenerateIllustriousImg2ImgCommand,
    pipeline: Any,
    runtime: MLRuntime,
    profile: _Profile,
    denoising_profile: _DenoisingProfile,
    global_negative_coverage: Everywhere | Alpha8,
    global_positive_coverage: Everywhere | Alpha8,
    negative_pooled_source_id: str,
    positive_pooled_source_id: str,
    bindings: tuple[TransformerBinding, ...],
    layout: _Layout,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Consume one verified opaque RGB snapshot through the ordinary native image path.

    Only the exact img2img command and explicit Euler, Euler a or DPM++ 2M image
    profiles are admitted.
    The unchanged ordinary factory owns training-timestep cutoff and independent
    replayable posterior sampling; its existing compute-dtype noise policy is
    retained. Additive private prepared-VAE profiles adapt Invoke encode/sample/
    scale with the validated VAE dtype and reuse the existing prepared decoder.
    Strength zero encodes/decodes without a denoising step. Prepared VAE identity
    remains the caller's loading responsibility; public worker admission is
    unchanged. Partial alpha remains outside this frontend. All output/
    restoration and publication owners retain their existing scopes.
    """
    return _generate_current_canvas_regional(
        recipe,
        command=command,
        pipeline=pipeline,
        runtime=runtime,
        profile=profile,
        denoising_profile=denoising_profile,
        global_negative_coverage=global_negative_coverage,
        global_positive_coverage=global_positive_coverage,
        negative_pooled_source_id=negative_pooled_source_id,
        positive_pooled_source_id=positive_pooled_source_id,
        bindings=bindings,
        layout=layout,
        on_progress=on_progress,
        img2img=True,
    )


def generate_current_canvas_regional_outpaint(
    recipe: object,
    *,
    command: GenerateIllustriousOutpaintCommand,
    pipeline: Any,
    runtime: MLRuntime,
    profile: _Profile,
    denoising_profile: _DenoisingProfile,
    global_negative_coverage: Everywhere | Alpha8,
    global_positive_coverage: Everywhere | Alpha8,
    negative_pooled_source_id: str,
    positive_pooled_source_id: str,
    bindings: tuple[TransformerBinding, ...],
    layout: _Layout,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Verify mixed alpha and exact LaMa, run once, publish the owned RGBA contribution.

    InvokeAI a61ac4fb compileCanvasGraph.graftOutpaint/create_gradient_mask and
    InpaintExt supply the mechanism. Existing Studio snapshot, infill, coherence,
    native masked-denoise and contribution owners retain their contracts.
    """
    return _generate_current_canvas_regional(
        recipe,
        command=command,
        pipeline=pipeline,
        runtime=runtime,
        profile=profile,
        denoising_profile=denoising_profile,
        global_negative_coverage=global_negative_coverage,
        global_positive_coverage=global_positive_coverage,
        negative_pooled_source_id=negative_pooled_source_id,
        positive_pooled_source_id=positive_pooled_source_id,
        bindings=bindings,
        layout=layout,
        on_progress=on_progress,
        img2img=True,
        outpaint=True,
    )
