"""Authored private native-to-PNG contracts; ROOT owns execution and mutation.

Frozen API: generate_current_canvas_regional_txt2img(recipe, *, command,
pipeline, runtime, profile, denoising_profile, global_negative_coverage,
global_positive_coverage, negative_pooled_source_id, positive_pooled_source_id,
bindings, layout). All keywords are required; there is no parameters channel.
_rgb_image(result, *, torch, width, height, tensor_profile='cpu-float32-v1')
accepts the exact original native SDXL output, already denormalized.

Fresh invocations of the existing native model builder supply both lanes.
Canonical complete Python recipes are fixture setup, not Main-producer proof.
Every successful publication consumes original CLIP/attention/Euler/VAE results.
Class spies and boundary spies call originals; only named failures are injected.
Random models and authored exact TI vectors prove mechanics, not trained quality.

ROOT's isolated channel swap must fail both the distinct literal RGB helper
case and test_actual_native_published_rgb_matches_independent_oracle. The equal
RGB helper control remains green. Tests do not install the mutation themselves.
Main handoff, native runs, causal mutation, artifacts and public qualification
remain ROOT-owned. No imports/collection/native runs are part of authorship.
"""

from __future__ import annotations

import copy
import dataclasses
import hashlib
import importlib
import inspect
import io
import os
import stat
import sys
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from PIL import Image

from imagegen_worker import candidate_thumbnail, generation_artifacts
from imagegen_worker.derivatives import (
    PINNED_SRGB_ICC_SHA256,
    SRGB_ICC_PROFILE,
    DerivativeError,
)
from imagegen_worker.protocol import (
    GenerateIllustriousImg2ImgCommand,
    GenerateIllustriousOutpaintCommand,
    GenerateIllustriousTxt2ImgCommand,
    IllustriousInferenceParameters,
)
from test_illustrious_regional_denoising import (
    _observe as _native_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    CPU_ENCODING,
    CPU_EXECUTION,
    CUDA_ENCODING,
    CUDA_EXECUTION,
    _arguments,  # pyright: ignore[reportPrivateUsage]
    _bind,  # pyright: ignore[reportPrivateUsage]
    _models,  # pyright: ignore[reportPrivateUsage]
    _no_native,  # pyright: ignore[reportPrivateUsage]
    _normal_result,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _rows,  # pyright: ignore[reportPrivateUsage]
    _same_recipe,  # pyright: ignore[reportPrivateUsage]
    _save,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _observe as _ti_observe,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    LAYOUTS,
    REGIONS,
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)

PLAIN_CPU = "ordinary-canvas-static-dualclip-cpu-v1"
PLAIN_CUDA = "ordinary-canvas-static-dualclip-cuda-fp16-v1"
KEYWORDS = (
    "command",
    "pipeline",
    "runtime",
    "profile",
    "denoising_profile",
    "global_negative_coverage",
    "global_positive_coverage",
    "negative_pooled_source_id",
    "positive_pooled_source_id",
    "bindings",
    "layout",
)


@pytest.fixture(scope="module")
def cpu() -> Iterator[Any]:
    with _models("cpu") as native:
        yield native


@pytest.fixture(scope="module")
def cuda() -> Iterator[Any]:
    with _models("cuda") as native:
        yield native


@pytest.fixture(scope="module", params=("cpu", "cuda"))
def lane(request: pytest.FixtureRequest) -> Any:
    return request.getfixturevalue(request.param)


@pytest.fixture
def output() -> Any:
    return importlib.import_module("imagegen_worker.illustrious_regional_output")


def _case(
    tmp_path: Path,
    native: Any,
    *,
    recipe: Any = None,
    exact_ti: bool = False,
    layout: str = LAYOUTS[0],
    steps: int = 2,
    name: str = "staging",
) -> Any:
    recipe = _recipe(_region()) if recipe is None else recipe
    root = tmp_path / name
    root.mkdir(mode=0o700)
    bbox = recipe["bbox"]
    target = root / "target.png"
    # Hidden RGB is intentionally nonzero: TXT is classified by alpha alone.
    Image.new("RGBA", (bbox["width"], bbox["height"]), (17, 59, 133, 0)).save(
        target, format="PNG", icc_profile=SRGB_ICC_PROFILE
    )
    source = target.read_bytes()
    args = _arguments(native, recipe, layout=layout, steps=steps)
    parameters = args.pop("parameters")
    command = GenerateIllustriousTxt2ImgCommand(
        **{
            field.name: getattr(parameters, field.name)
            for field in dataclasses.fields(IllustriousInferenceParameters)
        },
        request_id="output-owner_A-1",
        target_path=target,
        target_sha256=hashlib.sha256(source).hexdigest(),
        target_byte_size=len(source),
        target_icc_sha256=PINNED_SRGB_ICC_SHA256,
        width=bbox["width"],
        height=bbox["height"],
        bbox=copy.deepcopy(bbox),
        staging_root=root,
        output_path=root / "candidate.png",
    )
    args["profile"] = (
        (CUDA_ENCODING if native.device == "cuda" else CPU_ENCODING)
        if exact_ti
        else (PLAIN_CUDA if native.device == "cuda" else PLAIN_CPU)
    )
    args["denoising_profile"] = CUDA_EXECUTION if native.device == "cuda" else CPU_EXECUTION
    return SimpleNamespace(recipe=recipe, command=command, args=args, root=root, target=target)


