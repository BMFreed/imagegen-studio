"""Authored, deliberately unexecuted private Main-recipe/native CPU contract.

Canonical camelCase DTOs model the complete acknowledged Main recipe, including
globalPrompts; immutable bytes are the in-process alpha transfer only. This is
not a JSON codec, queue/admission test, checkpoint authenticator or image-quality
qualification. The root owns real Main capture and the transport integration.

Reuse the neighboring pinned real-width CLIP/Compel fixture without changing its
models. A separate ordinary four-stage VAE supplies scale eight. Every oracle
encodes independent literal text with the real production encoder function;
observers call the original encoders, native processors and native UNet unchanged.

Root's isolated mutation changes ONLY local-negative text selection to global
negative. test_local_negative_ownership_mutation_red must fail while
test_inherited_negative_global_control_green stays green. No model math, lengths,
pool selection, sample, coverage or layout is changed by that mutation.
"""

from __future__ import annotations

import copy
import dataclasses
import importlib
import inspect
import threading
from collections import Counter
from collections.abc import Generator, Iterator
from contextlib import ExitStack, contextmanager
from functools import wraps
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.illustrious_regional_attention import (
    Alpha8,
    EncodedSegment,
    Everywhere,
    Shape,
    plan_illustrious_attention,
)
from imagegen_worker.inference import MLRuntime, build_sdxl_conditioning, normalize_compel_prompt
from imagegen_worker.inference_embeddings import EmbeddingConditioningInputs
from imagegen_worker.protocol import IllustriousInferenceParameters
from test_illustrious_regional_conditioning import (
    _assert_ranges,  # pyright: ignore[reportPrivateUsage]
    _assert_state,  # pyright: ignore[reportPrivateUsage]
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _command,  # pyright: ignore[reportPrivateUsage]
    _dense_native_oracle,  # pyright: ignore[reportPrivateUsage]
    _first_attention,  # pyright: ignore[reportPrivateUsage]
    _mask,  # pyright: ignore[reportPrivateUsage]
    _observe,  # pyright: ignore[reportPrivateUsage]
    _slots,  # pyright: ignore[reportPrivateUsage]
    _state,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import native as _native_producer

PROFILE = "ordinary-canvas-static-dualclip-cpu-v1"
LAYOUTS = ("cfg-negative-first", "positive-only")
BBOX = {"x": -13, "y": 19, "width": 24, "height": 16}
GRID = Shape(2, 3)
DOCUMENT = "10000000-0000-4000-8000-000000000001"
REVISION = "10000000-0000-4000-8000-000000000002"
REGIONS = tuple(f"20000000-0000-4000-8000-{index:012d}" for index in range(1, 5))
MASKS = tuple(f"30000000-0000-4000-8000-{index:012d}" for index in range(1, 5))
LOCAL_ALPHA = bytes((255, 0, 127, 128, 1, 255))
LOCAL_VISIBLE = (True, False, False, True, False, True)
native_producer = _native_producer


@pytest.fixture(scope="module")
def native(native_producer: Any) -> Iterator[Any]:
    """Warm native CLIP output-capture hooks before per-test state snapshots."""
    base = native_producer
    vae = base.diffusers.AutoencoderKL(
        in_channels=3,
        out_channels=3,
        down_block_types=("DownEncoderBlock2D",) * 4,
        up_block_types=("UpDecoderBlock2D",) * 4,
        block_out_channels=(8, 8, 8, 8),
        layers_per_block=1,
        latent_channels=4,
        norm_num_groups=4,
        sample_size=16,
    ).eval()
    pipeline = base.diffusers.StableDiffusionXLPipeline(
        vae=vae,
        text_encoder=base.pipeline.text_encoder,
        text_encoder_2=base.pipeline.text_encoder_2,
        tokenizer=base.pipeline.tokenizer,
        tokenizer_2=base.pipeline.tokenizer_2,
        unet=base.pipeline.unet,
        scheduler=base.pipeline.scheduler,
        add_watermarker=False,
    )
    assert pipeline.vae_scale_factor == 8
    recipe = importlib.import_module("imagegen_worker.illustrious_regional_recipe")
    prepared = SimpleNamespace(**{**vars(base), "pipeline": pipeline, "recipe": recipe})
    # The finite consumer requires already warmed CLIPs and never installs or
    # repairs Transformers' lazy output-capture hooks itself. Use the unchanged
    # real producer before yielding and before the autouse snapshot can run.
    _encode(prepared, "cat", "blur")
    for encoder in (pipeline.text_encoder, pipeline.text_encoder_2):
        assert encoder.text_model._output_capturing_hooks_installed is True
    yield prepared


@pytest.fixture(autouse=True)
def preserved_native_state(native: Any) -> Iterator[None]:
    """Vocab, weights/buffers, eval, hooks, processors and call slots stay exact."""
    modules = (
        native.pipeline.text_encoder,
        native.pipeline.text_encoder_2,
        native.pipeline.unet,
        native.pipeline.vae,
    )
    states = tuple(_state(module) for module in modules)
    slots = tuple(_slots(module) for module in modules)
    tokenizers = (native.pipeline.tokenizer, native.pipeline.tokenizer_2)
    vocabs = tuple(dict(tokenizer.get_vocab()) for tokenizer in tokenizers)
    added = tuple(dict(tokenizer.get_added_vocab()) for tokenizer in tokenizers)
    owners = dict(native.adapter._OWNERS)
    yield
    assert owners == native.adapter._OWNERS
    for module, state, prior in zip(modules, states, slots, strict=True):
        assert _slots(module) == prior
        _assert_state(native, module, state)
    for tokenizer, vocab, additions in zip(tokenizers, vocabs, added, strict=True):
        assert tokenizer.get_vocab() == vocab
        assert tokenizer.get_added_vocab() == additions


def _prompt(text: str) -> dict[str, Any]:
    return {"text": text, "embeddingRefs": []}


def _coverage(
    values: bytes = LOCAL_ALPHA, *, kind: str = "covered", decoys: bool = True
) -> dict[str, Any]:
    # These are world-space pixels. Absolute (-13,19) is deliberately unaligned.
    # Off-grid 255 decoys make max/area/absolute-grid reprojection observably wrong.
    alpha = bytearray([255 if decoys else 0] * (24 * 16))
    for world_y in range(BBOX["y"], BBOX["y"] + 16, 8):
        for world_x in range(BBOX["x"], BBOX["x"] + 24, 8):
            y, x = world_y - BBOX["y"], world_x - BBOX["x"]
            alpha[y * 24 + x] = values[(y // 8) * 3 + x // 8]
    if kind != "covered":
        alpha = bytearray(24 * 16)
    return {
        "alpha": bytes(alpha),
        "bounds": dict(BBOX),
        "intersection": dict(BBOX) if kind in ("covered", "intersecting-empty") else None,
        "kind": kind,
    }


def _region(
    index: int = 0,
    *,
    positive: str | None = "dog",
    negative: str = "grain",
    inherited: bool = False,
    kind: str = "covered",
) -> dict[str, Any]:
    effective_positive = None if positive is None else _prompt(positive)
    return {
        "regionId": REGIONS[index],
        "maskId": MASKS[index],
        "maskRevision": 3,
        "coverage": _coverage(kind=kind),
        "positive": effective_positive,
        "negative": {
            "source": "current-canvas" if inherited else "regional",
            "prompt": _prompt(negative),
        },
        "authoredPrompts": {
            "positive": copy.deepcopy(effective_positive),
            "negative": _prompt("grain" if inherited else negative),
            "useGlobalNegativePrompt": inherited,
        },
    }


def _recipe(
    *regions: dict[str, Any], positive: str = "cat", negative: str = "blur"
) -> dict[str, Any]:
    return {
        "kind": "current-canvas-regional-recipe",
        "bbox": dict(BBOX),
        "documentId": DOCUMENT,
        "documentRevision": REVISION,
        "family": "illustrious",
        "globalPrompts": {"positive": _prompt(positive), "negative": _prompt(negative)},
        "item": {
            "iteration": 2,
            "promptPairIndex": 1,
            "prompts": {"positive": positive, "negative": negative},
            "seed": 42,
        },
        "regions": list(regions),
    }


def _parameters(positive: str = "cat", negative: str = "blur", **changes: Any) -> Any:
    return dataclasses.replace(
        IllustriousInferenceParameters(
            checkpoint_path=Path("/recipe-fixture-never-opened/checkpoint.safetensors"),
            checkpoint_sha256="a" * 64,
            prediction_type="epsilon",
            positive_prompt=positive,
            negative_prompt=negative,
            steps=2,
            cfg_scale=5.0,
            seed=42,
            scheduler="dpmpp_2m",
        ),
        **changes,
    )


def _arguments(native: Any, *, layout: str = LAYOUTS[0], **changes: Any) -> dict[str, Any]:
    batch = 2 if layout == LAYOUTS[0] else 1
    return {
        "pipeline": native.pipeline,
        "runtime": native.runtime,
        "parameters": _parameters(cfg_scale=5.0 if batch == 2 else 1.0),
        "profile": PROFILE,
        "global_negative_coverage": Everywhere(),
        "global_positive_coverage": Everywhere(),
        "negative_pooled_source_id": "current-canvas",
        "positive_pooled_source_id": "current-canvas",
        "bindings": _bindings(native, native.pipeline.unet),
        "layout": layout,
        "sample": native.torch.linspace(-0.8, 0.9, batch * 4 * 6).reshape(batch, 4, 2, 3),
        "timestep": native.torch.tensor(7.0),
        "time_ids": native.torch.tensor([[16.0, 24.0, 0.0, 0.0, 16.0, 24.0]]).repeat(batch, 1),
        **changes,
    }


def _run(native: Any, recipe: Any, args: dict[str, Any] | None = None) -> Any:
    return native.recipe.run_current_canvas_regional_recipe(
        recipe, **(_arguments(native) if args is None else args)
    )


def _encode(native: Any, positive: str, negative: str) -> Any:
    # Literal expected values never read a derived plan or the consumer's bank.
    return build_sdxl_conditioning(
        _parameters(positive, negative),
        native.pipeline,
        native.runtime,
        embedding_inputs=EmbeddingConditioningInputs((positive, negative), (None, None)),
    )


def _literal_bank(native: Any, streams: tuple[Any, ...], sign: str, keys: int) -> Any:
    result = native.torch.zeros(1, keys, 2048)
    cursor = 0
    for stream in streams:
        length = getattr(stream, sign + "_length")
        result[:, cursor : cursor + length] = getattr(stream, sign)[:, :length]
        cursor += length
    return result


def _literal_masks(
    native: Any,
    *,
    negative_lengths: tuple[int, ...],
    positive_lengths: tuple[int, ...],
    visibility: tuple[tuple[bool, ...], ...] = (LOCAL_VISIBLE,),
    layout: str = LAYOUTS[0],
    globals_visible: tuple[tuple[bool, ...], tuple[bool, ...]] = ((True,) * 6, (True,) * 6),
) -> Any:
    keys = max(sum(negative_lengths), sum(positive_lengths))
    signs = (0, 1) if layout == LAYOUTS[0] else (1,)
    allowed = native.torch.zeros(len(signs), 2, 6, keys, dtype=native.torch.bool)
    for batch, sign in enumerate(signs):
        cursor = 0
        for index, length in enumerate((negative_lengths, positive_lengths)[sign]):
            visible = globals_visible[sign] if index == 0 else visibility[index - 1]
            for query, yes in enumerate(visible):
                allowed[batch, :, query, cursor : cursor + length] = yes
            cursor += length
    return allowed


@contextmanager
def _observe_recipe(native: Any, monkeypatch: Any) -> Generator[Any]:
    inference = importlib.import_module("imagegen_worker.inference")
    clip = inference._clip_embeddings
    encoder_inputs: list[Any] = []
    clips: list[Any] = []
    handles: list[Any] = []
    for encoder in (native.pipeline.text_encoder, native.pipeline.text_encoder_2):

        def before(module: Any, args: Any, kwargs: Any) -> None:
            ids = args[0] if args else kwargs["input_ids"]
            encoder_inputs.append((module.config.hidden_size, ids.detach().clone()))

        handles.append(encoder.register_forward_pre_hook(before, with_kwargs=True))

    def observe_clip(text: str, **kwargs: Any) -> Any:
        result = clip(text, **kwargs)
        clips.append((text, kwargs["encoder"].config.hidden_size, result[0].detach().clone()))
        return result

    try:
        with monkeypatch.context() as patch, _observe(native, native.pipeline.unet, patch) as seen:
            patch.setattr(inference, "_clip_embeddings", observe_clip)
            seen.clips = clips
            seen.encoder_inputs = encoder_inputs
            yield seen
    finally:
        for handle in handles:
            handle.remove()


@contextmanager
def _no_encoding(native: Any, monkeypatch: Any, *, tokenize: bool = True) -> Generator[None]:
    """Invalid late fields must not touch an earlier encoder/native scope."""
    inference = importlib.import_module("imagegen_worker.inference")
    hits: list[str] = []

    def deny(label: str) -> Any:
        def refused(*_args: Any, **_kwargs: Any) -> Any:
            hits.append(label)
            raise AssertionError("premature active work: " + label)

        return refused

    setter = native.torch.nn.Module.__setattr__

    def guarded(module: Any, name: str, value: Any) -> None:
        if name in ("processor", "_call_impl", "forward", "_compiled_call_impl"):
            deny("native slot " + name)()
        setter(module, name, value)

    with monkeypatch.context() as patch:
        patch.setattr(inference, "_clip_embeddings", deny("CLIP producer"))
        patch.setattr(native.adapter._Scope, "install", deny("attention install"))
        patch.setattr(native.torch.nn.Module, "__setattr__", guarded)
        for encoder in (native.pipeline.text_encoder, native.pipeline.text_encoder_2):
            patch.setattr(type(encoder), "forward", deny("encoder forward"))
        patch.setattr(type(native.pipeline.unet), "forward", deny("UNet forward"))
        if not tokenize:
            tokenizer_type = cast(Any, type(native.pipeline.tokenizer))
            for name in ("__call__", "encode", "tokenize"):
                patch.setattr(tokenizer_type, name, deny("tokenizer." + name))
        yield
    assert hits == []


def _refusal_types(native: Any) -> tuple[type[Exception], ...]:
    geometry = importlib.import_module("imagegen_worker.illustrious_regional_geometry")
    attention = importlib.import_module("imagegen_worker.illustrious_regional_attention")
    return (
        native.recipe.IllustriousRegionalRecipeError,
        native.adapter.IllustriousRegionalAdapterError,
        native.bridge.IllustriousRegionalConditioningError,
        geometry.IllustriousRegionalGeometryError,
        attention.IllustriousRegionalAttentionError,
        DerivativeError,
    )


def _assert_refused(
    native: Any,
    monkeypatch: Any,
    recipe: Any,
    args: dict[str, Any],
    codes: tuple[str, ...] = ("INPUT_INVALID",),
    *,
    tokenize: bool = False,
) -> None:
    with _no_encoding(native, monkeypatch, tokenize=tokenize):
        with pytest.raises(_refusal_types(native)) as error:
            _run(native, recipe, args)
        assert cast(Any, error.value).code in codes


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize(
    "negative_source,positive_source",
    [
        ("current-canvas", REGIONS[0]),
        (REGIONS[0], "current-canvas"),
        (REGIONS[0], REGIONS[0]),
    ],
)
def test_complete_canonical_recipe_real_native_order_masks_pool_and_result(
    native: Any, monkeypatch: Any, layout: str, negative_source: str, positive_source: str
) -> None:
    global_stream = _encode(native, "cat", "blur")
    regional_stream = _encode(native, "dog", "grain")
    args = _arguments(native, layout=layout)
    args["negative_pooled_source_id"] = negative_source
    args["positive_pooled_source_id"] = positive_source
    with _observe_recipe(native, monkeypatch) as seen:
        result = _run(native, _recipe(_region()), args)
    assert result is seen.results[0]
    assert len(seen.contexts) == len(seen.plans) == 1
    bank_n = _literal_bank(native, (global_stream, regional_stream), "negative", 154)
    bank_p = _literal_bank(native, (global_stream, regional_stream), "positive", 154)
    expected_bank = native.torch.cat((bank_n, bank_p)) if layout == LAYOUTS[0] else bank_p
    assert native.torch.equal(seen.contexts[0], expected_bank)
    for sign in ("negative", "positive"):
        _assert_ranges(seen.plans[0], sign, (("current-canvas", 0, 77), (REGIONS[0], 77, 154)))
    expected_mask = _literal_masks(
        native, negative_lengths=(77, 77), positive_lengths=(77, 77), layout=layout
    )
    assert native.torch.equal(
        _mask(native, seen.masks[0], len(bank_p) + (layout == LAYOUTS[0]), 6, 154), expected_mask
    )
    negative_pool = (
        global_stream.negative_pooled
        if negative_source == "current-canvas"
        else regional_stream.negative_pooled
    )
    positive_pool = (
        global_stream.positive_pooled
        if positive_source == "current-canvas"
        else regional_stream.positive_pooled
    )
    expected_pool = (
        native.torch.cat((negative_pool, positive_pool)) if layout == LAYOUTS[0] else positive_pool
    )
    root = seen.root_inputs[0]
    assert native.torch.equal(root["added_cond_kwargs"]["text_embeds"], expected_pool)
    assert native.torch.equal(root["added_cond_kwargs"]["time_ids"], args["time_ids"])
    assert native.torch.equal(root["sample"], args["sample"])
    assert native.torch.equal(root["timestep"], args["timestep"])
    expected_attention = _dense_native_oracle(
        native,
        _first_attention(native, native.pipeline.unet),
        seen.queries[0],
        expected_bank,
        expected_mask,
    )
    assert native.torch.allclose(seen.outputs[0], expected_attention, atol=2e-6, rtol=2e-6)
    assert [text for text, width, _ in seen.clips if width == 768] == [
        "cat",
        "blur",
        "dog",
        "grain",
    ]
    assert {width for width, _ in seen.encoder_inputs} == {768, 1280}


def test_local_negative_ownership_mutation_red(native: Any, monkeypatch: Any) -> None:
    """The valid grain/blur contrast has fixed K, masks, pools, sample and CFG."""
    global_stream = _encode(native, "cat", "blur")
    grain = _encode(native, "dog", "grain")
    blur = _encode(native, "dog", "blur")
    recipe = _recipe(_region(negative="grain"))
    args = _arguments(native)  # Both pools explicitly remain global.
    with _observe_recipe(native, monkeypatch) as actual:
        result = _run(native, recipe, args)
    control_recipe = _recipe(_region(negative="blur"))
    with _observe_recipe(native, monkeypatch) as control:
        _run(native, control_recipe, args)
    assert result is actual.results[0]
    assert [text for text, width, _ in actual.clips if width == 768] == [
        "cat",
        "blur",
        "dog",
        "grain",
    ]
    grain_ids = native.pipeline.tokenizer("grain", add_special_tokens=False)["input_ids"]
    assert any(
        ids[0, 1 : 1 + len(grain_ids)].tolist() == grain_ids
        for width, ids in actual.encoder_inputs
        if width == 768
    ), "The original CLIP encoder must actually receive grain tokens."
    bank_n = _literal_bank(native, (global_stream, grain), "negative", 154)
    bank_p = _literal_bank(native, (global_stream, grain), "positive", 154)
    literal = native.torch.cat((bank_n, bank_p))
    assert native.torch.equal(actual.contexts[0], literal)
    assert not native.torch.equal(grain.negative[:, :77], blur.negative[:, :77])
    permissions = _literal_masks(native, negative_lengths=(77, 77), positive_lengths=(77, 77))
    assert native.torch.equal(actual.masks[0], control.masks[0])
    assert native.torch.equal(actual.queries[0], control.queries[0])
    oracle = _dense_native_oracle(
        native,
        _first_attention(native, native.pipeline.unet),
        actual.queries[0],
        literal,
        permissions,
    )
    assert native.torch.allclose(actual.outputs[0], oracle, atol=2e-6, rtol=2e-6)
    permitted = native.torch.tensor(LOCAL_VISIBLE)
    assert not native.torch.allclose(
        actual.outputs[0][0, permitted], control.outputs[0][0, permitted]
    )
    assert native.torch.equal(actual.outputs[0][0, ~permitted], control.outputs[0][0, ~permitted])
    assert native.torch.equal(actual.outputs[0][1], control.outputs[0][1])
    for observation in (actual, control):
        pool = observation.root_inputs[0]["added_cond_kwargs"]["text_embeds"]
        assert native.torch.equal(
            pool, native.torch.cat((global_stream.negative_pooled, global_stream.positive_pooled))
        )


def test_inherited_negative_global_control_green(native: Any, monkeypatch: Any) -> None:
    """Local grain remains authored; effective inherited blur is already global."""
    recipe = _recipe(_region(negative="blur", inherited=True))
    global_stream = _encode(native, "cat", "blur")
    inherited = _encode(native, "dog", "blur")
    expected = native.torch.cat(
        (
            _literal_bank(native, (global_stream, inherited), "negative", 154),
            _literal_bank(native, (global_stream, inherited), "positive", 154),
        )
    )
    with _observe_recipe(native, monkeypatch) as seen:
        result = _run(native, recipe)
    assert result is seen.results[0]
    assert native.torch.equal(seen.contexts[0], expected)
    assert [text for text, width, _ in seen.clips if width == 768] == ["cat", "blur", "dog", "blur"]
    permissions = _literal_masks(native, negative_lengths=(77, 77), positive_lengths=(77, 77))
    oracle = _dense_native_oracle(
        native,
        _first_attention(native, native.pipeline.unet),
        seen.queries[0],
        expected,
        permissions,
    )
    assert native.torch.allclose(seen.outputs[0], oracle, atol=2e-6, rtol=2e-6)


@pytest.mark.parametrize("concrete", ["blur", "noise"])
def test_concrete_negative_branches_keep_raw_template_and_dormant_grain_unconsumed(
    native: Any, monkeypatch: Any, concrete: str
) -> None:
    # Main has concretized the raw Canvas template {blur|noise}; it is not a recipe field.
    recipe = _recipe(_region(negative=concrete, inherited=True), negative=concrete)
    recipe["regions"][0]["authoredPrompts"]["negative"] = _prompt("{grain|<dormant>}")
    expected_global = _encode(native, "cat", concrete)
    expected_local = _encode(native, "dog", concrete)
    args = _arguments(native, parameters=_parameters(negative=concrete))
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, recipe, args)
    assert native.torch.equal(
        seen.contexts[0][0:1],
        _literal_bank(native, (expected_global, expected_local), "negative", 154),
    )
    assert [text for text, width, _ in seen.clips if width == 768] == [
        "cat",
        concrete,
        "dog",
        concrete,
    ]


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize("positive", [None, ""])
def test_absent_positive_omitted_present_empty_positive_emits_77_zero_rows(
    native: Any, monkeypatch: Any, layout: str, positive: str | None
) -> None:
    recipe = _recipe(_region(positive=positive, negative=""))
    args = _arguments(native, layout=layout)
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, recipe, args)
    expected = (("current-canvas", 0, 77),) + (() if positive is None else ((REGIONS[0], 77, 154),))
    _assert_ranges(seen.plans[0], "positive", expected)
    _assert_ranges(seen.plans[0], "negative", (("current-canvas", 0, 77), (REGIONS[0], 77, 154)))
    # Pair alignment may encode technical empty positive, but it cannot emit it for None.
    assert [text for text, width, _ in seen.clips if width == 768] == ["cat", "blur", "", ""]
    positive_row = 1 if layout == LAYOUTS[0] else 0
    assert native.torch.count_nonzero(seen.contexts[0][positive_row, 77:]) == 0
    expected_mask = _literal_masks(
        native,
        negative_lengths=(77, 77),
        positive_lengths=(77,) if positive is None else (77, 77),
        layout=layout,
    )
    assert native.torch.equal(
        _mask(native, seen.masks[0], len(seen.contexts[0]), 6, 154), expected_mask
    )


@pytest.mark.parametrize("count", [0, 3])
def test_zero_or_three_regions_preserve_order_and_duplicate_text_streams(
    native: Any, monkeypatch: Any, count: int
) -> None:
    recipe = _recipe(*(_region(index, negative="blur", inherited=True) for index in range(count)))
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, recipe)
    ranges = (("current-canvas", 0, 77),) + tuple(
        (REGIONS[index], (index + 1) * 77, (index + 2) * 77) for index in range(count)
    )
    for sign in ("negative", "positive"):
        _assert_ranges(seen.plans[0], sign, ranges)
    assert seen.contexts[0].shape == (2, 77 * (count + 1), 2048)
    assert [text for text, width, _ in seen.clips if width == 768] == ["cat", "blur"] + [
        "dog",
        "blur",
    ] * count


