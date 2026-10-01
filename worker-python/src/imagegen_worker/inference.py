"""Fail-closed first SDXL/Illustrious txt2img execution boundary.

Business input is validated here; heavyweight ML imports occur only after the separate
inference entrypoint qualifies its offline config and CUDA runtime.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import io
import math
import os
import re
import stat
import warnings
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, cast

from PIL import Image, UnidentifiedImageError

from imagegen_worker.candidate_thumbnail import create_candidate_thumbnail
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    canonical_absolute_path,
    read_snapshot,
    write_temporary_image,
)
from imagegen_worker.imports import png_embedded_color_metadata
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.protocol import MAX_GENERATION_STEPS, GenerateIllustriousTxt2ImgCommand

INFERENCE_WORKER_VERSION = "0.4.0"
INFERENCE_RUNTIME_PROFILE = "linux-nvidia"
INFERENCE_CAPABILITY = "illustrious-txt2img"
INFERENCE_PROGRESS_CAPABILITY = "denoising-progress"
INFERENCE_THUMBNAIL_CAPABILITY = "candidate-thumbnails"

DenoisingProgressSink = Callable[[int, int], None]

# This is the tested dev runtime, not a new dependency of the derivatives-only package.
PINNED_ML_VERSIONS: dict[str, str] = {
    "torch": "2.7.1",
    "diffusers": "0.40.0",
    "transformers": "5.5.4",
    "accelerate": "1.14.0",
    "safetensors": "0.8.0",
    "torchsde": "0.2.6",
    "compel": "2.4.0",
    "pillow": "12.2.0",
}

# Embeddings, dynamic prompts, and complex cross-attention/conjunction inputs have no DTO yet.
_UNSUPPORTED_PROMPT_MARKUP = re.compile(
    r"[\[\]{}<>]|(?:\.(?:swap|and|add|blend)|(?:with|use)Lora)\s*\(", re.IGNORECASE
)
_CLIP_CHUNK_TOKENS = 77
_MAX_CONDITIONING_TOKENS = 4 * _CLIP_CHUNK_TOKENS
_SDXL_MICRO_CONDITIONING_SIZE = (1024, 1024)
_COLON_WEIGHT = re.compile(r"\+?(?:\d+(?:\.\d*)?|\.\d+)\Z")
_PLAIN_SUFFIX_WEIGHT = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)\Z")


@dataclass
class _PromptGroup:
    start: int
    colons: list[int]
    nested: bool
    escaped: bool
    quoted: bool
    has_parent: bool


@dataclass(frozen=True)
class MLRuntime:
    torch: ModuleType
    diffusers: ModuleType
    compel: ModuleType


@dataclass(frozen=True)
class SdxlConditioning:
    positive: Any
    negative: Any
    positive_pooled: Any
    negative_pooled: Any
    positive_length: int
    negative_length: int


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
        compel = importlib.import_module("compel")
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
        for name in ("Compel", "ReturnedEmbeddingsType", "SplitLongTextMode"):
            getattr(compel, name)
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
    return MLRuntime(torch=torch, diffusers=diffusers, compel=compel)


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


def validate_compel_prompt(prompt: str, tokenizer: Any) -> None:
    if _UNSUPPORTED_PROMPT_MARKUP.search(prompt):
        raise DerivativeError(
            "GENERATION_PROMPT_UNSUPPORTED", "This prompt uses an unsupported resource or syntax."
        )
    token_ids: list[int] = cast(
        list[int], tokenizer.encode(prompt, add_special_tokens=True, truncation=False)
    )
    if (
        tokenizer.model_max_length != _CLIP_CHUNK_TOKENS
        or len(token_ids) > _MAX_CONDITIONING_TOKENS
    ):
        raise DerivativeError(
            "GENERATION_PROMPT_UNSUPPORTED", "This prompt exceeds the conditioning safety limit."
        )


def normalize_compel_prompt(prompt: str) -> str:
    """Translate only unambiguous common attention weights to Compel syntax.

    Compel reads ``(tag:1.2)`` as literal text, while the editor identifies it
    as an attention weight. Ambiguous groups fail closed rather than generating
    an image from conditioning the author did not request.
    """
    if _UNSUPPORTED_PROMPT_MARKUP.search(prompt):
        raise DerivativeError(
            "GENERATION_PROMPT_UNSUPPORTED", "This prompt uses an unsupported resource or syntax."
        )
    groups: list[_PromptGroup] = []
    edits: list[tuple[int, int, str]] = []
    quoted = False
    index = 0
    while index < len(prompt):
        char = prompt[index]
        if char == "\\":
            if groups:
                groups[-1].escaped = True
            index += 2
            continue
        if char == '"':
            quoted = not quoted
            if groups:
                groups[-1].quoted = True
        elif char == "(":
            if groups:
                groups[-1].nested = True
            groups.append(_PromptGroup(index, [], False, False, quoted, bool(groups)))
        elif char == ":" and groups:
            groups[-1].colons.append(index)
        elif char == ")" and groups:
            group = groups.pop()
            if group.colons:
                if (
                    len(group.colons) != 1
                    or group.nested
                    or group.escaped
                    or group.quoted
                    or group.has_parent
                ):
                    raise DerivativeError(
                        "GENERATION_PROMPT_UNSUPPORTED", "Ambiguous attention weight syntax."
                    )
                colon = group.colons[0]
                phrase = prompt[group.start + 1 : colon]
                weight = prompt[colon + 1 : index]
                if (
                    not phrase
                    or phrase != phrase.strip()
                    or not any(letter.isalpha() for letter in phrase)
                    or not _COLON_WEIGHT.fullmatch(weight)
                    or not math.isfinite(float(weight))
                ):
                    raise DerivativeError(
                        "GENERATION_PROMPT_UNSUPPORTED", "Ambiguous attention weight syntax."
                    )
                # A second operator on the same group is not equivalent to a
                # simple Forge-style weight, even if Compel happens to parse it.
                if index + 1 < len(prompt) and prompt[index + 1] not in " \t\r\n,":
                    raise DerivativeError(
                        "GENERATION_PROMPT_UNSUPPORTED", "Ambiguous attention weight syntax."
                    )
                edits.append((group.start, index + 1, f"({phrase}){weight.lstrip('+')}"))

            # Compel's + and - markers are not signed numeric suffixes. The
            # editor accepts +1.2/-0.5/1e2 as numbers; do not reinterpret them.
            suffix = re.match(r"[^\s,()[\]{}\\]*", prompt[index + 1 :])
            value = suffix.group() if suffix else ""
            if value and (
                value[0].isdigit()
                or (
                    value[0] in "+-." and len(value) > 1 and (value[1].isdigit() or value[1] == ".")
                )
            ):
                if value.startswith("+") and _PLAIN_SUFFIX_WEIGHT.fullmatch(value[1:]):
                    edits.append((index + 1, index + 1 + len(value), value[1:]))
                elif not _PLAIN_SUFFIX_WEIGHT.fullmatch(value):
                    raise DerivativeError(
                        "GENERATION_PROMPT_UNSUPPORTED", "Unsupported attention weight syntax."
                    )
        index += 1
    if any(group.colons for group in groups):
        raise DerivativeError("GENERATION_PROMPT_UNSUPPORTED", "Unclosed attention weight syntax.")
    for start, end, replacement in reversed(edits):
        prompt = prompt[:start] + replacement + prompt[end:]
    return prompt


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
            noise_sampler_seed=command.seed,
            prediction_type=command.prediction_type,
        )
    raise DerivativeError("GENERATION_SAMPLING_UNSUPPORTED", "Scheduler is unsupported.")


def validate_pipeline_prompts(
    command: GenerateIllustriousTxt2ImgCommand, pipeline: Any
) -> tuple[str, str]:
    prompts = (
        normalize_compel_prompt(command.positive_prompt),
        normalize_compel_prompt(command.negative_prompt),
    )
    for tokenizer in (pipeline.tokenizer, pipeline.tokenizer_2):
        for prompt in prompts:
            validate_compel_prompt(prompt, tokenizer)
    return prompts


def _zero_pad_to_length(embeds: Any, length: int, torch: Any) -> Any:
    missing = length - embeds.shape[1]
    if missing < 0:
        raise DerivativeError("GENERATION_PROMPT_UNSUPPORTED", "Conditioning lengths are invalid.")
    if missing == 0:
        return embeds
    padding = torch.zeros(
        (embeds.shape[0], missing, embeds.shape[2]), dtype=embeds.dtype, device=embeds.device
    )
    return torch.cat((embeds, padding), dim=1)


def _clip_embeddings(
    prompt: str, *, builder: Any, encoder: Any, pooled: bool, torch: Any
) -> tuple[Any, Any | None]:
    if prompt == "":
        embeds = torch.zeros(
            (1, encoder.config.max_position_embeddings, encoder.config.hidden_size),
            dtype=encoder.dtype,
            device=encoder.device,
        )
        pooled_embeds = (
            torch.zeros((1, encoder.config.hidden_size), dtype=encoder.dtype, device=encoder.device)
            if pooled
            else None
        )
    else:
        result = builder(prompt)
        if pooled:
            embeds, pooled_embeds = result
        else:
            embeds, pooled_embeds = result, None
    if (
        embeds.ndim != 3
        or embeds.shape[0] != 1
        or embeds.shape[1] > _MAX_CONDITIONING_TOKENS
        or embeds.shape[1] % _CLIP_CHUNK_TOKENS != 0
        or embeds.shape[2] != encoder.config.hidden_size
        or (
            pooled
            and (pooled_embeds is None or pooled_embeds.shape != (1, encoder.config.hidden_size))
        )
    ):
        raise DerivativeError("GENERATION_PROMPT_UNSUPPORTED", "Invalid SDXL conditioning shape.")
    return embeds, pooled_embeds


def build_sdxl_conditioning(
    command: GenerateIllustriousTxt2ImgCommand, pipeline: Any, runtime: MLRuntime
) -> SdxlConditioning:
    """Build bounded, independent CLIP1/CLIP2 conditioning for both prompt signs."""
    prompts = validate_pipeline_prompts(command, pipeline)
    compel = cast(Any, runtime.compel)
    torch = cast(Any, runtime.torch)
    clip_builders = (
        compel.Compel(
            tokenizer=pipeline.tokenizer,
            text_encoder=pipeline.text_encoder,
            returned_embeddings_type=(
                compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED
            ),
            truncate_long_prompts=False,
            split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
            requires_pooled=False,
        ),
        compel.Compel(
            tokenizer=pipeline.tokenizer_2,
            text_encoder=pipeline.text_encoder_2,
            returned_embeddings_type=(
                compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED
            ),
            truncate_long_prompts=False,
            split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
            requires_pooled=True,
        ),
    )

    signed: list[tuple[Any, Any]] = []
    for prompt in prompts:
        clip1, _ = _clip_embeddings(
            prompt,
            builder=clip_builders[0],
            encoder=pipeline.text_encoder,
            pooled=False,
            torch=torch,
        )
        clip2, pooled = _clip_embeddings(
            prompt,
            builder=clip_builders[1],
            encoder=pipeline.text_encoder_2,
            pooled=True,
            torch=torch,
        )
        sequence_length = max(clip1.shape[1], clip2.shape[1])
        combined = torch.cat(
            (
                _zero_pad_to_length(clip1, sequence_length, torch),
                _zero_pad_to_length(clip2, sequence_length, torch),
            ),
            dim=-1,
        )
        signed.append((combined, pooled))

    positive, positive_pooled = signed[0]
    negative, negative_pooled = signed[1]
    positive_length = positive.shape[1]
    negative_length = negative.shape[1]
    sequence_length = max(positive.shape[1], negative.shape[1])
    return SdxlConditioning(
        positive=_zero_pad_to_length(positive, sequence_length, torch),
        negative=_zero_pad_to_length(negative, sequence_length, torch),
        positive_pooled=positive_pooled,
        negative_pooled=negative_pooled,
        positive_length=positive_length,
        negative_length=negative_length,
    )


def run_sdxl_pipeline(
    pipeline: Any,
    conditioning: SdxlConditioning,
    *,
    width: int,
    height: int,
    steps: int,
    cfg_scale: float,
    generator: Any,
    torch: Any,
    on_progress: DenoisingProgressSink | None = None,
) -> Any:
    """Mask only the final positive/negative padding through a scoped UNet hook.

    The pinned Diffusers SDXL pipeline accepts prompt embeddings but does not
    forward an encoder attention mask to its UNet. PyTorch's public pre-hook
    lets this one pipeline call supply that supported UNet argument without
    replacing an attention processor or copying the denoising loop.
    """
    positive = conditioning.positive
    negative = conditioning.negative
    if (
        positive.ndim != 3
        or negative.shape != positive.shape
        or positive.dtype != negative.dtype
        or positive.device != negative.device
        or not 0 < conditioning.positive_length <= positive.shape[1]
        or not 0 < conditioning.negative_length <= positive.shape[1]
    ):
        raise DerivativeError("GENERATION_WORKER_FAILED", "Invalid SDXL conditioning mask input.")

    completed_step = 0
    total_steps: int | None = None

    def report_step(
        callback_pipeline: Any,
        step_index: int,
        _timestep: Any,
        callback_kwargs: dict[str, Any],
    ) -> dict[str, Any]:
        nonlocal completed_step, total_steps
        # The pinned DPMSolverSDE schedule includes second-order evaluations: its loop has
        # 2 * requested Steps - 1 timesteps. Read the actual schedule after initialization.
        try:
            actual_total = len(callback_pipeline.scheduler.timesteps)
        except (AttributeError, TypeError, OverflowError) as error:
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "Invalid denoising progress schedule."
            ) from error
        if (
            callback_pipeline is not pipeline
            or type(step_index) is not int
            or not 1 <= actual_total <= 2 * MAX_GENERATION_STEPS
            or actual_total > 2 * steps
            or (total_steps is not None and actual_total != total_steps)
            or step_index != completed_step
            or step_index >= actual_total
        ):
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "Invalid denoising progress sequence."
            )
        total_steps = actual_total
        completed_step = step_index + 1
        if on_progress is not None:
            on_progress(completed_step, actual_total)
        # Request no tensors and preserve the callback payload; progress cannot alter inference.
        return callback_kwargs

    def call_pipeline() -> Any:
        result = pipeline(
            prompt_embeds=positive,
            negative_prompt_embeds=negative,
            pooled_prompt_embeds=conditioning.positive_pooled,
            negative_pooled_prompt_embeds=conditioning.negative_pooled,
            width=width,
            height=height,
            original_size=_SDXL_MICRO_CONDITIONING_SIZE,
            target_size=_SDXL_MICRO_CONDITIONING_SIZE,
            negative_original_size=_SDXL_MICRO_CONDITIONING_SIZE,
            negative_target_size=_SDXL_MICRO_CONDITIONING_SIZE,
            crops_coords_top_left=(0, 0),
            negative_crops_coords_top_left=(0, 0),
            num_inference_steps=steps,
            num_images_per_prompt=1,
            guidance_scale=cfg_scale,
            generator=generator,
            callback_on_step_end=report_step if on_progress is not None else None,
            callback_on_step_end_tensor_inputs=[],
        )
        if on_progress is not None and (total_steps is None or completed_step != total_steps):
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "Denoising progress did not finish its schedule."
            )
        return result

    if conditioning.positive_length == conditioning.negative_length:
        return call_pipeline()

    length = positive.shape[1]

    def mask_row(used_length: int) -> Any:
        return torch.cat(
            (
                torch.ones((1, used_length), dtype=positive.dtype, device=positive.device),
                torch.zeros(
                    (1, length - used_length), dtype=positive.dtype, device=positive.device
                ),
            ),
            dim=1,
        )

    # Diffusers 0.40 concatenates unconditional before conditional when CFG is on.
    cfg_enabled = cfg_scale > 1 and pipeline.unet.config.time_cond_proj_dim is None
    if not cfg_enabled and conditioning.positive_length == length:
        return call_pipeline()
    mask = (
        torch.cat(
            (mask_row(conditioning.negative_length), mask_row(conditioning.positive_length)),
            dim=0,
        )
        if cfg_enabled
        else mask_row(conditioning.positive_length)
    )
    expected_batch = 2 if cfg_enabled else 1
    if mask.shape != (expected_batch, length):
        raise DerivativeError("GENERATION_WORKER_FAILED", "Invalid SDXL attention mask shape.")

    hook_calls = 0

    def add_encoder_attention_mask(
        _unet: Any, args: tuple[Any, ...], kwargs: dict[str, Any]
    ) -> tuple[tuple[Any, ...], dict[str, Any]]:
        nonlocal hook_calls
        embeds = kwargs.get("encoder_hidden_states")
        if (
            "encoder_attention_mask" in kwargs
            or embeds is None
            or embeds.shape != (expected_batch, length, positive.shape[2])
            or embeds.device != mask.device
        ):
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "SDXL attention mask does not match UNet input."
            )
        hook_calls += 1
        return args, {**kwargs, "encoder_attention_mask": mask}

    handle = pipeline.unet.register_forward_pre_hook(add_encoder_attention_mask, with_kwargs=True)
    try:
        result = call_pipeline()
        if hook_calls == 0:
            raise DerivativeError("GENERATION_WORKER_FAILED", "SDXL UNet did not receive its mask.")
        return result
    finally:
        handle.remove()


def generate_illustrious_txt2img(
    command: GenerateIllustriousTxt2ImgCommand,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    """Execute one exact SDXL job and publish its provisional PNG and optional cache."""
    if command.prediction_type == "sample":
        raise DerivativeError(
            "GENERATION_PREDICTION_UNSUPPORTED", "Sample prediction is not qualified yet."
        )
    normalize_compel_prompt(command.positive_prompt)
    normalize_compel_prompt(command.negative_prompt)
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
    pipeline.scheduler = select_inference_scheduler(command, pipeline, runtime)
    pipeline.set_progress_bar_config(disable=True)
    pipeline = pipeline.to("cuda")
    with torch.inference_mode():
        conditioning = build_sdxl_conditioning(command, pipeline, runtime)
    generator = torch.Generator(device="cpu").manual_seed(command.seed)
    result = run_sdxl_pipeline(
        pipeline,
        conditioning,
        width=command.width,
        height=command.height,
        steps=command.steps,
        cfg_scale=command.cfg_scale,
        generator=generator,
        torch=torch,
        on_progress=on_progress,
    )
    image = result.images[0]
    if not isinstance(image, Image.Image) or image.size != (command.width, command.height):
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Inference did not return the expected image."
        )
    output_image = image.convert("RGB")
    temporary = write_temporary_image(output_image, command.output_path, "PNG")
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
    done: dict[str, object] = {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": command.request_id,
        "outputPath": str(command.output_path),
        "seed": command.seed,
    }
    thumbnail = create_candidate_thumbnail(output_image, command.output_path)
    if thumbnail is not None:
        done["thumbnail"] = thumbnail
    return done
