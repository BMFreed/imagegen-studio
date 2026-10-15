"""Actual CPU protocol, strict PNG inputs and exclusive world RGBA publication.

Expected RGB uses the public Pillow resize primitive used by Invoke's img_resize
(image.py:510-523); it is independent of our protocol/composition implementation.
Literal final alpha, container topology and unchanged input files are verified
after processing actual serialized requests, without model or Torch fixtures.
"""

from __future__ import annotations

import copy
import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path
from typing import cast

import pytest
from PIL import Image

from imagegen_worker import smart_patch_output
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.protocol import (
    ComposeSmartPatchOutputCommand,
    parse_request,
    process_request,
    ready_message,
)
from imagegen_worker.smart_patch_preparation import MAX_PREPARATION_PNG_BYTES

Payload = dict[str, object]


def _reference(payload: Payload, key: str) -> dict[str, object]:
    return cast(dict[str, object], payload[key])


def _path(payload: Payload, key: str) -> Path:
    if key == "output":
        return Path(cast(str, _reference(payload, key)["pngPath"]))
    return Path(cast(str, _reference(payload, key)["path"]))


def _rgb(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size)
    for y in range(size[1]):
        for x in range(size[0]):
            image.putpixel(
                (x, y),
                ((x * x * 13 + y * 31) % 256, (y * y * 17 + x * 7) % 256, (x * 47 + y * 19) % 256),
            )
    return image


def _alpha(size: tuple[int, int]) -> list[int]:
    values = (0, 1, 64, 128, 254, 255)
    return [values[(x + y * 3) % len(values)] for y in range(size[1]) for x in range(size[0])]


def _image_reference(path: Path, image: Image.Image) -> dict[str, object]:
    encoded = path.read_bytes()
    return {
        "path": str(path),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "byteSize": len(encoded),
        "width": image.width,
        "height": image.height,
    }


