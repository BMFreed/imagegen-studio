"""Prepared Smart Patch inputs through real native family VAE/denoising.

The boundary under test is the private adapter, not a replacement denoiser. Native
small model fixtures deliberately keep original family topology; they do not
qualify trained-image quality, publication, acceptance or a public Generate path.
"""

from __future__ import annotations

import copy
from collections.abc import Callable, Generator
from dataclasses import replace
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

import test_sdxl_outpaint
from imagegen_worker.anima_flow_sampling import generate_anima_flow_sampling
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import img2img_pipeline_class, run_sdxl_pipeline
from imagegen_worker.smart_patch_denoising import (
    SmartPatchDenoisingInput,
    run_smart_patch_anima,
    run_smart_patch_illustrious,
)
from imagegen_worker.smart_patch_fade import SmartPatchFadeMode
from test_anima_euler import native as _anima_base
from test_anima_flow_sampling import inputs as anima_plan
from test_sdxl_outpaint import SCHEDULERS as ILLUSTRIOUS_SCHEDULERS
from test_sdxl_outpaint import native as _illustrious_native

ANIMA_SCHEDULERS = ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
_illustrious_scheduler = cast(Any, test_sdxl_outpaint)._scheduler
anima_base = _anima_base
illustrious_native = _illustrious_native


@pytest.fixture(scope="module")
def anima_native(anima_base: Any) -> Generator[Any]:
    torch = anima_base[0]
    previous = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        yield anima_base
    finally:
        torch.set_num_threads(previous)


