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
    _denoising_parameters,  # pyright: ignore[reportPrivateUsage]
    _DenoisingProfile,  # pyright: ignore[reportPrivateUsage]
    _execution_profile,  # pyright: ignore[reportPrivateUsage]
    _Layout,  # pyright: ignore[reportPrivateUsage]
    _native_output,  # pyright: ignore[reportPrivateUsage]
    run_current_canvas_regional_denoising,
)
from .illustrious_regional_recipe import (
    _bbox,  # pyright: ignore[reportPrivateUsage]
    _encoding_tensor_profile,  # pyright: ignore[reportPrivateUsage]
    _Profile,  # pyright: ignore[reportPrivateUsage]
    _recipe_inputs,  # pyright: ignore[reportPrivateUsage]
)
from .inference import DenoisingProgressSink, MLRuntime
from .protocol import (
    _REQUEST_ID_PATTERN,  # pyright: ignore[reportPrivateUsage]
    _SHA256_PATTERN,  # pyright: ignore[reportPrivateUsage]
    MAX_GENERATION_TARGET_BYTES,
    GenerateIllustriousTxt2ImgCommand,
    IllustriousInferenceParameters,
)

__all__ = ("IllustriousRegionalOutputError", "generate_current_canvas_regional_txt2img")

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
) -> IllustriousInferenceParameters:
    _require(
        type(command) is GenerateIllustriousTxt2ImgCommand,
        "INPUT_INVALID",
        "Only the exact ordinary txt2img command record is supported.",
    )
    values = vars(command)
    _require(
        values.keys() == {field.name for field in fields(GenerateIllustriousTxt2ImgCommand)},
        "INPUT_INVALID",
        "The command must contain exactly its complete dataclass fields.",
    )
    parameters = IllustriousInferenceParameters(
        **{field.name: values[field.name] for field in fields(IllustriousInferenceParameters)}
    )
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
    return parameters


def _rgb_image(
    result: Any,
    *,
    torch: Any,
    width: int,
    height: int,
    tensor_profile: _TensorProfile = "cpu-float32-v1",
) -> Image.Image:
    """Convert the original, already denormalized native pt image exactly once."""
    _native_output(result, torch=torch, width=width, height=height, tensor_profile=tensor_profile)
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
    """Validate one frozen target, run once, and return the original publisher receipt.

    Semantic keywords are required; the optional trusted scalar sink reports only
    completed native denoising steps. Metadata agreement precedes filesystem/native
    work; snapshot verification precedes encoding. V1 retains one/two steps and
    no caller noise policy; V2 requires bounded steps and an exact detached
    four-field policy. Exact-TI copy and existing native preflights remain unchanged.
    Native, conversion and publication errors retain their identity and cause.
    """
    _require(
        on_progress is None or callable(on_progress),
        "INPUT_INVALID",
        "Regional progress requires a callable sink.",
    )
    parameters = _command_parameters(command)
    # Preserve output's encoding-first refusal order and local execution-profile
    # error identity while sharing the runner's complete lane/version validator.
    _encoding_tensor_profile(profile)
    try:
        tensor_profile, resolved_noise = _execution_profile(denoising_profile, profile)
    except IllustriousRegionalDenoisingError as error:
        raise IllustriousRegionalOutputError("PROFILE_INVALID", str(error)) from error
    if resolved_noise:
        noise_profile = _denoising_parameters(parameters, tensor_profile, resolved_noise=True)
        parameters = replace(parameters, noise_profile=noise_profile)
    else:
        _denoising_parameters(parameters, tensor_profile)
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
    validate_generation_target(
        staging_root=command.staging_root,
        target_path=command.target_path,
        output_path=command.output_path,
        target_sha256=command.target_sha256,
        target_byte_size=command.target_byte_size,
        width=command.width,
        height=command.height,
        img2img=False,
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
    )
    image = _rgb_image(
        result,
        torch=runtime.torch,
        width=command.width,
        height=command.height,
        tensor_profile=tensor_profile,
    )
    return publish_generation_image(
        image,
        staging_root=command.staging_root,
        output_path=command.output_path,
        width=command.width,
        height=command.height,
        request_id=command.request_id,
        seed=parameters.seed,
        output_mode="RGB",
    )