@pytest.mark.parametrize("kind", ["empty", "outside", "intersecting-empty", "covered"])
def test_all_four_world_coverage_kinds_preserved_without_unrestricted_fallback(
    native: Any, monkeypatch: Any, kind: str
) -> None:
    recipe = _recipe(_region(kind=kind))
    original = copy.deepcopy(recipe)
    geometry = importlib.import_module("imagegen_worker.illustrious_regional_geometry")
    projector = geometry.ordinary_canvas_coverage_to_latent
    calls: list[Any] = []

    def observe_geometry(**kwargs: Any) -> Any:
        result = projector(**kwargs)
        calls.append((kwargs, result))
        return result

    with monkeypatch.context() as patch, _observe_recipe(native, patch) as seen:
        # The settled implementation uses the existing helper, not another algorithm.
        patch.setattr(native.recipe, "ordinary_canvas_coverage_to_latent", observe_geometry)
        _run(native, recipe)
    assert recipe == original
    assert len(calls) == 1
    assert calls[0][0]["profile"] == "ordinary-canvas-origin-nearest8-v1"
    assert calls[0][0]["bbox"] == BBOX
    assert calls[0][0]["latent_shape"] == GRID
    assert calls[0][1].samples == (LOCAL_ALPHA if kind == "covered" else bytes(6))
    allowed = _mask(native, seen.masks[0], 2, 6, 154)
    for query in range(6):
        assert bool(allowed[:, :, query, 77:].all()) == (kind == "covered" and LOCAL_VISIBLE[query])


