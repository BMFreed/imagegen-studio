"""Native six-method masked execution against the pinned external Anima oracle."""

from __future__ import annotations

import ast
import hashlib
import math
import os
from collections.abc import Callable, Generator
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

import test_anima_flow_sampling
from imagegen_worker import anima_outpaint
from imagegen_worker.anima_conditioning import AnimaConditioningPair, encode_anima_conditioning_pair
from imagegen_worker.anima_euler import AnimaDenoiser, execute_captured_anima_plan
from imagegen_worker.anima_flow_sampling import (
    generate_anima_flow_sampling,
    validate_anima_flow_sampling_plan,
)
from imagegen_worker.anima_lora import scoped_anima_generation_loras
from imagegen_worker.anima_outpaint import generate_anima_outpaint
from imagegen_worker.anima_sampling import create_anima_native_denoiser
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from test_anima_euler import native as euler_native
from test_anima_flow_sampling import inputs
from test_anima_lora import clean_native_loras as _clean
from test_anima_lora import create_native_lora_file as _file
from test_anima_lora import native_lora_state as _state
from test_anima_lora import snapshot_native_models as _snapshot

native_base = euler_native
_actual_scheduler_class = cast(Any, test_anima_flow_sampling)._actual_scheduler_class
_independent_er_class = cast(Any, test_anima_flow_sampling)._independent_er_class
SCHEDULERS = ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
_SOURCES = {
    "invokeai/backend/rectified_flow/rectified_flow_inpaint_extension.py": (
        "a7a77d7ac6433b5ad930716bf21852a97a81960688e8670a8120e8d26f94e721",
        {"assert_broadcastable", "RectifiedFlowInpaintExtension"},
    ),
    "invokeai/app/invocations/anima_denoise.py": (
        "cb92470f4b329677b303fe02ab189dd1d16b6400261fdb61042f789620b37c08",
        {"inverse_loglinear_timestep_shift", "AnimaInpaintExtension"},
    ),
}


@pytest.fixture(scope="module")
def native(native_base: Any) -> Generator[Any]:
    torch = native_base[0]
    previous = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        yield native_base
    finally:
        torch.set_num_threads(previous)


@lru_cache(maxsize=1)
def _invoke_mask_class() -> Any:
    """Execute external numerical methods, never a worker-shaped mock oracle."""
    import torch

    root = Path(os.environ.get("IGS_INVOKE_SOURCE_ROOT", "/home/user/Work/sources/InvokeAI"))
    nodes: list[ast.stmt] = []
    for relative, (digest, names) in _SOURCES.items():
        path = root / relative
        if not path.is_file():
            pytest.skip("Masked oracle requires the pinned local Invoke source checkout.")
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest
        selected = [
            node
            for node in ast.parse(path.read_text()).body
            if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names
        ]
        assert {node.name for node in selected} == names
        nodes.extend(selected)
    namespace: dict[str, Any] = {"torch": torch, "ANIMA_SHIFT": 3.0}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "pinned-invoke-mask", "exec"), namespace)
    return namespace["AnimaInpaintExtension"]


