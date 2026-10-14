"""Private project-space Smart Patch contribution core and pinned external fade.

Authored and processing masks remain numeric soft generation inputs. Contribution
has a binary/full core, an optional external fade, and no coherence, latent/ML
conditioning, image blend, publication into a Project, or internal-scale radius.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict, cast

from PIL import Image, ImageChops, ImageOps

from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import (
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
)
from imagegen_worker.outpaint_conditioning import fade_binary_keep_mask
from imagegen_worker.smart_patch_preparation import (
    MAX_PREPARATION_PNG_BYTES,
    MaskArtifactInfo,
    PreparationImage,
    decode_preparation_image,
)

SmartPatchFadeMode = Literal["txt2img", "img2img", "inpaint", "outpaint"]
MAX_MASK_BLUR = 512


@dataclass(frozen=True)
class SmartPatchFadeRequest:
    source: PreparationImage
    effective_mask: PreparationImage
    mode: SmartPatchFadeMode
    mask_blur: int
    staging_root: Path
    contribution_mask_png_path: Path


class SmartPatchFadeResult(TypedDict):
    contributionMask: MaskArtifactInfo


def _destination(request: SmartPatchFadeRequest) -> Path:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    source = canonical_absolute_path(request.source.path, label="Source input")
    effective = canonical_absolute_path(request.effective_mask.path, label="Effective mask input")
    destination = canonical_absolute_path(
        request.contribution_mask_png_path, label="Contribution output"
    )
    if source == effective or destination in (source, effective):
        raise DerivativeError("INVALID_PATH", "Contribution inputs and output must be distinct.")
    if destination.suffix.lower() != ".png" or root not in destination.parents:
        raise DerivativeError("INVALID_PATH", "Contribution must be a PNG inside staging.")
    parent = canonical_absolute_path(destination.parent, label="Output directory")
    if not parent.is_dir() or os.path.lexists(destination):
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Contribution output is unavailable.")
    return destination


def _validate_geometry(request: SmartPatchFadeRequest) -> None:
    if type(request.mask_blur) is not int or not 0 <= request.mask_blur <= MAX_MASK_BLUR:
        raise DerivativeError(
            "INVALID_REQUEST", "Smart Patch blur must be an integer from 0 to 512."
        )
    width, height = request.source.width, request.source.height
    if type(width) is not int or type(height) is not int or width < 1 or height < 1:
        raise DerivativeError("INVALID_REQUEST", "Contribution dimensions must be integers.")
    if width > MAX_TARGET_SIDE or height > MAX_TARGET_SIDE or width * height > MAX_TARGET_PIXELS:
        raise DerivativeError("IMAGE_TOO_LARGE", "Contribution exceeds the CPU pixel limit.")
    if (
        type(request.effective_mask.width) is not int
        or type(request.effective_mask.height) is not int
        or (request.effective_mask.width, request.effective_mask.height) != (width, height)
    ):
        raise DerivativeError("INVALID_REQUEST", "Contribution source and mask dimensions differ.")


def smart_patch_edit_core(
    source: Image.Image, effective: Image.Image, mode: SmartPatchFadeMode
) -> Image.Image:
    """Validate frozen world mode and return its binary/full numeric edit core."""
    source_alpha = source.getchannel("A")
    coverage = effective.getchannel("A")
    minimum, maximum = cast(tuple[int, int], source_alpha.getextrema())
    has_coverage = cast(tuple[int, int], coverage.getextrema())[1] > 0
    # Main chooses mode. These actual pixel preconditions reject a mismatched frozen payload.
    valid = (
        (mode == "txt2img" and maximum == 0)
        or (mode == "outpaint" and maximum > 0 and minimum < 255)
        or (mode == "img2img" and minimum == 255 and not has_coverage)
        or (mode == "inpaint" and minimum == 255 and has_coverage)
    )
    if not valid:
        raise DerivativeError("INVALID_REQUEST", "Smart Patch mode differs from its world pixels.")
    if mode in ("txt2img", "img2img"):
        return Image.new("L", source.size, 255)
    authored = coverage.point([0] + [255] * 255)
    if mode == "outpaint":
        holes = source_alpha.point([255] * 255 + [0])
        return ImageChops.lighter(authored, holes)
    return authored


def _publish(destination: Path, coverage: Image.Image) -> SmartPatchFadeResult:
    image = Image.new("RGBA", coverage.size, (255, 255, 255, 255))
    image.putalpha(coverage)
    descriptor, name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary = Path(name)
    published = False
    succeeded = False
    try:
        with os.fdopen(descriptor, "wb") as stream:
            image.save(stream, format="PNG")
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, destination, follow_symlinks=False)
        published = True
        directory = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        metadata = artifact_info(destination, image)
        if metadata["byteSize"] > MAX_PREPARATION_PNG_BYTES:
            raise DerivativeError("IMAGE_TOO_LARGE", "Contribution exceeds the PNG byte limit.")
        result: SmartPatchFadeResult = {
            "contributionMask": {
                "byteSize": metadata["byteSize"],
                "height": metadata["height"],
                "sha256": metadata["sha256"],
                "width": metadata["width"],
            }
        }
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError(
            "OUTPUT_UNAVAILABLE", "Contribution output already exists."
        ) from error
    except OSError as error:
        raise DerivativeError("DERIVATIVE_FAILED", "Contribution could not be stored.") from error
    finally:
        temporary.unlink(missing_ok=True)
        if published and not succeeded:
            destination.unlink(missing_ok=True)


def fade_smart_patch(request: SmartPatchFadeRequest) -> SmartPatchFadeResult:
    """Create one numeric world contribution without modifying source/mask pixels."""
    _validate_geometry(request)
    destination = _destination(request)
    source = decode_preparation_image(request.source, numeric_mask=False)
    effective = decode_preparation_image(
        request.effective_mask, numeric_mask=True, require_tight_mask=False
    )
    core = smart_patch_edit_core(source, effective, request.mode)
    keep = ImageOps.invert(core)
    faded = fade_binary_keep_mask(keep, fade_radius=request.mask_blur)
    return _publish(destination, ImageOps.invert(faded))