@pytest.mark.parametrize("layout", LAYOUTS)
def test_explicit_global_alpha_and_regional_union_have_no_synthesized_background(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    complement = tuple(not visible for visible in LOCAL_VISIBLE)
    alpha = Alpha8(GRID, bytes(255 if yes else 0 for yes in complement))
    args = _arguments(
        native, layout=layout, global_negative_coverage=alpha, global_positive_coverage=alpha
    )
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, _recipe(_region()), args)
    expected = _literal_masks(
        native,
        negative_lengths=(77, 77),
        positive_lengths=(77, 77),
        layout=layout,
        globals_visible=(complement, complement),
    )
    assert native.torch.equal(_mask(native, seen.masks[0], len(seen.contexts[0]), 6, 154), expected)


@pytest.mark.parametrize("layout", LAYOUTS)
def test_active_all_masked_queries_refuse_before_any_encoder(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    args = _arguments(native, layout=layout, global_positive_coverage=Alpha8(GRID, bytes(6)))
    _assert_refused(
        native, monkeypatch, _recipe(), args, ("ALL_MASKED", "INPUT_INVALID"), tokenize=True
    )


def test_positive_only_may_ignore_masked_negative_execution_but_validates_it(native: Any) -> None:
    args = _arguments(
        native, layout="positive-only", global_negative_coverage=Alpha8(GRID, bytes(6))
    )
    assert native.torch.isfinite(_run(native, _recipe(), args).sample).all()


@pytest.mark.parametrize(
    "sign,selection",
    [
        ("negative", "missing"),
        ("positive", "missing"),
        ("positive", "absent-positive"),
        ("negative", "not-string"),
        ("positive", "not-string"),
    ],
)
def test_pool_source_must_explicitly_name_existing_emitted_sign(
    native: Any, monkeypatch: Any, sign: str, selection: str
) -> None:
    recipe = _recipe(_region(positive=None))
    args = _arguments(native)
    args[sign + "_pooled_source_id"] = (
        None
        if selection == "not-string"
        else (REGIONS[0] if selection == "absent-positive" else "missing")
    )
    _assert_refused(native, monkeypatch, recipe, args)


def test_implicit_inheritance_without_authored_block_and_local_empty_stay_distinct(
    native: Any, monkeypatch: Any
) -> None:
    implicit = _region(0, positive=None, negative="blur", inherited=True)
    implicit.pop("authoredPrompts")
    empty_local = _region(1, positive="", negative="")
    recipe = _recipe(implicit, empty_local)
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, recipe)
    assert [text for text, width, _ in seen.clips if width == 768] == [
        "cat",
        "blur",
        "",
        "blur",
        "",
        "",
    ]
    assert native.torch.count_nonzero(seen.contexts[0][0, 154:231]) == 0
    inherited = _encode(native, "", "blur")
    assert native.torch.equal(seen.contexts[0][0:1, 77:154], inherited.negative[:, :77])


def _embedding_ref() -> dict[str, Any]:
    return {
        "token": "<dormant>",
        "resource": {
            "baseModelFamily": "illustrious",
            "civitaiFileId": None,
            "civitaiModelId": None,
            "civitaiVersionId": None,
            "displayName": "fixture",
            "fileSha256": "a" * 64,
            "kind": "embedding",
            "localModelId": "fixture",
            "localVersionId": "version",
            "predictionType": None,
            "versionName": "v1",
        },
    }


def _reference() -> dict[str, Any]:
    identity = "40000000-0000-4000-8000-000000000001"
    prefix = f"assets/regional-references/{identity}/"
    return {
        "id": identity,
        "name": "reference",
        "sourceFormat": "PNG",
        "asset": {
            "path": prefix + "a" * 64 + ".png",
            "sha256": "a" * 64,
            "bytes": 123,
            "width": 8,
            "height": 8,
        },
        "thumbnail": {
            "path": prefix + "b" * 64 + ".webp",
            "sha256": "b" * 64,
            "bytes": 80,
            "width": 8,
            "height": 8,
        },
    }


def test_dormant_authored_braces_markup_and_refs_do_not_become_effective(
    native: Any, monkeypatch: Any
) -> None:
    region = _region(negative="blur", inherited=True)
    region["authoredPrompts"]["negative"] = {
        "text": "{grain|noise} <dormant> <lora:x:1>",
        "embeddingRefs": [_embedding_ref()],
    }
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, _recipe(region))
    assert [text for text, width, _ in seen.clips if width == 768] == ["cat", "blur", "dog", "blur"]


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize(
    "site",
    ["global-positive", "global-negative", "last-positive", "last-negative", "reference-image"],
)
def test_all_effective_refs_and_enabled_images_refuse_before_tokenization_even_last_negative(
    native: Any, monkeypatch: Any, layout: str, site: str
) -> None:
    recipe = _recipe(*(_region(index) for index in range(3)))
    if site == "reference-image":
        recipe["regions"][-1]["referenceImages"] = [_reference()]
    elif site.startswith("global"):
        recipe["globalPrompts"][site.split("-")[1]]["embeddingRefs"] = [_embedding_ref()]
    elif site == "last-positive":
        recipe["regions"][-1]["positive"]["embeddingRefs"] = [_embedding_ref()]
    else:
        recipe["regions"][-1]["negative"]["prompt"]["embeddingRefs"] = [_embedding_ref()]
    _assert_refused(
        native, monkeypatch, recipe, _arguments(native, layout=layout), ("UNSUPPORTED",)
    )


