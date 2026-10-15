"""Actual private protocol/PNG boundary and explicit tiny TorchScript collaborator.

The loader map replaces only the trained resource precondition in tensor tests;
it does not claim trained LaMa quality or qualification of installed runtime.
Production keeps the exact pinned SHA/size and descriptor-backed loader.
"""

from __future__ import annotations

import hashlib
import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import smart_patch_model_source
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.lama_infill import (
    OUTPAINT_INFILL_BYTE_SIZE,
    OUTPAINT_INFILL_SHA256,
    load_local_lama,
)
from imagegen_worker.protocol import process_request


def _request(directory: Path, mode: str = "img2img", alpha: int = 255) -> dict[str, object]:
    stage = directory / "stage"
    stage.mkdir()
    source = Image.new("RGBA", (64, 64), (32, 64, 96, alpha))
    source_path = stage / "processing-source.png"
    source.save(source_path, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    encoded = source_path.read_bytes()
    return {
        "type": "prepare-smart-patch-model-source",
        "requestId": "model-source-1",
        "protocolVersion": "1",
        "mode": mode,
        "source": {
            "path": str(source_path),
            "sha256": hashlib.sha256(encoded).hexdigest(),
            "byteSize": len(encoded),
            "width": source.width,
            "height": source.height,
        },
        "infillResource": (
            {
                "path": str(directory / "big-lama.pt"),
                "sha256": OUTPAINT_INFILL_SHA256,
                "byteSize": OUTPAINT_INFILL_BYTE_SIZE,
                "role": "outpaint-infill",
            }
            if mode == "outpaint"
            else None
        ),
        "output": {
            "stagingRoot": str(stage),
            "modelSourcePngPath": str(stage / "model-source.png"),
        },
    }


def _source(payload: dict[str, object]) -> dict[str, object]:
    return cast(dict[str, object], payload["source"])


def _output(payload: dict[str, object]) -> Path:
    output = cast(dict[str, str], payload["output"])
    return Path(output["modelSourcePngPath"])


def _replace_source(payload: dict[str, object], image: Image.Image, *, tagged: bool = True) -> None:
    reference = _source(payload)
    path = Path(cast(str, reference["path"]))
    if tagged:
        image.save(path, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    else:
        image.save(path, format="PNG")
    encoded = path.read_bytes()
    reference.update(
        sha256=hashlib.sha256(encoded).hexdigest(),
        byteSize=len(encoded),
        width=image.width,
        height=image.height,
    )


def _assert_rgb(payload: dict[str, object], response: dict[str, object]) -> Image.Image:
    assert response["type"] == "smart-patch-model-source-prepared", response
    assert response["requestId"] == payload["requestId"]
    destination = _output(payload)
    encoded = destination.read_bytes()
    assert encoded[:8] == b"\x89PNG\r\n\x1a\n"
    assert encoded[24:29] == bytes((8, 2, 0, 0, 0))  # actual RGB8 IHDR
    reference = _source(payload)
    assert response["modelSource"] == {
        "byteSize": len(encoded),
        "colorSpace": "srgb",
        "height": reference["height"],
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "width": reference["width"],
    }
    with Image.open(destination) as image:
        image.load()
        assert image.format == "PNG" and image.mode == "RGB"
        assert image.info.get("icc_profile") == SRGB_ICC_PROFILE
        return image.copy()


def _forbid_loader(*_args: object, **_kwargs: object) -> Any:
    pytest.fail("This path must fail or return before LaMa/model loading.")


@pytest.mark.parametrize("mode", ["img2img", "inpaint"])
def test_actual_protocol_img_and_inp_strip_alpha_without_changing_rgb_or_loading_lama(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    payload = _request(tmp_path, mode, alpha=64)
    image = Image.new("RGBA", (64, 64), (32, 64, 96, 64))
    for column, alpha in enumerate((0, 1, 64, 128, 254, 255)):
        image.putpixel((column, 0), (20 + column, 40 + column, 80 + column, alpha))
    _replace_source(payload, image)
    source_path = Path(cast(str, _source(payload)["path"]))
    before = source_path.read_bytes()
    monkeypatch.setattr(smart_patch_model_source, "load_local_lama", _forbid_loader)
    result = _assert_rgb(payload, process_request(payload))
    assert result.tobytes() == image.convert("RGB").tobytes()
    assert source_path.read_bytes() == before
    assert sorted(path.name for path in _output(payload).parent.iterdir()) == [
        "model-source.png",
        "processing-source.png",
    ]


def test_actual_txt_returns_null_without_source_reads_or_resource_or_output_access(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload: dict[str, object] = {
        "type": "prepare-smart-patch-model-source",
        "requestId": "txt-source",
        "protocolVersion": "1",
        "mode": "txt2img",
        "source": None,
        "infillResource": None,
        "output": {"stagingRoot": str(tmp_path / "absent-stage"), "modelSourcePngPath": None},
    }
    monkeypatch.setattr(smart_patch_model_source, "decode_preparation_image", _forbid_loader)
    monkeypatch.setattr(smart_patch_model_source, "load_local_lama", _forbid_loader)
    monkeypatch.setattr(smart_patch_model_source, "_destination", _forbid_loader)
    assert process_request(payload) == {
        "type": "smart-patch-model-source-prepared",
        "protocolVersion": "1",
        "requestId": "txt-source",
        "modelSource": None,
    }
    assert list(tmp_path.iterdir()) == []


@pytest.fixture(scope="module")
def torch() -> Any:
    return pytest.importorskip("torch")


def _boundary_model(directory: Path, torch: Any, kind: str = "valid") -> tuple[Path, str, int]:
    class SourceBoundary(torch.nn.Module):
        def forward(self, image: Any, mask: Any) -> Any:
            # Change opaque pixels too: pasting the original source back would be wrong.
            result = image * 0.25 + mask * 0.5 + (1 - mask) * 0.125
            if kind == "shape":
                return result[:, :1]
            if kind == "nonfinite":
                return result * float("nan")
            if kind == "dtype":
                return result.to(torch.uint8)
            return result

    module = torch.jit.trace(
        SourceBoundary().eval(), (torch.zeros(1, 3, 64, 64), torch.zeros(1, 1, 64, 64))
    )
    path = directory / "tensor-boundary.pt"
    torch.jit.save(module, str(path))
    encoded = path.read_bytes()
    return path, hashlib.sha256(encoded).hexdigest(), len(encoded)


def _install_boundary_loader(
    directory: Path, torch: Any, monkeypatch: pytest.MonkeyPatch, *, kind: str = "valid"
) -> list[str]:
    fixture, digest, size = _boundary_model(directory, torch, kind)
    calls: list[str] = []

    def mapped_loader(
        path: Path,
        *,
        expected_sha256: str,
        expected_byte_size: int,
        device: str,
    ) -> Any:
        assert path == directory / "big-lama.pt"
        assert expected_sha256 == OUTPAINT_INFILL_SHA256
        assert expected_byte_size == OUTPAINT_INFILL_BYTE_SIZE
        assert device == "cpu"
        calls.append("load")
        return load_local_lama(fixture, expected_sha256=digest, expected_byte_size=size)

    monkeypatch.setattr(smart_patch_model_source, "load_local_lama", mapped_loader)
    return calls


def test_actual_out_protocol_runs_source_alpha_only_and_returns_full_torchscript_rgb(
    tmp_path: Path, torch: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path, "outpaint")
    image = Image.new("RGBA", (64, 64), (32, 64, 96, 255))
    for column, alpha in enumerate((0, 1, 64, 128, 254, 255)):
        image.putpixel((column, 0), (32, 64, 96, alpha))
    _replace_source(payload, image)
    before = Path(cast(str, _source(payload)["path"])).read_bytes()
    calls = _install_boundary_loader(tmp_path, torch, monkeypatch)
    monkeypatch.setattr(socket.socket, "connect", _forbid_loader)
    result = _assert_rgb(payload, process_request(payload))
    assert calls == ["load"]
    for column in range(5):
        assert result.getpixel((column, 0)) == (135, 143, 151)
    assert result.getpixel((5, 0)) == (39, 47, 55)
    assert result.getpixel((63, 63)) == (39, 47, 55)
    assert Path(cast(str, _source(payload)["path"])).read_bytes() == before


@pytest.mark.parametrize(("alpha", "pixel"), [(0, (135, 143, 151)), (255, (39, 47, 55))])
def test_actual_out_retains_mode_for_uniform_processing_extremes_and_runs_lama(
    tmp_path: Path, torch: Any, monkeypatch: pytest.MonkeyPatch, alpha: int, pixel: tuple[int, ...]
) -> None:
    payload = _request(tmp_path, "outpaint", alpha)
    calls = _install_boundary_loader(tmp_path, torch, monkeypatch)
    result = _assert_rgb(payload, process_request(payload))
    assert calls == ["load"]
    assert result.tobytes() == bytes(pixel) * (64 * 64)


@pytest.mark.parametrize("kind", ["shape", "nonfinite", "dtype"])
def test_out_real_forward_refusals_publish_no_partial_model_source(
    tmp_path: Path, torch: Any, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    payload = _request(tmp_path, "outpaint", 128)
    calls = _install_boundary_loader(tmp_path, torch, monkeypatch, kind=kind)
    response = process_request(payload)
    assert response["type"] == "error" and response["code"] == "GENERATION_WORKER_FAILED"
    assert calls == ["load"]
    assert [path.name for path in _output(payload).parent.iterdir()] == ["processing-source.png"]


@pytest.mark.parametrize(
    "fault",
    [
        "mode",
        "mask-field",
        "source-null",
        "resource-null",
        "resource-hash",
        "resource-size",
        "resource-size-bool",
        "resource-role",
        "resource-extra",
        "output-null",
        "source-rgb",
        "source-icc",
        "source-hash",
        "source-size",
        "source-bool-width",
        "source-not-grid",
        "source-too-wide",
        "source-too-many-pixels",
        "source-too-many-bytes",
    ],
)
def test_malformed_or_changed_out_source_refuses_before_any_lama_load(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    payload = _request(tmp_path, "outpaint", 128)
    resource = cast(dict[str, object], payload["infillResource"])
    source = _source(payload)
    output = cast(dict[str, object], payload["output"])
    if fault == "mode":
        payload["mode"] = "unimplemented"
    elif fault == "mask-field":
        payload["effectiveMask"] = source.copy()
    elif fault == "source-null":
        payload["source"] = None
    elif fault == "resource-null":
        payload["infillResource"] = None
    elif fault == "resource-hash":
        resource["sha256"] = "0" * 64
    elif fault == "resource-size":
        resource["byteSize"] = OUTPAINT_INFILL_BYTE_SIZE - 1
    elif fault == "resource-size-bool":
        resource["byteSize"] = True
    elif fault == "resource-role":
        resource["role"] = "checkpoint"
    elif fault == "resource-extra":
        resource["url"] = "https://example.invalid/model.pt"
    elif fault == "output-null":
        output["modelSourcePngPath"] = None
    elif fault == "source-rgb":
        _replace_source(payload, Image.new("RGB", (64, 64), (32, 64, 96)))
    elif fault == "source-icc":
        _replace_source(payload, Image.new("RGBA", (64, 64), (32, 64, 96, 128)), tagged=False)
    elif fault == "source-hash":
        source["sha256"] = "0" * 64
    elif fault == "source-size":
        source["byteSize"] = cast(int, source["byteSize"]) + 1
    elif fault == "source-bool-width":
        source["width"] = True
    elif fault == "source-not-grid":
        source["width"] = 65
    elif fault == "source-too-wide":
        source["width"] = 2056
    elif fault == "source-too-many-pixels":
        source.update(width=2048, height=2048)
    else:
        source["byteSize"] = 32 * 1024 * 1024 + 1
    monkeypatch.setattr(smart_patch_model_source, "load_local_lama", _forbid_loader)
    response = process_request(payload)
    assert response["type"] == "error", response
    assert response["code"] in {
        "INVALID_REQUEST",
        "INVALID_IMAGE",
        "INPUT_COLOR_PROFILE",
        "INPUT_HASH_MISMATCH",
        "INPUT_TOO_LARGE",
        "IMAGE_TOO_LARGE",
    }
    assert sorted(path.name for path in (tmp_path / "stage").iterdir()) == ["processing-source.png"]


@pytest.mark.parametrize("mode", ["txt2img", "img2img", "inpaint"])
def test_nonout_modes_refuse_an_infill_resource_before_model_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    payload = _request(tmp_path, "outpaint", 128)
    payload["mode"] = mode
    if mode == "txt2img":
        payload["source"] = None
        cast(dict[str, object], payload["output"])["modelSourcePngPath"] = None
    monkeypatch.setattr(smart_patch_model_source, "load_local_lama", _forbid_loader)
    response = process_request(payload)
    assert response["type"] == "error" and response["code"] == "INVALID_REQUEST"


@pytest.mark.parametrize(
    "fault",
    [
        "existing-output",
        "outside-output",
        "input-alias",
        "resource-source",
        "resource-output",
        "resource-in-stage",
        "resource-symlink",
        "source-symlink",
        "output-parent-symlink",
    ],
)
def test_path_ownership_refusals_precede_model_load_and_preserve_existing_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    payload = _request(tmp_path, "outpaint", 128)
    source = _source(payload)
    resource = cast(dict[str, object], payload["infillResource"])
    output = cast(dict[str, object], payload["output"])
    destination = _output(payload)
    if fault == "existing-output":
        destination.write_bytes(b"preserve existing")
    elif fault == "outside-output":
        output["modelSourcePngPath"] = str(tmp_path / "outside.png")
    elif fault == "input-alias":
        output["modelSourcePngPath"] = source["path"]
    elif fault == "resource-source":
        resource["path"] = source["path"]
    elif fault == "resource-output":
        resource["path"] = str(destination)
    elif fault == "resource-in-stage":
        resource["path"] = str(destination.parent / "owned-lama.pt")
    elif fault == "resource-symlink":
        original = tmp_path / "model-file.pt"
        original.write_bytes(b"not loaded")
        link = tmp_path / "linked-model.pt"
        link.symlink_to(original)
        resource["path"] = str(link)
    elif fault == "source-symlink":
        link = destination.parent / "linked-source.png"
        link.symlink_to(Path(cast(str, source["path"])))
        source["path"] = str(link)
    else:
        link = destination.parent / "linked-directory"
        link.symlink_to(destination.parent, target_is_directory=True)
        output["modelSourcePngPath"] = str(link / "model-source.png")
    files = {
        str(path): path.read_bytes()
        for path in tmp_path.rglob("*")
        if path.is_file() and not path.is_symlink()
    }
    monkeypatch.setattr(smart_patch_model_source, "load_local_lama", _forbid_loader)
    response = process_request(payload)
    assert response["type"] == "error", response
    assert response["code"] in {"INVALID_PATH", "OUTPUT_UNAVAILABLE"}
    assert {
        str(path): path.read_bytes()
        for path in tmp_path.rglob("*")
        if path.is_file() and not path.is_symlink()
    } == files


@pytest.mark.parametrize("phase", ["link", "metadata"])
def test_publication_failure_removes_owned_temporary_and_published_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, phase: str
) -> None:
    payload = _request(tmp_path)

    def fail(*_args: object, **_kwargs: object) -> Any:
        raise OSError("controlled publication failure")

    if phase == "link":
        monkeypatch.setattr(smart_patch_model_source.os, "link", fail)
    else:
        monkeypatch.setattr(smart_patch_model_source, "artifact_info", fail)
    response = process_request(payload)
    assert response["type"] == "error" and response["code"] == "DERIVATIVE_FAILED"
    assert [path.name for path in _output(payload).parent.iterdir()] == ["processing-source.png"]


def test_preexisting_output_created_during_publish_is_preserved(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path)
    original_link = os.link

    def racing_link(source: Path, destination: Path, *, follow_symlinks: bool) -> None:
        destination.write_bytes(b"late outside owner")
        original_link(source, destination, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(smart_patch_model_source.os, "link", racing_link)
    response = process_request(payload)
    assert response["type"] == "error" and response["code"] == "OUTPUT_UNAVAILABLE"
    assert _output(payload).read_bytes() == b"late outside owner"
    assert sorted(path.name for path in _output(payload).parent.iterdir()) == [
        "model-source.png",
        "processing-source.png",
    ]


def test_missing_exact_pinned_resource_refuses_without_fallback_or_output(tmp_path: Path) -> None:
    payload = _request(tmp_path, "outpaint", 128)
    response = process_request(payload)
    assert response["type"] == "error" and response["code"] == "GENERATION_INPUT_CHANGED"
    assert not _output(payload).exists()


def test_actual_json_lines_worker_advertises_private_operation_and_returns_rgb(
    tmp_path: Path,
) -> None:
    payload = _request(tmp_path, "inpaint", 64)
    result = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input=json.dumps(payload) + "\n",
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    assert result.stderr == ""
    messages = [json.loads(line) for line in result.stdout.splitlines()]
    assert len(messages) == 2 and messages[0]["type"] == "ready"
    assert "smart-patch-model-source" in messages[0]["capabilities"]
    result_image = _assert_rgb(payload, messages[1])
    assert result_image.tobytes() == bytes((32, 64, 96)) * (64 * 64)
