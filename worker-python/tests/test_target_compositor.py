"""The generation target is a finite, frozen raster; it is not the Project preview."""

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
    ComposeTargetRequest,
    LayerTransform,
    PreviewLayer,
    compose_target,
)
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.protocol import process_request


def layer(
    directory: Path,
    name: str,
    image: Image.Image,
    *,
    x: float = 0,
    y: float = 0,
    opacity: float = 1,
    blend_mode: BlendMode = "normal",
    scale_x: float = 1,
    scale_y: float = 1,
    rotation_degrees: float = 0,
) -> PreviewLayer:
    source = directory / f"{name}.png"
    image.save(source, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    return PreviewLayer(
        path=source,
        sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        width=image.width,
        height=image.height,
        opacity=opacity,
        blend_mode=blend_mode,
        transform=LayerTransform(x, y, scale_x, scale_y, rotation_degrees),
    )


def request(
    directory: Path,
    layers: tuple[PreviewLayer, ...] = (),
    *,
    x: int = 0,
    y: int = 0,
    width: int = 3,
    height: int = 2,
) -> ComposeTargetRequest:
    staging = directory / "stage"
    staging.mkdir(exist_ok=True)
    return ComposeTargetRequest(
        layers=layers,
        bbox={"x": x, "y": y, "width": width, "height": height},
        staging_root=staging,
        target_png_path=staging / "target.png",
    )


def pixels(path: Path) -> list[tuple[int, int, int, int]]:
    with Image.open(path) as image:
        return cast(
            list[tuple[int, int, int, int]], list(image.convert("RGBA").get_flattened_data())
        )


def test_no_layers_writes_exact_transparent_srgb_target(tmp_path: Path) -> None:
    frozen = request(tmp_path, x=-9, y=17, width=3, height=2)

    result = compose_target(frozen)

    assert result["mode"] == "txt2img"
    assert result["rect"] == {"x": -9, "y": 17, "width": 3, "height": 2}
    assert result["composite"] == {
        "byteSize": frozen.target_png_path.stat().st_size,
        "colorSpace": "srgb",
        "height": 2,
        "sha256": hashlib.sha256(frozen.target_png_path.read_bytes()).hexdigest(),
        "width": 3,
    }
    with Image.open(frozen.target_png_path) as image:
        assert image.format == "PNG"
        assert image.mode == "RGBA"
        assert image.size == (3, 2)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
    encoded = frozen.target_png_path.read_bytes()
    assert encoded[24] == 8  # PNG bit depth
    assert encoded[25] == 6  # RGBA color type
    assert encoded[28] == 0  # non-interlaced
    assert pixels(frozen.target_png_path) == [(0, 0, 0, 0)] * 6


def test_off_bbox_source_does_not_turn_txt2img_into_img2img(tmp_path: Path) -> None:
    outside = layer(tmp_path, "outside", Image.new("RGBA", (2, 2), (255, 0, 0, 255)), x=10)
    frozen = request(tmp_path, (outside,), width=2, height=2)

    assert compose_target(frozen)["mode"] == "txt2img"
    assert pixels(frozen.target_png_path) == [(0, 0, 0, 0)] * 4


def test_partial_coverage_and_partial_alpha_are_outpaint(tmp_path: Path) -> None:
    partial = layer(tmp_path, "partial", Image.new("RGBA", (1, 1), (20, 40, 60, 255)))
    frozen = request(tmp_path, (partial,), width=2, height=1)
    assert compose_target(frozen)["mode"] == "outpaint"
    assert pixels(frozen.target_png_path) == [(20, 40, 60, 255), (0, 0, 0, 0)]

    translucent = layer(
        tmp_path, "translucent", Image.new("RGBA", (2, 1), (20, 40, 60, 255)), opacity=0.5
    )
    second = replace(
        frozen, layers=(translucent,), target_png_path=frozen.staging_root / "next.png"
    )
    assert compose_target(second)["mode"] == "outpaint"
    assert [pixel[3] for pixel in pixels(second.target_png_path)] == [127, 127]


def test_opaque_composite_is_img2img_and_preserves_top_first_blend(tmp_path: Path) -> None:
    top = layer(
        tmp_path,
        "top",
        Image.new("RGBA", (2, 2), (200, 100, 50, 255)),
        x=5,
        y=7,
        blend_mode="multiply",
    )
    bottom = layer(tmp_path, "bottom", Image.new("RGBA", (2, 2), (60, 100, 200, 255)), x=5, y=7)
    frozen = request(tmp_path, (top, bottom), x=5, y=7, width=2, height=2)

    assert compose_target(frozen)["mode"] == "img2img"
    assert pixels(frozen.target_png_path) == [(47, 39, 39, 255)] * 4


def test_scaled_rotated_layer_uses_world_space_bbox(tmp_path: Path) -> None:
    source = layer(
        tmp_path,
        "rotated",
        Image.new("RGBA", (1, 1), (255, 0, 0, 255)),
        x=5,
        y=5,
        scale_x=2,
        scale_y=2,
        rotation_degrees=90,
    )
    frozen = request(tmp_path, (source,), x=3, y=5, width=3, height=2)

    assert compose_target(frozen)["mode"] == "outpaint"
    assert pixels(frozen.target_png_path) == [
        (255, 0, 0, 255),
        (255, 0, 0, 255),
        (0, 0, 0, 0),
        (255, 0, 0, 255),
        (255, 0, 0, 255),
        (0, 0, 0, 0),
    ]


@pytest.mark.parametrize("bbox", [(2049, 1), (2048, 2048)])
def test_over_limit_rejected_even_for_empty_project(tmp_path: Path, bbox: tuple[int, int]) -> None:
    frozen = request(tmp_path, width=bbox[0], height=bbox[1])
    with pytest.raises(DerivativeError) as error:
        compose_target(frozen)
    assert error.value.code == "IMAGE_TOO_LARGE"
    assert not frozen.target_png_path.exists()


def test_tampered_off_bbox_source_rejected_without_publishing(tmp_path: Path) -> None:
    outside = layer(tmp_path, "outside", Image.new("RGBA", (1, 1), "red"), x=99)
    frozen = request(tmp_path, (outside,), width=1, height=1)
    outside.path.write_bytes(b"changed")

    with pytest.raises(DerivativeError) as error:
        compose_target(frozen)
    assert error.value.code == "INPUT_HASH_MISMATCH"
    assert not frozen.target_png_path.exists()


def test_existing_or_unsafe_target_path_is_not_replaced(tmp_path: Path) -> None:
    frozen = request(tmp_path)
    frozen.target_png_path.write_bytes(b"keep")
    with pytest.raises(DerivativeError) as error:
        compose_target(frozen)
    assert error.value.code == "OUTPUT_UNAVAILABLE"
    assert frozen.target_png_path.read_bytes() == b"keep"

    linked = tmp_path / "linked"
    linked.symlink_to(frozen.staging_root, target_is_directory=True)
    with pytest.raises(DerivativeError) as error:
        compose_target(replace(frozen, target_png_path=linked / "other.png"))
    assert error.value.code == "INVALID_PATH"
    assert not (frozen.staging_root / "other.png").exists()


def test_failed_target_publication_leaves_no_output_or_temporary_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    frozen = request(tmp_path)

    def fail_publication(
        _source: os.PathLike[str], _destination: os.PathLike[str], *, follow_symlinks: bool
    ) -> None:
        assert follow_symlinks is False
        raise OSError("simulated write failure")

    monkeypatch.setattr(compositor.os, "link", fail_publication)
    with pytest.raises(DerivativeError) as error:
        compose_target(frozen)
    assert error.value.code == "DERIVATIVE_FAILED"
    assert list(frozen.staging_root.iterdir()) == []


def test_protocol_rejects_shape_errors_and_real_worker_emits_target_done(tmp_path: Path) -> None:
    frozen = request(tmp_path, x=-2, y=3, width=2, height=2)
    payload: dict[str, object] = {
        "type": "compose-target",
        "protocolVersion": "1",
        "requestId": "target-1",
        "layers": [],
        "bbox": frozen.bbox,
        "output": {
            "stagingRoot": str(frozen.staging_root),
            "targetPngPath": str(frozen.target_png_path),
        },
    }
    for malformed in (
        {**payload, "extra": 1},
        {**payload, "bbox": {**frozen.bbox, "x": True}},
        {**payload, "bbox": {**frozen.bbox, "width": 0}},
        {**payload, "bbox": {**frozen.bbox, "unexpected": 1}},
    ):
        assert process_request(malformed)["code"] == "INVALID_REQUEST"
    execution = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input=json.dumps(payload) + "\n",
        text=True,
        capture_output=True,
        check=True,
        timeout=15,
    )
    assert execution.stderr == ""
    ready, completed = [json.loads(line) for line in execution.stdout.splitlines()]
    assert "target-composition" in ready["capabilities"]
    assert completed["type"] == "target-done"
    assert completed["requestId"] == "target-1"
    assert completed["mode"] == "txt2img"
    assert completed["rect"] == frozen.bbox
    assert (
        completed["composite"]["sha256"]
        == hashlib.sha256(frozen.target_png_path.read_bytes()).hexdigest()
    )
