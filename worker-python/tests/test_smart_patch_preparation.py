"""Real CPU protocol, literal coverage oracles, and preparation filesystem ownership."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import cast

import pytest
from PIL import Image

from imagegen_worker import smart_patch_preparation
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.protocol import process_request, ready_message


def _reference(file: Path, image: Image.Image) -> dict[str, object]:
    encoded = file.read_bytes()
    return {
        "path": str(file),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "byteSize": len(encoded),
        "width": image.width,
        "height": image.height,
    }


def _source(directory: Path, image: Image.Image) -> dict[str, object]:
    file = directory / "source.png"
    image.save(file, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    return _reference(file, image)


def _mask(
    directory: Path,
    alpha: list[int],
    size: tuple[int, int],
    *,
    x: int = 0,
    y: int = 0,
    rgb: tuple[int, int, int] = (255, 255, 255),
    tagged: bool = False,
) -> dict[str, object]:
    image = Image.new("RGBA", size, (*rgb, 255))
    plane = Image.new("L", size)
    plane.putdata(alpha)
    image.putalpha(plane)
    file = directory / "mask.png"
    if tagged:
        image.save(file, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    else:
        image.save(file, format="PNG")
    return {
        **_reference(file, image),
        "bounds": {"x": x, "y": y, "width": size[0], "height": size[1]},
    }


def _request(
    directory: Path,
    *,
    bbox: tuple[int, int, int, int] = (0, 0, 2, 2),
    internal: tuple[int, int] | None = None,
    source: dict[str, object] | None = None,
    mask: dict[str, object] | None = None,
) -> dict[str, object]:
    stage = directory / "stage"
    stage.mkdir(exist_ok=True)
    x, y, width, height = bbox
    if source is None:
        source = _source(directory, Image.new("RGBA", (width, height), (20, 40, 80, 255)))
    size = internal or (width, height)
    return {
        "type": "prepare-smart-patch",
        "protocolVersion": "1",
        "requestId": "patch-preparation-1",
        "bbox": {"x": x, "y": y, "width": width, "height": height},
        "internalResolution": {"width": size[0], "height": size[1]},
        "source": source,
        "mask": mask,
        "output": {
            "stagingRoot": str(stage),
            "worldMaskPngPath": str(stage / "world-mask.png"),
            "processingSourcePngPath": str(stage / "processing-source.png"),
            "processingMaskPngPath": str(stage / "processing-mask.png"),
        },
    }


def _output(request: dict[str, object]) -> dict[str, str]:
    return cast(dict[str, str], request["output"])


def _coverage(file: str) -> list[int]:
    with Image.open(file) as image:
        image.load()
        assert image.mode == "RGBA"
        assert image.info == {}
        assert image.getchannel("R").getextrema() == (255, 255)
        assert image.getchannel("G").getextrema() == (255, 255)
        assert image.getchannel("B").getextrema() == (255, 255)
        return list(image.getchannel("A").tobytes())


def _assert_artifact(
    file: str, metadata: object, size: tuple[int, int], *, numeric_mask: bool
) -> None:
    expected: dict[str, object] = {
        "byteSize": Path(file).stat().st_size,
        "width": size[0],
        "height": size[1],
        "sha256": hashlib.sha256(Path(file).read_bytes()).hexdigest(),
    }
    if not numeric_mask:
        expected["colorSpace"] = "srgb"
    assert metadata == expected


def test_world_crop_preserves_soft_alpha_negative_origin_and_padding(tmp_path: Path) -> None:
    # Production protocol -> actual crop. A bounds/threshold surrogate cannot satisfy these bytes.
    original = _mask(tmp_path, [1, 0, 127, 128, 0, 255], (3, 2), x=-2, y=-1)
    payload = _request(tmp_path, bbox=(-3, -2, 4, 3), mask=original)
    source_before = Path(cast(str, cast(dict[str, object], payload["source"])["path"])).read_bytes()
    mask_before = Path(cast(str, original["path"])).read_bytes()

    response = process_request(payload)

    assert response["type"] == "smart-patch-prepared"
    assert "mode" not in response
    output = _output(payload)
    literal = [0, 0, 0, 0, 0, 1, 0, 127, 0, 128, 0, 255]
    assert _coverage(output["worldMaskPngPath"]) == literal
    assert _coverage(output["processingMaskPngPath"]) == literal
    _assert_artifact(output["worldMaskPngPath"], response["worldMask"], (4, 3), numeric_mask=True)
    _assert_artifact(
        output["processingMaskPngPath"], response["processingMask"], (4, 3), numeric_mask=True
    )
    assert Path(cast(str, original["path"])).read_bytes() == mask_before
    source_file = Path(cast(str, cast(dict[str, object], payload["source"])["path"]))
    assert source_file.read_bytes() == source_before


def test_overlapping_bounds_with_only_zero_pixels_publish_zero_coverage(tmp_path: Path) -> None:
    original = _mask(tmp_path, [255, 0, 0, 0, 0, 0, 0, 0, 1], (3, 3))
    payload = _request(tmp_path, bbox=(1, 1, 1, 1), internal=(3, 2), mask=original)

    response = process_request(payload)

    assert response["type"] == "smart-patch-prepared"
    assert _coverage(_output(payload)["worldMaskPngPath"]) == [0]
    assert _coverage(_output(payload)["processingMaskPngPath"]) == [0] * 6


@pytest.mark.parametrize(
    ("bbox", "expected"),
    [
        ((-2, -2, 3, 3), [2, 3, 4, 6, 7, 8, 10, 11, 12]),
        ((-3, -2, 3, 3), [1, 2, 3, 5, 6, 7, 9, 10, 11]),
        ((-3, -1, 4, 2), [5, 6, 7, 8, 9, 10, 11, 12]),
        ((-3, -2, 4, 2), [1, 2, 3, 4, 5, 6, 7, 8]),
    ],
    ids=["left-edge", "right-edge", "top-edge", "bottom-edge"],
)
def test_each_world_edge_clips_actual_soft_pixels(
    tmp_path: Path, bbox: tuple[int, int, int, int], expected: list[int]
) -> None:
    original = _mask(tmp_path, list(range(1, 13)), (4, 3), x=-3, y=-2)
    payload = _request(tmp_path, bbox=bbox, mask=original)
    original_bytes = Path(cast(str, original["path"])).read_bytes()

    response = process_request(payload)

    assert response["type"] == "smart-patch-prepared"
    assert _coverage(_output(payload)["worldMaskPngPath"]) == expected
    assert _coverage(_output(payload)["processingMaskPngPath"]) == expected
    assert Path(cast(str, original["path"])).read_bytes() == original_bytes


@pytest.mark.parametrize("disjoint", [False, True])
def test_null_and_verified_disjoint_masks_are_zero_without_rewriting_input(
    tmp_path: Path, disjoint: bool
) -> None:
    original = _mask(tmp_path, [1], (1, 1), x=30, y=-20) if disjoint else None
    before = Path(cast(str, original["path"])).read_bytes() if original is not None else None
    payload = _request(tmp_path, internal=(3, 4), mask=original)

    response = process_request(payload)

    assert response["type"] == "smart-patch-prepared"
    assert _coverage(_output(payload)["worldMaskPngPath"]) == [0] * 4
    assert _coverage(_output(payload)["processingMaskPngPath"]) == [0] * 12
    if original is not None:
        assert Path(cast(str, original["path"])).read_bytes() == before


def test_same_size_source_preserves_hidden_rgb_and_partial_alpha(tmp_path: Path) -> None:
    image = Image.new("RGBA", (2, 2))
    image.putdata([(10, 20, 30, 0), (40, 50, 60, 1), (70, 80, 90, 128), (100, 110, 120, 255)])
    source = _source(tmp_path, image)
    payload = _request(tmp_path, source=source)

    response = process_request(payload)

    assert response["type"] == "smart-patch-prepared"
    with Image.open(_output(payload)["processingSourcePngPath"]) as prepared:
        prepared.load()
        assert prepared.tobytes() == image.tobytes()
        assert prepared.info["icc_profile"] == SRGB_ICC_PROFILE
    _assert_artifact(
        _output(payload)["processingSourcePngPath"],
        response["processingSource"],
        (2, 2),
        numeric_mask=False,
    )


def test_nonuniform_internal_resize_uses_numeric_coverage_not_display_rgb(tmp_path: Path) -> None:
    # World has three constant columns and two distinct rows. Scaling x only must preserve rows.
    original = _mask(tmp_path, [1, 1, 1, 127, 127, 127], (3, 2))
    payload = _request(tmp_path, bbox=(0, 0, 3, 2), internal=(6, 2), mask=original)

    response = process_request(payload)

    assert response["type"] == "smart-patch-prepared"
    assert _coverage(_output(payload)["worldMaskPngPath"]) == [1, 1, 1, 127, 127, 127]
    assert _coverage(_output(payload)["processingMaskPngPath"]) == [1] * 6 + [127] * 6
    _assert_artifact(
        _output(payload)["processingSourcePngPath"],
        response["processingSource"],
        (6, 2),
        numeric_mask=False,
    )


@pytest.mark.parametrize("fault", ["hash", "bytes", "white", "profile", "empty", "padded"])
def test_original_mask_integrity_refuses_even_when_outside_bbox(tmp_path: Path, fault: str) -> None:
    original = _mask(
        tmp_path,
        [0] if fault == "empty" else [1],
        (1, 1),
        x=100,
        rgb=(254, 255, 255) if fault == "white" else (255, 255, 255),
        tagged=fault == "profile",
    )
    if fault == "hash":
        original["sha256"] = "0" * 64
    elif fault == "bytes":
        original["byteSize"] = cast(int, original["byteSize"]) + 1
    elif fault == "padded":
        original = _mask(tmp_path, [0, 1, 0], (3, 1), x=100)
    payload = _request(tmp_path, mask=original)

    response = process_request(payload)

    assert response["type"] == "error"
    assert response["code"] in ("INVALID_IMAGE", "INPUT_HASH_MISMATCH")
    assert list((tmp_path / "stage").iterdir()) == []


@pytest.mark.parametrize("fault", ["fractional", "internal", "extra", "mask-size", "source-size"])
def test_strict_request_and_existing_cpu_limits_refuse_before_output(
    tmp_path: Path, fault: str
) -> None:
    original = _mask(tmp_path, [1], (1, 1))
    payload = _request(tmp_path, mask=original)
    if fault == "fractional":
        cast(dict[str, object], payload["bbox"])["x"] = 0.5
    elif fault == "internal":
        cast(dict[str, object], payload["internalResolution"])["width"] = 2049
    elif fault == "extra":
        payload["mode"] = "inpaint"
    elif fault == "mask-size":
        original["width"] = 2
    else:
        cast(dict[str, object], payload["source"])["width"] = 3

    response = process_request(payload)

    assert response["type"] == "error"
    assert response["code"] == ("IMAGE_TOO_LARGE" if fault == "internal" else "INVALID_REQUEST")
    assert list((tmp_path / "stage").iterdir()) == []


def test_group_publication_rolls_back_owned_outputs_after_third_link_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path)
    link = os.link
    calls = 0

    def fail_third_link(
        source: os.PathLike[str], destination: os.PathLike[str], *, follow_symlinks: bool
    ) -> None:
        nonlocal calls
        calls += 1
        if calls == 3:
            raise OSError("simulated third publication failure")
        link(source, destination, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(smart_patch_preparation.os, "link", fail_third_link)

    response = process_request(payload)

    assert response["code"] == "DERIVATIVE_FAILED"
    assert calls == 3
    assert list((tmp_path / "stage").iterdir()) == []


def test_preexisting_output_is_preserved_and_no_other_member_is_published(tmp_path: Path) -> None:
    payload = _request(tmp_path)
    destination = Path(_output(payload)["processingSourcePngPath"])
    destination.write_bytes(b"existing-user-owned-output")

    response = process_request(payload)

    assert response["code"] == "OUTPUT_UNAVAILABLE"
    assert destination.read_bytes() == b"existing-user-owned-output"
    assert list((tmp_path / "stage").iterdir()) == [destination]


def test_real_worker_json_lines_route_prepares_and_advertises_cpu_capability(
    tmp_path: Path,
) -> None:
    payload = _request(tmp_path, mask=_mask(tmp_path, [1], (1, 1)))
    run = subprocess.run(
        [sys.executable, "-I", "-B", "-m", "imagegen_worker"],
        input=json.dumps(payload) + "\n",
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    )
    messages = [json.loads(line) for line in run.stdout.splitlines()]
    assert run.stderr == ""
    assert messages[0] == ready_message()
    assert "smart-patch-preparation" in messages[0]["capabilities"]
    assert messages[1]["type"] == "smart-patch-prepared"
    assert _coverage(_output(payload)["worldMaskPngPath"]) == [1, 0, 0, 0]
