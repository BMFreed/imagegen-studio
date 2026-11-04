"""Actual private fade route, literal pixel profiles, and pinned upstream body oracle."""

from __future__ import annotations

import ast
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import outpaint_conditioning, smart_patch_fade
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.outpaint_conditioning import fade_binary_keep_mask
from imagegen_worker.protocol import process_request


def _reference(file: Path, image: Image.Image) -> dict[str, object]:
    encoded = file.read_bytes()
    return {
        "path": str(file),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "byteSize": len(encoded),
        "width": image.width,
        "height": image.height,
    }


def _source(directory: Path, alpha: list[int], size: tuple[int, int]) -> dict[str, object]:
    image = Image.new("RGBA", size, (20, 40, 80, 255))
    plane = Image.new("L", size)
    plane.putdata(alpha)
    image.putalpha(plane)
    file = directory / "source.png"
    image.save(file, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    return _reference(file, image)


def _mask(
    directory: Path,
    alpha: list[int],
    size: tuple[int, int],
    *,
    rgb: tuple[int, int, int] = (255, 255, 255),
    tagged: bool = False,
) -> dict[str, object]:
    image = Image.new("RGBA", size, (*rgb, 255))
    plane = Image.new("L", size)
    plane.putdata(alpha)
    image.putalpha(plane)
    file = directory / "effective-mask.png"
    if tagged:
        image.save(file, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    else:
        image.save(file, format="PNG")
    return _reference(file, image)


def _request(
    directory: Path,
    source_alpha: list[int],
    mask_alpha: list[int],
    size: tuple[int, int],
    *,
    mode: str = "inpaint",
    blur: int = 0,
) -> dict[str, object]:
    stage = directory / "stage"
    stage.mkdir(exist_ok=True)
    return {
        "type": "fade-smart-patch",
        "protocolVersion": "1",
        "requestId": "patch-contribution-1",
        "source": _source(directory, source_alpha, size),
        "effectiveMask": _mask(directory, mask_alpha, size),
        "mode": mode,
        "maskBlur": blur,
        "output": {
            "stagingRoot": str(stage),
            "contributionMaskPngPath": str(stage / "world-contribution-mask.png"),
        },
    }


def _destination(payload: dict[str, object]) -> Path:
    return Path(cast(dict[str, str], payload["output"])["contributionMaskPngPath"])


def _alpha(file: Path) -> bytes:
    with Image.open(file) as image:
        image.load()
        assert image.mode == "RGBA"
        assert image.info == {}
        assert all(image.getchannel(channel).getextrema() == (255, 255) for channel in "RGB")
        return image.getchannel("A").tobytes()


@pytest.fixture(scope="module")
def native() -> tuple[Any, Any]:
    return pytest.importorskip("numpy"), pytest.importorskip("cv2")


@pytest.mark.parametrize(
    ("mode", "source", "authored", "expected"),
    [
        ("inpaint", [255] * 6, [1, 64, 128, 255, 0, 0], [255, 255, 255, 255, 0, 0]),
        ("outpaint", [0, 1, 128, 254, 255, 255], [0, 0, 0, 0, 64, 0], [255] * 5 + [0]),
        ("txt2img", [0] * 6, [1, 64, 128, 255, 0, 0], [255] * 6),
        ("img2img", [255] * 6, [0] * 6, [255] * 6),
    ],
)
def test_actual_mode_core_uses_full_soft_support_and_outpaint_union_without_input_changes(
    tmp_path: Path, mode: str, source: list[int], authored: list[int], expected: list[int]
) -> None:
    payload = _request(tmp_path, source, authored, (6, 1), mode=mode)
    source_file = Path(cast(str, cast(dict[str, object], payload["source"])["path"]))
    mask_file = Path(cast(str, cast(dict[str, object], payload["effectiveMask"])["path"]))
    original = source_file.read_bytes(), mask_file.read_bytes()

    response = process_request(payload)

    assert response["type"] == "smart-patch-faded"
    assert _alpha(_destination(payload)) == bytes(expected)
    assert (source_file.read_bytes(), mask_file.read_bytes()) == original
    assert response["contributionMask"] == {
        "byteSize": _destination(payload).stat().st_size,
        "height": 1,
        "sha256": hashlib.sha256(_destination(payload).read_bytes()).hexdigest(),
        "width": 6,
    }


@pytest.mark.parametrize(
    ("radius", "literal"),
    [
        (1, [255, 0, 0, 0, 0, 0]),
        (4, [255, 225, 137, 44, 0, 0]),
        (5, [255, 230, 166, 90, 26, 0]),
        (16, [255, 247, 230, 212, 193, 172, 151, 130, 109, 89, 70, 52, 36, 23, 12, 5, 0, 0]),
    ],
)
def test_actual_world_fade_has_literal_axial_profiles(
    tmp_path: Path, radius: int, literal: list[int], native: tuple[Any, Any]
) -> None:
    del native
    payload = _request(
        tmp_path,
        [255] * len(literal),
        [1] + [0] * (len(literal) - 1),
        (len(literal), 1),
        blur=radius,
    )

    response = process_request(payload)

    assert response["type"] == "smart-patch-faded"
    assert _alpha(_destination(payload)) == bytes(literal)


def test_actual_mask5_diagonal_and_knight_distances_have_independent_literal_bytes(
    tmp_path: Path, native: tuple[Any, Any]
) -> None:
    del native
    authored = [1] + [0] * 35
    payload = _request(tmp_path, [255] * 36, authored, (6, 6), blur=16)

    response = process_request(payload)

    assert response["type"] == "smart-patch-faded"
    alpha = _alpha(_destination(payload))
    # Existing primary-source OUT oracle verifies the 16-bit mask5 distances and curve.
    # Knight(2,1)=227 distinguishes mask5 from exact Euclidean226 and Manhattan212.
    for x, y, expected in [
        (1, 1, 240),
        (2, 1, 227),
        (2, 2, 216),
        (3, 1, 209),
        (3, 2, 201),
        (3, 3, 189),
    ]:
        assert alpha[y * 6 + x] == expected


@pytest.mark.parametrize(
    ("mode", "source", "authored"),
    [
        ("txt2img", [255] * 4, [0] * 4),
        ("img2img", [255] * 4, [1, 0, 0, 0]),
        ("inpaint", [255] * 4, [0] * 4),
        ("outpaint", [0] * 4, [1, 0, 0, 0]),
    ],
)
def test_supplied_mode_must_match_actual_world_source_and_effective_coverage(
    tmp_path: Path, mode: str, source: list[int], authored: list[int]
) -> None:
    payload = _request(tmp_path, source, authored, (2, 2), mode=mode)

    response = process_request(payload)

    assert response["type"] == "error"
    assert response["code"] == "INVALID_REQUEST"
    assert list((tmp_path / "stage").iterdir()) == []


@pytest.mark.parametrize("blur", [True, -1, 1.5, 513])
def test_blur_refuses_coercion_and_values_outside_owned_settings(
    tmp_path: Path, blur: object
) -> None:
    payload = _request(tmp_path, [255] * 4, [1, 0, 0, 0], (2, 2))
    payload["maskBlur"] = blur

    response = process_request(payload)

    assert response["code"] == "INVALID_REQUEST"
    assert list((tmp_path / "stage").iterdir()) == []


@pytest.mark.parametrize("fault", ["source-hash", "mask-hash", "size", "rgb", "icc", "extra"])
def test_fade_rechecks_exact_source_and_numeric_derived_mask_before_publication(
    tmp_path: Path, fault: str
) -> None:
    payload = _request(tmp_path, [255] * 4, [1, 0, 0, 0], (2, 2))
    if fault == "source-hash":
        cast(dict[str, object], payload["source"])["sha256"] = "0" * 64
    elif fault == "mask-hash":
        cast(dict[str, object], payload["effectiveMask"])["sha256"] = "0" * 64
    elif fault == "size":
        cast(dict[str, object], payload["effectiveMask"])["width"] = 1
    elif fault in ("rgb", "icc"):
        payload["effectiveMask"] = _mask(
            tmp_path,
            [1, 0, 0, 0],
            (2, 2),
            rgb=(254, 255, 255) if fault == "rgb" else (255, 255, 255),
            tagged=fault == "icc",
        )
    else:
        payload["padding"] = 8

    response = process_request(payload)

    assert response["type"] == "error"
    assert response["code"] in ("INVALID_REQUEST", "INVALID_IMAGE", "INPUT_HASH_MISMATCH")
    assert list((tmp_path / "stage").iterdir()) == []


def test_missing_native_fade_refuses_but_pillow_preparation_and_full_shortcuts_stay_available(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path, [255] * 4, [1, 0, 0, 0], (2, 2), blur=16)
    import_module = outpaint_conditioning.importlib.import_module

    def block_native(name: str, package: str | None = None) -> Any:
        if name in ("numpy", "cv2"):
            raise ImportError("intentional missing native dependency")
        return import_module(name, package)

    monkeypatch.setattr(outpaint_conditioning.importlib, "import_module", block_native)

    response = process_request(payload)

    assert response["code"] == "INFERENCE_UNAVAILABLE"
    assert list((tmp_path / "stage").iterdir()) == []
    payload["maskBlur"] = 0
    assert process_request(payload)["type"] == "smart-patch-faded"
    assert _alpha(_destination(payload)) == bytes([255, 0, 0, 0])
    # The neighboring preparation has no native filter and remains genuinely runnable.
    source = payload["source"]
    stage = tmp_path / "pillow-stage"
    stage.mkdir()
    preparation = {
        "type": "prepare-smart-patch",
        "protocolVersion": "1",
        "requestId": "pillow-neighbor",
        "source": source,
        "mask": None,
        "bbox": {"x": -2, "y": 3, "width": 2, "height": 2},
        "internalResolution": {"width": 3, "height": 1},
        "output": {
            "stagingRoot": str(stage),
            "worldMaskPngPath": str(stage / "world.png"),
            "processingSourcePngPath": str(stage / "source.png"),
            "processingMaskPngPath": str(stage / "processing.png"),
        },
    }
    assert process_request(preparation)["type"] == "smart-patch-prepared"
    assert _alpha(stage / "world.png") == bytes(4)


def test_binary_full_empty_zero_shortcuts_return_owned_copies_without_native_dependencies(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def refuse_native() -> tuple[Any, Any]:
        raise AssertionError("A trivial binary fade must not load native dependencies.")

    monkeypatch.setattr(outpaint_conditioning, "_native_modules", refuse_native)
    for value in (0, 255):
        mask = Image.new("L", (2, 2), value)
        result = fade_binary_keep_mask(mask, fade_radius=512)
        assert result is not mask
        assert result.tobytes() == bytes([value] * 4)
        result.putpixel((0, 0), 255 - value)
        assert mask.getpixel((0, 0)) == value
    mixed = Image.new("L", (2, 1), 255)
    mixed.putpixel((0, 0), 0)
    assert fade_binary_keep_mask(mixed, fade_radius=0).tobytes() == bytes([0, 255])


def test_binary_wrapper_rejects_soft_keep_pixels_without_mutating_them() -> None:
    mask = Image.new("L", (2, 1))
    mask.putdata([0, 128])
    with pytest.raises(DerivativeError) as error:
        fade_binary_keep_mask(mask, fade_radius=16)
    assert error.value.code == "INVALID_REQUEST"
    assert mask.tobytes() == bytes([0, 128])


@pytest.mark.parametrize("preexisting", [False, True])
def test_fade_publication_refuses_or_rolls_back_only_its_owned_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, preexisting: bool
) -> None:
    payload = _request(tmp_path, [255] * 4, [1, 0, 0, 0], (2, 2))
    destination = _destination(payload)
    if preexisting:
        destination.write_bytes(b"existing-contribution-output")
    else:

        def fail_metadata(_destination: Path, _image: Image.Image) -> Any:
            raise OSError("intentional metadata read failure after publication")

        monkeypatch.setattr(smart_patch_fade, "artifact_info", fail_metadata)

    response = process_request(payload)

    assert response["code"] == ("OUTPUT_UNAVAILABLE" if preexisting else "DERIVATIVE_FAILED")
    if preexisting:
        assert destination.read_bytes() == b"existing-contribution-output"
        assert list((tmp_path / "stage").iterdir()) == [destination]
    else:
        assert list((tmp_path / "stage").iterdir()) == []


def test_real_json_lines_fade_route_advertises_capability_without_loading_ml(
    tmp_path: Path,
) -> None:
    payload = _request(tmp_path, [255] * 4, [1, 0, 0, 0], (2, 2))
    script = """
import sys
from imagegen_worker.__main__ import main
main()
assert not any(name.split('.')[0] in ('torch', 'diffusers', 'compel') for name in sys.modules)
"""
    run = subprocess.run(
        [sys.executable, "-I", "-B", "-c", script],
        input=json.dumps(payload) + "\n",
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    )
    messages = [json.loads(line) for line in run.stdout.splitlines()]
    assert run.stderr == ""
    assert "smart-patch-fade" in messages[0]["capabilities"]
    assert messages[1]["type"] == "smart-patch-faded"
    assert _alpha(_destination(payload)) == bytes([255, 0, 0, 0])


class _StripAnnotations(ast.NodeTransformer):
    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
        node.returns = None
        node.decorator_list = []
        self.generic_visit(node)
        return node

    def visit_arg(self, node: ast.arg) -> ast.arg:
        node.annotation = None
        return node


def _upstream_fade(mask: Image.Image, radius: int, native: tuple[Any, Any]) -> Image.Image:
    """Execute pinned numerical body, replacing invocation storage/types only."""
    root = Path(
        os.environ.get(
            "IGS_INVOKE_SOURCE_ROOT", str(Path(__file__).resolve().parents[3] / "sources/InvokeAI")
        )
    )
    source = root / "invokeai/app/invocations/image.py"
    if not source.is_file():
        pytest.skip("Independent fade oracle requires pinned external Invoke source.")
    encoded = source.read_bytes()
    assert hashlib.sha256(encoded).hexdigest() == (
        "3f6a9c80649d1fe0185bb48d64cbe27c809c3104d4eaa45946211a615a3ce972"
    )
    tree = ast.parse(encoded, filename=str(source))
    original = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "ExpandMaskWithFadeInvocation"
    )
    isolated = ast.ClassDef(
        name=original.name,
        bases=[],
        keywords=[],
        body=[node for node in original.body if isinstance(node, ast.FunctionDef)],
        decorator_list=[],
        type_params=[],
    )
    module = ast.Module(body=[isolated], type_ignores=[])
    _StripAnnotations().visit(module)
    ast.fix_missing_locations(module)
    saved: list[Image.Image] = []

    def get_image(_name: str, *, mode: str) -> Image.Image:
        return mask.convert(mode)

    def save_image(image: Image.Image, **_kwargs: Any) -> SimpleNamespace:
        saved.append(image.copy())
        return SimpleNamespace(image_name="saved")

    def build_output(value: object) -> object:
        return value

    np, cv2 = native
    namespace: dict[str, Any] = {
        "numpy": np,
        "cv2": cv2,
        "Image": Image,
        "ImageCategory": SimpleNamespace(MASK="mask"),
        "ImageOutput": SimpleNamespace(build=build_output),
    }
    exec(compile(module, str(source), "exec"), namespace)
    invocation = namespace[original.name]()
    invocation.mask = SimpleNamespace(image_name="input")
    invocation.threshold = 0
    invocation.fade_size_px = radius
    invocation.invoke(SimpleNamespace(images=SimpleNamespace(get_pil=get_image, save=save_image)))
    assert len(saved) == 1
    return saved[0]


@pytest.mark.parametrize("radius", [0, 1, 2, 4, 5, 16, 512])
@pytest.mark.parametrize("kind", ["mixed", "empty-core", "full-core"])
def test_public_binary_fade_matches_actual_pinned_invoke_numerical_body(
    radius: int, kind: str, native: tuple[Any, Any]
) -> None:
    keep = Image.new("L", (9, 7), 255 if kind != "full-core" else 0)
    if kind == "mixed":
        keep.putpixel((1, 1), 0)
        keep.putpixel((6, 5), 0)
    original = keep.tobytes()

    result = fade_binary_keep_mask(keep, fade_radius=radius)
    upstream = _upstream_fade(keep, radius, native)

    assert result.mode == upstream.mode == "L"
    assert result.size == upstream.size == keep.size
    assert result.tobytes() == upstream.tobytes()
    assert keep.tobytes() == original
