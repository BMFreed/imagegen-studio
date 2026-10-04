"""Versioned JSON-lines commands for the app-owned worker subprocess."""

from __future__ import annotations

import io
import math
import platform
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

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

MAX_MESSAGE_BYTES = 64 * 1024
MAX_GENERATION_PROMPT_BYTES = 16_384
MAX_GENERATION_TARGET_BYTES = 32 * 1024 * 1024
MAX_GENERATION_STEPS = 200
MAX_GENERATION_CFG_RESCALE = 0.99
MAX_GENERATION_CFG_SCALE = 30
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
class ComposePreviewCommand:
    request_id: str
    preview: ComposePreviewRequest


@dataclass(frozen=True)
class ComposeTargetCommand:
    request_id: str
    target: ComposeTargetRequest


@dataclass(frozen=True)
class GenerationLora:
    path: Path
    sha256: str
    byte_size: int
    weight: float


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
    scheduler: Literal["dpmpp_2m_k", "dpmpp_2m", "euler_a", "dpmpp_sde_k", "dpmpp_sde"]
    staging_root: Path
    output_path: Path
    cfg_rescale: float = 0.0
    loras: tuple[GenerationLora, ...] = ()
    vae_precision: Literal["Auto", "FP16", "FP32"] = "Auto"


@dataclass(frozen=True, kw_only=True)
class GenerateIllustriousImg2ImgCommand(GenerateIllustriousTxt2ImgCommand):
    """Opaque frozen target; strength is explicit and never inferred by the worker."""

    denoising_strength: float


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
            "self-test",
            "target-composition",
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


def _generate_illustrious_txt2img(
    value: object, request_id: str, *, img2img: bool = False
) -> GenerateIllustriousTxt2ImgCommand:
    job = _object(
        value,
        "Generation job",
        {"schemaVersion", "checkpoint", "target", "bbox", "prompts", "sampling", "output"},
        optional_keys={"loras", "vaePrecision"},
    )
    if type(job["schemaVersion"]) is not int or job["schemaVersion"] != 1:
        raise DerivativeError("INVALID_REQUEST", "Generation job schema version is unsupported.")
    vae_precision = job.get("vaePrecision", "Auto")
    if not isinstance(vae_precision, str) or vae_precision not in ("Auto", "FP16", "FP32"):
        raise DerivativeError("INVALID_REQUEST", "VAE precision is unsupported.")

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

    sampling = _object(
        job["sampling"],
        "Sampling",
        {"steps", "cfgScale", "seed", "scheduler"} | ({"denoisingStrength"} if img2img else set()),
        optional_keys={"cfgRescale"},
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
        "euler_a",
        "dpmpp_sde_k",
        "dpmpp_sde",
    ):
        raise DerivativeError("INVALID_REQUEST", "Generation scheduler is unsupported.")

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
        seed=seed,
        scheduler=scheduler,
        staging_root=staging_root,
        output_path=png_path,
    )
    if denoising_strength is not None:
        return GenerateIllustriousImg2ImgCommand(
            **vars(command), denoising_strength=denoising_strength
        )
    return command


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
    | ComposePreviewCommand
    | ComposeTargetCommand
    | GenerateIllustriousTxt2ImgCommand
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
    if fields.get("type") in ("generate-illustrious-txt2img", "generate-illustrious-img2img"):
        _object(
            fields,
            "Generation request",
            {"type", "requestId", "protocolVersion", "job"},
        )
        return _generate_illustrious_txt2img(
            fields["job"], request_id, img2img=fields["type"] == "generate-illustrious-img2img"
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
        if isinstance(command, GenerateIllustriousTxt2ImgCommand):
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
        if isinstance(command, ComposeTargetCommand):
            result = compose_target(command.target)
            return {
                "type": "target-done",
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": command.request_id,
                **result,
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
