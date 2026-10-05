"""Real compiled-input, bundled-tokenizer and native adapter conditioning boundaries."""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path
from typing import Any

import pytest

from imagegen_worker.anima_conditioning import (
    COMPILED_PROMPT_VERSION,
    encode_anima_conditioning_pair,
    encode_anima_prompt,
    validate_compiled_anima_prompt,
)
from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels


def compiled(text: str, weight: float = 1.0) -> dict[str, Any]:
    return {
        "version": COMPILED_PROMPT_VERSION,
        "cleanedText": text,
        "spans": [{"start": 0, "end": len(text), "weight": weight}] if text else [],
    }


@pytest.fixture(scope="module")
def tokenizers() -> Any:
    pytest.importorskip("torch")
    pytest.importorskip("transformers")
    from imagegen_worker.anima_tokenizers import load_anima_tokenizers

    return load_anima_tokenizers()


@pytest.fixture(scope="module")
def native_models(tokenizers: Any) -> Any:
    torch = pytest.importorskip("torch")
    transformers = pytest.importorskip("transformers")
    diffusers = pytest.importorskip("diffusers")
    torch.manual_seed(8751)
    encoder = transformers.Qwen3Model(
        transformers.Qwen3Config(
            vocab_size=151936,
            hidden_size=32,
            intermediate_size=64,
            num_hidden_layers=1,
            num_attention_heads=2,
            num_key_value_heads=1,
            head_dim=16,
            max_position_embeddings=8192,
        )
    ).eval()
    conditioner = diffusers.AnimaTextConditioner(
        source_dim=32,
        target_dim=32,
        model_dim=32,
        num_layers=1,
        num_attention_heads=2,
        mlp_ratio=4.0,
        target_vocab_size=32128,
        use_self_attention=True,
        use_layer_norm=False,
        min_sequence_length=512,
    ).eval()
    # Real native modules with full tokenizer vocabularies and scaled widths/layers.
    # Transformer/VAE are irrelevant to this encoder boundary; no loader is mocked.
    return torch, LoadedAnimaModels(None, conditioner, encoder, None)


@pytest.mark.parametrize("weight", [1.0, 0.0, -2.0, 2.25])
def test_validation_detaches_unicode_spans_and_preserves_finite_signed_weights(
    weight: float,
) -> None:
    source = compiled("😀é z", weight)
    actual = validate_compiled_anima_prompt(source)
    source["spans"][0]["weight"] = 999
    assert actual.cleaned_text == "😀é z"
    assert actual.spans[0].end == 5
    assert actual.spans[0].weight == weight


@pytest.mark.parametrize(
    "value",
    [
        {},
        {**compiled("a"), "version": "anima-prompt-weighting-v2"},
        {**compiled("a"), "authoredText": "(a:2)"},
        {**compiled("a"), "spans": []},
        {**compiled("a"), "spans": [{"start": True, "end": 1, "weight": 1}]},
        {**compiled("a"), "spans": [{"start": 0, "end": 1, "weight": True}]},
        {**compiled("a"), "spans": [{"start": 0, "end": 1, "weight": float("nan")}]},
        {**compiled("a"), "spans": [{"start": 0, "end": 1, "weight": float("inf")}]},
        {**compiled("a"), "spans": [{"start": 0, "end": 1, "weight": "2"}]},
        {**compiled("a"), "spans": [{"start": 0, "end": 1, "weight": 1, "extra": 1}]},
        {**compiled("😀"), "spans": [{"start": 0, "end": 2, "weight": 1}]},
        {**compiled("ab"), "spans": [{"start": 0, "end": 1, "weight": 1}]},
        {
            **compiled("ab"),
            "spans": [{"start": 0, "end": 1, "weight": 1}, {"start": 1, "end": 2, "weight": 1}],
        },
        {
            **compiled("abc"),
            "spans": [{"start": 0, "end": 2, "weight": 1}, {"start": 1, "end": 3, "weight": 2}],
        },
        compiled("\ud800"),
        compiled("a" * (16 * 1024 + 1)),
    ],
)
def test_invalid_compiled_interpretation_is_refused_before_any_native_work(value: object) -> None:
    with pytest.raises(DerivativeError) as error:
        validate_compiled_anima_prompt(value)
    assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"


def test_concrete_utf8_byte_limit_preserves_exact_boundary() -> None:
    assert validate_compiled_anima_prompt(compiled("😀" * 4096)).spans[0].end == 4096
    with pytest.raises(DerivativeError, match="16 KiB"):
        validate_compiled_anima_prompt(compiled("😀" * 4097))


