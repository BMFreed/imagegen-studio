"""Fresh owned LoRA preparation reaches Smart regional CLIP/UNet and PNG.

InvokeAI4875d965 graph SDXL collection loaders feed both CLIPs and UNet; regional
encoder edges copy those same patched sources. Compel/denoise callers apply the
ordered signed stack, and LayerPatcher uses FP32 residuals before model casting.
Tests keep descriptor capture, exact resource snapshots, native CLIP/attention,
Euler, VAE and PNG publication. Only tiny owned loading and CPU placement replace
the installed exact-file CUDA factory. These are mechanical, not trained/visual
or public installed qualification. ROOT owns bounded execution and mutation.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_regional_lora as preparation
from imagegen_worker import illustrious_smart_patch_regional as smart
from imagegen_worker import illustrious_smart_patch_regional_worker as worker
from imagegen_worker import inference_main, smart_patch_execution
from imagegen_worker.derivatives import DerivativeError
from test_illustrious_regional_conditioning import (
    _bindings,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _observe,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_lora import (
    CLIP2_PATH,
    UNET_PATH,
    _expected,  # pyright: ignore[reportPrivateUsage]
    _module,  # pyright: ignore[reportPrivateUsage]
    _pair,  # pyright: ignore[reportPrivateUsage]
    _resource,  # pyright: ignore[reportPrivateUsage]
    _wire_entry,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional import MODES
from test_illustrious_smart_patch_regional_worker import (
    _Case,  # pyright: ignore[reportPrivateUsage]
    _tripwire,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional_worker import (
    _case as _eps_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional_worker import native as native
from test_sdxl_lora import _save  # pyright: ignore[reportPrivateUsage]

PATHS = ("text_encoder.text_model.encoder.layers.0.mlp.fc1", CLIP2_PATH, UNET_PATH)
OBJECTIVES = ("epsilon", "v_prediction")


def _profile(mode: str, objective: str, active: bool) -> str:
    suffix = "v-prediction-" if objective == "v_prediction" else ""
    return f"invoke-illustrious-smart-regional-{suffix}{'lora-' if active else ''}{mode}-v1"


def _case(directory: Path, mode: str, objective: str, stack: tuple[Any, ...]) -> _Case:
    case = _eps_case(directory, mode)
    for complete in (case.private, case.bundle):
        complete["profile"] = _profile(mode, objective, bool(stack))
        parameters = complete["execution"]["inference"]
        parameters["checkpoint"]["predictionType"] = objective
        parameters["loras"] = [_wire_entry(item) for item in stack]
        if objective == "v_prediction":
            complete["recipe"]["sampling"]["noiseProfile"] = copy.deepcopy(
                parameters["sampling"]["noiseProfile"]
            )
    case.seal()
    return case


def _run(
    case: _Case,
    source: Any,
    monkeypatch: pytest.MonkeyPatch,
    *,
    expected_weights: dict[str, Any] | None = None,
    progress_sink: Any = None,
) -> Any:
    """The numerical oracle only supplies independent owned factory weights.

    Production source/KEEP, denoising, attention and publication run unchanged.
    Preservation starts after successful owned preparation, as required by the
    borrowed regional ABI; the reusable source fixture is never patched.
    """
    owned = copy.copy(source)
    owned.pipeline = copy.deepcopy(source.pipeline)
    owned.pipeline.vae.to(dtype=source.torch.float16).to(dtype=source.torch.float32)
    if expected_weights is not None:
        for path, weight in expected_weights.items():
            _module(owned.pipeline, path).weight.data = weight.clone()
    original = smart.run_prepared_illustrious_smart_patch_regional
    loading: list[Any] = []
    captures: list[Any] = []

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, None]:
        assert not source.torch.is_grad_enabled()
        assert kwargs["mode"] == "txt2img"
        assert parameters.loras == ()
        assert (parameters.positive_prompt, parameters.negative_prompt) == ("", "")
        loading.append(parameters)
        return owned.pipeline, None

    def run(captured: Any, pipeline: Any, decoded: Any, **kwargs: Any) -> Any:
        assert kwargs.pop("profile") == "cuda-float16-v1"
        assert pipeline is owned.pipeline
        pipeline.vae.to(dtype=source.torch.float32)
        captures.append(captured)
        with _preserved(owned):
            return original(
                captured,
                pipeline,
                decoded,
                profile="cpu-float32-v1",
                bindings=_bindings(owned, pipeline.unet),
                **kwargs,
            )

    denoising = importlib.import_module("imagegen_worker.illustrious_regional_denoising")
    with monkeypatch.context() as patch:
        patch.setattr(smart_patch_execution.inference, "load_illustrious_pipeline", load)
        patch.setattr(smart, "run_prepared_illustrious_smart_patch_regional", run)
        with _observe(denoising, owned, patch) as seen:
            response = inference_main.process_inference_request(
                case.wire, config_dir=case.root, runtime=owned.runtime, on_progress=progress_sink
            )
    if response["type"] == "error":
        assert not Path(case.private["execution"]["output"]["pngPath"]).exists()
        raise DerivativeError(cast(str, response["code"]), cast(str, response["message"]))
    assert response["type"] == "smart-patch-executed"
    path = Path(case.private["execution"]["output"]["pngPath"])
    with Image.open(path) as image:
        assert image.mode == "RGB" and image.size == (64, 64)
        seen.rgb = image.tobytes()
    metadata = cast(dict[str, Any], response["output"])
    assert metadata["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert len(loading) == len(captures) == 1 and len(seen.decodes) == 1
    seen.captured = captures[0]
    seen.weights = {path: _module(owned.pipeline, path).weight.detach().clone() for path in PATHS}
    return seen


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("objective", OBJECTIVES)
def test_descriptor_signed_ordered_stack_native_consumption_red(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str, objective: str
) -> None:
    states = tuple(
        {
            key: tensor
            for path in PATHS
            for key, tensor in _pair(native.torch, native.pipeline, path, marker=marker).items()
        }
        for marker in (0.0, 0.3, 0.8)
    )
    weights = (0.7, -0.5, 0.0)
    stack = tuple(
        _save(tmp_path / f"source-{index}.safetensors", state, weight)
        for index, (state, weight) in enumerate(zip(states, weights, strict=True))
    )
    expected = _expected(
        native.torch, native.pipeline, PATHS, tuple(zip(states, weights, strict=True))
    )
    actual_case = _case(tmp_path / "actual", mode, objective, stack)
    oracle_case = _case(tmp_path / "oracle", mode, objective, ())
    actual = _run(actual_case, native, monkeypatch)
    oracle = _run(oracle_case, native, monkeypatch, expected_weights=expected)
    # All comparisons occur after two real native PNG publications. The oracle
    # used independent FP32 arithmetic, never prepare_regional_loras/qualifier.
    assert len(actual.contexts) == len(oracle.contexts) == 2
    for value, expected_value in zip(actual.contexts, oracle.contexts, strict=True):
        assert native.torch.equal(value, expected_value), "Smart regional CLIP lost global LoRA"
    for value, expected_value in zip(actual.unet_results, oracle.unet_results, strict=True):
        assert native.torch.equal(value[0], expected_value[0]), (
            "Smart regional native UNet lost the prepared global LoRA"
        )
    assert actual.rgb == oracle.rgb
    for path, expected_weight in expected.items():
        assert native.torch.equal(actual.weights[path], expected_weight), path
    assert actual.captured.policy.loras == stack
    assert actual.captured.command.inference is actual.captured.policy
    assert actual.captured.policy.prediction_type == objective


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("objective", OBJECTIVES)
def test_descriptor_enabled_zero_native_control_green(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str, objective: str
) -> None:
    state = _pair(native.torch, native.pipeline, CLIP2_PATH)
    zero = _save(tmp_path / "zero.safetensors", state, 0)
    actual = _run(_case(tmp_path / "zero", mode, objective, (zero,)), native, monkeypatch)
    clean = _run(_case(tmp_path / "clean", mode, objective, ()), native, monkeypatch)
    assert actual.rgb == clean.rgb
    assert actual.captured.policy.loras == (zero,)
    for value, expected_value in zip(actual.contexts, clean.contexts, strict=True):
        assert native.torch.equal(value, expected_value)
    for value, expected_value in zip(actual.unet_results, clean.unet_results, strict=True):
        assert native.torch.equal(value[0], expected_value[0])


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("objective", OBJECTIVES)
@pytest.mark.parametrize("active", (False, True))
def test_profile_requires_exact_objective_and_stack_presence_before_model_loading(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    mode: str,
    objective: str,
    active: bool,
) -> None:
    zero = _resource(tmp_path / "zero.safetensors", 0)
    case = _case(tmp_path / "capture", mode, objective, (zero,) if active else ())
    captured = worker.parse_illustrious_smart_patch_regional_request(case.wire).captured
    assert bool(captured.policy.loras) is active
    assert captured.policy.prediction_type == objective
    monkeypatch.setattr(smart_patch_execution.inference, "load_illustrious_pipeline", _tripwire)
    for profile in (
        _profile(mode, objective, not active),
        _profile(mode, "epsilon" if objective == "v_prediction" else "v_prediction", active),
        _profile("img2img" if mode == "txt2img" else "txt2img", objective, active),
    ):
        case.bundle["profile"] = profile
        case.seal()
        with pytest.raises(DerivativeError):
            worker.parse_illustrious_smart_patch_regional_request(case.wire)


@pytest.mark.parametrize("objective", OBJECTIVES)
@pytest.mark.parametrize(
    "fault", ("missing", "changed", "budget", "changed-during-load", "invalid-target-zero")
)
def test_zero_lora_is_verified_before_loader_or_prepared_before_borrowing(
    tmp_path: Path,
    native: Any,
    monkeypatch: pytest.MonkeyPatch,
    objective: str,
    fault: str,
) -> None:
    state = _pair(native.torch, native.pipeline, CLIP2_PATH)
    if fault == "invalid-target-zero":
        state = {key.replace("mlp_fc1", "missing_target"): value for key, value in state.items()}
    zero = _save(tmp_path / "zero.safetensors", state, 0)
    case = _case(tmp_path / "owned", "txt2img", objective, (zero,))
    if fault == "missing":
        zero.path.unlink()
    elif fault == "changed":
        zero.path.write_bytes(zero.path.read_bytes() + b"changed")
    elif fault == "budget":
        monkeypatch.setattr(preparation, "MAX_REGIONAL_LORA_BYTES", zero.byte_size - 1)
    if fault not in ("changed-during-load", "invalid-target-zero"):
        monkeypatch.setattr(smart_patch_execution.inference, "load_illustrious_pipeline", _tripwire)
    else:
        monkeypatch.setattr(smart, "run_prepared_illustrious_smart_patch_regional", _tripwire)

        def load(*_args: Any, **_kwargs: Any) -> tuple[Any, None]:
            if fault == "changed-during-load":
                zero.path.write_bytes(zero.path.read_bytes() + b"later change")
            return copy.deepcopy(native.pipeline), None

        monkeypatch.setattr(
            smart_patch_execution.inference,
            "load_illustrious_pipeline",
            load,
        )
    response = inference_main.process_inference_request(
        case.wire, config_dir=case.root, runtime=native.runtime
    )
    assert response["type"] == "error"
    assert response["code"] in ("GENERATION_INPUT_CHANGED", "GENERATION_LORA_UNSUPPORTED")
    assert not Path(case.private["execution"]["output"]["pngPath"]).exists()


def test_lora_mode_capabilities_are_additive_and_keep_legacy_grants() -> None:
    capabilities = cast(list[str], inference_main.inference_ready_message()["capabilities"])
    for mode in MODES:
        for objective in OBJECTIVES:
            stem = "v-prediction-" if objective == "v_prediction" else ""
            assert f"illustrious-smart-patch-regional-{stem}{mode}-v1" in capabilities
            assert f"illustrious-smart-patch-regional-{stem}lora-{mode}-v1" in capabilities
