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


def _global_ti_case(tmp_path: Path) -> Any:
    """Real paired F32 safetensors; same literal has distinct signed/stream owners."""
    case = _case(tmp_path)
    resources: list[dict[str, Any]] = []
    for marker, value in ((1, b"\x00\x00\x80\x3f"), (2, b"\x00\x00\x00\x40")):
        path = tmp_path / f"global-{marker}.safetensors"
        header = json.dumps(
            {
                "clip_l": {"dtype": "F32", "shape": [1, 768], "data_offsets": [0, 3072]},
                "clip_g": {"dtype": "F32", "shape": [1, 1280], "data_offsets": [3072, 8192]},
            },
            separators=(",", ":"),
        ).encode()
        header += b" " * (-len(header) % 8)
        data = len(header).to_bytes(8, "little") + header + value * (768 + 1280)
        path.write_bytes(data)
        resources.append(
            {
                "token": "<shared>",
                "managedPath": str(path),
                "byteSize": len(data),
                "reference": {
                    "baseModelFamily": "illustrious",
                    "civitaiFileId": 100 + marker,
                    "civitaiModelId": 200 + marker,
                    "civitaiVersionId": 300 + marker,
                    "displayName": f"nontrained global fixture {marker}",
                    "fileSha256": hashlib.sha256(data).hexdigest(),
                    "kind": "embedding",
                    "localModelId": f"global-model-{marker}",
                    "localVersionId": f"global-version-{marker}",
                    "predictionType": None,
                    "versionName": "tiny paired F32 fixture",
                },
            }
        )
    recipe = case.bundle["recipe"]
    region = recipe["regions"][0]
    for prompt, pair, sign, resource in (
        (recipe["globalPrompts"]["positive"], recipe["globalEmbeddings"], "positive", resources[0]),
        (recipe["globalPrompts"]["negative"], recipe["globalEmbeddings"], "negative", resources[1]),
        (region["positive"], region["embeddings"], "positive", resources[1]),
        (region["negative"]["prompt"], region["embeddings"], "negative", resources[0]),
    ):
        prompt["text"] += " <shared>"
        prompt["embeddingRefs"] = [
            {"token": resource["token"], "resource": copy.deepcopy(resource["reference"])}
        ]
        pair[sign] = [copy.deepcopy(resource)]
    for sign in ("positive", "negative"):
        text = recipe["globalPrompts"][sign]["text"]
        recipe["item"]["prompts"][sign] = text
        case.request["job"]["prompts"][sign] = text
    region["authoredPrompts"]["positive"] = copy.deepcopy(region["positive"])
    region["authoredPrompts"]["negative"] = copy.deepcopy(region["negative"]["prompt"])
    case.resource_files = tuple(Path(resource["managedPath"]) for resource in resources)
    _seal(case)
    return case


def _assert_loader_only_prompt_neutralization(
    case: Any,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    composition_profile: str | None,
    exact_ti: bool,
) -> None:
    """Real snapshots/parser/dispatcher; fake native loader, hooks, topology and output.

    InvokeAI a61ac4fb's text_encoder/compel.py owns TI application during
    conditioning, separately from model_loaders/stable_diffusion.py acquisition.
    This checks the Studio handoff only; it does not load or consume TI natively.
    """
    if composition_profile is not None:
        case.bundle["compositionProfile"] = composition_profile
    _seal(case)
    before_wire, before_bundle = copy.deepcopy(case.wire), copy.deepcopy(case.bundle)
    expected_recipe = copy.deepcopy(case.bundle["recipe"])
    expected_recipe["regions"][0]["coverage"]["alpha"] = case.alpha.read_bytes()
    expected_command = parse_request(case.request)
    files = (case.checkpoint, case.target, case.alpha, case.manifest) + getattr(
        case, "resource_files", ()
    )
    before_files = {path: path.read_bytes() for path in files}
    calls: list[str] = []
    captured: dict[str, Any] = {}
    loader_inputs: list[Any] = []
    real_parse = worker.parse_regional_request

    def observe_parse(value: object) -> worker.RegionalRequest:
        calls.append("parse")
        request = real_parse(value)
        captured["request"] = request
        captured["before"] = copy.deepcopy(request)
        assert request.recipe == expected_recipe
        assert request.command == expected_command
        return request

    component = SimpleNamespace(eval=lambda: calls.append("eval"))
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, Any]:
        calls.append("load")
        loader_inputs.append(parameters)
        assert kwargs == {"config_dir": tmp_path, "runtime": runtime, "mode": "txt2img"}
        return pipeline, None

    def hooks(value: Any) -> None:
        calls.append("hooks")
        assert value is pipeline

    def bindings(value: Any, actual_runtime: Any) -> tuple[()]:
        calls.append("bindings")
        assert value is pipeline and actual_runtime is runtime
        return ()

    def publish(recipe: Any, **kwargs: Any) -> dict[str, object]:
        calls.append("output")
        request = captured["request"]
        assert recipe is request.recipe and recipe == expected_recipe
        assert kwargs["command"] is request.command and request.command == expected_command
        assert kwargs["pipeline"] is pipeline and kwargs["runtime"] is runtime
        assert kwargs["profile"] == (
            "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
            if composition_profile is not None
            else "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
        )
        assert (
            request.parameters.positive_prompt,
            request.parameters.negative_prompt,
        ) == (
            expected_recipe["globalPrompts"]["positive"]["text"],
            expected_recipe["globalPrompts"]["negative"]["text"],
        )
        assert request == captured["before"]
        return {
            "type": "generation-done",
            "protocolVersion": "1",
            "requestId": "private-1",
            "outputPath": str(case.root / "result.png"),
            "seed": 42,
        }

    monkeypatch.setattr(worker, "parse_regional_request", observe_parse)
    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "install_capture_hooks", hooks)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", publish)
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "generation-done"
    assert calls == ["parse", "load", "eval", "eval", "eval", "eval", "hooks", "bindings", "output"]
    assert len(loader_inputs) == 1
    parameters = loader_inputs[0]
    original = captured["request"].parameters
    assert type(parameters) is type(original)
    assert parameters.positive_embeddings == parameters.negative_embeddings == ()
    expected_fields = cast(dict[str, object], vars(original)).copy()
    if exact_ti:
        assert parameters is not original, (
            "Loader neutralization must use a detached parameter copy."
        )
        assert (parameters.positive_prompt, parameters.negative_prompt) == ("", ""), (
            "Recipe-owned global TI must bypass ordinary loader prompt validation."
        )
        expected_fields.update(positive_prompt="", negative_prompt="")
    else:
        # The old ordinary text path remains a GREEN neighbor before the fix.
        assert (parameters.positive_prompt, parameters.negative_prompt) in (
            (original.positive_prompt, original.negative_prompt),
            ("", ""),
        )
        expected_fields.update(
            positive_prompt=parameters.positive_prompt, negative_prompt=parameters.negative_prompt
        )
    assert vars(parameters) == expected_fields, "Loading must preserve every other inference field."
    assert captured["request"] == captured["before"]
    assert case.wire == before_wire and case.bundle == before_bundle
    assert {path: path.read_bytes() for path in files} == before_files
    assert not (case.root / "result.png").exists()  # Publication above is explicitly fake.


