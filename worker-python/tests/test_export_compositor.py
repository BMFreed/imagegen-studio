"""Exact image export through the real existing Pillow compositor and JSON protocol."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path
from typing import cast

import pytest
from PIL import Image

from imagegen_worker import compositor
from imagegen_worker.compositor import (
    BlendMode,
    ComposeExportRequest,
    LayerTransform,
    PreviewLayer,
    PreviewRect,
    compose_export,
)
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.protocol import process_request, ready_message


def source(
    root: Path,
    image: Image.Image,
    *,
    name: str = "source",
    x: float = 0,
    y: float = 0,
    opacity: float = 1,
    scale_x: float = 1,
    mode: BlendMode = "normal",
) -> PreviewLayer:
    path = root / f"{name}.png"
    image.save(path, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    return PreviewLayer(
        path,
        hashlib.sha256(path.read_bytes()).hexdigest(),
        image.width,
        image.height,
        opacity,
        mode,
        LayerTransform(x, y, scale_x, 1, 0),
    )


def request(root: Path, layers: tuple[PreviewLayer, ...] = ()) -> ComposeExportRequest:
    staging = root / "stage"
    staging.mkdir()
    return ComposeExportRequest(layers, staging, staging / "export.png")


def pixels(path: Path) -> list[tuple[int, int, int, int]]:
    with Image.open(path) as image:
        return cast(list[tuple[int, int, int, int]], list(image.get_flattened_data()))


def test_content_uses_actual_alpha_world_bounds_and_canonical_rgba(tmp_path: Path) -> None:
    image = Image.new("RGBA", (5, 3))
    image.putpixel((2, 1), (7, 9, 11, 255))
    frozen = request(tmp_path, (source(tmp_path, image, x=-7, y=4),))
    result = compose_export(frozen)
    assert result["status"] == "rendered"
    assert result["rect"] == {"x": -5, "y": 5, "width": 1, "height": 1}
    metadata = result["composite"]
    assert metadata is not None
    assert metadata["sha256"] == hashlib.sha256(frozen.composite_png_path.read_bytes()).hexdigest()
    assert metadata["byteSize"] == frozen.composite_png_path.stat().st_size
    assert metadata["width"] == metadata["height"] == 1
    with Image.open(frozen.composite_png_path) as actual:
        assert actual.mode == "RGBA"
        assert actual.info["icc_profile"] == SRGB_ICC_PROFILE
    assert pixels(frozen.composite_png_path) == [(7, 9, 11, 255)]
    assert list(frozen.staging_root.iterdir()) == [frozen.composite_png_path]


def test_export_above_preview_and_generation_side_is_exact_without_resize(tmp_path: Path) -> None:
    image = Image.new("RGBA", (2051, 1), (17, 23, 41, 255))
    image.putpixel((2050, 0), (255, 0, 0, 255))
    frozen = request(tmp_path, (source(tmp_path, image, x=-2050),))
    result = compose_export(frozen)
    assert result["rect"] == {"x": -2050, "y": 0, "width": 2051, "height": 1}
    actual = pixels(frozen.composite_png_path)
    assert len(actual) == 2051
    assert actual[:-1] == [(17, 23, 41, 255)] * 2050
    assert actual[-1] == (255, 0, 0, 255)


def test_bbox_preserves_exact_requested_rect_and_transparent_margin(tmp_path: Path) -> None:
    frozen = request(tmp_path, (source(tmp_path, Image.new("RGBA", (1, 1), (7, 8, 9, 255))),))
    bbox: PreviewRect = {"x": -1, "y": -1, "width": 3, "height": 3}
    result = compose_export(replace(frozen, bbox=bbox))
    assert result["rect"] == bbox
    assert (
        pixels(frozen.composite_png_path)
        == [(0, 0, 0, 0)] * 4 + [(7, 8, 9, 255)] + [(0, 0, 0, 0)] * 4
    )


def test_bbox_outside_visible_content_exports_transparent_exact_pixels(tmp_path: Path) -> None:
    frozen = request(tmp_path, (source(tmp_path, Image.new("RGBA", (1, 1), (1, 2, 3, 255)), x=20),))
    bbox: PreviewRect = {"x": -3, "y": 5, "width": 3, "height": 2}
    assert compose_export(replace(frozen, bbox=bbox))["rect"] == bbox
    assert pixels(frozen.composite_png_path) == [(0, 0, 0, 0)] * 6


@pytest.mark.parametrize("kind", ["no-layers", "transparent", "zero-opacity"])
@pytest.mark.parametrize("explicit_bbox", [False, True])
def test_empty_project_has_no_output_for_either_export(
    tmp_path: Path, kind: str, explicit_bbox: bool
) -> None:
    layers = (
        ()
        if kind == "no-layers"
        else (
            source(
                tmp_path,
                Image.new("RGBA", (2, 2), (1, 2, 3, 0 if kind == "transparent" else 255)),
                opacity=0 if kind == "zero-opacity" else 1,
            ),
        )
    )
    frozen = request(tmp_path, layers)
    if explicit_bbox:
        frozen = replace(frozen, bbox={"x": 0, "y": 0, "width": 2, "height": 2})
    assert compose_export(frozen) == {"status": "empty", "rect": None, "composite": None}
    assert list(frozen.staging_root.iterdir()) == []


def test_top_first_blend_order_and_negative_scale_use_shared_compositor(tmp_path: Path) -> None:
    top = source(
        tmp_path,
        Image.new("RGBA", (2, 1), (200, 100, 50, 255)),
        name="top",
        x=5,
        y=-2,
        scale_x=-1,
        mode="multiply",
    )
    bottom = source(
        tmp_path, Image.new("RGBA", (2, 1), (60, 100, 200, 255)), name="bottom", x=3, y=-2
    )
    frozen = request(tmp_path, (top, bottom))
    assert compose_export(frozen)["rect"] == {"x": 3, "y": -2, "width": 2, "height": 1}
    assert pixels(frozen.composite_png_path) == [(47, 39, 39, 255)] * 2


def test_wrong_profile_and_changed_zero_opacity_source_fail_without_output(tmp_path: Path) -> None:
    frozen = request(tmp_path)
    path = tmp_path / "adobe.png"
    Image.new("RGBA", (1, 1), (1, 2, 3, 255)).save(
        path, icc_profile=(Path(__file__).parent / "fixtures/AdobeRGB1998.icc").read_bytes()
    )
    bad = PreviewLayer(
        path,
        hashlib.sha256(path.read_bytes()).hexdigest(),
        1,
        1,
        0,
        "normal",
        LayerTransform(0, 0, 1, 1, 0),
    )
    with pytest.raises(DerivativeError) as failure:
        compose_export(replace(frozen, layers=(bad,)))
    assert failure.value.code == "INPUT_COLOR_PROFILE"
    with pytest.raises(DerivativeError) as failure:
        compose_export(replace(frozen, layers=(replace(bad, sha256="0" * 64),)))
    assert failure.value.code == "INPUT_HASH_MISMATCH"
    assert list(frozen.staging_root.iterdir()) == []


@pytest.mark.parametrize("width,height", [(16385, 1), (8001, 8000)])
def test_export_capacity_refuses_before_allocating_output(
    tmp_path: Path, width: int, height: int
) -> None:
    frozen = request(tmp_path)
    with pytest.raises(DerivativeError) as failure:
        compose_export(replace(frozen, bbox={"x": 0, "y": 0, "width": width, "height": height}))
    assert failure.value.code == "IMAGE_TOO_LARGE"
    assert list(frozen.staging_root.iterdir()) == []


def test_encoded_byte_limit_refuses_and_removes_temporary_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frozen = request(tmp_path, (source(tmp_path, Image.new("RGBA", (1, 1), (1, 2, 3, 255))),))
    monkeypatch.setattr(compositor, "MAX_INPUT_BYTES", 1)
    with pytest.raises(DerivativeError) as failure:
        compose_export(frozen)
    assert failure.value.code == "IMAGE_TOO_LARGE"
    assert list(frozen.staging_root.iterdir()) == []


def test_no_overwrite_and_failed_publication_leave_original_or_no_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frozen = request(tmp_path, (source(tmp_path, Image.new("RGBA", (1, 1), (1, 2, 3, 255))),))
    frozen.composite_png_path.write_bytes(b"keep")
    with pytest.raises(DerivativeError) as failure:
        compose_export(frozen)
    assert failure.value.code == "OUTPUT_UNAVAILABLE"
    assert frozen.composite_png_path.read_bytes() == b"keep"
    next_request = replace(frozen, composite_png_path=frozen.staging_root / "next.png")

    def fail_link(
        _source: os.PathLike[str], _target: os.PathLike[str], *, follow_symlinks: bool
    ) -> None:
        assert not follow_symlinks
        raise OSError("owned simulated publication failure")

    monkeypatch.setattr(compositor.os, "link", fail_link)
    with pytest.raises(DerivativeError) as failure:
        compose_export(next_request)
    assert failure.value.code == "DERIVATIVE_FAILED"
    assert list(frozen.staging_root.iterdir()) == [frozen.composite_png_path]


def payload(frozen: ComposeExportRequest) -> dict[str, object]:
    return {
        "type": "compose-export",
        "protocolVersion": "1",
        "requestId": "export-1",
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
            for layer in frozen.layers
        ],
        "output": {
            "stagingRoot": str(frozen.staging_root),
            "compositePngPath": str(frozen.composite_png_path),
        },
    }


@pytest.mark.parametrize(
    "extra",
    [
        {"unexpected": True},
        {"bbox": None},
        {"bbox": {"x": True, "y": 0, "width": 1, "height": 1}},
        {"bbox": {"x": 0, "y": 0, "width": 0, "height": 1}},
        {"layers": [None]},
        {"layers": [None] * 257},
    ],
)
def test_protocol_rejects_unknown_or_malformed_fields(
    tmp_path: Path, extra: dict[str, object]
) -> None:
    frozen = request(tmp_path)
    assert process_request({**payload(frozen), **extra})["code"] == "INVALID_REQUEST"
    assert list(frozen.staging_root.iterdir()) == []


def test_real_json_lines_cpu_worker_advertises_and_executes_export(tmp_path: Path) -> None:
    frozen = request(
        tmp_path, (source(tmp_path, Image.new("RGBA", (3, 1), (11, 22, 33, 255)), x=-2),)
    )
    executed = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input=json.dumps(payload(frozen)) + "\n",
        text=True,
        capture_output=True,
        check=True,
        timeout=15,
    )
    assert not executed.stderr
    ready, result = [json.loads(line) for line in executed.stdout.splitlines()]
    assert "export-composition" in ready["capabilities"]
    assert ready["capabilities"] == ready_message()["capabilities"]
    assert result["type"] == "export-done"
    assert result["requestId"] == "export-1"
    assert result["status"] == "rendered"
    assert result["rect"] == {"x": -2, "y": 0, "width": 3, "height": 1}
    assert (
        result["composite"]["sha256"]
        == hashlib.sha256(frozen.composite_png_path.read_bytes()).hexdigest()
    )
