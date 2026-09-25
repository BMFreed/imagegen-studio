from __future__ import annotations

import hashlib
import os
from dataclasses import replace
from pathlib import Path

import pytest
from PIL import Image

from imagegen_worker import derivatives
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    DerivativeRequest,
    create_derivatives,
)


def fixture_request(
    tmp_path: Path, *, dimensions: tuple[int, int] = (120, 80)
) -> DerivativeRequest:
    tmp_path.mkdir(parents=True, exist_ok=True)
    source = tmp_path / "frozen-composite.png"
    Image.new("RGBA", dimensions, (20, 60, 140, 100)).save(source)
    staging = tmp_path / "staging"
    preview = staging / "preview"
    preview.mkdir(parents=True)
    return DerivativeRequest(
        input_path=source,
        input_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        input_color_space="srgb",
        staging_root=staging,
        merged_png_path=preview / "merged.png",
        thumbnail_webp_path=preview / "thumbnail.webp",
        thumbnail_max_side=64,
    )


def test_creates_valid_png_and_webp_from_exact_frozen_input(tmp_path: Path) -> None:
    request = fixture_request(tmp_path)
    result = create_derivatives(request)

    with Image.open(request.merged_png_path) as merged:
        assert merged.format == "PNG"
        assert merged.size == (120, 80)
        assert merged.convert("RGBA").getpixel((0, 0)) == (20, 60, 140, 100)
        assert merged.info["icc_profile"] == SRGB_ICC_PROFILE
    with Image.open(request.thumbnail_webp_path) as thumbnail:
        assert thumbnail.format == "WEBP"
        assert thumbnail.size == (64, 43)
        pixel = thumbnail.convert("RGBA").getpixel((0, 0))
        assert isinstance(pixel, tuple) and pixel[3] == 100
        assert thumbnail.info["icc_profile"] == SRGB_ICC_PROFILE

    for key, path in (
        ("merged", request.merged_png_path),
        ("thumbnail", request.thumbnail_webp_path),
    ):
        assert result[key]["byteSize"] == path.stat().st_size
        assert result[key]["colorSpace"] == "srgb"
        assert result[key]["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert not list(request.merged_png_path.parent.glob("*.tmp"))


def test_hash_mismatch_cannot_publish_any_preview(tmp_path: Path) -> None:
    request = fixture_request(tmp_path)
    request = replace(request, input_sha256="0" * 64)
    with pytest.raises(DerivativeError, match="changed") as error:
        create_derivatives(request)
    assert error.value.code == "INPUT_HASH_MISMATCH"
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()


def test_escaping_or_symlinked_output_is_rejected(tmp_path: Path) -> None:
    request = fixture_request(tmp_path)
    outside = tmp_path / "outside.webp"
    request = replace(request, thumbnail_webp_path=outside)
    with pytest.raises(DerivativeError) as error:
        create_derivatives(request)
    assert error.value.code == "INVALID_PATH"
    assert not outside.exists()

    linked = tmp_path / "linked-preview"
    linked.symlink_to(request.merged_png_path.parent, target_is_directory=True)
    request = replace(request, thumbnail_webp_path=linked / "thumbnail.webp")
    with pytest.raises(DerivativeError) as error:
        create_derivatives(request)
    assert error.value.code == "INVALID_PATH"


def test_existing_target_is_not_replaced(tmp_path: Path) -> None:
    request = fixture_request(tmp_path)
    request.merged_png_path.write_bytes(b"keep me")
    with pytest.raises(DerivativeError) as error:
        create_derivatives(request)
    assert error.value.code == "OUTPUT_UNAVAILABLE"
    assert request.merged_png_path.read_bytes() == b"keep me"
    assert not request.thumbnail_webp_path.exists()


def test_second_publish_failure_cleans_first_preview(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    request = fixture_request(tmp_path)
    link = os.link
    calls = 0

    def fail_second_link(
        source: os.PathLike[str], destination: os.PathLike[str], *, follow_symlinks: bool
    ) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated full disk")
        link(source, destination, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(derivatives.os, "link", fail_second_link)
    with pytest.raises(DerivativeError) as error:
        create_derivatives(request)
    assert error.value.code == "DERIVATIVE_FAILED"
    assert calls == 2
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()
    assert not list(request.merged_png_path.parent.glob("*.tmp"))


def test_non_png_and_excessive_dimensions_are_rejected(tmp_path: Path) -> None:
    request = fixture_request(tmp_path)
    Image.new("RGB", (20, 20), "red").save(request.input_path, format="WEBP")
    request = replace(
        request, input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest()
    )
    with pytest.raises(DerivativeError) as error:
        create_derivatives(request)
    assert error.value.code == "INVALID_IMAGE"

    large = fixture_request(tmp_path / "another", dimensions=(1, derivatives.MAX_IMAGE_SIDE + 1))
    with pytest.raises(DerivativeError) as error:
        create_derivatives(large)
    assert error.value.code == "IMAGE_TOO_LARGE"


def test_embedded_input_icc_is_rejected_without_pixel_conversion(tmp_path: Path) -> None:
    request = fixture_request(tmp_path)
    Image.new("RGBA", (20, 20), (20, 60, 140, 100)).save(
        request.input_path, icc_profile=SRGB_ICC_PROFILE
    )
    request = replace(
        request, input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest()
    )
    with pytest.raises(DerivativeError) as error:
        create_derivatives(request)
    assert error.value.code == "INPUT_COLOR_PROFILE"
    assert not request.merged_png_path.exists()
    assert not request.thumbnail_webp_path.exists()
