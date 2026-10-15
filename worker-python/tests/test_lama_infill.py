"""Real local TorchScript loading/forward contract, explicitly not trained LaMa quality."""

from __future__ import annotations

import hashlib
import os
import socket
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.lama_infill import load_local_lama


@pytest.fixture(scope="module")
def torch() -> Any:
    return pytest.importorskip("torch")


def _script_fixture(tmp_path: Path, torch: Any, kind: str = "valid") -> tuple[Path, str, int]:
    """Test model is a deterministic tensor boundary, never a model-quality oracle."""

    class BoundaryModule(torch.nn.Module):
        def forward(self, image: Any, mask: Any) -> Any:
            output = image * (1 - mask) + mask * 0.5
            if kind == "shape":
                return output[:, :1]
            if kind == "nonfinite":
                return output * float("nan")
            if kind == "dtype":
                return output.to(torch.uint8)
            return output

    model = torch.jit.trace(
        BoundaryModule().eval(), (torch.zeros(1, 3, 64, 64), torch.zeros(1, 1, 64, 64))
    )
    path = tmp_path / "local-lama-boundary-fixture.pt"
    torch.jit.save(model, str(path))
    encoded = path.read_bytes()
    return path, hashlib.sha256(encoded).hexdigest(), len(encoded)


def _source() -> Image.Image:
    source = Image.new("RGBA", (64, 64), (32, 64, 96, 255))
    source.putpixel((0, 0), (40, 80, 120, 0))
    source.putpixel((1, 0), (40, 80, 120, 128))
    source.putpixel((2, 0), (40, 80, 120, 254))
    source.info["icc_profile"] = SRGB_ICC_PROFILE
    return source