@pytest.mark.parametrize("site", ["positive_embeddings", "negative_embeddings", "loras"])
def test_nonempty_parameter_resources_refuse_without_resource_loading(
    native: Any, monkeypatch: Any, site: str
) -> None:
    parameters = dataclasses.replace(_parameters(), **{site: (object(),)})
    inference = importlib.import_module("imagegen_worker.inference")
    embeddings = importlib.import_module("imagegen_worker.inference_embeddings")

    def no_loader(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("The recipe entrypoint must not load resources.")

    with monkeypatch.context() as patch:
        patch.setattr(inference, "load_generation_embeddings", no_loader)
        patch.setattr(embeddings, "load_generation_embeddings", no_loader)
        _assert_refused(
            native, patch, _recipe(), _arguments(native, parameters=parameters), ("UNSUPPORTED",)
        )


@pytest.mark.parametrize("field", ["positive", "negative"])
def test_success_never_calls_embedding_loader_or_uses_external_managers(
    native: Any, monkeypatch: Any, field: str
) -> None:
    inference = importlib.import_module("imagegen_worker.inference")

    def no_loader(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Producer must receive internally owned no-manager inputs.")

    original = inference.build_sdxl_conditioning
    calls: list[Any] = []

    def producer(parameters: Any, pipeline: Any, runtime: Any, **kwargs: Any) -> Any:
        inputs = kwargs["embedding_inputs"]
        assert type(inputs) is EmbeddingConditioningInputs
        assert inputs.managers == (None, None)
        assert inputs.prompts == (parameters.positive_prompt, parameters.negative_prompt)
        assert type(parameters) is IllustriousInferenceParameters
        calls.append(inputs.prompts)
        return original(parameters, pipeline, runtime, **kwargs)

    recipe = _recipe(
        _region(
            positive="" if field == "positive" else "dog",
            negative="" if field == "negative" else "grain",
        )
    )
    with monkeypatch.context() as patch:
        patch.setattr(inference, "load_generation_embeddings", no_loader)
        patch.setattr(native.recipe, "build_sdxl_conditioning", producer)
        _run(native, recipe)
    assert calls == [
        ("cat", "blur"),
        (
            recipe["regions"][0]["positive"]["text"],
            recipe["regions"][0]["negative"]["prompt"]["text"],
        ),
    ]


def _set_path(value: Any, path: tuple[Any, ...], replacement: Any) -> None:
    for part in path[:-1]:
        value = value[part]
    value[path[-1]] = replacement


INVALID_METADATA = (
    (("kind",), "smart-patch-regional-recipe"),
    (("kind",), None),
    (("family",), "anima"),
    (("family",), ["illustrious"]),
    (("documentId",), "not-a-uuid"),
    (("documentRevision",), True),
    (("item", "iteration"), True),
    (("item", "iteration"), -1),
    (("item", "promptPairIndex"), 2**53),
    (("item", "seed"), True),
    (("item", "seed"), -1),
    (("item", "seed"), 2**32),
    (("item", "seed"), 43),
    (("item", "prompts", "positive"), "other"),
    (("globalPrompts", "positive", "text"), "other"),
    (("globalPrompts", "negative", "embeddingRefs"), None),
    (("globalPrompts", "positive"), "cat"),
    (("regions", 0, "regionId"), "current-canvas"),
    (("regions", 0, "maskId"), REGIONS[0]),
    (("regions", 0, "maskRevision"), True),
    (("regions", 0, "maskRevision"), 2**53),
    (("regions", 0, "negative", "source"), "global"),
    (("regions", 0, "negative", "prompt", "text"), 13),
    (("regions", 0, "positive", "embeddingRefs"), ()),
    (("regions", 0, "coverage", "kind"), "everywhere"),
    (("regions", 0, "coverage", "alpha"), bytearray(24 * 16)),
    (("regions", 0, "coverage", "alpha"), bytes(24 * 16 - 1)),
    (("regions", 0, "coverage", "bounds", "x"), -12),
    (("regions", 0, "coverage", "intersection"), None),
    (("regions", 0, "coverage", "intersection", "x"), -14),
    (("regions", 0, "coverage", "intersection", "width"), 25),
    (("regions", 0, "coverage", "intersection", "height"), 0),
    (("bbox", "x"), 0.5),
    (("bbox", "width"), 23),
    (("bbox", "height"), 0),
    (("bbox", "width"), True),
)


@pytest.mark.parametrize("path,value", INVALID_METADATA, ids=lambda item: str(item))
def test_complete_metadata_refusal_before_any_tokenization_or_native_mutation(
    native: Any, monkeypatch: Any, path: tuple[Any, ...], value: Any
) -> None:
    recipe = _recipe(_region())
    _set_path(recipe, path, value)
    # Family/target syntax can be a semantic unsupported diagnostic.
    _assert_refused(
        native, monkeypatch, recipe, _arguments(native), ("INPUT_INVALID", "UNSUPPORTED")
    )


@pytest.mark.parametrize("kind", ["empty", "outside", "intersecting-empty", "covered"])
def test_coverage_kind_alpha_and_intersection_must_be_coherent(
    native: Any, monkeypatch: Any, kind: str
) -> None:
    region = _region(kind=kind)
    if kind == "covered":
        region["coverage"]["alpha"] = bytes(24 * 16)
    else:
        region["coverage"]["alpha"] = _coverage()["alpha"]
    _assert_refused(native, monkeypatch, _recipe(region), _arguments(native))


@pytest.mark.parametrize("which", ["region", "mask", "cross-owner"])
def test_duplicate_uuid_identities_refuse_before_encoding(
    native: Any, monkeypatch: Any, which: str
) -> None:
    recipe = _recipe(_region(0), _region(1))
    field = "regionId" if which == "region" else "maskId"
    recipe["regions"][1][field] = recipe["regions"][0][
        "regionId" if which == "cross-owner" else field
    ]
    _assert_refused(native, monkeypatch, recipe, _arguments(native))


def test_inherited_effective_negative_must_equal_exact_global_prompt(
    native: Any, monkeypatch: Any
) -> None:
    _assert_refused(
        native, monkeypatch, _recipe(_region(negative="grain", inherited=True)), _arguments(native)
    )


@pytest.mark.parametrize(
    "text", ["{blur|noise}", r"\{blur\}", "<lora:x:1>", "(cat:wrong)", "\ud800", "\udfff"]
)
@pytest.mark.parametrize("site", ["global-positive", "last-negative"])
def test_active_text_braces_markup_ambiguous_weights_and_invalid_utf8_refuse_before_encoding(
    native: Any, monkeypatch: Any, text: str, site: str
) -> None:
    recipe = _recipe(_region(0), _region(1), _region(2))
    parameters = _parameters()
    if site == "global-positive":
        recipe["globalPrompts"]["positive"]["text"] = text
        recipe["item"]["prompts"]["positive"] = text
        parameters = _parameters(positive=text)
    else:
        recipe["regions"][-1]["negative"]["prompt"]["text"] = text
        recipe["regions"][-1]["authoredPrompts"]["negative"]["text"] = text
    _assert_refused(
        native,
        monkeypatch,
        recipe,
        _arguments(native, parameters=parameters),
        ("INPUT_INVALID", "UNSUPPORTED", "GENERATION_PROMPT_UNSUPPORTED"),
        tokenize=True,
    )


@pytest.mark.parametrize("site", ["global", "last-positive", "last-negative"])
def test_active_16kib_utf8_limit_checks_bytes_before_tokenization(
    native: Any, monkeypatch: Any, site: str
) -> None:
    text = "é" * 8193  # 16,386 bytes, fewer than 16,384 codepoints.
    recipe = _recipe(_region(0), _region(1), _region(2))
    parameters = _parameters()
    if site == "global":
        recipe["globalPrompts"]["positive"]["text"] = text
        recipe["item"]["prompts"]["positive"] = text
        parameters = _parameters(positive=text)
    else:
        sign = site.split("-")[1]
        prompt = recipe["regions"][-1][sign]
        if sign == "negative":
            prompt = prompt["prompt"]
        prompt["text"] = text
        recipe["regions"][-1]["authoredPrompts"][sign]["text"] = text
    _assert_refused(
        native, monkeypatch, recipe, _arguments(native, parameters=parameters), ("LIMIT",)
    )


def test_four_regions_refuse_before_tokenization(native: Any, monkeypatch: Any) -> None:
    _assert_refused(
        native,
        monkeypatch,
        _recipe(*(_region(index) for index in range(4))),
        _arguments(native),
        ("LIMIT",),
    )


@pytest.mark.parametrize(
    "layout,cfg",
    [("positive-only", 1.01), ("cfg-negative-first", 1.0), ("cfg-negative-first", 0.0)],
)
def test_layout_must_match_standard_no_time_conditioned_cfg_predicate(
    native: Any, monkeypatch: Any, layout: str, cfg: float
) -> None:
    _assert_refused(
        native,
        monkeypatch,
        _recipe(),
        _arguments(native, layout=layout, parameters=_parameters(cfg_scale=cfg)),
        ("INPUT_INVALID", "PROFILE_INVALID"),
    )


@pytest.mark.parametrize("cfg", [0.0, 0.5, 1.0])
def test_positive_only_cfg_at_most_one_uses_native_consumer(native: Any, cfg: float) -> None:
    assert native.torch.isfinite(
        _run(
            native,
            _recipe(),
            _arguments(native, layout="positive-only", parameters=_parameters(cfg_scale=cfg)),
        ).sample
    ).all()


@pytest.mark.parametrize("profile", [None, True, "alpha8-ge128-ceil2x2-max-v1", [PROFILE]])
def test_wrong_or_wrongtyped_profile_refuses_before_tokenization(
    native: Any, monkeypatch: Any, profile: Any
) -> None:
    _assert_refused(
        native, monkeypatch, _recipe(), _arguments(native, profile=profile), ("PROFILE_INVALID",)
    )


def test_exact_base_parameters_refuse_serialized_generate_subclass(
    native: Any, monkeypatch: Any
) -> None:
    _assert_refused(
        native, monkeypatch, _recipe(), _arguments(native, parameters=_command("cat", "blur"))
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("seed", True),
        ("seed", 43),
        ("seed", 2**32),
        ("positive_prompt", "dog"),
        ("negative_prompt", "grain"),
    ],
)
def test_acknowledged_job_parameters_bind_exact_seed_and_both_global_texts(
    native: Any, monkeypatch: Any, field: str, value: Any
) -> None:
    _assert_refused(
        native, monkeypatch, _recipe(), _arguments(native, parameters=_parameters(**{field: value}))
    )


def test_signature_has_only_required_settled_arguments_and_no_override_channels(
    native: Any,
) -> None:
    entry = native.recipe.run_current_canvas_regional_recipe
    signature = inspect.signature(entry)
    expected = {
        "pipeline",
        "runtime",
        "parameters",
        "profile",
        "global_negative_coverage",
        "global_positive_coverage",
        "negative_pooled_source_id",
        "positive_pooled_source_id",
        "bindings",
        "layout",
        "sample",
        "timestep",
        "time_ids",
    }
    assert tuple(signature.parameters)[0] == "recipe"
    assert set(signature.parameters) == expected | {"recipe"}
    for name, parameter in signature.parameters.items():
        assert parameter.default is inspect.Parameter.empty, name
        assert parameter.kind is (
            inspect.Parameter.POSITIONAL_OR_KEYWORD
            if name == "recipe"
            else inspect.Parameter.KEYWORD_ONLY
        )
    assert issubclass(native.recipe.IllustriousRegionalRecipeError, ValueError)


@pytest.mark.parametrize(
    "extra",
    [
        "root",
        "latent_shape",
        "encoder_attention_mask",
        "embedding_inputs",
        "negative",
        "positive",
        "context",
        "plan",
    ],
)
def test_caller_override_channel_typeerror_before_encoding(
    native: Any, monkeypatch: Any, extra: str
) -> None:
    with _no_encoding(native, monkeypatch, tokenize=False), pytest.raises(TypeError):
        _run(native, _recipe(), {**_arguments(native), extra: None})


def _builder(native: Any, second: bool = False) -> Any:
    compel = native.runtime.compel
    return compel.Compel(
        tokenizer=native.pipeline.tokenizer_2 if second else native.pipeline.tokenizer,
        text_encoder=native.pipeline.text_encoder_2 if second else native.pipeline.text_encoder,
        returned_embeddings_type=compel.ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
        truncate_long_prompts=False,
        split_long_text_mode=compel.SplitLongTextMode.SENTENCES,
        requires_pooled=second,
        textual_inversion_manager=None,
    )


@pytest.mark.parametrize(
    "text,rows",
    [
        ("", 77),
        ("cat", 77),
        (" ".join(["cat"] * 26), 154),
        (" ".join(["cat"] * 51), 231),
        (" ".join(["cat"] * 76), 308),
    ],
)
@pytest.mark.parametrize("second", [False, True])
def test_expanded_count_pure_extraction_matches_true_native_length_and_old_none_wrapper(
    native: Any, monkeypatch: Any, text: str, rows: int, second: bool
) -> None:
    embeddings = importlib.import_module("imagegen_worker.inference_embeddings")
    builder = _builder(native, second)
    with _no_encoding(native, monkeypatch):
        count = embeddings.expanded_conditioning_length(builder, text)
        assert type(count) is int and count == rows
        assert embeddings.validate_expanded_conditioning(builder, text) is None
    actual = _encode(native, text, "")
    assert actual.positive_length == count
    assert actual.negative_length == 77


def test_old_expanded_validation_refusal_preserved_and_new_counter_also_refuses(
    native: Any, monkeypatch: Any
) -> None:
    embeddings = importlib.import_module("imagegen_worker.inference_embeddings")
    # 303 raw BPE tokens plus BOS/EOS fits raw 308, expanded chunks need 385.
    text = " ".join(["cat"] * 101)
    assert len(native.pipeline.tokenizer(text)["input_ids"]) == 305
    for function in (
        embeddings.expanded_conditioning_length,
        embeddings.validate_expanded_conditioning,
    ):
        with _no_encoding(native, monkeypatch), pytest.raises(DerivativeError) as error:
            function(_builder(native), text)
        assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"


@pytest.mark.parametrize("text", ["(cat:1.2) " * 26, "cat. " * 26, "(cat:0.5) " * 26])
def test_weighting_and_sentence_splitter_count_parity_with_actual_producer(
    native: Any, monkeypatch: Any, text: str
) -> None:
    embeddings = importlib.import_module("imagegen_worker.inference_embeddings")
    normalized = normalize_compel_prompt(text)
    with _no_encoding(native, monkeypatch):
        counts = tuple(
            embeddings.expanded_conditioning_length(_builder(native, second), normalized)
            for second in (False, True)
        )
    expected = _encode(native, text, "blur")
    assert expected.positive_length == max(counts)
    recipe = _recipe(positive=text)
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, recipe, _arguments(native, parameters=_parameters(positive=text)))
    assert seen.contexts[0].shape[1] == max(counts)
    assert native.torch.equal(seen.contexts[0][1:2], expected.positive)


