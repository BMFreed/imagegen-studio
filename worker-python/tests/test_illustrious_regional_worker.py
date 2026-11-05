"""Owned-file handoff and real dispatcher; native collaborators are explicitly labelled.

The qualified CUDA child acceptance is recorded separately by ROOT. These cases
exercise snapshots, refusal ordering and dispatch without loading trained weights.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import json
import os
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import MLRuntime
from imagegen_worker.protocol import GenerateIllustriousTxt2ImgCommand, parse_request
from test_illustrious_regional_recipe import (
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)


def _descriptor(file: Path) -> dict[str, object]:
    data = file.read_bytes()
    return {"path": str(file), "byteSize": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def _seal(case: Any) -> None:
    case.manifest.write_text(json.dumps(case.bundle, separators=(",", ":")))
    case.manifest.chmod(0o600)
    case.wire["bundle"] = _descriptor(case.manifest)


def _case(tmp_path: Path) -> Any:
    root = tmp_path / "owned"
    root.mkdir(mode=0o700)
    checkpoint = tmp_path / "checkpoint.safetensors"
    checkpoint.write_bytes(b"explicit non-native loader collaborator")
    target = root / "target.png"
    recipe = _recipe(_region())
    recipe["globalEmbeddings"] = {"positive": [], "negative": []}
    for region in recipe["regions"]:
        region["embeddings"] = {"positive": [], "negative": []}
    bbox = recipe["bbox"]
    Image.new("RGBA", (bbox["width"], bbox["height"]), (42, 73, 91, 0)).save(
        target, icc_profile=SRGB_ICC_PROFILE
    )
    alpha = root / "regional.alpha8"
    alpha.write_bytes(recipe["regions"][0]["coverage"]["alpha"])
    recipe["regions"][0]["coverage"]["alpha"] = {"$alpha8": _descriptor(alpha)}
    request = {
        "type": "generate-illustrious-txt2img",
        "protocolVersion": "1",
        "requestId": "private-1",
        "job": {
            "schemaVersion": 1,
            "checkpoint": {
                "path": str(checkpoint),
                "sha256": _descriptor(checkpoint)["sha256"],
                "predictionType": "epsilon",
            },
            "target": {
                **_descriptor(target),
                "width": bbox["width"],
                "height": bbox["height"],
                "iccSha256": hashlib.sha256(SRGB_ICC_PROFILE).hexdigest(),
            },
            "bbox": copy.deepcopy(bbox),
            "prompts": copy.deepcopy(recipe["item"]["prompts"]),
            "sampling": {
                "steps": 2,
                "cfgScale": 5,
                "seed": recipe["item"]["seed"],
                "scheduler": "euler",
                "noiseProfile": {
                    "schemaVersion": 1,
                    "baseSchedule": "sdxl-scaled-linear-v1",
                    "rescaleBetasZeroSnr": False,
                    "timestepSpacing": "leading",
                },
            },
            "vaePrecision": "FP16",
            "output": {"stagingRoot": str(root), "pngPath": str(root / "result.png")},
        },
    }
    case = SimpleNamespace(
        root=root,
        checkpoint=checkpoint,
        target=target,
        alpha=alpha,
        manifest=root / "bundle.json",
        request=request,
        bundle={
            "schemaVersion": 1,
            "request": request,
            "recipe": recipe,
            "globalNegativeCoverage": {"kind": "everywhere"},
            "globalPositiveCoverage": {"kind": "everywhere"},
            "negativePooledSourceId": "current-canvas",
            "positivePooledSourceId": "current-canvas",
            "layout": "cfg-negative-first",
        },
        wire={
            "type": "execute-current-canvas-regional",
            "protocolVersion": "1",
            "requestId": "private-1",
            "stagingRoot": str(root),
        },
    )
    for file in (target, alpha):
        file.chmod(0o600)
    _seal(case)
    return case


def test_owned_snapshots_survive_source_removal_and_preserve_world_bytes(tmp_path: Path) -> None:
    case = _case(tmp_path)
    expected = case.alpha.read_bytes()
    parsed = worker.parse_regional_request(case.wire)
    case.alpha.unlink()
    case.manifest.unlink()
    assert parsed.recipe["regions"][0]["coverage"]["alpha"] == expected
    assert parsed.recipe["bbox"] == case.request["job"]["bbox"]
    assert parsed.command.seed == 42
    assert parsed.parameters.positive_embeddings == parsed.parameters.negative_embeddings == ()
    assert len(json.dumps(case.wire).encode()) < 64 * 1024


@pytest.mark.parametrize(
    "fault",
    [
        "missing",
        "digest",
        "size",
        "escape",
        "symlink",
        "hardlink",
        "wrong-alpha-size",
        "bundle-limit",
        "raw-limit",
        "schema",
        "extra",
        "identity",
        "seed",
        "bbox-origin",
        "layout",
        "ordinary-extra",
        "no-noise",
        "vae",
        "opaque",
        "partial",
        "target-changed",
        "checkpoint-changed",
        "existing-output",
    ],
)
def test_invalid_owned_handoff_refuses_before_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    case = _case(tmp_path)
    job = case.request["job"]
    if fault == "missing":
        case.alpha.unlink()
    elif fault == "digest":
        case.alpha.write_bytes(b"\x00" * case.alpha.stat().st_size)
    elif fault == "size":
        case.alpha.write_bytes(b"short")
    elif fault == "escape":
        case.bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"]["path"] = str(
            case.checkpoint
        )
    elif fault == "symlink":
        content = case.alpha.read_bytes()
        case.alpha.unlink()
        foreign = tmp_path / "foreign"
        foreign.write_bytes(content)
        case.alpha.symlink_to(foreign)
    elif fault == "hardlink":
        os.link(case.alpha, tmp_path / "hardlink")
    elif fault == "wrong-alpha-size":
        case.bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"]["byteSize"] = 1
    elif fault == "raw-limit":
        case.bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"]["byteSize"] = (
            64 * 1024 * 1024 + 1
        )
    elif fault == "schema":
        case.bundle["schemaVersion"] = True
    elif fault == "extra":
        case.bundle["unowned"] = True
    elif fault == "identity":
        case.request["requestId"] = "neighbor"
    elif fault == "seed":
        job["sampling"]["seed"] += 1
    elif fault == "bbox-origin":
        job["bbox"]["x"] += 1
    elif fault == "layout":
        case.bundle["layout"] = "positive-only"
    elif fault == "ordinary-extra":
        job["regional"] = {}
    elif fault == "no-noise":
        del job["sampling"]["noiseProfile"]
    elif fault == "vae":
        job["vaePrecision"] = "Auto"
    elif fault in ("opaque", "partial"):
        Image.new(
            "RGBA",
            (job["target"]["width"], job["target"]["height"]),
            (0, 0, 0, 255 if fault == "opaque" else 127),
        ).save(case.target, icc_profile=SRGB_ICC_PROFILE)
        job["target"].update(_descriptor(case.target))
    elif fault == "target-changed":
        case.target.write_bytes(b"changed")
    elif fault == "checkpoint-changed":
        case.checkpoint.write_bytes(b"changed")
    elif fault == "existing-output":
        Path(job["output"]["pngPath"]).write_bytes(b"winner")
    _seal(case)
    if fault == "bundle-limit":
        case.wire["bundle"]["byteSize"] = 1024 * 1024 + 1
    loaded: list[object] = []

    def tripwire(*args: Any, **kwargs: Any) -> Any:
        loaded.append(args)
        pytest.fail("invalid handoff reached native loading")

    monkeypatch.setattr(worker, "load_illustrious_pipeline", tripwire)
    before = case.target.read_bytes()
    response = inference_main.process_inference_request(
        case.wire,
        config_dir=tmp_path,
        runtime=cast(
            MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
        ),
    )
    assert response["type"] == "error"
    assert loaded == []
    assert case.target.read_bytes() == before
    assert (
        not (case.root / "result.png").exists()
        or (case.root / "result.png").read_bytes() == b"winner"
    )


def test_duplicate_json_fields_are_not_silently_rebound(tmp_path: Path) -> None:
    case = _case(tmp_path)
    text = case.manifest.read_text()
    case.manifest.write_text(text[:-1] + ',"schemaVersion":1}')
    case.wire["bundle"] = _descriptor(case.manifest)
    with pytest.raises(DerivativeError, match="duplicate"):
        worker.parse_regional_request(case.wire)


def test_global_alpha_is_owned_and_exactly_latent_sized(tmp_path: Path) -> None:
    case = _case(tmp_path)
    alpha = case.root / "global.alpha8"
    alpha.write_bytes(bytes([0, 127, 128, 255, 42, 193]))
    alpha.chmod(0o600)
    case.bundle["globalPositiveCoverage"] = {
        "kind": "alpha8",
        "width": 3,
        "height": 2,
        "alpha": {"$alpha8": _descriptor(alpha)},
    }
    _seal(case)
    parsed = worker.parse_regional_request(case.wire)
    assert isinstance(parsed.global_positive_coverage, worker.Alpha8)
    assert parsed.global_positive_coverage.samples == alpha.read_bytes()
    case.bundle["globalPositiveCoverage"]["width"] = 2
    _seal(case)
    with pytest.raises(DerivativeError):
        worker.parse_regional_request(case.wire)


def test_real_dispatch_delegates_one_loader_and_one_existing_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Real snapshots/parser/dispatcher, explicitly fake native loader/output collaborators."""
    case = _case(tmp_path)
    calls: list[str] = []
    component = SimpleNamespace(eval=lambda: calls.append("eval"))
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, Any]:
        calls.append("load")
        assert parameters.checkpoint_path == case.checkpoint
        assert parameters.positive_embeddings == parameters.negative_embeddings == ()
        assert kwargs["mode"] == "txt2img"
        return pipeline, None

    def publish(recipe: Any, **kwargs: Any) -> dict[str, object]:
        calls.append("output")
        assert recipe["regions"][0]["coverage"]["alpha"] == case.alpha.read_bytes()
        assert kwargs["pipeline"] is pipeline and kwargs["runtime"] is runtime
        assert type(kwargs["command"]) is GenerateIllustriousTxt2ImgCommand
        assert (
            kwargs["profile"]
            == "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
        )
        return {
            "type": "generation-done",
            "protocolVersion": "1",
            "requestId": "private-1",
            "outputPath": str(case.root / "result.png"),
            "seed": 42,
        }

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)

    def hooks(value: Any) -> None:
        calls.append("hooks")

    def bindings(*args: Any) -> tuple[()]:
        return ()

    monkeypatch.setattr(worker, "install_capture_hooks", hooks)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", publish)
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "generation-done"
    assert calls == ["load", "eval", "eval", "eval", "eval", "hooks", "output"]
    assert "private-current-canvas-regional-v1" in cast(
        list[str], inference_main.inference_ready_message()["capabilities"]
    )
    with pytest.raises(DerivativeError):
        parse_request(case.wire)
    assert type(parse_request(case.request)) is GenerateIllustriousTxt2ImgCommand


def test_zero_region_snapshot_control_green(tmp_path: Path) -> None:
    case = _case(tmp_path)
    case.bundle["recipe"]["regions"] = []
    _seal(case)
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.recipe["regions"] == []
    assert parsed.command.seed == 42
    assert parsed.parameters.noise_profile is not None
    assert parsed.parameters.noise_profile.timestep_spacing == "leading"


@pytest.mark.parametrize("scheduler", ("euler", "euler_a"))
def test_private_sampler_is_preserved_and_selects_its_exact_execution_profile(
    tmp_path: Path, scheduler: str
) -> None:
    case = _case(tmp_path)
    case.request["job"]["sampling"]["scheduler"] = scheduler
    case.request["job"]["sampling"]["steps"] = 28
    _seal(case)
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.command.scheduler == parsed.parameters.scheduler == scheduler
    assert parsed.parameters.steps == 28
    assert worker._denoising_profile(parsed.parameters) == (  # pyright: ignore[reportPrivateUsage]
        "ordinary-canvas-euler-ancestral-txt2img-cuda-fp16-v1"
        if scheduler == "euler_a"
        else "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
    )
