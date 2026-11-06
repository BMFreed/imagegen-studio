"""Authored native DPM++ 2M contracts; ROOT alone imports and executes.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd is the source:
backend/stable_diffusion/schedulers/schedulers.py, app/invocations/sd/
denoise_latents.py:get_scheduler/init_scheduler/prepare_noise_and_latents,
app/invocations/latent_noise.py and backend/stable_diffusion/diffusion_backend.py.
The retained Diffusers 0.40.0 scheduler and SDXL pipeline establish native state,
integer timesteps, order1 callbacks and order2 multistep history. These tests
delegate their original methods; neither subject nor oracle copies a loop.

The mutation selector publishes first, then compares reopened RGB against a
separate original native pipeline with an independently authored Invoke noise
preparation. Replacing add_noise with noise*init_noise_sigma must be semantic
RED after PNG publication. The named legacy control remains independently valid.
Complete Python recipe fixtures and tiny random native models establish bounded
mechanics, not genuine Main production, trained quality, Anima or capacity.
Only AST/Ruff checks are authorized during authorship. Runtime is ROOT-owned.
"""

from __future__ import annotations

import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager, nullcontext
from dataclasses import replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.protocol import IllustriousNoiseProfile
from test_illustrious_regional_denoising import (
    _copy_tensors,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _bind,  # pyright: ignore[reportPrivateUsage]
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _save,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_invoke_initialization import (
    _failure,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_invoke_initialization import (
    test_legacy_profiles_initialization_control_green as _legacy_control,
)
from test_illustrious_regional_lora import (
    CLIP2_PATH,
    _pair,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_lora import (
    _save as _save_lora,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _assert_png,  # pyright: ignore[reportPrivateUsage]
    _case,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _observe as _output_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_sampling import (
    _literal_training,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _assert_published as _assert_vae_png,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _case as _vae_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _generate as _generate_vae,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _observe as _vae_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_vae import (
    _prepare as _prepare_vae,  # pyright: ignore[reportPrivateUsage]
)

CPU = "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cpu-v1"
CUDA = "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-fp16-v1"
CUDA_VAE = "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cuda-vae-v1"
CPU_ENCODING = "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cpu-v1"
CUDA_ENCODING = "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
MODES = ("dpmpp_2m", "dpmpp_2m_k")


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


def _policy(rescale: bool = False, spacing: str = "leading") -> IllustriousNoiseProfile:
    return IllustriousNoiseProfile(
        rescale_betas_zero_snr=rescale,
        timestep_spacing=cast(Any, spacing),
    )


def _dpm_case(
    tmp_path: Path,
    native: Any,
    *,
    mode: str = MODES[0],
    steps: int = 4,
    regional: bool = True,
    recipe: Any = None,
    name: str = "stage",
) -> Any:
    if recipe is None:
        recipe = _with_resources(_recipe(*((_region(),) if regional else ())))
    case = _case(tmp_path, native, recipe=recipe, steps=steps, name=name)
    case.command = replace(case.command, scheduler=mode, noise_profile=_policy())
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    case.args["denoising_profile"] = CUDA if native.device == "cuda" else CPU
    return case


def _reference_scheduler(native: Any, command: Any) -> Any:
    """Independent literal constructor; never the production selector/profile helpers."""
    noise = command.noise_profile
    return native.diffusers.DPMSolverMultistepScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        timestep_spacing=noise.timestep_spacing,
        rescale_betas_zero_snr=noise.rescale_betas_zero_snr,
        prediction_type="epsilon",
        algorithm_type="dpmsolver++",
        solver_order=2,
        use_karras_sigmas=command.scheduler == "dpmpp_2m_k",
    )


def _history(native: Any, scheduler: Any) -> tuple[Any, ...]:
    return tuple(
        None if value is None else value.detach().clone() for value in scheduler.model_outputs
    )


def _equal_history(native: Any, actual: tuple[Any, ...], expected: tuple[Any, ...]) -> None:
    assert len(actual) == len(expected) == 2
    for left, right in zip(actual, expected, strict=True):
        if right is None:
            assert left is None
        else:
            assert left is not None and native.torch.equal(left, right)


@contextmanager
def _dpm_observe(native: Any, seen: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[None]:
    """Observe actual state immediately around the original native methods."""
    cls = native.diffusers.DPMSolverMultistepScheduler
    pipeline_cls = cast(Any, type(native.pipeline))
    originals = {
        name: getattr(cls, name)
        for name in ("set_timesteps", "add_noise", "step", "scale_model_input")
    }
    prepare = pipeline_cls.prepare_extra_step_kwargs
    randn = native.torch.randn
    seen.dpm_schedules, seen.additions, seen.raw_draws = [], [], []
    seen.dpm_steps, seen.scaled, seen.preparations = [], [], []
    seen.original_randn = randn

    @wraps(originals["set_timesteps"])
    def schedule(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = originals["set_timesteps"](current, *args, **kwargs)
        seen.dpm_schedules.append(
            SimpleNamespace(
                scheduler=current,
                timesteps=current.timesteps.detach().clone(),
                sigmas=current.sigmas.detach().clone(),
                history=_history(native, current),
                lower=current.lower_order_nums,
                index=current.step_index,
                begin=current.begin_index,
            )
        )
        return result

    @wraps(prepare)
    def preparation(current: Any, generator: Any, eta: Any) -> Any:
        result = prepare(current, generator, eta)
        seen.preparations.append((current, generator, eta, dict(result)))
        return result

    @wraps(randn)
    def draw(*args: Any, **kwargs: Any) -> Any:
        rng: Any = kwargs.get("generator")
        selected = bool(seen.generators) and rng is seen.generators[0]
        before = rng.get_state().clone() if selected else None
        result = randn(*args, **kwargs)
        if selected:
            seen.raw_draws.append(
                SimpleNamespace(
                    value=result.detach().clone(),
                    args=args,
                    kwargs=dict(kwargs),
                    before=before,
                    after=rng.get_state().clone(),
                )
            )
        return result

    @wraps(originals["add_noise"])
    def addition(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(originals["add_noise"]).bind(current, *args, **kwargs)
        record = SimpleNamespace(
            values=_copy_tensors(native, dict(bound.arguments)),
            history_before=_history(native, current),
            lower_before=current.lower_order_nums,
            index_before=current.step_index,
            begin_before=current.begin_index,
            scheduler=current,
        )
        result = originals["add_noise"](current, *args, **kwargs)
        record.result = result.detach().clone()
        record.history_after = _history(native, current)
        record.lower_after, record.index_after = current.lower_order_nums, current.step_index
        record.begin_after = current.begin_index
        seen.additions.append(record)
        return result

    @wraps(originals["scale_model_input"])
    def scale(current: Any, sample: Any, *args: Any, **kwargs: Any) -> Any:
        result = originals["scale_model_input"](current, sample, *args, **kwargs)
        seen.scaled.append((sample.detach().clone(), result.detach().clone(), result is sample))
        return result

    @wraps(originals["step"])
    def step(current: Any, *args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(originals["step"]).bind(current, *args, **kwargs)
        bound.apply_defaults()
        values = dict(bound.arguments)
        rng = values["generator"]
        record = SimpleNamespace(
            values=_copy_tensors(native, values),
            history_before=_history(native, current),
            lower_before=current.lower_order_nums,
            index_before=current.step_index,
            begin_before=current.begin_index,
            rng_before=rng.get_state().clone(),
        )
        seen.steps.append(record.values)
        seen.events.append("step")
        result = originals["step"](current, *args, **kwargs)
        value: Any = (
            cast(tuple[Any, ...], result)[0] if isinstance(result, tuple) else result.prev_sample
        )
        record.result = value.detach().clone()
        record.history_after = _history(native, current)
        record.lower_after, record.index_after = current.lower_order_nums, current.step_index
        record.rng_after = rng.get_state().clone()
        seen.dpm_steps.append(record)
        return cast(Any, result)

    with monkeypatch.context() as patch:
        for name, method in (
            ("set_timesteps", schedule),
            ("add_noise", addition),
            ("step", step),
            ("scale_model_input", scale),
        ):
            patch.setattr(cls, name, method)
        patch.setattr(pipeline_cls, "prepare_extra_step_kwargs", preparation)
        patch.setattr(native.torch, "randn", draw)
        yield


def _assert_dpm(native: Any, case: Any, seen: Any) -> None:
    """All assertions follow actual native completion/publication."""
    torch = native.torch
    command, steps = case.command, case.command.steps
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    assert len(seen.pipelines) == len(seen.schedulers) == len(seen.dpm_schedules) == 1
    fresh, scheduler = seen.pipelines[0], seen.schedulers[0]
    assert fresh is not native.pipeline and scheduler is not native.pipeline.scheduler
    assert type(scheduler) is native.diffusers.DPMSolverMultistepScheduler
    assert scheduler.order == 1 and scheduler.config.solver_order == 2
    assert scheduler.config.algorithm_type == "dpmsolver++"
    assert scheduler.config.use_karras_sigmas is (command.scheduler == "dpmpp_2m_k")
    assert scheduler.config.prediction_type == "epsilon"
    assert "is_scale_input_called" not in vars(scheduler), "DPM acquired an invented Euler flag"
    assert "prepare_latents" not in vars(fresh)
    assert "prepare_extra_step_kwargs" not in vars(fresh)
    reference = _reference_scheduler(native, command)
    reference.set_timesteps(steps, device=device)
    schedule = seen.dpm_schedules[0]
    assert schedule.scheduler is scheduler
    assert schedule.timesteps.dtype == torch.int64 and schedule.timesteps.device == device
    assert torch.equal(schedule.timesteps, reference.timesteps)
    assert schedule.sigmas.dtype == torch.float32 and schedule.sigmas.device.type == "cpu"
    assert torch.equal(schedule.sigmas, reference.sigmas)
    assert schedule.history == (None, None) and schedule.lower == 0
    assert schedule.index is schedule.begin is None
    beta, cumulative = _literal_training(torch, command.noise_profile.rescale_betas_zero_snr)
    assert torch.equal(scheduler.betas, beta) and torch.equal(scheduler.alphas_cumprod, cumulative)
    if command.scheduler == "dpmpp_2m" and command.noise_profile.timestep_spacing == "leading":
        assert schedule.timesteps.tolist() == [
            1 + index * (1000 // (steps + 1)) for index in reversed(range(1, steps + 1))
        ]

    assert len(seen.raw_draws) == len(seen.generators) == 1
    raw, initial = seen.raw_draws[0], seen.generators[0]
    assert initial.device.type == "cpu" and initial.initial_seed() == command.seed
    assert raw.kwargs["generator"] is initial and raw.kwargs["dtype"] == torch.float32
    assert torch.device(raw.kwargs["device"]).type == "cpu"
    rng = torch.Generator(device="cpu").manual_seed(command.seed)
    assert torch.equal(raw.before, rng.get_state())
    expected_raw = seen.original_randn(
        (1, 4, 2, 3), generator=rng, dtype=torch.float32, device="cpu"
    )
    assert torch.equal(raw.value, expected_raw) and torch.equal(raw.after, rng.get_state())
    assert torch.equal(initial.get_state(), rng.get_state())
    noise = expected_raw.to(device="cpu", dtype=native.dtype).to(device)
    sigma = reference.sigmas[:1].to(device=device, dtype=native.dtype).reshape(1, 1, 1, 1)
    alpha = 1 / (sigma**2 + 1) ** 0.5
    expected_initial = (sigma * alpha) * noise
    assert len(seen.additions) == 1
    addition = seen.additions[0]
    assert addition.scheduler is scheduler
    assert addition.history_before == addition.history_after == (None, None)
    assert addition.lower_before == addition.lower_after == 0
    assert addition.index_before is addition.index_after is None
    assert addition.begin_before is addition.begin_after is None
    assert torch.equal(addition.values["original_samples"], torch.zeros_like(noise))
    assert torch.equal(addition.values["noise"], noise)
    assert addition.values["timesteps"].dtype == torch.int64
    assert torch.equal(addition.values["timesteps"], reference.timesteps[:1])
    assert torch.equal(addition.result, expected_initial), (
        "actual native add_noise used wrong input"
    )
    assert not torch.equal(expected_initial, noise * scheduler.init_noise_sigma)
    assert len(seen.dpm_steps) == len(seen.root_inputs) == len(seen.unet_results) == steps
    assert len(seen.scaled) == steps
    assert len(seen.decodes) == 1 and seen.decode_reserved == [True]
    assert seen.events == [name for _ in range(steps) for name in ("unet", "step")] + ["decode"]
    assert torch.equal(seen.dpm_steps[0].values["sample"], expected_initial)
    step_rng = seen.dpm_steps[0].values["generator"]
    assert step_rng is not initial and step_rng.device == device
    assert step_rng.initial_seed() == command.seed ^ 0xFFFFFFFF
    assert len(seen.preparations) == 1
    prepared_pipeline, prepared_rng, eta, prepared_kwargs = seen.preparations[0]
    assert prepared_pipeline is fresh and prepared_rng is initial and eta == 0.0
    assert prepared_kwargs["generator"] is initial
    xor = torch.Generator(device=device).manual_seed(command.seed ^ 0xFFFFFFFF)
    for index, (record, root, prediction, scaled) in enumerate(
        zip(seen.dpm_steps, seen.root_inputs, seen.unet_results, seen.scaled, strict=True)
    ):
        values, timestep = record.values, reference.timesteps[index]
        assert values["generator"] is step_rng and values["variance_noise"] is None
        assert values["timestep"].dtype == root["timestep"].dtype == torch.int64
        assert values["timestep"].item() == root["timestep"].item() == timestep.item()
        assert scaled[2] is True
        assert torch.equal(scaled[0], scaled[1])
        assert torch.equal(root["sample"], torch.cat((values["sample"], values["sample"])))
        raw_prediction: Any = (
            cast(tuple[Any, ...], prediction)[0]
            if isinstance(prediction, tuple)
            else prediction.sample
        )
        negative, positive = cast(tuple[Any, Any], raw_prediction.chunk(2))
        guided: Any = negative + command.cfg_scale * (positive - negative)
        assert torch.equal(values["model_output"], guided)
        assert record.lower_before == min(index, 2)
        assert record.lower_after == min(index + 1, 2)
        assert record.index_before == (None if index == 0 else index)
        assert record.index_after == index + 1 and record.begin_before == 0
        _equal_history(native, record.history_before, _history(native, reference))
        assert torch.equal(record.rng_before, xor.get_state())
        expected = reference.step(
            guided, timestep, values["sample"], generator=xor, return_dict=False
        )[0]
        assert torch.equal(record.result, expected), "native DPM++ 2M lost multistep history"
        _equal_history(native, record.history_after, _history(native, reference))
        assert torch.equal(record.rng_before, record.rng_after)
        assert torch.equal(record.rng_after, xor.get_state()), "deterministic DPM consumed step RNG"
        if index + 1 < steps:
            assert torch.equal(seen.dpm_steps[index + 1].values["sample"], record.result)
    assert scheduler.step_index == steps and scheduler.lower_order_nums == min(steps, 2)
    assert torch.equal(step_rng.get_state(), xor.get_state())
    assert len(seen.builds) == (1 if not case.recipe["regions"] else 2)


def _ordinary_oracle(native: Any, case: Any, seen: Any) -> Any:
    """A second original native loop, with authored Invoke preparation only."""
    assert case.recipe["regions"] == []
    scheduler = _reference_scheduler(native, case.command)
    cls = native.diffusers.StableDiffusionXLPipeline
    pipeline = cls(
        vae=native.pipeline.vae,
        text_encoder=native.pipeline.text_encoder,
        text_encoder_2=native.pipeline.text_encoder_2,
        tokenizer=native.pipeline.tokenizer,
        tokenizer_2=native.pipeline.tokenizer_2,
        unet=native.pipeline.unet,
        scheduler=scheduler,
        add_watermarker=False,
        force_zeros_for_empty_prompt=True,
    )
    pipeline.set_progress_bar_config(disable=True)
    original = pipeline.prepare_latents

    @wraps(original)
    def preparation(*args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(original).bind(*args, **kwargs)
        bound.apply_defaults()
        values = bound.arguments
        assert values["latents"] is None
        shape = (
            values["batch_size"],
            values["num_channels_latents"],
            values["height"] // 8,
            values["width"] // 8,
        )
        draw = native.torch.randn(
            shape, generator=values["generator"], device="cpu", dtype=native.torch.float32
        )
        noise = draw.to(device="cpu", dtype=values["dtype"]).to(values["device"])
        return scheduler.add_noise(native.torch.zeros_like(noise), noise, scheduler.timesteps[:1])

    pipeline.prepare_latents = preparation
    options = {
        key: value
        for key, value in seen.pipeline_inputs[0].items()
        if key not in {"generator", "callback_on_step_end", "callback_on_step_end_tensor_inputs"}
    }
    options["generator"] = native.torch.Generator(device="cpu").manual_seed(case.command.seed)
    try:
        with _preserved(native):
            return pipeline(**options)
    finally:
        pipeline.__dict__.pop("prepare_latents", None)


def test_dpmpp_2m_invoke_initialization_mutation_red(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Actual PNG precedes independent native-output/consumption assertions."""
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _dpm_case(tmp_path, lane, regional=False)
    with _output_observe(output, lane, monkeypatch) as seen, _dpm_observe(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    actual_rgb = _assert_png(lane, case, seen, done)
    expected = _ordinary_oracle(lane, case, seen)
    assert actual_rgb == _quantized_bytes(lane, expected.images), (
        "published DPM RGB lost Invoke initialization"
    )
    assert lane.torch.equal(seen.pipeline_results[0].images, expected.images)
    _assert_dpm(lane, case, seen)


def test_legacy_euler_initialization_control_green(
    lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    _legacy_control(lane, monkeypatch)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("steps", (1, 2, 4))
def test_dpmpp_2m_original_timeline_history_and_published_pixels(
    tmp_path: Path, lane: Any, monkeypatch: pytest.MonkeyPatch, mode: str, steps: int
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _dpm_case(tmp_path, lane, mode=mode, steps=steps)
    events: list[tuple[int, int]] = []

    def on_progress(completed: int, total: int) -> None:
        events.append((completed, total))

    case.args["on_progress"] = on_progress
    with _output_observe(output, lane, monkeypatch) as seen, _dpm_observe(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    del case.args["on_progress"]  # the existing PNG oracle enumerates public non-progress fields
    _assert_png(lane, case, seen, done)
    _assert_dpm(lane, case, seen)
    assert events == [(index + 1, steps) for index in range(steps)]


@pytest.mark.parametrize(
    "rescale,spacing",
    ((False, "leading"), (False, "linspace"), (False, "trailing"), (True, "leading")),
)
def test_dpmpp_2m_consumes_explicit_noise_policy(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, rescale: bool, spacing: str
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _dpm_case(tmp_path, cpu)
    case.command = replace(case.command, noise_profile=_policy(rescale, spacing))
    with _output_observe(output, cpu, monkeypatch) as seen, _dpm_observe(cpu, seen, monkeypatch):
        done = _generate(output, cpu, case)
    _assert_png(cpu, case, seen, done)
    _assert_dpm(cpu, case, seen)


@pytest.mark.parametrize("mode", MODES)
def test_dpmpp_2m_ignores_and_preserves_hostile_borrowed_scheduler(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    original = cpu.pipeline.scheduler
    hostile = cpu.diffusers.DPMSolverMultistepScheduler(
        algorithm_type="sde-dpmsolver++",
        solver_order=3,
        use_karras_sigmas=not mode.endswith("_k"),
        timestep_spacing="trailing",
        beta_schedule="linear",
        beta_start=0.001,
        beta_end=0.09,
    )
    hostile.set_timesteps(3)
    hostile.step(
        cpu.torch.zeros(1, 4, 2, 3),
        hostile.timesteps[0],
        cpu.torch.ones(1, 4, 2, 3),
        generator=cpu.torch.Generator(device="cpu").manual_seed(9),
    )
    cpu.pipeline.scheduler = hostile
    try:
        case = _dpm_case(tmp_path, cpu, mode=mode)
        with (
            _output_observe(output, cpu, monkeypatch) as seen,
            _dpm_observe(cpu, seen, monkeypatch),
        ):
            done = _generate(output, cpu, case)
        assert cpu.pipeline.scheduler is hostile
        _assert_png(cpu, case, seen, done)
        _assert_dpm(cpu, case, seen)
    finally:
        cpu.pipeline.scheduler = original


_INVALID = (
    ("missing-policy", "INPUT_INVALID"),
    ("wrong-policy-version", "INPUT_INVALID"),
    ("policy-extra", "INPUT_INVALID"),
    ("boolean-steps", "INPUT_INVALID"),
    ("zero-steps", "INPUT_INVALID"),
    ("too-many-steps", "INPUT_INVALID"),
    ("fractional-steps", "INPUT_INVALID"),
    ("prediction", "UNSUPPORTED"),
    ("euler-command", "UNSUPPORTED"),
    ("sde-command", "UNSUPPORTED"),
    ("rescale", "INPUT_INVALID"),
    ("noninvoke-encoding", "PROFILE_INVALID"),
    ("crossed-lane", "PROFILE_INVALID"),
    ("private-profile", "UNSUPPORTED"),
    ("bad-policy-spacing", "INPUT_INVALID"),
    ("nonbool-noise-transform", "INPUT_INVALID"),
    ("string-step", "INPUT_INVALID"),
)


@pytest.mark.parametrize("invalid,code", _INVALID)
def test_dpmpp_2m_refusal_precedes_model_work(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, invalid: str, code: str
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _dpm_case(tmp_path, cpu)
    noise = _policy()
    changes: dict[str, Any] = {
        "missing-policy": {"noise_profile": None},
        "boolean-steps": {"steps": True},
        "zero-steps": {"steps": 0},
        "too-many-steps": {"steps": 201},
        "fractional-steps": {"steps": 2.5},
        "prediction": {"prediction_type": "v_prediction"},
        "euler-command": {"scheduler": "euler"},
        "sde-command": {"scheduler": "dpmpp_sde"},
        "rescale": {"cfg_rescale": 1.0},
        "string-step": {"steps": "4"},
    }.get(invalid, {})
    if invalid in {
        "wrong-policy-version",
        "policy-extra",
        "bad-policy-spacing",
        "nonbool-noise-transform",
    }:
        object.__setattr__(
            noise,
            {
                "wrong-policy-version": "schema_version",
                "policy-extra": "extra",
                "bad-policy-spacing": "timestep_spacing",
                "nonbool-noise-transform": "rescale_betas_zero_snr",
            }[invalid],
            {
                "wrong-policy-version": 2,
                "policy-extra": True,
                "bad-policy-spacing": "Leading",
                "nonbool-noise-transform": 0,
            }[invalid],
        )
        changes["noise_profile"] = noise
    if invalid == "noninvoke-encoding":
        case.args["profile"] = "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cpu-v1"
    elif invalid == "crossed-lane":
        case.args["denoising_profile"] = CUDA
    elif invalid == "private-profile":
        case.args["denoising_profile"] = "ordinary-canvas-euler-txt2img-cpu-v2"
    case.command = replace(case.command, **changes)
    with _no_native(cpu, monkeypatch, no_reads=True) as hits, pytest.raises(ValueError) as caught:
        _generate(output, cpu, case)
    assert getattr(caught.value, "code", None) == code
    assert hits == [] and not case.command.output_path.exists()
    assert set(case.root.iterdir()) == {case.target}


@pytest.mark.parametrize("steps", (1, 200))
def test_dpmpp_2m_exact_step_endpoints_preflight_without_a_long_loop(cpu: Any, steps: int) -> None:
    parameters = _parameters(scheduler="dpmpp_2m", steps=steps, noise_profile=_policy())
    detached = cpu.denoising._denoising_parameters(  # pyright: ignore[reportPrivateUsage]
        parameters, resolved_noise=True, dpmpp_2m=True
    )
    assert detached == parameters.noise_profile and detached is not parameters.noise_profile


@pytest.mark.parametrize("mode", MODES)
def test_dpmpp_2m_prepared_fp32_vae_retains_latent_decode_owner(
    tmp_path: Path, cuda: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    original = cuda.pipeline.vae
    try:
        case = _vae_case(cuda, tmp_path, "FP32", external=True)
        case.args["denoising_profile"] = CUDA_VAE
        case.command = replace(case.command, scheduler=mode, steps=4)
        _prepare_vae(cuda, case.command, native_upcast=False)
        with _vae_observe(cuda, monkeypatch) as seen, _dpm_observe(cuda, seen, monkeypatch):
            done = _generate_vae(cuda, case)
        _assert_vae_png(cuda, case, seen, done)
        _assert_dpm(cuda, case, seen)
        assert len(seen.builds) == 2 and seen.pipeline_inputs[0]["output_type"] == "latent"
    finally:
        cuda.pipeline.vae = original


def _resource_case(tmp_path: Path, native: Any, *, mode: str = MODES[0]) -> Any:
    from imagegen_worker.illustrious_regional_lora import prepare_regional_loras

    state = _pair(native.torch, native.pipeline, CLIP2_PATH)
    lora = _save_lora(tmp_path / "global-lora.safetensors", state, -0.5)
    prepare_regional_loras(native.pipeline, (lora,), native.torch)
    a, b = _save(tmp_path, native, 11), _save(tmp_path, native, 22)
    recipe = _with_resources(_recipe(_region(positive="SAME"), positive="SAME"))
    _bind(recipe, None, "positive", a)
    _bind(recipe, 0, "positive", b)
    case = _dpm_case(tmp_path, native, mode=mode, recipe=recipe)
    # The real preparation above owns fusion; borrowed execution receives prepared weights.
    assert case.command.loras == ()
    return case


@pytest.mark.parametrize("mode", MODES)
def test_dpmpp_2m_consumes_exact_global_regional_ti_on_prepared_lora_source(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    with _models("cpu") as native:
        output = importlib.import_module("imagegen_worker.illustrious_regional_output")
        case = _resource_case(tmp_path, native, mode=mode)
        loader = importlib.import_module(
            "diffusers.loaders.textual_inversion"
        ).TextualInversionLoaderMixin
        original = loader.load_textual_inversion
        loaded: list[Any] = []

        @wraps(original)
        def consume(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = original(current, *args, **kwargs)
            assert current is not native.pipeline
            encoder, tokenizer = kwargs["text_encoder"], kwargs["tokenizer"]
            assert encoder not in (native.pipeline.text_encoder, native.pipeline.text_encoder_2)
            for alias, values in zip(kwargs["token"], args[0], strict=True):
                ids = [
                    tokenizer.convert_tokens_to_ids(alias if index == 0 else f"{alias}_{index}")
                    for index in range(values.shape[0])
                ]
                assert native.torch.equal(encoder.get_input_embeddings().weight[ids], values)
            loaded.append((encoder.config.hidden_size, tuple(kwargs["token"])))
            return result

        with monkeypatch.context() as patch:
            patch.setattr(loader, "load_textual_inversion", consume)
            with (
                _output_observe(output, native, monkeypatch) as seen,
                _dpm_observe(native, seen, monkeypatch),
            ):
                done = _generate(output, native, case)
        _assert_png(native, case, seen, done)
        _assert_dpm(native, case, seen)
        assert [width for width, _ in loaded] == [768, 1280]
        assert len(loaded[0][1]) == len(loaded[1][1]) == 2
        assert (
            case.recipe["globalEmbeddings"]["positive"]
            != case.recipe["regions"][0]["embeddings"]["positive"]
        )


@pytest.mark.parametrize(
    "stage", ("add-noise", "unet", "step", "decode", "conversion", "publication")
)
def test_dpmpp_2m_failure_restores_and_fresh_publication_recovers(
    tmp_path: Path, cpu: Any, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    output = importlib.import_module("imagegen_worker.illustrious_regional_output")
    case = _dpm_case(tmp_path, cpu)
    sentinel = (
        OSError("authored DPM publisher sync failure")
        if stage == "publication"
        else RuntimeError(f"authored DPM failure after {stage}")
    )
    original: Any = None
    owner: Any = None
    fail_method: Any = None
    method = ""
    calls: list[Any] = []
    if stage in {"add-noise", "step"}:
        owner, method = (
            cpu.diffusers.DPMSolverMultistepScheduler,
            "add_noise" if stage == "add-noise" else "step",
        )
    elif stage == "conversion":
        owner, method = (
            importlib.import_module("diffusers.image_processor").VaeImageProcessor,
            "numpy_to_pil",
        )
    else:
        owner = None
    if owner is not None:
        original = getattr(owner, method)

        @wraps(original)
        def fail(*args: Any, **kwargs: Any) -> Any:
            result = original(*args, **kwargs)
            calls.append(result)
            if stage != "step" or len(calls) == 2:
                raise sentinel
            return result

        fail_method = fail

    with monkeypatch.context() as patch:
        if owner is not None:
            patch.setattr(
                owner,
                method,
                staticmethod(fail_method) if stage == "conversion" else fail_method,
            )
            scope: Any = nullcontext()
        else:
            scope = _failure(cpu, monkeypatch, stage, sentinel)
        with (
            scope,
            _output_observe(output, cpu, monkeypatch) as failed,
            _dpm_observe(cpu, failed, monkeypatch),
            pytest.raises((RuntimeError, DerivativeError)) as caught,
        ):
            _generate(output, cpu, case)
    if stage == "publication":
        assert isinstance(caught.value, DerivativeError)
        assert (
            caught.value.code == "GENERATION_WORKER_FAILED" and caught.value.__cause__ is sentinel
        )
    else:
        assert caught.value is sentinel
    assert failed.receipts == [] and not case.command.output_path.exists()
    assert set(case.root.iterdir()) == {case.target}
    assert "prepare_latents" not in vars(failed.pipelines[0])
    assert "prepare_extra_step_kwargs" not in vars(failed.pipelines[0])
    with (
        _output_observe(output, cpu, monkeypatch) as recovered,
        _dpm_observe(cpu, recovered, monkeypatch),
    ):
        done = _generate(output, cpu, case)
    _assert_png(cpu, case, recovered, done)
    _assert_dpm(cpu, case, recovered)


@pytest.mark.parametrize("stage", ("first-ti-load", "later-encoding"))
def test_dpmpp_2m_partial_ti_failure_releases_then_healthy_call_recovers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, stage: str
) -> None:
    with _models("cpu") as native:
        output = importlib.import_module("imagegen_worker.illustrious_regional_output")
        case = _resource_case(tmp_path, native)
        sentinel = RuntimeError(f"authored DPM {stage} failure")
        loader = importlib.import_module(
            "diffusers.loaders.textual_inversion"
        ).TextualInversionLoaderMixin
        inference = importlib.import_module("imagegen_worker.inference")
        original = (
            loader.load_textual_inversion
            if stage == "first-ti-load"
            else inference._clip_embeddings
        )
        count = 0

        @wraps(original)
        def fail(*args: Any, **kwargs: Any) -> Any:
            nonlocal count
            result = original(*args, **kwargs)
            count += 1
            if count == (1 if stage == "first-ti-load" else 5):
                raise sentinel
            return result

        with monkeypatch.context() as patch:
            if stage == "first-ti-load":
                patch.setattr(loader, "load_textual_inversion", fail)
            else:
                patch.setattr(inference, "_clip_embeddings", fail)
            with pytest.raises(Exception) as caught:
                _generate(output, native, case)
        assert count == (1 if stage == "first-ti-load" else 5)
        if stage == "first-ti-load":
            assert getattr(caught.value, "code", None) == "GENERATION_EMBEDDING_UNSUPPORTED"
            assert caught.value.__cause__ is sentinel
        else:
            assert caught.value is sentinel
        assert not case.command.output_path.exists() and set(case.root.iterdir()) == {case.target}
        with (
            _output_observe(output, native, monkeypatch) as seen,
            _dpm_observe(native, seen, monkeypatch),
        ):
            done = _generate(output, native, case)
        _assert_png(native, case, seen, done)
        _assert_dpm(native, case, seen)