def _generate(output: Any, native: Any, case: Any) -> Any:
    recipe_before = copy.deepcopy(case.recipe)
    command_before = copy.deepcopy(case.command)
    target_before = case.target.read_bytes()
    try:
        with _preserved(native):
            return output.generate_current_canvas_regional_txt2img(
                case.recipe, command=case.command, **case.args
            )
    finally:
        assert case.recipe == recipe_before
        assert case.command == command_before
        assert case.target.read_bytes() == target_before


@contextmanager
def _aliases(patch: pytest.MonkeyPatch, original: Any, replacement: Any) -> Generator[None]:
    """Observe bound imports as well as the original owner's module attribute."""
    found = False
    for name, module in tuple(cast(dict[str, Any], sys.modules).items()):
        if name.startswith("imagegen_worker.") and module is not None:
            for key, value in tuple(cast(dict[str, Any], vars(module)).items()):
                if value is original:
                    patch.setattr(module, key, replacement)
                    found = True
    assert found
    yield


@contextmanager
def _observe(
    output: Any, native: Any, monkeypatch: pytest.MonkeyPatch, *, exact_ti: bool = False
) -> Generator[Any]:
    observer = (
        _ti_observe(native, monkeypatch)
        if exact_ti
        else _native_observe(native.denoising, native, monkeypatch)
    )
    with observer as seen, monkeypatch.context() as patch:
        seen.entries, seen.receipts, seen.publications, seen.native_results = [], [], [], []
        seen.target_checks, seen.postprocess_calls = [], []
        seen.pt_inputs, seen.numpy_inputs, seen.pil_results = [], [], []
        entry = native.denoising.run_current_canvas_regional_denoising
        publisher = generation_artifacts.publish_generation_image
        validator = generation_artifacts.validate_generation_target
        processor = importlib.import_module("diffusers.image_processor").VaeImageProcessor
        pt_to_numpy, numpy_to_pil = processor.pt_to_numpy, processor.numpy_to_pil
        postprocess = processor.postprocess

        @wraps(entry)
        def consume(recipe: Any, **kwargs: Any) -> Any:
            assert len(seen.target_checks) == 1  # actual target verified before encoding
            assert type(kwargs["parameters"]) is IllustriousInferenceParameters
            assert "command" not in kwargs
            seen.entries.append((recipe, kwargs))
            result = entry(recipe, **kwargs)
            # Snapshot the original returned PT before the output owner can
            # convert or mutate it; observing conversion input alone is circular.
            seen.native_results.append((result, result.images.detach().clone()))
            return result

        @wraps(validator)
        def validate(**kwargs: Any) -> Any:
            assert kwargs["img2img"] is False
            result = validator(**kwargs)
            assert result is None
            seen.target_checks.append(kwargs)
            return result

        @wraps(publisher)
        def publish(image: Any, **kwargs: Any) -> Any:
            assert image.mode == "RGB" and kwargs["output_mode"] == "RGB"
            seen.publications.append((image, kwargs))
            result = publisher(image, **kwargs)
            seen.receipts.append(result)
            return result

        @wraps(postprocess)
        def post(current: Any, *args: Any, **kwargs: Any) -> Any:
            assert current is not native.pipeline.image_processor
            bound = inspect.signature(postprocess).bind(current, *args, **kwargs)
            seen.postprocess_calls.append(bound.arguments.get("output_type", "pil"))
            return postprocess(current, *args, **kwargs)

        @wraps(pt_to_numpy)
        def to_numpy(images: Any) -> Any:
            assert len(seen.pipeline_results) == 1
            assert images is seen.pipeline_results[0].images
            seen.pt_inputs.append((images, images.detach().clone()))
            return pt_to_numpy(images)

        @wraps(numpy_to_pil)
        def to_pil(images: Any) -> Any:
            seen.numpy_inputs.append(images.copy())
            result = numpy_to_pil(images)
            seen.pil_results.append(result)
            return result

        patch.setattr(processor, "postprocess", post)
        patch.setattr(processor, "pt_to_numpy", staticmethod(to_numpy))
        patch.setattr(processor, "numpy_to_pil", staticmethod(to_pil))
        with (
            _aliases(patch, entry, consume),
            _aliases(patch, validator, validate),
            _aliases(patch, publisher, publish),
        ):
            yield seen


