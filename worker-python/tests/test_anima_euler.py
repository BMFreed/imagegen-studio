"""Actual TS plan through native Qwen3/adapter/Cosmos/Wan, without queue mocks."""

from __future__ import annotations

import copy
import json
import math
import subprocess
from collections.abc import Callable
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from imagegen_worker.anima_conditioning import encode_anima_conditioning_pair
from imagegen_worker.anima_euler import generate_anima_euler, validate_anima_euler_plan
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference_anima import ANIMA_BASE_ARCHITECTURE, LoadedAnimaModels


@lru_cache(maxsize=64)
def _ts_json(source: str) -> str:
    root = Path(__file__).resolve().parents[2]
    executable = root / "node_modules/.bin/tsx"
    if not executable.exists():
        pytest.skip("Cross-language Euler check requires repository pnpm dependencies.")
    program = (
        "import {compileAnimaEulerDenoisingPlan as plan} "
        "from './src/shared/projects/anima-euler-plan.ts'; "
        "import {compileAnimaPromptWeighting as prompt} "
        "from './src/shared/projects/anima-prompt-weighting.ts'; "
        "const x=" + source + ";process.stdout.write(JSON.stringify({"
        "plan:plan(x.plan),positive:prompt(x.positive),negative:prompt(x.negative)}))"
    )
    return subprocess.check_output([str(executable), "-e", program], cwd=root, text=True)


def inputs(**changes: Any) -> dict[str, Any]:
    positive = changes.pop("positive", "bright hair")
    negative = changes.pop("negative", "dark blur")
    value = {
        "mode": "txt2img",
        "width": 64,
        "height": 64,
        "steps": 2,
        "seed": 0,
        "guidanceScale": 4,
        "strength": None,
        **changes,
    }
    return json.loads(
        _ts_json(json.dumps({"plan": value, "positive": positive, "negative": negative}))
    )


@pytest.fixture(scope="module")
def native() -> Any:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    transformers = pytest.importorskip("transformers")
    pytest.importorskip("torchvision")
    from imagegen_worker.anima_tokenizers import load_anima_tokenizers

    torch.manual_seed(5187)
    encoder = transformers.Qwen3Model(
        transformers.Qwen3Config(
            vocab_size=151936,
            hidden_size=32,
            intermediate_size=64,
            num_hidden_layers=1,
            num_attention_heads=2,
            num_key_value_heads=1,
            head_dim=16,
        )
    ).eval()
    conditioner = diffusers.AnimaTextConditioner(
        source_dim=32,
        target_dim=32,
        model_dim=32,
        num_layers=1,
        num_attention_heads=2,
        target_vocab_size=32128,
        min_sequence_length=512,
    ).eval()
    transformer = diffusers.CosmosTransformer3DModel(
        in_channels=16,
        out_channels=16,
        num_attention_heads=2,
        attention_head_dim=32,
        num_layers=1,
        text_embed_dim=32,
        adaln_lora_dim=8,
        max_size=(1, 16, 16),
        patch_size=(1, 2, 2),
        concat_padding_mask=True,
        extra_pos_embed_type=None,
    ).eval()
    vae = diffusers.AutoencoderKLWan(base_dim=4, z_dim=16).eval()
    # Full token vocabularies and original latent topology, scaled native ML widths.
    return (
        torch,
        diffusers,
        LoadedAnimaModels(transformer, conditioner, encoder, vae),
        load_anima_tokenizers(),
    )


def run(data: dict[str, Any], native: Any, **options: Any) -> Any:
    _torch, _diffusers, models, tokenizers = native
    return generate_anima_euler(
        data["plan"], data["positive"], data["negative"], models, tokenizers=tokenizers, **options
    )


def record(calls: list[str], label: str) -> Callable[[Any, Any], None]:
    def observe(_module: Any, _args: Any) -> None:
        calls.append(label)

    return observe


