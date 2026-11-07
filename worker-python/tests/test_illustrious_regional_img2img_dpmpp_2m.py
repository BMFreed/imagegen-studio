"""Opaque IMG consumes Invoke's native DPM++ 2M window and multistep history.

Directly consulted InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts grafts
IMG before regional guidance and retains the scheduler; backend/stable_diffusion/
schedulers/schedulers.py maps Normal/Karras to DPMSolverMultistepScheduler with
solver_order2. app/invocations/sd/denoise_latents.py:get_scheduler/init_scheduler
selects the training-timestep cutoff and independent compute-device xor-seeded
step generator. diffusion_backend.py delegates source add_noise and every native
multistep update. Studio's existing ordinary IMG factory owns replayable source
posterior/noise draws; this does not claim whole-Invoke numerical parity.

The literal reference constructor and original native methods are reused, with
an independently selected begin index. No solver formula or diffusion loop is
copied. Observer assertions follow actual PNG publication. In particular the
named nonzero-begin mutation must publish before the source/history oracle turns
RED; the deterministic Euler image control remains independently GREEN.

These complete Python recipes and tiny random native models establish bounded
mechanics, not genuine Main/trained images or visual quality. Authorship permits
only AST/Ruff checks. ROOT owns imports, collection, execution and mutations.
"""

from __future__ import annotations

