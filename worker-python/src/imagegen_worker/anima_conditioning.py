"""Versioned TS-compiled Anima attention through native offline conditioning.

Python validates the compiled interpretation; it does not parse attention syntax.
This foundation does not advertise a generation capability or run denoising.
"""

from __future__ import annotations

import importlib
import math
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, cast

from imagegen_worker.derivatives import DerivativeError
from imagegen_worker.inference_anima import LoadedAnimaModels

if TYPE_CHECKING:
    from imagegen_worker.anima_tokenizers import AnimaTokenizers

COMPILED_PROMPT_VERSION = "anima-prompt-weighting-v1"
MAX_CONCRETE_PROMPT_BYTES = 16 * 1024
QWEN3_MAX_TOKENS = 8192
T5_MAX_TOKENS = 512


@dataclass(frozen=True)
class AnimaWeightedSpan:
    start: int
    end: int
    weight: float


@dataclass(frozen=True)
class CompiledAnimaPrompt:
    cleaned_text: str
    spans: tuple[AnimaWeightedSpan, ...]


@dataclass(frozen=True)
class AnimaPromptConditioning:
    qwen3_input_ids: Any
    qwen3_attention_mask: Any
    qwen3_hidden_states: Any
    t5_input_ids: Any
    t5_weights: Any
    t5_offsets: tuple[tuple[int, int], ...]
    embeddings: Any
    qwen3_truncated: bool
    t5_truncated: bool


@dataclass(frozen=True)
class AnimaConditioningPair:
    positive: AnimaPromptConditioning
    negative: AnimaPromptConditioning


def _invalid(message: str) -> DerivativeError:
    return DerivativeError("GENERATION_PROMPT_UNSUPPORTED", message)


def validate_compiled_anima_prompt(value: object) -> CompiledAnimaPrompt:
    """Detach one canonical code-point interpretation before tokenizer/model calls."""
    if not isinstance(value, dict):
        raise _invalid("Anima requires a versioned compiled prompt.")
    data = cast(dict[str, object], value)
    if (
        set(data) != {"version", "cleanedText", "spans"}
        or data["version"] != COMPILED_PROMPT_VERSION
    ):
        raise _invalid("The Anima compiled prompt version or fields are unsupported.")
    text, spans = data["cleanedText"], data["spans"]
    if not isinstance(text, str) or not isinstance(spans, list):
        raise _invalid("Anima compiled text and spans are invalid.")
    try:
        if len(text.encode("utf-8")) > MAX_CONCRETE_PROMPT_BYTES:
            raise _invalid("Anima concrete prompts exceed the 16 KiB UTF-8 limit.")
    except UnicodeError as error:
        raise _invalid("Anima compiled text must be valid Unicode.") from error
    entries = cast(list[object], spans)
    if len(entries) > len(text):
        raise _invalid("Anima spans exceed the cleaned code-point count.")
    result: list[AnimaWeightedSpan] = []
    cursor = 0
    for entry in entries:
        if not isinstance(entry, dict):
            raise _invalid("An Anima weighted span is invalid.")
        span = cast(dict[str, object], entry)
        if set(span) != {"start", "end", "weight"}:
            raise _invalid("An Anima weighted span has unsupported fields.")
        start, end, weight = span["start"], span["end"], span["weight"]
        if (
            type(start) is not int
            or type(end) is not int
            or start != cursor
            or end <= start
            or end > len(text)
            or type(weight) not in (int, float)
        ):
            raise _invalid("Anima spans must cover ordered cleaned code points exactly once.")
        try:
            number = float(cast(int | float, weight))
        except (ValueError, OverflowError) as error:
            raise _invalid("Anima span weights must be finite numbers.") from error
        if not math.isfinite(number) or (result and result[-1].weight == number):
            raise _invalid("Anima spans must have finite, canonically coalesced weights.")
        result.append(AnimaWeightedSpan(start, end, number))
        cursor = end
    if cursor != len(text):
        raise _invalid("Anima spans do not cover the complete cleaned text.")
    return CompiledAnimaPrompt(text, tuple(result))


def _first_token_sequence(data: Any, key: str) -> list[Any]:
    sequences = data.get(key)
    if not isinstance(sequences, list) or not sequences or not isinstance(sequences[0], list):
        raise _invalid("The Anima tokenizer returned invalid sequence data.")
    return cast(list[Any], sequences[0])


