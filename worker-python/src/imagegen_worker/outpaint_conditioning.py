"""Internal normal-outpaint masks adapted from the pinned InvokeAI algorithm.

Modified for ImageGen Studio: explicit caller-owned policy, copied RGBA input,
CPU NumPy filtering and no invocation graph, network or publication. See the
packaged vendor NOTICE and Apache license for upstream attribution.
"""

from __future__ import annotations

import importlib
import math
from dataclasses import dataclass
from typing import Any, cast

from PIL import Image, ImageOps

from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
)

CONDITIONING_VERSION = "invoke-normal-outpaint-conditioning-v1"
LATENT_SCALE = 8


@dataclass(frozen=True)
class OutpaintConditioning:
    """Request-owned images, independent of the caller's mutable source image."""

    source: Image.Image
    latent_keep_mask: Image.Image
    expanded_keep_mask: Image.Image
    output_keep_mask: Image.Image


def capture_outpaint_source(source: object) -> Image.Image:
    """Capture any nonempty, nonopaque RGBA source without changing its pixels."""
    if not isinstance(source, Image.Image) or source.mode != "RGBA":
        raise DerivativeError("GENERATION_TARGET_UNSUPPORTED", "Outpaint requires RGBA pixels.")
    width, height = source.size
    if (
        not LATENT_SCALE <= width <= MAX_TARGET_SIDE
        or not LATENT_SCALE <= height <= MAX_TARGET_SIDE
        or width % LATENT_SCALE
        or height % LATENT_SCALE
        or width * height > MAX_TARGET_PIXELS
    ):
        raise DerivativeError(
            "GENERATION_TARGET_UNSUPPORTED", "Outpaint dimensions must match the latent grid."
        )
    captured = source.copy()
    if captured.getchannel("A").getextrema() in ((0, 0), (255, 255)):
        raise DerivativeError(
            "GENERATION_TARGET_UNSUPPORTED", "Outpaint requires a nonempty, nonopaque target."
        )
    profile = captured.info.get("icc_profile")
    if profile is not None and profile != SRGB_ICC_PROFILE:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Outpaint source must be sRGB.")
    return captured


def _radius(value: object) -> int:
    if type(value) is not int or not 0 <= value <= MAX_TARGET_SIDE:
        raise DerivativeError("INVALID_REQUEST", "Outpaint radius is invalid.")
    return value


def _native_modules() -> tuple[Any, Any]:
    try:
        return (
            cast(Any, importlib.import_module("numpy")),
            cast(Any, importlib.import_module("cv2")),
        )
    except ImportError as error:
        raise DerivativeError(
            "INFERENCE_UNAVAILABLE", "Outpaint CPU dependencies are absent."
        ) from error


def _gradient_masks(
    keep_mask: Image.Image, *, edge_radius: int, minimum_denoise: float, np: Any, cv2: Any
) -> tuple[Image.Image, Image.Image]:
    latent_size = (keep_mask.width // LATENT_SCALE, keep_mask.height // LATENT_SCALE)
    reduced = keep_mask.resize(latent_size, resample=Image.Resampling.BILINEAR)
    original = np.array(reduced, dtype=np.float32)
    radius = edge_radius // LATENT_SCALE
    if radius:
        holes = 255 - original
        kernel_size = radius * 2 + 1
        kernel = cv2.getGaussianKernel(kernel_size, radius / 2.5)
        kernel = kernel * kernel.T
        kernel = kernel / np.max(kernel)
        padded = np.pad(holes, ((radius, radius), (radius, radius)), constant_values=0)
        maximum = np.zeros_like(holes)
        for row in range(kernel_size):
            for column in range(kernel_size):
                if math.sqrt((row - radius) ** 2 + (column - radius) ** 2) > radius:
                    continue
                # Torch's upstream scalar multiplication retains the image's F32 dtype.
                weight = np.float32(kernel[row, column])
                region = padded[row : row + holes.shape[0], column : column + holes.shape[1]]
                np.maximum(maximum, region * weight, out=maximum)
        gradient = 255 - maximum
        threshold = (1 - minimum_denoise) * 255
        gradient = np.where((gradient > threshold) & (gradient < 255), threshold, gradient)
    else:
        gradient = original.copy()
    quantized = np.clip(gradient, 0, 255).astype(np.uint8)
    latent_mask = Image.fromarray(quantized)
    expanded = Image.fromarray(np.where(quantized < 255, 0, 255).astype(np.uint8))
    return latent_mask, expanded.resize(keep_mask.size, resample=Image.Resampling.NEAREST)


def _fade_mask(mask: Image.Image, *, fade_radius: int, np: Any, cv2: Any) -> Image.Image:
    if not fade_radius:
        return mask.copy()
    values = np.asarray(mask)
    _, faded = cv2.threshold(values, 0, 255, cv2.THRESH_BINARY)
    distance = cv2.distanceTransform(faded, cv2.DIST_L2, 5)
    band = (distance > 0) & (distance < fade_radius)
    if band.any():
        control_x = np.array([0.0, 1.0 / fade_radius, 0.2, 0.8, 1.0])
        control_y = np.array([0.0, 0.0, 0.2, 0.9, 1.0])
        polynomial = np.poly1d(np.polyfit(control_x, control_y, 3))
        feather = polynomial(distance[band] / fade_radius)
        np.clip(feather, 0, 1, out=feather)
        faded[band] = (feather * 255).astype(np.uint8)
    # Beyond the band, the binary white mask stays exactly 255, not alpha 1.
    return Image.fromarray(faded)


def prepare_outpaint_conditioning(
    source: object,
    *,
    coherence_edge_radius: int,
    minimum_denoise: float,
    output_fade_radius: int,
) -> OutpaintConditioning:
    """Apply the Gaussian coherence algorithm; policy/defaults belong to Main."""
    edge_radius = _radius(coherence_edge_radius)
    fade_radius = _radius(output_fade_radius)
    if (
        type(minimum_denoise) not in (int, float)
        or not math.isfinite(minimum_denoise)
        or not 0 <= minimum_denoise <= 1
    ):
        raise DerivativeError("INVALID_REQUEST", "Outpaint minimum denoise is invalid.")
    captured = capture_outpaint_source(source)
    np, cv2 = _native_modules()
    latent, expanded = _gradient_masks(
        captured.getchannel("A"),
        edge_radius=edge_radius,
        minimum_denoise=minimum_denoise,
        np=np,
        cv2=cv2,
    )
    output = _fade_mask(expanded, fade_radius=fade_radius, np=np, cv2=cv2)
    return OutpaintConditioning(captured, latent, expanded, output)


def create_outpaint_contribution(
    generated: object, conditioning: OutpaintConditioning
) -> Image.Image:
    """Return generated RGB with faded contribution alpha, never paste over source."""
    if (
        not isinstance(generated, Image.Image)
        or generated.mode not in ("RGB", "RGBA")
        or generated.size != conditioning.source.size
        or conditioning.output_keep_mask.mode != "L"
        or conditioning.output_keep_mask.size != generated.size
    ):
        raise DerivativeError("GENERATION_WORKER_FAILED", "Outpaint output topology differs.")
    result = generated.convert("RGBA")
    result.putalpha(ImageOps.invert(conditioning.output_keep_mask))
    result.info["icc_profile"] = SRGB_ICC_PROFILE
    return result
