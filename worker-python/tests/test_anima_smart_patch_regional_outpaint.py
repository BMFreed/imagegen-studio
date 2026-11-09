"""Explicit Smart OUT profiles reach existing signed native Anima and PNG owners.

The literal fixture uses the actual TypeScript prompt/sampling compilers and real
CPU preparation/coherence/world output. Only LaMa neural output and native model
construction/availability are explicit collaborators. No trained loading, genuine
Main save/capture, or installed-runtime qualification is claimed here. The Main
bundle owner, not the processing-only descriptor, verifies original world alpha.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import anima_smart_patch_regional as smart
from imagegen_worker import anima_smart_patch_regional_worker as worker
from imagegen_worker import (
    inference_main,
    smart_patch_execution,
    smart_patch_model_source,
    smart_patch_output,
)
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.lama_infill import OUTPAINT_INFILL_BYTE_SIZE, OUTPAINT_INFILL_SHA256
from imagegen_worker.smart_patch_conditioning import (
    SmartPatchCoherence,
    SmartPatchConditioningRequest,
    condition_smart_patch,
)
from imagegen_worker.smart_patch_model_source import (
    SmartPatchInfillResource,
    SmartPatchModelSourceRequest,
    prepare_smart_patch_model_source,
)
from imagegen_worker.smart_patch_preparation import (
    PreparationImage,
    PreparationMask,
    SmartPatchPreparationRequest,
    prepare_smart_patch,
)
from test_anima_flow_sampling import inputs as _flow_inputs
from test_anima_regional import (
    _Native,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_regional import native as native
from test_anima_regional import native_factory as native_factory
from test_anima_regional_worker import _runtime  # pyright: ignore[reportPrivateUsage]
from test_anima_smart_patch_regional import (
    _association,  # pyright: ignore[reportPrivateUsage]
    _contexts,  # pyright: ignore[reportPrivateUsage]
    _keep_oracle,  # pyright: ignore[reportPrivateUsage]
    _prediction_oracle,  # pyright: ignore[reportPrivateUsage]
    _Run,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_worker import (
    _case as _inpaint_case,  # pyright: ignore[reportPrivateUsage]
)
from test_anima_smart_patch_regional_worker import (
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _native_execute,  # pyright: ignore[reportPrivateUsage]
    _WireCase,  # pyright: ignore[reportPrivateUsage]
)
from test_smart_patch_execution import _write_ref  # pyright: ignore[reportPrivateUsage]

_INP = "invoke-anima-smart-regional-inpaint-v1"
_OUT = "invoke-anima-smart-regional-outpaint-v1"


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _image_ref(path: Path) -> PreparationImage:
    with Image.open(path) as image:
        return PreparationImage(path, _sha(path.read_bytes()), path.stat().st_size, *image.size)


def _alpha(path: Path) -> bytes:
    with Image.open(path) as image:
        image.load()
        return image.getchannel("A").tobytes()


@dataclass
class _OutCase:
    wire: _WireCase
    world_source: bytes
    world_pixels: bytes
    authored: bytes
    contribution: Path
    lama_inputs: list[bytes]


def _case(
    directory: Path,
    patch: pytest.MonkeyPatch,
    *,
    regions: bool = True,
    scheduler: str = "euler",
    mask: str = "covered",
) -> _OutCase:
    wire = _inpaint_case(directory, regions=regions)
    private, stage = wire.private, wire.root
    bbox = private.recipe["bbox"]
    width, height = bbox["width"], bbox["height"]
    rgba = bytes(
        channel
        for y in range(height)
        for x in range(width)
        for channel in (
            (13 + 7 * x + y) % 256,
            (29 + x + 3 * y) % 256,
            (71 + 2 * x + y) % 256,
            255
            if x < width // 2
            else 127
            if x == width // 2
            else 128
            if x == width // 2 + 1
            else 0,
        )
    )
    world_image = Image.frombytes("RGBA", (width, height), rgba)
    world_path = stage / "world-source.png"
    _write_ref(world_path, world_image, srgb=True)
    owned_mask: PreparationMask | None = None
    authored = bytearray(width * height)
    if mask != "null":
        mask_width, mask_height = 23, 41
        samples = bytes(
            (127, 128, 255)[(x + y) % 3] for y in range(mask_height) for x in range(mask_width)
        )
        image = Image.new("RGBA", (mask_width, mask_height), "white")
        image.putalpha(Image.frombytes("L", image.size, samples))
        path = stage / "authored-mask.png"
        desc = _write_ref(path, image, srgb=False)
        x = bbox["x"] + (8 if mask == "covered" else width + 20)
        bounds = {"x": x, "y": bbox["y"] + 12, "width": mask_width, "height": mask_height}
        owned_mask = PreparationMask(
            path, desc["sha256"], desc["byteSize"], mask_width, mask_height, cast(Any, bounds)
        )
        if mask == "covered":
            for y in range(mask_height):
                authored[(12 + y) * width + 8 : (12 + y) * width + 8 + mask_width] = samples[
                    y * mask_width : (y + 1) * mask_width
                ]
    processing = private.value["execution"]["internalResolution"]
    world_mask, processing_source, processing_mask = (
        stage / name for name in ("world-mask.png", "processing-source.png", "processing-mask.png")
    )
    prepare_smart_patch(
        SmartPatchPreparationRequest(
            bbox,
            processing,
            _image_ref(world_path),
            owned_mask,
            stage,
            world_mask,
            processing_source,
            processing_mask,
        )
    )
    assert bool(_alpha(world_mask) == bytes(authored)), "World crop changed authored alpha."
    (stage / "keep.png").unlink()
    contribution = stage / "final-contribution-mask.png"
    condition_smart_patch(
        SmartPatchConditioningRequest(
            source=_image_ref(world_path),
            effective_mask=_image_ref(world_mask),
            internal_resolution=processing,
            mode="outpaint",
            mask_blur=0,
            coherence=SmartPatchCoherence("Gaussian Blur", 0, 0),
            staging_root=stage,
            world_keep_mask_png_path=stage / "world-keep.png",
            processing_keep_mask_png_path=stage / "processing-keep.png",
            latent_keep_mask_png_path=stage / "keep.png",
            expanded_processing_keep_mask_png_path=stage / "expanded-processing-keep.png",
            expanded_world_keep_mask_png_path=stage / "expanded-world-keep.png",
            final_contribution_mask_png_path=contribution,
        )
    )
    expected_keep = bytes(
        (255 - value) * rgba[4 * i + 3] // 255 for i, value in enumerate(authored)
    )
    assert bool(_alpha(stage / "world-keep.png") == expected_keep), (
        "OUT KEEP lost world alpha multiplication."
    )
    final = _alpha(contribution)
    assert all(
        final[i] == 255 for i, value in enumerate(authored) if value or rgba[4 * i + 3] < 255
    ), "OUT final contribution lost an original edit-core pixel."
    lama_path = stage.parent / "resources/lama.fixture"
    lama_path.write_bytes(b"explicit neural fixture; not the pinned model payload")
    calls: list[bytes] = []

    def load(path: Path, **kwargs: Any) -> Any:
        assert path == lama_path and kwargs == {
            "expected_sha256": OUTPAINT_INFILL_SHA256,
            "expected_byte_size": OUTPAINT_INFILL_BYTE_SIZE,
            "device": "cpu",
        }

        def infill(source: Image.Image) -> Image.Image:
            with Image.open(processing_source) as original:
                original.load()
                assert source.mode == "RGBA" and bool(source.tobytes() == original.tobytes())
            calls.append(source.tobytes())
            result = source.convert("RGB")
            alpha = source.getchannel("A")
            for y in range(source.height):
                for x in range(source.width):
                    if cast(int, alpha.getpixel((x, y))) < 255:
                        result.putpixel(
                            (x, y), ((43 + 3 * x) % 256, (19 + 5 * y) % 256, (x + y + 101) % 256)
                        )
            return result

        return SimpleNamespace(infill_processing_source=infill)

    (stage / "source.png").unlink()
    with patch.context() as scope:
        scope.setattr(smart_patch_model_source, "load_local_lama", load)
        prepare_smart_patch_model_source(
            SmartPatchModelSourceRequest(
                "outpaint",
                _image_ref(processing_source),
                SmartPatchInfillResource(
                    lama_path, OUTPAINT_INFILL_SHA256, OUTPAINT_INFILL_BYTE_SIZE
                ),
                stage,
                stage / "source.png",
            )
        )
    assert len(calls) == 1
    private.value["profile"] = _OUT
    execution = private.value["execution"]
    execution["mode"] = "outpaint"
    execution["modelSource"] = {
        **_descriptor(stage / "source.png"),
        "width": processing["width"],
        "height": processing["height"],
    }
    execution["latentKeepMask"] = {
        **_descriptor(stage / "keep.png"),
        "width": processing["width"] // 8,
        "height": processing["height"] // 8,
    }
    if scheduler != private.recipe["sampling"]["animaMethod"]:
        private.recipe["sampling"]["animaMethod"] = scheduler
        execution["inference"]["sampling"] = _flow_inputs(
            mode="img2img",
            scheduler=scheduler,
            width=processing["width"],
            height=processing["height"],
            seed=123,
            steps=4,
            guidanceScale=3,
            strength=0.75,
        )["plan"]
    private.captured = smart.capture_anima_smart_patch_regional_input(private.value)
    private.inputs = smart_patch_execution.capture_smart_patch_execution(private.command)
    private.source_bytes = (stage / "source.png").read_bytes()
    private.keep_bytes = (stage / "keep.png").read_bytes()
    wire.bundle = copy.deepcopy(private.value)
    wire.bundle["promptInterpretation"] = "invoke-fragments-v1"
    for index, region in enumerate(wire.bundle["recipe"]["regions"]):
        region["coverage"]["alpha"] = {"$alpha8": _descriptor(stage / f"regional-{index}.alpha8")}
    wire.seal()
    return _OutCase(wire, world_path.read_bytes(), rgba, bytes(authored), contribution, calls)


def _world_and_record(case: _OutCase, native: _Native, run: _Run) -> None:
    private = case.wire.private
    path = case.wire.root / "world-result.png"
    smart_patch_output.compose_smart_patch_output(
        smart_patch_output.SmartPatchOutputRequest(
            _image_ref(private.command.output_path),
            _image_ref(case.contribution),
            case.wire.root,
            path,
        )
    )
    bbox = private.recipe["bbox"]
    size = (bbox["width"], bbox["height"])
    with Image.open(path) as actual:
        actual.load()
        assert actual.mode == "RGBA" and actual.size == size
        assert actual.info.get("icc_profile") == SRGB_ICC_PROFILE
        expected = run.result.image.resize(size, resample=Image.Resampling.BICUBIC).convert("RGBA")
        alpha = _alpha(case.contribution)
        expected.putalpha(Image.frombytes("L", size, alpha))
        assert bool(actual.tobytes() == expected.tobytes()), (
            "World output changed RGB/alpha association."
        )
        source = Image.frombytes("RGBA", size, case.world_pixels)
        composite = Image.alpha_composite(source, actual).tobytes()
        assert all(
            composite[4 * i : 4 * i + 4] == case.world_pixels[4 * i : 4 * i + 4]
            for i, value in enumerate(alpha)
            if value == 0
        ), "Zero-contribution pixels changed the original source."
        rgba = actual.tobytes()
    sources = [
        Path(smart.__file__),
        Path(worker.__file__),
        Path(inference_main.__file__),
        Path(__file__),
    ]
    sources.append(Path(smart.__file__).with_name("smart_patch_denoising.py"))
    assert all(p.stat().st_size <= 1024 * 1024 for p in sources)
    record = {
        "schema": "anima-smart-regional-outpaint-native-v1",
        "sourceHashes": {p.name: _sha(p.read_bytes()) for p in sources},
        "executionProfile": private.captured.execution_profile,
        "mode": private.command.mode,
        "pngSha256": _sha(private.command.output_path.read_bytes()),
        "worldPngSha256": _sha(path.read_bytes()),
        "worldRgbaSha256": _sha(rgba),
        "sourceSha256": _sha(private.source_bytes),
        "keepSha256": _sha(private.keep_bytes),
        "worldSourceSha256": _sha(case.world_source),
        "regionalAlphaSha256": [
            _sha(bytes(x["coverage"]["alpha"])) for x in private.recipe["regions"]
        ],
        "nativePasses": len(run.observed.passes),
        "nativeSites": len(run.observed.processors),
        "keepTransitions": len(run.execution.merges),
        "decodes": len(run.observed.decoded),
        "lamaPreparationCalls": len(case.lama_inputs),
    }
    (case.wire.root / "smart-outpaint-native-oracle.json").write_text(
        json.dumps(record, indent=2) + "\n"
    )


def _available(_runtime: object) -> bool:
    return True


def _forbidden(*_args: Any, **_kwargs: Any) -> Any:
    pytest.fail("Invalid OUT input reached model/native work")


@pytest.mark.parametrize("mask", ["covered", "null", "disjoint"])
def test_outpaint_descriptor_keeps_explicit_mode_profile_and_mixed_preparation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, mask: str
) -> None:
    case = _case(tmp_path / mask, monkeypatch, mask=mask)
    captured = worker.parse_anima_smart_patch_regional_request(case.wire.wire).captured
    assert captured.execution_profile == _OUT and captured.command.mode == "outpaint"
    assert (
        captured.command.inference is captured.policy and captured.policy.sampling.mode == "img2img"
    )
    assert set(case.world_pixels[3::4]) == {0, 127, 128, 255}
    assert bool(case.world_source == (case.wire.root / "world-source.png").read_bytes())
    assert case.wire.private.inputs.mode == "outpaint"
    if mask != "covered":
        assert not any(case.authored)
    assert len(case.lama_inputs) == 1


@pytest.mark.parametrize(
    "profile,mode",
    [
        (_INP, "outpaint"),
        (_OUT, "inpaint"),
        (_OUT, "img2img"),
        (_OUT, "txt2img"),
        ("unknown", "outpaint"),
        (None, "outpaint"),
        (True, "outpaint"),
    ],
)
def test_outpaint_profile_mode_mismatch_refuses_before_execution(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, profile: Any, mode: str
) -> None:
    case = _case(tmp_path / "mismatch", monkeypatch)
    case.wire.bundle["profile"] = profile
    case.wire.bundle["execution"]["mode"] = mode
    case.wire.seal()
    monkeypatch.setattr(worker, "execute_smart_patch", _forbidden)
    with pytest.raises(DerivativeError):
        worker.execute_anima_smart_patch_regional_request(
            case.wire.wire, config_dir=tmp_path, runtime=_runtime()
        )


@pytest.mark.parametrize("defect", ["prepared-mode", "captured-profile", "command-owner"])
def test_outpaint_owned_preparation_binding_refuses_before_model_access(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, defect: str
) -> None:
    case = _case(tmp_path / defect, monkeypatch)
    captured, inputs = case.wire.private.captured, case.wire.private.inputs
    if defect == "prepared-mode":
        inputs = replace(inputs, mode="inpaint")
    elif defect == "captured-profile":
        captured = replace(captured, execution_profile=_INP)
    else:
        captured = replace(captured, command=replace(captured.command, mode="inpaint"))
    with pytest.raises(DerivativeError) as caught:
        smart.run_prepared_anima_smart_patch_regional(
            captured,
            cast(Any, object()),
            inputs,
            runtime=cast(Any, object()),
            profile="cpu-float32-v1",
        )
    assert caught.value.code == "INVALID_REQUEST"


@pytest.mark.parametrize("role", ["modelSource", "latentKeepMask"])
def test_changed_outpaint_prepared_pixels_refuse_before_model_load(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, role: str
) -> None:
    case = _case(tmp_path / role, monkeypatch)
    path = Path(case.wire.bundle["execution"][role]["path"])
    path.write_bytes(path.read_bytes() + b"changed")
    monkeypatch.setattr(worker, "supports_anima_compute", _available)
    monkeypatch.setattr(smart_patch_execution.anima_worker, "load_anima_models", _forbidden)
    with pytest.raises(DerivativeError):
        worker.execute_anima_smart_patch_regional_request(
            case.wire.wire, config_dir=tmp_path, runtime=_runtime()
        )


def test_outpaint_capability_is_additive_and_requires_real_compute() -> None:
    new = "anima-smart-patch-regional-outpaint-v1"
    old = "anima-smart-patch-regional-inpaint-v1"
    assert old == worker.ANIMA_SMART_PATCH_REGIONAL_CAPABILITY
    assert new == worker.ANIMA_SMART_PATCH_REGIONAL_OUTPAINT_CAPABILITY
    for runtime in (None, _runtime(bf16=False)):
        assert new not in cast(
            list[str], inference_main.inference_ready_message(runtime)["capabilities"]
        )
    capabilities = cast(
        list[str], inference_main.inference_ready_message(_runtime())["capabilities"]
    )
    assert old in capabilities and new in capabilities and "anima-outpaint" in capabilities


def test_smart_regional_outpaint_native_dispatch_red(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "native-outpaint", monkeypatch)
    contexts = _contexts(case.wire.private, native)
    with _preserved(native):
        run = _native_execute(case.wire, native, monkeypatch)
        _world_and_record(case, native, run)
        # Both real processing/world PNGs and bounded records precede semantic RED.
        _prediction_oracle(case.wire.private, native, run, contexts[1], "negative")
        _association(case.wire.private, native, run, contexts)
        _keep_oracle(case.wire.private, native, run)


def test_smart_regional_inpaint_dispatch_control_green(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _inpaint_case(tmp_path / "legacy-inpaint")
    contexts = _contexts(case.private, native)
    with _preserved(native):
        run = _native_execute(case, native, monkeypatch)
        _prediction_oracle(case.private, native, run, contexts[1], "negative")
        _association(case.private, native, run, contexts)
        _keep_oracle(case.private, native, run)
    assert case.private.captured.execution_profile == _INP


@pytest.mark.parametrize("scheduler", ["euler", "heun"])
def test_zero_regions_match_original_ordinary_outpaint_exactly(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, scheduler: str
) -> None:
    ordinary = _case(tmp_path / "ordinary", monkeypatch, regions=False, scheduler=scheduler)
    regional = _case(tmp_path / "zero-regional", monkeypatch, regions=False, scheduler=scheduler)
    contexts = _contexts(regional.wire.private, native)
    with _preserved(native):
        control = _native_execute(ordinary.wire, native, monkeypatch, ordinary=True)
        actual = _native_execute(regional.wire, native, monkeypatch)
        _world_and_record(ordinary, native, control)
        _world_and_record(regional, native, actual)
        assert bool(control.pixels == actual.pixels), (
            "Zero-region OUT changed ordinary published RGB."
        )
        assert native.torch.equal(control.result.latents, actual.result.latents)
        assert bool(ordinary.wire.private.source_bytes == regional.wire.private.source_bytes)
        assert bool(ordinary.wire.private.keep_bytes == regional.wire.private.keep_bytes)
        assert bool(
            (ordinary.wire.root / "world-result.png").read_bytes()
            == (regional.wire.root / "world-result.png").read_bytes()
        ), "Zero-region OUT changed ordinary world PNG bytes."
        assert all(item["mask"] is None for item in actual.observed.processors)
        assert control.observed.qwen == control.observed.conditioner == 2
        _prediction_oracle(regional.wire.private, native, actual, contexts[0], "positive")
        _association(regional.wire.private, native, actual, contexts)
        _keep_oracle(ordinary.wire.private, native, control)
        _keep_oracle(regional.wire.private, native, actual)


def test_outpaint_progress_failure_restores_and_fresh_descriptor_recovers(
    native: _Native, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "progress-failure", monkeypatch)
    sentinel = RuntimeError("later Smart regional OUT progress sentinel")

    def fail(step: int, _total: int) -> None:
        if step == 2:
            raise sentinel

    monkeypatch.setattr(smart_patch_model_source, "load_local_lama", _forbidden)
    with _preserved(native):
        with pytest.raises(DerivativeError) as caught:
            _native_execute(case.wire, native, monkeypatch, progress_sink=fail)
        error: BaseException | None = caught.value
        while error is not None and error is not sentinel:
            error = error.__cause__
        assert error is sentinel and not case.wire.private.command.output_path.exists()
        run = _native_execute(case.wire, native, monkeypatch)
        _world_and_record(case, native, run)
        _association(case.wire.private, native, run, _contexts(case.wire.private, native))
        _keep_oracle(case.wire.private, native, run)
    assert len(case.lama_inputs) == 1, "Frozen execution must not re-run LaMa."
