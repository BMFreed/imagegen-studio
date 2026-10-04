"""The qualified inference process composes the same frozen target it will later consume."""

from __future__ import annotations

import hashlib
from pathlib import Path
from types import ModuleType
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_main import inference_ready_message, process_inference_request


def _hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _runtime() -> MLRuntime:
    # The target route uses Pillow. ML startup/GPU execution is deliberately not exercised here.
    return MLRuntime(
        torch=ModuleType("unused_torch"),
        diffusers=ModuleType("unused_diffusers"),
        compel=ModuleType("unused_compel"),
    )


def _target_request(root: Path, source_width: int | None = None) -> dict[str, object]:
    staging = root / "staging"
    staging.mkdir()
    layers: list[dict[str, object]] = []
    if source_width is not None:
        source = root / "source.png"
        Image.new("RGBA", (source_width, 8), (20, 40, 60, 255)).save(
            source, format="PNG", icc_profile=SRGB_ICC_PROFILE
        )
        layers.append(
            {
                "path": str(source),
                "sha256": _hash(source.read_bytes()),
                "width": source_width,
                "height": 8,
                "opacity": 1,
                "blendMode": "normal",
                "transform": {
                    "x": -8,
                    "y": 16,
                    "scaleX": 1,
                    "scaleY": 1,
                    "rotationDegrees": 0,
                },
            }
        )
    return {
        "type": "compose-target",
        "protocolVersion": "1",
        "requestId": "target-1",
        "layers": layers,
        "bbox": {"x": -8, "y": 16, "width": 8, "height": 8},
        "output": {
            "stagingRoot": str(staging),
            "targetPngPath": str(staging / "target.png"),
        },
    }


@pytest.mark.parametrize(
    ("source_width", "mode", "alpha"),
    [
        (None, "txt2img", (0, 0)),
        (4, "outpaint", (255, 0)),
        (8, "img2img", (255, 255)),
    ],
)
def test_inference_route_composes_real_srgb_target_and_pixel_derived_mode(
    tmp_path: Path,
    source_width: int | None,
    mode: str,
    alpha: tuple[int, int],
) -> None:
    request = _target_request(tmp_path, source_width)
    output = tmp_path / "staging" / "target.png"
    assert not output.exists()

    response = process_inference_request(request, config_dir=tmp_path, runtime=_runtime())

    assert response["type"] == "target-done"
    assert response["protocolVersion"] == "1"
    assert response["requestId"] == "target-1"
    assert response["mode"] == mode
    assert response["rect"] == request["bbox"]
    encoded = output.read_bytes()
    assert response["composite"] == {
        "byteSize": len(encoded),
        "colorSpace": "srgb",
        "height": 8,
        "sha256": _hash(encoded),
        "width": 8,
    }
    assert encoded[24:26] == bytes((8, 6))  # Eight-bit RGBA PNG, not a declaration alone.
    with Image.open(output) as image:
        assert image.format == "PNG"
        assert image.mode == "RGBA"
        assert image.size == (8, 8)
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
        assert cast(int, image.getchannel("A").getpixel((0, 0))) == alpha[0]
        assert cast(int, image.getchannel("A").getpixel((7, 7))) == alpha[1]


@pytest.mark.parametrize(
    ("mutation", "code"),
    [
        ("malformed", "INVALID_REQUEST"),
        ("missing", "INPUT_UNAVAILABLE"),
        ("changed", "INPUT_HASH_MISMATCH"),
        ("preexisting-output", "OUTPUT_UNAVAILABLE"),
    ],
)
def test_inference_target_route_refuses_invalid_or_changed_inputs_without_publication(
    tmp_path: Path, mutation: str, code: str
) -> None:
    request = _target_request(tmp_path, 8)
    output = tmp_path / "staging" / "target.png"
    source = tmp_path / "source.png"
    if mutation == "malformed":
        cast(dict[str, Any], request["bbox"])["x"] = True
    elif mutation == "missing":
        source.unlink()
    elif mutation == "changed":
        source.write_bytes(b"changed")
    elif mutation == "preexisting-output":
        output.write_bytes(b"keep")

    response = process_inference_request(request, config_dir=tmp_path, runtime=_runtime())

    assert response["type"] == "error"
    assert response["protocolVersion"] == "1"
    assert response["requestId"] == "target-1"
    assert response["code"] == code
    if mutation == "preexisting-output":
        assert output.read_bytes() == b"keep"
    else:
        assert not output.exists()


def test_inference_target_capability_is_additive_and_other_derivative_route_stays_closed(
    tmp_path: Path,
) -> None:
    ready = inference_ready_message()
    assert ready["protocolVersion"] == "1"
    assert ready["workerVersion"] == "0.9.0"
    assert ready["runtimeProfile"] == "linux-nvidia"
    assert ready["capabilities"] == [
        "illustrious-txt2img",
        "target-composition",
        "denoising-progress",
        "candidate-thumbnails",
        "illustrious-cfg-rescale",
        "illustrious-img2img",
        "illustrious-lora",
        "illustrious-vae-precision",
        "illustrious-external-vae",
    ]

    response = process_inference_request(
        {"type": "self-test", "protocolVersion": "1", "requestId": "other-1"},
        config_dir=tmp_path,
        runtime=_runtime(),
    )
    assert response["type"] == "error"
    assert response["requestId"] == "other-1"
    assert response["code"] == "INVALID_REQUEST"
