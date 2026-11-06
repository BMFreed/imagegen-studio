"""Opaque regional IMG reuses Invoke's native Euler-a and independent step RNG.

Directly consulted InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd:
generation/core/canvas/compileCanvasGraph.ts builds the ordinary denoiser before
graftImageToImage/addRegionalGuidance; app/invocations/sd/denoise_latents.py's
init_scheduler selects the training-timestep window and a compute-device
Generator(seed ^ 0xFFFFFFFF). backend/stable_diffusion/schedulers/schedulers.py
maps euler_a to EulerAncestralDiscreteScheduler; diffusion_backend.py:step
forwards that generator to the original native scheduler.

The ordinary IMG factory owns replayable VAE-posterior and initial-noise draws.
Existing source/conditioning/ownership/PNG oracles are reused. Added observers
delegate original native methods and retain bounded small-fixture tensors;
the independent scheduler primitive checks observed transitions, not a copied
diffusion loop. Every consumption assertion follows actual PNG publication.
Removing the subject's xor must fail the named RNG mutation selector, while
the ordinary deterministic Euler image control stays GREEN.

These complete Python recipes are fixture setup, not genuine Main/trained or
visual-quality evidence. ROOT alone imports, executes and mutates the subject.
"""

from __future__ import annotations

import importlib
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from dataclasses import replace
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest

