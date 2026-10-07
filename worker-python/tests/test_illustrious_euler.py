"""Ordinary SDXL Euler routing and real pinned CPU solver numerics, without weights.

Euler-to-ancestral and ignored-frozen-prediction mutations must fail after real
solver initialization and a finite step. Anima's flow Euler is a separate owner.
"""

from __future__ import annotations

import importlib.metadata
from dataclasses import replace
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker import inference
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import MLRuntime, select_inference_scheduler
from test_inference_boundary import illustrious_command


@pytest.mark.parametrize("prediction", ["epsilon", "v_prediction"])
def test_selected_euler_matches_independent_step_and_replay_but_not_ancestral(
    tmp_path: Path, prediction: str
) -> None:
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    assert importlib.metadata.version("diffusers") == "0.40.0"
    runtime = MLRuntime(torch, diffusers, ModuleType("unused_compel"))
    config = {
        "beta_start": 0.00085,
        "beta_end": 0.012,
        "beta_schedule": "scaled_linear",
        "timestep_spacing": "leading",
        "rescale_betas_zero_snr": False,
    }
    pipeline = SimpleNamespace(scheduler=diffusers.DPMSolverMultistepScheduler(**config))
    command = replace(
        illustrious_command(tmp_path), scheduler="euler", prediction_type=cast(Any, prediction)
    )
    selected = select_inference_scheduler(command, pipeline, runtime)
    selected.set_timesteps(4, device="cpu")
    sample = torch.linspace(-0.75, 0.75, 32, dtype=torch.float32).reshape(1, 2, 4, 4)
    model_output = torch.linspace(0.2, -0.1, 32, dtype=torch.float32).reshape_as(sample)
    selected.scale_model_input(sample, selected.timesteps[0])
    sigma, next_sigma = selected.sigmas[:2]
    # Independent Euler ODE update. Ancestral adds a distinct sigma_down/noise term;
    # constructor aliases cannot satisfy this equation merely by keeping Euler's grid.
    denoised = (
        sample - sigma * model_output
        if prediction == "epsilon"
        else model_output * (-sigma / (sigma**2 + 1).sqrt()) + sample / (sigma**2 + 1)
    )
    expected = sample + ((sample - denoised) / sigma) * (next_sigma - sigma)
    actual = selected.step(
        model_output,
        selected.timesteps[0],
        sample,
        generator=torch.Generator(device="cpu").manual_seed(0),
    ).prev_sample
    assert torch.isfinite(actual).all() and torch.isfinite(expected).all()
    torch.testing.assert_close(actual, expected, rtol=1e-6, atol=1e-6)
    assert type(selected) is diffusers.EulerDiscreteScheduler
    assert selected.config.prediction_type == prediction
    assert selected.config.timestep_spacing == config["timestep_spacing"]
    assert selected.config.rescale_betas_zero_snr is False

    def solve(scheduler: Any, seed: int) -> Any:
        scheduler.set_timesteps(4, device="cpu")
        current = sample.clone()
        generator = torch.Generator(device="cpu").manual_seed(seed)
        for timestep in scheduler.timesteps:
            scaled = scheduler.scale_model_input(current, timestep)
            noise = model_output + scaled * 0.02
            current = scheduler.step(noise, timestep, current, generator=generator).prev_sample
            assert torch.isfinite(current).all()
        return current

    result = solve(select_inference_scheduler(command, pipeline, runtime), 0)
    reference = solve(diffusers.EulerDiscreteScheduler(**config, prediction_type=prediction), 0)
    torch.testing.assert_close(result, reference, rtol=0, atol=0)
    assert torch.equal(result, solve(select_inference_scheduler(command, pipeline, runtime), 123))
    ancestral_command = replace(command, scheduler="euler_a")
    ancestral = select_inference_scheduler(ancestral_command, pipeline, runtime)
    assert type(ancestral) is diffusers.EulerAncestralDiscreteScheduler
    ancestral_result = solve(ancestral, 0)
    assert not torch.equal(result, ancestral_result)
    assert not torch.equal(
        ancestral_result,
        solve(select_inference_scheduler(ancestral_command, pipeline, runtime), 123),
    )


def test_runtime_without_ordinary_euler_class_refuses_before_cuda_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Only the external package-presence/CUDA collaborators are controlled here.
    # Production qualification must actually require the new public native class.
    diffusers = ModuleType("controlled_diffusers")
    for name in (
        "AutoencoderKL",
        "StableDiffusionXLPipeline",
        "StableDiffusionXLImg2ImgPipeline",
        "DPMSolverMultistepScheduler",
        "DPMSolverSDEScheduler",
        "EulerAncestralDiscreteScheduler",
        "CosmosTransformer3DModel",
        "AnimaTextConditioner",
        "AutoencoderKLWan",
        "FlowMatchHeunDiscreteScheduler",
        "FlowMatchLCMScheduler",
    ):
        setattr(diffusers, name, object())
    probes: list[str] = []

    def controlled_empty(*_args: object, **_kwargs: object) -> None:
        probes.append("cuda")

    torch = ModuleType("controlled_torch")
    torch.__dict__.update(
        {
            "version": SimpleNamespace(cuda="12.8", hip=None),
            "cuda": SimpleNamespace(is_available=lambda: True, synchronize=lambda: None),
            "empty": controlled_empty,
        }
    )
    modules = {"diffusers": diffusers, "torch": torch}
    for package, names in {
        "numpy": ("array", "polyfit", "float32", "pad", "maximum"),
        "cv2": ("getGaussianKernel", "distanceTransform", "threshold"),
        "transformers": ("Qwen3Model", "Qwen3Config"),
        "compel": ("Compel", "ReturnedEmbeddingsType", "SplitLongTextMode"),
        "imagegen_worker.vendor.er_sde_scheduler": ("ERSDEScheduler",),
    }.items():
        module = ModuleType(package)
        for name in names:
            setattr(module, name, object())
        modules[package] = module

    def controlled_import(name: str) -> ModuleType:
        return modules.get(name, ModuleType(name))

    monkeypatch.setattr(inference.importlib, "import_module", controlled_import)
    monkeypatch.setattr(
        inference.importlib.metadata, "version", inference.PINNED_ML_VERSIONS.__getitem__
    )
    monkeypatch.setattr(inference, "load_anima_tokenizers", lambda: None)
    with pytest.raises(DerivativeError) as refused:
        inference.qualify_ml_runtime()
    assert refused.value.code == "INFERENCE_UNAVAILABLE"
    assert isinstance(refused.value.__cause__, AttributeError)
    assert "EulerDiscreteScheduler" in str(refused.value.__cause__)
    assert probes == []
