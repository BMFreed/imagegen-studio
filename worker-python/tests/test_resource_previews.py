from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest
from PIL import Image

from imagegen_worker import resource_previews
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.protocol import process_request
from imagegen_worker.resource_previews import ResourcePreviewRequest, create_resource_preview

ADOBE_RGB_PROFILE = (Path(__file__).parent / "fixtures" / "AdobeRGB1998.icc").read_bytes()


def fixture_request(
    tmp_path: Path, *, dimensions: tuple[int, int] = (120, 80), image_format: str = "PNG"
) -> ResourcePreviewRequest:
    tmp_path.mkdir(parents=True, exist_ok=True)
    source = tmp_path / "source.image"
    image = Image.new("RGB" if image_format == "JPEG" else "RGBA", dimensions, (20, 60, 140, 100))
    image.save(source, format=image_format)
    staging = tmp_path / "staging"
    staging.mkdir()
    return ResourcePreviewRequest(
        input_path=source,
        input_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        staging_root=staging,
        preview_webp_path=staging / "preview.webp",
        thumbnail_webp_path=staging / "thumbnail.webp",
        preview_max_side=512,
        thumbnail_max_side=96,
    )


def refreshed(request: ResourcePreviewRequest) -> ResourcePreviewRequest:
    return replace(
        request, input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest()
    )


