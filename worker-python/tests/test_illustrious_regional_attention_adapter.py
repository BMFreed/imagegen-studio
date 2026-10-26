"""Executable, synthetic native CPU contract for the private scoped adapter.

No weights, encoders, tensor assembler, worker dispatch or trained-image claim.
The dense oracle uses literal spans and native projection weights, never the
planner's query/pyramid result. Observer hooks see actual Attention boundaries.

Mutation pair (root runs it in isolation): omit *spatial* restrictions while
retaining sign padding. ``test_spatial_mask_omission_mutation_red`` must fail;
``test_everywhere_mutation_control_green`` must pass. Neither mutation is made
here. Dependencies may skip in a derivatives-only environment; qualification
requires the pinned native environment and zero skips.
"""

from __future__ import annotations

import dataclasses
import importlib
import math
import threading
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any, Literal, cast

import pytest

from imagegen_worker.illustrious_regional_attention import (
    Alpha8,
    EncodedSegment,
    Everywhere,
    Shape,
    plan_illustrious_attention,
)

PROFILE = "alpha8-ge128-ceil2x2-max-v1"
NEGATIVE_ALPHA = bytes((255, 0, 127, 128, 0, 0, 255, 0, 0, 128, 0, 0, 255, 0, 0))
POSITIVE_ALPHA = bytes((0, 255, 128, 0, 127, 255, 0, 0, 128, 0, 0, 255, 0, 0, 255))


@pytest.fixture
def native() -> Iterator[Any]:
    """Lazy optional imports; restore CPU thread count and global CPU RNG state."""
    torch = pytest.importorskip("torch")
    diffusers = pytest.importorskip("diffusers")
    assert torch.__version__.split("+", 1)[0] == "2.7.1"
    assert diffusers.__version__ == "0.40.0"
    processors = importlib.import_module("diffusers.models.attention_processor")
    adapter = importlib.import_module("imagegen_worker.illustrious_regional_attention_adapter")
    previous_threads = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        with torch.random.fork_rng(devices=[]), torch.inference_mode():
            torch.manual_seed(241025)
            yield SimpleNamespace(
                torch=torch,
                diffusers=diffusers,
                adapter=adapter,
                processor_type=processors.AttnProcessor2_0,
                other_processor_type=processors.AttnProcessor,
                attention_type=processors.Attention,
            )
    finally:
        torch.set_num_threads(previous_threads)


def _plan(
    shape: tuple[int, int] = (3, 5),
    *,
    everywhere: bool = False,
    equal: bool = False,
    layout: Literal["cfg-negative-first", "positive-only"] = "cfg-negative-first",
) -> Any:
    grid = Shape(*shape)
    negative = Everywhere() if everywhere else Alpha8(grid, NEGATIVE_ALPHA)
    positive = Everywhere() if everywhere else Alpha8(grid, POSITIVE_ALPHA)
    return plan_illustrious_attention(
        latent_shape=grid,
        negative=(
            EncodedSegment("n-global", 1, Everywhere()),
            EncodedSegment("n-local", 1, negative),
        ),
        positive=(
            EncodedSegment("p-global", 1, Everywhere()),
            EncodedSegment("p-local", 1 if equal else 2, positive),
        ),
        profile=PROFILE,
        layout=layout,
    )


def _everywhere_plan(
    shape: tuple[int, int],
    *,
    length: int = 3,
    layout: Literal["cfg-negative-first", "positive-only"] = "cfg-negative-first",
) -> Any:
    return plan_illustrious_attention(
        latent_shape=Shape(*shape),
        negative=(EncodedSegment("negative", length, Everywhere()),),
        positive=(EncodedSegment("positive", length, Everywhere()),),
        profile=PROFILE,
        layout=layout,
    )


def _transformer(native: Any, *, heads: int = 2, **options: Any) -> Any:
    model = native.diffusers.Transformer2DModel(
        num_attention_heads=heads,
        attention_head_dim=8 // heads,
        in_channels=8,
        out_channels=8,
        num_layers=1,
        norm_num_groups=4,
        cross_attention_dim=8,
        dropout=0.0,
        **options,
    ).eval()
    attention = model.transformer_blocks[0].attn2
    # Keep real modules/projections. Full-rank deterministic weights expose each
    # head and avoid a zero projection making interventions vacuously invariant.
    for linear, scale in (
        (attention.to_q, 0.4),
        (attention.to_k, 0.3),
        (attention.to_v, 1.0),
        (attention.to_out[0], 1.0),
    ):
        linear.weight.copy_(native.torch.eye(8) * scale)
        if linear.bias is not None:
            linear.bias.zero_()
    return model


def _context(native: Any, *, equal: bool = False, positive_only: bool = False) -> Any:
    torch = native.torch
    # Distinct signs and tokens, with a conspicuous negative padding canary.
    context = torch.tensor(
        [
            [
                [0.2, -0.1, 0.4, 0.3, -0.5, 0.7, 0.1, -0.2],
                [1.1, 0.6, -0.9, 0.8, 0.4, -0.2, 0.9, 0.5],
                [71.0, -43.0, 29.0, 53.0, -61.0, 37.0, 47.0, -31.0],
            ],
            [
                [-0.3, 0.5, 0.1, -0.2, 0.6, 0.3, -0.7, 0.9],
                [0.8, -0.4, 0.7, 0.6, -0.1, 1.2, 0.2, -0.5],
                [-0.6, 0.9, 1.1, -0.8, 0.5, -0.3, 0.4, 0.7],
            ],
        ],
        dtype=torch.float32,
    )
    if equal:
        context = context[:, :2].contiguous()
    return context[1:].contiguous() if positive_only else context


def _hidden(native: Any, grid: tuple[int, int] = (3, 5), *, batch: int = 2) -> Any:
    height, width = grid
    return native.torch.randn(batch, 8, height, width)


def _bindings(native: Any, model: Any, factor: int = 1) -> tuple[Any, ...]:
    return (native.adapter.TransformerBinding(model, factor),)


def _snapshot(root: Any) -> tuple[Any, ...]:
    """Exact processors, hooks and native call-entry slot presence/references."""
    return tuple(
        (
            id(module),
            getattr(module, "processor", None),
            tuple(module._forward_pre_hooks.items()),
            tuple(module._forward_hooks.items()),
            tuple(module._forward_pre_hooks_with_kwargs.items()),
            tuple(module._forward_hooks_with_kwargs.items()),
            tuple(module._forward_hooks_always_called.items()),
            tuple((key, value) for key, value in module.__dict__.items() if key == "_call_impl"),
            (("class._call_impl", cast(Any, type(module))._call_impl),),
        )
        for module in root.modules()
    )


def _assert_restored(root: Any, before: tuple[Any, ...]) -> None:
    after = _snapshot(root)
    assert len(after) == len(before)
    for old, new in zip(before, after, strict=True):
        assert old[0] == new[0]
        assert old[1] is new[1], "Original processor identity was not restored."
        for old_hooks, new_hooks in zip(old[2:], new[2:], strict=True):
            assert len(old_hooks) == len(new_hooks)
            for (old_key, old_hook), (new_key, new_hook) in zip(old_hooks, new_hooks, strict=True):
                assert old_key == new_key
                assert old_hook is new_hook


