"""Exact IMG/OUT reference profiles through real tiny native publication.

InvokeAI 4875d965 compileCanvasGraph.ts grafts source/VAE/strength or alpha
outpaint before addRegionalGuidance.ts adds the same masked image-attention
fields. sd/denoise_latents.py owns the shared denoiser and reference prepass.
These tests retain real CLIP Vision, dual CLIP, VAE, UNet, Euler and PNG owners;
only model loading and OUT's trained LaMa are explicit tiny CPU collaborators.
ROOT owns execution and isolated post-PNG semantic mutation qualification.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from test_illustrious_regional_references import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _oracle,  # pyright: ignore[reportPrivateUsage]
    _run,  # pyright: ignore[reportPrivateUsage]
    _seal,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_references import native as native


@pytest.mark.parametrize("mode", ("txt2img", "img2img", "outpaint"))
@pytest.mark.parametrize("other", ("txt2img", "img2img", "outpaint"))
def test_reference_profile_exactly_matches_native_mode(
    tmp_path: Path, mode: str, other: str
) -> None:
    case = _case(tmp_path / "profile", mode=mode)
    case.bundle["references"]["profile"] = f"invoke-illustrious-regional-reference-{other}-v1"
    _seal(case)
    if mode == other:
        request = worker.parse_regional_request(case.wire)
        assert request.references is not None
        assert (
            type(request.command).__name__
            == {
                "txt2img": "GenerateIllustriousTxt2ImgCommand",
                "img2img": "GenerateIllustriousImg2ImgCommand",
                "outpaint": "GenerateIllustriousOutpaintCommand",
            }[mode]
        )
    else:
        with pytest.raises(DerivativeError, match="exact target mode"):
            worker.parse_regional_request(case.wire)
    assert not (case.root / "result.png").exists()


@pytest.mark.parametrize("mode", ("img2img", "outpaint"))
@pytest.mark.parametrize("fault", ("sampler", "precision", "noise", "batch", "initializer"))
def test_reference_image_mode_keeps_finite_admission_before_native(
    tmp_path: Path, mode: str, fault: str
) -> None:
    case = _case(tmp_path / fault, mode=mode)
    job = case.request["job"]
    if fault == "sampler":
        job["sampling"]["scheduler"] = "euler_a"
    elif fault == "precision":
        job["vaePrecision"] = "FP32"
    elif fault == "noise":
        job["sampling"]["noiseProfile"]["timestepSpacing"] = "trailing"
    elif fault == "batch":
        case.bundle["recipe"]["item"]["iteration"] = 1
    else:
        case.bundle["initializationProfile"] = "invoke-cpu-f32-add-noise-v1"
    _seal(case)
    with pytest.raises((ValueError, DerivativeError)):
        worker.parse_regional_request(case.wire)
    assert not (case.root / "result.png").exists()


def test_worker_advertises_independent_reference_image_mode_capabilities() -> None:
    capabilities = inference_main.inference_ready_message()["capabilities"]
    assert type(capabilities) is list
    for mode in ("txt2img", "img2img", "outpaint"):
        assert f"illustrious-regional-reference-{mode}-v1" in capabilities


def _image_case(directory: Path, mode: str, **kwargs: Any) -> Any:
    case = _case(directory, mode=mode, strength=0.65, image_only=True, **kwargs)
    case.request["job"]["sampling"]["steps"] = 4
    _seal(case)
    return case


def _assert_source_window_and_publication(case: Any, record: Any, native: Any) -> None:
    assert record.result["type"] != "error", record.result
    assert record.output.is_file(), "The native consumer must publish its original PNG."
    assert len(record.encodes) == len(record.seen.decodes) == 1
    expected = native.torch.tensor(list(case.source.convert("RGB").tobytes()), dtype=native.dtype)
    expected = expected.reshape(64, 64, 3).permute(2, 0, 1).unsqueeze(0) / 255 * 2 - 1
    native.torch.testing.assert_close(record.encodes[0], expected, rtol=0, atol=0)
    assert len(record.seen.steps) == 3
    scheduler = record.seen.steps[0]["self"]
    cutoff = round(scheduler.config.num_train_timesteps * 0.65)
    selected = scheduler.timesteps[scheduler.timesteps < cutoff]
    actual = native.torch.stack([step["timestep"] for step in record.seen.steps])
    assert native.torch.equal(actual, selected)
    assert len(record.before_output) == len(record.seen.steps)
    with Image.open(record.output) as image:
        image.load()
        assert image.size == (64, 64)
        assert image.mode == ("RGBA" if case.mode == "outpaint" else "RGB")
        assert image.info["icc_profile"] == SRGB_ICC_PROFILE
        if case.mode == "outpaint":
            assert len(record.infills) == 1
            generated = image.getpixel((0, 32))
            protected = image.getpixel((63, 32))
            assert isinstance(generated, tuple) and len(generated) == 4
            assert isinstance(protected, tuple) and len(protected) == 4
            assert generated[3] == 255
            assert protected[3] == 0
            composite = Image.alpha_composite(case.source, image)
            assert composite.getpixel((63, 32)) == case.source.getpixel((63, 32))
            assert image.getchannel("A").tobytes() != case.alpha.read_bytes()
        else:
            assert record.infills == []


@pytest.mark.parametrize("mode", ("img2img", "outpaint"))
def test_reference_image_mode_original_source_window_attention_and_png_effect(
    tmp_path: Path, mode: str, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    first_case = _image_case(tmp_path / "a", mode)
    second_case = _image_case(tmp_path / "b", mode, alternate=True)
    frozen = copy.deepcopy(first_case.wire)
    first = _run(first_case, native, monkeypatch)
    second = _run(second_case, native, monkeypatch)
    _assert_source_window_and_publication(first_case, first, native)
    _assert_source_window_and_publication(second_case, second, native)
    assert first_case.wire == frozen
    assert first_case.target.read_bytes() == second_case.target.read_bytes()
    assert native.torch.equal(first.encodes[0], second.encodes[0])
    with Image.open(first.output) as a, Image.open(second.output) as b:
        assert a.convert("RGB").tobytes() != b.convert("RGB").tobytes(), (
            "Changing only the original reference must reach published RGB."
        )
        if mode == "outpaint":
            assert a.getchannel("A").tobytes() == b.getchannel("A").tobytes()
            assert Image.alpha_composite(first_case.source, a).convert("RGB").tobytes() != (
                Image.alpha_composite(second_case.source, b).convert("RGB").tobytes()
            ), "Reference changes must survive the OUT contribution on visible pixels."
    assert not native.torch.equal(
        first.seen.steps[0]["model_output"], second.seen.steps[0]["model_output"]
    ), "Changing only the original reference must reach native prediction."
    for record in (first, second):
        for index, consumed in enumerate(record.before_output):
            native.torch.testing.assert_close(
                consumed, _oracle(native, record, index), rtol=3e-5, atol=3e-6
            )


@pytest.mark.parametrize("mode", ("img2img", "outpaint"))
def test_reference_image_mode_zero_mask_matches_authored_no_reference_control(
    tmp_path: Path, mode: str, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = _run(_image_case(tmp_path / "zero-a", mode, zero=True), native, monkeypatch)
    second = _run(
        _image_case(tmp_path / "zero-b", mode, zero=True, alternate=True), native, monkeypatch
    )
    ordinary_case = _image_case(tmp_path / "ordinary", mode, zero=True, count=0)
    del ordinary_case.bundle["references"]
    _seal(ordinary_case)
    ordinary = _run(ordinary_case, native, monkeypatch)
    for record in (first, second, ordinary):
        assert record.result["type"] != "error", record.result
        assert record.output.is_file()
    assert first.output.read_bytes() == second.output.read_bytes() == ordinary.output.read_bytes()
    assert native.torch.equal(
        first.seen.steps[0]["model_output"], ordinary.seen.steps[0]["model_output"]
    )


def test_reference_img_strength_zero_retains_source_without_attention_steps(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = _run(
        _case(tmp_path / "zero-a", mode="img2img", strength=0, image_only=True),
        native,
        monkeypatch,
    )
    second = _run(
        _case(tmp_path / "zero-b", mode="img2img", strength=0, image_only=True, alternate=True),
        native,
        monkeypatch,
    )
    changed_source = _run(
        _case(
            tmp_path / "other-source", mode="img2img", strength=0, image_only=True, source_marker=1
        ),
        native,
        monkeypatch,
    )
    for record in (first, second, changed_source):
        assert record.result["type"] != "error", record.result
        assert record.output.is_file()
        assert len(record.encodes) == len(record.seen.decodes) == 1
        assert record.seen.steps == record.before_output == []
    assert first.output.read_bytes() == second.output.read_bytes()
    assert first.output.read_bytes() != changed_source.output.read_bytes()
