"""Exact local outpaint inputs, independent of queue claims and family model loading."""

from __future__ import annotations

import hashlib
import io
import os
import stat
import warnings
import zlib
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.generation_artifacts import validate_generation_paths
from imagegen_worker.imports import png_embedded_color_metadata
from imagegen_worker.lama_infill import load_local_lama
from imagegen_worker.outpaint_conditioning import (
    OutpaintConditioning,
    prepare_outpaint_conditioning,
)
from imagegen_worker.protocol import (
    GenerateAnimaOutpaintCommand,
    GenerateIllustriousOutpaintCommand,
)


def _source_snapshot(path: Path, sha256: str, byte_size: int) -> bytes:
    """Read at most declared size+1 and bind the bytes to one stable regular descriptor."""
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != byte_size:
                raise DerivativeError(
                    "GENERATION_INPUT_CHANGED", "Outpaint target identity differs."
                )
            content = bytearray()
            digest = hashlib.sha256()
            while chunk := stream.read(min(1024 * 1024, byte_size - len(content) + 1)):
                content.extend(chunk)
                digest.update(chunk)
                if len(content) > byte_size:
                    raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint target grew.")
            after = os.fstat(stream.fileno())
            at_path = path.lstat()
            identity = (
                before.st_dev,
                before.st_ino,
                before.st_size,
                before.st_mtime_ns,
                before.st_ctime_ns,
            )
            if (
                len(content) != byte_size
                or digest.hexdigest() != sha256
                or identity
                != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                or identity
                != (
                    at_path.st_dev,
                    at_path.st_ino,
                    at_path.st_size,
                    at_path.st_mtime_ns,
                    at_path.st_ctime_ns,
                )
                or not stat.S_ISREG(at_path.st_mode)
            ):
                raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint target changed.")
    except OSError as error:
        raise DerivativeError(
            "GENERATION_INPUT_CHANGED", "Outpaint target is unavailable."
        ) from error
    return bytes(content)


def _verify_png_stream(snapshot: bytes) -> None:
    """Verify every CRC and the complete nonanimated stream before Pillow can ignore bytes."""
    if not snapshot.startswith(b"\x89PNG\r\n\x1a\n"):
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint target is not PNG.")
    cursor, count = 8, 0
    seen_idat = False
    while cursor + 12 <= len(snapshot):
        length = int.from_bytes(snapshot[cursor : cursor + 4], "big")
        kind = snapshot[cursor + 4 : cursor + 8]
        data_end = cursor + 8 + length
        end = data_end + 4
        if (
            end > len(snapshot)
            or zlib.crc32(memoryview(snapshot)[cursor + 4 : data_end])
            != int.from_bytes(snapshot[data_end:end], "big")
            or kind in (b"acTL", b"fcTL", b"fdAT")
            or (count == 0 and (kind != b"IHDR" or length != 13))
            or (count > 0 and kind == b"IHDR")
        ):
            raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint PNG stream is invalid.")
        if kind == b"IDAT":
            seen_idat = True
        if kind == b"IEND":
            if length != 0 or end != len(snapshot) or not seen_idat:
                raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint PNG ending is invalid.")
            return
        cursor, count = end, count + 1
    raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint PNG is incomplete.")


def capture_outpaint_target(
    command: GenerateIllustriousOutpaintCommand | GenerateAnimaOutpaintCommand,
) -> Image.Image:
    """Revalidate actual mixed alpha, fixed color profile and frozen raw-alpha identity."""
    validate_generation_paths(command.staging_root, command.target_path, command.output_path)
    snapshot = _source_snapshot(
        command.target_path, command.target_sha256, command.target_byte_size
    )
    _verify_png_stream(snapshot)
    profile, non_srgb_chunks = png_embedded_color_metadata(snapshot)
    if profile != SRGB_ICC_PROFILE or non_srgb_chunks:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint target is not pinned sRGB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(snapshot)) as decoded:
                if (
                    decoded.format != "PNG"
                    or decoded.mode != "RGBA"
                    or getattr(decoded, "n_frames", 1) != 1
                    or decoded.size != (command.width, command.height)
                    or decoded.info.get("icc_profile") != SRGB_ICC_PROFILE
                ):
                    raise DerivativeError(
                        "GENERATION_INPUT_CHANGED", "Outpaint PNG topology differs."
                    )
                decoded.load()
                captured = decoded.copy()
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as error:
        raise DerivativeError(
            "GENERATION_INPUT_CHANGED", "Outpaint target cannot be decoded."
        ) from error
    alpha = captured.getchannel("A")
    if alpha.getextrema() in ((0, 0), (255, 255)):
        raise DerivativeError("GENERATION_TARGET_UNSUPPORTED", "Outpaint requires mixed alpha.")
    raw = alpha.tobytes()
    if (
        len(raw) != command.conditioning.keep_mask_byte_size
        or hashlib.sha256(raw).hexdigest() != command.conditioning.keep_mask_sha256
    ):
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint raw alpha identity differs.")
    return captured


def prepare_worker_outpaint(
    command: GenerateIllustriousOutpaintCommand | GenerateAnimaOutpaintCommand,
) -> tuple[OutpaintConditioning, Image.Image]:
    """Capture masks and infill exact local LaMa before either family loads its models."""
    source = capture_outpaint_target(command)
    conditioning = prepare_outpaint_conditioning(
        source,
        coherence_edge_radius=command.conditioning.edge_radius,
        minimum_denoise=command.conditioning.minimum_denoise,
        output_fade_radius=command.conditioning.fade_distance,
    )
    model = load_local_lama(
        command.infill_resource.path,
        expected_sha256=command.infill_resource.sha256,
        expected_byte_size=command.infill_resource.byte_size,
        device="cpu",
    )
    infilled = model.infill(conditioning.source)
    if infilled.mode != "RGB" or infilled.size != source.size:
        raise DerivativeError("GENERATION_WORKER_FAILED", "LaMa outpaint image topology differs.")
    return conditioning, infilled