@pytest.mark.parametrize("image_format", ["PNG", "JPEG", "WEBP"])
def test_resource_images_are_normalized_bounded_and_not_upscaled(
    tmp_path: Path, image_format: str
) -> None:
    # Boundary: production worker over actual input/output files. Mutation: resize to the fixed
    # max-side dimensions, relabel the source rather than normalize, or omit the output ICC.
    request = fixture_request(tmp_path, image_format=image_format)
    source_before = request.input_path.read_bytes()
    result = create_resource_preview(request)
    for name, output, dimensions in (
        ("preview", request.preview_webp_path, (120, 80)),
        ("thumbnail", request.thumbnail_webp_path, (96, 64)),
    ):
        with Image.open(output) as image:
            assert image.format == "WEBP"
            assert image.size == dimensions
            assert image.info["icc_profile"] == SRGB_ICC_PROFILE
            pixel = image.convert("RGBA").getpixel((0, 0))
            assert isinstance(pixel, tuple)
            assert pixel[3] == (255 if image_format == "JPEG" else 100)
        assert result[name]["byteSize"] == output.stat().st_size
        assert result[name]["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
        assert result[name]["colorSpace"] == "srgb"
    assert request.input_path.read_bytes() == source_before
    assert {entry.name for entry in request.staging_root.iterdir()} == {
        "preview.webp",
        "thumbnail.webp",
    }


@pytest.mark.parametrize("dimensions", [(1024, 512), (512, 1024), (1, 1)])
def test_preview_preserves_aspect_and_transparent_edges(
    tmp_path: Path, dimensions: tuple[int, int]
) -> None:
    request = fixture_request(tmp_path, dimensions=dimensions)
    image = Image.new("RGBA", dimensions, (0, 0, 0, 0))
    image.putpixel((dimensions[0] // 2, dimensions[1] // 2), (200, 20, 40, 200))
    image.save(request.input_path, format="PNG")
    create_resource_preview(refreshed(request))
    expected = {
        (1024, 512): ((512, 256), (96, 48)),
        (512, 1024): ((256, 512), (48, 96)),
        (1, 1): ((1, 1), (1, 1)),
    }[dimensions]
    for output, size in zip(
        (request.preview_webp_path, request.thumbnail_webp_path), expected, strict=True
    ):
        with Image.open(output) as rendered:
            assert rendered.size == size
            alpha = rendered.convert("RGBA").getchannel("A")
            if size != (1, 1):
                assert alpha.getpixel((0, 0)) == 0
            else:
                assert alpha.getpixel((0, 0)) == 200


def test_fully_transparent_preview_keeps_geometry_and_lossless_hidden_pixels(
    tmp_path: Path,
) -> None:
    request = fixture_request(tmp_path, dimensions=(8, 6))
    Image.new("RGBA", (8, 6), (90, 100, 110, 0)).save(request.input_path, format="PNG")
    create_resource_preview(refreshed(request))
    for output in (request.preview_webp_path, request.thumbnail_webp_path):
        with Image.open(output) as image:
            assert image.size == (8, 6)
            assert image.convert("RGBA").getpixel((2, 2)) == (90, 100, 110, 0)


@pytest.mark.parametrize("image_format", ["PNG", "JPEG", "WEBP"])
def test_foreign_icc_changes_pixels_and_alpha_is_retained(
    tmp_path: Path, image_format: str
) -> None:
    request = fixture_request(tmp_path, dimensions=(8, 6), image_format=image_format)
    image = Image.new("RGB" if image_format == "JPEG" else "RGBA", (8, 6), (180, 100, 50, 77))
    image.save(request.input_path, format=image_format, icc_profile=ADOBE_RGB_PROFILE)
    create_resource_preview(refreshed(request))
    for output in (request.preview_webp_path, request.thumbnail_webp_path):
        with Image.open(output) as normalized:
            pixel = normalized.convert("RGBA").getpixel((0, 0))
            assert isinstance(pixel, tuple)
            assert abs(pixel[0] - 203) <= 4
            assert abs(pixel[1] - 100) <= 4
            assert abs(pixel[2] - 42) <= 4
            assert pixel[3] == (255 if image_format == "JPEG" else 77)
            assert normalized.info["icc_profile"] == SRGB_ICC_PROFILE


def test_exif_orientation_is_applied_to_color_and_alpha_before_sizing(tmp_path: Path) -> None:
    request = fixture_request(tmp_path, dimensions=(2, 1))
    image = Image.new("RGBA", (2, 1), (240, 30, 30, 33))
    image.putpixel((1, 0), (20, 40, 230, 220))
    exif = Image.Exif()
    exif[274] = 6
    image.save(request.input_path, format="PNG", exif=exif)
    create_resource_preview(refreshed(request))
    for output in (request.preview_webp_path, request.thumbnail_webp_path):
        with Image.open(output) as normalized:
            assert normalized.size == (1, 2)
            assert normalized.convert("RGBA").getpixel((0, 0)) == (240, 30, 30, 33)
            assert normalized.convert("RGBA").getpixel((0, 1)) == (20, 40, 230, 220)


@pytest.mark.parametrize("failure", ["hash", "invalid", "oversize", "profile", "dimensions"])
def test_bad_input_cannot_publish_outputs(tmp_path: Path, failure: str) -> None:
    request = fixture_request(tmp_path)
    code = {
        "hash": "INPUT_HASH_MISMATCH",
        "invalid": "INVALID_IMAGE",
        "oversize": "INPUT_TOO_LARGE",
        "profile": "INVALID_COLOR_PROFILE",
        "dimensions": "IMAGE_TOO_LARGE",
    }[failure]
    if failure == "hash":
        request = replace(request, input_sha256="0" * 64)
    elif failure == "invalid":
        request.input_path.write_bytes(b"not an image")
        request = refreshed(request)
    elif failure == "oversize":
        request.input_path.write_bytes(b"x" * (resource_previews.MAX_RESOURCE_SOURCE_BYTES + 1))
        request = refreshed(request)
    elif failure == "profile":
        Image.new("RGB", (8, 6)).save(request.input_path, format="PNG", icc_profile=b"bad profile")
        request = refreshed(request)
    else:
        Image.new("RGB", (16385, 1)).save(request.input_path, format="PNG")
        request = refreshed(request)
    with pytest.raises(DerivativeError) as caught:
        create_resource_preview(request)
    assert caught.value.code == code
    assert list(request.staging_root.iterdir()) == []


@pytest.mark.parametrize("failure", ["escape", "symlink", "existing", "same-output"])
def test_unsafe_outputs_never_replace_existing_files(tmp_path: Path, failure: str) -> None:
    request = fixture_request(tmp_path)
    sentinel = tmp_path / "keep.webp"
    sentinel.write_bytes(b"keep")
    if failure == "escape":
        request = replace(request, preview_webp_path=sentinel)
    elif failure == "symlink":
        request.preview_webp_path.symlink_to(sentinel)
    elif failure == "existing":
        request.preview_webp_path.write_bytes(b"existing")
    else:
        request = replace(request, thumbnail_webp_path=request.preview_webp_path)
    with pytest.raises(DerivativeError):
        create_resource_preview(request)
    assert sentinel.read_bytes() == b"keep"
    if failure == "existing":
        assert request.preview_webp_path.read_bytes() == b"existing"
    if failure != "same-output":
        assert not request.thumbnail_webp_path.exists()


def test_second_publication_failure_cleans_first_and_temporary_outputs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    request = fixture_request(tmp_path)
    link = os.link
    calls = 0

    def fail_second(
        source: os.PathLike[str], destination: os.PathLike[str], *, follow_symlinks: bool
    ) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("disk full")
        link(source, destination, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(resource_previews.os, "link", fail_second)
    with pytest.raises(DerivativeError) as caught:
        create_resource_preview(request)
    assert caught.value.code == "DERIVATIVE_FAILED"
    assert calls == 2
    assert list(request.staging_root.iterdir()) == []


def command(request: ResourcePreviewRequest) -> dict[str, object]:
    return {
        "type": "create-resource-preview",
        "protocolVersion": "1",
        "requestId": "resource-1",
        "input": {"path": str(request.input_path), "sha256": request.input_sha256},
        "output": {
            "stagingRoot": str(request.staging_root),
            "previewWebpPath": str(request.preview_webp_path),
            "thumbnailWebpPath": str(request.thumbnail_webp_path),
        },
        "previewMaxSide": request.preview_max_side,
        "thumbnailMaxSide": request.thumbnail_max_side,
    }


@pytest.mark.parametrize(
    "field,value",
    [
        ("previewMaxSide", 513),
        ("thumbnailMaxSide", 129),
        ("previewMaxSide", True),
        ("thumbnailMaxSide", 31),
    ],
)
def test_protocol_rejects_unsupported_preview_bounds(
    tmp_path: Path, field: str, value: int | bool
) -> None:
    request = fixture_request(tmp_path)
    message = command(request)
    message[field] = value
    response = process_request(message)
    assert response["type"] == "error"
    assert response["code"] == "INVALID_REQUEST"
    assert list(request.staging_root.iterdir()) == []


def test_real_json_lines_worker_advertises_capability_and_returns_both_real_images(
    tmp_path: Path,
) -> None:
    request = fixture_request(tmp_path)
    result = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input=json.dumps(command(request)) + "\n",
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    ready, response = [json.loads(line) for line in result.stdout.splitlines()]
    assert "resource-preview" in ready["capabilities"]
    assert response["type"] == "resource-preview-done"
    assert response["requestId"] == "resource-1"
    assert result.stderr == ""
    assert (
        response["preview"]["sha256"]
        == hashlib.sha256(request.preview_webp_path.read_bytes()).hexdigest()
    )
    assert response["thumbnail"]["width"] == 96
