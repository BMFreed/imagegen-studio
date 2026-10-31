"""Opt-in Invoke operator-source differential checks on one shared runtime.

IGS_INVOKE_REFERENCE_ROOT and IGS_INVOKE_REFERENCE_SHA256 select ROOT's immutable
source snapshot. No Invoke application/environment is imported or installed.
CPU float32 and cuda:0 float16 use the real native modules and original Invoke
functions, with no model downloads. Source equality does not establish trained
quality, public readiness or parity with an installed Invoke 0.41 environment.

Intentional differences remain explicit: Canvas alpha>0 versus our >=128,
omitted versus retained empty regional negatives, finite bias versus hard block,
and strict all-masked/grid refusals. No production default is changed here.
"""

from __future__ import annotations

import importlib
import os
import sys
from collections.abc import Generator
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

import test_illustrious_regional_attention_adapter as _fixture_helpers
from imagegen_worker.illustrious_regional_attention import (
    Alpha8,
    EncodedSegment,
    Everywhere,
    IllustriousRegionalAttentionError,
    Shape,
    plan_illustrious_attention,
)
from imagegen_worker.illustrious_regional_geometry import ordinary_canvas_coverage_to_latent
from invoke_operator_reference import MODULE_PREFIX, SourceReferenceError, load_reference

legacy: Any = cast(Any, _fixture_helpers)
PROFILE = "alpha8-ge128-ceil2x2-max-v1"


@pytest.fixture(scope="module", params=("cpu-float32", "cuda-float16"))
def native(request: Any) -> Generator[Any, None, None]:
    root = os.environ.get("IGS_INVOKE_REFERENCE_ROOT")
    if root is None:
        pytest.skip("ROOT opt-in: IGS_INVOKE_REFERENCE_ROOT=<pinned source snapshot>")
    pin = os.environ.get("IGS_INVOKE_REFERENCE_SHA256", "")
    torch: Any = pytest.importorskip("torch")
    diffusers: Any = pytest.importorskip("diffusers")
    assert torch.__version__.split("+", 1)[0] == "2.7.1"
    assert diffusers.__version__ == "0.40.0"
    cuda = request.param == "cuda-float16"
    if cuda and not torch.cuda.is_available():
        pytest.skip("optional source differential CUDA lane unavailable")
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        with (
            torch.random.fork_rng(devices=[0] if cuda else []),
            torch.no_grad(),
            load_reference(torch, diffusers, Path(root), pin) as reference,
        ):
            torch.manual_seed(311026)
            processors: Any = importlib.import_module("diffusers.models.attention_processor")
            yield SimpleNamespace(
                torch=torch,
                diffusers=diffusers,
                reference=reference,
                reference_root=Path(root),
                reference_pin=pin,
                adapter=cast(
                    Any,
                    importlib.import_module(
                        "imagegen_worker.illustrious_regional_attention_adapter"
                    ),
                ),
                bridge=cast(
                    Any,
                    importlib.import_module("imagegen_worker.illustrious_regional_conditioning"),
                ),
                processor_type=processors.AttnProcessor2_0,
                device=torch.device("cuda:0" if cuda else "cpu"),
                dtype=torch.float16 if cuda else torch.float32,
                tensor_profile="cuda-float16-v1" if cuda else "cpu-float32-v1",
            )
    finally:
        torch.set_num_threads(previous_threads)


def _tensor(native: Any, values: Any) -> Any:
    return native.torch.tensor(values, device=native.device, dtype=native.dtype)


def _alpha(mask: Any, grid: Shape) -> Alpha8:
    # This is our declared binary input, not an alternative Invoke threshold.
    return Alpha8(grid, bytes(255 if bool(value) else 0 for value in mask.reshape(-1).tolist()))


