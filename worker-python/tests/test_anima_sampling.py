"""Actual TS sampling plans and native flow solvers; no queue or tensor substitutes."""

from __future__ import annotations

import copy
import json
import math
import subprocess
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from imagegen_worker.anima_conditioning import encode_anima_conditioning_pair
from imagegen_worker.anima_lora import scoped_anima_generation_loras
from imagegen_worker.anima_sampling import generate_anima_sampling, validate_anima_sampling_plan
from imagegen_worker.derivatives import DerivativeError
from test_anima_euler import native as euler_native
from test_anima_lora import clean_native_loras as _clean
from test_anima_lora import create_native_lora_file as _file
from test_anima_lora import native_lora_state as _state
from test_anima_lora import snapshot_native_models as _snapshot

native = euler_native
_SCHEDULERS = ("euler", "heun", "dpmpp_2m")


@lru_cache(maxsize=64)
def _ts_json(source: str) -> str:
    root = Path(__file__).resolve().parents[2]
    executable = root / "node_modules/.bin/tsx"
    if not executable.exists():
        pytest.skip("Cross-language sampling check requires repository pnpm dependencies.")
    program = (
        "import {compileAnimaSamplingPlan as plan} "
        "from './src/shared/projects/anima-sampling-plan.ts'; "
        "import {compileAnimaPromptWeighting as prompt} "
        "from './src/shared/projects/anima-prompt-weighting.ts'; "
        "const x=" + source + ";process.stdout.write(JSON.stringify({"
        "plan:plan(x.plan),positive:prompt(x.positive),negative:prompt(x.negative)}))"
    )
    return subprocess.check_output([str(executable), "-e", program], cwd=root, text=True)


def inputs(**changes: Any) -> dict[str, Any]:
    positive = changes.pop("positive", "(bright hair:2)")
    negative = changes.pop("negative", "(dark blur)--")
    value = {
        "scheduler": "heun",
        "mode": "txt2img",
        "width": 64,
        "height": 64,
        "steps": 4,
        "seed": 0,
        "guidanceScale": 4,
        "strength": None,
        **changes,
    }
    return json.loads(
        _ts_json(json.dumps({"plan": value, "positive": positive, "negative": negative}))
    )


def run(data: dict[str, Any], fixture: Any, **options: Any) -> Any:
    _torch, _diffusers, models, tokenizers = fixture
    return generate_anima_sampling(
        data["plan"], data["positive"], data["negative"], models, tokenizers=tokenizers, **options
    )


def _report(events: list[tuple[int, int]]) -> Callable[[int, int], None]:
    def callback(step: int, total: int) -> None:
        events.append((step, total))

    return callback


def _observe(calls: list[str]) -> Callable[[Any, Any], None]:
    def callback(_model: Any, _args: Any) -> None:
        calls.append("model")

    return callback


