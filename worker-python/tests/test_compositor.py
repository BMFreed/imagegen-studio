from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
import sys
import zlib
from dataclasses import replace
from pathlib import Path

import pytest
from PIL import Image

from imagegen_worker import compositor
from imagegen_worker.compositor import (
    ComposePreviewRequest,
    LayerTransform,
    PreviewLayer,
    compose_preview,
)
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.imports import PNG_SRGB_COLOR_CHUNKS
from imagegen_worker.protocol import process_request


def source_layer(
    directory: Path,
    name: str,
    image: Image.Image,
    *,
    x: float = 0,
    y: float = 0,
    opacity: float = 1,
    blend_mode: compositor.BlendMode = "normal",
    scale_x: float = 1,
    scale_y: float = 1,
    rotation_degrees: float = 0,
    image_format: str = "PNG",
    icc_profile: bytes | None = SRGB_ICC_PROFILE,
) -> PreviewLayer:
    path = directory / f"{name}.{image_format.lower()}"
    if icc_profile is None:
        image.save(path, format=image_format, lossless=True)
    else:
        image.save(path, format=image_format, lossless=True, icc_profile=icc_profile)
    return PreviewLayer(
        path=path,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        width=image.width,
        height=image.height,
        opacity=opacity,
        blend_mode=blend_mode,
        transform=LayerTransform(x, y, scale_x, scale_y, rotation_degrees),
    )


def request_for(tmp_path: Path, layers: tuple[PreviewLayer, ...]) -> ComposePreviewRequest:
    staging = tmp_path / "staging"
    staging.mkdir()
    return ComposePreviewRequest(
        layers=layers,
        staging_root=staging,
        merged_png_path=staging / "merged.png",
        thumbnail_webp_path=staging / "thumbnail.webp",
        thumbnail_max_side=64,
    )


def insert_png_color_chunk(source: bytes, kind: bytes, payload: bytes) -> bytes:
    image_data_start = 8
    while source[image_data_start + 4 : image_data_start + 8] != b"IDAT":
        length = int.from_bytes(source[image_data_start : image_data_start + 4], "big")
        image_data_start += length + 12
        assert image_data_start < len(source)
    chunk = (
        len(payload).to_bytes(4, "big")
        + kind
        + payload
        + zlib.crc32(kind + payload).to_bytes(4, "big")
    )
    return source[:image_data_start] + chunk + source[image_data_start:]


def test_visible_alpha_not_primary_bbox_drives_rect_and_encoded_outputs(tmp_path: Path) -> None:
    source = Image.new("RGBA", (6, 6))
    source.putpixel((2, 1), (80, 140, 220, 255))
    layer = source_layer(tmp_path, "top", source, x=-12, y=21)
    request = request_for(tmp_path, (layer,))

    result = compose_preview(request)

    assert result["status"] == "rendered"
    assert result["rect"] == {"x": -10, "y": 22, "width": 1, "height": 1}
    assert result["merged"] is not None
    assert result["thumbnail"] is not None
    with Image.open(request.merged_png_path) as image:
        assert image.format == "PNG"
        assert image.size == (1, 1)
        assert image.convert("RGBA").getpixel((0, 0)) == (80, 140, 220, 255)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
    with Image.open(request.thumbnail_webp_path) as image:
        assert image.format == "WEBP"
        assert image.size == (1, 1)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
    for info, path in (
        (result["merged"], request.merged_png_path),
        (result["thumbnail"], request.thumbnail_webp_path),
    ):
        assert info is not None
        assert info["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
        assert info["byteSize"] == path.stat().st_size
        assert info["colorSpace"] == "srgb"


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        ("normal", (200, 100, 50, 255)),
        ("multiply", (47, 39, 39, 255)),
        ("screen", (213, 161, 211, 255)),
        ("overlay", (94, 78, 167, 255)),
    ],
)
def test_top_first_layer_order_and_blend_modes(
    tmp_path: Path, mode: compositor.BlendMode, expected: tuple[int, int, int, int]
) -> None:
    top = source_layer(
        tmp_path, "top", Image.new("RGBA", (2, 2), (200, 100, 50, 255)), blend_mode=mode
    )
    bottom = source_layer(tmp_path, "bottom", Image.new("RGBA", (2, 2), (60, 100, 200, 255)))
    request = request_for(tmp_path, (top, bottom))

    result = compose_preview(request)

    assert result["status"] == "rendered"
    assert result["rect"] == {"x": 0, "y": 0, "width": 2, "height": 2}
    with Image.open(request.merged_png_path) as image:
        assert image.convert("RGBA").getpixel((0, 0)) == expected