def _quantized_bytes(native: Any, tensor: Any) -> bytes:
    """Independent array arithmetic: no production processor/PIL conversion."""
    numpy = pytest.importorskip("numpy")
    planar = tensor[0].detach().to(device="cpu", dtype=native.torch.float32).numpy()
    rgb8 = numpy.rint(planar * numpy.float32(255)).astype(numpy.uint8)
    return numpy.moveaxis(rgb8, 0, -1).tobytes()


def _assert_png(native: Any, case: Any, seen: Any, done: Any, *, thumbnail: bool = True) -> bytes:
    assert len(seen.entries) == len(seen.receipts) == len(seen.publications) == 1
    assert done is seen.receipts[0]  # preserve the publisher's original receipt
    params = seen.entries[0][1]["parameters"]
    for field in dataclasses.fields(IllustriousInferenceParameters):
        assert getattr(params, field.name) == getattr(case.command, field.name)
    assert seen.entries[0][0] == case.recipe
    for key, value in case.args.items():
        assert seen.entries[0][1][key] is value or seen.entries[0][1][key] == value
    assert len(seen.pt_inputs) == len(seen.numpy_inputs) == len(seen.pil_results) == 1
    assert seen.postprocess_calls == ["pt"]  # native denorm once; static conversion afterwards
    assert len(seen.native_results) == 1
    original, native_prior = seen.native_results[0]
    assert original is seen.pipeline_results[0]
    image, prior = seen.pt_inputs[0]
    assert image is original.images
    assert native.torch.equal(image, prior) and native.torch.equal(image, native_prior)
    expected = _quantized_bytes(native, native_prior)
    with Image.open(case.command.output_path) as reopened:
        reopened.load()
        assert reopened.format == "PNG" and reopened.mode == "RGB"
        assert reopened.size == (case.command.width, case.command.height)
        assert reopened.info["icc_profile"] == SRGB_ICC_PROFILE
        assert reopened.tobytes() == expected, "published RGB differs from original native PT"
    receipt: dict[str, object] = {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": case.command.request_id,
        "outputPath": str(case.command.output_path),
        "seed": case.command.seed,
    }
    if thumbnail:
        path = Path(str(case.command.output_path) + ".thumb.webp")
        content = path.read_bytes()
        receipt["thumbnail"] = {
            "outputPath": str(path),
            "sha256": hashlib.sha256(content).hexdigest(),
            "byteSize": len(content),
            "width": case.command.width,
            "height": case.command.height,
        }
        with Image.open(path) as cached:
            cached.load()
            assert cached.format == "WEBP" and cached.mode == "RGB"
            assert cached.size == (case.command.width, case.command.height)
            assert cached.info["icc_profile"] == SRGB_ICC_PROFILE
        # These tiny images need no resize. Independently encode the oracle RGB
        # with the publisher's existing pinned cache settings, not its helper.
        encoded = io.BytesIO()
        Image.frombytes("RGB", (case.command.width, case.command.height), expected).save(
            encoded, format="WEBP", quality=80, exact=True, icc_profile=SRGB_ICC_PROFILE
        )
        assert content == encoded.getvalue(), "thumbnail belongs to different RGB pixels"
    else:
        assert not Path(str(case.command.output_path) + ".thumb.webp").exists()
    assert done == receipt
    assert not list(case.root.glob(".*.tmp"))
    return expected


# Targeted coverage of both layouts and both step counts in each encoding
# family/device, without repeating the previous recipe/denoising/TI matrices.
ACCEPTANCE = (
    (False, LAYOUTS[0], 1),
    (False, LAYOUTS[1], 2),
    (True, LAYOUTS[0], 2),
    (True, LAYOUTS[1], 1),
)


