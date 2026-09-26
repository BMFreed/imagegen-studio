"""Versioned JSON-lines commands for the app-owned worker subprocess."""

from __future__ import annotations

import io
import math
import platform
import re
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from PIL import Image, ImageCms
from PIL import __version__ as pillow_version

from imagegen_worker import PROTOCOL_VERSION, RUNTIME_PROFILE, WORKER_VERSION
from imagegen_worker.compositor import (
    MAX_LAYERS,
    ComposePreviewRequest,
    LayerTransform,
    PreviewLayer,
    compose_preview,
)
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    DerivativeRequest,
    create_derivatives,
)
from imagegen_worker.imports import NormalizeImportRequest, normalize_import

MAX_MESSAGE_BYTES = 64 * 1024
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


def _object(value: object, label: str, expected_keys: set[str]) -> dict[str, object]:
    if not isinstance(value, dict):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be an object.")
    untyped_fields = cast(dict[object, object], value)
    if not all(isinstance(key, str) for key in untyped_fields):
        raise DerivativeError("INVALID_REQUEST", f"{label} must be an object.")
    result = cast(dict[str, object], untyped_fields)
    if set(result) != expected_keys:
        raise DerivativeError("INVALID_REQUEST", f"{label} has missing or unsupported fields.")
    return result


def _path(value: object, label: str) -> Path:
    if not isinstance(value, str) or not 1 <= len(value) <= 4096:
        raise DerivativeError("INVALID_REQUEST", f"{label} must be a path string.")
    if "\x00" in value:
        raise DerivativeError("INVALID_REQUEST", f"{label} contains an invalid character.")
    return Path(value)


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
) -> SelfTestCommand | DeriveImageCommand | NormalizeImportCommand | ComposePreviewCommand:
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
