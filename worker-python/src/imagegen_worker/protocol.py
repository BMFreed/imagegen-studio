"""Versioned JSON-lines commands for the app-owned worker subprocess."""

from __future__ import annotations

import io
import math
import platform
import re
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Literal, cast

from PIL import Image, ImageCms
from PIL import __version__ as pillow_version

from imagegen_worker import PROTOCOL_VERSION, RUNTIME_PROFILE, WORKER_VERSION
from imagegen_worker.compositor import (
    MAX_LAYERS,
    MAX_TARGET_PIXELS,
    MAX_TARGET_SIDE,
    MAX_WORLD_COORDINATE,
    ComposePreviewRequest,
    ComposeTargetRequest,
    LayerTransform,
    PreviewLayer,
    PreviewRect,
    compose_preview,
    compose_target,
)
from imagegen_worker.derivatives import (
    PINNED_SRGB_ICC_SHA256,
    SRGB_ICC_PROFILE,
    DerivativeError,
    DerivativeRequest,
    create_derivatives,
)
from imagegen_worker.imports import NormalizeImportRequest, normalize_import
from imagegen_worker.resource_previews import ResourcePreviewRequest, create_resource_preview
from imagegen_worker.smart_patch_fade import (
    SmartPatchFadeRequest,
    fade_smart_patch,
)
from imagegen_worker.smart_patch_preparation import (
    PreparationImage,
    PreparationMask,
    SmartPatchPreparationRequest,
    prepare_smart_patch,
)

if TYPE_CHECKING:
    from imagegen_worker.anima_conditioning import CompiledAnimaPrompt
    from imagegen_worker.anima_flow_sampling import AnimaFlowSamplingPlan
    from imagegen_worker.inference_anima import AnimaModelBundle

MAX_MESSAGE_BYTES = 64 * 1024
MAX_GENERATION_PROMPT_BYTES = 16_384
MAX_GENERATION_TARGET_BYTES = 32 * 1024 * 1024
MAX_GENERATION_STEPS = 200
MAX_GENERATION_CFG_RESCALE = 0.99
MAX_GENERATION_CFG_SCALE = 30
MAX_EMBEDDING_VECTORS = 300  # Four CLIP chunks, each with 75 content positions.
OUTPAINT_INFILL_SHA256 = "344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9"
OUTPAINT_INFILL_BYTE_SIZE = 205_669_692
_REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
_SHA256_PATTERN = re.compile(r"[a-f0-9]{64}\Z")


@dataclass(frozen=True)
class SelfTestCommand:
    request_id: str


@dataclass(frozen=True)
class DeriveImageCommand:
    request_id: str
    derivative: DerivativeRequest


@dataclass(frozen=True)
class NormalizeImportCommand:
    request_id: str
    imported: NormalizeImportRequest


@dataclass(frozen=True)
class ResourcePreviewCommand:
    request_id: str
    preview: ResourcePreviewRequest


@dataclass(frozen=True)
class ComposePreviewCommand:
    request_id: str
    preview: ComposePreviewRequest


@dataclass(frozen=True)
class ComposeTargetCommand:
    request_id: str
    target: ComposeTargetRequest


@dataclass(frozen=True)
class PrepareSmartPatchCommand:
    request_id: str
    preparation: SmartPatchPreparationRequest


@dataclass(frozen=True)
class FadeSmartPatchCommand:
    request_id: str
    fade: SmartPatchFadeRequest


@dataclass(frozen=True)
class GenerationLora:
    path: Path
    sha256: str
    byte_size: int
    weight: float


@dataclass(frozen=True)
class GenerationVae:
    path: Path
    sha256: str
    byte_size: int


@dataclass(frozen=True)
class GenerationEmbedding:
    token: str
    path: Path
    sha256: str
    byte_size: int


@dataclass(frozen=True)
class OutpaintInfillResource:
    path: Path
    sha256: str
    byte_size: int
    role: Literal["outpaint-infill"] = "outpaint-infill"


@dataclass(frozen=True)
class AlphaOutpaintConditioning:
    """Strict captured alpha/policy identity; pixels are independently rederived at execution."""

    bbox: PreviewRect
    source_sha256: str
    source_byte_size: int
    width: int
    height: int
    keep_mask_sha256: str
    keep_mask_byte_size: int
    edge_radius: int = 16
    fade_distance: int = 16
    minimum_denoise: float = 0


@dataclass(frozen=True)
class IllustriousNoiseProfile:
    """Frozen exact-file policy; the version fixes the native SDXL beta schedule."""

    rescale_betas_zero_snr: bool
    timestep_spacing: Literal["leading", "linspace", "trailing"]
    schema_version: Literal[1] = 1
    base_schedule: Literal["sdxl-scaled-linear-v1"] = "sdxl-scaled-linear-v1"


def validate_illustrious_noise_scheduler(
    profile: IllustriousNoiseProfile | None, scheduler: str
) -> None:
    if (
        profile is not None
        and profile.rescale_betas_zero_snr
        and scheduler in ("dpmpp_sde", "dpmpp_sde_k")
    ):
        raise DerivativeError(
            "GENERATION_SAMPLING_UNSUPPORTED",
            "DPM++ SDE does not support zero-terminal-SNR rescaling in this runtime.",
        )


@dataclass(frozen=True)
class GenerateIllustriousTxt2ImgCommand:
    """Validated, versioned inference input. The derivatives entrypoint still refuses it."""

    request_id: str
    checkpoint_path: Path
    checkpoint_sha256: str
    prediction_type: Literal["epsilon", "v_prediction", "sample"]
    target_path: Path
    target_sha256: str
    target_byte_size: int
    target_icc_sha256: str
    width: int
    height: int
    bbox: PreviewRect
    positive_prompt: str
    negative_prompt: str
    steps: int
    cfg_scale: float
    seed: int
    scheduler: Literal["dpmpp_2m_k", "dpmpp_2m", "euler", "euler_a", "dpmpp_sde_k", "dpmpp_sde"]
    staging_root: Path
    output_path: Path
    cfg_rescale: float = 0.0
    loras: tuple[GenerationLora, ...] = ()
    vae_precision: Literal["Auto", "FP16", "FP32"] = "Auto"
    vae: GenerationVae | None = None
    positive_embeddings: tuple[GenerationEmbedding, ...] = ()
    negative_embeddings: tuple[GenerationEmbedding, ...] = ()
    noise_profile: IllustriousNoiseProfile | None = None