def _literal_permissions(
    native: Any,
    *,
    grid: tuple[int, int],
    factor: int = 1,
    equal: bool = False,
    everywhere: bool = False,
    positive_only: bool = False,
) -> Any:
    """Direct source windows and literal spans; no production plan reads."""
    height, width = grid
    key_length = 2 if equal else 3
    signs = (1,) if positive_only else (0, 1)
    allowed = native.torch.zeros(len(signs), 2, height * width, key_length, dtype=native.torch.bool)
    for batch_index, sign in enumerate(signs):
        original = (NEGATIVE_ALPHA, POSITIVE_ALPHA)[sign]
        local_end = 2 if sign == 0 or equal else 3
        for y in range(height):
            for x in range(width):
                query = y * width + x
                allowed[batch_index, :, query, 0] = True
                visible = everywhere or any(
                    original[source_y * 5 + source_x] >= 128
                    for source_y in range(y * factor, min((y + 1) * factor, 3))
                    for source_x in range(x * factor, min((x + 1) * factor, 5))
                )
                if visible:
                    allowed[batch_index, :, query, 1:local_end] = True
    return allowed


def _dense_oracle(native: Any, attention: Any, queries: Any, context: Any, allowed: Any) -> Any:
    """Independent small dense softmax through literal linear algebra."""
    torch = native.torch
    assert attention.heads == 2
    assert attention.norm_q is None and attention.norm_k is None
    assert attention.group_norm is None and attention.spatial_norm is None
    assert not attention.norm_cross and not attention.residual_connection
    assert attention.rescale_output_factor == 1.0
    linear = torch.nn.functional.linear
    q = linear(queries, attention.to_q.weight, attention.to_q.bias)
    k = linear(context, attention.to_k.weight, attention.to_k.bias)
    v = linear(context, attention.to_v.weight, attention.to_v.bias)
    batch, query_length, _ = q.shape
    key_length = context.shape[1]
    q = q.reshape(batch, query_length, 2, 4).transpose(1, 2)
    k = k.reshape(batch, key_length, 2, 4).transpose(1, 2)
    v = v.reshape(batch, key_length, 2, 4).transpose(1, 2)
    assert allowed.shape == (batch, 2, query_length, key_length)
    assert allowed.any(dim=-1).all()
    scores = (q @ k.transpose(-1, -2)) / math.sqrt(4)
    probabilities = scores.masked_fill(~allowed, -math.inf).softmax(dim=-1)
    attended = (probabilities @ v).transpose(1, 2).reshape(batch, query_length, 8)
    output = linear(attended, attention.to_out[0].weight, attention.to_out[0].bias)
    assert not attention.to_out[1].training
    return output


def _capture(native: Any, model: Any, plan: Any, hidden: Any, context: Any) -> tuple[Any, Any]:
    attention = model.transformer_blocks[0].attn2
    inputs: list[Any] = []
    outputs: list[Any] = []

    def before(_module: Any, args: Any, _kwargs: Any) -> None:
        inputs.append(args[0].clone())

    def after(_module: Any, _args: Any, output: Any) -> None:
        outputs.append(output.clone())

    pre = attention.register_forward_pre_hook(before, with_kwargs=True)
    post = attention.register_forward_hook(after)
    baseline = _snapshot(model)
    try:
        with native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model), plan=plan
        ):
            model(hidden, encoder_hidden_states=context)
        _assert_restored(model, baseline)
    finally:
        pre.remove()
        post.remove()
    assert len(inputs) == len(outputs) == 1
    return inputs[0], outputs[0]


def _direct_under_parent(
    native: Any,
    model: Any,
    plan: Any,
    hidden: Any,
    queries: Any,
    context: Any,
    *,
    prior: Any = None,
    factor: int = 1,
) -> Any:
    """Call real wrapped attn2 after the real parent's adapter pre-hook.

    This isolates prior masks and interventions from self-attention and spatial
    normalization. The parent still runs normally after this additional native
    cross-attention invocation. No prepared result or attention math is stubbed.
    """
    outputs: list[Any] = []
    attention = model.transformer_blocks[0].attn2

    def drive(_module: Any, _args: Any, _kwargs: Any) -> None:
        outputs.append(attention(queries, encoder_hidden_states=context, attention_mask=prior))

    baseline = _snapshot(model)
    try:
        with native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model, factor), plan=plan
        ):
            handle = model.register_forward_pre_hook(drive, with_kwargs=True)
            try:
                model(hidden, encoder_hidden_states=context)
            finally:
                handle.remove()
    finally:
        _assert_restored(model, baseline)
    assert len(outputs) == 1
    return outputs[0]


