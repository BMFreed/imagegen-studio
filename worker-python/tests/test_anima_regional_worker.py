"""Owned-file public Anima handoff and JSONL dispatcher, without trained loading.

Real Main compilation and transparent targets cross the parser. Loader/native
collaborators below are explicit; original CPU-native computation is exercised
separately by test_anima_regional_public.py.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast
from uuid import uuid4

import pytest

from imagegen_worker import anima_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.anima_worker import anima_sampling_payload
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_anima import ANIMA_BASE_ARCHITECTURE
from test_anima_regional import (
    _command,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import (
    main_inputs as main_inputs,
)


def _descriptor(path: Path) -> dict[str, object]:
    content = path.read_bytes()
    return {
        "path": str(path),
        "byteSize": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def _dormant_reference(token: str = "<inactive-resource>") -> dict[str, Any]:
    return {
        "token": token,
        "resource": {
            "kind": "embedding",
            "localModelId": "00000000-0000-4000-8000-000000000801",
            "localVersionId": "00000000-0000-4000-8000-000000000802",
            "civitaiModelId": 1,
            "civitaiVersionId": 2,
            "civitaiFileId": 3,
            "baseModelFamily": "illustrious",
            "predictionType": None,
            "fileSha256": "1" * 64,
            "displayName": "Dormant exact reference",
            "versionName": "Saved version",
        },
    }


@dataclass
class _WireCase:
    root: Path
    bundle: dict[str, Any]
    wire: dict[str, Any]

    def seal(self, content: bytes | None = None) -> None:
        path = self.root / "bundle.json"
        path.write_bytes(
            content if content is not None else json.dumps(self.bundle).encode("utf-8")
        )
        path.chmod(0o600)
        self.wire["bundle"] = _descriptor(path)


def _case(tmp_path: Path, handoff: dict[str, Any]) -> _WireCase:
    call = _command(tmp_path / "owned", handoff)
    command = call.command
    command.target_path.chmod(0o600)
    recipe = copy.deepcopy(handoff["recipe"])
    for index, region in enumerate(recipe["regions"]):
        path = command.staging_root / f"region-{index}.alpha8"
        path.write_bytes(bytes(region["coverage"]["alpha"]))
        path.chmod(0o600)
        region["coverage"]["alpha"] = {"$alpha8": _descriptor(path)}
    model: dict[str, Any] = {"architecture": "anima-base-1.0"}
    identities = ANIMA_BASE_ARCHITECTURE.companion_identities
    assert identities is not None
    # Model metadata is deliberately a loader collaborator: no fake trained
    # bytes are asserted to satisfy the production schema/hash loader.
    for role, internal in (
        ("checkpoint", "checkpoint"),
        ("qwen3Encoder", "qwen3_encoder"),
        ("vae", "vae"),
    ):
        identity = identities.get(internal, ("a" * 64, 32))
        model[role] = {
            "path": str(tmp_path / f"{role}.safetensors"),
            "sha256": identity[0],
            "byteSize": identity[1],
        }
    request: dict[str, Any] = {
        "type": "generate-anima-txt2img",
        "protocolVersion": "1",
        "requestId": command.request_id,
        "job": {
            "schemaVersion": 1,
            "model": model,
            "target": {
                **_descriptor(command.target_path),
                "width": command.width,
                "height": command.height,
                "iccSha256": hashlib.sha256(SRGB_ICC_PROFILE).hexdigest(),
            },
            "bbox": copy.deepcopy(command.bbox),
            "prompts": {
                "positive": copy.deepcopy(handoff["compiledPrompts"][0]["prompt"]),
                "negative": copy.deepcopy(handoff["compiledPrompts"][1]["prompt"]),
            },
            "sampling": anima_sampling_payload(command.sampling),
            "loras": [],
            "output": {
                "stagingRoot": str(command.staging_root),
                "pngPath": str(command.output_path),
            },
        },
    }
    case = _WireCase(
        command.staging_root,
        {
            "schemaVersion": 1,
            "request": request,
            "recipe": recipe,
            "compiledPrompts": copy.deepcopy(handoff["compiledPrompts"]),
            "compositionProfile": worker.COMPOSITION_PROFILE,
            "promptInterpretation": worker.PROMPT_INTERPRETATION,
        },
        {
            "type": "execute-current-canvas-anima-regional",
            "protocolVersion": "1",
            "requestId": command.request_id,
            "stagingRoot": str(command.staging_root),
        },
    )
    case.seal()
    return case


def _runtime(*, bf16: bool = True) -> MLRuntime:
    def supported(**_options: object) -> bool:
        return bf16

    torch = SimpleNamespace(
        bfloat16=object(),
        cuda=SimpleNamespace(is_bf16_supported=supported),
        no_grad=contextlib.nullcontext,
    )
    return MLRuntime(cast(Any, torch), cast(Any, None), cast(Any, None))


@pytest.mark.parametrize("polarity", ["positive", "negative"])
def test_dormant_authored_refs_preserve_the_complete_recipe_without_loading(
    tmp_path: Path, main_inputs: Callable[..., dict[str, Any]], polarity: str
) -> None:
    handoff = main_inputs()
    authored = handoff["recipe"]["regions"][0]["authoredPrompts"]
    if polarity == "negative":
        authored["useGlobalNegativePrompt"] = False
        authored["negative"] = {"text": "", "embeddingRefs": []}
        handoff["recipe"]["regions"][0]["negative"] = {
            "source": "regional",
            "prompt": {"text": "", "embeddingRefs": []},
        }
    authored[polarity]["embeddingRefs"] = [_dormant_reference()]
    case = _case(tmp_path, handoff)
    before = copy.deepcopy(case.bundle)
    result = worker.parse_anima_regional_request(case.wire)
    assert result.recipe["regions"][0]["authoredPrompts"][polarity] == authored[polarity]
    assert result.recipe["regions"][0]["positive"]["embeddingRefs"] == []
    assert result.recipe["regions"][0]["negative"]["prompt"]["embeddingRefs"] == []
    assert case.bundle == before


@pytest.mark.parametrize("token", ["white cat", ""])
def test_hidden_active_or_malformed_authored_refs_refuse_before_loading(
    tmp_path: Path, main_inputs: Callable[..., dict[str, Any]], token: str
) -> None:
    handoff = main_inputs()
    handoff["recipe"]["regions"][0]["authoredPrompts"]["positive"]["embeddingRefs"] = [
        _dormant_reference(token)
    ]
    case = _case(tmp_path, handoff)
    with pytest.raises(DerivativeError, match="must remain inactive"):
        worker.parse_anima_regional_request(case.wire)


def test_real_main_recipe_is_detached_and_alpha_snapshots_are_owned(
    tmp_path: Path, main_inputs: Callable[..., dict[str, Any]]
) -> None:
    handoff = main_inputs()
    case = _case(tmp_path, handoff)
    parsed = worker.parse_anima_regional_request(case.wire)
    expected = copy.deepcopy(handoff["recipe"])
    for region in expected["regions"]:
        region["coverage"]["alpha"] = bytes(region["coverage"]["alpha"])
    assert parsed.recipe == expected
    assert parsed.compiled_prompts == handoff["compiledPrompts"]
    assert parsed.command.request_id == case.wire["requestId"]
    assert not parsed.report_progress
    case.bundle["compiledPrompts"][2]["prompt"]["cleanedText"] = "changed after snapshot"
    (case.root / "region-0.alpha8").write_bytes(b"changed after snapshot")
    assert parsed.compiled_prompts == handoff["compiledPrompts"]
    assert parsed.recipe["regions"][0]["coverage"]["alpha"] == bytes(
        handoff["recipe"]["regions"][0]["coverage"]["alpha"]
    )


def _mutate(case: _WireCase, change: str) -> None:
    bundle, wire = case.bundle, case.wire
    job = bundle["request"]["job"]
    if change == "profile":
        bundle["compositionProfile"] = "invoke-anima-background-v1"
    elif change == "interpretation":
        bundle["promptInterpretation"] = "literal-v1"
    elif change == "request-id":
        wire["requestId"] = str(uuid4())
    elif change == "compiled-owner":
        bundle["compiledPrompts"][2]["sourceId"] = str(uuid4())
    elif change == "compiled-global":
        job["prompts"]["positive"]["cleanedText"] += " changed"
    elif change == "seed":
        bundle["recipe"]["item"]["seed"] += 1
    elif change == "bbox":
        job["bbox"]["x"] += 1
    elif change == "spatial-negative":
        region = bundle["recipe"]["regions"][0]
        region["negative"]["prompt"]["text"] = "blur"
        region["authoredPrompts"]["negative"]["text"] = "blur"
    elif change == "non-static":
        bundle["recipe"]["globalPrompts"]["positive"]["text"] += " {a|b}"
    elif change == "reference":
        bundle["recipe"]["regions"][0]["referenceImages"] = [{"id": str(uuid4())}]
    elif change == "textual-inversion":
        bundle["recipe"]["regions"][0]["positive"]["embeddingRefs"] = [{}]
    elif change == "lora":
        job["loras"] = [
            {"path": str(case.root.parent / "lora"), "sha256": "a" * 64, "byteSize": 1, "weight": 0}
        ]
    elif change == "img2img":
        bundle["request"]["type"] = "generate-anima-img2img"
    elif change == "external-vae":
        job["vae"] = {"path": "/external"}
    elif change == "rescale":
        job["sampling"]["guidanceRescale"] = 0.1
    elif change == "companion":
        job["model"]["vae"]["sha256"] = "b" * 64
    elif change == "resource-staging":
        job["model"]["checkpoint"]["path"] = str(case.root / "checkpoint.safetensors")
    elif change == "alpha-hash":
        bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"]["sha256"] = "b" * 64
    elif change == "alpha-alias":
        bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"] = _descriptor(
            Path(job["target"]["path"])
        )
    elif change == "target-hash":
        job["target"]["sha256"] = "b" * 64
    elif change == "existing-output":
        Path(job["output"]["pngPath"]).write_bytes(b"owned previous output")
    elif change == "extra-wire":
        wire["unexpected"] = True
    elif change == "extra-bundle":
        bundle["unexpected"] = True
    elif change == "progress-false":
        wire["reportProgress"] = False
    else:
        raise AssertionError(change)
    case.seal()


@pytest.mark.parametrize(
    "change",
    [
        "profile",
        "interpretation",
        "request-id",
        "compiled-owner",
        "compiled-global",
        "seed",
        "bbox",
        "spatial-negative",
        "non-static",
        "reference",
        "textual-inversion",
        "lora",
        "img2img",
        "external-vae",
        "rescale",
        "companion",
        "resource-staging",
        "alpha-hash",
        "alpha-alias",
        "target-hash",
        "existing-output",
        "extra-wire",
        "extra-bundle",
        "progress-false",
    ],
)
def test_public_refusals_precede_loading_and_preserve_all_files(
    tmp_path: Path,
    main_inputs: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    case = _case(tmp_path, main_inputs())
    _mutate(case, change)
    before = {path: path.read_bytes() for path in case.root.iterdir()}

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Invalid public Anima input reached model loading/native work")

    monkeypatch.setattr(worker, "load_anima_models", forbidden)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_txt2img", forbidden)
    result = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=_runtime()
    )
    assert result["type"] == "error"
    assert result["requestId"] == case.wire["requestId"]
    assert result["code"] != "GENERATION_WORKER_FAILED"
    assert {path: path.read_bytes() for path in case.root.iterdir()} == before


def test_private_empty_rows_do_not_enter_the_public_lane(
    tmp_path: Path, main_inputs: Callable[..., dict[str, Any]]
) -> None:
    case = _case(tmp_path, main_inputs("empty"))
    with pytest.raises(DerivativeError, match="nonempty positive"):
        worker.parse_anima_regional_request(case.wire)


def test_exact_empty_inherited_negative_preserves_nonempty_regional_positives(
    tmp_path: Path, main_inputs: Callable[..., dict[str, Any]]
) -> None:
    case = _case(tmp_path, main_inputs("inherited"))
    parsed = worker.parse_anima_regional_request(case.wire)
    assert parsed.recipe["globalPrompts"]["negative"]["text"] == ""
    assert all(region["positive"]["text"] != "" for region in parsed.recipe["regions"])


@pytest.mark.parametrize("width", [64, 512, 520])
def test_public_dimension_boundary_has_an_adjacent_ordinary_control(
    tmp_path: Path, main_inputs: Callable[..., dict[str, Any]], width: int
) -> None:
    case = _case(tmp_path, main_inputs(width=width))
    if width <= 512:
        assert worker.parse_anima_regional_request(case.wire).command.width == width
    else:
        with pytest.raises(DerivativeError, match="64..512"):
            worker.parse_anima_regional_request(case.wire)


@pytest.mark.parametrize("kind", ["duplicate", "nan", "utf8", "symlink", "hardlink", "mode"])
def test_existing_snapshot_rules_guard_the_new_wire(
    tmp_path: Path, main_inputs: Callable[..., dict[str, Any]], kind: str
) -> None:
    case = _case(tmp_path, main_inputs())
    manifest = case.root / "bundle.json"
    if kind == "duplicate":
        case.seal(b'{"schemaVersion":1,"schemaVersion":1}')
    elif kind == "nan":
        case.seal(b'{"schemaVersion":NaN}')
    elif kind == "utf8":
        case.seal(b"\xff")
    elif kind == "symlink":
        moved = case.root / "real-bundle.json"
        manifest.rename(moved)
        manifest.symlink_to(moved)
    elif kind == "hardlink":
        os.link(manifest, case.root / "second-bundle.json")
    else:
        manifest.chmod(0o622)
    with pytest.raises(DerivativeError):
        worker.parse_anima_regional_request(case.wire)


def test_ready_capability_tracks_the_existing_optional_bf16_probe() -> None:
    assert worker.ANIMA_REGIONAL_CAPABILITY not in cast(
        list[str], inference_main.inference_ready_message()["capabilities"]
    )
    for supported in (False, True):
        ready = inference_main.inference_ready_message(_runtime(bf16=supported))
        assert (
            worker.ANIMA_REGIONAL_CAPABILITY in cast(list[str], ready["capabilities"])
        ) is supported


@pytest.mark.parametrize("progress", [False, True])
def test_dispatch_uses_one_owned_loader_and_correlated_ordinary_progress(
    tmp_path: Path,
    main_inputs: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
    progress: bool,
) -> None:
    case = _case(tmp_path, main_inputs())
    if progress:
        case.wire["reportProgress"] = True
    calls: list[object] = []
    runtime = _runtime()
    models = SimpleNamespace(
        **{
            role: SimpleNamespace(eval=lambda: calls.append("eval"))
            for role in ("transformer", "text_conditioner", "qwen3_encoder", "vae")
        }
    )

    def load(bundle: Any, **options: Any) -> Any:
        assert bundle == worker.parse_anima_regional_request(case.wire).command.bundle
        assert options == {"device": "cuda", "dtype": cast(Any, runtime.torch).bfloat16}
        calls.append("load")
        return models

    def generate(recipe: Any, **options: Any) -> dict[str, object]:
        assert calls == ["load", "eval", "eval", "eval", "eval"]
        assert recipe["family"] == "anima"
        assert options["models"] is models and options["runtime"] is runtime
        assert options["profile"] == "cuda-bfloat16-v1"
        assert options["composition_profile"] == worker.COMPOSITION_PROFILE
        sink = options["on_progress"]
        assert (sink is not None) is progress
        if sink is not None:
            sink(1, 2)
            sink(2, 2)
        calls.append("native")
        return {"type": "generation-done", "requestId": options["command"].request_id}

    monkeypatch.setattr(worker, "load_anima_models", load)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_anima_txt2img", generate)
    events: list[dict[str, object]] = []
    done = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime, on_progress=events.append
    )
    assert done == {"type": "generation-done", "requestId": case.wire["requestId"]}
    assert calls[-1] == "native"
    assert events == (
        [
            {
                "type": "generation-progress",
                "protocolVersion": "1",
                "requestId": case.wire["requestId"],
                "step": step,
                "totalSteps": 2,
            }
            for step in (1, 2)
        ]
        if progress
        else []
    )


@pytest.mark.parametrize("failure", ["bf16", "no-sink", "bad-sink", "loader"])
def test_public_execution_refusal_and_loader_failure_remain_correlated(
    tmp_path: Path,
    main_inputs: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    case = _case(tmp_path, main_inputs())
    calls: list[str] = []

    def load(*_args: Any, **_options: Any) -> Any:
        calls.append("load")
        raise DerivativeError("GENERATION_INPUT_CHANGED", "controlled loader failure")

    monkeypatch.setattr(worker, "load_anima_models", load)
    if failure in {"no-sink", "bad-sink"}:
        case.wire["reportProgress"] = True
    result = inference_main.process_inference_request(
        case.wire,
        config_dir=tmp_path,
        runtime=_runtime(bf16=failure != "bf16"),
        on_progress=cast(Any, 1) if failure == "bad-sink" else None,
    )
    assert result["type"] == "error" and result["requestId"] == case.wire["requestId"]
    assert calls == (["load"] if failure == "loader" else [])
    assert not Path(case.bundle["request"]["job"]["output"]["pngPath"]).exists()


def test_jsonl_loop_routes_the_sealed_anima_request(
    tmp_path: Path,
    main_inputs: Callable[..., dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    case = _case(tmp_path, main_inputs())
    case.wire["reportProgress"] = True

    def execute(value: object, **options: Any) -> dict[str, object]:
        assert worker.parse_anima_regional_request(value).report_progress
        options["on_progress"](1, 2)
        return {
            "type": "generation-done",
            "protocolVersion": "1",
            "requestId": case.wire["requestId"],
        }

    monkeypatch.setattr(worker, "execute_anima_regional_request", execute)
    monkeypatch.setattr(inference_main, "_qualify", lambda: (tmp_path, _runtime()))
    output = io.BytesIO()
    monkeypatch.setattr(
        inference_main.sys,
        "stdin",
        SimpleNamespace(buffer=io.BytesIO(json.dumps(case.wire).encode("utf-8") + b"\n")),
    )
    monkeypatch.setattr(inference_main.sys, "stdout", SimpleNamespace(buffer=output))
    assert inference_main.main() == 0
    messages = [json.loads(line) for line in output.getvalue().splitlines()]
    assert [message["type"] for message in messages] == [
        "ready",
        "generation-progress",
        "generation-done",
    ]
    assert messages[1]["requestId"] == messages[2]["requestId"] == case.wire["requestId"]
