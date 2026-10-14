"""Bounded CPU preparation of frozen Smart Patch source and numeric mask planes.

World clipping preserves authored alpha8 exactly. Processing-size resampling uses
the pinned Invoke img_resize default, BICUBIC, without choosing inference mode,
inverting coverage, applying coherence/fade, or loading an ML runtime.
"""

from __future__ import annotations

import io
import os
import tempfile
import warnings
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from PIL import Image, UnidentifiedImageError

from imagegen_worker.compositor import (
    MAX_TARGET_PIXELS,
    MAX_TARGET_SIDE,
    MAX_WORLD_COORDINATE,
    PreviewRect,
)
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    ArtifactInfo,
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
    read_snapshot,
    write_temporary_image,
)
from imagegen_worker.imports import png_embedded_color_metadata

MAX_PREPARATION_PNG_BYTES = 32 * 1024 * 1024
MAX_OWNED_MASK_SIDE = 4096
MAX_OWNED_MASK_PIXELS = 4_000_000
MAX_OWNED_MASK_IDAT_CHUNKS = 256
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class ProcessingSize(TypedDict):
    width: int
    height: int


class MaskArtifactInfo(TypedDict):
    """Numeric generate coverage, deliberately without an image color-space claim."""

    byteSize: int
    height: int
    sha256: str
    width: int


@dataclass(frozen=True)
class PreparationImage:
    path: Path
    sha256: str
    byte_size: int
    width: int
    height: int


@dataclass(frozen=True)
class PreparationMask(PreparationImage):
    bounds: PreviewRect


@dataclass(frozen=True)
class SmartPatchPreparationRequest:
    bbox: PreviewRect
    internal_resolution: ProcessingSize
    source: PreparationImage
    mask: PreparationMask | None
    staging_root: Path
    world_mask_png_path: Path
    processing_source_png_path: Path
    processing_mask_png_path: Path


class SmartPatchPreparationResult(TypedDict):
    worldMask: MaskArtifactInfo
    processingSource: ArtifactInfo
    processingMask: MaskArtifactInfo


def _dimensions(width: int, height: int, *, owned_mask: bool = False) -> None:
    side = MAX_OWNED_MASK_SIDE if owned_mask else MAX_TARGET_SIDE
    pixels = MAX_OWNED_MASK_PIXELS if owned_mask else MAX_TARGET_PIXELS
    if type(width) is not int or type(height) is not int or width < 1 or height < 1:
        raise DerivativeError("INVALID_REQUEST", "Preparation dimensions must be integers.")
    if width > side or height > side or width * height > pixels:
        raise DerivativeError("IMAGE_TOO_LARGE", "Preparation exceeds the CPU pixel limit.")


def _rect(rect: PreviewRect, *, owned_mask: bool = False) -> None:
    _dimensions(rect["width"], rect["height"], owned_mask=owned_mask)
    if (
        type(rect["x"]) is not int
        or type(rect["y"]) is not int
        or abs(rect["x"]) > MAX_WORLD_COORDINATE
        or abs(rect["y"]) > MAX_WORLD_COORDINATE
        or (
            owned_mask
            and (
                abs(rect["x"] + rect["width"]) > MAX_WORLD_COORDINATE
                or abs(rect["y"] + rect["height"]) > MAX_WORLD_COORDINATE
            )
        )
    ):
        raise DerivativeError("INVALID_REQUEST", "Preparation origin must be bounded integers.")


def _paths(request: SmartPatchPreparationRequest) -> tuple[Path, Path, Path]:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    destinations = (
        canonical_absolute_path(request.world_mask_png_path, label="World mask output"),
        canonical_absolute_path(
            request.processing_source_png_path, label="Processing source output"
        ),
        canonical_absolute_path(request.processing_mask_png_path, label="Processing mask output"),
    )
    if len(set(destinations)) != 3:
        raise DerivativeError("INVALID_PATH", "Preparation output paths must be distinct.")
    sources = {canonical_absolute_path(request.source.path, label="Source input")}
    if request.mask is not None:
        sources.add(canonical_absolute_path(request.mask.path, label="Mask input"))
    if any(destination in sources for destination in destinations):
        raise DerivativeError("INVALID_PATH", "Preparation input and output must be distinct.")
    for destination in destinations:
        if destination.suffix.lower() != ".png" or root not in destination.parents:
            raise DerivativeError("INVALID_PATH", "Preparation outputs must be PNGs in staging.")
        parent = canonical_absolute_path(destination.parent, label="Output directory")
        if not parent.is_dir() or os.path.lexists(destination):
            raise DerivativeError("OUTPUT_UNAVAILABLE", "Preparation output is unavailable.")
    return destinations


