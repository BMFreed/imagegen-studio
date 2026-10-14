"""Private Smart Patch processing-space coherence and final world contribution.

Adapted from the pinned Invoke mask algorithm with explicit copied world KEEP,
processing-pixel coherence, retained original world edit core, and world-pixel
fade. No VAE, tensors, infill, model loading, inference, queue or Project mutation.
"""

from __future__ import annotations

import math
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from PIL import Image, ImageChops, ImageOps

from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import (
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
)
from imagegen_worker.outpaint_conditioning import (
    CoherenceMode,
    fade_binary_keep_mask,
    prepare_keep_mask_coherence,
)
from imagegen_worker.smart_patch_fade import (
    MAX_MASK_BLUR,
    SmartPatchFadeMode,
    smart_patch_edit_core,
)
from imagegen_worker.smart_patch_preparation import (
    MAX_PREPARATION_PNG_BYTES,
    MaskArtifactInfo,
    PreparationImage,
    ProcessingSize,
    decode_preparation_image,
)


@dataclass(frozen=True)
class SmartPatchCoherence:
    mode: CoherenceMode
    edge_size: int
    minimum_denoise: float


@dataclass(frozen=True)
class SmartPatchConditioningRequest:
    source: PreparationImage
    effective_mask: PreparationImage
    internal_resolution: ProcessingSize
    mode: SmartPatchFadeMode
    mask_blur: int
    coherence: SmartPatchCoherence
    staging_root: Path
    world_keep_mask_png_path: Path
    processing_keep_mask_png_path: Path
    latent_keep_mask_png_path: Path
    expanded_processing_keep_mask_png_path: Path
    expanded_world_keep_mask_png_path: Path
    final_contribution_mask_png_path: Path


class SmartPatchConditioningResult(TypedDict):
    worldKeepMask: MaskArtifactInfo
    processingKeepMask: MaskArtifactInfo
    latentKeepMask: MaskArtifactInfo
    expandedProcessingKeepMask: MaskArtifactInfo
    expandedWorldKeepMask: MaskArtifactInfo
    finalContributionMask: MaskArtifactInfo


def _validate(request: SmartPatchConditioningRequest) -> None:
    width, height = request.source.width, request.source.height
    if (
        type(width) is not int
        or type(height) is not int
        or width < 1
        or height < 1
        or type(request.effective_mask.width) is not int
        or type(request.effective_mask.height) is not int
        or (request.effective_mask.width, request.effective_mask.height) != (width, height)
    ):
        raise DerivativeError("INVALID_REQUEST", "Conditioning source/mask geometry differs.")
    if width > MAX_TARGET_SIDE or height > MAX_TARGET_SIDE or width * height > MAX_TARGET_PIXELS:
        raise DerivativeError("IMAGE_TOO_LARGE", "Conditioning world exceeds the CPU pixel limit.")
    size = request.internal_resolution
    if (
        type(size["width"]) is not int
        or type(size["height"]) is not int
        or size["width"] < 8
        or size["height"] < 8
        or size["width"] % 8
        or size["height"] % 8
    ):
        raise DerivativeError("INVALID_REQUEST", "Conditioning requires the processing /8 grid.")
    if (
        size["width"] > MAX_TARGET_SIDE
        or size["height"] > MAX_TARGET_SIDE
        or size["width"] * size["height"] > MAX_TARGET_PIXELS
    ):
        raise DerivativeError("IMAGE_TOO_LARGE", "Conditioning processing exceeds the pixel limit.")
    profile = request.coherence
    if (
        profile.mode not in ("Gaussian Blur", "Box Blur", "Staged")
        or type(profile.edge_size) is not int
        or not 0 <= profile.edge_size <= 1024
        or type(profile.minimum_denoise) not in (int, float)
        or not 0 <= profile.minimum_denoise <= 1
        or not math.isfinite(profile.minimum_denoise)
        or type(request.mask_blur) is not int
        or not 0 <= request.mask_blur <= MAX_MASK_BLUR
    ):
        raise DerivativeError("INVALID_REQUEST", "Conditioning profile or world blur is invalid.")


