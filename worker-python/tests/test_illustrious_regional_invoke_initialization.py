"""Authored private Invoke initialization contracts; ROOT owns native execution.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd supplies the reference:
app/invocations/latent_noise.py:generate_noise_tensor and
backend/util/devices.py:TorchDevice.choose_noise_dtype draw CPU FP32 before
casting to compute dtype on CPU. app/invocations/sd/denoise_latents.py:
prepare_noise_and_latents supplies zeros, and backend/stable_diffusion/
diffusion_backend.py:latents_from_embeddings calls original scheduler.add_noise
with the expanded first timestep, as does the legacy diffusers_pipeline.py.
The commented init_noise_sigma alternative is deliberately not the reference.
init_scheduler retains the separate xor RNG.

The decisive selector test_invoke_initialization_semantic_mutation_red observes
the actual first raw draw, add_noise, native scaled UNet input, original
prediction/step/decode and CPU/xor generator states. Drawing FP16 directly must
fail its CUDA lane; multiplying by init_noise_sigma must fail its leading lanes.
test_legacy_profiles_initialization_control_green exercises the unchanged Euler-a
and Euler neighbors. Ordinary pairs use authored recipes with regions == [].
Class observers and the necessary raw torch.randn spy delegate originals without
changing their results. The separate oracle runs after observers are removed.
Failure injection is explicit. No replacement diffusion loop, trained fixture,
default selection, public-readiness or visual-quality claim is supplied here.
"""

from __future__ import annotations

import copy
import dataclasses
import importlib
import inspect
import os
import stat
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from test_illustrious_regional_ancestral import (
    CPU_ANCESTRAL,
    CUDA_ANCESTRAL,
    _ancestral_args,  # pyright: ignore[reportPrivateUsage]
    _ancestral_steps,  # pyright: ignore[reportPrivateUsage]
)
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
    POLICIES,
    _args,  # pyright: ignore[reportPrivateUsage]
    _assert_policy,  # pyright: ignore[reportPrivateUsage]
    _literal_grid,  # pyright: ignore[reportPrivateUsage]
    _literal_training,  # pyright: ignore[reportPrivateUsage]
    _noise,  # pyright: ignore[reportPrivateUsage]
    _run,  # pyright: ignore[reportPrivateUsage]
    _transitions,  # pyright: ignore[reportPrivateUsage]
)

CPU_INVOKE = "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cpu-v1"
CUDA_INVOKE = "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1"


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


def _invoke_args(native: Any, recipe: Any, *, steps: int = 3) -> dict[str, Any]:
    args = _ancestral_args(native, recipe, steps=steps)
    args["denoising_profile"] = CUDA_INVOKE if native.device == "cuda" else CPU_INVOKE
    return args


def _output_case(tmp_path: Path, native: Any, *, regional: bool = False) -> Any:
    recipe = _recipe(_region()) if regional else _recipe()
    case = _case(tmp_path, native, recipe=recipe, steps=3)
    args = _invoke_args(native, recipe)
    case.command = dataclasses.replace(
        case.command, scheduler="euler_a", noise_profile=args["parameters"].noise_profile
    )
    case.args["denoising_profile"] = args["denoising_profile"]
    return case


def _assert_restored(seen: Any) -> None:
    assert len(seen.pipelines) == 1
    fresh = seen.pipelines[0]
    assert "prepare_latents" not in vars(fresh), "fresh prepare_latents slot leaked"
    assert "prepare_extra_step_kwargs" not in vars(fresh), "fresh step RNG slot leaked"