def _tokenize(prompt: CompiledAnimaPrompt, tokenizers: AnimaTokenizers) -> tuple[Any, Any]:
    # One call for the complete cleaned string. Overflow rows make truncation observable;
    # IDs/offsets of the first native truncated row retain the native EOS policy.
    qwen = tokenizers.qwen3(
        prompt.cleaned_text,
        padding=False,
        truncation=True,
        max_length=QWEN3_MAX_TOKENS,
        return_attention_mask=True,
        return_overflowing_tokens=True,
    )
    t5 = tokenizers.t5(
        prompt.cleaned_text,
        padding=False,
        truncation=True,
        max_length=T5_MAX_TOKENS,
        return_attention_mask=True,
        return_offsets_mapping=True,
        return_special_tokens_mask=True,
        return_overflowing_tokens=True,
    )
    return qwen, t5


def _token_weights(
    prompt: CompiledAnimaPrompt,
    ids: list[Any],
    offsets: list[Any],
    special: list[Any],
    tokenizer: Any,
) -> tuple[list[float], tuple[tuple[int, int], ...]]:
    if not ids or len(ids) != len(offsets) or len(ids) != len(special) or len(ids) > T5_MAX_TOKENS:
        raise _invalid("Anima T5 token IDs, offsets and special masks are not aligned.")
    weights: list[float] = []
    checked: list[tuple[int, int]] = []
    special_ids = set(tokenizer.all_special_ids)
    for token, offset, is_special in zip(ids, offsets, special, strict=True):
        if (
            type(token) is not int
            or token < 0
            or token >= 32128
            or not isinstance(offset, (list, tuple))
            or len(cast(list[object], offset)) != 2
            or type(is_special) is not int
            or is_special not in (0, 1)
        ):
            raise _invalid("Anima T5 token metadata is invalid.")
        start, end = cast(tuple[int, int], offset)
        if (
            type(start) is not int
            or type(end) is not int
            or not 0 <= start <= end <= len(prompt.cleaned_text)
        ):
            raise _invalid("Anima T5 offsets must refer to cleaned Unicode code points.")
        checked.append((start, end))
        if is_special or token in special_ids or start == end:
            weights.append(1.0)
            continue
        # Token offsets may overlap or skip normalized characters. The compiled character
        # spans themselves are disjoint/complete; average each token's actual covered range.
        try:
            weight = math.fsum(
                span.weight * (max(0, min(end, span.end) - max(start, span.start)) / (end - start))
                for span in prompt.spans
                if span.start < end and span.end > start
            )
        except OverflowError as error:
            raise _invalid("Anima token attention overflowed.") from error
        if not math.isfinite(weight):
            raise _invalid("Anima token attention must remain finite.")
        weights.append(weight)
    return weights, tuple(checked)


def encode_anima_prompt(
    compiled: object,
    models: LoadedAnimaModels,
    *,
    tokenizers: AnimaTokenizers | None = None,
) -> AnimaPromptConditioning:
    """Return native weighted adapter output for one sign, without denoising."""
    return _encode_compiled_prompt(validate_compiled_anima_prompt(compiled), models, tokenizers)


