"""Bounded project preview composition from frozen sRGB raster assets."""

from __future__ import annotations

import io
import math
import os
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypedDict

from PIL import Image, ImageChops, UnidentifiedImageError

from imagegen_worker.derivatives import (
    MAX_IMAGE_PIXELS,
    MAX_IMAGE_SIDE,
    MAX_INPUT_BYTES,
    MAX_THUMBNAIL_SIDE,
    MIN_THUMBNAIL_SIDE,
    SRGB_ICC_PROFILE,
    ArtifactInfo,
    DerivativeError,
    artifact_info,
    canonical_absolute_path,
    read_snapshot,
    write_temporary_image,
)
from imagegen_worker.imports import png_embedded_color_metadata, webp_embedded_icc

BlendMode = Literal["normal", "multiply", "screen", "overlay"]
MAX_LAYERS = 256
MAX_PREVIEW_SIDE = 2048
MAX_TARGET_SIDE = 2048
MAX_TARGET_PIXELS = 4_000_000
MAX_TOTAL_DECODED_PIXELS = 128_000_000
MAX_WORLD_COORDINATE = 2_147_483_647
MAX_LAYER_SCALE = 1024
MAX_PREVIEW_COORDINATE = 2_200_000_000
MAX_PREVIEW_EXTENT = 4_400_000_000


@dataclass(frozen=True)
class LayerTransform:
    x: float
    y: float
    scale_x: float
    scale_y: float
    rotation_degrees: float


@dataclass(frozen=True)
class PreviewLayer:
    path: Path
    sha256: str
    width: int
    height: int
    opacity: float
    blend_mode: BlendMode
    transform: LayerTransform


@dataclass(frozen=True)
class ComposePreviewRequest:
    layers: tuple[PreviewLayer, ...]
    staging_root: Path
    merged_png_path: Path
    thumbnail_webp_path: Path
    thumbnail_max_side: int


@dataclass(frozen=True)
class ComposeExportRequest:
    """One exact image export; absent bbox selects actual visible-content bounds."""

    layers: tuple[PreviewLayer, ...]
    staging_root: Path
    composite_png_path: Path
    bbox: PreviewRect | None = None


@dataclass(frozen=True)
class ComposeTargetRequest:
    layers: tuple[PreviewLayer, ...]
    bbox: PreviewRect
    staging_root: Path
    target_png_path: Path


class PreviewRect(TypedDict):
    x: int
    y: int
    width: int
    height: int


class ComposePreviewResult(TypedDict):
    status: Literal["rendered", "empty"]
    rect: PreviewRect | None
    merged: ArtifactInfo | None
    thumbnail: ArtifactInfo | None


class ComposeExportResult(TypedDict):
    status: Literal["rendered", "empty"]
    rect: PreviewRect | None
    composite: ArtifactInfo | None


class ComposeTargetResult(TypedDict):
    mode: Literal["txt2img", "outpaint", "img2img"]
    rect: PreviewRect
    composite: ArtifactInfo


