from __future__ import annotations

import hashlib
import json
import random
import subprocess
import sys
import zlib
from dataclasses import replace
from pathlib import Path
from typing import Literal, cast

import pytest
from PIL import Image

from imagegen_worker import import_thumbnail, protocol
from imagegen_worker.derivatives import (
    SRGB_ICC_PROFILE,
    DerivativeError,
    DerivativeRequest,
    create_derivatives,
)
from imagegen_worker.import_thumbnail import ImportThumbnailRequest, create_import_thumbnail
from imagegen_worker.resource_previews import ResourcePreviewRequest, create_resource_preview


def fixture_request(
    tmp_path: Path, size: tuple[int, int] = (32, 20), *, mode: str = "RGBA"
) -> ImportThumbnailRequest:
    tmp_path.mkdir(parents=True, exist_ok=True)
    source = tmp_path / "canonical.png"
    with Image.new(mode, size, (40, 80, 120, 77) if mode == "RGBA" else (40, 80, 120)) as image:
        image.save(source, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    stage = tmp_path / "stage"
    stage.mkdir()
    return ImportThumbnailRequest(
        input_path=source,
        input_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        input_color_space="srgb",
        staging_root=stage,
        thumbnail_webp_path=stage / "thumbnail.webp",
    )


def refreshed(request: ImportThumbnailRequest) -> ImportThumbnailRequest:
    return replace(
        request, input_sha256=hashlib.sha256(request.input_path.read_bytes()).hexdigest()
    )


def command(request: ImportThumbnailRequest) -> dict[str, object]:
    return {
        "type": "create-import-thumbnail",
        "requestId": "import-thumbnail-1",
        "protocolVersion": "1",
        "input": {
            "path": str(request.input_path),
            "sha256": request.input_sha256,
            "colorSpace": "srgb",
        },
        "output": {
            "stagingRoot": str(request.staging_root),
            "thumbnailWebpPath": str(request.thumbnail_webp_path),
        },
    }


def png_chunk(tag: bytes, payload: bytes) -> bytes:
    return (
        len(payload).to_bytes(4, "big")
        + tag
        + payload
        + zlib.crc32(tag + payload).to_bytes(4, "big")
    )


@pytest.mark.parametrize("mode", ["RGB", "RGBA"])
@pytest.mark.parametrize(
    "size,expected",
    [
        ((512, 256), (128, 64)),
        ((256, 512), (64, 128)),
        ((1, 1), (1, 1)),
        ((16_384, 1), (128, 1)),
    ],
)
def test_exact_canonical_thumbnail_is_bounded_without_upscale_or_source_rewrite(
    tmp_path: Path, mode: str, size: tuple[int, int], expected: tuple[int, int]
) -> None:
    # Real file boundary. A fixed square resize, source rewrite or missing profile is a mutation.
    request = fixture_request(tmp_path, size, mode=mode)
    before = request.input_path.read_bytes()
    result = create_import_thumbnail(request)
    with Image.open(request.thumbnail_webp_path) as thumbnail:
        assert thumbnail.format == "WEBP"
        assert thumbnail.size == expected
        assert thumbnail.info["icc_profile"] == SRGB_ICC_PROFILE
        alpha = thumbnail.convert("RGBA").getchannel("A")
        assert alpha.getextrema() == ((77, 77) if mode == "RGBA" else (255, 255))
    assert result == {
        "byteSize": request.thumbnail_webp_path.stat().st_size,
        "colorSpace": "srgb",
        "height": expected[1],
        "sha256": hashlib.sha256(request.thumbnail_webp_path.read_bytes()).hexdigest(),
        "width": expected[0],
    }
    assert result["byteSize"] <= 128_000
    assert request.input_path.read_bytes() == before
    assert {entry.name for entry in request.staging_root.iterdir()} == {"thumbnail.webp"}


@pytest.mark.parametrize("transparent", [False, True])
def test_transparent_full_frame_and_hidden_rgb_are_retained(
    tmp_path: Path, transparent: bool
) -> None:
    request = fixture_request(tmp_path, (32, 20))
    with Image.new("RGBA", (32, 20), (90, 100, 110, 0)) as image:
        if not transparent:
            image.putpixel((16, 10), (200, 30, 60, 199))
        expected = image.tobytes()
        image.save(request.input_path, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    before = request.input_path.read_bytes()
    create_import_thumbnail(refreshed(request))
    with Image.open(request.thumbnail_webp_path) as thumbnail:
        assert thumbnail.size == (32, 20)
        assert thumbnail.convert("RGBA").tobytes() == expected
    assert request.input_path.read_bytes() == before


def test_large_canonical_import_is_not_the_one_megabyte_resource_preview_api(
    tmp_path: Path,
) -> None:
    request = fixture_request(tmp_path, (640, 512))
    with Image.frombytes("RGBA", (640, 512), random.Random(42).randbytes(640 * 512 * 4)) as image:
        image.save(request.input_path, format="PNG", icc_profile=SRGB_ICC_PROFILE, compress_level=0)
    request = refreshed(request)
    before = request.input_path.read_bytes()
    assert len(before) > 1_000_000
    result = create_import_thumbnail(request)
    assert (result["width"], result["height"]) == (128, 102)
    assert request.input_path.read_bytes() == before
    with pytest.raises(DerivativeError) as caught:
        create_resource_preview(
            ResourcePreviewRequest(
                input_path=request.input_path,
                input_sha256=request.input_sha256,
                staging_root=request.staging_root,
                preview_webp_path=request.staging_root / "resource-preview.webp",
                thumbnail_webp_path=request.staging_root / "resource-thumbnail.webp",
                preview_max_side=512,
                thumbnail_max_side=128,
            )
        )
    assert caught.value.code == "INPUT_TOO_LARGE"
    with pytest.raises(DerivativeError) as caught:
        create_derivatives(
            DerivativeRequest(
                input_path=request.input_path,
                input_sha256=request.input_sha256,
                input_color_space="srgb",
                staging_root=request.staging_root,
                merged_png_path=request.staging_root / "merged.png",
                thumbnail_webp_path=request.staging_root / "derivative.webp",
                thumbnail_max_side=128,
            )
        )
    assert caught.value.code == "INPUT_COLOR_PROFILE"
    assert {entry.name for entry in request.staging_root.iterdir()} == {"thumbnail.webp"}


@pytest.mark.parametrize(
    "fault,code",
    [
        ("unprofiled", "INPUT_COLOR_PROFILE"),
        ("foreign-profile", "INPUT_COLOR_PROFILE"),
        ("conflicting-color", "INPUT_COLOR_PROFILE"),
        ("non-png", "INVALID_IMAGE"),
        ("grayscale", "INVALID_IMAGE"),
        ("checksum", "INVALID_IMAGE"),
        ("pixels", "INVALID_IMAGE"),
        ("trailing-data", "INVALID_IMAGE"),
        ("changed-source", "INPUT_HASH_MISMATCH"),
        ("side", "IMAGE_TOO_LARGE"),
        ("area", "IMAGE_TOO_LARGE"),
        ("bytes", "INPUT_TOO_LARGE"),
    ],
)
def test_bad_canonical_input_refuses_without_output_or_source_mutation(
    tmp_path: Path, fault: str, code: str
) -> None:
    request = fixture_request(tmp_path)
    if fault in ("unprofiled", "foreign-profile", "non-png", "grayscale", "side"):
        profile = (
            (Path(__file__).parent / "fixtures/AdobeRGB1998.icc").read_bytes()
            if fault == "foreign-profile"
            else None
            if fault == "unprofiled"
            else SRGB_ICC_PROFILE
        )
        with Image.new(
            "L" if fault == "grayscale" else "RGB",
            (16_385, 1) if fault == "side" else (32, 20),
        ) as image:
            image.save(
                request.input_path,
                format="WEBP" if fault == "non-png" else "PNG",
                icc_profile=profile,
            )
    elif fault == "conflicting-color":
        data = request.input_path.read_bytes()
        request.input_path.write_bytes(
            data[:33] + png_chunk(b"cICP", bytes((12, 13, 0, 1))) + data[33:]
        )
    elif fault in ("checksum", "pixels"):
        data = request.input_path.read_bytes()
        offset = 8
        while data[offset + 4 : offset + 8] != b"IDAT":
            offset += int.from_bytes(data[offset : offset + 4], "big") + 12
        length = int.from_bytes(data[offset : offset + 4], "big")
        if fault == "checksum":
            damaged = bytearray(data)
            damaged[offset + 8 + length] ^= 1
            request.input_path.write_bytes(damaged)
        else:
            payload = b"\xff" + data[offset + 9 : offset + 8 + length]
            request.input_path.write_bytes(
                data[:offset] + png_chunk(b"IDAT", payload) + data[offset + 12 + length :]
            )
    elif fault == "trailing-data":
        request.input_path.write_bytes(request.input_path.read_bytes() + b"trailing")
    elif fault == "changed-source":
        with Image.new("RGBA", (32, 20), (200, 50, 60, 70)) as image:
            image.save(request.input_path, icc_profile=SRGB_ICC_PROFILE)
    elif fault == "area":
        data = request.input_path.read_bytes()
        header = (8001).to_bytes(4, "big") + (8000).to_bytes(4, "big") + data[24:29]
        request.input_path.write_bytes(data[:8] + png_chunk(b"IHDR", header) + data[33:])
    else:
        with request.input_path.open("r+b") as stream:
            stream.truncate(import_thumbnail.MAX_NORMALIZED_BYTES + 1)
    if fault not in ("changed-source", "bytes"):
        request = refreshed(request)
    # Sparse oversize input is rejected by size before reading; do not materialize 512 MiB.
    before = None if fault == "bytes" else request.input_path.read_bytes()
    with pytest.raises(DerivativeError) as caught:
        create_import_thumbnail(request)
    assert caught.value.code == code
    assert list(request.staging_root.iterdir()) == []
    if before is not None:
        assert request.input_path.read_bytes() == before


@pytest.mark.parametrize(
    "fault", ["escape", "source-link", "output-link", "parent-link", "existing", "same-path"]
)
def test_path_aliases_and_existing_outputs_are_never_overwritten(
    tmp_path: Path, fault: str
) -> None:
    request = fixture_request(tmp_path)
    source_before = request.input_path.read_bytes()
    sentinel = tmp_path / "keep.webp"
    sentinel.write_bytes(b"keep")
    if fault == "escape":
        request = replace(request, thumbnail_webp_path=sentinel)
    elif fault == "source-link":
        alias = tmp_path / "alias.png"
        alias.symlink_to(request.input_path)
        request = replace(request, input_path=alias)
    elif fault == "output-link":
        request.thumbnail_webp_path.symlink_to(sentinel)
    elif fault == "parent-link":
        alias = tmp_path / "alias-stage"
        alias.symlink_to(request.staging_root, target_is_directory=True)
        request = replace(request, thumbnail_webp_path=alias / "thumbnail.webp")
    elif fault == "existing":
        request.thumbnail_webp_path.write_bytes(b"existing")
    else:
        request = replace(request, thumbnail_webp_path=request.input_path)
    with pytest.raises(DerivativeError):
        create_import_thumbnail(request)
    assert sentinel.read_bytes() == b"keep"
    assert (tmp_path / "canonical.png").read_bytes() == source_before
    if fault == "existing":
        assert request.thumbnail_webp_path.read_bytes() == b"existing"
    elif fault not in ("output-link", "same-path", "escape"):
        assert not request.thumbnail_webp_path.exists()


@pytest.mark.parametrize("fault", ["byte-cap", "late-existing", "metadata", "foreign-replacement"])
def test_publication_failure_rolls_back_only_this_requests_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    request = fixture_request(tmp_path)
    before = request.input_path.read_bytes()
    if fault == "byte-cap":
        monkeypatch.setattr(import_thumbnail, "MAX_RESOURCE_THUMBNAIL_BYTES", 1)
    elif fault == "late-existing":
        original = import_thumbnail.write_temporary_image

        def create_late_output(
            image: Image.Image, destination: Path, image_format: Literal["PNG", "WEBP"]
        ) -> Path:
            temporary = original(image, destination, image_format)
            destination.write_bytes(b"keep")
            return temporary

        monkeypatch.setattr(import_thumbnail, "write_temporary_image", create_late_output)
    else:

        def fail_metadata(destination: Path, _image: Image.Image) -> object:
            if fault == "foreign-replacement":
                destination.unlink()
                destination.write_bytes(b"keep")
            raise OSError("injected metadata read failure")

        monkeypatch.setattr(import_thumbnail, "artifact_info", fail_metadata)
    with pytest.raises(DerivativeError) as caught:
        create_import_thumbnail(request)
    assert (
        caught.value.code
        == {
            "byte-cap": "IMAGE_TOO_LARGE",
            "late-existing": "OUTPUT_UNAVAILABLE",
            "metadata": "DERIVATIVE_FAILED",
            "foreign-replacement": "DERIVATIVE_FAILED",
        }[fault]
    )
    assert request.input_path.read_bytes() == before
    if fault in ("late-existing", "foreign-replacement"):
        assert request.thumbnail_webp_path.read_bytes() == b"keep"
        assert {entry.name for entry in request.staging_root.iterdir()} == {"thumbnail.webp"}
    else:
        assert list(request.staging_root.iterdir()) == []


@pytest.mark.parametrize("part", ["root", "input", "output"])
@pytest.mark.parametrize("missing", [False, True])
def test_strict_protocol_refuses_unknown_or_missing_keys_before_thumbnail_work(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, part: str, missing: bool
) -> None:
    request = fixture_request(tmp_path)
    message = command(request)
    target = message if part == "root" else cast(dict[str, object], message[part])
    if missing:
        del target[{"root": "output", "input": "colorSpace", "output": "thumbnailWebpPath"}[part]]
    else:
        target["thumbnailMaxSide"] = 512

    def unexpected_work(_request: object) -> object:
        raise AssertionError("Malformed requests must not reach thumbnail work")

    monkeypatch.setattr(protocol, "create_import_thumbnail", unexpected_work)
    response = protocol.process_request(message)
    assert response["type"] == "error"
    assert response["code"] == "INVALID_REQUEST"
    assert response["requestId"] == "import-thumbnail-1"
    assert list(request.staging_root.iterdir()) == []


@pytest.mark.parametrize(
    "key,value", [("colorSpace", "display-p3"), ("sha256", "bad"), ("path", 3)]
)
def test_protocol_refuses_invalid_input_identity(tmp_path: Path, key: str, value: object) -> None:
    request = fixture_request(tmp_path)
    message = command(request)
    cast(dict[str, object], message["input"])[key] = value
    response = protocol.process_request(message)
    assert response["code"] == "INVALID_REQUEST"
    assert list(request.staging_root.iterdir()) == []


@pytest.mark.parametrize("size", [(32, 20), (640, 512)])
def test_real_cpu_jsonl_keeps_legacy_identity_and_returns_verified_transparent_thumbnail(
    tmp_path: Path, size: tuple[int, int]
) -> None:
    request = fixture_request(tmp_path, size)
    with Image.new("RGBA", size, (90, 100, 110, 0)) as image:
        image.save(request.input_path, icc_profile=SRGB_ICC_PROFILE, compress_level=0)
    request = refreshed(request)
    before = request.input_path.read_bytes()
    if size == (640, 512):
        assert len(before) > 1_000_000
    invalid = command(request)
    invalid["protocolVersion"] = "2"
    changed = command(request)
    cast(dict[str, object], changed["input"])["sha256"] = "0" * 64
    result = subprocess.run(
        [sys.executable, "-I", "-m", "imagegen_worker"],
        input="".join(json.dumps(item) + "\n" for item in (invalid, changed, command(request))),
        text=True,
        capture_output=True,
        timeout=15,
        check=True,
    )
    ready, rejected, changed_response, response = [
        json.loads(line) for line in result.stdout.splitlines()
    ]
    assert result.stderr == ""
    assert (ready["protocolVersion"], ready["workerVersion"], ready["runtimeProfile"]) == (
        "1",
        "0.1.0",
        "derivatives-only",
    )
    assert {"image-derivatives", "import-normalization", "self-test", "import-thumbnail"} <= set(
        ready["capabilities"]
    )
    assert rejected["code"] == "PROTOCOL_MISMATCH"
    assert changed_response["code"] == "INPUT_HASH_MISMATCH"
    assert set(response) == {"type", "protocolVersion", "requestId", "thumbnail"}
    assert response["type"] == "import-thumbnail-done"
    assert response["requestId"] == "import-thumbnail-1"
    assert (
        response["thumbnail"]["sha256"]
        == hashlib.sha256(request.thumbnail_webp_path.read_bytes()).hexdigest()
    )
    with Image.open(request.thumbnail_webp_path) as thumbnail:
        assert thumbnail.size == ((32, 20) if size == (32, 20) else (128, 102))
        assert thumbnail.convert("RGBA").getchannel("A").getextrema() == (0, 0)
    assert request.input_path.read_bytes() == before