@pytest.mark.parametrize(
    "change",
    [
        {"version": "anima-euler-denoising-v2"},
        {"scheduler": "heun"},
        {"sigmas": [1, 0.5, 0]},
        {"sigmas": [1, 0.750000001, 0]},
        {"sigmas": [1, 0.75]},
        {"totalSteps": True},
        {"posteriorSeed": 1},
        {"strength": 0.5},
        {"width": 65},
        {"extra": None},
    ],
)
def test_invalid_plan_refuses_at_real_capture_boundary(change: dict[str, Any]) -> None:
    actual = inputs()["plan"]
    with pytest.raises(DerivativeError) as error:
        validate_anima_euler_plan({**actual, **change})
    assert error.value.code == "INVALID_REQUEST"


def test_python_captures_actual_ts_clipped_schedule_and_seed_zero() -> None:
    data = inputs(mode="img2img", strength=0.8, steps=30)["plan"]
    actual = validate_anima_euler_plan(data)
    assert actual.seed == 0 and actual.posterior_seed == 2654435769
    assert actual.start_step == 5 and actual.total_steps == 25
    first = actual.sigmas[0]
    assert math.isclose(first, 15 / 16, rel_tol=0, abs_tol=1e-12) and actual.sigmas[-1] == 0
    data["sigmas"][0] = 0
    assert actual.sigmas[0] == first


def test_sigma_transport_tolerance_captures_canonical_values_not_caller_rounding() -> None:
    actual = inputs()["plan"]
    expected = tuple(actual["sigmas"])
    actual["sigmas"] = [1 - 5e-13, 0.75 + 5e-13, 5e-13]
    before = copy.deepcopy(actual)
    captured = validate_anima_euler_plan(actual)
    assert captured.sigmas == expected and captured.sigmas[0] == 1 and captured.sigmas[-1] == 0
    assert actual == before


def test_native_seed_replay_weights_both_signs_and_input_preservation(native: Any) -> None:
    torch, _diffusers, _models, _tokenizers = native
    data = inputs()
    before = copy.deepcopy(data)
    rng = torch.random.get_rng_state().clone()
    a = run(data, native)
    b = run(inputs(seed=1), native)
    again = run(data, native)
    equivalent = run(inputs(positive="(bright hair:1)", negative="(dark blur:1)"), native)
    for control in (again, equivalent):
        assert torch.equal(a.latents, control.latents)
        assert a.image.tobytes() == control.image.tobytes()
    assert not torch.equal(a.latents, b.latents)
    for weighted in (inputs(positive="(bright hair:2)"), inputs(negative="(dark blur)--")):
        assert not torch.equal(a.latents, run(weighted, native).latents)
    assert data == before and torch.equal(rng, torch.random.get_rng_state())
    assert a.image.size == (64, 64) and a.image.mode == "RGB"
    assert a.image.info["icc_profile"] == SRGB_ICC_PROFILE


@pytest.mark.parametrize(
    "positive,negative,guidance",
    [
        ("bright hair", "dark blur", 1.0),
        ("(bright hair:2)", "dark blur", 1.0),
        ("bright hair", "(dark blur)--", 4.0),
    ],
)
def test_native_euler_matches_independent_flow_control_and_progress(
    native: Any, positive: str, negative: str, guidance: float
) -> None:
    torch, _diffusers, models, tokenizers = native
    data = inputs(positive=positive, negative=negative, guidanceScale=guidance)
    pair = encode_anima_conditioning_pair(
        data["positive"], data["negative"], models, tokenizers=tokenizers
    )
    initial = torch.randn((1, 16, 1, 8, 8), generator=torch.Generator().manual_seed(0))
    expected = initial.clone()
    # Independent numerical reference from the source's N=2 schedule, not plan.sigmas.
    for current, following in ((1.0, 0.75), (0.75, 0.0)):
        with torch.inference_mode():
            velocity = models.transformer(
                hidden_states=expected,
                timestep=torch.tensor([current]),
                encoder_hidden_states=pair.positive.embeddings,
                padding_mask=torch.zeros((1, 1, 8, 8)),
            ).sample
            if guidance != 1:
                unconditional = models.transformer(
                    hidden_states=expected,
                    timestep=torch.tensor([current]),
                    encoder_hidden_states=pair.negative.embeddings,
                    padding_mask=torch.zeros((1, 1, 8, 8)),
                ).sample
                velocity = unconditional + guidance * (velocity - unconditional)
        expected = expected + (following - current) * velocity
    progress: list[tuple[int, int]] = []

    def report(step: int, total: int) -> None:
        progress.append((step, total))

    actual = run(data, native, progress=report)
    assert torch.allclose(actual.latents, expected, atol=1e-6, rtol=1e-6)
    assert progress == [(1, 2), (2, 2)] and actual.total_steps == 2