def _reference(
    data: dict[str, Any], fixture: Any, *, source: Image.Image | None = None, loras: Any = ()
) -> tuple[Any, bytes, list[tuple[int, int]]]:
    """Fresh public native solvers, independently derived from authored inputs only.

    Do not read the compiled sigmas, timesteps, initialSigma or evaluation counts.
    Euler uses the source fractions; Heun/DPM obtain their own full native schedule.
    The explicit cast-back and endpoint/no-denoise policies are application choices.
    """
    torch, diffusers, models, tokenizers = fixture
    plan = data["plan"]
    name, count, seed = plan["scheduler"], plan["steps"], plan["seed"]
    strength = plan["strength"]
    start = 0 if strength is None else math.floor((1 - strength) * count)
    scheduler = None
    if name == "euler":
        sigmas = [3 * (1 - i / count) / (1 + 2 * (1 - i / count)) for i in range(start, count + 1)]
        timesteps = sigmas[:-1]
    else:
        if name == "heun":
            scheduler = diffusers.FlowMatchHeunDiscreteScheduler(num_train_timesteps=1000, shift=3)
        else:
            scheduler = diffusers.DPMSolverMultistepScheduler(
                num_train_timesteps=1000,
                solver_order=2,
                algorithm_type="dpmsolver++",
                prediction_type="flow_prediction",
                use_flow_sigmas=True,
                flow_shift=3,
            )
        scheduler.set_timesteps(count, device="cpu")
        begin = 2 * start if name == "heun" else start
        scheduler.set_begin_index(begin)
        sigmas = scheduler.sigmas[begin:]
        timesteps = scheduler.timesteps[begin:]
    dtype = next(models.transformer.parameters()).dtype
    vae_dtype = next(models.vae.parameters()).dtype
    shape = (1, 16, 1, plan["height"] // 8, plan["width"] // 8)
    events: list[tuple[int, int]] = []
    with scoped_anima_generation_loras(models, loras, torch), torch.inference_mode():
        mean = torch.tensor(models.vae.config.latents_mean, dtype=vae_dtype).view(1, 16, 1, 1, 1)
        std = torch.tensor(models.vae.config.latents_std, dtype=vae_dtype).view(1, 16, 1, 1, 1)
        if source is None:
            latents = None
        else:
            pixels = torch.frombuffer(bytearray(source.convert("RGB").tobytes()), dtype=torch.uint8)
            pixels = pixels.reshape(plan["height"], plan["width"], 3).permute(2, 0, 1)
            pixels = (pixels.float().unsqueeze(0).unsqueeze(2) / 127.5 - 1).to(dtype=vae_dtype)
            posterior = models.vae.encode(pixels).latent_dist
            encoded = posterior.sample(generator=torch.Generator().manual_seed(seed ^ 0x9E3779B9))
            latents = ((encoded - mean) / std).to(dtype=dtype)
        if len(timesteps):
            noise = torch.randn(shape, generator=torch.Generator().manual_seed(seed)).to(
                dtype=dtype
            )
            initial = 1.0 if strength is None or strength == 1 else float(sigmas[0])
            latents = noise if latents is None else initial * noise + (1 - initial) * latents
            pair = encode_anima_conditioning_pair(
                data["positive"], data["negative"], models, tokenizers=tokenizers
            )
            for index, timestep in enumerate(timesteps):
                model_time = float(timestep) if name == "euler" else float(timestep) / 1000
                predicted: list[Any] = []
                for conditioning in (pair.positive, pair.negative):
                    if len(predicted) and math.isclose(plan["guidanceScale"], 1.0):
                        break
                    predicted.append(
                        models.transformer(
                            hidden_states=latents,
                            timestep=torch.tensor([model_time], dtype=dtype),
                            encoder_hidden_states=conditioning.embeddings,
                            padding_mask=torch.zeros((1, 1, *shape[-2:]), dtype=dtype),
                        ).sample.float()
                    )
                flow = (
                    predicted[0]
                    if len(predicted) == 1
                    else predicted[1] + plan["guidanceScale"] * (predicted[0] - predicted[1])
                )
                if scheduler is None:
                    latents = (latents.float() + (sigmas[index + 1] - sigmas[index]) * flow).to(
                        dtype=dtype
                    )
                else:
                    latents = scheduler.step(flow, timestep, latents).prev_sample.to(dtype=dtype)
                events.append((index + 1, len(timesteps)))
        assert latents is not None
        decoded = models.vae.decode(latents.to(dtype=vae_dtype) * std + mean).sample
        pixels = (127.5 * (decoded[0, :, 0].float().clamp(-1, 1) + 1)).to(torch.uint8)
        pixel_bytes = pixels.permute(1, 2, 0).contiguous().numpy().tobytes()
    return latents, pixel_bytes, events


@pytest.mark.parametrize(
    "field,value",
    [
        ("version", "anima-euler-denoising-v1"),
        ("scheduler", "dpmpp_2m_sde"),
        ("beginIndex", 1),
        ("startStep", 1),
        ("totalSteps", 4),
        ("initialSigma", 0.5),
        ("timesteps", [1000]),
        ("sigmas", [1, 0]),
        ("seed", True),
        ("strength", 0.5),
    ],
)
def test_real_plan_capture_refuses_inconsistent_native_selection(field: str, value: Any) -> None:
    data = inputs()["plan"]
    data[field] = value
    with pytest.raises(DerivativeError):
        validate_anima_sampling_plan(data)


@pytest.mark.parametrize("field", ("sigmas", "timesteps"))
def test_real_plan_capture_refuses_same_length_numeric_schedule_drift(field: str) -> None:
    data = inputs()["plan"]
    original_length = len(data[field])
    data[field][0] *= 0.95
    assert len(data[field]) == original_length
    with pytest.raises(DerivativeError):
        validate_anima_sampling_plan(data)


@pytest.mark.parametrize("scheduler", _SCHEDULERS)
@pytest.mark.parametrize(
    "positive,negative,cfg,mode,strength",
    [
        ("bright hair", "dark blur", 1.0, "txt2img", None),
        ("(bright hair:2)", "dark blur", 1.0, "txt2img", None),
        ("bright hair", "(dark blur)--", 4.0, "txt2img", None),
        ("(bright hair:2)", "(dark blur)--", 4.0, "img2img", 0.5),
        ("(bright hair:2)", "(dark blur)--", 4.0, "img2img", 0.75),
    ],
)
def test_actual_ts_native_sampling_matches_independent_weighted_flow_and_pixels(
    native: Any,
    scheduler: str,
    positive: str,
    negative: str,
    cfg: float,
    mode: str,
    strength: float | None,
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    source = Image.new("RGB", (64, 64), (64, 128, 255)) if mode == "img2img" else None
    data = inputs(
        scheduler=scheduler,
        positive=positive,
        negative=negative,
        guidanceScale=cfg,
        mode=mode,
        strength=strength,
    )
    expected, pixels, expected_events = _reference(data, native, source=source)
    events: list[tuple[int, int]] = []
    actual = run(data, native, source_image=source, progress=_report(events))
    torch.testing.assert_close(actual.latents, expected, rtol=1e-6, atol=1e-6)
    assert actual.image.tobytes() == pixels
    assert events == expected_events and actual.total_steps == len(expected_events)


@pytest.mark.parametrize("scheduler", _SCHEDULERS)
def test_seed_replay_strength_one_and_source_preservation(native: Any, scheduler: str) -> None:
    torch, _diffusers, _models, _tokenizers = native
    text = inputs(scheduler=scheduler)
    first = run(text, native)
    replay = run(text, native)
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    before = source.tobytes()
    image = run(
        inputs(scheduler=scheduler, mode="img2img", strength=1), native, source_image=source
    )
    assert torch.equal(first.latents, replay.latents) and torch.equal(first.latents, image.latents)
    assert first.image.tobytes() == replay.image.tobytes() == image.image.tobytes()
    assert source.tobytes() == before


@pytest.mark.parametrize("scheduler", ("heun", "dpmpp_2m"))
@pytest.mark.parametrize("cfg,passes", [(1.0, 1), (1.0000000005, 1), (4.0, 2)])
def test_actual_native_cfg_pass_count_and_negative_prompt_neighbor(
    native: Any, scheduler: str, cfg: float, passes: int
) -> None:
    torch, _diffusers, models, _tokenizers = native
    calls: list[str] = []
    handle = models.transformer.register_forward_pre_hook(_observe(calls))
    try:
        first = run(inputs(scheduler=scheduler, guidanceScale=cfg), native)
        assert len(calls) == (7 if scheduler == "heun" else 4) * passes
        calls.clear()
        second = run(inputs(scheduler=scheduler, guidanceScale=cfg, negative="(fog:2)"), native)
        assert len(calls) == (7 if scheduler == "heun" else 4) * passes
    finally:
        handle.remove()
    assert torch.equal(first.latents, second.latents) == (passes == 1)


@pytest.mark.parametrize("scheduler", _SCHEDULERS)
def test_strength_zero_has_only_native_vae_reconstruction_and_no_progress(
    native: Any, scheduler: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    data = inputs(scheduler=scheduler, mode="img2img", strength=0)
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    expected, pixels, _events = _reference(data, native, source=source)
    calls: list[str] = []
    handles = [
        model.register_forward_pre_hook(_observe(calls))
        for model in (models.transformer, models.qwen3_encoder, models.text_conditioner)
    ]

    def report(_step: int, _total: int) -> None:
        calls.append("progress")

    try:
        actual = run(
            data,
            native,
            source_image=source,
            progress=report,
        )
    finally:
        for handle in handles:
            handle.remove()
    assert calls == [] and actual.total_steps == 0
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels


@pytest.mark.parametrize("scheduler", ("heun", "dpmpp_2m"))
def test_signed_three_component_loras_precede_both_weighted_prompt_encodings(
    native: Any, tmp_path: Path, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    state = {
        key: value
        for component in ("transformer", "text_conditioner", "qwen3_encoder")
        for key, value in _state(native, component).items()
    }
    lora = _file(tmp_path, native, state, weight=-0.5)
    data = inputs(scheduler=scheduler)
    before = _snapshot(native)
    baseline = run(data, native)
    expected, pixels, _events = _reference(data, native, loras=(lora,))
    actual = run(data, native, loras=(lora,))
    torch.testing.assert_close(actual.latents, expected, rtol=1e-6, atol=1e-6)
    assert actual.image.tobytes() == pixels and not torch.equal(actual.latents, baseline.latents)
    _clean(native, before)
    assert torch.equal(run(data, native).latents, baseline.latents)


@pytest.mark.parametrize("scheduler", ("heun", "dpmpp_2m"))
def test_callback_failure_discards_native_history_and_restores_all_loras(
    native: Any, tmp_path: Path, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    state = {
        key: value
        for component in ("transformer", "text_conditioner", "qwen3_encoder")
        for key, value in _state(native, component).items()
    }
    lora = _file(tmp_path, native, state, weight=-0.5)
    data = inputs(scheduler=scheduler)
    before = _snapshot(native)
    expected, pixels, _events = _reference(data, native, loras=(lora,))

    def fail(_step: int, _total: int) -> None:
        raise RuntimeError("caller progress failure after a real native step")

    with pytest.raises(DerivativeError):
        run(data, native, loras=(lora,), progress=fail)
    _clean(native, before)
    actual = run(data, native, loras=(lora,))
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    _clean(native, before)


@pytest.mark.parametrize("scheduler", ("heun", "dpmpp_2m"))
def test_native_f32_history_casts_each_model_input_back_to_bf16(
    native: Any, scheduler: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    components = (models.transformer, models.text_conditioner, models.qwen3_encoder)
    saved = [
        {key: value.clone() for key, value in model.state_dict().items()} for model in components
    ]
    inputs_seen: list[Any] = []

    def observe_input(_model: Any, _args: Any, kwargs: dict[str, Any]) -> None:
        inputs_seen.append(kwargs["hidden_states"].dtype)

    handle = models.transformer.register_forward_pre_hook(observe_input, with_kwargs=True)
    try:
        for model in components:
            model.to(dtype=torch.bfloat16)
        data = inputs(scheduler=scheduler)
        expected, pixels, _events = _reference(data, native)
        inputs_seen.clear()
        actual = run(data, native)
        assert inputs_seen and set(inputs_seen) == {torch.bfloat16}
        assert actual.latents.dtype == torch.bfloat16
        assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    finally:
        handle.remove()
        for model, state in zip(components, saved, strict=True):
            model.to(dtype=torch.float32)
            model.load_state_dict(state, strict=True)


@pytest.mark.parametrize("scheduler", ("heun", "dpmpp_2m"))
@pytest.mark.parametrize("field", ("sigmas", "timesteps"))
def test_real_native_schedule_drift_refuses_before_any_conditioning(
    native: Any, monkeypatch: pytest.MonkeyPatch, scheduler: str, field: str
) -> None:
    _torch, diffusers, models, _tokenizers = native
    klass = (
        diffusers.FlowMatchHeunDiscreteScheduler
        if scheduler == "heun"
        else diffusers.DPMSolverMultistepScheduler
    )
    original = klass.set_timesteps
    calls: list[str] = []
    observed_changes: list[tuple[float, float]] = []

    def drift(self: Any, *args: Any, **kwargs: Any) -> None:
        original(self, *args, **kwargs)
        values = getattr(self, field)
        before = float(values[0])
        values[0] = before * 0.95
        observed_changes.append((before, float(values[0])))

    monkeypatch.setattr(klass, "set_timesteps", drift)
    handles = [
        model.register_forward_pre_hook(_observe(calls))
        for model in (models.qwen3_encoder, models.text_conditioner, models.transformer)
    ]
    try:
        with pytest.raises(DerivativeError):
            run(inputs(scheduler=scheduler), native)
    finally:
        for handle in handles:
            handle.remove()
    assert calls == []
    assert len(observed_changes) == 1 and observed_changes[0][0] != observed_changes[0][1]


@pytest.mark.parametrize("scheduler", ("heun", "dpmpp_2m"))
def test_caller_edits_cannot_change_captured_schedule_prompts_or_source(
    native: Any, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    data = inputs(scheduler=scheduler, mode="img2img", strength=0.5)
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    baseline = run(copy.deepcopy(data), native, source_image=source)
    events: list[tuple[int, int]] = []

    def edit(step: int, total: int) -> None:
        events.append((step, total))
        data["plan"]["scheduler"] = "euler"
        data["plan"]["sigmas"][:] = [999]
        data["plan"]["timesteps"][:] = [999]
        data["positive"]["spans"][0]["weight"] = 999
        data["negative"]["spans"][0]["weight"] = 999
        source.paste((255, 255, 255), (0, 0, 64, 64))

    actual = run(data, native, source_image=source, progress=edit)
    assert len(events) == (3 if scheduler == "heun" else 2)
    assert (
        torch.equal(actual.latents, baseline.latents)
        and actual.image.tobytes() == baseline.image.tobytes()
    )


@pytest.mark.parametrize("scheduler", ("heun", "dpmpp_2m"))
def test_actual_nonfinite_flow_refuses_without_progress_and_replays_after_removal(
    native: Any, scheduler: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    events: list[tuple[int, int]] = []

    def corrupt(_module: Any, _args: Any, output: Any) -> Any:
        output.sample.fill_(float("inf"))
        return output

    handle = models.transformer.register_forward_hook(corrupt)
    try:
        with pytest.raises(DerivativeError):
            run(
                inputs(scheduler=scheduler),
                native,
                progress=_report(events),
            )
    finally:
        handle.remove()
    assert events == []
    assert bool(torch.isfinite(run(inputs(scheduler=scheduler), native).latents).all())