def _validate_output_paths(request: ComposePreviewRequest) -> tuple[Path, Path]:
    root = canonical_absolute_path(request.staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    merged = canonical_absolute_path(request.merged_png_path, label="Merged output")
    thumbnail = canonical_absolute_path(request.thumbnail_webp_path, label="Thumbnail output")
    if merged == thumbnail:
        raise DerivativeError("INVALID_PATH", "Preview output paths must be distinct.")
    for destination, expected_suffix in ((merged, ".png"), (thumbnail, ".webp")):
        if destination.suffix.lower() != expected_suffix or root not in destination.parents:
            raise DerivativeError(
                "INVALID_PATH", "Output must be inside staging with its expected format."
            )
        parent = canonical_absolute_path(destination.parent, label="Output directory")
        if not parent.is_dir() or os.path.lexists(destination):
            raise DerivativeError(
                "OUTPUT_UNAVAILABLE", "Output directory is missing or output already exists."
            )
    return merged, thumbnail


def _validate_target_path(request: ComposeTargetRequest) -> Path:
    return _validate_single_png_path(request.staging_root, request.target_png_path)


def _validate_single_png_path(staging_root: Path, output_path: Path) -> Path:
    root = canonical_absolute_path(staging_root, label="Staging root")
    if not root.is_dir():
        raise DerivativeError("INVALID_PATH", "Staging root must be an existing directory.")
    destination = canonical_absolute_path(output_path, label="Target output")
    if destination.suffix.lower() != ".png" or root not in destination.parents:
        raise DerivativeError("INVALID_PATH", "Target output must be a PNG inside staging.")
    parent = canonical_absolute_path(destination.parent, label="Output directory")
    if not parent.is_dir() or os.path.lexists(destination):
        raise DerivativeError(
            "OUTPUT_UNAVAILABLE", "Output directory is missing or output already exists."
        )
    return destination


def _validate_layer(layer: PreviewLayer, outputs: tuple[Path, ...]) -> Path:
    source = canonical_absolute_path(layer.path, label="Layer input")
    if source in outputs:
        raise DerivativeError("INVALID_PATH", "Layer input and preview output must be distinct.")
    if (
        not 1 <= layer.width <= MAX_IMAGE_SIDE
        or not 1 <= layer.height <= MAX_IMAGE_SIDE
        or layer.width * layer.height > MAX_IMAGE_PIXELS
    ):
        raise DerivativeError("IMAGE_TOO_LARGE", "Layer dimensions exceed the worker limit.")
    if not math.isfinite(layer.opacity) or not 0 <= layer.opacity <= 1:
        raise DerivativeError("INVALID_REQUEST", "Layer opacity is outside the supported range.")
    transform = layer.transform
    if (
        not all(
            math.isfinite(value)
            for value in (
                transform.x,
                transform.y,
                transform.scale_x,
                transform.scale_y,
                transform.rotation_degrees,
            )
        )
        or abs(transform.x) > MAX_WORLD_COORDINATE
        or abs(transform.y) > MAX_WORLD_COORDINATE
        or transform.scale_x == 0
        or transform.scale_y == 0
        or abs(transform.scale_x) > MAX_LAYER_SCALE
        or abs(transform.scale_y) > MAX_LAYER_SCALE
        or abs(transform.rotation_degrees) > 360
    ):
        raise DerivativeError("INVALID_REQUEST", "Layer transform is outside the supported range.")
    return source


def _decode_layer(source: Path, layer: PreviewLayer) -> Image.Image:
    snapshot = read_snapshot(source, layer.sha256)
    if snapshot.startswith(b"\x89PNG\r\n\x1a\n"):
        container_format = "PNG"
        profile, has_non_srgb_color_chunk = png_embedded_color_metadata(snapshot)
        if has_non_srgb_color_chunk:
            raise DerivativeError("INPUT_COLOR_PROFILE", "PNG has conflicting color metadata.")
    elif snapshot[:4] == b"RIFF" and snapshot[8:12] == b"WEBP":
        container_format = "WEBP"
        profile = webp_embedded_icc(snapshot)
    else:
        raise DerivativeError("INVALID_IMAGE", "Layer must be a PNG or WebP image.")
    if profile is not None and profile != SRGB_ICC_PROFILE:
        raise DerivativeError("INPUT_COLOR_PROFILE", "Layer has a non-sRGB embedded color profile.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(snapshot)) as decoded:
                if decoded.format != container_format:
                    raise DerivativeError("INVALID_IMAGE", "Layer image format is inconsistent.")
                if getattr(decoded, "n_frames", 1) != 1:
                    raise DerivativeError("INVALID_IMAGE", "Animated layers are not supported.")
                if decoded.size != (layer.width, layer.height):
                    raise DerivativeError(
                        "INVALID_IMAGE", "Layer dimensions differ from the frozen document."
                    )
                if decoded.info.get("icc_profile") != profile:
                    raise DerivativeError(
                        "INPUT_COLOR_PROFILE", "Layer color metadata is inconsistent."
                    )
                decoded.load()
                return decoded.convert("RGBA")
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
    ) as error:
        raise DerivativeError("INVALID_IMAGE", "Layer is not a supported image.") from error


def _trigonometry(rotation_degrees: float) -> tuple[float, float]:
    # Match the renderer and main-process conservative bounds formula.
    radians = (rotation_degrees * math.pi) / 180
    return math.cos(radians), math.sin(radians)


def _transformed_bounds(
    layer: PreviewLayer, alpha_bounds: tuple[int, int, int, int]
) -> PreviewRect:
    transform = layer.transform
    cosine, sine = _trigonometry(transform.rotation_degrees)
    left, top, right, bottom = alpha_bounds
    points: list[tuple[float, float]] = []
    for u, v in ((left, top), (left, bottom), (right, top), (right, bottom)):
        scaled_x, scaled_y = u * transform.scale_x, v * transform.scale_y
        points.append(
            (
                transform.x + scaled_x * cosine - scaled_y * sine,
                transform.y + scaled_x * sine + scaled_y * cosine,
            )
        )
    min_x = math.floor(min(point[0] for point in points))
    min_y = math.floor(min(point[1] for point in points))
    max_x = math.ceil(max(point[0] for point in points))
    max_y = math.ceil(max(point[1] for point in points))
    return {
        "x": min_x,
        "y": min_y,
        "width": max(1, max_x - min_x),
        "height": max(1, max_y - min_y),
    }


def _union_bounds(bounds: list[PreviewRect]) -> PreviewRect:
    left = min(rect["x"] for rect in bounds)
    top = min(rect["y"] for rect in bounds)
    right = max(rect["x"] + rect["width"] for rect in bounds)
    bottom = max(rect["y"] + rect["height"] for rect in bounds)
    if (
        abs(left) > MAX_PREVIEW_COORDINATE
        or abs(top) > MAX_PREVIEW_COORDINATE
        or right > MAX_PREVIEW_COORDINATE
        or bottom > MAX_PREVIEW_COORDINATE
        or right - left > MAX_PREVIEW_EXTENT
        or bottom - top > MAX_PREVIEW_EXTENT
    ):
        raise DerivativeError("IMAGE_TOO_LARGE", "Preview world bounds exceed the worker limit.")
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def _rasterize(
    layer: PreviewLayer, source: Image.Image, rect: PreviewRect, scale: float
) -> Image.Image:
    transform = layer.transform
    cosine, sine = _trigonometry(transform.rotation_degrees)
    origin_x = rect["x"] - transform.x
    origin_y = rect["y"] - transform.y
    inverse = (
        cosine / (transform.scale_x * scale),
        sine / (transform.scale_x * scale),
        (cosine * origin_x + sine * origin_y) / transform.scale_x,
        -sine / (transform.scale_y * scale),
        cosine / (transform.scale_y * scale),
        (-sine * origin_x + cosine * origin_y) / transform.scale_y,
    )
    output_size = (
        max(1, math.ceil(rect["width"] * scale)),
        max(1, math.ceil(rect["height"] * scale)),
    )
    rendered = source.transform(
        output_size,
        Image.Transform.AFFINE,
        inverse,
        resample=Image.Resampling.BICUBIC,
    )
    if layer.opacity < 1:
        alpha = Image.blend(
            Image.new("L", rendered.size),
            rendered.getchannel("A"),
            layer.opacity,
        )
        rendered.putalpha(alpha)
    return rendered


def _blend(backdrop: Image.Image, source: Image.Image, mode: BlendMode) -> Image.Image:
    if mode == "normal":
        return Image.alpha_composite(backdrop, source)
    backdrop_rgb = backdrop.convert("RGB")
    source_rgb = source.convert("RGB")
    if mode == "multiply":
        blended = ImageChops.multiply(backdrop_rgb, source_rgb)
    elif mode == "screen":
        blended = ImageChops.screen(backdrop_rgb, source_rgb)
    else:
        blended = ImageChops.overlay(backdrop_rgb, source_rgb)
    # A blend mode acts only where the backdrop exists; over transparent pixels
    # the source keeps its own colors. Pillow's alpha_composite then applies
    # source-over with the source opacity.
    blended_source = Image.composite(blended, source_rgb, backdrop.getchannel("A"))
    blended_source.putalpha(source.getchannel("A"))
    return Image.alpha_composite(backdrop, blended_source)


def _publish(
    merged: Path, thumbnail: Path, image: Image.Image, thumb_image: Image.Image
) -> tuple[ArtifactInfo, ArtifactInfo]:
    temporary: list[Path] = []
    published: list[Path] = []
    succeeded = False
    try:
        temporary.append(write_temporary_image(image, merged, "PNG"))
        temporary.append(write_temporary_image(thumb_image, thumbnail, "WEBP"))
        for candidate, destination in zip(temporary, (merged, thumbnail), strict=True):
            os.link(candidate, destination, follow_symlinks=False)
            published.append(destination)
        for directory in {merged.parent, thumbnail.parent}:
            directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        result = (artifact_info(merged, image), artifact_info(thumbnail, thumb_image))
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "An output path already exists.") from error
    except OSError as error:
        raise DerivativeError("DERIVATIVE_FAILED", "Preview could not be stored.") from error
    finally:
        for candidate in temporary:
            candidate.unlink(missing_ok=True)
        if not succeeded:
            for destination in published:
                destination.unlink(missing_ok=True)


