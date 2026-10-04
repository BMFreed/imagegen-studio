"""Exact dual-CLIP textual inversion snapshots and literal-safe native conditioning.

Only full verified tensors reach public Diffusers loaders. Saved literals remain
outside the tokenizer: private aliases prevent native case folding or collisions
from silently activating a different exact resource.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import os
import re
import stat
from dataclasses import dataclass
from typing import Any, cast

from imagegen_worker.derivatives import DerivativeError, canonical_absolute_path
from imagegen_worker.protocol import (
    MAX_EMBEDDING_VECTORS,
    GenerateIllustriousTxt2ImgCommand,
    GenerationEmbedding,
)

MAX_EMBEDDING_HEADER_BYTES = 32 * 1024 * 1024
MAX_EMBEDDING_PAYLOAD_BYTES = MAX_EMBEDDING_VECTORS * (768 + 1280) * 4
_WIDTHS = {"clip_l": 768, "clip_g": 1280}
_DTYPE_BYTES = {"F16": 2, "BF16": 2, "F32": 4}
_WORD = re.compile(r"[A-Za-z0-9_]")


@dataclass(frozen=True)
class EmbeddingConditioningInputs:
    prompts: tuple[str, str]
    managers: tuple[Any, Any]


def _unsupported(message: str) -> DerivativeError:
    return DerivativeError("GENERATION_EMBEDDING_UNSUPPORTED", message)


def _unique_fields(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _unsupported("Embedding safetensors header has duplicate fields.")
        result[key] = value
    return result


def _vector_count(shape: object, width: int) -> int:
    if not isinstance(shape, (list, tuple)):
        raise _unsupported("Embedding tensor shape is unsupported.")
    dimensions = cast(list[object] | tuple[object, ...], shape)
    if any(type(value) is not int or value < 1 for value in dimensions):
        raise _unsupported("Embedding tensor shape is unsupported.")
    if len(dimensions) == 1 and dimensions[0] == width:
        return 1
    if len(dimensions) == 2 and dimensions[1] == width:
        count = cast(int, dimensions[0])
        if count <= MAX_EMBEDDING_VECTORS:
            return count
    raise _unsupported("Embedding tensor shape exceeds the dual-CLIP profile.")


def _qualify_header(header: object, payload_bytes: int) -> int:
    if not isinstance(header, dict):
        raise _unsupported("Embedding safetensors header must be an object.")
    fields = cast(dict[str, object], header)
    if set(fields) - {"__metadata__"} != set(_WIDTHS):
        raise _unsupported("Embedding must contain only paired clip_l and clip_g tensors.")
    metadata = fields.get("__metadata__", {})
    if not isinstance(metadata, dict) or any(
        not isinstance(key, str) or not isinstance(value, str)
        for key, value in cast(dict[object, object], metadata).items()
    ):
        raise _unsupported("Embedding metadata is unsupported.")
    counts: list[int] = []
    intervals: list[tuple[int, int]] = []
    for key, width in _WIDTHS.items():
        value = fields[key]
        if not isinstance(value, dict) or set(cast(dict[str, object], value)) != {
            "dtype",
            "shape",
            "data_offsets",
        }:
            raise _unsupported("Embedding tensor descriptor is invalid.")
        descriptor = cast(dict[str, object], value)
        dtype = descriptor["dtype"]
        if not isinstance(dtype, str) or dtype not in _DTYPE_BYTES:
            raise _unsupported("Embedding tensor dtype is unsupported.")
        count = _vector_count(descriptor["shape"], width)
        counts.append(count)
        offsets = descriptor["data_offsets"]
        if not isinstance(offsets, list) or len(cast(list[object], offsets)) != 2:
            raise _unsupported("Embedding tensor offsets are invalid.")
        start, end = cast(list[object], offsets)
        if (
            type(start) is not int
            or type(end) is not int
            or start < 0
            or end - start != count * width * _DTYPE_BYTES[dtype]
        ):
            raise _unsupported("Embedding tensor offsets do not match its shape.")
        intervals.append((start, end))
    intervals.sort()
    if (
        counts[0] != counts[1]
        or intervals[0][0] != 0
        or intervals[0][1] != intervals[1][0]
        or intervals[1][1] != payload_bytes
        or payload_bytes > MAX_EMBEDDING_PAYLOAD_BYTES
    ):
        raise _unsupported("Embedding tensor counts or payload layout are unsupported.")
    return counts[0]


def read_embedding_snapshot(
    embedding: GenerationEmbedding, *, remaining_vectors: int = MAX_EMBEDDING_VECTORS
) -> bytes:
    """Read one no-follow exact snapshot; native loading never reopens a managed path."""
    canonical_absolute_path(embedding.path, label="Embedding")
    try:
        descriptor = os.open(embedding.path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size != embedding.byte_size:
                raise DerivativeError(
                    "GENERATION_INPUT_CHANGED", "Embedding changed after enqueue."
                )
            if embedding.byte_size > 8 + MAX_EMBEDDING_HEADER_BYTES + MAX_EMBEDDING_PAYLOAD_BYTES:
                raise _unsupported("Embedding exceeds the dual-CLIP tensor byte limit.")
            prefix = stream.read(8)
            header_size = int.from_bytes(prefix, "little")
            if len(prefix) != 8 or not 2 <= header_size <= MAX_EMBEDDING_HEADER_BYTES:
                raise _unsupported("Embedding safetensors header is unsupported.")
            if 8 + header_size >= before.st_size:
                raise _unsupported("Embedding safetensors header is truncated.")
            header_bytes = stream.read(header_size)
            try:
                header: object = json.loads(header_bytes, object_pairs_hook=_unique_fields)
            except (ValueError, RecursionError) as error:
                raise _unsupported("Embedding safetensors header is invalid.") from error
            count = _qualify_header(header, before.st_size - 8 - header_size)
            if count > remaining_vectors:
                raise _unsupported("Active embeddings exceed the per-prompt vector budget.")
            digest = hashlib.sha256(prefix + header_bytes)
            chunks = [prefix, header_bytes]
            size = 8 + len(header_bytes)
            while chunk := stream.read(min(1024 * 1024, embedding.byte_size - size + 1)):
                size += len(chunk)
                if size > embedding.byte_size:
                    raise DerivativeError(
                        "GENERATION_INPUT_CHANGED", "Embedding changed during reading."
                    )
                digest.update(chunk)
                chunks.append(chunk)
            after = os.fstat(stream.fileno())
            if (
                size != embedding.byte_size
                or (before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                != (after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                or digest.hexdigest() != embedding.sha256
            ):
                raise DerivativeError(
                    "GENERATION_INPUT_CHANGED", "Embedding changed after enqueue."
                )
    except OSError as error:
        raise DerivativeError("GENERATION_INPUT_CHANGED", "Embedding is unavailable.") from error
    return b"".join(chunks)


def qualify_embedding_state(state: dict[str, Any], torch: Any) -> dict[str, Any]:
    if set(state) != set(_WIDTHS):
        raise _unsupported("Embedding must contain only paired clip_l and clip_g tensors.")
    normalized: dict[str, Any] = {}
    counts: list[int] = []
    for key, width in _WIDTHS.items():
        tensor = state[key]
        if tensor.dtype not in (torch.float16, torch.bfloat16, torch.float32):
            raise _unsupported("Embedding tensor dtype is unsupported.")
        counts.append(_vector_count(tuple(tensor.shape), width))
        if not bool(torch.isfinite(tensor).all().item()):
            raise _unsupported("Embedding contains non-finite tensors.")
        normalized[key] = tensor.unsqueeze(0) if tensor.ndim == 1 else tensor
    if counts[0] != counts[1]:
        raise _unsupported("Embedding CLIP vector counts do not match.")
    return normalized


def _literal_ranges(
    text: str, entries: tuple[GenerationEmbedding, ...]
) -> list[tuple[int, int, int]]:
    matches: list[tuple[int, int, int]] = []
    tokens: set[str] = set()
    for index, entry in enumerate(entries):
        token = entry.token
        if not token or token in tokens:
            raise _unsupported("Embedding literals must have one exact binding per prompt.")
        tokens.add(token)
        start = text.find(token)
        while start >= 0:
            end = start + len(token)
            if (not _WORD.match(token[0]) or start == 0 or not _WORD.match(text[start - 1])) and (
                not _WORD.match(token[-1]) or end == len(text) or not _WORD.match(text[end])
            ):
                matches.append((start, end, index))
            start = text.find(token, end)
    selected: list[tuple[int, int, int]] = []
    # Main uses JavaScript string ranges: compare UTF-16 lengths, while retaining
    # Python codepoint offsets for exact replacements in the original string.
    literal_lengths = [len(entry.token.encode("utf-16-le")) // 2 for entry in entries]
    for match in sorted(matches, key=lambda item: (-literal_lengths[item[2]], item[0], item[2])):
        if all(match[0] >= old[1] or match[1] <= old[0] for old in selected):
            selected.append(match)
    if {match[2] for match in selected} != set(range(len(entries))):
        raise _unsupported("Embedding binding has no active exact literal occurrence.")
    return sorted(selected)


def _replace_ranges(text: str, ranges: list[tuple[int, int, int]], aliases: list[str]) -> str:
    for start, end, index in reversed(ranges):
        text = text[:start] + aliases[index] + text[end:]
    return text


def masked_embedding_prompts(command: GenerateIllustriousTxt2ImgCommand) -> tuple[str, str]:
    """Validate literal bindings and mask only resolved resources before early syntax preflight."""
    prompts = [
        _replace_ranges(text, _literal_ranges(text, entries), ["igs_embedding"] * len(entries))
        for text, entries in (
            (command.positive_prompt, command.positive_embeddings),
            (command.negative_prompt, command.negative_embeddings),
        )
    ]
    return prompts[0], prompts[1]


def _manager(pads: dict[int, list[int]]) -> Any:
    provider = cast(Any, importlib.import_module("compel.embeddings_provider"))

    class Manager(provider.BaseTextualInversionManager):
        def expand_textual_inversion_token_ids_if_necessary(self, ids: list[int]) -> list[int]:
            return [piece for token in ids for piece in [token] + pads.get(token, [])]

    return Manager()


def load_generation_embeddings(
    command: GenerateIllustriousTxt2ImgCommand, pipeline: Any, torch: Any
) -> EmbeddingConditioningInputs:
    signed = (
        (command.positive_prompt, command.positive_embeddings),
        (command.negative_prompt, command.negative_embeddings),
    )
    if not any(entries for _, entries in signed):
        return EmbeddingConditioningInputs(
            (command.positive_prompt, command.negative_prompt), (None, None)
        )
    ranges = [_literal_ranges(text, entries) for text, entries in signed]
    states: list[dict[str, Any]] = []
    aliases: list[str] = []
    signed_aliases: list[list[str]] = []
    cache: dict[tuple[str, str, int], dict[str, Any]] = {}
    tokenizers = (pipeline.tokenizer, pipeline.tokenizer_2)
    originals = [
        tokenizer.backend_tokenizer.normalizer.normalize_str(text)
        for tokenizer in tokenizers
        for text, _ in signed
    ]
    safetensors = cast(Any, importlib.import_module("safetensors.torch"))
    index = 0
    for _, entries in signed:
        remaining = MAX_EMBEDDING_VECTORS
        current_aliases: list[str] = []
        for entry in entries:
            identity = (str(entry.path), entry.sha256, entry.byte_size)
            if identity not in cache:
                snapshot = read_embedding_snapshot(entry, remaining_vectors=remaining)
                try:
                    state = cast(dict[str, Any], safetensors.load(snapshot))
                except Exception as error:
                    raise _unsupported("Embedding safetensors tensors are invalid.") from error
                cache[identity] = qualify_embedding_state(state, torch)
            state = cache[identity]
            count = int(state["clip_l"].shape[0])
            remaining -= count
            if remaining < 0:
                raise _unsupported("Active embeddings exceed the per-prompt vector budget.")
            while True:
                alias = f"igs_ti_private_{index}"
                index += 1
                names = [alias] + [f"{alias}_{vector}" for vector in range(1, count)]
                if not any(name in text for name in names for text in originals) and all(
                    name not in tokenizer.get_vocab() for name in names for tokenizer in tokenizers
                ):
                    break
            states.append(state)
            aliases.append(alias)
            current_aliases.append(alias)
        signed_aliases.append(current_aliases)
    managers: list[Any] = []
    for key, tokenizer, encoder in (
        ("clip_l", pipeline.tokenizer, pipeline.text_encoder),
        ("clip_g", pipeline.tokenizer_2, pipeline.text_encoder_2),
    ):
        if encoder.get_input_embeddings().weight.shape[-1] != _WIDTHS[key]:
            raise _unsupported("The text encoder does not match the dual-CLIP profile.")
        tensors = [state[key].to(dtype=encoder.dtype) for state in states]
        if any(not bool(torch.isfinite(tensor).all().item()) for tensor in tensors):
            raise _unsupported("Embedding weights overflowed the text encoder dtype.")
        try:
            pipeline.load_textual_inversion(
                tensors,
                token=aliases,
                tokenizer=tokenizer,
                text_encoder=encoder,
                local_files_only=True,
            )
        except Exception as error:
            raise _unsupported("Embedding native loading failed.") from error
        pads: dict[int, list[int]] = {}
        for alias, tensor in zip(aliases, tensors, strict=True):
            ids = [
                tokenizer.convert_tokens_to_ids(alias if vector == 0 else f"{alias}_{vector}")
                for vector in range(tensor.shape[0])
            ]
            loaded = encoder.get_input_embeddings().weight[ids]
            if not torch.equal(loaded, tensor.to(device=loaded.device)):
                raise _unsupported("Embedding native loading did not preserve every vector.")
            pads[ids[0]] = ids[1:]
        managers.append(_manager(pads))
    prompts = tuple(
        _replace_ranges(text, selected, aliases_for_sign)
        for (text, _), selected, aliases_for_sign in zip(
            signed, ranges, signed_aliases, strict=True
        )
    )
    return EmbeddingConditioningInputs(cast(tuple[str, str], prompts), (managers[0], managers[1]))


def validate_expanded_conditioning(builder: Any, prompt: str) -> None:
    """Use the real parser/weight/token splitter before any CLIP forward, without truncation."""
    parsed = builder.parse_prompt_string(prompt)
    if len(parsed.prompts) != 1 or type(parsed.prompts[0]).__name__ != "FlattenedPrompt":
        raise DerivativeError("GENERATION_PROMPT_UNSUPPORTED", "Unsupported conditioning syntax.")
    fragments = [child.text for child in parsed.prompts[0].children]
    weights = [child.weight for child in parsed.prompts[0].children]
    ids, _, _ = builder.conditioning_provider.get_token_ids_and_expand_weights(
        fragments, weights, device="cpu"
    )
    if ids.numel() > 4 * 77:
        raise DerivativeError(
            "GENERATION_PROMPT_UNSUPPORTED",
            "Expanded prompt exceeds the conditioning safety limit.",
        )
