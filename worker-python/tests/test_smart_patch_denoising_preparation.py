"""Actual CPU protocol outputs through private native-family denoising.

Small randomly initialized native models prove numerical wiring, not trained
quality, installed worker admission, public Main/queue or world compositing.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.protocol import process_request
from imagegen_worker.smart_patch_denoising import (
    SmartPatchDenoisingInput,
    run_smart_patch_anima,
    run_smart_patch_illustrious,
)
from test_anima_euler import native as _anima_native
from test_anima_flow_sampling import inputs as anima_inputs
from test_sdxl_outpaint import native as _sdxl_native

FAMILIES = ("illustrious", "anima")
anima_native = _anima_native
sdxl_native = _sdxl_native


@pytest.fixture(autouse=True)
def one_thread() -> Any:
    torch = pytest.importorskip("torch")
    old = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        yield
    finally:
        torch.set_num_threads(old)


def _reference(file: Path, image: Image.Image) -> dict[str, object]:
    raw = file.read_bytes()
    return {
        "path": str(file),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "byteSize": len(raw),
        "width": image.width,
        "height": image.height,
    }


def _prepared(directory: Path, *, lost: bool = False) -> SmartPatchDenoisingInput:
    """World128 -> processing64; actual protocol owns all resampling and masks."""
    world = (128, 128)
    source = Image.frombytes(
        "RGB", world, bytes((index * 19 + index // 128) % 256 for index in range(128 * 128 * 3))
    ).convert("RGBA")
    source_path = directory / "source.png"
    source.save(source_path, icc_profile=SRGB_ICC_PROFILE)
    authored = Image.new("RGBA", world, (255, 255, 255, 0))
    if lost:
        authored.putpixel((63, 63), (255, 255, 255, 1))
    else:
        authored.paste((255, 255, 255, 64), (32, 0, 64, 128))
        authored.paste((255, 255, 255, 255), (64, 0, 128, 128))
    bounds = authored.getchannel("A").getbbox()
    assert bounds is not None
    authored = authored.crop(bounds)
    mask_path = directory / "mask.png"
    authored.save(mask_path)
    stage = directory / "stage"
    stage.mkdir()
    size = {"width": 64, "height": 64}
    outputs = {
        "stagingRoot": str(stage),
        "worldMaskPngPath": str(stage / "world.png"),
        "processingSourcePngPath": str(stage / "processing-source.png"),
        "processingMaskPngPath": str(stage / "processing-mask.png"),
    }
    prepare: dict[str, object] = {
        "type": "prepare-smart-patch",
        "protocolVersion": "1",
        "requestId": "prepare-before-native",
        "bbox": {"x": 0, "y": 0, "width": 128, "height": 128},
        "internalResolution": size,
        "source": _reference(source_path, source),
        "mask": {
            **_reference(mask_path, authored),
            "bounds": {
                "x": bounds[0],
                "y": bounds[1],
                "width": authored.width,
                "height": authored.height,
            },
        },
        "output": outputs,
    }
    prepared = process_request(prepare)
    assert prepared["type"] == "smart-patch-prepared", prepared
    keys = (
        "worldKeepMask",
        "processingKeepMask",
        "latentKeepMask",
        "expandedProcessingKeepMask",
        "expandedWorldKeepMask",
        "finalContributionMask",
    )
    conditioned = process_request(
        {
            "type": "condition-smart-patch",
            "protocolVersion": "1",
            "requestId": "condition-before-native",
            "source": prepare["source"],
            "effectiveMask": {
                **cast(dict[str, object], prepared["worldMask"]),
                "path": outputs["worldMaskPngPath"],
            },
            "internalResolution": size,
            "mode": "inpaint",
            "maskBlur": 0,
            "coherence": {"mode": "Gaussian Blur", "edgeSize": 0, "minimumDenoise": 0},
            "output": {"stagingRoot": str(stage)}
            | {f"{key}PngPath": str(stage / f"{key}.png") for key in keys},
        }
    )
    assert conditioned["type"] == "smart-patch-conditioned", conditioned
    model_path = stage / "model-source.png"
    model_response = process_request(
        {
            "type": "prepare-smart-patch-model-source",
            "protocolVersion": "1",
            "requestId": "source-before-native",
            "mode": "inpaint",
            "source": {
                **{
                    key: cast(dict[str, object], prepared["processingSource"])[key]
                    for key in ("sha256", "byteSize", "width", "height")
                },
                "path": outputs["processingSourcePngPath"],
            },
            "infillResource": None,
            "output": {"stagingRoot": str(stage), "modelSourcePngPath": str(model_path)},
        }
    )
    assert model_response["type"] == "smart-patch-model-source-prepared", model_response
    with Image.open(model_path) as decoded:
        decoded.load()
        rgb = decoded.copy()
    assert rgb.mode == "RGB" and rgb.size == (64, 64)
    assert (
        rgb.tobytes() == source.convert("RGB").resize((64, 64), Image.Resampling.BICUBIC).tobytes()
    )
    with Image.open(stage / "latentKeepMask.png") as decoded:
        keep = decoded.getchannel("A")
    with Image.open(stage / "finalContributionMask.png") as decoded:
        contribution = decoded.getchannel("A")
    if lost:
        assert keep.tobytes() == bytes([255] * 64)
        assert contribution.getpixel((63, 63)) == 255
    else:
        assert keep.getextrema() == (0, 255)
        assert any(0 < value < 255 for value in keep.tobytes())
    return SmartPatchDenoisingInput("inpaint", 64, 64, rgb, keep)


def _execute(
    family: str,
    native: Any,
    inputs: SmartPatchDenoisingInput,
    *,
    strength: float = 0.75,
    progress: Any = None,
) -> Any:
    if family == "illustrious":
        native.pipeline.scheduler = native.diffusers.EulerDiscreteScheduler(
            beta_start=0.00085,
            beta_end=0.012,
            beta_schedule="scaled_linear",
            prediction_type="epsilon",
        )
        return run_smart_patch_illustrious(
            native.pipeline,
            native.conditioning,
            inputs,
            steps=4,
            cfg_scale=5,
            generator=native.torch.Generator(device="cpu").manual_seed(42),
            torch=native.torch,
            denoising_strength=strength,
            on_progress=progress,
        )
    data = anima_inputs(scheduler="euler", mode="img2img", strength=strength)
    return run_smart_patch_anima(
        data["plan"],
        data["positive"],
        data["negative"],
        native[2],
        inputs,
        tokenizers=native[3],
        progress=progress,
    )


def _pixels(family: str, result: Any) -> bytes:
    image = result.images[0] if family == "illustrious" else result.image
    assert image.mode == "RGB" and image.size == (64, 64)
    return cast(bytes, image.tobytes())


def _fixture(request: pytest.FixtureRequest, family: str) -> Any:
    return request.getfixturevalue("sdxl_native" if family == "illustrious" else "anima_native")


@pytest.mark.parametrize("family", FAMILIES)
def test_actual_prepared_soft_mask_and_rgb_reach_native_denoising(
    tmp_path: Path,
    request: pytest.FixtureRequest,
    family: str,
) -> None:
    inputs = _prepared(tmp_path)
    native = _fixture(request, family)
    files_before = {str(p): p.read_bytes() for p in tmp_path.rglob("*.png")}
    source = cast(Image.Image, inputs.model_source)
    original = (source.tobytes(), inputs.latent_keep_mask.tobytes())
    baseline = _pixels(family, _execute(family, native, inputs))
    replay = _pixels(family, _execute(family, native, inputs))
    ordinary = replace(inputs, mode="img2img", latent_keep_mask=Image.new("L", (8, 8), 0))
    black = replace(inputs, latent_keep_mask=Image.new("L", (8, 8), 0))
    assert baseline == replay
    assert baseline != _pixels(family, _execute(family, native, ordinary))
    assert _pixels(family, _execute(family, native, black)) == _pixels(
        family, _execute(family, native, ordinary)
    )
    assert original == (source.tobytes(), inputs.latent_keep_mask.tobytes())
    assert files_before == {str(p): p.read_bytes() for p in tmp_path.rglob("*.png")}


@pytest.mark.parametrize("family", FAMILIES)
def test_lost_latent_coverage_executes_vae_and_denoising_without_mode_fallback(
    tmp_path: Path,
    request: pytest.FixtureRequest,
    family: str,
) -> None:
    inputs = _prepared(tmp_path, lost=True)
    native = _fixture(request, family)
    progress: list[tuple[int, int]] = []
    vae = native.pipeline.vae if family == "illustrious" else native[2].vae
    calls: list[str] = []

    def observe(label: str) -> Callable[[Any, Any], None]:
        def capture(_module: Any, _args: Any) -> None:
            calls.append(label)

        return capture

    def report(step: int, total: int) -> None:
        progress.append((step, total))

    handles = [
        module.register_forward_pre_hook(observe(label))
        for module, label in ((vae.encoder, "encode"), (vae.decoder, "decode"))
    ]
    try:
        actual = _execute(family, native, inputs, progress=report)
    finally:
        for handle in handles:
            handle.remove()
    assert "encode" in calls and "decode" in calls
    assert progress and progress[-1][0] == progress[-1][1] > 0
    assert inputs.mode == "inpaint" and inputs.latent_keep_mask.getextrema() == (255, 255)
    zero = _execute(family, native, inputs, strength=0)
    assert _pixels(family, actual) == _pixels(family, zero)
    black = replace(inputs, latent_keep_mask=Image.new("L", (8, 8), 0))
    assert _pixels(family, actual) != _pixels(family, _execute(family, native, black))
    if family == "anima":
        assert native[0].equal(actual.latents, zero.latents)


@pytest.mark.parametrize("family", FAMILIES)
def test_adapter_captures_images_before_callbacks_and_recovers_from_cancellation(
    tmp_path: Path,
    request: pytest.FixtureRequest,
    family: str,
) -> None:
    inputs = _prepared(tmp_path)
    native = _fixture(request, family)
    baseline = _pixels(family, _execute(family, native, inputs))
    source = cast(Image.Image, inputs.model_source)
    saved_source, saved_mask = source.copy(), inputs.latent_keep_mask.copy()

    def edit_caller(_step: int, _total: int) -> None:
        source.paste((255, 0, 0), (0, 0, 64, 64))
        inputs.latent_keep_mask.paste(0, (0, 0, 8, 8))

    assert _pixels(family, _execute(family, native, inputs, progress=edit_caller)) == baseline
    original = replace(inputs, model_source=saved_source, latent_keep_mask=saved_mask)

    def cancel(_step: int, _total: int) -> None:
        raise RuntimeError("declared Smart Patch cancellation")

    if family == "illustrious":
        with pytest.raises(RuntimeError, match="declared Smart Patch cancellation"):
            _execute(family, native, original, progress=cancel)
    else:
        with pytest.raises(DerivativeError) as error:
            _execute(family, native, original, progress=cancel)
        assert error.value.code == "GENERATION_WORKER_FAILED"
        assert isinstance(error.value.__cause__, RuntimeError)
        assert str(error.value.__cause__) == "declared Smart Patch cancellation"
    if family == "illustrious":
        assert native.pipeline._igs_outpaint_state is None
        assert not native.pipeline.unet._forward_pre_hooks
        for module in (
            native.pipeline.vae.encoder,
            native.pipeline.vae.quant_conv,
            native.pipeline.vae.post_quant_conv,
            native.pipeline.vae.decoder,
        ):
            assert not module._forward_hooks
    assert _pixels(family, _execute(family, native, original)) == baseline


def test_adapter_refuses_actual_nonfinite_vae_output_and_releases_hooks(
    tmp_path: Path,
    sdxl_native: Any,
) -> None:
    inputs = _prepared(tmp_path)
    native = sdxl_native
    baseline = _pixels("illustrious", _execute("illustrious", native, inputs))

    def inject_nan(_module: Any, _args: Any, output: Any) -> Any:
        return output * float("nan")

    handle = native.pipeline.vae.encoder.register_forward_hook(inject_nan)
    try:
        with pytest.raises(DerivativeError, match="VAE.*non-finite"):
            _execute("illustrious", native, inputs)
    finally:
        handle.remove()
    assert native.pipeline._igs_outpaint_state is None
    assert not native.pipeline.vae.encoder._forward_hooks
    assert _pixels("illustrious", _execute("illustrious", native, inputs)) == baseline