def test_neutral_and_weighted_prompts_keep_native_ids_and_qwen_input(
    native_models: Any, tokenizers: Any
) -> None:
    torch, models = native_models
    text = "long hair, embedding"
    plain = encode_anima_prompt(compiled(text), models, tokenizers=tokenizers)
    weighted = encode_anima_prompt(compiled(text, 2), models, tokenizers=tokenizers)
    assert torch.equal(plain.qwen3_input_ids, weighted.qwen3_input_ids)
    assert torch.equal(plain.qwen3_hidden_states, weighted.qwen3_hidden_states)
    assert torch.equal(plain.t5_input_ids, weighted.t5_input_ids)
    assert not plain.qwen3_truncated and not plain.t5_truncated
    n = plain.t5_input_ids.shape[1]
    expected = plain.embeddings[:, :n] * weighted.t5_weights.unsqueeze(-1)
    assert torch.allclose(weighted.embeddings[:, :n], expected)
    assert not torch.equal(weighted.embeddings, plain.embeddings)
    assert torch.count_nonzero(weighted.embeddings[:, n:]).item() == 0
    assert weighted.t5_weights[0, -1].item() == 1  # inserted EOS stays neutral
    assert torch.equal(plain.t5_weights, torch.ones_like(plain.t5_weights))


def test_both_prompt_signs_pass_the_same_actual_adapter_consumer(
    native_models: Any, tokenizers: Any
) -> None:
    torch, models = native_models
    neutral = encode_anima_conditioning_pair(
        compiled("bright portrait"), compiled("dark blur"), models, tokenizers=tokenizers
    )
    weighted = encode_anima_conditioning_pair(
        compiled("bright portrait", 2), compiled("dark blur", 0.9), models, tokenizers=tokenizers
    )
    for plain, changed in [
        (neutral.positive, weighted.positive),
        (neutral.negative, weighted.negative),
    ]:
        count = plain.t5_input_ids.shape[1]
        assert torch.equal(plain.t5_input_ids, changed.t5_input_ids)
        assert torch.equal(plain.qwen3_hidden_states, changed.qwen3_hidden_states)
        assert torch.allclose(
            changed.embeddings[:, :count],
            plain.embeddings[:, :count] * changed.t5_weights.unsqueeze(-1),
        )
        assert not torch.equal(plain.embeddings, changed.embeddings)


def test_actual_t5_subword_weights_average_character_overlap_without_fragment_tokenization(
    native_models: Any, tokenizers: Any
) -> None:
    torch, models = native_models
    source = compiled("embedding")
    source["spans"] = [{"start": 0, "end": 3, "weight": 2}, {"start": 3, "end": 9, "weight": 1}]
    result = encode_anima_prompt(source, models, tokenizers=tokenizers)
    native = tokenizers.t5("embedding", return_offsets_mapping=True)
    assert result.t5_input_ids[0].tolist() == native["input_ids"]
    assert (
        native["input_ids"]
        != tokenizers.t5("emb")["input_ids"][:-1] + tokenizers.t5("edding")["input_ids"]
    )
    for index, (start, end) in enumerate(native["offset_mapping"]):
        expected = 1 if end == start else (min(end, 3) - min(start, 3)) / (end - start) + 1
        assert math.isclose(result.t5_weights[0, index].item(), expected, rel_tol=1e-6)
    assert bool(torch.isfinite(result.embeddings).all().item())


def test_empty_and_special_token_offsets_keep_native_eos_and_neutral_weights(
    native_models: Any, tokenizers: Any
) -> None:
    torch, models = native_models
    empty = encode_anima_prompt(compiled(""), models, tokenizers=tokenizers)
    assert empty.qwen3_input_ids.tolist() == [[151643]]
    assert empty.qwen3_attention_mask.tolist() == [[True]]
    assert empty.t5_input_ids.tolist() == [[1]]
    assert empty.t5_weights.tolist() == [[1.0]]
    assert empty.embeddings.shape == (1, 512, 32)
    literal = encode_anima_prompt(compiled("<extra_id_0> 🔥", 2), models, tokenizers=tokenizers)
    assert 32099 in literal.t5_input_ids[0].tolist()
    for index, token in enumerate(literal.t5_input_ids[0].tolist()):
        if token in tokenizers.t5.all_special_ids:
            assert literal.t5_weights[0, index].item() == 1
    assert bool(torch.isfinite(literal.embeddings).all().item())


