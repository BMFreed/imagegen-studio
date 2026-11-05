"""Explicit frozen initialization identity through real snapshots and dispatcher.

Read InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd at
app/services/session_queue/session_queue_common.py:create_session_nfv_tuples,
session_queue_default.py:retry_items_by_id, app/invocations/latent_noise.py,
app/invocations/noise.py and backend/util/devices.py. Invoke snapshots invocation
graphs, while its noise dtype comes from runtime configuration. Studio's separate
optional identity binds the already qualified Invoke initialization profile to
each frozen request. Absence must never select today's preferred initialization.

Real no-follow snapshots, parsing and dispatch remain under test; trained loading
and publication are explicitly replaced collaborators. Native initialization math
belongs to test_illustrious_regional_invoke_initialization.py, not this bridge.
Mutation selector test_explicit_initialization_profile_reaches_existing_output
must fail if dispatch drops the identity; its legacy neighbor stays GREEN.
ROOT owns collection, typing, runtime tests and mutation execution.
"""

from __future__ import annotations

import contextlib
import copy
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import MLRuntime
from test_illustrious_regional_worker import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _seal,  # pyright: ignore[reportPrivateUsage]
)

INITIALIZATION = "invoke-cpu-f32-add-noise-v1"
INVOKE_EXECUTION = "ordinary-canvas-euler-ancestral-invoke-init-txt2img-cuda-fp16-v1"
LEGACY_ANCESTRAL = "ordinary-canvas-euler-ancestral-txt2img-cuda-fp16-v1"
LEGACY_EULER = "ordinary-canvas-euler-txt2img-cuda-fp16-v2"


def _runtime() -> MLRuntime:
    return cast(MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext)))


def _output_observer(monkeypatch: pytest.MonkeyPatch, case: Any) -> SimpleNamespace:
    """Observe one real handoff, with explicit loader and output collaborators."""
    seen = SimpleNamespace(loads=[], outputs=[], events=[])

    def evaluate() -> None:
        seen.events.append("eval")

    component = SimpleNamespace(eval=evaluate)
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = _runtime()
    receipt: dict[str, object] = {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": case.wire["requestId"],
        "outputPath": str(case.root / "result.png"),
        "seed": case.request["job"]["sampling"]["seed"],
    }

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, None]:
        assert parameters.checkpoint_path == case.checkpoint
        assert parameters.positive_embeddings == parameters.negative_embeddings == ()
        assert kwargs["mode"] == "txt2img"
        assert kwargs["runtime"] is runtime
        seen.loads.append(parameters)
        seen.events.append("load")
        return pipeline, None

    def hooks(value: Any) -> None:
        assert value is pipeline
        seen.events.append("hooks")

    def bindings(value: Any, active_runtime: Any) -> tuple[()]:
        assert value is pipeline and active_runtime is runtime
        seen.events.append("bindings")
        return ()

    def output(recipe: Any, **kwargs: Any) -> dict[str, object]:
        assert recipe["regions"][0]["coverage"]["alpha"] == case.alpha.read_bytes()
        assert kwargs["pipeline"] is pipeline and kwargs["runtime"] is runtime
        assert kwargs["command"].scheduler == case.request["job"]["sampling"]["scheduler"]
        seen.outputs.append(kwargs)
        seen.events.append("output")
        return receipt

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "install_capture_hooks", hooks)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", output)
    seen.runtime = runtime
    seen.receipt = receipt
    return seen


@pytest.mark.parametrize("composition", (None, "invoke-canvas-v1"))
def test_explicit_initialization_profile_reaches_existing_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, composition: str | None
) -> None:
    case = _case(tmp_path)
    case.request["job"]["sampling"].update(scheduler="euler_a", steps=28)
    case.bundle["initializationProfile"] = INITIALIZATION
    if composition is not None:
        case.bundle["compositionProfile"] = composition
    _seal(case)
    original_bundle = copy.deepcopy(case.bundle)
    seen = _output_observer(monkeypatch, case)
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.initialization_profile == INITIALIZATION
    assert parsed.composition_profile == composition
    assert parsed.parameters.scheduler == "euler_a"
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=seen.runtime
    )
    assert response is seen.receipt
    assert len(seen.loads) == len(seen.outputs) == 1
    assert seen.outputs[0]["denoising_profile"] == INVOKE_EXECUTION
    assert seen.outputs[0]["profile"] == (
        "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
        if composition is not None
        else "ordinary-canvas-static-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
    )
    assert seen.events == ["load", "eval", "eval", "eval", "eval", "hooks", "bindings", "output"]
    assert case.bundle == original_bundle
    assert not (case.root / "result.png").exists()


