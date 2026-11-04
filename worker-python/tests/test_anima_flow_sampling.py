"""Real TS plans and native stochastic Anima execution against independent solvers."""

from __future__ import annotations

import copy
import hashlib
import importlib
import importlib.util
import json
import math
import os
import subprocess
import sys
from collections.abc import Callable
from dataclasses import replace
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from imagegen_worker.anima_conditioning import encode_anima_conditioning_pair
from imagegen_worker.anima_flow_sampling import (
    generate_anima_flow_sampling,
    validate_anima_flow_sampling_plan,
)
from imagegen_worker.anima_lora import scoped_anima_generation_loras
from imagegen_worker.anima_sampling import generate_anima_sampling, validate_anima_sampling_plan
from imagegen_worker.derivatives import DerivativeError
from test_anima_euler import native as euler_native
from test_anima_lora import clean_native_loras as _clean
from test_anima_lora import create_native_lora_file as _file
from test_anima_lora import native_lora_state as _state
from test_anima_lora import snapshot_native_models as _snapshot

native = euler_native
_NEW_SCHEDULERS = ("dpmpp_2m_sde", "er_sde", "lcm")
_ER_SHA256 = "3c18bd6a847fcf0ecf0a6b67c37744546dc4dfbb88a0595915fe2391d437fbd7"


