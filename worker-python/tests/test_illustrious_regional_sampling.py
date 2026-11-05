"""Authored V2 sampling contracts; ROOT alone collects, executes and mutates.

Fresh invocations of the existing native builder own CPU float32 and cuda:0
float16 models. Observers delegate original CLIP, pipeline, UNet, Euler and
VAE calls. Literal beta equations/grids and a separately constructed native
Euler primitive check the consumed timeline and each observed transition;
there is no replacement diffusion loop or mocked subject.

ROOT's isolated mutation forces ONLY V2 spacing to linspace. The exact selector
test_v2_main_policy_timeline_red must fail on actual consumed leading timesteps,
while test_v1_fixed_linspace_control_green stays green. Both publish original
full native results. These complete Python recipe fixtures do not establish
the separate whole-Main, trained 512 acceptance, quality or public readiness.
Only AST and scoped Ruff checks are permitted during this file's authorship.
"""

from __future__ import annotations

import copy
import dataclasses
import hashlib
import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from typing import Any, Literal, cast

import pytest
from PIL import Image

from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.protocol import IllustriousNoiseProfile
from test_illustrious_regional_denoising import (
    _assert_snapshot,  # pyright: ignore[reportPrivateUsage]
    _snapshot,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _observe as _native_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _arguments,  # pyright: ignore[reportPrivateUsage]
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _same_recipe,  # pyright: ignore[reportPrivateUsage]
    _save,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _observe as _ti_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    KEYWORDS,
    PLAIN_CPU,
    PLAIN_CUDA,
    _assert_png,  # pyright: ignore[reportPrivateUsage]
    _before_filework,  # pyright: ignore[reportPrivateUsage]
    _case,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _observe as _output_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    LAYOUTS,
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)

Spacing = Literal["leading", "linspace", "trailing"]
CPU_V2 = "ordinary-canvas-euler-txt2img-cpu-v2"
CUDA_V2 = "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
CPU_V1 = "ordinary-canvas-euler-txt2img-cpu-v1"
CUDA_V1 = "ordinary-canvas-euler-txt2img-cuda-fp16-v1"
POLICIES = (
    (False, "leading"),
    (False, "linspace"),
    (False, "trailing"),
    (True, "leading"),
    (True, "linspace"),
    (True, "trailing"),
)


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


@pytest.fixture
def output() -> Any:
    return importlib.import_module("imagegen_worker.illustrious_regional_output")


def _noise(rescale: bool = False, spacing: str = "leading") -> IllustriousNoiseProfile:
    return IllustriousNoiseProfile(rescale, cast(Spacing, spacing))


def _execution(native: Any, *, v1: bool = False) -> str:
    return (CUDA_V1 if v1 else CUDA_V2) if native.device == "cuda" else (CPU_V1 if v1 else CPU_V2)


def _args(
    native: Any,
    recipe: Any,
    *,
    steps: int = 3,
    rescale: bool = False,
    spacing: str = "leading",
    layout: str = LAYOUTS[0],
    plain: bool = True,
) -> dict[str, Any]:
    args = _arguments(native, recipe, layout=layout, steps=steps)
    args["parameters"] = dataclasses.replace(
        args["parameters"], noise_profile=_noise(rescale, spacing)
    )
    args["denoising_profile"] = _execution(native)
    if plain:
        args["profile"] = PLAIN_CUDA if native.device == "cuda" else PLAIN_CPU
    return args


def _run(native: Any, recipe: Any, args: dict[str, Any]) -> Any:
    prior = copy.deepcopy(recipe)
    parameters, noise = args["parameters"], args["parameters"].noise_profile
    values = _snapshot(native, vars(parameters))
    policy_values = _snapshot(native, vars(noise)) if hasattr(noise, "__dict__") else None
    try:
        with _preserved(native):
            return native.denoising.run_current_canvas_regional_denoising(recipe, **args)
    finally:
        assert recipe == prior
        assert args["parameters"] is parameters and parameters.noise_profile is noise
        _assert_snapshot(native, vars(parameters), values)
        if policy_values is not None:
            _assert_snapshot(native, vars(noise), policy_values)