def _count_original(native: Any, monkeypatch: Any, attention: Any) -> list[Any]:
    """Transparent instrumentation; all normal math stays in the exact original."""
    original = attention.processor
    real_call = native.processor_type.__call__
    calls: list[Any] = []

    def counted(processor: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
        if attn is attention:
            assert processor is original
            calls.append(processor)
        return real_call(processor, attn, *args, **kwargs)

    monkeypatch.setattr(native.processor_type, "__call__", counted)
    return calls


def test_real_transformer_dense_oracle_all_cfg_heads_positions_and_padding(
    native: Any, monkeypatch: Any
) -> None:
    model = _transformer(native)
    attention = model.transformer_blocks[0].attn2
    calls = _count_original(native, monkeypatch, attention)
    context = _context(native)
    queries, actual = _capture(native, model, _plan(), _hidden(native), context)
    expected = _dense_oracle(
        native, attention, queries, context, _literal_permissions(native, grid=(3, 5))
    )
    native.torch.testing.assert_close(actual, expected, rtol=2e-5, atol=2e-6)
    assert len(calls) == 1
    changed = context.clone()
    changed[0, 2] *= -17  # Padding is excluded even where the local segment is visible.
    repeated = _direct_under_parent(native, model, _plan(), _hidden(native), queries, changed)
    assert native.torch.equal(repeated, actual)


def _intervention(native: Any, *, everywhere: bool) -> tuple[Any, Any]:
    model = _transformer(native)
    plan = _plan(equal=True, everywhere=everywhere)
    context = _context(native, equal=True)
    queries = native.torch.randn(2, 15, 8) * 0.25
    hidden = _hidden(native)
    original = _direct_under_parent(native, model, plan, hidden, queries, context)
    changed = context.clone()
    changed[1, 1] += native.torch.tensor([2.0, -1.0, 3.0, 1.5, -2.0, 4.0, 0.5, -3.0])
    intervened = _direct_under_parent(native, model, plan, hidden, queries, changed)
    assert native.torch.equal(original[0], intervened[0]), "Other CFG sign was contaminated."
    return original[1], intervened[1]


def test_spatial_mask_omission_mutation_red(native: Any) -> None:
    """Equal K must still restrict space; spatial-mask omission makes this RED."""
    before, after = _intervention(native, everywhere=False)
    blocked = [0, 3, 4, 6, 7, 9, 10, 12, 13]
    permitted = [1, 2, 5, 8, 11, 14]
    assert native.torch.equal(before[blocked], after[blocked])
    for query in permitted:
        assert not native.torch.equal(before[query], after[query])


def test_everywhere_mutation_control_green(native: Any) -> None:
    """Same intervention with Everywhere changes every query, including former holes."""
    before, after = _intervention(native, everywhere=True)
    for query in range(15):
        assert not native.torch.equal(before[query], after[query])


def test_positive_only_keeps_positive_spans_and_padding_contract(native: Any) -> None:
    model = _transformer(native)
    plan = _plan(layout="positive-only")
    context = _context(native, positive_only=True)
    queries, actual = _capture(native, model, plan, _hidden(native, batch=1), context)
    expected = _dense_oracle(
        native,
        model.transformer_blocks[0].attn2,
        queries,
        context,
        _literal_permissions(native, grid=(3, 5), positive_only=True),
    )
    native.torch.testing.assert_close(actual, expected, rtol=2e-5, atol=2e-6)


@pytest.mark.parametrize("factor,grid", [(1, (3, 5)), (2, (2, 3)), (4, (1, 2)), (8, (1, 1))])
def test_odd_rectangular_grid_each_explicit_factor(native: Any, factor: int, grid: Any) -> None:
    model = _transformer(native)
    queries = native.torch.randn(2, grid[0] * grid[1], 8)
    context = _context(native)
    actual = _direct_under_parent(
        native, model, _plan(), _hidden(native, grid), queries, context, factor=factor
    )
    expected = _dense_oracle(
        native,
        model.transformer_blocks[0].attn2,
        queries,
        context,
        _literal_permissions(native, grid=grid, factor=factor),
    )
    native.torch.testing.assert_close(actual, expected, rtol=2e-5, atol=2e-6)


@pytest.mark.parametrize("factor", [4, 8])
def test_explicit_binding_accepts_repeated_one_by_one_levels(native: Any, factor: int) -> None:
    model = _transformer(native)
    context = _context(native)
    queries = native.torch.randn(2, 1, 8)
    actual = _direct_under_parent(
        native,
        model,
        _everywhere_plan((3, 3)),
        _hidden(native, (1, 1)),
        queries,
        context,
        factor=factor,
    )
    expected = _dense_oracle(
        native,
        model.transformer_blocks[0].attn2,
        queries,
        context,
        native.torch.ones(2, 2, 1, 3, dtype=native.torch.bool),
    )
    native.torch.testing.assert_close(actual, expected, rtol=2e-5, atol=2e-6)


@pytest.mark.parametrize("grid", [(5, 3), (1, 15), (3, 4)])
def test_parent_geometry_refuses_before_flatten_and_original_call(
    native: Any, monkeypatch: Any, grid: Any
) -> None:
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    baseline = _snapshot(model)
    with (
        pytest.raises(native.adapter.IllustriousRegionalAdapterError),
        native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model), plan=_plan()
        ),
    ):
        model(_hidden(native, grid), encoder_hidden_states=_context(native))
    assert not calls
    _assert_restored(model, baseline)


def test_preexisting_transpose_hook_requires_actual_parent_grid_before_flatten(
    native: Any, monkeypatch: Any
) -> None:
    """Regression: a prepend observer must not validate stale pre-hook geometry.

    The original native forward receives 5x3 after an existing hook transforms
    the caller's 3x5 tensor. Both flatten to Q=15. Root establishes this RED
    before the production fix; the hook transformation is the only injection.
    """
    model = _transformer(native)
    attention = model.transformer_blocks[0].attn2
    calls = _count_original(native, monkeypatch, attention)
    transformed: list[Any] = []

    def transpose_parent(_module: Any, args: Any, kwargs: Any) -> Any:
        assert tuple(args[0].shape[-2:]) == (3, 5)
        changed = args[0].transpose(-1, -2).contiguous()
        assert tuple(changed.shape[-2:]) == (5, 3)
        transformed.append(changed.shape)
        return (changed, *args[1:]), kwargs

    existing = model.register_forward_pre_hook(transpose_parent, with_kwargs=True)
    baseline = _snapshot(model)
    try:
        with (
            pytest.raises(native.adapter.IllustriousRegionalAdapterError) as caught,
            native.adapter.scoped_illustrious_regional_attention(
                model, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            model(_hidden(native), encoder_hidden_states=_context(native))
        assert caught.value.code == "INPUT_INVALID"
        assert transformed == [native.torch.Size((2, 8, 5, 3))]
        assert not calls, "Original cross-attention saw a transposed, misregistered grid."
    finally:
        _assert_restored(model, baseline)
        existing.remove()


def test_preexisting_unchanged_hook_geometry_control_consumes_native_attention(
    native: Any, monkeypatch: Any
) -> None:
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    observations: list[Any] = []

    def observe_parent(_module: Any, args: Any, kwargs: Any) -> Any:
        observations.append(args[0].shape)
        return args, kwargs

    existing = model.register_forward_pre_hook(observe_parent, with_kwargs=True)
    baseline = _snapshot(model)
    try:
        with native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model), plan=_plan()
        ):
            model(_hidden(native), encoder_hidden_states=_context(native))
        assert observations == [native.torch.Size((2, 8, 3, 5))]
        assert len(calls) == 1
    finally:
        _assert_restored(model, baseline)
        existing.remove()


def test_preexisting_parent_prehook_reentry_refuses_before_original_attention(
    native: Any, monkeypatch: Any
) -> None:
    """A native call made before the adapter's geometry observer is still reentry."""
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    hidden, context = _hidden(native), _context(native)
    depth = 0
    reentrant_attempts: list[str] = []

    def reenter_parent(_module: Any, args: Any, kwargs: Any) -> Any:
        nonlocal depth
        if depth == 0:
            depth = 1
            reentrant_attempts.append("native parent call")
            try:
                model(*args, **kwargs)
            finally:
                depth = 0
        return args, kwargs

    existing = model.register_forward_pre_hook(reenter_parent, with_kwargs=True)
    baseline = _snapshot(model)
    try:
        with (
            pytest.raises(native.adapter.IllustriousRegionalAdapterError) as caught,
            native.adapter.scoped_illustrious_regional_attention(
                model, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            model(hidden, encoder_hidden_states=context)
        assert caught.value.code == "SCOPE_CONFLICT"
        assert reentrant_attempts == ["native parent call"]
        assert depth == 0
        assert not calls, "Reentry reached original cross-attention before refusal."
    finally:
        _assert_restored(model, baseline)
        existing.remove()


def test_preexisting_parent_prehook_observation_control_runs_once(
    native: Any, monkeypatch: Any
) -> None:
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    hidden, context = _hidden(native), _context(native)
    observations: list[Any] = []

    def observe_parent(_module: Any, args: Any, kwargs: Any) -> Any:
        observations.append(args[0])
        return args, kwargs

    existing = model.register_forward_pre_hook(observe_parent, with_kwargs=True)
    baseline = _snapshot(model)
    try:
        with native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model), plan=_plan()
        ):
            result = model(hidden, encoder_hidden_states=context)
        assert len(observations) == 1
        assert observations[0] is hidden
        assert len(calls) == 1
        assert result.sample.shape == (2, 8, 3, 5)
    finally:
        _assert_restored(model, baseline)
        existing.remove()


