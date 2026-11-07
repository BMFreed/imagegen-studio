"""Real owned bundle/parser/dispatcher IMG boundaries; native doubles are explicit.

The previous native IMG suite qualifies VAE/loop/PNG mechanics. These cases own
file snapshots and exact command routing without trained weights. ROOT alone
collects/runs tests and performs isolated mutations; authorship is AST/Ruff only.
"""

from __future__ import annotations

import contextlib
import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime
from imagegen_worker.protocol import GenerateIllustriousImg2ImgCommand, GenerationVae
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


def _selected_vae(case: Any) -> Path:
    """Real hash-bound snapshot; complete native architecture is outside this double."""
    file = case.root.parent / "selected-vae.safetensors"
    header = json.dumps(
        {"encoder.fixture": {"dtype": "F16", "shape": [1], "data_offsets": [0, 2]}},
        separators=(",", ":"),
    ).encode()
    header += b" " * (-len(header) % 8)
    file.write_bytes(len(header).to_bytes(8, "little") + header + b"\x00\x34")
    case.request["job"]["vae"] = _descriptor(file)
    return file


@pytest.mark.parametrize("strength", (0.0, 0.5, 1.0))
@pytest.mark.parametrize("cfg_rescale", (0.0, 0.7, 0.99))
@pytest.mark.parametrize("scheduler", ("euler", "euler_a", "dpmpp_2m", "dpmpp_2m_k"))
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
    assert (
        worker._denoising_profile(  # pyright: ignore[reportPrivateUsage]
            parsed.parameters, None, parsed.composition_profile, img2img=True
        )
        == {
            "euler": "ordinary-canvas-euler-img2img-cuda-fp16-v1",
            "euler_a": "ordinary-canvas-euler-ancestral-img2img-cuda-fp16-v1",
            "dpmpp_2m": "ordinary-canvas-dpmpp-2m-img2img-cuda-fp16-v1",
            "dpmpp_2m_k": "ordinary-canvas-dpmpp-2m-img2img-cuda-fp16-v1",
        }[scheduler]
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
        "dpm-sde-karras",
        "dpm-sde",
        "dpm-initialization",
        "dpm-karras-checkpoint-vae",
        "rescale",
        "unsupported-precision",
        "non-string-precision",
        "checkpoint-vae",
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
    elif fault in ("dpm-sde-karras", "dpm-sde"):
        # Deterministic 2M Normal/Karras now has its own IMG execution profile;
        # stochastic DPM remains outside the qualified image subset.
        job["sampling"]["scheduler"] = "dpmpp_sde_k" if fault == "dpm-sde-karras" else "dpmpp_sde"
    elif fault == "dpm-initialization":
        job["sampling"]["scheduler"] = "dpmpp_2m"
        case.bundle["initializationProfile"] = "invoke-cpu-f32-add-noise-v1"
    elif fault == "dpm-karras-checkpoint-vae":
        job["sampling"]["scheduler"] = "dpmpp_2m_k"
        job["vae"] = {**_descriptor(case.checkpoint)}
    elif fault == "rescale":
        # Nonzero public IMG values are now supported; the operational upper
        # bound remains strict, independently of target/mode qualification.
        job["sampling"]["cfgRescale"] = 1.0
    elif fault in ("unsupported-precision", "non-string-precision"):
        job["vaePrecision"] = "FP64" if fault == "unsupported-precision" else False
    elif fault == "checkpoint-vae":
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
@pytest.mark.parametrize("scheduler", ("euler", "euler_a", "dpmpp_2m", "dpmpp_2m_k"))
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
        assert (
            kwargs["denoising_profile"]
            == {
                "euler": "ordinary-canvas-euler-img2img-cuda-fp16-v1",
                "euler_a": "ordinary-canvas-euler-ancestral-img2img-cuda-fp16-v1",
                "dpmpp_2m": "ordinary-canvas-dpmpp-2m-img2img-cuda-fp16-v1",
                "dpmpp_2m_k": "ordinary-canvas-dpmpp-2m-img2img-cuda-fp16-v1",
            }[scheduler]
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


@pytest.mark.parametrize("selected", (False, True), ids=("embedded", "selected"))
@pytest.mark.parametrize("precision", ("Auto", "FP16", "FP32"))
@pytest.mark.parametrize("scheduler", ("euler", "euler_a", "dpmpp_2m", "dpmpp_2m_k"))
def test_real_img_vae_matrix_verifies_snapshot_and_prepares_once_before_runner(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    selected: bool,
    precision: str,
    scheduler: str,
) -> None:
    """Real snapshots/parser/dispatch, with labelled native loader/preparation doubles."""
    case = _case(tmp_path)
    job = case.request["job"]
    job["sampling"]["scheduler"] = scheduler
    job["vaePrecision"] = precision
    file = _selected_vae(case) if selected else None
    _seal(case)
    parsed = worker.parse_regional_request(case.wire)
    expected_vae = (
        GenerationVae(file, cast(str, job["vae"]["sha256"]), cast(int, job["vae"]["byteSize"]))
        if file is not None
        else None
    )
    assert parsed.parameters.vae == parsed.command.vae == expected_vae
    assert parsed.parameters.vae_precision == parsed.command.vae_precision == precision
    prepared = selected or precision != "FP16"
    expected_profile = {
        "euler": "ordinary-canvas-euler-img2img-cuda-vae-v1",
        "euler_a": "ordinary-canvas-euler-ancestral-img2img-cuda-vae-v1",
        "dpmpp_2m": "ordinary-canvas-dpmpp-2m-img2img-cuda-vae-v1",
        "dpmpp_2m_k": "ordinary-canvas-dpmpp-2m-img2img-cuda-vae-v1",
    }[scheduler]
    if not prepared:
        expected_profile = expected_profile.replace("-vae-", "-fp16-")
    assert (
        worker._denoising_profile(  # pyright: ignore[reportPrivateUsage]
            parsed.parameters, None, "invoke-canvas-v1", img2img=True
        )
        == expected_profile
    )
    calls: list[str] = []
    component = SimpleNamespace(eval=lambda: calls.append("eval"))
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    torch = SimpleNamespace(no_grad=contextlib.nullcontext)
    runtime = cast(MLRuntime, SimpleNamespace(torch=torch))
    observed_preparation: list[Any] = []

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, None]:
        calls.append("load")
        assert kwargs == {"config_dir": tmp_path, "runtime": runtime, "mode": "txt2img"}
        assert parameters.vae == expected_vae and parameters.vae_precision == precision
        assert parameters.scheduler == scheduler
        assert parameters.positive_prompt == parameters.negative_prompt == ""
        assert (
            parameters.loras
            == parameters.positive_embeddings
            == parameters.negative_embeddings
            == ()
        )
        return pipeline, None

    def prepare(current: Any, parameters: Any, current_torch: Any) -> None:
        calls.append("prepare")
        assert current is pipeline and current_torch is torch
        assert parameters == parsed.parameters
        assert parameters.vae == expected_vae and parameters.vae_precision == precision
        assert parameters.positive_prompt == parsed.command.positive_prompt
        observed_preparation.append(current.vae)

    def hooks(current: Any) -> None:
        calls.append("hooks")
        assert current is pipeline

    def bindings(current: Any, current_runtime: Any) -> tuple[()]:
        calls.append("bindings")
        assert current is pipeline and current_runtime is runtime
        return ()

    done = {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": parsed.command.request_id,
        "outputPath": str(parsed.command.output_path),
        "seed": parsed.command.seed,
    }

    def publish(recipe: Any, **kwargs: Any) -> dict[str, object]:
        calls.append("img-output")
        assert calls == [
            "load",
            *(("prepare",) if prepared else ()),
            "eval",
            "eval",
            "eval",
            "eval",
            "hooks",
            "bindings",
            "img-output",
        ]
        assert recipe == parsed.recipe
        assert kwargs["command"] == parsed.command
        assert type(kwargs["command"]) is GenerateIllustriousImg2ImgCommand
        assert kwargs["pipeline"] is pipeline and pipeline.vae is component
        assert kwargs["runtime"] is runtime
        assert kwargs["denoising_profile"] == expected_profile
        assert (
            kwargs["profile"]
            == "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
        )
        assert kwargs["bindings"] == () and kwargs["layout"] == parsed.layout
        return cast(dict[str, object], done)

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("IMG VAE dispatch selected TXT output")

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "prepare_owned_regional_vae", prepare)
    monkeypatch.setattr(worker, "install_capture_hooks", hooks)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_img2img", publish)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", forbidden)
    before = {
        path: path.read_bytes()
        for path in (case.target, case.checkpoint, *((file,) if file else ()))
    }
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response == done
    assert observed_preparation == ([component] if prepared else [])
    assert before == {path: path.read_bytes() for path in before}


