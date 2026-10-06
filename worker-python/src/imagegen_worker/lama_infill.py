"""Local TorchScript LaMa infill adapted from pinned InvokeAI lama.py.

Modified for ImageGen Studio: explicit hash-bound local input, descriptor-backed
load, immutable RGBA source and finite output validation. No downloader, cache
discovery or public worker capability. See the packaged vendor NOTICE/license.
"""

from __future__ import annotations

import hashlib
import importlib
import io
import os
import re
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, cast

from PIL import Image

from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    canonical_absolute_path,
)
from imagegen_worker.outpaint_conditioning import capture_outpaint_source


def _model_snapshot(path: object, expected_sha256: str, expected_byte_size: int) -> bytes:
    if (
        type(expected_sha256) is not str
        or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None
        or type(expected_byte_size) is not int
        or expected_byte_size < 1
    ):
        raise DerivativeError("INVALID_REQUEST", "LaMa identity is invalid.")
    if not isinstance(path, Path):
        raise DerivativeError("INVALID_PATH", "LaMa requires an explicit local path.")
    canonical_absolute_path(path, label="LaMa model")
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != expected_byte_size:
                raise DerivativeError("GENERATION_INPUT_CHANGED", "LaMa file identity differs.")
            chunks: list[bytes] = []
            size = 0
            digest = hashlib.sha256()
            while chunk := stream.read(min(1024 * 1024, expected_byte_size - size + 1)):
                size += len(chunk)
                if size > expected_byte_size:
                    raise DerivativeError("GENERATION_INPUT_CHANGED", "LaMa changed during read.")
                digest.update(chunk)
                chunks.append(chunk)
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
                size != expected_byte_size
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
                or digest.hexdigest() != expected_sha256
            ):
                raise DerivativeError("GENERATION_INPUT_CHANGED", "LaMa changed after capture.")
    except OSError as error:
        raise DerivativeError(
            "GENERATION_INPUT_CHANGED", "LaMa local file is unavailable."
        ) from error
    return b"".join(chunks)


@dataclass(frozen=True)
class LocalLamaModel:
    """One caller-owned loaded model; no global cache or downloaded resource."""

    _model: Any
    _torch: Any
    _device: Any

    def infill(self, source: object) -> Image.Image:
        captured = capture_outpaint_source(source)
        torch = self._torch
        try:
            pixels = torch.frombuffer(bytearray(captured.tobytes()), dtype=torch.uint8)
            pixels = pixels.reshape(captured.height, captured.width, 4)
            image = pixels[:, :, :3].permute(2, 0, 1).to(dtype=torch.float32) / 255
            mask = (pixels[:, :, 3] < 255).unsqueeze(0).to(dtype=torch.float32)
            image = image.unsqueeze(0).to(self._device)
            mask = mask.unsqueeze(0).to(self._device)
            with torch.inference_mode():
                output = self._model(image, mask)
            if (
                not isinstance(output, torch.Tensor)
                or tuple(output.shape) != (1, 3, captured.height, captured.width)
                or not output.is_floating_point()
                or not bool(torch.isfinite(output).all().item())
            ):
                raise DerivativeError("GENERATION_WORKER_FAILED", "LaMa output is invalid.")
            pixels = (output[0].detach().float().cpu().clamp(0, 1) * 255).to(torch.uint8)
            result = Image.frombytes(
                "RGB", captured.size, pixels.permute(1, 2, 0).contiguous().numpy().tobytes()
            )
            result.info["icc_profile"] = SRGB_ICC_PROFILE
            return result
        except DerivativeError:
            raise
        except Exception as error:
            raise DerivativeError(
                "GENERATION_WORKER_FAILED", "LaMa local inference failed."
            ) from error


def load_local_lama(
    path: Path,
    *,
    expected_sha256: str,
    expected_byte_size: int,
    device: Literal["cpu", "cuda"] = "cpu",
) -> LocalLamaModel:
    """Load exact supplied bytes, never a URL or a subsequent read of the path."""
    if device not in ("cpu", "cuda"):
        raise DerivativeError("INVALID_REQUEST", "LaMa device is unsupported.")
    snapshot = _model_snapshot(path, expected_sha256, expected_byte_size)
    try:
        torch = cast(Any, importlib.import_module("torch"))
    except ImportError as error:
        raise DerivativeError("INFERENCE_UNAVAILABLE", "LaMa Torch runtime is absent.") from error
    try:
        model = torch.jit.load(io.BytesIO(snapshot), map_location="cpu").to(device)
        model.eval()
        return LocalLamaModel(model, torch, device)
    except Exception as error:
        raise DerivativeError(
            "GENERATION_WORKER_FAILED", "LaMa local model load failed."
        ) from error