@lru_cache(maxsize=96)
def _ts_json(source: str) -> str:
    root = Path(__file__).resolve().parents[2]
    executable = root / "node_modules/.bin/tsx"
    if not executable.exists():
        pytest.skip("Cross-language flow sampling check requires repository pnpm dependencies.")
    program = (
        "import {compileAnimaFlowSamplingPlan as plan} "
        "from './src/shared/projects/anima-flow-sampling-plan.ts'; "
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
        "scheduler": "er_sde",
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
    return generate_anima_flow_sampling(
        data["plan"], data["positive"], data["negative"], models, tokenizers=tokenizers, **options
    )


@lru_cache(maxsize=1)
def _independent_er_class() -> Any:
    """Load pinned external Invoke bytes, never the worker's copied implementation."""
    root = Path(
        os.environ.get(
            "IGS_INVOKE_SOURCE_ROOT", str(Path(__file__).resolve().parents[3] / "sources/InvokeAI")
        )
    )
    source = root / "invokeai/backend/rectified_flow/er_sde_scheduler.py"
    if not source.is_file():
        pytest.skip("Independent ER oracle requires the pinned local Invoke source checkout.")
    assert hashlib.sha256(source.read_bytes()).hexdigest() == _ER_SHA256
    spec = importlib.util.spec_from_file_location("igs_independent_pinned_invoke_er", source)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.ERSDEScheduler


def _actual_scheduler_class(fixture: Any, name: str) -> Any:
    _torch, diffusers, _models, _tokenizers = fixture
    if name == "er_sde":
        return importlib.import_module("imagegen_worker.vendor.er_sde_scheduler").ERSDEScheduler
    if name == "lcm":
        return diffusers.FlowMatchLCMScheduler
    return diffusers.DPMSolverMultistepScheduler


def _reference(
    data: dict[str, Any],
    fixture: Any,
    *,
    source: Image.Image | None = None,
    loras: Any = (),
    er_order: int = 3,
    dpm_order: int = 2,
    restart_step_rng: bool = False,
) -> tuple[Any, bytes, list[tuple[int, int]]]:
    """Build fresh independent solvers from authored values, not compiled schedule fields."""
    torch, diffusers, models, tokenizers = fixture
    authored = data["plan"]
    name, count, seed = authored["scheduler"], authored["steps"], authored["seed"]
    strength = authored["strength"]
    start = 0 if strength is None else math.floor((1 - strength) * count)
    if name == "dpmpp_2m_sde":
        scheduler = diffusers.DPMSolverMultistepScheduler(
            num_train_timesteps=1000,
            solver_order=dpm_order,
            algorithm_type="sde-dpmsolver++",
            solver_type="midpoint",
            lower_order_final=True,
            final_sigmas_type="zero",
            prediction_type="flow_prediction",
            use_flow_sigmas=True,
            flow_shift=3,
        )
        scheduler.set_timesteps(count, device="cpu")
    else:
        full = [3 * (1 - i / count) / (1 + 2 * (1 - i / count)) for i in range(count + 1)]
        if name == "er_sde":
            scheduler = _independent_er_class()(
                num_train_timesteps=1000,
                prediction_type="flow_prediction",
                use_flow_sigmas=True,
                flow_shift=3,
                solver_order=er_order,
                stochastic=True,
            )
            scheduler.set_timesteps(sigmas=full, device="cpu")
        else:
            scheduler = diffusers.FlowMatchLCMScheduler(num_train_timesteps=1000, shift=1)
            scheduler.set_timesteps(sigmas=full[:-1], device="cpu")
    scheduler.set_begin_index(start)
    timesteps = scheduler.timesteps[start:]
    sigmas = scheduler.sigmas[start:]
    step_generator = torch.Generator(device="cpu").manual_seed(seed)
    dtype = next(models.transformer.parameters()).dtype
    vae_dtype = next(models.vae.parameters()).dtype
    shape = (1, 16, 1, authored["height"] // 8, authored["width"] // 8)
    events: list[tuple[int, int]] = []
    with scoped_anima_generation_loras(models, loras, torch), torch.inference_mode():
        mean = torch.tensor(models.vae.config.latents_mean, dtype=vae_dtype).view(1, 16, 1, 1, 1)
        std = torch.tensor(models.vae.config.latents_std, dtype=vae_dtype).view(1, 16, 1, 1, 1)
        if source is None:
            latents = None
        else:
            pixels = torch.frombuffer(bytearray(source.convert("RGB").tobytes()), dtype=torch.uint8)
            pixels = pixels.reshape(authored["height"], authored["width"], 3).permute(2, 0, 1)
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
                predicted: list[Any] = []
                for conditioning in (pair.positive, pair.negative):
                    if len(predicted) and math.isclose(authored["guidanceScale"], 1.0):
                        break
                    predicted.append(
                        models.transformer(
                            hidden_states=latents,
                            timestep=torch.tensor([float(timestep) / 1000], dtype=dtype),
                            encoder_hidden_states=conditioning.embeddings,
                            padding_mask=torch.zeros((1, 1, *shape[-2:]), dtype=dtype),
                        ).sample.float()
                    )
                flow = (
                    predicted[0]
                    if len(predicted) == 1
                    else predicted[1] + authored["guidanceScale"] * (predicted[0] - predicted[1])
                )
                if restart_step_rng:
                    step_generator.manual_seed(seed)
                latents = scheduler.step(
                    flow, timestep, latents, generator=step_generator
                ).prev_sample.to(dtype=dtype)
                events.append((index + 1, len(timesteps)))
        assert latents is not None
        decoded = models.vae.decode(latents.to(dtype=vae_dtype) * std + mean).sample
        pixels = (127.5 * (decoded[0, :, 0].float().clamp(-1, 1) + 1)).to(torch.uint8)
        pixel_bytes = pixels.permute(1, 2, 0).contiguous().numpy().tobytes()
    return latents, pixel_bytes, events


def _report(events: list[tuple[int, int]]) -> Callable[[int, int], None]:
    def callback(step: int, total: int) -> None:
        events.append((step, total))

    return callback


def _observe(calls: list[str]) -> Callable[[Any, Any], None]:
    def callback(_model: Any, _args: Any) -> None:
        calls.append("model")

    return callback


@pytest.mark.parametrize(
    "field,value",
    [
        ("version", "anima-deterministic-denoising-v1"),
        ("scheduler", "unknown"),
        ("stepSeed", 1),
        ("stepSeed", True),
        ("beginIndex", 1),
        ("totalSteps", 3),
        ("initialSigma", 0.5),
        ("extra", None),
    ],
)
def test_capture_refuses_unknown_or_inconsistent_flow_plan(field: str, value: Any) -> None:
    data = inputs()["plan"]
    data[field] = value
    with pytest.raises(DerivativeError) as error:
        validate_anima_flow_sampling_plan(data)
    assert error.value.code == "INVALID_REQUEST"


@pytest.mark.parametrize("field", ("sigmas", "timesteps"))
def test_capture_rejects_same_length_schedule_value_drift(field: str) -> None:
    data = inputs()["plan"]
    valid = validate_anima_flow_sampling_plan(data)
    before = copy.deepcopy(data[field])
    data[field][0] *= 0.95
    assert len(data[field]) == len(before) and data[field] != before
    with pytest.raises(DerivativeError):
        validate_anima_flow_sampling_plan(data)
    assert valid.total_steps == 4


def test_step_seed_is_required_and_captured_values_are_detached() -> None:
    data = inputs(seed=17)["plan"]
    captured = validate_anima_flow_sampling_plan(data)
    before = tuple(data["sigmas"])
    data["sigmas"][0] = 0
    data["timesteps"][0] = 0
    data["stepSeed"] = 0
    assert captured.sigmas == before and captured.step_seed == 17 and captured.seed == 17
    missing = inputs()["plan"]
    del missing["stepSeed"]
    with pytest.raises(DerivativeError):
        validate_anima_flow_sampling_plan(missing)


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_old_deterministic_contract_does_not_accept_new_version_or_stochastic_methods(
    scheduler: str,
) -> None:
    new = inputs(scheduler=scheduler)["plan"]
    with pytest.raises(DerivativeError):
        validate_anima_sampling_plan(new)
    old_shape = {key: value for key, value in new.items() if key != "stepSeed"}
    old_shape["version"] = "anima-deterministic-denoising-v1"
    with pytest.raises(DerivativeError):
        validate_anima_sampling_plan(old_shape)


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
@pytest.mark.parametrize(
    "steps,mode,strength,cfg,seed",
    [
        (1, "txt2img", None, 4, 0),
        (2, "txt2img", None, 4, 17),
        (4, "txt2img", None, 1, 0),
        (4, "img2img", 0.5, 4, 17),
        (5, "txt2img", None, 4, 0),
    ],
)
def test_real_compiler_and_native_pixels_match_independent_authored_value_reference(
    native: Any, scheduler: str, steps: int, mode: str, strength: float | None, cfg: int, seed: int
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    source = Image.new("RGB", (64, 64), (64, 128, 255)) if mode == "img2img" else None
    data = inputs(
        scheduler=scheduler, steps=steps, mode=mode, strength=strength, guidanceScale=cfg, seed=seed
    )
    expected, pixels, expected_events = _reference(data, native, source=source)
    events: list[tuple[int, int]] = []
    actual = run(data, native, source_image=source, progress=_report(events))
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    assert events == expected_events and actual.total_steps == len(expected_events)


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_replay_weighting_polarities_seed_zero_endpoint_and_caller_rng(
    native: Any, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    data = inputs(scheduler=scheduler, positive="bright hair", negative="dark blur")
    before = copy.deepcopy(data)
    rng = torch.random.get_rng_state().clone()
    baseline = run(data, native)
    replay = run(data, native)
    equivalent = run(
        inputs(scheduler=scheduler, positive="(bright hair:1)", negative="(dark blur:1)"), native
    )
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    source_bytes = source.tobytes()
    endpoint = run(
        inputs(
            scheduler=scheduler,
            positive="bright hair",
            negative="dark blur",
            mode="img2img",
            strength=1,
        ),
        native,
        source_image=source,
    )
    for control in (replay, equivalent, endpoint):
        assert torch.equal(baseline.latents, control.latents)
        assert baseline.image.tobytes() == control.image.tobytes()
    for control in (
        inputs(scheduler=scheduler, positive="(bright hair:2)", negative="dark blur"),
        inputs(scheduler=scheduler, positive="bright hair", negative="(dark blur)--"),
        inputs(scheduler=scheduler, positive="bright hair", negative="dark blur", seed=17),
    ):
        assert not torch.equal(baseline.latents, run(control, native).latents)
    assert data == before and source.tobytes() == source_bytes
    assert torch.equal(rng, torch.random.get_rng_state())


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_zero_strength_bypasses_scheduler_and_conditioning_but_runs_real_vae(
    native: Any, monkeypatch: pytest.MonkeyPatch, scheduler: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    data = inputs(scheduler=scheduler, mode="img2img", strength=0)
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    expected, pixels, expected_events = _reference(data, native, source=source)
    calls: list[str] = []
    klass = _actual_scheduler_class(native, scheduler)
    original = klass.set_timesteps

    def observe_schedule(self: Any, *args: Any, **kwargs: Any) -> None:
        calls.append("scheduler")
        original(self, *args, **kwargs)

    monkeypatch.setattr(klass, "set_timesteps", observe_schedule)
    handles = [
        model.register_forward_pre_hook(_observe(calls))
        for model in (models.transformer, models.qwen3_encoder, models.text_conditioner)
    ]
    events: list[tuple[int, int]] = []
    try:
        actual = run(data, native, source_image=source, progress=_report(events))
    finally:
        for handle in handles:
            handle.remove()
    assert calls == [] and events == expected_events == [] and actual.total_steps == 0
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_cfg_one_uses_single_prediction_and_other_cfg_uses_negative_neighbor(
    native: Any, scheduler: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    calls: list[str] = []
    handle = models.transformer.register_forward_pre_hook(_observe(calls))
    try:
        for cfg, expected_passes in ((1.0, 1), (1.0000000005, 1), (4.0, 2)):
            calls.clear()
            baseline = run(inputs(scheduler=scheduler, guidanceScale=cfg), native)
            assert len(calls) == 4 * expected_passes
            calls.clear()
            neighbor = run(
                inputs(scheduler=scheduler, guidanceScale=cfg, negative="(fog:2)"), native
            )
            assert len(calls) == 4 * expected_passes
            assert torch.equal(baseline.latents, neighbor.latents) == (expected_passes == 1)
    finally:
        handle.remove()


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_signed_and_zero_three_component_loras_share_conditioning_and_restore(
    native: Any, tmp_path: Path, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    state = {
        key: value
        for name in ("transformer", "text_conditioner", "qwen3_encoder")
        for key, value in _state(native, name).items()
    }
    lora = _file(tmp_path, native, state, weight=-0.5)
    data = inputs(scheduler=scheduler)
    before = _snapshot(native)
    rng = torch.random.get_rng_state().clone()
    baseline = run(data, native)
    expected, pixels, _events = _reference(data, native, loras=(lora,))
    actual = run(data, native, loras=(lora,))
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    assert not torch.equal(actual.latents, baseline.latents)
    _clean(native, before)
    zero = run(data, native, loras=(replace(lora, weight=0.0),))
    restored = run(data, native)
    for control in (zero, restored):
        assert torch.equal(control.latents, baseline.latents)
        assert control.image.tobytes() == baseline.image.tobytes()
    _clean(native, before)
    assert torch.equal(rng, torch.random.get_rng_state())


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_callback_failure_discards_native_noise_history_and_restores_adapters(
    native: Any, tmp_path: Path, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    state = {
        key: value
        for name in ("transformer", "text_conditioner", "qwen3_encoder")
        for key, value in _state(native, name).items()
    }
    lora = _file(tmp_path, native, state, weight=-0.5)
    before = _snapshot(native)
    data = inputs(scheduler=scheduler)
    expected, pixels, _events = _reference(data, native, loras=(lora,))
    rng = torch.random.get_rng_state().clone()
    events: list[tuple[int, int]] = []

    def fail(step: int, total: int) -> None:
        events.append((step, total))
        raise RuntimeError("caller callback failed after real stochastic step")

    with pytest.raises(DerivativeError):
        run(data, native, loras=(lora,), progress=fail)
    assert events == [(1, 4)]
    _clean(native, before)
    actual = run(data, native, loras=(lora,))
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    _clean(native, before)
    assert torch.equal(rng, torch.random.get_rng_state())


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_native_history_inputs_cast_back_to_bf16(native: Any, scheduler: str) -> None:
    torch, _diffusers, models, _tokenizers = native
    components = (models.transformer, models.text_conditioner, models.qwen3_encoder)
    saved = [
        {key: value.clone() for key, value in model.state_dict().items()} for model in components
    ]
    seen: list[Any] = []

    def observe(_model: Any, _args: Any, kwargs: dict[str, Any]) -> None:
        seen.append(kwargs["hidden_states"].dtype)

    handle = models.transformer.register_forward_pre_hook(observe, with_kwargs=True)
    try:
        for model in components:
            model.to(dtype=torch.bfloat16)
        data = inputs(scheduler=scheduler)
        expected, pixels, _events = _reference(data, native)
        seen.clear()
        actual = run(data, native)
        assert seen and set(seen) == {torch.bfloat16} and actual.latents.dtype == torch.bfloat16
        assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    finally:
        handle.remove()
        for model, state in zip(components, saved, strict=True):
            model.to(dtype=torch.float32)
            model.load_state_dict(state, strict=True)


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
@pytest.mark.parametrize("field", ("sigmas", "timesteps"))
def test_native_changed_schedule_refuses_before_any_prompt_encoding(
    native: Any, monkeypatch: pytest.MonkeyPatch, scheduler: str, field: str
) -> None:
    _torch, _diffusers, models, _tokenizers = native
    klass = _actual_scheduler_class(native, scheduler)
    original = klass.set_timesteps
    changes: list[tuple[float, float]] = []
    calls: list[str] = []

    def drift(self: Any, *args: Any, **kwargs: Any) -> None:
        original(self, *args, **kwargs)
        values = getattr(self, field)
        before = float(values[0])
        values[0] = before * 0.95
        changes.append((before, float(values[0])))

    monkeypatch.setattr(klass, "set_timesteps", drift)
    handles = [
        model.register_forward_pre_hook(_observe(calls))
        for model in (models.transformer, models.qwen3_encoder, models.text_conditioner)
    ]
    try:
        with pytest.raises(DerivativeError):
            run(inputs(scheduler=scheduler), native)
    finally:
        for handle in handles:
            handle.remove()
    assert calls == [] and len(changes) == 1 and changes[0][0] != changes[0][1]


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_progress_edits_cannot_change_captured_plan_prompts_or_source(
    native: Any, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    data = inputs(scheduler=scheduler, mode="img2img", strength=0.5)
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    baseline = run(copy.deepcopy(data), native, source_image=source)
    events: list[tuple[int, int]] = []

    def edit(step: int, total: int) -> None:
        events.append((step, total))
        data["plan"]["stepSeed"] = 31
        data["plan"]["scheduler"] = "unknown"
        data["plan"]["sigmas"][:] = [999]
        data["plan"]["timesteps"][:] = [999]
        data["positive"]["spans"][0]["weight"] = 999
        data["negative"]["spans"][0]["weight"] = 999
        source.paste((255, 255, 255), (0, 0, 64, 64))

    actual = run(data, native, source_image=source, progress=edit)
    assert events == [(1, 2), (2, 2)]
    assert (
        torch.equal(actual.latents, baseline.latents)
        and actual.image.tobytes() == baseline.image.tobytes()
    )


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
def test_nonfinite_native_result_fails_before_progress_and_next_request_restores(
    native: Any, monkeypatch: pytest.MonkeyPatch, scheduler: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    klass = _actual_scheduler_class(native, scheduler)
    data = inputs(scheduler=scheduler)
    baseline = run(data, native)
    original = klass.step
    events: list[tuple[int, int]] = []

    def corrupt(self: Any, *args: Any, **kwargs: Any) -> Any:
        actual = original(self, *args, **kwargs)
        actual.prev_sample.fill_(float("inf"))
        return actual

    with monkeypatch.context() as patch:
        patch.setattr(klass, "step", corrupt)
        with pytest.raises(DerivativeError):
            run(data, native, progress=_report(events))
    assert events == []
    restored = run(data, native)
    assert (
        torch.equal(baseline.latents, restored.latents)
        and baseline.image.tobytes() == restored.image.tobytes()
    )


def test_real_er_three_steps_preserves_the_exact_lower_order_neighbor(native: Any) -> None:
    torch, _diffusers, _models, _tokenizers = native
    short = inputs(scheduler="er_sde", steps=3)
    order_three, pixels, reference_events = _reference(short, native)
    order_two, lower_order_pixels, lower_order_events = _reference(short, native, er_order=2)
    assert torch.equal(order_three, order_two) and pixels == lower_order_pixels
    events: list[tuple[int, int]] = []
    actual = run(short, native, progress=_report(events))
    assert torch.equal(actual.latents, order_three) and actual.image.tobytes() == pixels
    assert events == reference_events == lower_order_events == [(1, 3), (2, 3), (3, 3)]


def test_real_er_third_order_nonterminal_correction_has_a_distinct_neighbor(native: Any) -> None:
    torch, _diffusers, _models, _tokenizers = native
    # Sigma-one history forces lower order until evaluation four. At N4 that
    # evaluation is terminal, where the higher-order correction is also skipped.
    short = inputs(scheduler="er_sde", steps=4)
    order_three, _pixels, _events = _reference(short, native)
    order_two, _pixels, _events = _reference(short, native, er_order=2)
    assert torch.equal(order_three, order_two)
    long = inputs(scheduler="er_sde", steps=5)
    order_three, pixels, _events = _reference(long, native)
    order_two, _pixels, _events = _reference(long, native, er_order=2)
    assert not torch.equal(order_three, order_two)
    actual = run(long, native)
    assert torch.equal(actual.latents, order_three) and actual.image.tobytes() == pixels


@pytest.mark.parametrize("scheduler", _NEW_SCHEDULERS)
@pytest.mark.parametrize("strength", (0.5, 0.75), ids=("neighbor", "sensitive"))
def test_clipped_image_history_and_step_noise_match_independent_native_reference(
    native: Any, scheduler: str, strength: float
) -> None:
    """A fresh clipped request retains history and continues its seeded noise stream.

    The .5 neighbor has no effective third/second-history correction or second
    nonterminal LCM draw. The .75 case exercises that numerical distinction.
    """
    torch = native[0]
    steps = 5 if scheduler == "er_sde" else 4
    source = Image.new("RGB", (64, 64), (64, 128, 255))
    source_bytes = source.tobytes()
    data = inputs(scheduler=scheduler, steps=steps, mode="img2img", strength=strength, seed=0)
    expected, pixels, expected_events = _reference(data, native, source=source)
    lower_policy: dict[str, Any] = (
        {"er_order": 2}
        if scheduler == "er_sde"
        else {"dpm_order": 1}
        if scheduler == "dpmpp_2m_sde"
        else {"restart_step_rng": True}
    )
    lower, _lower_pixels, _lower_events = _reference(data, native, source=source, **lower_policy)
    assert torch.equal(expected, lower) == (strength == 0.5)
    events: list[tuple[int, int]] = []
    actual = run(data, native, source_image=source, progress=_report(events))
    assert torch.isfinite(actual.latents).all()
    assert torch.equal(actual.latents, expected) and actual.image.tobytes() == pixels
    total = (
        (3 if strength == 0.5 else 4) if scheduler == "er_sde" else (2 if strength == 0.5 else 3)
    )
    assert actual.total_steps == total
    assert events == expected_events == [(index + 1, total) for index in range(total)]
    assert source.tobytes() == source_bytes


def test_new_version_preserves_three_legacy_native_neighbors(native: Any) -> None:
    torch, _diffusers, models, tokenizers = native
    for scheduler in ("euler", "heun", "dpmpp_2m"):
        new = inputs(scheduler=scheduler)
        old = {key: value for key, value in new["plan"].items() if key != "stepSeed"}
        old["version"] = "anima-deterministic-denoising-v1"
        baseline = generate_anima_sampling(
            old, new["positive"], new["negative"], models, tokenizers=tokenizers
        )
        actual = run(new, native)
        assert torch.equal(baseline.latents, actual.latents)
        assert baseline.image.tobytes() == actual.image.tobytes()
