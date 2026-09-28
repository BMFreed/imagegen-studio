"""Fail-closed first SDXL/Illustrious txt2img execution boundary.

Business input is validated here; heavyweight ML imports occur only after the separate
inference entrypoint qualifies its offline config and CUDA runtime.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import io
import os
import re
import stat
import warnings
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, cast

from PIL import Image, UnidentifiedImageError

from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    canonical_absolute_path,
    read_snapshot,
    write_temporary_image,
)
from imagegen_worker.imports import png_embedded_color_metadata
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand

INFERENCE_WORKER_VERSION = "0.2.0"
INFERENCE_RUNTIME_PROFILE = "linux-nvidia"
INFERENCE_CAPABILITY = "illustrious-txt2img"

# This is the tested dev runtime, not a new dependency of the derivatives-only package.
PINNED_ML_VERSIONS: dict[str, str] = {
    "torch": "2.7.1",
    "diffusers": "0.40.0",
    "transformers": "5.5.4",
    "accelerate": "1.14.0",
    "safetensors": "0.8.0",
    "torchsde": "0.2.6",
    "pillow": "12.2.0",
}

# Conservative because raw Diffusers prompt= does not implement Invoke's weighted/long prompts.
_UNSUPPORTED_PROMPT_MARKUP = re.compile(r"[()\[\]{}<>]|\+\+|--")
_MAX_CLIP_TOKENS = 77


@dataclass(frozen=True)
class MLRuntime:
    torch: ModuleType
    diffusers: ModuleType


def require_dependency_versions(installed: Mapping[str, str]) -> None:
    for package, expected in PINNED_ML_VERSIONS.items():
        actual = installed.get(package)
        if actual is None or actual.split("+", maxsplit=1)[0] != expected:
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE", "The pinned inference dependencies are unavailable."
            )


def qualify_ml_runtime() -> MLRuntime:
    """Do not claim the inference capability on CPU or a partial/broken ML installation."""
    versions: dict[str, str] = {}
    try:
        for package in PINNED_ML_VERSIONS:
            versions[package] = importlib.metadata.version(package)
        require_dependency_versions(versions)
        torch = importlib.import_module("torch")
        diffusers = importlib.import_module("diffusers")
        importlib.import_module("transformers")
        importlib.import_module("accelerate")
        importlib.import_module("safetensors")
        importlib.import_module("torchsde")
        for name in (
            "StableDiffusionXLPipeline",
            "DPMSolverMultistepScheduler",
            "DPMSolverSDEScheduler",
            "EulerAncestralDiscreteScheduler",
        ):
            getattr(diffusers, name)
        if (
            cast(Any, torch).version.cuda is None
            or cast(Any, torch).version.hip is not None
            or not cast(Any, torch).cuda.is_available()
        ):
            raise DerivativeError("INFERENCE_UNAVAILABLE", "A CUDA GPU is unavailable.")
        probe = cast(Any, torch).empty((1,), device="cuda")
        cast(Any, torch).cuda.synchronize()
        del probe
    except DerivativeError:
        raise
    except Exception as error:
        raise DerivativeError(
            "INFERENCE_UNAVAILABLE", "The pinned CUDA inference runtime is unavailable."
        ) from error
    return MLRuntime(torch=torch, diffusers=diffusers)


def _checkpoint_digest(path: Path) -> str:
    canonical_absolute_path(path, label="Checkpoint")
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Checkpoint is unavailable.") from error
    with os.fdopen(descriptor, "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise DerivativeError("GENERATION_INPUT_CHANGED", "Checkpoint is not a regular file.")
        digest = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def validate_generation_assets(command: GenerateIllustriousTxt2ImgCommand) -> None:
    """Verify the exact model, transparent target, and main-nominated output before GPU work."""
    root = canonical_absolute_path(command.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Generation staging root is unavailable.")
    root_stat = root.stat()
    if root_stat.st_uid != os.getuid() or root_stat.st_mode & 0o022:
        raise DerivativeError("INVALID_PATH", "Generation staging root is unsafe.")
    target = canonical_absolute_path(command.target_path, label="Target")
    output = canonical_absolute_path(command.output_path, label="Output")
    if target.parent != root or output.parent != root or output == target:
        raise DerivativeError("INVALID_PATH", "Generation files must be distinct staging children.")
    if os.path.lexists(output):
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Generation output already exists.")
    if _checkpoint_digest(command.checkpoint_path) != command.checkpoint_sha256:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Checkpoint changed after enqueue.")
    try:
        target_size = target.stat().st_size
    except OSError as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target is unavailable.") from error
    if target_size != command.target_byte_size:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target changed after enqueue.")
    snapshot = read_snapshot(target, command.target_sha256)
    profile, non_srgb_chunks = png_embedded_color_metadata(snapshot)
    if non_srgb_chunks or profile != SRGB_ICC_PROFILE:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target is not pinned sRGB PNG.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(snapshot)) as decoded:
                if (
                    decoded.format != "PNG"
                    or getattr(decoded, "n_frames", 1) != 1
                    or decoded.size != (command.width, command.height)
                    or decoded.mode != "RGBA"
                    or decoded.info.get("icc_profile") != SRGB_ICC_PROFILE
                ):
                    raise DerivativeError(
                        "GENERATION_INPUT_CHANGED", "Target PNG metadata changed after enqueue."
                    )
                decoded.load()
                if decoded.getchannel("A").getextrema() != (0, 0):
                    raise DerivativeError(
                        "GENERATION_TARGET_UNSUPPORTED", "Txt2img target must be transparent."
                    )
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
    ) as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target PNG is invalid.") from error


def validate_plain_prompt(prompt: str, tokenizer: Any) -> None:
    if _UNSUPPORTED_PROMPT_MARKUP.search(prompt):
        raise DerivativeError(
            "GENERATION_PROMPT_UNSUPPORTED", "Weighted prompt markup is not supported yet."
        )
    token_ids: list[int] = cast(
        list[int], tokenizer.encode(prompt, add_special_tokens=True, truncation=False)
    )
    if tokenizer.model_max_length != _MAX_CLIP_TOKENS or len(token_ids) > _MAX_CLIP_TOKENS:
        raise DerivativeError(
            "GENERATION_PROMPT_UNSUPPORTED", "This prompt exceeds the first CLIP token limit."
        )


def select_inference_scheduler(
    command: GenerateIllustriousTxt2ImgCommand, pipeline: Any, runtime: MLRuntime
) -> Any:
    if command.prediction_type == "sample":
        raise DerivativeError(
            "GENERATION_PREDICTION_UNSUPPORTED", "Sample prediction is not qualified yet."
        )
    diffusers = cast(Any, runtime.diffusers)
    config = pipeline.scheduler.config
    if command.scheduler == "euler_a":
        return diffusers.EulerAncestralDiscreteScheduler.from_config(
            config, prediction_type=command.prediction_type
        )
    if command.scheduler in ("dpmpp_2m", "dpmpp_2m_k"):
        return diffusers.DPMSolverMultistepScheduler.from_config(
            config,
            algorithm_type="dpmsolver++",
            solver_order=2,
            use_karras_sigmas=command.scheduler.endswith("_k"),
            prediction_type=command.prediction_type,
        )
    if command.scheduler in ("dpmpp_sde", "dpmpp_sde_k"):
        return diffusers.DPMSolverSDEScheduler.from_config(
            config,
            use_karras_sigmas=command.scheduler.endswith("_k"),
            noise_sampler_seed=0,
            prediction_type=command.prediction_type,
        )
    raise DerivativeError("GENERATION_SAMPLING_UNSUPPORTED", "Scheduler is unsupported.")


def validate_pipeline_prompts(command: GenerateIllustriousTxt2ImgCommand, pipeline: Any) -> None:
    for tokenizer in (pipeline.tokenizer, pipeline.tokenizer_2):
        for prompt in (command.positive_prompt, command.negative_prompt):
            validate_plain_prompt(prompt, tokenizer)


def generate_illustrious_txt2img(
    command: GenerateIllustriousTxt2ImgCommand, *, config_dir: Path, runtime: MLRuntime
) -> dict[str, object]:
    """Execute one exact, plain-prompt SDXL job and publish only its provisional PNG."""
    if command.prediction_type == "sample":
        raise DerivativeError(
            "GENERATION_PREDICTION_UNSUPPORTED", "Sample prediction is not qualified yet."
        )
    for prompt in (command.positive_prompt, command.negative_prompt):
        if _UNSUPPORTED_PROMPT_MARKUP.search(prompt):
            raise DerivativeError(
                "GENERATION_PROMPT_UNSUPPORTED", "Weighted prompt markup is not supported yet."
            )
    verify_pinned_config(str(config_dir))
    validate_generation_assets(command)
    torch = cast(Any, runtime.torch)
    diffusers = cast(Any, runtime.diffusers)
    pipeline = diffusers.StableDiffusionXLPipeline.from_single_file(
        str(command.checkpoint_path),
        config=str(config_dir),
        local_files_only=True,
        torch_dtype=torch.float16,
    )
    verify_pinned_config(str(config_dir))
    # The single-file loader reads the file after our preflight hash. Detect mutation during load.
    if _checkpoint_digest(command.checkpoint_path) != command.checkpoint_sha256:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Checkpoint changed during loading.")
    validate_pipeline_prompts(command, pipeline)
    pipeline.scheduler = select_inference_scheduler(command, pipeline, runtime)
    pipeline.set_progress_bar_config(disable=True)
    pipeline = pipeline.to("cuda")
    generator = torch.Generator(device="cpu").manual_seed(command.seed)
    result = pipeline(
        prompt=command.positive_prompt,
        negative_prompt=command.negative_prompt,
        width=command.width,
        height=command.height,
        num_inference_steps=command.steps,
        guidance_scale=command.cfg_scale,
        generator=generator,
    )
    image = result.images[0]
    if not isinstance(image, Image.Image) or image.size != (command.width, command.height):
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Inference did not return the expected image."
        )
    temporary = write_temporary_image(image.convert("RGB"), command.output_path, "PNG")
    published = False
    try:
        os.link(temporary, command.output_path, follow_symlinks=False)
        published = True
        directory_fd = os.open(command.staging_root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Generation output already exists.") from error
    except OSError as error:
        if published:
            command.output_path.unlink(missing_ok=True)
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Generation output could not be stored."
        ) from error
    finally:
        temporary.unlink(missing_ok=True)
    return {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": command.request_id,
        "outputPath": str(command.output_path),
        "seed": command.seed,
    }
