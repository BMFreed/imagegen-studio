"""Build project previews from a frozen, caller-owned PNG composite."""

from __future__ import annotations

import hashlib
import io
import os
import stat
import tempfile
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict

from PIL import Image, UnidentifiedImageError

MAX_INPUT_BYTES = 256 * 1024 * 1024
MAX_IMAGE_SIDE = 16_384
MAX_IMAGE_PIXELS = 64_000_000
MIN_THUMBNAIL_SIDE = 32
MAX_THUMBNAIL_SIDE = 1_024
PINNED_SRGB_ICC_SHA256 = "113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1"


def _srgb_profile() -> bytes:
    # Do not generate this at runtime: lcms writes creation-time bytes, making its digest vary.
    profile = Path(__file__).with_name("srgb.icc").read_bytes()
    if hashlib.sha256(profile).hexdigest() != PINNED_SRGB_ICC_SHA256:
        raise RuntimeError("The bundled sRGB profile is missing or has changed.")
    return profile


SRGB_ICC_PROFILE = _srgb_profile()


class DerivativeError(Exception):
    """A safe, typed failure to report over the worker protocol."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class DerivativeRequest:
    input_path: Path
    input_sha256: str
    input_color_space: Literal["srgb"]
    staging_root: Path
    merged_png_path: Path
    thumbnail_webp_path: Path
    thumbnail_max_side: int


class ArtifactInfo(TypedDict):
    byteSize: int
    colorSpace: Literal["srgb"]
    height: int
    sha256: str
    width: int


class DerivativeResult(TypedDict):
    merged: ArtifactInfo
    thumbnail: ArtifactInfo


def canonical_absolute_path(value: Path, *, label: str) -> Path:
    if not value.is_absolute():
        raise DerivativeError("INVALID_PATH", f"{label} must be an absolute path.")
    absolute = Path(os.path.abspath(value))
    if absolute != value or Path(os.path.realpath(value)) != absolute:
        raise DerivativeError("INVALID_PATH", f"{label} must not contain symlinks or traversal.")
    return absolute


def _validate_paths(request: DerivativeRequest) -> tuple[Path, Path, Path]:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    source = canonical_absolute_path(request.input_path, label="Input")
    merged = canonical_absolute_path(request.merged_png_path, label="Merged output")
    thumbnail = canonical_absolute_path(request.thumbnail_webp_path, label="Thumbnail output")
    if source in {merged, thumbnail} or merged == thumbnail:
        raise DerivativeError("INVALID_PATH", "Input and output paths must be distinct.")
    for destination, expected_suffix in ((merged, ".png"), (thumbnail, ".webp")):
        if destination.suffix.lower() != expected_suffix or root not in destination.parents:
            raise DerivativeError(
                "INVALID_PATH", "Output must be inside staging with its expected format."
            )
        parent = canonical_absolute_path(destination.parent, label="Output directory")
        if not parent.is_dir() or os.path.lexists(destination):
            raise DerivativeError(
                "OUTPUT_UNAVAILABLE", "Output directory is missing or output already exists."
            )
    return source, merged, thumbnail


def read_snapshot(source: Path, expected_sha256: str, *, max_bytes: int = MAX_INPUT_BYTES) -> bytes:
    try:
        descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except OSError as error:
        raise DerivativeError("INPUT_UNAVAILABLE", "Input image could not be opened.") from error
    with os.fdopen(descriptor, "rb") as stream:
        entry = os.fstat(stream.fileno())
        if not stat.S_ISREG(entry.st_mode):
            raise DerivativeError("INPUT_UNAVAILABLE", "Input must be a regular file.")
        if entry.st_size > max_bytes:
            raise DerivativeError("INPUT_TOO_LARGE", "Input image exceeds the worker byte limit.")
        chunks: list[bytes] = []
        size = 0
        digest = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                raise DerivativeError(
                    "INPUT_TOO_LARGE", "Input image exceeds the worker byte limit."
                )
            chunks.append(chunk)
            digest.update(chunk)
    if digest.hexdigest() != expected_sha256:
        raise DerivativeError("INPUT_HASH_MISMATCH", "Input image changed after it was frozen.")
    return b"".join(chunks)


def _decode_png(source_bytes: bytes) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(source_bytes)) as decoded:
                if decoded.format != "PNG":
                    raise DerivativeError("INVALID_IMAGE", "Input must be a PNG composite.")
                if "icc_profile" in decoded.info:
                    raise DerivativeError(
                        "INPUT_COLOR_PROFILE",
                        "Composite input must be pre-normalized sRGB without an ICC profile.",
                    )
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
                decoded.load()
                return decoded.convert("RGBA")
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
    ) as error:
        raise DerivativeError("INVALID_IMAGE", "Input is not a supported PNG image.") from error


def write_temporary_image(
    image: Image.Image,
    destination: Path,
    image_format: Literal["PNG", "WEBP"],
    *,
    webp_quality: int | None = None,
) -> Path:
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            if image_format == "WEBP":
                if webp_quality is None:
                    image.save(
                        stream,
                        format="WEBP",
                        lossless=True,
                        exact=True,
                        icc_profile=SRGB_ICC_PROFILE,
                    )
                else:
                    image.save(
                        stream,
                        format="WEBP",
                        quality=webp_quality,
                        exact=True,
                        icc_profile=SRGB_ICC_PROFILE,
                    )
            else:
                image.save(stream, format="PNG", icc_profile=SRGB_ICC_PROFILE)
            stream.flush()
            os.fsync(stream.fileno())
        return temporary
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def artifact_info(destination: Path, image: Image.Image) -> ArtifactInfo:
    digest = hashlib.sha256()
    size = 0
    with destination.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            digest.update(chunk)
    return {
        "byteSize": size,
        "colorSpace": "srgb",
        "height": image.height,
        "sha256": digest.hexdigest(),
        "width": image.width,
    }


def create_derivatives(request: DerivativeRequest) -> DerivativeResult:
    """Create both files without replacing destinations or touching the project package."""
    if request.input_color_space != "srgb":
        raise DerivativeError("INVALID_REQUEST", "Composite input color space must be sRGB.")
    if not MIN_THUMBNAIL_SIDE <= request.thumbnail_max_side <= MAX_THUMBNAIL_SIDE:
        raise DerivativeError("INVALID_REQUEST", "Thumbnail side is outside the supported range.")
    source, merged, thumbnail = _validate_paths(request)
    source_bytes = read_snapshot(source, request.input_sha256)
    image = _decode_png(source_bytes)
    thumb_image = image.copy()
    thumb_image.thumbnail(
        (request.thumbnail_max_side, request.thumbnail_max_side), Image.Resampling.LANCZOS
    )
    temporary: list[Path] = []
    published: list[Path] = []
    succeeded = False
    try:
        temporary.append(write_temporary_image(image, merged, "PNG"))
        temporary.append(write_temporary_image(thumb_image, thumbnail, "WEBP"))
        for candidate, destination in zip(temporary, (merged, thumbnail), strict=True):
            os.link(candidate, destination, follow_symlinks=False)
            published.append(destination)
        for directory in {merged.parent, thumbnail.parent}:
            directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        result: DerivativeResult = {
            "merged": artifact_info(merged, image),
            "thumbnail": artifact_info(thumbnail, thumb_image),
        }
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "An output path already exists.") from error
    except OSError as error:
        raise DerivativeError(
            "DERIVATIVE_FAILED", "Image derivative could not be stored."
        ) from error
    finally:
        for candidate in temporary:
            candidate.unlink(missing_ok=True)
        # No output is usable until both files and their metadata are complete.
        if not succeeded:
            for destination in published:
                destination.unlink(missing_ok=True)