def _paths(request: SmartPatchConditioningRequest) -> tuple[Path, ...]:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    source = canonical_absolute_path(request.source.path, label="World source input")
    effective = canonical_absolute_path(request.effective_mask.path, label="Effective mask input")
    destinations = tuple(
        canonical_absolute_path(candidate, label="Conditioning output")
        for candidate in (
            request.world_keep_mask_png_path,
            request.processing_keep_mask_png_path,
            request.latent_keep_mask_png_path,
            request.expanded_processing_keep_mask_png_path,
            request.expanded_world_keep_mask_png_path,
            request.final_contribution_mask_png_path,
        )
    )
    if source == effective or len(set(destinations)) != 6:
        raise DerivativeError("INVALID_PATH", "Conditioning paths must be distinct.")
    for destination in destinations:
        if destination in (source, effective):
            raise DerivativeError("INVALID_PATH", "Conditioning input/output must be distinct.")
        if destination.suffix.lower() != ".png" or root not in destination.parents:
            raise DerivativeError("INVALID_PATH", "Conditioning output must be a PNG in staging.")
        parent = canonical_absolute_path(destination.parent, label="Output directory")
        if not parent.is_dir() or os.path.lexists(destination):
            raise DerivativeError("OUTPUT_UNAVAILABLE", "Conditioning output is unavailable.")
    return destinations


def _write_plane(coverage: Image.Image, destination: Path) -> Path:
    image = Image.new("RGBA", coverage.size, (255, 255, 255, 255))
    image.putalpha(coverage)
    descriptor, name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            image.save(stream, format="PNG")
            stream.flush()
            os.fsync(stream.fileno())
        return temporary
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def _publish(
    destinations: tuple[Path, ...], planes: tuple[Image.Image, ...]
) -> SmartPatchConditioningResult:
    temporary: list[Path] = []
    published: list[Path] = []
    succeeded = False
    try:
        for destination, plane in zip(destinations, planes, strict=True):
            temporary.append(_write_plane(plane, destination))
        for candidate, destination in zip(temporary, destinations, strict=True):
            os.link(candidate, destination, follow_symlinks=False)
            published.append(destination)
        for directory in {destination.parent for destination in destinations}:
            descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        metadata: list[MaskArtifactInfo] = []
        for destination, plane in zip(destinations, planes, strict=True):
            info = artifact_info(destination, plane)
            if info["byteSize"] > MAX_PREPARATION_PNG_BYTES:
                raise DerivativeError("IMAGE_TOO_LARGE", "Conditioning PNG exceeds the byte limit.")
            metadata.append(
                {
                    "byteSize": info["byteSize"],
                    "width": info["width"],
                    "height": info["height"],
                    "sha256": info["sha256"],
                }
            )
        result: SmartPatchConditioningResult = {
            "worldKeepMask": metadata[0],
            "processingKeepMask": metadata[1],
            "latentKeepMask": metadata[2],
            "expandedProcessingKeepMask": metadata[3],
            "expandedWorldKeepMask": metadata[4],
            "finalContributionMask": metadata[5],
        }
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError(
            "OUTPUT_UNAVAILABLE", "A conditioning output already exists."
        ) from error
    except OSError as error:
        raise DerivativeError("DERIVATIVE_FAILED", "Conditioning could not be stored.") from error
    finally:
        for candidate in temporary:
            candidate.unlink(missing_ok=True)
        if not succeeded:
            for destination in published:
                destination.unlink(missing_ok=True)


def condition_smart_patch(request: SmartPatchConditioningRequest) -> SmartPatchConditioningResult:
    """Publish six private numeric planes with explicit coordinates and polarity."""
    _validate(request)
    destinations = _paths(request)
    source = decode_preparation_image(request.source, numeric_mask=False)
    effective = decode_preparation_image(
        request.effective_mask, numeric_mask=True, require_tight_mask=False
    )
    core_keep = ImageOps.invert(smart_patch_edit_core(source, effective, request.mode))
    if request.mode in ("txt2img", "img2img"):
        world_keep = Image.new("L", source.size)
    else:
        world_keep = ImageOps.invert(effective.getchannel("A"))
        if request.mode == "outpaint":
            world_keep = ImageChops.multiply(world_keep, source.getchannel("A"))
    size = request.internal_resolution
    processing_size = (size["width"], size["height"])
    processing_keep = (
        world_keep.copy()
        if world_keep.size == processing_size
        else world_keep.resize(processing_size, resample=Image.Resampling.BICUBIC)
    )
    latent_keep, expanded_processing = prepare_keep_mask_coherence(
        processing_keep,
        coherence_mode=request.coherence.mode,
        edge_radius=request.coherence.edge_size,
        minimum_denoise=request.coherence.minimum_denoise,
    )
    expanded_world = expanded_processing.resize(source.size, resample=Image.Resampling.NEAREST)
    expanded_world = ImageChops.multiply(expanded_world, core_keep)
    final = ImageOps.invert(fade_binary_keep_mask(expanded_world, fade_radius=request.mask_blur))
    return _publish(
        destinations,
        (world_keep, processing_keep, latent_keep, expanded_processing, expanded_world, final),
    )
