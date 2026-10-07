"""Exact-profile wire, native beta/step numerics and refusal before model loading.

The solver and real tensors stay production-owned. Independent beta equations
and fixed grids detect ignored controls even when ConfigMixin retains their flags.
CPU fixtures prove execution semantics, not trained-model author-recipe quality.
"""

from __future__ import annotations

import importlib.metadata
from dataclasses import replace
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any, Literal, cast

import pytest

from imagegen_worker import inference
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import MLRuntime, select_inference_scheduler
from imagegen_worker.inference_main import process_inference_request
from imagegen_worker.protocol import (
    GenerateIllustriousTxt2ImgCommand,
    IllustriousNoiseProfile,
    parse_request,
    process_request,
)
from test_generation_protocol import generation_request, set_nested
from test_inference_boundary import illustrious_command
from test_outpaint_worker import illus_wire

Spacing = Literal["leading", "linspace", "trailing"]


def profile_wire(rescale: bool = True, spacing: Spacing = "trailing") -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "baseSchedule": "sdxl-scaled-linear-v1",
        "rescaleBetasZeroSnr": rescale,
        "timestepSpacing": spacing,
    }


@pytest.mark.parametrize("operation", ["txt2img", "img2img", "outpaint"])
def test_noise_profile_wire_is_captured_for_all_modes_and_missing_stays_legacy(
    tmp_path: Path, operation: str
) -> None:
    request = illus_wire(tmp_path) if operation == "outpaint" else generation_request(tmp_path)
    request["type"] = f"generate-illustrious-{operation}"
    if operation == "img2img":
        set_nested(request, ("job", "sampling", "denoisingStrength"), 0.75)
    legacy = parse_request(request)
    assert isinstance(legacy, GenerateIllustriousTxt2ImgCommand)
    assert legacy.noise_profile is None
    raw_profile = profile_wire()
    set_nested(request, ("job", "sampling", "noiseProfile"), raw_profile)
    command = parse_request(request)
    assert isinstance(command, GenerateIllustriousTxt2ImgCommand)
    assert command.noise_profile == IllustriousNoiseProfile(True, "trailing")
    assert command.noise_profile is not None
    raw_profile["rescaleBetasZeroSnr"] = False
    raw_profile["timestepSpacing"] = "leading"
    assert command.noise_profile.rescale_betas_zero_snr is True
    assert command.noise_profile.timestep_spacing == "trailing"
    assert process_request(request)["code"] == "INFERENCE_UNAVAILABLE"


@pytest.mark.parametrize(
    "field,value",
    [
        ("schemaVersion", True),
        ("schemaVersion", 1.0),
        ("schemaVersion", 2),
        ("baseSchedule", "linear"),
        ("baseSchedule", None),
        ("rescaleBetasZeroSnr", 1),
        ("rescaleBetasZeroSnr", 0),
        ("rescaleBetasZeroSnr", "false"),
        ("rescaleBetasZeroSnr", None),
        ("timestepSpacing", "Trailing"),
        ("timestepSpacing", 1),
        ("timestepSpacing", None),
        ("betaStart", 0.001),
    ],
)
def test_invalid_noise_profile_is_rejected_without_filesystem_access(
    tmp_path: Path, field: str, value: object
) -> None:
    request = generation_request(tmp_path)
    profile = profile_wire()
    profile[field] = value
    set_nested(request, ("job", "sampling", "noiseProfile"), profile)
    assert process_request(request)["code"] == "INVALID_REQUEST"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("value", [None, False, [], {}, "assumed"])
def test_present_noise_profile_never_falls_back_to_legacy(tmp_path: Path, value: object) -> None:
    request = generation_request(tmp_path)
    set_nested(request, ("job", "sampling", "noiseProfile"), value)
    assert process_request(request)["code"] == "INVALID_REQUEST"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("field", list(profile_wire()))
def test_incomplete_noise_profile_is_not_completed_by_worker_defaults(
    tmp_path: Path, field: str
) -> None:
    request = generation_request(tmp_path)
    profile = profile_wire()
    del profile[field]
    set_nested(request, ("job", "sampling", "noiseProfile"), profile)
    assert process_request(request)["code"] == "INVALID_REQUEST"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("scheduler", ["dpmpp_sde", "dpmpp_sde_k"])
