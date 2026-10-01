from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from PIL import Image

from imagegen_worker import candidate_thumbnail
from imagegen_worker.candidate_thumbnail import (
    MAX_CANDIDATE_THUMBNAIL_BYTES,
    MAX_CANDIDATE_THUMBNAIL_SIDE,
    create_candidate_thumbnail,
)
from imagegen_worker.derivatives import SRGB_ICC_PROFILE


@pytest.mark.parametrize(
    "dimensions,expected",
    [
        ((512, 256), (256, 128)),
        ((384, 768), (128, 256)),
        ((96, 64), (96, 64)),
        ((1, 1024), (1, 256)),
    ],
)
@pytest.mark.parametrize("mode", ["RGB", "RGBA"])
def test_actual_thumbnail_preserves_source_full_png_aspect_alpha_and_srgb(
    tmp_path: Path, dimensions: tuple[int, int], expected: tuple[int, int], mode: str
) -> None:
    image = Image.new(mode, dimensions, (20, 60, 140, 100) if mode == "RGBA" else (20, 60, 140))
    image.info["comment"] = "source metadata must remain unchanged"
    original_pixels = image.tobytes()
    original_info = image.info.copy()
    output_png = tmp_path / "result.png"
    image.convert("RGB").save(output_png, icc_profile=SRGB_ICC_PROFILE)
    original_png = output_png.read_bytes()

    result = create_candidate_thumbnail(image, output_png)
    assert result is not None
    assert set(result) == {"outputPath", "sha256", "byteSize", "width", "height"}
    destination = Path(result["outputPath"])
    assert destination == Path(str(output_png) + ".thumb.webp")
    content = destination.read_bytes()
    assert result["byteSize"] == len(content) <= MAX_CANDIDATE_THUMBNAIL_BYTES
    assert result["sha256"] == hashlib.sha256(content).hexdigest()
    assert (result["width"], result["height"]) == expected
    assert max(expected) <= MAX_CANDIDATE_THUMBNAIL_SIDE
    with Image.open(destination) as thumbnail:
        assert thumbnail.format == "WEBP"
        assert thumbnail.size == expected
        assert thumbnail.info["icc_profile"] == SRGB_ICC_PROFILE
        pixel = thumbnail.convert("RGBA").getpixel((0, 0))
        assert isinstance(pixel, tuple)
        assert pixel[3] == (100 if mode == "RGBA" else 255)
    assert image.mode == mode
    assert image.size == dimensions
    assert image.tobytes() == original_pixels
    assert image.info == original_info
    assert output_png.read_bytes() == original_png
    assert not list(tmp_path.glob("*.tmp"))


def test_thumbnail_byte_limit_accepts_exact_file_and_refuses_one_byte_over_without_png_loss(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    image = Image.new("RGB", (384, 192), (20, 60, 140))
    original_png = tmp_path / "source.png"
    image.save(original_png)
    original_bytes = original_png.read_bytes()
    reference = create_candidate_thumbnail(image, original_png)
    assert reference is not None
    size = reference["byteSize"]
    for label, limit, succeeds in (("exact", size, True), ("over", size - 1, False)):
        output_png = tmp_path / f"{label}.png"
        output_png.write_bytes(original_bytes)
        monkeypatch.setattr(candidate_thumbnail, "MAX_CANDIDATE_THUMBNAIL_BYTES", limit)
        result = create_candidate_thumbnail(image, output_png)
        assert (result is not None) == succeeds
        assert Path(str(output_png) + ".thumb.webp").exists() == succeeds
        assert output_png.read_bytes() == original_bytes
        assert not list(tmp_path.glob("*.tmp"))


@pytest.mark.parametrize("symlink", [False, True])
def test_existing_thumbnail_or_symlink_is_preserved_and_never_reported_as_own_cache(
    tmp_path: Path, symlink: bool
) -> None:
    output_png = tmp_path / "result.png"
    output_png.write_bytes(b"required PNG is independently owned")
    destination = Path(str(output_png) + ".thumb.webp")
    protected = tmp_path / "protected.webp"
    if symlink:
        protected.write_bytes(b"must stay unchanged")
        destination.symlink_to(protected)
    else:
        destination.write_bytes(b"must stay unchanged")

    assert create_candidate_thumbnail(Image.new("RGB", (64, 64)), output_png) is None
    assert destination.read_bytes() == b"must stay unchanged"
    assert destination.is_symlink() == symlink
    assert output_png.read_bytes() == b"required PNG is independently owned"
    assert not list(tmp_path.glob("*.tmp"))