@dataclass(frozen=True, kw_only=True)
class GenerateIllustriousImg2ImgCommand(GenerateIllustriousTxt2ImgCommand):
    """Opaque frozen target; strength is explicit and never inferred by the worker."""

    denoising_strength: float


@dataclass(frozen=True, kw_only=True)
class GenerateIllustriousOutpaintCommand(GenerateIllustriousImg2ImgCommand):
    conditioning: AlphaOutpaintConditioning
    infill_resource: OutpaintInfillResource


@dataclass(frozen=True)
class GenerateAnimaTxt2ImgCommand:
    """Original Anima's captured worker boundary, separate from Main admission and SDXL."""

    request_id: str
    bundle: AnimaModelBundle
    target_path: Path
    target_sha256: str
    target_byte_size: int
    width: int
    height: int
    bbox: PreviewRect
    positive_prompt: CompiledAnimaPrompt
    negative_prompt: CompiledAnimaPrompt
    sampling: AnimaFlowSamplingPlan
    loras: tuple[GenerationLora, ...]
    staging_root: Path
    output_path: Path


@dataclass(frozen=True)
class GenerateAnimaImg2ImgCommand(GenerateAnimaTxt2ImgCommand):
    """A fully opaque frozen RGBA target and explicit captured strength."""


@dataclass(frozen=True, kw_only=True)
class GenerateAnimaOutpaintCommand(GenerateAnimaImg2ImgCommand):
    conditioning: AlphaOutpaintConditioning
    infill_resource: OutpaintInfillResource


def ready_message() -> dict[str, object]:
    return {
        "type": "ready",
        "protocolVersion": PROTOCOL_VERSION,
        "workerVersion": WORKER_VERSION,
        "pythonVersion": platform.python_version(),
        "runtimeProfile": RUNTIME_PROFILE,
        "capabilities": [
            "image-derivatives",
            "import-normalization",
            "preview-composition",
            "resource-preview",
            "self-test",
            "target-composition",
            "smart-patch-preparation",
            "smart-patch-fade",
        ],
    }


def error_message(request_id: str | None, code: str, message: str) -> dict[str, object]:
    return {
        "type": "error",
        "protocolVersion": PROTOCOL_VERSION,
        "requestId": request_id,
        "code": code,
        "message": message,
    }


def _object(
    value: object,
    label: str,
    expected_keys: set[str],
    *,
    optional_keys: set[str] | None = None,
) -> dict[str, object]:
    if not isinstance(value, dict):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be an object.")
    untyped_fields = cast(dict[object, object], value)
    if not all(isinstance(key, str) for key in untyped_fields):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be an object.")
    result = cast(dict[str, object], untyped_fields)
    keys = set(result)
    if not expected_keys <= keys <= expected_keys | (optional_keys or set()):
        raise DerivativeError("INVALID_REQUEST", f"{label} has missing or unsupported fields.")
    return result


def _path(value: object, label: str) -> Path:
    if not isinstance(value, str) or not 1 <= len(value) <= 4096:
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a path string.")
    if "\x00" in value:
        raise DerivativeError("INVALID_REQUEST", f"{label} contains an invalid character.")
    return Path(value)


def _absolute_path(value: object, label: str) -> Path:
    parsed = _path(value, label)
    if not parsed.is_absolute() or ".." in parsed.parts:
        raise DerivativeError("INVALID_REQUEST", f"{label} must be an absolute, normalized path.")
    return parsed


def _number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a finite number.")
    try:
        converted = float(value)
    except OverflowError as error:
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a finite number.") from error
    if not math.isfinite(converted):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a finite number.")
    return converted


