"""Private complete Smart input through original regional SDXL mechanics.

Fresh InvokeAI4875d965 compileCanvasGraph grafts source/KEEP before the common
regional collector; sd/denoise_latents.py normalizes and NEAREST-samples regional
alpha directly to the denoising grid. Literal fixtures below are not Main,
trained-model, installed-worker, public Generate or visual-quality qualification.
Native CPU tests retain original CLIP/Compel, attention, scheduler, VAE and RGB
publication owners. Transparent observers only delegate unchanged native calls.
"""

from __future__ import annotations

import copy
import dataclasses
import hashlib
import importlib
from collections.abc import Iterator
from functools import wraps
from pathlib import Path
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_smart_patch_regional as smart
from imagegen_worker import smart_patch_execution
from imagegen_worker.compositor import PreviewRect
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_geometry import (
    IllustriousRegionalGeometryError,
    smart_patch_world_coverage_to_processing,
)
from imagegen_worker.smart_patch_execution import capture_smart_patch_execution
from test_illustrious_regional_conditioning import (
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_denoising import (
    _encode,  # pyright: ignore[reportPrivateUsage]
    _observe,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _models,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _literal_bank,  # pyright: ignore[reportPrivateUsage]
)
from test_smart_patch_execution import _wire  # pyright: ignore[reportPrivateUsage]

WORLD: PreviewRect = {"x": -13, "y": 5, "width": 107, "height": 73}
DOCUMENT = "10000000-0000-4000-8000-000000000001"
REVISION = "10000000-0000-4000-8000-000000000002"
LAYER = "10000000-0000-4000-8000-000000000003"
SMART_MASK = "10000000-0000-4000-8000-000000000004"
REGION = "20000000-0000-4000-8000-000000000001"
MASK = "30000000-0000-4000-8000-000000000001"
MODES = ("txt2img", "img2img", "inpaint", "outpaint")
NOISE = {
    "schemaVersion": 1,
    "baseSchedule": "sdxl-scaled-linear-v1",
    "rescaleBetasZeroSnr": False,
    "timestepSpacing": "leading",
}


def _prompt(text: str) -> dict[str, Any]:
    return {"text": text, "embeddingRefs": []}


def _alpha(*, reverse: bool = False) -> bytes:
    # Off-grid255 decoys expose resizing by max/area or a displaced world origin.
    alpha = bytearray([255] * (WORLD["width"] * WORLD["height"]))
    for y in range(8):
        for x in range(8):
            visible = ((x + 2 * y) % 3 != 0) != reverse
            alpha[(y * WORLD["height"] // 8) * WORLD["width"] + x * WORLD["width"] // 8] = (
                (1, 127, 128, 255)[(x + y) % 4] if visible else 0
            )
    return bytes(alpha)


def _case(
    root: Path,
    mode: str = "inpaint",
    *,
    inherited: bool = False,
    reverse: bool = False,
    regions: bool = True,
) -> dict[str, Any]:
    wire = _wire(root, "illustrious", mode, seed=42)
    wire["inference"]["prompts"] = {"positive": "cat", "negative": "blur"}
    wire["inference"]["sampling"].update(
        {"cfgRescale": 0, "steps": 2, "cfgScale": 5, "noiseProfile": dict(NOISE)}
    )
    if mode != "txt2img":
        wire["inference"]["sampling"]["denoisingStrength"] = 1.0
    wire["inference"]["vae"] = None
    wire["inference"]["vaePrecision"] = "Auto"
    positive = _prompt("dog")
    recipe: dict[str, Any] = {
        "kind": "smart-patch-regional-recipe",
        "family": "illustrious",
        "documentId": DOCUMENT,
        "documentRevision": REVISION,
        "layerId": LAYER,
        "bbox": dict(WORLD),
        "internalResolution": {"width": 64, "height": 64},
        "smartMask": {"maskId": SMART_MASK, "maskRevision": 4},
        "modelSha256": wire["inference"]["checkpoint"]["sha256"],
        "item": {
            "iteration": 0,
            "promptPairIndex": 0,
            "prompts": {"positive": "cat", "negative": "blur"},
            "seed": 42,
        },
        "globalPrompts": {"positive": _prompt("cat"), "negative": _prompt("blur")},
        "sampling": {
            "scheduler": "euler",
            "steps": 2,
            "cfgScale": 5,
            "denoisingStrength": 1.0,
        },
        "regions": [
            {
                "regionId": REGION,
                "maskId": MASK,
                "maskRevision": 3,
                "coverage": {
                    "alpha": _alpha(reverse=reverse),
                    "bounds": dict(WORLD),
                    "intersection": dict(WORLD),
                    "kind": "covered",
                },
                "positive": positive,
                "negative": {
                    "source": "smart-patch" if inherited else "regional",
                    "prompt": _prompt("blur" if inherited else "grain"),
                },
                "authoredPrompts": {
                    "positive": copy.deepcopy(positive),
                    "negative": _prompt("dormant {canvas|noise}" if inherited else "grain"),
                    "useGlobalNegativePrompt": inherited,
                },
                "referenceImages": [],
            }
        ]
        if regions
        else [],
    }
    return {
        "schemaVersion": 1,
        "profile": f"invoke-illustrious-smart-regional-{mode}-v1",
        "recipe": recipe,
        "execution": wire,
    }


@pytest.fixture(scope="module")
def native() -> Iterator[Any]:
    with _models("cpu") as value:
        yield value


def _run(value: dict[str, Any], native: Any, monkeypatch: pytest.MonkeyPatch) -> tuple[Any, Any]:
    captured = cast(Any, smart.capture_illustrious_smart_patch_regional_input(value))
    return _run_captured(captured, native, monkeypatch)


def _run_captured(captured: Any, native: Any, monkeypatch: pytest.MonkeyPatch) -> tuple[Any, Any]:
    decoded = capture_smart_patch_execution(captured.command)
    denoising = importlib.import_module("imagegen_worker.illustrious_regional_denoising")
    with _preserved(native), _observe(denoising, native, monkeypatch) as seen:
        result = smart.run_prepared_illustrious_smart_patch_regional(
            captured,
            native.pipeline,
            decoded,
            runtime=native.runtime,
            profile="cpu-float32-v1",
            bindings=_bindings(native, native.pipeline.unet),
        )
    raw_images: object = result.images
    assert type(raw_images) is list
    images = cast(list[Any], raw_images)
    assert len(images) == 1
    assert type(images[0]) is Image.Image and images[0].mode == "RGB"
    assert images[0].size == (64, 64)
    assert len(seen.decodes) == 1 and seen.decode_reserved == [True]
    assert len(seen.root_inputs) == len(seen.steps) == len(seen.contexts) == 2
    return result, seen


def _permissions(native: Any, reverse: bool = False) -> Any:
    # Literal oracle independent of the geometry function and core planner.
    expected = native.torch.ones(2, 2, 64, 154, dtype=native.torch.bool)
    for y in range(8):
        for x in range(8):
            expected[:, :, y * 8 + x, 77:] = ((x + 2 * y) % 3 != 0) != reverse
    return expected


def test_world_geometry_matches_direct_invoke_nearest_and_positive_alpha() -> None:
    alpha = _alpha()
    processing = smart_patch_world_coverage_to_processing(
        alpha=alpha, bbox=WORLD.copy(), processing_size=(64, 64)
    )
    assert type(processing) is bytes and len(processing) == 64 * 64
    assert all(
        processing[(8 * y) * 64 + 8 * x] == (255 if (x + 2 * y) % 3 != 0 else 0)
        for y in range(8)
        for x in range(8)
    )
    assert alpha == _alpha(), "Geometry must not mutate independently owned WORLD alpha."


@pytest.mark.parametrize(
    ("world_size", "processing_size"),
    (((107, 73), (72, 64)), ((7, 5), (136, 128)), ((211, 133), (64, 72))),
)
def test_geometry_matches_original_torch_nearest_for_independent_rectangular_grids(
    world_size: tuple[int, int], processing_size: tuple[int, int]
) -> None:
    torch = pytest.importorskip("torch")
    width, height = world_size
    processing_width, processing_height = processing_size
    alpha = bytes(
        (0, 1, 127, 128, 255)[(x + 3 * y) % 5] for y in range(height) for x in range(width)
    )
    bounds: PreviewRect = {"x": -17, "y": 11, "width": width, "height": height}
    derived = smart_patch_world_coverage_to_processing(
        alpha=alpha, bbox=bounds, processing_size=processing_size
    )
    # Actual Invoke operation on the ORIGINAL torch tensor: normalize >0, then
    # native nearest to the independent processing latent grid. No resampling
    # implementation is copied into this oracle.
    source = (torch.tensor(list(alpha), dtype=torch.uint8).reshape(1, 1, height, width) > 0).float()
    expected = torch.nn.functional.interpolate(
        source, size=(processing_height // 8, processing_width // 8), mode="nearest"
    ).bool()
    actual = (
        torch.tensor(list(derived), dtype=torch.uint8)
        .reshape(1, 1, processing_height, processing_width)[:, :, ::8, ::8]
        .bool()
    )
    assert torch.equal(actual, expected), "Smart grid must consume direct Invoke NEAREST masks."


@pytest.mark.parametrize("mode", MODES)
def test_capture_retains_exact_mode_and_original_command(tmp_path: Path, mode: str) -> None:
    value = _case(tmp_path / mode, mode)
    captured = cast(Any, smart.capture_illustrious_smart_patch_regional_input(value))
    assert captured.command.mode == mode and captured.command.family == "illustrious"
    assert captured.command.inference.positive_prompt == "cat"
    assert captured.command.inference.negative_prompt == "blur"
    assert captured.command.width == captured.command.height == 64


REFUSALS = (
    (("profile",), "invoke-illustrious-smart-regional-outpaint-v1"),
    (("schemaVersion",), True),
    (("recipe", "family"), "anima"),
    (("recipe", "kind"), "current-canvas-regional-recipe"),
    (("recipe", "internalResolution", "width"), 65),
    (("recipe", "smartMask", "maskId"), MASK),
    (("recipe", "regions", 0, "negative", "source"), "current-canvas"),
    (("recipe", "regions", 0, "negative", "prompt", "text"), "canvas haze"),
    (("recipe", "regions", 0, "positive", "text"), "different local text"),
    (("recipe", "regions", 0, "referenceImages"), [{"image": "unsupported"}]),
    (("recipe", "regions", 0, "coverage", "alpha"), bytes(107 * 73)),
    (("recipe", "regions", 0, "coverage", "bounds", "x"), -12),
    (("recipe", "modelSha256"), "f" * 64),
    (("recipe", "sampling", "steps"), 3),
    (("recipe", "sampling", "cfgScale"), 1),
    (("recipe", "item", "iteration"), 1),
    (("recipe", "item", "promptPairIndex"), 1),
    (("recipe", "item", "seed"), 43),
    (("execution", "inference", "checkpoint", "predictionType"), "v_prediction"),
    (("execution", "inference", "sampling", "cfgRescale"), 0.2),
    (("execution", "inference", "sampling", "noiseProfile", "timestepSpacing"), "linspace"),
    (("execution", "inference", "sampling", "noiseProfile", "rescaleBetasZeroSnr"), True),
    (("execution", "inference", "sampling", "scheduler"), "euler_a"),
    (("execution", "inference", "vaePrecision"), "FP32"),
)


@pytest.mark.parametrize(("path", "replacement"), REFUSALS)
def test_complete_input_refusals_precede_native_or_publication(
    tmp_path: Path, path: tuple[str | int, ...], replacement: object
) -> None:
    value = _case(tmp_path / "refused", inherited=True)
    target: Any = value
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = replacement
    with pytest.raises((ValueError, DerivativeError)):
        smart.capture_illustrious_smart_patch_regional_input(value)
    assert not Path(value["execution"]["output"]["pngPath"]).exists()


@pytest.mark.parametrize("mode", MODES)
def test_all_modes_consume_original_native_signed_permissions(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, mode: str
) -> None:
    global_stream = _encode(native, "cat", "blur")
    local_stream = _encode(native, "dog", "grain")
    expected_context = native.torch.cat(
        tuple(
            _literal_bank(native, (global_stream, local_stream), sign, 154)
            for sign in ("negative", "positive")
        )
    )
    value = _case(tmp_path / mode, mode)
    result, seen = _run(value, native, monkeypatch)
    for context, mask in zip(seen.contexts, seen.masks, strict=True):
        assert native.torch.equal(context, expected_context)
        assert mask is not None, "Regional permissions must reach original native attention."
        assert native.torch.equal(_mask(native, mask, 2, 64, 154), _permissions(native))
    assert seen.builds == [("cat", "blur"), ("dog", "grain")]
    assert seen.scopes[0].plan.positive.segments[0].token_range.binding_id == LAYER
    repeat, _ = _run(value, native, monkeypatch)
    assert result.images[0].tobytes() == repeat.images[0].tobytes()


def test_local_negative_and_world_coverage_mutation_red(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    value = _case(tmp_path / "contrast", "inpaint")
    first, seen_a = _run(value, native, monkeypatch)
    complement = copy.deepcopy(value)
    complement["recipe"]["regions"][0]["coverage"]["alpha"] = _alpha(reverse=True)
    second, seen_b = _run(complement, native, monkeypatch)
    assert native.torch.equal(seen_a.root_inputs[0]["sample"], seen_b.root_inputs[0]["sample"])
    assert not native.torch.equal(seen_a.steps[0]["model_output"], seen_b.steps[0]["model_output"])
    assert first.images[0].tobytes() != second.images[0].tobytes()
    for mask in seen_b.masks:
        assert native.torch.equal(_mask(native, mask, 2, 64, 154), _permissions(native, True))
    local_b = copy.deepcopy(value)
    local_b["recipe"]["regions"][0]["negative"]["prompt"] = _prompt("fog")
    local_b["recipe"]["regions"][0]["authoredPrompts"]["negative"] = _prompt("fog")
    third, seen_c = _run(local_b, native, monkeypatch)
    assert seen_c.builds == [("cat", "blur"), ("dog", "fog")]
    assert not native.torch.equal(seen_a.steps[0]["model_output"], seen_c.steps[0]["model_output"])
    assert first.images[0].tobytes() != third.images[0].tobytes()


def test_inherited_smart_negative_control_green(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    value = _case(tmp_path / "inherited", inherited=True)
    first, seen = _run(value, native, monkeypatch)
    assert seen.builds == [("cat", "blur"), ("dog", "blur")]
    value["recipe"]["regions"][0]["authoredPrompts"]["negative"] = _prompt(
        "another dormant {canvas|selection}"
    )
    second, _ = _run(value, native, monkeypatch)
    assert first.images[0].tobytes() == second.images[0].tobytes()


def test_complete_capture_detaches_later_metadata_alpha_and_command_edits(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    value = _case(tmp_path / "detached")
    captured = smart.capture_illustrious_smart_patch_regional_input(value)
    first, seen_a = _run_captured(captured, native, monkeypatch)
    value["recipe"]["bbox"]["width"] = 64
    value["recipe"]["regions"][0]["coverage"]["alpha"] = bytes(107 * 73)
    value["recipe"]["regions"][0]["negative"]["prompt"] = _prompt("changed")
    value["recipe"]["globalPrompts"]["negative"] = _prompt("canvas haze")
    value["execution"]["inference"]["sampling"]["seed"] = 17
    second, seen_b = _run_captured(captured, native, monkeypatch)
    assert first.images[0].tobytes() == second.images[0].tobytes()
    assert seen_a.builds == seen_b.builds == [("cat", "blur"), ("dog", "grain")]
    assert all(
        native.torch.equal(mask_a, mask_b)
        for mask_a, mask_b in zip(seen_a.masks, seen_b.masks, strict=True)
    )


def test_late_native_decode_failure_restores_scope_and_fresh_rgb(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    value = _case(tmp_path / "late-failure", "outpaint")
    baseline, _ = _run(value, native, monkeypatch)
    captured = smart.capture_illustrious_smart_patch_regional_input(value)
    decoded = capture_smart_patch_execution(captured.command)
    vae_class = cast(Any, type(native.pipeline.vae))
    decode = vae_class.decode
    sentinel = RuntimeError("late original VAE decode completed")
    called: list[bool] = []

    @wraps(decode)
    def late_failure(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = decode(current, *args, **kwargs)
        if current is native.pipeline.vae:
            called.append(True)
            raise sentinel
        return result

    with _preserved(native), monkeypatch.context() as patch:
        patch.setattr(vae_class, "decode", late_failure)
        with pytest.raises(RuntimeError) as raised:
            smart.run_prepared_illustrious_smart_patch_regional(
                captured,
                native.pipeline,
                decoded,
                runtime=native.runtime,
                profile="cpu-float32-v1",
                bindings=_bindings(native, native.pipeline.unet),
            )
        assert raised.value is sentinel
    assert called == [True], "Injected failure must occur after real native decode."
    assert not Path(value["execution"]["output"]["pngPath"]).exists()
    restored, _ = _run(value, native, monkeypatch)
    assert baseline.images[0].tobytes() == restored.images[0].tobytes()


def test_captured_command_identity_cannot_attach_to_equal_other_command(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    value = _case(tmp_path / "identity")
    captured = smart.capture_illustrious_smart_patch_regional_input(value)
    other = dataclasses.replace(captured.command)
    assert other == captured.command and other is not captured.command

    def no_load(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Another Smart command consumed captured regional ownership.")

    monkeypatch.setattr(smart_patch_execution.inference, "load_illustrious_pipeline", no_load)
    with pytest.raises(DerivativeError):
        smart_patch_execution.execute_smart_patch(
            other,
            config_dir=tmp_path,
            runtime=native.runtime,
            _illustrious_regional=captured,
        )


def test_zero_region_control_green(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    value = _case(tmp_path / "global", "txt2img", regions=False)
    first, seen = _run(value, native, monkeypatch)
    assert seen.builds == [("cat", "blur")]
    assert all(mask is None for mask in seen.masks)
    second, _ = _run(value, native, monkeypatch)
    assert first.images[0].tobytes() == second.images[0].tobytes()


def test_complete_exact_file_entry_publishes_original_rgb_with_cpu_placement_seam(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Real whole-input/files/consumer/publisher, with scaled native loading/placement.

    The loader supplies a fresh tiny CPU architecture instead of trained CUDA.
    The placement seam changes only device/dtype/profile/bindings before the
    unchanged real regional call. Resource, source/KEEP readback, no-grad scope,
    native prediction/decode and exclusive RGB publication remain real.
    """
    value = _case(tmp_path / "entry", "outpaint")
    root = Path(value["execution"]["output"]["stagingRoot"])
    resource = Path(value["execution"]["inference"]["checkpoint"]["path"])
    inputs_before = {
        path: path.read_bytes() for path in (root / "source.png", root / "keep.png", resource)
    }
    calls: list[str] = []
    original_run = smart.run_prepared_illustrious_smart_patch_regional
    native_images: list[bytes] = []

    def loader(_policy: Any, **kwargs: Any) -> tuple[Any, None]:
        assert not native.torch.is_grad_enabled()
        assert kwargs["mode"] == "txt2img", "Regional owner creates the actual mode wrapper."
        calls.append("load")
        return copy.deepcopy(native.pipeline), None

    def cpu_run(captured: Any, pipeline: Any, decoded: Any, **kwargs: Any) -> Any:
        assert not native.torch.is_grad_enabled()
        assert kwargs.pop("profile") == "cuda-float16-v1"
        # Original job-owned VAE preparation selected its CUDA Auto dtype.
        # CPU placement is the only substitute before invoking real mechanics.
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

    monkeypatch.setattr(smart_patch_execution.inference, "load_illustrious_pipeline", loader)
    monkeypatch.setattr(smart, "run_prepared_illustrious_smart_patch_regional", cpu_run)
    with native.torch.enable_grad():
        receipt = smart.execute_illustrious_smart_patch_regional(
            value, config_dir=tmp_path, runtime=native.runtime
        )
        assert native.torch.is_grad_enabled(), "Entry must restore caller grad mode."
    assert calls == ["load", "native"]
    assert receipt["actualSeed"] == 42 and receipt["type"] == "smart-patch-executed"
    path = root / "result.png"
    with Image.open(path) as image:
        assert image.mode == "RGB" and image.size == (64, 64)
        assert image.tobytes() == native_images[0]
    metadata = cast(dict[str, Any], receipt["output"])
    assert metadata["sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert metadata["byteSize"] == path.stat().st_size
    assert all(path.read_bytes() == content for path, content in inputs_before.items())
    # Exclusive publication refuses a second invocation before native loading.
    with pytest.raises(DerivativeError):
        smart.execute_illustrious_smart_patch_regional(
            value, config_dir=tmp_path, runtime=native.runtime
        )
    assert calls == ["load", "native"]


@pytest.mark.parametrize("fault", ("association", "resource", "keep"))
def test_complete_exact_file_refusal_precedes_loader(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    value = _case(tmp_path / fault)
    if fault == "association":
        value["profile"] = "invoke-illustrious-smart-regional-img2img-v1"
    else:
        descriptor = (
            value["execution"]["inference"]["checkpoint"]
            if fault == "resource"
            else value["execution"]["latentKeepMask"]
        )
        Path(descriptor["path"]).write_bytes(b"changed bytes")

    def no_load(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("Malformed or changed complete input reached native loading.")

    monkeypatch.setattr(smart_patch_execution.inference, "load_illustrious_pipeline", no_load)
    with pytest.raises((ValueError, DerivativeError)):
        smart.execute_illustrious_smart_patch_regional(
            value, config_dir=tmp_path, runtime=native.runtime
        )
    assert not Path(value["execution"]["output"]["pngPath"]).exists()


@pytest.mark.parametrize("size", [(65, 64), (64, 0), (513, 64)])
def test_geometry_refuses_processing_outside_bounded_grid(size: tuple[int, int]) -> None:
    with pytest.raises(IllustriousRegionalGeometryError):
        smart_patch_world_coverage_to_processing(
            alpha=_alpha(), bbox=WORLD.copy(), processing_size=size
        )