def _publish_target(
    destination: Path, image: Image.Image, *, max_bytes: int | None = None
) -> ArtifactInfo:
    temporary: Path | None = None
    published = False
    succeeded = False
    try:
        temporary = write_temporary_image(image, destination, "PNG")
        if max_bytes is not None and temporary.stat().st_size > max_bytes:
            raise DerivativeError("IMAGE_TOO_LARGE", "Export PNG exceeds the encoded byte limit.")
        os.link(temporary, destination, follow_symlinks=False)
        published = True
        directory_fd = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        result = artifact_info(destination, image)
        succeeded = True
        return result
    except FileExistsError as error:
        raise DerivativeError("OUTPUT_UNAVAILABLE", "An output path already exists.") from error
    except OSError as error:
        raise DerivativeError(
            "DERIVATIVE_FAILED", "Target composite could not be stored."
        ) from error
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        if published and not succeeded:
            destination.unlink(missing_ok=True)


def compose_target(request: ComposeTargetRequest) -> ComposeTargetResult:
    """Compose exactly the frozen finite bbox; no preview cropping or downsampling."""
    bbox = request.bbox
    if (
        type(bbox["x"]) is not int
        or type(bbox["y"]) is not int
        or abs(bbox["x"]) > MAX_WORLD_COORDINATE
        or abs(bbox["y"]) > MAX_WORLD_COORDINATE
        or type(bbox["width"]) is not int
        or type(bbox["height"]) is not int
        or bbox["width"] < 1
        or bbox["height"] < 1
    ):
        raise DerivativeError("INVALID_REQUEST", "Target bbox must have bounded integer geometry.")
    if (
        bbox["width"] > MAX_TARGET_SIDE
        or bbox["height"] > MAX_TARGET_SIDE
        or bbox["width"] * bbox["height"] > MAX_TARGET_PIXELS
    ):
        raise DerivativeError("IMAGE_TOO_LARGE", "Target bbox exceeds the worker pixel limit.")
    if len(request.layers) > MAX_LAYERS:
        raise DerivativeError("INVALID_REQUEST", "Target has too many layers.")
    if sum(layer.width * layer.height for layer in request.layers) > MAX_TOTAL_DECODED_PIXELS:
        raise DerivativeError("IMAGE_TOO_LARGE", "Target inputs exceed the worker pixel budget.")
    output = _validate_target_path(request)
    sources = tuple(_validate_layer(layer, (output,)) for layer in request.layers)
    composite = Image.new("RGBA", (bbox["width"], bbox["height"]))
    for layer, source in reversed(tuple(zip(request.layers, sources, strict=True))):
        # Decode every frozen source, including off-bbox and zero-opacity layers, before publishing.
        image = _decode_layer(source, layer)
        if layer.opacity == 0:
            continue
        rendered = _rasterize(layer, image, bbox, 1.0)
        composite = _blend(composite, rendered, layer.blend_mode)
    minimum_alpha, maximum_alpha = composite.getchannel("A").getextrema()
    mode: Literal["txt2img", "outpaint", "img2img"]
    if maximum_alpha == 0:
        mode = "txt2img"
    elif minimum_alpha == 255:
        mode = "img2img"
    else:
        mode = "outpaint"
    return {"mode": mode, "rect": bbox, "composite": _publish_target(output, composite)}


