"""Authored native flag regression; ROOT alone collects and executes.

Four cases: None equivalence and False/refusal control, each on CPU float32
and optional cuda:0 float16. Reuse the existing small, real-width CLIP/UNet
builder; no trained checkpoint, downloads, artifacts or backend forcing.
Run serially in ROOT's <=3 GiB process group; this is no measured RSS claim.
Largest expanded permission here is 2 * 2 * 6 * 154 = 3,696 Boolean elements.

Pinned pre-fix RED: test_none_matches_false_original_attention_and_regional_forward
[cpu-float32] / [cuda-float16]. The existing strict guard must refuse None with
PROFILE_INVALID before any native attention. The test requires admission, so
that refusal is a failure, never an expected-pass or xfail. Unaffected GREEN:
test_false_control_and_invalid_upcast_refusals with the same profile selectors.
After the identity-only False-or-None fix, both must pass without weaker oracles.

The None model is constructed natively from config, with identical weights to
the False control. Observe and replay the actual original AttnProcessor2_0,
then compare ordinary regional forwards for self-only, cross-only and both
None. Native constructors and attention mathematics are never replaced.
Missing fields, other attention flags/topologies and opt-in trained-checkpoint
qualification remain owned by their existing/separate tests. Optional runtime
or GPU skips are normal in base CI; ROOT qualification requires zero skips.
"""

from __future__ import annotations