import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from dataclasses import replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker import generation_artifacts, inference
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from test_illustrious_regional_cfg_rescale import (
    _history,  # pyright: ignore[reportPrivateUsage]
    _invoke_oracle,  # pyright: ignore[reportPrivateUsage]
    _observe_cfg,  # pyright: ignore[reportPrivateUsage]
    _reference_scheduler,  # pyright: ignore[reportPrivateUsage]
    _same_history,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_dpmpp_2m import CPU_ENCODING, CUDA_ENCODING
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _same_recipe,  # pyright: ignore[reportPrivateUsage]
    _save,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _case as _image_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _clone,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _png,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _observe as _image_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _ordinary as _ordinary_euler,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img_cfg_rescale import (
    _assert_consumed as _assert_euler,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _aliases,  # pyright: ignore[reportPrivateUsage]
    _quantized_bytes,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)

CPU = "ordinary-canvas-dpmpp-2m-img2img-cpu-v1"
CUDA = "ordinary-canvas-dpmpp-2m-img2img-cuda-fp16-v1"
MODES = ("dpmpp_2m", "dpmpp_2m_k")
CAPABILITY = "illustrious-regional-img2img-dpmpp-2m-v1"


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


def _case(
    tmp_path: Path,
    native: Any,
    *,
    mode: str = MODES[0],
    strength: float = 0.5,
    steps: int = 4,
    multiplier: float = 0.7,
    regional: bool = True,
    recipe: Any = None,
    seed: int = 42,
    name: str = "dpm-image",
) -> Any:
    if recipe is None:
        recipe = _with_resources(_recipe(*((_region(),) if regional else ())))
    recipe["item"]["seed"] = seed
    case = _image_case(tmp_path, native, recipe=recipe, strength=strength, steps=steps, name=name)
    case.command = replace(case.command, scheduler=mode, cfg_rescale=multiplier)
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    case.args["denoising_profile"] = CUDA if native.device == "cuda" else CPU
    return case


@contextmanager
def _observe(output: Any, native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Original native IMG/CFG delegates plus absolute DPM index observations."""
    cls = native.diffusers.DPMSolverMultistepScheduler
    pipeline_cls = native.diffusers.StableDiffusionXLImg2ImgPipeline
    torch = native.torch
    with _image_observe(output, native, monkeypatch) as seen:
        # The shared CFG observer's DPM branch adds its original step to this
        # lifecycle journal. No copied transition or synthetic count is added.
        seen.events = []
        seen.schedules, seen.indices, seen.scaled, seen.preparations = [], [], [], []
        with _observe_cfg(native, seen, monkeypatch), monkeypatch.context() as patch:
            schedule = cls.set_timesteps
            step = cls.step
            add_noise = cls.add_noise
            scale = cls.scale_model_input
            prepare = pipeline_cls.prepare_extra_step_kwargs

            @wraps(schedule)
            def scheduled(current: Any, *args: Any, **kwargs: Any) -> Any:
                result = schedule(current, *args, **kwargs)
                seen.schedules.append(
                    SimpleNamespace(
                        scheduler=current,
                        timesteps=current.timesteps.detach().clone(),
                        sigmas=current.sigmas.detach().clone(),
                        history=_history(current),
                        lower=current.lower_order_nums,
                        index=current.step_index,
                        begin=current.begin_index,
                    )
                )
                return result

            @wraps(prepare)
            def prepared(current: Any, generator: Any, eta: Any) -> Any:
                result = prepare(current, generator, eta)
                seen.preparations.append((current, generator, eta, dict(result)))
                return result

            @wraps(add_noise)
            def noised(current: Any, *args: Any, **kwargs: Any) -> Any:
                bound = inspect.signature(add_noise).bind(current, *args, **kwargs)
                seen.noise_begin = current.begin_index
                result = add_noise(current, *args, **kwargs)
                seen.noises.append((_clone(dict(bound.arguments), torch), result.detach().clone()))
                return result

            @wraps(scale)
            def scaled(current: Any, sample: Any, *args: Any, **kwargs: Any) -> Any:
                result = scale(current, sample, *args, **kwargs)
                seen.scaled.append(
                    (sample.detach().clone(), result.detach().clone(), result is sample)
                )
                return result

            @wraps(step)
            def indexed(current: Any, *args: Any, **kwargs: Any) -> Any:
                bound = inspect.signature(step).bind(current, *args, **kwargs)
                bound.apply_defaults()
                record = SimpleNamespace(
                    values=_clone(dict(bound.arguments), torch),
                    before=current.step_index,
                    begin=current.begin_index,
                )
                result = step(current, *args, **kwargs)
                record.after = current.step_index
                seen.indices.append(record)
                return result

            def forbidden_txt_initializer(*_args: Any, **_kwargs: Any) -> Any:
                raise AssertionError("DPM image selected the TXT noise initializer")

            patch.setattr(pipeline_cls, "prepare_extra_step_kwargs", prepared)
            patch.setattr(cls, "set_timesteps", scheduled)
            patch.setattr(cls, "add_noise", noised)
            patch.setattr(cls, "scale_model_input", scaled)
            patch.setattr(cls, "step", indexed)
            patch.setattr(
                native.denoising, "_scoped_invoke_initialization", forbidden_txt_initializer
            )
            yield seen


def _assert_consumed(native: Any, case: Any, seen: Any) -> None:
    """Post-publication source/noising/history/CFG oracles; no Euler assumptions."""
    torch, command = native.torch, case.command
    numpy = pytest.importorskip("numpy")
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    fresh, options = seen.calls[0]
    scheduler = fresh.scheduler
    assert type(scheduler) is native.diffusers.DPMSolverMultistepScheduler
    assert scheduler is not native.pipeline.scheduler
    assert scheduler.order == 1 and scheduler.config.solver_order == 2
    assert scheduler.config.algorithm_type == "dpmsolver++"
    assert scheduler.config.solver_type == "midpoint"
    assert scheduler.config.use_karras_sigmas is (command.scheduler == MODES[1])
    assert scheduler.config.lower_order_final is True
    assert scheduler.config.euler_at_final is False
    assert scheduler.config.final_sigmas_type == "zero"
    assert "is_scale_input_called" not in vars(scheduler)
    assert "prepare_latents" not in vars(fresh)
    assert "prepare_extra_step_kwargs" not in vars(fresh)
    reference = _reference_scheduler(native, command)
    reference.set_timesteps(command.steps, device=device)
    full = reference.timesteps.tolist()
    cutoff = round(1000 * command.denoising_strength)
    begin = sum(timestep >= cutoff for timestep in full)
    selected = full[begin:]
    reference.set_begin_index(begin)
    assert len(seen.schedules) == 1
    schedule = seen.schedules[0]
    assert schedule.scheduler is scheduler
    assert schedule.timesteps.dtype == torch.int64 and schedule.timesteps.device == device
    assert schedule.sigmas.dtype == torch.float32 and schedule.sigmas.device.type == "cpu"
    assert torch.equal(schedule.timesteps, reference.timesteps)
    assert torch.equal(schedule.sigmas, reference.sigmas)
    assert torch.equal(scheduler.timesteps, reference.timesteps)
    assert torch.equal(scheduler.sigmas, reference.sigmas)
    assert torch.equal(scheduler.betas, reference.betas)
    assert torch.equal(scheduler.alphas_cumprod, reference.alphas_cumprod)
    assert schedule.history == (None, None) and schedule.lower == 0
    assert schedule.index is schedule.begin is None
    if command.scheduler == MODES[0]:
        assert full == [
            1 + index * (1000 // (command.steps + 1))
            for index in reversed(range(1, command.steps + 1))
        ]
    assert fresh.num_timesteps == len(selected)
    assert len(seen.cfg_raw) == len(seen.cfg_steps) == len(seen.indices) == len(selected)
    assert len(seen.forwards) == len(seen.steps) == len(seen.attention) == len(selected)
    assert len(seen.scaled) == len(selected)
    assert [int(item["timestep"].item()) for item in seen.forwards] == selected
    assert options["num_inference_steps"] == command.steps
    assert options["strength"] == command.denoising_strength
    assert options["guidance_rescale"] == command.cfg_rescale
    assert options["output_type"] == "pt"
    assert "height" not in options and "width" not in options
    assert len(seen.builds) == 1 + len(case.recipe["regions"])
    assert len(seen.encodes) == len(seen.posteriors) == len(seen.decodes) == 1
    assert seen.entries[0][1]["image"] is seen.validations[0][1]
    assert seen.entries[0][1]["image"].tobytes() == case.source.tobytes()
    assert options["image"] is seen.entries[0][1]["image"]
    array = numpy.asarray(case.source).astype(numpy.float32) / numpy.float32(255)
    normalized = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0) * 2.0 - 1.0
    assert torch.equal(seen.encodes[0], normalized.to(device=device, dtype=native.dtype))
    mean, std, posterior, posterior_generator, posterior_state = seen.posteriors[0]
    initial = options["generator"]
    assert posterior_generator is not initial
    assert posterior_generator.device.type == initial.device.type == "cpu"
    assert initial.initial_seed() == command.seed
    posterior_reference = torch.Generator(device="cpu").manual_seed(command.seed)
    assert torch.equal(posterior_state, posterior_reference.get_state())
    posterior_noise = torch.randn(
        mean.shape, generator=posterior_reference, dtype=mean.dtype, device="cpu"
    ).to(device)
    assert torch.equal(posterior, mean + std * posterior_noise)
    initial_reference = torch.Generator(device="cpu").manual_seed(command.seed)
    scale_factor = native.pipeline.vae.config.scaling_factor
    if not selected:
        assert seen.noises == seen.cfg_steps == seen.cfg_raw == seen.attention == []
        assert scheduler.step_index is None and scheduler.lower_order_nums == 0
        assert _history(scheduler) == (None, None)
        assert torch.equal(initial.get_state(), initial_reference.get_state())
        assert torch.equal(seen.decodes[0], (posterior * scale_factor) / scale_factor)
        return
    assert len(seen.noises) == len(seen.preparations) == 1
    arguments, noised = seen.noises[0]
    assert arguments["self"] is scheduler
    assert torch.equal(arguments["original_samples"], posterior * scale_factor)
    assert arguments["timesteps"].dtype == torch.int64
    assert arguments["timesteps"].tolist() == selected[:1]
    expected_noise = torch.randn(
        arguments["noise"].shape,
        generator=initial_reference,
        device="cpu",
        dtype=native.dtype,
    ).to(device)
    assert torch.equal(arguments["noise"], expected_noise)
    assert torch.equal(initial.get_state(), initial_reference.get_state())
    expected_initial = reference.add_noise(
        posterior * scale_factor, expected_noise, reference.timesteps[begin : begin + 1]
    )
    assert torch.equal(noised, expected_initial), "DPM IMG noised the source at a wrong sigma"
    assert torch.equal(seen.cfg_steps[0].sample, expected_initial)
    assert scheduler.begin_index == begin, "DPM IMG lost its nonzero selected-window begin index"
    assert seen.noise_begin == begin
    prepared_pipeline, prepared_initial, eta, original_options = seen.preparations[0]
    assert prepared_pipeline is fresh and prepared_initial is initial and eta == 0
    assert original_options["generator"] is initial
    step_generator = seen.cfg_steps[0].generator
    assert step_generator is not initial and step_generator is not posterior_generator
    assert step_generator.device == device
    assert step_generator.initial_seed() == command.seed ^ 0xFFFFFFFF
    oracle_generator = torch.Generator(device=device).manual_seed(command.seed ^ 0xFFFFFFFF)
    rescale_changed = False
    for index, (raw, record, root, position, scaled) in enumerate(
        zip(
            seen.cfg_raw,
            seen.cfg_steps,
            seen.forwards,
            seen.indices,
            seen.scaled,
            strict=True,
        )
    ):
        timestep = reference.timesteps[begin + index]
        assert record.scheduler is scheduler and record.generator is step_generator
        assert record.raw_count == index + 1
        assert raw.shape == (2, 4, 2, 3) and raw.dtype == native.dtype
        expected, guided = _invoke_oracle(torch, raw, command.cfg_scale, command.cfg_rescale)
        assert bool(torch.isfinite(expected).all()) and torch.equal(record.prediction, expected)
        rescale_changed = rescale_changed or not torch.equal(expected, guided)
        assert root["timestep"].dtype == record.timestep.dtype == torch.int64
        assert torch.equal(root["timestep"], timestep) and torch.equal(record.timestep, timestep)
        assert scaled[2] is True and torch.equal(scaled[0], scaled[1])
        assert torch.equal(root["sample"], torch.cat((record.sample, record.sample)))
        assert position.begin == begin
        assert position.before == (None if index == 0 else begin + index)
        assert position.after == begin + index + 1
        assert position.values["generator"] is step_generator
        assert position.values["variance_noise"] is None
        assert record.lower_before == min(index, 2)
        assert record.lower_after == min(index + 1, 2)
        _same_history(torch, record.history_before, _history(reference))
        assert torch.equal(record.rng_before, oracle_generator.get_state())
        expected_next = reference.step(
            expected, timestep, record.sample, generator=oracle_generator, return_dict=False
        )[0]
        assert torch.equal(record.result, expected_next), "DPM IMG lost native multistep history"
        _same_history(torch, record.history_after, _history(reference))
        assert torch.equal(record.rng_before, record.rng_after)
        assert torch.equal(record.rng_after, oracle_generator.get_state())
        if index + 1 < len(selected):
            assert torch.equal(seen.cfg_steps[index + 1].sample, record.result)
    assert rescale_changed is (command.cfg_rescale > 0)
    assert scheduler.step_index == command.steps
    assert scheduler.lower_order_nums == min(len(selected), 2)
    assert torch.equal(step_generator.get_state(), oracle_generator.get_state())
    assert torch.equal(seen.decodes[0], seen.cfg_steps[-1].result / scale_factor)
    if case.recipe["regions"]:
        assert all(mask is not None for mask in seen.attention)
    else:
        assert all(mask is None for mask in seen.attention)


def _ordinary(native: Any, case: Any) -> Any:
    """Original IMG loop with an independently selected native DPM window."""
    assert case.recipe["regions"] == []
    parameters, borrowed = _parameters(case), native.pipeline
    base = inference.img2img_pipeline_class(native.diffusers, native.torch)

    class ReferenceWindowPipeline(base):
        def get_timesteps(
            self,
            num_inference_steps: int,
            strength: float,
            device: Any,
            denoising_start: float | None = None,
        ) -> tuple[Any, int]:
            assert denoising_start is None and num_inference_steps == parameters.steps
            full = self.scheduler.timesteps
            first = sum(value >= round(1000 * strength) for value in full.tolist())
            self.scheduler.set_begin_index(first)
            return full[first:], len(full) - first

    pipeline = ReferenceWindowPipeline(
        vae=borrowed.vae,
        text_encoder=borrowed.text_encoder,
        text_encoder_2=borrowed.text_encoder_2,
        tokenizer=borrowed.tokenizer,
        tokenizer_2=borrowed.tokenizer_2,
        unet=borrowed.unet,
        scheduler=_reference_scheduler(native, case.command),
        add_watermarker=False,
        force_zeros_for_empty_prompt=True,
    )
    pipeline.set_progress_bar_config(disable=True)
    original = pipeline.prepare_extra_step_kwargs
    device = native.torch.device("cuda:0" if native.device == "cuda" else "cpu")
    step_generator = native.torch.Generator(device=device).manual_seed(parameters.seed ^ 0xFFFFFFFF)

    @wraps(original)
    def step_options(generator: Any, eta: Any) -> dict[str, Any]:
        return {**original(generator, eta), "generator": step_generator}

    conditioning = inference.build_sdxl_conditioning(
        parameters,
        borrowed,
        native.runtime,
        embedding_inputs=EmbeddingConditioningInputs(
            (parameters.positive_prompt, parameters.negative_prompt), (None, None)
        ),
    )
    pipeline.prepare_extra_step_kwargs = step_options
    try:
        return inference.run_sdxl_pipeline(
            pipeline,
            conditioning,
            width=case.command.width,
            height=case.command.height,
            steps=parameters.steps,
            cfg_scale=parameters.cfg_scale,
            cfg_rescale=parameters.cfg_rescale,
            generator=native.torch.Generator(device="cpu").manual_seed(parameters.seed),
            torch=native.torch,
            image=case.source,
            denoising_strength=case.command.denoising_strength,
            output_type="pt",
        )
    finally:
        pipeline.__dict__.pop("prepare_extra_step_kwargs", None)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("strength", (0.0, 0.5, 1.0))
def test_img_dpm_original_window_history_rescale_progress_and_published_rgb(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, mode=mode, strength=strength)
    progress: list[tuple[int, int, int]] = []
    with _observe(output, lane, monkeypatch) as seen:

        def on_progress(completed: int, total: int) -> None:
            progress.append((completed, total, len(seen.cfg_steps)))

        case.args["on_progress"] = on_progress
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    count = len(seen.cfg_steps)
    assert progress == [(index, count, index) for index in range(1, count + 1)]


def test_img_dpm_nonzero_begin_index_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A valid begin-index0 substitution must publish before the oracle fails."""
    case = _case(tmp_path, lane, strength=0.5, steps=30)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    assert len(seen.cfg_steps) == 15
    assert [int(item["timestep"].item()) for item in seen.forwards] == list(range(481, 1, -32))


def test_img_euler_begin_index_control_green(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A DPM-only begin substitution must not affect ordinary deterministic IMG."""
    case = _case(tmp_path, lane, multiplier=0.0, regional=False)
    case.command = replace(case.command, scheduler="euler")
    case.args["denoising_profile"] = (
        "ordinary-canvas-euler-img2img-cuda-fp16-v1"
        if lane.device == "cuda"
        else "ordinary-canvas-euler-img2img-cpu-v1"
    )
    with _preserved(lane):
        ordinary = _ordinary_euler(lane, case)
    with _image_observe(output, lane, monkeypatch) as seen, _observe_cfg(lane, seen, monkeypatch):
        done = _generate(output, lane, case)
    pixels = _png(lane, case, seen, done)
    _assert_euler(lane, case, seen)
    assert lane.torch.equal(seen.results[0][1], ordinary.images)
    assert pixels == _quantized_bytes(lane, ordinary.images)


def test_img_dpm_karras_thirty_steps_filter_actual_grid_not_step_fraction(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane, mode=MODES[1], strength=0.5, steps=30)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    reference = _reference_scheduler(lane, case.command)
    reference.set_timesteps(30, device=lane.pipeline.vae.device)
    expected = [int(value) for value in reference.timesteps.tolist() if value < 500]
    assert [int(value["timestep"].item()) for value in seen.forwards] == expected
    assert len(expected) != int(30 * case.command.denoising_strength)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("strength", (0.0, 0.5))
def test_img_dpm_zero_region_matches_original_ordinary_pt_and_every_rgb(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, mode=mode, regional=False, strength=strength)
    with _preserved(lane):
        ordinary = _ordinary(lane, case)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    pixels = _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    assert lane.torch.equal(seen.results[0][1], ordinary.images)
    assert pixels == _quantized_bytes(lane, ordinary.images)


@pytest.mark.parametrize("mode", MODES)
def test_img_dpm_repeat_is_exact_and_changed_seed_has_fresh_streams(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    pixels: list[bytes] = []
    generators: list[Any] = []
    for index, seed in enumerate((42, 42, 43)):
        case = _case(tmp_path, lane, mode=mode, seed=seed, strength=1.0, name=f"repeat-{index}")
        with _observe(output, lane, monkeypatch) as seen:
            done = _generate(output, lane, case)
        pixels.append(_png(lane, case, seen, done))
        _assert_consumed(lane, case, seen)
        generators.append(seen.cfg_steps[0].generator)
    assert len({id(generator) for generator in generators}) == 3
    assert pixels[0] == pixels[1]
    assert pixels[0] != pixels[2], "tiny DPM image fixture did not discriminate the changed seed"


@pytest.mark.parametrize(
    "invalid,code",
    (
        ("euler", "UNSUPPORTED"),
        ("ancestral", "UNSUPPORTED"),
        ("sde", "UNSUPPORTED"),
        ("missing-policy", "INPUT_INVALID"),
        ("crossed-lane", "PROFILE_INVALID"),
        ("txt-profile", "PROFILE_INVALID"),
    ),
)
def test_img_dpm_profile_refusal_precedes_target_and_native_work(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
    code: str,
) -> None:
    case = _case(tmp_path, cpu)
    if invalid in ("euler", "ancestral", "sde"):
        case.command = replace(
            case.command,
            scheduler={"euler": "euler", "ancestral": "euler_a", "sde": "dpmpp_2m_sde_k"}[invalid],
        )
    elif invalid == "missing-policy":
        case.command = replace(case.command, noise_profile=None)
    elif invalid == "crossed-lane":
        case.args["denoising_profile"] = CUDA
    else:
        case.args["denoising_profile"] = "ordinary-canvas-dpmpp-2m-invoke-init-txt2img-cpu-v1"
    accesses: list[str] = []

    def forbidden(**_kwargs: Any) -> Any:
        accesses.append("target")
        raise AssertionError("invalid DPM image metadata reached target verification")

    with (
        monkeypatch.context() as patch,
        _no_native(cpu, patch) as hits,
        _aliases(patch, generation_artifacts.validate_generation_target, forbidden),
        pytest.raises(
            (cpu.denoising.IllustriousRegionalDenoisingError, output.IllustriousRegionalOutputError)
        ) as caught,
    ):
        _generate(output, cpu, case)
    assert caught.value.code == code
    assert accesses == hits == [] and set(case.root.iterdir()) == {case.target}


@pytest.mark.parametrize(
    "failure", ("encode", "later-unet", "native-step", "decode", "publication")
)
def test_img_dpm_failure_preserves_borrowed_state_and_fresh_request_recovers(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    case = _case(tmp_path, lane, strength=1.0)
    sentinel = RuntimeError(f"regional-dpm-image-{failure}")
    calls: list[str] = []
    if failure == "native-step":
        module = lane.diffusers.DPMSolverMultistepScheduler
        name = "step"
    else:
        module = cast(
            Any, type(lane.pipeline.unet) if failure == "later-unet" else type(lane.pipeline.vae)
        )
        name = (
            "forward" if failure == "later-unet" else "encode" if failure == "encode" else "decode"
        )
    original = getattr(module, name)

    @wraps(original)
    def native_failure(current: Any, *args: Any, **kwargs: Any) -> Any:
        if failure == "native-step" or current is (
            lane.pipeline.unet if failure == "later-unet" else lane.pipeline.vae
        ):
            calls.append(name)
            if failure not in ("later-unet", "native-step") or len(calls) == 3:
                raise sentinel
        return original(current, *args, **kwargs)

    def publication_failure(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("publication")
        raise sentinel

    with monkeypatch.context() as patch:
        if failure == "publication":
            with (
                _aliases(patch, generation_artifacts.publish_generation_image, publication_failure),
                pytest.raises(RuntimeError) as caught,
            ):
                _generate(output, lane, case)
        else:
            patch.setattr(module, name, native_failure)
            with pytest.raises(RuntimeError) as caught:
                _generate(output, lane, case)
        assert caught.value is sentinel
    assert len(calls) == (3 if failure in ("later-unet", "native-step") else 1)
    assert not case.command.output_path.exists() and not list(case.root.glob(".*.tmp"))
    assert set(case.root.iterdir()) == {case.target}
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


@pytest.mark.parametrize("mode", MODES)
def test_img_dpm_uses_recipe_owned_exact_vectors_on_private_text_tables(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
) -> None:
    first, regional = _save(tmp_path, lane, 1), _save(tmp_path, lane, 3)
    case = _case(tmp_path, lane, mode=mode, recipe=_same_recipe(first, regional))
    loader = importlib.import_module(
        "diffusers.loaders.textual_inversion"
    ).TextualInversionLoaderMixin
    original = loader.load_textual_inversion
    loaded: list[tuple[int, int]] = []

    @wraps(original)
    def installed(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(current, *args, **kwargs)
        encoder, tokenizer = kwargs["text_encoder"], kwargs["tokenizer"]
        assert encoder not in (lane.pipeline.text_encoder, lane.pipeline.text_encoder_2)
        for alias, rows in zip(kwargs["token"], args[0], strict=True):
            ids = [
                tokenizer.convert_tokens_to_ids(alias if index == 0 else f"{alias}_{index}")
                for index in range(rows.shape[0])
            ]
            actual = encoder.get_input_embeddings().weight[ids]
            assert lane.torch.equal(actual, rows.to(device=actual.device))
        loaded.append((encoder.config.hidden_size, len(kwargs["token"])))
        return result

    with monkeypatch.context() as patch:
        patch.setattr(loader, "load_textual_inversion", installed)
        with _observe(output, lane, monkeypatch) as seen:
            done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    assert loaded == [(768, 2), (1280, 2)]


def test_img_dpm_ready_requires_the_explicit_image_dpm_combination() -> None:
    module = importlib.import_module("imagegen_worker.inference_main")
    capabilities = cast(list[str], module.inference_ready_message()["capabilities"])
    assert CAPABILITY in capabilities
    assert "illustrious-regional-img2img-v1" in capabilities
    assert "illustrious-regional-dpmpp-2m-v1" in capabilities
    assert "illustrious-regional-img2img-cfg-rescale-v1" in capabilities