def _visible_content_bounds(
    layers: tuple[PreviewLayer, ...], sources: tuple[Path, ...]
) -> list[PreviewRect]:
    bounds: list[PreviewRect] = []
    for layer, source in zip(layers, sources, strict=True):
        image = _decode_layer(source, layer)
        if layer.opacity > 0 and (alpha_bounds := image.getchannel("A").getbbox()) is not None:
            bounds.append(_transformed_bounds(layer, alpha_bounds))
        del image
    return bounds


def _render_composite(
    layers: tuple[PreviewLayer, ...],
    sources: tuple[Path, ...],
    rect: PreviewRect,
    scale: float,
    *,
    require_visible_layers: bool,
) -> Image.Image:
    output_size = (
        max(1, math.ceil(rect["width"] * scale)),
        max(1, math.ceil(rect["height"] * scale)),
    )
    composite = Image.new("RGBA", output_size)
    for layer, source in reversed(tuple(zip(layers, sources, strict=True))):
        if layer.opacity == 0:
            continue
        image = _decode_layer(source, layer)
        if image.getchannel("A").getbbox() is None:
            del image
            continue
        rendered = _rasterize(layer, image, rect, scale)
        del image
        if require_visible_layers and rendered.getchannel("A").getbbox() is None:
            raise DerivativeError(
                "IMAGE_TOO_LARGE", "Visible pixels cannot be represented in preview."
            )
        composite = _blend(composite, rendered, layer.blend_mode)
        del rendered
    return composite


