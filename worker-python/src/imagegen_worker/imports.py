"""Normalize imported raster pixels to sRGB without publishing Project assets."""

from __future__ import annotations

import hashlib
import io
import os
import tempfile
import warnings
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

from imagegen_worker.derivatives import (
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_SIDE,
    SRGB_ICC_PROFILE,
    ArtifactInfo,
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
    read_snapshot,
    write_temporary_image,
)

MAX_ICC_BYTES = 4 * 1024 * 1024
MAX_COMPRESSED_ICC_BYTES = MAX_ICC_BYTES + 64 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SUPPORTED_IMPORT_FORMATS = frozenset({"PNG", "JPEG", "WEBP"})
SUPPORTED_IMPORT_MODES = frozenset({"RGB", "RGBA", "P", "L", "LA", "CMYK"})
PNG_SRGB_COLOR_CHUNKS = {
    b"gAMA": (45_455).to_bytes(4, "big"),
    b"cHRM": b"".join(
        coordinate.to_bytes(4, "big")
        for coordinate in (31_270, 32_900, 64_000, 33_000, 30_000, 60_000, 15_000, 6000)
    ),
    b"cICP": bytes((1, 13, 0, 1)),
}
PNG_COLOR_CHUNKS = frozenset((*PNG_SRGB_COLOR_CHUNKS, b"sRGB"))


@dataclass(frozen=True)
class NormalizeImportRequest:
    input_path: Path
    input_sha256: str
    staging_root: Path
    normalized_png_path: Path
    original_icc_path: Path


class ProfileInfo(TypedDict):
    byteSize: int
    sha256: str


class NormalizeImportResult(TypedDict):
    normalized: ArtifactInfo
    originalIcc: ProfileInfo | None
    sourceFormat: str


def _validate_paths(request: NormalizeImportRequest) -> tuple[Path, Path, Path]:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    source = canonical_absolute_path(request.input_path, label="Input")
    normalized = canonical_absolute_path(request.normalized_png_path, label="Normalized output")
    profile = canonical_absolute_path(request.original_icc_path, label="ICC output")
    if source in {normalized, profile} or normalized == profile:
        raise DerivativeError("INVALID_PATH", "Input and output paths must be distinct.")
    for destination, suffix in ((normalized, ".png"), (profile, ".icc")):
        if destination.suffix.lower() != suffix or root not in destination.parents:
            raise DerivativeError(
                "INVALID_PATH", "Output must be inside staging with its expected format."
            )
        parent = canonical_absolute_path(destination.parent, label="Output directory")
        if not parent.is_dir() or os.path.lexists(destination):
            raise DerivativeError(
                "OUTPUT_UNAVAILABLE", "Output directory is missing or output already exists."
            )
    return source, normalized, profile