def test_long_prompt_truncation_keeps_eos_offsets_and_weight_alignment(
    native_models: Any, tokenizers: Any
) -> None:
    torch, models = native_models
    result = encode_anima_prompt(compiled("hair " * 600, 1.25), models, tokenizers=tokenizers)
    assert result.t5_truncated and not result.qwen3_truncated
    assert result.t5_input_ids.shape == result.t5_weights.shape == (1, 512)
    assert len(result.t5_offsets) == 512
    assert result.t5_input_ids[0, -1].item() == 1
    assert result.t5_weights[0, -1].item() == 1
    assert torch.equal(result.t5_weights[0, :-1], torch.full((511,), 1.25))


@pytest.mark.parametrize("weight", [1e100, 1e-100])
def test_unrepresentable_weight_refuses_before_encoder_and_valid_zero_is_preserved(
    native_models: Any, tokenizers: Any, weight: float
) -> None:
    torch, models = native_models
    calls: list[str] = []

    def before_qwen(_module: Any, _args: Any) -> None:
        calls.append("qwen")

    def before_adapter(_module: Any, _args: Any) -> None:
        calls.append("adapter")

    qwen_hook = models.qwen3_encoder.register_forward_pre_hook(before_qwen)
    adapter_hook = models.text_conditioner.register_forward_pre_hook(before_adapter)
    try:
        with pytest.raises(DerivativeError) as error:
            encode_anima_prompt(compiled("hair", weight), models, tokenizers=tokenizers)
        assert calls == []
        assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"
        assert "represented" in str(error.value)
        zero = encode_anima_prompt(compiled("hair", 0), models, tokenizers=tokenizers)
        assert calls == ["qwen", "adapter"]
    finally:
        qwen_hook.remove()
        adapter_hook.remove()
    assert zero.t5_weights[0, 0].item() == 0
    assert torch.count_nonzero(zero.embeddings[:, 0]).item() == 0


def test_actual_ts_compiler_json_matches_python_unicode_and_cleaned_tokenizers(
    native_models: Any, tokenizers: Any
) -> None:
    root = Path(__file__).resolve().parents[2]
    if not (root / "node_modules/.bin/tsx").exists():
        pytest.skip("Cross-language check requires repository pnpm dependencies.")
    source = "😀(é👩🏽‍🎨:2) z"
    program = (
        "import {compileAnimaPromptWeighting} "
        "from './src/shared/projects/anima-prompt-weighting.ts'; "
        "process.stdout.write(JSON.stringify(compileAnimaPromptWeighting("
        + json.dumps(source)
        + ")))"
    )
    data = json.loads(
        subprocess.check_output(
            [str(root / "node_modules/.bin/tsx"), "-e", program], cwd=root, text=True
        )
    )
    assert data["cleanedText"] == "😀é👩🏽‍🎨 z"
    assert data["spans"] == [
        {"start": 0, "end": 1, "weight": 1},
        {"start": 1, "end": 7, "weight": 2},
        {"start": 7, "end": 9, "weight": 1},
    ]
    torch, models = native_models
    actual = encode_anima_prompt(data, models, tokenizers=tokenizers)
    assert actual.qwen3_input_ids[0].tolist() == tokenizers.qwen3(data["cleanedText"])["input_ids"]
    assert actual.t5_input_ids[0].tolist() == tokenizers.t5(data["cleanedText"])["input_ids"]
    # Captured actual T5 offsets include overlapping underscore/UNK ranges and skipped
    # combining/ZWJ characters. Ordinary e/underscore rows are2; specials stay1.
    assert actual.t5_input_ids[0].tolist() == [3, 2, 154, 2, 3, 2, 3, 172, 1]
    assert actual.t5_weights[0].tolist() == [1, 1, 2, 1, 2, 1, 1, 1, 1]
    assert bool(torch.isfinite(actual.embeddings).all().item())


