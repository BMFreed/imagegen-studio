"""Exact ordinary Anima adapters through native Qwen/conditioner/Cosmos and Euler.

The real native fixture and TS plan/compiler come from the Euler suite. Only
collaborator failure hooks are controlled; no local substitute models qualify.
"""

from __future__ import annotations

import copy
import hashlib
import importlib
import importlib.metadata
import json
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from imagegen_worker.anima_conditioning import encode_anima_conditioning_pair
from imagegen_worker.anima_lora import (
    qualify_anima_lora_state,
    scoped_anima_generation_loras,
)
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.protocol import GenerationLora
from test_anima_euler import inputs, run
from test_anima_euler import native as euler_native

# Reuse the native fixture, including the bundled tokenizers and Wan decoder.
native = euler_native

_COMPONENTS = ("transformer", "text_conditioner", "qwen3_encoder")
_TARGETS = {
    "transformer": (
        ("transformer_blocks.0.attn2.to_v", "diffusion_model.blocks.0.cross_attn.v_proj"),
        ("transformer_blocks.0.attn1.to_q", "diffusion_model.blocks.0.self_attn.q_proj"),
    ),
    "text_conditioner": (
        ("blocks.0.cross_attn.v_proj", "diffusion_model.llm_adapter.blocks.0.cross_attn.v_proj"),
        ("out_proj", "diffusion_model.llm_adapter.out_proj"),
    ),
    "qwen3_encoder": (
        ("layers.0.self_attn.v_proj", "text_encoder.model.layers.0.self_attn.v_proj"),
        ("layers.0.mlp.down_proj", "text_encoder.model.layers.0.mlp.down_proj"),
    ),
}


def _state(native: Any, component: str, seed: int = 40) -> dict[str, Any]:
    torch, _diffusers, models, _tokenizers = native
    state: dict[str, Any] = {}
    for index, (path, source) in enumerate(_TARGETS[component]):
        module = getattr(models, component).get_submodule(path)
        rank = index + 2
        generator = torch.Generator().manual_seed(seed + index)
        state[source + ".lora_A.weight"] = (
            torch.randn((rank, module.in_features), generator=generator) * 0.13
        )
        state[source + ".lora_B.weight"] = (
            torch.randn((module.out_features, rank), generator=generator) * 0.13
        )
        state[source + ".alpha"] = torch.tensor(1.0 if index == 0 else 6.0)
    return state


def _file(
    tmp_path: Path,
    native: Any,
    state: dict[str, Any],
    name: str = "ordinary",
    weight: float = 0.7,
    metadata: dict[str, str] | None = None,
) -> GenerationLora:
    pytest.importorskip("peft")
    assert importlib.metadata.version("peft") == "0.21.2"
    safetensors = importlib.import_module("safetensors.torch")
    path = tmp_path / (name + ".safetensors")
    safetensors.save_file(state, str(path), metadata=metadata)
    payload = path.read_bytes()
    return GenerationLora(
        path=path, sha256=hashlib.sha256(payload).hexdigest(), byte_size=len(payload), weight=weight
    )


def _snapshot(native: Any) -> dict[str, dict[str, Any]]:
    _torch, _diffusers, models, _tokenizers = native
    return {
        component: {
            key: tensor.detach().clone()
            for key, tensor in getattr(models, component).state_dict().items()
        }
        for component in _COMPONENTS
    }


def _clean(native: Any, before: dict[str, dict[str, Any]]) -> None:
    torch, _diffusers, models, _tokenizers = native
    tuner = importlib.import_module("peft.tuners.tuners_utils").BaseTunerLayer
    for component in _COMPONENTS:
        model = getattr(models, component)
        assert not getattr(model, "peft_config", {})
        assert not getattr(model, "_hf_peft_config_loaded", False)
        assert not any(isinstance(module, tuner) for module in model.modules())
        assert set(model.state_dict()) == set(before[component])
        for key, tensor in before[component].items():
            torch.testing.assert_close(model.state_dict()[key], tensor, rtol=0, atol=0)


