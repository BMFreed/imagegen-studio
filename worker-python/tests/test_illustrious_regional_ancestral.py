"""Private Euler-a contracts; authored here, executed and qualified by ROOT.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd maps euler_a to the native
ancestral scheduler in backend/stable_diffusion/schedulers/schedulers.py.
app/invocations/sd/denoise_latents.py:init_scheduler creates a separate
compute-device Generator(seed ^ 0xFFFFFFFF); diffusion_backend.py:step passes
it unchanged to the original scheduler. These tests observe that consumption,
not just the advertised scheduler name. Initial CPU noise remains independent.

Original native CLIP/attention/UNet/ancestral-step/VAE calls are delegated.
Literal beta/grid arithmetic and a separate native scheduler primitive check
actual inputs/results. There is no replacement diffusion loop or trained
quality claim. Removing the xor or forwarding the initial-noise generator must
fail test_ancestral_original_steps_consume_separate_invoke_generator. The
unchanged Euler selector test_legacy_euler_control_keeps_original_path is the
neighboring control. ROOT owns runtime checks and any isolated mutations.
"""

from __future__ import annotations

import dataclasses
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest

from test_illustrious_regional_denoising import (
    _assert_snapshot,  # pyright: ignore[reportPrivateUsage]
    _copy_tensors,  # pyright: ignore[reportPrivateUsage]
    _snapshot,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _observe as _native_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _assert_png,  # pyright: ignore[reportPrivateUsage]
    _before_filework,  # pyright: ignore[reportPrivateUsage]
    _case,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _observe as _output_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_sampling import (
    CPU_V2,
    CUDA_V2,
    _args,  # pyright: ignore[reportPrivateUsage]
    _assert_policy,  # pyright: ignore[reportPrivateUsage]
    _literal_training,  # pyright: ignore[reportPrivateUsage]
    _run,  # pyright: ignore[reportPrivateUsage]
    _transitions,  # pyright: ignore[reportPrivateUsage]
)

CPU_ANCESTRAL = "ordinary-canvas-euler-ancestral-txt2img-cpu-v1"
CUDA_ANCESTRAL = "ordinary-canvas-euler-ancestral-txt2img-cuda-fp16-v1"


@pytest.fixture(scope="module")
def cpu() -> Iterator[Any]:
    with _models("cpu") as native:
        yield native


@pytest.fixture(scope="module")
def cuda() -> Iterator[Any]:
    with _models("cuda") as native:
        yield native


@pytest.fixture(scope="module", params=("cpu", "cuda"))
def lane(request: pytest.FixtureRequest) -> Any:
    return request.getfixturevalue(request.param)


def _ancestral_args(native: Any, recipe: Any, *, steps: int = 3) -> dict[str, Any]:
    args = _args(native, recipe, steps=steps)
    args["parameters"] = dataclasses.replace(args["parameters"], scheduler="euler_a")
    args["denoising_profile"] = CUDA_ANCESTRAL if native.device == "cuda" else CPU_ANCESTRAL
    return args


@contextmanager
def _ancestral_steps(native: Any, seen: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Observe original public native methods, never replace their results."""
    cls = native.diffusers.EulerAncestralDiscreteScheduler
    original = cls.step
    pipeline_cls = cast(Any, type(native.pipeline))
    prepare = pipeline_cls.prepare_extra_step_kwargs
    seen.transition_results, seen.step_rng_before, seen.step_rng_after = [], [], []
    seen.preparations = []

    @wraps(prepare)
    def prepare_original(current: Any, generator: Any, eta: Any) -> Any:
        result = prepare(current, generator, eta)
        seen.preparations.append((current, generator, eta, dict(result)))
        return result

    @wraps(original)
    def step(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(original).bind(current, *args, **kwargs)
        values = dict(bound.arguments)
        seen.steps.append(_copy_tensors(native, values))
        seen.step_rng_before.append(values["generator"].get_state().clone())
        seen.events.append("step")
        result = original(current, *args, **kwargs)
        tensor: Any = (
            cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.prev_sample
        )
        seen.transition_results.append(tensor.detach().clone())
        seen.step_rng_after.append(values["generator"].get_state().clone())
        return cast(Any, result)

    with monkeypatch.context() as patch:
        patch.setattr(pipeline_cls, "prepare_extra_step_kwargs", prepare_original)
        patch.setattr(cls, "step", step)
        yield


def _assert_ancestral(native: Any, seen: Any, result: Any, *, steps: int, seed: int) -> None:
    torch, numpy = native.torch, pytest.importorskip("numpy")
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    grid = [1 + index * (1000 // steps) for index in reversed(range(steps))]
    assert [entry["timestep"].item() for entry in seen.root_inputs] == grid
    assert [entry["timestep"].item() for entry in seen.steps] == grid
    assert len(seen.pipelines) == len(seen.schedulers) == len(seen.pipeline_results) == 1
    assert result is seen.pipeline_results[0]
    fresh, scheduler = seen.pipelines[0], seen.schedulers[0]
    assert type(scheduler) is native.diffusers.EulerAncestralDiscreteScheduler
    assert fresh is not native.pipeline and scheduler is not native.pipeline.scheduler
    assert "prepare_extra_step_kwargs" not in vars(fresh), "owned method slot was not restored"
    for name in ("unet", "vae", "text_encoder", "text_encoder_2", "tokenizer", "tokenizer_2"):
        assert getattr(fresh, name) is getattr(native.pipeline, name)
    assert seen.events == [event for _ in range(steps) for event in ("unet", "step")] + ["decode"]
    assert len(seen.unet_results) == len(seen.transition_results) == steps
    assert len(seen.decodes) == len(seen.decode_results) == 1
    assert seen.decode_reserved == [True]
    assert result.images.shape == (1, 3, 16, 24)
    assert result.images.device == device and result.images.dtype == native.dtype
    assert torch.isfinite(result.images).all() and not result.images.requires_grad
    beta, cumulative = _literal_training(torch, False)
    assert torch.equal(scheduler.betas, beta)
    assert torch.equal(scheduler.alphas_cumprod, cumulative)
    training_sigma = ((1 - cumulative) / cumulative) ** 0.5
    expected_sigma = numpy.concatenate(
        (numpy.interp(grid, numpy.arange(1000), training_sigma.numpy()), [0])
    ).astype(numpy.float32)
    assert torch.equal(scheduler.sigmas, torch.from_numpy(expected_sigma))
    assert scheduler.timesteps.tolist() == grid and scheduler.timesteps.device == device
    assert scheduler.config.prediction_type == "epsilon"
    assert scheduler.config.timestep_spacing == "leading"
    assert scheduler.config.rescale_betas_zero_snr is False
    assert scheduler.config.steps_offset == 1 and scheduler.config.trained_betas is None
    options = seen.pipeline_inputs[0]
    assert options["num_inference_steps"] == steps and options["guidance_scale"] == 5.0
    assert options["output_type"] == "pt" and options["guidance_rescale"] == 0
    assert options["width"] == 24 and options["height"] == 16
    assert options["num_images_per_prompt"] == 1
    assert options.get("timesteps") is options.get("sigmas") is None
    assert len(seen.generators) == len(seen.preparations) == 1
    initial = seen.generators[0]
    prepared_pipeline, prepared_initial, eta, prepared_kwargs = seen.preparations[0]
    assert prepared_pipeline is fresh and prepared_initial is initial and eta == 0.0
    assert prepared_kwargs["generator"] is initial  # the original method was called unchanged
    assert initial.device == torch.device("cpu") and initial.initial_seed() == seed
    step_generator = seen.steps[0]["generator"]
    assert step_generator is not initial
    assert step_generator.device == device and step_generator.initial_seed() == seed ^ 0xFFFFFFFF
    assert all(step["generator"] is step_generator for step in seen.steps)
    assert not torch.equal(seen.step_rng_before[0], seen.step_rng_after[0])
    assert all(
        torch.equal(before, after)
        for before, after in zip(seen.step_rng_before[1:], seen.step_rng_after[:-1], strict=True)
    )

    # The initial CPU stream is consumed once, and never by ancestral steps.
    initial_oracle = torch.Generator(device="cpu").manual_seed(seed)
    noise = torch.randn((1, 4, 2, 3), generator=initial_oracle, device="cpu", dtype=native.dtype)
    assert torch.equal(initial.get_state(), initial_oracle.get_state())
    assert torch.equal(seen.steps[0]["sample"], noise.to(device) * scheduler.init_noise_sigma)
    oracle = native.diffusers.EulerAncestralDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        timestep_spacing="leading",
        rescale_betas_zero_snr=False,
        prediction_type="epsilon",
    )
    oracle.set_timesteps(steps, device=device)
    oracle_rng = torch.Generator(device=device).manual_seed(seed ^ 0xFFFFFFFF)
    for index, (root, unet, transition, actual) in enumerate(
        zip(seen.root_inputs, seen.unet_results, seen.steps, seen.transition_results, strict=True)
    ):
        sample, timestep = transition["sample"], oracle.timesteps[index]
        batch = torch.cat((sample, sample))
        assert torch.equal(root["sample"], oracle.scale_model_input(batch, timestep))
        raw: Any = cast(tuple[Any, ...], unet)[0] if isinstance(unet, tuple) else unet.sample
        negative, positive = cast(tuple[Any, ...], raw.chunk(2))
        assert torch.equal(transition["model_output"], negative + 5.0 * (positive - negative))
        assert torch.equal(seen.step_rng_before[index], oracle_rng.get_state())
        expected = oracle.step(
            transition["model_output"], timestep, sample, generator=oracle_rng, return_dict=False
        )[0]
        assert torch.equal(actual, expected), (
            "native ancestral result differs from independent stream"
        )
        assert torch.equal(seen.step_rng_after[index], oracle_rng.get_state())
        if index + 1 < steps:
            assert torch.equal(seen.steps[index + 1]["sample"], actual)
    assert torch.equal(step_generator.get_state(), oracle_rng.get_state())
    assert torch.equal(
        seen.decodes[0], seen.transition_results[-1] / native.pipeline.vae.config.scaling_factor
    )


def test_ancestral_original_steps_consume_separate_invoke_generator(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recipe = _recipe(_region())
    args = _ancestral_args(lane, recipe, steps=28)
    with (
        _native_observe(lane.denoising, lane, monkeypatch) as seen,
        _ancestral_steps(lane, seen, monkeypatch),
    ):
        result = _run(lane, recipe, args)
    _assert_ancestral(lane, seen, result, steps=28, seed=recipe["item"]["seed"])
    assert seen.builds == [("cat", "blur"), ("dog", "grain")] and len(seen.clips) == 8


def test_ancestral_fresh_repeat_and_changed_seed_use_independent_local_streams(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    images: list[Any] = []
    generators: list[Any] = []
    for seed in (42, 42, 43):
        recipe = _recipe(_region())
        recipe["item"]["seed"] = seed
        args = _ancestral_args(lane, recipe)
        with (
            _native_observe(lane.denoising, lane, monkeypatch) as seen,
            _ancestral_steps(lane, seen, monkeypatch),
        ):
            result = _run(lane, recipe, args)
        _assert_ancestral(lane, seen, result, steps=3, seed=seed)
        images.append(result.images.detach().clone())
        generators.append(seen.steps[0]["generator"])
    assert len({id(value) for value in generators}) == 3
    assert lane.torch.equal(images[0], images[1])
    assert not lane.torch.equal(images[0], images[2])


def test_ancestral_hostile_borrowed_scheduler_is_preserved_and_ignored(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recipe = _recipe(_region())
    args = _ancestral_args(lane, recipe)
    baseline = _run(lane, recipe, args).images.detach().clone()
    hostile = lane.diffusers.EulerAncestralDiscreteScheduler(
        num_train_timesteps=17,
        trained_betas=[0.03] * 17,
        prediction_type="v_prediction",
        timestep_spacing="trailing",
        steps_offset=0,
    )
    hostile.set_timesteps(4, device=lane.device)
    hostile._step_index, hostile._begin_index = 2, 1
    hostile.is_scale_input_called = True
    prior = _snapshot(lane, vars(hostile))
    with monkeypatch.context() as patch:
        patch.setitem(lane.pipeline.__dict__, "scheduler", hostile)
        with (
            _native_observe(lane.denoising, lane, monkeypatch) as seen,
            _ancestral_steps(lane, seen, monkeypatch),
        ):
            result = _run(lane, recipe, args)
        _assert_ancestral(lane, seen, result, steps=3, seed=recipe["item"]["seed"])
        assert lane.torch.equal(result.images, baseline)
        _assert_snapshot(lane, vars(hostile), prior)


def test_legacy_euler_control_keeps_original_path(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recipe = _recipe(_region())
    args = _args(lane, recipe)
    with (
        _native_observe(lane.denoising, lane, monkeypatch) as seen,
        _transitions(lane, seen, monkeypatch),
    ):
        result = _run(lane, recipe, args)
    _assert_policy(lane, seen, result, steps=3, rescale=False, spacing="leading")
    assert all(step["generator"] is seen.generators[0] for step in seen.steps)
    assert "prepare_extra_step_kwargs" not in vars(seen.pipelines[0])


@pytest.mark.parametrize(
    "invalid,code",
    (
        ("euler-on-ancestral", "UNSUPPORTED"),
        ("ancestral-on-euler", "UNSUPPORTED"),
        ("missing-policy", "INPUT_INVALID"),
        ("crossed-lane", "PROFILE_INVALID"),
    ),
)
def test_ancestral_refusals_precede_any_native_work(
    cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str, code: str
) -> None:
    recipe = _recipe(_region())
    args = _ancestral_args(cpu, recipe)
    if invalid == "euler-on-ancestral":
        args["parameters"] = dataclasses.replace(args["parameters"], scheduler="euler")
    elif invalid == "ancestral-on-euler":
        args["denoising_profile"] = CPU_V2
    elif invalid == "missing-policy":
        args["parameters"] = dataclasses.replace(args["parameters"], noise_profile=None)
    else:
        args["denoising_profile"] = CUDA_ANCESTRAL
    with _no_native(cpu, monkeypatch, no_reads=True) as hits, pytest.raises(ValueError) as caught:
        _run(cpu, recipe, args)
    assert getattr(caught.value, "code", None) == code and hits == []


@pytest.mark.parametrize("invalid", ("missing-policy", "ancestral-on-euler"))
def test_ancestral_output_metadata_refuses_before_target_access(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    import importlib

    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _case(tmp_path, cpu)
    case.command = dataclasses.replace(case.command, scheduler="euler_a", noise_profile=None)
    case.args["denoising_profile"] = CPU_ANCESTRAL
    if invalid == "ancestral-on-euler":
        case.command = dataclasses.replace(
            case.command,
            noise_profile=_ancestral_args(cpu, case.recipe)["parameters"].noise_profile,
        )
        case.args["denoising_profile"] = CPU_V2
    with (
        _preserved(cpu),
        _before_filework(cpu, monkeypatch),
        pytest.raises(ValueError) as caught,
    ):
        output.generate_current_canvas_regional_txt2img(
            case.recipe, command=case.command, **case.args
        )
    assert getattr(caught.value, "code", None) == (
        "INPUT_INVALID" if invalid == "missing-policy" else "UNSUPPORTED"
    )
    assert set(case.root.iterdir()) == {case.target}


def test_ancestral_original_output_reaches_exact_png_publication(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    import importlib

    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _case(tmp_path, lane, steps=3)
    parameters = _ancestral_args(lane, case.recipe)["parameters"]
    case.command = dataclasses.replace(
        case.command, scheduler="euler_a", noise_profile=parameters.noise_profile
    )
    case.args["denoising_profile"] = CUDA_ANCESTRAL if lane.device == "cuda" else CPU_ANCESTRAL
    with (
        _output_observe(output, lane, monkeypatch) as seen,
        _ancestral_steps(lane, seen, monkeypatch),
    ):
        done = _generate(output, lane, case)
    _assert_ancestral(lane, seen, seen.pipeline_results[0], steps=3, seed=case.command.seed)
    _assert_png(lane, case, seen, done)


def test_ancestral_native_step_failure_restores_and_fresh_call_recovers(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recipe = _recipe(_region())
    args = _ancestral_args(lane, recipe, steps=4)
    baseline = _run(lane, recipe, args).images.detach().clone()
    cls = lane.diffusers.EulerAncestralDiscreteScheduler
    original = cls.step
    sentinel = RuntimeError("authored failure after second original ancestral step")
    calls: list[Any] = []

    @wraps(original)
    def fail(current: Any, *values: Any, **kwargs: Any) -> Any:
        result = original(current, *values, **kwargs)
        calls.append(result)
        if len(calls) == 2:
            raise sentinel
        return result

    with monkeypatch.context() as patch:
        patch.setattr(cls, "step", fail)
        with (
            _native_observe(lane.denoising, lane, monkeypatch) as failed,
            pytest.raises(RuntimeError) as caught,
        ):
            _run(lane, recipe, args)
        assert caught.value is sentinel and len(calls) == 2
        assert len(failed.pipelines) == 1 and failed.decodes == []
        assert "prepare_extra_step_kwargs" not in vars(failed.pipelines[0])
    with (
        _native_observe(lane.denoising, lane, monkeypatch) as seen,
        _ancestral_steps(lane, seen, monkeypatch),
    ):
        recovered = _run(lane, recipe, args)
    _assert_ancestral(lane, seen, recovered, steps=4, seed=recipe["item"]["seed"])
    assert lane.torch.equal(recovered.images, baseline)
    assert args["denoising_profile"] != (CUDA_V2 if lane.device == "cuda" else CPU_V2)
