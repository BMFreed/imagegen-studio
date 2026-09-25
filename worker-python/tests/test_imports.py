from __future__ import annotations

import hashlib
import os
import zlib
from dataclasses import replace
from pathlib import Path

import pytest
from PIL import Image

from imagegen_worker import imports
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.imports import NormalizeImportRequest, normalize_import

ADOBE_RGB_PROFILE = (Path(__file__).parent / "fixtures" / "AdobeRGB1998.icc").read_bytes()


def png_chunk_bounds(source: bytes, kind: bytes) -> tuple[int, int]:
    assert source.startswith(b"\x89PNG\r\n\x1a\n")
    cursor = 8
    while cursor + 12 <= len(source):
        length = int.from_bytes(source[cursor : cursor + 4], "big")
        next_chunk = cursor + 12 + length
        if source[cursor + 4 : cursor + 8] == kind:
            return cursor, next_chunk
        cursor = next_chunk
    pytest.fail(f"Fixture PNG has no {kind!r} chunk")


def png_insert_chunk(
    source: bytes, kind: bytes, payload: bytes, *, before: bytes = b"IDAT"
) -> bytes:
    cursor, _ = png_chunk_bounds(source, before)
    chunk = (
        len(payload).to_bytes(4, "big")
        + kind
        + payload
        + zlib.crc32(kind + payload).to_bytes(4, "big")
    )
    return source[:cursor] + chunk + source[cursor:]


def fixture_request(
    tmp_path: Path, *, image_format: str = "PNG", tagged: bool = True
) -> NormalizeImportRequest:
    source = tmp_path / f"source.{image_format.lower()}"
    image = Image.new("RGBA" if image_format != "JPEG" else "RGB", (8, 6), (180, 100, 50, 77))
    if tagged:
        image.save(source, format=image_format, icc_profile=ADOBE_RGB_PROFILE)
    else:
        image.save(source, format=image_format)
    staging = tmp_path / "staging"
    staging.mkdir()
    return NormalizeImportRequest(
        input_path=source,
        input_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        staging_root=staging,
        normalized_png_path=staging / "normalized.png",
        original_icc_path=staging / "original.icc",
    )


def refreshed_request(request: NormalizeImportRequest) -> NormalizeImportRequest:
    return replace(
        request,
        input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest(),
    )


@pytest.mark.parametrize("image_format", ["PNG", "JPEG", "WEBP"])
def test_adobe_rgb_pixels_are_converted_to_srgb_and_original_icc_is_preserved(
    tmp_path: Path, image_format: str
) -> None:
    request = fixture_request(tmp_path, image_format=image_format)
    result = normalize_import(request)

    with Image.open(request.normalized_png_path) as normalized:
        assert normalized.format == "PNG"
        assert normalized.size == (8, 6)
        assert normalized.info["icc_profile"] == SRGB_ICC_PROFILE
        pixel = normalized.convert("RGBA").getpixel((0, 0))
        assert isinstance(pixel, tuple)
        assert abs(pixel[0] - 203) <= 4
        assert abs(pixel[1] - 100) <= 4
        assert abs(pixel[2] - 42) <= 4
        assert pixel[3] == (255 if image_format == "JPEG" else 77)
    assert request.original_icc_path.read_bytes() == ADOBE_RGB_PROFILE
    assert result["originalIcc"] == {
        "byteSize": len(ADOBE_RGB_PROFILE),
        "sha256": hashlib.sha256(ADOBE_RGB_PROFILE).hexdigest(),
    }
    assert result["normalized"]["colorSpace"] == "srgb"
    assert (
        result["normalized"]["sha256"]
        == hashlib.sha256(request.normalized_png_path.read_bytes()).hexdigest()
    )
    assert result["sourceFormat"] == image_format


@pytest.mark.parametrize("image_format", ["PNG", "JPEG", "WEBP"])
def test_untagged_supported_images_are_interpreted_as_srgb(
    tmp_path: Path, image_format: str
) -> None:
    request = fixture_request(tmp_path, image_format=image_format, tagged=False)
    result = normalize_import(request)
    assert result["sourceFormat"] == image_format
    assert result["originalIcc"] is None
    assert not request.original_icc_path.exists()
    with Image.open(request.normalized_png_path) as normalized:
        assert normalized.mode == "RGBA"
        assert normalized.info["icc_profile"] == SRGB_ICC_PROFILE


