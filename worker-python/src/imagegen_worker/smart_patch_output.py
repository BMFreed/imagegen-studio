"""Private Smart Patch processing RGB to world-grid RGBA contribution.

The supplied contribution is already final GENERATE alpha in project pixels.
Only RGB is resized; no source pasteback, mask reprocessing, inference, queue or
Project mutation belongs to this CPU boundary.
"""

from __future__ import annotations

import os
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from PIL import Image

from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    ArtifactInfo,
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
    write_temporary_image,
)
from imagegen_worker.smart_patch_preparation import (
    MAX_PREPARATION_PNG_BYTES,
    PreparationImage,
    decode_preparation_image,
    decode_preparation_rgb,
)


@dataclass(frozen=True)
class SmartPatchOutputRequest:
    image: PreparationImage
    contribution_mask: PreparationImage
    staging_root: Path
    output_png_path: Path


class SmartPatchOutputResult(TypedDict):
    output: ArtifactInfo


def _dimensions(request: SmartPatchOutputRequest) -> None:
    for image in (request.image, request.contribution_mask):
        if (
            type(image.width) is not int
            or type(image.height) is not int
            or image.width < 1
            or image.height < 1
        ):
            raise DerivativeError(
                "INVALID_REQUEST", "Smart Patch output dimensions must be integers."
            )
        if (
            image.width > MAX_TARGET_SIDE
            or image.height > MAX_TARGET_SIDE
            or image.width * image.height > MAX_TARGET_PIXELS
        ):
            raise DerivativeError(
                "IMAGE_TOO_LARGE", "Smart Patch output exceeds the CPU pixel limit."
            )
    image = request.image
    if image.width < 8 or image.height < 8 or image.width % 8 or image.height % 8:
        raise DerivativeError("INVALID_REQUEST", "Smart Patch RGB requires the processing /8 grid.")


def _paths(request: SmartPatchOutputRequest) -> Path:
    root = canonical_absolute_path(request.staging_root, label="Smart Patch output staging root")
    try:
        root_entry = root.stat()
    except OSError as error:
        raise DerivativeError(
            "INVALID_PATH", "Smart Patch output staging root is unavailable."
        ) from error
    if (
        not stat.S_ISDIR(root_entry.st_mode)
        or root_entry.st_uid != os.getuid()
        or stat.S_IMODE(root_entry.st_mode) != 0o700
    ):
        raise DerivativeError(
            "INVALID_PATH", "Smart Patch output staging root must be private and owned."
        )
    inputs = (request.image.path, request.contribution_mask.path)
    paths = (*inputs, request.output_png_path)
    if len(set(paths)) != len(paths):
        raise DerivativeError("INVALID_PATH", "Smart Patch output paths must be distinct.")
    for candidate in paths:
        captured = canonical_absolute_path(candidate, label="Smart Patch output image")
        if captured.parent != root or captured.suffix != ".png":
            raise DerivativeError(
                "INVALID_PATH", "Smart Patch output images must be direct staging PNGs."
            )
    identities: set[tuple[int, int]] = set()
    for source in inputs:
        try:
            entry = source.lstat()
        except OSError as error:
            raise DerivativeError(
                "INPUT_UNAVAILABLE", "Smart Patch output input is unavailable."
            ) from error
        if not stat.S_ISREG(entry.st_mode) or entry.st_uid != os.getuid():
            raise DerivativeError(
                "INPUT_UNAVAILABLE", "Smart Patch output inputs must be owned regular files."
            )
        identity = (entry.st_dev, entry.st_ino)
        if identity in identities:
            raise DerivativeError("INVALID_PATH", "Smart Patch output inputs must not alias.")
        identities.add(identity)
    if os.path.lexists(request.output_png_path):
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Smart Patch output already exists.")
    return request.output_png_path


def _same_publication(destination: Path, identity: tuple[int, int]) -> bool:
    try:
        entry = destination.lstat()
    except FileNotFoundError:
        return False
    return stat.S_ISREG(entry.st_mode) and (entry.st_dev, entry.st_ino) == identity


def _publish(destination: Path, image: Image.Image) -> SmartPatchOutputResult:
    temporary: Path | None = None
    publication_identity: tuple[int, int] | None = None
    published = False
    succeeded = False
    try:
        temporary = write_temporary_image(image, destination, "PNG")
        entry = temporary.stat()
        publication_identity = (entry.st_dev, entry.st_ino)
        os.link(temporary, destination, follow_symlinks=False)
        published = True
        descriptor = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        if not _same_publication(destination, publication_identity):
            raise DerivativeError("OUTPUT_UNAVAILABLE", "Smart Patch output was replaced.")
        metadata = artifact_info(destination, image)
        if metadata["byteSize"] > MAX_PREPARATION_PNG_BYTES:
            raise DerivativeError(
                "IMAGE_TOO_LARGE", "Smart Patch output exceeds the PNG byte limit."
            )
        if not _same_publication(destination, publication_identity):
            raise DerivativeError("OUTPUT_UNAVAILABLE", "Smart Patch output was replaced.")
        succeeded = True
        return {"output": metadata}
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Smart Patch output already exists.") from error
    except OSError as error:
        raise DerivativeError(
            "DERIVATIVE_FAILED", "Smart Patch output could not be stored."
        ) from error
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        if (
            published
            and not succeeded
            and publication_identity is not None
            and _same_publication(destination, publication_identity)
        ):
            destination.unlink(missing_ok=True)


def compose_smart_patch_output(request: SmartPatchOutputRequest) -> SmartPatchOutputResult:
    """Resize strict RGB first and attach exact final world alpha without pasteback."""
    _dimensions(request)
    destination = _paths(request)
    image = decode_preparation_rgb(request.image)
    contribution = decode_preparation_image(
        request.contribution_mask, numeric_mask=True, require_tight_mask=False
    ).getchannel("A")
    # Invoke's img_resize defaults to BICUBIC, followed by apply_mask_to_image.
    # Our final alpha is already in world pixels and must not be resized again.
    resized = (
        image.copy()
        if image.size == contribution.size
        else image.resize(contribution.size, resample=Image.Resampling.BICUBIC)
    )
    result = resized.convert("RGBA")
    result.putalpha(contribution)
    result.info["icc_profile"] = SRGB_ICC_PROFILE
    return _publish(destination, result)