@pytest.mark.parametrize("operation", ["txt2img", "img2img", "outpaint"])
def test_sde_zero_snr_wire_refuses_before_config_or_model_reads(
    tmp_path: Path, scheduler: str, operation: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    request = illus_wire(tmp_path) if operation == "outpaint" else generation_request(tmp_path)
    request["type"] = f"generate-illustrious-{operation}"
    if operation == "img2img":
        set_nested(request, ("job", "sampling", "denoisingStrength"), 0.75)
    set_nested(request, ("job", "sampling", "scheduler"), scheduler)
    set_nested(request, ("job", "sampling", "noiseProfile"), profile_wire())
    reads: list[str] = []

    def observe_config(_path: str) -> None:
        reads.append("config")

    monkeypatch.setattr(inference, "verify_pinned_config", observe_config)
    empty = MLRuntime(ModuleType("unused"), ModuleType("unused"), ModuleType("unused"))
    response = process_inference_request(request, config_dir=tmp_path, runtime=empty)
    assert response["type"] == "error"
    assert response["code"] == "GENERATION_SAMPLING_UNSUPPORTED"
    assert response["requestId"] == "generation-1"
    assert reads == []
    set_nested(request, ("job", "sampling", "noiseProfile"), profile_wire(False))
    command = parse_request(request)
    assert isinstance(command, GenerateIllustriousTxt2ImgCommand)
    assert command.noise_profile == IllustriousNoiseProfile(False, "trailing")


@pytest.mark.parametrize("scheduler", ["dpmpp_sde", "dpmpp_sde_k"])
def test_direct_sde_zero_snr_executor_refuses_before_assets_and_loading(
    tmp_path: Path, scheduler: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    command = replace(
        illustrious_command(tmp_path),
        scheduler=cast(Any, scheduler),
        noise_profile=IllustriousNoiseProfile(True, "leading"),
    )
    reads: list[str] = []

    def observe_config(_path: str) -> None:
        reads.append("config")

    monkeypatch.setattr(inference, "verify_pinned_config", observe_config)
    empty = MLRuntime(ModuleType("unused"), ModuleType("unused"), ModuleType("unused"))
    with pytest.raises(DerivativeError) as refused:
        inference.generate_illustrious_txt2img(command, config_dir=tmp_path, runtime=empty)
    assert refused.value.code == "GENERATION_SAMPLING_UNSUPPORTED"
    with pytest.raises(DerivativeError) as selected:
        select_inference_scheduler(command, SimpleNamespace(), empty)
    assert selected.value.code == "GENERATION_SAMPLING_UNSUPPORTED"
    assert reads == []
    assert not command.output_path.exists()


def independent_alphas(torch: Any, rescale: bool) -> Any:
    betas = torch.linspace(0.00085**0.5, 0.012**0.5, 1000, dtype=torch.float32).square()
    if rescale:
        sqrt_alpha_bar = (1 - betas).cumprod(0).sqrt()
        initial = sqrt_alpha_bar[0].clone()
        terminal = sqrt_alpha_bar[-1].clone()
        sqrt_alpha_bar = (sqrt_alpha_bar - terminal) * initial / (initial - terminal)
        alpha_bar = sqrt_alpha_bar.square()
        alphas = torch.cat((alpha_bar[:1], alpha_bar[1:] / alpha_bar[:-1]))
        betas = 1 - alphas
    alpha_bar = (1 - betas).cumprod(0)
    if rescale:
        alpha_bar[-1] = 2**-24  # Native finite terminal-sigma clamp.
    return alpha_bar


def reference_scheduler(diffusers: Any, scheduler: str, prediction: str, profile: Any) -> Any:
    config = {
        "num_train_timesteps": 1000,
        "beta_start": 0.00085,
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "steps_offset": 1,
        "timestep_spacing": profile.timestep_spacing,
        "prediction_type": prediction,
    }
    if scheduler not in ("dpmpp_sde", "dpmpp_sde_k"):
        config["rescale_betas_zero_snr"] = profile.rescale_betas_zero_snr
    if scheduler == "euler":
        return diffusers.EulerDiscreteScheduler(**config)
    if scheduler == "euler_a":
        return diffusers.EulerAncestralDiscreteScheduler(**config)
    if scheduler in ("dpmpp_2m", "dpmpp_2m_k"):
        return diffusers.DPMSolverMultistepScheduler(
            **config,
            algorithm_type="dpmsolver++",
            solver_order=2,
            use_karras_sigmas=scheduler.endswith("_k"),
        )
    return diffusers.DPMSolverSDEScheduler(
        **config, use_karras_sigmas=scheduler.endswith("_k"), noise_sampler_seed=42
    )


@pytest.mark.parametrize("prediction", ["epsilon", "v_prediction"])
@pytest.mark.parametrize("spacing", ["leading", "linspace", "trailing"])
@pytest.mark.parametrize(
    "scheduler,rescale",
    [
        (name, flag)
        for name in ("euler", "euler_a", "dpmpp_2m", "dpmpp_2m_k")
        for flag in (False, True)
    ]
    + [("dpmpp_sde", False), ("dpmpp_sde_k", False)],
)
def test_exact_noise_profile_controls_real_native_alphas_sigmas_timesteps_and_steps(
    tmp_path: Path, prediction: str, spacing: str, scheduler: str, rescale: bool
) -> None:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    assert importlib.metadata.version("diffusers") == "0.40.0"
    runtime = MLRuntime(torch, diffusers, ModuleType("unused_compel"))
    # Deliberately incompatible loader config: named fixed profiles must not
    # inherit trained betas, alternate sigma grids, spacing, objective or offset.
    pipeline = SimpleNamespace(
        scheduler=SimpleNamespace(
            config={
                "num_train_timesteps": 12,
                "trained_betas": [0.03] * 12,
                "beta_schedule": "linear",
                "beta_start": 0.02,
                "beta_end": 0.03,
                "timestep_spacing": "trailing" if spacing != "trailing" else "leading",
                "steps_offset": 7,
                "prediction_type": "sample",
                "use_karras_sigmas": True,
                "use_exponential_sigmas": True,
            }
        )
    )
    profile = IllustriousNoiseProfile(rescale, cast(Spacing, spacing))
    command = replace(
        illustrious_command(tmp_path),
        scheduler=cast(Any, scheduler),
        prediction_type=cast(Any, prediction),
        noise_profile=profile,
    )
    selected = select_inference_scheduler(command, pipeline, runtime)
    expected = reference_scheduler(diffusers, scheduler, prediction, profile)
    selected.set_timesteps(4, device="cpu")
    expected.set_timesteps(4, device="cpu")
    assert type(selected) is type(expected)
    assert selected.config.prediction_type == prediction
    torch.testing.assert_close(
        selected.alphas_cumprod, independent_alphas(torch, rescale), rtol=1e-5, atol=1e-7
    )
    torch.testing.assert_close(selected.sigmas, expected.sigmas, rtol=0, atol=0)
    torch.testing.assert_close(selected.timesteps, expected.timesteps, rtol=0, atol=0)
    assert torch.isfinite(selected.sigmas).all()
    if rescale:
        assert selected.alphas_cumprod[-1].item() == 2**-24
        assert selected.alphas_cumprod[-2].item() < 1e-6
    else:
        assert selected.alphas_cumprod[-1].item() > 0.004

    current = torch.linspace(-0.1, 0.1, 32, dtype=torch.float32).reshape(1, 2, 4, 4)
    generator = torch.Generator(device="cpu").manual_seed(42)
    for timestep in selected.timesteps:
        scaled = selected.scale_model_input(current, timestep)
        output = scaled.tanh() * 0.02
        kwargs: dict[str, Any] = (
            {} if scheduler.startswith("dpmpp_sde") else {"generator": generator}
        )
        current = selected.step(output, timestep, current, **kwargs).prev_sample
        assert torch.isfinite(current).all()


@pytest.mark.parametrize("spacing", ["leading", "linspace", "trailing"])
def test_spacing_changes_actual_euler_grid_to_independent_known_values(
    tmp_path: Path, spacing: str
) -> None:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    command = replace(
        illustrious_command(tmp_path),
        scheduler="euler",
        noise_profile=IllustriousNoiseProfile(False, cast(Spacing, spacing)),
    )
    selected = select_inference_scheduler(
        command,
        SimpleNamespace(scheduler=SimpleNamespace(config={})),
        MLRuntime(torch, diffusers, ModuleType("unused")),
    )
    selected.set_timesteps(4, device="cpu")
    expected = {
        "leading": [751, 501, 251, 1],
        "linspace": [999, 666, 333, 0],
        "trailing": [999, 749, 499, 249],
    }
    assert selected.timesteps.tolist() == expected[spacing]


def test_legacy_request_keeps_loader_schedule_and_native_karras_keeps_its_own_grid(
    tmp_path: Path,
) -> None:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    runtime = MLRuntime(torch, diffusers, ModuleType("unused"))
    pipeline = SimpleNamespace(
        scheduler=diffusers.EulerDiscreteScheduler(
            num_train_timesteps=20,
            beta_start=0.001,
            beta_end=0.01,
            beta_schedule="linear",
            timestep_spacing="trailing",
            steps_offset=0,
        )
    )
    command = replace(illustrious_command(tmp_path), scheduler="euler")
    legacy = select_inference_scheduler(command, pipeline, runtime)
    legacy.set_timesteps(4, device="cpu")
    torch.testing.assert_close(legacy.alphas_cumprod, pipeline.scheduler.alphas_cumprod)
    assert legacy.timesteps.tolist() == [19, 14, 9, 4]
    grids: list[Any] = []
    for spacing in ("leading", "linspace", "trailing"):
        scheduler = select_inference_scheduler(
            replace(
                command,
                scheduler="dpmpp_2m_k",
                noise_profile=IllustriousNoiseProfile(False, spacing),
            ),
            pipeline,
            runtime,
        )
        scheduler.set_timesteps(4, device="cpu")
        grids.append(scheduler.sigmas.clone())
    # Native 2M Karras derives the grid from all training sigmas. Spacing is not
    # an alternate Karras algorithm and cannot be claimed to change its grid.
    assert torch.equal(grids[0], grids[1]) and torch.equal(grids[1], grids[2])