def _crop_visible_composite(
    composite: Image.Image, full_rect: PreviewRect, scale: float
) -> tuple[Image.Image, PreviewRect]:
    alpha_box = composite.getchannel("A").getbbox()
    if alpha_box is None:
        # A very small distant source may vanish at the bounded preview scale.
        # Do not misclassify known source pixels as an empty Project.
        raise DerivativeError("IMAGE_TOO_LARGE", "Visible pixels cannot be represented in preview.")
    pixel_left, pixel_top, pixel_right, pixel_bottom = alpha_box
    left = max(full_rect["x"], full_rect["x"] + math.floor(pixel_left / scale))
    top = max(full_rect["y"], full_rect["y"] + math.floor(pixel_top / scale))
    right = min(
        full_rect["x"] + full_rect["width"],
        full_rect["x"] + math.ceil(pixel_right / scale),
    )
    bottom = min(
        full_rect["y"] + full_rect["height"],
        full_rect["y"] + math.ceil(pixel_bottom / scale),
    )
    rect: PreviewRect = {
        "x": left,
        "y": top,
        "width": max(1, right - left),
        "height": max(1, bottom - top),
    }
    return composite.crop(alpha_box), rect


def compose_preview(request: ComposePreviewRequest) -> ComposePreviewResult:
    if not 0 <= len(request.layers) <= MAX_LAYERS:
        raise DerivativeError("INVALID_REQUEST", "Preview has too many layers.")
    if not MIN_THUMBNAIL_SIDE <= request.thumbnail_max_side <= MAX_THUMBNAIL_SIDE:
        raise DerivativeError("INVALID_REQUEST", "Thumbnail side is outside the supported range.")
    outputs = _validate_output_paths(request)
    sources = tuple(_validate_layer(layer, outputs) for layer in request.layers)
    if sum(layer.width * layer.height for layer in request.layers) > MAX_TOTAL_DECODED_PIXELS:
        raise DerivativeError("IMAGE_TOO_LARGE", "Preview inputs exceed the worker pixel budget.")
    # Validate every provided layer, including zero-opacity layers, before returning
    # an empty result. Otherwise a corrupted source could be silently accepted.
    bounds = _visible_content_bounds(request.layers, sources)
    if not bounds:
        return {"status": "empty", "rect": None, "merged": None, "thumbnail": None}
    full_rect = _union_bounds(bounds)
    scale = min(
        1.0,
        MAX_PREVIEW_SIDE / full_rect["width"],
        MAX_PREVIEW_SIDE / full_rect["height"],
    )
    composite = _render_composite(
        request.layers, sources, full_rect, scale, require_visible_layers=True
    )
    image, rect = _crop_visible_composite(composite, full_rect, scale)
    thumb_image = image.copy()
    thumb_image.thumbnail(
        (request.thumbnail_max_side, request.thumbnail_max_side), Image.Resampling.LANCZOS
    )
    merged_info, thumb_info = _publish(*outputs, image, thumb_image)
    return {
        "status": "rendered",
        "rect": rect,
        "merged": merged_info,
        "thumbnail": thumb_info,
    }