@pytest.mark.parametrize("guidance,passes", [(1.0, 2), (1.0000000005, 2), (4.0, 4)])
def test_cfg_native_pass_count_and_negative_neighbor(
    native: Any, guidance: float, passes: int
) -> None:
    torch, _diffusers, models, _tokenizers = native
    calls: list[str] = []
    handle = models.transformer.register_forward_pre_hook(record(calls, "cosmos"))
    try:
        first = run(inputs(guidanceScale=guidance), native)
        assert len(calls) == passes
        second = run(inputs(guidanceScale=guidance, negative="(fog:2)"), native)
    finally:
        handle.remove()
    assert torch.equal(first.latents, second.latents) == (passes == 2)


def test_img2img_zero_samples_real_vae_without_denoising_and_restores_tiling(native: Any) -> None:
    torch, _diffusers, models, _tokenizers = native
    image = Image.new("RGB", (64, 64), (64, 128, 255))
    data = inputs(mode="img2img", strength=0)
    calls: list[str] = []
    handles = [
        models.qwen3_encoder.register_forward_pre_hook(record(calls, "qwen")),
        models.transformer.register_forward_pre_hook(record(calls, "cosmos")),
    ]
    models.vae.enable_tiling()
    try:
        actual = run(data, native, source_image=image)
        assert calls == [] and models.vae.use_tiling
        with torch.inference_mode():
            models.vae.disable_tiling()
            pixels = torch.tensor([64, 128, 255], dtype=torch.float32).view(1, 3, 1, 1, 1)
            pixels = (pixels.expand(1, 3, 1, 64, 64) / 127.5 - 1).contiguous()
            posterior = models.vae.encode(pixels).latent_dist
            raw = posterior.sample(generator=torch.Generator().manual_seed(2654435769))
            mean = torch.tensor(models.vae.config.latents_mean).view(1, 16, 1, 1, 1)
            std = torch.tensor(models.vae.config.latents_std).view(1, 16, 1, 1, 1)
            expected = (raw - mean) / std
        assert torch.equal(actual.latents, expected) and actual.total_steps == 0
    finally:
        for handle in handles:
            handle.remove()
        models.vae.disable_tiling()