@pytest.mark.parametrize(
    ("kind", "payload"),
    [
        (b"gAMA", (100_000).to_bytes(4, "big")),
        (
            b"cHRM",
            b"".join(
                value.to_bytes(4, "big")
                for value in (31_270, 32_900, 68_000, 32_000, 26_500, 69_000, 15_000, 6000)
            ),
        ),
        (b"cICP", bytes((12, 13, 0, 1))),
    ],
)
def test_png_non_srgb_color_chunks_without_icc_are_not_silently_relabelled(
    tmp_path: Path, kind: bytes, payload: bytes
) -> None:
    request = fixture_request(tmp_path, tagged=False)
    changed = png_insert_chunk(request.input_path.read_bytes(), kind, payload)
    request.input_path.write_bytes(changed)
    request = refreshed_request(request)
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "UNSUPPORTED_COLOR_SPACE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


@pytest.mark.parametrize(
    ("kind", "payload"),
    [
        (b"gAMA", (45_455).to_bytes(4, "big")),
        (b"cHRM", imports.PNG_SRGB_COLOR_CHUNKS[b"cHRM"]),
        (b"cICP", bytes((1, 13, 0, 1))),
        (b"sRGB", b"\0"),
    ],
)
def test_png_explicit_srgb_color_chunks_without_icc_are_accepted(
    tmp_path: Path, kind: bytes, payload: bytes
) -> None:
    request = fixture_request(tmp_path, tagged=False)
    request.input_path.write_bytes(png_insert_chunk(request.input_path.read_bytes(), kind, payload))
    result = normalize_import(refreshed_request(request))
    assert result["originalIcc"] is None
    with Image.open(request.normalized_png_path) as normalized:
        assert normalized.info["icc_profile"] == SRGB_ICC_PROFILE
        assert normalized.convert("RGBA").getpixel((0, 0)) == (180, 100, 50, 77)


@pytest.mark.parametrize(
    ("kind", "payload"),
    [
        (b"gAMA", (100_000).to_bytes(4, "big")),
        (
            b"cHRM",
            b"".join(
                value.to_bytes(4, "big")
                for value in (31_270, 32_900, 68_000, 32_000, 26_500, 69_000, 15_000, 6000)
            ),
        ),
        (b"cICP", bytes((12, 13, 0, 1))),
    ],
)
def test_png_valid_icc_governs_conversion_even_with_other_color_chunks(
    tmp_path: Path, kind: bytes, payload: bytes
) -> None:
    request = fixture_request(tmp_path)
    request.input_path.write_bytes(png_insert_chunk(request.input_path.read_bytes(), kind, payload))
    result = normalize_import(refreshed_request(request))
    assert result["originalIcc"] is not None
    assert request.original_icc_path.read_bytes() == ADOBE_RGB_PROFILE
    with Image.open(request.normalized_png_path) as normalized:
        pixel = normalized.convert("RGBA").getpixel((0, 0))
        assert isinstance(pixel, tuple)
        assert abs(pixel[0] - 203) <= 4
        assert abs(pixel[2] - 42) <= 4
        assert pixel[3] == 77


@pytest.mark.parametrize("fault", ["duplicate", "late", "bad_crc", "wrong_length", "bad_intent"])
def test_png_color_chunk_structural_faults_are_rejected(tmp_path: Path, fault: str) -> None:
    request = fixture_request(tmp_path, tagged=False)
    source = request.input_path.read_bytes()
    if fault == "duplicate":
        source = png_insert_chunk(source, b"gAMA", (45_455).to_bytes(4, "big"))
        changed = png_insert_chunk(source, b"gAMA", (45_455).to_bytes(4, "big"))
    elif fault == "late":
        changed = png_insert_chunk(source, b"gAMA", (45_455).to_bytes(4, "big"), before=b"IEND")
    elif fault == "wrong_length":
        changed = png_insert_chunk(source, b"gAMA", b"\x00\x01")
    elif fault == "bad_intent":
        changed = png_insert_chunk(source, b"sRGB", b"\x04")
    else:
        changed = bytearray(png_insert_chunk(source, b"gAMA", (45_455).to_bytes(4, "big")))
        _, end = png_chunk_bounds(bytes(changed), b"gAMA")
        changed[end - 1] ^= 1
    request.input_path.write_bytes(changed)
    request = refreshed_request(request)
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "INVALID_COLOR_PROFILE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