def _source() -> Image.Image:
    image = Image.frombytes(
        "RGB", (64, 64), bytes((index * 19 + index // 64) % 256 for index in range(64 * 64 * 3))
    )
    image.info["icc_profile"] = SRGB_ICC_PROFILE
    return image


def _mixed_keep() -> Image.Image:
    return Image.frombytes("L", (8, 8), bytes((255, 254, 192, 128, 64, 1, 0, 0)) * 8)


def _inputs(
    mode: SmartPatchFadeMode = "inpaint", *, keep: Image.Image | None = None
) -> SmartPatchDenoisingInput:
    return SmartPatchDenoisingInput(
        mode=mode,
        width=64,
        height=64,
        model_source=None if mode == "txt2img" else _source(),
        latent_keep_mask=keep if keep is not None else Image.new("L", (8, 8), 0),
    )


def _report(events: list[tuple[int, int]]) -> Callable[[int, int], None]:
    def report(step: int, total: int) -> None:
        events.append((step, total))

    return report


def _observe(calls: list[str], label: str) -> Callable[[Any, Any], None]:
    def observe(_model: Any, _args: Any) -> None:
        calls.append(label)

    return observe


def _run_illustrious(
    native: Any,
    inputs: SmartPatchDenoisingInput,
    *,
    scheduler: str = "euler",
    prediction: str = "epsilon",
    strength: float | None = 0.75,
    progress: Callable[[int, int], None] | None = None,
) -> Any:
    _illustrious_scheduler(native, scheduler, prediction=prediction, seed=0)
    return run_smart_patch_illustrious(
        native.pipeline,
        native.conditioning,
        inputs,
        steps=4,
        cfg_scale=5,
        cfg_rescale=0.2,
        generator=native.torch.Generator(device="cpu").manual_seed(0),
        torch=native.torch,
        denoising_strength=strength,
        on_progress=progress,
    )


def _run_anima(
    native: Any,
    data: dict[str, Any],
    inputs: SmartPatchDenoisingInput,
    *,
    progress: Callable[[int, int], None] | None = None,
) -> Any:
    return run_smart_patch_anima(
        data["plan"],
        data["positive"],
        data["negative"],
        native[2],
        inputs,
        tokenizers=native[3],
        progress=progress,
    )


def _txt_native(native: Any) -> Any:
    pipeline = native.diffusers.StableDiffusionXLPipeline(
        vae=native.pipeline.vae,
        unet=native.pipeline.unet,
        text_encoder=None,
        text_encoder_2=None,
        tokenizer=None,
        tokenizer_2=None,
        scheduler=native.pipeline.scheduler,
        force_zeros_for_empty_prompt=False,
        add_watermarker=False,
    )
    pipeline.set_progress_bar_config(disable=True)
    return SimpleNamespace(
        pipeline=pipeline,
        conditioning=native.conditioning,
        torch=native.torch,
        diffusers=native.diffusers,
    )


@pytest.mark.parametrize("scheduler", ILLUSTRIOUS_SCHEDULERS)
@pytest.mark.parametrize("prediction", ("epsilon", "v_prediction"))
def test_illustrious_prepared_keep_modes_replay_and_fully_protected_execution(
    illustrious_native: Any, scheduler: str, prediction: str
) -> None:
    """Bypass/polarity faults differ from ordinary and protected native controls."""
    native = illustrious_native
    source, keep = _source(), _mixed_keep()
    before_source, before_keep = source.tobytes(), keep.tobytes()
    prepared = replace(_inputs(), model_source=source, latent_keep_mask=keep)
    options: dict[str, Any] = {"scheduler": scheduler, "prediction": prediction}
    _illustrious_scheduler(native, scheduler, prediction=prediction, seed=0)
    ordinary = run_sdxl_pipeline(
        native.pipeline,
        native.conditioning,
        width=64,
        height=64,
        steps=4,
        cfg_scale=5,
        cfg_rescale=0.2,
        generator=native.torch.Generator(device="cpu").manual_seed(0),
        torch=native.torch,
        image=source,
        denoising_strength=0.75,
    ).images[0]
    img = _run_illustrious(native, _inputs("img2img"), **options).images[0]
    black = _run_illustrious(native, _inputs("inpaint"), **options).images[0]
    assert img.tobytes() == ordinary.tobytes() == black.tobytes()

    decoder_latents: list[Any] = []

    def capture_decoder(_model: Any, args: tuple[Any, ...]) -> None:
        decoder_latents.append(args[0].detach().clone())

    handle = native.pipeline.vae.post_quant_conv.register_forward_pre_hook(capture_decoder)
    try:
        zero = _run_illustrious(native, _inputs("img2img"), strength=0, **options).images[0]
    finally:
        handle.remove()
    calls: list[str] = []
    events: list[tuple[int, int]] = []
    handles = [
        native.pipeline.vae.encoder.register_forward_pre_hook(_observe(calls, "encoder")),
        native.pipeline.unet.register_forward_pre_hook(_observe(calls, "unet")),
    ]
    try:
        white = _run_illustrious(
            native,
            _inputs(
                "inpaint" if prediction == "epsilon" else "outpaint",
                keep=Image.new("L", (8, 8), 255),
            ),
            progress=_report(events),
            **options,
        ).images[0]
    finally:
        for handle in handles:
            handle.remove()
    assert white.tobytes() == zero.tobytes() and white.tobytes() != black.tobytes()
    assert calls.count("encoder") == 1 and calls.count("unet") > 0
    assert events and events == [(i + 1, len(events)) for i in range(len(events))]

    handle = native.pipeline.vae.post_quant_conv.register_forward_pre_hook(capture_decoder)
    try:
        mixed = _run_illustrious(native, prepared, **options).images[0]
    finally:
        handle.remove()
    replay = _run_illustrious(native, replace(prepared, mode="outpaint"), **options).images[0]
    assert mixed.tobytes() == replay.tobytes()
    assert mixed.tobytes() != black.tobytes() and mixed.tobytes() != white.tobytes()
    assert len(decoder_latents) == 2
    assert native.torch.equal(decoder_latents[0][..., :1], decoder_latents[1][..., :1])
    assert not native.torch.equal(decoder_latents[0], decoder_latents[1])
    assert mixed.mode == "RGB" and mixed.size == (64, 64)
    assert source.tobytes() == before_source and keep.tobytes() == before_keep
    assert source.info["icc_profile"] == SRGB_ICC_PROFILE
    assert native.pipeline._igs_outpaint_state is None
    assert not native.pipeline.unet._forward_pre_hooks
    assert not native.pipeline.vae.encoder._forward_hooks


@pytest.mark.parametrize("prediction", ("epsilon", "v_prediction"))
def test_illustrious_txt_matches_genuine_native_txt_without_vae_encoding(
    illustrious_native: Any, prediction: str
) -> None:
    native = _txt_native(illustrious_native)
    _illustrious_scheduler(native, "euler", prediction=prediction, seed=0)
    expected = run_sdxl_pipeline(
        native.pipeline,
        native.conditioning,
        width=64,
        height=64,
        steps=4,
        cfg_scale=5,
        cfg_rescale=0.2,
        generator=native.torch.Generator(device="cpu").manual_seed(0),
        torch=native.torch,
    ).images[0]
    calls: list[str] = []
    handle = native.pipeline.vae.encoder.register_forward_pre_hook(_observe(calls, "encoder"))
    try:
        actual = _run_illustrious(
            native, _inputs("txt2img"), prediction=prediction, strength=None
        ).images[0]
    finally:
        handle.remove()
    assert actual.tobytes() == expected.tobytes() and calls == []


@pytest.mark.parametrize("scheduler", ANIMA_SCHEDULERS)
def test_anima_prepared_keep_modes_replay_and_fully_protected_execution(
    anima_native: Any, scheduler: str
) -> None:
    native = anima_native
    torch = native[0]
    data = anima_plan(scheduler=scheduler, mode="img2img", strength=0.75)
    before_plan = copy.deepcopy(data)
    prepared = _inputs(keep=_mixed_keep())
    source, keep = prepared.model_source, prepared.latent_keep_mask
    assert source is not None
    before_source, before_keep = source.tobytes(), keep.tobytes()
    ordinary = generate_anima_flow_sampling(
        data["plan"],
        data["positive"],
        data["negative"],
        native[2],
        source_image=source,
        tokenizers=native[3],
    )
    img = _run_anima(native, data, _inputs("img2img"))
    black = _run_anima(native, data, _inputs("inpaint"))
    assert torch.equal(img.latents, ordinary.latents) and torch.equal(black.latents, img.latents)
    assert img.image.tobytes() == ordinary.image.tobytes() == black.image.tobytes()
    zero = _run_anima(
        native, anima_plan(scheduler=scheduler, mode="img2img", strength=0), _inputs("img2img")
    )
    calls: list[str] = []
    events: list[tuple[int, int]] = []
    handles = [
        native[2].vae.encoder.register_forward_pre_hook(_observe(calls, "encoder")),
        native[2].transformer.register_forward_pre_hook(_observe(calls, "transformer")),
    ]
    try:
        white = _run_anima(
            native,
            data,
            _inputs(
                "inpaint" if scheduler in ("euler", "heun", "dpmpp_2m") else "outpaint",
                keep=Image.new("L", (8, 8), 255),
            ),
            progress=_report(events),
        )
    finally:
        for handle in handles:
            handle.remove()
    assert torch.equal(white.latents, zero.latents)
    assert white.image.tobytes() == zero.image.tobytes()
    assert not torch.equal(white.latents, black.latents)
    assert "encoder" in calls and "transformer" in calls
    assert events == [(i + 1, white.total_steps) for i in range(white.total_steps)]
    assert white.total_steps > 0 and zero.total_steps == 0
    mixed = _run_anima(native, data, prepared)
    replay = _run_anima(native, data, replace(prepared, mode="outpaint"))
    assert torch.equal(mixed.latents, replay.latents)
    assert mixed.image.tobytes() == replay.image.tobytes()
    assert not torch.equal(mixed.latents, black.latents)
    assert not torch.equal(mixed.latents, white.latents)
    assert torch.equal(mixed.latents[..., :1], zero.latents[..., :1])
    assert mixed.image.mode == "RGB" and mixed.image.size == (64, 64)
    assert mixed.image.info["icc_profile"] == SRGB_ICC_PROFILE
    assert source.tobytes() == before_source and keep.tobytes() == before_keep
    assert data == before_plan


@pytest.mark.parametrize("scheduler", ("euler", "heun"))
def test_anima_txt_matches_existing_native_flow_without_source_encoder(
    anima_native: Any, scheduler: str
) -> None:
    native = anima_native
    data = anima_plan(scheduler=scheduler)
    expected = generate_anima_flow_sampling(
        data["plan"], data["positive"], data["negative"], native[2], tokenizers=native[3]
    )
    calls: list[str] = []
    handle = native[2].vae.encoder.register_forward_pre_hook(_observe(calls, "encoder"))
    try:
        actual = _run_anima(native, data, _inputs("txt2img"))
    finally:
        handle.remove()
    assert native[0].equal(actual.latents, expected.latents)
    assert actual.image.tobytes() == expected.image.tobytes() and calls == []


_MALFORMED_INPUTS = (
    "mode",
    "bool-width",
    "unaligned-width",
    "zero-height",
    "side-limit",
    "pixel-limit",
    "no-source",
    "source-mode",
    "source-size",
    "source-profile",
    "no-mask",
    "mask-mode",
    "mask-size",
    "ordinary-nonzero-keep",
    "txt-source",
    "txt-nonzero-keep",
)


def _malformed(change: str) -> SmartPatchDenoisingInput:
    value = _inputs()
    if change == "mode":
        return replace(value, mode=cast(Any, "image-to-image"))
    if change == "bool-width":
        return replace(value, width=True)
    if change == "unaligned-width":
        return replace(value, width=65)
    if change == "zero-height":
        return replace(value, height=0)
    if change == "side-limit":
        return replace(value, width=2056)
    if change == "pixel-limit":
        return replace(value, width=2048, height=2048)
    if change == "no-source":
        return replace(value, model_source=None)
    if change == "source-mode":
        return replace(value, model_source=_source().convert("RGBA"))
    if change == "source-size":
        return replace(value, model_source=Image.new("RGB", (72, 64)))
    if change == "source-profile":
        source = _source()
        source.info["icc_profile"] = b"not-the-prepared-srgb-profile"
        return replace(value, model_source=source)
    if change == "no-mask":
        return replace(value, latent_keep_mask=cast(Any, None))
    if change == "mask-mode":
        return replace(value, latent_keep_mask=Image.new("RGB", (8, 8)))
    if change == "mask-size":
        return replace(value, latent_keep_mask=Image.new("L", (64, 64)))
    if change == "ordinary-nonzero-keep":
        return _inputs("img2img", keep=Image.new("L", (8, 8), 255))
    if change == "txt-source":
        return replace(_inputs("txt2img"), model_source=_source())
    assert change == "txt-nonzero-keep"
    return _inputs("txt2img", keep=_mixed_keep())


@pytest.mark.parametrize("change", _MALFORMED_INPUTS)
def test_illustrious_malformed_prepared_input_refuses_before_native_evaluation(
    illustrious_native: Any, change: str
) -> None:
    native = illustrious_native
    calls: list[str] = []
    handles = [
        model.register_forward_pre_hook(_observe(calls, "native"))
        for model in (native.pipeline.unet, native.pipeline.vae.encoder)
    ]
    try:
        with pytest.raises(DerivativeError) as raised:
            _run_illustrious(native, _malformed(change))
    finally:
        for handle in handles:
            handle.remove()
    assert raised.value.code == "INVALID_REQUEST" and calls == []
    assert native.pipeline._igs_outpaint_state is None


@pytest.mark.parametrize("change", _MALFORMED_INPUTS)
def test_anima_malformed_prepared_input_refuses_before_native_evaluation(
    anima_native: Any, change: str
) -> None:
    native = anima_native
    data = anima_plan(mode="img2img", strength=0.75)
    calls: list[str] = []
    handles = [
        model.register_forward_pre_hook(_observe(calls, "native"))
        for model in (native[2].transformer, native[2].vae.encoder, native[2].qwen3_encoder)
    ]
    try:
        with pytest.raises(DerivativeError) as raised:
            _run_anima(native, data, _malformed(change))
    finally:
        for handle in handles:
            handle.remove()
    assert raised.value.code == "INVALID_REQUEST" and calls == []


@pytest.mark.parametrize("change", ("txt-with-img-pipeline", "img-with-txt-pipeline", "unmasked"))
def test_illustrious_wrong_native_pipeline_cannot_drop_a_prepared_mask(
    illustrious_native: Any, change: str
) -> None:
    native = illustrious_native
    inputs = _inputs(keep=_mixed_keep())
    strength: float | None = 0.75
    if change == "txt-with-img-pipeline":
        inputs, strength = _inputs("txt2img"), None
    elif change == "img-with-txt-pipeline":
        native = _txt_native(native)
        inputs = _inputs("img2img")
    else:
        pipeline = img2img_pipeline_class(native.diffusers, native.torch)(
            **native.pipeline.components
        )
        pipeline.set_progress_bar_config(disable=True)
        native = SimpleNamespace(**{**vars(native), "pipeline": pipeline})
    calls: list[str] = []
    handle = native.pipeline.vae.encoder.register_forward_pre_hook(_observe(calls, "encoder"))
    try:
        with pytest.raises(DerivativeError) as raised:
            _run_illustrious(native, inputs, strength=strength)
    finally:
        handle.remove()
    assert raised.value.code == "INVALID_REQUEST" and calls == []


@pytest.mark.parametrize("strength", (None, True, float("nan"), -0.01, 1.01))
def test_illustrious_image_strength_refuses_before_encoder(
    illustrious_native: Any, strength: float | None
) -> None:
    native = illustrious_native
    calls: list[str] = []
    handle = native.pipeline.vae.encoder.register_forward_pre_hook(_observe(calls, "encoder"))
    try:
        with pytest.raises(DerivativeError) as raised:
            _run_illustrious(native, _inputs(), strength=strength)
    finally:
        handle.remove()
    assert raised.value.code == "INVALID_REQUEST" and calls == []


@pytest.mark.parametrize("change", ("mode", "size", "schedule"))
def test_anima_plan_must_match_frozen_smart_patch_before_native_evaluation(
    anima_native: Any, change: str
) -> None:
    native = anima_native
    if change == "mode":
        data = anima_plan()
    elif change == "size":
        data = anima_plan(mode="img2img", strength=0.75, width=72)
    else:
        data = anima_plan(mode="img2img", strength=0.75)
        data["plan"]["sigmas"][0] *= 0.9
    calls: list[str] = []
    handles = [
        model.register_forward_pre_hook(_observe(calls, "native"))
        for model in (native[2].transformer, native[2].vae.encoder, native[2].qwen3_encoder)
    ]
    try:
        with pytest.raises(DerivativeError) as raised:
            _run_anima(native, data, _inputs(keep=_mixed_keep()))
    finally:
        for handle in handles:
            handle.remove()
    assert raised.value.code == "INVALID_REQUEST" and calls == []