def test_opacity_and_transparent_backdrop_keep_source_color(tmp_path: Path) -> None:
    top = source_layer(
        tmp_path,
        "top",
        Image.new("RGBA", (1, 1), (200, 100, 50, 255)),
        opacity=0.5,
        blend_mode="multiply",
    )
    request = request_for(tmp_path, (top,))
    result = compose_preview(request)
    assert result["status"] == "rendered"
    with Image.open(request.merged_png_path) as image:
        assert image.convert("RGBA").getpixel((0, 0)) == (200, 100, 50, 127)


def test_scale_and_clockwise_rotation_use_world_coordinates(tmp_path: Path) -> None:
    source = Image.new("RGBA", (2, 1), (0, 0, 0, 0))
    source.putpixel((0, 0), (255, 0, 0, 255))
    layer = source_layer(
        tmp_path,
        "rotated",
        source,
        x=7,
        y=-2,
        scale_x=2,
        scale_y=2,
        rotation_degrees=90,
    )
    request = request_for(tmp_path, (layer,))
    result = compose_preview(request)
    assert result["status"] == "rendered"
    rect = result["rect"]
    assert rect is not None
    assert rect["x"] >= 5 and rect["x"] + rect["width"] <= 7
    assert rect["y"] >= -2 and rect["y"] + rect["height"] <= 2
    with Image.open(request.merged_png_path) as image:
        assert image.getchannel("A").getbbox() is not None


def test_empty_preview_writes_no_artifacts_but_validates_frozen_sources(tmp_path: Path) -> None:
    transparent = source_layer(tmp_path, "transparent", Image.new("RGBA", (3, 2)))
    request = request_for(tmp_path, (transparent,))
    assert compose_preview(request) == {
        "status": "empty",
        "rect": None,
        "merged": None,
        "thumbnail": None,
    }
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()

    corrupt = replace(transparent, sha256="0" * 64)
    with pytest.raises(DerivativeError) as error:
        compose_preview(replace(request, layers=(corrupt,)))
    assert error.value.code == "INPUT_HASH_MISMATCH"


def test_rejects_wrong_dimensions_color_profile_and_format(tmp_path: Path) -> None:
    source = source_layer(tmp_path, "source", Image.new("RGBA", (2, 2), "red"))
    request = request_for(tmp_path, (replace(source, width=3),))
    with pytest.raises(DerivativeError) as error:
        compose_preview(request)
    assert error.value.code == "INVALID_IMAGE"

    adobe_icc = (Path(__file__).parent / "fixtures" / "AdobeRGB1998.icc").read_bytes()
    tagged = tmp_path / "adobe.png"
    Image.new("RGBA", (2, 2), "red").save(tagged, icc_profile=adobe_icc)
    layer = replace(
        source,
        path=tagged,
        sha256=hashlib.sha256(tagged.read_bytes()).hexdigest(),
    )
    with pytest.raises(DerivativeError) as error:
        compose_preview(replace(request, layers=(layer,)))
    assert error.value.code == "INPUT_COLOR_PROFILE"

    jpeg = tmp_path / "unsupported.jpg"
    Image.new("RGB", (2, 2), "red").save(jpeg)
    layer = replace(
        source,
        path=jpeg,
        sha256=hashlib.sha256(jpeg.read_bytes()).hexdigest(),
    )
    with pytest.raises(DerivativeError) as error:
        compose_preview(replace(request, layers=(layer,)))
    assert error.value.code == "INVALID_IMAGE"


@pytest.mark.parametrize("image_format", ["PNG", "WEBP"])
def test_untagged_srgb_layer_composes_and_outputs_pinned_icc(
    tmp_path: Path, image_format: str
) -> None:
    layer = source_layer(
        tmp_path,
        "untagged",
        Image.new("RGBA", (3, 2), (30, 70, 110, 255)),
        image_format=image_format,
        icc_profile=None,
    )
    request = request_for(tmp_path, (layer,))

    result = compose_preview(request)

    assert result["status"] == "rendered"
    assert result["rect"] == {"x": 0, "y": 0, "width": 3, "height": 2}
    with Image.open(request.merged_png_path) as image:
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
        assert image.convert("RGBA").getpixel((0, 0)) == (30, 70, 110, 255)
    with Image.open(request.thumbnail_webp_path) as image:
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE


def test_untagged_png_with_compatible_color_chunk_composes(tmp_path: Path) -> None:
    layer = source_layer(tmp_path, "srgb-chunk", Image.new("RGBA", (2, 2), "red"), icc_profile=None)
    layer.path.write_bytes(
        insert_png_color_chunk(layer.path.read_bytes(), b"gAMA", PNG_SRGB_COLOR_CHUNKS[b"gAMA"])
    )
    layer = replace(layer, sha256=hashlib.sha256(layer.path.read_bytes()).hexdigest())
    request = request_for(tmp_path, (layer,))
    assert compose_preview(request)["status"] == "rendered"


