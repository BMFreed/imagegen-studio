"""Shared provisional generation files; family semantics remain with each caller."""

from __future__ import annotations

import io
import os
import warnings
from pathlib import Path
from typing import Literal

from PIL import Image, UnidentifiedImageError

from imagegen_worker.candidate_thumbnail import create_candidate_thumbnail
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    canonical_absolute_path,
    read_snapshot,
    write_temporary_image,
)
from imagegen_worker.imports import png_embedded_color_metadata


def validate_generation_paths(staging_root: Path, target_path: Path, output_path: Path) -> None:
    root = canonical_absolute_path(staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Generation staging root is unavailable.")
    entry = root.stat()
    if entry.st_uid != os.getuid() or entry.st_mode & 0o022:
        raise DerivativeError("INVALID_PATH", "Generation staging root is unsafe.")
    target = canonical_absolute_path(target_path, label="Target")
    output = canonical_absolute_path(output_path, label="Output")
    if target.parent != root or output.parent != root or output == target:
        raise DerivativeError("INVALID_PATH", "Generation files must be distinct staging children.")
    if os.path.lexists(output):
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Generation output already exists.")


def validate_generation_target(
    *,
    staging_root: Path,
    target_path: Path,
    output_path: Path,
    target_sha256: str,
    target_byte_size: int,
    width: int,
    height: int,
    img2img: bool,
) -> Image.Image | None:
    """Retain source pixels from the verified snapshot, never from a subsequent file read."""
    validate_generation_paths(staging_root, target_path, output_path)
    try:
        target_size = target_path.stat().st_size
    except OSError as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target is unavailable.") from error
    if target_size != target_byte_size:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target changed after enqueue.")
    snapshot = read_snapshot(target_path, target_sha256)
    if len(snapshot) != target_byte_size:
        raise DerivativeError(
            "GENERATION_INPUT_CHANGED", "Target snapshot size changed after enqueue."
        )
    profile, non_srgb_chunks = png_embedded_color_metadata(snapshot)
    if non_srgb_chunks or profile != SRGB_ICC_PROFILE:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target is not pinned sRGB PNG.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(snapshot)) as decoded:
                if (
                    decoded.format != "PNG"
                    or getattr(decoded, "n_frames", 1) != 1
                    or decoded.size != (width, height)
                    or decoded.mode != "RGBA"
                    or decoded.info.get("icc_profile") != SRGB_ICC_PROFILE
                ):
                    raise DerivativeError(
                        "GENERATION_INPUT_CHANGED", "Target PNG metadata changed after enqueue."
                    )
                decoded.load()
                if decoded.getchannel("A").getextrema() != ((255, 255) if img2img else (0, 0)):
                    raise DerivativeError(
                        "GENERATION_TARGET_UNSUPPORTED",
                        "Img2img target must be opaque."
                        if img2img
                        else "Txt2img target must be transparent.",
                    )
                if img2img:
                    return decoded.convert("RGB")
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
    ) as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Target PNG is invalid.") from error
    return None


def publish_generation_image(
    image: object,
    *,
    staging_root: Path,
    output_path: Path,
    width: int,
    height: int,
    request_id: str,
    seed: int,
    output_mode: Literal["RGB", "RGBA"] = "RGB",
) -> dict[str, object]:
    """Publish one complete PNG exclusively; its thumbnail remains an optional cache."""
    if not isinstance(image, Image.Image) or image.size != (width, height):
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Inference did not return the expected image."
        )
    if output_mode not in ("RGB", "RGBA") or (output_mode == "RGBA" and image.mode != "RGBA"):
        raise DerivativeError("GENERATION_WORKER_FAILED", "Generation output mode differs.")
    output_image = image.convert(output_mode)
    temporary = write_temporary_image(output_image, output_path, "PNG")
    published = False
    try:
        os.link(temporary, output_path, follow_symlinks=False)
        published = True
        directory_fd = os.open(staging_root, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "Generation output already exists.") from error
    except OSError as error:
        if published:
            output_path.unlink(missing_ok=True)
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "Generation output could not be stored."
        ) from error
    finally:
        temporary.unlink(missing_ok=True)
    done: dict[str, object] = {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": request_id,
        "outputPath": str(output_path),
        "seed": seed,
    }
    thumbnail = create_candidate_thumbnail(output_image, output_path)
    if thumbnail is not None:
        done["thumbnail"] = thumbnail
    return done