def _tiny_unet(native: Any) -> tuple[Any, tuple[Any, ...], dict[int, tuple[int, int]]]:
    model = native.diffusers.UNet2DConditionModel(
        sample_size=(3, 5),
        in_channels=4,
        out_channels=4,
        layers_per_block=1,
        block_out_channels=(8, 8, 8, 8),
        down_block_types=("CrossAttnDownBlock2D",) * 4,
        up_block_types=("CrossAttnUpBlock2D",) * 4,
        cross_attention_dim=8,
        attention_head_dim=2,
        norm_num_groups=4,
        dropout=0.0,
    ).eval()
    bindings: list[Any] = []
    expected: dict[int, tuple[int, int]] = {}
    # Construction determines stage -> factor/grid. Never infer from flattened Q.
    stages = (
        (model.down_blocks[0], 1, (3, 5)),
        (model.down_blocks[1], 2, (2, 3)),
        (model.down_blocks[2], 4, (1, 2)),
        (model.down_blocks[3], 8, (1, 1)),
        (model.mid_block, 8, (1, 1)),
        (model.up_blocks[0], 8, (1, 1)),
        (model.up_blocks[1], 4, (1, 2)),
        (model.up_blocks[2], 2, (2, 3)),
        (model.up_blocks[3], 1, (3, 5)),
    )
    for block, factor, grid in stages:
        for transformer in block.attentions:
            bindings.append(native.adapter.TransformerBinding(transformer, factor))
            expected[id(transformer)] = grid
    assert len(bindings) == 13
    return model, tuple(bindings), expected


def test_real_tiny_unet_consumes_all_down_mid_up_cross_attention(native: Any) -> None:
    model, bindings, expected = _tiny_unet(native)
    seen: dict[int, list[Any]] = {key: [] for key in expected}
    handles: list[Any] = []
    self_processors = [
        (block.attn1, block.attn1.processor)
        for binding in bindings
        for block in binding.transformer.transformer_blocks
    ]
    for binding in bindings:
        transformer = binding.transformer

        def observe(_module: Any, args: Any, *, owner: Any = transformer) -> None:
            assert tuple(args[0].shape[-2:]) == expected[id(owner)]

        def cross(_module: Any, args: Any, *, owner: Any = transformer) -> None:
            height, width = expected[id(owner)]
            assert args[0].shape[1] == height * width
            seen[id(owner)].append(args[0].shape)

        handles.append(transformer.register_forward_pre_hook(observe))
        handles.append(transformer.transformer_blocks[0].attn2.register_forward_pre_hook(cross))
    baseline = _snapshot(model)
    try:
        with native.adapter.scoped_illustrious_regional_attention(
            model, bindings=bindings, plan=_plan()
        ):
            assert all(attention.processor is processor for attention, processor in self_processors)
            result = model(
                native.torch.randn(2, 4, 3, 5), timestep=7, encoder_hidden_states=_context(native)
            ).sample
            assert result.shape == (2, 4, 3, 5)
            assert native.torch.isfinite(result).all()
        assert all(len(calls) == 1 for calls in seen.values())
        _assert_restored(model, baseline)
    finally:
        for handle in handles:
            handle.remove()


@pytest.mark.parametrize("encoding", ["bool", "minus10000", "minusinf"])
@pytest.mark.parametrize(
    "form",
    ["batch-key", "batch-query", "flat-head-key", "flat-head-query", "four-key", "four-query"],
)
def test_prior_binary_key_mask_intersects_spatial_and_padding(
    native: Any, encoding: str, form: str
) -> None:
    model = _transformer(native)
    context = _context(native)
    queries = native.torch.randn(2, 15, 8)
    # Remove one positive local token while preserving the always-visible global.
    prior = native.torch.tensor([[True, True, True], [True, False, True]])
    permissions = _literal_permissions(native, grid=(3, 5)) & prior[:, None, None, :]
    mask = prior
    if encoding != "bool":
        mask = native.torch.zeros(2, 3).masked_fill(
            ~prior, -10000.0 if encoding == "minus10000" else -math.inf
        )
    # These are the finite attn2 forms, after any native parent's preprocessing.
    # Rank-two masks belong to the parent API, not this direct Attention call.
    if form == "batch-key":
        mask = mask[:, None, :]
    elif form == "batch-query":
        mask = mask[:, None, :].expand(2, 15, 3).clone()
    elif form == "flat-head-key":
        mask = mask.repeat_interleave(2, dim=0)[:, None, :]
    elif form == "flat-head-query":
        mask = mask.repeat_interleave(2, dim=0)[:, None, :].expand(4, 15, 3).clone()
    elif form == "four-key":
        mask = mask[:, None, None, :]
    else:
        mask = mask[:, None, None, :].expand(2, 1, 15, 3).clone()
    actual = _direct_under_parent(
        native, model, _plan(), _hidden(native), queries, context, prior=mask
    )
    expected = _dense_oracle(
        native, model.transformer_blocks[0].attn2, queries, context, permissions
    )
    native.torch.testing.assert_close(actual, expected, rtol=2e-5, atol=2e-6)


def test_prior_head_specific_mask_intersects_each_head(native: Any) -> None:
    model = _transformer(native)
    queries = native.torch.randn(2, 15, 8)
    context = _context(native)
    prior = native.torch.ones(2, 2, 15, 3, dtype=native.torch.bool)
    prior[1, 0, :, 1] = False
    prior[1, 1, :, 2] = False
    expected = _dense_oracle(
        native,
        model.transformer_blocks[0].attn2,
        queries,
        context,
        _literal_permissions(native, grid=(3, 5)) & prior,
    )
    actual = _direct_under_parent(
        native,
        model,
        _plan(),
        _hidden(native),
        queries,
        context,
        prior=prior.reshape(4, 15, 3),
    )
    native.torch.testing.assert_close(actual, expected, rtol=2e-5, atol=2e-6)


@pytest.mark.parametrize("head_specific", [False, True])
def test_effective_all_masked_intersection_refuses_without_original(
    native: Any, monkeypatch: Any, head_specific: bool
) -> None:
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    # Prior has support and plan has support; their intersection is empty at
    # positive q0 (local coverage is zero). Not merely a zero-coverage fixture.
    prior = native.torch.ones(2, 2, 15, 3, dtype=native.torch.bool)
    if head_specific:
        prior[1, 1, 0, 0] = False
    else:
        prior[1, :, :, 0] = False
    assert prior.any(dim=-1).all()
    with pytest.raises(native.adapter.IllustriousRegionalAdapterError):
        _direct_under_parent(
            native,
            model,
            _plan(),
            _hidden(native),
            native.torch.randn(2, 15, 8),
            _context(native),
            prior=prior.reshape(4, 15, 3),
        )
    assert not calls