def test_pair_captures_both_interpretations_before_native_callbacks(
    native_models: Any, tokenizers: Any
) -> None:
    torch, models = native_models
    positive, negative = compiled("bright portrait", 2), compiled("dark blur", 0.9)
    expected = encode_anima_prompt(negative, models, tokenizers=tokenizers)

    def edit_negative(_module: Any, _args: Any) -> None:
        negative["spans"][0]["weight"] = 9

    handle = models.qwen3_encoder.register_forward_pre_hook(edit_negative)
    try:
        actual = encode_anima_conditioning_pair(positive, negative, models, tokenizers=tokenizers)
    finally:
        handle.remove()
    assert negative["spans"][0]["weight"] == 9
    assert torch.equal(actual.negative.t5_weights, expected.t5_weights)
    assert torch.equal(actual.negative.embeddings, expected.embeddings)


def test_weighted_adapter_output_reaches_actual_native_transformer(
    native_models: Any, tokenizers: Any
) -> None:
    pytest.importorskip("torchvision")  # Current native Cosmos forward additionally uses resize.
    diffusers = pytest.importorskip("diffusers")
    torch, models = native_models
    torch.manual_seed(9172)
    transformer = diffusers.CosmosTransformer3DModel(
        in_channels=2,
        out_channels=2,
        num_attention_heads=2,
        attention_head_dim=32,
        num_layers=1,
        text_embed_dim=32,
        adaln_lora_dim=8,
        max_size=(1, 8, 8),
        patch_size=(1, 2, 2),
        rope_scale=(1.0, 4.0, 4.0),
        concat_padding_mask=True,
        extra_pos_embed_type=None,
    ).eval()
    plain = encode_anima_conditioning_pair(
        compiled("bright hair"), compiled("dark blur"), models, tokenizers=tokenizers
    )
    weighted = encode_anima_conditioning_pair(
        compiled("bright hair", 2), compiled("dark blur", 0.9), models, tokenizers=tokenizers
    )
    for neutral, changed in [
        (plain.positive, weighted.positive),
        (plain.negative, weighted.negative),
    ]:
        with torch.inference_mode():
            first = transformer(
                hidden_states=torch.zeros((1, 2, 1, 4, 4)),
                encoder_hidden_states=neutral.embeddings,
                timestep=torch.tensor([0.5]),
                padding_mask=torch.zeros((1, 1, 4, 4)),
            ).sample
            second = transformer(
                hidden_states=torch.zeros((1, 2, 1, 4, 4)),
                encoder_hidden_states=changed.embeddings,
                timestep=torch.tensor([0.5]),
                padding_mask=torch.zeros((1, 1, 4, 4)),
            ).sample
        assert first.shape == second.shape == (1, 2, 1, 4, 4)
        assert bool(torch.isfinite(second).all().item())
        assert not torch.equal(first, second)


def test_native_qwen_truncates_within_concrete_byte_envelope_without_fragment_encoding(
    tokenizers: Any,
) -> None:
    text = "a!" * 8192
    tokens = tokenizers.qwen3(
        text, truncation=True, max_length=8192, return_overflowing_tokens=True
    )
    assert len(text.encode("utf8")) == 16 * 1024
    assert len(tokens["input_ids"]) == 2
    assert len(tokens["input_ids"][0]) == 8192
    # This proves the real tokenizer ceiling; it does not allocate an8192-row Qwen model graph.


@pytest.mark.parametrize("component", ["qwen3_encoder", "text_conditioner"])
def test_nonfinite_actual_native_component_output_is_refused(
    native_models: Any, tokenizers: Any, component: str
) -> None:
    torch, models = native_models
    model = getattr(models, component)
    parameter = next(model.parameters())
    before = parameter.detach().clone()
    assert bool(
        torch.isfinite(
            encode_anima_prompt(compiled("hair"), models, tokenizers=tokenizers).embeddings
        )
        .all()
        .item()
    )
    try:
        with torch.no_grad():
            parameter.fill_(float("nan"))
        with pytest.raises(DerivativeError) as error:
            encode_anima_prompt(compiled("hair"), models, tokenizers=tokenizers)
        assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"
    finally:
        with torch.no_grad():
            parameter.copy_(before)


def test_finite_representable_weight_can_overflow_native_output_and_is_refused(
    native_models: Any, tokenizers: Any
) -> None:
    torch, models = native_models
    control = encode_anima_prompt(compiled("hair"), models, tokenizers=tokenizers)
    assert control.embeddings.abs().max().item() > 1.2
    assert bool(torch.isfinite(torch.tensor(3e38)).item())
    with pytest.raises(DerivativeError, match="weighted adapter output") as error:
        encode_anima_prompt(compiled("hair", 3e38), models, tokenizers=tokenizers)
    assert error.value.code == "GENERATION_PROMPT_UNSUPPORTED"
