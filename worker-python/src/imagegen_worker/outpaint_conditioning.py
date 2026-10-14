"""Internal normal-outpaint masks adapted from the pinned InvokeAI algorithm.

Modified for ImageGen Studio: explicit caller-owned policy, copied RGBA input,
CPU NumPy filtering and no invocation graph, network or publication. See the
packaged vendor NOTICE and Apache license for upstream attribution.
"""

from __future__ import annotations

import importlib
import math
from dataclasses import dataclass
from typing import Any, Literal, cast

from PIL import Image, ImageOps

from imagegen_worker.compositor import MAX_TARGET_PIXELS, MAX_TARGET_SIDE
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
)

CONDITIONING_VERSION = "invoke-normal-outpaint-conditioning-v1"
LATENT_SCALE = 8
CoherenceMode = Literal["Gaussian Blur", "Box Blur", "Staged"]


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
    keep_mask: Image.Image,
    *,
    edge_radius: int,
    minimum_denoise: float,
    np: Any,
    cv2: Any,
    coherence_mode: CoherenceMode = "Gaussian Blur",
) -> tuple[Image.Image, Image.Image]:
    latent_size = (keep_mask.width // LATENT_SCALE, keep_mask.height // LATENT_SCALE)
    reduced = keep_mask.resize(latent_size, resample=Image.Resampling.BILINEAR)
    original = np.array(reduced, dtype=np.float32)
    radius = edge_radius // LATENT_SCALE
    if radius:
        holes = 255 - original
        kernel_size = radius * 2 + 1
        if coherence_mode == "Box Blur":
            kernel = np.zeros((kernel_size, kernel_size), dtype=np.float32)
            for row in range(kernel_size):
                for column in range(kernel_size):
                    distance = np.sqrt((row - radius) ** 2 + (column - radius) ** 2)
                    if distance <= radius:
                        kernel[row, column] = 1.0 - distance / radius
        else:
            kernel = cv2.getGaussianKernel(kernel_size, radius / 2.5)
            kernel = kernel * kernel.T
            kernel = kernel / np.max(kernel)
        padded = np.pad(holes, ((radius, radius), (radius, radius)), constant_values=0)
        maximum = np.zeros_like(holes)
        for row in range(kernel_size):
            for column in range(kernel_size):
                if math.sqrt((row - radius) ** 2 + (column - radius) ** 2) > radius:
                    continue
                if kernel[row, column] <= 0:
                    continue
                # Torch's upstream scalar multiplication retains the image's F32 dtype.
                weight = np.float32(kernel[row, column])
                region = padded[row : row + holes.shape[0], column : column + holes.shape[1]]
                np.maximum(maximum, region * weight, out=maximum)
        gradient = 255 - maximum
        threshold = (1 - minimum_denoise) * 255
        if coherence_mode == "Staged":
            staged = (gradient < original) & (original > threshold)
            gradient = np.where(staged, threshold, original)
        gradient = np.where((gradient > threshold) & (gradient < 255), threshold, gradient)
    else:
        gradient = original.copy()
    quantized = np.clip(gradient, 0, 255).astype(np.uint8)
    latent_mask = Image.fromarray(quantized)
    expanded = Image.fromarray(np.where(quantized < 255, 0, 255).astype(np.uint8))
    return latent_mask, expanded.resize(keep_mask.size, resample=Image.Resampling.NEAREST)


def prepare_keep_mask_coherence(
    mask: object,
    *,
    coherence_mode: CoherenceMode,
    edge_radius: int,
    minimum_denoise: float,
) -> tuple[Image.Image, Image.Image]:
    """Capture processing keep pixels and return quantized latent/expanded keep.

    Coherence edge units are processing pixels, including the pinned floor /8.
    This helper accepts soft keep coverage and does not load Torch or ML models.
    The Gaussian default of the existing normal OUT path remains unchanged.
    """
    if (
        coherence_mode not in ("Gaussian Blur", "Box Blur", "Staged")
        or type(edge_radius) is not int
        or not 0 <= edge_radius <= 1024
        or type(minimum_denoise) not in (int, float)
        or not 0 <= minimum_denoise <= 1
        or not math.isfinite(minimum_denoise)
        or not isinstance(mask, Image.Image)
        or mask.mode != "L"
        or not LATENT_SCALE <= mask.width <= MAX_TARGET_SIDE
        or not LATENT_SCALE <= mask.height <= MAX_TARGET_SIDE
        or mask.width % LATENT_SCALE
        or mask.height % LATENT_SCALE
        or mask.width * mask.height > MAX_TARGET_PIXELS
    ):
        raise DerivativeError("INVALID_REQUEST", "Processing keep mask or coherence is invalid.")
    captured = mask.copy()
    if edge_radius < LATENT_SCALE or captured.getextrema() in ((0, 0), (255, 255)):
        latent = captured.resize(
            (captured.width // LATENT_SCALE, captured.height // LATENT_SCALE),
            resample=Image.Resampling.BILINEAR,
        )
        expanded = latent.point([0] * 255 + [255]).resize(
            captured.size, resample=Image.Resampling.NEAREST
        )
        return latent, expanded
    np, cv2 = _native_modules()
    return _gradient_masks(
        captured,
        edge_radius=edge_radius,
        minimum_denoise=minimum_denoise,
        np=np,
        cv2=cv2,
        coherence_mode=coherence_mode,
    )


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


def fade_binary_keep_mask(mask: object, *, fade_radius: int) -> Image.Image:
    """Apply the exact pinned external fade to a bounded copied binary keep plane.

    This geometry helper does not perform OUT coherence or require a latent grid.
    Zero/full/empty work stays Pillow-only; a mixed positive-radius fade lazily
    loads the existing NumPy/OpenCV dependencies without importing Torch.
    """
    radius = _radius(fade_radius)
    if (
        not isinstance(mask, Image.Image)
        or mask.mode != "L"
        or not 1 <= mask.width <= MAX_TARGET_SIDE
        or not 1 <= mask.height <= MAX_TARGET_SIDE
        or mask.width * mask.height > MAX_TARGET_PIXELS
    ):
        raise DerivativeError("INVALID_REQUEST", "Fade requires a bounded binary keep mask.")
    captured = mask.copy()
    if any(captured.histogram()[1:255]):
        raise DerivativeError("INVALID_REQUEST", "Fade keep mask must contain only 0 or 255.")
    if not radius or captured.getextrema() in ((0, 0), (255, 255)):
        return captured
    np, cv2 = _native_modules()
    return _fade_mask(captured, fade_radius=radius, np=np, cv2=cv2)


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