def _snapshot(image: PreparationImage) -> bytes:
    if type(image.byte_size) is not int or not 1 <= image.byte_size <= MAX_PREPARATION_PNG_BYTES:
        raise DerivativeError("INPUT_TOO_LARGE", "Preparation input exceeds the PNG byte limit.")
    snapshot = read_snapshot(image.path, image.sha256, max_bytes=MAX_PREPARATION_PNG_BYTES)
    if len(snapshot) != image.byte_size:
        raise DerivativeError("INVALID_IMAGE", "Preparation input byte size differs.")
    return snapshot


def _verify_png_stream(snapshot: bytes, width: int, height: int, *, numeric_mask: bool) -> None:
    """Verify exact RGBA8 geometry, all CRCs, and a bounded complete pixel stream."""
    if not snapshot.startswith(PNG_SIGNATURE):
        raise DerivativeError("INVALID_IMAGE", "Preparation input must be a PNG.")
    cursor = len(PNG_SIGNATURE)
    compressed: list[bytes] = []
    header_seen = False
    data_closed = False
    end_seen = False
    while cursor + 12 <= len(snapshot):
        length = int.from_bytes(snapshot[cursor : cursor + 4], "big")
        tag = snapshot[cursor + 4 : cursor + 8]
        end = cursor + length + 12
        if end > len(snapshot):
            raise DerivativeError("INVALID_IMAGE", "Preparation PNG is truncated.")
        data = snapshot[cursor + 8 : end - 4]
        if zlib.crc32(snapshot[cursor + 4 : end - 4]) != int.from_bytes(
            snapshot[end - 4 : end], "big"
        ):
            raise DerivativeError("INVALID_IMAGE", "Preparation PNG checksum is invalid.")
        if not header_seen:
            if (
                tag != b"IHDR"
                or length != 13
                or int.from_bytes(data[:4], "big") != width
                or int.from_bytes(data[4:8], "big") != height
                or data[8:] != bytes((8, 6, 0, 0, 0))
            ):
                raise DerivativeError("INVALID_IMAGE", "Preparation PNG must be exact RGBA8.")
            header_seen = True
        elif tag == b"IDAT" and length > 0 and not data_closed:
            if numeric_mask and len(compressed) >= MAX_OWNED_MASK_IDAT_CHUNKS:
                raise DerivativeError("INVALID_IMAGE", "Owned mask has too many IDAT chunks.")
            compressed.append(data)
        elif tag == b"IEND" and length == 0 and compressed:
            if end != len(snapshot):
                raise DerivativeError("INVALID_IMAGE", "Preparation PNG has trailing data.")
            end_seen = True
        elif (
            not numeric_mask
            and tag not in (b"IHDR", b"IDAT", b"IEND")
            and len(tag) == 4
            and tag[0] & 32
        ):
            if compressed:
                data_closed = True
        else:
            raise DerivativeError("INVALID_IMAGE", "Preparation PNG structure is invalid.")
        cursor = end
        if end_seen:
            break
    if not end_seen:
        raise DerivativeError("INVALID_IMAGE", "Preparation PNG has no complete pixels.")
    expected = (width * 4 + 1) * height
    try:
        inflater = zlib.decompressobj()
        decoded = inflater.decompress(b"".join(compressed), expected + 1)
    except zlib.error as error:
        raise DerivativeError("INVALID_IMAGE", "Preparation PNG pixels are invalid.") from error
    if (
        len(decoded) != expected
        or not inflater.eof
        or inflater.unused_data
        or inflater.unconsumed_tail
    ):
        raise DerivativeError("INVALID_IMAGE", "Preparation PNG pixel stream differs.")


def _decode(image: PreparationImage, *, numeric_mask: bool) -> Image.Image:
    snapshot = _snapshot(image)
    _verify_png_stream(snapshot, image.width, image.height, numeric_mask=numeric_mask)
    if not numeric_mask:
        profile, conflicting = png_embedded_color_metadata(snapshot)
        if conflicting or profile != SRGB_ICC_PROFILE:
            raise DerivativeError("INPUT_COLOR_PROFILE", "Preparation source must be tagged sRGB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(snapshot)) as decoded:
                if (
                    decoded.format != "PNG"
                    or decoded.mode != "RGBA"
                    or decoded.size != (image.width, image.height)
                    or getattr(decoded, "n_frames", 1) != 1
                ):
                    raise DerivativeError("INVALID_IMAGE", "Preparation image geometry differs.")
                if not numeric_mask and decoded.info.get("icc_profile") != SRGB_ICC_PROFILE:
                    raise DerivativeError("INPUT_COLOR_PROFILE", "Preparation source ICC differs.")
                decoded.load()
                captured = decoded.copy()
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
    ) as error:
        raise DerivativeError("INVALID_IMAGE", "Preparation image could not be decoded.") from error
    if numeric_mask:
        if any(captured.getchannel(channel).getextrema() != (255, 255) for channel in "RGB"):
            raise DerivativeError("INVALID_IMAGE", "Owned mask RGB must be white.")
        if captured.getchannel("A").getbbox() != (0, 0, image.width, image.height):
            raise DerivativeError("INVALID_IMAGE", "Owned mask must have nonempty tight coverage.")
    return captured


