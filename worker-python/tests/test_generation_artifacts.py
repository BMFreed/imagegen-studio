"""Shared real-filesystem generation publication and refusal controls."""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest
from PIL import Image

from imagegen_worker import candidate_thumbnail, generation_artifacts
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError


def publish(root: Path, image: object = None) -> dict[str, object]:
    return generation_artifacts.publish_generation_image(
        Image.new("RGB", (64, 64), (10, 20, 30)) if image is None else image,
        staging_root=root,
        output_path=root / "candidate.png",
        width=64,
        height=64,
        request_id="shared-output-1",
        seed=0,
    )


def test_required_publication_is_exclusive_and_optional_cache_failure_keeps_png(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = tmp_path / "candidate.png"
    output.write_bytes(b"existing private output")
    with pytest.raises(DerivativeError) as error:
        publish(tmp_path)
    assert error.value.code == "OUTPUT_UNAVAILABLE"
    assert output.read_bytes() == b"existing private output"
    assert not list(tmp_path.glob(".*.tmp"))
    output.unlink()

    def cache_failure(_path: Path) -> bytes:
        raise OSError("controlled optional cache failure")

    monkeypatch.setattr(candidate_thumbnail, "_stable_thumbnail_bytes", cache_failure)
    done = publish(tmp_path)
    assert done == {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": "shared-output-1",
        "seed": 0,
        "outputPath": str(output),
    }
    with Image.open(output) as reopened:
        reopened.load()
        assert reopened.size == (64, 64) and reopened.mode == "RGB"
        assert reopened.info["icc_profile"] == SRGB_ICC_PROFILE
        assert reopened.getpixel((0, 0)) == (10, 20, 30)
    assert not list(tmp_path.glob(".*.tmp")) and not list(tmp_path.glob("*.webp"))


def test_directory_sync_failure_removes_its_new_png_and_temporary_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sync = os.fsync

    def refuse_directory_sync(descriptor: int) -> None:
        if stat.S_ISDIR(os.fstat(descriptor).st_mode):
            raise OSError("controlled output-directory sync failure")
        sync(descriptor)

    monkeypatch.setattr(generation_artifacts.os, "fsync", refuse_directory_sync)
    with pytest.raises(DerivativeError) as error:
        publish(tmp_path)
    assert error.value.code == "GENERATION_WORKER_FAILED"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("image", (object(), Image.new("RGB", (32, 64))))
def test_invalid_output_image_never_creates_a_provisional_artifact(
    tmp_path: Path, image: object
) -> None:
    with pytest.raises(DerivativeError) as error:
        publish(tmp_path, image)
    assert error.value.code == "GENERATION_WORKER_FAILED"
    assert list(tmp_path.iterdir()) == []
