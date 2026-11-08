"""Existing native Anima samplers consume one prepared regional predictor.

The Main recipe/compiler and original native attention/decode owners are real.
Fresh independent solvers replay the observed original model predictions; no
replacement model or denoising loop is used by the production calls under test.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker import anima_regional as regional
from imagegen_worker import anima_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.anima_flow_sampling import generate_anima_flow_sampling
from imagegen_worker.anima_worker import anima_sampling_payload
from imagegen_worker.derivatives import DerivativeError
from test_anima_flow_sampling import (
    _independent_er_class,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_flow_sampling import (
    inputs as _flow_inputs,
)
from test_anima_regional import (
    _Call,  # pyright: ignore[reportPrivateUsage]
    _command,  # pyright: ignore[reportPrivateUsage]
    _contains_cause,  # pyright: ignore[reportPrivateUsage]
    _context_oracle,  # pyright: ignore[reportPrivateUsage]
    _execute,  # pyright: ignore[reportPrivateUsage]
    _Native,  # pyright: ignore[reportPrivateUsage]
    _native_association,  # pyright: ignore[reportPrivateUsage]
    _Observation,  # pyright: ignore[reportPrivateUsage]
    _observed,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _published,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import (
    cpu_native as cpu_native,
)
from test_anima_regional import (
    main_inputs as main_inputs,
)
from test_anima_regional import (
    native as native,
)
from test_anima_regional import (
    native_factory as native_factory,
)
from test_anima_regional_worker import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _runtime,  # pyright: ignore[reportPrivateUsage]
)

_PROFILE = "invoke-anima-flow-sampling-v1"
_METHODS = ("euler", "heun", "dpmpp_2m", "dpmpp_2m_sde", "er_sde", "lcm")
_Producer = Callable[..., dict[str, Any]]


def _call(
    path: Path,
    produce: _Producer,
    method: str,
    *,
    variant: str = "base",
    steps: int = 5,
    guidance: float = 3,
) -> _Call:
    handoff = produce(variant)
    bbox = handoff["recipe"]["bbox"]
    # Sampling already has its own immutable ordinary-command owner. The whole
    # genuine Main recipe is retained; only the command's selected method varies.
    handoff["sampling"] = _flow_inputs(
        scheduler=method,
        width=bbox["width"],
        height=bbox["height"],
        seed=handoff["recipe"]["item"]["seed"],
        steps=steps,
        guidanceScale=guidance,
    )["plan"]
    return _command(path, handoff)


def _fresh_solver(call: _Call, native: _Native) -> tuple[Any, list[float], list[float]]:
    """Derive schedules from authored N/method, never the captured arrays."""
    plan = call.command.sampling
    if plan.scheduler == "euler":
        sigmas = [
            3 * (1 - i / plan.steps) / (1 + 2 * (1 - i / plan.steps)) for i in range(plan.steps + 1)
        ]
        return None, sigmas, [sigma * 1000 for sigma in sigmas[:-1]]
    diffusers = native.diffusers
    if plan.scheduler == "heun":
        solver = diffusers.FlowMatchHeunDiscreteScheduler(num_train_timesteps=1000, shift=3)
    elif plan.scheduler in ("dpmpp_2m", "dpmpp_2m_sde"):
        solver = diffusers.DPMSolverMultistepScheduler(
            num_train_timesteps=1000,
            prediction_type="flow_prediction",
            use_flow_sigmas=True,
            flow_shift=3,
            solver_order=2,
            algorithm_type="sde-dpmsolver++" if plan.scheduler == "dpmpp_2m_sde" else "dpmsolver++",
            solver_type="midpoint",
            lower_order_final=True,
            final_sigmas_type="zero",
        )
    elif plan.scheduler == "er_sde":
        solver = _independent_er_class()(
            num_train_timesteps=1000,
            prediction_type="flow_prediction",
            use_flow_sigmas=True,
            flow_shift=3,
            solver_order=3,
            stochastic=True,
        )
    else:
        assert plan.scheduler == "lcm"
        solver = diffusers.FlowMatchLCMScheduler(num_train_timesteps=1000, shift=1)
    if plan.scheduler in ("er_sde", "lcm"):
        full = [
            3 * (1 - i / plan.steps) / (1 + 2 * (1 - i / plan.steps)) for i in range(plan.steps + 1)
        ]
        solver.set_timesteps(
            sigmas=full if plan.scheduler == "er_sde" else full[:-1], device=native.device
        )
    else:
        solver.set_timesteps(plan.steps, device=native.device)
    solver.set_begin_index(0)
    return solver, solver.sigmas.detach().cpu().tolist(), solver.timesteps.detach().cpu().tolist()


def _solver_oracle(call: _Call, native: _Native, observed: _Observation, actual: Any) -> None:
    torch, plan = native.torch, call.command.sampling
    solver, sigmas, times = _fresh_solver(call, native)
    assert tuple(sigmas) == plan.sigmas and tuple(times) == plan.timesteps
    assert (
        len(times)
        == plan.total_steps
        == (2 * plan.steps - 1 if plan.scheduler == "heun" else plan.steps)
    )
    height, width = plan.height // 8, plan.width // 8
    latents = torch.randn(
        (1, 16, 1, height, width),
        generator=torch.Generator(device="cpu").manual_seed(plan.seed),
        dtype=torch.float32,
    ).to(device=native.device, dtype=native.dtype)
    generator = torch.Generator(device=native.device).manual_seed(plan.step_seed)
    signs = 1 if math.isclose(plan.guidance_scale, 1) else 2
    with torch.inference_mode():
        for index, timestep in enumerate(times):
            group = observed.passes[index * signs : (index + 1) * signs]
            assert len(group) == signs
            for prediction in group:
                assert torch.equal(prediction["latents"][..., :height, :width], latents.cpu())
                expected_time = torch.tensor([timestep / 1000], dtype=native.dtype)
                assert torch.equal(prediction["timestep"], expected_time)
            positive = group[0]["prediction"][..., :height, :width].to(native.device).float()
            if signs == 2:
                negative = group[1]["prediction"][..., :height, :width].to(native.device).float()
                flow = negative + plan.guidance_scale * (positive - negative)
            else:
                flow = positive
            if solver is None:
                latents = (latents.float() + (sigmas[index + 1] - sigmas[index]) * flow).to(
                    native.dtype
                )
            else:
                latents = solver.step(
                    model_output=flow,
                    timestep=solver.timesteps[index],
                    sample=latents,
                    generator=generator,
                ).prev_sample.to(native.dtype)
        assert torch.equal(latents.cpu(), actual.latents.detach().cpu()), (
            "Native solver/seed/history changed"
        )


@pytest.mark.parametrize("method", _METHODS)
def test_anima_regional_sampling_prediction_red(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method)
    contexts = _context_oracle(call.handoff, native)
    results: list[Any] = []
    original = regional.execute_captured_anima_plan

    @wraps(original)
    def observe_result(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        results.append(result)
        return result

    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))

    with _preserved(native), monkeypatch.context() as patch:
        patch.setattr(regional, "execute_captured_anima_plan", observe_result)
        with _observed(native, patch) as observed:
            done = _execute(
                call,
                native,
                sampling_profile=_PROFILE,
                on_progress=progress,
            )
        _published(call, native, done, observed)
        assert len(results) == 1
        _native_association(call, native, observed, contexts)
        _solver_oracle(call, native, observed, results[0])
    assert events == [
        (step, call.command.sampling.total_steps)
        for step in range(1, call.command.sampling.total_steps + 1)
    ]


@pytest.mark.parametrize("method", _METHODS)
def test_anima_regional_sampling_ordinary_control_green(
    native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method, variant="zero", steps=3)
    # The ordinary executor owns its Wan decode caches. Establish that control
    # before taking the regional borrow's unchanged-state baseline, as in the
    # existing zero-region Euler qualification.
    ordinary = generate_anima_flow_sampling(
        anima_sampling_payload(call.command.sampling),
        call.handoff["compiledPrompts"][0]["prompt"],
        call.handoff["compiledPrompts"][1]["prompt"],
        native.models,
        tokenizers=native.oracle_tokenizers,
    )
    with _preserved(native), _observed(native, monkeypatch) as observed:
        done = _execute(call, native, sampling_profile=_PROFILE)
    pixels = _published(call, native, done, observed)
    assert pixels == ordinary.image.tobytes()
    assert all(item["mask"] is None for item in observed.processors)


def test_explicit_sampling_profile_preserves_default_euler_and_restores_after_non_euler(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    images: list[bytes] = []
    predictions: list[list[Any]] = []
    with _preserved(cpu_native):
        for index, (method, profile) in enumerate(
            (("euler", None), ("heun", _PROFILE), ("euler", _PROFILE), ("euler", None))
        ):
            call = _call(tmp_path / str(index), main_inputs, method, steps=3)
            with _observed(cpu_native, monkeypatch) as observed:
                done = _execute(call, cpu_native, sampling_profile=profile)
            images.append(_published(call, cpu_native, done, observed))
            predictions.append([item["prediction"] for item in observed.passes])
    assert images[0] == images[2] == images[3]
    for first, explicit, restored in zip(
        predictions[0], predictions[2], predictions[3], strict=True
    ):
        assert cpu_native.torch.equal(first, explicit) and cpu_native.torch.equal(first, restored)


@pytest.mark.parametrize("method", ["dpmpp_2m_sde", "er_sde", "lcm"])
def test_regional_stochastic_history_and_seeded_replay_are_request_owned(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    images: list[bytes] = []
    predictions: list[Any] = []
    with _preserved(cpu_native):
        for index, seed in enumerate((123, 124, 123)):

            def produce(variant: str, *, captured_seed: int = seed) -> dict[str, Any]:
                return main_inputs(variant, seed=captured_seed)

            call = _call(tmp_path / str(index), produce, method, steps=5)
            with _observed(cpu_native, monkeypatch) as observed:
                done = _execute(call, cpu_native, sampling_profile=_PROFILE)
            images.append(_published(call, cpu_native, done, observed))
            predictions.append(observed.passes[2]["latents"])
    assert images[0] == images[2]
    assert cpu_native.torch.equal(predictions[0], predictions[2])
    assert not cpu_native.torch.equal(predictions[0], predictions[1])


@pytest.mark.parametrize("method", _METHODS[1:])
def test_non_euler_keeps_private_default_refusal_before_model_work(
    main_inputs: _Producer,
    tmp_path: Path,
    method: str,
) -> None:
    call = _call(tmp_path / method, main_inputs, method)
    with pytest.raises(DerivativeError, match="original txt2img Euler") as error:
        regional.generate_current_canvas_regional_anima_txt2img(
            call.handoff["recipe"],
            command=call.command,
            compiled_prompts=call.handoff["compiledPrompts"],
            models=cast(Any, None),
            runtime=cast(Any, None),
            profile="cpu-float32-v1",
        )
    assert error.value.code == "INVALID_REQUEST" and not call.command.output_path.exists()


@pytest.mark.parametrize("profile", ["", "invoke-anima-flow-sampling-v0", True, {}, [1]])
def test_stale_or_malformed_sampling_profile_refuses_before_model_work(
    main_inputs: _Producer,
    tmp_path: Path,
    profile: Any,
) -> None:
    call = _call(tmp_path / "bad-profile", main_inputs, "euler")
    with pytest.raises(DerivativeError, match="sampling profile is unsupported") as error:
        regional.generate_current_canvas_regional_anima_txt2img(
            call.handoff["recipe"],
            command=call.command,
            compiled_prompts=call.handoff["compiledPrompts"],
            models=cast(Any, None),
            runtime=cast(Any, None),
            profile="cpu-float32-v1",
            sampling_profile=profile,
        )
    assert error.value.code == "INVALID_REQUEST" and not call.command.output_path.exists()


@pytest.mark.parametrize("method", _METHODS)
def test_public_parser_and_dispatch_select_only_explicit_non_euler_profile(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
) -> None:
    call = _call(tmp_path / "source", main_inputs, method)
    case = _case(tmp_path / "wire", call.handoff)
    case.wire["reportProgress"] = True
    captured = worker.parse_anima_regional_request(case.wire)
    assert captured.command.sampling == call.command.sampling
    models = SimpleNamespace(
        **{
            role: SimpleNamespace(eval=lambda: None)
            for role in ("transformer", "text_conditioner", "qwen3_encoder", "vae")
        }
    )
    loads: list[object] = []

    def load(bundle: Any, **kwargs: Any) -> Any:
        assert bundle == captured.command.bundle and kwargs["device"] == "cuda"
        loads.append(bundle)
        return models

    def generate(recipe: Any, **kwargs: Any) -> dict[str, object]:
        assert recipe == captured.recipe
        assert kwargs["models"] is models
        assert kwargs["sampling_profile"] == (None if method == "euler" else _PROFILE)
        for index in range(captured.command.sampling.total_steps):
            kwargs["on_progress"](index + 1, captured.command.sampling.total_steps)
        return {"type": "generation-done", "requestId": captured.command.request_id}

    monkeypatch.setattr(worker, "load_anima_models", load)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_txt2img", generate)
    events: list[tuple[int, int]] = []
    result = worker.execute_anima_regional_request(
        case.wire,
        config_dir=tmp_path,
        runtime=_runtime(),
        on_progress=lambda step, total: events.append((step, total)),
    )
    assert len(loads) == 1 and result["requestId"] == captured.command.request_id
    assert events == [
        (index + 1, captured.command.sampling.total_steps)
        for index in range(captured.command.sampling.total_steps)
    ]


@pytest.mark.parametrize("change", ["method", "stepSeed", "timesteps", "sigmas", "version"])
def test_public_sampling_tampering_refuses_before_loading(
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    call = _call(tmp_path / "source", main_inputs, "heun")
    case = _case(tmp_path / "wire", call.handoff)
    sampling = case.bundle["request"]["job"]["sampling"]
    if change == "method":
        sampling["scheduler"] = "unknown"
    elif change == "stepSeed":
        sampling["stepSeed"] += 1
    elif change == "version":
        sampling["version"] = "anima-deterministic-denoising-v1"
    else:
        sampling[change][1] /= 2
    case.seal()

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Invalid sampling reached model loading")

    monkeypatch.setattr(worker, "load_anima_models", forbidden)
    with pytest.raises(DerivativeError):
        worker.execute_anima_regional_request(case.wire, config_dir=tmp_path, runtime=_runtime())
    assert not (case.root / "output.png").exists()


def test_sampling_capability_requires_the_existing_complete_native_anima_probe() -> None:
    for runtime, expected in ((None, False), (_runtime(bf16=False), False), (_runtime(), True)):
        ready = inference_main.inference_ready_message(runtime)
        capabilities = cast(list[str], ready["capabilities"])
        assert (worker.ANIMA_REGIONAL_SAMPLING_CAPABILITY in capabilities) is expected
        assert (worker.ANIMA_REGIONAL_CAPABILITY in capabilities) is expected
        if expected:
            assert {"anima-txt2img", "anima-flow-sampling", "anima-prompt-weighting"} <= set(
                capabilities
            )


@pytest.mark.parametrize("stage", ["encoding", "corrector", "scheduler", "progress", "publication"])
def test_native_sampling_failure_restores_and_fresh_call_replays(
    cpu_native: _Native,
    main_inputs: _Producer,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    baseline = _call(tmp_path / "baseline", main_inputs, "heun", steps=3)
    with _preserved(cpu_native), _observed(cpu_native, monkeypatch) as observed:
        done = _execute(baseline, cpu_native, sampling_profile=_PROFILE)
    expected = _published(baseline, cpu_native, done, observed)
    failed = _call(tmp_path / "failed", main_inputs, "heun", steps=3)
    sentinel = RuntimeError(f"declared regional sampler {stage} failure")
    events: list[tuple[int, int]] = []

    def progress(step: int, total: int) -> None:
        events.append((step, total))
        if stage == "progress" and step == 2:
            raise sentinel

    with _preserved(cpu_native):
        with monkeypatch.context() as patch:
            if stage in ("encoding", "corrector"):
                model = (
                    cpu_native.models.text_conditioner
                    if stage == "encoding"
                    else cpu_native.models.transformer
                )
                owner = cast(Any, type(model))
                original = owner.forward
                count = 0

                @wraps(original)
                def fail_forward(self: Any, *args: Any, **kwargs: Any) -> Any:
                    nonlocal count
                    if self is model:
                        count += 1
                        if count == 3:
                            raise sentinel
                    return original(self, *args, **kwargs)

                patch.setattr(owner, "forward", fail_forward)
            elif stage == "scheduler":
                scheduler_class = cpu_native.diffusers.FlowMatchHeunDiscreteScheduler
                original = scheduler_class.step
                count = 0

                @wraps(original)
                def fail_step(self: Any, *args: Any, **kwargs: Any) -> Any:
                    nonlocal count
                    count += 1
                    if count == 2:
                        raise sentinel
                    return original(self, *args, **kwargs)

                patch.setattr(scheduler_class, "step", fail_step)
            elif stage == "publication":

                def fail_publish(*_args: Any, **_kwargs: Any) -> Any:
                    raise sentinel

                patch.setattr(regional, "publish_generation_image", fail_publish)
            with pytest.raises(BaseException) as error:
                _execute(failed, cpu_native, sampling_profile=_PROFILE, on_progress=progress)
            assert _contains_cause(error.value, sentinel)
        assert not failed.command.output_path.exists()
        assert failed.command.target_path.read_bytes() == failed.target_bytes
        recovery = _call(tmp_path / "recovery", main_inputs, "heun", steps=3)
        with _observed(cpu_native, monkeypatch) as recovered:
            done = _execute(recovery, cpu_native, sampling_profile=_PROFILE)
        assert _published(recovery, cpu_native, done, recovered) == expected
    if stage == "progress":
        assert events == [(1, 5), (2, 5)]