def _world_coverage(mask: Image.Image | None, request: SmartPatchPreparationRequest) -> Image.Image:
    bbox = request.bbox
    coverage = Image.new("L", (bbox["width"], bbox["height"]))
    if mask is None or request.mask is None:
        return coverage
    bounds = request.mask.bounds
    left, top = max(bbox["x"], bounds["x"]), max(bbox["y"], bounds["y"])
    right = min(bbox["x"] + bbox["width"], bounds["x"] + bounds["width"])
    bottom = min(bbox["y"] + bbox["height"], bounds["y"] + bounds["height"])
    if left < right and top < bottom:
        cropped = mask.getchannel("A").crop(
            (left - bounds["x"], top - bounds["y"], right - bounds["x"], bottom - bounds["y"])
        )
        coverage.paste(cropped, (left - bbox["x"], top - bbox["y"]))
    return coverage


def _numeric_rgba(coverage: Image.Image) -> Image.Image:
    image = Image.new("RGBA", coverage.size, (255, 255, 255, 255))
    image.putalpha(coverage)
    return image


def _write_numeric_temporary(image: Image.Image, destination: Path) -> Path:
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


def _mask_info(destination: Path, image: Image.Image) -> MaskArtifactInfo:
    metadata = artifact_info(destination, image)
    return {
        "byteSize": metadata["byteSize"],
        "height": metadata["height"],
        "sha256": metadata["sha256"],
        "width": metadata["width"],
    }


def _publish(
    destinations: tuple[Path, Path, Path],
    world: Image.Image,
    source: Image.Image,
    processing: Image.Image,
) -> SmartPatchPreparationResult:
    temporary: list[Path] = []
    published: list[Path] = []
    succeeded = False
    try:
        temporary.append(_write_numeric_temporary(world, destinations[0]))
        temporary.append(write_temporary_image(source, destinations[1], "PNG"))
        temporary.append(_write_numeric_temporary(processing, destinations[2]))
        for candidate, destination in zip(temporary, destinations, strict=True):
            os.link(candidate, destination, follow_symlinks=False)
            published.append(destination)
        for directory in {destination.parent for destination in destinations}:
            descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        result: SmartPatchPreparationResult = {
            "worldMask": _mask_info(destinations[0], world),
            "processingSource": artifact_info(destinations[1], source),
            "processingMask": _mask_info(destinations[2], processing),
        }
        if any(
            metadata["byteSize"] > MAX_PREPARATION_PNG_BYTES
            for metadata in (
                result["worldMask"],
                result["processingSource"],
                result["processingMask"],
            )
        ):
            raise DerivativeError("IMAGE_TOO_LARGE", "Prepared PNG exceeds its byte limit.")
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError(
            "OUTPUT_UNAVAILABLE", "A preparation output already exists."
        ) from error
    except OSError as error:
        raise DerivativeError("DERIVATIVE_FAILED", "Preparation could not be stored.") from error
    finally:
        for candidate in temporary:
            candidate.unlink(missing_ok=True)
        if not succeeded:
            for destination in published:
                destination.unlink(missing_ok=True)


def prepare_smart_patch(request: SmartPatchPreparationRequest) -> SmartPatchPreparationResult:
    """Return three private derived planes without mutating the captured inputs."""
    _rect(request.bbox)
    size = request.internal_resolution
    _dimensions(size["width"], size["height"])
    _dimensions(request.source.width, request.source.height)
    if (request.source.width, request.source.height) != (
        request.bbox["width"],
        request.bbox["height"],
    ):
        raise DerivativeError("INVALID_REQUEST", "Preparation source must match its world bbox.")
    if request.mask is not None:
        _rect(request.mask.bounds, owned_mask=True)
        _dimensions(request.mask.width, request.mask.height, owned_mask=True)
        if (request.mask.width, request.mask.height) != (
            request.mask.bounds["width"],
            request.mask.bounds["height"],
        ):
            raise DerivativeError("INVALID_REQUEST", "Owned mask dimensions must match bounds.")
    destinations = _paths(request)
    source = _decode(request.source, numeric_mask=False)
    # Verify the whole original mask before clipping, including a fully disjoint mask.
    mask = _decode(request.mask, numeric_mask=True) if request.mask is not None else None
    world = _world_coverage(mask, request)
    processing_size = (size["width"], size["height"])
    processing_source = (
        source.copy()
        if source.size == processing_size
        else source.resize(processing_size, resample=Image.Resampling.BICUBIC)
    )
    processing_mask = (
        world.copy()
        if world.size == processing_size
        else world.resize(processing_size, resample=Image.Resampling.BICUBIC)
    )
    return _publish(
        destinations, _numeric_rgba(world), processing_source, _numeric_rgba(processing_mask)
    )
