"""Real owned bundle/parser/dispatcher IMG boundaries; native doubles are explicit.

The previous native IMG suite qualifies VAE/loop/PNG mechanics. These cases own
file snapshots and exact command routing without trained weights. ROOT alone
collects/runs tests and performs isolated mutations; authorship is AST/Ruff only.
"""

from __future__ import annotations

import contextlib
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime
from imagegen_worker.protocol import GenerateIllustriousImg2ImgCommand
from test_illustrious_regional_worker import (
    _case as _text_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _seal,  # pyright: ignore[reportPrivateUsage]
)


def _case(tmp_path: Path, *, strength: float = 0.5) -> Any:
    case = _text_case(tmp_path)
    case.request["type"] = "generate-illustrious-img2img"
    case.request["job"]["sampling"]["denoisingStrength"] = strength
    case.bundle["compositionProfile"] = "invoke-canvas-v1"
    _target(case, alpha=255)
    _seal(case)
    return case


def _target(case: Any, *, alpha: int) -> None:
    width, height = case.request["job"]["target"]["width"], case.request["job"]["target"]["height"]
    Image.new("RGBA", (width, height), (61, 113, 197, alpha)).save(
        case.target, icc_profile=SRGB_ICC_PROFILE
    )
    case.target.chmod(0o600)
    case.request["job"]["target"].update(_descriptor(case.target))


@pytest.mark.parametrize("strength", (0.0, 0.5, 1.0))
@pytest.mark.parametrize("cfg_rescale", (0.0, 0.7, 0.99))
@pytest.mark.parametrize("scheduler", ("euler", "euler_a"))
def test_real_opaque_bundle_preserves_exact_img_command_and_explicit_strength(
    tmp_path: Path, strength: float, cfg_rescale: float, scheduler: str
) -> None:
    case = _case(tmp_path, strength=strength)
    case.request["job"]["sampling"]["cfgRescale"] = cfg_rescale
    case.request["job"]["sampling"]["scheduler"] = scheduler
    _seal(case)
    parsed = worker.parse_regional_request(case.wire)
    assert type(parsed.command) is GenerateIllustriousImg2ImgCommand
    assert parsed.command.denoising_strength == strength
    assert parsed.command.cfg_rescale == cfg_rescale
    assert parsed.parameters.cfg_rescale == cfg_rescale
    assert parsed.command.scheduler == parsed.parameters.scheduler == scheduler
    assert parsed.command.target_sha256 == _descriptor(case.target)["sha256"]
    assert parsed.composition_profile == "invoke-canvas-v1"
    assert parsed.initialization_profile is None
    assert worker._denoising_profile(  # pyright: ignore[reportPrivateUsage]
        parsed.parameters, None, parsed.composition_profile, img2img=True
    ) == (
        "ordinary-canvas-euler-ancestral-img2img-cuda-fp16-v1"
        if scheduler == "euler_a"
        else "ordinary-canvas-euler-img2img-cuda-fp16-v1"
    )
    expected = case.alpha.read_bytes()
    case.alpha.unlink()
    case.manifest.unlink()
    assert parsed.recipe["regions"][0]["coverage"]["alpha"] == expected
    assert parsed.parameters.vae is None and parsed.parameters.vae_precision == "FP16"