@pytest.mark.parametrize(
    ("fault", "code"),
    (
        ("missing-file", "GENERATION_INPUT_CHANGED"),
        ("changed-file", "GENERATION_INPUT_CHANGED"),
        ("wrong-size", "GENERATION_INPUT_CHANGED"),
        ("wrong-hash", "GENERATION_INPUT_CHANGED"),
        ("bad-header", "GENERATION_VAE_UNSUPPORTED"),
        ("symlink", "INVALID_PATH"),
        ("in-staging", "GENERATION_VAE_UNSUPPORTED"),
        ("same-checkpoint", "GENERATION_VAE_UNSUPPORTED"),
        ("descriptor-extra", "INVALID_REQUEST"),
        ("descriptor-missing", "INVALID_REQUEST"),
        ("descriptor-relative", "INVALID_REQUEST"),
        ("descriptor-bool-size", "INVALID_REQUEST"),
        ("descriptor-uppercase-sha", "INVALID_REQUEST"),
        ("missing-composition", "INVALID_REQUEST"),
        ("txt-initialization", "INVALID_REQUEST"),
        ("unsupported-sampler", "INVALID_REQUEST"),
    ),
)
def test_selected_img_vae_invalid_binding_refuses_before_native_load_or_preparation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str, code: str
) -> None:
    case = _case(tmp_path)
    file = _selected_vae(case)
    job = case.request["job"]
    job["vaePrecision"] = "FP32"
    descriptor = job["vae"]
    if fault == "missing-file":
        file.unlink()
    elif fault == "changed-file":
        data = file.read_bytes()
        file.write_bytes(data[:-1] + bytes((data[-1] ^ 1,)))
    elif fault == "wrong-size":
        descriptor["byteSize"] += 1
    elif fault == "wrong-hash":
        descriptor["sha256"] = "0" * 64
    elif fault == "bad-header":
        file.write_bytes(b"not a safetensors snapshot")
        job["vae"] = _descriptor(file)
    elif fault == "symlink":
        link = tmp_path / "linked.safetensors"
        link.symlink_to(file)
        descriptor["path"] = str(link)
    elif fault == "in-staging":
        staged = case.root / "vae.safetensors"
        staged.write_bytes(file.read_bytes())
        job["vae"] = _descriptor(staged)
    elif fault == "same-checkpoint":
        job["vae"] = _descriptor(case.checkpoint)
    elif fault == "descriptor-extra":
        descriptor["ignored"] = "forbidden"
    elif fault == "descriptor-missing":
        del descriptor["sha256"]
    elif fault == "descriptor-relative":
        descriptor["path"] = "selected-vae.safetensors"
    elif fault == "descriptor-bool-size":
        descriptor["byteSize"] = True
    elif fault == "descriptor-uppercase-sha":
        descriptor["sha256"] = "A" * 64
    elif fault == "missing-composition":
        del case.bundle["compositionProfile"]
    elif fault == "txt-initialization":
        case.bundle["initializationProfile"] = "invoke-cpu-f32-add-noise-v1"
    else:
        assert fault == "unsupported-sampler"
        job["sampling"]["scheduler"] = "dpmpp_sde"
    _seal(case)
    calls: list[str] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("native")
        raise AssertionError("invalid selected IMG VAE reached native preparation")

    monkeypatch.setattr(worker, "load_illustrious_pipeline", forbidden)
    monkeypatch.setattr(worker, "prepare_owned_regional_vae", forbidden)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_img2img", forbidden)
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    before = case.target.read_bytes()
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "error" and response["code"] == code
    assert response["requestId"] == "private-1"
    assert calls == [] and case.target.read_bytes() == before
    assert not Path(job["output"]["pngPath"]).exists()