@pytest.mark.parametrize("component", _COMPONENTS)
def test_real_qualification_closed_form_mixed_alpha_rank_signed_zero_and_cleanup(
    native: Any, tmp_path: Path, component: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    state = _state(native, component)
    authored = {key: value.clone() for key, value in state.items()}
    qualified = qualify_anima_lora_state(models, state, torch)
    assert {(target.component, target.path, target.rank, target.alpha) for target in qualified} == {
        (component, _TARGETS[component][0][0], 2, 1.0),
        (component, _TARGETS[component][1][0], 3, 6.0),
    }
    before = _snapshot(native)
    gradient_flags = [
        (parameter, parameter.requires_grad)
        for item in _COMPONENTS
        for parameter in getattr(models, item).parameters()
    ]
    for weight in (0.0, 1.0, -0.5, 0.0001, 1e-10):
        lora = _file(tmp_path, native, state, weight=weight)
        rng = torch.random.get_rng_state().clone()
        with scoped_anima_generation_loras(models, (lora,), torch):
            for target in qualified:
                module = getattr(models, component).get_submodule(target.path)
                x = torch.randn(
                    (2, target.down.shape[1]), generator=torch.Generator().manual_seed(808)
                )
                bias = before[component].get(target.path + ".bias")
                base = torch.nn.functional.linear(
                    x, before[component][target.path + ".weight"], bias
                )
                expected = base + torch.nn.functional.linear(
                    torch.nn.functional.linear(x, target.down), target.up
                ) * (weight * target.alpha / target.rank)
                torch.testing.assert_close(module(x), expected, rtol=2e-6, atol=2e-7)
                name = next(iter(module.scaling))
                assert module.scaling[name] == weight * target.alpha / target.rank
        assert torch.equal(rng, torch.random.get_rng_state())
        assert all(parameter.requires_grad == enabled for parameter, enabled in gradient_flags)
        _clean(native, before)
    for key, tensor in authored.items():
        torch.testing.assert_close(state[key], tensor, rtol=0, atol=0)


def _kohya(state: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, tensor in state.items():
        suffix = next(
            value for value in (".lora_A.weight", ".lora_B.weight", ".alpha") if key.endswith(value)
        )
        stem = key.removesuffix(suffix)
        if stem.startswith("diffusion_model."):
            alias = "lora_unet_" + stem.removeprefix("diffusion_model.").replace(".", "_")
        else:
            alias = "lora_te_" + stem.removeprefix("text_encoder.model.").replace(".", "_")
        result[alias + suffix.replace("lora_A", "lora_down").replace("lora_B", "lora_up")] = tensor
    return result


@pytest.mark.parametrize("component", _COMPONENTS)
def test_kohya_and_explicit_original_names_qualify_same_real_targets(
    native: Any, component: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    state = _state(native, component)
    originals = qualify_anima_lora_state(models, state, torch)
    converted = qualify_anima_lora_state(models, _kohya(state), torch)
    assert {(t.component, t.path, t.rank, t.alpha) for t in converted} == {
        (t.component, t.path, t.rank, t.alpha) for t in originals
    }
    by_path = {target.path: target for target in originals}
    for target in converted:
        torch.testing.assert_close(target.down, by_path[target.path].down, rtol=0, atol=0)
        torch.testing.assert_close(target.up, by_path[target.path].up, rtol=0, atol=0)


def test_missing_alpha_defaults_each_target_to_its_own_rank(native: Any) -> None:
    torch, _diffusers, models, _tokenizers = native
    state = _state(native, "transformer")
    del state[_TARGETS["transformer"][1][1] + ".alpha"]
    targets = qualify_anima_lora_state(models, state, torch)
    assert {(target.rank, target.alpha) for target in targets} == {(2, 1.0), (3, 3.0)}


@pytest.mark.parametrize(
    "defect",
    [
        "missing_up",
        "rank_mismatch",
        "base_shape",
        "zero_rank",
        "integer_down",
        "float64_down",
        "nonfinite_down",
        "alpha_vector",
        "alpha_nan",
        "unknown_target",
        "unknown_namespace",
        "dora",
        "named_adapter",
        "duplicate_alias",
        "mixed_kohya_peft",
    ],
)
def test_qualification_refuses_complete_tensor_defects_at_real_entrypoint(
    native: Any, defect: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    state = _state(native, "transformer")
    source = _TARGETS["transformer"][0][1]
    down, up, alpha = (source + suffix for suffix in (".lora_A.weight", ".lora_B.weight", ".alpha"))
    if defect == "missing_up":
        del state[up]
    elif defect == "rank_mismatch":
        state[up] = torch.ones((64, 3))
    elif defect == "base_shape":
        state[down] = torch.ones((2, 33))
    elif defect == "zero_rank":
        state[down], state[up] = torch.ones((0, 32)), torch.ones((64, 0))
    elif defect in ("integer_down", "float64_down"):
        state[down] = state[down].to(torch.int64 if defect == "integer_down" else torch.float64)
    elif defect == "nonfinite_down":
        state[down][0, 0] = float("nan")
    elif defect == "alpha_vector":
        state[alpha] = torch.tensor([1.0])
    elif defect == "alpha_nan":
        state[alpha] = torch.tensor(float("nan"))
    elif defect == "unknown_target":
        state["diffusion_model.blocks.99.cross_attn.v_proj.lora_A.weight"] = state.pop(down)
    elif defect == "unknown_namespace":
        state["alien." + down] = state.pop(down)
    elif defect == "dora":
        state[source + ".dora_scale"] = torch.ones((64,))
    elif defect == "named_adapter":
        state[source + ".lora_A.default.weight"] = state.pop(down)
    elif defect == "duplicate_alias":
        state["transformer.transformer_blocks.0.attn2.to_v.lora_A.weight"] = state[down].clone()
        state["transformer.transformer_blocks.0.attn2.to_v.lora_B.weight"] = state[up].clone()
    else:
        alias = _kohya(
            {
                key: value
                for key, value in state.items()
                if key.startswith(_TARGETS["transformer"][1][1])
            }
        )
        state = {key: value for key, value in state.items() if key.startswith(source)} | alias
    before = _snapshot(native)
    with pytest.raises(DerivativeError) as error:
        qualify_anima_lora_state(models, state, torch)
    assert error.value.code == "GENERATION_LORA_UNSUPPORTED"
    _clean(native, before)


@pytest.mark.parametrize("component", ("text_conditioner", "qwen3_encoder"))
def test_native_both_polarities_are_conditioned_after_adapter_and_restored(
    native: Any, tmp_path: Path, component: str
) -> None:
    torch, _diffusers, models, tokenizers = native
    data = inputs()
    baseline = encode_anima_conditioning_pair(
        data["positive"], data["negative"], models, tokenizers=tokenizers
    )
    before = _snapshot(native)
    lora = _file(tmp_path, native, _state(native, component), weight=-0.5)
    with scoped_anima_generation_loras(models, (lora,), torch):
        pair = encode_anima_conditioning_pair(
            data["positive"], data["negative"], models, tokenizers=tokenizers
        )
        assert not torch.equal(pair.positive.embeddings, baseline.positive.embeddings)
        assert not torch.equal(pair.negative.embeddings, baseline.negative.embeddings)
        if component == "text_conditioner":
            torch.testing.assert_close(
                pair.positive.qwen3_hidden_states,
                baseline.positive.qwen3_hidden_states,
                rtol=0,
                atol=0,
            )
        else:
            assert not torch.equal(
                pair.positive.qwen3_hidden_states, baseline.positive.qwen3_hidden_states
            )
    _clean(native, before)
    restored = encode_anima_conditioning_pair(
        data["positive"], data["negative"], models, tokenizers=tokenizers
    )
    torch.testing.assert_close(
        restored.positive.embeddings, baseline.positive.embeddings, rtol=0, atol=0
    )
    torch.testing.assert_close(
        restored.negative.embeddings, baseline.negative.embeddings, rtol=0, atol=0
    )


def test_two_adapter_three_component_stack_agrees_with_independent_linear_sum(
    native: Any, tmp_path: Path
) -> None:
    torch, _diffusers, models, _tokenizers = native
    first = {
        key: value for component in _COMPONENTS for key, value in _state(native, component).items()
    }
    second = {
        key: value
        for component in _COMPONENTS
        for key, value in _state(native, component, seed=500).items()
    }
    a = qualify_anima_lora_state(models, first, torch)
    b = {(t.component, t.path): t for t in qualify_anima_lora_state(models, second, torch)}
    loras = (
        _file(tmp_path, native, first, "first", 0.7),
        _file(tmp_path, native, second, "second", -0.25),
    )
    before = _snapshot(native)
    rng = torch.random.get_rng_state().clone()
    with scoped_anima_generation_loras(models, loras, torch):
        for one in a:
            two = b[(one.component, one.path)]
            x = torch.randn((2, one.down.shape[1]), generator=torch.Generator().manual_seed(808))
            expected = torch.nn.functional.linear(
                x,
                before[one.component][one.path + ".weight"],
                before[one.component].get(one.path + ".bias"),
            )
            for target, weight in ((one, 0.7), (two, -0.25)):
                expected = expected + torch.nn.functional.linear(
                    torch.nn.functional.linear(x, target.down), target.up
                ) * (weight * target.alpha / target.rank)
            actual = getattr(models, one.component).get_submodule(one.path)(x)
            torch.testing.assert_close(actual, expected, rtol=2e-6, atol=2e-7)
    assert torch.equal(rng, torch.random.get_rng_state())
    _clean(native, before)


@pytest.mark.parametrize("mode", ("txt2img", "img2img"))
def test_real_euler_adapter_effect_seed_replay_zero_neighbor_and_clean_pixels(
    native: Any, tmp_path: Path, mode: str
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    state = {
        key: value for component in _COMPONENTS for key, value in _state(native, component).items()
    }
    lora = _file(tmp_path, native, state)
    data = inputs() if mode == "txt2img" else inputs(mode="img2img", strength=0.5)
    options = (
        {} if mode == "txt2img" else {"source_image": Image.new("RGB", (64, 64), (90, 120, 180))}
    )
    before = _snapshot(native)
    baseline = run(data, native, **options)
    rng = torch.random.get_rng_state().clone()
    actual = run(data, native, loras=(lora,), **options)
    again = run(copy.deepcopy(data), native, loras=(lora,), **options)
    zero = run(data, native, loras=(replace(lora, weight=0.0),), **options)
    assert not torch.equal(actual.latents, baseline.latents)
    assert actual.image.tobytes() != baseline.image.tobytes()
    assert (
        torch.equal(actual.latents, again.latents)
        and actual.image.tobytes() == again.image.tobytes()
    )
    assert (
        torch.equal(zero.latents, baseline.latents)
        and zero.image.tobytes() == baseline.image.tobytes()
    )
    assert torch.equal(rng, torch.random.get_rng_state())
    assert actual.image.mode == "RGB" and actual.image.size == (64, 64)
    _clean(native, before)
    restored = run(data, native, **options)
    assert (
        torch.equal(restored.latents, baseline.latents)
        and restored.image.tobytes() == baseline.image.tobytes()
    )


@pytest.mark.parametrize(
    "failure",
    ("conditioner_load", "conditioner_load_after", "qwen_load", "conditioner_forward", "progress"),
)
def test_actual_load_conditioning_and_progress_failures_restore_all_models_and_rng(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    state = {
        key: value for component in _COMPONENTS for key, value in _state(native, component).items()
    }
    lora = _file(tmp_path, native, state)
    before = _snapshot(native)
    rng = torch.random.get_rng_state().clone()
    progress: list[tuple[int, int]] = []

    def fail(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError("controlled native collaborator failure")

    def report(step: int, total: int) -> None:
        progress.append((step, total))
        if failure == "progress":
            fail()

    with monkeypatch.context() as patch:
        if failure == "conditioner_load":
            patch.setattr(models.text_conditioner, "load_lora_adapter", fail)
        elif failure == "conditioner_load_after":
            original_conditioner = models.text_conditioner.load_lora_adapter

            def conditioner_then_fail(*args: Any, **kwargs: Any) -> None:
                original_conditioner(*args, **kwargs)
                fail()

            patch.setattr(models.text_conditioner, "load_lora_adapter", conditioner_then_fail)
        elif failure == "qwen_load":
            # Inject failure after the real native Qwen adapter has been installed.
            original = models.qwen3_encoder.load_adapter

            def qwen_then_fail(*args: Any, **kwargs: Any) -> None:
                original(*args, **kwargs)
                fail()

            patch.setattr(models.qwen3_encoder, "load_adapter", qwen_then_fail)
        elif failure == "conditioner_forward":
            patch.setattr(models.text_conditioner, "forward", fail)
        with pytest.raises((DerivativeError, RuntimeError)):
            run(inputs(), native, loras=(lora,), progress=report)
    assert progress == ([(1, 2)] if failure == "progress" else [])
    assert torch.equal(rng, torch.random.get_rng_state())
    _clean(native, before)
    # A fresh valid execution after the exact failure must return actual image data.
    replay = run(inputs(), native, loras=(lora,))
    assert replay.image.mode == "RGB" and replay.image.size == (64, 64)
    _clean(native, before)


def test_all_files_qualify_before_first_native_install(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, _diffusers, models, _tokenizers = native
    valid = _file(tmp_path, native, _state(native, "transformer"), "valid")
    invalid_state = _state(native, "text_conditioner")
    invalid_state[_TARGETS["text_conditioner"][0][1] + ".lora_B.weight"] = torch.ones((33, 2))
    invalid = _file(tmp_path, native, invalid_state, "invalid")
    before = _snapshot(native)
    calls: list[str] = []
    original = models.transformer.load_lora_adapter

    def observe(*args: Any, **kwargs: Any) -> None:
        calls.append("native install")
        original(*args, **kwargs)

    monkeypatch.setattr(models.transformer, "load_lora_adapter", observe)
    with (
        pytest.raises(DerivativeError),
        scoped_anima_generation_loras(models, (valid, invalid), torch),
    ):
        pytest.fail("Invalid adapter file reached the scoped body")
    assert calls == []
    _clean(native, before)


@pytest.mark.parametrize(
    "defect",
    (
        "tampered",
        "symlink",
        "duplicate_resource",
        "duplicate_header",
        "bad_weight",
        "bad_size",
        "bad_sha",
    ),
)
def test_exact_snapshot_and_resource_defects_refuse_before_native_install(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, defect: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    lora = _file(tmp_path, native, _state(native, "transformer"))
    loras = (lora,)
    if defect == "tampered":
        payload = bytearray(lora.path.read_bytes())
        payload[-1] ^= 1
        lora.path.write_bytes(payload)
        loras = (replace(lora, weight=0.0),)
    elif defect == "symlink":
        link = tmp_path / "symlink.safetensors"
        link.symlink_to(lora.path)
        loras = (replace(lora, path=link),)
    elif defect == "duplicate_resource":
        loras = (lora, lora)
    elif defect == "duplicate_header":
        payload = lora.path.read_bytes()
        header_size = int.from_bytes(payload[:8], "little")
        header = payload[8 : 8 + header_size].decode("utf-8").rstrip()
        key, value = next(iter(json.loads(header).items()))
        header = header[:-1] + "," + json.dumps(key) + ":" + json.dumps(value) + "}"
        encoded = header.encode("utf-8")
        modified = len(encoded).to_bytes(8, "little") + encoded + payload[8 + header_size :]
        lora.path.write_bytes(modified)
        loras = (
            replace(lora, sha256=hashlib.sha256(modified).hexdigest(), byte_size=len(modified)),
        )
    elif defect == "bad_weight":
        loras = (replace(lora, weight=float("inf")),)
    elif defect == "bad_size":
        loras = (replace(lora, byte_size=lora.byte_size + 1),)
    else:
        loras = (replace(lora, sha256="0" * 64),)
    before = _snapshot(native)
    calls: list[str] = []
    original = models.transformer.load_lora_adapter

    def observe(*args: Any, **kwargs: Any) -> None:
        calls.append("native install")
        original(*args, **kwargs)

    monkeypatch.setattr(models.transformer, "load_lora_adapter", observe)
    with pytest.raises(DerivativeError), scoped_anima_generation_loras(models, loras, torch):
        pytest.fail("Invalid adapter resource reached the scoped body")
    assert calls == []
    _clean(native, before)


def test_untrusted_safetensors_metadata_cannot_change_rank_alpha_algorithm_or_targets(
    native: Any, tmp_path: Path
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    state = _state(native, "transformer")
    plain = _file(tmp_path, native, state, "plain", weight=-0.5)
    untrusted = _file(
        tmp_path,
        native,
        state,
        "untrusted",
        weight=-0.5,
        metadata={
            "lora_adapter_metadata": json.dumps(
                {
                    "transformer.r": 99,
                    "transformer.lora_alpha": 100,
                    "transformer.use_dora": True,
                    "transformer.target_modules": "all-linear",
                }
            )
        },
    )
    data = inputs()
    before = _snapshot(native)
    a = run(data, native, loras=(plain,))
    b = run(data, native, loras=(untrusted,))
    assert torch.equal(a.latents, b.latents) and a.image.tobytes() == b.image.tobytes()
    _clean(native, before)


def test_euler_captures_stack_and_all_file_bytes_before_progress_edits(
    native: Any, tmp_path: Path
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    lora = _file(tmp_path, native, _state(native, "qwen3_encoder"))
    data = inputs()
    original = run(data, native, loras=(lora,))
    caller_loras = [lora]
    original_payload = lora.path.read_bytes()

    def edit(_step: int, _total: int) -> None:
        caller_loras[:] = [replace(lora, weight=0.0)]
        lora.path.write_bytes(b"changed after native snapshot")

    try:
        actual = run(data, native, loras=caller_loras, progress=edit)
    finally:
        lora.path.write_bytes(original_payload)
    assert (
        torch.equal(actual.latents, original.latents)
        and actual.image.tobytes() == original.image.tobytes()
    )


def test_scope_restores_requires_grad_flags_and_rejects_existing_native_adapters(
    native: Any, tmp_path: Path
) -> None:
    torch, _diffusers, models, _tokenizers = native
    lora = _file(tmp_path, native, _state(native, "qwen3_encoder"))
    flags = [
        (parameter, parameter.requires_grad)
        for component in _COMPONENTS
        for parameter in getattr(models, component).parameters()
    ]
    before = _snapshot(native)
    with scoped_anima_generation_loras(models, (lora,), torch):
        assert getattr(models.qwen3_encoder, "peft_config", {})
        with pytest.raises(DerivativeError), scoped_anima_generation_loras(models, (lora,), torch):
            pytest.fail("Preexisting adapter was overwritten")
        assert getattr(models.qwen3_encoder, "peft_config", {})
    assert all(parameter.requires_grad == enabled for parameter, enabled in flags)
    _clean(native, before)


def test_loader_rng_scope_preserves_progress_callers_real_random_draws(
    native: Any, tmp_path: Path
) -> None:
    torch, _diffusers, _models, _tokenizers = native
    state = {
        key: value for component in _COMPONENTS for key, value in _state(native, component).items()
    }
    lora = _file(tmp_path, native, state)
    initial_rng = torch.random.get_rng_state().clone()
    with torch.random.fork_rng(devices=[]):
        torch.random.set_rng_state(initial_rng)
        expected_draws = [torch.rand((1,)) for _ in range(2)]
        expected_rng = torch.random.get_rng_state().clone()
    draws: list[Any] = []

    def report(_step: int, _total: int) -> None:
        draws.append(torch.rand((1,)))

    try:
        result = run(inputs(), native, loras=(lora,), progress=report)
        assert result.image.size == (64, 64)
        assert len(draws) == 2
        for actual, expected in zip(draws, expected_draws, strict=True):
            torch.testing.assert_close(actual, expected, rtol=0, atol=0)
        assert torch.equal(torch.random.get_rng_state(), expected_rng)
    finally:
        torch.random.set_rng_state(initial_rng)


def test_euler_matches_independent_native_lora_conditioning_and_cfg_flow_reference(
    native: Any, tmp_path: Path
) -> None:
    torch, _diffusers, models, tokenizers = native
    state = {
        key: value for component in _COMPONENTS for key, value in _state(native, component).items()
    }
    lora = _file(tmp_path, native, state, weight=-0.5)
    data = inputs(positive="(bright hair:2)", negative="(dark blur)--", guidanceScale=4)
    expected = torch.randn((1, 16, 1, 8, 8), generator=torch.Generator().manual_seed(0))
    before = _snapshot(native)
    # Native conditioning and two Euler increments are evaluated outside the
    # generation entrypoint. The native LoRAs must remain present for both signs.
    with scoped_anima_generation_loras(models, (lora,), torch), torch.inference_mode():
        pair = encode_anima_conditioning_pair(
            data["positive"], data["negative"], models, tokenizers=tokenizers
        )
        for current, following in ((1.0, 0.75), (0.75, 0.0)):
            conditional = models.transformer(
                hidden_states=expected,
                timestep=torch.tensor([current]),
                encoder_hidden_states=pair.positive.embeddings,
                padding_mask=torch.zeros((1, 1, 8, 8)),
            ).sample
            unconditional = models.transformer(
                hidden_states=expected,
                timestep=torch.tensor([current]),
                encoder_hidden_states=pair.negative.embeddings,
                padding_mask=torch.zeros((1, 1, 8, 8)),
            ).sample
            expected = expected + (following - current) * (
                unconditional + 4 * (conditional - unconditional)
            )
    actual = run(data, native, loras=(lora,))
    torch.testing.assert_close(actual.latents, expected, atol=1e-6, rtol=1e-6)
    _clean(native, before)


@pytest.mark.parametrize(
    "defect", ("dropped_loaded_tensor", "wrong_loaded_scale", "extra_loaded_target")
)
def test_post_native_loader_verification_refuses_silent_tensor_scale_or_target_loss(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, defect: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    lora = _file(tmp_path, native, _state(native, "transformer"), weight=-0.5)
    before = _snapshot(native)
    if defect == "wrong_loaded_scale":
        original_set = models.transformer.set_adapters

        def wrong_scale(*args: Any, **kwargs: Any) -> None:
            original_set(*args, **kwargs)
            module = models.transformer.get_submodule(_TARGETS["transformer"][0][0])
            name = next(iter(module.scaling))
            module.scaling[name] = abs(module.scaling[name])

        monkeypatch.setattr(models.transformer, "set_adapters", wrong_scale)
    else:
        original_load = models.transformer.load_lora_adapter

        def corrupt_native(*args: Any, **kwargs: Any) -> None:
            state = dict(args[0])
            if defect == "dropped_loaded_tensor":
                del state["transformer." + _TARGETS["transformer"][0][0] + ".lora_B.weight"]
            else:
                extra = "transformer_blocks.0.attn2.to_q"
                module = models.transformer.get_submodule(extra)
                state["transformer." + extra + ".lora_A.weight"] = torch.ones(
                    (2, module.in_features)
                )
                state["transformer." + extra + ".lora_B.weight"] = torch.ones(
                    (module.out_features, 2)
                )
                metadata = dict(kwargs["metadata"])
                metadata["transformer.target_modules"] = (
                    metadata["transformer.target_modules"][:-2]
                    + "|"
                    + extra.replace(".", "\\.")
                    + ")$"
                )
                metadata["transformer.rank_pattern"] = dict(
                    metadata["transformer.rank_pattern"]
                ) | {extra: 2}
                metadata["transformer.alpha_pattern"] = dict(
                    metadata["transformer.alpha_pattern"]
                ) | {extra: 2}
                kwargs["metadata"] = metadata
            original_load(state, *args[1:], **kwargs)

        monkeypatch.setattr(models.transformer, "load_lora_adapter", corrupt_native)
    with pytest.raises(DerivativeError), scoped_anima_generation_loras(models, (lora,), torch):
        pytest.fail("Incomplete native loading reached the scoped body")
    _clean(native, before)


def test_early_qwen_injection_failure_restores_wrappers_before_transformers_loaded_flag(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, _diffusers, models, _tokenizers = native
    peft = importlib.import_module("peft")
    original_inject = peft.inject_adapter_in_model
    lora = _file(tmp_path, native, _state(native, "qwen3_encoder"))
    before = _snapshot(native)
    rng = torch.random.get_rng_state().clone()
    stages: list[tuple[bool, bool]] = []

    def inject_then_fail(*args: Any, **kwargs: Any) -> Any:
        original_inject(*args, **kwargs)
        stages.append(
            (
                any(hasattr(module, "lora_A") for module in models.qwen3_encoder.modules()),
                bool(getattr(models.qwen3_encoder, "_hf_peft_config_loaded", False)),
            )
        )
        raise RuntimeError("injection failed before Transformers loaded-flag transition")

    with monkeypatch.context() as patch:
        patch.setattr(peft, "inject_adapter_in_model", inject_then_fail)
        with pytest.raises(DerivativeError):
            run(inputs(), native, loras=(lora,))
    assert stages == [(True, False)]
    assert torch.equal(rng, torch.random.get_rng_state())
    _clean(native, before)
    result = run(inputs(), native, loras=(lora,))
    assert result.image.mode == "RGB" and result.image.size == (64, 64)
    _clean(native, before)


@pytest.mark.parametrize("component", _COMPONENTS)
@pytest.mark.parametrize("zero_kind", ("weight", "alpha", "mixed_stack", "target_alpha"))
def test_effective_zero_skips_overflow_prone_native_update_after_exact_verification(
    native: Any, tmp_path: Path, zero_kind: str, component: str
) -> None:
    torch, _diffusers, models, _tokenizers = native
    state = _state(native, component)
    path, source = _TARGETS[component][0]
    for key, tensor in state.items():
        if zero_kind == "target_alpha" and not key.startswith(source):
            continue
        if key.endswith(".weight"):
            tensor.fill_(1e20)
        elif zero_kind in ("alpha", "target_alpha"):
            tensor.zero_()
    zero = _file(
        tmp_path,
        native,
        state,
        "zero",
        weight=0.7 if zero_kind in ("alpha", "target_alpha") else 0.0,
    )
    before = _snapshot(native)
    model = getattr(models, component)
    x = torch.ones((1, before[component][path + ".weight"].shape[1]))
    baseline = model.get_submodule(path)(x).detach().clone()
    loras = (zero,)
    if zero_kind == "mixed_stack":
        valid = _file(tmp_path, native, _state(native, component), "valid", weight=-0.5)
        with scoped_anima_generation_loras(models, (valid,), torch):
            baseline = model.get_submodule(path)(x).detach().clone()
        loras = (valid, zero)
    # This exact finite source overflows if the native branch is evaluated
    # before multiplying by its mathematically zero scale.
    raw_update = torch.nn.functional.linear(
        torch.nn.functional.linear(x, state[source + ".lora_A.weight"]),
        state[source + ".lora_B.weight"],
    )
    assert not bool(torch.isfinite(raw_update).all())
    with scoped_anima_generation_loras(models, loras, torch):
        actual = model.get_submodule(path)(x)
        assert bool(torch.isfinite(actual).all())
        torch.testing.assert_close(actual, baseline, rtol=0, atol=0)
        if zero_kind == "target_alpha":
            other_path, other_source = _TARGETS[component][1]
            other_x = torch.ones((1, before[component][other_path + ".weight"].shape[1]))
            other_base = torch.nn.functional.linear(
                other_x,
                before[component][other_path + ".weight"],
                before[component].get(other_path + ".bias"),
            )
            expected = other_base + torch.nn.functional.linear(
                torch.nn.functional.linear(other_x, state[other_source + ".lora_A.weight"]),
                state[other_source + ".lora_B.weight"],
            ) * (0.7 * 6 / 3)
            other_actual = model.get_submodule(other_path)(other_x)
            assert not torch.equal(other_actual, other_base)
            torch.testing.assert_close(other_actual, expected, rtol=2e-6, atol=2e-7)
    _clean(native, before)


def test_open_time_symlink_swap_after_real_canonical_check_refuses_before_native_load(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, _diffusers, models, _tokenizers = native
    snapshots = importlib.import_module("imagegen_worker.inference_lora")
    lora = _file(tmp_path, native, _state(native, "transformer"))
    target = tmp_path / "same-exact-bytes.safetensors"
    target.write_bytes(lora.path.read_bytes())
    original_check = snapshots.canonical_absolute_path
    observations: list[bool] = []

    def canonical_then_exchange(value: Path, *, label: str) -> Path:
        checked = original_check(value, label=label)
        observations.append(not value.is_symlink())
        value.unlink()
        value.symlink_to(target)
        return checked

    before = _snapshot(native)
    monkeypatch.setattr(snapshots, "canonical_absolute_path", canonical_then_exchange)
    with pytest.raises(DerivativeError), scoped_anima_generation_loras(models, (lora,), torch):
        pytest.fail("A symlink exchanged after canonical verification reached native loading")
    assert observations == [True] and lora.path.is_symlink()
    _clean(native, before)


def test_qwen_native_in_place_tensor_change_cannot_mutate_captured_verification_reference(
    native: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    torch, _diffusers, models, _tokenizers = native
    lora = _file(tmp_path, native, _state(native, "qwen3_encoder"))
    before = _snapshot(native)
    original_load = models.qwen3_encoder.load_adapter

    def load_then_corrupt(*args: Any, **kwargs: Any) -> None:
        original_load(*args, **kwargs)
        module = models.qwen3_encoder.get_submodule(_TARGETS["qwen3_encoder"][0][0])
        with torch.no_grad():
            module.lora_A[kwargs["adapter_name"]].weight.add_(1)

    monkeypatch.setattr(models.qwen3_encoder, "load_adapter", load_then_corrupt)
    with pytest.raises(DerivativeError), scoped_anima_generation_loras(models, (lora,), torch):
        pytest.fail(
            "Native Qwen tensor corruption aliased the captured reference and reached the body"
        )
    _clean(native, before)
