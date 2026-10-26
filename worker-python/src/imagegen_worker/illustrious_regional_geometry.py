"""Private ordinary-Canvas alpha8 sampling for an explicit Illustrious grid.

This profile is neither a public mask policy nor a model-quality claim. The
TypeScript projection has already applied the bbox origin; sampling is local to
that bbox, without absolute-grid snapping or image rescaling.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from imagegen_worker.illustrious_regional_attention import Alpha8, Shape

if TYPE_CHECKING:
    from imagegen_worker.compositor import PreviewRect

__all__ = (
    "IllustriousRegionalGeometryError",
    "ordinary_canvas_coverage_to_latent",
)

_ErrorCode = Literal["INPUT_INVALID", "PROFILE_INVALID", "LIMIT"]

_PROFILE = "ordinary-canvas-origin-nearest8-v1"
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
    profile: Literal["ordinary-canvas-origin-nearest8-v1"],
) -> Alpha8:
    """Sample raw local alpha at (8*y, 8*x) into detached immutable storage.

    Callers must not concurrently mutate rectangle metadata during this
    synchronous call. All rectangle values are snapshotted to local integers
    before geometry comparisons and sampling. No caller-owned metadata or
    alpha storage is retained in the result.

    A covered world plane may sample to all zeroes. Its original coverage kind
    remains the recipe owner's responsibility; no unrestricted fallback is
    inferred here. This helper selects no threshold or display-opacity policy.

    At most 62,500 output bytes and one 62,500-byte bytearray scratch are owned
    at once, excluding input bytes and Python metadata. Main's 64 MiB aggregate
    budget and the planner/adapter limits remain separate owners.
    """
    if type(profile) is not str or profile != _PROFILE:
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
            samples[y * latent_width + x] = alpha[(8 * y) * coverage_width + 8 * x]
    return Alpha8(
        shape=Shape(height=latent_height, width=latent_width),
        samples=bytes(samples),
    )