@pytest.mark.parametrize("icc_profile", [None, SRGB_ICC_PROFILE])
def test_png_conflicting_color_chunks_are_rejected(
    tmp_path: Path, icc_profile: bytes | None
) -> None:
    layer = source_layer(
        tmp_path,
        "conflict",
        Image.new("RGBA", (2, 2), "red"),
        icc_profile=icc_profile,
    )
    layer.path.write_bytes(
        insert_png_color_chunk(layer.path.read_bytes(), b"gAMA", (100_000).to_bytes(4, "big"))
    )
    layer = replace(layer, sha256=hashlib.sha256(layer.path.read_bytes()).hexdigest())
    request = request_for(tmp_path, (layer,))
    with pytest.raises(DerivativeError) as error:
        compose_preview(request)
    assert error.value.code == "INPUT_COLOR_PROFILE"
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()


def test_non_pinned_webp_icc_is_rejected(tmp_path: Path) -> None:
    adobe_icc = (Path(__file__).parent / "fixtures" / "AdobeRGB1998.icc").read_bytes()
    layer = source_layer(
        tmp_path,
        "adobe-webp",
        Image.new("RGBA", (2, 2), "red"),
        image_format="WEBP",
        icc_profile=adobe_icc,
    )
    request = request_for(tmp_path, (layer,))
    with pytest.raises(DerivativeError) as error:
        compose_preview(request)
    assert error.value.code == "INPUT_COLOR_PROFILE"
    assert not request.merged_png_path.exists()


def test_webp_layer_and_downsampled_world_rect(tmp_path: Path) -> None:
    source = source_layer(
        tmp_path,
        "webp",
        Image.new("RGBA", (8, 8), (20, 40, 60, 255)),
        scale_x=400,
        scale_y=400,
        image_format="WEBP",
    )
    request = request_for(tmp_path, (source,))
    result = compose_preview(request)
    assert result["status"] == "rendered"
    assert result["rect"] == {"x": 0, "y": 0, "width": 3200, "height": 3200}
    with Image.open(request.merged_png_path) as image:
        assert image.size == (compositor.MAX_PREVIEW_SIDE, compositor.MAX_PREVIEW_SIDE)


@pytest.mark.parametrize(
    ("rotation", "scale_x", "scale_y"),
    [(13, 1.5, 0.75), (-37, 2, 3), (90, 2, 2), (180, -1, 1)],
)
def test_rotated_alpha_rect_stays_inside_conservative_layer_geometry(
    tmp_path: Path, rotation: float, scale_x: float, scale_y: float
) -> None:
    source = Image.new("RGBA", (8, 7))
    source.putpixel((4, 3), (20, 40, 60, 255))
    layer = source_layer(
        tmp_path,
        "rotated",
        source,
        x=-23.5,
        y=16.25,
        scale_x=scale_x,
        scale_y=scale_y,
        rotation_degrees=rotation,
    )
    request = request_for(tmp_path, (layer,))
    result = compose_preview(request)
    assert result["status"] == "rendered"
    rect = result["rect"]
    assert rect is not None
    cosine = math.cos(math.radians(rotation))
    sine = math.sin(math.radians(rotation))
    full_corners = [
        (
            layer.transform.x + u * scale_x * cosine - v * scale_y * sine,
            layer.transform.y + u * scale_x * sine + v * scale_y * cosine,
        )
        for u, v in ((0, 0), (source.width, 0), (0, source.height), (source.width, source.height))
    ]
    left = math.floor(min(x for x, _ in full_corners))
    top = math.floor(min(y for _, y in full_corners))
    right = math.ceil(max(x for x, _ in full_corners))
    bottom = math.ceil(max(y for _, y in full_corners))
    assert left <= rect["x"] < rect["x"] + rect["width"] <= right
    assert top <= rect["y"] < rect["y"] + rect["height"] <= bottom


def test_aggregate_pixel_budget_rejects_before_decoding_or_publishing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = source_layer(tmp_path, "first", Image.new("RGBA", (2, 2), "red"))
    second = source_layer(tmp_path, "second", Image.new("RGBA", (2, 2), "blue"))
    request = request_for(tmp_path, (first, second))
    monkeypatch.setattr(compositor, "MAX_TOTAL_DECODED_PIXELS", 7)
    with pytest.raises(DerivativeError) as error:
        compose_preview(request)
    assert error.value.code == "IMAGE_TOO_LARGE"
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()


def test_visible_source_that_quantizes_away_is_not_reported_empty(tmp_path: Path) -> None:
    layer = source_layer(
        tmp_path,
        "faint",
        Image.new("RGBA", (1, 1), (20, 40, 60, 255)),
        opacity=0.001,
    )
    request = request_for(tmp_path, (layer,))
    with pytest.raises(DerivativeError) as error:
        compose_preview(request)
    assert error.value.code == "IMAGE_TOO_LARGE"
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()


