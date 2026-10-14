"""Real conditioning protocol, literal numeric planes, and pinned gradient-body oracle."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import outpaint_conditioning, smart_patch_conditioning
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.outpaint_conditioning import (
    CoherenceMode,
    prepare_keep_mask_coherence,
    prepare_outpaint_conditioning,
)
from imagegen_worker.protocol import process_request

OUTPUT_KEYS = (
    "worldKeepMask",
    "processingKeepMask",
    "latentKeepMask",
    "expandedProcessingKeepMask",
    "expandedWorldKeepMask",
    "finalContributionMask",
)


def _image_reference(
    directory: Path, name: str, alpha: list[int], size: tuple[int, int], *, source: bool
) -> dict[str, object]:
    image = Image.new("RGBA", size, (20, 40, 80, 255) if source else (255, 255, 255, 255))
    plane = Image.new("L", size)
    plane.putdata(alpha)
    image.putalpha(plane)
    file = directory / name
    if source:
        image.save(file, format="PNG", icc_profile=SRGB_ICC_PROFILE)
    else:
        image.save(file, format="PNG")
    encoded = file.read_bytes()
    return {
        "path": str(file),
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "byteSize": len(encoded),
        "width": size[0],
        "height": size[1],
    }


def _request(
    directory: Path,
    source: list[int],
    authored: list[int],
    world: tuple[int, int],
    *,
    internal: tuple[int, int] | None = None,
    mode: str = "inpaint",
    coherence_mode: str = "Gaussian Blur",
    edge: int = 16,
    minimum: float = 0,
    blur: int = 0,
) -> dict[str, object]:
    stage = directory / "stage"
    stage.mkdir(exist_ok=True)
    internal = internal or world
    return {
        "type": "condition-smart-patch",
        "protocolVersion": "1",
        "requestId": "conditioning-1",
        "source": _image_reference(directory, "source.png", source, world, source=True),
        "effectiveMask": _image_reference(
            directory, "effective.png", authored, world, source=False
        ),
        "internalResolution": {"width": internal[0], "height": internal[1]},
        "mode": mode,
        "maskBlur": blur,
        "coherence": {"mode": coherence_mode, "edgeSize": edge, "minimumDenoise": minimum},
        "output": {"stagingRoot": str(stage)}
        | {f"{key}PngPath": str(stage / f"{key}.png") for key in OUTPUT_KEYS},
    }


def _output(payload: dict[str, object], key: str) -> Path:
    return Path(cast(dict[str, str], payload["output"])[f"{key}PngPath"])


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


def _weak_square() -> list[int]:
    alpha = [0] * 1600
    for row in range(16, 24):
        alpha[row * 40 + 16 : row * 40 + 24] = [1] * 8
    return alpha


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        (
            "Gaussian Blur",
            [
                255,
                255,
                254,
                255,
                255,
                255,
                254,
                254,
                254,
                255,
                254,
                254,
                254,
                254,
                254,
                255,
                254,
                254,
                254,
                255,
                255,
                255,
                254,
                255,
                255,
            ],
        ),
        (
            "Box Blur",
            [
                255,
                255,
                255,
                255,
                255,
                255,
                254,
                254,
                254,
                255,
                255,
                254,
                254,
                254,
                255,
                255,
                254,
                254,
                254,
                255,
                255,
                255,
                255,
                255,
                255,
            ],
        ),
        (
            "Staged",
            [
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                254,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
                255,
            ],
        ),
    ],
)
def test_actual_soft_circle_distinguishes_three_pinned_coherence_modes(
    tmp_path: Path, mode: str, expected: list[int], native: tuple[Any, Any]
) -> None:
    del native
    authored = _weak_square()
    payload = _request(tmp_path, [255] * 1600, authored, (40, 40), coherence_mode=mode)
    original_mask = Path(
        cast(str, cast(dict[str, object], payload["effectiveMask"])["path"])
    ).read_bytes()

    response = process_request(payload)

    assert response["type"] == "smart-patch-conditioned"
    assert _alpha(_output(payload, "worldKeepMask")) == bytes(255 - value for value in authored)
    assert _alpha(_output(payload, "processingKeepMask")) == bytes(
        255 - value for value in authored
    )
    assert _alpha(_output(payload, "latentKeepMask")) == bytes(expected)
    expanded = _alpha(_output(payload, "expandedProcessingKeepMask"))
    for row in range(40):
        for column in range(40):
            expected_keep = 0 if expected[(row // 8) * 5 + column // 8] < 255 else 255
            assert expanded[row * 40 + column] == expected_keep
    assert _alpha(_output(payload, "expandedWorldKeepMask")) == expanded
    assert _alpha(_output(payload, "finalContributionMask")) == bytes(
        255 - value for value in expanded
    )
    assert (
        Path(cast(str, cast(dict[str, object], payload["effectiveMask"])["path"])).read_bytes()
        == original_mask
    )
    for key in OUTPUT_KEYS:
        file = _output(payload, key)
        metadata = cast(dict[str, object], response[key])
        assert set(metadata) == {"byteSize", "width", "height", "sha256"}
        assert metadata["byteSize"] == file.stat().st_size
        assert metadata["sha256"] == hashlib.sha256(file.read_bytes()).hexdigest()


def test_outpaint_numerical_keep_is95_before_anisotropic_processing_resize(tmp_path: Path) -> None:
    payload = _request(
        tmp_path, [128] * 6, [64] * 6, (3, 2), internal=(16, 8), mode="outpaint", edge=0
    )

    response = process_request(payload)

    assert response["type"] == "smart-patch-conditioned"
    assert _alpha(_output(payload, "worldKeepMask")) == bytes([95] * 6)
    assert _alpha(_output(payload, "processingKeepMask")) == bytes([95] * 128)
    assert _alpha(_output(payload, "latentKeepMask")) == bytes([95, 95])
    assert _alpha(_output(payload, "expandedProcessingKeepMask")) == bytes(128)
    assert _alpha(_output(payload, "expandedWorldKeepMask")) == bytes(6)
    assert _alpha(_output(payload, "finalContributionMask")) == bytes([255] * 6)


def test_world_outpaint_multiplication_precedes_resampling_of_opposed_operands(
    tmp_path: Path,
) -> None:
    payload = _request(
        tmp_path, [0, 255], [0, 255], (2, 1), internal=(16, 8), mode="outpaint", edge=0
    )

    response = process_request(payload)

    assert response["type"] == "smart-patch-conditioned"
    # Each world pixel is fully editable for one independent reason. Combined keep is exactly0.
    assert _alpha(_output(payload, "worldKeepMask")) == bytes(2)
    assert _alpha(_output(payload, "processingKeepMask")) == bytes(128)
    assert _alpha(_output(payload, "latentKeepMask")) == bytes(2)
    assert _alpha(_output(payload, "finalContributionMask")) == bytes([255, 255])


def test_original_world_core_is_retained_when_processing_and_latent_coverage_disappear(
    tmp_path: Path,
) -> None:
    authored = [0] * 256
    authored[7 * 16 + 7] = 1
    payload = _request(tmp_path, [255] * 256, authored, (16, 16), internal=(8, 8), edge=0)

    response = process_request(payload)

    assert response["type"] == "smart-patch-conditioned"
    assert _alpha(_output(payload, "processingKeepMask")) == bytes([255] * 64)
    assert _alpha(_output(payload, "latentKeepMask")) == bytes([255])
    assert _alpha(_output(payload, "expandedProcessingKeepMask")) == bytes([255] * 64)
    expected_keep = [255] * 256
    expected_keep[7 * 16 + 7] = 0
    assert _alpha(_output(payload, "expandedWorldKeepMask")) == bytes(expected_keep)
    expected_contribution = [0] * 256
    expected_contribution[7 * 16 + 7] = 255
    assert _alpha(_output(payload, "finalContributionMask")) == bytes(expected_contribution)


@pytest.mark.parametrize(("mode", "source"), [("txt2img", 0), ("img2img", 255)])
def test_source_only_modes_have_zero_keep_and_full_contribution_on_processing_grid(
    tmp_path: Path, mode: str, source: int
) -> None:
    payload = _request(
        tmp_path, [source] * 6, [0] * 6, (3, 2), internal=(8, 16), mode=mode, blur=512
    )

    response = process_request(payload)

    assert response["type"] == "smart-patch-conditioned"
    assert _alpha(_output(payload, "worldKeepMask")) == bytes(6)
    assert _alpha(_output(payload, "processingKeepMask")) == bytes(128)
    assert _alpha(_output(payload, "latentKeepMask")) == bytes(2)
    assert _alpha(_output(payload, "expandedWorldKeepMask")) == bytes(6)
    assert _alpha(_output(payload, "finalContributionMask")) == bytes([255] * 6)


@pytest.mark.parametrize(
    "fault",
    [
        "mode",
        "edge-negative",
        "edge-float",
        "edge1025",
        "min-bool",
        "min-nan",
        "min-low",
        "min-high",
        "grid-small",
        "grid-odd",
        "grid-big",
        "extra",
    ],
)
def test_strict_profile_and_new_method_only_grid_refuse_before_output(
    tmp_path: Path, fault: str
) -> None:
    payload = _request(tmp_path, [255] * 64, [1] + [0] * 63, (8, 8), edge=0)
    profile = cast(dict[str, object], payload["coherence"])
    internal = cast(dict[str, object], payload["internalResolution"])
    if fault == "mode":
        profile["mode"] = "Gaussian convolution"
    elif fault == "edge-negative":
        profile["edgeSize"] = -1
    elif fault == "edge-float":
        profile["edgeSize"] = 16.5
    elif fault == "edge1025":
        profile["edgeSize"] = 1025
    elif fault == "min-bool":
        profile["minimumDenoise"] = True
    elif fault == "min-nan":
        profile["minimumDenoise"] = float("nan")
    elif fault == "min-low":
        profile["minimumDenoise"] = -0.01
    elif fault == "min-high":
        profile["minimumDenoise"] = 1.01
    elif fault == "grid-small":
        internal["width"] = 1
    elif fault == "grid-odd":
        internal["height"] = 9
    elif fault == "grid-big":
        internal["width"] = 2056
    else:
        profile["padding"] = 8

    response = process_request(payload)

    assert response["type"] == "error"
    assert response["code"] == ("IMAGE_TOO_LARGE" if fault == "grid-big" else "INVALID_REQUEST")
    assert list((tmp_path / "stage").iterdir()) == []


@pytest.mark.parametrize("fault", ["source-hash", "mask-hash", "source-mode", "mask-mode"])
def test_conditioning_rechecks_world_input_identity_and_mode(tmp_path: Path, fault: str) -> None:
    payload = _request(tmp_path, [255] * 64, [1] + [0] * 63, (8, 8), edge=0)
    if fault.endswith("hash"):
        ref = "source" if fault.startswith("source") else "effectiveMask"
        cast(dict[str, object], payload[ref])["sha256"] = "0" * 64
    else:
        payload["mode"] = "txt2img" if fault == "source-mode" else "img2img"

    response = process_request(payload)

    assert response["code"] == (
        "INPUT_HASH_MISMATCH" if fault.endswith("hash") else "INVALID_REQUEST"
    )
    assert list((tmp_path / "stage").iterdir()) == []


@pytest.mark.parametrize("preexisting", [False, True])
def test_six_plane_publication_rolls_back_own_members_and_preserves_preexisting_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, preexisting: bool
) -> None:
    payload = _request(tmp_path, [255] * 64, [1] + [0] * 63, (8, 8), edge=0)
    destination = _output(payload, "finalContributionMask")
    calls = 0
    if preexisting:
        destination.write_bytes(b"existing-output")
    else:
        original_link = os.link

        def fail_sixth(
            source: os.PathLike[str], target: os.PathLike[str], *, follow_symlinks: bool
        ) -> None:
            nonlocal calls
            calls += 1
            if calls == 6:
                raise OSError("controlled last member publication failure")
            original_link(source, target, follow_symlinks=follow_symlinks)

        monkeypatch.setattr(smart_patch_conditioning.os, "link", fail_sixth)

    response = process_request(payload)

    assert response["code"] == ("OUTPUT_UNAVAILABLE" if preexisting else "DERIVATIVE_FAILED")
    if preexisting:
        assert destination.read_bytes() == b"existing-output"
        assert list((tmp_path / "stage").iterdir()) == [destination]
    else:
        assert calls == 6
        assert list((tmp_path / "stage").iterdir()) == []


def test_missing_native_refuses_nontrivial_coherence_but_grid_radius_zero_stays_pillow(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _request(tmp_path, [255] * 1600, _weak_square(), (40, 40), edge=16)
    importer = outpaint_conditioning.importlib.import_module

    def unavailable(name: str, package: str | None = None) -> Any:
        if name in ("numpy", "cv2"):
            raise ImportError("controlled unavailable native runtime")
        return importer(name, package)

    monkeypatch.setattr(outpaint_conditioning.importlib, "import_module", unavailable)

    response = process_request(payload)

    assert response["code"] == "INFERENCE_UNAVAILABLE"
    assert list((tmp_path / "stage").iterdir()) == []
    cast(dict[str, object], payload["coherence"])["edgeSize"] = 7
    cast(dict[str, object], payload["coherence"])["minimumDenoise"] = 1
    assert process_request(payload)["type"] == "smart-patch-conditioned"
    expected = [255] * 25
    expected[12] = 254
    assert _alpha(_output(payload, "latentKeepMask")) == bytes(expected)


def test_real_json_lines_conditioning_route_has_no_ml_imports(tmp_path: Path) -> None:
    payload = _request(tmp_path, [255] * 64, [1] + [0] * 63, (8, 8), edge=0)
    script = """