def compose_export(request: ComposeExportRequest) -> ComposeExportResult:
    """Invoke content-vs-rect export adapted to the existing exact sRGB CPU compositor.

    Invoke4875 exportCanvasComposite/exportRasterComposite snapshot/rect contract;
    Studio's shared alpha bounds, Smart-projected layers and pinned ICC remain authoritative.
    No preview rescaling, target classification, Project mutation or source crop occurs.
    """
    if len(request.layers) > MAX_LAYERS:
        raise DerivativeError("INVALID_REQUEST", "Export has too many layers.")
    if sum(layer.width * layer.height for layer in request.layers) > MAX_TOTAL_DECODED_PIXELS:
        raise DerivativeError("IMAGE_TOO_LARGE", "Export inputs exceed the worker pixel budget.")
    if request.bbox is not None:
        _validate_export_rect(request.bbox)
    # Reuse the same staged single-PNG no-overwrite path/publication owner as target composition.
    output = _validate_single_png_path(request.staging_root, request.composite_png_path)
    sources = tuple(_validate_layer(layer, (output,)) for layer in request.layers)
    bounds = _visible_content_bounds(request.layers, sources)
    if not bounds:
        return {"status": "empty", "rect": None, "composite": None}
    rect = request.bbox if request.bbox is not None else _union_bounds(bounds)
    _validate_export_rect(rect)
    image = _render_composite(
        request.layers, sources, rect, 1.0, require_visible_layers=request.bbox is None
    )
    if request.bbox is None:
        image, rect = _crop_visible_composite(image, rect, 1.0)
    return {
        "status": "rendered",
        "rect": rect,
        "composite": _publish_target(output, image, max_bytes=MAX_INPUT_BYTES),
    }


def _validate_export_rect(rect: PreviewRect) -> None:
    if (
        any(
            type(value) is not int
            for value in (rect["x"], rect["y"], rect["width"], rect["height"])
        )
        or abs(rect["x"]) > MAX_PREVIEW_COORDINATE
        or abs(rect["y"]) > MAX_PREVIEW_COORDINATE
        or rect["x"] + rect["width"] > MAX_PREVIEW_COORDINATE
        or rect["y"] + rect["height"] > MAX_PREVIEW_COORDINATE
        or rect["width"] < 1
        or rect["height"] < 1
    ):
        raise DerivativeError(
            "INVALID_REQUEST", "Export bounds must have bounded integer geometry."
        )
    if (
        rect["width"] > MAX_IMAGE_SIDE
        or rect["height"] > MAX_IMAGE_SIDE
        or rect["width"] * rect["height"] > MAX_IMAGE_PIXELS
    ):
        raise DerivativeError("IMAGE_TOO_LARGE", "Export bounds exceed the image pixel limit.")