def test_invalid_or_existing_output_does_not_replace_files(tmp_path: Path) -> None:
    layer = source_layer(tmp_path, "source", Image.new("RGBA", (2, 2), "red"))
    request = request_for(tmp_path, (layer,))
    request.merged_png_path.write_bytes(b"keep")
    with pytest.raises(DerivativeError) as error:
        compose_preview(request)
    assert error.value.code == "OUTPUT_UNAVAILABLE"
    assert request.merged_png_path.read_bytes() == b"keep"

    linked = tmp_path / "linked"
    linked.symlink_to(request.staging_root, target_is_directory=True)
    with pytest.raises(DerivativeError) as error:
        compose_preview(replace(request, merged_png_path=linked / "merged.png"))
    assert error.value.code == "INVALID_PATH"
    assert request.merged_png_path.read_bytes() == b"keep"


def test_second_publish_failure_removes_first_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    layer = source_layer(tmp_path, "source", Image.new("RGBA", (2, 2), "red"))
    request = request_for(tmp_path, (layer,))
    real_link = os.link
    calls = 0

    def fail_second_link(
        source: os.PathLike[str], destination: os.PathLike[str], *, follow_symlinks: bool
    ) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated disk failure")
        real_link(source, destination, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(compositor.os, "link", fail_second_link)
    with pytest.raises(DerivativeError) as error:
        compose_preview(request)
    assert error.value.code == "DERIVATIVE_FAILED"
    assert calls == 2
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()


def test_protocol_entrypoint_validates_shape_and_returns_preview_done(tmp_path: Path) -> None:
    layer = source_layer(tmp_path, "source", Image.new("RGBA", (2, 2), "red"))
    request = request_for(tmp_path, (layer,))
    payload: dict[str, object] = {
        "type": "compose-preview",
        "protocolVersion": "1",
        "requestId": "compose-1",
        "layers": [
            {
                "path": str(layer.path),
                "sha256": layer.sha256,
                "width": layer.width,
                "height": layer.height,
                "opacity": layer.opacity,
                "blendMode": layer.blend_mode,
                "transform": {
                    "x": layer.transform.x,
                    "y": layer.transform.y,
                    "scaleX": layer.transform.scale_x,
                    "scaleY": layer.transform.scale_y,
                    "rotationDegrees": layer.transform.rotation_degrees,
                },
            }
        ],
        "output": {
            "stagingRoot": str(request.staging_root),
            "mergedPngPath": str(request.merged_png_path),
            "thumbnailWebpPath": str(request.thumbnail_webp_path),
        },
        "thumbnailMaxSide": request.thumbnail_max_side,
    }
    result = process_request(payload)
    assert result["type"] == "preview-done"
    assert result["requestId"] == "compose-1"
    assert result["status"] == "rendered"
    assert result["rect"] == {"x": 0, "y": 0, "width": 2, "height": 2}

    extra = {**payload, "unexpected": True}
    assert process_request(extra)["code"] == "INVALID_REQUEST"


def test_real_json_lines_worker_composes_preview(tmp_path: Path) -> None:
    layer = source_layer(
        tmp_path, "source", Image.new("RGBA", (2, 2), (40, 80, 120, 255)), x=-3, y=7
    )
    request = request_for(tmp_path, (layer,))
    command = {
        "type": "compose-preview",
        "protocolVersion": "1",
        "requestId": "real-compose",
        "layers": [
            {
                "path": str(layer.path),
                "sha256": layer.sha256,
                "width": 2,
                "height": 2,
                "opacity": 1,
                "blendMode": "normal",
                "transform": {
                    "x": -3,
                    "y": 7,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotationDegrees": 0,
                },
            }
        ],
        "output": {
            "stagingRoot": str(request.staging_root),
            "mergedPngPath": str(request.merged_png_path),
            "thumbnailWebpPath": str(request.thumbnail_webp_path),
        },
        "thumbnailMaxSide": 64,
    }
    execution = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input=json.dumps(command) + "\n",
        text=True,
        capture_output=True,
        check=True,
        timeout=15,
    )
    assert execution.stderr == ""
    ready, completed = [json.loads(line) for line in execution.stdout.splitlines()]
    assert "preview-composition" in ready["capabilities"]
    assert completed["type"] == "preview-done"
    assert completed["requestId"] == "real-compose"
    assert completed["status"] == "rendered"
    assert completed["rect"] == {"x": -3, "y": 7, "width": 2, "height": 2}
    assert (
        completed["merged"]["sha256"]
        == hashlib.sha256(request.merged_png_path.read_bytes()).hexdigest()
    )