import sys
from imagegen_worker.__main__ import main
main()
assert not any(name.split('.')[0] in ('torch','diffusers','compel') for name in sys.modules)
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
    assert "smart-patch-conditioning" in messages[0]["capabilities"]
    assert messages[1]["type"] == "smart-patch-conditioned"


@pytest.fixture(scope="module")
def upstream(native: tuple[Any, Any]) -> tuple[Any, Any, Any]:
    return native[0], native[1], pytest.importorskip("torch")


def _upstream_gradient(
    keep: Image.Image, mode: CoherenceMode, edge: int, minimum: float, native: tuple[Any, Any, Any]
) -> tuple[Image.Image, Image.Image]:
    # Reuse the established pinned AST loader; graph storage/types alone are controlled.
    spec = importlib.util.spec_from_file_location(
        "igs_existing_gradient_oracle", Path(__file__).with_name("test_outpaint_conditioning.py")
    )
    assert spec is not None and spec.loader is not None
    oracle = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(oracle)
    loader = cast(Callable[[str, str, dict[str, Any]], Any], oracle._upstream_class)
    np, cv2, torch = native
    captured: list[Image.Image] = []
    saved: list[Image.Image] = []

    def tensor_sink(image: Image.Image, *, normalize: bool) -> Any:
        assert normalize is False
        captured.append(image.copy())
        return torch.from_numpy(np.array(image, dtype=np.float32) / 255).unsqueeze(0)

    def get_image(_name: str, *, mode: str = "L") -> Image.Image:
        return keep.convert(mode)

    def save_image(image: Image.Image, **_kwargs: Any) -> SimpleNamespace:
        saved.append(image.copy())
        return SimpleNamespace(image_name="saved")

    def save_tensor(**_kwargs: Any) -> str:
        return "tensor"

    namespace: dict[str, Any] = {
        "np": np,
        "numpy": np,
        "cv2": cv2,
        "torch": torch,
        "Image": Image,
        "LATENT_SCALE_FACTOR": 8,
        "GradientMaskOutput": SimpleNamespace,
        "DenoiseMaskField": SimpleNamespace,
        "ImageField": SimpleNamespace,
        "image_resized_to_grid_as_tensor": tensor_sink,
    }
    original_class = loader(
        "invokeai/app/invocations/create_gradient_mask.py",
        "CreateGradientMaskInvocation",
        namespace,
    )
    invocation = original_class()
    invocation.mask = SimpleNamespace(image_name="input")
    invocation.edge_radius = edge
    invocation.minimum_denoise = minimum
    invocation.coherence_mode = mode
    invocation.unet = invocation.vae = invocation.image = None
    invocation.invoke(
        SimpleNamespace(
            images=SimpleNamespace(get_pil=get_image, save=save_image),
            tensors=SimpleNamespace(save=save_tensor),
        )
    )
    assert len(captured) == len(saved) == 1
    latent = captured[0].resize((keep.width // 8, keep.height // 8), Image.Resampling.NEAREST)
    return latent, saved[0]


@pytest.mark.parametrize("mode", ["Gaussian Blur", "Box Blur", "Staged"])
@pytest.mark.parametrize("edge", [0, 7, 8, 16])
@pytest.mark.parametrize("minimum", [0, 0.4, 1])
def test_shared_coherence_matches_actual_pinned_gradient_body_for_all_modes(
    mode: CoherenceMode, edge: int, minimum: float, upstream: tuple[Any, Any, Any]
) -> None:
    keep = Image.new("L", (40, 24), 255)
    keep.paste(0, (8, 8, 16, 16))
    keep.paste(128, (24, 8, 32, 16))
    keep.putpixel((3, 3), 254)
    original = keep.tobytes()

    actual = prepare_keep_mask_coherence(
        keep, coherence_mode=mode, edge_radius=edge, minimum_denoise=minimum
    )
    expected = _upstream_gradient(keep, mode, edge, minimum, upstream)

    for observed, reference in zip(actual, expected, strict=True):
        assert observed.mode == reference.mode == "L"
        assert observed.size == reference.size
        assert observed.tobytes() == reference.tobytes()
    assert keep.tobytes() == original


def test_existing_normal_outpaint_default_still_matches_pinned_gaussian_gradient(
    upstream: tuple[Any, Any, Any],
) -> None:
    source = Image.new("RGBA", (40, 24), (20, 40, 80, 255))
    alpha = Image.new("L", source.size, 255)
    alpha.paste(0, (24, 0, 40, 24))
    alpha.paste(128, (8, 8, 16, 16))
    source.putalpha(alpha)
    original = source.tobytes()

    actual = prepare_outpaint_conditioning(
        source, coherence_edge_radius=16, minimum_denoise=0, output_fade_radius=16
    )
    latent, expanded = _upstream_gradient(alpha, "Gaussian Blur", 16, 0, upstream)

    assert actual.latent_keep_mask.tobytes() == latent.tobytes()
    assert actual.expanded_keep_mask.tobytes() == expanded.tobytes()
    assert source.tobytes() == original
