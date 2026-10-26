"""Full-frame thumbnails of exact canonical imports, without rewriting their source."""

from __future__ import annotations

import io
import os
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from PIL import Image, UnidentifiedImageError

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
from imagegen_worker.imports import png_embedded_color_metadata
from imagegen_worker.resource_previews import (
    MAX_RESOURCE_THUMBNAIL_BYTES,
    MAX_RESOURCE_THUMBNAIL_SIDE,
)

# Match Main's verified normalized-import envelope, not the raw-import/preview limit.
MAX_NORMALIZED_BYTES = 512 * 1024 * 1024


@dataclass(frozen=True)
class ImportThumbnailRequest:
    input_path: Path
    input_sha256: str
    input_color_space: Literal["srgb"]
    staging_root: Path
    thumbnail_webp_path: Path


def _validate_paths(request: ImportThumbnailRequest) -> tuple[Path, Path]:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    source = canonical_absolute_path(request.input_path, label="Input")
    output = canonical_absolute_path(request.thumbnail_webp_path, label="Thumbnail output")
    if source == output or output.suffix.lower() != ".webp" or root not in output.parents:
        raise DerivativeError("INVALID_PATH", "Thumbnail must be a distinct staged WebP file.")
    parent = canonical_absolute_path(output.parent, label="Output directory")
    if not parent.is_dir() or os.path.lexists(output):
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Thumbnail output is unavailable.")
    return source, output


def _decode_canonical_png(snapshot: bytes) -> Image.Image:
    profile, conflicting = png_embedded_color_metadata(snapshot)
    if profile != SRGB_ICC_PROFILE or conflicting:
        raise DerivativeError(
            "INPUT_COLOR_PROFILE", "Canonical import must carry only the pinned RGB sRGB profile."
        )
    if not snapshot.endswith(b"\x00\x00\x00\x00IEND\xaeB\x60\x82"):
        raise DerivativeError("INVALID_IMAGE", "Canonical import PNG has an invalid trailer.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(snapshot)) as decoded:
                if (
                    decoded.format != "PNG"
                    or decoded.mode not in ("RGB", "RGBA")
                    or snapshot[24] != 8
                    or getattr(decoded, "n_frames", 1) != 1
                    or decoded.info.get("icc_profile") != SRGB_ICC_PROFILE
                ):
                    raise DerivativeError("INVALID_IMAGE", "Canonical import must be RGB(A)8 PNG.")
                width, height = decoded.size
                if (
                    width < 1
                    or height < 1
                    or width > MAX_IMAGE_SIDE
                    or height > MAX_IMAGE_SIDE
                    or width * height > MAX_IMAGE_PIXELS
                ):
                    raise DerivativeError(
                        "IMAGE_TOO_LARGE", "Import exceeds the image pixel limit."
                    )
                # Check PNG checksums before decoding the same immutable snapshot's pixels.
                decoded.verify()
            with Image.open(io.BytesIO(snapshot)) as decoded:
                decoded.load()
                # The source is already canonical. Do not run ICC conversion or EXIF transforms.
                return decoded.convert("RGBA")
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        SyntaxError,
        ValueError,
    ) as error:
        raise DerivativeError(
            "INVALID_IMAGE", "Canonical import PNG could not be decoded."
        ) from error


def create_import_thumbnail(request: ImportThumbnailRequest) -> ArtifactInfo:
    """Publish one bounded lossless WebP; transparent padding and source bytes are retained."""
    if request.input_color_space != "srgb":
        raise DerivativeError("INVALID_REQUEST", "Canonical import color space must be sRGB.")
    source, output = _validate_paths(request)
    snapshot = read_snapshot(source, request.input_sha256, max_bytes=MAX_NORMALIZED_BYTES)
    image = _decode_canonical_png(snapshot)
    temporary: Path | None = None
    published_identity: tuple[int, int] | None = None
    succeeded = False
    try:
        image.thumbnail(
            (MAX_RESOURCE_THUMBNAIL_SIDE, MAX_RESOURCE_THUMBNAIL_SIDE), Image.Resampling.LANCZOS
        )
        temporary = write_temporary_image(image, output, "WEBP")
        entry = temporary.stat()
        if not 1 <= entry.st_size <= MAX_RESOURCE_THUMBNAIL_BYTES:
            raise DerivativeError("IMAGE_TOO_LARGE", "Import thumbnail exceeds its byte limit.")
        os.link(temporary, output, follow_symlinks=False)
        published_identity = (entry.st_dev, entry.st_ino)
        descriptor = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        result = artifact_info(output, image)
        if not 1 <= result["byteSize"] <= MAX_RESOURCE_THUMBNAIL_BYTES:
            raise DerivativeError("IMAGE_TOO_LARGE", "Import thumbnail exceeds its byte limit.")
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Import thumbnail already exists.") from error
    except OSError as error:
        raise DerivativeError(
            "DERIVATIVE_FAILED", "Import thumbnail could not be stored."
        ) from error
    finally:
        image.close()
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        if published_identity is not None and not succeeded:
            try:
                entry = output.lstat()
            except FileNotFoundError:
                pass
            else:
                if (entry.st_dev, entry.st_ino) == published_identity:
                    output.unlink(missing_ok=True)