@pytest.mark.parametrize(
    "composition_profile", (None, "invoke-canvas-v1"), ids=("private", "invoke")
)
def test_global_ti_is_recipe_owned_and_only_loader_prompts_are_neutralized(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, composition_profile: str | None
) -> None:
    _assert_loader_only_prompt_neutralization(
        _global_ti_case(tmp_path),
        tmp_path,
        monkeypatch,
        composition_profile=composition_profile,
        exact_ti=True,
    )


@pytest.mark.parametrize(
    "composition_profile", (None, "invoke-canvas-v1"), ids=("private", "invoke")
)
def test_plain_global_text_reaches_output_unchanged_through_loader_boundary(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, composition_profile: str | None
) -> None:
    _assert_loader_only_prompt_neutralization(
        _case(tmp_path),
        tmp_path,
        monkeypatch,
        composition_profile=composition_profile,
        exact_ti=False,
    )


@pytest.mark.parametrize(
    "composition_profile", (None, "invoke-canvas-v1"), ids=("private", "invoke")
)
@pytest.mark.parametrize("sign", ("positive", "negative"))
@pytest.mark.parametrize("fault", ("unbound", "malformed-ref"))
def test_invalid_global_ti_still_refuses_before_loader(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    composition_profile: str | None,
    sign: str,
    fault: str,
) -> None:
    """Real owned files/parser/dispatcher; loader and output are refusal tripwires."""
    case = _global_ti_case(tmp_path)
    if composition_profile is not None:
        case.bundle["compositionProfile"] = composition_profile
    prompt = case.bundle["recipe"]["globalPrompts"][sign]
    if fault == "unbound":
        prompt["embeddingRefs"] = []
        case.bundle["recipe"]["globalEmbeddings"][sign] = []
    else:
        prompt["embeddingRefs"][0]["token"] = ""
        case.bundle["recipe"]["globalEmbeddings"][sign][0]["token"] = ""
    _seal(case)
    files = (case.checkpoint, case.target, case.alpha, case.manifest, *case.resource_files)
    before_files = {path: path.read_bytes() for path in files}
    before_wire, before_bundle = copy.deepcopy(case.wire), copy.deepcopy(case.bundle)
    calls: list[str] = []

    def load(*args: Any, **kwargs: Any) -> Any:
        calls.append("load")
        pytest.fail("Invalid global TI reached native loading.")

    def publish(*args: Any, **kwargs: Any) -> Any:
        calls.append("output")
        pytest.fail("Invalid global TI reached output.")

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", publish)
    response = inference_main.process_inference_request(
        case.wire,
        config_dir=tmp_path,
        runtime=cast(
            MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
        ),
    )
    assert response["type"] == "error"
    assert calls == []
    assert case.wire == before_wire and case.bundle == before_bundle
    assert {path: path.read_bytes() for path in files} == before_files
    assert not (case.root / "result.png").exists()