def _positive_integer(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a positive integer.")
    return value


def _sha256(value: object, label: str) -> str:
    if not isinstance(value, str) or not _SHA256_PATTERN.fullmatch(value):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a lowercase hex digest.")
    return value


def _target_bbox(value: object) -> PreviewRect:
    fields = _object(value, "Target bbox", {"x", "y", "width", "height"})
    x = fields["x"]
    y = fields["y"]
    if (
        isinstance(x, bool)
        or not isinstance(x, int)
        or abs(x) > MAX_WORLD_COORDINATE
        or isinstance(y, bool)
        or not isinstance(y, int)
        or abs(y) > MAX_WORLD_COORDINATE
    ):
        raise DerivativeError("INVALID_REQUEST", "Target bbox origin must be bounded integers.")
    return {
        "x": x,
        "y": y,
        "width": _positive_integer(fields["width"], "Target width"),
        "height": _positive_integer(fields["height"], "Target height"),
    }


def _preparation_image(value: object, label: str) -> PreparationImage:
    fields = _object(value, label, {"path", "sha256", "byteSize", "width", "height"})
    return PreparationImage(
        path=_path(fields["path"], f"{label} path"),
        sha256=_sha256(fields["sha256"], f"{label} hash"),
        byte_size=_positive_integer(fields["byteSize"], f"{label} byte size"),
        width=_positive_integer(fields["width"], f"{label} width"),
        height=_positive_integer(fields["height"], f"{label} height"),
    )


def _illustrious_noise_profile(value: object) -> IllustriousNoiseProfile:
    fields = _object(
        value,
        "Illustrious noise profile",
        {"schemaVersion", "baseSchedule", "rescaleBetasZeroSnr", "timestepSpacing"},
    )
    if type(fields["schemaVersion"]) is not int or fields["schemaVersion"] != 1:
        raise DerivativeError("INVALID_REQUEST", "Noise profile version is unsupported.")
    if fields["baseSchedule"] != "sdxl-scaled-linear-v1":
        raise DerivativeError("INVALID_REQUEST", "Noise profile base schedule is unsupported.")
    rescale = fields["rescaleBetasZeroSnr"]
    if type(rescale) is not bool:
        raise DerivativeError("INVALID_REQUEST", "Zero-SNR rescaling must be boolean.")
    spacing = fields["timestepSpacing"]
    if not isinstance(spacing, str) or spacing not in ("leading", "linspace", "trailing"):
        raise DerivativeError("INVALID_REQUEST", "Noise profile timestep spacing is unsupported.")
    return IllustriousNoiseProfile(rescale, spacing)


def _generate_illustrious_txt2img(
    value: object, request_id: str, *, img2img: bool = False, outpaint: bool = False
) -> GenerateIllustriousTxt2ImgCommand:
    job = _object(
        value,
        "Generation job",
        {"schemaVersion", "checkpoint", "target", "bbox", "prompts", "sampling", "output"}
        | ({"conditioning", "infillResource"} if outpaint else set()),
        optional_keys={"loras", "vaePrecision", "vae", "embeddings"},
    )
    if type(job["schemaVersion"]) is not int or job["schemaVersion"] != 1:
        raise DerivativeError("INVALID_REQUEST", "Generation job schema version is unsupported.")
    vae_precision = job.get("vaePrecision", "Auto")
    if not isinstance(vae_precision, str) or vae_precision not in ("Auto", "FP16", "FP32"):
        raise DerivativeError("INVALID_REQUEST", "VAE precision is unsupported.")
    vae_value = job.get("vae")
    vae: GenerationVae | None = None
    if vae_value is not None:
        vae_fields = _object(vae_value, "External VAE", {"path", "sha256", "byteSize"})
        vae = GenerationVae(
            path=_absolute_path(vae_fields["path"], "External VAE path"),
            sha256=_sha256(vae_fields["sha256"], "External VAE SHA-256"),
            byte_size=_positive_integer(vae_fields["byteSize"], "External VAE byte size"),
        )

    checkpoint = _object(job["checkpoint"], "Checkpoint", {"path", "sha256", "predictionType"})
    checkpoint_path = _absolute_path(checkpoint["path"], "Checkpoint path")
    checkpoint_sha256 = _sha256(checkpoint["sha256"], "Checkpoint SHA-256")
    lora_values = job.get("loras", [])
    if not isinstance(lora_values, list):
        raise DerivativeError("INVALID_REQUEST", "LoRAs must be an array.")
    loras: list[GenerationLora] = []
    paths: set[Path] = set()
    for value in cast(list[object], lora_values):
        fields = _object(value, "LoRA", {"path", "sha256", "byteSize", "weight"})
        path = _absolute_path(fields["path"], "LoRA path")
        digest = _sha256(fields["sha256"], "LoRA SHA-256")
        if path in paths:
            raise DerivativeError("INVALID_REQUEST", "Enabled LoRAs must be distinct.")
        paths.add(path)
        loras.append(
            GenerationLora(
                path=path,
                sha256=digest,
                byte_size=_positive_integer(fields["byteSize"], "LoRA byte size"),
                weight=_number(fields["weight"], "LoRA weight"),
            )
        )
    prediction_type = checkpoint["predictionType"]
    if not isinstance(prediction_type, str) or prediction_type not in (
        "epsilon",
        "v_prediction",
        "sample",
    ):
        raise DerivativeError("INVALID_REQUEST", "Checkpoint prediction type is unsupported.")

    target = _object(
        job["target"],
        "Target",
        {"path", "sha256", "byteSize", "width", "height", "iccSha256"},
    )
    target_path = _absolute_path(target["path"], "Target path")
    target_sha256 = _sha256(target["sha256"], "Target SHA-256")
    target_icc_sha256 = _sha256(target["iccSha256"], "Target ICC SHA-256")
    if target_icc_sha256 != PINNED_SRGB_ICC_SHA256:
        raise DerivativeError("INVALID_REQUEST", "Target ICC profile is unsupported.")
    target_byte_size = _positive_integer(target["byteSize"], "Target byte size")
    if target_byte_size > MAX_GENERATION_TARGET_BYTES:
        raise DerivativeError("INVALID_REQUEST", "Target byte size exceeds the provisional limit.")
    width = _positive_integer(target["width"], "Target width")
    height = _positive_integer(target["height"], "Target height")
    bbox = _target_bbox(job["bbox"])
    if (
        width != bbox["width"]
        or height != bbox["height"]
        or width % 8 != 0
        or height % 8 != 0
        or width > MAX_TARGET_SIDE
        or height > MAX_TARGET_SIDE
        or width * height > MAX_TARGET_PIXELS
    ):
        raise DerivativeError("INVALID_REQUEST", "Generation dimensions are unsupported.")

    prompts = _object(job["prompts"], "Prompts", {"positive", "negative"})
    if not isinstance(prompts["positive"], str) or not isinstance(prompts["negative"], str):
        raise DerivativeError("INVALID_REQUEST", "Generation prompts must be strings.")
    try:
        prompt_sizes = (
            len(prompts["positive"].encode("utf-8")),
            len(prompts["negative"].encode("utf-8")),
        )
    except UnicodeEncodeError as error:
        raise DerivativeError(
            "INVALID_REQUEST", "Generation prompts must be valid UTF-8."
        ) from error
    if any(size > MAX_GENERATION_PROMPT_BYTES for size in prompt_sizes):
        raise DerivativeError("INVALID_REQUEST", "Generation prompt exceeds the provisional limit.")

    signed_embeddings: list[tuple[GenerationEmbedding, ...]] = [(), ()]
    if "embeddings" in job:
        embedding_fields = _object(job["embeddings"], "Embeddings", {"positive", "negative"})
        for index, sign in enumerate(("positive", "negative")):
            values = embedding_fields[sign]
            if (
                not isinstance(values, list)
                or len(cast(list[object], values)) > MAX_EMBEDDING_VECTORS
            ):
                raise DerivativeError(
                    "INVALID_REQUEST", "Embedding list exceeds the vector budget."
                )
            entries: list[GenerationEmbedding] = []
            tokens: set[str] = set()
            for value in cast(list[object], values):
                fields = _object(value, "Embedding", {"token", "path", "sha256", "byteSize"})
                token = fields["token"]
                if not isinstance(token, str) or not token or "\x00" in token:
                    raise DerivativeError("INVALID_REQUEST", "Embedding token is invalid.")
                try:
                    token_size = len(token.encode("utf-8"))
                except UnicodeEncodeError as error:
                    raise DerivativeError(
                        "INVALID_REQUEST", "Embedding token is invalid."
                    ) from error
                if token_size > MAX_GENERATION_PROMPT_BYTES or token in tokens:
                    raise DerivativeError(
                        "INVALID_REQUEST", "Embedding token is invalid or repeated."
                    )
                tokens.add(token)
                entries.append(
                    GenerationEmbedding(
                        token=token,
                        path=_absolute_path(fields["path"], "Embedding path"),
                        sha256=_sha256(fields["sha256"], "Embedding SHA-256"),
                        byte_size=_positive_integer(fields["byteSize"], "Embedding byte size"),
                    )
                )
            signed_embeddings[index] = tuple(entries)

    sampling = _object(
        job["sampling"],
        "Sampling",
        {"steps", "cfgScale", "seed", "scheduler"} | ({"denoisingStrength"} if img2img else set()),
        optional_keys={"cfgRescale", "noiseProfile"},
    )
    steps = _positive_integer(sampling["steps"], "Sampling steps")
    if steps > MAX_GENERATION_STEPS:
        raise DerivativeError("INVALID_REQUEST", "Sampling steps exceed the provisional limit.")
    cfg_scale = _number(sampling["cfgScale"], "CFG scale")
    if cfg_scale < 1 or cfg_scale > MAX_GENERATION_CFG_SCALE:
        raise DerivativeError("INVALID_REQUEST", "CFG scale is outside the supported range.")
    cfg_rescale = _number(sampling.get("cfgRescale", 0.0), "CFG rescale")
    if not 0 <= cfg_rescale <= MAX_GENERATION_CFG_RESCALE:
        raise DerivativeError("INVALID_REQUEST", "CFG rescale is outside the supported range.")
    denoising_strength = (
        _number(sampling["denoisingStrength"], "Denoising strength") if img2img else None
    )
    if denoising_strength is not None and not 0 <= denoising_strength <= 1:
        raise DerivativeError(
            "INVALID_REQUEST", "Denoising strength is outside the supported range."
        )
    seed = sampling["seed"]
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 0xFFFFFFFF:
        raise DerivativeError("INVALID_REQUEST", "Seed must be an unsigned 32-bit integer.")
    scheduler = sampling["scheduler"]
    if not isinstance(scheduler, str) or scheduler not in (
        "dpmpp_2m_k",
        "dpmpp_2m",
        "euler",
        "euler_a",
        "dpmpp_sde_k",
        "dpmpp_sde",
    ):
        raise DerivativeError("INVALID_REQUEST", "Generation scheduler is unsupported.")
    noise_profile = (
        _illustrious_noise_profile(sampling["noiseProfile"]) if "noiseProfile" in sampling else None
    )
    validate_illustrious_noise_scheduler(noise_profile, scheduler)

    output = _object(job["output"], "Output", {"stagingRoot", "pngPath"})
    staging_root = _absolute_path(output["stagingRoot"], "Output staging root")
    png_path = _absolute_path(output["pngPath"], "Output PNG path")
    if target_path.parent != staging_root or target_path.suffix != ".png":
        raise DerivativeError("INVALID_REQUEST", "Target PNG must be a direct staging child.")
    if png_path.parent != staging_root or png_path.suffix != ".png":
        raise DerivativeError("INVALID_REQUEST", "Output PNG must be a direct staging child.")
    if png_path == target_path:
        raise DerivativeError("INVALID_REQUEST", "Output PNG must not replace the target PNG.")
    command = GenerateIllustriousTxt2ImgCommand(
        request_id=request_id,
        checkpoint_path=checkpoint_path,
        checkpoint_sha256=checkpoint_sha256,
        prediction_type=prediction_type,
        target_path=target_path,
        target_sha256=target_sha256,
        target_byte_size=target_byte_size,
        target_icc_sha256=target_icc_sha256,
        width=width,
        height=height,
        bbox=bbox,
        positive_prompt=prompts["positive"],
        negative_prompt=prompts["negative"],
        steps=steps,
        cfg_scale=cfg_scale,
        cfg_rescale=cfg_rescale,
        loras=tuple(loras),
        vae_precision=vae_precision,
        vae=vae,
        positive_embeddings=signed_embeddings[0],
        negative_embeddings=signed_embeddings[1],
        noise_profile=noise_profile,
        seed=seed,
        scheduler=scheduler,
        staging_root=staging_root,
        output_path=png_path,
    )
    if denoising_strength is not None:
        if outpaint:
            conditioning, infill_resource = _outpaint_identity(job, command)
            return GenerateIllustriousOutpaintCommand(
                **vars(command),
                denoising_strength=denoising_strength,
                conditioning=conditioning,
                infill_resource=infill_resource,
            )
        return GenerateIllustriousImg2ImgCommand(
            **vars(command), denoising_strength=denoising_strength
        )
    return command


def _anima_path(value: object, label: str) -> Path:
    parsed = _absolute_path(value, label)
    if value != str(parsed) or str(parsed).startswith("//"):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a normalized path.")
    try:
        str(parsed).encode("utf-8")
    except UnicodeEncodeError as error:
        raise DerivativeError("INVALID_REQUEST", f"{label} must be valid Unicode.") from error
    return parsed


def _anima_byte_size(value: object, label: str) -> int:
    size = _positive_integer(value, label)
    if size > 9_007_199_254_740_991:
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a safe integer.")
    return size


def _generate_anima(
    value: object, request_id: str, *, img2img: bool, outpaint: bool = False
) -> GenerateAnimaTxt2ImgCommand:
    # Local imports avoid a cycle: the numerical helpers share GenerationLora above.
    from imagegen_worker.anima_conditioning import validate_compiled_anima_prompt
    from imagegen_worker.anima_flow_sampling import validate_anima_flow_sampling_plan
    from imagegen_worker.inference_anima import AnimaModelBundle, AnimaModelFile

    job = _object(
        value,
        "Anima generation job",
        {"schemaVersion", "model", "target", "bbox", "prompts", "sampling", "loras", "output"}
        | ({"conditioning", "infillResource"} if outpaint else set()),
    )
    if type(job["schemaVersion"]) is not int or job["schemaVersion"] != 1:
        raise DerivativeError("INVALID_REQUEST", "Anima job schema version is unsupported.")
    model = _object(
        job["model"], "Anima model", {"architecture", "checkpoint", "qwen3Encoder", "vae"}
    )
    if model["architecture"] != "anima-base-1.0":
        raise DerivativeError("INVALID_REQUEST", "Anima architecture is unsupported.")

    def file(value: object, label: str) -> AnimaModelFile:
        fields = _object(value, label, {"path", "sha256", "byteSize"})
        return AnimaModelFile(
            _anima_path(fields["path"], label),
            _sha256(fields["sha256"], label),
            _anima_byte_size(fields["byteSize"], label),
        )

    bundle = AnimaModelBundle(
        file(model["checkpoint"], "Anima checkpoint"),
        file(model["qwen3Encoder"], "Anima Qwen3 encoder"),
        file(model["vae"], "Anima VAE"),
    )
    if len({bundle.checkpoint.path, bundle.qwen3_encoder.path, bundle.vae.path}) != 3:
        raise DerivativeError("INVALID_REQUEST", "Anima requires three distinct exact model files.")
    sampling = validate_anima_flow_sampling_plan(job["sampling"])
    if sampling.mode != ("img2img" if img2img else "txt2img"):
        raise DerivativeError(
            "INVALID_REQUEST", "Anima command mode differs from its sampling plan."
        )
    bbox = _target_bbox(job["bbox"])
    target = _object(
        job["target"],
        "Anima target",
        {"path", "sha256", "byteSize", "width", "height", "iccSha256"},
    )
    target_path = _anima_path(target["path"], "Anima target path")
    target_size = _anima_byte_size(target["byteSize"], "Anima target byte size")
    width = _positive_integer(target["width"], "Anima target width")
    height = _positive_integer(target["height"], "Anima target height")
    if (
        _sha256(target["iccSha256"], "Anima target ICC") != PINNED_SRGB_ICC_SHA256
        or target_size > MAX_GENERATION_TARGET_BYTES
        or width != sampling.width
        or height != sampling.height
        or bbox["width"] != width
        or bbox["height"] != height
    ):
        raise DerivativeError("INVALID_REQUEST", "Anima target identity or dimensions are invalid.")
    prompts = _object(job["prompts"], "Anima prompts", {"positive", "negative"})
    positive = validate_compiled_anima_prompt(prompts["positive"])
    negative = validate_compiled_anima_prompt(prompts["negative"])
    lora_values = job["loras"]
    if not isinstance(lora_values, list):
        raise DerivativeError("INVALID_REQUEST", "Anima LoRAs must be an ordered array.")
    loras: list[GenerationLora] = []
    paths: set[Path] = set()
    for value in cast(list[object], lora_values):
        fields = _object(value, "Anima LoRA", {"path", "sha256", "byteSize", "weight"})
        path = _anima_path(fields["path"], "Anima LoRA path")
        if path in paths:
            raise DerivativeError("INVALID_REQUEST", "Anima LoRAs must have distinct exact paths.")
        paths.add(path)
        loras.append(
            GenerationLora(
                path,
                _sha256(fields["sha256"], "Anima LoRA SHA-256"),
                _anima_byte_size(fields["byteSize"], "Anima LoRA byte size"),
                _number(fields["weight"], "Anima LoRA weight"),
            )
        )
    output = _object(job["output"], "Anima output", {"stagingRoot", "pngPath"})
    staging_root = _anima_path(output["stagingRoot"], "Anima staging root")
    output_path = _anima_path(output["pngPath"], "Anima output path")
    if (
        target_path.parent != staging_root
        or target_path.suffix != ".png"
        or output_path.parent != staging_root
        or output_path.suffix != ".png"
        or output_path == target_path
    ):
        raise DerivativeError(
            "INVALID_REQUEST", "Anima target/output must be direct staging files."
        )
    model_paths = {bundle.checkpoint.path, bundle.qwen3_encoder.path, bundle.vae.path}
    if paths & model_paths or {target_path, output_path} & (model_paths | paths):
        raise DerivativeError("INVALID_REQUEST", "Anima models, LoRAs and images must be distinct.")
    command_type = GenerateAnimaImg2ImgCommand if img2img else GenerateAnimaTxt2ImgCommand
    command = command_type(
        request_id=request_id,
        bundle=bundle,
        target_path=target_path,
        target_sha256=_sha256(target["sha256"], "Anima target SHA-256"),
        target_byte_size=target_size,
        width=width,
        height=height,
        bbox=bbox,
        positive_prompt=positive,
        negative_prompt=negative,
        sampling=sampling,
        loras=tuple(loras),
        staging_root=staging_root,
        output_path=output_path,
    )
    if outpaint:
        conditioning, infill_resource = _outpaint_identity(job, command)
        return GenerateAnimaOutpaintCommand(
            **vars(command), conditioning=conditioning, infill_resource=infill_resource
        )
    return command


def _outpaint_identity(
    job: dict[str, object],
    command: GenerateIllustriousTxt2ImgCommand | GenerateAnimaTxt2ImgCommand,
) -> tuple[AlphaOutpaintConditioning, OutpaintInfillResource]:
    fields = _object(
        job["conditioning"],
        "Outpaint conditioning",
        {"bbox", "infillResource", "keepMask", "kind", "policy", "schemaVersion", "sourceTarget"},
    )
    if (
        fields["kind"] != "alpha-outpaint-conditioning"
        or type(fields["schemaVersion"]) is not int
        or fields["schemaVersion"] != 1
    ):
        raise DerivativeError("INVALID_REQUEST", "Outpaint conditioning version is unsupported.")
    policy = _object(
        fields["policy"],
        "Outpaint policy",
        {
            "edgeRadius",
            "fadeDistance",
            "infillMethod",
            "maskBlur",
            "minimumDenoise",
            "outputMode",
            "version",
        },
    )
    expected: dict[str, object] = {
        "edgeRadius": 16,
        "fadeDistance": 16,
        "infillMethod": "lama",
        "maskBlur": "gaussian-weighted-max",
        "minimumDenoise": 0,
        "outputMode": "contribution",
        "version": 1,
    }
    if policy != expected or any(
        isinstance(policy[name], bool)
        for name in ("edgeRadius", "fadeDistance", "minimumDenoise", "version")
    ):
        raise DerivativeError("INVALID_REQUEST", "Outpaint policy is unsupported.")
    bbox = _target_bbox(fields["bbox"])
    source = _object(
        fields["sourceTarget"],
        "Outpaint source target",
        {"byteSize", "format", "height", "iccSha256", "sha256", "width"},
    )
    mask = _object(
        fields["keepMask"],
        "Outpaint keep mask",
        {"byteSize", "format", "height", "polarity", "sha256", "width"},
    )
    if (
        bbox != command.bbox
        or source["format"] != "png"
        or _sha256(source["sha256"], "Outpaint source SHA-256") != command.target_sha256
        or _positive_integer(source["byteSize"], "Outpaint source byte size")
        != command.target_byte_size
        or _sha256(source["iccSha256"], "Outpaint source ICC") != PINNED_SRGB_ICC_SHA256
        or _positive_integer(source["width"], "Outpaint source width") != command.width
        or _positive_integer(source["height"], "Outpaint source height") != command.height
        or mask["format"] != "alpha8"
        or mask["polarity"] != "keep"
        or _positive_integer(mask["width"], "Outpaint mask width") != command.width
        or _positive_integer(mask["height"], "Outpaint mask height") != command.height
        or _positive_integer(mask["byteSize"], "Outpaint mask byte size")
        != command.width * command.height
    ):
        raise DerivativeError("INVALID_REQUEST", "Outpaint source, mask and job identities differ.")
    manifest = _object(
        fields["infillResource"], "Outpaint frozen infill", {"byteSize", "role", "sha256"}
    )
    resource = _object(
        job["infillResource"], "Outpaint local infill", {"path", "byteSize", "role", "sha256"}
    )
    for value in (manifest, resource):
        if (
            value["role"] != "outpaint-infill"
            or _sha256(value["sha256"], "Outpaint infill SHA-256") != OUTPAINT_INFILL_SHA256
            or _positive_integer(value["byteSize"], "Outpaint infill byte size")
            != OUTPAINT_INFILL_BYTE_SIZE
        ):
            raise DerivativeError("INVALID_REQUEST", "Outpaint infill is not the pinned resource.")
    resource_path = _anima_path(resource["path"], "Outpaint infill path")
    image_paths = {command.target_path, command.output_path}
    model_paths = {entry.path for entry in command.loras}
    if isinstance(command, GenerateAnimaTxt2ImgCommand):
        model_paths |= {
            command.bundle.checkpoint.path,
            command.bundle.qwen3_encoder.path,
            command.bundle.vae.path,
        }
    else:
        model_paths.add(command.checkpoint_path)
        if command.vae is not None:
            model_paths.add(command.vae.path)
        model_paths |= {
            entry.path for entry in (*command.positive_embeddings, *command.negative_embeddings)
        }
    if (
        resource_path in image_paths | model_paths
        or resource_path.parent == command.staging_root
        or image_paths & model_paths
    ):
        raise DerivativeError("INVALID_REQUEST", "Outpaint images and resources must be distinct.")
    return (
        AlphaOutpaintConditioning(
            bbox=bbox,
            source_sha256=command.target_sha256,
            source_byte_size=command.target_byte_size,
            width=command.width,
            height=command.height,
            keep_mask_sha256=_sha256(mask["sha256"], "Outpaint mask SHA-256"),
            keep_mask_byte_size=command.width * command.height,
        ),
        OutpaintInfillResource(resource_path, OUTPAINT_INFILL_SHA256, OUTPAINT_INFILL_BYTE_SIZE),
    )


def _preview_layer(value: object) -> PreviewLayer:
    fields = _object(
        value,
        "Preview layer",
        {"path", "sha256", "width", "height", "opacity", "blendMode", "transform"},
    )
    transform = _object(
        fields["transform"],
        "Layer transform",
        {"x", "y", "scaleX", "scaleY", "rotationDegrees"},
    )
    blend_mode = fields["blendMode"]
    if blend_mode not in ("normal", "multiply", "screen", "overlay"):
        raise DerivativeError("INVALID_REQUEST", "Layer blend mode is unsupported.")
    return PreviewLayer(
        path=_path(fields["path"], "Layer path"),
        sha256=_sha256(fields["sha256"], "Layer SHA-256"),
        width=_positive_integer(fields["width"], "Layer width"),
        height=_positive_integer(fields["height"], "Layer height"),
        opacity=_number(fields["opacity"], "Layer opacity"),
        blend_mode=blend_mode,
        transform=LayerTransform(
            x=_number(transform["x"], "Layer x"),
            y=_number(transform["y"], "Layer y"),
            scale_x=_number(transform["scaleX"], "Layer scaleX"),
            scale_y=_number(transform["scaleY"], "Layer scaleY"),
            rotation_degrees=_number(transform["rotationDegrees"], "Layer rotationDegrees"),
        ),
    )


def parse_request(
    value: object,
) -> (
    SelfTestCommand
    | DeriveImageCommand
    | NormalizeImportCommand
    | ResourcePreviewCommand
    | ComposePreviewCommand
    | ComposeTargetCommand
    | PrepareSmartPatchCommand
    | FadeSmartPatchCommand
    | GenerateIllustriousTxt2ImgCommand
    | GenerateAnimaTxt2ImgCommand
):
    if not isinstance(value, dict):
        raise DerivativeError("INVALID_REQUEST", "Request must be an object.")
    untyped_fields = cast(dict[object, object], value)
    if not all(isinstance(key, str) for key in untyped_fields):
        raise DerivativeError("INVALID_REQUEST", "Request must be an object.")
    fields = cast(dict[str, object], untyped_fields)
    request_id = fields.get("requestId")
    if not isinstance(request_id, str) or not _REQUEST_ID_PATTERN.fullmatch(request_id):
        raise DerivativeError("INVALID_REQUEST", "requestId is missing or invalid.")
    if fields.get("protocolVersion") != PROTOCOL_VERSION:
        raise DerivativeError("PROTOCOL_MISMATCH", "Worker protocol version is incompatible.")
    if fields.get("type") == "self-test":
        _object(fields, "Self-test request", {"type", "requestId", "protocolVersion"})
        return SelfTestCommand(request_id)
    if fields.get("type") in (
        "generate-illustrious-txt2img",
        "generate-illustrious-img2img",
        "generate-illustrious-outpaint",
    ):
        _object(
            fields,
            "Generation request",
            {"type", "requestId", "protocolVersion", "job"},
        )
        return _generate_illustrious_txt2img(
            fields["job"],
            request_id,
            img2img=fields["type"] != "generate-illustrious-txt2img",
            outpaint=fields["type"] == "generate-illustrious-outpaint",
        )
    if fields.get("type") in (
        "generate-anima-txt2img",
        "generate-anima-img2img",
        "generate-anima-outpaint",
    ):
        _object(fields, "Anima request", {"type", "requestId", "protocolVersion", "job"})
        return _generate_anima(
            fields["job"],
            request_id,
            img2img=fields["type"] != "generate-anima-txt2img",
            outpaint=fields["type"] == "generate-anima-outpaint",
        )
    if fields.get("type") == "create-resource-preview":
        _object(
            fields,
            "Resource preview request",
            {
                "type",
                "requestId",
                "protocolVersion",
                "input",
                "output",
                "previewMaxSide",
                "thumbnailMaxSide",
            },
        )
        source = _object(fields["input"], "Input", {"path", "sha256"})
        output = _object(
            fields["output"], "Output", {"stagingRoot", "previewWebpPath", "thumbnailWebpPath"}
        )
        return ResourcePreviewCommand(
            request_id=request_id,
            preview=ResourcePreviewRequest(
                input_path=_path(source["path"], "Input path"),
                input_sha256=_sha256(source["sha256"], "Input SHA-256"),
                staging_root=_path(output["stagingRoot"], "Staging root"),
                preview_webp_path=_path(output["previewWebpPath"], "Preview output path"),
                thumbnail_webp_path=_path(output["thumbnailWebpPath"], "Thumbnail output path"),
                preview_max_side=_positive_integer(fields["previewMaxSide"], "previewMaxSide"),
                thumbnail_max_side=_positive_integer(
                    fields["thumbnailMaxSide"], "thumbnailMaxSide"
                ),
            ),
        )
    if fields.get("type") == "normalize-import":
        _object(
            fields,
            "Import request",
            {"type", "requestId", "protocolVersion", "input", "output"},
        )
        input_fields = _object(fields["input"], "Input", {"path", "sha256"})
        output_fields = _object(
            fields["output"],
            "Output",
            {"stagingRoot", "normalizedPngPath", "originalIccPath"},
        )
        input_sha256 = input_fields["sha256"]
        if not isinstance(input_sha256, str) or not _SHA256_PATTERN.fullmatch(input_sha256):
            raise DerivativeError(
                "INVALID_REQUEST", "Input SHA-256 must be a lowercase hex digest."
            )
        return NormalizeImportCommand(
            request_id=request_id,
            imported=NormalizeImportRequest(
                input_path=_path(input_fields["path"], "Input path"),
                input_sha256=input_sha256,
                staging_root=_path(output_fields["stagingRoot"], "Staging root"),
                normalized_png_path=_path(
                    output_fields["normalizedPngPath"], "Normalized output path"
                ),
                original_icc_path=_path(
                    output_fields["originalIccPath"], "Original ICC output path"
                ),
            ),
        )
    if fields.get("type") == "compose-preview":
        _object(
            fields,
            "Preview request",
            {"type", "requestId", "protocolVersion", "layers", "output", "thumbnailMaxSide"},
        )
        raw_layers = fields["layers"]
        if not isinstance(raw_layers, list):
            raise DerivativeError("INVALID_REQUEST", "Preview layers must be a bounded array.")
        layers = cast(list[object], raw_layers)
        if len(layers) > MAX_LAYERS:
            raise DerivativeError("INVALID_REQUEST", "Preview layers must be a bounded array.")
        output_fields = _object(
            fields["output"], "Output", {"stagingRoot", "mergedPngPath", "thumbnailWebpPath"}
        )
        return ComposePreviewCommand(
            request_id=request_id,
            preview=ComposePreviewRequest(
                layers=tuple(_preview_layer(value) for value in layers),
                staging_root=_path(output_fields["stagingRoot"], "Staging root"),
                merged_png_path=_path(output_fields["mergedPngPath"], "Merged output path"),
                thumbnail_webp_path=_path(
                    output_fields["thumbnailWebpPath"], "Thumbnail output path"
                ),
                thumbnail_max_side=_positive_integer(fields["thumbnailMaxSide"], "Thumbnail side"),
            ),
        )
    if fields.get("type") == "compose-target":
        _object(
            fields,
            "Target request",
            {"type", "requestId", "protocolVersion", "layers", "bbox", "output"},
        )
        raw_layers = fields["layers"]
        if not isinstance(raw_layers, list):
            raise DerivativeError("INVALID_REQUEST", "Target layers must be a bounded array.")
        layers = cast(list[object], raw_layers)
        if len(layers) > MAX_LAYERS:
            raise DerivativeError("INVALID_REQUEST", "Target layers must be a bounded array.")
        output_fields = _object(fields["output"], "Target output", {"stagingRoot", "targetPngPath"})
        return ComposeTargetCommand(
            request_id=request_id,
            target=ComposeTargetRequest(
                layers=tuple(_preview_layer(layer) for layer in layers),
                bbox=_target_bbox(fields["bbox"]),
                staging_root=_path(output_fields["stagingRoot"], "Staging root"),
                target_png_path=_path(output_fields["targetPngPath"], "Target PNG output"),
            ),
        )
    if fields.get("type") == "prepare-smart-patch":
        _object(
            fields,
            "Smart Patch preparation request",
            {
                "type",
                "requestId",
                "protocolVersion",
                "bbox",
                "internalResolution",
                "source",
                "mask",
                "output",
            },
        )
        source_fields = _object(
            fields["source"],
            "Smart Patch source",
            {"path", "sha256", "byteSize", "width", "height"},
        )
        source = PreparationImage(
            path=_path(source_fields["path"], "Smart Patch source path"),
            sha256=_sha256(source_fields["sha256"], "Smart Patch source hash"),
            byte_size=_positive_integer(source_fields["byteSize"], "Smart Patch source bytes"),
            width=_positive_integer(source_fields["width"], "Smart Patch source width"),
            height=_positive_integer(source_fields["height"], "Smart Patch source height"),
        )
        mask = None
        if fields["mask"] is not None:
            mask_fields = _object(
                fields["mask"],
                "Smart Patch mask",
                {"path", "sha256", "byteSize", "width", "height", "bounds"},
            )
            mask = PreparationMask(
                path=_path(mask_fields["path"], "Smart Patch mask path"),
                sha256=_sha256(mask_fields["sha256"], "Smart Patch mask hash"),
                byte_size=_positive_integer(mask_fields["byteSize"], "Smart Patch mask bytes"),
                width=_positive_integer(mask_fields["width"], "Smart Patch mask width"),
                height=_positive_integer(mask_fields["height"], "Smart Patch mask height"),
                bounds=_target_bbox(mask_fields["bounds"]),
            )
        internal = _object(
            fields["internalResolution"], "Smart Patch internal resolution", {"width", "height"}
        )
        output = _object(
            fields["output"],
            "Smart Patch preparation output",
            {
                "stagingRoot",
                "worldMaskPngPath",
                "processingSourcePngPath",
                "processingMaskPngPath",
            },
        )
        return PrepareSmartPatchCommand(
            request_id=request_id,
            preparation=SmartPatchPreparationRequest(
                bbox=_target_bbox(fields["bbox"]),
                internal_resolution={
                    "width": _positive_integer(internal["width"], "Smart Patch internal width"),
                    "height": _positive_integer(internal["height"], "Smart Patch internal height"),
                },
                source=source,
                mask=mask,
                staging_root=_path(output["stagingRoot"], "Smart Patch staging root"),
                world_mask_png_path=_path(output["worldMaskPngPath"], "World mask output path"),
                processing_source_png_path=_path(
                    output["processingSourcePngPath"], "Processing source output path"
                ),
                processing_mask_png_path=_path(
                    output["processingMaskPngPath"], "Processing mask output path"
                ),
            ),
        )
    if fields.get("type") == "fade-smart-patch":
        _object(
            fields,
            "Smart Patch contribution request",
            {
                "type",
                "requestId",
                "protocolVersion",
                "source",
                "effectiveMask",
                "mode",
                "maskBlur",
                "output",
            },
        )
        mode = fields["mode"]
        if not isinstance(mode, str) or mode not in ("txt2img", "img2img", "inpaint", "outpaint"):
            raise DerivativeError("INVALID_REQUEST", "Smart Patch mode is unsupported.")
        mask_blur = fields["maskBlur"]
        if type(mask_blur) is not int or not 0 <= mask_blur <= 512:
            raise DerivativeError(
                "INVALID_REQUEST", "Smart Patch blur must be an integer 0 to 512."
            )
        output = _object(
            fields["output"],
            "Smart Patch contribution output",
            {"stagingRoot", "contributionMaskPngPath"},
        )
        return FadeSmartPatchCommand(
            request_id=request_id,
            fade=SmartPatchFadeRequest(
                source=_preparation_image(fields["source"], "Smart Patch source"),
                effective_mask=_preparation_image(
                    fields["effectiveMask"], "Smart Patch effective mask"
                ),
                mode=mode,
                mask_blur=mask_blur,
                staging_root=_path(output["stagingRoot"], "Smart Patch staging root"),
                contribution_mask_png_path=_path(
                    output["contributionMaskPngPath"], "Smart Patch contribution output path"
                ),
            ),
        )
    if fields.get("type") != "derive-image":
        raise DerivativeError("INVALID_REQUEST", "Request type is unsupported.")

    _object(
        fields,
        "Derivative request",
        {"type", "requestId", "protocolVersion", "input", "output", "thumbnailMaxSide"},
    )
    input_fields = _object(fields["input"], "Input", {"path", "sha256", "colorSpace"})
    output_fields = _object(
        fields["output"], "Output", {"stagingRoot", "mergedPngPath", "thumbnailWebpPath"}
    )
    input_sha256 = input_fields["sha256"]
    if not isinstance(input_sha256, str) or not _SHA256_PATTERN.fullmatch(input_sha256):
        raise DerivativeError("INVALID_REQUEST", "Input SHA-256 must be a lowercase hex digest.")
    if input_fields["colorSpace"] != "srgb":
        raise DerivativeError("INVALID_REQUEST", "Input colorSpace must be srgb.")
    thumbnail_max_side = fields["thumbnailMaxSide"]
    if isinstance(thumbnail_max_side, bool) or not isinstance(thumbnail_max_side, int):
        raise DerivativeError("INVALID_REQUEST", "thumbnailMaxSide must be an integer.")
    return DeriveImageCommand(
        request_id=request_id,
        derivative=DerivativeRequest(
            input_path=_path(input_fields["path"], "Input path"),
            input_sha256=input_sha256,
            input_color_space="srgb",
            staging_root=_path(output_fields["stagingRoot"], "Staging root"),
            merged_png_path=_path(output_fields["mergedPngPath"], "Merged output path"),
            thumbnail_webp_path=_path(output_fields["thumbnailWebpPath"], "Thumbnail output path"),
            thumbnail_max_side=thumbnail_max_side,
        ),
    )


def request_id_hint(value: object) -> str | None:
    if isinstance(value, dict):
        request_id = cast(dict[object, object], value).get("requestId")
        if isinstance(request_id, str) and _REQUEST_ID_PATTERN.fullmatch(request_id):
            return request_id
    return None


def _self_test() -> dict[str, object]:
    source = Image.new("RGBA", (2, 2), (24, 48, 72, 160))
    for image_format in ("PNG", "WEBP"):
        buffer = io.BytesIO()
        source.save(buffer, format=image_format, lossless=True, icc_profile=SRGB_ICC_PROFILE)
        buffer.seek(0)
        with Image.open(buffer) as decoded:
            decoded.load()
            if (
                decoded.size != source.size
                or decoded.format != image_format
                or decoded.info.get("icc_profile") != SRGB_ICC_PROFILE
            ):
                raise DerivativeError("SELF_TEST_FAILED", "Image codec round trip failed.")
    target_profile = ImageCms.ImageCmsProfile(io.BytesIO(SRGB_ICC_PROFILE))
    converted = ImageCms.profileToProfile(
        source.convert("RGB"), target_profile, target_profile, outputMode="RGB"
    )
    if converted is None or converted.size != source.size:
        raise DerivativeError("SELF_TEST_FAILED", "ICC color transform failed.")
    return {
        "pillowVersion": pillow_version,
        "imageCodecs": ["PNG", "WEBP"],
        "colorConversion": "srgb",
    }


def process_request(value: object) -> dict[str, object]:
    request_id = request_id_hint(value)
    try:
        command = parse_request(value)
        if isinstance(command, SelfTestCommand):
            return {
                "type": "self-test-result",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                "runtimeProfile": RUNTIME_PROFILE,
                "checks": _self_test(),
            }
        if isinstance(command, (GenerateIllustriousTxt2ImgCommand, GenerateAnimaTxt2ImgCommand)):
            return error_message(
                command.request_id,
                "INFERENCE_UNAVAILABLE",
                "This worker does not support image generation.",
            )
        if isinstance(command, DeriveImageCommand):
            result = create_derivatives(command.derivative)
            return {
                "type": "derivative-done",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **result,
            }
        if isinstance(command, ComposePreviewCommand):
            result = compose_preview(command.preview)
            return {
                "type": "preview-done",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **result,
            }
        if isinstance(command, ResourcePreviewCommand):
            resource_result = create_resource_preview(command.preview)
            return {
                "type": "resource-preview-done",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **resource_result,
            }
        if isinstance(command, ComposeTargetCommand):
            result = compose_target(command.target)
            return {
                "type": "target-done",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **result,
            }
        if isinstance(command, PrepareSmartPatchCommand):
            preparation_result = prepare_smart_patch(command.preparation)
            return {
                "type": "smart-patch-prepared",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **preparation_result,
            }
        if isinstance(command, FadeSmartPatchCommand):
            contribution_result = fade_smart_patch(command.fade)
            return {
                "type": "smart-patch-faded",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **contribution_result,
            }
        result = normalize_import(command.imported)
        return {
            "type": "import-done",
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": command.request_id,
            **result,
        }
    except DerivativeError as error:
        return error_message(request_id, error.code, str(error))
    except Exception:
        # Logs and Python tracebacks belong on stderr. Never leak filesystem paths on stdout.
        return error_message(
            request_id, "WORKER_INTERNAL_ERROR", "The worker could not complete the request."
        )