import copy
import inspect
from collections.abc import Generator, Iterator
from contextlib import contextmanager
from functools import wraps
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker.illustrious_regional_attention import Alpha8, Everywhere, Shape
from test_illustrious_regional_conditioning import (
    _arguments,  # pyright: ignore[reportPrivateUsage]
    _bindings,  # pyright: ignore[reportPrivateUsage]
    _encode,  # pyright: ignore[reportPrivateUsage]
    _slots,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_conditioning import (
    native as _cpu_builder,
)

SHAPE = Shape(2, 3)
NEGATIVE_ALPHA = bytes((255, 0, 127, 128, 0, 255))
POSITIVE_ALPHA = bytes((0, 255, 128, 127, 255, 0))
_ABSENT = object()


@pytest.fixture(
    scope="module",
    params=("cpu-float32-v1", "cuda-float16-v1"),
    ids=("cpu-float32", "cuda-float16"),
)
def native(request: Any) -> Iterator[Any]:
    """Separate builder lifetime per profile; no CUDA queries on the CPU lane."""
    torch = pytest.importorskip("torch")
    cuda = request.param == "cuda-float16-v1"
    if cuda and not torch.cuda.is_available():
        pytest.skip("optional native CUDA hardware unavailable")
    devices = list(range(torch.cuda.device_count())) if cuda else []
    with torch.random.fork_rng(devices=devices):
        builder: Generator[Any] = cast(Any, _cpu_builder).__wrapped__()
        base: Any = next(builder)
        try:
            device = torch.device("cuda:0" if cuda else "cpu")
            dtype = torch.float16 if cuda else torch.float32
            # Caller preparation precedes every observed consumer. The one-shot
            # conditioning owner does not use the fixture's CPU VAE.
            for model in (
                base.pipeline.text_encoder,
                base.pipeline.text_encoder_2,
                base.pipeline.unet,
            ):
                model.to(device=device, dtype=dtype).eval()
            yield SimpleNamespace(
                **vars(base), tensor_profile=request.param, device=device, dtype=dtype
            )
        finally:
            builder.close()


def _attentions(native: Any, root: Any) -> tuple[tuple[str, Any], ...]:
    return tuple(
        (name, module)
        for name, module in root.named_modules()
        if name.endswith((".attn1", ".attn2"))
        if type(module.processor) is native.processor_type
    )


@contextmanager
def _unchanged(native: Any, root: Any) -> Generator[None]:
    """Exact borrowed-state oracle, including source None config/flag retention."""
    slots = _slots(root)
    entries = tuple(
        (module, name, module.__dict__.get(name, _ABSENT))
        for module in root.modules()
        for name in ("forward", "__call__", "_wrapped_call_impl", "_slow_forward")
    )
    configs = tuple(
        (module, copy.deepcopy(dict(module.config)))
        for module in root.modules()
        if hasattr(module, "config")
    )
    flags = tuple((module, module.upcast_attention) for _, module in _attentions(native, root))
    state = tuple(
        (module, mapping, name, value, value.device, value.dtype, value.detach().clone())
        for module in root.modules()
        for mapping in ("_parameters", "_buffers")
        for name, value in getattr(module, mapping).items()
        if value is not None
    )
    owners = dict(native.adapter._OWNERS)
    processor_call = native.processor_type.__call__
    processor_init = native.processor_type.__init__
    try:
        yield
    finally:
        assert _slots(root) == slots
        for module, name, value in entries:
            assert module.__dict__.get(name, _ABSENT) is value, name
        for module, config in configs:
            assert dict(module.config) == config
        for module, flag in flags:
            assert module.upcast_attention is flag, "consumer repaired source metadata"
        for module, mapping, name, value, device, dtype, contents in state:
            actual = getattr(module, mapping)[name]
            assert actual is value and actual.device == device and actual.dtype == dtype
            assert native.torch.equal(actual, contents), name
        assert native.adapter._OWNERS.keys() == owners.keys()
        assert all(native.adapter._OWNERS[key] is value for key, value in owners.items())
        assert native.processor_type.__call__ is processor_call
        assert native.processor_type.__init__ is processor_init


def _inputs(native: Any, root: Any) -> dict[str, Any]:
    """Encode once; every comparison reuses the same declared tensor objects."""
    bridge, torch = native.bridge, native.torch
    global_pair = bridge.encoded_bindings_from_sdxl_conditioning(
        "global",
        _encode(native, "cat", "blur"),
        negative_coverage=Everywhere(),
        positive_coverage=Everywhere(),
        tensor_profile=native.tensor_profile,
    )
    local_pair = bridge.encoded_bindings_from_sdxl_conditioning(
        "local",
        _encode(native, "dog", "grain"),
        negative_coverage=Alpha8(SHAPE, NEGATIVE_ALPHA),
        positive_coverage=Alpha8(SHAPE, POSITIVE_ALPHA),
        tensor_profile=native.tensor_profile,
    )
    args = _arguments(
        native,
        root,
        shape=SHAPE,
        negative=(global_pair.negative, local_pair.negative),
        positive=(global_pair.positive, local_pair.positive),
    )
    for field in ("sample", "time_ids"):
        args[field] = args[field].to(device=native.device, dtype=native.dtype)
    args["timestep"] = args["timestep"].to(device=native.device, dtype=torch.float32)
    args.update(
        tensor_profile=native.tensor_profile,
        negative_pooled_source_id="global",
        positive_pooled_source_id="global",
        encoder_attention_mask=torch.ones((2, 154), device=native.device, dtype=torch.bool),
    )
    args["encoder_attention_mask"][:, -1] = False
    assert all(
        record.context.shape == (1, 77, 2048)
        for sign in ("negative", "positive")
        for record in args[sign]
    )
    return args


def _clone(native: Any, value: Any) -> Any:
    if type(value) is native.torch.Tensor:
        return value.detach().clone()
    if type(value) is dict:
        return {key: _clone(native, item) for key, item in cast(dict[Any, Any], value).items()}
    return value


def _equal(native: Any, actual: Any, expected: Any) -> None:
    if type(expected) is native.torch.Tensor:
        assert type(actual) is native.torch.Tensor
        assert actual.device == expected.device and actual.dtype == expected.dtype
        assert actual.shape == expected.shape and native.torch.equal(actual, expected)
    elif type(expected) is dict:
        assert actual.keys() == expected.keys()
        for key, value in cast(dict[Any, Any], expected).items():
            _equal(native, actual[key], value)
    else:
        assert actual is expected


@contextmanager
def _observe(native: Any, root: Any, monkeypatch: Any) -> Generator[Any]:
    """Delegate every original processor; wraps preserves native kwarg filtering."""
    sites = {id(module): (name, module.processor) for name, module in _attentions(native, root)}
    original = native.processor_type.__call__
    processor_signature = inspect.signature(original)
    root_signature = inspect.signature(cast(Any, type(root)).forward)
    seen = SimpleNamespace(calls=[], roots=[], results=[])
    before = _slots(root)

    @wraps(original)
    def processor(current: Any, attention: Any, *args: Any, **kwargs: Any) -> Any:
        name, expected_processor = sites[id(attention)]
        assert current is expected_processor
        bound = processor_signature.bind(current, attention, *args, **kwargs)
        bound.apply_defaults()
        inputs = {
            key: _clone(native, bound.arguments[key])
            for key in ("hidden_states", "encoder_hidden_states", "attention_mask", "temb")
        }
        # Record before delegation too: an unexpected native attempt cannot
        # masquerade as a successful preflight refusal if native later raises.
        record = SimpleNamespace(name=name, inputs=inputs, output=None)
        seen.calls.append(record)
        output = original(current, attention, *args, **kwargs)
        record.output = _clone(native, output)
        return output

    def before_root(_module: Any, args: Any, kwargs: Any) -> None:
        bound = root_signature.bind_partial(root, *args, **kwargs).arguments
        seen.roots.append(
            {
                key: _clone(native, bound[key])
                for key in (
                    "sample",
                    "timestep",
                    "encoder_hidden_states",
                    "encoder_attention_mask",
                    "added_cond_kwargs",
                )
            }
        )

    def after_root(_module: Any, _args: Any, result: Any) -> None:
        seen.results.append(result)

    pre = root.register_forward_pre_hook(before_root, with_kwargs=True)
    post = root.register_forward_hook(after_root)
    observed_slots = _slots(root)
    try:
        with monkeypatch.context() as patch:
            patch.setattr(native.processor_type, "__call__", processor)
            yield seen
        assert _slots(root) == observed_slots
    finally:
        pre.remove()
        post.remove()
        assert _slots(root) == before
        assert native.processor_type.__call__ is original


def _normal(native: Any, root: Any, args: dict[str, Any], seen: Any) -> Any:
    result = native.bridge.run_illustrious_regional_conditioning(root, **args)
    assert len(seen.roots) == len(seen.results) == 1 and result is seen.results[0]
    assert type(result).__name__ == "UNet2DConditionOutput"
    assert result.sample.shape == args["sample"].shape
    assert result.sample.device == native.device and result.sample.dtype == native.dtype
    assert native.torch.isfinite(result.sample).all() and not result.sample.requires_grad
    assert len(seen.calls) == len(_attentions(native, root))
    assert {record.name for record in seen.calls} == {name for name, _ in _attentions(native, root)}
    for record in seen.calls:
        assert record.output is not None and native.torch.isfinite(record.output).all()
    return result


def _literal_consumption(native: Any, args: dict[str, Any], seen: Any) -> None:
    torch = native.torch
    context = torch.cat(
        tuple(
            torch.cat(tuple(r.context for r in args[sign]), dim=1)
            for sign in ("negative", "positive")
        )
    )
    pools = torch.cat((args["negative"][0].pooled, args["positive"][0].pooled))
    root = seen.roots[0]
    for field in ("sample", "timestep", "encoder_attention_mask"):
        _equal(native, root[field], args[field])
    _equal(native, root["encoder_hidden_states"], context)
    _equal(native, root["added_cond_kwargs"], {"time_ids": args["time_ids"], "text_embeds": pools})
    expected = torch.ones((2, 2, 6, 154), device=native.device, dtype=torch.bool)
    for sign, visible in enumerate(
        ((True, False, False, True, False, True), (False, True, True, False, True, False))
    ):
        for query, allowed in enumerate(visible):
            expected[sign, :, query, 77:] = allowed
    expected[..., -1] = False
    for record in seen.calls:
        if record.name.endswith(".attn2"):
            _equal(native, record.inputs["encoder_hidden_states"], context)
            mask = record.inputs["attention_mask"]
            assert mask.numel() == 3696
            _equal(native, mask.reshape(2, 2, 6, 154), expected)
        else:
            assert record.inputs["encoder_hidden_states"] is None
            assert record.inputs["attention_mask"] is None


def _same_forward(native: Any, actual: Any, expected: Any, result: Any, baseline: Any) -> None:
    _equal(native, result.sample, baseline.sample)
    _equal(native, actual.roots[0], expected.roots[0])
    assert len(actual.calls) == len(expected.calls)
    for new, old in zip(actual.calls, expected.calls, strict=True):
        assert new.name == old.name
        _equal(native, new.inputs, old.inputs)
        _equal(native, new.output, old.output)


@contextmanager
def _flags(native: Any, root: Any, self_flag: Any, cross_flag: Any) -> Generator[None]:
    previous = tuple((module, module.upcast_attention) for _, module in _attentions(native, root))
    try:
        for name, module in _attentions(native, root):
            module.upcast_attention = self_flag if name.endswith(".attn1") else cross_flag
        yield
        for name, module in _attentions(native, root):
            assert module.upcast_attention is (self_flag if name.endswith(".attn1") else cross_flag)
    finally:
        for module, value in previous:
            module.upcast_attention = value


def test_none_matches_false_original_attention_and_regional_forward(
    native: Any, monkeypatch: Any
) -> None:
    """RED before the fix; exact original-output and normal-forward equivalence after."""
    control = native.pipeline.unet
    assert control.config.upcast_attention is False
    assert all(module.upcast_attention is False for _, module in _attentions(native, control))
    # Native config propagation creates None at BOTH attn1 and attn2. Load only
    # parameter/buffer values; never repair this source config or its flags.
    source = (
        native.diffusers.UNet2DConditionModel.from_config(control.config, upcast_attention=None)
        .to(device=native.device, dtype=native.dtype)
        .eval()
    )
    source.load_state_dict(control.state_dict(), strict=True)
    assert source.config.upcast_attention is None
    assert all(module.upcast_attention is None for _, module in _attentions(native, source))
    assert control.state_dict().keys() == source.state_dict().keys()
    for name, value in control.state_dict().items():
        _equal(native, source.state_dict()[name], value)
    args = _inputs(native, control)
    source_args = {**args, "bindings": _bindings(native, source)}
    with _unchanged(native, control), _unchanged(native, source):
        with _observe(native, control, monkeypatch) as expected:
            baseline = _normal(native, control, args, expected)
        _literal_consumption(native, args, expected)
        # Replay ACTUAL original inputs with the matching source module and
        # processor. This bypasses adapter admission, never native attention.
        source_sites = dict(_attentions(native, source))
        original = native.processor_type.__call__
        for record in expected.calls:
            attention = source_sites[record.name]
            output = original(attention.processor, attention, **record.inputs)
            _equal(native, output, record.output)
        for self_flag, cross_flag in ((None, None), (None, False), (False, None)):
            with _flags(native, source, self_flag, cross_flag):
                with _observe(native, source, monkeypatch) as actual:
                    try:
                        result = _normal(native, source, source_args, actual)
                    except native.adapter.IllustriousRegionalAdapterError as error:
                        assert error.code == "PROFILE_INVALID"
                        assert str(error) == "Unsupported Attention configuration."
                        assert actual.calls == actual.roots == actual.results == []
                        pytest.fail(
                            "None rejected by preflight before native attention: PROFILE_INVALID"
                        )
                _same_forward(native, actual, expected, result, baseline)
                assert source.config.upcast_attention is None
        # Fresh scopes after all None variants, still on the original objects.
        for root, values in ((source, source_args), (control, args)):
            with _observe(native, root, monkeypatch) as fresh:
                result = _normal(native, root, values, fresh)
            _same_forward(native, fresh, expected, result, baseline)


def test_false_control_and_invalid_upcast_refusals(native: Any, monkeypatch: Any) -> None:
    """GREEN with the strict source and after the fix; reject equality/truthiness aliases."""
    root = native.pipeline.unet
    args = _inputs(native, root)
    assert root.config.upcast_attention is False
    assert all(module.upcast_attention is False for _, module in _attentions(native, root))
    bad_values = (True, 0, 1, "false", 0.0, 1.0, "", (), object())
    with _unchanged(native, root):
        with _observe(native, root, monkeypatch) as expected:
            baseline = _normal(native, root, args, expected)
        _literal_consumption(native, args, expected)
        # Every native self/cross site, including late sites: full preflight
        # must refuse before ANY original attention or normal root forward.
        for _name, attention in _attentions(native, root):
            for bad in bad_values:
                with monkeypatch.context() as patch:
                    patch.setattr(attention, "upcast_attention", bad)
                    with _observe(native, root, monkeypatch) as refused:
                        with pytest.raises(native.adapter.IllustriousRegionalAdapterError) as error:
                            native.bridge.run_illustrious_regional_conditioning(root, **args)
                        assert error.value.code == "PROFILE_INVALID"
                        assert refused.calls == refused.roots == refused.results == []
                        assert attention.upcast_attention is bad
                assert attention.upcast_attention is False
            with _observe(native, root, monkeypatch) as fresh:
                result = _normal(native, root, args, fresh)
            _same_forward(native, fresh, expected, result, baseline)


# Append-only mask-path extension: 20 additional cases, preserving the preceding
# four flag cases byte-for-byte. ROOT owns execution under the existing 3 GiB
# group limit. No new model, trained checkpoint or larger geometry is needed.
# RED selector: test_single_unrestricted_bank_preserves_original_native_no_mask_path
# GREEN selector: test_explicit_or_segmented_permissions_keep_boolean_mask
# Both layouts and both fixture profiles are explicit finite axes below.


def _permission_case_inputs(native: Any, layout: str, permissions: str) -> dict[str, Any]:
    """Keep real encoded tensors; vary only the declared permission contract."""
    root = native.pipeline.unet
    args = _inputs(native, root)
    original_negative, original_positive = args["negative"], args["positive"]
    record_type = native.bridge.EncodedTensorBinding
    negative, positive = original_negative[:1], original_positive[:1]
    if permissions == "alpha8-all-255":
        coverage = Alpha8(SHAPE, bytes((255,) * 6))
        negative, positive = tuple(
            (record_type(records[0].binding_id, records[0].context, coverage, records[0].pooled),)
            for records in (negative, positive)
        )
    elif permissions == "segmented-everywhere":
        negative, positive = tuple(
            tuple(
                record_type(record.binding_id, record.context, Everywhere(), record.pooled)
                for record in records
            )
            for records in (original_negative, original_positive)
        )
    elif permissions == "positive-padding":
        # One Everywhere record per sign, but only positive is shorter. Its
        # 77-row padded tail remains emitted even in the positive-only layout.
        negative = (
            record_type(
                negative[0].binding_id,
                native.torch.cat(tuple(record.context for record in original_negative), dim=1),
                Everywhere(),
                negative[0].pooled,
            ),
        )
    else:
        assert permissions in ("single-unrestricted", "prior-all-true")
    args.update(
        negative=negative,
        positive=positive,
        layout=layout,
        encoder_attention_mask=None,
    )
    if layout == "positive-only":
        args["sample"] = args["sample"][1:].contiguous()
        args["time_ids"] = args["time_ids"][1:].contiguous()
    else:
        assert layout == "cfg-negative-first"
    if permissions == "prior-all-true":
        args["encoder_attention_mask"] = native.torch.ones(
            (args["sample"].shape[0], 77), dtype=native.torch.bool, device=native.device
        )
    return args


@contextmanager
def _borrowed_permission_inputs(native: Any, args: dict[str, Any]) -> Generator[None]:
    """Preserve original records/tensor identities, values and explicit coverage."""
    arguments = tuple(args.items())
    records = tuple(
        (
            record,
            record.binding_id,
            record.context,
            record.pooled,
            record.coverage,
            _clone(native, record.context),
            _clone(native, record.pooled),
        )
        for sign in ("negative", "positive")
        for record in args[sign]
    )
    values = {
        name: _clone(native, args[name])
        for name in ("sample", "timestep", "time_ids", "encoder_attention_mask")
    }
    try:
        yield
    finally:
        assert args.keys() == dict(arguments).keys()
        for name, original in arguments:
            assert args[name] is original, name
        for record, binding_id, context, pool, coverage, context_value, pool_value in records:
            assert record.binding_id is binding_id and record.coverage is coverage
            assert record.context is context and record.pooled is pool
            _equal(native, record.context, context_value)
            _equal(native, record.pooled, pool_value)
        for name, value in values.items():
            _equal(native, args[name], value)


def _literal_permission_bank(native: Any, args: dict[str, Any]) -> tuple[Any, Any, Any]:
    """Independent small oracle: concatenate declared rows and zero-pad literally.

    All cases here have spatially full coverage; Alpha8 retains its exact type.
    Both sign lengths determine K even when only the positive row is emitted.
    Never call the consumer's assembler, planner or query/pyramid helpers.
    """
    torch = native.torch
    lengths = {
        sign: sum(record.context.shape[1] for record in args[sign])
        for sign in ("negative", "positive")
    }
    keys = max(lengths.values())
    signs = ("negative", "positive") if args["layout"] == "cfg-negative-first" else ("positive",)
    context = torch.zeros((len(signs), keys, 2048), device=native.device, dtype=native.dtype)
    allowed = torch.zeros((len(signs), 2, 6, keys), device=native.device, dtype=torch.bool)
    pools: list[Any] = []
    for row, sign in enumerate(signs):
        for record in args[sign]:
            coverage = record.coverage
            if type(coverage) is Alpha8:
                assert coverage.shape == SHAPE and coverage.samples == bytes((255,) * 6)
            else:
                assert type(coverage) is Everywhere
        literal = torch.cat(tuple(record.context for record in args[sign]), dim=1)
        context[row : row + 1, : lengths[sign]].copy_(literal)
        allowed[row, :, :, : lengths[sign]] = True
        source_id = args[sign + "_pooled_source_id"]
        pools.append(next(record.pooled for record in args[sign] if record.binding_id == source_id))
    if args["encoder_attention_mask"] is not None:
        allowed &= args["encoder_attention_mask"][:, None, None, :]
    assert allowed.numel() <= 3696 and allowed.any(dim=-1).all()
    return context, torch.cat(tuple(pools)), allowed


def _assert_permission_consumption(
    native: Any, args: dict[str, Any], seen: Any, context: Any, pools: Any, mask: Any
) -> None:
    assert len(seen.roots) == len(seen.results) == 1
    root_inputs = seen.roots[0]
    for field in ("sample", "timestep", "encoder_attention_mask"):
        _equal(native, root_inputs[field], args[field])
    _equal(native, root_inputs["encoder_hidden_states"], context)
    _equal(
        native,
        root_inputs["added_cond_kwargs"],
        {"time_ids": args["time_ids"], "text_embeds": pools},
    )
    cross = [record for record in seen.calls if record.name.endswith(".attn2")]
    assert cross and len(seen.calls) == len(_attentions(native, native.pipeline.unet))
    for record in cross:
        _equal(native, record.inputs["encoder_hidden_states"], context)
        actual = record.inputs["attention_mask"]
        if mask is None:
            assert actual is None, "single unrestricted bank changed original native no-mask path"
        else:
            assert type(actual) is native.torch.Tensor and actual.dtype == native.torch.bool
            assert actual.numel() == mask.numel()
            _equal(native, actual.reshape(mask.shape), mask)
            assert actual.reshape(mask.shape).any(dim=-1).all()
    for record in seen.calls:
        if record.name.endswith(".attn1"):
            assert record.inputs["encoder_hidden_states"] is None
            assert record.inputs["attention_mask"] is None


@pytest.mark.parametrize("layout", ("cfg-negative-first", "positive-only"))
def test_single_unrestricted_bank_preserves_original_native_no_mask_path(
    native: Any, monkeypatch: Any, layout: str
) -> None:
    """Four RED cases: original no-mask identity AND exact ordinary UNet result.

    Before elision, actual expanded all-True masks must fail the explicit None
    assertion. Numerical coincidence on a small model cannot make this GREEN.
    The ordinary baseline uses the original native root without any plan/scope.
    """
    root = native.pipeline.unet
    args = _permission_case_inputs(native, layout, "single-unrestricted")
    context, pools, permissions = _literal_permission_bank(native, args)
    assert permissions.all() and args["encoder_attention_mask"] is None
    assert all(
        len(args[sign]) == 1
        and type(args[sign][0].coverage) is Everywhere
        and args[sign][0].context.shape[1] == 77
        for sign in ("negative", "positive")
    )
    with _unchanged(native, root), _borrowed_permission_inputs(native, args):
        assert all(id(module) not in native.adapter._OWNERS for module in root.modules())
        with _observe(native, root, monkeypatch) as ordinary:
            baseline = root(
                args["sample"],
                timestep=args["timestep"],
                encoder_hidden_states=context,
                encoder_attention_mask=None,
                added_cond_kwargs={"text_embeds": pools, "time_ids": args["time_ids"]},
            )
        assert type(baseline).__name__ == "UNet2DConditionOutput"
        assert ordinary.results[0] is baseline
        assert native.torch.isfinite(baseline.sample).all()
        _assert_permission_consumption(native, args, ordinary, context, pools, None)
        # Two fresh regional lifetimes use the same model and borrowed inputs;
        # every processor must retain native None rather than an all-True mask.
        for _ in range(2):
            with _observe(native, root, monkeypatch) as regional:
                result = _normal(native, root, args, regional)
            _assert_permission_consumption(native, args, regional, context, pools, None)
            _same_forward(native, regional, ordinary, result, baseline)


@pytest.mark.parametrize("layout", ("cfg-negative-first", "positive-only"))
@pytest.mark.parametrize(
    "permissions",
    ("prior-all-true", "alpha8-all-255", "segmented-everywhere", "positive-padding"),
)
def test_explicit_or_segmented_permissions_keep_boolean_mask(
    native: Any, monkeypatch: Any, layout: str, permissions: str
) -> None:
    """Sixteen GREEN controls: no prior/alpha/segment/padding mask elision.

    The first three controls deliberately yield all-True Boolean permissions;
    they still require a real expanded mask. Positive padding is nontrivial in
    BOTH layouts, even when the negative bank is validated but not emitted.
    """
    root = native.pipeline.unet
    args = _permission_case_inputs(native, layout, permissions)
    context, pools, allowed = _literal_permission_bank(native, args)
    if permissions == "positive-padding":
        assert args["negative"][0].context.shape[1] == 154
        assert args["positive"][0].context.shape[1] == 77
        assert allowed[-1, :, :, :77].all() and not allowed[-1, :, :, 77:].any()
        if layout == "cfg-negative-first":
            assert allowed[0].all()
    else:
        assert allowed.all()
    with _unchanged(native, root), _borrowed_permission_inputs(native, args):
        with _observe(native, root, monkeypatch) as expected:
            baseline = _normal(native, root, args, expected)
        _assert_permission_consumption(native, args, expected, context, pools, allowed)
        with _observe(native, root, monkeypatch) as fresh:
            result = _normal(native, root, args, fresh)
        _assert_permission_consumption(native, args, fresh, context, pools, allowed)
        _same_forward(native, fresh, expected, result, baseline)