def test_malformed_embedded_icc_is_rejected_without_files(tmp_path: Path) -> None:
    request = fixture_request(tmp_path, tagged=False)
    Image.new("RGB", (8, 6), (180, 100, 50)).save(
        request.input_path, format="PNG", icc_profile=b"not a valid ICC profile"
    )
    request = NormalizeImportRequest(
        input_path=request.input_path,
        input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest(),
        staging_root=request.staging_root,
        normalized_png_path=request.normalized_png_path,
        original_icc_path=request.original_icc_path,
    )
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "INVALID_COLOR_PROFILE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


def test_padded_icc_is_rejected_before_worker_publishes_an_output(tmp_path: Path) -> None:
    request = fixture_request(tmp_path, tagged=False)
    Image.new("RGB", (8, 6), (180, 100, 50)).save(
        request.input_path, format="PNG", icc_profile=ADOBE_RGB_PROFILE + b"padding"
    )
    request = NormalizeImportRequest(
        input_path=request.input_path,
        input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest(),
        staging_root=request.staging_root,
        normalized_png_path=request.normalized_png_path,
        original_icc_path=request.original_icc_path,
    )
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "INVALID_COLOR_PROFILE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


def test_png_iccp_with_invalid_zlib_is_not_silently_treated_as_untagged(
    tmp_path: Path,
) -> None:
    request = fixture_request(tmp_path)
    source = request.input_path.read_bytes()
    cursor, next_chunk = png_chunk_bounds(source, b"iCCP")
    length = int.from_bytes(source[cursor : cursor + 4], "big")
    profile_name = source[cursor + 8 : cursor + 8 + length].split(b"\0", 1)[0]
    invalid_payload = profile_name + b"\0\0not a zlib stream"
    chunk = (
        len(invalid_payload).to_bytes(4, "big")
        + b"iCCP"
        + invalid_payload
        + zlib.crc32(b"iCCP" + invalid_payload).to_bytes(4, "big")
    )
    request.input_path.write_bytes(source[:cursor] + chunk + source[next_chunk:])

    # Pillow currently swallows this zlib error and presents the PNG as untagged.
    with Image.open(request.input_path) as decoded:
        decoded.load()
        assert decoded.info.get("icc_profile") is None
    request = NormalizeImportRequest(
        input_path=request.input_path,
        input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest(),
        staging_root=request.staging_root,
        normalized_png_path=request.normalized_png_path,
        original_icc_path=request.original_icc_path,
    )
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "INVALID_COLOR_PROFILE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


@pytest.mark.parametrize(
    ("fault", "expected_code"),
    [
        ("duplicate", "INVALID_COLOR_PROFILE"),
        ("bad_crc", "INVALID_COLOR_PROFILE"),
        ("oversized", "ICC_TOO_LARGE"),
    ],
)
def test_png_iccp_structural_faults_are_rejected_before_publication(
    tmp_path: Path, fault: str, expected_code: str
) -> None:
    request = fixture_request(tmp_path)
    source = request.input_path.read_bytes()
    cursor, next_chunk = png_chunk_bounds(source, b"iCCP")
    if fault == "duplicate":
        changed = source[:next_chunk] + source[cursor:next_chunk] + source[next_chunk:]
    elif fault == "bad_crc":
        changed = (
            source[: next_chunk - 1] + bytes([source[next_chunk - 1] ^ 1]) + source[next_chunk:]
        )
    else:
        payload = b"ICC Profile\0\0" + zlib.compress(b"x" * (imports.MAX_ICC_BYTES + 1))
        chunk = (
            len(payload).to_bytes(4, "big")
            + b"iCCP"
            + payload
            + zlib.crc32(b"iCCP" + payload).to_bytes(4, "big")
        )
        changed = source[:cursor] + chunk + source[next_chunk:]
    request.input_path.write_bytes(changed)
    request = NormalizeImportRequest(
        input_path=request.input_path,
        input_sha256=hashlib.sha256(changed).hexdigest(),
        staging_root=request.staging_root,
        normalized_png_path=request.normalized_png_path,
        original_icc_path=request.original_icc_path,
    )
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == expected_code
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