def _encode_compiled_prompt(
    prompt: CompiledAnimaPrompt,
    models: LoadedAnimaModels,
    tokenizers: AnimaTokenizers | None,
) -> AnimaPromptConditioning:
    if tokenizers is None:
        from imagegen_worker.anima_tokenizers import load_anima_tokenizers

        tokenizers = load_anima_tokenizers()
    try:
        torch = cast(Any, importlib.import_module("torch"))
        qwen, t5 = _tokenize(prompt, tokenizers)
        qwen_ids = _first_token_sequence(qwen, "input_ids")
        qwen_mask = _first_token_sequence(qwen, "attention_mask")
        t5_ids = _first_token_sequence(t5, "input_ids")
        t5_offsets = _first_token_sequence(t5, "offset_mapping")
        t5_special = _first_token_sequence(t5, "special_tokens_mask")
        if (
            len(qwen_ids) != len(qwen_mask)
            or len(qwen_ids) > QWEN3_MAX_TOKENS
            or any(type(token) is not int or not 0 <= token < 151936 for token in qwen_ids)
            or any(mask != 1 for mask in qwen_mask)
        ):
            raise _invalid("Anima Qwen3 token IDs and attention mask are invalid.")
        if not qwen_ids:
            qwen_ids = [tokenizers.qwen3.pad_token_id]
            qwen_mask = [1]
            if type(qwen_ids[0]) is not int or not 0 <= qwen_ids[0] < 151936:
                raise _invalid("The Anima Qwen3 empty-input pad token is unavailable.")
        weights, offsets = _token_weights(prompt, t5_ids, t5_offsets, t5_special, tokenizers.t5)
        encoder = models.qwen3_encoder
        conditioner = models.text_conditioner
        encoder_parameter = next(encoder.parameters())
        conditioner_parameter = next(conditioner.parameters())
        if (
            encoder.training
            or conditioner.training
            or encoder_parameter.device != conditioner_parameter.device
            or encoder_parameter.dtype != conditioner_parameter.dtype
            or encoder_parameter.dtype not in (torch.float16, torch.bfloat16, torch.float32)
        ):
            raise DerivativeError(
                "INFERENCE_UNAVAILABLE",
                "Anima conditioning models require matching eval placement.",
            )
        device, dtype = encoder_parameter.device, encoder_parameter.dtype
        weight_tensor = torch.tensor([weights], device=device, dtype=dtype)
        if not bool(torch.isfinite(weight_tensor).all().item()) or any(
            weight != 0 and weight_tensor[0, index].item() == 0
            for index, weight in enumerate(weights)
        ):
            raise _invalid("Anima token attention cannot be represented in the model dtype.")
        qwen_tensor = torch.tensor([qwen_ids], device=device, dtype=torch.int64)
        mask_tensor = torch.tensor([qwen_mask], device=device, dtype=torch.bool)
        t5_tensor = torch.tensor([t5_ids], device=device, dtype=torch.int64)
        with torch.inference_mode():
            hidden = encoder(
                input_ids=qwen_tensor, attention_mask=mask_tensor, output_hidden_states=False
            ).last_hidden_state
            if (
                tuple(hidden.shape) != (1, len(qwen_ids), conditioner.config.source_dim)
                or hidden.device != device
                or hidden.dtype != dtype
                or not bool(torch.isfinite(hidden).all().item())
            ):
                raise _invalid("Anima Qwen3 hidden states are invalid or non-finite.")
            embeddings = conditioner(
                source_hidden_states=hidden,
                target_input_ids=t5_tensor,
                source_attention_mask=mask_tensor,
            )
            expected_length = max(len(t5_ids), conditioner.config.min_sequence_length)
            if (
                tuple(embeddings.shape) != (1, expected_length, conditioner.config.target_dim)
                or embeddings.device != device
                or embeddings.dtype != dtype
                or not bool(torch.isfinite(embeddings).all().item())
            ):
                raise _invalid("Anima adapter output is invalid or non-finite.")
            padded_weights = torch.nn.functional.pad(
                weight_tensor, (0, expected_length - len(t5_ids)), value=1.0
            )
            weighted_embeddings = embeddings * padded_weights.unsqueeze(-1)
            if not bool(torch.isfinite(weighted_embeddings).all().item()):
                raise _invalid("Anima weighted adapter output is non-finite.")
        return AnimaPromptConditioning(
            qwen_tensor,
            mask_tensor,
            hidden,
            t5_tensor,
            weight_tensor,
            offsets,
            weighted_embeddings,
            len(qwen["input_ids"]) > 1,
            len(t5["input_ids"]) > 1,
        )
    except DerivativeError:
        raise
    except Exception as error:
        raise DerivativeError(
            "INFERENCE_UNAVAILABLE", "Anima native prompt conditioning failed."
        ) from error


def encode_anima_conditioning_pair(
    positive: object,
    negative: object,
    models: LoadedAnimaModels,
    *,
    tokenizers: AnimaTokenizers | None = None,
) -> AnimaConditioningPair:
    # Validate both signs first so invalid negative input never invokes positive encoding.
    positive_prompt = validate_compiled_anima_prompt(positive)
    negative_prompt = validate_compiled_anima_prompt(negative)
    if tokenizers is None:
        from imagegen_worker.anima_tokenizers import load_anima_tokenizers

        tokenizers = load_anima_tokenizers()
    return AnimaConditioningPair(
        _encode_compiled_prompt(positive_prompt, models, tokenizers),
        _encode_compiled_prompt(negative_prompt, models, tokenizers),
    )
