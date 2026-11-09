"""Authored finite V-prediction regional contracts; ROOT owns execution/mutation.

InvokeAI b0ac163b139c432aff4c51078c31c074bf292f72 routes the resolved UNet
objective into its existing scheduler (app/invocations/sd/denoise_latents.py).
These tests delegate original native dual-CLIP/attention/UNet/Euler/VAE/PNG owners;
canonical Python recipes do not establish the separate genuine Main seam.

ROOT's semantic mutant changes only the fresh V scheduler to epsilon AFTER
admission/config validation. test_v_prediction_native_objective_red must finish
PNG publication, then fail native-transition association. The unchanged
test_epsilon_native_objective_control_green must still finish GREEN. Independent
literal-policy Euler primitives consume the observed predictions/latents, not a
second denoising loop. No production formula, native result or pixel is replaced.

Only AST and scoped Ruff checks are allowed in authorship. Native tests, typing,
trained checkpoint/resource identity, whole-Main fixtures and mutations are unrun
here, with no quality/public-readiness claim.
"""

from __future__ import annotations

import copy
import dataclasses
import importlib
from collections.abc import Iterator
from functools import wraps
from pathlib import Path
from typing import Any, Literal, cast

import pytest

from imagegen_worker.inference import build_sdxl_conditioning
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from imagegen_worker.protocol import IllustriousNoiseProfile
from test_illustrious_regional_denoising import (
    _observe as _native_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _arguments,  # pyright: ignore[reportPrivateUsage]
    _models,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    PLAIN_CPU,
    PLAIN_CUDA,
    _assert_png,  # pyright: ignore[reportPrivateUsage]
    _before_filework,  # pyright: ignore[reportPrivateUsage]
    _case,  # pyright: ignore[reportPrivateUsage]
    _generate,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_output import (
    _observe as _publication_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    LAYOUTS,
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_sampling import (
    POLICIES,
    _literal_grid,  # pyright: ignore[reportPrivateUsage]
    _literal_training,  # pyright: ignore[reportPrivateUsage]
    _transitions,  # pyright: ignore[reportPrivateUsage]
)

CPU_V = "ordinary-canvas-euler-v-prediction-txt2img-cpu-v1"
CUDA_V = "ordinary-canvas-euler-v-prediction-txt2img-cuda-fp16-v1"
CUDA_VAE_V = "ordinary-canvas-euler-v-prediction-txt2img-cuda-vae-v1"
CPU_EPS = "ordinary-canvas-euler-txt2img-cpu-v2"
CUDA_EPS = "ordinary-canvas-euler-txt2img-cuda-fp16-v2"


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
    return IllustriousNoiseProfile(
        rescale, cast(Literal["leading", "linspace", "trailing"], spacing)
    )


def _profile(native: Any, *, epsilon: bool = False) -> str:
    return (
        (CUDA_EPS if epsilon else CUDA_V)
        if native.device == "cuda"
        else (CPU_EPS if epsilon else CPU_V)
    )


def _output_case(tmp_path: Path, native: Any, *, epsilon: bool = False, **changes: Any) -> Any:
    case = _case(tmp_path, native, steps=changes.pop("steps", 3), **changes)
    case.command = dataclasses.replace(
        case.command,
        prediction_type="epsilon" if epsilon else "v_prediction",
        noise_profile=_noise(),
    )
    case.args["denoising_profile"] = _profile(native, epsilon=epsilon)
    return case


def _assert_objective(
    native: Any,
    seen: Any,
    *,
    objective: str,
    rescale: bool = False,
    spacing: str = "leading",
) -> None:
    """Independent native primitives check every actual transition after publication."""
    torch, numpy = native.torch, pytest.importorskip("numpy")
    assert len(seen.schedulers) == len(seen.pipelines) == len(seen.pipeline_results) == 1
    scheduler = seen.schedulers[0]
    device = torch.device("cuda:0" if native.device == "cuda" else "cpu")
    beta, cumulative = _literal_training(torch, rescale)
    grid = _literal_grid(numpy, 3, spacing)
    assert torch.equal(scheduler.betas, beta) and torch.equal(scheduler.alphas_cumprod, cumulative)
    assert scheduler.timesteps.tolist() == grid.tolist()
    oracle = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        prediction_type=objective,
        timestep_spacing=spacing,
        rescale_betas_zero_snr=rescale,
    )
    opposite = native.diffusers.EulerDiscreteScheduler(
        num_train_timesteps=1000,
        beta_start=0.00085,
        beta_end=0.012,
        beta_schedule="scaled_linear",
        trained_betas=None,
        steps_offset=1,
        prediction_type="epsilon" if objective == "v_prediction" else "v_prediction",
        timestep_spacing=spacing,
        rescale_betas_zero_snr=rescale,
    )
    oracle.set_timesteps(3, device=device)
    opposite.set_timesteps(3, device=device)
    assert torch.equal(scheduler.sigmas, oracle.sigmas)
    assert scheduler is not native.pipeline.scheduler and seen.pipelines[0] is not native.pipeline
    cfg = seen.pipeline_inputs[0]["guidance_scale"]
    noise = torch.randn(
        (1, 4, 2, 3),
        generator=torch.Generator(device="cpu").manual_seed(42),
        dtype=native.dtype,
        device="cpu",
    ).to(device)
    assert torch.equal(seen.steps[0]["sample"], noise * oracle.init_noise_sigma)
    discriminated = False
    assert len(seen.root_inputs) == len(seen.steps) == len(seen.transition_results) == 3
    for index, (root, unet, transition, actual) in enumerate(
        zip(seen.root_inputs, seen.unet_results, seen.steps, seen.transition_results, strict=True)
    ):
        sample = transition["sample"]
        timestep = oracle.timesteps[index]
        assert transition["timestep"].item() == grid[index]
        batch = torch.cat((sample, sample)) if cfg > 1 else sample
        assert torch.equal(root["sample"], oracle.scale_model_input(batch, timestep))
        prediction = cast(tuple[Any, ...], unet)[0] if isinstance(unet, tuple) else unet.sample
        if cfg > 1:
            negative, positive = cast(tuple[Any, ...], prediction.chunk(2))
            prediction = negative + cfg * (positive - negative)
        assert torch.equal(transition["model_output"], prediction)
        opposite.scale_model_input(batch, timestep)
        other = opposite.step(prediction, timestep, sample, return_dict=False)[0]
        expected = oracle.step(prediction, timestep, sample, return_dict=False)[0]
        discriminated |= not torch.equal(expected, other)
        assert torch.equal(actual, expected), "native Euler consumed the wrong prediction objective"
        assert torch.isfinite(actual).all() and actual.dtype == native.dtype
        if index + 1 < 3:
            assert torch.equal(seen.steps[index + 1]["sample"], actual)
    assert discriminated, "fixture must distinguish V and epsilon on real native inputs"
    assert scheduler.config.prediction_type == objective
    assert torch.equal(
        seen.decodes[0],
        seen.transition_results[-1].to(dtype=next(native.pipeline.vae.parameters()).dtype)
        / native.pipeline.vae.config.scaling_factor,
    )
    assert len(seen.decodes) == len(seen.decode_results) == 1
    assert seen.decode_reserved == [True]


@pytest.mark.parametrize("rescale,spacing", POLICIES)
def test_v_prediction_six_noise_policies_use_original_native_euler(
    lane: Any, monkeypatch: pytest.MonkeyPatch, rescale: bool, spacing: str
) -> None:
    recipe = _recipe(_region())
    args = _arguments(lane, recipe, steps=3)
    args["profile"] = PLAIN_CUDA if lane.device == "cuda" else PLAIN_CPU
    args["denoising_profile"] = _profile(lane)
    args["parameters"] = dataclasses.replace(
        args["parameters"], prediction_type="v_prediction", noise_profile=_noise(rescale, spacing)
    )
    before = copy.deepcopy(recipe), copy.deepcopy(args["parameters"])
    with (
        _preserved(lane),
        _native_observe(lane.denoising, lane, monkeypatch) as seen,
        _transitions(lane, seen, monkeypatch),
    ):
        result = lane.denoising.run_current_canvas_regional_denoising(recipe, **args)
    assert result is seen.pipeline_results[0]
    _assert_objective(lane, seen, objective="v_prediction", rescale=rescale, spacing=spacing)
    assert recipe == before[0] and args["parameters"] == before[1]
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]
    assert len(seen.clips) == 8 and len(seen.outputs) == 3