from imagegen_worker import generation_artifacts, inference
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from test_illustrious_regional_cfg_rescale import (
    _invoke_oracle,  # pyright: ignore[reportPrivateUsage]
    _observe_cfg,  # pyright: ignore[reportPrivateUsage]
    _reference_scheduler,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_dpmpp_2m import CPU_ENCODING, CUDA_ENCODING
from test_illustrious_regional_embeddings import CPU_ENCODING as PRIVATE_CPU_ENCODING
from test_illustrious_regional_embeddings import CUDA_ENCODING as PRIVATE_CUDA_ENCODING
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _assert_source_and_schedule,  # pyright: ignore[reportPrivateUsage]
    _clone,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _png,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_img2img import (
    _case as _image_case,  # pyright: ignore[reportPrivateUsage]
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

CPU = "ordinary-canvas-euler-ancestral-img2img-cpu-v1"
CUDA = "ordinary-canvas-euler-ancestral-img2img-cuda-fp16-v1"
CAPABILITY = "illustrious-regional-img2img-euler-a-v1"


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
    strength: float = 0.5,
    multiplier: float = 0.7,
    regional: bool = True,
    seed: int = 42,
    name: str = "ancestral-image",
) -> Any:
    recipe = _with_resources(_recipe(*((_region(),) if regional else ())))
    recipe["item"]["seed"] = seed
    case = _image_case(tmp_path, native, recipe=recipe, strength=strength, name=name)
    case.command = replace(case.command, scheduler="euler_a", cfg_rescale=multiplier)
    case.args["profile"] = CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING
    case.args["denoising_profile"] = CUDA if native.device == "cuda" else CPU
    return case


@contextmanager
def _observe(output: Any, native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any]:
    """Extend the existing image lifecycle view with original ancestral calls."""
    cls = native.diffusers.EulerAncestralDiscreteScheduler
    step, add_noise = cls.step, cls.add_noise
    pipeline_cls = native.diffusers.StableDiffusionXLImg2ImgPipeline
    prepare = pipeline_cls.prepare_extra_step_kwargs
    torch = native.torch
    with _image_observe(output, native, monkeypatch) as seen, monkeypatch.context() as patch:
        seen.preparations = []

        @wraps(prepare)
        def prepared(current: Any, generator: Any, eta: Any) -> Any:
            result = prepare(current, generator, eta)
            seen.preparations.append((current, generator, eta, dict(result)))
            return result

        @wraps(step)
        def stepped(current: Any, *args: Any, **kwargs: Any) -> Any:
            bound = inspect.signature(step).bind(current, *args, **kwargs)
            seen.steps.append(_clone(dict(bound.arguments), torch))
            return step(current, *args, **kwargs)

        @wraps(add_noise)
        def noised(current: Any, *args: Any, **kwargs: Any) -> Any:
            result = add_noise(current, *args, **kwargs)
            bound = inspect.signature(add_noise).bind(current, *args, **kwargs)
            seen.noises.append((_clone(dict(bound.arguments), torch), result.detach().clone()))
            return result

        patch.setattr(pipeline_cls, "prepare_extra_step_kwargs", prepared)
        patch.setattr(cls, "step", stepped)
        patch.setattr(cls, "add_noise", noised)
        with _observe_cfg(native, seen, monkeypatch):
            yield seen


def _assert_consumed(native: Any, case: Any, seen: Any) -> None:
    """Only called after publication; assert the three independent RNG streams."""
    torch, command = native.torch, case.command
    _assert_source_and_schedule(native, case, seen)
    fresh, options = seen.calls[0]
    assert "prepare_extra_step_kwargs" not in vars(fresh)
    assert "prepare_latents" not in vars(fresh)
    assert type(fresh.scheduler) is native.diffusers.EulerAncestralDiscreteScheduler
    assert fresh.scheduler is not native.pipeline.scheduler
    assert len(seen.preparations) == 1
    prepared_pipeline, prepared_initial, eta, original_options = seen.preparations[0]
    assert prepared_pipeline is fresh and prepared_initial is options["generator"] and eta == 0
    assert original_options["generator"] is prepared_initial
    full = [1 + index * (1000 // command.steps) for index in reversed(range(command.steps))]
    selected = [
        timestep for timestep in full if timestep < round(1000 * command.denoising_strength)
    ]
    assert len(seen.cfg_raw) == len(seen.cfg_steps) == len(selected)
    reference = _reference_scheduler(native, command)
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    reference.set_timesteps(command.steps, device=device)
    begin = len(full) - len(selected)
    reference.set_begin_index(begin)
    assert torch.equal(fresh.scheduler.timesteps, reference.timesteps)
    assert torch.equal(fresh.scheduler.sigmas, reference.sigmas)
    assert torch.equal(fresh.scheduler.betas, reference.betas)
    assert torch.equal(fresh.scheduler.alphas_cumprod, reference.alphas_cumprod)
    if not selected:
        assert seen.cfg_raw == seen.cfg_steps == []
        return

    step_generator = seen.cfg_steps[0].generator
    assert step_generator is not prepared_initial
    assert step_generator is not seen.posteriors[0][3]
    assert step_generator.device == device
    assert step_generator.initial_seed() == command.seed ^ 0xFFFFFFFF, (
        "native IMG ancestral steps lost Invoke's independent xor-seeded generator"
    )
    oracle_generator = torch.Generator(device=device).manual_seed(command.seed ^ 0xFFFFFFFF)
    rescale_changed = False
    for index, (raw, record, root, transition) in enumerate(
        zip(seen.cfg_raw, seen.cfg_steps, seen.forwards, seen.steps, strict=True)
    ):
        assert record.scheduler is fresh.scheduler
        assert record.generator is transition["generator"] is step_generator
        assert record.raw_count == index + 1
        assert raw.shape == (2, 4, 2, 3) and raw.dtype == native.dtype
        expected, guided = _invoke_oracle(torch, raw, command.cfg_scale, command.cfg_rescale)
        assert bool(torch.isfinite(expected).all())
        assert torch.equal(record.prediction, expected)
        assert torch.equal(transition["model_output"], expected)
        rescale_changed = rescale_changed or not torch.equal(expected, guided)
        timestep = reference.timesteps[begin + index]
        assert torch.equal(record.timestep, timestep) and torch.equal(root["timestep"], timestep)
        scaled = reference.scale_model_input(torch.cat((record.sample, record.sample)), timestep)
        assert torch.equal(root["sample"], scaled)
        assert torch.equal(record.rng_before, oracle_generator.get_state())
        expected_next = reference.step(
            expected, timestep, record.sample, generator=oracle_generator, return_dict=False
        )[0]
        assert torch.equal(record.result, expected_next), (
            "original IMG ancestral transition differs from its independent native oracle"
        )
        assert torch.equal(record.rng_after, oracle_generator.get_state())
        if index + 1 < len(selected):
            assert torch.equal(seen.cfg_steps[index + 1].sample, record.result)
    assert rescale_changed is (command.cfg_rescale > 0)
    assert torch.equal(step_generator.get_state(), oracle_generator.get_state())
    assert torch.equal(
        seen.decodes[0], seen.cfg_steps[-1].result / native.pipeline.vae.config.scaling_factor
    )


def _ordinary(native: Any, case: Any) -> Any:
    """Separate original IMG loop; no regional runner or ancestral scope helper."""
    assert case.recipe["regions"] == []
    parameters = _parameters(case)
    borrowed = native.pipeline
    pipeline = inference.img2img_pipeline_class(native.diffusers, native.torch)(
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


@pytest.mark.parametrize("multiplier", (0.0, 0.7))
@pytest.mark.parametrize("strength", (0.0, 0.5, 1.0))
def test_img_ancestral_original_window_streams_rescale_progress_and_published_rgb(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    multiplier: float,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, multiplier=multiplier, strength=strength)
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


def test_regional_img_ancestral_step_rng_mutation_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Xor removal must reach PNG publication before its native RNG oracle fails."""
    case = _case(tmp_path, lane, strength=1.0)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


def test_regional_img_euler_control_green(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Changing the ancestral generator cannot affect the original Euler image lane."""
    case = _case(tmp_path, lane, multiplier=0.0, regional=False)
    case.command = replace(case.command, scheduler="euler")
    case.args["denoising_profile"] = (
        "ordinary-canvas-euler-img2img-cuda-fp16-v1"
        if lane.device == "cuda"
        else "ordinary-canvas-euler-img2img-cpu-v1"
    )
    with _preserved(lane):
        ordinary = _ordinary_euler(lane, case)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    pixels = _png(lane, case, seen, done)
    _assert_euler(lane, case, seen)
    assert lane.torch.equal(seen.results[0][1], ordinary.images)
    assert pixels == _quantized_bytes(lane, ordinary.images)


@pytest.mark.parametrize("strength", (0.0, 0.5, 1.0))
def test_img_ancestral_zero_region_matches_independent_ordinary_pt_and_every_rgb(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    strength: float,
) -> None:
    case = _case(tmp_path, lane, regional=False, strength=strength)
    assert case.recipe["regions"] == []
    with _preserved(lane):
        ordinary = _ordinary(lane, case)
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    pixels = _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)
    assert lane.torch.equal(seen.results[0][1], ordinary.images)
    assert pixels == _quantized_bytes(lane, ordinary.images)


def test_img_ancestral_repeat_is_exact_and_changed_seed_has_fresh_local_streams(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    pixels: list[bytes] = []
    generators: list[Any] = []
    for index, seed in enumerate((42, 42, 43)):
        case = _case(tmp_path, lane, seed=seed, strength=1.0, name=f"repeat-{index}")
        with _observe(output, lane, monkeypatch) as seen:
            done = _generate(output, lane, case)
        pixels.append(_png(lane, case, seen, done))
        _assert_consumed(lane, case, seen)
        generators.append(seen.cfg_steps[0].generator)
    assert len({id(generator) for generator in generators}) == 3
    assert pixels[0] == pixels[1]
    assert pixels[0] != pixels[2], "image fixture did not discriminate the changed seed"


@pytest.mark.parametrize(
    "invalid,code",
    (
        ("deterministic-scheduler", "UNSUPPORTED"),
        ("dpm-scheduler", "UNSUPPORTED"),
        ("missing-policy", "INPUT_INVALID"),
        ("crossed-lane", "PROFILE_INVALID"),
        ("txt-profile", "PROFILE_INVALID"),
    ),
)
def test_img_ancestral_profile_refusal_precedes_target_or_native_work(
    tmp_path: Path,
    cpu: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    invalid: str,
    code: str,
) -> None:
    case = _case(tmp_path, cpu)
    if invalid == "deterministic-scheduler":
        case.command = replace(case.command, scheduler="euler")
    elif invalid == "dpm-scheduler":
        case.command = replace(case.command, scheduler="dpmpp_2m")
    elif invalid == "missing-policy":
        case.command = replace(case.command, noise_profile=None)
    elif invalid == "crossed-lane":
        case.args["denoising_profile"] = CUDA
    else:
        case.args["denoising_profile"] = "ordinary-canvas-euler-ancestral-txt2img-cpu-v1"
    accesses: list[str] = []

    def forbidden(**_kwargs: Any) -> Any:
        accesses.append("target")
        raise AssertionError("invalid ancestral IMG metadata reached target snapshot")

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
    assert accesses == hits == []
    assert set(case.root.iterdir()) == {case.target}


def test_img_ancestral_private_encoding_keeps_historical_zero_rescale_refusal(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, lane)
    case.args["profile"] = PRIVATE_CUDA_ENCODING if lane.device == "cuda" else PRIVATE_CPU_ENCODING
    with (
        _no_native(lane, monkeypatch) as hits,
        pytest.raises(lane.denoising.IllustriousRegionalDenoisingError) as caught,
    ):
        _generate(output, lane, case)
    assert caught.value.code == "UNSUPPORTED"
    assert str(caught.value) == "This first denoising profile requires CFG rescale zero."
    assert hits == [] and set(case.root.iterdir()) == {case.target}


@pytest.mark.parametrize("failure", ("encode", "later-unet", "decode", "publication"))
def test_img_ancestral_failure_preserves_state_and_fresh_request_recovers(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    case = _case(tmp_path, lane, strength=1.0)
    sentinel = RuntimeError(f"regional-ancestral-image-{failure}")
    calls: list[str] = []
    module = cast(
        Any, type(lane.pipeline.unet) if failure == "later-unet" else type(lane.pipeline.vae)
    )
    name = "forward" if failure == "later-unet" else "encode" if failure == "encode" else "decode"
    original = getattr(module, name)

    @wraps(original)
    def native_failure(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is (lane.pipeline.unet if failure == "later-unet" else lane.pipeline.vae):
            calls.append(name)
            if failure != "later-unet" or len(calls) == 3:
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
    assert len(calls) == (3 if failure == "later-unet" else 1)
    assert not case.command.output_path.exists() and not list(case.root.glob(".*.tmp"))
    assert set(case.root.iterdir()) == {case.target}
    with _observe(output, lane, monkeypatch) as seen:
        done = _generate(output, lane, case)
    _png(lane, case, seen, done)
    _assert_consumed(lane, case, seen)


def test_img_ancestral_ready_requires_explicit_image_combination_capability() -> None:
    module = importlib.import_module("imagegen_worker.inference_main")
    capabilities = cast(list[str], module.inference_ready_message()["capabilities"])
    assert CAPABILITY in capabilities
    assert "illustrious-regional-img2img-v1" in capabilities
    assert "illustrious-regional-invoke-init-v1" in capabilities
    assert "illustrious-regional-img2img-cfg-rescale-v1" in capabilities