def png_embedded_color_metadata(source_bytes: bytes) -> tuple[bytes | None, bool]:
    """Read PNG color chunks explicitly; Pillow can silently discard or ignore them."""
    if not source_bytes.startswith(PNG_SIGNATURE):
        raise DerivativeError("INVALID_IMAGE", "PNG signature is missing.")
    cursor = len(PNG_SIGNATURE)
    profile: bytes | None = None
    seen_image_data = False
    seen_color_chunks: set[bytes] = set()
    has_non_srgb_color_chunk = False
    while cursor + 12 <= len(source_bytes):
        length = int.from_bytes(source_bytes[cursor : cursor + 4], "big")
        kind = source_bytes[cursor + 4 : cursor + 8]
        data_start = cursor + 8
        data_end = data_start + length
        chunk_end = data_end + 4
        if chunk_end > len(source_bytes):
            raise DerivativeError("INVALID_IMAGE", "PNG chunk is truncated.")
        if kind in PNG_COLOR_CHUNKS:
            if kind in seen_color_chunks or seen_image_data:
                raise DerivativeError(
                    "INVALID_COLOR_PROFILE", "PNG color chunk is duplicated or late."
                )
            seen_color_chunks.add(kind)
            crc = int.from_bytes(source_bytes[data_end:chunk_end], "big")
            if zlib.crc32(memoryview(source_bytes)[cursor + 4 : data_end]) != crc:
                raise DerivativeError(
                    "INVALID_COLOR_PROFILE", "PNG color chunk checksum is invalid."
                )
            payload = source_bytes[data_start:data_end]
            if kind == b"sRGB":
                if len(payload) != 1 or payload[0] > 3:
                    raise DerivativeError("INVALID_COLOR_PROFILE", "PNG sRGB intent is invalid.")
            else:
                if len(payload) != len(PNG_SRGB_COLOR_CHUNKS[kind]):
                    raise DerivativeError(
                        "INVALID_COLOR_PROFILE", "PNG color chunk size is invalid."
                    )
                if payload != PNG_SRGB_COLOR_CHUNKS[kind]:
                    has_non_srgb_color_chunk = True
        elif kind == b"iCCP":
            if profile is not None or seen_image_data:
                raise DerivativeError(
                    "INVALID_COLOR_PROFILE", "PNG iCCP chunk is duplicated or late."
                )
            crc = int.from_bytes(source_bytes[data_end:chunk_end], "big")
            if zlib.crc32(memoryview(source_bytes)[cursor + 4 : data_end]) != crc:
                raise DerivativeError("INVALID_COLOR_PROFILE", "PNG iCCP checksum is invalid.")
            payload = source_bytes[data_start:data_end]
            name_end = payload.find(b"\0")
            if (
                not 1 <= name_end <= 79
                or name_end + 2 >= len(payload)
                or payload[name_end + 1] != 0
            ):
                raise DerivativeError("INVALID_COLOR_PROFILE", "PNG iCCP header is invalid.")
            compressed = payload[name_end + 2 :]
            if len(compressed) > MAX_COMPRESSED_ICC_BYTES:
                raise DerivativeError(
                    "ICC_TOO_LARGE", "Embedded ICC profile exceeds the worker limit."
                )
            try:
                decompressor = zlib.decompressobj()
                profile = decompressor.decompress(compressed, MAX_ICC_BYTES + 1)
            except zlib.error as error:
                raise DerivativeError(
                    "INVALID_COLOR_PROFILE", "PNG iCCP compression is invalid."
                ) from error
            if len(profile) > MAX_ICC_BYTES:
                raise DerivativeError(
                    "ICC_TOO_LARGE", "Embedded ICC profile exceeds the worker limit."
                )
            if not decompressor.eof or decompressor.unconsumed_tail or decompressor.unused_data:
                raise DerivativeError("INVALID_COLOR_PROFILE", "PNG iCCP stream is incomplete.")
        elif kind == b"IDAT":
            seen_image_data = True
        elif kind == b"IEND":
            return profile, has_non_srgb_color_chunk
        cursor = chunk_end
    raise DerivativeError("INVALID_IMAGE", "PNG has no complete IEND chunk.")


def _jpeg_embedded_icc(source_bytes: bytes) -> bytes | None:
    """Reassemble bounded APP2 ICC fragments, including multi-scan JPEG headers."""
    if not source_bytes.startswith(b"\xff\xd8"):
        raise DerivativeError("INVALID_IMAGE", "JPEG start marker is missing.")
    cursor = 2
    in_scan = False
    fragments: dict[int, bytes] = {}
    expected_count: int | None = None
    profile_size = 0
    while cursor < len(source_bytes):
        if in_scan:
            marker_start = source_bytes.find(b"\xff", cursor)
            if marker_start < 0:
                break
            cursor = marker_start
        if source_bytes[cursor] != 0xFF:
            raise DerivativeError("INVALID_IMAGE", "JPEG marker stream is invalid.")
        while cursor < len(source_bytes) and source_bytes[cursor] == 0xFF:
            cursor += 1
        if cursor >= len(source_bytes):
            break
        marker = source_bytes[cursor]
        cursor += 1
        if marker == 0:
            if not in_scan:
                raise DerivativeError("INVALID_IMAGE", "JPEG escaped marker is misplaced.")
            continue
        if marker in range(0xD0, 0xD8) or marker == 0x01:
            continue
        in_scan = False
        if marker == 0xD9:
            break
        if marker == 0xD8 or cursor + 2 > len(source_bytes):
            raise DerivativeError("INVALID_IMAGE", "JPEG marker stream is invalid.")
        segment_size = int.from_bytes(source_bytes[cursor : cursor + 2], "big")
        if segment_size < 2 or cursor + segment_size > len(source_bytes):
            raise DerivativeError("INVALID_IMAGE", "JPEG segment is truncated.")
        payload = source_bytes[cursor + 2 : cursor + segment_size]
        cursor += segment_size
        if marker == 0xE2 and payload.startswith(b"ICC_PROFILE"):
            if not payload.startswith(b"ICC_PROFILE\0") or len(payload) < 14:
                raise DerivativeError("INVALID_COLOR_PROFILE", "JPEG ICC APP2 header is invalid.")
            sequence, total = payload[12], payload[13]
            if (
                total == 0
                or sequence == 0
                or sequence > total
                or (expected_count is not None and expected_count != total)
                or sequence in fragments
            ):
                raise DerivativeError("INVALID_COLOR_PROFILE", "JPEG ICC APP2 sequence is invalid.")
            expected_count = total
            fragment = payload[14:]
            profile_size += len(fragment)
            if profile_size > MAX_ICC_BYTES:
                raise DerivativeError(
                    "ICC_TOO_LARGE", "Embedded ICC profile exceeds the worker limit."
                )
            fragments[sequence] = fragment
        if marker == 0xDA:
            in_scan = True
    if not fragments:
        return None
    if expected_count is None or len(fragments) != expected_count:
        raise DerivativeError("INVALID_COLOR_PROFILE", "JPEG ICC APP2 sequence is incomplete.")
    return b"".join(fragments[index] for index in range(1, expected_count + 1))