def test_zero_spatial_support_has_no_everywhere_fallback(native: Any, monkeypatch: Any) -> None:
    model = _transformer(native)
    shape = Shape(3, 5)
    plan = plan_illustrious_attention(
        latent_shape=shape,
        negative=(EncodedSegment("n", 1, Everywhere()),),
        positive=(EncodedSegment("empty", 1, Alpha8(shape, bytes(15))),),
        profile=PROFILE,
        layout="cfg-negative-first",
    )
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    baseline = _snapshot(model)
    with (
        pytest.raises(native.adapter.IllustriousRegionalAdapterError),
        native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model), plan=plan
        ),
    ):
        model(_hidden(native), encoder_hidden_states=_context(native)[:, :1].contiguous())
    assert not calls
    _assert_restored(model, baseline)


@pytest.mark.parametrize(
    "kind",
    [
        "soft",
        "positive-inf",
        "nan",
        "integer",
        "float64",
        "wrong-k",
        "wrong-batch",
        "rank-one",
        "rank-five",
        "wrong-query",
        "meta",
    ],
)
def test_unsupported_prior_masks_fail_closed(native: Any, monkeypatch: Any, kind: str) -> None:
    torch = native.torch
    model = _transformer(native)
    masks = {
        "soft": lambda: torch.full((2, 1, 3), -0.5),
        "positive-inf": lambda: torch.full((2, 1, 3), math.inf),
        "nan": lambda: torch.full((2, 1, 3), math.nan),
        "integer": lambda: torch.ones(2, 1, 3, dtype=torch.int64),
        "float64": lambda: torch.zeros(2, 1, 3, dtype=torch.float64),
        "wrong-k": lambda: torch.ones(2, 1, 4, dtype=torch.bool),
        "wrong-batch": lambda: torch.ones(3, 1, 3, dtype=torch.bool),
        "rank-one": lambda: torch.ones(3, dtype=torch.bool),
        "rank-five": lambda: torch.ones(2, 1, 1, 15, 3, dtype=torch.bool),
        "wrong-query": lambda: torch.ones(4, 14, 3, dtype=torch.bool),
        "meta": lambda: torch.ones(2, 1, 3, dtype=torch.bool, device="meta"),
    }
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    with pytest.raises(native.adapter.IllustriousRegionalAdapterError):
        _direct_under_parent(
            native,
            model,
            _plan(),
            _hidden(native),
            torch.randn(2, 15, 8),
            _context(native),
            prior=masks[kind](),
        )
    assert not calls


class InjectedFailure(RuntimeError):
    pass


