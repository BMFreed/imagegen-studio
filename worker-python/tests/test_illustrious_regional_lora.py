"""Authored regional LoRA contracts; ROOT alone imports, runs and mutates.

InvokeAI a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd is the arithmetic reference:
backend/patches/layers/lora_layer.py, lora_layer_base.py and layer_patcher.py;
app/invocations/text_encoder/compel.py and sd/denoise_latents.py are callers.
The oracle below uses independent low-rank arithmetic and native projections.
It never calls the ordinary qualifier to construct the expected fused weights.

Preparation owns a fresh job pipeline. Borrowed-state preservation starts AFTER
fusion; failed numeric preparation makes that owned pipeline disposable. Later
file/shape/rank qualification must still precede the first weight write.

The named CLIP2 and UNet RED selectors reach actual native weights, signed
regional contexts, dense attention and original UNet predictions. The empty
selector is their GREEN neighbor. ROOT's component-selection mutation must not
produce an import/setup failure. Local initialized safetensors are mechanical
fixtures, never trained adapters or a visual/public-readiness qualification.
"""

from __future__ import annotations

import contextlib
import copy
import hashlib
import json
import sys
from collections.abc import Generator, Iterator
from dataclasses import replace
from functools import wraps
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest

from imagegen_worker import illustrious_regional_lora as preparation
from imagegen_worker import illustrious_regional_worker as worker
from imagegen_worker import inference_main
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference import (
    EmbeddingConditioningInputs,
    MLRuntime,
    build_sdxl_conditioning,
)
from imagegen_worker.protocol import GenerationLora
from test_illustrious_regional_denoising import (
    _observe as _native_observer,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _bind,  # pyright: ignore[reportPrivateUsage]
    _call,  # pyright: ignore[reportPrivateUsage]
    _consumption,  # pyright: ignore[reportPrivateUsage]
    _models,  # pyright: ignore[reportPrivateUsage]
    _normal_result,  # pyright: ignore[reportPrivateUsage]
    _observe,  # pyright: ignore[reportPrivateUsage]
    _preserved,  # pyright: ignore[reportPrivateUsage]
    _rows,  # pyright: ignore[reportPrivateUsage]
    _with_resources,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_embeddings import (
    _save as _save_ti,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_recipe import (
    _parameters,  # pyright: ignore[reportPrivateUsage]
    _recipe,  # pyright: ignore[reportPrivateUsage]
    _region,  # pyright: ignore[reportPrivateUsage]
)
from test_illustrious_regional_worker import (
    _case,  # pyright: ignore[reportPrivateUsage]
    _global_ti_case,  # pyright: ignore[reportPrivateUsage]
    _seal,  # pyright: ignore[reportPrivateUsage]
)
from test_sdxl_lora import (
    _save,  # pyright: ignore[reportPrivateUsage]
    _state,  # pyright: ignore[reportPrivateUsage]
)
from test_sdxl_lora import native as _small_source

PREFIXES = {"unet": "lora_unet_", "text_encoder": "lora_te1_", "text_encoder_2": "lora_te2_"}
CLIP2_PATH = "text_encoder_2.text_model.encoder.layers.0.mlp.fc1"
UNET_PATH = "unet.down_blocks.0.attentions.0.transformer_blocks.0.attn2.to_v"


@pytest.fixture
def small(tmp_path: Path) -> Iterator[Any]:
    """Fresh CPU components, not a cached borrowed fixture being patched."""
    source: Iterator[Any] = cast(Any, _small_source).__wrapped__(tmp_path)
    try:
        yield next(source)
    finally:
        cast(Any, source).close()


@pytest.fixture(params=("cpu", "cuda"))
def small_lane(small: Any, request: pytest.FixtureRequest) -> Any:
    torch, pipeline = small
    if request.param == "cuda":
        if not torch.cuda.is_available():
            pytest.skip("optional native CUDA hardware unavailable")
        pipeline.to(device="cuda:0", dtype=torch.float16)
    return torch, pipeline


@pytest.fixture(params=("cpu", "cuda"))
def regional_lane(request: pytest.FixtureRequest) -> Iterator[Any]:
    with _models(request.param) as native:
        yield native


def _module(pipeline: Any, path: str) -> Any:
    component, child = path.split(".", 1)
    return getattr(pipeline, component).get_submodule(child)


def _stem(path: str) -> str:
    component, child = path.split(".", 1)
    return PREFIXES[component] + child.replace(".", "_")


def _pair(torch: Any, pipeline: Any, path: str, *, marker: float = 0.0) -> dict[str, Any]:
    """Deterministic, nonconstant factors; constructing them consumes no RNG."""
    module = _module(pipeline, path)
    down_shape = (2, *module.weight.shape[1:])
    up_shape = (module.weight.shape[0], 2, *([1, 1] if module.weight.ndim == 4 else []))
    down = (torch.arange(module.weight[0].numel() * 2).float() * 0.073 + marker).sin()
    up = (torch.arange(module.weight.shape[0] * 2).float() * 0.137 + marker + 0.4).cos()
    return {
        _stem(path) + ".lora_down.weight": (down * 0.12).reshape(down_shape),
        _stem(path) + ".lora_up.weight": (up * 0.12).reshape(up_shape),
        _stem(path) + ".alpha": torch.tensor(1.5),
    }


def _expected(
    torch: Any,
    pipeline: Any,
    paths: tuple[str, ...],
    stack: tuple[tuple[dict[str, Any], float], ...],
) -> dict[str, Any]:
    """Invoke arithmetic, independently indexed by the authored fixture paths."""
    expected = {path: _module(pipeline, path).weight.detach().clone() for path in paths}
    for state, weight in stack:
        for path in paths:
            stem = _stem(path)
            if stem + ".lora_down.weight" not in state or weight == 0:
                continue
            down, up = state[stem + ".lora_down.weight"], state[stem + ".lora_up.weight"]
            rank = down.shape[0]
            alpha = float(state[stem + ".alpha"].item()) if stem + ".alpha" in state else rank
            target = expected[path]
            residual = up.to(device=target.device, dtype=torch.float32).reshape(up.shape[0], -1)
            residual = residual @ down.to(device=target.device, dtype=torch.float32).reshape(
                rank, -1
            )
            residual = (residual * (weight * (alpha / rank))).reshape(target.shape)
            expected[path] = target + residual.to(dtype=target.dtype)
    return expected


def _snapshot(pipeline: Any) -> tuple[Any, ...]:
    return tuple(
        (
            module,
            type(module),
            module.training,
            module.weight,
            module.weight.detach(),
            module.weight.detach().clone(),
            module.weight.requires_grad,
        )
        for component in PREFIXES
        for module in getattr(pipeline, component).modules()
        if hasattr(module, "weight") and module.weight is not None
    )


def _assert_unchanged(torch: Any, records: tuple[Any, ...]) -> None:
    for module, cls, training, parameter, alias, value, requires_grad in records:
        assert type(module) is cls and module.training is training
        assert module.weight is parameter and parameter.requires_grad is requires_grad
        assert parameter.dtype == value.dtype and parameter.device == value.device
        assert parameter.data_ptr() == alias.data_ptr()
        assert torch.equal(parameter, value)


@pytest.mark.parametrize("weight", (0.0, 1.0, -0.5, 0.0001, 1e-10))
def test_native_fused_linear_conv_both_clips_and_signed_tiny_zero(
    small_lane: Any, tmp_path: Path, weight: float
) -> None:
    torch, pipeline = small_lane
    state, inputs = _state(torch, pipeline)
    paths = tuple(inputs)
    expected = _expected(torch, pipeline, paths, ((state, weight),))
    before = _snapshot(pipeline)
    rng = torch.random.get_rng_state().clone()
    cuda_rng = torch.cuda.get_rng_state_all() if torch.cuda.is_initialized() else None
    lora = _save(tmp_path / "signed.safetensors", state, weight)
    preparation.prepare_regional_loras(pipeline, (lora,), torch)
    assert torch.equal(torch.random.get_rng_state(), rng)
    if cuda_rng is not None:
        assert all(
            torch.equal(a, b) for a, b in zip(torch.cuda.get_rng_state_all(), cuda_rng, strict=True)
        )
    assert pipeline.get_list_adapters() == {}
    for module, cls, training, parameter, alias, value, requires_grad in before:
        assert type(module) is cls and module.training is training
        assert module.weight is parameter and parameter.requires_grad is requires_grad
        assert parameter.dtype == value.dtype and parameter.device == value.device
        assert torch.equal(alias, value), "fusion must leave the prior storage untouched"
    for path in paths:
        module = _module(pipeline, path)
        assert torch.equal(module.weight, expected[path]), path
        value = inputs[path].to(device=module.weight.device, dtype=module.weight.dtype)
        if type(module) is torch.nn.Linear:
            projected = torch.nn.functional.linear(value, expected[path], module.bias)
        else:
            projected = torch.nn.functional.conv2d(
                value,
                expected[path],
                module.bias,
                module.stride,
                module.padding,
                module.dilation,
                module.groups,
            )
        assert torch.equal(module(value), projected), path
        record = next(record for record in before if record[0] is module)
        if weight == 0:
            assert module.weight.data_ptr() == record[4].data_ptr()
        else:
            assert module.weight.data_ptr() != record[4].data_ptr()


def test_ordered_distinct_same_bytes_keep_both_signed_updates(
    small_lane: Any, tmp_path: Path
) -> None:
    torch, pipeline = small_lane
    state, inputs = _state(torch, pipeline)
    first = _save(tmp_path / "first.safetensors", state, -0.5)
    second = _save(tmp_path / "second.safetensors", state, 0.75)
    assert first.sha256 == second.sha256 and first.path != second.path
    expected = _expected(torch, pipeline, tuple(inputs), ((state, -0.5), (state, 0.75)))
    preparation.prepare_regional_loras(pipeline, (first, second), torch)
    for path, value in expected.items():
        assert torch.equal(_module(pipeline, path).weight, value), path
    assert pipeline.get_list_adapters() == {}


@pytest.mark.parametrize(
    "path,dtype",
    (
        ("text_encoder.text_model.encoder.layers.0.self_attn.q_proj", "float32"),
        ("text_encoder.text_model.encoder.layers.0.mlp.fc1", "float16"),
        ("text_encoder_2.text_model.encoder.layers.0.mlp.fc2", "bfloat16"),
        ("text_encoder_2.text_projection", "float32"),
        ("unet.down_blocks.1.resnets.0.conv_shortcut", "float32"),
    ),
)
def test_native_isolated_target_source_dtypes_and_projection(
    small: Any, tmp_path: Path, path: str, dtype: str
) -> None:
    torch, pipeline = small
    state = {
        key: value.to(getattr(torch, dtype)) for key, value in _pair(torch, pipeline, path).items()
    }
    expected = _expected(torch, pipeline, (path,), ((state, -0.3),))
    lora = _save(tmp_path / "subset.safetensors", state, -0.3)
    preparation.prepare_regional_loras(pipeline, (lora,), torch)
    assert torch.equal(_module(pipeline, path).weight, expected[path])
    assert pipeline.get_list_adapters() == {}


@pytest.mark.parametrize("fault", ("missing", "unknown", "shape", "rank", "nonfinite"))
def test_later_invalid_resource_or_target_precedes_every_weight_write(
    small: Any, tmp_path: Path, fault: str
) -> None:
    torch, pipeline = small
    state, _ = _state(torch, pipeline)
    first = _save(tmp_path / "first.safetensors", state, 0.7)
    bad = {key: tensor.clone() for key, tensor in state.items()}
    stem = "lora_unet_conv_in"
    if fault == "unknown":
        bad[stem + ".dora_scale"] = torch.ones(1)
    elif fault == "shape":
        bad[stem + ".lora_down.weight"] = torch.ones(2, 7, 3, 3)
    elif fault == "rank":
        bad[stem + ".lora_up.weight"] = torch.ones(8, 3, 1, 1)
    elif fault == "nonfinite":
        bad[stem + ".lora_down.weight"][0, 0, 0, 0] = float("nan")
    second = _save(tmp_path / "later.safetensors", bad, -0.5)
    if fault == "missing":
        second.path.unlink()
    before = _snapshot(pipeline)
    with pytest.raises(DerivativeError) as error:
        preparation.prepare_regional_loras(pipeline, (first, second), torch)
    assert error.value.code in {"GENERATION_INPUT_CHANGED", "GENERATION_LORA_UNSUPPORTED"}
    _assert_unchanged(torch, before)


@pytest.mark.parametrize("fault", ("missing", "corrupt", "nonfinite", "shape", "rank"))
def test_enabled_zero_is_still_a_verified_resource(small: Any, tmp_path: Path, fault: str) -> None:
    torch, pipeline = small
    state, _ = _state(torch, pipeline)
    if fault == "nonfinite":
        state["lora_unet_conv_in.lora_down.weight"][0, 0, 0, 0] = float("inf")
    elif fault == "shape":
        state["lora_unet_conv_in.lora_down.weight"] = torch.ones(2, 7, 3, 3)
    elif fault == "rank":
        state["lora_unet_conv_in.lora_up.weight"] = torch.ones(8, 3, 1, 1)
    lora = _save(tmp_path / "zero.safetensors", state, 0)
    if fault == "missing":
        lora.path.unlink()
    elif fault == "corrupt":
        lora.path.write_bytes(b"corrupt")
    before = _snapshot(pipeline)
    with pytest.raises(DerivativeError):
        preparation.prepare_regional_loras(pipeline, (lora,), torch)
    _assert_unchanged(torch, before)


def test_fp32_factor_above_half_range_can_have_finite_small_residual(
    small_lane: Any, tmp_path: Path
) -> None:
    torch, pipeline = small_lane
    path = "text_encoder_2.text_projection"
    state = _pair(torch, pipeline, path)
    state[_stem(path) + ".lora_down.weight"].fill_(70_000)
    state[_stem(path) + ".lora_up.weight"].fill_(0.1)
    expected = _expected(torch, pipeline, (path,), ((state, 1e-6),))
    lora = _save(tmp_path / "fp32-factors.safetensors", state, 1e-6)
    preparation.prepare_regional_loras(pipeline, (lora,), torch)
    assert torch.equal(_module(pipeline, path).weight, expected[path])
    assert bool(torch.isfinite(_module(pipeline, path).weight).all())


@pytest.mark.parametrize("fault", ("residual", "updated"))
def test_fp16_nonzero_residual_or_sum_overflow_refuses(
    small: Any, tmp_path: Path, fault: str
) -> None:
    torch, pipeline = small
    path = "text_encoder_2.text_projection"
    module = _module(pipeline, path)
    module.to(dtype=torch.float16)
    state = _pair(torch, pipeline, path)
    state[_stem(path) + ".lora_down.weight"].fill_(1)
    state[_stem(path) + ".lora_up.weight"].fill_(100_000 if fault == "residual" else 10_000)
    if fault == "updated":
        with torch.no_grad():
            module.weight.fill_(60_000)
    lora = _save(tmp_path / "overflow.safetensors", state, 1)
    before = _snapshot(pipeline)
    with pytest.raises(DerivativeError, match="non-finite"):
        preparation.prepare_regional_loras(pipeline, (lora,), torch)
    _assert_unchanged(torch, before)


def _tripwire(*args: Any, **kwargs: Any) -> Any:
    raise AssertionError("expensive operation ran before the defensive cap refusal")


@pytest.mark.parametrize("fault", ("adapter", "shadow"))
def test_existing_adapters_or_shadowed_native_targets_refuse_before_writes(
    small: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    torch, pipeline = small
    path = "text_encoder_2.text_projection"
    state = _pair(torch, pipeline, path)
    lora = _save(tmp_path / "not-fresh.safetensors", state, -0.5)
    module = _module(pipeline, path)
    if fault == "adapter":
        monkeypatch.setattr(module, "_hf_peft_config_loaded", True, raising=False)
    else:
        monkeypatch.setattr(module, "forward", module.forward)
    before = _snapshot(pipeline)
    with pytest.raises(DerivativeError):
        preparation.prepare_regional_loras(pipeline, (lora,), torch)
    _assert_unchanged(torch, before)


def test_serialized_cap_refuses_from_metadata_before_read_or_deserialization(
    small: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, pipeline = small
    monkeypatch.setattr(preparation, "MAX_REGIONAL_LORA_BYTES", 7)
    monkeypatch.setattr(preparation, "read_lora_snapshot", _tripwire)
    lora = GenerationLora(tmp_path / "unopened.safetensors", "a" * 64, 8, 0)
    before = _snapshot(pipeline)
    with pytest.raises(DerivativeError, match="serialized"):
        preparation.prepare_regional_loras(pipeline, (lora,), torch)
    _assert_unchanged(torch, before)


def test_workspace_cap_refuses_before_low_rank_matmul(
    small: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, pipeline = small
    state, _ = _state(torch, pipeline)
    lora = _save(tmp_path / "work.safetensors", state, 0.7)
    monkeypatch.setattr(preparation, "MAX_REGIONAL_LORA_WORK_BYTES", 1)
    monkeypatch.setattr(torch.Tensor, "__matmul__", _tripwire)
    before = _snapshot(pipeline)
    with pytest.raises(DerivativeError, match="workspace"):
        preparation.prepare_regional_loras(pipeline, (lora,), torch)
    _assert_unchanged(torch, before)


def _resource(path: Path, weight: float = -0.5) -> GenerationLora:
    """Valid tiny safetensors bytes; worker handoff spies never deserialize them."""
    header = json.dumps(
        {
            "lora_unet_conv_in.lora_down.weight": {
                "dtype": "F32",
                "shape": [1, 4, 3, 3],
                "data_offsets": [0, 144],
            },
            "lora_unet_conv_in.lora_up.weight": {
                "dtype": "F32",
                "shape": [8, 1, 1, 1],
                "data_offsets": [144, 176],
            },
        },
        separators=(",", ":"),
    ).encode()
    header += b" " * (-len(header) % 8)
    data = len(header).to_bytes(8, "little") + header + b"\x00\x00\x80\x3f" * 44
    path.write_bytes(data)
    return GenerationLora(path, hashlib.sha256(data).hexdigest(), len(data), weight)


@pytest.mark.parametrize(
    "fault", ("symlink", "digest", "size", "inside-staging", "checkpoint", "conflict", "duplicate")
)
def test_resource_reverification_refuses_unsafe_or_changed_descriptors(
    tmp_path: Path, fault: str
) -> None:
    root = tmp_path / "owned"
    root.mkdir()
    checkpoint = tmp_path / "checkpoint.safetensors"
    lora = _resource(tmp_path / "resource.safetensors")
    stack = (lora,)
    if fault == "symlink":
        link = tmp_path / "link.safetensors"
        link.symlink_to(lora.path)
        stack = (replace(lora, path=link),)
    elif fault == "digest":
        stack = (replace(lora, sha256="b" * 64),)
    elif fault == "size":
        stack = (replace(lora, byte_size=lora.byte_size + 1),)
    elif fault == "inside-staging":
        stack = (_resource(root / "resource.safetensors"),)
    elif fault == "checkpoint":
        stack = (_resource(checkpoint),)
    elif fault == "conflict":
        stack = (lora, replace(lora, sha256="b" * 64))
    elif fault == "duplicate":
        stack = (lora, replace(lora, weight=0))
    with pytest.raises(DerivativeError):
        preparation.verify_regional_lora_resources(stack, root, checkpoint)


def test_resource_budget_counts_distinct_paths_and_empty_disabled_subset_opens_nothing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "owned"
    root.mkdir()
    checkpoint = tmp_path / "checkpoint.safetensors"
    first, second = _resource(tmp_path / "a.safetensors"), _resource(tmp_path / "b.safetensors", 0)
    monkeypatch.setattr(preparation, "MAX_REGIONAL_LORA_BYTES", first.byte_size + second.byte_size)
    preparation.verify_regional_lora_resources((first, second), root, checkpoint)
    monkeypatch.setattr(
        preparation, "MAX_REGIONAL_LORA_BYTES", first.byte_size + second.byte_size - 1
    )
    monkeypatch.setattr(preparation, "read_lora_snapshot", _tripwire)
    with pytest.raises(DerivativeError, match="serialized"):
        preparation.verify_regional_lora_resources((first, second), root, checkpoint)
    preparation.verify_regional_lora_resources((), root, checkpoint)


def _streams(native: Any, recipe: Any) -> tuple[Any, ...]:
    prompts = [
        (recipe["globalPrompts"]["positive"]["text"], recipe["globalPrompts"]["negative"]["text"])
    ]
    prompts.extend(
        (region["positive"]["text"], region["negative"]["prompt"]["text"])
        for region in recipe["regions"]
    )
    return tuple(
        build_sdxl_conditioning(_parameters(positive, negative), native.pipeline, native.runtime)
        for positive, negative in prompts
    )


@contextlib.contextmanager
def _observe_plain(native: Any, monkeypatch: pytest.MonkeyPatch) -> Generator[Any, None, None]:
    """Observe the original no-TI fast path without requiring private TI copies."""
    with (
        _native_observer(native.denoising, native, monkeypatch) as seen,
        monkeypatch.context() as patch,
    ):
        seen.pairs = []

        @wraps(build_sdxl_conditioning)
        def build(parameters: Any, pipeline: Any, runtime: Any, **kwargs: Any) -> Any:
            inputs = kwargs["embedding_inputs"]
            assert type(inputs) is EmbeddingConditioningInputs
            assert inputs.managers == (None, None)
            assert pipeline.tokenizer is native.pipeline.tokenizer
            assert pipeline.tokenizer_2 is native.pipeline.tokenizer_2
            assert pipeline.text_encoder is native.pipeline.text_encoder
            assert pipeline.text_encoder_2 is native.pipeline.text_encoder_2
            assert not parameters.positive_embeddings and not parameters.negative_embeddings
            result = build_sdxl_conditioning(parameters, pipeline, runtime, **kwargs)
            seen.pairs.append(SimpleNamespace(result=result))
            return result

        for name, module in tuple(sys.modules.items()):
            if name.startswith("imagegen_worker.") and cast(Any, module) is not None:
                for key, value in tuple(vars(module).items()):
                    if (
                        value is build_sdxl_conditioning
                        or getattr(value, "__wrapped__", None) is build_sdxl_conditioning
                    ):
                        patch.setattr(module, key, build)
        yield seen


def _semantic_preparation(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    torch, pipeline = native.torch, native.pipeline
    recipe = _with_resources(_recipe(_region()))
    before_streams = _streams(native, recipe)
    with _observe_plain(native, monkeypatch) as baseline:
        original = _call(native, recipe, one_shot=True)
    _normal_result(native, baseline, original, 1, one_shot=True)
    state = _pair(torch, pipeline, path)
    expected = _expected(torch, pipeline, (path,), ((state, -0.5),))
    module = _module(pipeline, path)
    original_data = module.weight.data
    try:
        module.weight.data = expected[path]
        expected_streams = _streams(native, recipe)
    finally:
        module.weight.data = original_data
    lora = _save(tmp_path / "regional.safetensors", state, -0.5)
    preparation.prepare_regional_loras(pipeline, (lora,), torch)
    with _preserved(native), _observe_plain(native, monkeypatch) as observed:
        result = _call(native, recipe, one_shot=True)
    _normal_result(native, observed, result, 1, one_shot=True)
    _consumption(native, observed, expected_streams)
    assert not torch.equal(result.sample, original.sample), "native UNet prediction lost the LoRA"
    assert torch.equal(module.weight, expected[path]), "actual native target lost its LoRA"
    if path == CLIP2_PATH:
        for old, expected_pair, actual in zip(
            before_streams, expected_streams, observed.pairs, strict=True
        ):
            for sign in ("positive", "negative"):
                before_context = getattr(old, sign)
                after_context = getattr(actual.result, sign)
                assert torch.equal(before_context[:, :, :768], after_context[:, :, :768])
                assert not torch.equal(before_context[:, :, 768:], after_context[:, :, 768:])
                assert torch.equal(after_context, getattr(expected_pair, sign))
    else:
        assert torch.equal(observed.contexts[0], baseline.contexts[0])
        assert not torch.equal(observed.outputs[0], baseline.outputs[0]), (
            "dense native attention lost LoRA"
        )


def test_regional_lora_clip2_consumption_red(
    regional_lane: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _semantic_preparation(regional_lane, tmp_path, monkeypatch, CLIP2_PATH)


def test_regional_lora_unet_consumption_red(
    regional_lane: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _semantic_preparation(regional_lane, tmp_path, monkeypatch, UNET_PATH)


def test_regional_lora_empty_control_green(
    regional_lane: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    native, recipe = regional_lane, _with_resources(_recipe(_region()))
    expected = _streams(native, recipe)
    with _preserved(native), _observe_plain(native, monkeypatch) as baseline:
        original = _call(native, recipe, one_shot=True)
    with _preserved(native):
        preparation.prepare_regional_loras(native.pipeline, (), native.torch)
    with _preserved(native), _observe_plain(native, monkeypatch) as observed:
        repeated = _call(native, recipe, one_shot=True)
    _normal_result(native, observed, repeated, 1, one_shot=True)
    _consumption(native, observed, expected)
    assert native.torch.equal(original.sample, repeated.sample)
    assert native.torch.equal(baseline.contexts[0], observed.contexts[0])
    assert native.torch.equal(baseline.outputs[0], observed.outputs[0])


@pytest.mark.parametrize("failure", (False, True))
def test_ti_combination_preserves_fused_borrowed_baseline_after_success_or_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: bool
) -> None:
    with _models("cpu") as native:
        state = _pair(native.torch, native.pipeline, CLIP2_PATH)
        lora = _save(tmp_path / "combined.safetensors", state, -0.5)
        preparation.prepare_regional_loras(native.pipeline, (lora,), native.torch)
        fused = _module(native.pipeline, CLIP2_PATH).weight.detach().clone()
        a, b = _save_ti(tmp_path, native, 1), _save_ti(tmp_path, native, 2)
        recipe = _with_resources(_recipe(_region(positive="SAME"), positive="SAME"))
        _bind(recipe, None, "positive", a)
        _bind(recipe, 0, "positive", b)
        if failure:
            cls = cast(Any, type(native.pipeline.unet))
            forward = cls.forward

            @wraps(forward)
            def fail(current: Any, *args: Any, **kwargs: Any) -> Any:
                if current is native.pipeline.unet:
                    raise RuntimeError("explicit native post-conditioning failure")
                return forward(current, *args, **kwargs)

            with monkeypatch.context() as patch:
                patch.setattr(cls, "forward", fail)
                with _preserved(native), pytest.raises(RuntimeError, match="post-conditioning"):
                    _call(native, recipe, one_shot=True)
        with _preserved(native), _observe(native, monkeypatch) as observed:
            result = _call(native, recipe, one_shot=True)
        _normal_result(native, observed, result, 1, one_shot=True)
        _rows(native, observed, 0, "positive", a.tensors)
        _rows(native, observed, 1, "positive", b.tensors)
        assert native.torch.equal(_module(native.pipeline, CLIP2_PATH).weight, fused)


def _wire_entry(lora: GenerationLora) -> dict[str, Any]:
    return {
        "path": str(lora.path),
        "sha256": lora.sha256,
        "byteSize": lora.byte_size,
        "weight": lora.weight,
    }


@pytest.mark.parametrize("enabled", (False, True))
def test_public_worker_handoff_fuses_once_before_eval_hooks_and_bindings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, enabled: bool
) -> None:
    """Real dispatch/parser/files; fake factory and output, explicitly no native model claim."""
    case = _global_ti_case(tmp_path)
    case.bundle["compositionProfile"] = "invoke-canvas-v1"
    lora = _resource(tmp_path / "logical.safetensors", 0)
    case.request["job"]["loras"] = [_wire_entry(lora)] if enabled else []
    _seal(case)
    parsed = worker.parse_regional_request(case.wire)
    assert parsed.command.loras == ((lora,) if enabled else ())
    assert parsed.parameters.loras == parsed.command.loras
    original_recipe = copy.deepcopy(parsed.recipe)
    original_wire = copy.deepcopy(case.wire)
    calls: list[str] = []
    component = SimpleNamespace(eval=lambda: calls.append("eval"))
    pipeline = SimpleNamespace(
        text_encoder=component, text_encoder_2=component, unet=component, vae=component
    )
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    expected = {
        "type": "generation-done",
        "protocolVersion": "1",
        "requestId": "private-1",
        "outputPath": str(case.root / "result.png"),
        "seed": 42,
    }

    def load(parameters: Any, **kwargs: Any) -> tuple[Any, None]:
        calls.append("load")
        assert (
            parameters.loras == ()
            and parameters.positive_embeddings == parameters.negative_embeddings == ()
        )
        assert (parameters.positive_prompt, parameters.negative_prompt) == ("", "")
        assert parameters.checkpoint_path == parsed.parameters.checkpoint_path
        assert (
            parameters.seed == parsed.parameters.seed
            and parameters.noise_profile == parsed.parameters.noise_profile
        )
        assert kwargs == {"config_dir": tmp_path, "runtime": runtime, "mode": "txt2img"}
        return pipeline, None

    def prepare(current: Any, stack: Any, torch: Any) -> None:
        calls.append("prepare")
        assert current is pipeline and stack == parsed.command.loras and torch is runtime.torch
        assert calls == ["load", "prepare"]

    def hooks(current: Any) -> None:
        calls.append("hooks")
        assert current is pipeline

    def bindings(current: Any, current_runtime: Any) -> tuple[()]:
        calls.append("bindings")
        assert current is pipeline and current_runtime is runtime
        return ()

    def publish(recipe: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append("output")
        assert recipe == original_recipe
        assert kwargs["command"] == replace(parsed.command, loras=())
        assert kwargs["pipeline"] is pipeline and kwargs["runtime"] is runtime
        assert (
            kwargs["profile"]
            == "ordinary-canvas-invoke-dualclip-exact-ti-shared-readonly-cuda-fp16-v1"
        )
        return expected

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "prepare_regional_loras", prepare)
    monkeypatch.setattr(worker, "install_capture_hooks", hooks)
    monkeypatch.setattr(worker, "qualify_bindings", bindings)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", publish)
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response is expected
    assert calls == [
        "load",
        "prepare",
        "eval",
        "eval",
        "eval",
        "eval",
        "hooks",
        "bindings",
        "output",
    ]
    assert case.wire == original_wire and parsed.recipe == original_recipe
    assert parsed.command.loras == ((lora,) if enabled else ())


def test_worker_fusion_failure_precedes_eval_hooks_and_publication(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path)
    case.bundle["compositionProfile"] = "invoke-canvas-v1"
    lora = _resource(tmp_path / "failure.safetensors")
    case.request["job"]["loras"] = [_wire_entry(lora)]
    _seal(case)
    pipeline = SimpleNamespace()
    runtime = cast(
        MLRuntime, SimpleNamespace(torch=SimpleNamespace(no_grad=contextlib.nullcontext))
    )
    calls: list[str] = []

    def load(*args: Any, **kwargs: Any) -> tuple[Any, None]:
        calls.append("load")
        return pipeline, None

    def fail(*args: Any, **kwargs: Any) -> None:
        calls.append("prepare")
        raise DerivativeError("GENERATION_LORA_UNSUPPORTED", "explicit fusion refusal")

    monkeypatch.setattr(worker, "load_illustrious_pipeline", load)
    monkeypatch.setattr(worker, "prepare_regional_loras", fail)
    monkeypatch.setattr(worker, "install_capture_hooks", _tripwire)
    monkeypatch.setattr(worker, "generate_current_canvas_regional_txt2img", _tripwire)
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "error" and response["code"] == "GENERATION_LORA_UNSUPPORTED"
    assert calls == ["load", "prepare"]


@pytest.mark.parametrize("fault", ("missing", "changed"))
def test_public_worker_reverifies_zero_resources_before_model_factory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, fault: str
) -> None:
    case = _case(tmp_path)
    case.bundle["compositionProfile"] = "invoke-canvas-v1"
    lora = _resource(tmp_path / "unavailable.safetensors", 0)
    case.request["job"]["loras"] = [_wire_entry(lora)]
    _seal(case)
    if fault == "missing":
        lora.path.unlink()
    else:
        data = lora.path.read_bytes()
        lora.path.write_bytes(data[:-4] + b"\x00\x00\x00\x40")
    monkeypatch.setattr(worker, "load_illustrious_pipeline", _tripwire)
    runtime = cast(MLRuntime, SimpleNamespace())
    response = inference_main.process_inference_request(
        case.wire, config_dir=tmp_path, runtime=runtime
    )
    assert response["type"] == "error" and response["code"] == "GENERATION_INPUT_CHANGED"


def test_old_private_nonempty_refuses_before_loader_and_empty_keeps_original_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    case = _case(tmp_path)
    empty = worker.parse_regional_request(case.wire)
    assert empty.command.loras == empty.parameters.loras == ()
    lora = _resource(tmp_path / "private.safetensors")
    case.request["job"]["loras"] = [_wire_entry(lora)]
    _seal(case)
    monkeypatch.setattr(worker, "load_illustrious_pipeline", _tripwire)
    with pytest.raises(DerivativeError):
        worker.parse_regional_request(case.wire)
    case.request["job"]["loras"] = []
    _seal(case)
    assert worker.parse_regional_request(case.wire) == empty