def webp_embedded_icc(source_bytes: bytes) -> bytes | None:
    """Check RIFF ICCP bytes against the VP8X ICC-present feature flag."""
    if (
        len(source_bytes) < 12
        or source_bytes[:4] != b"RIFF"
        or source_bytes[8:12] != b"WEBP"
        or int.from_bytes(source_bytes[4:8], "little") + 8 != len(source_bytes)
    ):
        raise DerivativeError("INVALID_IMAGE", "WebP RIFF header is invalid.")
    cursor = 12
    vp8x_flags: int | None = None
    profile: bytes | None = None
    seen_image_data = False
    while cursor + 8 <= len(source_bytes):
        kind = source_bytes[cursor : cursor + 4]
        length = int.from_bytes(source_bytes[cursor + 4 : cursor + 8], "little")
        data_start = cursor + 8
        data_end = data_start + length
        next_chunk = data_end + (length & 1)
        if next_chunk > len(source_bytes):
            raise DerivativeError("INVALID_IMAGE", "WebP chunk is truncated.")
        if length & 1 and source_bytes[data_end] != 0:
            raise DerivativeError("INVALID_IMAGE", "WebP chunk padding is invalid.")
        if kind == b"VP8X":
            if cursor != 12 or vp8x_flags is not None or length != 10:
                raise DerivativeError("INVALID_IMAGE", "WebP VP8X header is invalid.")
            vp8x_flags = source_bytes[data_start]
        elif kind == b"ICCP":
            if profile is not None or seen_image_data:
                raise DerivativeError(
                    "INVALID_COLOR_PROFILE", "WebP ICCP chunk is duplicated or late."
                )
            if length > MAX_ICC_BYTES:
                raise DerivativeError(
                    "ICC_TOO_LARGE", "Embedded ICC profile exceeds the worker limit."
                )
            profile = source_bytes[data_start:data_end]
        elif kind in {b"VP8 ", b"VP8L", b"ANMF"}:
            seen_image_data = True
        cursor = next_chunk
    if cursor != len(source_bytes):
        raise DerivativeError("INVALID_IMAGE", "WebP chunk stream is incomplete.")
    if (profile is not None) != (vp8x_flags is not None and bool(vp8x_flags & 0x20)):
        raise DerivativeError("INVALID_COLOR_PROFILE", "WebP ICC flag and ICCP chunk disagree.")
    return profile