@pytest.mark.parametrize("tagged", [False, True])
def test_jpeg_exif_orientation_is_applied_before_srgb_normalization(
    tmp_path: Path, tagged: bool
) -> None:
    request = fixture_request(tmp_path, image_format="JPEG", tagged=tagged)
    image = Image.new("RGB", (24, 8), (240, 30, 30))
    image.paste((20, 40, 230), (12, 0, 24, 8))
    exif = Image.Exif()
    exif[274] = 6
    image.save(
        request.input_path,
        format="JPEG",
        quality=100,
        subsampling=0,
        exif=exif,
        **({"icc_profile": ADOBE_RGB_PROFILE} if tagged else {}),
    )
    request = NormalizeImportRequest(
        input_path=request.input_path,
        input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest(),
        staging_root=request.staging_root,
        normalized_png_path=request.normalized_png_path,
        original_icc_path=request.original_icc_path,
    )
    result = normalize_import(request)
    with Image.open(request.normalized_png_path) as normalized:
        assert normalized.size == (8, 24)
        assert result["normalized"]["width"] == 8
        assert result["normalized"]["height"] == 24
        top = normalized.convert("RGBA").getpixel((4, 3))
        bottom = normalized.convert("RGBA").getpixel((4, 20))
        assert isinstance(top, tuple) and top[0] > top[2] + 100
        assert isinstance(bottom, tuple) and bottom[2] > bottom[0] + 100
        assert top[3] == bottom[3] == 255
    assert request.original_icc_path.exists() is tagged


def test_png_exif_orientation_moves_alpha_with_color(tmp_path: Path) -> None:
    request = fixture_request(tmp_path)
    image = Image.new("RGBA", (2, 1), (240, 30, 30, 33))
    image.putpixel((1, 0), (20, 40, 230, 220))
    exif = Image.Exif()
    exif[274] = 6
    image.save(
        request.input_path,
        format="PNG",
        exif=exif,
        icc_profile=ADOBE_RGB_PROFILE,
    )
    request = NormalizeImportRequest(
        input_path=request.input_path,
        input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest(),
        staging_root=request.staging_root,
        normalized_png_path=request.normalized_png_path,
        original_icc_path=request.original_icc_path,
    )
    normalize_import(request)
    with Image.open(request.normalized_png_path) as normalized:
        assert normalized.size == (1, 2)
        top = normalized.convert("RGBA").getpixel((0, 0))
        bottom = normalized.convert("RGBA").getpixel((0, 1))
        assert isinstance(top, tuple) and top[0] > top[2] and top[3] == 33
        assert isinstance(bottom, tuple) and bottom[2] > bottom[0] and bottom[3] == 220
    assert request.original_icc_path.read_bytes() == ADOBE_RGB_PROFILE


def test_jpeg_incomplete_icc_app2_sequence_is_not_assumed_untagged(tmp_path: Path) -> None:
    request = fixture_request(tmp_path, image_format="JPEG")
    source = request.input_path.read_bytes()
    signature = source.index(b"ICC_PROFILE\0")
    assert source[signature + 12 : signature + 14] == b"\x01\x01"
    request.input_path.write_bytes(source[: signature + 13] + b"\x02" + source[signature + 14 :])
    with Image.open(request.input_path) as decoded:
        decoded.load()
        assert decoded.info.get("icc_profile") is None

    request = refreshed_request(request)
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "INVALID_COLOR_PROFILE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


def test_jpeg_valid_two_segment_icc_is_reassembled_and_converted(tmp_path: Path) -> None:
    request = fixture_request(tmp_path, image_format="JPEG")
    source = request.input_path.read_bytes()
    signature = source.index(b"ICC_PROFILE\0")
    first_app2 = signature - 4
    assert source[first_app2 : first_app2 + 2] == b"\xff\xe2"
    app2_end = first_app2 + 2 + int.from_bytes(source[first_app2 + 2 : first_app2 + 4], "big")
    assert source[signature + 14 : app2_end] == ADOBE_RGB_PROFILE
    middle = len(ADOBE_RGB_PROFILE) // 2

    def app2(sequence: int, data: bytes) -> bytes:
        payload = b"ICC_PROFILE\0" + bytes([sequence, 2]) + data
        return b"\xff\xe2" + (len(payload) + 2).to_bytes(2, "big") + payload

    request.input_path.write_bytes(
        source[:first_app2]
        + app2(2, ADOBE_RGB_PROFILE[middle:])
        + app2(1, ADOBE_RGB_PROFILE[:middle])
        + source[app2_end:]
    )
    request = refreshed_request(request)
    result = normalize_import(request)
    assert result["sourceFormat"] == "JPEG"
    assert result["originalIcc"] is not None
    assert request.original_icc_path.read_bytes() == ADOBE_RGB_PROFILE
    with Image.open(request.normalized_png_path) as normalized:
        assert normalized.info["icc_profile"] == SRGB_ICC_PROFILE
        pixel = normalized.convert("RGBA").getpixel((0, 0))
        assert isinstance(pixel, tuple) and abs(pixel[0] - 203) <= 4