def test_img2img_strength_one_uses_same_noise_and_clipped_strength_changes_output(
    native: Any,
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    before = source.tobytes()
    text = run(inputs(), native)
    image = run(inputs(mode="img2img", strength=1), native, source_image=source)
    assert (
        torch.equal(text.latents, image.latents) and text.image.tobytes() == image.image.tobytes()
    )
    clipped = run(inputs(mode="img2img", strength=0.5), native, source_image=source)
    again = run(inputs(mode="img2img", strength=0.5), native, source_image=source)
    assert clipped.total_steps == 1 and torch.equal(clipped.latents, again.latents)
    assert not torch.equal(text.latents, clipped.latents) and source.tobytes() == before


def test_odd_native_latent_dimensions_pad_and_crop_to_requested_size(native: Any) -> None:
    actual = run(inputs(width=72, height=88), native)
    assert actual.image.size == (72, 88) and actual.latents.shape == (1, 16, 1, 11, 9)


@pytest.fixture(scope="module")
def production_rope_native(native: Any) -> Any:
    torch, diffusers, models, tokenizers = native
    # Real small ML widths with the production constructor's actual RoPE extent.
    transformer = diffusers.CosmosTransformer3DModel.from_config(
        {**models.transformer.config, "max_size": ANIMA_BASE_ARCHITECTURE.transformer["max_size"]}
    ).eval()
    transformer.load_state_dict(models.transformer.state_dict(), strict=True)
    assert transformer.learnable_pos_embed is None
    return torch, diffusers, replace(models, transformer=transformer), tokenizers


@pytest.mark.parametrize(
    "width,height", [(1920, 64), (1928, 64), (2048, 64), (64, 1928), (64, 2048)]
)
def test_production_rope_covers_accepted_euler_dimensions(
    production_rope_native: Any, width: int, height: int
) -> None:
    torch, _diffusers, models, _tokenizers = production_rope_native
    config = dict(models.transformer.config)
    actual = run(
        inputs(width=width, height=height, steps=1, guidanceScale=1), production_rope_native
    )
    assert actual.image.size == (width, height)
    assert actual.latents.shape == (1, 16, 1, height // 8, width // 8)
    assert bool(torch.isfinite(actual.latents).all().item())
    assert models.transformer.config == config


def test_expanded_nonlearned_rope_preserves_small_coordinates_and_pixels(
    native: Any, production_rope_native: Any
) -> None:
    torch, _diffusers, models, _tokenizers = native
    other = production_rope_native[2]
    latent = torch.zeros((1, 16, 1, 8, 8))
    assert all(
        torch.equal(a, b)
        for a, b in zip(
            models.transformer.rope(latent), other.transformer.rope(latent), strict=True
        )
    )
    first, second = run(inputs(), native), run(inputs(), production_rope_native)
    assert torch.equal(first.latents, second.latents)
    assert first.image.tobytes() == second.image.tobytes()


@pytest.mark.parametrize("dtype", ["float32", "bfloat16"])
def test_source_normalizes_f32_before_native_vae_dtype(native: Any, dtype: str) -> None:
    torch, diffusers, models, tokenizers = native
    vae = diffusers.AutoencoderKLWan(base_dim=4, z_dim=16).eval().to(dtype=getattr(torch, dtype))
    observed: list[Any] = []

    def inspect(_module: Any, args: Any) -> None:
        observed.append(args[0].detach().clone())
        raise DerivativeError("PROBE_STOP", "Observed native encoder input")

    handle = vae.encoder.register_forward_pre_hook(inspect)
    try:
        with pytest.raises(DerivativeError, match="Observed"):
            generate_anima_euler(
                inputs(mode="img2img", strength=0)["plan"],
                inputs()["positive"],
                inputs()["negative"],
                replace(models, vae=vae),
                source_image=Image.new("RGB", (64, 64), (0, 128, 255)),
                tokenizers=tokenizers,
            )
    finally:
        handle.remove()
    expected = (torch.tensor([0, 128, 255], dtype=torch.float32) / 127.5 - 1).to(
        getattr(torch, dtype)
    )
    assert observed[0][0, :, 0, 0, 0].tolist() == expected.tolist()


def test_native_decoder_inf_refuses_before_hidden_clamp_and_valid_replay(native: Any) -> None:
    torch, _diffusers, models, _tokenizers = native
    baseline = run(inputs(), native)
    hooks_before = len(models.vae.decoder._forward_hooks)

    def overflow(_module: Any, _args: Any, output: Any) -> Any:
        return torch.full_like(output, float("inf"))

    handle = models.vae.decoder.register_forward_hook(overflow)
    try:
        with pytest.raises(DerivativeError, match="raw VAE output") as error:
            run(inputs(), native)
        assert error.value.code == "GENERATION_WORKER_FAILED"
        assert len(models.vae.decoder._forward_hooks) == hooks_before + 1
    finally:
        handle.remove()
    replay = run(inputs(), native)
    assert baseline.image.tobytes() == replay.image.tobytes() and torch.equal(
        baseline.latents, replay.latents
    )


def test_native_decode_byte_policy_and_channel_denormalization(native: Any) -> None:
    torch, _diffusers, models, _tokenizers = native
    incoming: list[Any] = []

    def capture(_module: Any, args: Any) -> None:
        incoming.append(args[0].detach().clone())

    def values(_module: Any, _args: Any, output: Any) -> Any:
        pixels = torch.tensor([-1, 0, 1], dtype=output.dtype).view(1, 3, 1, 1, 1)
        return pixels.expand_as(output).contiguous()

    before = models.vae.post_quant_conv.register_forward_pre_hook(capture)
    after = models.vae.decoder.register_forward_hook(values)
    try:
        actual = run(inputs(), native)
    finally:
        before.remove()
        after.remove()
    assert actual.image.getpixel((0, 0)) == (0, 127, 255)
    mean = torch.tensor(models.vae.config.latents_mean).view(1, 16, 1, 1, 1)
    std = torch.tensor(models.vae.config.latents_std).view(1, 16, 1, 1, 1)
    assert len(set(models.vae.config.latents_mean)) > 1
    assert torch.equal(incoming[0], actual.latents * std + mean)


def test_nonopaque_source_refuses_before_any_native_work(native: Any) -> None:
    _torch, _diffusers, models, _tokenizers = native
    calls: list[str] = []
    handle = models.qwen3_encoder.register_forward_pre_hook(record(calls, "qwen"))
    try:
        with pytest.raises(DerivativeError, match="transparent"):
            run(
                inputs(mode="img2img", strength=0.5),
                native,
                source_image=Image.new("RGBA", (64, 64), (1, 2, 3, 128)),
            )
    finally:
        handle.remove()
    assert calls == []


def test_bf16_noise_and_each_euler_step_preserve_original_dtype(native: Any) -> None:
    torch, _diffusers, models, tokenizers = native
    captured_models = copy.deepcopy(models)
    for model in (
        captured_models.transformer,
        captured_models.qwen3_encoder,
        captured_models.text_conditioner,
        captured_models.vae,
    ):
        model.to(dtype=torch.bfloat16)
    observed: list[Any] = []

    def observe(_module: Any, _args: Any, kwargs: Any) -> None:
        observed.append(
            (kwargs["hidden_states"].detach().clone(), kwargs["timestep"].detach().clone())
        )

    handle = captured_models.transformer.register_forward_pre_hook(observe, with_kwargs=True)
    try:
        data = inputs(guidanceScale=1)
        result = generate_anima_euler(
            data["plan"], data["positive"], data["negative"], captured_models, tokenizers=tokenizers
        )
    finally:
        handle.remove()
    expected_noise = torch.randn((1, 16, 1, 8, 8), generator=torch.Generator().manual_seed(0)).to(
        torch.bfloat16
    )
    assert torch.equal(observed[0][0], expected_noise)
    assert [value[1].item() for value in observed] == [1, 0.75]
    assert all(value[0].dtype == value[1].dtype == torch.bfloat16 for value in observed)
    assert result.latents.dtype == torch.bfloat16 and models.transformer.dtype == torch.float32


def test_caller_edits_during_progress_cannot_change_captured_execution(native: Any) -> None:
    torch, _diffusers, _models, _tokenizers = native
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    data = inputs(mode="img2img", strength=0.5, steps=4)
    baseline = run(data, native, source_image=source)
    events: list[int] = []

    def edit(step: int, _total: int) -> None:
        events.append(step)
        source.paste((255, 255, 255), (0, 0, 64, 64))
        data["plan"]["sigmas"][:] = [999]
        data["positive"]["spans"][0]["weight"] = 999
        data["negative"]["spans"][0]["weight"] = 999

    actual = run(data, native, source_image=source, progress=edit)
    assert events == [1, 2] and data["plan"]["sigmas"] == [999]
    assert (
        torch.equal(actual.latents, baseline.latents)
        and actual.image.tobytes() == baseline.image.tobytes()
    )


@pytest.mark.parametrize("value", [float("nan"), float("inf")])
def test_nonfinite_native_flow_refuses_without_progress_or_image(native: Any, value: float) -> None:
    torch, _diffusers, models, _tokenizers = native
    progress: list[str] = []

    def invalid_flow(_module: Any, _args: Any, output: Any) -> Any:
        output.sample.fill_(value)
        return output

    def report(_step: int, _total: int) -> None:
        progress.append("step")

    handle = models.transformer.register_forward_hook(invalid_flow)
    try:
        with pytest.raises(DerivativeError, match="flow prediction") as error:
            run(inputs(), native, progress=report)
        assert error.value.code == "GENERATION_WORKER_FAILED" and progress == []
    finally:
        handle.remove()
    assert bool(torch.isfinite(run(inputs(), native).latents).all().item())