@pytest.mark.parametrize("exact_ti,layout,steps", ACCEPTANCE)
def test_actual_native_published_rgb_matches_independent_oracle(
    tmp_path: Path,
    lane: Any,
    output: Any,
    monkeypatch: pytest.MonkeyPatch,
    exact_ti: bool,
    layout: str,
    steps: int,
) -> None:
    signature = inspect.signature(output.generate_current_canvas_regional_txt2img)
    assert tuple(signature.parameters) == ("recipe", *KEYWORDS, "on_progress", "references")
    assert signature.parameters["on_progress"].kind is inspect.Parameter.KEYWORD_ONLY
    assert signature.parameters["on_progress"].default is None
    assert signature.parameters["references"].kind is inspect.Parameter.KEYWORD_ONLY
    assert signature.parameters["references"].default is None
    assert signature.parameters["recipe"].kind is inspect.Parameter.POSITIONAL_OR_KEYWORD
    assert all(
        signature.parameters[key].kind is inspect.Parameter.KEYWORD_ONLY
        and signature.parameters[key].default is inspect.Parameter.empty
        for key in KEYWORDS
    )
    a = c = cast(Any, None)
    if exact_ti:
        a, c = _save(tmp_path, lane, 1), _save(tmp_path, lane, 3)
        recipe = _same_recipe(a, c)
    else:
        recipe = _recipe(_region())
    case = _case(tmp_path, lane, recipe=recipe, exact_ti=exact_ti, layout=layout, steps=steps)
    # Successful maximum request length is independent of malformed refusal.
    case.command = dataclasses.replace(case.command, request_id="A" * 128)
    case.args["negative_pooled_source_id"] = REGIONS[0]
    case.args["positive_pooled_source_id"] = REGIONS[0]
    with _observe(output, lane, monkeypatch, exact_ti=exact_ti) as seen:
        done = _generate(output, lane, case)
    _normal_result(lane, seen, seen.pipeline_results[0], steps)
    assert len(seen.contexts) == steps and len(seen.decodes) == 1
    if exact_ti:
        _rows(lane, seen, 0, "positive", a.tensors)
        _rows(lane, seen, 1, "positive", c.tensors)
    pixels = _assert_png(lane, case, seen, done)
    # Keep at least one real native oracle sensitive to ROOT's RGB channel swap.
    assert pixels != b"".join(pixels[i : i + 3][::-1] for i in range(0, len(pixels), 3))