def test_all_signed_pairs_and_both_real_splitters_complete_before_first_clip_forward(
    native: Any, monkeypatch: Any
) -> None:
    providers = importlib.import_module("compel.embeddings_provider")
    provider_type = providers.EmbeddingsProvider
    splitter = provider_type.get_token_ids_and_expand_weights
    texts = ("cat", "blur", "dog", "grain", "", "noise", "cat", "blur")
    recipe = _recipe(
        _region(0),
        _region(1, positive=None, negative="noise"),
        _region(2, positive="cat", negative="blur", inherited=True),
    )
    expected: Counter[Any] = Counter()
    for second in (False, True):
        builder = _builder(native, second)
        for text in texts:
            parsed = builder.parse_prompt_string(normalize_compel_prompt(text))
            fragments = tuple(child.text for child in parsed.prompts[0].children)
            weights = tuple(child.weight for child in parsed.prompts[0].children)
            expected[(1280 if second else 768, fragments, weights)] += 1
    split_seen: Counter[Any] = Counter()
    first_encoder: list[Any] = []

    def split(provider: Any, fragments: Any, weights: Any, *args: Any, **kwargs: Any) -> Any:
        result = splitter(provider, fragments, weights, *args, **kwargs)
        split_seen[
            (provider.text_encoder.config.hidden_size, tuple(fragments), tuple(weights))
        ] += 1
        return result

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        if not first_encoder:
            assert not (expected - split_seen), (expected, split_seen)
            first_encoder.append(True)

    handles = [
        encoder.register_forward_pre_hook(before, with_kwargs=True)
        for encoder in (native.pipeline.text_encoder, native.pipeline.text_encoder_2)
    ]
    try:
        with monkeypatch.context() as patch:
            patch.setattr(provider_type, "get_token_ids_and_expand_weights", split)
            _run(native, recipe)
    finally:
        for handle in handles:
            handle.remove()
    assert first_encoder == [True]


@pytest.mark.parametrize("merged_first", [False, True])
@pytest.mark.parametrize("words,rows", [(26, 154), (51, 231), (76, 308)])
def test_actual_dualclip_max_with_unequal_tokenizers_is_not_capped_to_one_chunk(
    native: Any, monkeypatch: Any, merged_first: bool, words: int, rows: int
) -> None:
    merged = native.transformers.CLIPTokenizer(
        vocab=native.vocab, merges=[("c", "a"), ("ca", "t</w>")], model_max_length=77
    )
    text = " ".join(["cat"] * words)
    with monkeypatch.context() as patch:
        patch.setattr(native.pipeline, "tokenizer" if merged_first else "tokenizer_2", merged)
        expected = _encode(native, text, "blur")
        with _observe_recipe(native, patch) as seen:
            _run(
                native,
                _recipe(positive=text),
                _arguments(native, parameters=_parameters(positive=text)),
            )
    assert expected.positive_length == rows
    assert native.torch.equal(seen.contexts[0][1:2], expected.positive)
    _assert_ranges(seen.plans[0], "positive", (("current-canvas", 0, rows),))
    negative = seen.contexts[0][0]
    assert native.torch.count_nonzero(negative[77:]) == 0
    lengths = {width: tensor.shape[1] for prompt, width, tensor in seen.clips if prompt == text}
    assert max(lengths.values()) == rows
    assert min(lengths.values()) == (154 if words == 76 else 77)


@pytest.mark.parametrize("layout", LAYOUTS)
@pytest.mark.parametrize("sign", ["positive", "negative"])
@pytest.mark.parametrize(
    "global_words,region_words,total", [(51, 1, 308), (76, 1, 385), (1, 76, 385)]
)
def test_per_sign_emitted_aggregate_308_accepts_385_refuses_before_first_encoder(
    native: Any,
    monkeypatch: Any,
    layout: str,
    sign: str,
    global_words: int,
    region_words: int,
    total: int,
) -> None:
    global_text = " ".join(["cat"] * global_words)
    region_text = " ".join(["cat"] * region_words)
    positive = global_text if sign == "positive" else "cat"
    negative = global_text if sign == "negative" else "blur"
    region = _region(
        positive=region_text if sign == "positive" else "dog",
        negative=region_text if sign == "negative" else "grain",
    )
    recipe = _recipe(region, positive=positive, negative=negative)
    parameters = _parameters(
        positive=positive, negative=negative, cfg_scale=5.0 if layout == LAYOUTS[0] else 1.0
    )
    args = _arguments(native, layout=layout, parameters=parameters)
    if total == 385:
        _assert_refused(
            native, monkeypatch, recipe, args, ("LIMIT", "REGIONAL_ATTENTION_LIMIT"), tokenize=True
        )
        return
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, recipe, args)
    assert seen.contexts[0].shape[1] == 308
    _assert_ranges(seen.plans[0], sign, (("current-canvas", 0, 231), (REGIONS[0], 231, 308)))


@pytest.mark.parametrize("layout", LAYOUTS)
def test_raw_token_limit_cannot_hide_parser_expanded_385_last_negative(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    long_negative = " ".join(["cat"] * 101)
    recipe = _recipe(_region(0, negative=long_negative))
    _assert_refused(
        native,
        monkeypatch,
        recipe,
        _arguments(native, layout=layout),
        ("LIMIT", "GENERATION_PROMPT_UNSUPPORTED"),
        tokenize=True,
    )


def test_exact_128kib_active_pair_budget_includes_repeated_inherited_negatives(
    native: Any, monkeypatch: Any
) -> None:
    positive, negative = "cat" + " " * 16381, "blur" + " " * 16380
    assert len(positive.encode()) == len(negative.encode()) == 16 * 1024
    recipe = _recipe(
        *(
            _region(index, positive=positive, negative=negative, inherited=True)
            for index in range(3)
        ),
        positive=positive,
        negative=negative,
    )
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, recipe, _arguments(native, parameters=_parameters(positive, negative)))
    pair_texts = [text for text, width, _ in seen.clips if width == 768]
    assert pair_texts == [positive, negative] * 4
    assert sum(len(text.encode()) for text in pair_texts) == 128 * 1024
    assert seen.contexts[0].shape == (2, 308, 2048)
    # With <=8 signs and <=16KiB each, exceeding the aggregate also violates
    # an earlier bound; there is no independently reachable 128KiB+1 case.


@pytest.mark.parametrize("field", ["sample", "timestep", "time_ids"])
@pytest.mark.parametrize("bad", ["nan", "grad", "float64", "shape"])
def test_native_argument_complete_preflight_precedes_encoding(
    native: Any, monkeypatch: Any, field: str, bad: str
) -> None:
    args = _arguments(native)
    value = args[field].clone()
    if bad == "nan":
        value.fill_(float("nan"))
    elif bad == "grad":
        value.requires_grad_(True)
    elif bad == "float64":
        value = value.double()
    elif field == "timestep":
        value = value.reshape(1)
    elif field == "time_ids":
        value = value[:, :5]
    else:
        value = value[:, :, :, :2]
    args[field] = value
    _assert_refused(native, monkeypatch, _recipe(), args, ("INPUT_INVALID",), tokenize=True)


@pytest.mark.parametrize("case", ["empty", "duplicate", "outside", "wrong-factor", "list"])
def test_native_bindings_validate_complete_root_before_first_encoder(
    native: Any, monkeypatch: Any, case: str
) -> None:
    args = _arguments(native)
    bindings = args["bindings"]
    if case == "empty":
        args["bindings"] = ()
    elif case == "duplicate":
        args["bindings"] = (*bindings, bindings[0])
    elif case == "outside":
        unrelated = native.diffusers.Transformer2DModel(
            num_attention_heads=2,
            attention_head_dim=4,
            in_channels=8,
            num_layers=1,
            norm_num_groups=4,
            cross_attention_dim=2048,
        ).eval()
        args["bindings"] = (*bindings, native.adapter.TransformerBinding(unrelated, 1))
    elif case == "wrong-factor":
        args["bindings"] = (
            native.adapter.TransformerBinding(bindings[0].transformer, 3),
            *bindings[1:],
        )
    else:
        args["bindings"] = list(bindings)
    _assert_refused(native, monkeypatch, _recipe(), args, ("INPUT_INVALID",), tokenize=True)


@pytest.mark.parametrize(
    "case",
    [
        "train",
        "half",
        "offload",
        "compiled",
        "custom-forward",
        "custom-call",
        "bad-processor",
        "time-conditioned-unet",
        "runtime",
    ],
)
def test_pinned_native_profile_refuses_before_encoding_without_repair(
    native: Any, monkeypatch: Any, case: str
) -> None:
    args = _arguments(native)
    encoder = native.pipeline.text_encoder
    original: Any = None
    with monkeypatch.context() as patch:
        if case == "train":
            patch.setattr(encoder, "training", True)
        elif case == "half":
            # Swap one local parameter reference; do not convert shared model storage.
            embedding = encoder.get_input_embeddings()
            patch.setattr(
                embedding,
                "weight",
                native.torch.nn.Parameter(embedding.weight.detach().half(), requires_grad=False),
            )
        elif case == "offload":
            patch.setattr(encoder, "_hf_hook", object(), raising=False)
        elif case == "compiled":

            def compiled(*_a: Any, **_k: Any) -> None:
                return None

            patch.setattr(encoder, "_compiled_call_impl", compiled, raising=False)
        elif case == "custom-forward":
            patch.setitem(encoder.__dict__, "forward", encoder.forward)
        elif case == "custom-call":
            patch.setitem(encoder.__dict__, "_call_impl", encoder._call_impl)
        elif case == "bad-processor":
            processors = importlib.import_module("diffusers.models.attention_processor")
            patch.setattr(
                _first_attention(native, native.pipeline.unet),
                "processor",
                processors.AttnProcessor(),
            )
        elif case == "time-conditioned-unet":
            # FrozenDict registration is local and is restored explicitly below.
            original = native.pipeline.unet._internal_dict
            native.pipeline.unet.register_to_config(time_cond_proj_dim=8)
        else:
            args["runtime"] = MLRuntime(
                cast(ModuleType, SimpleNamespace()), native.diffusers, native.runtime.compel
            )
        try:
            _assert_refused(
                native, patch, _recipe(), args, ("PROFILE_INVALID", "UNSUPPORTED"), tokenize=True
            )
        finally:
            if case == "time-conditioned-unet":
                native.pipeline.unet._internal_dict = original


@pytest.mark.parametrize("second", [False, True])
def test_cold_clip_capture_flag_refuses_before_tokenization_then_same_warmed_model_succeeds(
    native: Any, monkeypatch: Any, second: bool
) -> None:
    encoder = native.pipeline.text_encoder_2 if second else native.pipeline.text_encoder
    capturing_model = encoder.text_model
    actual_flag = capturing_model._output_capturing_hooks_installed
    assert actual_flag is True
    slots = _slots(encoder)
    with monkeypatch.context() as patch:
        patch.setattr(capturing_model, "_output_capturing_hooks_installed", False)
        _assert_refused(native, patch, _recipe(), _arguments(native), ("PROFILE_INVALID",))
        assert capturing_model._output_capturing_hooks_installed is False
    assert capturing_model._output_capturing_hooks_installed is actual_flag
    assert _slots(encoder) == slots
    # All tripwires are removed; the same genuinely warmed models perform a
    # normal real encoding/native forward without mocked producer outputs.
    with _observe_recipe(native, monkeypatch) as seen:
        result = _run(native, _recipe())
    assert result is seen.results[0]
    assert {width for width, _ in seen.encoder_inputs} == {768, 1280}
    assert capturing_model._output_capturing_hooks_installed is actual_flag