def _masks(native: Any, grid: Shape, *, overlap: bool = False) -> tuple[Any, Any]:
    torch = native.torch
    x = torch.arange(grid.width).repeat(grid.height)
    left = (x < grid.width // 2 + int(overlap)).reshape(grid.height, grid.width)
    right = (x >= grid.width // 2 - int(overlap)).reshape(grid.height, grid.width)
    return left, right


def _reference_data(
    native: Any,
    grid: Shape,
    negative: list[Any],
    positive: list[Any],
    negative_masks: list[Any],
    positive_masks: list[Any],
) -> Any:
    """Call original concat, sign padding and regional-kwargs construction."""
    ref, torch = native.reference, native.torch
    times = _tensor(native, [[1024, 1024, 0, 0, 1024, 1024]])

    def conditionings(values: list[Any], sign: int) -> list[Any]:
        return [
            ref.SDXLConditioningInfo(
                embeds=value,
                pooled_embeds=torch.full(
                    (1, 1280), sign * 10 + index, device=native.device, dtype=native.dtype
                ),
                add_time_ids=times.clone(),
            )
            for index, value in enumerate(values)
        ]

    signs: list[Any] = []
    for values, masks, sign in (
        (negative, negative_masks, -1),
        (positive, positive_masks, 1),
    ):
        assert len(values) == len(masks)
        rows = conditionings(values, sign)
        combined, regions = ref.DenoiseLatentsInvocation._concat_regional_text_embeddings(
            rows,
            [None if mask is None else mask.clone() for mask in masks],
            grid.height,
            grid.width,
            native.dtype,
        )
        signs.append((combined, regions, rows))
    data = ref.TextConditioningData(
        signs[0][0], signs[1][0], signs[0][1], signs[1][1], guidance_scale=5.0
    )
    kwargs = ref.UNetKwargs(
        sample=torch.zeros(
            (2, 4, grid.height, grid.width), device=native.device, dtype=native.dtype
        ),
        timestep=0,
        encoder_hidden_states=torch.empty((2, 1, 8), device=native.device, dtype=native.dtype),
    )
    data.to_unet_kwargs(kwargs, ref.ConditioningMode.Both)
    # This common padding transport is the native UNet's binary->bias convention.
    padding = kwargs.encoder_attention_mask
    prior = None if padding is None else (1 - padding).unsqueeze(1) * -10000.0
    regional: Any = cast(dict[str, Any], kwargs.cross_attention_kwargs or {}).get(
        "regional_prompt_data"
    )
    return SimpleNamespace(
        kwargs=kwargs,
        context=kwargs.encoder_hidden_states,
        prior=prior,
        regional=regional,
        sign_rows=signs,
    )


def _plan(
    grid: Shape,
    negative: list[Any],
    positive: list[Any],
    negative_masks: list[Any],
    positive_masks: list[Any],
) -> Any:
    def segments(values: list[Any], masks: list[Any], prefix: str) -> tuple[EncodedSegment, ...]:
        return tuple(
            EncodedSegment(
                f"{prefix}{index}",
                value.shape[1],
                Everywhere() if mask is None else _alpha(mask, grid),
            )
            for index, (value, mask) in enumerate(zip(values, masks, strict=True))
        )

    return plan_illustrious_attention(
        latent_shape=grid,
        negative=segments(negative, negative_masks, "negative-"),
        positive=segments(positive, positive_masks, "positive-"),
        profile=PROFILE,
        layout="cfg-negative-first",
    )


def _graph(native: Any, kind: str) -> Any:
    torch = native.torch
    grid = Shape(9, 13) if kind == "odd" else Shape(3, 5)
    left, right = _masks(native, grid, overlap=kind == "overlap")
    if kind == "global":
        positive = [_tensor(native, [[[0.7, -0.4, 0.3, 0.2, -0.1, 0.9, 0.5, -0.6]]])]
        masks: list[Any] = [None]
    else:
        positive = [
            _tensor(native, [[[0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8]]]),
            _tensor(native, [[[1.0, 0.4, -0.3, 0.2, 0.9, 0.5, -0.1, 0.6]]]),
            _tensor(native, [[[-0.8, -0.6, 0.9, -0.7, -0.4, 0.1, 0.3, -0.9]]]),
        ]
        if kind == "unequal":
            positive[1] = torch.cat((positive[1], positive[1] * 0.35), dim=1)
        masks = [None, left, right]
    negative = [_tensor(native, [[[-0.4, 0.2, 0.8, 0.1, -0.7, 0.5, -0.3, 0.6]]])]
    source = _reference_data(native, grid, negative, positive, [None], masks)
    plan = _plan(grid, negative, positive, [None], masks)
    return SimpleNamespace(grid=grid, source=source, plan=plan)


def _our_call(native: Any, model: Any, graph: Any, *, factor: int = 1, queries: Any = None) -> Any:
    """Invoke actual wrapped attention after the actual parent's geometry prehook."""
    torch = native.torch
    height = (graph.grid.height + factor - 1) // factor
    width = (graph.grid.width + factor - 1) // factor
    count = height * width
    if queries is None:
        queries = torch.linspace(-0.8, 1.1, 2 * count * 8, device=native.device, dtype=native.dtype)
        queries = queries.reshape(2, count, 8)
    hidden = torch.zeros((2, 8, height, width), device=native.device, dtype=native.dtype)
    attention = model.transformer_blocks[0].attn2
    outputs: list[Any] = []
    before = legacy._snapshot(model)

    def drive(_module: Any, _args: Any, _kwargs: Any) -> None:
        outputs.append(
            attention(
                queries,
                encoder_hidden_states=graph.source.context,
                attention_mask=graph.source.prior,
            )
        )

    try:
        with native.adapter.scoped_illustrious_regional_attention(
            model,
            bindings=(native.adapter.TransformerBinding(model, factor),),
            plan=graph.plan,
            tensor_profile=native.tensor_profile,
        ):
            handle = model.register_forward_pre_hook(drive, with_kwargs=True)
            try:
                model(hidden, encoder_hidden_states=graph.source.context)
            finally:
                handle.remove()
    finally:
        legacy._assert_restored(model, before)
    assert len(outputs) == 1
    return queries, outputs[0]


def _model(native: Any) -> Any:
    return legacy._transformer(native).to(device=native.device, dtype=native.dtype)


def _source_call(native: Any, model: Any, graph: Any, queries: Any) -> Any:
    attention = model.transformer_blocks[0].attn2
    return native.reference.CustomAttnProcessor2_0()(
        attention,
        queries,
        encoder_hidden_states=graph.source.context,
        attention_mask=graph.source.prior,
        regional_prompt_data=graph.source.regional,
        percent_through=0.0,
    )


def _assert_close(native: Any, actual: Any, expected: Any) -> None:
    torch = native.torch
    assert torch.isfinite(actual).all() and torch.isfinite(expected).all()
    epsilon = torch.finfo(native.dtype).eps
    torch.testing.assert_close(actual, expected, atol=8 * epsilon, rtol=8 * epsilon)


def _reference_permissions(native: Any, graph: Any, factor: int) -> Any:
    torch = native.torch
    height = (graph.grid.height + factor - 1) // factor
    width = (graph.grid.width + factor - 1) // factor
    keys = graph.source.context.shape[1]
    bias = (
        torch.zeros((2, height * width, keys), device=native.device, dtype=native.dtype)
        if graph.source.regional is None
        else graph.source.regional.get_cross_attn_mask(height * width, keys)
    )
    if graph.source.prior is not None:
        bias = bias + graph.source.prior
    return bias.eq(0)


def test_reference_loader_pins_and_restores_owned_namespace(native: Any) -> None:
    slots = {name for name in sys.modules if name.startswith(MODULE_PREFIX)}
    with load_reference(
        native.torch, native.diffusers, native.reference_root, native.reference_pin
    ) as second:
        assert second.module_name not in slots
        assert second.CustomAttnProcessor2_0 is not native.reference.CustomAttnProcessor2_0
        assert second.source_definitions == native.reference.source_definitions
        marker = native.torch.ones((2, 1, 8), device=native.device, dtype=native.dtype)
        attention = _model(native).transformer_blocks[0].attn2
        unchanged = second.IPAdapterExt.run_adapters(
            second.CustomAttnProcessor2_0(),
            attention,
            marker.view(2, 2, 1, 4),
            marker,
            marker,
            None,
        )
        assert unchanged is marker
    assert {name for name in sys.modules if name.startswith(MODULE_PREFIX)} == slots
    with (
        pytest.raises(SourceReferenceError, match="manifest SHA256 mismatch"),
        load_reference(native.torch, native.diffusers, native.reference_root, "0" * 64),
    ):
        raise AssertionError("a wrong pin reached source execution")
    assert {name for name in sys.modules if name.startswith(MODULE_PREFIX)} == slots


@pytest.mark.parametrize("kind", ("halves", "overlap", "odd", "unequal"))
def test_source_attention_matches_native_spatial_consumer(native: Any, kind: str) -> None:
    graph, model = _graph(native, kind), _model(native)
    for factor in (1, 2, 4, 8):
        shape = Shape(
            (graph.grid.height + factor - 1) // factor,
            (graph.grid.width + factor - 1) // factor,
        )
        actual_permissions = native.adapter._combined_mask(
            native.torch, graph.plan, factor, shape, 2, graph.source.prior, native.tensor_profile
        ).reshape(2, 2, shape.height * shape.width, graph.plan.key_length)
        reference_permissions = _reference_permissions(native, graph, factor)
        assert native.torch.equal(actual_permissions[:, 0], reference_permissions)
        assert native.torch.equal(actual_permissions[:, 1], reference_permissions)
        queries, actual = _our_call(native, model, graph, factor=factor)
        expected = _source_call(native, model, graph, queries)
        _assert_close(native, actual, expected)


def test_canvas_low_alpha_is_an_explicit_contract_difference(native: Any) -> None:
    torch = native.torch
    image_module: Any = importlib.import_module("PIL.Image")
    image = image_module.frombytes(
        "RGBA",
        (5, 1),
        bytes(channel for alpha in (0, 1, 127, 128, 255) for channel in (255, 255, 255, alpha)),
    )
    before = image.tobytes()
    mask = native.reference.canvas_mask(image)
    inverse = native.reference.canvas_mask(image, invert=True)
    assert mask.dtype == torch.bool and mask.tolist() == [[[False, True, True, True, True]]]
    assert torch.equal(inverse, ~mask) and image.tobytes() == before
    grid = Shape(1, 5)
    plan = plan_illustrious_attention(
        latent_shape=grid,
        negative=(EncodedSegment("negative", 1, Everywhere()),),
        positive=(
            EncodedSegment("global", 1, Everywhere()),
            EncodedSegment("local", 1, Alpha8(grid, bytes((0, 1, 127, 128, 255)))),
        ),
        profile=PROFILE,
        layout="cfg-negative-first",
    )
    ours = native.adapter._combined_mask(
        torch, plan, 1, grid, 1, None, native.tensor_profile
    ).reshape(2, 1, 5, 2)
    assert ours[1, 0, :, 1].tolist() == [False, False, False, True, True]
    assert mask[0, 0].tolist() != ours[1, 0, :, 1].tolist()


@pytest.mark.parametrize("pattern", ("off-grid", "sparse"))
def test_opaque_canvas_nearest8_and_ceil_pyramids_match(native: Any, pattern: str) -> None:
    torch = native.torch
    image_module: Any = importlib.import_module("PIL.Image")
    height, width = 72, 104
    alpha = bytes(
        255 if ((x >= 17 and y >= 9) if pattern == "off-grid" else ((x + 3 * y) % 37 == 0)) else 0
        for y in range(height)
        for x in range(width)
    )
    rgba = bytes(channel for value in alpha for channel in (255, 255, 255, value))
    image = image_module.frombytes("RGBA", (width, height), rgba)
    source_mask = native.reference.canvas_mask(image)
    latent = native.reference.DenoiseLatentsInvocation._preprocess_regional_prompt_mask(
        source_mask.clone(), 9, 13, native.dtype
    )
    bbox: Any = {"x": -13, "y": 5, "width": width, "height": height}
    ours = ordinary_canvas_coverage_to_latent(
        alpha=alpha,
        coverage_bounds=bbox,
        bbox=bbox,
        latent_shape=Shape(9, 13),
        profile="ordinary-canvas-origin-nearest8-v1",
    )
    assert latent.flatten().bool().tolist() == [value >= 128 for value in ours.samples]
    regions = native.reference.TextConditioningRegions(
        masks=latent,
        ranges=[native.reference.Range(0, 1)],
    )
    source = native.reference.RegionalPromptData([regions], native.device, native.dtype)
    plan = plan_illustrious_attention(
        latent_shape=Shape(9, 13),
        negative=(EncodedSegment("negative", 1, Everywhere()),),
        positive=(EncodedSegment("positive", 1, ours),),
        profile=PROFILE,
        layout="cfg-negative-first",
    )
    for factor in (1, 2, 4, 8):
        shape = Shape((9 + factor - 1) // factor, (13 + factor - 1) // factor)
        expected = source.get_cross_attn_mask(shape.height * shape.width, 1).eq(0)
        query = plan.query(factor=factor, shape=shape, key_length=1)
        observed = torch.tensor(
            [
                bool(query.allowed_ranges(batch_index=1, query_index=index))
                for index in range(shape.height * shape.width)
            ],
            dtype=torch.bool,
            device=native.device,
        )
        assert torch.equal(expected[0, :, 0], observed)


@pytest.mark.parametrize("unmasked", ((0,), (0, 2)))
def test_source_pool_order_padding_and_owned_assembly(
    native: Any, unmasked: tuple[int, ...]
) -> None:
    torch, bridge = native.torch, native.bridge
    grid = Shape(3, 5)
    left, right = _masks(native, grid)
    positive = [
        torch.full((1, length, 2048), index + 0.25, device=native.device, dtype=native.dtype)
        for index, length in enumerate((1, 2, 3))
    ]
    negative = [torch.full((1, 1, 2048), -0.75, device=native.device, dtype=native.dtype)]
    masks = [None if index in unmasked else (left, left, right)[index] for index in range(3)]
    source = _reference_data(native, grid, negative, positive, [None], masks)
    expected_index = unmasked[-1]
    assert (
        source.sign_rows[1][0].pooled_embeds is source.sign_rows[1][2][expected_index].pooled_embeds
    )
    records = tuple(
        bridge.EncodedTensorBinding(
            f"positive-{index}",
            value,
            Everywhere() if mask is None else _alpha(mask, grid),
            source.sign_rows[1][2][index].pooled_embeds,
        )
        for index, (value, mask) in enumerate(zip(positive, masks, strict=True))
    )
    negative_records = (
        bridge.EncodedTensorBinding(
            "negative", negative[0], Everywhere(), source.sign_rows[0][2][0].pooled_embeds
        ),
    )
    contexts, pools = bridge._assemble_owned_conditioning(
        torch,
        negative=negative_records,
        positive=records,
        signs=("negative", "positive"),
        keys=6,
        selected=(
            bridge._pool_source(negative_records, "negative"),
            bridge._pool_source(records, f"positive-{expected_index}"),
        ),
        tensor_profile=native.tensor_profile,
    )
    assert torch.equal(contexts, source.context)
    assert torch.equal(pools, source.kwargs.added_cond_kwargs["text_embeds"])
    assert source.kwargs.encoder_attention_mask[0].tolist() == [1, 0, 0, 0, 0, 0]
    assert contexts.data_ptr() != positive[0].data_ptr()


def test_empty_regional_negatives_change_permissions_but_not_zero_values(native: Any) -> None:
    torch = native.torch
    graph = _graph(native, "halves")
    grid = graph.grid
    left, right = _masks(native, grid)
    zeros = torch.zeros((1, 77, 8), device=native.device, dtype=native.dtype)
    positive = [
        torch.full((1, 77, 8), value, device=native.device, dtype=native.dtype)
        for value in (0.1, 0.7, -0.6)
    ]
    masks = [None, left, right]
    source = _reference_data(native, grid, [zeros], positive, [None], masks)
    actual_negatives = [zeros, zeros.clone(), zeros.clone()]
    plan = _plan(grid, actual_negatives, positive, masks, masks)
    # The Invoke graph has one empty global negative; our recipe retains three
    # empty signed streams. Both padded context values are nevertheless zero.
    assert source.sign_rows[0][0].embeds.shape[1] == 77
    assert plan.negative.length == 231 and source.context.shape[1] == 231
    assert torch.count_nonzero(source.context[0]) == 0
    same = _plan(grid, [zeros], positive, [None], masks)
    reference_graph = SimpleNamespace(grid=grid, source=source, plan=same)
    graph = SimpleNamespace(grid=grid, source=source, plan=plan)
    ours = native.adapter._combined_mask(
        torch, plan, 1, grid, 2, None, native.tensor_profile
    ).reshape(2, 2, 15, 231)
    expected = _reference_permissions(native, reference_graph, 1)
    assert not torch.equal(ours[0, 0], expected[0])
    assert torch.equal(ours[1, 0], expected[1])
    model = _model(native)
    # Do not pass source padding into our lane: it would hide this graph delta.
    graph.source = SimpleNamespace(**vars(source))
    graph.source.prior = None
    queries, actual = _our_call(native, model, graph)
    expected_output = _source_call(native, model, reference_graph, queries)
    _assert_close(native, actual, expected_output)


def test_explicit_zero_and_grid_guard_differences_remain_visible(native: Any) -> None:
    torch = native.torch
    grid = Shape(3, 5)
    preprocess = native.reference.DenoiseLatentsInvocation._preprocess_regional_prompt_mask
    assert preprocess(None, 3, 5, native.dtype).eq(1).all()
    explicit_zero = preprocess(torch.zeros((3, 5)), 3, 5, native.dtype)
    assert explicit_zero.eq(0).all()
    coverage = Alpha8(grid, bytes(15))
    plan = plan_illustrious_attention(
        latent_shape=grid,
        negative=(EncodedSegment("negative", 1, coverage),),
        positive=(EncodedSegment("positive", 1, coverage),),
        profile=PROFILE,
        layout="cfg-negative-first",
    )
    with pytest.raises(native.adapter.IllustriousRegionalAdapterError) as failure:
        native.adapter._combined_mask(torch, plan, 1, grid, 2, None, native.tensor_profile)
    assert failure.value.code == "ALL_MASKED"
    regions = native.reference.TextConditioningRegions(
        masks=explicit_zero, ranges=[native.reference.Range(0, 1)]
    )
    source = native.reference.RegionalPromptData([regions], native.device, native.dtype)
    assert source.get_cross_attn_mask(15, 1).eq(-10000).all()
    # Source lookup uses Q only, while our numerical owner binds the actual grid.
    assert source.get_cross_attn_mask(5 * 3, 1).shape == (1, 15, 1)
    with pytest.raises(IllustriousRegionalAttentionError):
        plan.query(factor=1, shape=Shape(5, 3), key_length=1)


def test_finite_reference_bias_is_not_a_hard_block_for_extreme_logits(native: Any) -> None:
    torch = native.torch
    grid = Shape(3, 5)
    zero_mask = torch.zeros((3, 5), dtype=torch.bool)
    empty = torch.zeros((1, 1, 8), device=native.device, dtype=native.dtype)
    canary = empty.clone()
    canary[:, :, 0] = 1000
    source = _reference_data(native, grid, [empty], [empty, canary], [None], [None, zero_mask])
    plan = _plan(grid, [empty], [empty, canary], [None], [None, zero_mask])
    graph = SimpleNamespace(grid=grid, source=source, plan=plan)
    queries = torch.zeros((2, 15, 8), device=native.device, dtype=native.dtype)
    queries[:, :, 0] = 1000
    model = _model(native)
    _, ours = _our_call(native, model, graph, queries=queries)
    reference = _source_call(native, model, graph, queries)
    assert torch.isfinite(reference).all() and torch.count_nonzero(ours) == 0
    assert (reference[1].abs() > 100).any(), "finite -10000 must not be mislabeled hard blocking"


def test_invoke_spatial_reference_red(native: Any) -> None:
    graph, model = _graph(native, "halves"), _model(native)
    queries, actual = _our_call(native, model, graph)
    _assert_close(native, actual, _source_call(native, model, graph, queries))


def test_invoke_global_reference_control_green(native: Any) -> None:
    graph, model = _graph(native, "global"), _model(native)
    queries, actual = _our_call(native, model, graph)
    _assert_close(native, actual, _source_call(native, model, graph, queries))