def test_caught_parent_posthook_failure_latches_scope_exit(native: Any, monkeypatch: Any) -> None:
    """Catching the original post-hook error cannot turn this scope into success."""
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    hidden, context = _hidden(native), _context(native)
    injected = InjectedFailure("existing parent post-hook failed after native result")
    outputs: list[Any] = []
    original_errors: list[InjectedFailure] = []

    def fail_after_result(_module: Any, _args: Any, output: Any) -> None:
        outputs.append(output)
        raise injected

    existing = model.register_forward_hook(fail_after_result)
    baseline = _snapshot(model)
    try:
        with (
            pytest.raises(native.adapter.IllustriousRegionalAdapterError) as caught,
            native.adapter.scoped_illustrious_regional_attention(
                model, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            try:
                model(hidden, encoder_hidden_states=context)
            except InjectedFailure as original_error:
                assert original_error is injected
                assert str(original_error) == "existing parent post-hook failed after native result"
                original_errors.append(original_error)
                assert len(calls) == 1
                assert len(outputs) == 1
                assert outputs[0] is not None
                assert outputs[0].sample.shape == (2, 8, 3, 5)
        assert caught.value.code == "INPUT_INVALID"
        assert original_errors == [injected]
        assert len(calls) == 1
    finally:
        _assert_restored(model, baseline)
        existing.remove()


def test_caught_parent_posthook_failure_refuses_subsequent_forward_and_recovers(
    native: Any, monkeypatch: Any
) -> None:
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    hidden, context = _hidden(native), _context(native)
    injected = InjectedFailure("parent post-hook fails once after native result")
    outputs: list[Any] = []

    def fail_once_after_result(_module: Any, _args: Any, output: Any) -> None:
        outputs.append(output)
        if len(outputs) == 1:
            raise injected

    existing = model.register_forward_hook(fail_once_after_result)
    baseline = _snapshot(model)
    try:
        with (
            pytest.raises(native.adapter.IllustriousRegionalAdapterError) as scope_error,
            native.adapter.scoped_illustrious_regional_attention(
                model, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            try:
                model(hidden, encoder_hidden_states=context)
            except InjectedFailure as original_error:
                assert original_error is injected
                assert str(original_error) == "parent post-hook fails once after native result"
            else:
                pytest.fail("The existing post-hook's original failure did not propagate.")
            assert len(calls) == 1
            assert len(outputs) == 1
            assert outputs[0] is not None
            assert outputs[0].sample.shape == (2, 8, 3, 5)
            with pytest.raises(native.adapter.IllustriousRegionalAdapterError) as subsequent_error:
                model(hidden, encoder_hidden_states=context)
            assert subsequent_error.value.code == "INPUT_INVALID"
            assert len(calls) == 1, "A latched failure allowed another original attention call."
            assert len(outputs) == 1
        assert scope_error.value.code == "INPUT_INVALID"
        assert len(calls) == 1
    finally:
        _assert_restored(model, baseline)
        existing.remove()
    _capture(native, model, _plan(), hidden, context)
    assert len(calls) == 2


def test_parent_posthook_success_inside_unrelated_except_does_not_latch_failure(
    native: Any, monkeypatch: Any
) -> None:
    """A handled outer exception is unrelated to a successful native forward."""
    model = _transformer(native)
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    hidden, context = _hidden(native), _context(native)
    outputs: list[Any] = []
    unrelated = LookupError("unrelated outer handler")

    def observe_result(_module: Any, _args: Any, output: Any) -> None:
        outputs.append(output)

    existing = model.register_forward_hook(observe_result)
    baseline = _snapshot(model)
    try:
        try:
            raise unrelated
        except LookupError as outer_error:
            assert outer_error is unrelated
            with native.adapter.scoped_illustrious_regional_attention(
                model, bindings=_bindings(native, model), plan=_plan()
            ):
                result = model(hidden, encoder_hidden_states=context)
                assert len(outputs) == 1
                assert result is outputs[0]
                assert result.sample.shape == (2, 8, 3, 5)
        assert len(calls) == 1
        assert len(outputs) == 1
    finally:
        _assert_restored(model, baseline)
        existing.remove()


def test_success_preserves_existing_hooks_and_self_attention_identity(native: Any) -> None:
    model = _transformer(native)
    events: list[str] = []
    self_attention = model.transformer_blocks[0].attn1
    original_self = self_attention.processor

    def record_pre(_module: Any, _args: Any) -> None:
        events.append("pre")

    def record_post(_module: Any, _args: Any, _output: Any) -> None:
        events.append("post")

    pre = model.register_forward_pre_hook(record_pre)
    post = model.register_forward_hook(record_post)
    baseline = _snapshot(model)
    try:
        with native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model), plan=_plan()
        ):
            assert self_attention.processor is original_self
            model(_hidden(native), encoder_hidden_states=_context(native))
        assert events == ["pre", "post"]
        _assert_restored(model, baseline)
    finally:
        pre.remove()
        post.remove()


@pytest.mark.parametrize("failure", ["body", "original", "prehook"])
def test_failure_paths_restore_exact_originals_and_only_owned_hooks(
    native: Any, monkeypatch: Any, failure: str
) -> None:
    model = _transformer(native)
    attention = model.transformer_blocks[0].attn2
    original = attention.processor
    calls: list[Any] = []

    def preserve_post_hook(_module: Any, _args: Any, _output: Any) -> None:
        pass

    handle = model.register_forward_hook(preserve_post_hook)

    def fail_pre(*_args: Any) -> None:
        raise InjectedFailure("existing pre-hook failed")

    failing_hook = model.register_forward_pre_hook(fail_pre) if failure == "prehook" else None
    if failure == "original":
        real_call = native.processor_type.__call__

        def fail_original(processor: Any, attn: Any, *args: Any, **kwargs: Any) -> Any:
            if processor is original and attn is attention:
                calls.append(processor)
                raise InjectedFailure("original processor failed")
            return real_call(processor, attn, *args, **kwargs)

        monkeypatch.setattr(native.processor_type, "__call__", fail_original)
    baseline = _snapshot(model)
    try:
        with (
            pytest.raises(InjectedFailure),
            native.adapter.scoped_illustrious_regional_attention(
                model, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            if failure == "body":
                raise InjectedFailure("scope callback failed")
            model(_hidden(native), encoder_hidden_states=_context(native))
        _assert_restored(model, baseline)
        assert len(calls) == (1 if failure == "original" else 0)
    finally:
        handle.remove()
        if failing_hook is not None:
            failing_hook.remove()
    monkeypatch.undo()
    # A failed scope must not poison later real execution on this exact root.
    _capture(native, model, _plan(), _hidden(native), _context(native))


def test_partial_setup_registration_failure_rolls_back_real_installations(
    native: Any, monkeypatch: Any
) -> None:
    model, bindings, _expected = _tiny_unet(native)
    baseline = _snapshot(model)
    module_type = native.torch.nn.Module
    real_register = module_type.register_forward_pre_hook
    registered: list[Any] = []

    def register(module: Any, *args: Any, **kwargs: Any) -> Any:
        if len(registered) == 1:
            raise InjectedFailure("second registration failed after first real hook")
        handle = real_register(module, *args, **kwargs)
        registered.append(handle)
        return handle

    monkeypatch.setattr(module_type, "register_forward_pre_hook", register)
    with (
        pytest.raises(InjectedFailure),
        native.adapter.scoped_illustrious_regional_attention(
            model, bindings=bindings, plan=_plan()
        ),
    ):
        pytest.fail("Partial setup unexpectedly completed.")
    assert len(registered) == 1
    _assert_restored(model, baseline)
    monkeypatch.undo()
    with native.adapter.scoped_illustrious_regional_attention(
        model, bindings=bindings, plan=_plan()
    ):
        model(native.torch.randn(2, 4, 3, 5), timestep=1, encoder_hidden_states=_context(native))
    _assert_restored(model, baseline)


def test_success_requires_actual_cross_attention_invocation(native: Any) -> None:
    model = _transformer(native)
    baseline = _snapshot(model)
    with (
        pytest.raises(native.adapter.IllustriousRegionalAdapterError),
        native.adapter.scoped_illustrious_regional_attention(
            model, bindings=_bindings(native, model), plan=_plan()
        ),
    ):
        pass
    _assert_restored(model, baseline)
    _capture(native, model, _plan(), _hidden(native), _context(native))


def test_nested_same_root_scope_refuses_without_disturbing_outer(native: Any) -> None:
    outer = _transformer(native)
    before_outer = _snapshot(outer)
    with native.adapter.scoped_illustrious_regional_attention(
        outer, bindings=_bindings(native, outer), plan=_plan()
    ):
        installed_outer = _snapshot(outer)
        with (
            pytest.raises(native.adapter.IllustriousRegionalAdapterError),
            native.adapter.scoped_illustrious_regional_attention(
                outer, bindings=_bindings(native, outer), plan=_plan()
            ),
        ):
            pytest.fail("Nested scope was admitted.")
        _assert_restored(outer, installed_outer)
        outer(_hidden(native), encoder_hidden_states=_context(native))
    _assert_restored(outer, before_outer)
    _capture(native, outer, _plan(), _hidden(native), _context(native))


def test_disjoint_roots_can_nest_with_independent_exact_restoration(native: Any) -> None:
    outer, inner = _transformer(native), _transformer(native)
    before_outer, before_inner = _snapshot(outer), _snapshot(inner)
    with native.adapter.scoped_illustrious_regional_attention(
        outer, bindings=_bindings(native, outer), plan=_plan()
    ):
        installed_outer = _snapshot(outer)
        with native.adapter.scoped_illustrious_regional_attention(
            inner, bindings=_bindings(native, inner), plan=_plan()
        ):
            inner(_hidden(native), encoder_hidden_states=_context(native))
            outer(_hidden(native), encoder_hidden_states=_context(native))
        _assert_restored(inner, before_inner)
        _assert_restored(outer, installed_outer)
        outer(_hidden(native), encoder_hidden_states=_context(native))
    _assert_restored(outer, before_outer)
    _assert_restored(inner, before_inner)


@pytest.mark.parametrize("operation", ["forward", "scope-same", "scope-disjoint"])
def test_other_thread_overlap_refuses_and_disjoint_scope_succeeds(
    native: Any, operation: str
) -> None:
    root = _transformer(native)
    other = _transformer(native)
    hidden, context = _hidden(native), _context(native)
    baseline_root, baseline_other = _snapshot(root), _snapshot(other)
    ready, proceed, finished = threading.Event(), threading.Event(), threading.Event()
    failures: list[BaseException] = []

    def attempt() -> None:
        ready.set()
        try:
            assert proceed.wait(timeout=10), "Owner never released worker."
            with native.torch.inference_mode():
                if operation == "forward":
                    root(hidden, encoder_hidden_states=context)
                else:
                    selected = root if operation == "scope-same" else other
                    with native.adapter.scoped_illustrious_regional_attention(
                        selected, bindings=_bindings(native, selected), plan=_plan()
                    ):
                        selected(hidden, encoder_hidden_states=context)
        except BaseException as exc:
            failures.append(exc)
        finally:
            finished.set()

    thread = threading.Thread(target=attempt, daemon=True)
    try:
        with native.adapter.scoped_illustrious_regional_attention(
            root, bindings=_bindings(native, root), plan=_plan()
        ):
            installed = _snapshot(root)
            thread.start()
            assert ready.wait(timeout=10)
            proceed.set()
            assert finished.wait(timeout=10)
            thread.join(timeout=10)
            assert not thread.is_alive()
            if operation == "scope-disjoint":
                assert not failures
            else:
                assert len(failures) == 1
                assert isinstance(failures[0], native.adapter.IllustriousRegionalAdapterError)
            _assert_restored(root, installed)
            root(hidden, encoder_hidden_states=context)
    finally:
        proceed.set()
        if thread.ident is not None:
            thread.join(timeout=10)
        assert not thread.is_alive()
    _assert_restored(root, baseline_root)
    _assert_restored(other, baseline_other)
    _capture(native, root, _plan(), hidden, context)


def test_binding_record_is_frozen_slotted_and_keeps_native_identity(native: Any) -> None:
    model = _transformer(native)
    binding = native.adapter.TransformerBinding(model, 1)
    assert binding.transformer is model
    assert binding.factor == 1
    assert not hasattr(binding, "__dict__")
    with pytest.raises(dataclasses.FrozenInstanceError):
        binding.factor = 2


def _deny_install_and_tensor_construction(native: Any, monkeypatch: Any) -> list[str]:
    touched: list[str] = []

    def unexpected(*_args: Any, **_kwargs: Any) -> Any:
        touched.append("allocation-or-install")
        raise AssertionError(
            "Complete preflight must precede tensor construction and installation."
        )

    for name in (
        "empty",
        "zeros",
        "ones",
        "full",
        "tensor",
        "arange",
        "empty_like",
        "zeros_like",
        "ones_like",
    ):
        monkeypatch.setattr(native.torch, name, unexpected)
    monkeypatch.setattr(native.attention_type, "set_processor", unexpected)
    monkeypatch.setattr(native.torch.nn.Module, "register_forward_pre_hook", unexpected)
    monkeypatch.setattr(native.torch.nn.Module, "register_forward_hook", unexpected)
    return touched


@pytest.mark.parametrize(
    "invalid", ["missing", "duplicate", "outside", "bad-factor", "wrong-object", "list"]
)
def test_complete_binding_preflight_refuses_before_any_install(
    native: Any, monkeypatch: Any, invalid: str
) -> None:
    model, bindings, _expected = _tiny_unet(native)
    if invalid == "missing":
        bindings = bindings[:-1]
    elif invalid == "duplicate":
        bindings = (*bindings, bindings[0])
    elif invalid == "outside":
        bindings = (*bindings, native.adapter.TransformerBinding(_transformer(native), 1))
    elif invalid == "bad-factor":
        bindings = (*bindings[:-1], native.adapter.TransformerBinding(bindings[-1].transformer, 3))
    elif invalid == "wrong-object":
        bindings = (*bindings[:-1], native.adapter.TransformerBinding(model, 1))
    elif invalid == "list":
        bindings = list(bindings)
    plan = _plan()
    baseline = _snapshot(model)
    touched = _deny_install_and_tensor_construction(native, monkeypatch)
    with (
        pytest.raises(native.adapter.IllustriousRegionalAdapterError),
        native.adapter.scoped_illustrious_regional_attention(model, bindings=bindings, plan=plan),
    ):
        pytest.fail("Invalid bindings admitted.")
    assert not touched
    _assert_restored(model, baseline)


@pytest.mark.parametrize("alias", ["transformer", "attention"])
def test_shared_aliases_refuse_before_install(native: Any, monkeypatch: Any, alias: str) -> None:
    model, bindings, _expected = _tiny_unet(native)
    first, second = bindings[0].transformer, bindings[1].transformer
    if alias == "transformer":
        model.down_blocks[1].attentions[0] = first
    else:
        second.transformer_blocks[0].attn2 = first.transformer_blocks[0].attn2
    plan = _plan()
    baseline = _snapshot(model)
    touched = _deny_install_and_tensor_construction(native, monkeypatch)
    with (
        pytest.raises(native.adapter.IllustriousRegionalAdapterError),
        native.adapter.scoped_illustrious_regional_attention(model, bindings=bindings, plan=plan),
    ):
        pytest.fail("Shared alias admitted.")
    assert not touched
    _assert_restored(model, baseline)


def test_shared_stateless_original_processor_preserves_independent_native_modules(
    native: Any,
) -> None:
    model, bindings, _expected = _tiny_unet(native)
    shared = bindings[0].transformer.transformer_blocks[0].attn2.processor
    for binding in bindings:
        binding.transformer.transformer_blocks[0].attn2.set_processor(shared)
    baseline = _snapshot(model)
    with native.adapter.scoped_illustrious_regional_attention(
        model, bindings=bindings, plan=_plan()
    ):
        result = model(
            native.torch.randn(2, 4, 3, 5), timestep=7, encoder_hidden_states=_context(native)
        ).sample
        assert result.shape == (2, 4, 3, 5)
        assert native.torch.isfinite(result).all()
    _assert_restored(model, baseline)
    assert all(
        binding.transformer.transformer_blocks[0].attn2.processor is shared for binding in bindings
    )


@pytest.mark.parametrize(
    "forgery", ["profile", "batch", "key-length", "range", "length", "levels", "samples"]
)
def test_forged_plan_refuses_before_any_tensor_construction_or_install(
    native: Any, monkeypatch: Any, forgery: str
) -> None:
    model = _transformer(native)
    plan = _plan()
    if forgery == "profile":
        plan = dataclasses.replace(plan, profile="unqualified")
    elif forgery == "batch":
        plan = dataclasses.replace(plan, batch_signs=("positive", "negative"))
    elif forgery == "key-length":
        plan = dataclasses.replace(plan, key_length=4)
    elif forgery == "length":
        plan = dataclasses.replace(plan, positive=dataclasses.replace(plan.positive, length=2))
    else:
        segment = plan.positive.segments[1]
        if forgery == "range":
            segment = dataclasses.replace(
                segment, token_range=dataclasses.replace(segment.token_range, start=0)
            )
        else:
            pyramid = segment.coverage
            levels = (
                pyramid.levels[:-1]
                if forgery == "levels"
                else (dataclasses.replace(pyramid.levels[0], samples=b""), *pyramid.levels[1:])
            )
            segment = dataclasses.replace(
                segment, coverage=dataclasses.replace(pyramid, levels=levels)
            )
        positive = dataclasses.replace(plan.positive, segments=(plan.positive.segments[0], segment))
        plan = dataclasses.replace(plan, positive=positive)
    bindings = _bindings(native, model)
    baseline = _snapshot(model)
    touched = _deny_install_and_tensor_construction(native, monkeypatch)
    with (
        pytest.raises(native.adapter.IllustriousRegionalAdapterError),
        native.adapter.scoped_illustrious_regional_attention(model, bindings=bindings, plan=plan),
    ):
        pytest.fail("Forged plan admitted.")
    assert not touched
    _assert_restored(model, baseline)


def test_expanded_head_mask_32mib_cap_precedes_dense_allocation_and_install(
    native: Any, monkeypatch: Any
) -> None:
    # Low metadata: Everywhere has no dense alpha planes. B*Q*K fits 32 MiB,
    # while B*heads*Q*K exceeds it, exposing omission of the head multiplier.
    model = _transformer(native)
    plan = _everywhere_plan((256, 256), length=129)
    assert 2 * 256 * 256 * 129 <= 32 * 1024 * 1024
    assert 2 * 2 * 256 * 256 * 129 > 32 * 1024 * 1024
    bindings = _bindings(native, model)
    baseline = _snapshot(model)
    touched = _deny_install_and_tensor_construction(native, monkeypatch)
    with (
        pytest.raises(native.adapter.IllustriousRegionalAdapterError),
        native.adapter.scoped_illustrious_regional_attention(model, bindings=bindings, plan=plan),
    ):
        pytest.fail("Over-ceiling expanded mask admitted.")
    assert not touched
    _assert_restored(model, baseline)


@pytest.mark.parametrize(
    "profile",
    [
        "training",
        "float64",
        "meta",
        "grad",
        "processor",
        "processor-subclass",
        "only-cross",
        "double-self",
        "root-subclass",
        "container",
    ],
)
def test_unsupported_native_profile_refuses_with_exact_restoration(
    native: Any, profile: str
) -> None:
    model = _transformer(native)
    root = model
    if profile == "training":
        model.train()
    elif profile == "float64":
        model.to(dtype=native.torch.float64)
    elif profile == "meta":
        model.to(device="meta")
    elif profile == "processor":
        model.transformer_blocks[0].attn2.set_processor(native.other_processor_type())
    elif profile == "processor-subclass":

        class ProcessorSubclass(native.processor_type):
            pass

        model.transformer_blocks[0].attn2.set_processor(ProcessorSubclass())
    elif profile == "only-cross":
        model = _transformer(native, only_cross_attention=True)
        root = model
    elif profile == "double-self":
        model = _transformer(native, double_self_attention=True)
        root = model
    elif profile == "root-subclass":

        class TransformerSubclass(native.diffusers.Transformer2DModel):
            pass

        root = TransformerSubclass(
            num_attention_heads=2,
            attention_head_dim=4,
            in_channels=8,
            norm_num_groups=4,
            cross_attention_dim=8,
        ).eval()
        model = root
    elif profile == "container":
        root = native.torch.nn.ModuleList([model]).eval()
    baseline = _snapshot(root)
    if profile == "grad":
        with (
            native.torch.inference_mode(False),
            native.torch.enable_grad(),
            pytest.raises(native.adapter.IllustriousRegionalAdapterError),
            native.adapter.scoped_illustrious_regional_attention(
                root, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            pytest.fail("Autograd-enabled scope admitted.")
    else:
        with (
            pytest.raises(native.adapter.IllustriousRegionalAdapterError),
            native.adapter.scoped_illustrious_regional_attention(
                root, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            pytest.fail("Unsupported profile admitted.")
    _assert_restored(root, baseline)


@pytest.mark.parametrize("site", ["parent", "cross-attention"])
@pytest.mark.parametrize("shadow", ["native-bound", "forwarding"])
def test_instance_call_impl_shadow_profile_refuses_before_install(
    native: Any, monkeypatch: Any, site: str, shadow: str
) -> None:
    """Even the identical native bound entry is an unsupported instance shadow."""
    model = _transformer(native)
    attention = model.transformer_blocks[0].attn2
    calls = _count_original(native, monkeypatch, attention)
    target = model if site == "parent" else attention
    assert "_call_impl" not in target.__dict__
    pristine = _snapshot(model)
    native_entry = target._call_impl

    def forward_native(*args: Any, **kwargs: Any) -> Any:
        return native_entry(*args, **kwargs)

    shadow_entry = native_entry if shadow == "native-bound" else forward_native
    target._call_impl = shadow_entry
    baseline = _snapshot(model)
    try:
        with (
            pytest.raises(native.adapter.IllustriousRegionalAdapterError) as caught,
            native.adapter.scoped_illustrious_regional_attention(
                model, bindings=_bindings(native, model), plan=_plan()
            ),
        ):
            pytest.fail("A pre-existing instance call-entry shadow was admitted.")
        assert caught.value.code == "PROFILE_INVALID"
        assert not calls
        assert target.__dict__["_call_impl"] is shadow_entry
        _assert_restored(model, baseline)
    finally:
        del target._call_impl
        _assert_restored(model, pristine)
    # Same real modules, now with their ordinary unshadowed entry, are supported.
    _capture(native, model, _plan(), _hidden(native), _context(native))
    assert len(calls) == 1


@pytest.mark.parametrize(
    "kind", ["float64", "float16", "integer", "rank", "batch", "keys", "width", "meta"]
)
def test_context_tensor_guards_refuse_before_original(
    native: Any, monkeypatch: Any, kind: str
) -> None:
    model = _transformer(native)
    context = _context(native)
    if kind in ("float64", "float16", "integer"):
        context = context.to(
            dtype={
                "float64": native.torch.float64,
                "float16": native.torch.float16,
                "integer": native.torch.int64,
            }[kind]
        )
    elif kind == "rank":
        context = context[0]
    elif kind == "batch":
        context = context[:1]
    elif kind == "keys":
        context = context[:, :2]
    elif kind == "width":
        context = context[:, :, :7]
    elif kind == "meta":
        context = context.to(device="meta")
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    with pytest.raises(native.adapter.IllustriousRegionalAdapterError):
        _direct_under_parent(
            native, model, _plan(), _hidden(native), native.torch.randn(2, 15, 8), context
        )
    assert not calls


@pytest.mark.parametrize("kind", ["float64", "rank", "batch", "queries", "width", "meta"])
def test_query_tensor_guards_refuse_before_original(
    native: Any, monkeypatch: Any, kind: str
) -> None:
    model = _transformer(native)
    queries = native.torch.randn(2, 15, 8)
    if kind == "float64":
        queries = queries.to(dtype=native.torch.float64)
    elif kind == "rank":
        queries = queries[0]
    elif kind == "batch":
        queries = queries[:1]
    elif kind == "queries":
        queries = queries[:, :14]
    elif kind == "width":
        queries = queries[:, :, :7]
    elif kind == "meta":
        queries = queries.to(device="meta")
    calls = _count_original(native, monkeypatch, model.transformer_blocks[0].attn2)
    with pytest.raises(native.adapter.IllustriousRegionalAdapterError):
        _direct_under_parent(native, model, _plan(), _hidden(native), queries, _context(native))
    assert not calls
