"""Versioned JSON-lines commands for the app-owned worker subprocess."""

from __future__ import annotations

import io
import platform
import re
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from PIL import Image, ImageCms
from PIL import __version__ as pillow_version

from imagegen_worker import PROTOCOL_VERSION, RUNTIME_PROFILE, WORKER_VERSION
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


def ready_message() -> dict[str, object]:
    return {
        "type": "ready",
        "protocolVersion": PROTOCOL_VERSION,
        "workerVersion": WORKER_VERSION,
        "pythonVersion": platform.python_version(),
        "runtimeProfile": RUNTIME_PROFILE,
        "capabilities": ["image-derivatives", "import-normalization", "self-test"],
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


def parse_request(value: object) -> SelfTestCommand | DeriveImageCommand | NormalizeImportCommand:
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