def test_wrong_vae_scale_and_exact_pipeline_type_refuse_without_loading(
    native: Any, monkeypatch: Any
) -> None:
    with monkeypatch.context() as patch:
        patch.setattr(native.pipeline, "vae_scale_factor", 1)
        _assert_refused(
            native, patch, _recipe(), _arguments(native), ("PROFILE_INVALID",), tokenize=True
        )

    class PipelineSubclass(type(native.pipeline)):  # pyright: ignore[reportUntypedBaseClass]
        pass

    clone = copy.copy(native.pipeline)
    clone.__class__ = PipelineSubclass
    _assert_refused(
        native,
        monkeypatch,
        _recipe(),
        _arguments(native, pipeline=clone),
        ("PROFILE_INVALID",),
        tokenize=True,
    )


@pytest.mark.parametrize("second", [False, True])
def test_preloaded_nonspecial_added_vocab_ti_refuses_before_tokenization(
    native: Any, monkeypatch: Any, second: bool
) -> None:
    field = "tokenizer_2" if second else "tokenizer"
    encoder_field = "text_encoder_2" if second else "text_encoder"
    tokenizer = copy.deepcopy(getattr(native.pipeline, field))
    encoder = copy.deepcopy(getattr(native.pipeline, encoder_field))
    # Qualify the TI-specific boundary with a compatible vocabulary/table,
    # keeping every original model/tokenizer untouched.
    assert tokenizer.add_tokens(["private_ti_fixture"]) == 1
    encoder.resize_token_embeddings(len(tokenizer), mean_resizing=False)
    assert len(tokenizer.get_vocab()) == encoder.get_input_embeddings().weight.shape[0]
    with monkeypatch.context() as patch:
        patch.setattr(native.pipeline, field, tokenizer)
        patch.setattr(native.pipeline, encoder_field, encoder)
        _assert_refused(
            native, patch, _recipe(), _arguments(native), ("PROFILE_INVALID", "UNSUPPORTED")
        )


@pytest.mark.parametrize("mode", ["grad", "cpu-autocast"])
def test_execution_mode_refuses_without_silently_repairing(
    native: Any, monkeypatch: Any, mode: str
) -> None:
    context = (
        native.torch.enable_grad()
        if mode == "grad"
        else native.torch.autocast("cpu", dtype=native.torch.bfloat16)
    )
    with context:
        _assert_refused(
            native, monkeypatch, _recipe(), _arguments(native), ("PROFILE_INVALID",), tokenize=True
        )


def test_recipe_metadata_alpha_sample_and_times_frozen_before_first_encoder_callback(
    native: Any, monkeypatch: Any
) -> None:
    recipe = _recipe(_region())
    args = _arguments(native)
    original_sample, original_step, original_times = (
        args[name].clone() for name in ("sample", "timestep", "time_ids")
    )
    expected_global = _encode(native, "cat", "blur")
    expected_local = _encode(native, "dog", "grain")
    expected = native.torch.cat(
        (
            _literal_bank(native, (expected_global, expected_local), "negative", 154),
            _literal_bank(native, (expected_global, expected_local), "positive", 154),
        )
    )
    barrier: list[bool] = []

    def mutate(_module: Any, _args: Any, _kwargs: Any) -> None:
        if barrier:
            return
        barrier.append(True)
        recipe["bbox"]["x"] = 999
        recipe["documentId"] = REVISION
        recipe["item"]["seed"] = 99
        recipe["globalPrompts"]["negative"]["text"] = "noise"
        recipe["regions"][0]["negative"]["prompt"]["text"] = "noise"
        recipe["regions"][0]["positive"]["text"] = "noise"
        recipe["regions"][0]["regionId"] = REGIONS[3]
        recipe["regions"][0]["coverage"]["alpha"] = bytes(24 * 16)
        recipe["regions"][0]["coverage"]["bounds"]["width"] = 16
        recipe["regions"].clear()
        args["sample"].fill_(9)
        args["timestep"].fill_(100)
        args["time_ids"].fill_(200)

    handle = native.pipeline.text_encoder.register_forward_pre_hook(mutate, with_kwargs=True)
    try:
        with _observe_recipe(native, monkeypatch) as seen:
            _run(native, recipe, args)
    finally:
        handle.remove()
    assert barrier == [True]
    assert native.torch.equal(seen.contexts[0], expected)
    root = seen.root_inputs[0]
    assert native.torch.equal(root["sample"], original_sample)
    assert native.torch.equal(root["timestep"], original_step)
    assert native.torch.equal(root["added_cond_kwargs"]["time_ids"], original_times)
    expected_mask = _literal_masks(native, negative_lengths=(77, 77), positive_lengths=(77, 77))
    assert native.torch.equal(_mask(native, seen.masks[0], 2, 6, 154), expected_mask)


