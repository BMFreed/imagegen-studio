"""Private ordinary-Canvas alpha8 sampling for an explicit Illustrious grid.

This profile is neither a public mask policy nor a model-quality claim. The
TypeScript projection has already applied the bbox origin; sampling is local to
that bbox, without absolute-grid snapping or image rescaling.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal, cast

from imagegen_worker.illustrious_regional_attention import Alpha8, Shape

if TYPE_CHECKING:
    from imagegen_worker.compositor import PreviewRect

__all__ = (
    "IllustriousRegionalGeometryError",
    "ordinary_canvas_coverage_to_latent",
    "smart_patch_world_coverage_to_processing",
)

_ErrorCode = Literal["INPUT_INVALID", "PROFILE_INVALID", "LIMIT"]

_PROFILE = "ordinary-canvas-origin-nearest8-v1"
_INVOKE_PROFILE = "ordinary-canvas-invoke-alpha-positive-nearest8-v1"
_MAX_ORIGIN = 2_147_483_647
_MAX_SIDE = 2048
_MAX_AREA = 4_000_000


class IllustriousRegionalGeometryError(ValueError):
    """A bounded diagnostic for this private numerical geometry boundary."""

    code: _ErrorCode

    def __init__(self, code: _ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


def ordinary_canvas_coverage_to_latent(
    *,
    alpha: bytes,
    coverage_bounds: PreviewRect,
    bbox: PreviewRect,
    latent_shape: Shape,
    profile: Literal[
        "ordinary-canvas-origin-nearest8-v1",
        "ordinary-canvas-invoke-alpha-positive-nearest8-v1",
    ],
) -> Alpha8:
    """Sample raw local alpha at (8*y, 8*x) into detached immutable storage.

    Callers must not concurrently mutate rectangle metadata during this
    synchronous call. All rectangle values are snapshotted to local integers
    before geometry comparisons and sampling. No caller-owned metadata or
    alpha storage is retained in the result.

    A covered world plane may sample to all zeroes. Its original coverage kind
    remains the recipe owner's responsibility; no unrestricted fallback is
    inferred here. The legacy profile retains raw alpha. The explicit Invoke
    profile adapts a61ac4fb app/invocations/mask.py AlphaMaskToTensorInvocation's
    alpha>0 before sd/denoise_latents.py nearest resize. Evaluating that pointwise
    conversion at each selected source pixel gives the identical sampled plane
    without allocating a second full world plane; authored input bytes stay exact.
    Display opacity is not consumed by either profile.

    At most 62,500 output bytes and one 62,500-byte bytearray scratch are owned
    at once, excluding input bytes and Python metadata. Main's 64 MiB aggregate
    budget and the planner/adapter limits remain separate owners.
    """
    if type(profile) is not str or profile not in (_PROFILE, _INVOKE_PROFILE):
        raise IllustriousRegionalGeometryError(
            "PROFILE_INVALID", "An explicit supported ordinary-Canvas profile is required."
        )

    for rect in (coverage_bounds, bbox):
        if type(rect) is not dict or len(rect) != 4:
            raise IllustriousRegionalGeometryError(
                "INPUT_INVALID", "Rectangles must be exact dictionaries with four geometry fields."
            )
        if any(type(key) is not str for key in rect) or rect.keys() != {
            "x",
            "y",
            "width",
            "height",
        }:
            raise IllustriousRegionalGeometryError(
                "INPUT_INVALID", "Rectangles require exactly x, y, width and height."
            )

    coverage_x = coverage_bounds["x"]
    coverage_y = coverage_bounds["y"]
    coverage_width = coverage_bounds["width"]
    coverage_height = coverage_bounds["height"]
    bbox_x = bbox["x"]
    bbox_y = bbox["y"]
    bbox_width = bbox["width"]
    bbox_height = bbox["height"]

    for x, y, width, height in (
        (coverage_x, coverage_y, coverage_width, coverage_height),
        (bbox_x, bbox_y, bbox_width, bbox_height),
    ):
        if any(type(value) is not int for value in (x, y, width, height)):
            raise IllustriousRegionalGeometryError(
                "INPUT_INVALID", "Rectangle geometry requires exact integers, excluding bool."
            )
        if width < 8 or height < 8:
            raise IllustriousRegionalGeometryError(
                "INPUT_INVALID", "Rectangle sides must be at least eight."
            )
        if x < -_MAX_ORIGIN or x > _MAX_ORIGIN or y < -_MAX_ORIGIN or y > _MAX_ORIGIN:
            raise IllustriousRegionalGeometryError(
                "LIMIT", "Rectangle origin exceeds the private coordinate limit."
            )
        if width > _MAX_SIDE or height > _MAX_SIDE:
            raise IllustriousRegionalGeometryError(
                "LIMIT", "Rectangle sides exceed the private per-side limit."
            )
        if width * height > _MAX_AREA:
            raise IllustriousRegionalGeometryError(
                "LIMIT", "Rectangle area exceeds the private per-plane limit."
            )
        if width % 8 != 0 or height % 8 != 0:
            raise IllustriousRegionalGeometryError(
                "INPUT_INVALID", "Rectangle sides must be divisible by eight."
            )

    if (coverage_x, coverage_y, coverage_width, coverage_height) != (
        bbox_x,
        bbox_y,
        bbox_width,
        bbox_height,
    ):
        raise IllustriousRegionalGeometryError(
            "INPUT_INVALID", "Coverage bounds and bbox must match exactly."
        )

    if type(latent_shape) is not Shape:
        raise IllustriousRegionalGeometryError(
            "INPUT_INVALID", "Latent shape must be an exact Shape record."
        )
    latent_height = latent_shape.height
    latent_width = latent_shape.width
    if (
        type(latent_height) is not int
        or type(latent_width) is not int
        or latent_height != coverage_height // 8
        or latent_width != coverage_width // 8
    ):
        raise IllustriousRegionalGeometryError(
            "INPUT_INVALID", "Latent shape must equal the rectangle height/8 and width/8."
        )
    if type(alpha) is not bytes or len(alpha) != coverage_width * coverage_height:
        raise IllustriousRegionalGeometryError(
            "INPUT_INVALID", "Coverage requires exact immutable row-major alpha8 bytes."
        )

    # Complete preflight precedes the sole scratch plane and immutable output.
    samples = bytearray(latent_height * latent_width)
    for y in range(latent_height):
        for x in range(latent_width):
            sample = alpha[(8 * y) * coverage_width + 8 * x]
            samples[y * latent_width + x] = (
                (255 if sample > 0 else 0) if profile == _INVOKE_PROFILE else sample
            )
    return Alpha8(
        shape=Shape(height=latent_height, width=latent_width),
        samples=bytes(samples),
    )


def smart_patch_world_coverage_to_processing(
    *,
    alpha: bytes,
    bbox: PreviewRect,
    processing_size: tuple[int, int],
) -> bytes:
    """Own Invoke4875 alpha>0 / nearest sampling for an independent Smart grid.

    sd/denoise_latents.py resizes the world tensor directly to the latent grid.
    This processing plane is the existing recipe ABI: its nearest8 samples are
    exactly floor(x*world_width/latent_width), likewise y. No PIL centered
    nearest resize, Smart KEEP intersection or display opacity enters this path.
    The caller has already validated world clipping and coverage classification.
    At most 512*512 bytes plus the immutable result are allocated here.
    """
    if type(cast(object, bbox)) is not dict or bbox.keys() != {"x", "y", "width", "height"}:
        raise IllustriousRegionalGeometryError("INPUT_INVALID", "Invalid Smart world bbox.")
    x, y, width, height = (bbox[key] for key in ("x", "y", "width", "height"))
    if (
        any(type(n) is not int for n in (x, y, width, height))
        or abs(x) > _MAX_ORIGIN
        or abs(y) > _MAX_ORIGIN
        or not 1 <= width <= _MAX_SIDE
        or not 1 <= height <= _MAX_SIDE
        or width * height > _MAX_AREA
        or type(alpha) is not bytes
        or len(alpha) != width * height
        or type(processing_size) is not tuple
        or len(processing_size) != 2
        or any(type(n) is not int or not 64 <= n <= 512 or n % 8 for n in processing_size)
    ):
        raise IllustriousRegionalGeometryError(
            "INPUT_INVALID", "Smart world pixels or processing dimensions exceed their bounds."
        )
    processing_width, processing_height = processing_size
    samples = bytearray(processing_width * processing_height)
    for row in range(processing_height):
        source_row = (row * height // processing_height) * width
        for column in range(processing_width):
            samples[row * processing_width + column] = (
                255 if alpha[source_row + column * width // processing_width] > 0 else 0
            )
    return bytes(samples)
