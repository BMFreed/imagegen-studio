"""Bounded sRGB previews of an exact source image; no model or inference imports."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from PIL import Image

from imagegen_worker.derivatives import (
    ArtifactInfo,
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
    read_snapshot,
    write_temporary_image,
)
from imagegen_worker.imports import normalize_image_pixels

MAX_RESOURCE_SOURCE_BYTES = 1_000_000
MAX_RESOURCE_PREVIEW_SIDE = 512
MAX_RESOURCE_THUMBNAIL_SIDE = 128
MAX_RESOURCE_PREVIEW_BYTES = 1_000_000
MAX_RESOURCE_THUMBNAIL_BYTES = 128_000
MIN_RESOURCE_PREVIEW_SIDE = 32


@dataclass(frozen=True)
class ResourcePreviewRequest:
    input_path: Path
    input_sha256: str
    staging_root: Path
    preview_webp_path: Path
    thumbnail_webp_path: Path
    preview_max_side: int
    thumbnail_max_side: int


class ResourcePreviewResult(TypedDict):
    preview: ArtifactInfo
    thumbnail: ArtifactInfo


def _validate_paths(request: ResourcePreviewRequest) -> tuple[Path, Path, Path]:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    source = canonical_absolute_path(request.input_path, label="Input")
    preview = canonical_absolute_path(request.preview_webp_path, label="Preview output")
    thumbnail = canonical_absolute_path(request.thumbnail_webp_path, label="Thumbnail output")
    if source in {preview, thumbnail} or preview == thumbnail:
        raise DerivativeError("INVALID_PATH", "Input and output paths must be distinct.")
    for destination in (preview, thumbnail):
        if destination.suffix.lower() != ".webp" or root not in destination.parents:
            raise DerivativeError("INVALID_PATH", "Resource preview must be a staged WebP file.")
        parent = canonical_absolute_path(destination.parent, label="Output directory")
        if not parent.is_dir() or os.path.lexists(destination):
            raise DerivativeError(
                "OUTPUT_UNAVAILABLE", "Output directory is missing or output already exists."
            )
    return source, preview, thumbnail


def create_resource_preview(request: ResourcePreviewRequest) -> ResourcePreviewResult:
    """Normalize once and publish two aspect-preserving images without upscaling or cropping."""
    for side, maximum in (
        (request.preview_max_side, MAX_RESOURCE_PREVIEW_SIDE),
        (request.thumbnail_max_side, MAX_RESOURCE_THUMBNAIL_SIDE),
    ):
        if type(side) is not int or not MIN_RESOURCE_PREVIEW_SIDE <= side <= maximum:
            raise DerivativeError("INVALID_REQUEST", "Resource preview side is outside its range.")
    source, preview_path, thumbnail_path = _validate_paths(request)
    snapshot = read_snapshot(source, request.input_sha256, max_bytes=MAX_RESOURCE_SOURCE_BYTES)
    image, _original_icc, _source_format = normalize_image_pixels(snapshot)
    preview = image.copy()
    preview.thumbnail(
        (request.preview_max_side, request.preview_max_side), Image.Resampling.LANCZOS
    )
    thumbnail = image.copy()
    thumbnail.thumbnail(
        (request.thumbnail_max_side, request.thumbnail_max_side), Image.Resampling.LANCZOS
    )
    image.close()
    temporary: list[Path] = []
    published: list[Path] = []
    succeeded = False
    try:
        temporary.append(write_temporary_image(preview, preview_path, "WEBP"))
        temporary.append(write_temporary_image(thumbnail, thumbnail_path, "WEBP"))
        for candidate, maximum in zip(
            temporary,
            (MAX_RESOURCE_PREVIEW_BYTES, MAX_RESOURCE_THUMBNAIL_BYTES),
            strict=True,
        ):
            if not 1 <= candidate.stat().st_size <= maximum:
                raise DerivativeError("IMAGE_TOO_LARGE", "Resource preview exceeds its byte limit.")
        for candidate, destination in zip(temporary, (preview_path, thumbnail_path), strict=True):
            os.link(candidate, destination, follow_symlinks=False)
            published.append(destination)
        for directory in {preview_path.parent, thumbnail_path.parent}:
            descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        result: ResourcePreviewResult = {
            "preview": artifact_info(preview_path, preview),
            "thumbnail": artifact_info(thumbnail_path, thumbnail),
        }
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "A resource preview already exists.") from error
    except OSError as error:
        raise DerivativeError(
            "DERIVATIVE_FAILED", "Resource preview could not be stored."
        ) from error
    finally:
        preview.close()
        thumbnail.close()
        for candidate in temporary:
            candidate.unlink(missing_ok=True)
        if not succeeded:
            for destination in published:
                destination.unlink(missing_ok=True)
