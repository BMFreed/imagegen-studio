"""Fail-closed first SDXL/Illustrious txt2img execution boundary.

Business input is validated here; heavyweight ML imports occur only after the separate
inference entrypoint qualifies its offline config and CUDA runtime.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib
import importlib.metadata
import math
import os
import re
import stat
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, cast

from PIL import Image

from imagegen_worker.anima_tokenizers import load_anima_tokenizers
from imagegen_worker.derivatives import (
    DerivativeError,
    canonical_absolute_path,
)
from imagegen_worker.generation_artifacts import (
    publish_generation_image,
    validate_generation_paths,
    validate_generation_target,
)
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_embeddings import (
    EmbeddingConditioningInputs,
    load_generation_embeddings,
    masked_embedding_prompts,
    validate_expanded_conditioning,
)
from imagegen_worker.inference_external_vae import load_generation_vae
from imagegen_worker.inference_lora import finite_lora_outputs, load_generation_loras
from imagegen_worker.inference_vae import configure_vae_precision, finite_vae_outputs
from imagegen_worker.protocol import (
    MAX_GENERATION_STEPS,
    GenerateIllustriousImg2ImgCommand,
    GenerateIllustriousOutpaintCommand,
    GenerateIllustriousTxt2ImgCommand,
)

INFERENCE_WORKER_VERSION = "0.13.0"
INFERENCE_RUNTIME_PROFILE = "linux-nvidia"
INFERENCE_CAPABILITY = "illustrious-txt2img"
INFERENCE_IMG2IMG_CAPABILITY = "illustrious-img2img"
INFERENCE_OUTPAINT_CAPABILITY = "illustrious-outpaint"
INFERENCE_EULER_CAPABILITY = "illustrious-euler"
INFERENCE_LORA_CAPABILITY = "illustrious-lora"
INFERENCE_VAE_PRECISION_CAPABILITY = "illustrious-vae-precision"
INFERENCE_EXTERNAL_VAE_CAPABILITY = "illustrious-external-vae"
INFERENCE_EMBEDDINGS_CAPABILITY = "illustrious-embeddings"
INFERENCE_CFG_RESCALE_CAPABILITY = "illustrious-cfg-rescale"
INFERENCE_PROGRESS_CAPABILITY = "denoising-progress"
INFERENCE_THUMBNAIL_CAPABILITY = "candidate-thumbnails"
ANIMA_CAPABILITIES = (
    "anima-txt2img",
    "anima-img2img",
    "anima-lora",
    "anima-prompt-weighting",
    "anima-flow-sampling",
    "anima-outpaint",
)

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
    "peft": "0.21.2",
    "pillow": "12.2.0",
    "torchvision": "0.22.1",
    "tokenizers": "0.22.2",
    "numpy": "2.5.3",
    "opencv-python-headless": "5.0.0.93",
}

# Only verified embedding ranges become private tokens; unknown resource markup stays unsupported.
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
        transformers = importlib.import_module("transformers")
        numpy = importlib.import_module("numpy")
        cv2 = importlib.import_module("cv2")
        for name in ("array", "polyfit", "float32", "pad", "maximum"):
            getattr(numpy, name)
        for name in ("getGaussianKernel", "distanceTransform", "threshold"):
            getattr(cv2, name)
        importlib.import_module("accelerate")
        importlib.import_module("safetensors")
        importlib.import_module("peft")
        importlib.import_module("torchsde")
        for name in (
            "AutoencoderKL",
            "StableDiffusionXLPipeline",
            "StableDiffusionXLImg2ImgPipeline",
            "DPMSolverMultistepScheduler",
            "DPMSolverSDEScheduler",
            "EulerDiscreteScheduler",
            "EulerAncestralDiscreteScheduler",
            "CosmosTransformer3DModel",
            "AnimaTextConditioner",
            "AutoencoderKLWan",
            "FlowMatchHeunDiscreteScheduler",
            "FlowMatchLCMScheduler",
        ):
            getattr(diffusers, name)
        for name in ("Qwen3Model", "Qwen3Config"):
            getattr(transformers, name)
        er = importlib.import_module("imagegen_worker.vendor.er_sde_scheduler")
        for name in ("ERSDEScheduler",):
            getattr(er, name)
        # Exact bundled bytes and native tokenizer semantics are qualified before ready.
        # No GPU BF16 gate is imposed on the existing Illustrious capability here.
        load_anima_tokenizers()
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


def validate_generation_assets(command: GenerateIllustriousTxt2ImgCommand) -> Image.Image | None:
    """Verify exact checkpoint and retain source pixels through the shared artifact boundary."""
    validate_generation_paths(command.staging_root, command.target_path, command.output_path)
    if _checkpoint_digest(command.checkpoint_path) != command.checkpoint_sha256:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Checkpoint changed after enqueue.")
    if isinstance(command, GenerateIllustriousOutpaintCommand):
        from imagegen_worker.outpaint_worker_assets import capture_outpaint_target

        return capture_outpaint_target(command)
    return validate_generation_target(
        staging_root=command.staging_root,
        target_path=command.target_path,
        output_path=command.output_path,
        target_sha256=command.target_sha256,
        target_byte_size=command.target_byte_size,
        width=command.width,
        height=command.height,
        img2img=isinstance(command, GenerateIllustriousImg2ImgCommand),
    )


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
    if command.scheduler == "euler":
        return diffusers.EulerDiscreteScheduler.from_config(
            config, prediction_type=command.prediction_type
        )
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
    command: GenerateIllustriousTxt2ImgCommand,
    pipeline: Any,
    *,
    effective_prompts: tuple[str, str] | None = None,
) -> tuple[str, str]:
    positive, negative = effective_prompts or (command.positive_prompt, command.negative_prompt)
    prompts = (
        normalize_compel_prompt(positive),
        normalize_compel_prompt(negative),
    )
    for tokenizer in (pipeline.tokenizer, pipeline.tokenizer_2):
        for prompt in prompts:
            if command.positive_embeddings or command.negative_embeddings:
                if tokenizer.model_max_length != _CLIP_CHUNK_TOKENS:
                    raise DerivativeError(
                        "GENERATION_PROMPT_UNSUPPORTED", "Unsupported CLIP conditioning profile."
                    )
                # The actual parsed, vector-expanded chunk budget is checked below before forward.
                # Counting weighting punctuation here would falsely reject otherwise valid prompts.
            else:
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
    command: GenerateIllustriousTxt2ImgCommand,
    pipeline: Any,
    runtime: MLRuntime,
    *,
    embedding_inputs: EmbeddingConditioningInputs | None = None,
) -> SdxlConditioning:
    """Build bounded, independent CLIP1/CLIP2 conditioning for both prompt signs."""
    compel = cast(Any, runtime.compel)
    torch = cast(Any, runtime.torch)
    inputs = embedding_inputs or load_generation_embeddings(command, pipeline, torch)
    prompts = validate_pipeline_prompts(command, pipeline, effective_prompts=inputs.prompts)
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
            textual_inversion_manager=inputs.managers[0],
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
            textual_inversion_manager=inputs.managers[1],
        ),
    )

    if command.positive_embeddings or command.negative_embeddings:
        # Validate both signs and both actual splitters before the first text encoder executes.
        for builder in clip_builders:
            for prompt in prompts:
                validate_expanded_conditioning(builder, prompt)

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


def img2img_pipeline_class(diffusers: Any, torch: Any) -> Any:
    """Adapt two public methods of pinned Diffusers; retain its VAE and denoising loop.

    Invoke selects actual training timesteps rather than flooring Steps * strength.
    Its unseeded VAE posterior is deliberately made replayable: use an independent
    copy of the frozen CPU generator, leaving the initial noise stream unchanged.
    No image/latent cache is introduced, so a cache hit cannot consume fewer draws.
    """
    base = diffusers.StableDiffusionXLImg2ImgPipeline

    class InvokeCompatibleImg2ImgPipeline(base):
        def get_timesteps(
            self,
            num_inference_steps: int,
            strength: float,
            device: Any,
            denoising_start: float | None = None,
        ) -> tuple[Any, int]:
            if denoising_start is not None:
                raise DerivativeError("GENERATION_WORKER_FAILED", "Unexpected denoising start.")
            scheduler = self.scheduler
            cutoff = int(round(scheduler.config.num_train_timesteps * strength))
            start = int((scheduler.timesteps[:: scheduler.order] >= cutoff).sum().item())
            begin = start * scheduler.order
            timesteps = scheduler.timesteps[begin:]
            if hasattr(scheduler, "set_begin_index"):
                scheduler.set_begin_index(begin)
            return timesteps, len(timesteps[:: scheduler.order])

        def prepare_latents(
            self,
            image: Any,
            timestep: Any,
            batch_size: int,
            num_images_per_prompt: int,
            dtype: Any,
            device: Any,
            generator: Any = None,
            add_noise: bool = True,
        ) -> Any:
            if not isinstance(generator, torch.Generator) or generator.device.type != "cpu":
                raise DerivativeError(
                    "GENERATION_WORKER_FAILED", "Frozen CPU generator is required."
                )
            posterior_generator = torch.Generator(device="cpu")
            posterior_generator.set_state(generator.get_state())
            encoded = base.prepare_latents(
                self,
                image,
                timestep,
                batch_size,
                num_images_per_prompt,
                dtype,
                device,
                posterior_generator,
                add_noise=False,
            )
            if len(timestep) == 0:
                return encoded
            if not add_noise:
                raise DerivativeError("GENERATION_WORKER_FAILED", "Img2img requires initial noise.")
            noise = torch.randn(encoded.shape, generator=generator, device="cpu", dtype=dtype).to(
                device
            )
            return self.scheduler.add_noise(encoded, noise, timestep)

    return InvokeCompatibleImg2ImgPipeline


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
    cfg_rescale: float = 0.0,
    image: Image.Image | None = None,
    denoising_strength: float | None = None,
    on_denoising_step: Callable[[Any, int, Any, dict[str, Any]], dict[str, Any]] | None = None,
) -> Any:
    """Apply final conditioning padding and an optional scoped latent callback.

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
        timestep: Any,
        callback_kwargs: dict[str, Any],
    ) -> dict[str, Any]:
        nonlocal completed_step, total_steps
        # The pinned DPMSolverSDE schedule includes second-order evaluations: its loop has
        # 2 * requested Steps - 1 timesteps. Read the actual schedule after initialization.
        try:
            actual_total = (
                callback_pipeline.num_timesteps
                if image is not None
                else len(callback_pipeline.scheduler.timesteps)
            )
        except (AttributeError, TypeError, OverflowError) as error:
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "Invalid denoising progress schedule."
            ) from error
        if (
            callback_pipeline is not pipeline
            or type(step_index) is not int
            or type(actual_total) is not int
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
        if on_denoising_step is not None:
            callback_kwargs = on_denoising_step(
                callback_pipeline, step_index, timestep, callback_kwargs
            )
        if on_progress is not None:
            on_progress(completed_step, actual_total)
        # Progress alone requests no tensors; only an explicit internal denoising
        # callback owns latent updates. Progress cannot alter the callback payload.
        return callback_kwargs

    def call_pipeline() -> Any:
        if (image is None) != (denoising_strength is None):
            raise DerivativeError("GENERATION_WORKER_FAILED", "Incomplete img2img input.")
        mode_options: dict[str, Any] = (
            {"image": image, "strength": denoising_strength}
            if image is not None
            else {"width": width, "height": height}
        )
        result = pipeline(
            prompt_embeds=positive,
            negative_prompt_embeds=negative,
            pooled_prompt_embeds=conditioning.positive_pooled,
            negative_pooled_prompt_embeds=conditioning.negative_pooled,
            **mode_options,
            original_size=_SDXL_MICRO_CONDITIONING_SIZE,
            target_size=_SDXL_MICRO_CONDITIONING_SIZE,
            negative_original_size=_SDXL_MICRO_CONDITIONING_SIZE,
            negative_target_size=_SDXL_MICRO_CONDITIONING_SIZE,
            crops_coords_top_left=(0, 0),
            negative_crops_coords_top_left=(0, 0),
            num_inference_steps=steps,
            num_images_per_prompt=1,
            guidance_scale=cfg_scale,
            guidance_rescale=cfg_rescale,
            generator=generator,
            callback_on_step_end=(
                report_step if on_progress is not None or on_denoising_step is not None else None
            ),
            callback_on_step_end_tensor_inputs=["latents"] if on_denoising_step is not None else [],
        )
        no_denoising = image is not None and pipeline.num_timesteps == 0
        if (
            (on_progress is not None or on_denoising_step is not None)
            and not no_denoising
            and (total_steps is None or completed_step != total_steps)
        ):
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
        if hook_calls == 0 and not (image is not None and pipeline.num_timesteps == 0):
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
    if isinstance(command, GenerateIllustriousImg2ImgCommand):
        raise DerivativeError(
            "INVALID_REQUEST", "Txt2img entrypoint requires a transparent target."
        )
    return _generate_illustrious(
        command, config_dir=config_dir, runtime=runtime, on_progress=on_progress
    )


def generate_illustrious_img2img(
    command: GenerateIllustriousImg2ImgCommand,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    if isinstance(command, GenerateIllustriousOutpaintCommand):
        raise DerivativeError("INVALID_REQUEST", "Img2img cannot execute an outpaint command.")
    return _generate_illustrious(
        command, config_dir=config_dir, runtime=runtime, on_progress=on_progress
    )


def generate_illustrious_outpaint(
    command: GenerateIllustriousOutpaintCommand,
    *,
    config_dir: Path,
    runtime: MLRuntime,
    on_progress: DenoisingProgressSink | None = None,
) -> dict[str, object]:
    return _generate_illustrious(
        command, config_dir=config_dir, runtime=runtime, on_progress=on_progress
    )


def _generate_illustrious(
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
    for prompt in masked_embedding_prompts(command):
        normalize_compel_prompt(prompt)
    verify_pinned_config(str(config_dir))
    alpha_conditioning = None
    if isinstance(command, GenerateIllustriousOutpaintCommand):
        from imagegen_worker.outpaint_worker_assets import prepare_worker_outpaint

        validate_generation_paths(command.staging_root, command.target_path, command.output_path)
        if _checkpoint_digest(command.checkpoint_path) != command.checkpoint_sha256:
            raise DerivativeError("GENERATION_INPUT_CHANGED", "Checkpoint changed after enqueue.")
        alpha_conditioning, image = prepare_worker_outpaint(command)
    else:
        image = validate_generation_assets(command)
    torch = cast(Any, runtime.torch)
    diffusers = cast(Any, runtime.diffusers)
    if isinstance(command, GenerateIllustriousOutpaintCommand):
        from imagegen_worker.sdxl_outpaint import outpaint_pipeline_class

        pipeline_class = outpaint_pipeline_class(diffusers, torch)
    else:
        pipeline_class = (
            img2img_pipeline_class(diffusers, torch)
            if isinstance(command, GenerateIllustriousImg2ImgCommand)
            else diffusers.StableDiffusionXLPipeline
        )
    selected_vae = (
        load_generation_vae(command.vae, config_dir, diffusers, torch)
        if command.vae is not None
        else None
    )
    pipeline = pipeline_class.from_single_file(
        str(command.checkpoint_path),
        config=str(config_dir),
        local_files_only=True,
        torch_dtype=torch.float16,
        **({"vae": selected_vae} if selected_vae is not None else {}),
    )
    verify_pinned_config(str(config_dir))
    # The single-file loader reads the file after our preflight hash. Detect mutation during load.
    if _checkpoint_digest(command.checkpoint_path) != command.checkpoint_sha256:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Checkpoint changed during loading.")
    pipeline.scheduler = select_inference_scheduler(command, pipeline, runtime)
    pipeline.set_progress_bar_config(disable=True)
    load_generation_loras(pipeline, command.loras, torch)
    embedding_inputs = load_generation_embeddings(command, pipeline, torch)
    configure_vae_precision(pipeline, command.vae_precision, torch)
    pipeline = pipeline.to("cuda")
    with (
        finite_vae_outputs(pipeline, torch),
        finite_lora_outputs(pipeline, torch) if command.loras else contextlib.nullcontext(),
    ):
        with torch.inference_mode():
            conditioning = build_sdxl_conditioning(
                command, pipeline, runtime, embedding_inputs=embedding_inputs
            )
        if (command.loras or command.positive_embeddings or command.negative_embeddings) and any(
            not bool(torch.isfinite(tensor).all().item())
            for tensor in (
                conditioning.positive,
                conditioning.negative,
                conditioning.positive_pooled,
                conditioning.negative_pooled,
            )
        ):
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "Resource conditioning produced non-finite values."
            )
        generator = torch.Generator(device="cpu").manual_seed(command.seed)
        arguments: dict[str, Any] = {
            "width": command.width,
            "height": command.height,
            "steps": command.steps,
            "cfg_scale": command.cfg_scale,
            "cfg_rescale": command.cfg_rescale,
            "generator": generator,
            "torch": torch,
            "on_progress": on_progress,
            "image": image,
            "denoising_strength": (
                command.denoising_strength
                if isinstance(command, GenerateIllustriousImg2ImgCommand)
                else None
            ),
        }
        if alpha_conditioning is not None:
            from imagegen_worker.sdxl_outpaint import run_sdxl_outpaint_pipeline

            result = run_sdxl_outpaint_pipeline(
                pipeline,
                conditioning,
                keep_mask=alpha_conditioning.latent_keep_mask,
                **arguments,
            )
        else:
            result = run_sdxl_pipeline(pipeline, conditioning, **arguments)
    output_image = result.images[0]
    if alpha_conditioning is not None:
        from imagegen_worker.outpaint_conditioning import create_outpaint_contribution

        output_image = create_outpaint_contribution(output_image, alpha_conditioning)
    return publish_generation_image(
        output_image,
        staging_root=command.staging_root,
        output_path=command.output_path,
        width=command.width,
        height=command.height,
        request_id=command.request_id,
        seed=command.seed,
        output_mode="RGBA" if alpha_conditioning is not None else "RGB",
    )