def _output_case(tmp_path: Path, native: Any, **changes: Any) -> Any:
    case = _case(tmp_path, native, steps=changes.pop("steps", 3), **changes)
    case.command = dataclasses.replace(case.command, noise_profile=_noise())
    case.args["denoising_profile"] = _execution(native)
    return case


@contextmanager
def _transitions(native: Any, seen: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Retain outputs from the original Euler calls, without replacing them."""
    cls = native.diffusers.EulerDiscreteScheduler
    original = cls.step
    seen.transition_results = []

    @wraps(original)
    def step(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(current, *args, **kwargs)
        tensor: Any = (
            cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.prev_sample
        )
        seen.transition_results.append(tensor.detach().clone())
        return cast(Any, result)

    with monkeypatch.context() as patch:
        patch.setattr(cls, "step", step)
        yield


def _literal_training(torch: Any, rescale: bool) -> tuple[Any, Any]:
    """CPU float32 equations, independent of selector/config/native helpers."""
    beta = torch.linspace(0.00085**0.5, 0.012**0.5, 1000, dtype=torch.float32) ** 2
    if rescale:
        root = (1.0 - beta).cumprod(0).sqrt()
        first, last = root[0].clone(), root[-1].clone()
        root = root - last
        root = root * (first / (first - last))
        cumulative = root**2
        alpha = torch.cat((cumulative[:1], cumulative[1:] / cumulative[:-1]))
        beta = 1 - alpha
    cumulative = (1.0 - beta).cumprod(0)
    if rescale:
        cumulative[-1] = 2**-24
    return beta, cumulative


def _literal_grid(numpy: Any, steps: int, spacing: str) -> Any:
    if steps == 3:
        return numpy.asarray(
            {
                "leading": (667, 334, 1),
                "linspace": (999, 499.5, 0),
                "trailing": (999, 666, 332),
            }[spacing],
            dtype=numpy.float32,
        )
    if spacing == "leading":
        return numpy.asarray(
            [1 + index * (1000 // steps) for index in reversed(range(steps))],
            dtype=numpy.float32,
        )
    if spacing == "linspace":
        return numpy.asarray(
            [999 * index / (steps - 1) for index in reversed(range(steps))] if steps > 1 else [0],
            dtype=numpy.float32,
        )
    return numpy.asarray(
        [round(1000 - index * (1000 / steps)) - 1 for index in range(steps)],
        dtype=numpy.float32,
    )


def _assert_policy(
    native: Any,
    seen: Any,
    result: Any,
    *,
    steps: int,
    rescale: bool,
    spacing: str,
    cfg: float = 5.0,
) -> None:
    """Check consumed values before metadata; exact equality throughout."""
    torch, numpy = native.torch, pytest.importorskip("numpy")
    grid = _literal_grid(numpy, steps, spacing)
    # The mutation selector must fail here for semantic timeline substitution,
    # even if scheduler config still advertises the requested leading policy.
    assert [entry["timestep"].item() for entry in seen.root_inputs] == grid.tolist(), (
        "original native UNet consumed the wrong policy timeline"
    )
    assert [entry["timestep"].item() for entry in seen.steps] == grid.tolist()
    assert len(seen.pipelines) == len(seen.pipeline_results) == len(seen.schedulers) == 1
    assert result is seen.pipeline_results[0]
    assert (
        type(result)
        is importlib.import_module(
            "diffusers.pipelines.stable_diffusion_xl.pipeline_output"
        ).StableDiffusionXLPipelineOutput
    )
    expected_device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    image = result.images
    assert image.shape == (1, 3, 16, 24)
    assert image.device == expected_device and image.dtype == native.dtype
    assert not image.requires_grad and torch.isfinite(image).all()
    assert len(seen.unet_results) == len(seen.outputs) == len(seen.transition_results) == steps
    assert len(seen.decodes) == len(seen.decode_results) == 1
    assert seen.decode_reserved == [True]
    assert seen.events == [event for _ in range(steps) for event in ("unet", "step")] + ["decode"]
    fresh, scheduler = seen.pipelines[0], seen.schedulers[0]
    assert fresh is not native.pipeline and scheduler is not native.pipeline.scheduler
    for name in ("unet", "vae", "text_encoder", "text_encoder_2", "tokenizer", "tokenizer_2"):
        assert getattr(fresh, name) is getattr(native.pipeline, name)
    assert type(scheduler) is native.diffusers.EulerDiscreteScheduler
    beta, cumulative = _literal_training(torch, rescale)
    assert torch.equal(scheduler.betas, beta), "actual training betas differ from literal policy"
    assert torch.equal(scheduler.alphas_cumprod, cumulative)
    train_sigma = ((1 - cumulative) / cumulative) ** 0.5
    sigma = numpy.concatenate(
        (numpy.interp(grid, numpy.arange(1000), train_sigma.numpy()), [0])
    ).astype(numpy.float32)
    assert torch.equal(scheduler.sigmas, torch.from_numpy(sigma))
    assert scheduler.timesteps.device == expected_device
    assert scheduler.timesteps.dtype == torch.float32
    assert scheduler.timesteps.tolist() == grid.tolist()
    config = scheduler.config
    assert config.num_train_timesteps == 1000 and config.trained_betas is None
    assert config.beta_start == 0.00085 and config.beta_end == 0.012
    assert config.beta_schedule == "scaled_linear" and config.steps_offset == 1
    assert config.prediction_type == "epsilon" and config.timestep_spacing == spacing
    assert config.rescale_betas_zero_snr is rescale
    assert config.interpolation_type == "linear" and config.timestep_type == "discrete"
    assert config.final_sigmas_type == "zero"
    assert (
        config.use_karras_sigmas is config.use_exponential_sigmas is config.use_beta_sigmas is False
    )
    assert config.sigma_min is config.sigma_max is None
    options = seen.pipeline_inputs[0]
    assert options["num_inference_steps"] == steps and options["guidance_scale"] == cfg
    assert options["guidance_rescale"] == 0 and options["output_type"] == "pt"
    assert options["num_images_per_prompt"] == 1
    assert options["width"] == 24 and options["height"] == 16
    assert options.get("timesteps") is options.get("sigmas") is None
    assert options.get("callback_on_step_end") is None
    for key in ("original_size", "target_size", "negative_original_size", "negative_target_size"):
        assert options[key] == (1024, 1024)
    assert options["crops_coords_top_left"] == options["negative_crops_coords_top_left"] == (0, 0)
    assert len(seen.generators) == 1
    assert seen.generators[0].device == torch.device("cpu")
    assert seen.generators[0].initial_seed() == 42

    # This separate literal-config native primitive consumes observed original
    # predictions/samples. It never encodes, calls UNet/VAE or runs a pipeline.
    oracle = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        timestep_spacing=spacing,
        rescale_betas_zero_snr=rescale,
        prediction_type="epsilon",
    )
    oracle.set_timesteps(steps, device=expected_device)
    noise = torch.randn(
        (1, 4, 2, 3),
        generator=torch.Generator(device="cpu").manual_seed(42),
        dtype=native.dtype,
        device="cpu",
    ).to(expected_device)
    assert torch.equal(seen.steps[0]["sample"], noise * oracle.init_noise_sigma)
    for index, (root, unet, transition, actual) in enumerate(
        zip(seen.root_inputs, seen.unet_results, seen.steps, seen.transition_results, strict=True)
    ):
        sample, timestep = transition["sample"], oracle.timesteps[index]
        assert root["sample"].device == root["timestep"].device == expected_device
        assert root["sample"].dtype == native.dtype and root["timestep"].dtype == torch.float32
        assert root["timestep"].shape == ()
        batch = torch.cat((sample, sample)) if cfg > 1 else sample
        assert torch.equal(root["sample"], oracle.scale_model_input(batch, timestep))
        prediction: Any = cast(tuple[Any, ...], unet)[0] if isinstance(unet, tuple) else unet.sample
        if cfg > 1:
            negative, positive = cast(tuple[Any, ...], prediction.chunk(2))
            prediction = negative + cfg * (positive - negative)
        assert torch.equal(transition["model_output"], prediction)
        assert transition.get("s_churn", 0.0) == 0.0
        expected = oracle.step(prediction, timestep, sample, return_dict=False)[0]
        assert torch.equal(actual, expected), "original Euler transition differs from native oracle"
        assert actual.dtype == native.dtype and actual.device == expected_device
        assert torch.isfinite(actual).all()
        if index + 1 < steps:
            assert torch.equal(seen.steps[index + 1]["sample"], actual)
    assert torch.equal(
        seen.decodes[0], seen.transition_results[-1] / native.pipeline.vae.config.scaling_factor
    )


@pytest.mark.parametrize("rescale,spacing", POLICIES)
def test_v2_six_policies_consume_literal_native_timeline_and_transitions(
    lane: Any, monkeypatch: pytest.MonkeyPatch, rescale: bool, spacing: str
) -> None:
    recipe = _recipe(_region())
    if rescale:
        recipe = _with_resources(recipe)
    args = _args(lane, recipe, rescale=rescale, spacing=spacing, plain=not rescale)
    with (
        _native_observe(lane.denoising, lane, monkeypatch) as seen,
        _transitions(lane, seen, monkeypatch),
    ):
        result = _run(lane, recipe, args)
    _assert_policy(lane, seen, result, steps=3, rescale=rescale, spacing=spacing)
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]
    assert len(seen.clips) == 8


@pytest.mark.parametrize("steps", (1, 200))
def test_v2_cpu_exact_step_endpoints_reach_original_native_decode(
    cpu: Any, monkeypatch: pytest.MonkeyPatch, steps: int
) -> None:
    recipe = _recipe()
    args = _args(cpu, recipe, steps=steps, layout=LAYOUTS[1], plain=True)
    with (
        _native_observe(cpu.denoising, cpu, monkeypatch) as seen,
        _transitions(cpu, seen, monkeypatch),
    ):
        result = _run(cpu, recipe, args)
    _assert_policy(cpu, seen, result, steps=steps, rescale=False, spacing="leading", cfg=1.0)
    assert seen.builds == [("cat", "blur")] and len(seen.clips) == 4


def test_v2_exact_ti_encoding_counts_are_fixed_between_three_and_longer_run(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Independently authored stream-local vectors exercise the unchanged TI
    # owner; increasing steps must not repeat CLIP/Compel work or TI installation.
    a, b = _save(tmp_path, lane, 1), _save(tmp_path, lane, 2)
    recipe = _same_recipe(a, b)
    steps = 30 if lane.device == "cuda" else 20
    counts: list[Any] = []
    generators: list[Any] = []
    for count in (3, steps):
        args = _args(lane, recipe, steps=count, plain=False)
        with _ti_observe(lane, monkeypatch) as seen, _transitions(lane, seen, monkeypatch):
            result = _run(lane, recipe, args)
        _assert_policy(lane, seen, result, steps=count, rescale=False, spacing="leading")
        counts.append((len(seen.pairs), len(seen.clips), len(seen.loads), len(seen.encoder_calls)))
        generators.append(seen.generators[0])
    assert counts[0] == counts[1]
    # The all-stream loader installs once per encoder, covering both pairs.
    assert counts[0][:3] == (2, 8, 2) and counts[0][3] > 0
    assert generators[0] is not generators[1]


def test_v2_hostile_borrowed_scheduler_config_and_history_never_leak(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recipe = _recipe(_region())
    args = _args(lane, recipe, rescale=True)
    baseline = _run(lane, recipe, args).images.detach().clone()
    alternate = lane.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=17,
        trained_betas=[0.03] * 17,
        prediction_type="v_prediction",
        timestep_spacing="trailing",
        steps_offset=0,
        use_karras_sigmas=True,
        interpolation_type="log_linear",
        sigma_min=0.2,
        sigma_max=3.0,
        final_sigmas_type="sigma_min",
        rescale_betas_zero_snr=False,
    )
    alternate.set_timesteps(4, device=lane.device)
    alternate._step_index, alternate._begin_index = 2, 1
    alternate.is_scale_input_called = True
    prior = _snapshot(lane, vars(alternate))
    with monkeypatch.context() as patch:
        patch.setitem(lane.pipeline.__dict__, "scheduler", alternate)
        with (
            _native_observe(lane.denoising, lane, monkeypatch) as seen,
            _transitions(lane, seen, monkeypatch),
        ):
            result = _run(lane, recipe, args)
        _assert_policy(lane, seen, result, steps=3, rescale=True, spacing="leading")
        assert lane.torch.equal(result.images, baseline)
        _assert_snapshot(lane, vars(alternate), prior)


def test_v2_main_policy_timeline_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _output_case(tmp_path, lane)
    with _output_observe(output, lane, monkeypatch) as seen, _transitions(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    assert len(seen.target_checks) == len(seen.entries) == 1
    _assert_policy(lane, seen, seen.pipeline_results[0], steps=3, rescale=False, spacing="leading")
    assert seen.entries[0][1]["parameters"].noise_profile == _noise()
    _assert_png(lane, case, seen, done)


def test_v1_fixed_linspace_control_green(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane, steps=2)
    assert case.command.noise_profile is None
    with _output_observe(output, lane, monkeypatch) as seen, _transitions(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    _assert_policy(lane, seen, seen.pipeline_results[0], steps=2, rescale=False, spacing="linspace")
    assert seen.entries[0][1]["parameters"].noise_profile is None
    _assert_png(lane, case, seen, done)


NOISE_INVALID = (
    "none",
    "version-bool",
    "version-two",
    "base-rename",
    "base-subclass",
    "rescale-zero",
    "spacing-case",
    "spacing-subclass",
    "subclass",
    "missing-field",
    "extra-attributes",
    "dict-alias",
)


def _malformed_noise(invalid: str) -> Any:
    class Text(str):
        pass

    class Noise(IllustriousNoiseProfile):
        pass

    if invalid == "none":
        return None
    if invalid == "subclass":
        return Noise(False, "leading")
    if invalid == "dict-alias":
        return {
            "schemaVersion": 1,
            "baseSchedule": "sdxl-scaled-linear-v1",
            "rescaleBetasZeroSnr": False,
            "timestepSpacing": "leading",
        }
    value = _noise()
    if invalid == "missing-field":
        object.__delattr__(value, "schema_version")
        return value
    key, replacement = {
        "version-bool": ("schema_version", True),
        "version-two": ("schema_version", 2),
        "base-rename": ("base_schedule", "scaled-linear-v1"),
        "base-subclass": ("base_schedule", Text("sdxl-scaled-linear-v1")),
        "rescale-zero": ("rescale_betas_zero_snr", 0),
        "spacing-case": ("timestep_spacing", "Leading"),
        "spacing-subclass": ("timestep_spacing", Text("leading")),
        "extra-attributes": ("unowned", False),
    }[invalid]
    object.__setattr__(value, key, replacement)
    return value


def _refusal(
    tmp_path: Path,
    native: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    boundary: str,
    *,
    code: str,
    changes: dict[str, Any] | None = None,
    arguments: dict[str, Any] | None = None,
    recipe: Any = None,
) -> None:
    changes, arguments = changes or {}, arguments or {}
    recipe = _recipe() if recipe is None else recipe
    if boundary == "runner":
        args = _args(native, recipe)
        args["parameters"] = dataclasses.replace(args["parameters"], **changes)
        args.update(arguments)
        with (
            _no_native(native, monkeypatch, no_reads=True),
            pytest.raises((ValueError, DerivativeError)) as caught,
        ):
            _run(native, recipe, args)
    else:
        case = _output_case(tmp_path, native, recipe=recipe)
        case.command = dataclasses.replace(case.command, **changes)
        case.args.update(arguments)
        # Call the subject directly: _generate's fixture-side read of target
        # must not be confused with forbidden subject filesystem work.
        prior = copy.deepcopy(case.recipe)
        with (
            _preserved(native),
            _before_filework(native, monkeypatch),
            pytest.raises((ValueError, DerivativeError)) as caught,
        ):
            output.generate_current_canvas_regional_txt2img(
                case.recipe, command=case.command, **case.args
            )
        assert case.recipe == prior
        assert set(case.root.iterdir()) == {case.target}
    assert getattr(caught.value, "code", None) == code
    assert str(caught.value)


@pytest.mark.parametrize("boundary", ("runner", "output"))
@pytest.mark.parametrize("invalid", NOISE_INVALID)
def test_v2_exact_noise_record_refuses_before_encoding_or_target_snapshot(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    boundary: str,
    invalid: str,
) -> None:
    _refusal(
        tmp_path,
        cpu,
        output,
        monkeypatch,
        boundary,
        code="INPUT_INVALID",
        changes={"noise_profile": _malformed_noise(invalid)},
    )


@pytest.mark.parametrize("boundary", ("runner", "output"))
@pytest.mark.parametrize("steps", (True, 0, 201, 1.5))
def test_v2_step_type_and_bounds_refuse_before_encoding_or_target_snapshot(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    boundary: str,
    steps: Any,
) -> None:
    _refusal(
        tmp_path, cpu, output, monkeypatch, boundary, code="INPUT_INVALID", changes={"steps": steps}
    )


@pytest.mark.parametrize("boundary", ("runner", "output"))
def test_v2_crossed_lane_refuses_before_encoding_or_target_snapshot(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch, boundary: str
) -> None:
    _refusal(
        tmp_path,
        lane,
        output,
        monkeypatch,
        boundary,
        code="PROFILE_INVALID",
        arguments={"denoising_profile": CPU_V2 if lane.device == "cuda" else CUDA_V2},
    )


@pytest.mark.parametrize("boundary", ("runner", "output"))
@pytest.mark.parametrize("alias", ("ordinary-canvas-euler-txt2img-v2", "string-subclass"))
def test_v2_execution_profile_requires_exact_selector(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    boundary: str,
    alias: str,
) -> None:
    class Text(str):
        pass

    selector = Text(CPU_V2) if alias == "string-subclass" else alias
    _refusal(
        tmp_path,
        cpu,
        output,
        monkeypatch,
        boundary,
        code="PROFILE_INVALID",
        arguments={"denoising_profile": selector},
    )


@pytest.mark.parametrize(
    "invalid,code",
    (
        ("scheduler", "UNSUPPORTED"),
        ("prediction", "UNSUPPORTED"),
        ("cfg-rescale", "UNSUPPORTED"),
        ("cfg-bool", "INPUT_INVALID"),
        ("external-vae", "UNSUPPORTED"),
        ("geometry", "LIMIT"),
        ("parameters-ti", "UNSUPPORTED"),
        ("layout", "PROFILE_INVALID"),
    ),
)
def test_v2_retains_existing_feature_refusal_codes(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
    code: str,
) -> None:
    recipe, arguments = _recipe(), cast(dict[str, Any], {})
    changes = {
        "scheduler": {"scheduler": "euler_a"},
        "prediction": {"prediction_type": "v_prediction"},
        "cfg-rescale": {"cfg_rescale": 0.1},
        "cfg-bool": {"cfg_scale": True},
        "external-vae": {"vae": object()},
        "parameters-ti": {"positive_embeddings": (object(),)},
    }.get(invalid, {})
    if invalid == "geometry":
        recipe["bbox"]["width"] = 2056
    elif invalid == "layout":
        arguments["layout"] = "positive-only"
    _refusal(
        tmp_path,
        cpu,
        output,
        monkeypatch,
        "runner",
        code=code,
        changes=changes,
        arguments=arguments,
        recipe=recipe,
    )


@pytest.mark.parametrize("precision", ("Auto", "FP32"))
def test_v2_cuda_retains_exact_manual_fp16_vae_refusal(
    tmp_path: Path, cuda: Any, output: Any, monkeypatch: pytest.MonkeyPatch, precision: str
) -> None:
    _refusal(
        tmp_path,
        cuda,
        output,
        monkeypatch,
        "output",
        code="UNSUPPORTED",
        changes={"vae_precision": precision},
    )


@pytest.mark.parametrize(
    "invalid,code", (("steps-three", "INPUT_INVALID"), ("noise", "UNSUPPORTED"))
)
def test_v1_does_not_inherit_v2_step_or_explicit_noise_admission(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
    code: str,
) -> None:
    _refusal(
        tmp_path,
        cpu,
        output,
        monkeypatch,
        "output",
        code=code,
        changes={"steps": 3, "noise_profile": None}
        if invalid == "steps-three"
        else {"steps": 2, "noise_profile": _noise()},
        arguments={"denoising_profile": CPU_V1},
    )


@pytest.mark.parametrize("invalid", ("digest", "size", "alpha"))
def test_v2_verified_transparent_target_is_required_before_encoding(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    case = _output_case(tmp_path, cpu)
    if invalid == "digest":
        case.command = dataclasses.replace(case.command, target_sha256="0" * 64)
    elif invalid == "size":
        case.command = dataclasses.replace(
            case.command, target_byte_size=case.command.target_byte_size + 1
        )
    else:
        image = Image.new("RGBA", (24, 16), (17, 59, 133, 0))
        image.putpixel((23, 15), (17, 59, 133, 1))
        image.save(case.target, format="PNG", icc_profile=SRGB_ICC_PROFILE)
        content = case.target.read_bytes()
        case.command = dataclasses.replace(
            case.command,
            target_sha256=hashlib.sha256(content).hexdigest(),
            target_byte_size=len(content),
        )
    with _no_native(cpu, monkeypatch), pytest.raises(DerivativeError) as caught:
        _generate(output, cpu, case)
    assert (
        caught.value.code
        == {
            "digest": "INPUT_HASH_MISMATCH",
            "size": "GENERATION_INPUT_CHANGED",
            "alpha": "GENERATION_TARGET_UNSUPPORTED",
        }[invalid]
    )
    assert set(case.root.iterdir()) == {case.target}


@pytest.mark.parametrize("invalid", ("request", "bbox"))
def test_v2_metadata_still_precedes_target_filesystem_access(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    changes = (
        {"request_id": "bad request"}
        if invalid == "request"
        else {"bbox": {"x": 0, "y": 0, "width": 24, "height": 16}}
    )
    _refusal(tmp_path, cpu, output, monkeypatch, "output", code="INPUT_INVALID", changes=changes)


def test_v2_later_native_step_failure_restores_and_fresh_output_recovers(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _output_case(tmp_path, lane, steps=5)
    cls = cast(Any, type(lane.pipeline.unet))
    original = cls.forward
    sentinel = DerivativeError("GENERATION_WORKER_FAILED", "authored fourth native step failure")
    calls: list[Any] = []

    @wraps(original)
    def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(current, *args, **kwargs)
        calls.append(result)
        if len(calls) == 4:
            raise sentinel
        return result

    with monkeypatch.context() as patch:
        patch.setattr(cls, "forward", fail)
        with pytest.raises(DerivativeError) as caught:
            _generate(output, lane, case)
    assert caught.value is sentinel and len(calls) == 4
    assert set(case.root.iterdir()) == {case.target}
    with _output_observe(output, lane, monkeypatch) as seen, _transitions(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    _assert_policy(lane, seen, seen.pipeline_results[0], steps=5, rescale=False, spacing="leading")
    _assert_png(lane, case, seen, done)
    assert caught.value.__traceback__ is not None


def test_high_level_signatures_remain_required_and_have_no_sampling_side_channel(
    cpu: Any, output: Any
) -> None:
    for entry, keywords in (
        (output.generate_current_canvas_regional_txt2img, KEYWORDS),
        (
            cpu.denoising.run_current_canvas_regional_denoising,
            ("pipeline", "runtime", "parameters", *KEYWORDS[3:]),
        ),
    ):
        signature = inspect.signature(entry)
        # The existing progress owner added this optional observer before this sampler change.
        assert tuple(signature.parameters) == ("recipe", *keywords, "on_progress")
        assert signature.parameters["on_progress"].kind is inspect.Parameter.KEYWORD_ONLY
        assert signature.parameters["on_progress"].default is None
        assert signature.parameters["recipe"].kind is inspect.Parameter.POSITIONAL_OR_KEYWORD
        for name in keywords:
            parameter = signature.parameters[name]
            assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
            assert parameter.default is inspect.Parameter.empty