@contextmanager
def _initialization(native: Any, seen: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Observe original raw draws/add_noise and tripwire native prepare reuse."""
    torch = native.torch
    pipeline_cls = cast(Any, type(native.pipeline))
    scheduler_cls = native.diffusers.EulerAncestralDiscreteScheduler
    prepare = pipeline_cls.prepare_latents
    add_noise = scheduler_cls.add_noise
    randn = torch.randn
    torch_utils = importlib.import_module("diffusers.utils.torch_utils")
    pipeline_module = inspect.getmodule(pipeline_cls)
    assert pipeline_module is not None
    aliases = (
        (torch_utils, "randn_tensor", torch_utils.randn_tensor),
        (pipeline_module, "randn_tensor", pipeline_module.randn_tensor),
        (torch, "rand", torch.rand),
        (torch, "randn_like", torch.randn_like),
    )
    seen.raw_draws, seen.additions, seen.native_prepares = [], [], []
    seen.original_randn = randn

    def unchanged_aliases() -> None:
        assert torch.randn is draw, "initialization replaced the raw random function"
        for module, name, original in aliases:
            assert getattr(module, name) is original, f"initialization replaced {name}"

    @wraps(randn)
    def draw(*args: Any, **kwargs: Any) -> Any:
        generator: Any = kwargs.get("generator")
        selected = bool(seen.generators) and generator is seen.generators[0]
        before = generator.get_state().clone() if selected else None
        result = randn(*args, **kwargs)
        if selected:
            unchanged_aliases()
            seen.raw_draws.append(
                SimpleNamespace(
                    args=args,
                    kwargs=dict(kwargs),
                    value=result.detach().clone(),
                    before=before,
                    after=generator.get_state().clone(),
                )
            )
        return result

    @wraps(prepare)
    def native_prepare(current: Any, *args: Any, **kwargs: Any) -> Any:
        seen.native_prepares.append(current)
        unchanged_aliases()
        return prepare(current, *args, **kwargs)

    @wraps(add_noise)
    def addition(current: Any, *args: Any, **kwargs: Any) -> Any:
        unchanged_aliases()
        bound = inspect.signature(add_noise).bind(current, *args, **kwargs)
        record = SimpleNamespace(
            scheduler=current,
            values=_copy_tensors(native, dict(bound.arguments)),
            result=None,
        )
        seen.additions.append(record)
        result = add_noise(current, *args, **kwargs)
        record.result = result.detach().clone()
        unchanged_aliases()
        return result

    with monkeypatch.context() as patch:
        patch.setattr(torch, "randn", draw)
        patch.setattr(pipeline_cls, "prepare_latents", native_prepare)
        patch.setattr(scheduler_cls, "add_noise", addition)
        try:
            yield
        finally:
            unchanged_aliases()


def _assert_initialization(
    native: Any, seen: Any, result: Any, args: dict[str, Any], *, legacy: bool = False
) -> None:
    """Compare actual consumption against separate CPU and native-step oracles."""
    torch, numpy = native.torch, pytest.importorskip("numpy")
    parameters = args["parameters"]
    seed, steps, policy = parameters.seed, parameters.steps, parameters.noise_profile
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    _assert_restored(seen)
    assert len(seen.pipeline_results) == len(seen.schedulers) == 1
    assert result is seen.pipeline_results[0]
    fresh, scheduler = seen.pipelines[0], seen.schedulers[0]
    assert fresh is not native.pipeline and scheduler is not native.pipeline.scheduler
    assert type(scheduler) is native.diffusers.EulerAncestralDiscreteScheduler
    for name in ("unet", "vae", "text_encoder", "text_encoder_2", "tokenizer", "tokenizer_2"):
        assert getattr(fresh, name) is getattr(native.pipeline, name)
    assert len(seen.raw_draws) == len(seen.generators) == len(seen.preparations) == 1
    draw, initial = seen.raw_draws[0], seen.generators[0]
    assert initial.device == torch.device("cpu") and initial.initial_seed() == seed
    assert draw.kwargs["generator"] is initial
    assert torch.device(draw.kwargs["device"]) == torch.device("cpu")
    assert draw.kwargs["dtype"] == (native.dtype if legacy else torch.float32)
    assert draw.value.shape == (1, 4, 2, 3)
    assert draw.value.device == torch.device("cpu")
    assert draw.value.dtype == (native.dtype if legacy else torch.float32)

    # This generator and draw are independent of the observed call and all spies.
    cpu_oracle = torch.Generator(device="cpu").manual_seed(seed)
    assert torch.equal(draw.before, cpu_oracle.get_state())
    raw = seen.original_randn(
        (1, 4, 2, 3),
        generator=cpu_oracle,
        device="cpu",
        dtype=native.dtype if legacy else torch.float32,
    )
    assert torch.equal(draw.value, raw), "original raw draw differs from independent CPU oracle"
    assert torch.equal(draw.after, cpu_oracle.get_state())
    assert torch.equal(initial.get_state(), cpu_oracle.get_state()), "initial RNG escaped prepare"
    noise = raw.to(device="cpu", dtype=native.dtype).to(device)
    if native.device == "cuda" and not legacy:
        wrong_fp16 = seen.original_randn(
            (1, 4, 2, 3),
            generator=torch.Generator(device="cpu").manual_seed(seed),
            device="cpu",
            dtype=torch.float16,
        )
        assert not torch.equal(raw.to(dtype=torch.float16), wrong_fp16), (
            "fixture must discriminate CPU FP32-cast from a direct CPU FP16 draw"
        )

    grid = _literal_grid(numpy, steps, policy.timestep_spacing)
    beta, cumulative = _literal_training(torch, policy.rescale_betas_zero_snr)
    assert torch.equal(scheduler.betas, beta)
    assert torch.equal(scheduler.alphas_cumprod, cumulative)
    train_sigma = ((1 - cumulative) / cumulative) ** 0.5
    sigmas = numpy.concatenate(
        (numpy.interp(grid, numpy.arange(1000), train_sigma.numpy()), [0])
    ).astype(numpy.float32)
    assert torch.equal(scheduler.sigmas.cpu(), torch.from_numpy(sigmas))
    assert scheduler.timesteps.tolist() == grid.tolist()
    assert scheduler.timesteps.device == device and scheduler.timesteps.dtype == torch.float32
    config = scheduler.config
    assert config.num_train_timesteps == 1000 and config.trained_betas is None
    assert config.beta_start == 0.00085 and config.beta_end == 0.012
    assert config.beta_schedule == "scaled_linear" and config.steps_offset == 1
    assert config.prediction_type == "epsilon"
    assert config.timestep_spacing == policy.timestep_spacing
    assert config.rescale_betas_zero_snr is policy.rescale_betas_zero_snr

    expected = noise * torch.from_numpy(sigmas[:1]).to(device=device, dtype=native.dtype).reshape(
        1, 1, 1, 1
    )
    if legacy:
        assert len(seen.native_prepares) == 1 and seen.native_prepares[0] is fresh
        assert seen.additions == []
        expected = noise * scheduler.init_noise_sigma
    else:
        assert seen.native_prepares == [], "Invoke initialization invoked native prepare_latents"
        assert len(seen.additions) == 1
        addition = seen.additions[0]
        assert addition.scheduler is scheduler
        values = addition.values
        assert torch.equal(values["original_samples"], torch.zeros_like(noise))
        assert values["original_samples"].dtype == values["noise"].dtype == native.dtype
        assert values["original_samples"].device == values["noise"].device == device
        assert torch.equal(values["noise"], noise)
        assert values["timesteps"].shape == (1,)
        assert values["timesteps"].dtype == torch.float32
        assert values["timesteps"].device == device
        assert torch.equal(values["timesteps"], scheduler.timesteps[:1].expand(1))
        assert torch.equal(addition.result, expected), "original add_noise consumed wrong inputs"
        if policy.timestep_spacing == "leading":
            assert not torch.equal(expected, noise * scheduler.init_noise_sigma), (
                "leading fixture must distinguish add_noise from init_noise_sigma"
            )
    assert torch.equal(seen.steps[0]["sample"], expected), (
        "native scheduler consumed the wrong initial latent"
    )
    options = seen.pipeline_inputs[0]
    assert options["num_inference_steps"] == steps and options["guidance_scale"] == 5.0
    assert options["output_type"] == "pt" and options["guidance_rescale"] == 0
    assert options["num_images_per_prompt"] == 1
    assert options["width"] == 24 and options["height"] == 16
    assert options.get("latents") is options.get("timesteps") is options.get("sigmas") is None
    prepared_pipeline, prepared_initial, eta, prepared_kwargs = seen.preparations[0]
    assert prepared_pipeline is fresh and prepared_initial is initial and eta == 0.0
    assert prepared_kwargs["generator"] is initial
    step_rng = seen.steps[0]["generator"]
    assert step_rng is not initial and step_rng.device == device
    assert step_rng.initial_seed() == seed ^ 0xFFFFFFFF
    assert all(step["generator"] is step_rng for step in seen.steps)
    assert len(seen.steps) == len(seen.root_inputs) == len(seen.unet_results) == steps
    assert len(seen.transition_results) == steps
    assert seen.events == [event for _ in range(steps) for event in ("unet", "step")] + ["decode"]
    assert len(seen.decodes) == len(seen.decode_results) == 1 and seen.decode_reserved == [True]
    assert result.images.shape == (1, 3, 16, 24)
    assert result.images.dtype == native.dtype and result.images.device == device
    assert torch.isfinite(result.images).all() and not result.images.requires_grad
    oracle = native.diffusers.EulerAncestralDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        timestep_spacing=policy.timestep_spacing,
        rescale_betas_zero_snr=policy.rescale_betas_zero_snr,
        prediction_type="epsilon",
    )
    oracle.set_timesteps(steps, device=device)
    xor_oracle = torch.Generator(device=device).manual_seed(seed ^ 0xFFFFFFFF)
    for index, (root, unet, transition, actual) in enumerate(
        zip(seen.root_inputs, seen.unet_results, seen.steps, seen.transition_results, strict=True)
    ):
        sample, timestep = transition["sample"], oracle.timesteps[index]
        assert root["timestep"].item() == transition["timestep"].item() == grid[index]
        assert torch.equal(
            root["sample"], oracle.scale_model_input(torch.cat((sample, sample)), timestep)
        )
        prediction: Any = cast(tuple[Any, ...], unet)[0] if isinstance(unet, tuple) else unet.sample
        negative, positive = cast(tuple[Any, ...], prediction.chunk(2))
        assert torch.equal(transition["model_output"], negative + 5.0 * (positive - negative))
        assert torch.equal(seen.step_rng_before[index], xor_oracle.get_state())
        expected_step = oracle.step(
            transition["model_output"], timestep, sample, generator=xor_oracle, return_dict=False
        )[0]
        assert torch.equal(actual, expected_step), "original ancestral step used the wrong RNG"
        assert torch.equal(seen.step_rng_after[index], xor_oracle.get_state())
        assert not torch.equal(seen.step_rng_before[index], seen.step_rng_after[index])
        if index + 1 < steps:
            assert torch.equal(seen.steps[index + 1]["sample"], actual)
    assert torch.equal(step_rng.get_state(), xor_oracle.get_state())
    assert torch.equal(
        seen.decodes[0], seen.transition_results[-1] / native.pipeline.vae.config.scaling_factor
    )


def test_invoke_initialization_semantic_mutation_red(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Both real lanes distinguish Invoke initialization from the old path."""
    recipe = _recipe()
    assert recipe["regions"] == []
    records: list[Any] = []
    for legacy in (False, True):
        args = _ancestral_args(lane, recipe) if legacy else _invoke_args(lane, recipe)
        with (
            _native_observe(lane.denoising, lane, monkeypatch) as seen,
            _ancestral_steps(lane, seen, monkeypatch),
            _initialization(lane, seen, monkeypatch),
        ):
            result = _run(lane, recipe, args)
        _assert_initialization(lane, seen, result, args, legacy=legacy)
        records.append(seen)
    current, old = records
    assert not lane.torch.equal(current.steps[0]["sample"], old.steps[0]["sample"])
    assert not lane.torch.equal(current.root_inputs[0]["sample"], old.root_inputs[0]["sample"])
    assert lane.torch.equal(current.raw_draws[0].value, old.raw_draws[0].value) is (
        lane.device == "cpu"
    )
    assert current.generators[0] is not old.generators[0]
    assert current.steps[0]["generator"] is not old.steps[0]["generator"]
    for before, after in zip(current.step_rng_before, old.step_rng_before, strict=True):
        assert lane.torch.equal(before, after)
    assert lane.torch.equal(
        current.steps[-1]["generator"].get_state(), old.steps[-1]["generator"].get_state()
    )


def test_legacy_profiles_initialization_control_green(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recipe = _recipe()
    args = _ancestral_args(lane, recipe)
    assert args["denoising_profile"] == (CUDA_ANCESTRAL if lane.device == "cuda" else CPU_ANCESTRAL)
    with (
        _native_observe(lane.denoising, lane, monkeypatch) as seen,
        _ancestral_steps(lane, seen, monkeypatch),
        _initialization(lane, seen, monkeypatch),
    ):
        result = _run(lane, recipe, args)
    _assert_initialization(lane, seen, result, args, legacy=True)
    args = _args(lane, recipe)
    with (
        _native_observe(lane.denoising, lane, monkeypatch) as euler,
        _transitions(lane, euler, monkeypatch),
        _initialization(lane, euler, monkeypatch),
    ):
        result = _run(lane, recipe, args)
    _assert_policy(lane, euler, result, steps=3, rescale=False, spacing="leading")
    _assert_restored(euler)
    assert len(euler.native_prepares) == 1 and euler.additions == []
    assert euler.raw_draws[0].kwargs["dtype"] == lane.dtype
    assert all(step["generator"] is euler.generators[0] for step in euler.steps)


@pytest.mark.parametrize("rescale,spacing", POLICIES)
def test_invoke_initialization_supports_all_explicit_noise_policies(
    cpu: Any, monkeypatch: pytest.MonkeyPatch, rescale: bool, spacing: str
) -> None:
    recipe = _recipe()
    args = _invoke_args(cpu, recipe)
    args["parameters"] = dataclasses.replace(
        args["parameters"], noise_profile=_noise(rescale, spacing)
    )
    with (
        _native_observe(cpu.denoising, cpu, monkeypatch) as seen,
        _ancestral_steps(cpu, seen, monkeypatch),
        _initialization(cpu, seen, monkeypatch),
    ):
        result = _run(cpu, recipe, args)
    _assert_initialization(cpu, seen, result, args)


@pytest.mark.parametrize(
    "invalid,code",
    (
        ("euler", "UNSUPPORTED"),
        ("missing-policy", "INPUT_INVALID"),
        ("invalid-policy", "INPUT_INVALID"),
        ("crossed-lane", "PROFILE_INVALID"),
        ("unknown-profile", "PROFILE_INVALID"),
    ),
)
def test_invoke_initialization_refuses_before_native_consumption(
    cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str, code: str
) -> None:
    recipe = _recipe()
    args = _invoke_args(cpu, recipe)
    if invalid == "euler":
        args["parameters"] = dataclasses.replace(args["parameters"], scheduler="euler")
    elif invalid == "missing-policy":
        args["parameters"] = dataclasses.replace(args["parameters"], noise_profile=None)
    elif invalid == "invalid-policy":
        args["parameters"] = dataclasses.replace(
            args["parameters"],
            noise_profile=dataclasses.replace(args["parameters"].noise_profile, schema_version=2),
        )
    else:
        args["denoising_profile"] = (
            CUDA_INVOKE if invalid == "crossed-lane" else CPU_INVOKE + "-unknown"
        )
    with _no_native(cpu, monkeypatch, no_reads=True) as hits, pytest.raises(ValueError) as caught:
        _run(cpu, recipe, args)
    assert getattr(caught.value, "code", None) == code and hits == []


def test_invoke_initialization_regional_output_reaches_original_png_publication(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _output_case(tmp_path, lane, regional=True)
    with (
        _output_observe(output, lane, monkeypatch) as seen,
        _ancestral_steps(lane, seen, monkeypatch),
        _initialization(lane, seen, monkeypatch),
    ):
        done = _generate(output, lane, case)
    _assert_initialization(lane, seen, seen.pipeline_results[0], _invoke_args(lane, case.recipe))
    _assert_png(lane, case, seen, done)


def _direct_fresh(cpu: Any) -> Any:
    fresh = copy.copy(cpu.pipeline)
    fresh.scheduler = cpu.diffusers.EulerAncestralDiscreteScheduler(
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        timestep_spacing="leading",
        steps_offset=1,
    )
    fresh.scheduler.set_timesteps(3, device="cpu")
    return fresh


@pytest.mark.parametrize(
    "invalid",
    ("input-latents", "generator-list", "advanced-generator", "scope-reentry", "existing-shadow"),
)
def test_direct_invoke_initialization_guards_refuse_without_consuming(
    cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    """Only unsupported inputs unreachable through the real runner use this seam."""
    torch = cpu.torch
    fresh = _direct_fresh(cpu)
    generator = torch.Generator(device="cpu").manual_seed(42)
    if invalid == "advanced-generator":
        torch.randn((1,), generator=generator, device="cpu", dtype=torch.float32)
    if invalid == "existing-shadow":
        fresh.__dict__["prepare_latents"] = fresh.prepare_latents
    before = _snapshot(cpu, vars(fresh))
    rng_before = generator.get_state().clone()
    seen = SimpleNamespace(generators=[generator])
    helper = cpu.denoising._scoped_invoke_initialization
    with (
        _initialization(cpu, seen, monkeypatch),
        _preserved(cpu),
        pytest.raises(ValueError) as caught,
        helper(fresh, torch, 42, "cpu-float32-v1"),
    ):
        if invalid == "scope-reentry":
            with helper(fresh, torch, 42, "cpu-float32-v1"):
                pytest.fail("same fresh pipeline admitted a nested initialization scope")
        else:
            fresh.prepare_latents(
                1,
                4,
                16,
                24,
                torch.float32,
                torch.device("cpu"),
                [generator] if invalid == "generator-list" else generator,
                torch.zeros((1, 4, 2, 3)) if invalid == "input-latents" else None,
            )
    assert getattr(caught.value, "code", None) == (
        "SCOPE_CONFLICT" if invalid in ("scope-reentry", "existing-shadow") else "INPUT_INVALID"
    )
    assert seen.raw_draws == seen.additions == seen.native_prepares == []
    assert torch.equal(generator.get_state(), rng_before)
    _assert_snapshot(cpu, vars(fresh), before)


@pytest.mark.parametrize("invalid", ("prepare-reentry", "second-prepare", "empty-scope"))
def test_direct_invoke_initialization_requires_one_nonreentrant_prepare(
    cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    torch = cpu.torch
    fresh = _direct_fresh(cpu)
    generator = torch.Generator(device="cpu").manual_seed(42)
    prepare_args = (1, 4, 16, 24, torch.float32, torch.device("cpu"), generator, None)
    before = _snapshot(cpu, vars(fresh))
    seen = SimpleNamespace(generators=[generator])
    helper = cpu.denoising._scoped_invoke_initialization
    original = cpu.diffusers.EulerAncestralDiscreteScheduler.add_noise
    completed_state: list[Any] = []

    @wraps(original)
    def reenter(current: Any, *args: Any, **kwargs: Any) -> Any:
        fresh.prepare_latents(*prepare_args)
        return original(current, *args, **kwargs)

    with monkeypatch.context() as patch:
        if invalid == "prepare-reentry":
            patch.setattr(cpu.diffusers.EulerAncestralDiscreteScheduler, "add_noise", reenter)
        with (
            _initialization(cpu, seen, monkeypatch),
            _preserved(cpu),
            pytest.raises(ValueError) as caught,
            helper(fresh, torch, 42, "cpu-float32-v1"),
        ):
            if invalid != "empty-scope":
                fresh.prepare_latents(*prepare_args)
                completed_state.append(generator.get_state().clone())
                fresh.prepare_latents(*prepare_args)
    assert getattr(caught.value, "code", None) == (
        "PROFILE_INVALID" if invalid == "empty-scope" else "SCOPE_CONFLICT"
    )
    count = 0 if invalid == "empty-scope" else 1
    assert len(seen.raw_draws) == len(seen.additions) == count
    assert seen.native_prepares == []
    oracle = torch.Generator(device="cpu").manual_seed(42)
    if count:
        seen.original_randn((1, 4, 2, 3), generator=oracle, device="cpu", dtype=torch.float32)
    assert torch.equal(generator.get_state(), oracle.get_state())
    if invalid == "second-prepare":
        assert len(completed_state) == 1
        assert torch.equal(generator.get_state(), completed_state[0])
        assert seen.additions[0].result is not None
    elif invalid == "prepare-reentry":
        assert completed_state == [] and seen.additions[0].result is None
    assert fresh.scheduler.step_index is fresh.scheduler.begin_index is None
    assert fresh.scheduler.is_scale_input_called is False
    _assert_snapshot(cpu, vars(fresh), before)


@contextmanager
def _failure(
    native: Any, monkeypatch: pytest.MonkeyPatch, stage: str, sentinel: BaseException
) -> Generator[list[Any]]:
    """Fail after an original native result, or at real publisher directory sync."""
    calls: list[Any] = []
    if stage == "add-noise":
        owner, name = native.diffusers.EulerAncestralDiscreteScheduler, "add_noise"
    elif stage == "unet":
        owner, name = cast(Any, type(native.pipeline.unet)), "forward"
    elif stage == "decode":
        owner, name = cast(Any, type(native.pipeline.vae)), "decode"
    else:
        owner, name = os, "fsync"
    original = getattr(owner, name)

    @wraps(original)
    def fail(*args: Any, **kwargs: Any) -> Any:
        if stage == "publication":
            if stat.S_ISDIR(os.fstat(args[0]).st_mode):
                calls.append(args[0])
                raise sentinel
            return original(*args, **kwargs)
        result = original(*args, **kwargs)
        calls.append(result)
        if stage != "unet" or len(calls) == 2:
            raise sentinel
        return result

    with monkeypatch.context() as patch:
        patch.setattr(owner, name, fail)
        yield calls


@pytest.mark.parametrize("stage", ("add-noise", "unet", "decode", "publication"))
def test_invoke_initialization_failure_restores_and_fresh_output_recovers(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _output_case(tmp_path, lane)
    args = _invoke_args(lane, case.recipe)
    baseline = _run(lane, case.recipe, args).images.detach().clone()
    sentinel = (
        OSError("authored publisher directory sync failure")
        if stage == "publication"
        else RuntimeError(f"authored failure after original {stage}")
    )
    with (
        _failure(lane, monkeypatch, stage, sentinel) as calls,
        _output_observe(output, lane, monkeypatch) as failed,
        _ancestral_steps(lane, failed, monkeypatch),
        _initialization(lane, failed, monkeypatch),
        pytest.raises((RuntimeError, DerivativeError)) as caught,
    ):
        _generate(output, lane, case)
    if stage == "publication":
        assert isinstance(caught.value, DerivativeError)
        assert (
            caught.value.code == "GENERATION_WORKER_FAILED" and caught.value.__cause__ is sentinel
        )
    else:
        assert caught.value is sentinel
    assert len(calls) == (2 if stage == "unet" else 1)
    assert len(failed.raw_draws) == len(failed.additions) == 1
    assert failed.native_prepares == [] and failed.receipts == []
    assert len(failed.decodes) == (1 if stage in ("decode", "publication") else 0)
    assert len(failed.publications) == (1 if stage == "publication" else 0)
    _assert_restored(failed)
    assert set(case.root.iterdir()) == {case.target}
    with (
        _output_observe(output, lane, monkeypatch) as recovered,
        _ancestral_steps(lane, recovered, monkeypatch),
        _initialization(lane, recovered, monkeypatch),
    ):
        done = _generate(output, lane, case)
    _assert_initialization(lane, recovered, recovered.pipeline_results[0], args)
    assert lane.torch.equal(recovered.pipeline_results[0].images, baseline)
    _assert_png(lane, case, recovered, done)


def test_invoke_initialization_fresh_repeat_and_changed_seed(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    images: list[Any] = []
    samples: list[Any] = []
    generators: list[Any] = []
    for seed in (42, 42, 43):
        recipe = _recipe()
        recipe["item"]["seed"] = seed
        args = _invoke_args(lane, recipe)
        with (
            _native_observe(lane.denoising, lane, monkeypatch) as seen,
            _ancestral_steps(lane, seen, monkeypatch),
            _initialization(lane, seen, monkeypatch),
        ):
            result = _run(lane, recipe, args)
        _assert_initialization(lane, seen, result, args)
        images.append(result.images.detach().clone())
        samples.append(seen.steps[0]["sample"])
        generators.append(seen.generators[0])
    assert len({id(value) for value in generators}) == 3
    assert lane.torch.equal(samples[0], samples[1])
    assert not lane.torch.equal(samples[0], samples[2])
    assert lane.torch.equal(images[0], images[1])
    assert not lane.torch.equal(images[0], images[2])
