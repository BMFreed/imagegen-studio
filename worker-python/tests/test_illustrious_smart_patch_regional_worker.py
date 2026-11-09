"""Public descriptors reach original Illustrious Smart regional consumers.

Invoke4875 compileCanvasGraph adds signed regions after the selected source graft;
its prepareCanvasInvocation caller supplies resolved owned masks. These tests keep
owned-file snapshots, dispatcher, complete input, native regional CLIP/attention/
Euler/VAE and exclusive PNG publication real. Tiny native model loading and CPU
placement are explicit substitutions, not installed/trained/public-quality proof.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_smart_patch_regional as smart
from imagegen_worker import illustrious_smart_patch_regional_worker as worker
from imagegen_worker import inference_main, smart_patch_execution
from imagegen_worker.derivatives import DerivativeError
from test_illustrious_regional_conditioning import (
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _encode,  # pyright: ignore[reportPrivateUsage]
    _observe,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import _literal_bank  # pyright: ignore[reportPrivateUsage]
from test_illustrious_smart_patch_regional import (
    MODES,
    _permissions,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional import (
    _case as _private_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional import native as native


def _descriptor(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    return {"path": str(path), "byteSize": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


@dataclass
class _Case:
    private: dict[str, Any]
    bundle: dict[str, Any]
    wire: dict[str, Any]

    @property
    def root(self) -> Path:
        return Path(self.private["execution"]["output"]["stagingRoot"])

    def seal(self) -> None:
        path = self.root / "smart-regional.json"
        path.write_bytes(json.dumps(self.bundle, ensure_ascii=False).encode("utf-8"))
        path.chmod(0o600)
        self.wire["bundle"] = _descriptor(path)


def _case(directory: Path, mode: str = "inpaint", *, regions: bool = True) -> _Case:
    private = _private_case(directory, mode, regions=regions)
    bundle = copy.deepcopy(private)
    root = Path(private["execution"]["output"]["stagingRoot"])
    for image in (private["execution"]["modelSource"], private["execution"]["latentKeepMask"]):
        if image is not None:
            Path(image["path"]).chmod(0o600)
    for index, region in enumerate(bundle["recipe"]["regions"]):
        path = root / f"regional-{index}.alpha8"
        path.write_bytes(region["coverage"]["alpha"])
        path.chmod(0o600)
        region["coverage"]["alpha"] = {"$alpha8": _descriptor(path)}
    result = _Case(
        private,
        bundle,
        {
            "type": "execute-illustrious-smart-patch-regional",
            "protocolVersion": "1",
            "requestId": private["execution"]["requestId"],
            "stagingRoot": str(root),
        },
    )
    result.seal()
    return result


def _tripwire(*_args: Any, **_kwargs: Any) -> Any:
    pytest.fail("Invalid regional descriptor reached model/native work")


def _run(
    case: _Case, native: Any, monkeypatch: pytest.MonkeyPatch, *, progress_sink: Any = None
) -> Any:
    # Job-owned tiny models stand in for the production loader. Its VAE arrives
    # in FP16; quantize this fresh owned VAE before the CPU preservation baseline,
    # rather than mutating the reusable native fixture through the placement seam.
    native = copy.copy(native)
    native.pipeline = copy.deepcopy(native.pipeline)
    native.pipeline.vae.to(dtype=native.torch.float16).to(dtype=native.torch.float32)
    original_run = smart.run_prepared_illustrious_smart_patch_regional
    calls: list[str] = []
    events: list[dict[str, object]] = []
    native_images: list[bytes] = []

    def loader(_policy: Any, **kwargs: Any) -> tuple[Any, None]:
        assert not native.torch.is_grad_enabled()
        assert kwargs["mode"] == "txt2img"
        calls.append("load")
        # The native observer shares the real CLIP/UNet/VAE identities. A fresh
        # shallow pipeline shell owns only per-job config; state must restore.
        return copy.copy(native.pipeline), None

    def cpu_run(captured: Any, pipeline: Any, decoded: Any, **kwargs: Any) -> Any:
        assert not native.torch.is_grad_enabled()
        assert kwargs.pop("profile") == "cuda-float16-v1"
        pipeline.vae.to(dtype=native.torch.float32)
        result = original_run(
            captured,
            pipeline,
            decoded,
            profile="cpu-float32-v1",
            bindings=_bindings(native, pipeline.unet),
            **kwargs,
        )
        native_images.append(result.images[0].tobytes())
        calls.append("native")
        return result

    def report(event: dict[str, object]) -> None:
        events.append(dict(event))
        if progress_sink is not None:
            progress_sink(event)

    denoising = importlib.import_module("imagegen_worker.illustrious_regional_denoising")
    with monkeypatch.context() as patch:
        patch.setattr(smart_patch_execution.inference, "load_illustrious_pipeline", loader)
        patch.setattr(smart, "run_prepared_illustrious_smart_patch_regional", cpu_run)
        with _preserved(native), _observe(denoising, native, patch) as seen:
            done = inference_main.process_inference_request(
                case.wire, config_dir=case.root, runtime=native.runtime, on_progress=report
            )
    if done["type"] == "error":
        assert not Path(case.private["execution"]["output"]["pngPath"]).exists()
        raise DerivativeError(cast(str, done["code"]), cast(str, done["message"]))
    assert calls == ["load", "native"] and done["type"] == "smart-patch-executed"
    assert done["requestId"] == case.wire["requestId"] and done["actualSeed"] == 42
    output = Path(case.private["execution"]["output"]["pngPath"])
    with Image.open(output) as image:
        assert image.mode == "RGB" and image.size == (64, 64)
        assert image.tobytes() == native_images[0]
    metadata = cast(dict[str, Any], done["output"])
    assert metadata["sha256"] == hashlib.sha256(output.read_bytes()).hexdigest()
    assert metadata["byteSize"] == output.stat().st_size
    assert len(seen.decodes) == 1 and seen.decode_reserved == [True]
    assert len(seen.steps) == 2
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
        if case.wire.get("reportProgress") is True
        else []
    )
    return seen


@pytest.mark.parametrize("mode", MODES)
def test_descriptor_dispatch_native_oracle_red(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / mode, mode)
    case.wire["reportProgress"] = True
    streams = (_encode(native, "cat", "blur"), _encode(native, "dog", "grain"))
    expected = native.torch.cat(
        tuple(_literal_bank(native, streams, sign, 154) for sign in ("negative", "positive"))
    )
    seen = _run(case, native, monkeypatch)
    # Every assertion below occurs after original native decode and actual PNG.
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]
    for context, mask in zip(seen.contexts, seen.masks, strict=True):
        assert native.torch.equal(context, expected)
        assert mask is not None
        assert native.torch.equal(_mask(native, mask, 2, 64, 154), _permissions(native))
    assert (
        seen.scopes[0].plan.positive.segments[0].token_range.binding_id
        == case.private["recipe"]["layerId"]
    )


@pytest.mark.parametrize("mode", MODES)
def test_descriptor_zero_region_control_green(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    case = _case(tmp_path / mode, mode, regions=False)
    seen = _run(case, native, monkeypatch)
    assert seen.builds == [("cat", "blur")]
    assert all(mask is None for mask in seen.masks)
    assert (
        seen.scopes[0].plan.positive.segments[0].token_range.binding_id
        == case.private["recipe"]["layerId"]
    )


@pytest.mark.parametrize("mode", MODES)
def test_descriptor_snapshot_owns_original_command_and_world_alpha(
    tmp_path: Path, mode: str
) -> None:
    case = _case(tmp_path / mode, mode)
    before = {path.name: path.read_bytes() for path in case.root.iterdir() if path.is_file()}
    parsed = worker.parse_illustrious_smart_patch_regional_request(case.wire)
    private = smart.capture_illustrious_smart_patch_regional_input(case.private)
    assert parsed.captured == private and parsed.report_progress is False
    assert parsed.captured.command.inference is parsed.captured.policy
    (case.root / "regional-0.alpha8").write_bytes(bytes(107 * 73))
    case.bundle["recipe"]["globalPrompts"]["negative"]["text"] = "later Canvas edit"
    assert parsed.captured.world_alpha == private.world_alpha
    assert "later Canvas edit" not in parsed.captured.recipe_json
    assert before["keep.png"] == (case.root / "keep.png").read_bytes()


FAULTS = (
    "profile",
    "inner-mode",
    "family",
    "outer-id",
    "seed",
    "noise",
    "unexpected-compiled",
    "unexpected-interpretation",
    "raw-digest",
    "raw-size",
    "raw-symlink",
    "raw-alias",
    "source-collision",
    "bundle-collision",
    "existing-output",
    "progress-false",
    "missing-progress-sink",
)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("fault", FAULTS)
def test_descriptor_refuses_before_native(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mode: str, fault: str
) -> None:
    case = _case(tmp_path / mode, mode)
    if fault == "profile":
        case.bundle["profile"] = "invoke-anima-smart-regional-inpaint-v1"
    elif fault == "inner-mode":
        case.bundle["execution"]["mode"] = "inpaint" if mode != "inpaint" else "outpaint"
    elif fault == "family":
        case.bundle["execution"]["family"] = "anima"
    elif fault == "outer-id":
        case.wire["requestId"] = "00000000-0000-4000-8000-000000000001"
    elif fault == "seed":
        case.bundle["recipe"]["item"]["seed"] += 1
    elif fault == "noise":
        case.bundle["execution"]["inference"]["sampling"]["noiseProfile"]["timestepSpacing"] = (
            "linspace"
        )
    elif fault == "unexpected-compiled":
        case.bundle["compiledPrompts"] = []
    elif fault == "unexpected-interpretation":
        case.bundle["promptInterpretation"] = "invoke-fragments-v1"
    elif fault == "raw-digest":
        (case.root / "regional-0.alpha8").write_bytes(bytes(107 * 73))
    elif fault == "raw-size":
        case.bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"]["byteSize"] -= 1
    elif fault == "raw-symlink":
        raw = case.root / "regional-0.alpha8"
        target = tmp_path / "foreign.alpha8"
        raw.rename(target)
        raw.symlink_to(target)
    elif fault == "raw-alias":
        case.bundle["recipe"]["regions"][0]["coverage"]["alpha"]["$alpha8"]["path"] = str(
            case.root / "keep.png"
        )
    elif fault == "source-collision":
        case.bundle["execution"]["latentKeepMask"]["path"] = str(case.root / "smart-regional.json")
    elif fault == "bundle-collision":
        case.bundle["execution"]["output"]["pngPath"] = str(case.root / "smart-regional.json")
    elif fault == "existing-output":
        Path(case.private["execution"]["output"]["pngPath"]).write_bytes(b"protected output")
    elif fault == "progress-false":
        case.wire["reportProgress"] = False
    else:
        case.wire["reportProgress"] = True
    case.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _tripwire)
    with pytest.raises((ValueError, DerivativeError)):
        worker.execute_illustrious_smart_patch_regional_request(
            case.wire, config_dir=tmp_path, runtime=cast(Any, None)
        )
    if fault != "existing-output":
        assert not Path(case.private["execution"]["output"]["pngPath"]).exists()
    else:
        assert (
            Path(case.private["execution"]["output"]["pngPath"]).read_bytes() == b"protected output"
        )


def test_descriptor_progress_failure_restores_and_recovers(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "failed", "outpaint")
    case.wire["reportProgress"] = True
    events: list[dict[str, object]] = []

    def fail(event: dict[str, object]) -> None:
        events.append(event)
        raise RuntimeError("declared original native progress failure")

    with pytest.raises(DerivativeError) as raised:
        _run(case, native, monkeypatch, progress_sink=fail)
    assert raised.value.code == "GENERATION_WORKER_FAILED"
    assert len(events) == 1 and events[0]["step"] == 1
    seen = _run(case, native, monkeypatch)
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]


def test_independent_illustrious_capabilities_keep_anima_neighbors() -> None:
    message = inference_main.inference_ready_message()
    assert message["workerVersion"] == "0.14.0"
    capabilities = cast(list[str], message["capabilities"])
    assert all(f"illustrious-smart-patch-regional-{mode}-v1" in capabilities for mode in MODES)
    assert (
        "smart-patch-execution" in capabilities and "smart-patch-seed-confirmation" in capabilities
    )
    assert (
        worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_CAPABILITY
        == "illustrious-smart-patch-regional-inpaint-v1"
    )
    assert (
        worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_OUTPAINT_CAPABILITY
        == "illustrious-smart-patch-regional-outpaint-v1"
    )
    assert (
        worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_TXT2IMG_CAPABILITY
        == "illustrious-smart-patch-regional-txt2img-v1"
    )
    assert (
        worker.ILLUSTRIOUS_SMART_PATCH_REGIONAL_IMG2IMG_CAPABILITY
        == "illustrious-smart-patch-regional-img2img-v1"
    )