def _mask(width: int = 64, height: int = 64) -> Image.Image:
    mask = Image.new("L", (width // 8, height // 8), 0)
    for column, value in enumerate((255, 254, 192, 128, 64, 1)):
        mask.paste(value, (column, 0, column + 1, height // 8))
    return mask


def _source(width: int = 64, height: int = 64) -> Image.Image:
    image = Image.frombytes(
        "RGB",
        (width, height),
        bytes((index * 19 + index // width) % 256 for index in range(width * height * 3)),
    )
    image.info["icc_profile"] = SRGB_ICC_PROFILE
    return image


def _run(
    data: dict[str, Any], native: Any, *, source: Image.Image, mask: Image.Image, **kwargs: Any
) -> Any:
    return generate_anima_outpaint(
        data["plan"],
        data["positive"],
        data["negative"],
        native[2],
        source_image=source,
        keep_mask=mask,
        tokenizers=native[3],
        **kwargs,
    )


def _ordinary(data: dict[str, Any], native: Any, source: Image.Image) -> Any:
    return generate_anima_flow_sampling(
        data["plan"],
        data["positive"],
        data["negative"],
        native[2],
        source_image=source,
        tokenizers=native[3],
    )


def _fresh_schedule(
    data: dict[str, Any], native: Any, *, er_order: int = 3, dpm_order: int = 2
) -> tuple[Any, list[float], Any, int]:
    """Derive fresh actual native schedules from authored steps/strength only."""
    _torch, diffusers, _models, _tokenizers = native
    authored = data["plan"]
    name, steps = authored["scheduler"], authored["steps"]
    start = math.floor((1 - authored["strength"]) * steps)
    if start == steps:
        return None, [0.0], [], 0
    if name == "euler":
        sigmas = [3 * (1 - i / steps) / (1 + 2 * (1 - i / steps)) for i in range(start, steps + 1)]
        return None, sigmas, sigmas[:-1], start
    if name == "heun":
        scheduler = diffusers.FlowMatchHeunDiscreteScheduler(num_train_timesteps=1000, shift=3)
    elif name in ("dpmpp_2m", "dpmpp_2m_sde"):
        scheduler = diffusers.DPMSolverMultistepScheduler(
            num_train_timesteps=1000,
            prediction_type="flow_prediction",
            use_flow_sigmas=True,
            flow_shift=3,
            solver_order=dpm_order,
            algorithm_type="sde-dpmsolver++" if name.endswith("sde") else "dpmsolver++",
            solver_type="midpoint",
            lower_order_final=True,
            final_sigmas_type="zero",
        )
    elif name == "er_sde":
        scheduler = _independent_er_class()(
            num_train_timesteps=1000,
            prediction_type="flow_prediction",
            use_flow_sigmas=True,
            flow_shift=3,
            solver_order=er_order,
            stochastic=True,
        )
    else:
        scheduler = diffusers.FlowMatchLCMScheduler(num_train_timesteps=1000, shift=1)
    if name in ("er_sde", "lcm"):
        grid = [3 * (1 - i / steps) / (1 + 2 * (1 - i / steps)) for i in range(steps + 1)]
        scheduler.set_timesteps(sigmas=grid if name == "er_sde" else grid[:-1], device="cpu")
    else:
        scheduler.set_timesteps(steps, device="cpu")
    begin = start * 2 if name == "heun" else start
    scheduler.set_begin_index(begin)
    return scheduler, scheduler.sigmas[begin:].tolist(), scheduler.timesteps[begin:], begin


def _reference(
    data: dict[str, Any],
    native: Any,
    *,
    source: Image.Image,
    mask: Image.Image,
    loras: Any = (),
    er_order: int = 3,
    dpm_order: int = 2,
    restart_step_rng: bool = False,
) -> tuple[Any, bytes, list[Any], list[Any]]:
    torch, _diffusers, models, tokenizers = native
    authored = data["plan"]
    scheduler, sigmas, timesteps, _begin = _fresh_schedule(
        data, native, er_order=er_order, dpm_order=dpm_order
    )
    name, width, height, seed = (
        authored["scheduler"],
        authored["width"],
        authored["height"],
        authored["seed"],
    )
    dtype, vae_dtype = (
        next(models.transformer.parameters()).dtype,
        next(models.vae.parameters()).dtype,
    )
    shape = (1, 16, 1, height // 8, width // 8)
    predictions: list[Any] = []
    samples: list[Any] = []
    with scoped_anima_generation_loras(models, loras, torch), torch.inference_mode():
        mean = torch.tensor(models.vae.config.latents_mean, dtype=vae_dtype).view(1, 16, 1, 1, 1)
        std = torch.tensor(models.vae.config.latents_std, dtype=vae_dtype).view(1, 16, 1, 1, 1)
        pixels = torch.frombuffer(bytearray(source.tobytes()), dtype=torch.uint8)
        pixels = pixels.reshape(height, width, 3).permute(2, 0, 1)
        pixels = (pixels.float().unsqueeze(0).unsqueeze(2) / 127.5 - 1).to(dtype=vae_dtype)
        posterior = models.vae.encode(pixels).latent_dist
        encoded = posterior.sample(generator=torch.Generator().manual_seed(seed ^ 0x9E3779B9))
        original = ((encoded - mean) / std).to(dtype=dtype)
        latents = original
        if len(timesteps):
            noise = torch.randn(shape, generator=torch.Generator().manual_seed(seed)).to(
                dtype=dtype
            )
            initial = 1.0 if authored["strength"] == 1 else sigmas[0]
            latents = initial * noise + (1 - initial) * original
            keep = torch.frombuffer(bytearray(mask.tobytes()), dtype=torch.uint8)
            keep = keep.reshape(1, 1, 1, height // 8, width // 8).float() / 255
            extension = _invoke_mask_class()(
                original.clone(), (1 - keep).to(dtype=dtype), noise.clone()
            )
            pair = encode_anima_conditioning_pair(
                data["positive"], data["negative"], models, tokenizers=tokenizers
            )
            step_generator = torch.Generator().manual_seed(seed)
            for index, timestep in enumerate(timesteps):
                current = float(timestep) if name == "euler" else float(timestep) / 1000
                padded = torch.nn.functional.pad(latents, (0, shape[-1] % 2, 0, shape[-2] % 2))
                predictions.append(padded.clone())
                predicted: list[Any] = []
                for condition in (pair.positive, pair.negative):
                    if predicted and math.isclose(authored["guidanceScale"], 1.0):
                        break
                    predicted.append(
                        models.transformer(
                            hidden_states=padded,
                            timestep=torch.tensor([current], dtype=dtype),
                            encoder_hidden_states=condition.embeddings,
                            padding_mask=torch.zeros((1, 1, *padded.shape[-2:]), dtype=dtype),
                        )
                        .sample[..., : shape[-2], : shape[-1]]
                        .float()
                    )
                flow = (
                    predicted[0]
                    if len(predicted) == 1
                    else predicted[1] + authored["guidanceScale"] * (predicted[0] - predicted[1])
                )
                samples.append(latents.clone())
                following = sigmas[index + 1]
                complete = True
                if scheduler is None:
                    latents = (latents.float() + (following - current) * flow).to(dtype=dtype)
                else:
                    if name == "heun":
                        complete = not scheduler.state_in_first_order or following == 0
                    if restart_step_rng:
                        step_generator.manual_seed(seed)
                    latents = scheduler.step(
                        flow, timestep, latents, generator=step_generator
                    ).prev_sample.to(dtype=dtype)
                if complete:
                    latents = extension.merge_intermediate_latents_with_init_latents(
                        latents, following
                    )
        decoded = models.vae.decode(latents.to(dtype=vae_dtype) * std + mean).sample
        pixels = (127.5 * (decoded[0, :, 0].float().clamp(-1, 1) + 1)).to(torch.uint8)
        output = pixels.permute(1, 2, 0).contiguous().numpy().tobytes()
    return latents, output, predictions, samples


def _report(events: list[tuple[int, int]]) -> Callable[[int, int], None]:
    def callback(step: int, total: int) -> None:
        events.append((step, total))

    return callback


@pytest.mark.parametrize("scheduler", SCHEDULERS)
@pytest.mark.parametrize("strength", (0.0, 0.2, 0.5, 0.75, 1.0))
def test_native_masked_loop_matches_external_oracle_model_inputs_scheduler_samples_and_pixels(
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    scheduler: str,
    strength: float,
) -> None:
    torch, _diffusers, models, _tokenizers = native
    data = inputs(scheduler=scheduler, mode="img2img", strength=strength)
    source, mask = _source(), _mask()
    expected, pixels, expected_predictions, expected_samples = _reference(
        data, native, source=source, mask=mask
    )
    predictions: list[Any] = []
    samples: list[Any] = []

    def observe(_model: Any, _args: Any, kwargs: Any) -> None:
        predictions.append(kwargs["hidden_states"].detach().clone())

    handle = models.transformer.register_forward_pre_hook(observe, with_kwargs=True)
    if scheduler != "euler":
        klass = _actual_scheduler_class(native, scheduler)
        if scheduler == "heun":
            klass = native[1].FlowMatchHeunDiscreteScheduler
        original_step = klass.step

        def step(self: Any, *args: Any, **kwargs: Any) -> Any:
            samples.append(kwargs["sample"].detach().clone())
            return original_step(self, *args, **kwargs)

        monkeypatch.setattr(klass, "step", step)
    events: list[tuple[int, int]] = []
    try:
        actual = _run(data, native, source=source, mask=mask, progress=_report(events))
    finally:
        handle.remove()
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    assert len(predictions) == 2 * len(expected_predictions)
    for index, prediction in enumerate(expected_predictions):
        assert torch.equal(predictions[2 * index], prediction)
        assert torch.equal(predictions[2 * index + 1], prediction)
    if scheduler != "euler":
        assert len(samples) == len(expected_samples)
        assert all(torch.equal(a, b) for a, b in zip(samples, expected_samples, strict=True))
    assert events == [(i + 1, len(expected_predictions)) for i in range(len(expected_predictions))]
    assert actual.total_steps == len(expected_predictions)


@pytest.mark.parametrize("scheduler", ("dpmpp_2m_sde", "er_sde", "lcm"))
@pytest.mark.parametrize("strength", (0.5, 0.75), ids=("neighbor", "sensitive"))
def test_clipped_masked_history_and_step_noise_match_external_reference(
    native: Any, scheduler: str, strength: float
) -> None:
    """Actual image-mode loop versus fresh solvers and pinned external mask math."""
    torch = native[0]
    steps = 5 if scheduler == "er_sde" else 4
    data = inputs(scheduler=scheduler, steps=steps, mode="img2img", strength=strength, seed=0)
    source, mask = _source(), _mask()
    source_bytes, mask_bytes = source.tobytes(), mask.tobytes()
    expected, pixels, predictions, _samples = _reference(data, native, source=source, mask=mask)
    lower_policy: dict[str, Any] = (
        {"er_order": 2}
        if scheduler == "er_sde"
        else {"dpm_order": 1}
        if scheduler == "dpmpp_2m_sde"
        else {"restart_step_rng": True}
    )
    lower, _lower_pixels, _predictions, _samples = _reference(
        data, native, source=source, mask=mask, **lower_policy
    )
    assert torch.equal(expected, lower) == (strength == 0.5)
    events: list[tuple[int, int]] = []
    actual = _run(data, native, source=source, mask=mask, progress=_report(events))
    assert torch.isfinite(actual.latents).all()
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    total = (
        (3 if strength == 0.5 else 4) if scheduler == "er_sde" else (2 if strength == 0.5 else 3)
    )
    assert actual.total_steps == len(predictions) == total
    assert events == [(index + 1, total) for index in range(total)]
    assert source.tobytes() == source_bytes and mask.tobytes() == mask_bytes


@pytest.mark.parametrize("scheduler", SCHEDULERS)
def test_black_mask_is_ordinary_white_mask_is_zero_vae_replay_and_input_capture(
    native: Any,
    scheduler: str,
) -> None:
    torch = native[0]
    data = inputs(scheduler=scheduler, mode="img2img", strength=0.75)
    source, mask = _source(), _mask()
    before_source, before_mask = source.tobytes(), mask.tobytes()
    baseline = _run(data, native, source=source, mask=mask)
    replay = _run(data, native, source=source, mask=mask)
    changed_seed = _run(
        inputs(scheduler=scheduler, mode="img2img", strength=0.75, seed=17),
        native,
        source=source,
        mask=mask,
    )
    ordinary = _ordinary(data, native, source)
    black = _run(data, native, source=source, mask=Image.new("L", (8, 8), 0))
    white = _run(data, native, source=source, mask=Image.new("L", (8, 8), 255))
    zero = _ordinary(inputs(scheduler=scheduler, mode="img2img", strength=0), native, source)
    assert (
        torch.equal(baseline.latents, replay.latents)
        and baseline.image.tobytes() == replay.image.tobytes()
    )
    assert not torch.equal(baseline.latents, changed_seed.latents)
    assert not torch.equal(baseline.latents, ordinary.latents)
    assert (
        torch.equal(black.latents, ordinary.latents)
        and black.image.tobytes() == ordinary.image.tobytes()
    )
    assert (
        torch.equal(white.latents, zero.latents) and white.image.tobytes() == zero.image.tobytes()
    )
    assert source.tobytes() == before_source and mask.tobytes() == before_mask

    def mutate_caller(_step: int, _total: int) -> None:
        source.paste((255, 0, 0), (0, 0, 64, 64))
        mask.paste(0, (0, 0, 8, 8))

    captured = _run(data, native, source=source, mask=mask, progress=mutate_caller)
    assert (
        torch.equal(captured.latents, baseline.latents)
        and captured.image.tobytes() == baseline.image.tobytes()
    )


@pytest.mark.parametrize("scheduler", SCHEDULERS)
def test_cfg_weighting_signed_lora_and_failure_restore(
    native: Any, tmp_path: Path, scheduler: str
) -> None:
    torch = native[0]
    data = inputs(scheduler=scheduler, mode="img2img", strength=0.75)
    source, mask = _source(), _mask()
    baseline = _run(data, native, source=source, mask=mask)
    for changes in ({"positive": "bright hair"}, {"negative": "dark blur"}, {"guidanceScale": 1}):
        neighbor = _run(
            inputs(scheduler=scheduler, mode="img2img", strength=0.75, **changes),
            native,
            source=source,
            mask=mask,
        )
        assert not torch.equal(baseline.latents, neighbor.latents)
    lora_state = {
        key: value
        for name in ("transformer", "text_conditioner", "qwen3_encoder")
        for key, value in _state(native, name).items()
    }
    lora = _file(tmp_path, native, lora_state, weight=-0.5)
    models_before = _snapshot(native)
    rng = torch.random.get_rng_state().clone()
    expected, pixels, _predictions, _samples = _reference(
        data, native, source=source, mask=mask, loras=(lora,)
    )
    actual = _run(data, native, source=source, mask=mask, loras=(lora,))
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    assert not torch.equal(actual.latents, baseline.latents)
    _clean(native, models_before)
    zero_lora = _run(data, native, source=source, mask=mask, loras=(replace(lora, weight=0.0),))
    assert torch.equal(zero_lora.latents, baseline.latents)

    def cancel(_step: int, _total: int) -> None:
        raise RuntimeError("cancelled")

    with pytest.raises(DerivativeError) as error:
        _run(data, native, source=source, mask=mask, loras=(lora,), progress=cancel)
    assert error.value.code == "GENERATION_WORKER_FAILED"
    _clean(native, models_before)
    restored = _run(data, native, source=source, mask=mask)
    assert (
        torch.equal(restored.latents, baseline.latents)
        and restored.image.tobytes() == baseline.image.tobytes()
    )
    assert torch.equal(rng, torch.random.get_rng_state())


@pytest.mark.parametrize(
    "change",
    (
        "txt2img",
        "source-mode",
        "source-size",
        "source-profile",
        "mask-mode",
        "mask-size",
        "no-mask",
        "bad-plan",
    ),
)
def test_invalid_inputs_refuse_before_native_model_work(native: Any, change: str) -> None:
    data = inputs(mode="img2img", strength=0.75)
    source, mask = _source(), _mask()
    if change == "txt2img":
        data = inputs()
    elif change == "source-mode":
        source = source.convert("RGBA")
    elif change == "source-size":
        source = Image.new("RGB", (72, 64))
    elif change == "source-profile":
        source.info["icc_profile"] = b"other"
    elif change == "mask-mode":
        mask = mask.convert("RGB")
    elif change == "mask-size":
        mask = Image.new("L", (64, 64))
    elif change == "no-mask":
        mask = cast(Any, None)
    else:
        data["plan"]["sigmas"][0] *= 0.9
    calls: list[str] = []

    def observe(_model: Any, _args: Any) -> None:
        calls.append("model")

    handles = [
        model.register_forward_pre_hook(observe)
        for model in (native[2].transformer, native[2].vae.encoder, native[2].qwen3_encoder)
    ]
    try:
        with pytest.raises(DerivativeError) as error:
            _run(data, native, source=source, mask=mask)
    finally:
        for handle in handles:
            handle.remove()
    assert error.value.code == "INVALID_REQUEST" and calls == []


def test_bfloat16_epsilon_threshold_preserves_upstream_scalar_rounding_and_merge_order(
    native: Any,
) -> None:
    torch = native[0]
    shape = (1, 16, 1, 2, 2)
    original = torch.full(shape, 2.0, dtype=torch.bfloat16)
    noise = torch.full(shape, 5.0, dtype=torch.bfloat16)
    candidate = torch.full(shape, 9.0, dtype=torch.bfloat16)
    generate = torch.full((1, 1, 1, 2, 2), 0.5, dtype=torch.bfloat16)
    state = cast(Any, anima_outpaint)._AnimaOutpaintState(torch, original, noise, generate)
    oracle = _invoke_mask_class()(original, generate, noise)
    actual = state.merge(candidate, 0.75, True)
    expected = oracle.merge_intermediate_latents_with_init_latents(candidate, 0.75)
    assert torch.equal(actual, expected) and torch.equal(actual, candidate)
    wrong_mask = (generate > 0.5).to(dtype=generate.dtype)
    wrong = candidate * wrong_mask + (noise * 0.75 + 0.25 * original) * (1 - wrong_mask)
    assert not torch.equal(actual, wrong)
    assert state.merge(candidate, 0.75, False) is candidate


def test_real_request_factory_inverts_float32_before_bfloat16_cast(
    native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Observe the actual request collaborator; this is the mask-capture boundary.

    Full native loop tests above remain the denoising evidence. Here the executor
    spy supplies genuine BF16 tensors to the production factory so a cast-order
    mutation cannot hide behind the F32 native CPU fixture.
    """
    torch = native[0]
    original = torch.ones((1, 16, 1, 8, 8), dtype=torch.bfloat16)
    noise = torch.full_like(original, 3.0)
    mask = Image.new("L", (8, 8), 254)
    captured: list[Any] = []

    def observe_factory(*_args: Any, **kwargs: Any) -> Any:
        transform = kwargs["latent_transform_factory"](torch, original, noise)
        captured.append(transform.__self__)
        return None

    monkeypatch.setattr(anima_outpaint, "execute_captured_anima_plan", observe_factory)
    _run(inputs(mode="img2img", strength=0.75), native, source=_source(), mask=mask)
    assert len(captured) == 1
    state = captured[0]
    # The expected preparation is taken from the external Invoke invocation,
    # including its real resize and invert-before-placement ordering.
    path = (
        Path(os.environ.get("IGS_INVOKE_SOURCE_ROOT", "/home/user/Work/sources/InvokeAI"))
        / "invokeai/app/invocations/anima_denoise.py"
    )
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest()
        == _SOURCES["invokeai/app/invocations/anima_denoise.py"][0]
    )
    klass = next(
        node
        for node in ast.parse(path.read_text()).body
        if isinstance(node, ast.ClassDef) and node.name == "AnimaDenoiseInvocation"
    )
    method = next(
        node
        for node in klass.body
        if isinstance(node, ast.FunctionDef) and node.name == "_prep_inpaint_mask"
    )
    # Strip only invocation-graph type annotations; the numerical method remains
    # external code, with its actual torchvision resize.
    for arg in method.args.args:
        arg.annotation = None
    method.returns = None
    from types import SimpleNamespace

    import torchvision.transforms as tv_transforms
    from torchvision.transforms.functional import resize

    namespace: dict[str, Any] = {"tv_resize": resize, "tv_transforms": tv_transforms}
    exec(
        compile(ast.Module(body=[method], type_ignores=[]), "pinned-invoke-prep", "exec"), namespace
    )
    keep = (
        torch.frombuffer(bytearray(mask.tobytes()), dtype=torch.uint8).reshape(1, 1, 8, 8).float()
        / 255
    )
    owner = SimpleNamespace(denoise_mask=SimpleNamespace(mask_name="captured"))

    def load(_name: str) -> Any:
        return keep

    context = SimpleNamespace(tensors=SimpleNamespace(load=load))
    expected = namespace["_prep_inpaint_mask"](owner, context, original.squeeze(2)).unsqueeze(2)
    assert torch.equal(state.generate_mask, expected)
    wrong = 1.0 - keep.to(dtype=torch.bfloat16).unsqueeze(2)
    assert not torch.equal(state.generate_mask, wrong)
    original.zero_()
    noise.zero_()
    assert bool((state.original == 1).all().item()) and bool((state.noise == 3).all().item())


def test_odd_latent_dimensions_keep_native_padding_and_exact_output(native: Any) -> None:
    data = inputs(scheduler="heun", mode="img2img", strength=0.75, width=72, height=88)
    source, mask = _source(72, 88), _mask(72, 88)
    expected, pixels, _predictions, _samples = _reference(data, native, source=source, mask=mask)
    actual = _run(data, native, source=source, mask=mask)
    assert native[0].equal(actual.latents, expected) and actual.image.tobytes() == pixels
    assert actual.image.size == (72, 88)


def test_ordinary_executor_preserves_typed_five_argument_denoiser_factory(native: Any) -> None:
    data = inputs(scheduler="heun", mode="img2img", strength=0.75)
    captured = validate_anima_flow_sampling_plan(data["plan"])
    source = _source()
    expected = _ordinary(data, native, source)
    calls: list[str] = []

    def factory(torch: Any, device: Any) -> AnimaDenoiser:
        denoise = create_anima_native_denoiser(captured, torch, device)

        def old_denoiser(
            transformer: Any,
            latents: Any,
            pair: AnimaConditioningPair,
            dtype: Any,
            progress: Callable[[int, int], None] | None,
        ) -> Any:
            calls.append("five arguments")
            return denoise(transformer, latents, pair, dtype, progress)

        return old_denoiser

    actual = execute_captured_anima_plan(
        captured,
        data["positive"],
        data["negative"],
        native[2],
        source_image=source,
        tokenizers=native[3],
        denoiser_factory=factory,
        initial_sigma=captured.initial_sigma,
    )
    assert calls == ["five arguments"]
    assert native[0].equal(actual.latents, expected.latents)
    assert actual.image.tobytes() == expected.image.tobytes()


def test_request_copies_mask_before_real_native_conditioning_can_mutate_caller(native: Any) -> None:
    data = inputs(scheduler="euler", mode="img2img", strength=0.75)
    source, mask = _source(), _mask()
    baseline = _run(data, native, source=source, mask=mask)
    calls: list[str] = []

    def mutate_before_factory(_model: Any, _args: Any) -> None:
        calls.append("native Qwen conditioning")
        mask.paste(0, (0, 0, 8, 8))

    handle = native[2].qwen3_encoder.register_forward_pre_hook(mutate_before_factory)
    try:
        actual = _run(data, native, source=source, mask=mask)
    finally:
        handle.remove()
    assert calls and mask.getextrema() == (0, 0)
    assert native[0].equal(actual.latents, baseline.latents)
    assert actual.image.tobytes() == baseline.image.tobytes()
