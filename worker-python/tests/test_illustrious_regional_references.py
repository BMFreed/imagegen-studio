"""Original PNG descriptors through Invoke image attention and native publication.

Actual CLIP Vision/processor/projection, dual CLIP, native processors, Euler,
VAE and PNG publisher remain real. The model loader explicitly substitutes tiny
local CPU models; no trained, installed, CUDA or visual-quality claim is made.
The image residual oracle observes the actual output-Linear input after native
processor delegation, independently computing separate image/text softmaxes.
"""

from __future__ import annotations

import copy
import dataclasses
import gc
import importlib
import math
import os
import weakref
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import illustrious_regional_references as references
from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import SRGB_ICC_PROFILE, DerivativeError
from imagegen_worker.illustrious_regional_attention import Shape
from test_illustrious_regional_conditioning import _bindings  # pyright: ignore[reportPrivateUsage]
from test_illustrious_regional_denoising import (
    _observe,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import _reference  # pyright: ignore[reportPrivateUsage]
from test_illustrious_regional_worker import (
    _case as _ordinary_case,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _descriptor,  # pyright: ignore[reportPrivateUsage]
    _seal,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_smart_patch_regional import native as native


def _case(
    directory: Path,
    *,
    count: int = 1,
    zero: bool = False,
    image_only: bool = False,
    alternate: bool = False,
) -> Any:
    directory.mkdir(parents=True)
    case = _ordinary_case(directory)
    bbox = {"x": -13, "y": 19, "width": 64, "height": 64}
    recipe = case.bundle["recipe"]
    recipe["bbox"] = copy.deepcopy(bbox)
    recipe["item"].update({"iteration": 0, "promptPairIndex": 0})
    # Empty negative text must still use projected unconditional image tokens.
    recipe["item"]["prompts"]["negative"] = ""
    recipe["globalPrompts"]["negative"]["text"] = ""
    region = recipe["regions"][0]
    alpha = bytes(
        0 if zero or x >= 32 else (1, 127, 128, 255)[(x + y) % 4]
        for y in range(64)
        for x in range(64)
    )
    region["coverage"].update(
        {
            "bounds": copy.deepcopy(bbox),
            "intersection": None if zero else copy.deepcopy(bbox),
            "kind": "outside" if zero else "covered",
        }
    )
    region["negative"]["prompt"]["text"] = ""
    region["negative"]["source"] = "current-canvas"
    region["authoredPrompts"]["negative"]["text"] = ""
    region["authoredPrompts"]["useGlobalNegativePrompt"] = True
    if image_only:
        region["positive"] = None
        region["authoredPrompts"]["positive"] = None
    case.alpha.write_bytes(alpha)
    region["coverage"]["alpha"] = {"$alpha8": _descriptor(case.alpha)}
    Image.new("RGBA", (64, 64), (13, 29, 47, 0)).save(case.target, icc_profile=SRGB_ICC_PROFILE)
    case.request["job"]["bbox"] = copy.deepcopy(bbox)
    case.request["job"]["target"].update({**_descriptor(case.target), "width": 64, "height": 64})
    case.request["job"]["prompts"]["negative"] = ""
    case.bundle["compositionProfile"] = "invoke-canvas-v1"
    auxiliary = directory / "auxiliary"
    auxiliary.mkdir()
    resources: dict[str, Any] = {}
    for role, name in (
        ("adapter", "adapter.safetensors"),
        ("visionConfig", "config.json"),
        ("visionModel", "model.safetensors"),
    ):
        path = auxiliary / name
        path.write_bytes(
            b"{}" if role == "visionConfig" else b"tiny model loader seam:" + role.encode()
        )
        resources[role] = _descriptor(path)
    authored: list[dict[str, Any]] = []
    images: list[dict[str, Any]] = []
    for index in range(count):
        path = case.root / f"reference-{index}.png"
        image = Image.new("RGBA", (19, 13))
        image.putdata(
            [
                (
                    (13 * x + index * 29) % 256,
                    (23 * y) % 256,
                    (255 if alternate else 17 * x * y) % 256,
                    0 if x % 3 == 0 else 255,
                )
                for y in range(13)
                for x in range(19)
            ]
        )
        image.save(path)
        path.chmod(0o600)
        descriptor = {**_descriptor(path), "width": 19, "height": 13}
        ref = _reference()
        ref["id"] = f"40000000-0000-4000-8000-{index + 1:012d}"
        ref["asset"].update(
            {
                "sha256": descriptor["sha256"],
                "bytes": descriptor["byteSize"],
                "width": 19,
                "height": 13,
            }
        )
        authored.append(ref)
        images.append(
            {
                "regionId": region["regionId"],
                "referenceId": ref["id"],
                "image": {"$referencePng": descriptor},
            }
        )
    region["referenceImages"] = authored
    case.bundle["references"] = {
        "profile": references.REFERENCE_PROFILE,
        "resources": resources,
        "images": images,
    }
    _seal(case)
    return case


def test_capture_binds_original_png_and_preserves_authored_metadata(tmp_path: Path) -> None:
    case = _case(tmp_path / "capture", count=2)
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.references is not None
    assert (
        parsed.recipe["regions"][0]["referenceImages"]
        == case.bundle["recipe"]["regions"][0]["referenceImages"]
    )
    for index, reference in enumerate(parsed.references.images):
        path = case.root / f"reference-{index}.png"
        original = path.read_bytes()
        path.unlink()
        assert reference.png == original and (reference.width, reference.height) == (19, 13)
    assert parsed.references.images[0].alpha == case.alpha.read_bytes()
    assert parsed.references.images[0].alpha is parsed.references.images[1].alpha


@pytest.mark.parametrize(
    "fault",
    [
        "owner",
        "order",
        "sha",
        "size",
        "dimensions",
        "missing",
        "profile",
        "resource",
        "resource-path",
        "alias",
        "legacy",
        "empty",
        "excess",
        "selected-vae",
        "lora",
        "objective",
        "scheduler",
        "noise",
        "cfg",
        "batch",
        "cfg-rescale",
    ],
)
def test_reference_descriptor_faults_refuse_before_model_work(tmp_path: Path, fault: str) -> None:
    case = _case(tmp_path / fault, count=2)
    block = case.bundle["references"]
    first = block["images"][0]
    descriptor = first["image"]["$referencePng"]
    if fault == "owner":
        first["regionId"] = "20000000-0000-4000-8000-000000000099"
    elif fault == "order":
        block["images"].reverse()
    elif fault == "sha":
        descriptor["sha256"] = "a" * 64
    elif fault == "size":
        descriptor["byteSize"] += 1
    elif fault == "dimensions":
        descriptor["width"] += 1
    elif fault == "missing":
        Path(descriptor["path"]).unlink()
    elif fault == "profile":
        block["profile"] = "invoke-illustrious-smart-regional-txt2img-v1"
    elif fault == "resource":
        Path(block["resources"]["adapter"]["path"]).write_bytes(b"changed")
    elif fault == "resource-path":
        block["resources"]["visionConfig"] = copy.deepcopy(block["resources"]["adapter"])
    elif fault == "alias":
        descriptor["path"] = str(case.alpha)
    elif fault == "legacy":
        del case.bundle["references"]
    elif fault == "empty":
        block["images"] = []
    elif fault == "excess":
        block["images"] *= 2
    elif fault == "selected-vae":
        case.request["job"]["vaePrecision"] = "FP32"
    elif fault == "lora":
        case.request["job"]["loras"] = [
            {"path": str(case.checkpoint), "sha256": "a" * 64, "byteSize": 1, "weight": 1}
        ]
    elif fault == "objective":
        case.request["job"]["checkpoint"]["predictionType"] = "v_prediction"
    elif fault == "scheduler":
        case.request["job"]["sampling"]["scheduler"] = "euler_a"
    elif fault == "noise":
        case.request["job"]["sampling"]["noiseProfile"]["timestepSpacing"] = "trailing"
    elif fault == "cfg":
        case.request["job"]["sampling"]["cfgScale"] = 1
    elif fault == "batch":
        case.bundle["recipe"]["item"]["iteration"] = 1
    elif fault == "cfg-rescale":
        case.request["job"]["sampling"]["cfgRescale"] = 0.7
    _seal(case)
    with pytest.raises((ValueError, DerivativeError)):
        worker.parse_regional_request(case.wire)
    assert not (case.root / "result.png").exists()


def test_reference_masks_match_invoke_alpha_positive_nearest_and_ceil_pool() -> None:
    torch = pytest.importorskip("torch")
    shape = Shape(9, 11)
    alpha = bytes((0, 1, 127, 128, 255)[(x + 2 * y) % 5] for y in range(72) for x in range(88))
    actual = references.reference_mask_pyramid(alpha, shape)
    expected = torch.nn.functional.interpolate(
        (torch.tensor(list(alpha)).reshape(1, 1, 72, 88) > 0).float(), size=(9, 11), mode="nearest"
    )
    for plane in actual:
        assert plane == bytes(expected.to(torch.uint8).flatten().tolist())
        expected = torch.nn.functional.max_pool2d(expected, 2, ceil_mode=True)


def _tiny_model_loader(native: Any, records: Any) -> Any:
    def load(_captured: Any, torch: Any) -> tuple[Any, Any, Any, dict[int, tuple[Any, Any]]]:
        with torch.random.fork_rng(devices=[]):
            torch.manual_seed(101126)
            vision = native.transformers.CLIPVisionModelWithProjection(
                native.transformers.CLIPVisionConfig(
                    hidden_size=8,
                    intermediate_size=16,
                    num_hidden_layers=1,
                    num_attention_heads=2,
                    image_size=224,
                    patch_size=32,
                    projection_dim=1024,
                )
            ).eval()
            projection = torch.nn.ModuleDict(
                {"proj": torch.nn.Linear(1024, 8192), "norm": torch.nn.LayerNorm(2048)}
            ).eval()
            processor = native.transformers.CLIPImageProcessor()
            weights: dict[int, tuple[Any, Any]] = {}
            for index, name in enumerate(native.pipeline.unet.attn_processors):
                if ".attn2." in name:
                    attention = native.pipeline.unet.get_submodule(name.removesuffix(".processor"))
                    weights[index] = tuple(
                        torch.randn(attention.to_q.out_features, 2048) * 0.025 for _ in range(2)
                    )
            records.vision = weakref.ref(vision)
            records.projection = weakref.ref(projection)

            def process(**kwargs: Any) -> Any:
                assert kwargs["images"][0].size == (19, 13)
                assert kwargs["images"][0].mode == "RGB"
                records.originals.append(kwargs["images"][0].tobytes())
                return processor(**kwargs)

            return vision, projection, process, weights

    return load


def _run(
    case: Any, native: Any, monkeypatch: pytest.MonkeyPatch, *, failure: str | None = None
) -> Any:
    records = SimpleNamespace(originals=[], prepared=[], before_output=[])
    original_prepare = worker.prepare_regional_references
    original_publish = worker.generate_current_canvas_regional_txt2img
    linear_forward = native.torch.nn.Linear.forward
    first = next(
        module
        for module in native.pipeline.unet.modules()
        if type(module) is native.adapter._load_native()[4] and module.is_cross_attention
    )

    def prepare(*args: Any, **kwargs: Any) -> Any:
        result = original_prepare(*args, **kwargs)
        records.prepared.append(result)
        return result

    def load(*_args: Any, **_kwargs: Any) -> tuple[Any, None]:
        gc.collect()
        if "references" in case.bundle:
            assert records.vision() is None and records.projection() is None
            assert len(records.prepared) == 1
        else:
            assert records.prepared == [] and records.originals == []
        return copy.copy(native.pipeline), None

    def publish(recipe: Any, **kwargs: Any) -> Any:
        assert (
            kwargs.pop("profile")
            == "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
        )
        assert kwargs.pop("denoising_profile") == "ordinary-canvas-euler-txt2img-cuda-fp16-v2"
        kwargs["command"] = dataclasses.replace(kwargs["command"], vae_precision="Auto")
        return original_publish(
            recipe,
            profile="ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cpu-v1",
            denoising_profile="ordinary-canvas-euler-txt2img-cpu-v2",
            **kwargs,
        )

    def linear(current: Any, value: Any) -> Any:
        if current is first.to_out[0]:
            records.before_output.append(value.detach().clone())
            if failure == "output":
                raise RuntimeError("injected native output failure")
        return linear_forward(current, value)

    denoising = importlib.import_module("imagegen_worker.illustrious_regional_denoising")
    register = native.torch.nn.Module.register_forward_pre_hook

    def register_output(current: Any, *args: Any, **kwargs: Any) -> Any:
        if current is first.to_out[0] and failure == "setup":
            raise RuntimeError("injected output hook setup failure")
        return register(current, *args, **kwargs)

    def qualify(pipeline: Any, _runtime: Any) -> tuple[Any, ...]:
        return _bindings(native, pipeline.unet)

    with monkeypatch.context() as patch:
        patch.setattr(references, "_load_reference_models", _tiny_model_loader(native, records))
        patch.setattr(worker, "prepare_regional_references", prepare)
        patch.setattr(worker, "load_illustrious_pipeline", load)
        patch.setattr(worker, "qualify_bindings", qualify)
        patch.setattr(worker, "generate_current_canvas_regional_txt2img", publish)
        patch.setattr(native.torch.nn.Linear, "forward", linear)
        patch.setattr(native.torch.nn.Module, "register_forward_pre_hook", register_output)
        with _preserved(native), _observe(denoising, native, patch) as seen:
            result = inference_main.process_inference_request(
                case.wire, config_dir=case.root, runtime=native.runtime
            )
    records.seen = seen
    records.result = result
    records.attention = first
    records.output = case.root / "result.png"
    return records


def _oracle(native: Any, record: Any, step: int) -> Any:
    torch = native.torch
    attention = record.attention
    hidden, context = record.seen.queries[step], record.seen.contexts[step]
    batch, queries, _ = hidden.shape
    heads = attention.heads
    width = attention.to_q.out_features // heads

    def project(value: Any, linear: Any) -> Any:
        return (
            torch.nn.functional.linear(value, linear.weight, linear.bias)
            .view(batch, -1, heads, width)
            .transpose(1, 2)
        )

    query = project(hidden, attention.to_q)
    key, value = project(context, attention.to_k), project(context, attention.to_v)
    logits = query @ key.transpose(-2, -1) / math.sqrt(width)
    mask = record.seen.masks[step]
    if mask is not None:
        logits = logits.masked_fill(~mask, float("-inf"))
    result = (logits.softmax(-1) @ value).transpose(1, 2).reshape(batch, queries, -1)
    # Literal left half; no planner or compiled mask is used by this oracle.
    image_mask = torch.tensor([x < 4 for _y in range(8) for x in range(8)]).view(1, 64, 1)
    prepared = record.prepared[0]
    first_index = next(
        index
        for index, name in enumerate(native.pipeline.unet.attn_processors)
        if native.pipeline.unet.get_submodule(name.removesuffix(".processor")) is attention
    )
    key_weight, value_weight = prepared.weights[first_index]
    for image in prepared.images:
        tokens = torch.cat((image.unconditional, image.conditional))
        key = (
            torch.nn.functional.linear(tokens, key_weight)
            .view(batch, 4, heads, width)
            .transpose(1, 2)
        )
        value = (
            torch.nn.functional.linear(tokens, value_weight)
            .view(batch, 4, heads, width)
            .transpose(1, 2)
        )
        residual = (query @ key.transpose(-2, -1) / math.sqrt(width)).softmax(-1) @ value
        residual = residual.transpose(1, 2).reshape(batch, queries, -1)
        result = result + residual * image_mask
    return result


def test_descriptor_png_native_image_attention_oracle_and_image_only_consumer(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "native", count=2, image_only=True)
    record = _run(case, native, monkeypatch)
    assert record.result["type"] != "error", record.result
    with Image.open(record.output) as image:
        assert image.mode == "RGB" and image.size == (64, 64)
    assert len(record.seen.steps) == 2 and len(record.seen.decodes) == 1
    assert len(record.before_output) == 2
    for step, actual in enumerate(record.before_output):
        native.torch.testing.assert_close(
            actual, _oracle(native, record, step), rtol=3e-5, atol=3e-6
        )
    assert len(record.originals) == 2
    assert native.torch.count_nonzero(record.prepared[0].images[0].unconditional) > 0
    assert set(record.prepared[0].weights) == {1, 3, 5, 7}


def test_original_image_change_reaches_native_prediction_and_png_with_zero_control(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = _run(_case(tmp_path / "a", image_only=True), native, monkeypatch)
    second = _run(_case(tmp_path / "b", image_only=True, alternate=True), native, monkeypatch)
    assert first.result["type"] != "error" and second.result["type"] != "error"
    assert not native.torch.equal(
        first.seen.steps[0]["model_output"], second.seen.steps[0]["model_output"]
    )
    assert first.output.read_bytes() != second.output.read_bytes()
    zero_a = _run(_case(tmp_path / "zero-a", zero=True, image_only=True), native, monkeypatch)
    zero_b = _run(
        _case(tmp_path / "zero-b", zero=True, image_only=True, alternate=True), native, monkeypatch
    )
    assert zero_a.result["type"] != "error" and zero_b.result["type"] != "error"
    assert native.torch.equal(
        zero_a.seen.steps[0]["model_output"], zero_b.seen.steps[0]["model_output"]
    )
    assert zero_a.output.read_bytes() == zero_b.output.read_bytes()


@pytest.mark.parametrize("failure", ["setup", "output"])
def test_native_failure_restores_scoped_hooks_and_next_original_run(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    failed = _run(_case(tmp_path / "failure"), native, monkeypatch, failure=failure)
    assert failed.result["type"] == "error" and not failed.output.exists()
    good = _run(_case(tmp_path / "after"), native, monkeypatch)
    assert good.result["type"] != "error" and good.output.exists()


def test_incomplete_native_registry_binding_refuses_before_unet(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    original = worker.prepare_regional_references

    def incomplete(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        return dataclasses.replace(
            result, weights={index - 1: value for index, value in result.weights.items()}
        )

    with monkeypatch.context() as patch:
        patch.setattr(worker, "prepare_regional_references", incomplete)
        record = _run(_case(tmp_path / "registry"), native, patch)
    assert record.result["type"] == "error" and not record.output.exists()
    assert record.seen.root_inputs == []


def test_authored_no_reference_control_equals_zero_reference_mask(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A separately authored no-reference input, never a swapped numerical plan.
    case = _case(tmp_path / "ordinary", count=0, zero=True, image_only=True)
    del case.bundle["references"]
    _seal(case)
    ordinary = _run(case, native, monkeypatch)
    zero = _run(_case(tmp_path / "zero", zero=True, image_only=True), native, monkeypatch)
    assert ordinary.result["type"] != "error" and zero.result["type"] != "error"
    assert ordinary.output.read_bytes() == zero.output.read_bytes()
    assert native.torch.equal(
        ordinary.seen.steps[0]["model_output"], zero.seen.steps[0]["model_output"]
    )


def test_changed_auxiliary_after_capture_refuses_before_model_loading(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path / "changed")
    captured = worker.parse_regional_request(case.wire).references
    assert captured is not None
    captured.resources["visionModel"].path.write_bytes(b"changed")

    def tripwire(*_args: Any, **_kwargs: Any) -> Any:
        pytest.fail("changed resource reached native model loading")

    monkeypatch.setattr(references, "_load_reference_models", tripwire)
    with pytest.raises(DerivativeError, match="changed"):
        references.prepare_regional_references(captured, cast(Any, SimpleNamespace(torch=None)))


@pytest.mark.parametrize("boundary", ["model-load", "later-resource-hash"])
def test_restored_reference_resource_version_refuses_before_unet(
    tmp_path: Path, native: Any, monkeypatch: pytest.MonkeyPatch, boundary: str
) -> None:
    case = _case(tmp_path / boundary)
    safetensors = importlib.import_module("safetensors.torch")
    source = Path(case.bundle["references"]["resources"]["adapter"]["path"])
    original = safetensors.save({"tiny_loader_weight": native.torch.zeros(1)})
    changed = safetensors.save({"tiny_loader_weight": native.torch.full((1,), 0.125)})
    assert len(changed) == len(original)
    source.write_bytes(original)
    case.bundle["references"]["resources"]["adapter"].update(_descriptor(source))
    _seal(case)
    prepare = worker.prepare_regional_references
    events: list[str] = []

    def prepare_with_restore(captured: Any, runtime: Any) -> Any:
        loader = references._load_reference_models  # pyright: ignore[reportPrivateUsage]
        verify = references.verify_reference_resource
        initial = source.stat()

        def mutate_and_restore(load: Any = None) -> Any:
            source.write_bytes(changed)
            try:
                if load is not None:
                    # A genuine tiny safetensors load selects a different tensor.
                    loaded = safetensors.load_file(str(source), device="cpu")
                    result = load()
                    first_index = next(iter(result[3]))
                    result[3][first_index][0].fill_(loaded["tiny_loader_weight"].item())
                    events.append("changed tensor loaded")
                    return result
                events.append("earlier role restored during later hash")
                return None
            finally:
                source.write_bytes(original)
                os.utime(source, ns=(initial.st_atime_ns, initial.st_mtime_ns))
                assert source.read_bytes() == original
                assert source.stat().st_mtime_ns == initial.st_mtime_ns
                assert source.stat().st_ctime_ns != initial.st_ctime_ns

        def load(captured: Any, torch: Any) -> Any:
            if boundary == "model-load":
                return mutate_and_restore(lambda: loader(captured, torch))
            return loader(captured, torch)

        def verify_role(resource: Any) -> None:
            verify(resource)
            if (
                boundary == "later-resource-hash"
                and not events
                and resource.path == captured.resources["visionModel"].path
            ):
                mutate_and_restore()

        with monkeypatch.context() as patch:
            patch.setattr(references, "_load_reference_models", load)
            patch.setattr(references, "verify_reference_resource", verify_role)
            return prepare(captured, runtime)

    with monkeypatch.context() as patch:
        patch.setattr(worker, "prepare_regional_references", prepare_with_restore)
        record = _run(case, native, patch)
    assert events
    assert record.result["type"] == "error", (
        f"Restored resource was admitted: native calls={len(record.seen.root_inputs)}, "
        f"PNG published={record.output.exists()}"
    )
    assert record.seen.root_inputs == [] and not record.output.exists()