def test_regional_exact_resource_change_causes_real_published_rgb_change(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, c = _save(tmp_path, lane, 1), _save(tmp_path, lane, 3)
    original = _same_recipe(a, c)
    neighbor = copy.deepcopy(original)
    _bind(neighbor, 0, "positive", a)  # change only regional refs+matching descriptor
    assert original["globalPrompts"] == neighbor["globalPrompts"]
    assert original["globalEmbeddings"] == neighbor["globalEmbeddings"]
    assert original["item"] == neighbor["item"]
    assert original["bbox"] == neighbor["bbox"]
    assert original["regions"][0]["positive"]["text"] == "SAME"
    assert neighbor["regions"][0]["positive"]["text"] == "SAME"
    images, pixels, observations = (
        cast(list[Any], []),
        cast(list[bytes], []),
        cast(list[Any], []),
    )
    for index, recipe in enumerate((original, neighbor)):
        case = _case(tmp_path, lane, recipe=recipe, exact_ti=True, name=f"causal-{index}")
        assert case.args["positive_pooled_source_id"] == "current-canvas"
        assert case.args["negative_pooled_source_id"] == "current-canvas"
        with _observe(output, lane, monkeypatch, exact_ti=True) as seen:
            done = _generate(output, lane, case)
        _normal_result(lane, seen, seen.pipeline_results[0], 2)
        _rows(lane, seen, 0, "positive", a.tensors)
        _rows(lane, seen, 1, "positive", c.tensors if index == 0 else a.tensors)
        images.append(seen.pipeline_results[0].images.detach().clone())
        pixels.append(_assert_png(lane, case, seen, done))
        observations.append(seen)
    first, second = observations
    torch = lane.torch
    assert torch.equal(first.contexts[0][0], second.contexts[0][0])  # all negative streams
    assert torch.equal(first.contexts[0][1, :77], second.contexts[0][1, :77])
    assert not torch.equal(first.contexts[0][1, 77:154], second.contexts[0][1, 77:154])
    for lhs, rhs in zip(first.root_inputs, second.root_inputs, strict=True):
        assert torch.equal(
            lhs["added_cond_kwargs"]["text_embeds"], rhs["added_cond_kwargs"]["text_embeds"]
        )
        assert torch.equal(
            lhs["added_cond_kwargs"]["time_ids"], rhs["added_cond_kwargs"]["time_ids"]
        )
    assert all(torch.equal(lhs, rhs) for lhs, rhs in zip(first.masks, second.masks, strict=True))
    assert torch.equal(first.queries[0], second.queries[0])
    assert not torch.equal(images[0], images[1])
    assert pixels[0] != pixels[1], "regional exact resource must change actual published RGB8"


@contextmanager
def _before_filework(native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[list[str]]:
    """Tripwire opens/stats and model work after fixtures have been prepared."""
    hits: list[str] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        hits.append("filework")
        raise AssertionError("metadata preflight performed premature filework")

    with _no_native(native, monkeypatch) as native_hits, monkeypatch.context() as patch:
        patch.setattr(os, "open", forbidden)
        patch.setattr(Path, "open", forbidden)
        patch.setattr(Path, "stat", forbidden)
        patch.setattr(Path, "lstat", forbidden)
        yield hits
    assert hits == native_hits == []


METADATA_INVALID = (
    "subclass",
    "img2img",
    "outpaint",
    "missing-field",
    "request-syntax",
    "request-length",
    "uppercase-digest",
    "icc",
    "byte-size-bool",
    "byte-size-zero",
    "byte-size-limit",
    "bbox-position",
    "dimension-bool",
    "seed",
    "concrete-prompt",
    "late-recipe-field",
    "crossed-profile",
)


@pytest.mark.parametrize("invalid", METADATA_INVALID)
def test_complete_metadata_preflight_precedes_filework_and_encoders(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    case = _case(tmp_path, cpu)
    command = case.command
    if invalid in ("subclass", "img2img", "outpaint"):
        values = {field.name: getattr(command, field.name) for field in dataclasses.fields(command)}
        if invalid == "subclass":

            class CommandSubclass(GenerateIllustriousTxt2ImgCommand):
                pass

            command = CommandSubclass(**values)
        elif invalid == "img2img":
            command = GenerateIllustriousImg2ImgCommand(**values, denoising_strength=0.5)
        else:
            command = GenerateIllustriousOutpaintCommand(
                **values,
                denoising_strength=0.5,
                conditioning=cast(Any, None),
                infill_resource=cast(Any, None),
            )
    elif invalid == "missing-field":
        object.__delattr__(command, "output_path")
    elif invalid == "bbox-position":
        command = dataclasses.replace(command, bbox={**command.bbox, "x": command.bbox["x"] + 1})
    elif invalid == "late-recipe-field":
        case.recipe["regions"][-1]["negative"]["prompt"]["text"] = None
    elif invalid == "crossed-profile":
        case.args["denoising_profile"] = CUDA_EXECUTION
    else:
        field, value = {
            "request-syntax": ("request_id", "bad/\N{CYRILLIC SMALL LETTER YA}"),
            "request-length": ("request_id", "a" * 129),
            "uppercase-digest": ("target_sha256", "A" * 64),
            "icc": ("target_icc_sha256", "a" * 64),
            "byte-size-bool": ("target_byte_size", True),
            "byte-size-zero": ("target_byte_size", 0),
            "byte-size-limit": ("target_byte_size", 32 * 1024 * 1024 + 1),
            "dimension-bool": ("width", True),
            "seed": ("seed", command.seed + 1),
            "concrete-prompt": ("positive_prompt", command.positive_prompt + " dog"),
        }[invalid]
        command = dataclasses.replace(command, **{field: value})
    code = "PROFILE_INVALID" if invalid == "crossed-profile" else "INPUT_INVALID"
    # Existing recipe/profile errors pass through as their own original type.
    errors = (
        output.IllustriousRegionalOutputError,
        cpu.recipe.IllustriousRegionalRecipeError,
        cpu.denoising.IllustriousRegionalDenoisingError,
    )
    before = set(case.root.iterdir())
    with _before_filework(cpu, monkeypatch), pytest.raises(errors) as caught:
        output.generate_current_canvas_regional_txt2img(case.recipe, command=command, **case.args)
    if invalid == "byte-size-limit":
        assert caught.value.code in {"INPUT_INVALID", "LIMIT"}
    else:
        assert caught.value.code == code
    assert set(case.root.iterdir()) == before


def test_invalid_geometry_refuses_before_files_even_when_command_matches_recipe(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Reuse the existing geometry owner, including the independent area ceiling.
    # No large image/tensor is allocated to test metadata bounds.
    for index, (width, height, code) in enumerate(
        (
            (0, 16, "INPUT_INVALID"),
            (7, 16, "INPUT_INVALID"),
            (25, 16, "INPUT_INVALID"),
            (2056, 16, "LIMIT"),
            (2048, 2048, "LIMIT"),
        )
    ):
        case = _case(tmp_path, cpu, name=f"geometry-{index}")
        case.recipe["bbox"].update(width=width, height=height)
        case.command = dataclasses.replace(
            case.command, width=width, height=height, bbox=copy.deepcopy(case.recipe["bbox"])
        )
        with (
            _before_filework(cpu, monkeypatch),
            pytest.raises(
                (output.IllustriousRegionalOutputError, cpu.recipe.IllustriousRegionalRecipeError)
            ) as caught,
        ):
            output.generate_current_canvas_regional_txt2img(
                case.recipe, command=case.command, **case.args
            )
        assert caught.value.code == code
        assert set(case.root.iterdir()) == {case.target}


@pytest.mark.parametrize("invalid", ("digest", "size", "dimensions", "icc", "rgb", "alpha"))
def test_actual_target_snapshot_validation_precedes_any_encoding(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    case = _case(tmp_path, cpu)
    if invalid == "digest":
        case.command = dataclasses.replace(case.command, target_sha256="0" * 64)
    elif invalid == "size":
        case.command = dataclasses.replace(
            case.command, target_byte_size=case.command.target_byte_size + 1
        )
    else:
        mode = "RGB" if invalid == "rgb" else "RGBA"
        size = (16, 16) if invalid == "dimensions" else (24, 16)
        color = (17, 59, 133) if mode == "RGB" else (17, 59, 133, 0)
        image = Image.new(mode, size, color)
        if invalid == "alpha":
            image.putpixel((23, 15), (17, 59, 133, 1))  # mixed alpha, not merely opaque control
        image.save(
            case.target,
            format="PNG",
            **({} if invalid == "icc" else {"icc_profile": SRGB_ICC_PROFILE}),
        )
        content = case.target.read_bytes()
        case.command = dataclasses.replace(
            case.command,
            target_sha256=hashlib.sha256(content).hexdigest(),
            target_byte_size=len(content),
        )
    with _no_native(cpu, monkeypatch), pytest.raises(DerivativeError) as caught:
        _generate(output, cpu, case)
    assert caught.value.code == {
        "digest": "INPUT_HASH_MISMATCH",  # existing read_snapshot error passes through
        "alpha": "GENERATION_TARGET_UNSUPPORTED",
    }.get(invalid, "GENERATION_INPUT_CHANGED")
    assert set(case.root.iterdir()) == {case.target}


@pytest.mark.parametrize("invalid", ("path-type", "suffix", "nonchild", "symlink", "unsafe-root"))
def test_exact_paths_and_private_root_refuse_before_native_work(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    case = _case(tmp_path, cpu)
    if invalid == "path-type":
        case.command = dataclasses.replace(case.command, output_path=str(case.command.output_path))
    elif invalid == "suffix":
        case.command = dataclasses.replace(case.command, output_path=case.root / "candidate.jpg")
    elif invalid == "nonchild":
        case.command = dataclasses.replace(case.command, output_path=tmp_path / "outside.png")
    elif invalid == "symlink":
        link = case.root / "link.png"
        link.symlink_to(case.target)
        case.command = dataclasses.replace(case.command, target_path=link)
    else:
        case.root.chmod(0o777)
    try:
        with (
            _no_native(cpu, monkeypatch),
            pytest.raises((output.IllustriousRegionalOutputError, DerivativeError)) as caught,
        ):
            _generate(output, cpu, case)
        assert caught.value.code in {"INPUT_INVALID", "INVALID_PATH"}
        assert not (tmp_path / "outside.png").exists()
        assert not list(case.root.glob(".*.tmp"))
    finally:
        case.root.chmod(0o700)


def test_preexisting_output_is_preserved_before_encoder_work(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, cpu)
    existing = b"existing output belongs to a different operation"
    case.command.output_path.write_bytes(existing)
    with _no_native(cpu, monkeypatch), pytest.raises(DerivativeError) as caught:
        _generate(output, cpu, case)
    assert caught.value.code == "OUTPUT_UNAVAILABLE"
    assert case.command.output_path.read_bytes() == existing
    assert set(case.root.iterdir()) == {case.target, case.command.output_path}


def test_output_collision_at_exclusive_link_preserves_winner_and_exact_cause(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, cpu)
    original = os.link
    winner = b"cooperative concurrent publisher won exclusive output"
    failures: list[FileExistsError] = []

    def racing_link(source: Any, destination: Any, **kwargs: Any) -> Any:
        if Path(destination) == case.command.output_path:
            Path(destination).write_bytes(winner)
            try:
                return original(source, destination, **kwargs)
            except FileExistsError as error:
                failures.append(error)
                raise
        return original(source, destination, **kwargs)

    with _observe(output, cpu, monkeypatch) as seen, monkeypatch.context() as patch:
        patch.setattr(generation_artifacts.os, "link", racing_link)
        with pytest.raises(DerivativeError) as caught:
            _generate(output, cpu, case)
    assert caught.value.code == "OUTPUT_UNAVAILABLE"
    assert len(failures) == 1 and caught.value.__cause__ is failures[0]
    assert len(seen.pipeline_results) == len(seen.publications) == 1 and not seen.receipts
    assert case.command.output_path.read_bytes() == winner
    assert set(case.root.iterdir()) == {case.target, case.command.output_path}


def test_directory_sync_failure_cleans_only_its_new_candidate_and_recovers(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, cpu)
    neighbor = case.root / "neighbor.png"
    neighbor.write_bytes(b"unrelated file remains")
    original = os.fsync
    sentinel = OSError("authored directory sync failure")
    hits: list[int] = []

    def fail_directory(descriptor: int) -> None:
        if stat.S_ISDIR(os.fstat(descriptor).st_mode):
            hits.append(descriptor)
            raise sentinel
        original(descriptor)

    with _observe(output, cpu, monkeypatch) as seen, monkeypatch.context() as patch:
        patch.setattr(generation_artifacts.os, "fsync", fail_directory)
        with pytest.raises(DerivativeError) as caught:
            _generate(output, cpu, case)
    assert caught.value.code == "GENERATION_WORKER_FAILED" and caught.value.__cause__ is sentinel
    assert len(hits) == 1 and len(seen.pipeline_results) == 1 and not seen.receipts
    assert set(case.root.iterdir()) == {case.target, neighbor}
    assert neighbor.read_bytes() == b"unrelated file remains"
    with _observe(output, cpu, monkeypatch) as recovered:
        done = _generate(output, cpu, case)
    _assert_png(cpu, case, recovered, done)


def test_optional_thumbnail_failure_keeps_real_native_required_png_and_receipt(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, cpu)
    hits: list[Path] = []

    def fail_cache(path: Path) -> bytes:
        hits.append(path)
        raise OSError("authored optional cache read failure")

    with _observe(output, cpu, monkeypatch) as seen, monkeypatch.context() as patch:
        patch.setattr(candidate_thumbnail, "_stable_thumbnail_bytes", fail_cache)
        done = _generate(output, cpu, case)
    assert len(hits) == 1
    _assert_png(cpu, case, seen, done, thumbnail=False)
    assert set(case.root.iterdir()) == {case.target, case.command.output_path}


@pytest.mark.parametrize("failure", ("second-unet", "vae-decode"))
def test_real_native_failure_identity_restoration_and_fresh_output_recovery(
    tmp_path: Path, lane: Any, output: Any, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    a, c = _save(tmp_path, lane, 1), _save(tmp_path, lane, 3)
    case = _case(tmp_path, lane, recipe=_same_recipe(a, c), exact_ti=True)
    if failure == "second-unet":
        cls, method, threshold = cast(Any, type(lane.pipeline.unet)), "forward", 2
    else:
        cls, method, threshold = cast(Any, type(lane.pipeline.vae)), "decode", 1
    original = getattr(cls, method)
    sentinel = DerivativeError("GENERATION_WORKER_FAILED", "authored failure after " + failure)
    calls: list[Any] = []

    @wraps(original)
    def fail_after_original(current: Any, *args: Any, **kwargs: Any) -> Any:
        result = original(current, *args, **kwargs)
        calls.append(result)
        if len(calls) == threshold:
            raise sentinel
        return result

    with monkeypatch.context() as patch:
        patch.setattr(cls, method, fail_after_original)
        with pytest.raises(DerivativeError) as caught:
            _generate(output, lane, case)
    assert caught.value is sentinel and len(calls) == threshold
    assert set(case.root.iterdir()) == {case.target}
    with _observe(output, lane, monkeypatch, exact_ti=True) as recovered:
        done = _generate(output, lane, case)
    _normal_result(lane, recovered, recovered.pipeline_results[0], 2)
    _assert_png(lane, case, recovered, done)
    assert caught.value.__traceback__ is not None  # retain failure while observing recovery


def test_static_conversion_failure_passes_original_error_without_publication(
    tmp_path: Path, cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path, cpu)
    processor = importlib.import_module("diffusers.image_processor").VaeImageProcessor
    sentinel = RuntimeError("authored static conversion failure after original")
    calls: list[Any] = []

    with _observe(output, cpu, monkeypatch) as seen, monkeypatch.context() as patch:
        # Delegate the observation wrapper too, retaining proof of original PT.
        observed = processor.numpy_to_pil

        @wraps(observed)
        def fail_observed(images: Any) -> Any:
            calls.append(observed(images))
            raise sentinel

        patch.setattr(processor, "numpy_to_pil", staticmethod(fail_observed))
        with pytest.raises(RuntimeError) as caught:
            _generate(output, cpu, case)
    assert caught.value is sentinel and len(calls) == 1
    assert len(seen.pipeline_results) == 1 and not seen.publications and not seen.receipts
    assert set(case.root.iterdir()) == {case.target}


def _literal_result(native: Any, channels: tuple[float, float, float]) -> Any:
    output_type = importlib.import_module(
        "diffusers.pipelines.stable_diffusion_xl.pipeline_output"
    ).StableDiffusionXLPipelineOutput
    image = native.torch.tensor(
        channels, device=native.pipeline.unet.device, dtype=native.dtype
    ).reshape(1, 3, 1, 1)
    return output_type(images=image.expand(1, 3, 8, 8).clone())


def _literal_oracle(native: Any, result: Any) -> bytes:
    numpy = pytest.importorskip("numpy")
    values = result.images[0, :, 0, 0].detach().cpu().float().tolist()
    # Scalar rounding is independent of the production transpose/array/PIL path.
    pixel = bytes(int(round(float(numpy.float32(v) * numpy.float32(255)))) for v in values)
    return pixel * 64


def _rgb(output: Any, native: Any, result: Any) -> Any:
    return output._rgb_image(
        result,
        torch=native.torch,
        width=8,
        height=8,
        tensor_profile="cuda-float16-v1" if native.device == "cuda" else "cpu-float32-v1",
    )


def test_native_rgb_channel_association_mutation_red(lane: Any, output: Any) -> None:
    """ROOT swaps RGB only in the new output owner; this literal pair localizes it."""
    result = _literal_result(lane, (0.07, 0.37, 0.83))
    before = result.images.clone()
    converted = _rgb(output, lane, result)
    assert type(converted) is Image.Image and converted.mode == "RGB"
    assert converted.size == (8, 8)
    assert converted.tobytes() == _literal_oracle(lane, result)
    assert lane.torch.equal(result.images, before)


def test_native_rgb_grayscale_control_green(lane: Any, output: Any) -> None:
    result = _literal_result(lane, (0.37, 0.37, 0.37))
    before = result.images.clone()
    converted = _rgb(output, lane, result)
    assert converted.mode == "RGB" and converted.size == (8, 8)
    assert converted.tobytes() == _literal_oracle(lane, result)
    assert lane.torch.equal(result.images, before)


@pytest.mark.parametrize(
    "invalid", ("result-type", "dtype", "shape", "nan", "inf", "below-zero", "above-one", "grad")
)
def test_rgb_helper_refuses_malformed_or_unrepresentable_native_result_before_conversion(
    cpu: Any, output: Any, monkeypatch: pytest.MonkeyPatch, invalid: str
) -> None:
    result = _literal_result(cpu, (0.07, 0.37, 0.83))
    if invalid == "result-type":
        result = SimpleNamespace(images=result.images)
    elif invalid == "dtype":
        result.images = result.images.to(dtype=cpu.torch.float16)
    elif invalid == "shape":
        result.images = result.images[:, :2]
    elif invalid == "grad":
        result.images.requires_grad_(True)
    else:
        # Last value catches scans that check only an initial row/channel.
        result.images[0, -1, -1, -1] = {
            "nan": float("nan"),
            "inf": float("inf"),
            "below-zero": -0.0001,
            "above-one": 1.0001,
        }[invalid]
    processor = importlib.import_module("diffusers.image_processor").VaeImageProcessor
    conversions: list[str] = []

    def forbidden(*_args: Any, **_kwargs: Any) -> Any:
        conversions.append("conversion")
        raise AssertionError("invalid PT reached static image conversion")

    with monkeypatch.context() as patch:
        patch.setattr(processor, "pt_to_numpy", staticmethod(forbidden))
        patch.setattr(processor, "numpy_to_pil", staticmethod(forbidden))
        with pytest.raises(
            (output.IllustriousRegionalOutputError, cpu.denoising.IllustriousRegionalDenoisingError)
        ) as caught:
            _rgb(output, cpu, result)
    assert caught.value.code == ("PROFILE_INVALID" if invalid == "result-type" else "INPUT_INVALID")
    assert conversions == []