def test_webp_iccp_chunk_with_cleared_vp8x_flag_is_not_assumed_untagged(
    tmp_path: Path,
) -> None:
    request = fixture_request(tmp_path, image_format="WEBP")
    image = Image.new("RGBA", (8, 6), (180, 100, 50, 77))
    image.save(request.input_path, format="WEBP", lossless=True, icc_profile=ADOBE_RGB_PROFILE)
    source = bytearray(request.input_path.read_bytes())
    assert source[:4] == b"RIFF" and source[8:16] == b"WEBPVP8X"
    assert source[20] & 0x20
    assert b"ICCP" in source
    source[20] &= ~0x20
    request.input_path.write_bytes(source)
    with Image.open(request.input_path) as decoded:
        decoded.load()
        assert decoded.info.get("icc_profile") is None

    request = refreshed_request(request)
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "INVALID_COLOR_PROFILE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


@pytest.mark.parametrize("fault", ["missing", "duplicate"])
def test_webp_declared_icc_must_have_exactly_one_chunk(tmp_path: Path, fault: str) -> None:
    request = fixture_request(tmp_path, image_format="WEBP")
    Image.new("RGBA", (8, 6), (180, 100, 50, 77)).save(
        request.input_path, format="WEBP", lossless=True, icc_profile=ADOBE_RGB_PROFILE
    )
    source = request.input_path.read_bytes()
    iccp_start = source.index(b"ICCP")
    iccp_length = int.from_bytes(source[iccp_start + 4 : iccp_start + 8], "little")
    iccp_end = iccp_start + 8 + iccp_length + (iccp_length & 1)
    if fault == "missing":
        changed = source[:iccp_start] + source[iccp_end:]
    else:
        changed = source[:iccp_end] + source[iccp_start:iccp_end] + source[iccp_end:]
    changed = changed[:4] + (len(changed) - 8).to_bytes(4, "little") + changed[8:]
    request.input_path.write_bytes(changed)
    request = refreshed_request(request)
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "INVALID_COLOR_PROFILE"
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()


def test_webp_lossless_with_valid_iccp_is_converted_with_alpha(tmp_path: Path) -> None:
    request = fixture_request(tmp_path, image_format="WEBP")
    Image.new("RGBA", (8, 6), (180, 100, 50, 77)).save(
        request.input_path, format="WEBP", lossless=True, icc_profile=ADOBE_RGB_PROFILE
    )
    request = refreshed_request(request)
    result = normalize_import(request)
    assert result["sourceFormat"] == "WEBP"
    assert request.original_icc_path.read_bytes() == ADOBE_RGB_PROFILE
    with Image.open(request.normalized_png_path) as normalized:
        assert normalized.info["icc_profile"] == SRGB_ICC_PROFILE
        pixel = normalized.convert("RGBA").getpixel((0, 0))
        assert isinstance(pixel, tuple)
        assert abs(pixel[0] - 203) <= 4
        assert pixel[3] == 77


def test_bundled_srgb_profile_has_the_cross_language_contract_hash() -> None:
    assert (
        hashlib.sha256(SRGB_ICC_PROFILE).hexdigest()
        == "113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1"
    )


def test_untagged_cmyk_is_not_mislabelled_as_srgb(tmp_path: Path) -> None:
    request = fixture_request(tmp_path, image_format="JPEG", tagged=False)
    Image.new("CMYK", (8, 6), (20, 30, 40, 50)).save(request.input_path, format="JPEG")
    request = NormalizeImportRequest(
        input_path=request.input_path,
        input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest(),
        staging_root=request.staging_root,
        normalized_png_path=request.normalized_png_path,
        original_icc_path=request.original_icc_path,
    )
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "COLOR_PROFILE_REQUIRED"


def test_failed_profile_publication_removes_normalized_png(
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
            raise OSError("simulated storage failure")
        link(source, destination, follow_symlinks=follow_symlinks)

    monkeypatch.setattr(imports.os, "link", fail_second_link)
    with pytest.raises(DerivativeError) as error:
        normalize_import(request)
    assert error.value.code == "IMPORT_FAILED"
    assert calls == 2
    assert not request.normalized_png_path.exists()
    assert not request.original_icc_path.exists()