@pytest.mark.parametrize("site", ["encoder", "native-processor"])
def test_original_failures_propagate_restore_and_release_for_fresh_recipe(
    native: Any, monkeypatch: Any, site: str
) -> None:
    failure = RuntimeError("original native failure sentinel")
    calls: list[bool] = []
    original = native.processor_type.__call__

    def processor(instance: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
        if attn is _first_attention(native, native.pipeline.unet):
            calls.append(True)
            raise failure
        return original(instance, attn, *args, **kwargs)

    def encoder_failure(_module: Any, _args: Any) -> None:
        calls.append(True)
        raise failure

    slots = _slots(native.pipeline.unet)
    with monkeypatch.context() as patch:
        handle = None
        if site == "encoder":
            handle = native.pipeline.text_encoder.register_forward_pre_hook(encoder_failure)
        else:
            patch.setattr(native.processor_type, "__call__", processor)
        try:
            with pytest.raises(RuntimeError) as error:
                _run(native, _recipe(_region()))
            assert error.value is failure
            assert calls == [True]
        finally:
            if handle is not None:
                handle.remove()
    assert _slots(native.pipeline.unet) == slots
    assert native.torch.isfinite(_run(native, _recipe(_region())).sample).all()


@pytest.mark.parametrize(
    "shared",
    [
        "pipeline",
        "tokenizer",
        "clip",
        "unet",
        "clip-submodule",
        "unet-submodule",
    ],
)
def test_reentry_and_partial_object_overlap_refuse_at_encoder_barrier_then_recover(
    native: Any, monkeypatch: Any, shared: str
) -> None:
    recipe = _recipe(_region())
    calls: list[bool] = []
    inner_args = _arguments(native)
    if shared != "pipeline":
        pipeline = copy.copy(native.pipeline)
        # Deep-copy used owners other than the intentionally shared object.
        for field in ("tokenizer", "tokenizer_2", "text_encoder", "text_encoder_2", "unet"):
            preserve = (
                (shared == "tokenizer" and field == "tokenizer")
                or (shared == "clip" and field == "text_encoder")
                or (shared == "unet" and field == "unet")
            )
            if not preserve:
                setattr(pipeline, field, copy.deepcopy(getattr(native.pipeline, field)))
        if shared == "clip-submodule":
            pipeline.text_encoder.text_model.embeddings = (
                native.pipeline.text_encoder.text_model.embeddings
            )
        elif shared == "unet-submodule":
            pipeline.unet.conv_in = native.pipeline.unet.conv_in
        inner_args["pipeline"] = pipeline
        inner_args["bindings"] = _bindings(native, pipeline.unet)

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        if calls:
            return
        calls.append(True)
        # These tripwires distinguish a reservation refusal from a later error.
        _assert_refused(
            native, monkeypatch, _recipe(), inner_args, ("SCOPE_CONFLICT",), tokenize=True
        )

    handle = native.pipeline.text_encoder.register_forward_pre_hook(before, with_kwargs=True)
    try:
        result = _run(native, recipe)
    finally:
        handle.remove()
    assert calls == [True]
    assert native.torch.isfinite(result.sample).all()
    assert native.torch.isfinite(_run(native, _recipe(), inner_args).sample).all()


def test_overlapping_old_attention_scope_refuses_before_encoding_and_leaves_outer_owner_intact(
    native: Any, monkeypatch: Any
) -> None:
    args = _arguments(native)
    plan = plan_illustrious_attention(
        latent_shape=GRID,
        negative=(EncodedSegment("current-canvas", 77, Everywhere()),),
        positive=(EncodedSegment("current-canvas", 77, Everywhere()),),
        profile="alpha8-ge128-ceil2x2-max-v1",
        layout=LAYOUTS[0],
    )
    direct = _encode(native, "cat", "blur")
    original_slots = _slots(native.pipeline.unet)
    with native.adapter.scoped_illustrious_regional_attention(
        native.pipeline.unet, bindings=args["bindings"], plan=plan
    ):
        owners = dict(native.adapter._OWNERS)
        _assert_refused(native, monkeypatch, _recipe(), args, ("SCOPE_CONFLICT",), tokenize=True)
        assert owners == native.adapter._OWNERS
        native.pipeline.unet(
            args["sample"],
            timestep=args["timestep"],
            encoder_hidden_states=native.torch.cat((direct.negative, direct.positive)),
            added_cond_kwargs={
                "text_embeds": native.torch.cat((direct.negative_pooled, direct.positive_pooled)),
                "time_ids": args["time_ids"],
            },
        )
    assert _slots(native.pipeline.unet) == original_slots
    assert native.torch.isfinite(_run(native, _recipe(), args).sample).all()


def test_cross_thread_same_pipeline_overlap_refuses_and_outer_native_call_recovers(
    native: Any, monkeypatch: Any
) -> None:
    entered, release = threading.Event(), threading.Event()
    failures: list[BaseException] = []
    results: list[Any] = []

    def barrier(_module: Any, _args: Any, _kwargs: Any) -> None:
        entered.set()
        assert release.wait(10), "Parent must release the observed encoder barrier."

    def run_outer() -> None:
        try:
            with native.torch.no_grad():
                results.append(_run(native, _recipe(_region())))
        except BaseException as error:
            failures.append(error)

    handle = native.pipeline.text_encoder.register_forward_pre_hook(barrier, with_kwargs=True)
    thread = threading.Thread(target=run_outer, daemon=True)
    thread.start()
    try:
        assert entered.wait(10), failures
        _assert_refused(
            native, monkeypatch, _recipe(), _arguments(native), ("SCOPE_CONFLICT",), tokenize=True
        )
    finally:
        release.set()
        thread.join(15)
        handle.remove()
    assert not thread.is_alive()
    assert failures == []
    assert len(results) == 1 and native.torch.isfinite(results[0].sample).all()
    assert native.torch.isfinite(_run(native, _recipe()).sample).all()


def test_disjoint_used_models_share_runtime_and_unused_vae_without_global_reservation(
    native: Any,
) -> None:
    disjoint = copy.copy(native.pipeline)
    for field in ("tokenizer", "tokenizer_2", "text_encoder", "text_encoder_2", "unet"):
        setattr(disjoint, field, copy.deepcopy(getattr(native.pipeline, field)))
    inner_args = _arguments(native, pipeline=disjoint, bindings=_bindings(native, disjoint.unet))
    calls: list[Any] = []

    def before(_module: Any, _args: Any, _kwargs: Any) -> None:
        if not calls:
            # Same actual runtime and VAE, but disjoint used model/tokenizer IDs.
            calls.append(_run(native, _recipe(), inner_args))

    handle = native.pipeline.text_encoder.register_forward_pre_hook(before, with_kwargs=True)
    try:
        outer = _run(native, _recipe())
    finally:
        handle.remove()
    assert len(calls) == 1
    assert native.torch.isfinite(outer.sample).all()
    assert native.torch.isfinite(calls[0].sample).all()


@pytest.mark.parametrize("value", [None, [], (), SimpleNamespace()])
def test_recipe_requires_exact_builtin_complete_mapping(
    native: Any, monkeypatch: Any, value: Any
) -> None:
    _assert_refused(native, monkeypatch, value, _arguments(native))


@pytest.mark.parametrize("field", ["globalPrompts", "item", "bbox", "regions"])
def test_missing_canonical_fields_refuse_without_legacy_or_partial_shape_fallback(
    native: Any, monkeypatch: Any, field: str
) -> None:
    recipe = _recipe()
    recipe.pop(field)
    _assert_refused(native, monkeypatch, recipe, _arguments(native))


def test_dict_subclass_is_not_canonical_builtin_main_recipe(native: Any, monkeypatch: Any) -> None:
    class BorrowedMapping(dict[str, Any]):
        pass

    _assert_refused(native, monkeypatch, BorrowedMapping(_recipe()), _arguments(native))


@pytest.mark.parametrize(
    "field,value", [("width", 2056), ("height", 2056), ("x", 2**31), ("y", -(2**31))]
)
def test_ordinary_bbox_private_limits_refuse_before_projection_or_encoding(
    native: Any, monkeypatch: Any, field: str, value: int
) -> None:
    recipe = _recipe()
    recipe["bbox"][field] = value
    _assert_refused(native, monkeypatch, recipe, _arguments(native), ("LIMIT",))


@pytest.mark.parametrize(
    "field,value",
    [
        ("global_negative_coverage", None),
        ("global_positive_coverage", "everywhere"),
        ("global_positive_coverage", Alpha8(Shape(3, 2), bytes(6))),
        ("global_negative_coverage", Alpha8(GRID, cast(bytes, bytearray(6)))),
        ("global_negative_coverage", Alpha8(GRID, bytes(5))),
    ],
)
def test_explicit_global_coverages_cannot_be_missing_or_wrong_shape_or_mutable(
    native: Any, monkeypatch: Any, field: str, value: Any
) -> None:
    _assert_refused(native, monkeypatch, _recipe(), _arguments(native, **{field: value}))


@pytest.mark.parametrize(
    "path,value",
    [
        (("authoredPrompts",), None),
        (("authoredPrompts", "useGlobalNegativePrompt"), 1),
        (("authoredPrompts", "positive", "text"), 17),
        (("authoredPrompts", "negative", "embeddingRefs"), None),
        (("referenceImages",), {}),
    ],
)
def test_optional_authored_and_reference_metadata_still_require_canonical_types(
    native: Any, monkeypatch: Any, path: tuple[Any, ...], value: Any
) -> None:
    region = _region()
    _set_path(region, path, value)
    _assert_refused(native, monkeypatch, _recipe(region), _arguments(native))


def test_oversized_borrowed_sample_view_refuses_before_finite_allocation_or_encoding(
    native: Any, monkeypatch: Any
) -> None:
    # Logical size 128MiB, actual storage one float. The ordinary bbox admits
    # <=62,500 latent cells, so a conforming sample cannot reach the old 32MiB cap.
    sample = native.torch.zeros(1).expand(2, 4, 2048, 2048)
    assert sample.numel() * sample.element_size() > 32 * 1024 * 1024

    def no_finite(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Malformed oversized views must refuse before finite scratch.")

    with monkeypatch.context() as patch:
        patch.setattr(native.torch, "isfinite", no_finite)
        _assert_refused(
            native,
            patch,
            _recipe(),
            _arguments(native, sample=sample),
            ("INPUT_INVALID", "LIMIT"),
            tokenize=True,
        )


def test_expanded_mask_budget_native_validator_precedes_first_encoder(
    native: Any, monkeypatch: Any
) -> None:
    # The real budget is B*heads*Q*K. Large geometry and 308 rows exceed
    # the existing adapter's private expanded-mask limit without encoding.
    bbox = {"x": -13, "y": 19, "width": 2048, "height": 1952}
    long_text = " ".join(["cat"] * 76)
    recipe = _recipe(positive=long_text)
    recipe["bbox"] = bbox
    sample = native.torch.zeros(2, 4, 244, 256)
    args = _arguments(native, parameters=_parameters(positive=long_text), sample=sample)
    _assert_refused(native, monkeypatch, recipe, args, ("LIMIT",), tokenize=True)


def test_preloaded_adapter_is_refused_before_tokenization(native: Any, monkeypatch: Any) -> None:
    with monkeypatch.context() as patch:
        patch.setattr(native.pipeline.text_encoder, "_hf_peft_config_loaded", True, raising=False)
        _assert_refused(native, patch, _recipe(), _arguments(native), ("UNSUPPORTED",))


@pytest.mark.parametrize("stage", ["semantic", "parser-budget", "profile"])
def test_failed_preflight_releases_private_reservation_for_fresh_recipe(
    native: Any, monkeypatch: Any, stage: str
) -> None:
    if stage == "semantic":
        recipe = _recipe(_region())
        recipe["regions"][-1]["negative"]["prompt"]["text"] = 13
        _assert_refused(native, monkeypatch, recipe, _arguments(native))
    elif stage == "parser-budget":
        text = " ".join(["cat"] * 101)
        _assert_refused(
            native,
            monkeypatch,
            _recipe(_region(negative=text)),
            _arguments(native),
            ("LIMIT", "GENERATION_PROMPT_UNSUPPORTED"),
            tokenize=True,
        )
    else:
        with monkeypatch.context() as patch:
            patch.setattr(native.pipeline.text_encoder, "training", True)
            _assert_refused(
                native, patch, _recipe(), _arguments(native), ("PROFILE_INVALID",), tokenize=True
            )
    assert native.torch.isfinite(_run(native, _recipe(_region())).sample).all()


@pytest.mark.parametrize("layout", LAYOUTS)
def test_present_empty_regional_channels_are_valid_explicit_zero_pool_sources(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    args = _arguments(
        native,
        layout=layout,
        negative_pooled_source_id=REGIONS[0],
        positive_pooled_source_id=REGIONS[0],
    )
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, _recipe(_region(positive="", negative="")), args)
    pool = seen.root_inputs[0]["added_cond_kwargs"]["text_embeds"]
    assert pool.shape == (2 if layout == LAYOUTS[0] else 1, 1280)
    assert native.torch.count_nonzero(pool) == 0
    for sign in ("positive", "negative"):
        _assert_ranges(seen.plans[0], sign, (("current-canvas", 0, 77), (REGIONS[0], 77, 154)))


@pytest.mark.parametrize("layout", LAYOUTS)
def test_two_distinct_regions_keep_recipe_order_without_sorting_or_text_merging(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    first = _region(2, positive="dog", negative="grain")
    second = _region(0, positive="fox", negative="noise")
    complement = tuple(not visible for visible in LOCAL_VISIBLE)
    second["coverage"] = _coverage(bytes(255 if yes else 0 for yes in complement))
    global_stream = _encode(native, "cat", "blur")
    stream_one = _encode(native, "dog", "grain")
    stream_two = _encode(native, "fox", "noise")
    negative = _literal_bank(native, (global_stream, stream_one, stream_two), "negative", 231)
    positive = _literal_bank(native, (global_stream, stream_one, stream_two), "positive", 231)
    expected = native.torch.cat((negative, positive)) if layout == LAYOUTS[0] else positive
    with _observe_recipe(native, monkeypatch) as seen:
        _run(native, _recipe(first, second), _arguments(native, layout=layout))
    assert native.torch.equal(seen.contexts[0], expected)
    for sign in ("negative", "positive"):
        _assert_ranges(
            seen.plans[0],
            sign,
            (("current-canvas", 0, 77), (REGIONS[2], 77, 154), (REGIONS[0], 154, 231)),
        )
    assert [text for text, width, _ in seen.clips if width == 768] == [
        "cat",
        "blur",
        "dog",
        "grain",
        "fox",
        "noise",
    ]
    expected_mask = _literal_masks(
        native,
        negative_lengths=(77, 77, 77),
        positive_lengths=(77, 77, 77),
        visibility=(LOCAL_VISIBLE, complement),
        layout=layout,
    )
    assert native.torch.equal(_mask(native, seen.masks[0], len(expected), 6, 231), expected_mask)


@pytest.mark.parametrize("layout", LAYOUTS)
def test_empty_global_channels_keep_77_zero_rows_pools_and_native_result(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    args = _arguments(
        native,
        layout=layout,
        parameters=_parameters("", "", cfg_scale=5.0 if layout == LAYOUTS[0] else 1.0),
    )
    with _observe_recipe(native, monkeypatch) as seen:
        result = _run(native, _recipe(positive="", negative=""), args)
    assert result is seen.results[0]
    assert seen.encoder_inputs == []
    assert seen.contexts[0].shape == (2 if layout == LAYOUTS[0] else 1, 77, 2048)
    assert native.torch.count_nonzero(seen.contexts[0]) == 0
    assert native.torch.count_nonzero(seen.root_inputs[0]["added_cond_kwargs"]["text_embeds"]) == 0
    assert _mask(native, seen.masks[0], len(seen.contexts[0]), 6, 77).all()


@contextmanager
def _spy_original_clip_forward(monkeypatch: Any, target: Any) -> Generator[list[tuple[Any, Any]]]:
    """Count the actual body after prehooks; delegate its exact original result.

    A late prehook cannot prove the body was prevented: an earlier rejection
    could also suppress that observer. This class-level forward spy leaves
    native call-entry slots and instance dictionaries untouched and preserves
    the real signature, original implementation and original returned object.
    """
    target_type = cast(Any, type(target))
    original = target_type.forward
    calls: list[tuple[Any, Any]] = []

    @wraps(original)
    def observe(module: Any, *args: Any, **kwargs: Any) -> Any:
        if module is target:
            calls.append((args, kwargs))
        return original(module, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(target_type, "forward", observe)
        yield calls


def _exercise_existing_clip_value_hook(
    native: Any,
    monkeypatch: Any,
    *,
    second: bool,
    site: str,
    field: str,
    mode: str,
    post: bool = False,
) -> None:
    """Intervene only through one existing local hook, using real native args.

    New tensors replace declared values; no borrowed tensor changes in place.
    Both models remain warmed, float32 and eval. The unchanged producer and
    normal native consumer provide the baseline and post-removal recovery.
    """
    torch = native.torch
    encoder = native.pipeline.text_encoder_2 if second else native.pipeline.text_encoder
    target = {
        "encoder-root": encoder,
        "text-model": encoder.text_model,
        "encoder-layer": encoder.text_model.encoder.layers[0],
    }[site]
    signature = inspect.signature(cast(Any, type(target)).forward)
    roots = (native.pipeline.text_encoder, native.pipeline.text_encoder_2, native.pipeline.unet)
    original_slots = tuple(_slots(root) for root in roots)
    owners = dict(native.adapter._OWNERS)
    recipe, args = _recipe(_region()), _arguments(native)
    with _observe(native, native.pipeline.unet, monkeypatch) as baseline:
        original_result = _run(native, recipe, args)
    expected_sample = original_result.sample.detach().clone()
    assert tuple(_slots(root) for root in roots) == original_slots
    borrowed: list[tuple[Any, Any, int]] = []
    replacements: list[tuple[Any, Any]] = []

    def replacement(value: Any) -> Any:
        if value is None:
            # CLIP-G's separate pooled forward can have no attention mask.
            # The first actual conditioning forward has a real [1,77] mask.
            assert field == "attention_mask" and mode != "replace"
            replacements.append((None, None))
            return None
        assert type(value) is torch.Tensor
        assert value.device.type == "cpu" and not value.requires_grad
        assert bool(torch.isfinite(value).all())
        if field in ("input_ids", "attention_mask"):
            assert tuple(value.shape) == (1, 77)
        else:
            assert tuple(value.shape) == (1, 77, encoder.config.hidden_size)
        borrowed.append((value, value.detach().clone(), value.untyped_storage().data_ptr()))
        if mode == "observe":
            replacements.append((value.detach().clone(), None))
            return None
        result = value.clone()
        assert result.untyped_storage().data_ptr() != value.untyped_storage().data_ptr()
        if mode == "replace":
            if field == "input_ids":
                # Change one lexical token, keeping BOS/EOS, shape, dtype and
                # every ID inside this exact encoder's existing embedding table.
                result[0, 1] = 2 if int(value[0, 1]) != 2 else 3
                assert bool((result >= 0).all())
                assert bool((result < encoder.config.vocab_size).all())
            elif field == "attention_mask":
                assert bool(((value == 0) | (value == 1)).all())
                result[0, 1] = 1 - value[0, 1]
                assert bool(((result == 0) | (result == 1)).all())
                assert bool(result.any())
            else:
                result = result + 0.125
            assert not torch.equal(result, value)
        else:
            assert mode == "clone"
            assert torch.equal(result, value)
        assert result.shape == value.shape and result.dtype == value.dtype
        assert bool(torch.isfinite(result).all())
        replacements.append((value.detach().clone(), result.detach().clone()))
        return result

    def before(module: Any, actual_args: Any, actual_kwargs: Any) -> Any:
        bound = signature.bind_partial(module, *actual_args, **actual_kwargs)
        assert field in bound.arguments
        updated = replacement(bound.arguments[field])
        if updated is None:
            return None
        bound.arguments[field] = updated
        return bound.args[1:], bound.kwargs

    def after(_module: Any, _args: Any, _kwargs: Any, output: Any) -> Any:
        # Pinned CLIPEncoderLayer.forward returns its native hidden-state Tensor.
        # The real body and native output-capturing hooks run before this hook.
        return replacement(output)

    hook = after if post else before
    handle = (
        target.register_forward_hook(hook, with_kwargs=True)
        if post
        else target.register_forward_pre_hook(hook, with_kwargs=True)
    )
    installed_slots = tuple(_slots(root) for root in roots)
    try:
        with ExitStack() as stack:
            affected_calls = stack.enter_context(_spy_original_clip_forward(monkeypatch, target))
            downstream_calls: list[tuple[Any, Any]] = []
            if site == "encoder-layer":
                downstream_calls = stack.enter_context(
                    _spy_original_clip_forward(monkeypatch, encoder.text_model.encoder.layers[1])
                )
            with _observe(native, native.pipeline.unet, monkeypatch) as seen:
                if mode == "replace":
                    with pytest.raises(native.recipe.IllustriousRegionalRecipeError) as error:
                        _run(native, recipe, args)
                    assert error.value.code == "INPUT_INVALID"
                    assert len(replacements) == 1
                    # Prehook rejection precedes the affected original body.
                    # Posthook rejection follows that body, before layer two.
                    assert len(affected_calls) == (1 if post else 0)
                    assert downstream_calls == []
                    assert seen.contexts == seen.outputs == seen.results == []
                else:
                    result = _run(native, recipe, args)
                    assert result is seen.results[0]
                    assert torch.equal(result.sample, expected_sample)
                    assert bool(torch.isfinite(result.sample).all())
                    assert affected_calls and len(affected_calls) == len(replacements)
                    if site == "encoder-layer":
                        assert downstream_calls
                    assert torch.equal(seen.contexts[0], baseline.contexts[0])
                    assert torch.equal(seen.masks[0], baseline.masks[0])
                    assert torch.equal(seen.outputs[0], baseline.outputs[0])
                    assert torch.equal(
                        seen.root_inputs[0]["added_cond_kwargs"]["text_embeds"],
                        baseline.root_inputs[0]["added_cond_kwargs"]["text_embeds"],
                    )
        # Inspect restoration with our exact original hook still registered.
        assert tuple(_slots(root) for root in roots) == installed_slots
        registry = target._forward_hooks if post else target._forward_pre_hooks
        assert registry[handle.id] is hook
        assert owners == native.adapter._OWNERS
        for value, snapshot, pointer in borrowed:
            assert torch.equal(value, snapshot)
            assert value.untyped_storage().data_ptr() == pointer
    finally:
        handle.remove()
    assert tuple(_slots(root) for root in roots) == original_slots
    recovered = _run(native, recipe, args)
    assert torch.equal(recovered.sample, expected_sample)
    assert tuple(_slots(root) for root in roots) == original_slots
    assert owners == native.adapter._OWNERS


@pytest.mark.parametrize("second", [False, True])
@pytest.mark.parametrize("site", ["encoder-root", "text-model"])
@pytest.mark.parametrize("field", ["input_ids", "attention_mask"])
def test_clip_input_hook_replacement_mutation_red(
    native: Any, monkeypatch: Any, second: bool, site: str, field: str
) -> None:
    """Pinned RED: valid same-shaped hook replacements cannot retarget encoding."""
    _exercise_existing_clip_value_hook(
        native, monkeypatch, second=second, site=site, field=field, mode="replace"
    )


@pytest.mark.parametrize("second", [False, True])
@pytest.mark.parametrize("site", ["encoder-root", "text-model"])
@pytest.mark.parametrize("field", ["input_ids", "attention_mask"])
@pytest.mark.parametrize("mode", ["clone", "observe"])
def test_clip_input_hook_equal_clone_or_observer_control_green(
    native: Any, monkeypatch: Any, second: bool, site: str, field: str, mode: str
) -> None:
    """Value-equal new storage and None observers retain the real native result."""
    _exercise_existing_clip_value_hook(
        native, monkeypatch, second=second, site=site, field=field, mode=mode
    )


@pytest.mark.parametrize("second", [False, True])
@pytest.mark.parametrize("post", [False, True])
def test_clip_layer_hook_finite_replacement_refused_before_downstream_native_consumer(
    native: Any, monkeypatch: Any, second: bool, post: bool
) -> None:
    _exercise_existing_clip_value_hook(
        native,
        monkeypatch,
        second=second,
        site="encoder-layer",
        field="output" if post else "hidden_states",
        mode="replace",
        post=post,
    )


@pytest.mark.parametrize("second", [False, True])
@pytest.mark.parametrize("post", [False, True])
@pytest.mark.parametrize("mode", ["clone", "observe"])
def test_clip_layer_hook_equal_clone_or_observer_preserves_original_native_output(
    native: Any, monkeypatch: Any, second: bool, post: bool, mode: str
) -> None:
    _exercise_existing_clip_value_hook(
        native,
        monkeypatch,
        second=second,
        site="encoder-layer",
        field="output" if post else "hidden_states",
        mode=mode,
        post=post,
    )


@pytest.mark.parametrize("post", [False, True])
def test_global_clip_hooks_refuse_before_original_encoder_and_restore_then_recover(
    native: Any, monkeypatch: Any, post: bool
) -> None:
    hooks = importlib.import_module("torch.nn.modules.module")
    observed: list[Any] = []
    encoder = native.pipeline.text_encoder
    roots = (encoder, native.pipeline.text_encoder_2, native.pipeline.unet)
    slots = tuple(_slots(root) for root in roots)

    def observer(module: Any, *_args: Any) -> None:
        if module is encoder:
            observed.append(module)

    handle = (
        hooks.register_module_forward_hook(observer)
        if post
        else hooks.register_module_forward_pre_hook(observer)
    )
    registry = hooks._global_forward_hooks if post else hooks._global_forward_pre_hooks
    installed = tuple(registry.items())
    try:
        with _spy_original_clip_forward(monkeypatch, encoder) as body_calls:
            with pytest.raises(native.recipe.IllustriousRegionalRecipeError) as error:
                _run(native, _recipe())
            assert error.value.code == "PROFILE_INVALID"
            assert body_calls == observed == []
        assert tuple(registry.items()) == installed
        assert registry[handle.id] is observer
        assert tuple(_slots(root) for root in roots) == slots
    finally:
        handle.remove()
    assert tuple(_slots(root) for root in roots) == slots
    assert native.torch.isfinite(_run(native, _recipe()).sample).all()
    assert tuple(_slots(root) for root in roots) == slots


def test_partial_clip_hook_guard_constructor_failure_restores_installed_observer_and_recovers(
    native: Any, monkeypatch: Any
) -> None:
    """A real first guard is installed before the second constructor fails."""

    class InjectedFailure(RuntimeError):
        pass

    failure = InjectedFailure("second CLIP hook guard constructor failed")
    first, second = native.pipeline.text_encoder, native.pipeline.text_encoder_2
    roots = (first, second, native.pipeline.unet)
    original_slots = tuple(_slots(root) for root in roots)
    original_forwards = tuple(cast(Any, type(encoder)).forward for encoder in (first, second))
    owners = dict(native.adapter._OWNERS)
    reservations = dict(native.recipe._RESERVATIONS)
    recipe, args = _recipe(_region()), _arguments(native)
    original_factory = native.recipe._clip_hook_guard
    observed: list[Any] = []
    constructed: list[Any] = []
    factory_calls: list[tuple[Any, Any]] = []

    def observer(module: Any, _args: Any, _kwargs: Any) -> None:
        observed.append(module)

    handle = first.register_forward_pre_hook(observer, with_kwargs=True)
    try:
        installed_slots = tuple(_slots(root) for root in roots)

        def failing_factory(*factory_args: Any, **factory_kwargs: Any) -> Any:
            factory_calls.append((factory_args, factory_kwargs))
            if len(factory_calls) == 1:
                assert factory_args[0] is observer
                guard = original_factory(*factory_args, **factory_kwargs)
                assert guard is not observer
                constructed.append(guard)
                return guard
            # The registry holds the actual wrapper returned by the unchanged
            # first constructor, proving partial installation before failure.
            assert first._forward_pre_hooks[handle.id] is constructed[0]
            assert first._forward_pre_hooks[handle.id] is not observer
            assert len(factory_calls) == 2
            raise failure

        with monkeypatch.context() as patch:
            patch.setattr(native.recipe, "_clip_hook_guard", failing_factory)
            with (
                _spy_original_clip_forward(patch, first) as first_calls,
                _spy_original_clip_forward(patch, second) as second_calls,
                _observe(native, native.pipeline.unet, patch) as seen,
            ):
                with pytest.raises(InjectedFailure) as error:
                    _run(native, recipe, args)
                assert error.value is failure
                assert len(factory_calls) == 2 and len(constructed) == 1
                assert first_calls == second_calls == observed == []
                assert seen.contexts == seen.queries == seen.masks == seen.outputs == []
                assert seen.root_inputs == seen.results == seen.plans == []
            # The test observer is still installed. Compare identities, kwargs
            # flags and all native slots before allowing its handle to remove it.
            assert tuple(_slots(root) for root in roots) == installed_slots
            assert first._forward_pre_hooks[handle.id] is observer
            assert owners == native.adapter._OWNERS
            assert reservations == native.recipe._RESERVATIONS
        assert tuple(cast(Any, type(encoder)).forward for encoder in (first, second)) == (
            original_forwards
        )
        assert native.recipe._clip_hook_guard is original_factory
    finally:
        handle.remove()
    assert tuple(_slots(root) for root in roots) == original_slots
    with _observe(native, native.pipeline.unet, monkeypatch) as recovered:
        result = _run(native, recipe, args)
    assert result is recovered.results[0]
    assert len(recovered.contexts) == len(recovered.outputs) == 1
    assert native.torch.isfinite(result.sample).all()
    assert tuple(_slots(root) for root in roots) == original_slots
    assert owners == native.adapter._OWNERS
    assert reservations == native.recipe._RESERVATIONS
