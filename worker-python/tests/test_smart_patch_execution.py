"""Actual private parser/files/native family execution/exclusive RGB publication.

Small native architectures and explicit CPU placement replace trained CUDA
construction. Family conditioning, exact asset readers, VAE/denoising, protocol
dispatch and publication remain real. This does not qualify trained quality.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
import os
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_worker, inference
from imagegen_worker.derivatives import SRGB_ICC_PROFILE
from imagegen_worker.inference import MLRuntime
from imagegen_worker.inference_config import verify_pinned_config
from imagegen_worker.inference_main import inference_ready_message, process_inference_request
from imagegen_worker.protocol import (
    AnimaInferenceParameters,
    ExecuteSmartPatchCommand,
    IllustriousInferenceParameters,
    parse_request,
    process_request,
    ready_message,
)
from test_anima_flow_sampling import inputs as anima_inputs
from test_anima_worker import fake_runtime, native_runtime
from test_anima_worker import native_bundle as _anima_bundle
from test_sdxl_lora import native as _clip_native
from test_sdxl_outpaint import native as _sdxl_native

native_bundle = _anima_bundle
clip_native = _clip_native
sdxl_native = _sdxl_native
FAMILIES = ("illustrious", "anima")
MODES = ("txt2img", "img2img", "inpaint", "outpaint")


def _digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _ref(path: Path, image: Image.Image) -> dict[str, Any]:
    raw = path.read_bytes()
    return {
        "path": str(path),
        "sha256": _digest(raw),
        "byteSize": len(raw),
        "width": image.width,
        "height": image.height,
    }


def _write_ref(path: Path, image: Image.Image, *, srgb: bool) -> dict[str, Any]:
    image.save(path, format="PNG", **({"icc_profile": SRGB_ICC_PROFILE} if srgb else {}))
    return _ref(path, image)


def _wire(
    root: Path,
    family: str = "illustrious",
    mode: str = "inpaint",
    *,
    keep: int | None = None,
    bundle: Any = None,
) -> dict[str, Any]:
    root.mkdir(mode=0o700)
    stage, resources = root / "stage", root / "resources"
    stage.mkdir(mode=0o700)
    resources.mkdir()
    image = Image.frombytes(
        "RGB", (64, 64), bytes((i * 19 + i // 64) % 256 for i in range(64 * 64 * 3))
    )
    rgb = None if mode == "txt2img" else _write_ref(stage / "source.png", image, srgb=True)
    alpha = Image.new("L", (8, 8), 0)
    if keep is not None:
        alpha.paste(keep, (0, 0, 8, 8))
    elif mode in ("inpaint", "outpaint"):
        alpha = Image.frombytes("L", (8, 8), bytes((255, 254, 192, 128, 64, 1, 0, 0)) * 8)
    numeric = Image.new("RGBA", alpha.size, "white")
    numeric.putalpha(alpha)
    keep_ref = _write_ref(stage / "keep.png", numeric, srgb=False)
    if family == "illustrious":
        checkpoint = resources / "checkpoint.safetensors"
        checkpoint.write_bytes(b"scaled native architecture constructor")
        policy: dict[str, Any] = {
            "checkpoint": {
                "path": str(checkpoint),
                "sha256": _digest(checkpoint.read_bytes()),
                "predictionType": "epsilon",
            },
            "prompts": {"positive": "(portrait)++", "negative": "blur"},
            "sampling": {
                "steps": 3,
                "seed": 0,
                "cfgScale": 5,
                "cfgRescale": 0.2,
                "scheduler": "euler",
            },
        }
        if mode != "txt2img":
            policy["sampling"]["denoisingStrength"] = 0.75
    else:
        data = anima_inputs(
            mode="txt2img" if mode == "txt2img" else "img2img",
            scheduler="euler",
            steps=3,
            strength=None if mode == "txt2img" else 0.75,
        )
        model: dict[str, Any] = {"architecture": "anima-base-1.0"}
        for role, attr in (
            ("checkpoint", "checkpoint"),
            ("qwen3Encoder", "qwen3_encoder"),
            ("vae", "vae"),
        ):
            if bundle is None:
                path = resources / f"{role}.safetensors"
                path.write_bytes(role.encode())
                model[role] = {
                    "path": str(path),
                    "sha256": _digest(path.read_bytes()),
                    "byteSize": path.stat().st_size,
                }
            else:
                item = getattr(bundle, attr)
                model[role] = {
                    "path": str(item.path),
                    "sha256": item.sha256,
                    "byteSize": item.byte_size,
                }
        policy = {
            "model": model,
            "prompts": {"positive": data["positive"], "negative": data["negative"]},
            "sampling": data["plan"],
            "loras": [],
        }
    return {
        "type": "execute-smart-patch",
        "protocolVersion": "1",
        "requestId": "private-patch",
        "schemaVersion": 1,
        "family": family,
        "mode": mode,
        "internalResolution": {"width": 64, "height": 64},
        "modelSource": rgb,
        "latentKeepMask": keep_ref,
        "inference": policy,
        "output": {"stagingRoot": str(stage), "pngPath": str(stage / "result.png")},
    }


def _route(
    value: object, root: Path, runtime: MLRuntime | None = None, **kwargs: Any
) -> dict[str, object]:
    return process_inference_request(
        value, config_dir=root, runtime=runtime or fake_runtime(), **kwargs
    )


def _install_illustrious(
    root: Path,
    sdxl: Any,
    clips: Any,
    monkeypatch: pytest.MonkeyPatch,
    *,
    on_load: Any = None,
    on_decode: Any = None,
) -> MLRuntime:
    """Only native architecture/config and CUDA placement collaborators are scaled."""
    torch, text = clips
    config = root / "tiny-config"
    config.mkdir()
    manifest = config / "model_index.json"
    manifest.write_bytes(b'{"scaledNativeArchitecture":true}')
    pinned = {"model_index.json": _digest(manifest.read_bytes())}

    def config_check(_root: str) -> Path:
        return verify_pinned_config(str(config), pinned_files=pinned)

    monkeypatch.setattr(inference, "verify_pinned_config", config_check)

    def constructor(cls: Any, _path: str, **kwargs: Any) -> Any:
        assert kwargs["local_files_only"] is True and kwargs["torch_dtype"] == torch.float16
        if on_load is not None:
            on_load()
        pipeline = cls(
            vae=copy.deepcopy(sdxl.pipeline.vae),
            unet=copy.deepcopy(sdxl.pipeline.unet),
            text_encoder=copy.deepcopy(text.text_encoder),
            text_encoder_2=copy.deepcopy(text.text_encoder_2),
            tokenizer=copy.deepcopy(text.tokenizer),
            tokenizer_2=copy.deepcopy(text.tokenizer_2),
            scheduler=sdxl.diffusers.DPMSolverMultistepScheduler(),
            add_watermarker=False,
            force_zeros_for_empty_prompt=False,
        )
        native_to = pipeline.to

        def cpu_to(device: str) -> Any:
            assert device == "cuda"
            return native_to("cpu")

        monkeypatch.setattr(pipeline, "to", cpu_to)
        if on_decode is not None:
            def observed_decode(_module: Any, _args: Any, _output: Any) -> None:
                on_decode()

            pipeline.vae.decoder.register_forward_hook(observed_decode)
        return pipeline

    for cls in (
        sdxl.diffusers.StableDiffusionXLPipeline,
        sdxl.diffusers.StableDiffusionXLImg2ImgPipeline,
    ):
        monkeypatch.setattr(cls, "from_single_file", classmethod(constructor))
    return MLRuntime(torch, sdxl.diffusers, importlib.import_module("compel"))


def _runtime(
    request: pytest.FixtureRequest,
    family: str,
    root: Path,
    monkeypatch: pytest.MonkeyPatch,
    **kwargs: Any,
) -> tuple[MLRuntime, Any]:
    if family == "illustrious":
        return _install_illustrious(
            root,
            request.getfixturevalue("sdxl_native"),
            request.getfixturevalue("clip_native"),
            monkeypatch,
            **kwargs,
        ), None
    bundle = request.getfixturevalue("native_bundle")
    return native_runtime(bundle, monkeypatch), bundle[3]


def _pixels(wire: dict[str, Any], result: dict[str, object]) -> bytes:
    assert set(result) == {"type", "protocolVersion", "requestId", "output"}, result
    assert result["type"] == "smart-patch-executed" and result["requestId"] == wire["requestId"]
    output = Path(wire["output"]["pngPath"])
    raw = output.read_bytes()
    info = cast(dict[str, object], result["output"])
    assert info["sha256"] == _digest(raw) and info["byteSize"] == len(raw)
    assert info["width"] == info["height"] == 64 and info["colorSpace"] == "srgb"
    with Image.open(output) as decoded:
        decoded.load()
        assert decoded.mode == "RGB" and decoded.size == (64, 64)
        assert decoded.info["icc_profile"] == SRGB_ICC_PROFILE
        pixels = decoded.tobytes()
    assert not list(output.parent.glob("*.webp"))
    return pixels


@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("mode", MODES)
def test_actual_entrypoint_native_modes_replay_and_publish_only_rgb(
    tmp_path: Path,
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
    family: str,
    mode: str,
) -> None:
    runtime, bundle = _runtime(request, family, tmp_path, monkeypatch)
    wire = _wire(tmp_path / "one", family, mode, bundle=bundle)
    inputs = {path: path.read_bytes() for path in Path(wire["output"]["stagingRoot"]).glob("*.png")}
    events: list[dict[str, object]] = []
    result = _route(wire, tmp_path, runtime, on_progress=events.append)
    first = _pixels(wire, result)
    replay = copy.deepcopy(wire)
    replay["output"]["pngPath"] = str(Path(wire["output"]["stagingRoot"]) / "replay.png")
    assert first == _pixels(replay, _route(replay, tmp_path, runtime))
    assert events and events[-1]["step"] == events[-1]["totalSteps"]
    assert all(path.read_bytes() == raw for path, raw in inputs.items())


@pytest.mark.parametrize("family", FAMILIES)
def test_all255_keep_runs_and_matches_native_strength_zero_neighbor(
    tmp_path: Path,
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
    family: str,
) -> None:
    runtime, bundle = _runtime(request, family, tmp_path, monkeypatch)
    wire = _wire(tmp_path / "protected", family, "inpaint", keep=255, bundle=bundle)
    events: list[dict[str, object]] = []
    protected = _pixels(wire, _route(wire, tmp_path, runtime, on_progress=events.append))
    assert events and events[-1]["step"] == events[-1]["totalSteps"]
    zero = _wire(tmp_path / "zero", family, "img2img", bundle=bundle)
    if family == "illustrious":
        zero["inference"]["sampling"]["denoisingStrength"] = 0
    else:
        zero["inference"]["sampling"] = anima_inputs(
            mode="img2img", scheduler="euler", steps=3, strength=0
        )["plan"]
    assert protected == _pixels(zero, _route(zero, tmp_path, runtime))
    ordinary = _wire(tmp_path / "ordinary", family, "img2img", bundle=bundle)
    assert protected != _pixels(ordinary, _route(ordinary, tmp_path, runtime))


@pytest.mark.parametrize("family", FAMILIES)
def test_private_marker_cpu_refusal_and_parser_owned_metadata(tmp_path: Path, family: str) -> None:
    wire = _wire(tmp_path / "wire", family)
    captured = parse_request(wire)
    assert isinstance(captured, ExecuteSmartPatchCommand)
    assert isinstance(
        captured.inference,
        IllustriousInferenceParameters if family == "illustrious" else AnimaInferenceParameters,
    )
    original = captured.inference
    unmutated = copy.deepcopy(wire)
    wire["inference"]["sampling"]["seed"] = 71
    assert captured.inference == original
    assert (
        captured.inference.seed if isinstance(captured.inference, IllustriousInferenceParameters)
        else captured.inference.sampling.seed
    ) == 0
    assert process_request(unmutated)["code"] == "INFERENCE_UNAVAILABLE"
    assert "smart-patch-execution" in cast(
        list[str], inference_ready_message(fake_runtime())["capabilities"]
    )
    assert "smart-patch-execution" not in cast(list[str], ready_message()["capabilities"])


@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize(
    "fault",
    (
        "hash",
        "size",
        "rgba",
        "icc",
        "keep-rgb",
        "keep-size",
        "ordinary-keep",
        "alias",
        "existing",
        "unsafe",
        "resource-hash",
        "resource-staging",
    ),
)
def test_actual_files_refuse_before_native_loading_and_preserve_inputs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    family: str,
    fault: str,
) -> None:
    wire = _wire(tmp_path / "fault", family, "img2img" if fault == "ordinary-keep" else "inpaint")
    source = Path(wire["modelSource"]["path"])
    keep = Path(wire["latentKeepMask"]["path"])
    output = Path(wire["output"]["pngPath"])
    if fault == "hash":
        wire["modelSource"]["sha256"] = "0" * 64
    elif fault == "size":
        wire["modelSource"]["byteSize"] += 1
    elif fault in ("rgba", "icc"):
        image = Image.new("RGBA" if fault == "rgba" else "RGB", (64, 64), "red")
        wire["modelSource"] = _write_ref(source, image, srgb=fault == "rgba")
    elif fault in ("keep-rgb", "ordinary-keep"):
        numeric = Image.new("RGBA", (8, 8), (0 if fault == "keep-rgb" else 255, 255, 255, 255))
        wire["latentKeepMask"] = _write_ref(keep, numeric, srgb=False)
    elif fault == "keep-size":
        wire["latentKeepMask"]["width"] = 7
    elif fault == "alias":
        wire["output"]["pngPath"] = str(source)
    elif fault == "existing":
        output.write_bytes(b"unrelated late output")
    elif fault == "unsafe":
        output.parent.chmod(0o777)
    elif fault == "resource-hash":
        entry = (
            wire["inference"]["checkpoint"]
            if family == "illustrious"
            else wire["inference"]["model"]["checkpoint"]
        )
        entry["sha256"] = "0" * 64
    else:
        entry = (
            wire["inference"]["checkpoint"]
            if family == "illustrious"
            else wire["inference"]["model"]["checkpoint"]
        )
        moved = output.parent / "model.safetensors"
        moved.write_bytes(Path(entry["path"]).read_bytes())
        entry["path"] = str(moved)
    before = {path: path.read_bytes() for path in output.parent.iterdir() if path.is_file()}
    calls: list[str] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        calls.append("loaded")
        raise AssertionError("Malformed prepared input reached native loading")

    monkeypatch.setattr(inference, "load_illustrious_pipeline", forbidden)
    monkeypatch.setattr(anima_worker, "load_anima_models", forbidden)
    result = _route(wire, tmp_path)
    assert result["type"] == "error" and result["code"] != "GENERATION_WORKER_FAILED", result
    assert calls == []
    assert all(path.read_bytes() == raw for path, raw in before.items())
    assert not output.exists() or fault == "existing"


def test_late_collision_and_post_link_failure_preserve_only_owned_output(
    tmp_path: Path,
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    wire = _wire(tmp_path / "late")
    destination = Path(wire["output"]["pngPath"])
    runtime, _ = _runtime(
        request,
        "illustrious",
        tmp_path,
        monkeypatch,
        on_decode=lambda: destination.write_bytes(b"late existing user output"),
    )
    result = _route(wire, tmp_path, runtime)
    assert result["code"] == "OUTPUT_UNAVAILABLE"
    assert destination.read_bytes() == b"late existing user output"
    assert not list(destination.parent.glob(".*.tmp"))

    # A genuine post-link fsync refusal rolls back only our publication.
    second = copy.deepcopy(wire)
    second["output"]["pngPath"] = str(destination.parent / "rollback.png")
    original_fsync = os.fsync

    def fail_directory(descriptor: int) -> None:
        if os.path.isdir(f"/proc/self/fd/{descriptor}"):
            raise OSError("controlled directory fsync refusal")
        original_fsync(descriptor)

    monkeypatch.setattr(os, "fsync", fail_directory)
    failed = _route(second, tmp_path, runtime)
    assert failed["code"] == "GENERATION_WORKER_FAILED"
    assert not Path(second["output"]["pngPath"]).exists()
    assert destination.read_bytes() == b"late existing user output"
    assert not list(destination.parent.glob(".*.tmp"))


def test_checkpoint_changed_during_native_load_refuses_before_denoising(
    tmp_path: Path,
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    wire = _wire(tmp_path / "changed")
    checkpoint = Path(wire["inference"]["checkpoint"]["path"])
    runtime, _ = _runtime(
        request,
        "illustrious",
        tmp_path,
        monkeypatch,
        on_load=lambda: checkpoint.write_bytes(b"changed during constructor"),
    )
    result = _route(wire, tmp_path, runtime)
    assert result["code"] == "GENERATION_INPUT_CHANGED"
    assert not Path(wire["output"]["pngPath"]).exists()