def _request(
    directory: Path,
    *,
    processing: tuple[int, int] = (8, 8),
    world: tuple[int, int] = (8, 8),
    alpha: list[int] | None = None,
) -> Payload:
    stage = directory / "stage"
    stage.mkdir(mode=0o700)
    image = _rgb(processing)
    image_path = stage / "model-result.png"
    image.save(image_path, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    mask = Image.new("RGBA", world, (255, 255, 255, 255))
    coverage = Image.new("L", world)
    coverage.putdata(_alpha(world) if alpha is None else alpha)
    mask.putalpha(coverage)
    mask_path = stage / "final-contribution-mask.png"
    mask.save(mask_path, format="PNG")
    return {
        "type": "compose-smart-patch-output",
        "protocolVersion": "1",
        "requestId": "world-output-1",
        "image": _image_reference(image_path, image),
        "contributionMask": _image_reference(mask_path, mask),
        "output": {"stagingRoot": str(stage), "pngPath": str(stage / "world-result.png")},
    }


def _refresh(payload: Payload, key: str) -> None:
    encoded = _path(payload, key).read_bytes()
    _reference(payload, key).update(
        sha256=hashlib.sha256(encoded).hexdigest(), byteSize=len(encoded)
    )


def _replace(
    payload: Payload,
    key: str,
    image: Image.Image,
    *,
    profile: bytes | None = None,
) -> None:
    destination = _path(payload, key)
    if profile is None:
        image.save(destination, format="PNG")
    else:
        image.save(destination, format="PNG", icc_profile=profile)
    _reference(payload, key).update(_image_reference(destination, image))


def _input_bytes(payload: Payload) -> dict[Path, bytes]:
    return {
        path: path.read_bytes()
        for path in (_path(payload, "image"), _path(payload, "contributionMask"))
    }


def _unchanged(before: dict[Path, bytes]) -> None:
    for path, encoded in before.items():
        assert path.read_bytes() == encoded


def _result(payload: Payload, response: Payload) -> Image.Image:
    assert response["type"] == "smart-patch-output-composed", response
    assert response["requestId"] == payload["requestId"]
    assert response["protocolVersion"] == "1"
    output = _path(payload, "output")
    encoded = output.read_bytes()
    assert encoded[:8] == b"\x89PNG\r\n\x1a\n"
    assert encoded[24:29] == bytes((8, 6, 0, 0, 0))
    mask = _reference(payload, "contributionMask")
    assert response["output"] == {
        "byteSize": len(encoded),
        "colorSpace": "srgb",
        "height": mask["height"],
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "width": mask["width"],
    }
    with Image.open(output) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGBA"
        assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        return image.copy()


@pytest.mark.parametrize(
    ("processing", "world"),
    [
        ((8, 8), (8, 8)),
        ((8, 8), (19, 13)),
        ((16, 16), (7, 5)),
        ((16, 8), (5, 19)),
        ((8, 16), (17, 3)),
        ((8, 8), (1, 1)),
        ((8, 8), (1, 13)),
        ((8, 8), (11, 1)),
    ],
)
def test_real_protocol_resizes_rgb_bicubic_then_attaches_literal_world_alpha_without_source(
    tmp_path: Path, processing: tuple[int, int], world: tuple[int, int]
) -> None:
    payload = _request(tmp_path, processing=processing, world=world)
    before = _input_bytes(payload)
    # The known public Pillow call is Invoke ImageResizeInvocation's numerical reference.
    expected_rgb = _rgb(processing).resize(world, resample=Image.Resampling.BICUBIC)
    image = _result(payload, process_request(json.loads(json.dumps(payload))))
    assert image.size == world
    assert image.convert("RGB").tobytes() == expected_rgb.tobytes()
    assert image.getchannel("A").tobytes() == bytes(_alpha(world))
    _unchanged(before)
    assert sorted(path.name for path in _path(payload, "output").parent.iterdir()) == [
        "final-contribution-mask.png",
        "model-result.png",
        "world-result.png",
    ]


@pytest.mark.parametrize("alpha", [0, 255])
def test_uniform_world_alpha_is_legal_and_hidden_rgb_is_preserved(
    tmp_path: Path, alpha: int
) -> None:
    payload = _request(tmp_path, alpha=[alpha] * 64)
    image = _result(payload, process_request(payload))
    assert image.convert("RGB").tobytes() == _rgb((8, 8)).tobytes()
    assert image.getchannel("A").tobytes() == bytes([alpha] * 64)


def test_private_parser_detaches_wire_metadata_and_ready_advertises_cpu_capability(
    tmp_path: Path,
) -> None:
    payload = _request(tmp_path)
    command = parse_request(payload)
    assert isinstance(command, ComposeSmartPatchOutputCommand)
    _reference(payload, "image")["width"] = 123
    _reference(payload, "contributionMask")["sha256"] = "f" * 64
    assert command.composition.image.width == 8
    assert command.composition.contribution_mask.sha256 != "f" * 64
    assert "smart-patch-output-composition" in cast(list[str], ready_message()["capabilities"])


def test_real_cpu_json_lines_composes_without_importing_torch(tmp_path: Path) -> None:
    payload = _request(tmp_path, world=(9, 5))
    script = (
        "import sys; from imagegen_worker.__main__ import main; "
        "main(); assert 'torch' not in sys.modules"
    )
    completed = subprocess.run(
        [sys.executable, "-I", "-c", script],
        input=json.dumps(payload) + "\n",
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    assert completed.stderr == ""
    messages = [json.loads(line) for line in completed.stdout.splitlines()]
    assert [message["type"] for message in messages] == ["ready", "smart-patch-output-composed"]
    assert "smart-patch-output-composition" in messages[0]["capabilities"]
    image = _result(payload, messages[1])
    assert image.getchannel("A").tobytes() == bytes(_alpha((9, 5)))


@pytest.mark.parametrize(
    ("key", "field", "value", "code"),
    [
        ("image", "width", 7, "INVALID_REQUEST"),
        ("image", "height", 9, "INVALID_REQUEST"),
        ("image", "width", True, "INVALID_REQUEST"),
        ("image", "height", 8.0, "INVALID_REQUEST"),
        ("image", "width", 2049, "IMAGE_TOO_LARGE"),
        ("contributionMask", "width", 2049, "IMAGE_TOO_LARGE"),
        ("contributionMask", "height", 0, "INVALID_REQUEST"),
        ("image", "sha256", "0" * 64, "INPUT_HASH_MISMATCH"),
        ("contributionMask", "sha256", "0" * 64, "INPUT_HASH_MISMATCH"),
        ("image", "byteSize", 1, "INVALID_IMAGE"),
        ("contributionMask", "byteSize", MAX_PREPARATION_PNG_BYTES + 1, "INPUT_TOO_LARGE"),
    ],
)
def test_actual_cpu_refuses_bad_metadata_without_output(
    tmp_path: Path, key: str, field: str, value: object, code: str
) -> None:
    payload = _request(tmp_path)
    before = _input_bytes(payload)
    _reference(payload, key)[field] = value
    response = process_request(payload)
    assert response["type"] == "error" and response["code"] == code, response
    assert not _path(payload, "output").exists()
    _unchanged(before)


@pytest.mark.parametrize("key", ["image", "contributionMask"])
def test_each_world_and_processing_total_pixel_limit_refuses_before_any_decode(
    tmp_path: Path, key: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path)
    _reference(payload, key).update(width=2048, height=2048)

    def forbid_decode(*_args: object, **_kwargs: object) -> Image.Image:
        pytest.fail("Oversized geometry must refuse before decoding.")

    monkeypatch.setattr(smart_patch_output, "decode_preparation_rgb", forbid_decode)
    response = process_request(payload)
    assert response["code"] == "IMAGE_TOO_LARGE", response
    assert not _path(payload, "output").exists()


@pytest.mark.parametrize(
    "problem",
    [
        "image-rgba",
        "image-no-icc",
        "image-wrong-icc",
        "mask-rgb",
        "mask-nonwhite",
        "mask-icc",
        "image-crc",
        "mask-crc",
        "image-trailing",
        "mask-truncated",
    ],
)
def test_strict_actual_png_reader_refuses_wrong_topology_color_and_corruption(
    tmp_path: Path, problem: str
) -> None:
    payload = _request(tmp_path)
    if problem == "image-rgba":
        _replace(payload, "image", _rgb((8, 8)).convert("RGBA"), profile=SRGB_ICC_PROFILE)
    elif problem == "image-no-icc":
        _replace(payload, "image", _rgb((8, 8)))
    elif problem == "image-wrong-icc":
        profile = (Path(__file__).parent / "fixtures" / "AdobeRGB1998.icc").read_bytes()
        _replace(payload, "image", _rgb((8, 8)), profile=profile)
    elif problem == "mask-rgb":
        _replace(payload, "contributionMask", Image.new("RGB", (8, 8), "white"))
    elif problem == "mask-nonwhite":
        _replace(payload, "contributionMask", Image.new("RGBA", (8, 8), (254, 255, 255, 128)))
    elif problem == "mask-icc":
        _replace(
            payload,
            "contributionMask",
            Image.new("RGBA", (8, 8), "white"),
            profile=SRGB_ICC_PROFILE,
        )
    else:
        key = "image" if problem.startswith("image") else "contributionMask"
        path = _path(payload, key)
        encoded = bytearray(path.read_bytes())
        if problem.endswith("crc"):
            encoded[29] ^= 1  # IHDR CRC, with the file digest updated independently.
        elif problem.endswith("trailing"):
            encoded += b"trailing"
        else:
            del encoded[-5:]
        path.write_bytes(encoded)
        _refresh(payload, key)
    before = _input_bytes(payload)
    response = process_request(payload)
    assert response["type"] == "error", response
    assert response["code"] in {"INVALID_IMAGE", "INPUT_COLOR_PROFILE"}, response
    assert not _path(payload, "output").exists()
    _unchanged(before)


@pytest.mark.parametrize("location", ["root", "image", "mask", "output"])
def test_private_wire_rejects_unknown_fields(tmp_path: Path, location: str) -> None:
    payload = _request(tmp_path)
    target = (
        payload
        if location == "root"
        else _reference(payload, "contributionMask" if location == "mask" else location)
    )
    target["unexpected"] = 1
    assert process_request(payload)["code"] == "INVALID_REQUEST"
    assert not _path(payload, "output").exists()


@pytest.mark.parametrize(
    "problem",
    [
        "stage-public",
        "stage-group-write",
        "source-nested",
        "source-outside",
        "source-symlink",
        "stage-symlink",
        "source-directory",
        "same-input-path",
        "hardlinked-inputs",
        "output-input",
        "output-outside",
        "output-nested",
    ],
)
def test_cpu_paths_refuse_nonprivate_noncanonical_alias_and_external_files(
    tmp_path: Path, problem: str
) -> None:
    payload = _request(tmp_path)
    image = _path(payload, "image")
    mask = _path(payload, "contributionMask")
    stage = image.parent
    output = _reference(payload, "output")
    if problem == "stage-public":
        stage.chmod(0o755)
    elif problem == "stage-group-write":
        stage.chmod(0o720)
    elif problem in {"source-nested", "source-outside"}:
        directory = tmp_path if problem == "source-outside" else stage / "nested"
        directory.mkdir(exist_ok=True)
        destination = directory / "moved.png"
        image.rename(destination)
        _reference(payload, "image")["path"] = str(destination)
    elif problem == "source-symlink":
        destination = stage / "alias.png"
        destination.symlink_to(image)
        _reference(payload, "image")["path"] = str(destination)
    elif problem == "stage-symlink":
        destination = tmp_path / "alias-stage"
        destination.symlink_to(stage, target_is_directory=True)
        output["stagingRoot"] = str(destination)
    elif problem == "source-directory":
        image.unlink()
        image.mkdir()
    elif problem == "same-input-path":
        _reference(payload, "contributionMask")["path"] = str(image)
    elif problem == "hardlinked-inputs":
        mask.unlink()
        os.link(image, mask)
    elif problem == "output-input":
        output["pngPath"] = str(image)
    elif problem == "output-outside":
        output["pngPath"] = str(tmp_path / "outside.png")
    else:
        nested = stage / "nested"
        nested.mkdir()
        output["pngPath"] = str(nested / "output.png")
    response = process_request(payload)
    assert response["type"] == "error", response
    assert response["code"] in {"INVALID_PATH", "INPUT_UNAVAILABLE"}, response
    if problem != "output-input":
        assert not _path(payload, "output").exists()
    else:
        assert image.exists()


def test_existing_output_is_preserved_and_successful_neighbor_is_exclusive(tmp_path: Path) -> None:
    payload = _request(tmp_path)
    output = _path(payload, "output")
    output.write_bytes(b"existing-output")
    before = _input_bytes(payload)
    assert process_request(payload)["code"] == "OUTPUT_UNAVAILABLE"
    assert output.read_bytes() == b"existing-output"
    output.unlink()
    _result(payload, process_request(payload))
    committed = output.read_bytes()
    assert process_request(payload)["code"] == "OUTPUT_UNAVAILABLE"
    assert output.read_bytes() == committed
    _unchanged(before)


def test_late_collision_preserves_foreign_output_and_removes_temporary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path)
    output = _path(payload, "output")
    original_link = os.link

    def collide(source: Path, destination: Path, *, follow_symlinks: bool) -> None:
        assert destination == output
        destination.write_bytes(b"late-owner")
        original_link(source, destination, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(smart_patch_output.os, "link", collide)
    before = _input_bytes(payload)
    assert process_request(payload)["code"] == "OUTPUT_UNAVAILABLE"
    assert output.read_bytes() == b"late-owner"
    assert not list(output.parent.glob(".*.tmp"))
    _unchanged(before)


@pytest.mark.parametrize("replace", [False, True])
def test_directory_fsync_failure_rolls_back_only_owned_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, replace: bool
) -> None:
    payload = _request(tmp_path)
    output = _path(payload, "output")
    original_fsync = os.fsync

    def fail_directory(descriptor: int) -> None:
        if stat.S_ISDIR(os.fstat(descriptor).st_mode):
            if replace:
                output.unlink()
                output.write_bytes(b"replacement-owner")
            raise OSError("Controlled directory durability failure")
        original_fsync(descriptor)

    monkeypatch.setattr(smart_patch_output.os, "fsync", fail_directory)
    before = _input_bytes(payload)
    assert process_request(payload)["code"] == "DERIVATIVE_FAILED"
    if replace:
        assert output.read_bytes() == b"replacement-owner"
    else:
        assert not output.exists()
    assert not list(output.parent.glob(".*.tmp"))
    _unchanged(before)


def test_replacement_during_metadata_read_is_refused_without_unlinking_new_owner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path)
    output = _path(payload, "output")
    original_metadata = smart_patch_output.artifact_info

    def replace_after_read(
        destination: Path, image: Image.Image
    ) -> smart_patch_output.ArtifactInfo:
        result = original_metadata(destination, image)
        destination.unlink()
        destination.write_bytes(b"metadata-replacement")
        return result

    monkeypatch.setattr(smart_patch_output, "artifact_info", replace_after_read)
    assert process_request(payload)["code"] == "OUTPUT_UNAVAILABLE"
    assert output.read_bytes() == b"metadata-replacement"
    assert not list(output.parent.glob(".*.tmp"))


def test_failed_encoded_size_check_removes_owned_output_and_temporary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path)
    original_metadata = smart_patch_output.artifact_info

    def oversized(destination: Path, image: Image.Image) -> smart_patch_output.ArtifactInfo:
        result = original_metadata(destination, image)
        return {**result, "byteSize": MAX_PREPARATION_PNG_BYTES + 1}

    monkeypatch.setattr(smart_patch_output, "artifact_info", oversized)
    assert process_request(payload)["code"] == "IMAGE_TOO_LARGE"
    output = _path(payload, "output")
    assert not output.exists()
    assert not list(output.parent.glob(".*.tmp"))


def test_new_wire_has_no_model_mode_source_or_bbox_configuration(tmp_path: Path) -> None:
    payload = _request(tmp_path)
    for key in ("mode", "source", "bbox", "model", "internalResolution"):
        contaminated = copy.deepcopy(payload)
        contaminated[key] = None
        assert process_request(contaminated)["code"] == "INVALID_REQUEST"
    assert not _path(payload, "output").exists()