@pytest.mark.parametrize(
    ("fault", "code"),
    (
        ("unsupported-precision", "GENERATION_VAE_UNSUPPORTED"),
        ("non-string-precision", "GENERATION_VAE_UNSUPPORTED"),
        ("descriptor-type", "GENERATION_VAE_UNSUPPORTED"),
        ("descriptor-extra", "GENERATION_VAE_UNSUPPORTED"),
        ("bool-size", "GENERATION_VAE_UNSUPPORTED"),
        ("zero-size", "GENERATION_VAE_UNSUPPORTED"),
        ("uppercase-sha", "GENERATION_VAE_UNSUPPORTED"),
        ("relative-path", "INVALID_PATH"),
    ),
)
def test_img_logical_vae_policy_uses_existing_exact_validation_before_resource_or_load(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str, code: str
) -> None:
    """The wire is valid; inject malformed logical records at the existing projection seam."""
    case = _case(tmp_path)
    _selected_vae(case)
    _seal(case)
    original = worker._command_parameters  # pyright: ignore[reportPrivateUsage]

    def parameters(*args: Any, **kwargs: Any) -> Any:
        current = original(*args, **kwargs)
        vae = current.vae
        assert vae is not None
        if fault == "unsupported-precision":
            return replace(current, vae_precision=cast(Any, "FP64"))
        if fault == "non-string-precision":
            return replace(current, vae_precision=cast(Any, False))
        if fault == "descriptor-type":
            return replace(current, vae=cast(Any, SimpleNamespace(**vars(vae))))
        if fault == "descriptor-extra":
            object.__setattr__(vae, "extra", "forbidden")
            return current
        if fault == "bool-size":
            vae = replace(vae, byte_size=cast(Any, True))
        elif fault == "zero-size":
            vae = replace(vae, byte_size=0)
        elif fault == "uppercase-sha":
            vae = replace(vae, sha256="A" * 64)
        else:
            assert fault == "relative-path"
            vae = replace(vae, path=Path("selected-vae.safetensors"))
        return replace(current, vae=vae)

    calls: list[str] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("resource-or-native")
        raise AssertionError("invalid logical VAE escaped the existing validation")

    monkeypatch.setattr(worker, "_command_parameters", parameters)
    monkeypatch.setattr(worker, "verify_regional_vae_resource", forbidden)
    monkeypatch.setattr(worker, "load_illustrious_pipeline", forbidden)
    monkeypatch.setattr(worker, "prepare_owned_regional_vae", forbidden)
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "error" and response["code"] == code
    assert calls == [] and not (case.root / "result.png").exists()