def test_local_script_runs_real_rgb_normalization_and_every_nonopaque_hole(
    tmp_path: Path, torch: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    path, digest, size = _script_fixture(tmp_path, torch)

    def refuse_network(*_args: Any, **_kwargs: Any) -> None:
        pytest.fail("Local LaMa must not connect to the network.")

    monkeypatch.setattr(socket.socket, "connect", refuse_network)
    source = _source()
    before = source.tobytes(), dict(source.info)
    loaded = load_local_lama(path, expected_sha256=digest, expected_byte_size=size)
    result = loaded.infill(source)
    assert result.mode == "RGB" and result.size == source.size
    assert result.info["icc_profile"] == SRGB_ICC_PROFILE
    assert result.getpixel((3, 0)) == (32, 64, 96)
    for column in range(3):
        assert result.getpixel((column, 0)) == (127, 127, 127)
    assert (source.tobytes(), source.info) == before


@pytest.mark.parametrize("kind", ["shape", "nonfinite", "dtype"])
def test_real_script_invalid_output_refuses(tmp_path: Path, torch: Any, kind: str) -> None:
    path, digest, size = _script_fixture(tmp_path, torch, kind)
    loaded = load_local_lama(path, expected_sha256=digest, expected_byte_size=size)
    with pytest.raises(DerivativeError) as raised:
        loaded.infill(_source())
    assert raised.value.code == "GENERATION_WORKER_FAILED"


@pytest.mark.parametrize(
    "identity", ["hash", "size", "missing", "symlink", "parent-symlink", "fifo"]
)
def test_actual_local_file_identity_refuses_before_loading(tmp_path: Path, identity: str) -> None:
    path = tmp_path / "model.pt"
    path.write_bytes(b"not TorchScript")
    digest, size = hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_size
    if identity == "hash":
        digest = "0" * 64
    elif identity == "size":
        size += 1
    elif identity == "missing":
        path.unlink()
    elif identity == "symlink":
        link = tmp_path / "link.pt"
        link.symlink_to(path)
        path = link
    elif identity == "parent-symlink":
        link = tmp_path / "directory-link"
        link.symlink_to(tmp_path, target_is_directory=True)
        path = link / "model.pt"
    else:
        path.unlink()
        os.mkfifo(path)
    with pytest.raises(DerivativeError) as raised:
        load_local_lama(path, expected_sha256=digest, expected_byte_size=size)
    assert raised.value.code in {"INVALID_PATH", "GENERATION_INPUT_CHANGED"}


@pytest.mark.parametrize(
    ("digest", "size"), [("A" * 64, 1), ("x", 1), ("0" * 64, True), ("0" * 64, 0)]
)
def test_identity_fields_are_not_coerced(tmp_path: Path, digest: str, size: int) -> None:
    with pytest.raises(DerivativeError) as raised:
        load_local_lama(tmp_path / "missing.pt", expected_sha256=digest, expected_byte_size=size)
    assert raised.value.code == "INVALID_REQUEST"


def test_nonlocal_or_relative_path_refuses() -> None:
    for path in (Path("model.pt"), cast(Path, "https://example.invalid/model.pt")):
        with pytest.raises(DerivativeError) as raised:
            load_local_lama(path, expected_sha256="0" * 64, expected_byte_size=1)
        assert raised.value.code == "INVALID_PATH"


def test_actual_loader_uses_snapshot_when_path_changes_before_native_load(
    tmp_path: Path, torch: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    path, digest, size = _script_fixture(tmp_path, torch)
    original = torch.jit.load

    def replace_then_load(snapshot: Any, **kwargs: Any) -> Any:
        path.write_bytes(b"changed after verified descriptor read")
        return original(snapshot, **kwargs)

    monkeypatch.setattr(torch.jit, "load", replace_then_load)
    loaded = load_local_lama(path, expected_sha256=digest, expected_byte_size=size)
    assert loaded.infill(_source()).getpixel((0, 0)) == (127, 127, 127)
    assert hashlib.sha256(path.read_bytes()).hexdigest() != digest


def test_truncated_real_script_and_opaque_neighbor_refuse(tmp_path: Path, torch: Any) -> None:
    path, _digest, _size = _script_fixture(tmp_path, torch)
    path.write_bytes(path.read_bytes()[:100])
    encoded = path.read_bytes()
    with pytest.raises(DerivativeError) as raised:
        load_local_lama(
            path,
            expected_sha256=hashlib.sha256(encoded).hexdigest(),
            expected_byte_size=len(encoded),
        )
    assert raised.value.code == "GENERATION_WORKER_FAILED"
    path, digest, size = _script_fixture(tmp_path, torch)
    loaded = load_local_lama(path, expected_sha256=digest, expected_byte_size=size)
    with pytest.raises(DerivativeError) as raised:
        loaded.infill(Image.new("RGBA", (64, 64), (1, 2, 3, 255)))
    assert raised.value.code == "GENERATION_TARGET_UNSUPPORTED"


@pytest.mark.parametrize("alpha", [0, 255])
def test_processing_extremes_are_distinct_from_strict_normal_out_entrypoint(
    tmp_path: Path, torch: Any, alpha: int
) -> None:
    path, digest, size = _script_fixture(tmp_path, torch)
    loaded = load_local_lama(path, expected_sha256=digest, expected_byte_size=size)
    source = Image.new("RGBA", (64, 64), (32, 64, 96, alpha))
    source.info["icc_profile"] = SRGB_ICC_PROFILE
    before = source.tobytes(), dict(source.info)
    with pytest.raises(DerivativeError) as raised:
        loaded.infill(source)
    assert raised.value.code == "GENERATION_TARGET_UNSUPPORTED"
    result = loaded.infill_processing_source(source)
    expected = (127, 127, 127) if alpha == 0 else (32, 64, 96)
    assert result.mode == "RGB" and result.tobytes() == bytes(expected) * 4096
    assert result.info["icc_profile"] == SRGB_ICC_PROFILE
    assert (source.tobytes(), source.info) == before


@pytest.mark.parametrize("fault", ["rgb", "grid", "side", "profile"])
def test_processing_source_guard_refuses_before_any_native_forward(
    tmp_path: Path, torch: Any, fault: str
) -> None:
    path, digest, size = _script_fixture(tmp_path, torch)
    loaded = load_local_lama(path, expected_sha256=digest, expected_byte_size=size)
    source = Image.new("RGBA", (64, 64), (32, 64, 96, 128))
    if fault == "rgb":
        source = source.convert("RGB")
    elif fault == "grid":
        source = source.resize((63, 64))
    elif fault == "side":
        source = source.resize((2056, 8))
    else:
        source.info["icc_profile"] = b"untrusted-profile"
    with pytest.raises(DerivativeError) as raised:
        loaded.infill_processing_source(source)
    assert raised.value.code in {"GENERATION_TARGET_UNSUPPORTED", "GENERATION_INPUT_CHANGED"}