@pytest.mark.parametrize("scheduler", ("euler", "euler_a"))
@pytest.mark.parametrize("composition", (None, "invoke-canvas-v1"))
def test_absent_initialization_legacy_dispatch_control_green(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, scheduler: str, composition: str | None
) -> None:
    case = _case(tmp_path)
    case.request["job"]["sampling"].update(scheduler=scheduler, steps=28)
    if composition is not None:
        case.bundle["compositionProfile"] = composition
    _seal(case)
    assert "initializationProfile" not in case.bundle
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.initialization_profile is None
    seen = _output_observer(monkeypatch, case)
    response = worker.execute_regional_request(case.wire, config_dir=tmp_path, runtime=seen.runtime)
    assert response is seen.receipt
    assert len(seen.loads) == len(seen.outputs) == 1
    assert seen.outputs[0]["denoising_profile"] == (
        LEGACY_ANCESTRAL if scheduler == "euler_a" else LEGACY_EULER
    )
    assert "initializationProfile" not in case.bundle


@pytest.mark.parametrize("marker", (None, "", "invoke-cpu-f32-add-noise-v2", False, 1, {}, []))
def test_invalid_explicit_initialization_refuses_before_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, marker: object
) -> None:
    case = _case(tmp_path)
    case.request["job"]["sampling"]["scheduler"] = "euler_a"
    case.bundle["initializationProfile"] = marker
    _seal(case)
    seen = _output_observer(monkeypatch, case)
    before_target = case.target.read_bytes()
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=seen.runtime
    )
    assert response["type"] == "error" and response["code"] == "INVALID_REQUEST"
    assert seen.loads == seen.outputs == seen.events == []
    assert case.target.read_bytes() == before_target
    assert not (case.root / "result.png").exists()
    case.bundle["initializationProfile"] = INITIALIZATION
    _seal(case)
    assert (
        worker.execute_regional_request(case.wire, config_dir=tmp_path, runtime=seen.runtime)
        is seen.receipt
    )
    assert seen.outputs[0]["denoising_profile"] == INVOKE_EXECUTION


@pytest.mark.parametrize("scheduler", ("euler", "dpmpp_2m", "ddim"))
def test_explicit_initialization_refuses_non_ancestral_sampler_before_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, scheduler: str
) -> None:
    case = _case(tmp_path)
    case.request["job"]["sampling"]["scheduler"] = scheduler
    case.bundle["initializationProfile"] = INITIALIZATION
    _seal(case)
    seen = _output_observer(monkeypatch, case)
    with pytest.raises(DerivativeError) as caught:
        worker.execute_regional_request(case.wire, config_dir=tmp_path, runtime=seen.runtime)
    assert caught.value.code == "INVALID_REQUEST"
    assert seen.loads == seen.outputs == seen.events == []


def test_initialization_selection_never_becomes_a_process_default(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path)
    case.request["job"]["sampling"]["scheduler"] = "euler_a"
    seen = _output_observer(monkeypatch, case)
    for marker in (None, INITIALIZATION, None):
        if marker is None:
            case.bundle.pop("initializationProfile", None)
        else:
            case.bundle["initializationProfile"] = marker
        _seal(case)
        assert (
            worker.execute_regional_request(case.wire, config_dir=tmp_path, runtime=seen.runtime)
            is seen.receipt
        )
    assert [item["denoising_profile"] for item in seen.outputs] == [
        LEGACY_ANCESTRAL,
        INVOKE_EXECUTION,
        LEGACY_ANCESTRAL,
    ]
    assert len(seen.loads) == 3


def test_invoke_initialization_capability_is_separate_from_composition() -> None:
    capabilities = cast(list[str], inference_main.inference_ready_message()["capabilities"])
    assert capabilities.count("illustrious-regional-invoke-init-v1") == 1
    assert "illustrious-regional-invoke-v1" in capabilities
    assert "private-current-canvas-regional-v1" in capabilities