@pytest.mark.parametrize(
    "fault",
    (
        "no-public-profile",
        "initialization",
        "dpm-karras",
        "dpm",
        "rescale",
        "auto-vae",
        "fp32-vae",
        "external-vae",
        "missing-strength",
        "bool-strength",
        "negative-strength",
        "above-strength",
        "nonfinite-strength",
        "transparent",
        "partial",
        "outpaint-type",
        "target-changed",
        "seed",
        "existing-output",
    ),
)
def test_invalid_img_bundle_refuses_before_any_native_loader(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    case = _case(tmp_path)
    job = case.request["job"]
    if fault == "no-public-profile":
        del case.bundle["compositionProfile"]
    elif fault == "initialization":
        case.bundle["initializationProfile"] = "invoke-cpu-f32-add-noise-v1"
    elif fault == "dpm-karras":
        # Euler a now has its own IMG execution profile. DPM remains outside
        # this image subset, with or without Karras scheduling.
        job["sampling"]["scheduler"] = "dpmpp_2m_k"
    elif fault == "dpm":
        job["sampling"]["scheduler"] = "dpmpp_2m"
    elif fault == "rescale":
        # Nonzero public IMG values are now supported; the operational upper
        # bound remains strict, independently of target/mode qualification.
        job["sampling"]["cfgRescale"] = 1.0
    elif fault in ("auto-vae", "fp32-vae"):
        job["vaePrecision"] = "Auto" if fault == "auto-vae" else "FP32"
    elif fault == "external-vae":
        job["vae"] = {**_descriptor(case.checkpoint)}
    elif fault == "missing-strength":
        del job["sampling"]["denoisingStrength"]
    elif fault in ("bool-strength", "negative-strength", "above-strength", "nonfinite-strength"):
        job["sampling"]["denoisingStrength"] = {
            "bool-strength": True,
            "negative-strength": -0.1,
            "above-strength": 1.01,
            "nonfinite-strength": float("nan"),
        }[fault]
    elif fault in ("transparent", "partial"):
        _target(case, alpha=0 if fault == "transparent" else 127)
    elif fault == "outpaint-type":
        case.request["type"] = "generate-illustrious-outpaint"
    elif fault == "target-changed":
        case.target.write_bytes(b"changed source")
    elif fault == "seed":
        job["sampling"]["seed"] += 1
    elif fault == "existing-output":
        Path(job["output"]["pngPath"]).write_bytes(b"winner")
    _seal(case)
    calls: list[str] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("load")
        raise AssertionError("invalid IMG bundle reached native load")

    monkeypatch.setattr(worker, "load_illustrious_pipeline", forbidden)
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    before = case.target.read_bytes()
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "error"
    assert calls == [] and case.target.read_bytes() == before
    output = Path(job["output"]["pngPath"])
    assert not output.exists() or output.read_bytes() == b"winner"


@pytest.mark.parametrize("strength", (0.0, 0.5))
@pytest.mark.parametrize("cfg_rescale", (0.0, 0.7, 0.99))
@pytest.mark.parametrize("scheduler", ("euler", "euler_a"))
def test_real_dispatch_routes_img_once_without_prepared_vae_or_txt_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    strength: float,
    cfg_rescale: float,
    scheduler: str,
) -> None:
    case = _case(tmp_path, strength=strength)
    case.request["job"]["sampling"]["cfgRescale"] = cfg_rescale
    case.request["job"]["sampling"]["scheduler"] = scheduler
    _seal(case)
    case.wire["reportProgress"] = True
    calls: list[str] = []
    component = SimpleNamespace(eval=lambda: calls.append("eval"))
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    reports: list[dict[str, object]] = []

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, Any]:
        calls.append("load")
        assert kwargs["mode"] == "txt2img"  # exact original borrowed pipeline remains standard
        assert parameters.positive_prompt == parameters.negative_prompt == ""
        assert parameters.vae is None and parameters.vae_precision == "FP16"
        assert parameters.scheduler == scheduler
        return pipeline, None

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("IMG incorrectly selected TXT publication or prepared VAE decode")

    def publish(recipe: Any, **kwargs: Any) -> dict[str, object]:
        calls.append("img-output")
        assert type(kwargs["command"]) is GenerateIllustriousImg2ImgCommand
        assert kwargs["command"].denoising_strength == strength
        assert kwargs["command"].cfg_rescale == cfg_rescale
        assert kwargs["command"].scheduler == scheduler
        assert kwargs["pipeline"] is pipeline
        assert kwargs["denoising_profile"] == (
            "ordinary-canvas-euler-ancestral-img2img-cuda-fp16-v1"
            if scheduler == "euler_a"
            else "ordinary-canvas-euler-img2img-cuda-fp16-v1"
        )
        assert (
            kwargs["profile"]
            == "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
        )
        assert recipe["regions"][0]["coverage"]["alpha"] == case.alpha.read_bytes()
        if strength:
            kwargs["on_progress"](1, 1)
        return {
            "type": "generation-done",
            "protocolVersion": "1",
            "requestId": "private-1",
            "outputPath": str(case.root / "result.png"),
            "seed": 42,
        }

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "prepare_owned_regional_vae", forbidden)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", forbidden)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_img2img", publish)

    def hooks(_pipeline: Any) -> None:
        calls.append("hooks")

    def bindings(*_args: Any) -> tuple[()]:
        return ()

    monkeypatch.setattr(worker, "install_capture_hooks", hooks)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime, on_progress=reports.append
    )
    assert response["type"] == "generation-done"
    assert calls == ["load", "eval", "eval", "eval", "eval", "hooks", "img-output"]
    assert len(reports) == bool(strength)
    if reports:
        assert reports[0]["totalSteps"] == 1 and reports[0]["step"] == 1