def test_v_prediction_native_objective_red(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _output_case(tmp_path, lane)
    with (
        _publication_observe(output, lane, monkeypatch) as seen,
        _transitions(lane, seen, monkeypatch),
    ):
        receipt = _generate(output, lane, case)
    # The valid wrong-objective mutant must reach real finite decode/publication.
    _assert_png(lane, case, seen, receipt)
    assert len(seen.publications) == 1 and case.command.output_path.is_file()
    _assert_objective(lane, seen, objective="v_prediction")


def test_epsilon_native_objective_control_green(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _output_case(tmp_path, lane, epsilon=True)
    with (
        _publication_observe(output, lane, monkeypatch) as seen,
        _transitions(lane, seen, monkeypatch),
    ):
        receipt = _generate(output, lane, case)
    _assert_png(lane, case, seen, receipt)
    _assert_objective(lane, seen, objective="epsilon")


@pytest.mark.parametrize("layout", LAYOUTS)
def test_v_prediction_zero_regions_equal_independent_original_pipeline(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch, layout: str
) -> None:
    case = _output_case(tmp_path, lane, recipe=_recipe(), layout=layout)
    with _publication_observe(output, lane, monkeypatch) as seen:
        receipt = _generate(output, lane, case)
    _assert_png(lane, case, seen, receipt)
    command = case.command
    torch = lane.torch
    with _preserved(lane):
        encoded = build_sdxl_conditioning(
            command,
            lane.pipeline,
            lane.runtime,
            embedding_inputs=EmbeddingConditioningInputs(
                (command.positive_prompt, command.negative_prompt), (None, None)
            ),
        )
        scheduler = lane.diffusers.EulerDiscreteScheduler(
            num_train_timesteps=1000,
            beta_start=0.00085,
            beta_end=0.012,
            beta_schedule="scaled_linear",
            trained_betas=None,
            steps_offset=1,
            prediction_type="v_prediction",
            timestep_spacing="leading",
            rescale_betas_zero_snr=False,
        )
        ordinary = lane.diffusers.StableDiffusionXLPipeline(
            vae=lane.pipeline.vae,
            text_encoder=lane.pipeline.text_encoder,
            text_encoder_2=lane.pipeline.text_encoder_2,
            tokenizer=lane.pipeline.tokenizer,
            tokenizer_2=lane.pipeline.tokenizer_2,
            unet=lane.pipeline.unet,
            scheduler=scheduler,
            add_watermarker=False,
        )
        ordinary.set_progress_bar_config(disable=True)
        result = ordinary(
            prompt_embeds=encoded.positive,
            negative_prompt_embeds=encoded.negative,
            pooled_prompt_embeds=encoded.positive_pooled,
            negative_pooled_prompt_embeds=encoded.negative_pooled,
            width=24,
            height=16,
            num_inference_steps=3,
            guidance_scale=command.cfg_scale,
            guidance_rescale=0.0,
            num_images_per_prompt=1,
            original_size=(1024, 1024),
            target_size=(1024, 1024),
            negative_original_size=(1024, 1024),
            negative_target_size=(1024, 1024),
            crops_coords_top_left=(0, 0),
            negative_crops_coords_top_left=(0, 0),
            generator=torch.Generator(device="cpu").manual_seed(command.seed),
            output_type="pt",
        )
    assert torch.equal(result.images, seen.pt_inputs[0][1])
    # Reopened PNG bytes must be the independent original pipeline quantization.
    from PIL import Image

    with Image.open(case.command.output_path) as image:
        actual = image.convert("RGB").tobytes()
    expected = (result.images[0].detach().cpu().float().permute(1, 2, 0).numpy() * 255).round()
    assert actual == expected.astype("uint8").tobytes()
    assert receipt["type"] == "generation-done"


@pytest.mark.parametrize(
    "invalid",
    (
        "old-epsilon-profile",
        "epsilon-in-v-profile",
        "sample",
        "missing-noise",
        "ancestral",
        "dpm",
        "steps-bool",
        "crossed-lane",
    ),
)
def test_v_prediction_malformed_or_crossed_profiles_refuse_before_filework(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    case = _output_case(tmp_path, cpu)
    changes: dict[str, Any] = {}
    if invalid == "old-epsilon-profile":
        case.args["denoising_profile"] = CPU_EPS
    elif invalid == "crossed-lane":
        case.args["denoising_profile"] = CUDA_V
    else:
        changes.update(
            {
                "epsilon-in-v-profile": {"prediction_type": "epsilon"},
                "sample": {"prediction_type": "sample"},
                "missing-noise": {"noise_profile": None},
                "ancestral": {"scheduler": "euler_a"},
                "dpm": {"scheduler": "dpmpp_2m"},
                "steps-bool": {"steps": True},
            }[invalid]
        )
    case.command = dataclasses.replace(case.command, **changes)
    with (
        _before_filework(cpu, monkeypatch),
        pytest.raises(
            (output.IllustriousRegionalOutputError, cpu.denoising.IllustriousRegionalDenoisingError)
        ) as caught,
    ):
        output.generate_current_canvas_regional_txt2img(
            case.recipe, command=case.command, **case.args
        )
    assert caught.value.code in {"PROFILE_INVALID", "UNSUPPORTED", "INPUT_INVALID"}
    assert not case.command.output_path.exists()


@pytest.mark.parametrize("stage", ("later-unet", "decode"))
def test_v_prediction_native_failure_restores_and_fresh_request_recovers(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    case = _output_case(tmp_path, lane)
    sentinel = RuntimeError("declared v-prediction native failure")
    target = lane.pipeline.unet if stage == "later-unet" else lane.pipeline.vae
    name = "forward" if stage == "later-unet" else "decode"
    original = getattr(cast(Any, type(target)), name)
    count = 0

    @wraps(original)
    def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
        nonlocal count
        if current is target:
            count += 1
            if count == (2 if stage == "later-unet" else 1):
                raise sentinel
        return original(current, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(cast(Any, type(target)), name, fail)
        with pytest.raises(RuntimeError) as caught:
            _generate(output, lane, case)
    assert caught.value is sentinel and not case.command.output_path.exists()
    assert count == (2 if stage == "later-unet" else 1)
    assert _generate(output, lane, case)["type"] == "generation-done"


@pytest.mark.parametrize("precision", ("FP16", "FP32"))
def test_v_prediction_prepared_cuda_vae_reuses_existing_owner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, precision: str
) -> None:
    from test_illustrious_regional_vae import (
        _case as vae_case,  # pyright: ignore[reportPrivateUsage]
    )
    from test_illustrious_regional_vae import (
        _generate as vae_generate,  # pyright: ignore[reportPrivateUsage]
    )
    from test_illustrious_regional_vae import (
        _prepare as prepare,  # pyright: ignore[reportPrivateUsage]
    )

    with _models("cuda") as native:
        case = vae_case(native, tmp_path, precision)
        case.command = dataclasses.replace(case.command, prediction_type="v_prediction", steps=3)
        case.args["denoising_profile"] = CUDA_VAE_V
        prepare(native, case.command, native_upcast=False)
        with (
            _native_observe(native.denoising, native, monkeypatch) as seen,
            _transitions(native, seen, monkeypatch),
        ):
            receipt = vae_generate(native, case)
        assert receipt["type"] == "generation-done" and case.command.output_path.is_file()
        _assert_objective(native, seen, objective="v_prediction")


@pytest.mark.parametrize("precision", ("FP16", "FP32"))
def test_worker_selects_explicit_v_prediction_profile_and_capability(precision: str) -> None:
    from imagegen_worker import illustrious_regional_worker as worker
    from imagegen_worker import inference_main
    from test_illustrious_regional_recipe import (
        _parameters,  # pyright: ignore[reportPrivateUsage]
    )

    parameters = _parameters(
        prediction_type="v_prediction",
        scheduler="euler",
        noise_profile=_noise(),
        vae_precision=precision,
    )
    assert worker._denoising_profile(  # pyright: ignore[reportPrivateUsage]
        parameters, composition_profile="invoke-canvas-v1"
    ) == (CUDA_V if precision == "FP16" else CUDA_VAE_V)
    assert "illustrious-regional-v-prediction-v1" in cast(
        list[str], inference_main.inference_ready_message()["capabilities"]
    )


@pytest.mark.parametrize(
    "changes,kwargs",
    (
        ({"scheduler": "dpmpp_2m_sde"}, {"img2img": True}),
        ({}, {"img2img": True, "outpaint": True}),
        ({"scheduler": "euler_a"}, {}),
        ({"scheduler": "dpmpp_2m"}, {}),
        ({}, {"initialization_profile": "invoke-cpu-f32-add-noise-v1"}),
        ({}, {"composition_profile": None}),
    ),
)
def test_worker_refuses_unsupported_v_prediction_combinations_before_loading(
    changes: dict[str, Any], kwargs: dict[str, Any]
) -> None:
    from imagegen_worker import illustrious_regional_worker as worker
    from imagegen_worker.derivatives import DerivativeError
    from test_illustrious_regional_recipe import (
        _parameters,  # pyright: ignore[reportPrivateUsage]
    )

    values: dict[str, Any] = {
        "prediction_type": "v_prediction",
        "scheduler": "euler",
        "noise_profile": _noise(),
        **changes,
    }
    parameters = _parameters(**values)
    options: dict[str, Any] = {"composition_profile": "invoke-canvas-v1", **kwargs}
    with pytest.raises(DerivativeError) as caught:
        worker._denoising_profile(parameters, **options)  # pyright: ignore[reportPrivateUsage]
    assert caught.value.code == "INVALID_REQUEST"