def _normalize_pixels(source_bytes: bytes) -> tuple[Image.Image, bytes | None, str]:
    container_format: str | None = None
    container_icc: bytes | None = None
    if source_bytes.startswith(PNG_SIGNATURE):
        container_format = "PNG"
        container_icc, has_non_srgb_color_chunk = png_embedded_color_metadata(source_bytes)
        if container_icc is None and has_non_srgb_color_chunk:
            raise DerivativeError(
                "UNSUPPORTED_COLOR_SPACE",
                "PNG has non-sRGB color metadata without an ICC profile.",
            )
    elif source_bytes.startswith(b"\xff\xd8"):
        container_format = "JPEG"
        container_icc = _jpeg_embedded_icc(source_bytes)
    elif source_bytes[:4] == b"RIFF" and source_bytes[8:12] == b"WEBP":
        container_format = "WEBP"
        container_icc = webp_embedded_icc(source_bytes)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(source_bytes)) as decoded:
                if decoded.format not in SUPPORTED_IMPORT_FORMATS:
                    raise DerivativeError("INVALID_IMAGE", "Import must be PNG, JPEG, or WebP.")
                if decoded.format != container_format:
                    raise DerivativeError(
                        "INVALID_IMAGE", "Import container format is inconsistent."
                    )
                if decoded.mode not in SUPPORTED_IMPORT_MODES:
                    raise DerivativeError("INVALID_IMAGE", "Imported image mode is unsupported.")
                width, height = decoded.size
                if (
                    width < 1
                    or height < 1
                    or width > MAX_IMAGE_SIDE
                    or height > MAX_IMAGE_SIDE
                    or width * height > MAX_IMAGE_PIXELS
                ):
                    raise DerivativeError(
                        "IMAGE_TOO_LARGE", "Image dimensions exceed the worker limit."
                    )
                raw_icc: object = decoded.info.get("icc_profile")
                if container_icc != raw_icc:
                    raise DerivativeError(
                        "INVALID_COLOR_PROFILE",
                        "Embedded ICC profile was not decoded consistently.",
                    )
                raw_icc = container_icc
                decoded.load()
                # Operate on the original image so its alpha and palette transparency
                # receive the same EXIF transform as the color channels.
                ImageOps.exif_transpose(decoded, in_place=True)
                if raw_icc is None:
                    if decoded.mode == "CMYK":
                        raise DerivativeError(
                            "COLOR_PROFILE_REQUIRED",
                            "CMYK import requires an embedded ICC profile.",
                        )
                    return decoded.convert("RGBA"), None, decoded.format
                if not raw_icc:
                    raise DerivativeError(
                        "INVALID_COLOR_PROFILE", "Embedded ICC profile is invalid."
                    )
                if len(raw_icc) > MAX_ICC_BYTES:
                    raise DerivativeError(
                        "ICC_TOO_LARGE", "Embedded ICC profile exceeds the worker limit."
                    )
                if (
                    len(raw_icc) < 128
                    or int.from_bytes(raw_icc[:4], "big") != len(raw_icc)
                    or raw_icc[36:40] != b"acsp"
                ):
                    raise DerivativeError(
                        "INVALID_COLOR_PROFILE", "Embedded ICC profile has invalid boundaries."
                    )

                try:
                    original_profile = ImageCms.ImageCmsProfile(io.BytesIO(raw_icc))
                    target_profile = ImageCms.ImageCmsProfile(io.BytesIO(SRGB_ICC_PROFILE))
                    if decoded.mode == "CMYK":
                        color_image = decoded.copy()
                    elif decoded.mode in {"L", "LA"}:
                        color_image = decoded.convert("L")
                    else:
                        color_image = decoded.convert("RGB")
                    converted = ImageCms.profileToProfile(
                        color_image,
                        original_profile,
                        target_profile,
                        outputMode="RGB",
                        renderingIntent=ImageCms.Intent.PERCEPTUAL,
                    )
                    if converted is None:
                        raise DerivativeError(
                            "INVALID_COLOR_PROFILE", "ICC conversion did not return an image."
                        )
                except (ImageCms.PyCMSError, OSError, TypeError, ValueError) as error:
                    raise DerivativeError(
                        "INVALID_COLOR_PROFILE", "Embedded ICC profile cannot convert to sRGB."
                    ) from error

                normalized = converted.convert("RGBA")
                if "A" in decoded.getbands():
                    normalized.putalpha(decoded.getchannel("A"))
                elif decoded.mode == "P" and "transparency" in decoded.info:
                    normalized.putalpha(decoded.convert("RGBA").getchannel("A"))
                return normalized, raw_icc, decoded.format
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
    ) as error:
        raise DerivativeError("INVALID_IMAGE", "Import is not a supported raster image.") from error


def _write_temporary_profile(profile: bytes, destination: Path) -> Path:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(profile)
            stream.flush()
            os.fsync(stream.fileno())
        return temporary
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def normalize_import(request: NormalizeImportRequest) -> NormalizeImportResult:
    """Write sRGB PNG and exact original ICC bytes to app-managed staging only."""
    source, normalized_path, profile_path = _validate_paths(request)
    source_bytes = read_snapshot(source, request.input_sha256)
    image, original_icc, source_format = _normalize_pixels(source_bytes)
    temporary: list[Path] = []
    published: list[Path] = []
    succeeded = False
    try:
        temporary.append(write_temporary_image(image, normalized_path, "PNG"))
        destinations = [normalized_path]
        if original_icc is not None:
            temporary.append(_write_temporary_profile(original_icc, profile_path))
            destinations.append(profile_path)
        for candidate, destination in zip(temporary, destinations, strict=True):
            os.link(candidate, destination, follow_symlinks=False)
            published.append(destination)
        for directory in {destination.parent for destination in destinations}:
            directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        profile_info: ProfileInfo | None = None
        if original_icc is not None:
            profile_info = {
                "byteSize": len(original_icc),
                "sha256": hashlib.sha256(original_icc).hexdigest(),
            }
        result: NormalizeImportResult = {
            "normalized": artifact_info(normalized_path, image),
            "originalIcc": profile_info,
            "sourceFormat": source_format,
        }
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "An output path already exists.") from error
    except OSError as error:
        raise DerivativeError("IMPORT_FAILED", "Normalized import could not be stored.") from error
    finally:
        for candidate in temporary:
            candidate.unlink(missing_ok=True)
        if not succeeded:
            for destination in published:
                destination.unlink(missing_ok=True)
